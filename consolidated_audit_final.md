# Consolidated & Final Audit Report

**Objective:** This document represents a final, consolidated audit, synthesizing the findings from my own deep code review, a provided list of recent changes, and a report from another auditor (Codex). It identifies multiple, independent, critical-severity bugs that are causing the import system to fail. This report provides a single, prioritized action plan to resolve all known issues.

---

## Executive Summary

The import system is in a critically flawed state. While recent changes have improved the Python environment detection, the audit has uncovered several severe bugs and architectural issues that guarantee failure. The user's report that imports are still not working is expected given the state of the code.

**Key Critical Findings (Consolidated):**

1.  **Incorrect File Path Resolution:** The Node.js API constructs incorrect, non-existent file paths to pass to the Python script, ensuring it can never find the data file. (Finding from both my audit and Codex's).
2.  **Logic Bug Preventing Import Completion:** A `ReferenceError` bug in the Node.js code physically prevents any successful import from ever being marked as "completed." It will get stuck in "post_processing" forever. (My finding).
3.  **Database Constraint Violations:** The Python script fails to set required default values for certain columns (`order_status`, `item_type`), which will cause the database to reject the data with a `NOT NULL` constraint violation. (Codex's finding).
4.  **Performance Bottleneck for Excel:** Large Excel files are loaded entirely into memory, which will cause timeouts or crashes, completely bypassing the chunking mechanism. (Codex's finding).

**Conclusion:** To fix the import system, **all four of these critical issues must be addressed.** The following plan provides the exact solutions for each.

---

## Part 1: Critical Bug Fixes (Must Be Implemented)

### **Bug #1: Incorrect File Path Resolution**

**Problem:** The Node.js API constructs an invalid absolute path (e.g., `/var/www/inventory/apps/api/uploads/...`) when the file actually lives at `/var/www/inventory/uploads/...`. The Python script fails instantly with "File not found."

**Solution:** Simplify all path logic to be relative to the `monorepoRoot`, which is set as the `cwd` for the Python process.

-   **File:** `apps/api/src/routes/import.routes.ts`
-   **Action:** In the `POST /:importId/confirm` handler, replace the path resolution and `spawn` call.

-   **Replace this block:**
    ```typescript
    // OLD, BUGGY CODE
    const monorepoRoot = getMonorepoRoot();
    const apiDir = path.join(monorepoRoot, "apps", "api");
    const absoluteFilePath = path.join(apiDir, importBatch.filePath!);
    const absoluteMappingFilePath = path.join(apiDir, mappingFilePath);
    const pythonProcess = spawn(
      pythonCmd,
      [
        path.join(monorepoRoot, "apps", "python-importer", "main.py"),
        process.env.DATABASE_URL,
        importId,
        absoluteFilePath, // Incorrect path
        importBatch.importType!,
        absoluteMappingFilePath, // Incorrect path
      ],
      { cwd: monorepoRoot, ... }
    );
    ```
-   **With this corrected block:**
    ```typescript
    // NEW, CORRECTED CODE
    const monorepoRoot = getMonorepoRoot();

    // Paths should be relative to the monorepo root, which is the cwd for the python process
    const relativeFilePath = importBatch.filePath!; // e.g., 'uploads/file-123.csv'
    const relativeMappingPath = mappingFilePath; // e.g., 'uploads/file-123.csv.mapping.json'

    const pythonProcess = spawn(
      pythonCmd,
      [
        path.join("apps", "python-importer", "main.py"), // Relative to cwd
        process.env.DATABASE_URL!,
        importId,
        relativeFilePath, // Correct path
        importBatch.importType!,
        relativeMappingPath, // Correct path
      ],
      {
        cwd: monorepoRoot, // The process will run from the project root
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      },
    );
    ```

### **Bug #2: Imports Stuck in "post_processing" State**

**Problem:** A `ReferenceError` in the `on("close", ...)` handler crashes the Node.js process right before it can mark a successful import as "completed."

**Solution:** Declare the `postProcessingError` variable in the correct scope.

-   **File:** `apps/api/src/routes/import.routes.ts`
-   **Action:** In the `pythonProcess.on("close", ...)` callback, modify the logic.

-   **Replace this block:**
    ```typescript
    // OLD, BUGGY CODE
    if (code === 0) {
      // ...
      try {
        await recalculateClientUsage(importBatch.clientId);
        await runAlertGeneration(importBatch.clientId);
      } catch (calcError) {
        console.error("Post-import calculation error:", calcError);
        postProcessingError = calcError as Error; // Variable does not exist in outer scope
      }
      // ...
      await prisma.importBatch.update({
        where: { id: importId },
        data: {
          status: postProcessingError ? "completed_with_errors" : "completed", // This will crash
          // ...
        },
      });
    }
    ```
-   **With this corrected block:**
    ```typescript
    // NEW, CORRECTED CODE
    if (code === 0) {
      await prisma.importBatch.update({
        where: { id: importId },
        data: { status: "post_processing" },
      });

      let postProcessingError: Error | null = null; // CORRECT: Declared in proper scope
      try {
        await recalculateClientUsage(importBatch.clientId);
        await runAlertGeneration(importBatch.clientId);
      } catch (calcError) {
        console.error("Post-import calculation error:", calcError);
        postProcessingError = calcError as Error;
      }

      await prisma.importBatch.update({
        where: { id: importId },
        data: {
          status: postProcessingError ? "completed_with_errors" : "completed",
          completedAt: new Date(),
          ...(postProcessingError && {
            errors: {
              push: { message: "Post-processing failed", details: postProcessingError.message },
            },
          }),
        },
      });
    } // ...
    ```

### **Bug #3: Missing Database Defaults in Python Script**

**Problem:** The Python script's use of `df.reindex` creates `None` values for columns not present in the source CSV, which then causes database `NOT NULL` constraint violations because the database `DEFAULT` values are ignored.

**Solution:** After reindexing, explicitly set default values for required columns in the Python script.

-   **File:** `apps/python-importer/main.py`
-   **Action:** Modify the `clean_inventory_data` and `clean_orders_data` functions.

-   **In `clean_inventory_data`:**
    ```python
    # ... after df.reindex(...)
    if 'item_type' not in df or df['item_type'].isnull().all():
        df['item_type'] = 'evergreen'
    return df
    ```
-   **In `clean_orders_data`:**
    ```python
    # ... after df.reindex(...)
    if 'order_status' not in df or df['order_status'].isnull().all():
        df['order_status'] = 'completed'
    if 'quantity_packs' not in df:
        df['quantity_packs'] = 0
    if 'quantity_units' not in df:
        df['quantity_units'] = 0
    return df
    ```

---

## Part 2: Performance & Operational Fixes

### **Issue #1: Excel Memory Bottleneck**

**Problem:** The Python script loads entire Excel files into memory, which will fail for large files.

**Solution:** This requires a more significant refactoring of the file reading logic in `main.py`. The `pd.read_csv` function has a `chunksize` parameter, but `pd.read_excel` does not. The best approach is to use a library like `openpyxl` in read-only, streaming mode to process the file row-by-row without loading it all at once. This is a complex task and should be treated as a high-priority follow-up after the critical bugs are fixed.

### **Issue #2: Improved Python Environment Validation**

**Problem:** The `getPythonCommand` function is not specific enough when a dependency check fails.

**Solution:** Implement the more specific version of the function that checks each dependency individually.

-   **File:** `apps/api/src/routes/import.routes.ts`
-   **Action:** Replace the `getPythonCommand` function with this version.

    ```typescript
    function getPythonCommand(): string {
      const monorepoRoot = getMonorepoRoot();
      const possiblePaths = [
        path.join(monorepoRoot, "apps", "python-importer", "venv", "bin", "python"), // Prioritize venv
        "python3",
        "python",
      ];
      const requiredDependencies = ["pandas", "sqlalchemy", "psycopg2", "openpyxl"];

      for (const cmd of possiblePaths) {
        try {
          execSync(`${cmd} --version`, { stdio: "ignore" });
          for (const dep of requiredDependencies) {
            try {
              execSync(`${cmd} -c "import ${dep}"`, { stdio: "ignore" });
            } catch (depError) {
              throw new Error(`Python found at ${cmd}, but is missing dependency: '${dep}'`);
            }
          }
          console.log(`[Import] Using validated Python environment: ${cmd}`);
          return cmd;
        } catch (err) {
          console.warn(`[Import] Python path '${cmd}' failed validation:`, (err as Error).message);
        }
      }
      throw new Error("A valid Python environment with all required dependencies could not be found.");
    }
    ```

---

## Final Prioritized Action Plan

1.  **[CRITICAL]** Fix the **File Path Resolution** logic in `import.routes.ts`.
2.  **[CRITICAL]** Fix the **"Stuck in post_processing"** bug in `import.routes.ts`.
3.  **[CRITICAL]** Add the **Database Default** guards in `apps/python-importer/main.py`.
4.  **[HIGH]** Implement the improved **Python Environment Validation** (`getPythonCommand`) to get clear error messages about the environment.
5.  **[HIGH]** Investigate and fix the **Excel Memory Bottleneck** by implementing a streaming reader.
6.  **[VERIFY]** Confirm that the **`snake_case` data contract change** I identified previously is consistent between the Node.js `columnMapping` and the Python `rename_map`. If not, this must be fixed.

Addressing these issues, in this order, will resolve the cascading failures and create a stable foundation for the import system.