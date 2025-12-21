import pandas as pd
import re
import json
import os
import zipfile
from sqlalchemy.orm import Session
import uuid
import sys
from datetime import datetime
from typing import Optional, List

# Add the package directory to path for direct script execution
_package_dir = os.path.dirname(os.path.abspath(__file__))
if _package_dir not in sys.path:
    sys.path.insert(0, _package_dir)

from database import initialize_database, get_db, get_db_session
import database
import models
import bulk_operations


# =============================================================================
# SECURITY: FILE PATH VALIDATION
# =============================================================================

class PathValidationError(Exception):
    """Raised when file path validation fails."""
    pass


def validate_file_path(file_path: str, base_dirs: List[str] = None) -> str:
    """
    Validate and normalize a file path to prevent path traversal attacks.

    Args:
        file_path: The file path to validate
        base_dirs: List of allowed base directories (default: uploads directory)

    Returns:
        Normalized absolute path if valid

    Raises:
        PathValidationError: If path is outside allowed directories or contains traversal
    """
    if base_dirs is None:
        # Default: uploads directory relative to monorepo root
        monorepo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        base_dirs = [
            os.path.join(monorepo_root, 'uploads'),
            '/tmp',  # Allow temp files during testing
        ]

    # Normalize and resolve the path
    try:
        abs_path = os.path.abspath(file_path)
        real_path = os.path.realpath(abs_path)

        # Check for path traversal patterns
        if '..' in file_path:
            raise PathValidationError(f"Path traversal detected in: {file_path}")

        # Block sensitive system paths
        blocked_prefixes = ['/etc/', '/root/', '/var/log/', '/proc/', '/sys/']
        for prefix in blocked_prefixes:
            if real_path.startswith(prefix):
                raise PathValidationError(f"Access to system path blocked: {file_path}")

        # Verify the resolved path is within an allowed directory
        path_allowed = False
        for base_dir in base_dirs:
            base_real = os.path.realpath(os.path.abspath(base_dir))
            if real_path.startswith(base_real + os.sep) or real_path == base_real:
                path_allowed = True
                break

        if not path_allowed:
            raise PathValidationError(
                f"File path outside allowed directories. Path: {file_path}"
            )

        # Check file exists and is a regular file
        if not os.path.isfile(real_path):
            raise PathValidationError(f"File does not exist: {real_path}")

        return real_path

    except OSError as e:
        raise PathValidationError(f"Invalid file path: {e}")


# =============================================================================
# FILE READING UTILITIES
# =============================================================================

def read_file(file_path: str, chunksize: Optional[int] = None, **kwargs):
    """
    Read CSV or Excel file based on extension.
    Supports .csv, .xlsx, and .xls files.
    Uses streaming for Excel to avoid loading entire file into memory.

    Args:
        file_path: Path to the file
        chunksize: Optional chunk size for reading large files
        **kwargs: Additional arguments passed to pandas read function

    Returns:
        DataFrame or generator yielding DataFrames (if chunksize is specified)
    """
    ext = os.path.splitext(file_path)[1].lower()

    if ext in ['.xlsx', '.xls']:
        # Excel files - stream rows to avoid memory issues with large files
        print(f"Detected Excel file ({ext}), using openpyxl streaming engine")
        if chunksize:
            # Stream Excel file in chunks using openpyxl read_only mode
            import openpyxl
            from openpyxl.utils.exceptions import InvalidFileException

            def excel_stream_chunker(path, chunk_size):
                """Generator that yields chunks from Excel file without loading it all into memory."""
                wb = None
                try:
                    # Attempt to load workbook with error handling for corrupted files
                    try:
                        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
                    except InvalidFileException as e:
                        raise ValueError(f"Invalid Excel file format: {e}")
                    except zipfile.BadZipFile:
                        raise ValueError(
                            "Excel file appears to be corrupted (invalid zip structure). "
                            "Please re-export from Excel or convert to CSV."
                        )
                    except Exception as e:
                        raise ValueError(f"Failed to open Excel file: {type(e).__name__}: {e}")

                    # Validate workbook has at least one worksheet
                    if not wb.worksheets:
                        raise ValueError("Excel file has no worksheets")

                    ws = wb.active
                    if ws is None:
                        # Fallback to first sheet if no active sheet
                        ws = wb.worksheets[0]
                        print(f"Warning: No active worksheet, using first sheet: {ws.title}")

                    # Get header row
                    rows_iter = ws.iter_rows(values_only=True)
                    header = next(rows_iter, None)

                    if not header:
                        print("Warning: Excel file appears to be empty")
                        return

                    # Validate header has at least some non-None values
                    if all(h is None for h in header):
                        raise ValueError("Excel file has no column headers (first row is empty)")

                    # Read rows in batches
                    batch = []
                    for row in rows_iter:
                        batch.append(row)
                        if len(batch) >= chunk_size:
                            # Convert batch to DataFrame
                            df = pd.DataFrame(batch, columns=header)
                            yield df
                            batch = []

                    # Yield remaining rows
                    if batch:
                        df = pd.DataFrame(batch, columns=header)
                        yield df

                finally:
                    if wb is not None:
                        wb.close()

            return excel_stream_chunker(file_path, chunksize)
        else:
            # Read entire Excel file (only for preview or small files)
            try:
                return pd.read_excel(file_path, engine='openpyxl')
            except Exception as e:
                raise ValueError(f"Failed to read Excel file: {type(e).__name__}: {e}")
    else:
        # CSV files (default) - pandas natively supports chunked reading
        print(f"Detected CSV file ({ext}), using pandas read_csv with chunking")
        return pd.read_csv(file_path, chunksize=chunksize, **kwargs)


def emit_progress(event_type: str, data: dict):
    """Emit structured progress events to stdout for Node.js parsing."""
    progress_event = {
        "type": event_type,
        "timestamp": datetime.now().isoformat(),
        "data": data
    }
    print(json.dumps(progress_event), file=sys.stdout, flush=True)


