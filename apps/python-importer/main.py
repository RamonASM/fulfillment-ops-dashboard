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

    # Handle custom fields - store in product_metadata (matches model column name)
    if mapping_data and mapping_data.get('columnMappings'):
        custom_mappings = [m for m in mapping_data['columnMappings'] if m.get('isCustomField', False)]
        if custom_mappings:
            df['product_metadata'] = df.apply(lambda row: extract_custom_fields(row, custom_mappings), axis=1)
        else:
            df['product_metadata'] = [{} for _ in range(len(df))]
    else:
        df['product_metadata'] = [{} for _ in range(len(df))]

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

    # Define required column mappings for orders
    required_mappings = {
        'Product ID': 'productId',
        'Order ID': 'orderId',
        'Quantity': 'quantityPacks',
        'Total Quantity': 'quantityUnits',
        'Date Submitted': 'dateSubmitted',
        'Order Status': 'orderStatus',
        'Ship To Location': 'shipToLocation',
        'Ship To Company': 'shipToCompany',
    }

    # Determine rename map - use intelligent mapping if provided, else fallback to hard-coded
    if mapping_data and mapping_data.get('columnMappings'):
        rename_map = build_rename_map(mapping_data['columnMappings'])
        print(f"Using intelligent column mapping with {len(rename_map)} mappings")

        # Fill in missing required mappings from fallback
        for source, target in required_mappings.items():
            # Only add if:
            # 1. Target column doesn't already exist (wasn't already renamed)
            # 2. Source column exists in CSV
            # 3. Source hasn't already been mapped to something else
            if target not in rename_map.values() and source in df.columns and source not in rename_map:
                rename_map[source] = target
                print(f"  Added fallback mapping: {source} -> {target}")
    else:
        rename_map = required_mappings
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

    # Validate required columns exist
    required_columns = ['productId', 'dateSubmitted']
    missing_columns = [col for col in required_columns if col not in df.columns]

    if missing_columns:
        raise ValueError(
            f"Required columns missing after mapping: {missing_columns}. "
            f"Available columns: {list(df.columns)}"
        )

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

        # Process file in chunks
        for i, chunk in enumerate(pd.read_csv(absolute_file_path, chunksize=chunk_size, on_bad_lines='warn', encoding='utf-8', encoding_errors='replace')):
            try:
                if import_type == 'inventory':
                    print(f"Processing inventory chunk {i+1}...")
                    cleaned_chunk = clean_inventory_data(chunk, str(import_batch.clientId), mapping_data)

                    # === Correct Upsert Logic for Inventory ===
                    product_ids_in_chunk = [pid for pid in cleaned_chunk['productId'].unique() if pd.notna(pid)]

                    existing_products_query = db.query(models.Product).filter(
                        models.Product.clientId == import_batch.clientId,
                        models.Product.productId.in_(product_ids_in_chunk)
                    )
                    existing_products_map = {p.productId: p for p in existing_products_query.all()}

                    to_update = []
                    to_insert = []

                    for record in cleaned_chunk.to_dict(orient="records"):
                        pid = record.get('productId')
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

                    if to_update:
                        print(f"  Updating {len(to_update)} existing products...")
                        # NOTE: bulk_update_mappings is not standard in SQLAlchemy Core.
                        # This requires iteration, but it's safe.
                        for item in to_update:
                            db.merge(models.Product(**item))

                elif import_type == 'orders':
                    print(f"Processing orders chunk {i+1}...")
                    cleaned_chunk = clean_orders_data(chunk, str(import_batch.clientId), mapping_data)

                    # === Correct Chunk-Based Lookup Logic ===
                    try:
                        chunk_product_ids = [str(pid).strip() for pid in cleaned_chunk['productId'].unique() if pd.notna(pid) and str(pid).strip()]
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

                    existing_products_query = db.query(models.Product.productId, models.Product.id).filter(
                        models.Product.clientId == import_batch.clientId,
                        models.Product.productId.in_(chunk_product_ids)
                    )
                    product_lookup_chunk = {p.productId: p.id for p in existing_products_query.all()}

                    orphan_products_to_create = []
                    for pid_str in chunk_product_ids:
                        if pid_str not in product_lookup_chunk:
                            new_uuid = uuid.uuid4()
                            orphan_products_to_create.append({
                                'id': new_uuid, 'clientId': import_batch.clientId, 'productId': pid_str, 'name': pid_str,
                                'isOrphan': True, 'isActive': True, 'packSize': 1, 'currentStockPacks': 0,
                                'currentStockUnits': 0, 'createdAt': datetime.now(), 'updatedAt': datetime.now()
                            })
                            product_lookup_chunk[pid_str] = new_uuid

                    if orphan_products_to_create:
                        print(f"  Creating {len(orphan_products_to_create)} new orphan products for this chunk...")
                        db.bulk_insert_mappings(models.Product, orphan_products_to_create)
                        db.flush()

                    resolved_product_ids = [product_lookup_chunk.get(str(pid).strip()) for pid in cleaned_chunk['productId']]
                    cleaned_chunk['productId'] = resolved_product_ids
                    cleaned_chunk['importBatchId'] = batch_uuid

                    valid_rows = cleaned_chunk[cleaned_chunk['productId'].notna()]
                    if not valid_rows.empty:
                        print(f"  Inserting {len(valid_rows)} transaction records...")
                        db.bulk_insert_mappings(models.Transaction, valid_rows.to_dict(orient="records"))

                # Commit changes for the entire chunk
                db.commit()

                total_rows_processed += len(chunk)
                import_batch.processedCount = total_rows_processed
                db.commit()
                print(f"  Finished chunk {i+1}. Total rows processed: {total_rows_processed}")

            except Exception as chunk_e:
                db.rollback()
                error_detail = {
                    "row_range": f"{(i*chunk_size)+1}-{i*chunk_size+len(chunk)}",
                    "message": str(chunk_e),
                }
                errors_encountered.append(error_detail)
                print(f"FATAL ERROR in chunk {i+1}: {chunk_e}", file=sys.stderr)

        # Finalize import status
        import_batch.status = 'completed_with_errors' if errors_encountered else 'completed'
        import_batch.completedAt = datetime.now()
        import_batch.errorCount = len(errors_encountered)
        import_batch.errors = errors_encountered
        db.commit()
        print(f"Import {import_batch_id} finished. Processed {total_rows_processed} rows with {len(errors_encountered)} errors.")

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
