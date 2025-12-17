"""
FastAPI Data Science Analytics Service
Provides advanced usage calculation and inventory intelligence
"""
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import logging
import structlog
import os

from models.database import get_db, Product, Client
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
    ConfidenceInterval
)
from services.usage_calculator import UsageCalculator
from services.data_validator import DataValidator
from utils.statistical import (
    calculate_weeks_remaining,
    classify_stock_status,
    predict_stockout_date,
    calculate_reorder_quantity
)

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

@app.get("/health", response_model=HealthCheckResponse)
async def health_check(db: Session = Depends(get_db)):
    """Health check endpoint"""
    try:
        # Test database connection
        db.execute("SELECT 1")
        db_connected = True
    except Exception:
        db_connected = False

    return HealthCheckResponse(
        status="healthy" if db_connected else "unhealthy",
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
            if usage_result.monthly_usage_units > 0:
                reorder_info = calculate_reorder_quantity(
                    monthly_usage=usage_result.monthly_usage_units,
                    lead_time_days=14,  # Could get from client config
                    safety_stock_weeks=2,
                    current_stock=product.current_stock_packs or 0,
                    pack_size=product.pack_size or 1
                )

                reorder_suggestion = ReorderSuggestion(**reorder_info)

            # Validate
            validation_msgs = validator.validate_usage_result(usage_result, product)

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
    Background task to recalculate usage for all client products
    """
    from models.database import SessionLocal

    db = SessionLocal()

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

            except Exception as e:
                logger.error(
                    "product_calculation_failed",
                    product_id=product_id,
                    error=str(e)
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
