# Bug Report — Task Manager API

I reviewed the `src/` implementation and wrote unit + integration tests to verify the API behaviour against the expected specification. The failures from those tests were used to identify the bugs documented below.

Where a bug was fixed, the corresponding change and the test that exposed the issue are documented. Bugs that remain open are documented with suggested fixes or decisions for the team.

Each bug follows this structure:

- **Location** — file + function / relevant code
- **Expected** — what should happen according to the specification
- **Actual** — what the implementation currently does
- **How I found it** — the test or scenario that exposed the problem
- **Fix** — the correction or recommended implementation

---

## Bugs Found and Fixed

### Bug 1 — Pagination skips the first page

**Location:** `src/services/taskService.js`, `getPaginated()`

```js
const getPaginated = (page, limit) => {
  const offset = page * limit; // ❌ Wrong
  return tasks.slice(offset, offset + limit);
};
```

**Expected:**

`GET /tasks?page=1&limit=10` should return tasks 0–9.

**Actual:**

The request returns tasks 10–19 because `page` is treated as zero-indexed internally while the API query parameter is 1-indexed.

**How I found it:**

I seeded 15 tasks and asserted that `GET /tasks?page=1&limit=10` returns the first task (`T1`). The test failed because the first returned task was `T11`.

**Fix:**

```js
const offset = (page - 1) * limit;
```

I also ensured the same pagination calculation is used when pagination is combined with filtering in `routes/tasks.js`.

---

### Bug 2 — Status filter uses substring matching

**Location:** `src/services/taskService.js`, `getByStatus()`

```js
const getByStatus = (status) => tasks.filter((t) => t.status.includes(status));
```

**Expected:**

`GET /tasks?status=do` should return no tasks because valid statuses are `todo`, `in_progress`, and `done`.

**Actual:**

`"todo".includes("do")` and `"done".includes("do")` both evaluate to `true`, so `?status=do` incorrectly returns both `todo` and `done` tasks.

**How I found it:**

I created one `todo` task and one `done` task, then called `GET /tasks?status=do`. The API returned 2 results instead of 0.

**Fix:**

```js
const getByStatus = (status) => tasks.filter((t) => t.status === status);
```

---

### Bug 3 — Completing a task silently resets its priority

**Location:** `src/services/taskService.js`, `completeTask()`

```js
const updated = {
  ...task,
  priority: "medium", // ❌ Unexpected overwrite
  status: "done",
  completedAt: new Date().toISOString(),
};
```

**Expected:**

`PATCH /tasks/:id/complete` should set `status` to `done` and set `completedAt`. The existing priority should remain unchanged.

**Actual:**

A `high` priority task becomes `medium` when it is completed.

**How I found it:**

I created a task with `priority: "high"`, completed it, and asserted that the priority remained `"high"`. The assertion failed because it was `"medium"`.

**Fix:**

Removed the `priority: 'medium'` line.

---

### Bug 4 — `?status` and `?page` could not be combined

**Location:** `src/routes/tasks.js`, `GET /`

The original route logic effectively behaved like:

```js
if (status) {
  const tasks = taskService.getByStatus(status);
  return res.json(tasks); // ❌ Pagination ignored
}

if (page !== undefined || limit !== undefined) {
  // Pagination
}
```

**Expected:**

`GET /tasks?status=todo&page=2&limit=5` should return the second page of `todo` tasks.

**Actual:**

When `status` was supplied, pagination was silently ignored.

**How I found it:**

I seeded 12 `todo` tasks and called `GET /tasks?status=todo&page=1&limit=5`. The API returned 12 results instead of 5.

**Fix:**

The route handler was restructured so pagination is applied to the filtered list. `page` and `limit` are also explicitly validated as positive integers, returning `400` when invalid.

---

## ❌ Bugs Found but Not Fixed

The following issues are still present. They are documented so the team can decide how they should be handled.

---

### Bug 5 — README status values do not match the code

**Location:** `README.md` (Task shape) vs `src/utils/validators.js` (`VALID_STATUSES`)

- README says: `pending | in-progress | done`
- Code / validator / `ASSIGNMENT.md` say: `todo | in_progress | done`

