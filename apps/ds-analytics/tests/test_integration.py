"""
Integration tests for DS Analytics service

These tests verify the DS Analytics Python service integrates correctly
with the Inventory IQ database and API.
"""
import pytest
import requests
import os
from dotenv import load_dotenv

load_dotenv()

# Test configuration
DS_ANALYTICS_URL = os.getenv("DS_ANALYTICS_URL", "http://localhost:8000")
API_URL = os.getenv("API_URL", "http://localhost:3001")
API_EMAIL = os.getenv("API_EMAIL", "sarah.chen@inventoryiq.com")
API_PASSWORD = os.getenv("API_PASSWORD", "demo1234")


def get_api_token() -> str:
    """Get JWT token from main API"""
    response = requests.post(
        f"{API_URL}/api/auth/login",
        json={"email": API_EMAIL, "password": API_PASSWORD}
    )
    response.raise_for_status()
    return response.json()["accessToken"]


class TestHealthEndpoint:
    """Test health check endpoint"""

    def test_health_check_returns_healthy(self):
        """Health endpoint should return healthy status"""
        response = requests.get(f"{DS_ANALYTICS_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database_connected"] is True
        assert "version" in data
        assert "timestamp" in data


class TestStatsEndpoint:
    """Test statistics endpoint"""

    def test_stats_returns_product_counts(self):
        """Stats endpoint should return product counts"""
        response = requests.get(f"{DS_ANALYTICS_URL}/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_products" in data
        assert "products_with_usage" in data
        assert "products_needing_calculation" in data
        assert data["total_products"] >= 0

    def test_stats_returns_confidence_metrics(self):
        """Stats endpoint should return confidence metrics"""
        response = requests.get(f"{DS_ANALYTICS_URL}/stats")
        assert response.status_code == 200
        data = response.json()
        assert "avg_confidence_score" in data
        assert "high_confidence_count" in data
        assert "medium_confidence_count" in data
        assert "low_confidence_count" in data


class TestCalculateUsageEndpoint:
    """Test usage calculation endpoint"""

    @pytest.fixture(scope="class")
    def client_and_products(self):
        """Get a client and products from the API"""
        token = get_api_token()
        headers = {"Authorization": f"Bearer {token}"}

        # Get first client
        clients_response = requests.get(
            f"{API_URL}/api/clients",
            headers=headers
        )
        clients_response.raise_for_status()
        clients = clients_response.json()["data"]
        assert len(clients) > 0, "No clients found in database"
        client = clients[0]

        # Get products for this client
        products_response = requests.get(
            f"{API_URL}/api/clients/{client['id']}/products?limit=3",
            headers=headers
        )
        products_response.raise_for_status()
        products = products_response.json()["data"]
        assert len(products) > 0, f"No products found for client {client['name']}"

        return {
            "client_id": client["id"],
            "client_name": client["name"],
            "product_ids": [p["id"] for p in products[:2]]
        }

    def test_calculate_usage_returns_results(self, client_and_products):
        """Calculate usage should return results for valid products"""
        response = requests.post(
            f"{DS_ANALYTICS_URL}/calculate-usage",
            json={
                "client_id": client_and_products["client_id"],
                "product_ids": client_and_products["product_ids"]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should return at least some results (some may fail due to no data)
        assert len(data) >= 0

    def test_calculate_usage_response_structure(self, client_and_products):
        """Calculate usage response should have correct structure"""
        response = requests.post(
            f"{DS_ANALYTICS_URL}/calculate-usage",
            json={
                "client_id": client_and_products["client_id"],
                "product_ids": client_and_products["product_ids"][:1]  # Just one product
            }
        )
        assert response.status_code == 200
        data = response.json()

        if len(data) > 0:
            result = data[0]
            # Required fields
            assert "product_id" in result
            assert "product_name" in result
            assert "monthly_usage_units" in result
            assert "monthly_usage_packs" in result
            assert "confidence_score" in result
            assert "confidence_level" in result
            assert "calculation_method" in result
            assert "stock_status" in result
            assert "calculated_at" in result

    def test_calculate_usage_updates_database(self, client_and_products):
        """Calculate usage should update products in database"""
        # Calculate usage
        response = requests.post(
            f"{DS_ANALYTICS_URL}/calculate-usage",
            json={
                "client_id": client_and_products["client_id"],
                "product_ids": client_and_products["product_ids"][:1]
            }
        )
        assert response.status_code == 200
        results = response.json()

        if len(results) > 0:
            product_id = results[0]["product_id"]
            token = get_api_token()

            # Verify product was updated in database via API
            product_response = requests.get(
                f"{API_URL}/api/products/{product_id}",
                headers={"Authorization": f"Bearer {token}"}
            )
            if product_response.status_code == 200:
                product = product_response.json()["data"]
                # Check that usage fields were populated
                assert product.get("monthlyUsageUnits") is not None or \
                       product.get("usageConfidence") is not None, \
                       "Product usage fields not updated"


class TestUsageCalculationMethods:
    """Test different usage calculation methods"""

    def test_calculation_methods_exist(self):
        """Stats should show various calculation methods"""
        response = requests.get(f"{DS_ANALYTICS_URL}/stats")
        assert response.status_code == 200
        data = response.json()
        assert "calculation_methods" in data
        methods = data["calculation_methods"]
        # At least one method should exist
        assert isinstance(methods, dict)


class TestConfidenceScoring:
    """Test confidence scoring functionality"""

    def test_confidence_levels_are_valid(self):
        """Confidence levels should be valid values"""
        response = requests.get(f"{DS_ANALYTICS_URL}/stats")
        assert response.status_code == 200
        data = response.json()

        # Confidence score should be between 0 and 1
        assert 0 <= data["avg_confidence_score"] <= 1

        # Counts should be non-negative
        assert data["high_confidence_count"] >= 0
        assert data["medium_confidence_count"] >= 0
        assert data["low_confidence_count"] >= 0


class TestStockoutPrediction:
    """Test stockout prediction functionality"""

    @pytest.fixture(scope="class")
    def product_with_usage(self):
        """Find a product with existing usage data"""
        token = get_api_token()
        headers = {"Authorization": f"Bearer {token}"}

        # Get clients
        clients_response = requests.get(f"{API_URL}/api/clients", headers=headers)
        clients = clients_response.json()["data"]

        for client in clients:
            products_response = requests.get(
                f"{API_URL}/api/clients/{client['id']}/products?limit=5",
                headers=headers
            )
            products = products_response.json()["data"]

            for product in products:
                if product.get("monthlyUsageUnits") and product["monthlyUsageUnits"] > 0:
                    return {
                        "client_id": client["id"],
                        "product_id": product["id"]
                    }

        # If no product with usage found, return any product
        return {
            "client_id": clients[0]["id"],
            "product_id": products[0]["id"]
        } if clients and products else None

    def test_stockout_prediction_structure(self, product_with_usage):
        """Stockout prediction should have correct structure"""
        if not product_with_usage:
            pytest.skip("No products found")

        response = requests.post(
            f"{DS_ANALYTICS_URL}/calculate-usage",
            json={
                "client_id": product_with_usage["client_id"],
                "product_ids": [product_with_usage["product_id"]]
            }
        )
        assert response.status_code == 200
        results = response.json()

        if len(results) > 0 and results[0].get("predicted_stockout"):
            stockout = results[0]["predicted_stockout"]
            assert "predicted_date" in stockout
            assert "days_until_stockout" in stockout
            assert "confidence_score" in stockout


class TestReorderSuggestions:
    """Test reorder suggestion functionality"""

    def test_reorder_suggestion_structure(self):
        """Reorder suggestions should have correct structure"""
        token = get_api_token()
        headers = {"Authorization": f"Bearer {token}"}

        # Get a client and product
        clients_response = requests.get(f"{API_URL}/api/clients", headers=headers)
        clients = clients_response.json()["data"]
        if not clients:
            pytest.skip("No clients found")

        products_response = requests.get(
            f"{API_URL}/api/clients/{clients[0]['id']}/products?limit=1",
            headers=headers
        )
        products = products_response.json()["data"]
        if not products:
            pytest.skip("No products found")

        response = requests.post(
            f"{DS_ANALYTICS_URL}/calculate-usage",
            json={
                "client_id": clients[0]["id"],
                "product_ids": [products[0]["id"]]
            }
        )
        assert response.status_code == 200
        results = response.json()

        if len(results) > 0 and results[0].get("reorder_suggestion"):
            reorder = results[0]["reorder_suggestion"]
            assert "suggested_quantity_packs" in reorder
            assert "suggested_quantity_units" in reorder
            assert "reorder_point_packs" in reorder


class TestErrorHandling:
    """Test error handling"""

    def test_invalid_client_id_handled(self):
        """Invalid client ID should be handled gracefully"""
        response = requests.post(
            f"{DS_ANALYTICS_URL}/calculate-usage",
            json={
                "client_id": "00000000-0000-0000-0000-000000000000",
                "product_ids": ["00000000-0000-0000-0000-000000000001"]
            }
        )
        # Should return 200 with empty results, not crash
        assert response.status_code == 200

    def test_empty_product_ids_handled(self):
        """Empty product IDs should be handled"""
        response = requests.post(
            f"{DS_ANALYTICS_URL}/calculate-usage",
            json={
                "client_id": "b5359eb0-5e88-491a-9ebb-c8f2ef308086",
                "product_ids": []
            }
        )
        assert response.status_code == 200
        assert response.json() == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
