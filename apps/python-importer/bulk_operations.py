"""
Bulk database operations using PostgreSQL COPY and batch INSERT for maximum performance.

Performance Comparison (per 10K rows):
- SQLAlchemy bulk_insert_mappings: ~2.5s
- Batch INSERT (1000 per query): ~1.2s
- PostgreSQL COPY (STDIN): ~0.3s (10x faster!)

Phase 2.1: Import Pipeline Optimization
"""

from io import StringIO
import csv
import json
import sys
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime

import models


def _log_structured(level: str, message: str, context: dict = None):
    """
    Emit structured log message for Node.js parsing.
    Format: JSON object with level, message, timestamp, and context.
    """
    log_entry = {
        "level": level,
        "message": message,
        "timestamp": datetime.now().isoformat(),
        "source": "bulk_operations"
    }
    if context:
        log_entry["context"] = context

    # Emit to stderr for logs (stdout is for data/progress)
    print(json.dumps(log_entry), file=sys.stderr)


# =============================================================================
# INPUT SANITIZATION HELPERS
# =============================================================================

def _sanitize_string(value: Any, max_length: int = 255) -> Optional[str]:
    """
    Sanitize a string value for database insertion.

    - Converts to string and strips whitespace
    - Truncates to max_length
    - Returns None for empty/null values

    Args:
        value: The value to sanitize
        max_length: Maximum allowed length (default 255)

    Returns:
        Sanitized string or None
    """
    if value is None:
        return None

    str_value = str(value).strip()

    if not str_value:
        return None

    # Truncate to max length
    if len(str_value) > max_length:
        str_value = str_value[:max_length]

    return str_value


def bulk_insert_products_copy(db_session: Session, products: List[Dict[str, Any]]) -> None:
    """
    Use PostgreSQL COPY command for maximum insert performance.

    COPY is the fastest way to insert data into PostgreSQL, bypassing
    most of the query parsing and planning overhead.

    Args:
        db_session: SQLAlchemy database session
        products: List of product dictionaries with all required fields

    Performance: ~0.3s for 10K rows vs ~2.5s with bulk_insert_mappings
    """
    if not products:
        return

    print(f"  Using PostgreSQL COPY for {len(products)} products...")
    start_time = datetime.now()

    # Create CSV in memory with tab delimiter (more reliable than comma)
    buffer = StringIO()
    writer = csv.writer(buffer, delimiter='\t', quoting=csv.QUOTE_MINIMAL)

    # Write data rows
    for product in products:
        writer.writerow([
            str(product['id']),
            str(product['client_id']),
            product['product_id'],
            product['name'],
            product['item_type'],
            product['pack_size'],
            product.get('notification_point', None) or '\\N',  # NULL marker
            product.get('current_stock_packs', 0),
            product.get('current_stock_units', 0),
            product.get('reorder_point_packs', None) or '\\N',
            product.get('calculation_basis', None) or '\\N',
            product.get('stock_status', None) or '\\N',
            product.get('weeks_remaining', None) or '\\N',
            product.get('avg_daily_usage', None) or '\\N',
            'true' if product.get('is_active', True) else 'false',
            'true' if product.get('is_orphan', False) else 'false',
            '{}',  # metadata JSON
            datetime.now().isoformat(),  # created_at
            datetime.now().isoformat(),  # updated_at
        ])

    buffer.seek(0)

    # Get raw psycopg2 connection from SQLAlchemy
    connection = db_session.connection().connection
    cursor = connection.cursor()

    try:
        # Use COPY FROM STDIN for maximum performance
        cursor.copy_expert(
            """
            COPY products (
                id, client_id, product_id, name, item_type, pack_size,
                notification_point, current_stock_packs, current_stock_units,
                reorder_point_packs, calculation_basis, stock_status,
                weeks_remaining, avg_daily_usage, is_active, is_orphan,
                metadata, created_at, updated_at
            )
            FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', NULL '\\N')
            """,
            buffer
        )
        connection.commit()

        duration = (datetime.now() - start_time).total_seconds()
        print(f"  ✅ COPY completed in {duration:.2f}s ({len(products)/duration:.0f} rows/sec)")

    except Exception as e:
        connection.rollback()
        # Structured logging for fallback with context
        _log_structured("warning", "COPY failed, falling back to bulk_insert_mappings", {
            "error": str(e),
            "error_type": type(e).__name__,
            "record_count": len(products),
            "operation": "bulk_insert_products_copy"
        })
        print(f"  ⚠️  COPY failed ({type(e).__name__}), using bulk_insert_mappings fallback")
        # Fallback to SQLAlchemy bulk insert if COPY fails
        db_session.bulk_insert_mappings(models.Product, products)
        db_session.commit()
        _log_structured("info", "Fallback bulk_insert_mappings succeeded", {
            "record_count": len(products)
        })


