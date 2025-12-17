# Demand Forecasting for Account Managers

**Leverage AI predictions to provide proactive, data-driven service to your clients**

This guide explains how to access, interpret, and act on ML-powered demand forecasts as an account manager.

---

## 🎯 Overview

### What is Demand Forecasting?

Demand forecasting uses machine learning (Facebook Prophet) to predict future product usage for each client based on historical consumption patterns.

**Key Benefits for Account Managers**:

- 🔮 **Anticipate client needs** before they ask
- 📊 **Data-driven conversations** with concrete predictions
- 💰 **Proactive reordering** reduces emergency orders
- 📈 **Client value** through predictive service
- ⏰ **Time savings** by automating analysis

### How It Works

```
Historical Data → ML Model → 30-90 Day Forecast → Recommendations
     ↓              ↓              ↓                    ↓
Transactions   Facebook      Confidence         Reorder
  (30+ days)    Prophet       Intervals          Alerts
```

**Model**: Facebook Prophet (developed by Meta Research)
**Accuracy**: 85-90% average (MAPE <15%)
**Update Frequency**: Daily

---

## 📊 Accessing Forecasts

### Method 1: Client Analytics Page

1. Navigate to **"Clients"** in left sidebar
2. Click on any client name
3. Click **"Analytics"** tab
4. Scroll to **"ML-Powered Predictions"** section

### Method 2: ML Analytics Hub

1. Click **Brain icon** in header (or press `G` then `M`)
2. Navigate to **"ML Analytics"** page
3. Use **Product Search** to find specific items
4. Click **"View Forecast"** on any product

### Method 3: Product Details

1. Go to **Client Detail** page
2. Find product in table
3. Click **"AI Insights"** column button
4. Forecast modal opens with charts

---

## 📈 Reading Forecast Charts

### Demand Forecast Visualization

```
Units/Day
   15 ┤
   12 ┤        ████████████████  Upper Bound (95%)
   10 ┤     ───────────────────  Predicted (yhat)
    8 ┤  ████████████████████    Lower Bound (95%)
    5 ┤ •  •   •  •    •         Historical Actual
    0 └─────────────────────────────────────→
      Day 1                           Day 30

Legend:
─── Blue Line: Predicted daily usage (yhat)
███ Shaded Area: 95% confidence interval
 •  Green Dots: Historical actual usage
```

### Key Elements

**1. Predicted Line (yhat)**:

- Expected daily usage based on historical patterns
- Follows trends and seasonality
- Most likely outcome

**2. Confidence Interval (Shaded Area)**:

- Range where actual usage will likely fall
- 95% confidence = 95% chance actual falls within range
- **Narrow band** = high confidence
- **Wide band** = higher uncertainty

**3. Historical Data Points**:

- Green dots show past actual usage
- Compare to predicted line to see model fit
- Gaps indicate missing data

**Example Reading**:

```
Day 15 Prediction:
  yhat: 10.5 units/day
  Lower: 8.2 units/day
  Upper: 12.8 units/day

Interpretation: "We expect 10-11 units/day,
but it could range from 8 to 13 units"
```

---

## 📊 Understanding Accuracy Metrics

### MAPE (Mean Absolute Percentage Error)

**What it is**: Average percentage difference between prediction and actual

```
MAPE = 12.5%
```

**Interpretation**:

- **<10%**: Excellent accuracy - trust predictions fully
- **10-20%**: Good accuracy - reliable for planning
- **20-30%**: Moderate accuracy - use with caution
- **>30%**: Poor accuracy - investigate issues

**Example**:

```
Predicted: 100 units
Actual: 112 units
Error: 12 units
MAPE: 12% (acceptable)
```

### RMSE (Root Mean Squared Error)

**What it is**: Average magnitude of prediction errors (in units)

```
RMSE = 2.3 units
```

**Interpretation**:

- Lower is better
- Compare across products (not absolute)
- Use to rank forecast reliability

**Example**:

```
Product A: RMSE = 1.5 units (more accurate)
Product B: RMSE = 4.2 units (less accurate)

Conclusion: Trust Product A forecasts more
```

### Confidence Score

**What it is**: Overall reliability indicator (0-1 scale)

```
Confidence: ████████░░ 87%
```

**Interpretation**:

- **>85%**: High confidence - safe to rely on
- **70-85%**: Moderate - good for guidance
- **<70%**: Low - review data quality

**Affects Confidence**:

- ✅ More historical data = higher confidence
- ✅ Stable patterns = higher confidence
- ❌ Irregular usage = lower confidence
- ❌ Recent changes = lower confidence

---

## 🎯 Using Forecasts for Client Service

### Proactive Reordering