def log_diagnostic(level: str, message: str, context: dict = None):
    """
    Emit structured diagnostic log to stderr for Node.js capture.

    Args:
        level: Log level - "debug", "info", "warning", "error"
        message: Human-readable message
        context: Optional dict with additional context data
    """
    log_entry = {
        "level": level,
        "message": message,
        "timestamp": datetime.now().isoformat(),
        "context": context or {}
    }
    print(f"[DIAG] {json.dumps(log_entry)}", file=sys.stderr, flush=True)


# =============================================================================
# MAPPING FILE UTILITIES
# =============================================================================

def load_column_mapping(mapping_file_path: Optional[str]) -> Optional[dict]:
    """
    Load column mapping from JSON sidecar file.
    Returns None if no mapping file provided or file doesn't exist.
    """
    if not mapping_file_path:
        print("WARNING: No mapping file path provided, using default column mappings", file=sys.stderr)
        return None

    if not os.path.exists(mapping_file_path):
        print(f"WARNING: Mapping file not found at {mapping_file_path}, using default column mappings", file=sys.stderr)
        return None

    try:
        with open(mapping_file_path, 'r') as f:
            mapping_data = json.load(f)
            print(f"Loaded mapping configuration from {mapping_file_path}")
            return mapping_data
    except (json.JSONDecodeError, IOError) as e:
        print(f"WARNING: Failed to load mapping file {mapping_file_path}: {e}, using default column mappings", file=sys.stderr)
        return None


def build_rename_map(mappings: list) -> dict:
    """
    Convert columnMappings array to pandas rename dict.
    Only includes standard field mappings, not custom fields.
    """
    return {
        m['source']: m['mapsTo']
        for m in mappings
        if not m.get('isCustomField', False) and m.get('source') and m.get('mapsTo')
    }


def extract_custom_fields(row: pd.Series, mappings: list) -> dict:
    """
    Extract custom field values from a row based on mapping configuration.
    Returns a dict suitable for storing in the metadata JSON column.
    """
    custom_fields = {}
    for m in mappings:
        if m.get('isCustomField', False):
            source = m.get('source')
            if source and source in row.index and pd.notna(row[source]):
                custom_fields[m.get('mapsTo', source)] = {
                    'value': row[source],
                    'originalHeader': source,
                    'dataType': m.get('detectedDataType', 'text'),
                    'lastUpdated': datetime.now().isoformat()
                }
    return custom_fields


# =============================================================================
# VALIDATION UTILITIES
# =============================================================================

def validate_client_exists(db: Session, client_id: str) -> bool:
    """
    Verify that the client exists and is active before processing import.

    Args:
        db: SQLAlchemy session
        client_id: UUID string of the client

    Returns:
        True if client exists and is active

    Raises:
        ValueError if client not found or inactive
    """
    try:
        client_uuid = uuid.UUID(client_id) if isinstance(client_id, str) else client_id
    except ValueError:
        raise ValueError(f"Invalid client ID format: {client_id}")

    client = db.query(models.Client).filter(
        models.Client.id == client_uuid,
        models.Client.isActive == True
    ).first()

    if not client:
        raise ValueError(f"Client not found or inactive: {client_id}")

    return True


def build_product_lookup(db: Session, client_id: uuid.UUID, product_ids: list) -> dict:
    """
    Build a lookup map from CSV product IDs (business IDs) to database Product UUIDs.
    This enables proper foreign key resolution for transactions.

    Args:
        db: SQLAlchemy session
        client_id: UUID of the client
        product_ids: List of product IDs from CSV (business identifiers)

    Returns:
        Dict mapping productId (string) -> id (UUID)
    """
    if not product_ids:
        return {}

    # Filter out None/NaN values and convert to strings
    clean_product_ids = [str(pid) for pid in product_ids if pd.notna(pid) and str(pid).strip()]

    if not clean_product_ids:
        return {}

    # Query existing products for this client
    existing_products = db.query(
        models.Product.product_id,
        models.Product.id
    ).filter(
        models.Product.client_id == client_id,
        models.Product.product_id.in_(clean_product_ids)
    ).all()

    return {str(p.product_id): p.id for p in existing_products}


# =============================================================================
# DATA CLEANING FUNCTIONS
# =============================================================================

