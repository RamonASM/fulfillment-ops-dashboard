import os
import time
from contextlib import contextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError
from typing import Generator, Literal

# Module-level variables (initially None - lazy initialization)
engine = None
SessionLocal = None
_initialized = False

# Retry configuration
MAX_RETRIES = 5
INITIAL_RETRY_DELAY = 1.0  # seconds
MAX_RETRY_DELAY = 30.0  # seconds

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

    # Create engine with connection pooling, timeouts, and isolation level
    # Using READ COMMITTED isolation level (PostgreSQL default) which:
    # - Prevents dirty reads (reading uncommitted data from other transactions)
    # - Allows non-repeatable reads (acceptable for our import use case)
    # - Provides good concurrency for parallel imports
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        isolation_level="READ COMMITTED",
        connect_args={
            "connect_timeout": 10,
            "options": "-c timezone=utc"
        }
    )

    # Test connection with exponential backoff retry
    # This handles transient database unavailability during startup
    last_error = None
    retry_delay = INITIAL_RETRY_DELAY

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))

            # Connection successful - create sessionmaker
            SessionLocal = sessionmaker(
                autocommit=False,
                autoflush=False,
                bind=engine
            )
            _initialized = True

            if attempt > 1:
                print(f"[database.py] Successfully connected to database after {attempt} attempts")
            else:
                print("[database.py] Successfully connected to database")
            return True

        except OperationalError as e:
            last_error = e
            if attempt < MAX_RETRIES:
                print(f"[database.py] Connection attempt {attempt}/{MAX_RETRIES} failed: {e}")
                print(f"[database.py] Retrying in {retry_delay:.1f} seconds...")
                time.sleep(retry_delay)
                # Exponential backoff with jitter
                retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)
            else:
                print(f"[database.py] All {MAX_RETRIES} connection attempts failed")
        except Exception as e:
            # Non-retryable error (e.g., invalid credentials)
            raise Exception(f"Failed to connect to database: {str(e)}")

    # All retries exhausted
    raise Exception(
        f"Failed to connect to database after {MAX_RETRIES} attempts. "
        f"Last error: {str(last_error)}"
    )


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


@contextmanager
def get_db_session():
    """
    Context manager for database session with guaranteed cleanup.

    Unlike get_db() generator, this ensures db.close() is called
    even if sys.exit() is called within the context block.

    Usage:
        with get_db_session() as db:
            # use db
            sys.exit(0)  # finally block still executes
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
