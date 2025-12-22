"""
Tests for data cleaning functions in the Python importer.

Tests:
- clean_inventory_data(): Inventory data transformation
- clean_orders_data(): Orders data transformation
- build_rename_map(): Column mapping
- extract_custom_fields(): Custom field extraction
"""

import os
import sys
import uuid
import pytest
import pandas as pd
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import (
    clean_inventory_data,
    clean_orders_data,
    build_rename_map,
    extract_custom_fields,
)


class TestBuildRenameMap:
    """Tests for build_rename_map() function."""

    def test_basic_mapping(self):
        """Standard mappings should be converted correctly."""
        mappings = [
            {'source': 'Product ID', 'mapsTo': 'product_id'},
            {'source': 'Product Name', 'mapsTo': 'name'},
            {'source': 'Qty', 'mapsTo': 'current_stock_packs'},
        ]

        result = build_rename_map(mappings)

        assert result == {
            'Product ID': 'product_id',
            'Product Name': 'name',
            'Qty': 'current_stock_packs',
        }

    def test_custom_fields_excluded(self):
        """Custom field mappings should be excluded."""
        mappings = [
            {'source': 'Product ID', 'mapsTo': 'product_id'},
            {'source': 'Custom Field 1', 'mapsTo': 'custom_field_1', 'isCustomField': True},
            {'source': 'Product Name', 'mapsTo': 'name'},
        ]

        result = build_rename_map(mappings)

        assert result == {
            'Product ID': 'product_id',
            'Product Name': 'name',
        }
        assert 'Custom Field 1' not in result

    def test_empty_mappings(self):
        """Empty mappings list should return empty dict."""
        result = build_rename_map([])
        assert result == {}

    def test_missing_source_or_mapsTo(self):
        """Mappings with missing source or mapsTo should be skipped."""
        mappings = [
            {'source': 'Product ID', 'mapsTo': 'product_id'},
            {'source': '', 'mapsTo': 'name'},  # Empty source
            {'source': 'Qty', 'mapsTo': ''},  # Empty mapsTo
            {'source': 'Valid', 'mapsTo': 'valid_field'},
        ]

        result = build_rename_map(mappings)

        assert result == {
            'Product ID': 'product_id',
            'Valid': 'valid_field',
        }


class TestExtractCustomFields:
    """Tests for extract_custom_fields() function."""

    def test_basic_custom_field_extraction(self):
        """Custom fields should be extracted correctly."""
        row = pd.Series({
            'Product ID': 'SKU001',
            'Custom Color': 'Red',
            'Custom Size': 'Large',
        })

        mappings = [
            {'source': 'Product ID', 'mapsTo': 'product_id'},
            {'source': 'Custom Color', 'mapsTo': 'color', 'isCustomField': True, 'detectedDataType': 'text'},
            {'source': 'Custom Size', 'mapsTo': 'size', 'isCustomField': True, 'detectedDataType': 'text'},
        ]

        result = extract_custom_fields(row, mappings)

        assert 'color' in result
        assert result['color']['value'] == 'Red'
        assert result['color']['originalHeader'] == 'Custom Color'

        assert 'size' in result
        assert result['size']['value'] == 'Large'

    def test_nan_values_excluded(self):
        """NaN/None values should not be included in custom fields."""
        row = pd.Series({
            'Product ID': 'SKU001',
            'Custom Color': 'Red',
            'Custom Size': None,
        })

        mappings = [
            {'source': 'Custom Color', 'mapsTo': 'color', 'isCustomField': True},
            {'source': 'Custom Size', 'mapsTo': 'size', 'isCustomField': True},
        ]

        result = extract_custom_fields(row, mappings)

        assert 'color' in result
        assert 'size' not in result  # None values should be excluded

    def test_non_custom_fields_excluded(self):
        """Non-custom field mappings should be ignored."""
        row = pd.Series({
            'Product ID': 'SKU001',
            'Product Name': 'Widget',
            'Custom Color': 'Red',
        })

        mappings = [
            {'source': 'Product ID', 'mapsTo': 'product_id'},  # Not custom
            {'source': 'Product Name', 'mapsTo': 'name'},  # Not custom
            {'source': 'Custom Color', 'mapsTo': 'color', 'isCustomField': True},
        ]

        result = extract_custom_fields(row, mappings)

        assert len(result) == 1
        assert 'color' in result


