"""
Statistical utility functions for data analysis
"""
import numpy as np
from scipy import stats
from scipy.fft import fft, fftfreq
from scipy.signal import detrend
import pandas as pd
from typing import Dict, List, Optional, Tuple

def calculate_weeks_remaining(
    available_quantity: float,
    monthly_usage: float,
    pack_size: int = 1
) -> Optional[float]:
    """
    Calculate weeks of supply remaining

    Formula: Weeks Remaining = (Available Quantity ÷ Monthly Usage) × 4.33

    Args:
        available_quantity: Current stock (in packs or units)
        monthly_usage: Monthly consumption rate (same unit as available_quantity)
        pack_size: Units per pack (for conversion if needed)

    Returns:
        Weeks remaining or None if calculation not possible
    """
    if monthly_usage <= 0:
        return None

    weekly_usage = monthly_usage / 4.33

    if weekly_usage <= 0:
        return None

    weeks_remaining = available_quantity / weekly_usage

    return round(weeks_remaining, 2)

def classify_stock_status(weeks_remaining: Optional[float]) -> str:
    """
    Classify stock health based on weeks remaining

    Returns: 'critical' | 'low' | 'watch' | 'healthy' | 'unknown'
    """
    if weeks_remaining is None:
        return 'unknown'

    if weeks_remaining <= 2:
        return 'critical'
    elif weeks_remaining <= 4:
        return 'low'
    elif weeks_remaining <= 8:
        return 'watch'
    else:
        return 'healthy'

def calculate_usage_velocity_trend(monthly_usage_history: List[float]) -> Dict:
    """
    Analyze if usage is increasing, stable, or decreasing using linear regression

    Args:
        monthly_usage_history: List of monthly usage values (chronological order)

    Returns:
        Dictionary with trend analysis
    """
    if len(monthly_usage_history) < 3:
        return {
            'trend': 'unknown',
            'slope': 0.0,
            'r_squared': 0.0,
            'p_value': 1.0,
            'monthly_change_rate': 0.0
        }

    x = np.arange(len(monthly_usage_history))
    y = np.array(monthly_usage_history)

    # Linear regression
    slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)

    mean_usage = np.mean(y)

    # Determine trend direction (consider trend significant if slope > 5% of mean)
    if abs(slope) < 0.05 * mean_usage:
        trend = 'stable'
    elif slope > 0:
        trend = 'increasing'
    else:
        trend = 'decreasing'

    return {
        'trend': trend,
        'slope': float(slope),
        'r_squared': float(r_value ** 2),
        'p_value': float(p_value),
        'monthly_change_rate': float(slope / mean_usage) if mean_usage > 0 else 0.0
    }

def detect_outliers_iqr(values: pd.Series) -> Dict:
    """
    Detect outliers using Interquartile Range (IQR) method

    Args:
        values: Pandas Series of values

    Returns:
        Dictionary with outlier information
    """
    Q1 = values.quantile(0.25)
    Q3 = values.quantile(0.75)
    IQR = Q3 - Q1

    lower_bound = Q1 - 1.5 * IQR
    upper_bound = Q3 + 1.5 * IQR

    outliers = values[(values < lower_bound) | (values > upper_bound)]

    return {
        'outlier_count': len(outliers),
        'outlier_indices': outliers.index.tolist() if hasattr(outliers.index, 'tolist') else [],
        'outlier_values': outliers.tolist(),
        'lower_bound': float(lower_bound),
        'upper_bound': float(upper_bound)
    }

def detect_outliers_zscore(values: pd.Series, threshold: float = 3.0) -> Dict:
    """
    Detect outliers using Z-score method

    Args:
        values: Pandas Series of values
        threshold: Z-score threshold (default 3.0 = 99.7% confidence)

    Returns:
        Dictionary with outlier information
    """
    z_scores = np.abs(stats.zscore(values.dropna()))
    outlier_mask = z_scores > threshold
    outliers = values[outlier_mask]

    return {
        'outlier_count': len(outliers),
        'outlier_indices': outliers.index.tolist() if hasattr(outliers.index, 'tolist') else [],
        'outlier_values': outliers.tolist(),
        'z_scores': z_scores.tolist()
    }

def detect_seasonality(
    monthly_series: pd.Series,
    significance_level: float = 0.05
) -> Dict:
    """
    Detect seasonal patterns using Fourier Transform

    Args:
        monthly_series: Time series data (monthly frequency)
        significance_level: Statistical significance threshold

    Returns:
        Dictionary with seasonality information
    """
    if len(monthly_series) < 12:
        return {
            'seasonal': False,
            'patterns': [],
            'seasonality_strength': 0.0
        }

    # Detrend the series
    detrended = detrend(monthly_series.values)

    # FFT analysis
    fft_values = fft(detrended)
    frequencies = fftfreq(len(detrended), d=1)  # d=1 for monthly data

    # Calculate power spectrum
    power = np.abs(fft_values) ** 2

    # Find dominant frequencies (positive only)
    positive_freq_idx = frequencies > 0
    positive_freqs = frequencies[positive_freq_idx]
    positive_power = power[positive_freq_idx]

    # Get top 5 frequencies
    top_indices = np.argsort(positive_power)[-5:]
    dominant_frequencies = positive_freqs[top_indices]

    patterns = []
    for freq in dominant_frequencies:
        if freq > 0:
            period_months = 1 / freq

            # Classify pattern
            if 11 <= period_months <= 13:
                patterns.append({'type': 'annual', 'period_months': 12})
            elif 2.5 <= period_months <= 3.5:
                patterns.append({'type': 'quarterly', 'period_months': 3})
            elif 5.5 <= period_months <= 6.5:
                patterns.append({'type': 'biannual', 'period_months': 6})

    # Calculate overall seasonality strength
    total_power = np.sum(positive_power)
    seasonality_strength = float(np.max(positive_power) / total_power) if total_power > 0 else 0.0

    return {
        'seasonal': len(patterns) > 0,
        'patterns': patterns,
        'seasonality_strength': seasonality_strength
    }

