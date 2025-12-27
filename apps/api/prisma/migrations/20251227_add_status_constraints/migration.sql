-- Add CHECK constraints for all status fields
-- This prevents invalid status values from being inserted into the database
-- and ensures data integrity across the application.

-- ===========================================================================
-- ImportBatch.status
-- Valid values match validation-schemas.ts importStatusSchema
-- ===========================================================================
ALTER TABLE import_batches
ADD CONSTRAINT import_batches_status_check
CHECK (status IN ('pending', 'processing', 'post_processing', 'completed', 'completed_with_errors', 'failed', 'rolled_back'));

-- ===========================================================================
-- Transaction.orderStatus
-- Valid values: completed, canceled, pending, processing
-- ===========================================================================
ALTER TABLE transactions
ADD CONSTRAINT transactions_order_status_check
CHECK (LOWER(order_status) IN ('completed', 'canceled', 'cancelled', 'pending', 'processing', 'shipped', 'delivered'));

-- ===========================================================================
-- Alert.status
-- Valid values: active, resolved, dismissed, snoozed
-- ===========================================================================
ALTER TABLE alerts
ADD CONSTRAINT alerts_status_check
CHECK (status IN ('active', 'resolved', 'dismissed', 'snoozed'));

-- ===========================================================================
-- OrderRequest.status
-- Valid values match the workflow: DRAFT→SUBMITTED→ACKNOWLEDGED→CHANGES_REQUESTED→ON_HOLD→FULFILLED
-- Plus: approved, pending, cancelled, rejected
-- ===========================================================================
ALTER TABLE order_requests
ADD CONSTRAINT order_requests_status_check
CHECK (LOWER(status) IN ('draft', 'submitted', 'acknowledged', 'changes_requested', 'on_hold', 'fulfilled', 'approved', 'pending', 'cancelled', 'rejected'));

-- ===========================================================================
-- Shipment.status
-- Valid values: pending, label_created, in_transit, out_for_delivery, delivered, exception
-- ===========================================================================
ALTER TABLE shipments
ADD CONSTRAINT shipments_status_check
CHECK (status IN ('pending', 'label_created', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'cancelled'));

-- ===========================================================================
-- ShipmentEvent.status
-- Same as Shipment status (represents status at time of event)
-- ===========================================================================
ALTER TABLE shipment_events
ADD CONSTRAINT shipment_events_status_check
CHECK (status IN ('pending', 'label_created', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'cancelled', 'picked_up', 'processing'));

-- ===========================================================================
-- Artwork.status
-- Valid values: draft, submitted, under_review, approved, rejected, changes_requested, cancelled
-- ===========================================================================
ALTER TABLE artworks
ADD CONSTRAINT artworks_status_check
CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'changes_requested', 'cancelled'));

-- ===========================================================================
-- Todo.status
-- Valid values: pending, in_progress, blocked, completed, cancelled
-- ===========================================================================
ALTER TABLE todos
ADD CONSTRAINT todos_status_check
CHECK (status IN ('pending', 'in_progress', 'blocked', 'completed', 'cancelled'));

-- ===========================================================================
-- Report.status
-- Valid values: generating, ready, failed
-- ===========================================================================
ALTER TABLE reports
ADD CONSTRAINT reports_status_check
CHECK (status IN ('generating', 'ready', 'failed'));

-- ===========================================================================
-- Budget.status
-- Valid values: under, on_track, over
-- ===========================================================================
ALTER TABLE budgets
ADD CONSTRAINT budgets_status_check
CHECK (status IN ('under', 'on_track', 'over'));

-- ===========================================================================
-- DiagnosticResult.status
-- Valid values: PASS, FAIL, WARN, INFO
-- NOTE: Table may not exist yet - wrapped in DO block to handle gracefully
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'diagnostic_results') THEN
    ALTER TABLE diagnostic_results
    ADD CONSTRAINT diagnostic_results_status_check
    CHECK (status IN ('PASS', 'FAIL', 'WARN', 'INFO'));
  END IF;
END $$;
