# Worker registration and daily attendance

Local unpublished Web 0.4.0 adds `/workers` and `/attendance` through the Gateway, with an independent Contracts 0.6.0 Operations pin. Estate/Spatial pins remain unchanged; no sibling source is needed to build.

Only SIMULATED development records are supported. Do not enter actual worker details. Operations and DB constraints deny REAL mutations until D09 purpose/access/retention/deletion policy is implemented. Account provisioning, payroll, hours, health records, GPS, biometrics, exports and offline queues are excluded.

## Access and flows

PLATFORM_ADMIN has global workforce access. Scoped ESTATE_ADMIN/ESTATE_MANAGER can maintain workers and attendance. FIELD_SUPERVISOR can read current views and record estate-local today's attendance, but cannot maintain profiles, backdate, correct or inspect protected history. AUDITOR can read scoped views/history without writing. VIEWER, FIELD_WORKER and PLANTATION_ADMIN alone have no workforce access. Backend checks are authoritative. Refreshed claims and 401/403 clear protected state. Ordinary views exclude actors/reasons.

Workers supports code/name-prefix/current-division/active-date filters, pagination, registration, profile changes, active-period close/reopen, detail and protected history. Code, UUID, estate and provenance remain immutable. The exclusive end date is the first inactive day; closure cannot exclude retained nonvoided attendance. Active periods cannot overlap or start in the future.

Attendance defaults to today in the estate IANA timezone. Each eligible row remains UNMARKED until PRESENT, ABSENT or EXCUSED is explicitly selected and saved. One draft is edited at a time: failure cannot silently save other rows. Managers can backdate with a reason, correct, void and re-record the same daily identity. Recorded-days mode includes retained records outside the current roster. Server coverage is calculated before paging and labelled SIMULATED/current division, not payroll/hours.

Changing filters clears old results until Apply filters. Drafts lock estate/date/filter changes and guard navigation. Saves retain observed versions and in-memory idempotency keys. Uncertain responses and 409 freeze the identical command for retry. Inspect latest compares versions without overwriting the draft. Discard/reopen is explicit. For uncertain creation, retry the identical command before discarding. Closing the page loses the in-memory key; inspect records before recreating a command. No personal data or command is persisted in browser storage.

## Verification and packaging

Run npm ci, lint, format:check, typecheck, api:check, test, build, e2e, then e2e:graphics sequentially. Mocked SIMULATED browser tests cover retries, role restrictions, conflict/denial, protected history, session expiry, dirty navigation, focus and narrow layouts; they do not claim live browser-to-backend acceptance. Infrastructure separately exercises real Keycloak/Gateway/Operations/Estate.

`powershell -File scripts/build-public-image.ps1` builds `agrosphere-web:0.4.0-local` from an explicit public-source allowlist and generated public defaults. It never reads/copies the owner's config.json, private environments or Git data. Context is retained under ignored target. Nothing is published/deployed. Architecture's WA-1 verification report records exact results.

D08 actual languages/connectivity/workload/response budgets, D09 privacy policy, owner functional acceptance and production readiness remain open. M2 reference-device performance remains independently open. No real plantation data was supplied.
