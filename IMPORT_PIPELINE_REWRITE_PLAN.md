# Import Pipeline Complete Rewrite Plan

**Date:** December 18, 2025
**Based on:** `/Users/aerialshotsmedia/import_pipeline_rewrite_audit_codex.md`
**Status:** Ready for Implementation

---

## Executive Summary

The import system has critical issues across all layers causing:
- Imports stuck in "Processing" forever (missing `/imports/:id` route)
- Multi-file uploads 404 (missing `/upload-multiple` route)
- Progress showing ">100%" (rowCount from preview, not actual file)
- "Python file not found" errors (path resolution mismatch)
- Failed imports showing as "completed" (exit code/status overwrites)

**Total Changes Required:** 3 files major rewrite, 3 files type updates

---

## Phase 1: Node.js Import Routes Rewrite

**File:** `apps/api/src/routes/import.routes.ts`

### 1.1 Fix ESM __dirname Crash (Lines 1-10)

```typescript
import { fileURLToPath } from "url";
import { dirname } from "path";

// Define __dirname for ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

### 1.2 Implement Missing Routes (12 endpoints needed)

| Priority | Endpoint | Purpose |
|----------|----------|---------|
| P0 | `GET /:importId` | Poll status - UNBLOCKS MODAL |
| P0 | `POST /upload-multiple` | Multi-file upload |
| P0 | `GET /history` | Import history list |
| P1 | `PATCH /:importId` | Change import type |
| P1 | `POST /:importId/analyze` | Impact analysis |
| P1 | `GET /:importId/diff` | Data comparison |
| P2 | `DELETE /:importId` | Cancel pending |
| P2 | `DELETE /:importId/data` | Rollback import |
| P2 | `DELETE /client/:clientId/data` | Full wipe |
| P2 | `POST /recalculate/:clientId` | Trigger refresh |
| P3 | `GET /custom-fields/:clientId` | List fields |
| P3 | `POST /custom-fields/:clientId` | Create field |
| P3 | `PATCH /custom-fields/:fieldId` | Update field |

### 1.3 Fix File Path Strategy (Lines 72-87, 288-302)

**Problem:** Relative paths cause Python to fail finding files.

**Solution:** Store and pass absolute paths:
```typescript
// Upload handler
const importBatch = await prisma.importBatch.create({
  data: {
    filePath: req.file.path,  // Absolute from multer
    rowCount: 0,  // Initialize to 0, not preview length
  }
});

// Confirm handler - pass absolute paths to Python
spawn(pythonCmd, [
  path.join(monorepoRoot, "apps/python-importer/main.py"),
  process.env.DATABASE_URL,
  importId,
  importBatch.filePath,  // Already absolute
  importBatch.importType,
  absoluteMappingPath,
]);
```

### 1.4 Fix Status Preservation (Lines 319-373)

**Problem:** Node overwrites Python's status unconditionally.

**Solution:** Read DB status after Python exits:
```typescript
pythonProcess.on("close", async (code) => {
  const pythonBatch = await prisma.importBatch.findUnique({ where: { id: importId } });

  if (code === 0 || code === 2) {
    // Run post-processing, preserve Python's status
    const finalStatus = pythonBatch.status === "completed_with_errors"
      ? "completed_with_errors"
      : "completed";
    await prisma.importBatch.update({ data: { status: finalStatus } });
  } else {
    // Keep Python's failed status and errors
    // Don't overwrite
  }
});
```

### 1.5 Fix Confirm Response (Lines 388-389)

**Current:** Returns `{ message }` only
**Required:** Return full batch status for frontend:
```typescript
res.json({
  id: importBatch.id,
  status: importBatch.status,
  processedCount: 0,
  rowCount: 0,
  message: "Import process started"
});
```

### 1.6 Add Concurrent Import Lock (New, ~Line 240)

```typescript
const processingImport = await prisma.importBatch.findFirst({
  where: {
    clientId: importBatch.clientId,
    status: { in: ['processing', 'post_processing'] },
  },
});
if (processingImport) {
  throw new ValidationError("Another import is processing for this client");
}
```

---

## Phase 2: Python Importer Fixes

**File:** `apps/python-importer/main.py`

### 2.1 Fix Exit Code Strategy (Lines 723-751)

**Problem:** Always exits 0, even on failure.

**Solution:**
```python
# After setting status, before sys.exit:
if import_batch.status == 'completed':
    exit_code = 0
elif import_batch.status == 'completed_with_errors':
    exit_code = 2  # New: partial success
else:  # failed
    exit_code = 1

sys.exit(exit_code)
```

### 2.2 Fix Session Leak (Lines 537, 750-751)

**Problem:** `next(get_db())` bypasses cleanup on sys.exit.

**Solution:** Use context manager:
```python
# In database.py, add:
@contextmanager
def get_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# In main.py:
with get_db_session() as db:
    # All processing here
    sys.exit(exit_code)  # finally still runs
```

### 2.3 Fix NaN → "nan" Bug (Lines 449-514)

**Problem:** String coercion before NaN handling creates "nan" strings.

**Solution:** Handle NaN BEFORE string operations:
```python
# At START of clean function:
for col in df.columns:
    df[col] = df[col].where(pd.notna(df[col]), None)

# THEN do string operations
# At END, re-apply:
for col in df.columns:
    df[col] = df[col].where(pd.notna(df[col]), None)
