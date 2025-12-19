import pandas as pd
import re
import json
import os
from sqlalchemy.orm import Session
import uuid
import sys
from datetime import datetime
from typing import Optional

# Add the package directory to path for direct script execution
_package_dir = os.path.dirname(os.path.abspath(__file__))
if _package_dir not in sys.path:
    sys.path.insert(0, _package_dir)

from database import initialize_database, get_db
import database
import models


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

            def excel_stream_chunker(path, chunk_size):
                """Generator that yields chunks from Excel file without loading it all into memory."""
                wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
                ws = wb.active

                # Get header row
                rows_iter = ws.iter_rows(values_only=True)
                header = next(rows_iter, None)

                if not header:
                    print("Warning: Excel file appears to be empty")
                    return

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

                wb.close()

            return excel_stream_chunker(file_path, chunksize)
        else:
            # Read entire Excel file (only for preview or small files)
            return pd.read_excel(file_path, engine='openpyxl')
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
    # Ensure all string operations are on string type
    for col in df.columns:
        if df[col].dtype == 'object':
            df[col] = df[col].astype(str).str.strip()

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

    # Select only columns that match Product model attribute names
    # CRITICAL: bulk_insert_mappings uses attribute names, NOT database column names
    from sqlalchemy.inspection import inspect
    mapper = inspect(models.Product)
    model_columns = [attr.key for attr in mapper.column_attrs]

    # Validate required columns exist before reindex (use snake_case)
    required_for_model = ['product_id', 'name']  # snake_case database column names
    existing_columns = set(df.columns)
    missing_required = [col for col in required_for_model if col not in existing_columns]

    if missing_required:
        raise ValueError(
            f"Cannot proceed: Required columns {missing_required} not found after mapping. "
            f"Available columns: {list(df.columns)}"
        )

    df = df.reindex(columns=model_columns, fill_value=None)

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
    if 'item_type' in df.columns:
        df['item_type'] = df['item_type'].fillna('evergreen')

    # Replace remaining NaN with None for proper SQL NULL handling
    # pandas.where doesn't always work properly, so we use a more explicit approach
    for col in df.columns:
        # Convert NaN to None for each column
        df[col] = df[col].apply(lambda x: None if pd.isna(x) else x)

    return df


