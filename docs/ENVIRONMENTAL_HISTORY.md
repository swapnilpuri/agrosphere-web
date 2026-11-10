# Environmental observation history

ANL-02 adds a read-only panel below daily production history, using the same selected estate/block and independent explicit UTC from/to controls. Production retains its estate-local collection dates. Current Analytics API is independently pinned to Contracts 0.12.0; previous 0.11.0 pin bytes are archived and checked. Existing production paths/types remain unchanged.

The panel requires the existing production-read role/trusted estate matrix. Calls use Gateway only and the existing memory-only token interceptor. Changing scope, block or window cancels the old request and clears protected data; hidden views clear/pause and require a fresh response on return. Denial clears data and stops hidden resume. No local/session/IndexedDB persistence, offline capture, new role, map overlay or external provider.

Explicit positive UTC millisecond windows are capped at 24 hours. Samples remain per device/kind, with exact source value strings, unit, observed/received time, rain interval and source event/time. NONE, unknown coverage, block-wide conflicts and truncation/counts are explicit. Returned values are validated against scope/window, closed shape, source identity/order, exact decimal ranges and count semantics before display. No device averaging, inferred cadence, interpolation, rain total/prorating, causal production join or yield claim.

Run the normal lint/format/type/API/unit/build/UI/graphics checks. The `environment-live` project runs only through Infrastructure's owned generated fixture with real Keycloak/Gateway/Telemetry/Analytics. Traces are disabled, generated login files are short-lived, and retained screenshots contain only synthetic references. Owner acceptance is separate.

`python scripts/verify-environment-package.py` builds in a temporary public-source context with generated placeholder config and static SSO assets. It does not copy the operator's private public/config.json or onboarding datasets. It verifies Nginx health, SPA routing and generated config, then removes only its owned container/image tag/context. This is a packaging check, not an operator configuration or deployment test.