**Expected:**

Documentation and implementation should use one consistent set of status values.

**Actual:**

The README documents values that are not accepted by the API.

**How I found it:**

I wrote a test using `POST /tasks` with `{ "status": "pending" }`, expecting `201` based on the README, and received `400`. Cross-checking `ASSIGNMENT.md` showed that it uses the code's status values.

**Suggested fix:**

Update the README task shape to:

```text
todo | in_progress | done
```

The existing code appears to match `ASSIGNMENT.md`.

---

### Bug 6 — Falsy `status`, `priority`, and `dueDate` values bypass validation

**Location:** `src/utils/validators.js`, `validateCreateTask` and `validateUpdateTask`

Current validation follows this pattern:

```js
if (body.status && !VALID_STATUSES.includes(body.status)) { ... }
if (body.priority && !VALID_PRIORITIES.includes(body.priority)) { ... }
if (body.dueDate && isNaN(Date.parse(body.dueDate))) { ... }
```

**Expected:**

Explicitly supplied invalid values should be rejected. For example, `PUT /tasks/:id` with `{ "status": "" }` should return `400`.

**Actual:**

An empty string is falsy, so the validation guard is skipped and the invalid value can be written to the task.

**How I found it:**

`PUT { "status": "" }` returned `200` with `status: ""` in the response.

**Suggested fix:**

Use explicit `undefined` checks:

```js
if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
  // validation error
}

if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
  // validation error
}

if (
  body.dueDate !== undefined &&
  body.dueDate !== null &&
  isNaN(Date.parse(body.dueDate))
) {
  // validation error
}
```

Also handle the case where `body` itself is not an object.

---

### Bug 7 — Mass assignment on `PUT` allows protected fields to be overwritten

**Location:** `src/services/taskService.js`, `update()`

Current implementation:

```js
const updated = { ...tasks[index], ...fields };
```

**Expected:**

`PUT /tasks/:id` should only modify documented fields:

- `title`
- `description`
- `status`
- `priority`
- `dueDate`

Server-controlled fields such as `id` and `createdAt` should not be client-editable.

**Actual:**

Any property supplied by the client is merged into the existing task. A client can send `{ "id": "attacker-controlled", "createdAt": "1970-01-01" }` and overwrite both fields.

This can also cause ID collisions and break `findById` or `remove`.

**How I found it:**

I sent `PUT` with `{ "id": "hacked" }` and observed that the task's ID changed in the response.

**Suggested fix:**

Whitelist allowed fields:

```js
const ALLOWED_UPDATE_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "dueDate",
];

const update = (id, fields) => {
  const index = tasks.findIndex((t) => t.id === id);

  if (index === -1) {
    return null;
  }

  const safe = Object.fromEntries(
    Object.entries(fields).filter(([key]) =>
      ALLOWED_UPDATE_FIELDS.includes(key),
    ),
  );

  tasks[index] = {
    ...tasks[index],
    ...safe,
  };

  return tasks[index];
};
```

**Priority: High**

This should be addressed before production because clients can modify server-controlled fields.

---

### Bug 8 — `completedAt` is not managed when status changes through `PUT`

**Location:** `src/services/taskService.js`, `update()`

**Expected:**

If a task's status changes to `done`, `completedAt` should be set. If it changes away from `done`, `completedAt` should be cleared.

**Actual:**

`update()` copies the supplied fields without managing `completedAt`.

Therefore `PUT { "status": "done" }` can leave `completedAt: null`, while reopening a completed task can leave a stale timestamp.

**How I found it:**

`PUT { "status": "done" }` returned a response with `completedAt: null`.

**Suggested fix:**

Normalize the pair:

```js
if (safe.status === "done" && !tasks[index].completedAt) {
  safe.completedAt = new Date().toISOString();
} else if (safe.status && safe.status !== "done") {
  safe.completedAt = null;
}
```

---

### Bug 9 — Unknown `?status` values silently return `[]`

**Location:** `src/routes/tasks.js`, `GET /`

**Expected:**