def clean_orders_data(df: pd.DataFrame, client_id: str, mapping_data: Optional[dict] = None) -> pd.DataFrame:
    """
    Cleans and transforms data for orders imports.

    CRITICAL: All column names must use snake_case to match database column names.
    bulk_insert_mappings() uses database column names (from __table__.columns.name),
    NOT Python attribute names. SQLAlchemy SILENTLY IGNORES unknown keys!
    """
    # Ensure all string operations are on string type
    for col in df.columns:
        if df[col].dtype == 'object':
            df[col] = df[col].astype(str).str.strip()

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

    if date_col and date_col in df.columns:
        rows_before = len(df)
        df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
        df.dropna(subset=[date_col], inplace=True)
        rows_after = len(df)

        if rows_after < rows_before:
            print(f"  Warning: Dropped {rows_before - rows_after} rows with invalid dates", file=sys.stderr)

    # Clean quantity columns before renaming (snake_case targets)
    for source, target in rename_map.items():
        if source in df.columns and target in ['quantity_packs', 'quantity_units']:
            df[source] = pd.to_numeric(df[source], errors='coerce').fillna(0).astype(int)

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

    # Select only columns that match Transaction model attribute names
    # CRITICAL: bulk_insert_mappings uses attribute names, NOT database column names
    from sqlalchemy.inspection import inspect
    mapper = inspect(models.Transaction)
    model_columns = [attr.key for attr in mapper.column_attrs]
    df = df.reindex(columns=model_columns, fill_value=None)

    # Set defaults for required columns after reindex (to handle NaN/None values)
    # String columns that need defaults (database default is 'completed')
    if 'order_status' in df.columns:
        df['order_status'] = df['order_status'].fillna('completed')

    # Integer columns that need defaults (no database default - NOT NULL)
    if 'quantity_packs' in df.columns:
        df['quantity_packs'] = df['quantity_packs'].fillna(0).astype(int)
    if 'quantity_units' in df.columns:
        df['quantity_units'] = df['quantity_units'].fillna(0).astype(int)

    # Replace remaining NaN with None for proper SQL NULL handling
    for col in df.columns:
        df[col] = df[col].apply(lambda x: None if pd.isna(x) else x)

    return df


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
    errors_encountered = []

    mapping_data = load_column_mapping(mapping_file)
    if mapping_data:
        print(f"Loaded mapping configuration from {mapping_file}")

    db: Session = next(get_db())

    try:
        batch_uuid = uuid.UUID(import_batch_id)
        import_batch = db.query(models.ImportBatch).filter(models.ImportBatch.id == batch_uuid).first()

        if not import_batch:
            print(f"Error: Import batch {import_batch_id} not found.", file=sys.stderr)
            sys.exit(1)

        validate_client_exists(db, str(import_batch.clientId))
        import_batch.status = 'processing'
        import_batch.startedAt = datetime.now()
        db.commit()

        absolute_file_path = os.path.abspath(file_path)

        print(f"Starting import for type '{import_type}'...")

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

                if import_type == 'inventory':
                    print(f"Processing inventory chunk {i+1}...")
                    cleaned_chunk = clean_inventory_data(chunk, str(import_batch.clientId), mapping_data)

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
                        db.bulk_insert_mappings(models.Product, to_insert)
                        chunk_rows_committed += len(to_insert)

                    if to_update:
                        print(f"  Updating {len(to_update)} existing products...")
                        # Use bulk_update_mappings for 10-100x faster updates
                        db.bulk_update_mappings(models.Product, to_update)
                        chunk_rows_committed += len(to_update)

                elif import_type == 'orders':
                    print(f"Processing orders chunk {i+1}...")
                    cleaned_chunk = clean_orders_data(chunk, str(import_batch.clientId), mapping_data)

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

                    existing_products_query = db.query(models.Product.product_id, models.Product.id).filter(
                        models.Product.client_id == import_batch.clientId,
                        models.Product.product_id.in_(chunk_product_ids)
                    )
                    product_lookup_chunk = {p.product_id: p.id for p in existing_products_query.all()}

                    orphan_products_to_create = []
                    for pid_str in chunk_product_ids:
                        if pid_str not in product_lookup_chunk:
                            new_uuid = uuid.uuid4()
                            # CRITICAL: Use snake_case keys matching database column names
                            # bulk_insert_mappings() expects database column names, NOT Python attributes
                            # SQLAlchemy SILENTLY IGNORES unknown keys, so camelCase keys would be dropped!
                            orphan_products_to_create.append({
                                'id': new_uuid,
                                'client_id': str(import_batch.clientId),  # snake_case (database column)
                                'product_id': pid_str,                     # snake_case (database column)
                                'name': pid_str,
                                'is_orphan': True,                         # snake_case (database column)
                                'is_active': True,                         # snake_case (database column)
                                'pack_size': 1,                            # snake_case (database column)
                                'current_stock_packs': 0,                  # snake_case (database column)
                                'current_stock_units': 0,                  # snake_case (database column)
                                'created_at': datetime.now(),              # snake_case (database column)
                                'updated_at': datetime.now()               # snake_case (database column)
                            })
                            product_lookup_chunk[pid_str] = new_uuid

                    if orphan_products_to_create:
                        print(f"  Creating {len(orphan_products_to_create)} new orphan products for this chunk...")
                        db.bulk_insert_mappings(models.Product, orphan_products_to_create)
                        db.flush()

                    # NOTE: Using snake_case column names after reindex
                    resolved_product_ids = [product_lookup_chunk.get(str(pid).strip()) for pid in cleaned_chunk['product_id']]
                    cleaned_chunk['product_id'] = resolved_product_ids
                    cleaned_chunk['import_batch_id'] = batch_uuid

                    valid_rows = cleaned_chunk[cleaned_chunk['product_id'].notna()]
                    if not valid_rows.empty:
                        print(f"  Inserting {len(valid_rows)} transaction records...")
                        db.bulk_insert_mappings(models.Transaction, valid_rows.to_dict(orient="records"))
                        chunk_rows_committed += len(valid_rows)

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
                    "row_range": f"{(i*chunk_size)+1}-{i*chunk_size+len(chunk)}",
                    "message": f"Data validation error: {str(ve)}",
                    "type": "ValidationError"
                }
                errors_encountered.append(error_detail)
                print(f"FATAL ERROR in chunk {i+1}: Data validation - {ve}", file=sys.stderr)

            except Exception as chunk_e:
                # Other errors (database, unexpected issues)
                db.rollback()
                error_detail = {
                    "row_range": f"{(i*chunk_size)+1}-{i*chunk_size+len(chunk)}",
                    "message": str(chunk_e),
                    "type": type(chunk_e).__name__
                }
                errors_encountered.append(error_detail)
                print(f"FATAL ERROR in chunk {i+1}: {chunk_e}", file=sys.stderr)

        # Finalize import status
        if total_rows_processed == 0:
            import_batch.status = 'failed'
            import_batch.error = 'No valid rows to process'
        elif errors_encountered:
            import_batch.status = 'completed_with_errors'
        else:
            import_batch.status = 'completed'

        import_batch.completedAt = datetime.now()
        import_batch.errorCount = len(errors_encountered)
        import_batch.errors = errors_encountered
        db.commit()
        print(f"Import {import_batch_id} finished. Status: {import_batch.status}. Processed {total_rows_processed} rows with {len(errors_encountered)} errors.")

        # Exit 0 for all handled statuses - Node.js will read status from database
        # Only exit non-zero for fatal setup errors (caught in except block)
        sys.exit(0)

    except Exception as e:
        db.rollback()
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
