from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, JSON, Index, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
import uuid
import os
import sys

# Add the package directory to path for direct script execution
_package_dir = os.path.dirname(os.path.abspath(__file__))
if _package_dir not in sys.path:
    sys.path.insert(0, _package_dir)

from database import Base


class Client(Base):
    """Client model for validation - read-only reference to clients table."""
    __tablename__ = "clients"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String)
    code = Column(String, unique=True)
    isActive = Column("is_active", Boolean, default=True)
    createdAt = Column("created_at", DateTime, server_default=text('now()'))
    updatedAt = Column("updated_at", DateTime, onupdate=text('now()'))


class Product(Base):
    __tablename__ = "products"

    # IMPORTANT: Attribute names MUST match database column names for bulk_insert_mappings
    # SQLAlchemy's bulk_insert_mappings() looks up by Python attribute name, NOT column name.

    # Primary key and foreign keys use PostgreSQL native UUID type
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(PG_UUID(as_uuid=True), index=True)

    # Business identifiers stay as String
    product_id = Column(String, index=True)  # Business ID from CSV
    name = Column(String)
    item_type = Column(String)
    pack_size = Column(Integer, default=1)
    notification_point = Column(Integer, nullable=True)
    current_stock_packs = Column(Integer, default=0)
    current_stock_units = Column(Integer, default=0)
    reorder_point_packs = Column(Integer, nullable=True)
    calculation_basis = Column(String, nullable=True)
    stock_status = Column(String, nullable=True)
    weeks_remaining = Column(Integer, nullable=True)
    avg_daily_usage = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True)
    is_orphan = Column(Boolean, default=False)
    product_metadata = Column("metadata", JSON, default=dict)  # 'metadata' is reserved in SQLAlchemy
    created_at = Column(DateTime, server_default=text('now()'))
    updated_at = Column(DateTime, onupdate=text('now()'))
    monthly_usage_units = Column(Float, nullable=True)
    monthly_usage_packs = Column(Float, nullable=True)
    usage_data_months = Column(Integer, nullable=True)
    usage_calculation_tier = Column(String, nullable=True)
    usage_confidence = Column(String, nullable=True)
    usage_last_calculated = Column(DateTime, nullable=True)
    avg_quality_rating = Column(Float, nullable=True)
    avg_delivery_rating = Column(Float, nullable=True)
    feedback_count = Column(Integer, default=0)
    popularity_score = Column(Float, nullable=True)


class Transaction(Base):
    __tablename__ = "transactions"

    # IMPORTANT: Attribute names MUST match database column names for bulk_insert_mappings

    # Primary key uses PostgreSQL native UUID type
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign key to Product.id - must be UUID to match
    product_id = Column(PG_UUID(as_uuid=True), index=True)

    # Business identifiers stay as String
    order_id = Column(String, index=True)
    quantity_packs = Column(Integer)
    quantity_units = Column(Integer)
    date_submitted = Column(DateTime)
    order_status = Column(String, default="completed")
    ship_to_location = Column(String, nullable=True)
    ship_to_company = Column(String, nullable=True)

    # Foreign key to ImportBatch.id - must be UUID
    import_batch_id = Column(PG_UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime, server_default=text('now()'))


class ImportBatch(Base):
    __tablename__ = "import_batches"

    # IMPORTANT: Attribute names MUST match database column names for bulk operations
    # However, ImportBatch is only read/updated individually, not bulk inserted.
    # Using camelCase to match existing Node.js Prisma schema for compatibility.

    # Primary key and foreign keys use PostgreSQL native UUID type
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clientId = Column("client_id", PG_UUID(as_uuid=True), index=True)
    importedBy = Column("imported_by", PG_UUID(as_uuid=True), nullable=True)

    # Other fields
    importType = Column("import_type", String)
    filename = Column(String, nullable=True)
    filePath = Column("file_path", String, nullable=True)
    fileChecksum = Column("file_checksum", String, nullable=True)
    status = Column(String, default="pending")
    rowCount = Column("row_count", Integer, nullable=True)
    processedCount = Column("processed_count", Integer, default=0)
    errorCount = Column("error_count", Integer, default=0)
    errors = Column(JSON, default=list)
    startedAt = Column("started_at", DateTime, nullable=True)
    completedAt = Column("completed_at", DateTime, nullable=True)
    createdAt = Column("created_at", DateTime, server_default=text('now()'))
    sourceHeaders = Column("source_headers", JSON, nullable=True)
    mappedHeaders = Column("mapped_headers", JSON, nullable=True)
    customHeaders = Column("custom_headers", JSON, nullable=True)