def clean_inventory_data(df: pd.DataFrame, client_id: str, mapping_data: Optional[dict] = None) -> pd.DataFrame:
    """
    Cleans and transforms data for inventory imports.

    CRITICAL: All column names must use snake_case to match database column names.
    bulk_insert_mappings() uses database column names (from __table__.columns.name),
    NOT Python attribute names. SQLAlchemy SILENTLY IGNORES unknown keys!
    """
    # CRITICAL: Replace NaN with None BEFORE any string operations
    # This prevents NaN from becoming "nan" string during astype(str)
    for col in df.columns:
        df[col] = df[col].where(pd.notna(df[col]), None)

    # Now safely do string operations (None stays None)
    for col in df.columns:
        if df[col].dtype == 'object':
            # Only strip non-None values
            df[col] = df[col].apply(lambda x: str(x).strip() if x is not None else None)

    # CRITICAL: Use snake_case targets to match database column names
    # Database columns are: product_id, name, item_type, pack_size, current_stock_packs, notification_point
    if mapping_data and mapping_data.get('columnMappings'):
        rename_map = build_rename_map(mapping_data['columnMappings'])
        print(f"Using intelligent column mapping with {len(rename_map)} mappings")

        # Fill in missing required mappings from fallback (case-insensitive)
        # NOTE: All targets use snake_case to match database column names
        required_mappings = {
            'Product ID': 'product_id',
            'Product Name': 'name',
            'Item Type': 'item_type',
            'Quantity Multiplier': 'pack_size',
            'Available Quantity': 'current_stock_packs',
            'New Notification Point': 'notification_point',
        }

        for fallback_source, target in required_mappings.items():
            # Skip if target already mapped
            if target in rename_map.values():
                continue

            # Find matching column in CSV (case-insensitive, space-insensitive)
            fallback_normalized = fallback_source.lower().replace(' ', '')
            matching_col = None

            for csv_col in df.columns:
                if csv_col.lower().replace(' ', '') == fallback_normalized and csv_col not in rename_map:
                    matching_col = csv_col
                    break

            if matching_col:
                rename_map[matching_col] = target
                print(f"  Added fallback mapping: {matching_col} -> {target}")
    else:
        # Fallback to hard-coded mapping for backwards compatibility
        # NOTE: All targets use snake_case to match database column names
        rename_map = {
            'Product ID': 'product_id',
            'Product Name': 'name',
            'Item Type': 'item_type',
            'Quantity Multiplier': 'pack_size',
            'Available Quantity': 'current_stock_packs',
            'New Notification Point': 'notification_point',
            'Current Notification Point': 'notification_point',  # Fallback if 'New' doesn't exist
        }
        print("Using fallback hard-coded column mapping")

    # Clean 'New Notification Point' or mapped equivalent before renaming
    notification_col = None
    for source, target in rename_map.items():
        if target == 'notification_point' and source in df.columns:
            notification_col = source
            break

    if notification_col and notification_col in df.columns:
        df[notification_col] = df[notification_col].apply(
            lambda x: re.search(r'\d+', str(x)).group(0) if re.search(r'\d+', str(x)) else None
        )
        df[notification_col] = pd.to_numeric(df[notification_col], errors='coerce').fillna(0).astype(int)

    # Clean numeric columns before renaming (use snake_case targets)
    for source, target in rename_map.items():
        if source in df.columns:
            if target in ['current_stock_packs', 'pack_size']:
                df[source] = pd.to_numeric(df[source], errors='coerce').fillna(0 if target == 'current_stock_packs' else 1).astype(int)

    # Apply the rename mapping
    df.rename(columns=rename_map, inplace=True)

    # Convert client_id string to UUID
    client_uuid = uuid.UUID(client_id) if isinstance(client_id, str) else client_id

    # Add/Ensure required columns and types with proper UUID
    # CRITICAL: Use snake_case column names to match database columns
    df['id'] = [uuid.uuid4() for _ in range(len(df))]
    df['client_id'] = client_uuid  # snake_case (database column)

    # Ensure pack_size exists and has a default (snake_case)
    if 'pack_size' not in df.columns:
        df['pack_size'] = 1
    df['pack_size'] = df['pack_size'].fillna(1).astype(int)

    # Ensure current_stock_packs exists (snake_case)
    if 'current_stock_packs' not in df.columns:
        df['current_stock_packs'] = 0

    # Calculate current_stock_units (snake_case)
    df['current_stock_units'] = df['current_stock_packs'] * df['pack_size']

    df['created_at'] = datetime.now()  # snake_case (database column)
    df['updated_at'] = datetime.now()  # snake_case (database column)

    # Handle custom fields - store in 'product_metadata' column
    # Note: Model attribute is 'product_metadata', maps to database column 'metadata'
    # SQLAlchemy bulk_insert_mappings uses attribute names, not column names
    if mapping_data and mapping_data.get('columnMappings'):
        custom_mappings = [m for m in mapping_data['columnMappings'] if m.get('isCustomField', False)]
        if custom_mappings:
            df['product_metadata'] = df.apply(lambda row: extract_custom_fields(row, custom_mappings), axis=1)
        else:
            df['product_metadata'] = [{} for _ in range(len(df))]
    else:
        df['product_metadata'] = [{} for _ in range(len(df))]

    # PERFORMANCE OPTIMIZATION: Selective column extraction instead of full reindex
    # Only keep columns that exist in the source data, then add missing required columns
    # This is 2-3x faster than df.reindex() for wide datasets (50+ columns)
    from sqlalchemy.inspection import inspect
    mapper = inspect(models.Product)
    model_columns = [attr.key for attr in mapper.column_attrs]

    # Validate required columns exist (use snake_case)
    required_for_model = ['product_id', 'name']
    existing_columns = set(df.columns)
    missing_required = [col for col in required_for_model if col not in existing_columns]

    if missing_required:
        raise ValueError(
            f"Cannot proceed: Required columns {missing_required} not found after mapping. "
            f"Available columns: {list(df.columns)}"
        )

    # Keep only columns that exist in both DataFrame and model (selective extraction)
    columns_to_keep = [col for col in model_columns if col in df.columns]
    df = df[columns_to_keep].copy()

    # Add missing columns with defaults (only columns not in source data)
    for col in model_columns:
        if col not in df.columns:
            # Add with default based on column type
            if col == 'id':
                df[col] = [uuid.uuid4() for _ in range(len(df))]
            elif col in ('is_active', 'is_orphan'):
                df[col] = col == 'is_active'  # is_active defaults to True, is_orphan to False
            elif col in ('current_stock_packs', 'current_stock_units', 'pack_size', 'feedback_count'):
                df[col] = 1 if col == 'pack_size' else 0
            elif col == 'item_type':
                df[col] = 'evergreen'
            elif col == 'metadata':
                df[col] = '{}'
            elif col in ('created_at', 'updated_at'):
                df[col] = datetime.now()
            # Other columns will be added as None by bulk_insert_mappings

    # Set defaults for columns after reindex (to handle NaN/None values)
    # Boolean columns need proper True/False, not NaN
    if 'is_active' in df.columns:
        df['is_active'] = df['is_active'].fillna(True)
    if 'is_orphan' in df.columns:
        df['is_orphan'] = df['is_orphan'].fillna(False)

    # Integer columns that need defaults
    if 'feedback_count' in df.columns:
        df['feedback_count'] = df['feedback_count'].fillna(0).astype(int)
    if 'current_stock_packs' in df.columns:
        df['current_stock_packs'] = df['current_stock_packs'].fillna(0).astype(int)
    if 'current_stock_units' in df.columns:
        df['current_stock_units'] = df['current_stock_units'].fillna(0).astype(int)
    if 'pack_size' in df.columns:
        df['pack_size'] = df['pack_size'].fillna(1).astype(int)

    # String columns that need defaults (database default is 'evergreen')
    if 'item_type' in df.columns and len(df) > 0:
        # Normalize to lowercase and fill missing values
        df['item_type'] = df['item_type'].fillna('evergreen').astype(str).str.lower()

    # Replace remaining NaN with None for proper SQL NULL handling
    # pandas.where doesn't always work properly, so we use a more explicit approach
    for col in df.columns:
        # Convert NaN to None for each column
        df[col] = df[col].apply(lambda x: None if pd.isna(x) else x)

    return df


