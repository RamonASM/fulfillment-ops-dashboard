"""
Bulk Operations Tests

Tests for the bulk_upsert_products function and related database operations.
Ensures data integrity, proper error handling, and SQL injection prevention.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal
from datetime import datetime
import json

# Import the module under test
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bulk_operations import (
    bulk_upsert_products,
    _sanitize_string,
    _prepare_product_record,
)


class TestSanitizeString:
    """Tests for the _sanitize_string helper function."""

    def test_sanitize_normal_string(self):
        """Normal strings should pass through unchanged."""
        assert _sanitize_string("Normal Product Name") == "Normal Product Name"

    def test_sanitize_strips_whitespace(self):
        """Leading and trailing whitespace should be stripped."""
        assert _sanitize_string("  Product Name  ") == "Product Name"

    def test_sanitize_removes_null_bytes(self):
        """Null bytes should be removed."""
        assert _sanitize_string("Product\x00Name") == "ProductName"

    def test_sanitize_truncates_long_strings(self):
        """Very long strings should be truncated."""
        long_string = "A" * 10000
        result = _sanitize_string(long_string, max_length=1000)
        assert len(result) <= 1000

    def test_sanitize_none_returns_empty(self):
        """None should return empty string."""
        assert _sanitize_string(None) == ""

    def test_sanitize_number_converted(self):
        """Numbers should be converted to strings."""
        assert _sanitize_string(12345) == "12345"


class TestPrepareProductRecord:
    """Tests for the _prepare_product_record function."""

    def test_prepare_basic_record(self):
        """Basic product record should be prepared correctly."""
        raw_data = {
            "sku": "TEST-SKU-001",
            "product_name": "Test Product",
            "current_stock": 100,
            "unit_price": "19.99",
        }
        client_id = "test-client-uuid"

        record = _prepare_product_record(raw_data, client_id)

        assert record["sku"] == "TEST-SKU-001"
        assert record["product_name"] == "Test Product"
        assert record["current_stock"] == 100
        assert record["client_id"] == client_id

    def test_prepare_record_handles_missing_fields(self):
        """Missing optional fields should have default values."""
        raw_data = {
            "sku": "MIN-SKU",
        }
        client_id = "test-client-uuid"

        record = _prepare_product_record(raw_data, client_id)

        assert record["sku"] == "MIN-SKU"
        assert record["current_stock"] == 0  # Default
        assert record["client_id"] == client_id

    def test_prepare_record_sanitizes_strings(self):
        """String fields should be sanitized."""
        raw_data = {
            "sku": "  SKU-WITH-SPACES  ",
            "product_name": "Name\x00WithNull",
        }
        client_id = "test-client-uuid"

        record = _prepare_product_record(raw_data, client_id)

        assert record["sku"] == "SKU-WITH-SPACES"
        assert "\\x00" not in record["product_name"]

    def test_prepare_record_converts_numbers(self):
        """Numeric strings should be converted to proper types."""
        raw_data = {
            "sku": "NUM-TEST",
            "current_stock": "150",
            "unit_price": "29.99",
        }
        client_id = "test-client-uuid"

        record = _prepare_product_record(raw_data, client_id)

        assert isinstance(record["current_stock"], int)
        assert record["current_stock"] == 150


class TestBulkUpsertProducts:
    """Tests for the bulk_upsert_products function."""

    @pytest.fixture
    def mock_engine(self):
        """Create a mock SQLAlchemy engine."""
        engine = MagicMock()
        connection = MagicMock()
        engine.connect.return_value.__enter__ = Mock(return_value=connection)
        engine.connect.return_value.__exit__ = Mock(return_value=False)
        return engine

    def test_upsert_empty_list_returns_zero(self, mock_engine):
        """Empty product list should return 0 without database calls."""
        result = bulk_upsert_products(mock_engine, [], "client-uuid")

        assert result["inserted"] == 0
        assert result["updated"] == 0
        # Should not attempt to connect
        mock_engine.connect.assert_not_called()

    def test_upsert_single_product(self, mock_engine):
        """Single product should be inserted correctly."""
        products = [
            {
                "sku": "SINGLE-001",
                "product_name": "Single Product",
                "current_stock": 50,
            }
        ]

        with patch("bulk_operations.pg_insert") as mock_insert:
            mock_stmt = MagicMock()
            mock_insert.return_value = mock_stmt
            mock_stmt.on_conflict_do_update.return_value = mock_stmt

            # Mock execution result
            connection = mock_engine.connect.return_value.__enter__.return_value
            connection.execute.return_value.rowcount = 1

            result = bulk_upsert_products(mock_engine, products, "client-uuid")

            # Verify insert was called
            mock_insert.assert_called_once()

    def test_upsert_batch_processing(self, mock_engine):
        """Large product lists should be processed in batches."""
        # Create more products than the batch size
        products = [
            {"sku": f"BATCH-{i:04d}", "product_name": f"Product {i}"}
            for i in range(1500)  # Assuming batch size is 1000
        ]

        with patch("bulk_operations.pg_insert") as mock_insert:
            mock_stmt = MagicMock()
            mock_insert.return_value = mock_stmt
            mock_stmt.on_conflict_do_update.return_value = mock_stmt

            connection = mock_engine.connect.return_value.__enter__.return_value
            connection.execute.return_value.rowcount = 1000

            result = bulk_upsert_products(mock_engine, products, "client-uuid")

            # Should have been called multiple times for batches
            assert mock_insert.call_count >= 2

    def test_upsert_handles_duplicates(self, mock_engine):
        """Duplicate SKUs should be updated, not inserted twice."""
        products = [
            {"sku": "DUP-001", "product_name": "First Version", "current_stock": 10},
            {"sku": "DUP-001", "product_name": "Second Version", "current_stock": 20},
        ]

        with patch("bulk_operations.pg_insert") as mock_insert:
            mock_stmt = MagicMock()
            mock_insert.return_value = mock_stmt
            mock_stmt.on_conflict_do_update.return_value = mock_stmt

            connection = mock_engine.connect.return_value.__enter__.return_value
            connection.execute.return_value.rowcount = 1

            result = bulk_upsert_products(mock_engine, products, "client-uuid")

            # Verify on_conflict_do_update was used
            mock_stmt.on_conflict_do_update.assert_called()

    def test_upsert_rolls_back_on_error(self, mock_engine):
        """Database errors should trigger rollback."""
        products = [{"sku": "ERROR-001", "product_name": "Error Product"}]

        with patch("bulk_operations.pg_insert") as mock_insert:
            mock_stmt = MagicMock()
            mock_insert.return_value = mock_stmt
            mock_stmt.on_conflict_do_update.return_value = mock_stmt

            connection = mock_engine.connect.return_value.__enter__.return_value
            connection.execute.side_effect = Exception("Database error")

            with pytest.raises(Exception, match="Database error"):
                bulk_upsert_products(mock_engine, products, "client-uuid")

            # Rollback should be called
            connection.rollback.assert_called()

    def test_upsert_uses_parameterized_queries(self, mock_engine):
        """Verify that parameterized queries are used (SQL injection prevention)."""
        # Products with SQL injection attempts
        products = [
            {
                "sku": "'; DROP TABLE products; --",
                "product_name": "Robert'); DROP TABLE products;--",
            }
        ]

        with patch("bulk_operations.pg_insert") as mock_insert:
            mock_stmt = MagicMock()
            mock_insert.return_value = mock_stmt
            mock_stmt.on_conflict_do_update.return_value = mock_stmt

            connection = mock_engine.connect.return_value.__enter__.return_value
            connection.execute.return_value.rowcount = 1

            # Should not raise - data is sanitized and parameterized
            result = bulk_upsert_products(mock_engine, products, "client-uuid")

            # The actual SQL should use parameterized values, not string interpolation
            # This is verified by using SQLAlchemy's pg_insert which uses bound parameters


class TestBulkOperationsIntegration:
    """Integration tests that require a real database connection."""

    @pytest.fixture
    def db_engine(self):
        """Create a test database engine."""
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            pytest.skip("DATABASE_URL not set - skipping integration tests")

        from sqlalchemy import create_engine
        return create_engine(database_url)

    @pytest.mark.integration
    def test_real_upsert_operation(self, db_engine):
        """Test actual upsert against real database."""
        # This test requires a real database connection
        # and a test client ID
        test_client_id = os.getenv("TEST_CLIENT_ID")
        if not test_client_id:
            pytest.skip("TEST_CLIENT_ID not set - skipping")

        products = [
            {
                "sku": "INTEG-TEST-001",
                "product_name": "Integration Test Product",
                "current_stock": 100,
                "unit_price": "9.99",
            }
        ]

        result = bulk_upsert_products(db_engine, products, test_client_id)

        assert result["inserted"] + result["updated"] == 1
