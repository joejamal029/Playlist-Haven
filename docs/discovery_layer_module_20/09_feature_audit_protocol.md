[PROMPT 9: FEATURE AUDIT & VERIFICATION]
System Instruction: Activate Feature-Level Verification Engine (Silent Failure Elimination) v5

CONTEXT:
The build is in progress or complete. Code exists. Features have been implemented across many files. But "implemented" does not mean "working." In large applications with hundreds of features, a feature can be structurally present — functions exist, components render, handlers are wired — and yet be functionally dead. An empty loop. A hardcoded value where a database query should be. A state transition that skips a critical check. A math calculation using the wrong input.

These are silent failures. They don't crash the app. They don't throw errors. They don't fail tests (because the tests check what was coded, not what was specified). They sit invisibly in production, corrupting data, bypassing constraints, and lying to users through fabricated outputs.

Phase 8's verification gates catch structural bug categories (schema mismatches, dead handlers, signature alignment). Phase 9 operates at a fundamentally different level: it verifies that each FEATURE — as a complete behavioral unit spanning multiple files — fulfills its contractual obligation as defined in the PRD.

This is not a testing protocol. This is a feature-by-feature forensic audit.

---

## §1. WHEN THIS RUNS

Phase 9 is not a one-time pass. It runs at multiple points:

| Trigger | Scope | Depth |
|---------|-------|-------|
| **Phase Boundary** (end of each architects_vision.md phase) | All FEAT-IDs completed in that phase | Full audit |
| **Mid-Build Checkpoint** (every 15-20 tasks) | FEAT-IDs touched by recent tasks | Targeted audit |
| **Pre-Release Gate** (before presenting "build complete") | ALL FEAT-IDs in the entire project | Exhaustive audit |
| **Post-Fix Verification** (after any bug fix batch) | FEAT-IDs affected by the fixes + their dependents | Regression-focused audit |
| **User-Triggered** (on demand) | User-specified FEAT-IDs | Custom scope |

At Phase Boundaries, Phase 9 runs AFTER Phase 8's Phase Completion Report (§6) and BEFORE user approval to proceed to the next phase. If Phase 9 finds failures, they must be resolved before the phase is approved.

---

## §2. THE FEATURE REGISTRY

Before any audit can run, the agent must construct or update the **Feature Registry** — a living document that maps every FEAT-ID to its complete code footprint.

### Registry Format

Create or update `_audit/feature_registry.md`:

```markdown
# Feature Registry: [Project Name]
**Last updated:** [date]
**Source:** PRD.md FEAT-IDs + codebase trace
**Total features:** [N] MVP + [N] Post-MVP = [N] total
**Verified:** [N] / [N]

---

## FEAT-001: [Feature Name]
**PRD Priority:** [P0/P1/P2/P3]
**Status:** [UNBUILT | IMPLEMENTED | TRACED | VERIFIED | FAILED]
**Last verified:** [date or "never"]

### Acceptance Criteria (from PRD.md)
- [ ] [Criterion 1 — copied verbatim from PRD.md]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

### Code Footprint
| Layer | File | Functions/Components | Role |
|-------|------|---------------------|------|
| Schema | src/db/schema.sql | CREATE TABLE [x] | Data definition |
| Service | src/services/[x]Service.ts | createX(), getX(), updateX() | Business logic |
| Engine | src/engine/[x]Engine.ts | calculateY(), validateZ() | Pure computation |
| Store | src/stores/[x]Store.ts | useXStore() | State management |
| Screen | src/screens/[X]Screen.tsx | [X]Screen component | User interface |
| Component | src/components/[X]Card.tsx | [X]Card component | UI sub-component |

### Cross-Feature Dependencies
| Depends on | How | Critical? |
|-----------|-----|-----------|
| FEAT-XXX | Calls [function] from [file] | Yes — feature fails without it |
| FEAT-YYY | Reads [table] populated by FEAT-YYY | No — degrades gracefully |

### Dependents (features that depend on THIS one)
| Feature | How |
|---------|-----|
| FEAT-ZZZ | Imports [function] from this feature's service |

### Verification History
| Date | Result | Failures Found | Fixed? |
|------|--------|----------------|--------|
[Appended after each audit run]

---
[Repeat for every FEAT-ID]
```

### Building the Registry — Tooling-First Protocol

Manually reading every file to build a registry is unsustainable at scale. The agent MUST use tooling to construct the registry efficiently, then validate with targeted reads.

**Step 1: Automated Discovery (tooling-first)**
1. **Start from PRD.md:** List every FEAT-ID with its name, priority, and acceptance criteria.
2. **Trace through architects_vision.md:** For each FEAT-ID, find every deliverable that references it. List the files each deliverable is expected to touch.
3. **Tooling sweep:** For each file identified by the vision + your tasks/todo.md:
   - `grep -rn "FEAT-XXX"` across the codebase to find all references
   - `grep -rn "functionName\|className"` to find callers and importers
   - `grep -rn "tableName"` in service/repository layers to find all DB operations on feature-related tables
   - Use the IDE/editor's "find all references" or equivalent for cross-file dependency mapping
   - For JS/TS projects: `grep -rn "import.*from.*featureFile"` to map the import graph