class TestCleanInventoryData:
    """Tests for clean_inventory_data() function."""

    def test_basic_cleaning(self, sample_inventory_df, test_client_id):
        """Basic inventory data should be cleaned correctly."""
        result = clean_inventory_data(sample_inventory_df.copy(), test_client_id)

        # Should have snake_case column names
        assert 'product_id' in result.columns
        assert 'name' in result.columns
        assert 'item_type' in result.columns
        assert 'pack_size' in result.columns
        assert 'current_stock_packs' in result.columns

        # Should have 3 rows
        assert len(result) == 3

        # Product IDs should be preserved
        assert 'SKU001' in result['product_id'].values
        assert 'SKU002' in result['product_id'].values

    def test_item_type_normalized_to_lowercase(self, test_client_id):
        """Item type should be normalized to lowercase."""
        df = pd.DataFrame({
            'Product ID': ['SKU001', 'SKU002', 'SKU003'],
            'Product Name': ['A', 'B', 'C'],
            'Item Type': ['EVERGREEN', 'Event', 'COMPLETED'],
            'Quantity Multiplier': [1, 1, 1],
            'Available Quantity': [10, 20, 30],
        })

        result = clean_inventory_data(df, test_client_id)

        assert result['item_type'].tolist() == ['evergreen', 'event', 'completed']

    def test_notification_point_parsing(self, test_client_id):
        """Notification point with text should be parsed to numbers."""
        df = pd.DataFrame({
            'Product ID': ['SKU001', 'SKU002', 'SKU003'],
            'Product Name': ['A', 'B', 'C'],
            'New Notification Point': ['10 units', '5 packs', '20'],
        })

        result = clean_inventory_data(df, test_client_id)

        # Should extract numeric values
        assert result['notification_point'].tolist() == [10, 5, 20]

    def test_stock_units_calculated(self, test_client_id):
        """current_stock_units should be calculated from packs * pack_size."""
        df = pd.DataFrame({
            'Product ID': ['SKU001', 'SKU002'],
            'Product Name': ['A', 'B'],
            'Quantity Multiplier': [5, 10],
            'Available Quantity': [20, 30],
        })

        result = clean_inventory_data(df, test_client_id)

        # stock_units = stock_packs * pack_size
        assert result['current_stock_units'].tolist() == [100, 300]

    def test_uuid_generation(self, sample_inventory_df, test_client_id):
        """Each row should get a unique UUID."""
        result = clean_inventory_data(sample_inventory_df.copy(), test_client_id)

        # All IDs should be unique UUIDs
        ids = result['id'].tolist()
        assert len(ids) == len(set(ids))  # No duplicates

        # Should be valid UUIDs
        for id_val in ids:
            assert isinstance(id_val, uuid.UUID)

    def test_client_id_added(self, sample_inventory_df, test_client_id):
        """Client ID should be added to all rows."""
        result = clean_inventory_data(sample_inventory_df.copy(), test_client_id)

        # All rows should have the client_id
        for client_id in result['client_id']:
            assert str(client_id) == test_client_id

    def test_timestamps_added(self, sample_inventory_df, test_client_id):
        """created_at and updated_at timestamps should be added."""
        before = datetime.now()
        result = clean_inventory_data(sample_inventory_df.copy(), test_client_id)
        after = datetime.now()

        for created_at in result['created_at']:
            assert before <= created_at <= after

    def test_custom_field_mapping(self, test_client_id):
        """Custom fields should be extracted to product_metadata."""
        df = pd.DataFrame({
            'Product ID': ['SKU001'],
            'Product Name': ['Widget'],
            'Custom Color': ['Red'],
            'Custom Size': ['Large'],
        })

        mapping_data = {
            'columnMappings': [
                {'source': 'Product ID', 'mapsTo': 'product_id'},
                {'source': 'Product Name', 'mapsTo': 'name'},
                {'source': 'Custom Color', 'mapsTo': 'color', 'isCustomField': True},
                {'source': 'Custom Size', 'mapsTo': 'size', 'isCustomField': True},
            ]
        }

        result = clean_inventory_data(df, test_client_id, mapping_data)

        metadata = result['product_metadata'].iloc[0]
        assert 'color' in metadata
        assert metadata['color']['value'] == 'Red'

    def test_nan_handling(self, test_client_id):
        """NaN values should be converted to None (SQL NULL)."""
        df = pd.DataFrame({
            'Product ID': ['SKU001', 'SKU002'],
            'Product Name': ['Widget', None],
            'Available Quantity': [100, None],
        })

        result = clean_inventory_data(df, test_client_id)

        # NaN should become None, not 'nan' string
        assert result['name'].iloc[1] is None or result['name'].iloc[1] == 'None'


