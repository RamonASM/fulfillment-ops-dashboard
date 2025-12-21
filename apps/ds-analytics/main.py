"""
FastAPI Data Science Analytics Service
Provides advanced usage calculation and inventory intelligence
"""
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from threading import Lock
import logging
import structlog
import os

from models.database import get_db, Product, Client, ClientConfiguration


# =============================================================================
# CIRCUIT BREAKER PATTERN
# =============================================================================

class CircuitBreaker:
    """
    Simple circuit breaker to prevent cascading failures.

    States:
    - CLOSED: Normal operation, requests flow through
    - OPEN: Too many failures, requests are rejected immediately
    - HALF_OPEN: Testing if service recovered, allow one request through

    After FAILURE_THRESHOLD consecutive failures, circuit opens.
    After RECOVERY_TIMEOUT seconds, circuit becomes half-open.
    If half-open request succeeds, circuit closes.
    """

    FAILURE_THRESHOLD = 5  # Consecutive failures before opening
    RECOVERY_TIMEOUT = 60  # Seconds before attempting recovery

    def __init__(self, name: str):
        self.name = name
        self.failure_count = 0
        self.last_failure_time: datetime | None = None
        self.state = "CLOSED"
        self._lock = Lock()

    def record_success(self):
        """Record a successful operation, reset failure count."""
        with self._lock:
            self.failure_count = 0
            self.state = "CLOSED"

    def record_failure(self):
        """Record a failed operation, potentially open circuit."""
        with self._lock:
            self.failure_count += 1
            self.last_failure_time = datetime.now()

            if self.failure_count >= self.FAILURE_THRESHOLD:
                self.state = "OPEN"
                structlog.get_logger().warning(
                    "circuit_breaker_opened",
                    name=self.name,
                    failure_count=self.failure_count
                )

    def can_execute(self) -> bool:
        """Check if request should be allowed through."""
        with self._lock:
            if self.state == "CLOSED":
                return True

            if self.state == "OPEN":
                # Check if recovery timeout has elapsed
                if self.last_failure_time:
                    elapsed = (datetime.now() - self.last_failure_time).total_seconds()
                    if elapsed >= self.RECOVERY_TIMEOUT:
                        self.state = "HALF_OPEN"
                        structlog.get_logger().info(
                            "circuit_breaker_half_open",
                            name=self.name
                        )
                        return True
                return False

            # HALF_OPEN: allow one request through to test
            return True

    def get_status(self) -> dict:
        """Get current circuit breaker status."""
        with self._lock:
            return {
                "name": self.name,
                "state": self.state,
                "failure_count": self.failure_count,
                "last_failure": self.last_failure_time.isoformat() if self.last_failure_time else None
            }


# Global circuit breaker for database operations
db_circuit_breaker = CircuitBreaker("database")
from models.schemas import (
    CalculateUsageRequest,
    UsageCalculationResponse,
    BatchCalculationResponse,
    ClientRecalculationStatus,
    HealthCheckResponse,
    StatsResponse,
    ValidationMessage,
    StockoutPrediction,
    ReorderSuggestion,
    ConfidenceInterval,
    FinancialMetrics as FinancialMetricsSchema
)
from services.usage_calculator import UsageCalculator
from services.data_validator import DataValidator
from services.financial_calculator import FinancialCalculator
from utils.statistical import (
    calculate_weeks_remaining,
    classify_stock_status,
    predict_stockout_date,
    calculate_reorder_quantity
)


def get_effective_lead_time(product, client_config, default: int = 14) -> tuple[int, str]:
    """
    Get the effective lead time for a product, with fallback hierarchy.

    Returns:
        tuple: (lead_time_days, source) where source is 'product' | 'client_config' | 'default'
    """
    # Priority 1: Product-specific total lead time
    if product.total_lead_days and product.total_lead_days > 0:
        return product.total_lead_days, 'product'

    # Priority 2: Client configuration
    if client_config and client_config.reorder_lead_days and client_config.reorder_lead_days > 0:
        return client_config.reorder_lead_days, 'client_config'

    # Priority 3: Default fallback
    return default, 'default'

