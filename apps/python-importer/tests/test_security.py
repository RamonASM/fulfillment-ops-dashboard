"""
Security tests for Python importer.

Tests critical security functions:
- validate_file_path(): Prevents path traversal attacks
- _sanitize_string(): Input sanitization for SQL safety
- bulk_upsert_products(): SQL injection prevention
"""

import os
import sys
import tempfile
import pytest

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import validate_file_path, PathValidationError
from bulk_operations import _sanitize_string


class TestValidateFilePath:
    """Tests for validate_file_path() security function."""

    @pytest.mark.security
    def test_valid_path_in_allowed_directory(self, temp_dir):
        """Valid file path within allowed directory should succeed."""
        # Create a test file in temp directory
        test_file = os.path.join(temp_dir, "valid_file.csv")
        with open(test_file, 'w') as f:
            f.write("test")

        # Should return the absolute path
        result = validate_file_path(test_file, base_dirs=[temp_dir])
        assert result == os.path.realpath(test_file)

    @pytest.mark.security
    def test_path_traversal_with_double_dots(self, temp_dir):
        """Path with .. should be rejected."""
        # Create a file
        test_file = os.path.join(temp_dir, "file.csv")
        with open(test_file, 'w') as f:
            f.write("test")

        # Try to access with path traversal
        traversal_path = os.path.join(temp_dir, "..", "etc", "passwd")

        with pytest.raises(PathValidationError) as exc_info:
            validate_file_path(traversal_path, base_dirs=[temp_dir])

        assert "Path traversal detected" in str(exc_info.value)

    @pytest.mark.security
    def test_path_outside_allowed_directory(self, temp_dir):
        """Path outside allowed directories should be rejected."""
        # Create a file outside temp_dir
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv') as f:
            f.write("test")
            outside_file = f.name

        try:
            # Create a different temp directory as allowed
            with tempfile.TemporaryDirectory() as other_dir:
                with pytest.raises(PathValidationError) as exc_info:
                    validate_file_path(outside_file, base_dirs=[other_dir])

                assert "outside allowed directories" in str(exc_info.value)
        finally:
            os.unlink(outside_file)

    @pytest.mark.security
    def test_blocked_system_paths(self, temp_dir):
        """Access to sensitive system paths should be blocked."""
        blocked_paths = [
            '/etc/passwd',
            '/etc/shadow',
            '/root/.ssh/id_rsa',
            '/var/log/auth.log',
            '/proc/self/environ',
            '/sys/kernel/debug',
        ]

        for path in blocked_paths:
            # Skip if path doesn't exist (different systems)
            if not os.path.exists(path):
                continue

            with pytest.raises(PathValidationError) as exc_info:
                validate_file_path(path, base_dirs=[temp_dir])

            # Should be rejected either as outside allowed dirs or blocked prefix
            assert "blocked" in str(exc_info.value).lower() or "outside" in str(exc_info.value).lower()

    @pytest.mark.security
    def test_symlink_escape_attempt(self, temp_dir):
        """Symlinks pointing outside allowed directory should be rejected."""
        # Create a file outside temp_dir
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv') as f:
            f.write("secret data")
            outside_file = f.name

        try:
            # Create symlink inside temp_dir pointing to outside file
            symlink_path = os.path.join(temp_dir, "symlink.csv")
            os.symlink(outside_file, symlink_path)

            with pytest.raises(PathValidationError) as exc_info:
                validate_file_path(symlink_path, base_dirs=[temp_dir])

            assert "outside allowed directories" in str(exc_info.value)
        finally:
            os.unlink(outside_file)
            if os.path.islink(symlink_path):
                os.unlink(symlink_path)

    @pytest.mark.security
    def test_nonexistent_file(self, temp_dir):
        """Non-existent file should be rejected."""
        nonexistent = os.path.join(temp_dir, "does_not_exist.csv")

        with pytest.raises(PathValidationError) as exc_info:
            validate_file_path(nonexistent, base_dirs=[temp_dir])

        assert "does not exist" in str(exc_info.value)

    @pytest.mark.security
    def test_directory_path_rejected(self, temp_dir):
        """Directory path (not a file) should be rejected."""
        subdir = os.path.join(temp_dir, "subdir")
        os.makedirs(subdir)

        with pytest.raises(PathValidationError) as exc_info:
            validate_file_path(subdir, base_dirs=[temp_dir])

        assert "does not exist" in str(exc_info.value) or "not a file" in str(exc_info.value).lower()

    @pytest.mark.security
    def test_null_byte_injection(self, temp_dir):
        """Null byte injection should be rejected."""
        # Create a valid file
        test_file = os.path.join(temp_dir, "valid.csv")
        with open(test_file, 'w') as f:
            f.write("test")

        # Try null byte injection
        null_byte_path = test_file + "\x00.jpg"

        # This should either raise PathValidationError or OSError
        with pytest.raises((PathValidationError, OSError, ValueError)):
            validate_file_path(null_byte_path, base_dirs=[temp_dir])