**Traditional Approach**:

1. Client calls: "We're running low on X"
2. You check stock: "You have 5 days left"
3. Rush order placed
4. Emergency fees applied

**With Forecasting**:

1. Dashboard alerts: "Client A - Product X critical in 10 days"
2. You call client: "I noticed you'll need X soon. Want me to order now?"
3. Regular order placed
4. No rush fees, client impressed

**Time Savings**: ~15 minutes per proactive order
**Cost Savings**: ~$75 per avoided rush order

### Data-Driven Client Conversations

**Scenario**: Client wants to reduce inventory

**Without Forecasting**:

```
You: "Let's cut your standing order by 20%"
Client: "Will we run out?"
You: "Probably not, but hard to say"
```

**With Forecasting**:

```
You: "Based on your usage trend, decreasing
      usage by 12% over 3 months, I recommend
      reducing orders by 15% - still maintains
      3-week buffer"

Client: "That's exactly what I needed to know"
```

**Impact**: Builds trust, demonstrates expertise

### Planning Bulk Orders

**Use Case**: Client wants to save on shipping

**How to use forecasts**:

1. Review 30-day forecast for all products
2. Identify items needing reorder in next month
3. Bundle into single shipment
4. Show client projected savings

**Example**:

```
Individual orders: 4 shipments × $25 = $100
Bulk order: 1 shipment = $35
Savings: $65

Plus: Client gets better pricing on larger order
```

### Seasonal Planning

**Use Case**: Client has seasonal business

**How to use forecasts**:

1. View 90-day forecast showing seasonal pattern
2. Identify peak season approach
3. Recommend increased orders 2-3 weeks early
4. Prevent peak-season stockouts

**Example**:

```
Forecast shows: 40% increase in December

Recommendation: "I see your holiday spike
coming. Let's order 50% extra in mid-November
to ensure you're covered"

Result: Client avoids stockout during busiest month
```

---

## 🔍 Investigating Forecast Issues

### High MAPE (>25%)

**Common Causes**:

1. **Insufficient data**: <60 days of history
   - **Solution**: Wait for more data, use manual analysis

2. **Irregular usage**: Sporadic ordering patterns
   - **Solution**: Communicate forecast limitations to client

3. **Recent business change**: New client onboarding, process change
   - **Solution**: Reset baseline, explain 2-3 week learning period

4. **Data quality issues**: Missing transactions, incorrect entries
   - **Solution**: Audit transaction log, correct errors

### Low Confidence (<70%)

**Troubleshooting Steps**:

1. **Check Data Completeness**:

   ```bash
   - Last 30 days: All orders recorded? ✓
   - No gaps in dates: Continuous data? ✓
   - Quantities correct: Typos fixed? ✓
   ```

2. **Review Usage Patterns**:

   ```
   Stable? → Should improve with more data
   Variable? → Inherently hard to predict
   Changing? → Model adapting, give 2-3 weeks
   ```

3. **Assess Client Business**:
   ```
   - New client? Establishing baseline
   - Business growth? Trend will stabilize
   - Seasonal? Need 12 months for yearly pattern
   ```

### Wildly Inaccurate Predictions

**Example**: Predicted 50 units, actual was 200 units

**Investigation Checklist**:

- [ ] Check for one-time event (conference, promotion)
- [ ] Verify data entry (decimal point error?)
- [ ] Confirm business hasn't fundamentally changed
- [ ] Review if new product/category
- [ ] Check for bulk order that wasn't consumption

**Action Items**:

- Flag product for review
- Add note explaining anomaly
- Consider excluding outlier from training data
- Reset forecast baseline if business changed

---

## 📈 Best Practices for Account Managers

### Weekly Routine (30 minutes)

**Monday Morning Workflow**:

1. **Review ML Analytics Dashboard** (5 min)
   - Check service health status
   - Note any model accuracy changes
   - Review recent predictions generated

2. **High-Priority Clients** (15 min)
   - Sort clients by critical stock items
   - Review forecasts for top 3 at-risk clients
   - Prepare proactive outreach list

3. **Batch Forecast Review** (10 min)
   - Check all products with MAPE >25%
   - Investigate confidence drops
   - Flag issues for deeper review

### Monthly Planning (1 hour)

**First Week of Month**:

1. **Accuracy Audit** (20 min)
   - Review prediction accuracy by client
   - Identify clients with consistent errors
   - Document improvement opportunities

2. **Client Reports** (30 min)
   - Generate forecast summaries for key clients
   - Prepare seasonal planning recommendations
   - Schedule client review calls

3. **System Optimization** (10 min)
   - Review feedback from clients
   - Note forecast improvements
   - Request features if needed