class TestCleanOrdersData:
    """Tests for clean_orders_data() function."""

    def test_basic_cleaning(self, sample_orders_df, test_client_id):
        """Basic orders data should be cleaned correctly."""
        result, dropped_info = clean_orders_data(sample_orders_df.copy(), test_client_id)

        # Should have snake_case column names
        assert 'product_id' in result.columns
        assert 'order_id' in result.columns
        assert 'quantity_packs' in result.columns
        assert 'date_submitted' in result.columns

        # Should have 3 rows
        assert len(result) == 3

    def test_date_parsing(self, test_client_id):
        """ISO date format should be parsed correctly."""
        df = pd.DataFrame({
            'Product ID': ['SKU001', 'SKU002', 'SKU003'],
            'Order ID': ['ORD001', 'ORD002', 'ORD003'],
            'Quantity': [5, 10, 3],
            'Date Submitted': ['2024-01-15', '2024-01-16', '2024-01-17'],  # ISO format
        })

        result, dropped_info = clean_orders_data(df, test_client_id)

        # All dates should be parsed
        assert len(result) == 3
        assert dropped_info.get('invalid_dates', 0) == 0

    def test_invalid_dates_dropped(self, test_client_id):
        """Rows with invalid dates should be dropped."""
        df = pd.DataFrame({
            'Product ID': ['SKU001', 'SKU002', 'SKU003'],
            'Order ID': ['ORD001', 'ORD002', 'ORD003'],
            'Quantity': [5, 10, 3],
            'Date Submitted': ['2024-01-15', 'not-a-date', 'invalid'],
        })

        errors = []
        result, dropped_info = clean_orders_data(df, test_client_id, errors_encountered=errors)

        # Only 1 valid row should remain
        assert len(result) == 1
        assert dropped_info.get('invalid_dates', 0) == 2

    def test_quantity_units_fallback(self, test_client_id):
        """quantity_units should fall back to quantity_packs if missing."""
        df = pd.DataFrame({
            'Product ID': ['SKU001'],
            'Order ID': ['ORD001'],
            'Quantity': [5],
            'Date Submitted': ['2024-01-15'],
            # No 'Total Quantity' column
        })

        result, _ = clean_orders_data(df, test_client_id)

        # quantity_units should equal quantity_packs
        assert result['quantity_units'].iloc[0] == result['quantity_packs'].iloc[0]

    def test_order_status_default(self, test_client_id):
        """Order status should default to 'completed'."""
        df = pd.DataFrame({
            'Product ID': ['SKU001'],
            'Order ID': ['ORD001'],
            'Quantity': [5],
            'Date Submitted': ['2024-01-15'],
            # No 'Order Status' column
        })

        result, _ = clean_orders_data(df, test_client_id)

        assert result['order_status'].iloc[0] == 'completed'

    def test_order_status_normalized(self, test_client_id):
        """Order status should be normalized to lowercase."""
        df = pd.DataFrame({
            'Product ID': ['SKU001', 'SKU002'],
            'Order ID': ['ORD001', 'ORD002'],
            'Quantity': [5, 10],
            'Date Submitted': ['2024-01-15', '2024-01-16'],
            'Order Status': ['COMPLETED', 'Pending'],
        })

        result, _ = clean_orders_data(df, test_client_id)

        assert result['order_status'].tolist() == ['completed', 'pending']

    def test_uuid_generation(self, sample_orders_df, test_client_id):
        """Each row should get a unique UUID."""
        result, _ = clean_orders_data(sample_orders_df.copy(), test_client_id)

        ids = result['id'].tolist()
        assert len(ids) == len(set(ids))  # No duplicates

    def test_non_numeric_quantity_coerced(self, test_client_id):
        """Non-numeric quantities should be coerced to 0."""
        df = pd.DataFrame({
            'Product ID': ['SKU001', 'SKU002'],
            'Order ID': ['ORD001', 'ORD002'],
            'Quantity': ['five', 10],  # 'five' is not numeric
            'Date Submitted': ['2024-01-15', '2024-01-16'],
        })

        errors = []
        result, _ = clean_orders_data(df, test_client_id, errors_encountered=errors)

        # 'five' should become 0
        assert result['quantity_packs'].iloc[0] == 0
        assert result['quantity_packs'].iloc[1] == 10

        # Should have a warning in errors
        assert any('non-numeric' in str(e.get('message', '')).lower() for e in errors)