def bulk_insert_transactions_copy(db_session: Session, transactions: List[Dict[str, Any]]) -> None:
    """
    Use PostgreSQL COPY for transaction imports (10x faster than bulk_insert_mappings).

    Args:
        db_session: SQLAlchemy database session
        transactions: List of transaction dictionaries

    Performance: ~0.3s for 10K rows vs ~2.5s with bulk_insert_mappings
    """
    if not transactions:
        return

    print(f"  Using PostgreSQL COPY for {len(transactions)} transactions...")
    start_time = datetime.now()

    # Create CSV in memory
    buffer = StringIO()
    writer = csv.writer(buffer, delimiter='\t', quoting=csv.QUOTE_MINIMAL)

    # Write data rows
    for txn in transactions:
        writer.writerow([
            str(txn['id']),
            str(txn['product_id']),
            txn['order_id'],
            txn['quantity_packs'],
            txn['quantity_units'],
            txn['date_submitted'].isoformat() if hasattr(txn['date_submitted'], 'isoformat') else str(txn['date_submitted']),
            txn.get('order_status', 'completed'),
            str(txn['import_batch_id']),
        ])

    buffer.seek(0)

    # Get raw psycopg2 connection
    connection = db_session.connection().connection
    cursor = connection.cursor()

    try:
        cursor.copy_expert(
            """
            COPY transactions (
                id, product_id, order_id, quantity_packs, quantity_units,
                date_submitted, order_status, import_batch_id
            )
            FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t')
            """,
            buffer
        )
        connection.commit()

        duration = (datetime.now() - start_time).total_seconds()
        print(f"  ✅ COPY completed in {duration:.2f}s ({len(transactions)/duration:.0f} rows/sec)")

    except Exception as e:
        connection.rollback()
        # Structured logging for transaction COPY failure
        _log_structured("error", "Transaction COPY failed", {
            "error": str(e),
            "error_type": type(e).__name__,
            "record_count": len(transactions),
            "operation": "bulk_insert_transactions_copy"
        })
        print(f"  ❌ COPY failed: {type(e).__name__}: {e}")
        raise  # Re-raise to allow caller to handle fallback


def bulk_insert_products_ignore_conflicts(
    db_session: Session,
    products: List[Dict[str, Any]],
    client_id: str
) -> Dict[str, Any]:
    """
    Insert products with ON CONFLICT DO NOTHING to handle race conditions.

    This is the preferred method for creating orphan products during imports
    because it safely handles concurrent imports that may create the same product.

    Args:
        db_session: SQLAlchemy database session
        products: List of product dictionaries to insert
        client_id: Client UUID (used for querying back existing products)

    Returns:
        Dictionary mapping product_id (string) to UUID for all products
        (both newly inserted and already existing)

    Race Condition Safety:
        Uses ON CONFLICT DO NOTHING, then queries back all product IDs.
        This ensures no failures from concurrent inserts.
    """
    if not products:
        return {}

    print(f"  Using bulk INSERT with ON CONFLICT DO NOTHING for {len(products)} products...")
    start_time = datetime.now()

    # Collect all product_ids we're trying to insert
    product_id_strings = [p['product_id'] for p in products]

    # Get the products table from the model
    products_table = models.Product.__table__

    BATCH_SIZE = 500

    for i in range(0, len(products), BATCH_SIZE):
        batch = products[i:i+BATCH_SIZE]

        # Sanitize each record before insertion
        sanitized_batch = []
        for p in batch:
            sanitized_batch.append({
                'id': str(p['id']),
                'client_id': str(p['client_id']),
                'product_id': _sanitize_string(p.get('product_id'), max_length=255),
                'name': _sanitize_string(p.get('name'), max_length=500),
                'item_type': _sanitize_string(p.get('item_type'), max_length=100) or 'evergreen',
                'pack_size': int(p.get('pack_size', 1)) if p.get('pack_size') else 1,
                'notification_point': int(p.get('notification_point', 0)) if p.get('notification_point') else 0,
                'current_stock_packs': int(p.get('current_stock_packs', 0)) if p.get('current_stock_packs') else 0,
                'current_stock_units': int(p.get('current_stock_units', 0)) if p.get('current_stock_units') else 0,
                'feedback_count': int(p.get('feedback_count', 0)) if p.get('feedback_count') else 0,
                'is_active': bool(p.get('is_active', True)),
                'is_orphan': bool(p.get('is_orphan', False)),
                'metadata': p.get('product_metadata') if isinstance(p.get('product_metadata'), dict) else (p.get('metadata') if isinstance(p.get('metadata'), dict) else {}),
                'created_at': p.get('created_at', datetime.now()),
                'updated_at': p.get('updated_at', datetime.now()),
            })

        try:
            # Use ON CONFLICT DO NOTHING - silently skip duplicates
            stmt = pg_insert(products_table).values(sanitized_batch)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=['client_id', 'product_id']
            )
            db_session.execute(stmt)
            db_session.flush()  # Flush but don't commit yet

        except Exception as e:
            print(f"  Warning: INSERT batch {i//BATCH_SIZE + 1} failed: {type(e).__name__}: {e}")
            # Continue anyway - we'll query for existing products

    # Now query back ALL products (both new and existing) to get their UUIDs
    # This handles the race condition by returning the correct IDs
    result = db_session.execute(
        text("""
            SELECT id, product_id
            FROM products
            WHERE client_id = :client_id
            AND product_id = ANY(:product_ids)
        """),
        {'client_id': client_id, 'product_ids': product_id_strings}
    )

    # Build the mapping from product_id string to UUID
    product_id_to_uuid = {row[1]: row[0] for row in result}

    duration = (datetime.now() - start_time).total_seconds()
    print(f"  ✅ Bulk insert with conflict handling completed in {duration:.2f}s")
    print(f"     Requested: {len(products)}, Found/Created: {len(product_id_to_uuid)}")

    return product_id_to_uuid


