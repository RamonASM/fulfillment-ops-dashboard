"""
Confidence scoring system for usage calculations
"""
from typing import Optional

class ConfidenceCalculator:
    """
    Calculate confidence scores for usage estimates based on multiple factors
    """

    # Weights for different confidence factors
    WEIGHTS = {
        'data_points': 0.30,
        'consistency': 0.25,
        'recency': 0.20,
        'method_reliability': 0.15,
        'cross_validation': 0.10
    }

    # Method reliability scores
    METHOD_SCORES = {
        'snapshot_delta': 0.9,
        'order_fulfillment': 0.85,
        'hybrid': 0.95,
        'stock_movement': 0.8,
        'estimated': 0.3
    }

    def calculate_confidence(
        self,
        data_points: int,
        coefficient_of_variation: float,
        days_since_last_data: int,
        calculation_method: str,
        cross_validation_score: Optional[float] = None
    ) -> float:
        """
        Multi-factor confidence calculation

        Args:
            data_points: Number of data points used
            coefficient_of_variation: CV (std_dev / mean)
            days_since_last_data: Days since last data point
            calculation_method: Method used for calculation
            cross_validation_score: Optional cross-validation score

        Returns:
            Confidence score between 0.0 and 1.0
        """
        # Factor 1: Data Points (more data = higher confidence)
        data_score = self._score_data_points(data_points)

        # Factor 2: Consistency (low variance = higher confidence)
        consistency_score = self._score_consistency(coefficient_of_variation)

        # Factor 3: Recency (fresher data = higher confidence)
        recency_score = self._score_recency(days_since_last_data)

        # Factor 4: Method Reliability
        method_score = self.METHOD_SCORES.get(calculation_method, 0.5)

        # Factor 5: Cross-Validation (if available)
        cv_score = cross_validation_score if cross_validation_score is not None else 0.5

        # Weighted sum
        confidence = (
            self.WEIGHTS['data_points'] * data_score +
            self.WEIGHTS['consistency'] * consistency_score +
            self.WEIGHTS['recency'] * recency_score +
            self.WEIGHTS['method_reliability'] * method_score +
            self.WEIGHTS['cross_validation'] * cv_score
        )

        return round(confidence, 2)

    def _score_data_points(self, data_points: int) -> float:
        """Score based on number of data points"""
        if data_points >= 12:
            return 1.0
        elif data_points >= 6:
            return 0.75
        elif data_points >= 3:
            return 0.5
        else:
            return 0.25

    def _score_consistency(self, coefficient_of_variation: float) -> float:
        """Score based on consistency (lower CV = higher score)"""
        if coefficient_of_variation < 0.2:
            return 1.0
        elif coefficient_of_variation < 0.5:
            return 0.7
        elif coefficient_of_variation < 1.0:
            return 0.4
        else:
            return 0.2

    def _score_recency(self, days_since_last_data: int) -> float:
        """Score based on data recency"""
        if days_since_last_data <= 30:
            return 1.0
        elif days_since_last_data <= 60:
            return 0.8
        elif days_since_last_data <= 90:
            return 0.6
        else:
            return 0.4

    def classify_confidence_level(self, score: float) -> str:
        """
        Convert numeric score to categorical level

        Returns: 'high' | 'medium' | 'low'
        """
        if score >= 0.75:
            return 'high'
        elif score >= 0.50:
            return 'medium'
        else:
            return 'low'

    def determine_calculation_tier(self, data_months: int) -> str:
        """
        Determine calculation tier based on data availability

        Returns: '12_month' | '6_month' | '3_month' | 'weekly'
        """
        if data_months >= 12:
            return '12_month'
        elif data_months >= 6:
            return '6_month'
        elif data_months >= 3:
            return '3_month'
        else:
            return 'weekly'
