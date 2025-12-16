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

from database import SessionLocal, engine
import models

# Ensure tables are created (idempotent)
models.Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =============================================================================
# MAPPING FILE UTILITIES
# =============================================================================

def load_column_mapping(mapping_file_path: Optional[str]) -> Optional[dict]:
    """
    Load column mapping from JSON sidecar file.
    Returns None if no mapping file provided or file doesn't exist.
    """
    if not mapping_file_path or not os.path.exists(mapping_file_path):
        return None

    try:
        with open(mapping_file_path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Warning: Failed to load mapping file {mapping_file_path}: {e}", file=sys.stderr)
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
        models.Product.productId,
        models.Product.id
    ).filter(
        models.Product.clientId == client_id,
        models.Product.productId.in_(clean_product_ids)
    ).all()

    return {str(p.productId): p.id for p in existing_products}


# =============================================================================
# DATA CLEANING FUNCTIONS
# =============================================================================

def clean_inventory_data(df: pd.DataFrame, client_id: str, mapping_data: Optional[dict] = None) -> pd.DataFrame:
    """Cleans and transforms data for inventory imports."""
    # Ensure all string operations are on string type
    for col in df.columns:
        if df[col].dtype == 'object':
            df[col] = df[col].astype(str).str.strip()

    # Determine rename map - use intelligent mapping if provided, else fallback to hard-coded
    if mapping_data and mapping_data.get('columnMappings'):
        rename_map = build_rename_map(mapping_data['columnMappings'])
        print(f"Using intelligent column mapping with {len(rename_map)} mappings")
    else:
        # Fallback to hard-coded mapping for backwards compatibility
        rename_map = {
            'Product ID': 'productId',
            'Product Name': 'name',
            'Item Type': 'itemType',
            'Quantity Multiplier': 'packSize',
            'Current Notification Point': 'notificationPoint',
            'Available Quantity': 'currentStockPacks',
            'New Notification Point': 'notificationPoint',
        }
        print("Using fallback hard-coded column mapping")

    # Clean 'New Notification Point' or mapped equivalent before renaming
    notification_col = None
    for source, target in rename_map.items():
        if target == 'notificationPoint' and source in df.columns:
            notification_col = source
            break

    if notification_col and notification_col in df.columns:
        df[notification_col] = df[notification_col].apply(
            lambda x: re.search(r'\d+', str(x)).group(0) if re.search(r'\d+', str(x)) else None
        )
        df[notification_col] = pd.to_numeric(df[notification_col], errors='coerce').fillna(0).astype(int)

    # Clean numeric columns before renaming
    for source, target in rename_map.items():
        if source in df.columns:
            if target in ['currentStockPacks', 'packSize']:
                df[source] = pd.to_numeric(df[source], errors='coerce').fillna(0 if target == 'currentStockPacks' else 1).astype(int)

    # Apply the rename mapping
    df.rename(columns=rename_map, inplace=True)

    # Convert client_id string to UUID
    client_uuid = uuid.UUID(client_id) if isinstance(client_id, str) else client_id

    # Add/Ensure required columns and types with proper UUID
    df['id'] = [uuid.uuid4() for _ in range(len(df))]
    df['clientId'] = client_uuid

    # Ensure packSize exists and has a default
    if 'packSize' not in df.columns:
        df['packSize'] = 1
    df['packSize'] = df['packSize'].fillna(1).astype(int)

    # Ensure currentStockPacks exists
    if 'currentStockPacks' not in df.columns:
        df['currentStockPacks'] = 0

    # Calculate currentStockUnits
    df['currentStockUnits'] = df['currentStockPacks'] * df['packSize']

    df['createdAt'] = datetime.now()
    df['updatedAt'] = datetime.now()

    # Handle custom fields - store in metadata
    if mapping_data and mapping_data.get('columnMappings'):
        custom_mappings = [m for m in mapping_data['columnMappings'] if m.get('isCustomField', False)]
        if custom_mappings:
            df['metadata'] = df.apply(lambda row: extract_custom_fields(row, custom_mappings), axis=1)
        else:
            df['metadata'] = [{} for _ in range(len(df))]
    else:
        df['metadata'] = [{} for _ in range(len(df))]

    # Select only columns that exist in the Product model
    model_columns = [c.name for c in models.Product.__table__.columns]
    df = df.reindex(columns=model_columns, fill_value=None)

    return df