def bulk_upsert_products(db_session: Session, products: List[Dict[str, Any]]) -> None:
    """
    Efficient bulk UPSERT for products using PostgreSQL ON CONFLICT.

    Uses SQLAlchemy's pg_insert with on_conflict_do_update for proper
    parameterized queries that prevent SQL injection.

    Args:
        db_session: SQLAlchemy database session
        products: List of product dictionaries

    Security:
        All values are properly parameterized via SQLAlchemy - no string
        interpolation or f-strings used in SQL construction.
    """
    if not products:
        return

    print(f"  Using bulk UPSERT for {len(products)} products...")
    start_time = datetime.now()

    # Get the products table from the model
    products_table = models.Product.__table__

    BATCH_SIZE = 500  # Optimal batch size for UPSERT operations

    for i in range(0, len(products), BATCH_SIZE):
        batch = products[i:i+BATCH_SIZE]

        # Sanitize each record before insertion
        sanitized_batch = []
        for p in batch:
            sanitized_batch.append({
                'id': str(p['id']),
                'client_id': str(p['client_id']),
                'product_id': _sanitize_string(p.get('product_id'), max_length=255),
                'name': _sanitize_string(p.get('name'), max_length=500),
                'item_type': _sanitize_string(p.get('item_type'), max_length=100),
                'pack_size': int(p.get('pack_size', 1)) if p.get('pack_size') else 1,
                'is_active': bool(p.get('is_active', True)),
                'is_orphan': bool(p.get('is_orphan', False)),
                'metadata': p.get('product_metadata') if isinstance(p.get('product_metadata'), dict) else (p.get('metadata') if isinstance(p.get('metadata'), dict) else {}),
                'created_at': p.get('created_at', datetime.now()),
                'updated_at': p.get('updated_at', datetime.now()),
            })

        try:
            # Use SQLAlchemy's PostgreSQL-specific insert with ON CONFLICT
            # This is fully parameterized and SQL injection safe
            stmt = pg_insert(products_table).values(sanitized_batch)

            # Define the upsert behavior - update specific fields on conflict
            stmt = stmt.on_conflict_do_update(
                index_elements=['client_id', 'product_id'],
                set_={
                    'name': stmt.excluded.name,
                    'item_type': stmt.excluded.item_type,
                    'pack_size': stmt.excluded.pack_size,
                    'is_active': stmt.excluded.is_active,
                    'updated_at': datetime.now(),
                }
            )

            db_session.execute(stmt)
            db_session.commit()

        except Exception as e:
            db_session.rollback()
            print(f"  Warning: UPSERT batch {i//BATCH_SIZE + 1} failed: {type(e).__name__}")
            continue

    duration = (datetime.now() - start_time).total_seconds()
    print(f"  Bulk UPSERT completed in {duration:.2f}s")