```

### 2.4 Fix Orphan Product Defaults (Lines 644-664)

**Problem:** Missing item_type, notification_point, feedback_count, product_metadata.

**Solution:**
```python
orphan_defaults = {
    'item_type': 'evergreen',
    'notification_point': 0,
    'feedback_count': 0,
    'product_metadata': {},
    'is_active': True,
    'is_orphan': True,
    'pack_size': 1,
    'current_stock_packs': 0,
    'current_stock_units': 0,
}

orphan = {
    'id': new_uuid,
    'client_id': str(import_batch.clientId),
    'product_id': pid_str,
    'name': pid_str,
    **orphan_defaults
}
```

### 2.5 Handle importType="both" (Lines 577-615)

**Problem:** Only handles "inventory" or "orders", not "both".

**Solution:**
```python
if import_type in ['inventory', 'both']:
    inventory_rows = chunk[has_inventory_required_fields]
    if len(inventory_rows) > 0:
        cleaned_inv = clean_inventory_data(inventory_rows)
        # process inventory...

if import_type in ['orders', 'both']:
    order_rows = chunk[has_order_required_fields]
    if len(order_rows) > 0:
        cleaned_ord = clean_orders_data(order_rows)
        # process orders...
```

### 2.6 Progress Accuracy - Track Dropped Rows (Lines 530, 686-696)

```python
# Track three metrics:
raw_rows = len(chunk)
cleaned_rows = len(cleaned_chunk)  # After dropna
committed_rows = inserted_count

dropped_rows = raw_rows - cleaned_rows
import_batch.droppedCount += dropped_rows  # Add to model

emit_progress("chunk_completed", {
    "raw_rows": raw_rows,
    "valid_rows": cleaned_rows,
    "committed_rows": committed_rows,
    "dropped_rows": dropped_rows,
})
```

---

## Phase 3: Frontend Type Fixes

### 3.1 Update Status Types

**Files to update:**
- `apps/web/src/pages/Imports.tsx` (line 29)
- `apps/web/src/components/ImportModal.tsx` (line 216)
- `apps/web/src/components/widgets/ImportActivityWidget.tsx` (line 21)

**Add to status union:**
```typescript
status: "pending" | "processing" | "post_processing" | "completed" | "completed_with_errors" | "failed" | "rolled_back"
```

### 3.2 Add Status Config (Imports.tsx lines 43-65)

```typescript
post_processing: {
  icon: RefreshCw,
  color: "text-blue-500 bg-blue-50",
  label: "Finalizing",
},
completed_with_errors: {
  icon: AlertTriangle,
  color: "text-amber-500 bg-amber-50",
  label: "Completed with Errors",
},
```

### 3.3 Fix Progress Display (ImportModal.tsx lines 1053-1057)

```typescript
{importProgress?.status === "post_processing"
  ? "Calculating usage metrics..."
  : "This may take a few moments"
}
```

---

## Phase 4: Database Schema (Optional)

**File:** `apps/api/prisma/schema.prisma`

Add indexes for performance:
```prisma
@@index([clientId, status, createdAt])
@@index([clientId, completedAt])
```

Add droppedCount field:
```prisma
droppedCount Int @default(0) @map("dropped_count")
```

---

## Implementation Order

### Day 1: Unblock UI (Critical Path)
1. [ ] Fix ESM __dirname in import.routes.ts
2. [ ] Implement `GET /:importId` endpoint
3. [ ] Implement `POST /upload-multiple` endpoint
4. [ ] Implement `GET /history` endpoint
5. [ ] Fix confirm response to return full status

### Day 2: Fix Python Core Issues
6. [ ] Fix exit code strategy (0/1/2)
7. [ ] Add context manager for session
8. [ ] Fix NaN → "nan" bug
9. [ ] Fix orphan product defaults
10. [ ] Handle importType="both"

### Day 3: Integration & Polish
11. [ ] Update Node.js to handle exit code 2
12. [ ] Add concurrent import lock
13. [ ] Update frontend status types
14. [ ] Add status configs for new states
15. [ ] Test full flow end-to-end

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `apps/api/src/routes/import.routes.ts` | Major rewrite (add 12 routes, fix paths, status) | P0 |
| `apps/python-importer/main.py` | Exit codes, session, NaN, orphans, both-type | P0 |
| `apps/python-importer/database.py` | Add context manager | P1 |
| `apps/web/src/pages/Imports.tsx` | Status types + config | P1 |
| `apps/web/src/components/ImportModal.tsx` | Status types + progress text | P1 |
| `apps/web/src/components/widgets/ImportActivityWidget.tsx` | Status types | P2 |

---

## Success Criteria

After implementation:
- [ ] Single file upload completes without hanging
- [ ] Multi-file upload works (POST /upload-multiple)
- [ ] Progress bar shows 0-100% accurately
- [ ] Failed imports show as "failed" (not "completed")
- [ ] Partial failures show as "completed_with_errors"
- [ ] Import history page loads data
- [ ] Dashboard widget shows recent imports
- [ ] No "Python file not found" errors
- [ ] No session/connection pool exhaustion

---

## Testing Checklist

```bash
# Unit tests
npm run test:api -- --grep "import"

# Manual tests
1. Upload 100-row CSV → completes, progress accurate
2. Upload 10,000-row CSV → completes, no timeout
3. Upload file with 30% invalid dates → completed_with_errors
4. Upload 3 files simultaneously → all process correctly
5. Cancel mid-import → status = failed
6. View /imports page → history loads
7. Check dashboard widget → shows recent imports
```

---

*Plan generated from parallel deep analysis of Node.js routes, Python importer, and frontend components.*