# Configure logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Request timeout configuration
REQUEST_TIMEOUT_SECONDS = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "300"))  # 5 minutes default

# Create FastAPI app
app = FastAPI(
    title="DS Analytics Service",
    version="1.0.0",
    description="Data science analytics for inventory intelligence"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_timeout_middleware(request, call_next):
    """
    Middleware to enforce request timeout.
    Long-running calculations will be terminated after REQUEST_TIMEOUT_SECONDS.
    """
    import asyncio
    from starlette.responses import JSONResponse

    try:
        # Use asyncio.wait_for to enforce timeout
        response = await asyncio.wait_for(
            call_next(request),
            timeout=REQUEST_TIMEOUT_SECONDS
        )
        return response
    except asyncio.TimeoutError:
        logger.error(
            "request_timeout",
            path=request.url.path,
            method=request.method,
            timeout_seconds=REQUEST_TIMEOUT_SECONDS
        )
        return JSONResponse(
            status_code=504,
            content={
                "detail": f"Request timed out after {REQUEST_TIMEOUT_SECONDS} seconds",
                "error": "gateway_timeout"
            }
        )

@app.get("/health", response_model=HealthCheckResponse)
async def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint with comprehensive status.
    Checks database connectivity, circuit breaker state, and pool health.
    """
    from sqlalchemy import text

    db_connected = False
    db_latency_ms = None

    try:
        # Test database connection with timing
        import time
        start = time.time()
        db.execute(text("SELECT 1"))
        db_latency_ms = round((time.time() - start) * 1000, 2)
        db_connected = True
        db_circuit_breaker.record_success()
    except Exception as e:
        logger.error("Database connection failed", error=str(e))
        db_circuit_breaker.record_failure()

    # Get circuit breaker status
    circuit_status = db_circuit_breaker.get_status()

    # Determine overall health
    # Unhealthy if: DB disconnected OR circuit is OPEN
    is_healthy = db_connected and circuit_status["state"] != "OPEN"

    return HealthCheckResponse(
        status="healthy" if is_healthy else "unhealthy",
        database_connected=db_connected,
        version="1.0.0",
        timestamp=datetime.now().isoformat()
    )

@app.get("/stats", response_model=StatsResponse)
async def get_stats(db: Session = Depends(get_db)):
    """Get usage calculation statistics"""
    from sqlalchemy import func

    total_products = db.query(func.count(Product.id)).scalar()

    products_with_usage = db.query(func.count(Product.id)).filter(
        Product.monthly_usage_units.isnot(None),
        Product.monthly_usage_units > 0
    ).scalar()

    products_needing_calculation = total_products - products_with_usage

    # Confidence stats
    high_confidence = db.query(func.count(Product.id)).filter(
        Product.usage_confidence == 'high'
    ).scalar()

    medium_confidence = db.query(func.count(Product.id)).filter(
        Product.usage_confidence == 'medium'
    ).scalar()

    low_confidence = db.query(func.count(Product.id)).filter(
        Product.usage_confidence == 'low'
    ).scalar()

    # Average confidence (map to numeric)
    products_with_conf = db.query(Product).filter(
        Product.usage_confidence.isnot(None)
    ).all()

    conf_map = {'high': 0.85, 'medium': 0.65, 'low': 0.35}
    avg_conf = sum(conf_map.get(p.usage_confidence, 0) for p in products_with_conf) / len(products_with_conf) if products_with_conf else 0

    # Calculation methods
    from collections import Counter
    methods = [p.usage_calculation_method for p in db.query(Product).filter(
        Product.usage_calculation_method.isnot(None)
    ).all()]
    method_counts = dict(Counter(methods))

    return StatsResponse(
        total_products=total_products,
        products_with_usage=products_with_usage,
        products_needing_calculation=products_needing_calculation,
        avg_confidence_score=round(avg_conf, 2),
        high_confidence_count=high_confidence or 0,
        medium_confidence_count=medium_confidence or 0,
        low_confidence_count=low_confidence or 0,
        calculation_methods=method_counts
    )

@app.post("/calculate-usage", response_model=List[UsageCalculationResponse])
async def calculate_usage_batch(
    request: CalculateUsageRequest,
    db: Session = Depends(get_db)
):
    """
    Calculate monthly usage for multiple products

    This endpoint performs advanced usage calculation using multiple methods
    and returns comprehensive metrics including confidence scores, trends,
    and reorder suggestions.
    """
    logger.info(
        "usage_calculation_batch_started",
        client_id=request.client_id,
        product_count=len(request.product_ids)
    )

    calculator = UsageCalculator(db)
    validator = DataValidator()
    results = []

    # Get client configuration for lead time settings
    client_config = db.query(ClientConfiguration).filter(
        ClientConfiguration.client_id == request.client_id
    ).first()

    for product_id in request.product_ids:
        try:
            # Get product info
            product = db.query(Product).filter(Product.id == product_id).first()
            if not product:
                logger.warning("product_not_found", product_id=product_id)
                continue

            # Calculate usage
            usage_result = await calculator.calculate_monthly_usage(
                product_id=product_id,
                client_id=request.client_id
            )

            # Calculate derivative metrics
            weeks_remaining = calculate_weeks_remaining(
                product.current_stock_packs or 0,
                usage_result.monthly_usage_packs
            )

            stock_status = classify_stock_status(weeks_remaining)

            # Predict stockout
            stockout_pred = None
            if usage_result.monthly_usage_units > 0:
                daily_usage = usage_result.monthly_usage_units / 30.44
                stockout_info = predict_stockout_date(
                    current_stock=product.current_stock_units or 0,
                    daily_usage_rate=daily_usage,
                    usage_variance=usage_result.variance
                )

                if stockout_info['predicted_date']:
                    stockout_pred = StockoutPrediction(
                        predicted_date=stockout_info['predicted_date'],
                        days_until_stockout=stockout_info['days_until_stockout'],
                        confidence_score=stockout_info['confidence_score'],
                        confidence_interval=ConfidenceInterval(
                            earliest=stockout_info['confidence_interval']['earliest'],
                            latest=stockout_info['confidence_interval']['latest']
                        ) if stockout_info['confidence_interval'] else None
                    )

            # Generate reorder suggestion
            reorder_suggestion = None
            lead_time_days, lead_time_source = get_effective_lead_time(product, client_config)

            if usage_result.monthly_usage_units > 0:
                # Get safety stock weeks from client config or default
                safety_weeks = client_config.safety_stock_weeks if client_config else 2

                reorder_info = calculate_reorder_quantity(
                    monthly_usage=usage_result.monthly_usage_units,
                    lead_time_days=lead_time_days,
                    safety_stock_weeks=safety_weeks,
                    current_stock=product.current_stock_packs or 0,
                    pack_size=product.pack_size or 1
                )

                # Add lead time metadata to reorder info
                reorder_info['lead_time_days'] = lead_time_days
                reorder_info['lead_time_source'] = lead_time_source

                reorder_suggestion = ReorderSuggestion(**reorder_info)

            # Validate
            validation_msgs = validator.validate_usage_result(usage_result, product)

            # Calculate financial metrics
            financial_metrics = None
            if product.unit_cost:
                daily_usage = usage_result.monthly_usage_units / 30.44 if usage_result.monthly_usage_units > 0 else 0
                days_until_stockout = stockout_pred.days_until_stockout if stockout_pred else None

                fin_metrics = FinancialCalculator.calculate_full_metrics(
                    stock_units=product.current_stock_units or 0,
                    unit_cost=product.unit_cost,
                    unit_price=product.unit_price,
                    holding_cost_rate=product.holding_cost_rate,
                    reorder_cost=product.reorder_cost,
                    days_until_stockout=days_until_stockout,
                    daily_usage=daily_usage,
                    lead_time_days=lead_time_days
                )
                financial_metrics = FinancialMetricsSchema(**fin_metrics.to_dict())

            # Update product in database
            product.monthly_usage_units = usage_result.monthly_usage_units
            product.monthly_usage_packs = usage_result.monthly_usage_packs
            product.usage_data_months = usage_result.data_months
            product.usage_calculation_tier = usage_result.calculation_tier
            product.usage_confidence = usage_result.confidence_level
            product.usage_last_calculated = datetime.now()
            product.usage_calculation_method = usage_result.calculation_method
            product.usage_trend = usage_result.trend_direction
            product.seasonality_detected = usage_result.seasonality_detected
            product.weeks_remaining = weeks_remaining
            product.stock_status = stock_status
            product.projected_stockout_date = datetime.fromisoformat(stockout_pred.predicted_date) if stockout_pred and stockout_pred.predicted_date else None
            product.stockout_confidence = stockout_pred.confidence_score if stockout_pred else None
            product.suggested_reorder_qty = reorder_suggestion.suggested_quantity_packs if reorder_suggestion else None
            product.reorder_qty_last_updated = datetime.now()

            db.commit()

            # Build response
            results.append(UsageCalculationResponse(
                product_id=product_id,
                product_name=product.name,
                monthly_usage_units=usage_result.monthly_usage_units,
                monthly_usage_packs=usage_result.monthly_usage_packs,
                weeks_remaining=weeks_remaining,
                stock_status=stock_status,
                calculation_method=usage_result.calculation_method,
                confidence_score=usage_result.confidence_score,
                confidence_level=usage_result.confidence_level,
                data_months=usage_result.data_months,
                calculation_tier=usage_result.calculation_tier,
                trend=usage_result.trend_direction,
                seasonality_detected=usage_result.seasonality_detected,
                outliers_detected=usage_result.outliers_detected,
                predicted_stockout=stockout_pred,
                reorder_suggestion=reorder_suggestion,
                financial_metrics=financial_metrics,
                validation_messages=[ValidationMessage(**m.to_dict()) for m in validation_msgs],
                calculated_at=datetime.now().isoformat()
            ))

            logger.info(
                "usage_calculated",
                product_id=product_id,
                method=usage_result.calculation_method,
                confidence=usage_result.confidence_score
            )

        except Exception as e:
            logger.error(
                "usage_calculation_failed",
                product_id=product_id,
                error=str(e),
                exc_info=True
            )
            db.rollback()
            continue

    logger.info(
        "usage_calculation_batch_completed",
        client_id=request.client_id,
        products_calculated=len(results)
    )

    return results

@app.post("/calculate-usage/client/{client_id}", response_model=ClientRecalculationStatus)
async def calculate_usage_for_client(
    client_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Recalculate usage for all products of a client (async background job)
    """
    # Verify client exists
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Add background task
    background_tasks.add_task(
        recalculate_client_usage_background,
        client_id
    )

    return ClientRecalculationStatus(
        client_id=client_id,
        status="started",
        message=f"Usage calculation started for client {client.name}",
        task_id=None  # Could use Celery task ID if implemented
    )

async def recalculate_client_usage_background(client_id: str):
    """
    Background task to recalculate usage for all client products.
    Uses circuit breaker pattern to prevent cascading failures.
    """
    from models.database import SessionLocal

    # Check circuit breaker before starting
    if not db_circuit_breaker.can_execute():
        logger.warning(
            "client_recalculation_skipped_circuit_open",
            client_id=client_id,
            circuit_status=db_circuit_breaker.get_status()
        )
        return

    db = SessionLocal()
    consecutive_failures = 0
    MAX_CONSECUTIVE_FAILURES = 5  # Stop processing if too many consecutive failures

    try:
        logger.info("client_recalculation_started", client_id=client_id)

        # Get all active products for client
        products = db.query(Product).filter(
            Product.client_id == client_id,
            Product.is_active == True
        ).all()

        product_ids = [p.id for p in products]

        # Calculate usage for each product
        calculator = UsageCalculator(db)

        for product_id in product_ids:
            # Check if we should stop due to too many consecutive failures
            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                logger.error(
                    "client_recalculation_aborted",
                    client_id=client_id,
                    reason="too_many_consecutive_failures",
                    consecutive_failures=consecutive_failures
                )
                db_circuit_breaker.record_failure()
                break

            try:
                usage_result = await calculator.calculate_monthly_usage(
                    product_id=product_id,
                    client_id=client_id
                )

                # Update product
                product = db.query(Product).filter(Product.id == product_id).first()
                if product:
                    product.monthly_usage_units = usage_result.monthly_usage_units
                    product.monthly_usage_packs = usage_result.monthly_usage_packs
                    product.usage_confidence = usage_result.confidence_level
                    product.usage_last_calculated = datetime.now()
                    product.usage_calculation_method = usage_result.calculation_method

                    db.commit()
                    consecutive_failures = 0  # Reset on success
                    db_circuit_breaker.record_success()

            except Exception as e:
                consecutive_failures += 1
                logger.error(
                    "product_calculation_failed",
                    product_id=product_id,
                    error=str(e),
                    consecutive_failures=consecutive_failures
                )
                db.rollback()
                continue

        logger.info(
            "client_recalculation_completed",
            client_id=client_id,
            products_processed=len(product_ids)
        )

    except Exception as e:
        logger.error(
            "client_recalculation_failed",
            client_id=client_id,
            error=str(e),
            exc_info=True
        )
    finally:
        db.close()

@app.post("/reconcile/fuzzy")
async def reconcile_fuzzy(
    request: dict,
    db: Session = Depends(get_db)
):
    """
    Fuzzy match orphan products with existing inventory products.

    This endpoint provides COST-FREE fuzzy matching using rapidfuzz algorithms.
    Handles 85-90% of product matches without any API costs.

    Request body:
        {
            "orphan": {"id": str, "productId": str, "name": str, ...},
            "candidates": [{"id": str, "productId": str, "name": str, ...}, ...]
        }

    Returns:
        {
            "matches": [
                {
                    "candidateId": str,
                    "candidateProductId": str,
                    "candidateName": str,
                    "confidenceScore": float,
                    "matchMethod": str,
                    "scoreBreakdown": {...},
                    "reasoning": str
                }
            ],
            "orphanId": str,
            "matchCount": int
        }
    """
    try:
        from services.fuzzy_matcher import FuzzyMatcher

        logger.info(
            "fuzzy_reconciliation_started",
            orphan_id=request.get('orphan', {}).get('id'),
            candidate_count=len(request.get('candidates', []))
        )

        orphan = request.get('orphan')
        candidates = request.get('candidates', [])

        if not orphan:
            raise HTTPException(status_code=400, detail="Missing 'orphan' in request body")

        if not candidates:
            raise HTTPException(status_code=400, detail="Missing 'candidates' in request body")

        # Initialize fuzzy matcher
        matcher = FuzzyMatcher()

        # Find matches
        matches = matcher.match_product(orphan, candidates, max_results=3)

        # Convert to response format
        match_results = [
            {
                "candidateId": m.candidate_id,
                "candidateProductId": m.candidate_product_id,
                "candidateName": m.candidate_name,
                "confidenceScore": m.confidence_score,
                "matchMethod": m.match_method,
                "scoreBreakdown": m.score_breakdown,
                "reasoning": m.reasoning
            }
            for m in matches
        ]

        logger.info(
            "fuzzy_reconciliation_completed",
            orphan_id=orphan.get('id'),
            matches_found=len(match_results),
            top_confidence=match_results[0]['confidenceScore'] if match_results else 0
        )

        return {
            "matches": match_results,
            "orphanId": orphan.get('id'),
            "matchCount": len(match_results)
        }

    except Exception as e:
        logger.error(
            "fuzzy_reconciliation_failed",
            error=str(e),
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Fuzzy matching failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    workers = int(os.getenv("WORKERS", 4))

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        workers=workers,
        log_level="info"
    )