4. **Build the footprint table** from tooling output — don't read files line-by-line to discover what's there.

**Step 2: Targeted Validation (manual reads)**
5. **Read only the functions identified by tooling.** Verify they perform meaningful work (not stubs). This is where human-level judgment applies — but on a pre-filtered set, not the entire codebase.
6. **Map dependencies:** For each function in the footprint, check if it calls functions from other FEAT-IDs or is called by them.

**Step 3: Gap Detection**
7. **Reverse trace:** `grep -rn "FEAT-"` across the entire codebase. Any FEAT-ID found in code but NOT in the registry indicates an untracked feature implementation.
8. **Orphan detection:** For every exported function in feature-related files, `grep` for callers. Zero callers = orphaned code.

**Critical Rule:** If a FEAT-ID from PRD.md has NO code footprint — no files, no functions, nothing — it is an **Unimplemented Feature**. Flag it immediately. This is the most severe class of silent failure: a feature that was specified, planned, and "completed" but never actually built.

---

## §5. PROOF OF LIFE

A feature is not VERIFIED by reading its code. Code can look correct and still be wrong. **Reading the code and deciding it works is a proof of plausibility, not a proof of life.** A feature is VERIFIED when the agent can demonstrate an **observable chain of causation** backed by **execution evidence**.

### Proof Types

| Type | What It Means | When Required |
|------|--------------|---------------|
| **STATIC** | Agent traces the chain by reading code. No runtime execution. | P2/P3 features; or when test infra doesn't exist yet |
| **EXECUTED** | Agent triggers the feature and observes runtime behavior: runs a test, hits an endpoint, executes a command, or triggers a UI action and checks the result. | P0/P1 features — **mandatory** |

STATIC proof catches code-level breaks (missing imports, wrong signatures, stub bodies). EXECUTED proof catches runtime breaks (type errors at runtime, missing env vars, incorrect query results, failed constraint checks that only surface with real data). Both are necessary; neither is sufficient alone.

### The Proof Chain
For each acceptance criterion in PRD.md:

```
PROOF OF LIFE: FEAT-XXX — [Feature Name]
Criterion: "[acceptance criterion text]"
Proof type: [STATIC | EXECUTED]

Chain:
  → User action: [What the user does — e.g., "taps Create List"]
  → Handler: [file:function — e.g., src/screens/NewListScreen.tsx:handleCreateList]
  → Service call: [file:function — e.g., src/services/listService.ts:createList]
  → DB operation: [exact SQL — e.g., INSERT INTO lists (id, title, status...) VALUES (?, ?, 'active'...)]
  → Schema match: [Verified — all columns exist, all NOT NULL columns present]
  → Constraint check: [file:function — e.g., src/engine/listEngine.ts:validateActiveListCount]
  → State update: [store:action — e.g., useListStore:setActiveList]
  → UI reflection: [component:binding — e.g., DashboardScreen reads useListStore.activeList]
  → Observable output: [What the user sees — e.g., "New list appears in dashboard with status 'active'"]

Execution evidence (if EXECUTED):
  → Method: [test run | API call | CLI command | UI interaction]
  → Command: [exact command or action taken — e.g., `npm test -- --grep "createList"` or `curl -X POST /api/lists`]
  → Result: [actual output observed — e.g., "Test passes: 'creates list with active status'" or "HTTP 201, body: {id: 'xxx', status: 'active'}"]
  → DB verification: [query run to confirm state — e.g., `SELECT * FROM lists WHERE id = 'xxx'` returns expected row]

Verdict: ✅ ALIVE — full chain verified, execution confirmed
```

If ANY link in the chain is broken (function doesn't exist, SQL has wrong columns, handler is a stub, state isn't consumed by UI), the verdict is:

```
Verdict: ❌ DEAD — chain breaks at [Service call]: createList calls generateId()
  which is imported from utils but utils file does not export generateId
```

If the static chain looks intact but execution fails:

```
Verdict: ❌ DEAD (RUNTIME) — static chain intact but execution failed:
  Command: npm test -- --grep "createList"
  Error: "TypeError: Cannot read property 'id' of undefined at listService.ts:42"
  Root cause: [analysis of why the runtime failure occurs despite correct-looking code]
```

### Execution Evidence Methods

The agent should use the **lightest method that provides sufficient evidence:**

| Method | When to Use | Evidence Produced |
|--------|------------|-------------------|
| **Run existing test** | Test exists for this feature | Test pass/fail + output |
| **Run type checker** | TypeScript/typed language | Compilation success for feature files |
| **Hit API endpoint** | Backend feature with exposed route | HTTP response code + body |
| **Run CLI command** | CLI feature or DB operation | Command output |
| **Execute script** | Complex feature needing custom verification | Script output + assertions |
| **Run app + smoke test** | UI feature at phase boundary | App boots + feature renders + action produces result |