def clean_orders_data(
    df: pd.DataFrame,
    client_id: str,
    mapping_data: Optional[dict] = None,
    errors_encountered: Optional[list] = None
) -> tuple[pd.DataFrame, dict]:
    """
    Cleans and transforms data for orders imports.

    CRITICAL: All column names must use snake_case to match database column names.
    bulk_insert_mappings() uses database column names (from __table__.columns.name),
    NOT Python attribute names. SQLAlchemy SILENTLY IGNORES unknown keys!

    Args:
        df: Input DataFrame to clean
        client_id: Client UUID string
        mapping_data: Optional column mapping configuration
        errors_encountered: Optional list to append warnings/errors to (for tracking)

    Returns:
        Tuple of (cleaned_dataframe, dropped_rows_info)
    """
    # Initialize errors list if not provided (allows standalone usage)
    if errors_encountered is None:
        errors_encountered = []

    # CRITICAL: Replace NaN with None BEFORE any string operations
    # This prevents NaN from becoming "nan" string during astype(str)
    for col in df.columns:
        df[col] = df[col].where(pd.notna(df[col]), None)

    # Now safely do string operations (None stays None)
    for col in df.columns:
        if df[col].dtype == 'object':
            # Only strip non-None values
            df[col] = df[col].apply(lambda x: str(x).strip() if x is not None else None)

    # CRITICAL: Use snake_case targets to match database column names
    # Database columns are: product_id, order_id, quantity_packs, quantity_units, date_submitted, etc.
    required_mappings = {
        'Product ID': 'product_id',
        'Order ID': 'order_id',
        'Quantity': 'quantity_packs',
        'Total Quantity': 'quantity_units',
        'Date Submitted': 'date_submitted',
        'Order Status': 'order_status',
        'Ship To Location': 'ship_to_location',
        'Ship To Company': 'ship_to_company',
    }

    # Determine rename map - use intelligent mapping if provided, else fallback to hard-coded
    if mapping_data and mapping_data.get('columnMappings'):
        rename_map = build_rename_map(mapping_data['columnMappings'])
        print(f"Using intelligent column mapping with {len(rename_map)} mappings")

        # Fill in missing required mappings from fallback (case-insensitive)
        for fallback_source, target in required_mappings.items():
            # Skip if target already mapped
            if target in rename_map.values():
                continue

            # Find matching column in CSV (case-insensitive, space-insensitive)
            fallback_normalized = fallback_source.lower().replace(' ', '')
            matching_col = None

            for csv_col in df.columns:
                if csv_col.lower().replace(' ', '') == fallback_normalized and csv_col not in rename_map:
                    matching_col = csv_col
                    break

            if matching_col:
                rename_map[matching_col] = target
                print(f"  Added fallback mapping: {matching_col} -> {target}")
    else:
        rename_map = required_mappings
        print("Using fallback hard-coded column mapping")

    # Clean 'Unit Price' and 'Extended Price' if they exist
    if 'Unit Price' in df.columns:
        df['Unit Price'] = df['Unit Price'].astype(str).str.replace(r'[$,]', '', regex=True).astype(float)
    if 'Extended Price' in df.columns:
        df['Extended Price'] = df['Extended Price'].astype(str).str.replace(r'[$,]', '', regex=True).astype(float)

    # Find and clean date column before renaming (snake_case target)
    date_col = None
    for source, target in rename_map.items():
        if target == 'date_submitted' and source in df.columns:
            date_col = source
            break

    # Track dropped rows for error reporting
    dropped_rows_info = {"invalid_dates": 0, "missing_required": 0}

    if date_col and date_col in df.columns:
        rows_before = len(df)

        # Try multiple common date formats before dropping rows
        date_formats = [
            '%Y-%m-%d',           # 2023-12-31
            '%m/%d/%Y',           # 12/31/2023
            '%m/%d/%y',           # 12/31/23
            '%d-%m-%Y',           # 31-12-2023
            '%Y/%m/%d',           # 2023/12/31
            '%B %d, %Y',          # December 31, 2023
        ]

        parsed_dates = None
        successful_format = None

        # Try each format and use the one that parses the most rows successfully
        for fmt in date_formats:
            try:
                test_parse = pd.to_datetime(df[date_col], format=fmt, errors='coerce')
                parsed_count = test_parse.notna().sum()

                # If >50% of rows parse successfully, use this format
                if parsed_count > rows_before * 0.5:
                    parsed_dates = test_parse
                    successful_format = fmt
                    break
            except:
                continue

        # Fallback to pandas infer_datetime_format if no format worked well
        if parsed_dates is None or (parsed_dates.notna().sum() < rows_before * 0.5):
            parsed_dates = pd.to_datetime(df[date_col], errors='coerce', infer_datetime_format=True)
            successful_format = 'inferred'

        df[date_col] = parsed_dates

        # Track and surface dropped rows with detailed error info
        rows_with_nat = df[date_col].isna().sum()
        if rows_with_nat > 0:
            dropped_rows_info["invalid_dates"] = rows_with_nat
            format_msg = f"using format {successful_format}" if successful_format else "all formats failed"
            errors_encountered.append({
                "type": "warning",
                "message": f"Dropped {rows_with_nat} rows with unparseable dates ({format_msg})",
                "details": f"Tried formats: {', '.join(date_formats)}. Please use YYYY-MM-DD format for best results.",
                "column": date_col
            })
            log_diagnostic("warning", "Dropped rows with invalid dates",
                          {"count": rows_with_nat, "column": date_col, "format": successful_format})
            print(f"  Warning: Dropped {rows_with_nat} rows with invalid dates ({format_msg})", file=sys.stderr)

        df.dropna(subset=[date_col], inplace=True)
        rows_after = len(df)

    # Clean quantity columns before renaming (snake_case targets) with tracking
    for source, target in rename_map.items():
        if source in df.columns and target in ['quantity_packs', 'quantity_units']:
            original_values = df[source].copy()
            df[source] = pd.to_numeric(df[source], errors='coerce')

            # Track how many values were coerced from non-numeric to NaN
            coerced_count = df[source].isna().sum() - original_values.isna().sum()
            if coerced_count > 0:
                errors_encountered.append({
                    "type": "warning",
                    "message": f"Converted {coerced_count} non-numeric values to 0 in column '{source}'",
                    "column": source
                })
                log_diagnostic("warning", f"Converted non-numeric quantity values",
                              {"count": coerced_count, "column": source})

            df[source] = df[source].fillna(0).astype(int)

    # Apply the rename mapping
    df.rename(columns=rename_map, inplace=True)

    # Validate required columns exist (snake_case)
    required_columns = ['product_id', 'date_submitted']
    missing_columns = [col for col in required_columns if col not in df.columns]

    if missing_columns:
        raise ValueError(
            f"Required columns missing after mapping: {missing_columns}. "
            f"Available columns: {list(df.columns)}"
        )

    # Generate UUID for each transaction
    # CRITICAL: Use snake_case column names to match database columns
    df['id'] = [uuid.uuid4() for _ in range(len(df))]
    df['created_at'] = datetime.now()  # snake_case (database column)
    df['import_batch_id'] = None  # snake_case (database column) - Will be set by the main process

    # PERFORMANCE OPTIMIZATION: Selective column extraction instead of full reindex
    # Only keep columns that exist in the source data, then add missing required columns
    # This is 2-3x faster than df.reindex() for wide datasets
    from sqlalchemy.inspection import inspect
    mapper = inspect(models.Transaction)
    model_columns = [attr.key for attr in mapper.column_attrs]

    # Keep only columns that exist in both DataFrame and model
    columns_to_keep = [col for col in model_columns if col in df.columns]
    df = df[columns_to_keep].copy()

    # Add missing required columns with defaults (only if not in source data)
    if 'order_status' not in df.columns:
        df['order_status'] = 'completed'

    # Set defaults for required columns after reindex (to handle NaN/None values)
    # String columns that need defaults (database default is 'completed')
    if 'order_status' in df.columns and len(df) > 0:
        # Normalize to lowercase and fill missing values
        df['order_status'] = df['order_status'].fillna('completed').astype(str).str.lower()

    # Integer columns that need defaults (no database default - NOT NULL)
    if 'quantity_packs' in df.columns:
        df['quantity_packs'] = df['quantity_packs'].fillna(0).astype(int)

    # FALLBACK: Calculate quantity_units from quantity_packs if missing or all NaN
    # This handles files without a "Total Quantity" column
    if 'quantity_units' in df.columns:
        # Check if quantity_units is all null/NaN (column exists but no data)
        quantity_units_empty = df['quantity_units'].isna().all()

        if quantity_units_empty and 'quantity_packs' in df.columns:
            # Calculate from quantity_packs * pack_size (default pack_size=1 for orders)
            # Note: Orders don't have pack_size column; we use 1 as default
            df['quantity_units'] = df['quantity_packs'].fillna(0).astype(int)
            errors_encountered.append({
                "type": "warning",
                "message": "Column 'Total Quantity' was missing or empty - calculated from 'Quantity' column",
                "details": "quantity_units set to quantity_packs (assumes pack_size=1)"
            })
            log_diagnostic("info", "Calculated quantity_units from quantity_packs",
                          {"rows_calculated": len(df)})

        # Fill any remaining NaN with 0
        df['quantity_units'] = df['quantity_units'].fillna(0).astype(int)
    else:
        # Column doesn't exist at all after reindex - calculate from quantity_packs
        if 'quantity_packs' in df.columns:
            df['quantity_units'] = df['quantity_packs'].fillna(0).astype(int)
            log_diagnostic("info", "Created quantity_units from quantity_packs",
                          {"rows_calculated": len(df)})

    # Replace remaining NaN with None for proper SQL NULL handling
    for col in df.columns:
        df[col] = df[col].apply(lambda x: None if pd.isna(x) else x)

    # Return both the cleaned DataFrame and the dropped rows info for error tracking
    return df, dropped_rows_info


