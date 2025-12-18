import os
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from typing import Generator

# Module-level variables (initially None - lazy initialization)
engine = None
SessionLocal = None
_initialized = False

Base = declarative_base()


def initialize_database(database_url: str) -> bool:
    """
    Initialize database connection with explicit DATABASE_URL.

    Args:
        database_url: PostgreSQL connection string

    Returns:
        True if initialization successful

    Raises:
        ValueError: If database_url is invalid
        Exception: If connection fails
    """
    global engine, SessionLocal, _initialized

    # Validation
    if not database_url:
        raise ValueError("DATABASE_URL is required but was not provided")

    if not database_url.startswith('postgresql://'):
        raise ValueError(
            f"Invalid DATABASE_URL format. Expected postgresql:// "
            f"but got: {database_url[:20]}..."
        )

    # Create engine with connection pooling and timeouts
    try:
        engine = create_engine(
            database_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            connect_args={
                "connect_timeout": 10,
                "options": "-c timezone=utc"
            }
        )

        # Test connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        # Create sessionmaker
        SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=engine
        )
        _initialized = True

        print("[database.py] Successfully connected to database")
        return True

    except Exception as e:
        raise Exception(f"Failed to connect to database: {str(e)}")


def is_initialized() -> bool:
    """Check if database has been initialized."""
    return _initialized


def get_db() -> Generator:
    """
    Get database session. Requires initialize_database() first.

    Yields:
        Session object

    Raises:
        RuntimeError: If database not initialized
    """
    if not _initialized or SessionLocal is None:
        raise RuntimeError(
            "Database not initialized. "
            "Call initialize_database(database_url) first."
        )

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