def clean_orders_data(df: pd.DataFrame, client_id: str, mapping_data: Optional[dict] = None) -> pd.DataFrame:
    """Cleans and transforms data for orders imports."""
    # Ensure all string operations are on string type
    for col in df.columns:
        if df[col].dtype == 'object':
            df[col] = df[col].astype(str).str.strip()

    # Determine rename map - use intelligent mapping if provided, else fallback to hard-coded
    if mapping_data and mapping_data.get('columnMappings'):
        rename_map = build_rename_map(mapping_data['columnMappings'])
        print(f"Using intelligent column mapping with {len(rename_map)} mappings")
    else:
        # Fallback to hard-coded mapping for backwards compatibility
        rename_map = {
            'Product ID': 'productId',
            'Order ID': 'orderId',
            'Quantity': 'quantityPacks',
            'Total Quantity': 'quantityUnits',
            'Date Submitted': 'dateSubmitted',
            'Order Status': 'orderStatus',
            'Ship To Location': 'shipToLocation',
            'Ship To Company': 'shipToCompany',
        }
        print("Using fallback hard-coded column mapping")

    # Clean 'Unit Price' and 'Extended Price' if they exist
    if 'Unit Price' in df.columns:
        df['Unit Price'] = df['Unit Price'].astype(str).str.replace(r'[$,]', '', regex=True).astype(float)
    if 'Extended Price' in df.columns:
        df['Extended Price'] = df['Extended Price'].astype(str).str.replace(r'[$,]', '', regex=True).astype(float)

    # Find and clean date column before renaming
    date_col = None
    for source, target in rename_map.items():
        if target == 'dateSubmitted' and source in df.columns:
            date_col = source
            break

    if date_col and date_col in df.columns:
        df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
        df.dropna(subset=[date_col], inplace=True)

    # Clean quantity columns before renaming
    for source, target in rename_map.items():
        if source in df.columns and target in ['quantityPacks', 'quantityUnits']:
            df[source] = pd.to_numeric(df[source], errors='coerce').fillna(0).astype(int)

    # Apply the rename mapping
    df.rename(columns=rename_map, inplace=True)

    # Generate UUID for each transaction
    df['id'] = [uuid.uuid4() for _ in range(len(df))]
    df['createdAt'] = datetime.now()
    df['importBatchId'] = None  # Will be set by the main process

    # Select only columns that exist in the Transaction model
    model_columns = [c.name for c in models.Transaction.__table__.columns]
    df = df.reindex(columns=model_columns, fill_value=None)

    return df


# =============================================================================
# MAIN IMPORT PROCESSING
# =============================================================================

