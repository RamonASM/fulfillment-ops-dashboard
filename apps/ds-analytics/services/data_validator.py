"""
Data validation and quality checking for usage calculations
"""
from typing import Dict, List
from models.database import Product
from services.usage_calculator import UsageResult

class ValidationMessage:
    """Validation message with severity level"""
    def __init__(self, level: str, message: str):
        self.level = level  # 'error' | 'warning' | 'info'
        self.message = message

    def to_dict(self):
        return {'level': self.level, 'message': self.message}

class DataValidator:
    """
    Validate calculated usage metrics against business rules
    """

    def validate_usage_result(
        self,
        result: UsageResult,
        product: Product
    ) -> List[ValidationMessage]:
        """
        Run validation checks and return messages

        Args:
            result: Calculated usage result
            product: Product information

        Returns:
            List of validation messages
        """
        messages = []

        # Rule 1: Usage cannot be negative
        if result.monthly_usage_units < 0:
            messages.append(ValidationMessage(
                'error',
                "Monthly usage cannot be negative"
            ))

        # Rule 2: Usage shouldn't exceed current stock by >10x (unusual)
        if (product.current_stock_units and product.current_stock_units > 0 and
                result.monthly_usage_units > product.current_stock_units * 10):
            messages.append(ValidationMessage(
                'warning',
                f"Monthly usage ({result.monthly_usage_units:.0f}) is >10x current stock "
                f"({product.current_stock_units}) - may indicate data issue"
            ))

        # Rule 3: Low confidence should be flagged
        if result.confidence_level == 'low':
            messages.append(ValidationMessage(
                'warning',
                f"Low confidence ({result.confidence_score:.2f}) - "
                "recommend reviewing data or increasing collection period"
            ))

        # Rule 4: High variability warning
        if result.outliers_detected > 2:
            messages.append(ValidationMessage(
                'warning',
                f"Detected {result.outliers_detected} outlier months - "
                "usage may be irregular or seasonal"
            ))

        # Rule 5: Notification point sanity check
        if product.notification_point and result.monthly_usage_packs > 0:
            implied_weeks = (product.notification_point / result.monthly_usage_packs) * 4.33
            if implied_weeks < 1 or implied_weeks > 26:
                messages.append(ValidationMessage(
                    'warning',
                    f"Notification point implies {implied_weeks:.1f} weeks of usage - "
                    "verify notification point is correct"
                ))

        # Rule 6: Zero usage for active product
        if result.monthly_usage_units == 0 and product.is_active:
            messages.append(ValidationMessage(
                'info',
                "Zero usage detected for active product - may be newly added or dormant"
            ))

        # Rule 7: High CV (coefficient of variation) indicates inconsistent usage
        if result.cv > 1.0:
            messages.append(ValidationMessage(
                'info',
                f"High usage variability (CV={result.cv:.2f}) - "
                "consider seasonality or irregular ordering patterns"
            ))

        # Rule 8: Stale data warning
        if result.days_since_last_data > 90:
            messages.append(ValidationMessage(
                'warning',
                f"Last data is {result.days_since_last_data} days old - "
                "calculation may not reflect current patterns"
            ))

        # Rule 9: Event items should not have usage calculated
        if product.item_type == 'event' and result.monthly_usage_units > 0:
            messages.append(ValidationMessage(
                'info',
                "Event items typically have one-time usage - "
                "monthly usage may not be meaningful"
            ))

        # Rule 10: Completed items should have zero or minimal usage
        if product.item_type == 'completed' and result.monthly_usage_units > 0:
            messages.append(ValidationMessage(
                'info',
                "Completed items should not have ongoing usage - "
                "verify product status"
            ))

        return messages

    def validate_batch_results(
        self,
        results: List[tuple],  # (UsageResult, Product)
        client_id: str
    ) -> Dict:
        """
        Validate a batch of results and generate summary statistics

        Returns:
            Dictionary with validation summary
        """
        total_products = len(results)
        products_with_errors = 0
        products_with_warnings = 0
        error_messages = []
        warning_messages = []

        for result, product in results:
            messages = self.validate_usage_result(result, product)

            has_error = any(m.level == 'error' for m in messages)
            has_warning = any(m.level == 'warning' for m in messages)

            if has_error:
                products_with_errors += 1
                error_messages.extend([m.message for m in messages if m.level == 'error'])

            if has_warning:
                products_with_warnings += 1
                warning_messages.extend([m.message for m in messages if m.level == 'warning'])

        return {
            'client_id': client_id,
            'total_products': total_products,
            'products_with_errors': products_with_errors,
            'products_with_warnings': products_with_warnings,
            'error_rate': products_with_errors / total_products if total_products > 0 else 0,
            'warning_rate': products_with_warnings / total_products if total_products > 0 else 0,
            'top_errors': list(set(error_messages))[:5],
            'top_warnings': list(set(warning_messages))[:5]
        }