**If no execution method is available** (no test infra, no running server, no CLI): document this explicitly and downgrade to STATIC proof with a flag:
```
Proof type: STATIC (EXECUTION UNAVAILABLE — no test infrastructure)
Execution debt: [What would need to exist to execute this proof — e.g., "needs integration test for /api/lists endpoint"]
```
Execution debt items are added to tasks/todo.md as tasks.

### Proof Depth Tiers

Not every feature needs the same depth of proof:

| Feature Priority | Proof Depth | Proof Type | What's Required |
|-----------------|-------------|------------|-----------------|
| **P0 (Critical)** | Full chain | **EXECUTED** | Every acceptance criterion gets a complete Proof of Life chain with runtime evidence |
| **P1 (High)** | Full chain | **EXECUTED** | Every acceptance criterion gets a complete Proof of Life chain with runtime evidence |
| **P2 (Medium)** | Partial chain | STATIC | Trace data flow + taxonomy checks; Proof of Life for primary criterion only |
| **P3 (Low)** | Taxonomy only | STATIC | Run all 10 taxonomy checks; skip Proof of Life chain |

---

## §6. CROSS-FEATURE INTEGRITY

After individual features are verified, the audit checks cross-feature integrity. This section is critical — most insidious production bugs live at feature boundaries, not within features.

### 6.1 Dependency Chain Verification
For every cross-feature dependency in the registry:
1. Feature A says it depends on Feature B's `getX()` function
2. Verify Feature B's `getX()` is VERIFIED (not just implemented)
3. Verify Feature A calls `getX()` with the correct parameters
4. Verify the return type of `getX()` matches what Feature A expects
5. **Verify error propagation:** If Feature B's `getX()` throws or returns null, does Feature A handle it? Or does it crash/corrupt?
6. **Verify version alignment:** If Feature B's `getX()` signature changed during the build (tactical adaptation), does Feature A's call site reflect the change?

**Tooling:** `grep -rn "import.*from.*featureBFile"` across the codebase to find ALL callers of Feature B's exports — not just the ones in the registry. Undocumented callers are a hidden dependency risk.

### 6.2 Shared Resource Audit
For entities (database tables, stores, caches) accessed by multiple features:

**Step 1: Build the resource matrix**
```
| Resource | Writers (FEAT-ID: function) | Readers (FEAT-ID: function) | Conflict? |
|----------|---------------------------|---------------------------|----------|
```
Use `grep -rn "INSERT INTO tableName\|UPDATE tableName\|DELETE FROM tableName"` and `grep -rn "SELECT.*FROM tableName"` to build this exhaustively.

**Step 2: Conflict detection** — for each shared resource, check:
1. **Schema assumption conflicts:** Do all writers write the same columns? Does any writer set a column to a value that a reader doesn't expect? (e.g., Writer A sets `status = 'archived'` but Reader B's WHERE clause only handles `'active'` and `'deleted'`)
2. **Ordering conflicts:** Do two writers assume they're the only one modifying a record? Is there a last-write-wins race?
3. **Lifecycle conflicts:** Does Writer A create records that Writer B assumes already exist? Or does Writer B delete records that Reader A assumes persist?
4. **Type conflicts:** Does Writer A store a string where Reader B expects an integer? (especially in loosely-typed columns like JSON blobs)

**Step 3: State transition coverage**
For each entity with a status/state column:
1. List every state value from the schema CHECK constraint (or enum)
2. Map which feature transitions the entity INTO each state
3. Map which feature transitions the entity OUT OF each state
4. Flag any state with zero exit transitions (entity gets stuck)
5. Flag any state with zero entry transitions (unreachable state)
6. Flag any transition that bypasses the state engine (raw SQL UPDATE on state column)

### 6.3 Integration Path Verification
For every user journey in APP_FLOW.md:

**Step 1: Chain mapping**
1. Trace the journey through features: FEAT-001 → FEAT-003 → FEAT-007
2. For each link: what data does Feature N produce that Feature N+1 consumes?
3. Verify the data shape matches: types, nullability, field names

**Step 2: Failure mode analysis**
4. For each link: what happens if Feature N fails mid-journey? Does the user get stuck in a broken state?
5. Is there a way to recover or retry from the failure point?
6. Are there any journeys where partial completion leaves the system in an inconsistent state?

**Step 3: Execution verification (for P0/P1 journeys)**
7. If test infrastructure exists: run an integration test that exercises the full journey
8. If no integration test exists: flag as execution debt and add to tasks/todo.md
9. At minimum: verify the app boots and the entry point of each journey is reachable

**Step 4: Coverage gap detection**
10. Cross-reference: are there feature combinations that users will naturally exercise but that NO journey in APP_FLOW.md documents? These are untested interaction paths.
11. Flag any journey where a link in the chain is FAILED or UNVERIFIED


## §12. SAVE OUTPUTS TO

```
_audit/feature_registry.md                    — living feature-to-code mapping (updated continuously)
```

These files persist across sessions. The Feature Registry is a living document.