def process_import_cli(import_batch_id: str, file_path: str, import_type: str, mapping_file: Optional[str] = None):
    """
    Main CLI entry point for processing imports.

    Args:
        import_batch_id: UUID of the import batch
        file_path: Path to the CSV/Excel file
        import_type: 'inventory' or 'orders'
        mapping_file: Optional path to JSON sidecar file with column mappings
    """
    chunk_size = 1000
    total_rows_processed = 0
    errors_encountered = []

    # Load column mapping if provided
    mapping_data = load_column_mapping(mapping_file)
    if mapping_data:
        print(f"Loaded mapping configuration from {mapping_file}")

    db: Session = next(get_db())

    try:
        # Convert import_batch_id to UUID for query
        batch_uuid = uuid.UUID(import_batch_id) if isinstance(import_batch_id, str) else import_batch_id

        import_batch = db.query(models.ImportBatch).filter(
            models.ImportBatch.id == batch_uuid
        ).first()

        if not import_batch:
            print(f"Error: Import batch {import_batch_id} not found.", file=sys.stderr)
            sys.exit(1)

        # Validate client exists before processing
        try:
            validate_client_exists(db, str(import_batch.clientId))
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            import_batch.status = 'failed'
            import_batch.errors = [{"message": str(e)}]
            db.commit()
            sys.exit(1)

        import_batch.status = 'processing'
        import_batch.startedAt = datetime.now()
        db.commit()

        # Update the file path to be absolute
        absolute_file_path = os.path.abspath(file_path)

        # For orders, pre-fetch all products for this client for FK resolution
        product_lookup = {}
        if import_type == 'orders':
            all_products = db.query(
                models.Product.productId,
                models.Product.id
            ).filter(
                models.Product.clientId == import_batch.clientId
            ).all()
            product_lookup = {str(p.productId): p.id for p in all_products}
            print(f"Pre-loaded {len(product_lookup)} products for FK resolution")

        for i, chunk in enumerate(pd.read_csv(absolute_file_path, chunksize=chunk_size, on_bad_lines='warn', encoding='utf-8', encoding_errors='replace')):
            try:
                if import_type == 'inventory':
                    cleaned_chunk = clean_inventory_data(chunk, str(import_batch.clientId), mapping_data)
                    db.bulk_insert_mappings(models.Product, cleaned_chunk.to_dict(orient="records"))
                    db.commit()

                elif import_type == 'orders':
                    cleaned_chunk = clean_orders_data(chunk, str(import_batch.clientId), mapping_data)

                    # Resolve product foreign keys
                    resolved_product_ids = []
                    orphan_products_to_create = []

                    for csv_product_id in cleaned_chunk['productId']:
                        if pd.isna(csv_product_id) or str(csv_product_id).strip() == '':
                            resolved_product_ids.append(None)
                            continue

                        csv_product_id_str = str(csv_product_id).strip()

                        if csv_product_id_str in product_lookup:
                            # Found existing product - use its UUID
                            resolved_product_ids.append(product_lookup[csv_product_id_str])
                        else:
                            # Product not found - create orphan product
                            new_product_uuid = uuid.uuid4()
                            orphan_products_to_create.append({
                                'id': new_product_uuid,
                                'clientId': import_batch.clientId,
                                'productId': csv_product_id_str,
                                'name': csv_product_id_str,  # Use productId as name
                                'isOrphan': True,
                                'isActive': True,
                                'packSize': 1,
                                'currentStockPacks': 0,
                                'currentStockUnits': 0,
                                'createdAt': datetime.now(),
                                'updatedAt': datetime.now(),
                                'metadata': {}
                            })
                            # Add to lookup for subsequent rows
                            product_lookup[csv_product_id_str] = new_product_uuid
                            resolved_product_ids.append(new_product_uuid)

                    # Create orphan products first
                    if orphan_products_to_create:
                        print(f"Creating {len(orphan_products_to_create)} orphan products for unmatched IDs")
                        db.bulk_insert_mappings(models.Product, orphan_products_to_create)
                        db.flush()

                    # Update productId column with resolved UUIDs
                    cleaned_chunk['productId'] = resolved_product_ids

                    # Set importBatchId
                    cleaned_chunk['importBatchId'] = batch_uuid

                    # Filter out rows with no resolved productId
                    valid_rows = cleaned_chunk[cleaned_chunk['productId'].notna()]

                    if len(valid_rows) > 0:
                        db.bulk_insert_mappings(models.Transaction, valid_rows.to_dict(orient="records"))

                    db.commit()

                total_rows_processed += len(chunk)
                import_batch.processedCount = total_rows_processed
                db.commit()

                print(f"Processed chunk {i+1}: {len(chunk)} rows (total: {total_rows_processed})")

            except Exception as chunk_e:
                error_detail = {
                    "row_range": f"{(i*chunk_size)+2}-{(i*chunk_size)+len(chunk)+1}",
                    "message": str(chunk_e),
                    "chunk_data_sample": chunk.head(2).to_dict()
                }
                errors_encountered.append(error_detail)
                print(f"Error processing chunk {i}: {chunk_e}", file=sys.stderr)

        import_batch.status = 'completed'
        import_batch.completedAt = datetime.now()
        import_batch.errorCount = len(errors_encountered)
        import_batch.errors = errors_encountered
        db.commit()
        print(f"Import {import_batch_id} completed. Processed {total_rows_processed} rows with {len(errors_encountered)} errors.")

    except Exception as e:
        print(f"Fatal error during import {import_batch_id}: {e}", file=sys.stderr)
        if import_batch:
            import_batch.status = 'failed'
            import_batch.completedAt = datetime.now()
            import_batch.errors = errors_encountered + [{"message": f"Fatal error: {e}"}]
            db.commit()
        sys.exit(1)

    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python -m apps.python-importer.main <import_batch_id> <file_path> <import_type> [mapping_file]", file=sys.stderr)
        sys.exit(1)

    import_batch_id = sys.argv[1]
    file_path = sys.argv[2]
    import_type = sys.argv[3]
    mapping_file = sys.argv[4] if len(sys.argv) > 4 else None

    process_import_cli(import_batch_id, file_path, import_type, mapping_file)