def calculate_coefficient_of_variation(values: pd.Series) -> float:
    """
    Calculate coefficient of variation (CV = std_dev / mean)

    Returns:
        CV value (0 = no variation, higher = more variation)
    """
    mean_val = values.mean()
    if mean_val == 0:
        return float('inf')

    std_val = values.std()
    return float(std_val / mean_val)

def generate_time_weights(n_periods: int, recent_weight: float = 1.5) -> np.ndarray:
    """
    Generate time-based weights for weighted average (recent data weighted more)

    Args:
        n_periods: Number of time periods
        recent_weight: Multiplier for most recent 3 months

    Returns:
        Array of weights
    """
    weights = np.ones(n_periods)

    # Apply higher weight to most recent 3 periods
    if n_periods >= 3:
        weights[-3:] = recent_weight

    # Normalize weights to sum to 1
    return weights / weights.sum()

def predict_stockout_date(
    current_stock: float,
    daily_usage_rate: float,
    usage_variance: float = 0.0
) -> Dict:
    """
    Predict when product will stockout based on current consumption rate

    Args:
        current_stock: Current available quantity
        daily_usage_rate: Average daily consumption
        usage_variance: Variance in daily usage

    Returns:
        Dictionary with prediction and confidence interval
    """
    from datetime import datetime, timedelta

    if daily_usage_rate <= 0 or current_stock <= 0:
        return {
            'predicted_date': None,
            'days_until_stockout': None,
            'confidence_score': 0.0,
            'confidence_interval': None
        }

    # Base prediction
    days_until_stockout = current_stock / daily_usage_rate
    predicted_date = datetime.now() + timedelta(days=days_until_stockout)

    # Calculate confidence interval using variance
    if usage_variance > 0:
        std_dev = np.sqrt(usage_variance)
        # 95% confidence interval (±1.96 std deviations)
        margin_days = 1.96 * (std_dev / daily_usage_rate) * np.sqrt(days_until_stockout)

        earliest_date = predicted_date - timedelta(days=margin_days)
        latest_date = predicted_date + timedelta(days=margin_days)

        # Confidence decreases with wider intervals
        confidence = 1.0 / (1.0 + (margin_days / days_until_stockout))
    else:
        earliest_date = predicted_date
        latest_date = predicted_date
        confidence = 0.5  # Medium confidence without variance data

    return {
        'predicted_date': predicted_date.isoformat(),
        'days_until_stockout': int(days_until_stockout),
        'confidence_score': round(confidence, 2),
        'confidence_interval': {
            'earliest': earliest_date.isoformat(),
            'latest': latest_date.isoformat()
        }
    }

def calculate_reorder_quantity(
    monthly_usage: float,
    lead_time_days: int,
    safety_stock_weeks: int,
    current_stock: float,
    pack_size: int = 1,
    order_multiple: Optional[int] = None
) -> Dict:
    """
    Calculate optimal reorder quantity

    Formula:
    Reorder Qty = (Lead Time Usage + Safety Stock) - Current Stock

    Args:
        monthly_usage: Average monthly consumption
        lead_time_days: Supplier lead time in days
        safety_stock_weeks: Safety stock buffer in weeks
        current_stock: Current available stock
        pack_size: Units per pack
        order_multiple: Must order in multiples of this quantity

    Returns:
        Dictionary with reorder calculations
    """
    # Convert to daily usage
    daily_usage = monthly_usage / 30.44

    # Lead time demand
    lead_time_usage = daily_usage * lead_time_days

    # Safety stock
    safety_stock = daily_usage * 7 * safety_stock_weeks

    # Reorder point
    reorder_point = lead_time_usage + safety_stock

    # Suggested order quantity
    suggested_qty = max(0, reorder_point - current_stock)

    # Round to pack size
    suggested_packs = np.ceil(suggested_qty / pack_size) if pack_size > 0 else suggested_qty

    # Apply order multiple if specified
    if order_multiple and order_multiple > 0:
        suggested_packs = np.ceil(suggested_packs / order_multiple) * order_multiple

    return {
        'suggested_quantity_packs': int(suggested_packs),
        'suggested_quantity_units': int(suggested_packs * pack_size),
        'reorder_point_packs': int(np.ceil(reorder_point / pack_size)) if pack_size > 0 else int(reorder_point),
        'safety_stock_packs': int(np.ceil(safety_stock / pack_size)) if pack_size > 0 else int(safety_stock),
        'lead_time_demand_packs': int(np.ceil(lead_time_usage / pack_size)) if pack_size > 0 else int(lead_time_usage)
    }

def impute_missing_values(
    series: pd.Series,
    method: str = 'linear'
) -> pd.Series:
    """
    Fill missing values in time series

    Args:
        series: Time series with potential gaps
        method: 'linear' | 'forward_fill' | 'seasonal'

    Returns:
        Series with imputed values
    """
    if method == 'linear':
        return series.interpolate(method='linear')
    elif method == 'forward_fill':
        return series.fillna(method='ffill')
    else:
        # Default to linear
        return series.interpolate(method='linear')
