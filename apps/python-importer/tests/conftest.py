"""
Shared fixtures for Python importer tests.
"""

import os
import sys
import tempfile
import pytest
import pandas as pd

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def temp_dir():
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def sample_csv_path(temp_dir):
    """Create a sample CSV file for testing."""
    csv_path = os.path.join(temp_dir, "test_inventory.csv")
    df = pd.DataFrame({
        'Product ID': ['SKU001', 'SKU002', 'SKU003'],
        'Product Name': ['Widget A', 'Widget B', 'Widget C'],
        'Item Type': ['Evergreen', 'Event', 'Evergreen'],
        'Quantity Multiplier': [1, 10, 5],
        'Available Quantity': [100, 50, 200],
        'New Notification Point': [10, 5, 20],
    })
    df.to_csv(csv_path, index=False)
    return csv_path


@pytest.fixture
def sample_orders_csv_path(temp_dir):
    """Create a sample orders CSV file for testing."""
    csv_path = os.path.join(temp_dir, "test_orders.csv")
    df = pd.DataFrame({
        'Product ID': ['SKU001', 'SKU002', 'SKU001'],
        'Order ID': ['ORD001', 'ORD002', 'ORD003'],
        'Quantity': [5, 10, 3],
        'Total Quantity': [5, 100, 3],  # pack * quantity
        'Date Submitted': ['2024-01-15', '2024-01-16', '2024-01-17'],
        'Order Status': ['Completed', 'Pending', 'Completed'],
    })
    df.to_csv(csv_path, index=False)
    return csv_path


@pytest.fixture
def sample_inventory_df():
    """Return a sample inventory DataFrame."""
    return pd.DataFrame({
        'Product ID': ['SKU001', 'SKU002', 'SKU003'],
        'Product Name': ['Widget A', 'Widget B', 'Widget C'],
        'Item Type': ['Evergreen', 'Event', 'Evergreen'],
        'Quantity Multiplier': [1, 10, 5],
        'Available Quantity': [100, 50, 200],
        'New Notification Point': ['10 units', '5', '20 packs'],
    })


@pytest.fixture
def sample_orders_df():
    """Return a sample orders DataFrame."""
    return pd.DataFrame({
        'Product ID': ['SKU001', 'SKU002', 'SKU001'],
        'Order ID': ['ORD001', 'ORD002', 'ORD003'],
        'Quantity': [5, 10, 3],
        'Total Quantity': [5, 100, 3],
        'Date Submitted': ['2024-01-15', '2024-01-16', '2024-01-17'],
        'Order Status': ['Completed', 'Pending', 'Completed'],
    })


@pytest.fixture
def test_client_id():
    """Return a test client UUID string."""
    return "00000000-0000-0000-0000-000000000001"
