"""
Database connection and SQLAlchemy models for DS Analytics service
"""
from sqlalchemy import create_engine, Column, String, Integer, Float, Boolean, DateTime, JSON, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/inventory_db")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# SQLAlchemy Models (matching Prisma schema)

class Product(Base):
    __tablename__ = "products"

    id = Column(String, primary_key=True)
    client_id = Column(String, nullable=False, index=True)
    product_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    pack_size = Column(Integer, default=1)
    current_stock_packs = Column(Integer, default=0)
    current_stock_units = Column(Integer, default=0)
    notification_point = Column(Integer)
    item_type = Column(String)  # 'evergreen' | 'event' | 'completed'
    is_active = Column(Boolean, default=True)

    # Usage metrics (to be populated by DS service)
    monthly_usage_units = Column(Float)
    monthly_usage_packs = Column(Float)
    usage_data_months = Column(Integer)
    usage_calculation_tier = Column(String)  # '12_month' | '6_month' | '3_month' | 'weekly'
    usage_confidence = Column(String)  # 'high' | 'medium' | 'low'
    usage_last_calculated = Column(DateTime)
    usage_calculation_method = Column(String)

    # Intelligence fields
    usage_trend = Column(String)  # 'increasing' | 'stable' | 'decreasing'
    seasonality_detected = Column(Boolean, default=False)
    weeks_remaining = Column(Float)
    stock_status = Column(String)  # 'critical' | 'low' | 'watch' | 'healthy'
    projected_stockout_date = Column(DateTime)
    stockout_confidence = Column(Float)
    suggested_reorder_qty = Column(Integer)
    reorder_qty_last_updated = Column(DateTime)

    created_at = Column(DateTime)
    updated_at = Column(DateTime)

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True)
    product_id = Column(String, nullable=False, index=True)
    client_id = Column(String, nullable=False, index=True)
    date_submitted = Column(DateTime, index=True)
    quantity_units = Column(Integer)
    quantity_packs = Column(Float)
    order_status = Column(String)
    ship_to_location = Column(String)
    created_at = Column(DateTime)

class StockHistory(Base):
    __tablename__ = "stock_history"

    id = Column(String, primary_key=True)
    product_id = Column(String, nullable=False, index=True)
    recorded_at = Column(DateTime, nullable=False, index=True)
    packs_available = Column(Integer)
    total_units = Column(Integer)
    source = Column(String)  # 'import' | 'scheduled_snapshot' | 'manual'
    notes = Column(Text)
    created_at = Column(DateTime)

class MonthlyUsageSnapshot(Base):
    __tablename__ = "monthly_usage_snapshots"

    id = Column(String, primary_key=True)
    product_id = Column(String, nullable=False, index=True)
    year_month = Column(String, nullable=False, index=True)  # '2024-12'
    consumed_units = Column(Integer, default=0)
    consumed_packs = Column(Float, default=0)
    transaction_count = Column(Integer, default=0)
    order_count = Column(Integer, default=0)
    calculation_method = Column(String)
    confidence = Column(Float)
    is_outlier = Column(Boolean, default=False)
    created_at = Column(DateTime)

class Client(Base):
    __tablename__ = "clients"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    code = Column(String)
    is_active = Column(Boolean, default=True)

class ClientConfiguration(Base):
    __tablename__ = "client_configurations"

    id = Column(String, primary_key=True)
    client_id = Column(String, unique=True, index=True)
    reorder_lead_days = Column(Integer, default=14)
    safety_stock_weeks = Column(Integer, default=2)
    critical_weeks = Column(Integer, default=2)
    low_weeks = Column(Integer, default=4)
    watch_weeks = Column(Integer, default=8)

# Dependency for FastAPI
def get_db() -> Generator[Session, None, None]:
    """
    Database session dependency for FastAPI endpoints
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