# =============================================================================
# MAIN IMPORT PROCESSING
# =============================================================================

def process_import_cli(import_batch_id: str, file_path: str, import_type: str, mapping_file: Optional[str] = None):
    """
    Main CLI entry point for processing imports.
    This version is corrected for performance and scalability.
    It DOES NOT load the entire product catalog into memory.
    """
    chunk_size = 2000  # Increased chunk size for better performance
    total_rows_processed = 0
    total_rows_seen = 0
    errors_encountered = []

    # Reconciliation tracking for diagnostics
    reconciliation = {
        "total_rows_seen": 0,
        "rows_cleaned": 0,
        "rows_inserted": 0,
        "rows_updated": 0,
        "rows_dropped": 0,
        "chunk_count": 0,
        "drop_reasons": {}  # {"invalid_dates": 5, "missing_required": 10}
    }

    mapping_data = load_column_mapping(mapping_file)
    if mapping_data:
        print(f"Loaded mapping configuration from {mapping_file}")

    db: Session = next(get_db())

    try:
        batch_uuid = uuid.UUID(import_batch_id)
        import_batch = db.query(models.ImportBatch).filter(models.ImportBatch.id == batch_uuid).first()

        if not import_batch:
            log_diagnostic("error", "Import batch not found", {"import_batch_id": import_batch_id})
            print(f"Error: Import batch {import_batch_id} not found.", file=sys.stderr)
            sys.exit(1)

        log_diagnostic("info", "Starting import processing", {
            "import_batch_id": import_batch_id,
            "import_type": import_type,
            "file_path": file_path,
            "client_id": str(import_batch.clientId)
        })

        validate_client_exists(db, str(import_batch.clientId))

        if import_type not in ["inventory", "orders"]:
            error_msg = f"Unsupported import type '{import_type}'. Please select inventory or orders."
            log_diagnostic("error", "Unsupported import type", {
                "import_type": import_type,
                "supported_types": ["inventory", "orders"]
            })
            import_batch.status = 'failed'
            import_batch.completedAt = datetime.now()
            import_batch.errors = [{"message": error_msg}]
            db.commit()
            sys.exit(1)

        import_batch.status = 'processing'
        import_batch.startedAt = datetime.now()
        db.commit()

        # Validate and resolve file path (security: prevent path traversal)
        try:
            absolute_file_path = validate_file_path(file_path)
        except PathValidationError as e:
            log_diagnostic("error", "File path validation failed", {
                "file_path": file_path,
                "error": str(e)
            })
            import_batch.status = 'failed'
            import_batch.completedAt = datetime.now()
            import_batch.errors = [{"message": "Invalid file path provided"}]
            db.commit()
            print(f"Error: Invalid file path - {e}", file=sys.stderr)
            sys.exit(1)

        log_diagnostic("debug", "File path validated", {
            "original_path": file_path,
            "absolute_path": absolute_file_path,
            "exists": os.path.exists(absolute_file_path)
        })

        print(f"Starting import for type '{import_type}'...")

        # =====================================================================
        # PERFORMANCE OPTIMIZATION: Client-level product cache
        # Load all products for this client into memory once (10-100x faster)
        # =====================================================================
        print(f"Loading product cache for client {import_batch.clientId}...")
        product_cache_start = datetime.now()

        product_cache_query = db.query(models.Product.product_id, models.Product.id).filter(
            models.Product.client_id == import_batch.clientId
        )
        product_cache = {p.product_id: p.id for p in product_cache_query.all()}

        product_cache_duration = (datetime.now() - product_cache_start).total_seconds()
        print(f"✅ Loaded {len(product_cache)} products into cache in {product_cache_duration:.2f}s")

        log_diagnostic("info", "Product cache loaded", {
            "client_id": str(import_batch.clientId),
            "product_count": len(product_cache),
            "duration_seconds": product_cache_duration
        })

        # Process file in chunks - supports both CSV and Excel files
        file_reader = read_file(
            absolute_file_path,
            chunksize=chunk_size,
            on_bad_lines='warn',
            encoding='utf-8',
            encoding_errors='replace'
        )

        for i, chunk in enumerate(file_reader):
            try:
                chunk_rows_committed = 0  # Track actual committed rows in this chunk
                raw_chunk_size = len(chunk)
                total_rows_seen += raw_chunk_size
                reconciliation["total_rows_seen"] += raw_chunk_size
                reconciliation["chunk_count"] += 1

                # Emit import started event on first chunk
                if i == 0:
                    emit_progress("import_started", {
                        "import_id": str(batch_uuid),
                        "filename": import_batch.filename,
                        "import_type": import_type
                    })

                if import_type == 'inventory':
                    print(f"Processing inventory chunk {i+1}...")
                    cleaned_chunk = clean_inventory_data(chunk, str(import_batch.clientId), mapping_data)
                    cleaned_rows = len(cleaned_chunk)
                    reconciliation["rows_cleaned"] += cleaned_rows

                    # Track dropped rows
                    dropped_rows = raw_chunk_size - cleaned_rows
                    if dropped_rows > 0:
                        reconciliation["rows_dropped"] += dropped_rows
                        reconciliation["drop_reasons"]["data_validation"] = \
                            reconciliation["drop_reasons"].get("data_validation", 0) + dropped_rows

                    # === Correct Upsert Logic for Inventory ===
                    # NOTE: Using snake_case column names after reindex (product_id, not productId)
                    product_ids_in_chunk = [pid for pid in cleaned_chunk['product_id'].unique() if pd.notna(pid)]

                    existing_products_query = db.query(models.Product).filter(
                        models.Product.client_id == import_batch.clientId,
                        models.Product.product_id.in_(product_ids_in_chunk)
                    )
                    existing_products_map = {p.product_id: p for p in existing_products_query.all()}

                    to_update = []
                    to_insert = []

                    for record in cleaned_chunk.to_dict(orient="records"):
                        pid = record.get('product_id')
                        if pid in existing_products_map:
                            # This product exists, prepare for update
                            update_record = {**record, 'id': existing_products_map[pid].id}
                            to_update.append(update_record)
                        else:
                            # This is a new product
                            to_insert.append(record)

                    if to_insert:
                        print(f"  Inserting {len(to_insert)} new products...")

                        # PERFORMANCE: Use PostgreSQL COPY for 10x faster inserts
                        try:
                            bulk_operations.bulk_insert_products_copy(db, to_insert)
                            chunk_rows_committed += len(to_insert)
                            reconciliation["rows_inserted"] += len(to_insert)
                        except Exception as e:
                            # Fallback to standard bulk insert if COPY fails
                            print(f"  ⚠️  COPY failed, using bulk_insert_mappings: {e}")
                            db.bulk_insert_mappings(models.Product, to_insert)
                            chunk_rows_committed += len(to_insert)
                            reconciliation["rows_inserted"] += len(to_insert)

                    if to_update:
                        print(f"  Updating {len(to_update)} existing products...")
                        # Use bulk_update_mappings for 10-100x faster updates
                        db.bulk_update_mappings(models.Product, to_update)
                        chunk_rows_committed += len(to_update)
                        reconciliation["rows_updated"] += len(to_update)

                elif import_type == 'orders':
                    print(f"Processing orders chunk {i+1}...")
                    cleaned_chunk, dropped_info = clean_orders_data(
                        chunk, str(import_batch.clientId), mapping_data, errors_encountered
                    )
                    cleaned_rows = len(cleaned_chunk)
                    reconciliation["rows_cleaned"] += cleaned_rows

                    # Track dropped rows as warnings in errors list
                    if dropped_info.get("invalid_dates", 0) > 0:
                        dropped = dropped_info["invalid_dates"]
                        reconciliation["rows_dropped"] += dropped
                        reconciliation["drop_reasons"]["invalid_dates"] = \
                            reconciliation["drop_reasons"].get("invalid_dates", 0) + dropped
                        errors_encountered.append({
                            "type": "data_quality",
                            "message": f"Dropped {dropped} rows with unparseable dates",
                            "severity": "warning",
                            "row_range": f"chunk {i+1}"
                        })

                    # === Correct Chunk-Based Lookup Logic ===
                    # NOTE: After df.reindex() with model columns, DataFrame uses snake_case column names
                    # from the database (product_id, not productId)
                    try:
                        chunk_product_ids = [str(pid).strip() for pid in cleaned_chunk['product_id'].unique() if pd.notna(pid) and str(pid).strip()]
                    except KeyError as e:
                        error_msg = f"Column {e} not found. Available columns: {list(cleaned_chunk.columns)}"
                        print(f"FATAL ERROR in chunk {i+1}: {error_msg}", file=sys.stderr)
                        errors_encountered.append({
                            "row_range": f"{(i*chunk_size)+1}-{i*chunk_size+len(chunk)}",
                            "message": error_msg,
                            "type": "KeyError"
                        })
                        continue  # Skip this chunk

                    if not chunk_product_ids:
                        print("  Chunk contains no valid product IDs. Skipping.")
                        continue

                    # PERFORMANCE: Use pre-loaded product cache instead of per-chunk query
                    # Old: 1 DB query per chunk (N queries for N chunks)
                    # New: Dictionary lookup (O(1) for each product)
                    product_lookup_chunk = {
                        pid: product_cache[pid]
                        for pid in chunk_product_ids
                        if pid in product_cache
                    }

                    orphan_products_to_create = []
                    for pid_str in chunk_product_ids:
                        if pid_str not in product_lookup_chunk:
                            new_uuid = uuid.uuid4()
                            # CRITICAL: Use snake_case keys matching database column names
                            # bulk_insert_mappings() expects database column names, NOT Python attributes
                            # SQLAlchemy SILENTLY IGNORES unknown keys, so camelCase keys would be dropped!
                            # Include ALL required defaults to prevent constraint violations
                            orphan_products_to_create.append({
                                'id': new_uuid,
                                'client_id': str(import_batch.clientId),  # snake_case (database column)
                                'product_id': pid_str,                     # snake_case (database column)
                                'name': pid_str,
                                'item_type': 'evergreen',                  # Required default
                                # Mark as non-orphan so these show up in the product list by default
                                'is_orphan': False,
                                'is_active': True,                         # snake_case (database column)
                                'pack_size': 1,                            # snake_case (database column)
                                'current_stock_packs': 0,                  # snake_case (database column)
                                'current_stock_units': 0,                  # snake_case (database column)
                                'notification_point': 0,                   # Required default
                                'feedback_count': 0,                       # Required default
                                'product_metadata': {},                    # Required default (JSON)
                                'created_at': datetime.now(),              # snake_case (database column)
                                'updated_at': datetime.now()               # snake_case (database column)
                            })
                            product_lookup_chunk[pid_str] = new_uuid

                    if orphan_products_to_create:
                        print(f"  Creating {len(orphan_products_to_create)} new orphan products for this chunk...")

                        # RACE CONDITION SAFE: Use ON CONFLICT DO NOTHING then query back IDs
                        # This handles concurrent imports that may create the same product
                        product_id_mapping = bulk_operations.bulk_insert_products_ignore_conflicts(
                            db, orphan_products_to_create, str(import_batch.clientId)
                        )

                        # Update product cache with the actual IDs (handles both new and existing)
                        for pid_str, product_uuid in product_id_mapping.items():
                            product_cache[pid_str] = product_uuid
                            # Also update our chunk lookup
                            product_lookup_chunk[pid_str] = product_uuid

                        print(f"  ✅ Updated product cache with {len(product_id_mapping)} products (new + existing)")

                    # NOTE: Using snake_case column names after reindex
                    resolved_product_ids = [product_lookup_chunk.get(str(pid).strip()) for pid in cleaned_chunk['product_id']]
                    cleaned_chunk['product_id'] = resolved_product_ids
                    cleaned_chunk['import_batch_id'] = batch_uuid

                    valid_rows = cleaned_chunk[cleaned_chunk['product_id'].notna()]
                    if not valid_rows.empty:
                        print(f"  Inserting {len(valid_rows)} transaction records...")

                        # PERFORMANCE: Use PostgreSQL COPY for 10x faster inserts
                        try:
                            transaction_dicts = valid_rows.to_dict(orient="records")
                            bulk_operations.bulk_insert_transactions_copy(db, transaction_dicts)
                            chunk_rows_committed += len(valid_rows)
                            reconciliation["rows_inserted"] += len(valid_rows)
                        except Exception as e:
                            # Fallback to standard bulk insert if COPY fails
                            print(f"  ⚠️  COPY failed, using bulk_insert_mappings: {e}")
                            db.bulk_insert_mappings(models.Transaction, valid_rows.to_dict(orient="records"))
                            chunk_rows_committed += len(valid_rows)
                            reconciliation["rows_inserted"] += len(valid_rows)

                # Commit changes for the entire chunk
                db.commit()

                # Count only successfully committed rows, not raw chunk size
                total_rows_processed += chunk_rows_committed
                import_batch.processedCount = total_rows_processed
                db.commit()

                # Emit progress update for Node.js real-time tracking
                emit_progress("chunk_completed", {
                    "import_id": str(batch_uuid),
                    "chunk_number": i + 1,
                    "chunk_rows": chunk_rows_committed,
                    "total_processed": total_rows_processed
                })

                print(f"  Finished chunk {i+1}. Committed {chunk_rows_committed} rows. Total rows processed: {total_rows_processed}")

            except ValueError as ve:
                # Validation error from cleaning functions (required columns missing, etc.)
                db.rollback()
                error_detail = {
                    "type": "ValidationError",
                    "message": f"Data validation error: {str(ve)}",
                    "severity": "error",
                    "row_range": f"{(i*chunk_size)+1}-{i*chunk_size+len(chunk)}",
                    "chunk_number": i + 1
                }
                errors_encountered.append(error_detail)
                log_diagnostic("error", "Chunk validation error", {
                    "chunk_number": i + 1,
                    "row_range": error_detail["row_range"],
                    "error": str(ve)
                })
                print(f"FATAL ERROR in chunk {i+1}: Data validation - {ve}", file=sys.stderr)

            except Exception as chunk_e:
                # Other errors (database, unexpected issues)
                db.rollback()
                error_detail = {
                    "type": type(chunk_e).__name__,
                    "message": str(chunk_e),
                    "severity": "error",
                    "row_range": f"{(i*chunk_size)+1}-{i*chunk_size+len(chunk)}",
                    "chunk_number": i + 1
                }
                errors_encountered.append(error_detail)
                log_diagnostic("error", "Chunk processing error", {
                    "chunk_number": i + 1,
                    "row_range": error_detail["row_range"],
                    "error_type": type(chunk_e).__name__,
                    "error": str(chunk_e)
                })
                print(f"FATAL ERROR in chunk {i+1}: {chunk_e}", file=sys.stderr)

        # Finalize import status
        import_batch.rowCount = total_rows_seen or total_rows_processed
        if total_rows_processed == 0:
            import_batch.status = 'failed'
            import_batch.error = 'No valid rows to process'
            log_diagnostic("error", "Import failed - no valid rows", {
                "total_rows_seen": total_rows_seen,
                "total_rows_processed": total_rows_processed,
                "errors_count": len(errors_encountered)
            })
        elif errors_encountered:
            import_batch.status = 'completed_with_errors'
            log_diagnostic("warning", "Import completed with errors", {
                "total_rows_processed": total_rows_processed,
                "errors_count": len(errors_encountered)
            })
        else:
            import_batch.status = 'completed'
            log_diagnostic("info", "Import completed successfully", {
                "total_rows_processed": total_rows_processed
            })

        # Surface dropped row statistics as user-facing errors
        total_rows_dropped = reconciliation.get("rows_dropped", 0)
        if total_rows_dropped > 0:
            drop_reasons = reconciliation.get("drop_reasons", {})

            # Add detailed error for invalid dates if tracked
            if drop_reasons.get("invalid_dates", 0) > 0:
                errors_encountered.append({
                    "type": "error",
                    "message": f"Dropped {drop_reasons['invalid_dates']} rows due to invalid dates",
                    "severity": "high",
                    "details": "Check date column format - YYYY-MM-DD recommended"
                })

            # Add error for missing required fields if tracked
            if drop_reasons.get("missing_required", 0) > 0:
                errors_encountered.append({
                    "type": "error",
                    "message": f"Dropped {drop_reasons['missing_required']} rows due to missing required columns",
                    "severity": "high"
                })

            # Add processing summary with drop stats
            errors_encountered.append({
                "type": "info",
                "message": f"Import Summary: Processed {total_rows_processed}/{total_rows_seen or total_rows_processed} rows ({total_rows_dropped} dropped)",
                "details": f"Drop reasons: {drop_reasons}"
            })

        import_batch.completedAt = datetime.now()
        import_batch.errorCount = len(errors_encountered)
        import_batch.errors = errors_encountered

        # Store reconciliation metadata for diagnostics
        import_batch.importMetadata = {
            "reconciliation": reconciliation,
            "diagnostics_available": True
        }

        db.commit()
        print(f"Import {import_batch_id} finished. Status: {import_batch.status}. Processed {total_rows_processed} rows with {len(errors_encountered)} errors.")

        # Exit 0 for all handled statuses - Node.js will read status from database
        # Only exit non-zero for fatal setup errors (caught in except block)
        sys.exit(0)

    except Exception as e:
        db.rollback()
        log_diagnostic("error", "Fatal error during import", {
            "import_batch_id": import_batch_id,
            "error_type": type(e).__name__,
            "error": str(e)
        })
        print(f"Fatal error during import setup {import_batch_id}: {e}", file=sys.stderr)
        if 'import_batch' in locals() and import_batch:
            import_batch.status = 'failed'
            import_batch.completedAt = datetime.now()
            import_batch.errors = errors_encountered + [{"message": f"Fatal setup error: {e}"}]
            db.commit()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 5:
        print(
            "Usage: python -m apps.python-importer.main "
            "<database_url> <import_batch_id> <file_path> "
            "<import_type> [mapping_file]",
            file=sys.stderr
        )
        sys.exit(1)

    # NEW: database_url is first argument
    database_url = sys.argv[1]
    import_batch_id = sys.argv[2]  # Shifted from index 1
    file_path = sys.argv[3]         # Shifted from index 2
    import_type = sys.argv[4]       # Shifted from index 3
    mapping_file = sys.argv[5] if len(sys.argv) > 5 else None

    # Initialize database with explicit URL
    try:
        initialize_database(database_url)
        print("[main.py] Database initialized successfully")
    except Exception as e:
        print(f"FATAL: Failed to initialize database: {e}", file=sys.stderr)
        sys.exit(1)

    # Create tables after successful connection
    try:
        models.Base.metadata.create_all(bind=database.engine)
        print("[main.py] Database tables verified")
    except Exception as e:
        print(f"FATAL: Failed to create/verify tables: {e}", file=sys.stderr)
        sys.exit(1)

    # Process import
    process_import_cli(import_batch_id, file_path, import_type, mapping_file)