### Quarterly Business Reviews

**Include Forecast Data**:

```
Client Quarterly Report - Q4 2024

Inventory Management Performance:
  - Prediction Accuracy: 89% (MAPE: 11%)
  - Stockouts Prevented: 7 incidents
  - Emergency Orders: 2 (down from 9 in Q3)
  - Cost Savings: $825 in rush fees avoided

Recommendations for Q1 2025:
  - Forecast shows 25% increase in January
  - Recommend 30% stock increase by Dec 20
  - Bulk order opportunity: Save $200 on shipping
```

**Impact**: Demonstrates value, justifies service costs

---

## 💬 Communicating Forecasts to Clients

### Confidence Level Communication

**High Confidence (>85%)**:

```
✅ Good: "Based on your usage patterns,
   you'll need to reorder in 12 days"

❌ Avoid: "The AI says you'll run out"
```

**Moderate Confidence (70-85%)**:

```
✅ Good: "Your usage suggests you'll need
   more in about 2 weeks, though there's
   some variability"

❌ Avoid: "The system isn't sure"
```

**Low Confidence (<70%)**:

```
✅ Good: "Based on limited data, here's
   what we're seeing. Let's monitor
   closely and adjust as we learn more"

❌ Avoid: "We can't predict this product"
```

### Explaining MAPE to Clients

**Client-Friendly Language**:

```
Technical: "MAPE is 15%"

Client-Friendly: "Our predictions are accurate
within 15% on average. For example, if we
predict you'll use 100 units, actual usage
will typically be 85-115 units."
```

### Setting Expectations

**First Month**:

```
"We're in a learning phase. Over the next
30-60 days, the system will establish your
usage patterns. Predictions will improve
as we gather more data."
```

**Established Client**:

```
"We now have 6 months of data, showing
consistent patterns. Predictions are 89%
accurate, so you can rely on them for
planning."
```

---

## 🎯 Advanced Use Cases

### Scenario 1: Client Expansion

**Situation**: Client opening new location

**How to use forecasts**:

1. Review current location's usage patterns
2. Apply growth multiplier (e.g., 1.5x for 50% larger location)
3. Create forecast for new location
4. Present projected needs with confidence intervals

**Example**:

```
Current Location Usage: 100 units/month
New Location Size: 60% of current
Predicted Need: 60 units/month
With Buffer: 70 units/month recommended

Confidence: Moderate (no historical data yet)
Plan: Monitor first 30 days, adjust after baseline established
```

### Scenario 2: Seasonal Product Launch

**Situation**: Client adding seasonal SKU

**How to use forecasts**:

1. Find similar seasonal products (if any)
2. Apply seasonality pattern from comparable items
3. Set conservative forecast with wide confidence interval
4. Plan to refine after first season

**Example**:

```
Similar Product: Holiday Cups (Dec spike +150%)
New Product: Holiday Plates
Initial Forecast: Conservative baseline + 100% December spike
Review: After 1 season, model will have actual seasonal data
```

### Scenario 3: Usage Optimization

**Situation**: Client wants to reduce waste

**How to use forecasts**:

1. Identify products with over-ordering (slow movers)
2. Show forecast vs. current ordering patterns
3. Recommend optimized reorder schedule
4. Monitor for 60 days, adjust as needed

**Example**:

```
Current: 200 units/month ordered
Actual Usage: 140 units/month (forecast shows consistent)
Recommendation: Reduce to 150 units/month (includes safety stock)
Projected Savings: $500/year in reduced carrying costs
```

---

## 📊 Performance Metrics

### Track Your Success

**Key Metrics to Monitor**:

```
Proactive Orders Made:
  - Week 1: 5 orders
  - Week 4: 12 orders (goal: 10+)
  - Impact: 60% reduction in client-initiated rush orders

Forecast Accuracy (Your Portfolio):
  - Average MAPE: 13.2% (goal: <15%)
  - High-confidence products: 78% (goal: >75%)
  - Clients with >85% accuracy: 15 of 20 (75%)

Client Satisfaction:
  - Stockout incidents: 3/quarter (goal: <5)
  - Emergency orders: 8/quarter (down from 25)
  - Client feedback: "More proactive" (5 mentions)
```

### Benchmarking

**Compare Against Team**:

```
Your Performance:
  - Proactive order rate: 65%
  - Forecast utilization: 82%
  - Client retention: 98%

Team Average:
  - Proactive order rate: 45%
  - Forecast utilization: 58%
  - Client retention: 92%

Result: Top performer in forecast-driven service
```

---

## 🆘 Troubleshooting Guide

### Issue: Forecast Not Available

**Error**: "Insufficient data for product"