Given that `POST` rejects invalid statuses with `400`, `GET /tasks?status=garbage` should either return `400` or have the empty-array behaviour explicitly documented.

**Actual:**

The API returns `200 []`, which makes an invalid filter indistinguishable from a valid status with no matching tasks.

**How I found it:**

`GET /tasks?status=xyz` returned `200 []`.

**Suggested fix:**

Validate `status` against `VALID_STATUSES` and return `400` on mismatch.

This remains a contract decision: the team should decide whether invalid filter values should produce `400` or an empty array.

---

### Bug 10 — Empty `?page=` / `?limit=` values

**Location:** `src/routes/tasks.js`, `GET /`

**Expected:**

The API should explicitly define whether an empty pagination parameter is treated as missing/defaulted or rejected with `400`.

**Actual:**

`?page=` results in:

```js
Number("") === 0;
```

which fails the positive-integer validation and produces `400`.

**How I found it:**

`GET /tasks?page=` returned `400`.

**Suggested fix:**

Decide and document the intended behaviour and add a regression test. The current `400` response is defensible, so this was left unchanged.

---

## Summary

| #   | Bug                                             | Status                          |
| --- | ----------------------------------------------- | ------------------------------- |
| 1   | Pagination off-by-one                           | **Fixed**                       |
| 2   | `getByStatus()` substring matching              | **Fixed**                       |
| 3   | `completeTask()` resets priority                | **Fixed**                       |
| 4   | Status + pagination could not be combined       | **Fixed**                       |
| 5   | README status values mismatch                   | **Open**                        |
| 6   | Falsy status/priority/dueDate bypass validation | **Open**                        |
| 7   | Mass assignment on `PUT`                        | **Open**                        |
| 8   | `completedAt` not managed on status change      | **Open**                        |
| 9   | Unknown `?status` returns `[]`                  | **Open — Contract Decision**    |
| 10  | `?page=` empty string returns `400`             | **Open — Documented Behaviour** |

### Totals

- **Bugs found:** 10
- **Bugs fixed:** 4
- **Bugs reported but not fixed:** 6

---

## Recommended Next Steps

If additional development time is available, I would address the remaining issues in this order:

### 1. Bug 7 — Mass assignment

This is the highest-impact issue because clients can overwrite server-controlled fields such as `id` and `createdAt`.

### 2. Bug 6 — Validation of falsy values

Replace truthiness checks with explicit `undefined` checks so explicitly supplied invalid values cannot bypass validation.

### 3. Bug 8 — `completedAt` consistency

Keep `status` and `completedAt` synchronized regardless of which endpoint changes the task status.

### 4. Bug 5 — Documentation mismatch

Update the README so documented status values match the implementation and assignment specification.

### 5. Bug 9 — Invalid status filter contract

Decide whether invalid status filters should return `400` or an empty array, then document and test the chosen behaviour.

### 6. Bug 10 — Empty pagination parameters

Document whether empty pagination parameters should be rejected or treated as omitted values and add a regression test.

---

## Testing Notes

The bugs in the **Fixed** section were identified through concrete test scenarios rather than only through static code inspection.

The tests covered cases including:

- first-page pagination
- filtered pagination
- exact status filtering
- task completion
- preservation of task priority
- invalid status values
- invalid pagination values
- status updates
- protected-field updates
- completion timestamp behaviour

The resulting failures were traced back to the relevant route, service, or validation logic.

---

## Repository Placement

Place this file at the **repository root**, alongside:

```text
README.md
ASSIGNMENT.md
BUG_REPORT.md
src/
tests/
```

Keeping the report at the root makes it immediately visible to reviewers and provides a clear record of the issues discovered during testing.

---

## Final Note

The purpose of this report is not only to list failures, but to show the reasoning behind them:

1. Identify the expected API behaviour.
2. Create a reproducible test case.
3. Observe the actual implementation behaviour.
4. Trace the failure to its source.
5. Fix the issue when the expected behaviour is unambiguous.
6. Report the issue instead when the correct behaviour requires a contract or product decision.

The four fixed bugs demonstrate verified implementation corrections, while the six open issues provide actionable findings for further development and review.
