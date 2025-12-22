"""
Core usage calculation engine with multiple methods and confidence scoring
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import text

from models.database import Product, Transaction, StockHistory, ClientConfiguration
from utils.statistical import (
    calculate_weeks_remaining,
    classify_stock_status,
    calculate_usage_velocity_trend,
    detect_outliers_iqr,
    detect_seasonality,
    calculate_coefficient_of_variation,
    generate_time_weights,
    predict_stockout_date,
    calculate_reorder_quantity
)
from utils.confidence import ConfidenceCalculator

@dataclass
class UsageResult:
    """Result from usage calculation"""
    product_id: str
    monthly_usage_units: float
    monthly_usage_packs: float
    calculation_method: str
    confidence_score: float
    confidence_level: str
    data_months: int
    calculation_tier: str
    seasonality_detected: bool
    trend_direction: str
    outliers_detected: int
    variance: float = 0.0
    cv: float = 0.0
    days_since_last_data: int = 0

class UsageCalculator:
    """
    Multi-method usage calculator that combines:
    1. Historical snapshot deltas (comparing imports over time)
    2. Order fulfillment data analysis
    3. Movement history tracking
    4. Statistical estimation based on notification points
    """

    def __init__(self, db: Session):
        self.db = db
        self.confidence_calc = ConfidenceCalculator()

    async def calculate_monthly_usage(
        self,
        product_id: str,
        client_id: str
    ) -> UsageResult:
        """
        Main entry point - tries multiple methods and picks best result

        Args:
            product_id: Product ID
            client_id: Client ID

        Returns:
            UsageResult with calculated metrics
        """
        # Attempt 1: Transaction/Order Fulfillment Method (most direct)
        order_result = await self._calculate_from_orders(product_id)

        # Attempt 2: Snapshot Delta Method (most accurate for imports)
        snapshot_result = await self._calculate_from_snapshots(product_id)

        # Attempt 3: Hybrid Method (combine both)
        hybrid_result = await self._combine_results(order_result, snapshot_result)

        # Attempt 4: Statistical Estimation (fallback)
        estimated_result = await self._estimate_from_notification_point(
            product_id, client_id
        )

        # Pick best result based on confidence scores
        results = [r for r in [hybrid_result, order_result, snapshot_result, estimated_result] if r is not None]

        if not results:
            # No data available - return zero usage
            return UsageResult(
                product_id=product_id,
                monthly_usage_units=0.0,
                monthly_usage_packs=0.0,
                calculation_method='no_data',
                confidence_score=0.0,
                confidence_level='low',
                data_months=0,
                calculation_tier='no_data',
                seasonality_detected=False,
                trend_direction='unknown',
                outliers_detected=0
            )

        # Sort by confidence score descending
        results.sort(key=lambda r: r.confidence_score, reverse=True)
        final_result = results[0]

        # Enrich with trend and seasonality analysis
        final_result = await self._enrich_with_patterns(product_id, final_result)

        return final_result

    async def _calculate_from_orders(self, product_id: str) -> Optional[UsageResult]:
        """
        Calculate usage from transaction/order history

        Uses completed transactions to calculate monthly consumption
        """
        query = text("""
            SELECT
                DATE_TRUNC('month', date_submitted) as month,
                SUM(quantity_units) as total_units,
                SUM(quantity_packs) as total_packs,
                COUNT(*) as transaction_count
            FROM transactions
            WHERE product_id = :product_id
              AND date_submitted >= NOW() - INTERVAL '12 months'
              AND LOWER(order_status) = 'completed'
            GROUP BY DATE_TRUNC('month', date_submitted)
            ORDER BY month ASC
        """)

        result = self.db.execute(query, {'product_id': product_id})
        rows = result.fetchall()

        if not rows:
            return None

        # Convert to DataFrame
        df = pd.DataFrame(rows, columns=['month', 'total_units', 'total_packs', 'transaction_count'])

        data_months = len(df)
        if data_months == 0:
            return None

        # Calculate weighted average (recent months weighted more)
        weights = generate_time_weights(len(df))
        weighted_avg_units = np.average(df['total_units'], weights=weights)
        weighted_avg_packs = np.average(df['total_packs'], weights=weights)

        # Calculate variance and CV
        variance = df['total_units'].var()
        cv = calculate_coefficient_of_variation(df['total_units'])

        # Days since last data
        last_month = pd.to_datetime(df['month'].iloc[-1], utc=True)
        days_since_last = (datetime.now(timezone.utc) - last_month.to_pydatetime()).days

        # Detect outliers
        outliers = detect_outliers_iqr(df['total_units'])

        # Calculate confidence
        confidence_score = self.confidence_calc.calculate_confidence(
            data_points=data_months,
            coefficient_of_variation=cv,
            days_since_last_data=days_since_last,
            calculation_method='order_fulfillment'
        )

        return UsageResult(
            product_id=product_id,
            monthly_usage_units=float(weighted_avg_units),
            monthly_usage_packs=float(weighted_avg_packs),
            calculation_method='order_fulfillment',
            confidence_score=confidence_score,
            confidence_level=self.confidence_calc.classify_confidence_level(confidence_score),
            data_months=data_months,
            calculation_tier=self.confidence_calc.determine_calculation_tier(data_months),
            seasonality_detected=False,  # Will be enriched later
            trend_direction='unknown',     # Will be enriched later
            outliers_detected=outliers['outlier_count'],
            variance=float(variance),
            cv=float(cv),
            days_since_last_data=days_since_last
        )

    async def _calculate_from_snapshots(self, product_id: str) -> Optional[UsageResult]:
        """
        Calculate usage from stock history snapshots

        Compares inventory levels over time to infer consumption
        """
        query = text("""
            SELECT
                recorded_at,
                packs_available,
                total_units,
                source
            FROM stock_history
            WHERE product_id = :product_id
              AND recorded_at >= NOW() - INTERVAL '12 months'
            ORDER BY recorded_at ASC
        """)

        result = self.db.execute(query, {'product_id': product_id})
        rows = result.fetchall()

        if len(rows) < 2:
            return None

        # Convert to DataFrame
        df = pd.DataFrame(rows, columns=['recorded_at', 'packs_available', 'total_units', 'source'])
        df['recorded_at'] = pd.to_datetime(df['recorded_at'], utc=True)

        # Calculate deltas between consecutive snapshots
        df['delta_units'] = df['total_units'].diff()
        df['days_between'] = df['recorded_at'].diff().dt.days

        # Filter for consumption events (negative deltas)
        consumption_df = df[df['delta_units'] < 0].copy()
        consumption_df['consumption'] = consumption_df['delta_units'].abs()

        if len(consumption_df) == 0:
            return None

        # Calculate daily usage rate per event
        consumption_df['daily_usage'] = consumption_df['consumption'] / consumption_df['days_between']

        # Remove outliers (unrealistic daily rates)
        consumption_df = consumption_df[consumption_df['daily_usage'] > 0]
        consumption_df = consumption_df[consumption_df['daily_usage'] < consumption_df['daily_usage'].quantile(0.95)]

        if len(consumption_df) == 0:
            return None

        # Calculate monthly usage (daily * 30.44)
        avg_daily_usage = consumption_df['daily_usage'].mean()
        monthly_usage_units = avg_daily_usage * 30.44

        # Get pack size
        product = self.db.query(Product).filter(Product.id == product_id).first()
        pack_size = product.pack_size if product else 1
        monthly_usage_packs = monthly_usage_units / pack_size

        # Calculate variance and CV
        consumption_df['monthly_equiv'] = consumption_df['daily_usage'] * 30.44
        variance = consumption_df['monthly_equiv'].var()
        cv = calculate_coefficient_of_variation(consumption_df['monthly_equiv'])

        # Days since last data
        days_since_last = (datetime.now(timezone.utc) - df['recorded_at'].iloc[-1].to_pydatetime()).days

        # Outliers
        outliers = detect_outliers_iqr(consumption_df['monthly_equiv'])

        # Estimate data months (approximate based on date range)
        date_range = (df['recorded_at'].iloc[-1] - df['recorded_at'].iloc[0]).days
        data_months = int(date_range / 30.44)

        # Confidence
        confidence_score = self.confidence_calc.calculate_confidence(
            data_points=len(consumption_df),
            coefficient_of_variation=cv,
            days_since_last_data=days_since_last,
            calculation_method='snapshot_delta'
        )

        return UsageResult(
            product_id=product_id,
            monthly_usage_units=float(monthly_usage_units),
            monthly_usage_packs=float(monthly_usage_packs),
            calculation_method='snapshot_delta',
            confidence_score=confidence_score,
            confidence_level=self.confidence_calc.classify_confidence_level(confidence_score),
            data_months=data_months,
            calculation_tier=self.confidence_calc.determine_calculation_tier(data_months),
            seasonality_detected=False,
            trend_direction='unknown',
            outliers_detected=outliers['outlier_count'],
            variance=float(variance),
            cv=float(cv),
            days_since_last_data=days_since_last
        )

    async def _combine_results(
        self,
        order_result: Optional[UsageResult],
        snapshot_result: Optional[UsageResult]
    ) -> Optional[UsageResult]:
        """
        Combine order and snapshot results for hybrid calculation

        Returns weighted average based on confidence scores
        """
        if not order_result and not snapshot_result:
            return None

        if not order_result:
            return snapshot_result

        if not snapshot_result:
            return order_result

        # Weighted average based on confidence scores
        total_confidence = order_result.confidence_score + snapshot_result.confidence_score

        if total_confidence == 0:
            return order_result

        order_weight = order_result.confidence_score / total_confidence
        snapshot_weight = snapshot_result.confidence_score / total_confidence

        combined_usage_units = (
            order_result.monthly_usage_units * order_weight +
            snapshot_result.monthly_usage_units * snapshot_weight
        )

        combined_usage_packs = (
            order_result.monthly_usage_packs * order_weight +
            snapshot_result.monthly_usage_packs * snapshot_weight
        )

        # Combined confidence is higher than individual
        combined_confidence = min(
            (order_result.confidence_score + snapshot_result.confidence_score) / 1.5,
            1.0
        )

        return UsageResult(
            product_id=order_result.product_id,
            monthly_usage_units=float(combined_usage_units),
            monthly_usage_packs=float(combined_usage_packs),
            calculation_method='hybrid',
            confidence_score=combined_confidence,
            confidence_level=self.confidence_calc.classify_confidence_level(combined_confidence),
            data_months=max(order_result.data_months, snapshot_result.data_months),
            calculation_tier=self.confidence_calc.determine_calculation_tier(
                max(order_result.data_months, snapshot_result.data_months)
            ),
            seasonality_detected=False,
            trend_direction='unknown',
            outliers_detected=order_result.outliers_detected + snapshot_result.outliers_detected,
            variance=(order_result.variance + snapshot_result.variance) / 2,
            cv=(order_result.cv + snapshot_result.cv) / 2,
            days_since_last_data=min(
                order_result.days_since_last_data,
                snapshot_result.days_since_last_data
            )
        )

    async def _estimate_from_notification_point(
        self,
        product_id: str,
        client_id: str
    ) -> Optional[UsageResult]:
        """
        Fallback estimation using notification point as indicator

        Assumes notification point = 2-4 weeks of usage
        """
        product = self.db.query(Product).filter(Product.id == product_id).first()

        if not product or not product.notification_point:
            return None

        # Get client configuration
        config = self.db.query(ClientConfiguration).filter(
            ClientConfiguration.client_id == client_id
        ).first()

        lead_time_weeks = (config.reorder_lead_days if config else 14) / 7
        safety_weeks = config.safety_stock_weeks if config else 2
        total_weeks = lead_time_weeks + safety_weeks

        # Estimate weekly usage
        estimated_weekly_usage_packs = product.notification_point / total_weeks if total_weeks > 0 else product.notification_point / 3

        # Convert to monthly
        monthly_usage_packs = estimated_weekly_usage_packs * 4.33
        monthly_usage_units = monthly_usage_packs * product.pack_size

        return UsageResult(
            product_id=product_id,
            monthly_usage_units=float(monthly_usage_units),
            monthly_usage_packs=float(monthly_usage_packs),
            calculation_method='estimated',
            confidence_score=0.3,  # Low confidence
            confidence_level='low',
            data_months=0,
            calculation_tier='estimated',
            seasonality_detected=False,
            trend_direction='unknown',
            outliers_detected=0
        )

    async def _enrich_with_patterns(
        self,
        product_id: str,
        result: UsageResult
    ) -> UsageResult:
        """
        Add trend and seasonality analysis to usage result
        """
        # Get monthly history for pattern detection
        query = text("""
            SELECT
                DATE_TRUNC('month', date_submitted) as month,
                SUM(quantity_units) as total_units
            FROM transactions
            WHERE product_id = :product_id
              AND date_submitted >= NOW() - INTERVAL '12 months'
              AND LOWER(order_status) = 'completed'
            GROUP BY DATE_TRUNC('month', date_submitted)
            ORDER BY month ASC
        """)

        db_result = self.db.execute(query, {'product_id': product_id})
        rows = db_result.fetchall()

        if not rows or len(rows) < 3:
            return result

        df = pd.DataFrame(rows, columns=['month', 'total_units'])
        monthly_usage = df['total_units'].tolist()

        # Trend analysis
        trend_info = calculate_usage_velocity_trend(monthly_usage)
        result.trend_direction = trend_info['trend']

        # Seasonality detection
        seasonality_info = detect_seasonality(df.set_index('month')['total_units'])
        result.seasonality_detected = seasonality_info['seasonal']

        return result
