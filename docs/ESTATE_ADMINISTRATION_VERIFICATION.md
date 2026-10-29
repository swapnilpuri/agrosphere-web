# Estate administration verification — 2026-10-28

Local unpublished Web candidate 0.3.0. Owner requested estate/field administration and real plantation onboarding, then clarified that only the target countries (including Gabon and Malawi) are currently known. No actual plantation metadata or survey was supplied. No business records were created in the existing database during this increment.

## Delivered behavior

The `/administration` page creates/edits estates, divisions and rubber fields through the existing pinned Gateway APIs. It enforces role/trusted estate scope, fixed parent identities, observed edit versions, input precision and tree-count rules. Conflicts retain entries; unsaved work is guarded. Initial loading cannot silently discard an opened form. Expired authentication can still redirect to login.

An initial-boundary workflow previews supplied Polygon/MultiPolygon GeoJSON, requires explicit provenance and canonical record mapping, then reports the existing Spatial import job. It does not generate boundaries or replace existing geometry. A blank worksheet is supplied at `/onboarding/plantation-data-worksheet.csv`; it is not a CSV import endpoint. See [onboarding guide](ESTATE_ADMINISTRATION.md).

## Executed checks

Commands ran independently in agrosphere-web on Windows, with Docker Desktop Linux packaging. All final checks below passed; browser suites ran sequentially.

| Command/check                                              | Result                                   | Local ignored evidence                 |
| ---------------------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| `npm.cmd run lint`                                         | PASS                                     | target-administration-lint.log         |
| `npm.cmd run format:check`                                 | PASS                                     | target-administration-format-check.log |
| `npm.cmd run typecheck`                                    | PASS                                     | target-administration-typecheck.log    |
| `npm.cmd run api:check`                                    | PASS; pinned APIs unchanged              | target-administration-api-check.log    |
| `npm.cmd test`                                             | 45 tests, 14 files passed                | target-administration-test.log         |
| `npm.cmd run build`                                        | PASS; existing Cesium CommonJS warnings  | target-administration-build.log        |
| `npm.cmd run e2e`                                          | 8 UI tests passed                        | target-administration-e2e.log          |
| `npm.cmd run e2e:graphics`                                 | 1 Cesium regression passed               | target-administration-graphics.log     |
| Playwright live project, filtered to estate administration | 1 existing-account read-only test passed | target-administration-live.log         |
| Docker build, explicit public-source context               | PASS; npm ci and production bundle       | target-administration-docker.log       |
| GET local `/administration` and blank worksheet            | HTTP 200                                 | Local runtime probe                    |
| `git diff --check`                                         | PASS                                     | Git check                              |

The live test used existing Keycloak login, read current records, opened a blank estate form and cancelled. It did not save/import. CRUD, stale-version conflict, import completion/failure and scope cases used mocked, labelled SIMULATED fixtures. These tests do not establish real backend mutation integration or survey accuracy. A live loading race discovered during review was fixed and the live check rerun successfully. No hosted CI run or production/device-performance acceptance is claimed.

Docker image: `agrosphere-web:0.3.0-local`, SHA-256 `a5f039f8520eac4fbf34d0715e0141e0c1a87cc74f6e24c02de199b181153119`. Packaging used a literal public-source allowlist and generated public defaults, excluding the owner's config. An earlier broad copy proposal was rejected by automatic approval review and replaced with this restricted context. The image was built locally, not published or deployed.

## Revision and preservation

Observed Web HEAD: `e09e7f708cebf2731e9d13134fa7662630d7818e`. Observed Architecture HEAD: `6de4d5f4dc0487d2834e5a0f8e50c564e374fe46`. Implementation and documentation remain uncommitted working-tree changes. The owner's pre-existing staged/unstaged `public/config.json` is preserved and excluded from packaging/evidence. No dependency additions, backend/contract changes, private config updates, commits, tags, pushes, production or AEO changes occurred in this increment. Existing local backend services were started with retained volumes and no seed/reset; the Web development server is available on port 4200.

Real onboarding next requires confirmed estate/division/field names and codes, country/timezone, required planted hectares/tree counts, and surveyed boundaries when available. Unknown required counts must not be entered as zero. Worker/attendance modules and boundary replacement remain outside this increment; M2 reference-device performance stays open.
