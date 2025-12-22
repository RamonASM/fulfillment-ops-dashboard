"""
Financial Calculator Service
Provides inventory cost and value calculations for DS Analytics
"""
from typing import Optional, Dict, Any
from dataclasses import dataclass
from decimal import Decimal


@dataclass
class FinancialMetrics:
    """Financial metrics for a product"""
    inventory_value: Optional[float] = None
    daily_holding_cost: Optional[float] = None
    monthly_holding_cost: Optional[float] = None
    annual_holding_cost: Optional[float] = None
    reorder_cost: Optional[float] = None
    stockout_risk_cost: Optional[float] = None
    total_inventory_investment: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "inventory_value": self.inventory_value,
            "daily_holding_cost": self.daily_holding_cost,
            "monthly_holding_cost": self.monthly_holding_cost,
            "annual_holding_cost": self.annual_holding_cost,
            "reorder_cost": self.reorder_cost,
            "stockout_risk_cost": self.stockout_risk_cost,
            "total_inventory_investment": self.total_inventory_investment,
        }


class FinancialCalculator:
    """
    Calculator for inventory financial metrics.

    Uses unit cost, holding cost rate, and stock levels to compute
    the financial impact of inventory decisions.
    """

    DEFAULT_HOLDING_COST_RATE = 0.25  # 25% annual holding cost is industry standard

    @staticmethod
    def calculate_inventory_value(
        stock_units: int,
        unit_cost: Optional[float]
    ) -> Optional[float]:
        """
        Calculate the total value of current inventory.

        Args:
            stock_units: Current stock in units
            unit_cost: Cost per unit

        Returns:
            Total inventory value or None if unit_cost not available
        """
        if unit_cost is None or unit_cost <= 0:
            return None
        return round(stock_units * unit_cost, 2)

    @staticmethod
    def calculate_holding_costs(
        stock_units: int,
        unit_cost: Optional[float],
        holding_cost_rate: Optional[float] = None
    ) -> Dict[str, Optional[float]]:
        """
        Calculate inventory holding costs at different time intervals.

        Holding cost represents the cost of storing inventory, including
        storage, insurance, depreciation, and opportunity cost.

        Args:
            stock_units: Current stock in units
            unit_cost: Cost per unit
            holding_cost_rate: Annual holding cost as decimal (e.g., 0.25 for 25%)

        Returns:
            Dictionary with daily, monthly, and annual holding costs
        """
        if unit_cost is None or unit_cost <= 0:
            return {
                "daily": None,
                "monthly": None,
                "annual": None
            }

        rate = holding_cost_rate if holding_cost_rate else FinancialCalculator.DEFAULT_HOLDING_COST_RATE
        inventory_value = stock_units * unit_cost
        annual_cost = inventory_value * rate

        return {
            "daily": round(annual_cost / 365, 2),
            "monthly": round(annual_cost / 12, 2),
            "annual": round(annual_cost, 2)
        }

    @staticmethod
    def calculate_economic_order_quantity(
        annual_demand: float,
        order_cost: float,
        unit_cost: float,
        holding_cost_rate: Optional[float] = None
    ) -> Optional[float]:
        """
        Calculate Economic Order Quantity (EOQ) using the Wilson formula.

        EOQ = sqrt((2 * D * S) / H)
        where:
            D = Annual demand
            S = Order/setup cost
            H = Annual holding cost per unit

        Args:
            annual_demand: Expected annual demand in units
            order_cost: Cost to place one order
            unit_cost: Cost per unit
            holding_cost_rate: Annual holding cost rate as decimal

        Returns:
            Optimal order quantity or None if inputs invalid
        """
        import math

        if any(v is None or v <= 0 for v in [annual_demand, order_cost, unit_cost]):
            return None

        rate = holding_cost_rate if holding_cost_rate else FinancialCalculator.DEFAULT_HOLDING_COST_RATE
        holding_cost_per_unit = unit_cost * rate

        if holding_cost_per_unit <= 0:
            return None

        eoq = math.sqrt((2 * annual_demand * order_cost) / holding_cost_per_unit)
        return round(eoq, 0)

    @staticmethod
    def calculate_stockout_risk_cost(
        days_until_stockout: Optional[int],
        daily_usage: float,
        unit_price: Optional[float],
        lead_time_days: int
    ) -> Optional[float]:
        """
        Estimate the potential cost of a stockout scenario.

        This represents lost revenue if stock runs out before reorder arrives.

        Args:
            days_until_stockout: Predicted days until stockout
            daily_usage: Average daily usage in units
            unit_price: Selling price per unit
            lead_time_days: Days to receive new inventory

        Returns:
            Potential revenue loss during stockout period
        """
        if days_until_stockout is None or unit_price is None or unit_price <= 0:
            return None

        # If stockout is predicted before lead time, calculate potential loss
        if days_until_stockout < lead_time_days:
            days_without_stock = lead_time_days - days_until_stockout
            lost_units = daily_usage * days_without_stock
            return round(lost_units * unit_price, 2)

        return 0.0

    @staticmethod
    def calculate_full_metrics(
        stock_units: int,
        unit_cost: Optional[float],
        unit_price: Optional[float] = None,
        holding_cost_rate: Optional[float] = None,
        reorder_cost: Optional[float] = None,
        days_until_stockout: Optional[int] = None,
        daily_usage: float = 0,
        lead_time_days: int = 14
    ) -> FinancialMetrics:
        """
        Calculate complete financial metrics for a product.

        Args:
            stock_units: Current stock in units
            unit_cost: Cost per unit
            unit_price: Selling price per unit
            holding_cost_rate: Annual holding cost rate
            reorder_cost: Cost to place one order
            days_until_stockout: Predicted days until stockout
            daily_usage: Average daily usage in units
            lead_time_days: Days to receive new inventory

        Returns:
            FinancialMetrics dataclass with all calculated values
        """
        inventory_value = FinancialCalculator.calculate_inventory_value(
            stock_units, unit_cost
        )

        holding_costs = FinancialCalculator.calculate_holding_costs(
            stock_units, unit_cost, holding_cost_rate
        )

        stockout_risk = FinancialCalculator.calculate_stockout_risk_cost(
            days_until_stockout,
            daily_usage,
            unit_price,
            lead_time_days
        )

        return FinancialMetrics(
            inventory_value=inventory_value,
            daily_holding_cost=holding_costs["daily"],
            monthly_holding_cost=holding_costs["monthly"],
            annual_holding_cost=holding_costs["annual"],
            reorder_cost=reorder_cost,
            stockout_risk_cost=stockout_risk,
            total_inventory_investment=inventory_value
        )
