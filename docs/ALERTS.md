# In-app crop-health alerts — Web 0.6.0 local

The Alerts screen uses independently accepted Operations Contracts 0.8.0 through Gateway. Select an estate with crop-health permission, then open Alerts. Everything is SIMULATED and requires human review. This is a signed-in estate inbox; it does not contact named people or reach absent users.

The backend feature remains disabled outside explicit generated tests pending AN-D07 subject-data policy. An unavailable badge/screen is expected against an existing stack that has not been separately approved/upgraded. The completed II-1 upgrade does not install AN-1. Do not seed records, change accounts or turn on test mode for existing users.

When enabled in a disposable test environment, the sidebar badge counts the current user's ACTIVE unread alerts for the selected estate. It polls only while visible/online, with one in-flight request, context cancellation, jitter/backoff and Retry-After handling. Estate/session/permission changes clear protected state. Failure/offline means unavailable, not zero; last successful refresh timestamps remain explicit. No WebSocket, push, email, SMS or offline browser queue exists.

Filter the inbox by ACTIVE/INACTIVE, severity, field, unread or unacknowledged; pages are bounded. Empty does not mean the estate is healthy or has no reports: only future eligible incident commands create alerts. Open a row for current source version, attention episode, timestamps and the existing source-incident link. Fetching a screen/count/detail never marks read.

Mark read records only your current attention episode. Another user's unread state is separate. Estate managers/admins can confirm Acknowledge for estate team; this records shared attention, not assignment, triage or resolution. Supervisors cannot acknowledge; auditors can read protected history without acknowledgement authority. Ordinary views show acknowledgement boolean/time, not the actor; actor identity appears only in manager/auditor history.

New attention follows qualification/requalification or HIGH-to-CRITICAL escalation. Ordinary same-severity edits do not re-alert. A stale command refreshes facts and requires another explicit action. An uncertain outcome retains the exact body/key for Retry identical submission, protects estate/navigation and warns before leaving. A successful retry may return its original earlier snapshot; the screen refreshes current state afterward. Unsupported unsafe numeric versions cannot be silently rounded into commands.

Tokens and alert state stay in memory; no report/marker/receipt is stored in localStorage, IndexedDB or offline caches. Current signed claims govern until token refresh/expiry; instantaneous revocation is not claimed. No source text or contacts are copied into alerts. Times display in the selected estate's timezone.

Local checks cover the existing UI/Cesium workflows, new mocked alert flows and the 390px layout. A mocked browser pass is not owner acceptance or a live account mutation test. See Architecture ALERTS_NOTIFICATIONS_VERIFICATION.md and checkpoint for exact evidence, source/image hashes and outstanding subject-policy/workload/REAL/M2/rollout gates.

## Owner-approved privacy extension — 2026-10-31

Web 0.7.0 pins exact Operations 0.9.0 with prior-0.8.0 archive. Alert requests now use /api/v2/alerts and canonical UUIDv7 memory-only frozen keys. Expired read state is not labelled as read; Mark read is disabled. Redacted attribution preserves the shared acknowledgement fact; history explains EXPIRED/PARTIAL. 410 and unknown/conflicting 409 discard retry state and require refresh plus an explicit later action, never an automatic replacement. Other v2/foreign URLs receive no token from the Gateway interceptor. Current polling/connectivity constraints remain; no offline cache, French localization or five-second guarantee. Public config is preserved. See Architecture ALERTS_PRIVACY_VERIFICATION.md for tests and deployment gates.