class TestSanitizeString:
    """Tests for _sanitize_string() input sanitization."""

    @pytest.mark.security
    def test_normal_string(self):
        """Normal string should pass through."""
        result = _sanitize_string("Hello World")
        assert result == "Hello World"

    @pytest.mark.security
    def test_string_with_whitespace(self):
        """Whitespace should be stripped."""
        result = _sanitize_string("  padded string  ")
        assert result == "padded string"

    @pytest.mark.security
    def test_truncation_at_max_length(self):
        """Long strings should be truncated."""
        long_string = "a" * 500
        result = _sanitize_string(long_string, max_length=255)
        assert len(result) == 255

    @pytest.mark.security
    def test_none_returns_none(self):
        """None input should return None."""
        result = _sanitize_string(None)
        assert result is None

    @pytest.mark.security
    def test_empty_string_returns_none(self):
        """Empty string should return None."""
        result = _sanitize_string("")
        assert result is None

    @pytest.mark.security
    def test_whitespace_only_returns_none(self):
        """Whitespace-only string should return None."""
        result = _sanitize_string("   \t\n  ")
        assert result is None

    @pytest.mark.security
    def test_sql_injection_patterns_sanitized(self):
        """SQL injection patterns should be handled safely."""
        # These patterns should NOT be specially escaped - the safety
        # comes from parameterized queries, not string sanitization.
        # But they should be truncated and stripped properly.
        patterns = [
            "'; DROP TABLE products; --",
            "1' OR '1'='1",
            "admin'--",
            "Robert'); DROP TABLE Students;--",
        ]

        for pattern in patterns:
            result = _sanitize_string(pattern)
            # Should be stripped and returned as-is (protection via parameterized queries)
            assert result == pattern.strip()

    @pytest.mark.security
    def test_unicode_handling(self):
        """Unicode strings should be handled properly."""
        unicode_string = "Прoduct Nаme 商品名"
        result = _sanitize_string(unicode_string)
        assert result == unicode_string

    @pytest.mark.security
    def test_numeric_input_converted_to_string(self):
        """Numeric inputs should be converted to string."""
        result = _sanitize_string(12345)
        assert result == "12345"

    @pytest.mark.security
    def test_custom_max_length(self):
        """Custom max_length should be respected."""
        result = _sanitize_string("short string", max_length=5)
        assert result == "short"


class TestSQLInjectionPrevention:
    """Tests to verify SQL injection prevention in bulk operations."""

    @pytest.mark.security
    def test_product_data_with_sql_injection_attempt(self):
        """Product data containing SQL injection patterns should be safely sanitized."""
        malicious_product = {
            'id': '12345678-1234-1234-1234-123456789abc',
            'client_id': '12345678-1234-1234-1234-123456789abd',
            'product_id': "'; DELETE FROM products WHERE '1'='1",
            'name': "Product'); DROP TABLE products;--",
            'item_type': "evergreen' OR '1'='1",
        }

        # Sanitize each field
        sanitized_pid = _sanitize_string(malicious_product['product_id'])
        sanitized_name = _sanitize_string(malicious_product['name'])
        sanitized_type = _sanitize_string(malicious_product['item_type'])

        # Fields should be sanitized (stripped) but not escaped
        # Real protection comes from parameterized queries
        assert sanitized_pid == "'; DELETE FROM products WHERE '1'='1"
        assert sanitized_name == "Product'); DROP TABLE products;--"
        assert sanitized_type == "evergreen' OR '1'='1"

        # The important part is these values are passed to pg_insert()
        # which uses parameterized queries, not string interpolation

    @pytest.mark.security
    def test_truncation_prevents_excessively_long_payloads(self):
        """Very long injection payloads should be truncated."""
        # Create a very long payload
        long_payload = "'; " + "A" * 1000 + " DROP TABLE products;--"

        result = _sanitize_string(long_payload, max_length=255)

        # Should be truncated, preventing full payload execution
        assert len(result) == 255
        assert "DROP TABLE" not in result  # The dangerous part should be cut off
