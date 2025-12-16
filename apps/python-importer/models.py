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

    # Primary key and foreign keys use PostgreSQL native UUID type
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clientId = Column("client_id", PG_UUID(as_uuid=True), index=True)

    # Business identifiers stay as String
    productId = Column("product_id", String, index=True)  # Business ID from CSV
    name = Column(String)
    itemType = Column("item_type", String)
    packSize = Column("pack_size", Integer, default=1)
    notificationPoint = Column("notification_point", Integer, nullable=True)
    currentStockPacks = Column("current_stock_packs", Integer, default=0)
    currentStockUnits = Column("current_stock_units", Integer, default=0)
    reorderPointPacks = Column("reorder_point_packs", Integer, nullable=True)
    calculationBasis = Column("calculation_basis", String, nullable=True)
    stockStatus = Column("stock_status", String, nullable=True)
    weeksRemaining = Column("weeks_remaining", Integer, nullable=True)
    avgDailyUsage = Column("avg_daily_usage", Float, nullable=True)
    isActive = Column("is_active", Boolean, default=True)
    isOrphan = Column("is_orphan", Boolean, default=False)
    metadata = Column(JSON, default={})
    createdAt = Column("created_at", DateTime, server_default=text('now()'))
    updatedAt = Column("updated_at", DateTime, onupdate=text('now()'))
    monthlyUsageUnits = Column("monthly_usage_units", Float, nullable=True)
    monthlyUsagePacks = Column("monthly_usage_packs", Float, nullable=True)
    usageDataMonths = Column("usage_data_months", Integer, nullable=True)
    usageCalculationTier = Column("usage_calculation_tier", String, nullable=True)
    usageConfidence = Column("usage_confidence", String, nullable=True)
    usageLastCalculated = Column("usage_last_calculated", DateTime, nullable=True)
    avgQualityRating = Column("avg_quality_rating", Float, nullable=True)
    avgDeliveryRating = Column("avg_delivery_rating", Float, nullable=True)
    feedbackCount = Column("feedback_count", Integer, default=0)
    popularityScore = Column("popularity_score", Float, nullable=True)


class Transaction(Base):
    __tablename__ = "transactions"

    # Primary key uses PostgreSQL native UUID type
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign key to Product.id - must be UUID to match
    productId = Column("product_id", PG_UUID(as_uuid=True), index=True)

    # Business identifiers stay as String
    orderId = Column("order_id", String, index=True)
    quantityPacks = Column("quantity_packs", Integer)
    quantityUnits = Column("quantity_units", Integer)
    dateSubmitted = Column("date_submitted", DateTime)
    orderStatus = Column("order_status", String, default="completed")
    shipToLocation = Column("ship_to_location", String, nullable=True)
    shipToCompany = Column("ship_to_company", String, nullable=True)

    # Foreign key to ImportBatch.id - must be UUID
    importBatchId = Column("import_batch_id", PG_UUID(as_uuid=True), nullable=True)
    createdAt = Column("created_at", DateTime, server_default=text('now()'))


class ImportBatch(Base):
    __tablename__ = "import_batches"

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
    errors = Column(JSON, default=[])
    startedAt = Column("started_at", DateTime, nullable=True)
    completedAt = Column("completed_at", DateTime, nullable=True)
    createdAt = Column("created_at", DateTime, server_default=text('now()'))
    sourceHeaders = Column("source_headers", JSON, nullable=True)
    mappedHeaders = Column("mapped_headers", JSON, nullable=True)
    customHeaders = Column("custom_headers", JSON, nullable=True)