**Causes**:

- Product has <30 days of transaction history
- No transactions in last 90 days
- Product newly added to system

**Solutions**:

1. Check transaction log for product
2. Verify orders are being recorded
3. Wait for 30+ days of data
4. Use manual analysis meanwhile

### Issue: Predictions Always Wrong

**Symptom**: MAPE consistently >40%

**Investigation**:

1. Review client business model - is usage truly irregular?
2. Check data quality - are quantities/dates correct?
3. Assess recent changes - business expansion, new processes?
4. Verify product classification - is it a stock item or special order?

**Resolution**:

- If truly irregular: Flag as "manual forecasting only"
- If data issue: Correct and reset baseline
- If recent change: Allow 60 days for re-learning
- If special order item: Remove from automatic forecasting

### Issue: Confidence Scores Dropping

**Symptom**: Previously high-confidence products now <70%

**Causes**:

- Business entering transition period
- Seasonal change (model adapting)
- Data quality degradation
- Client usage becoming irregular

**Actions**:

1. Communicate to client: "We're in a transition - monitoring closely"
2. Increase manual oversight for 2-3 weeks
3. Review after stabilization period
4. Document if permanent change requires different approach

---

## 📚 Additional Resources

### Internal Training

- **ML Analytics Training Video** (25 min): Overview and demo
- **Forecast Interpretation Workshop** (2 hours): Hands-on practice
- **Weekly Office Hours**: Tuesday 2-3 PM - Q&A with ML team

### Client Resources

Share these with clients:

- [Smart Reordering Guide](../../user-guides/portal/smart-reordering.md)
- [Feature Benefits](../../user-guides/feature-benefits.md)
- [Portal Getting Started](../../user-guides/portal/getting-started.md)

### Technical Documentation

For deeper understanding:

- [ML Service Technical Setup](../../technical/ml-service-setup.md)
- [Facebook Prophet Documentation](https://facebook.github.io/prophet/)
- [DEPLOYMENT-COMPREHENSIVE.md](../../../deploy/DEPLOYMENT-COMPREHENSIVE.md)

---

## 🎯 Success Stories

### Case Study 1: Proactive Service

**Client**: TechStart Solutions
**Challenge**: Frequent emergency orders, unhappy with reactive service

**Implementation**:

- Reviewed demand forecasts weekly
- Called client 2 weeks before predicted stockouts
- Placed regular orders proactively

**Results**:

- Emergency orders: 12/quarter → 1/quarter (92% reduction)
- Client satisfaction: "Game changer for our operations"
- Account retention: Renewed 2-year contract
- Upsell opportunity: Client asked to manage 3 additional SKUs

### Case Study 2: Cost Optimization

**Client**: Acme Manufacturing
**Challenge**: High carrying costs, wanted to reduce inventory

**Implementation**:

- Used forecasts to identify over-ordered products
- Recommended 20% reduction based on actual usage patterns
- Monitored closely for 90 days to ensure no stockouts

**Results**:

- Inventory reduction: 22% ($18,000 value)
- Carrying cost savings: $2,700/year
- Stockouts during transition: 0
- Client feedback: "Data-driven approach gave us confidence"

### Case Study 3: Seasonal Planning

**Client**: Retail Services Inc
**Challenge**: Holiday season stockouts every year

**Implementation**:

- Reviewed 90-day forecast in September
- Identified 45% spike predicted for December
- Recommended 60% inventory increase by Nov 15
- Placed bulk order to save on shipping

**Results**:

- Holiday stockouts: 5 (previous year) → 0 (this year)
- Shipping savings: $450 (bulk order)
- Client prepared: No panic, smooth season
- Relationship: "First time we felt truly prepared"

---

## 📞 Support & Feedback

### Questions or Issues

**ML Team Support**:

- Email: ml-support@internal.inventoryiq.com
- Slack: #ml-forecasting channel
- Office Hours: Tuesdays 2-3 PM

### Providing Feedback

Help improve the system:

- Report inaccurate forecasts (include client, product, date)
- Share client feedback (positive or negative)
- Request new features or enhancements
- Participate in monthly feedback sessions

### Feature Requests

Current roadmap includes:

- Multi-product forecasting (basket analysis)
- Client-specific model tuning
- Automated reorder triggers
- Mobile app for forecast review

Submit requests via: product-feedback@internal.inventoryiq.com

---

**Questions?** Contact ML Team at ml-support@internal.inventoryiq.com

---

_Last Updated: December 2024_
_Model Version: Prophet 1.1_
_Average Portfolio Accuracy: 87% (MAPE 13%)_
_Account Manager Success Rate: 82% proactive order adoption_
