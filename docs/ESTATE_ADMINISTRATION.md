# Estate administration and real-data onboarding

Local candidate 0.3.0, 2026-10-28. Owner scope: estate/field administration screens and real plantation onboarding. The owner currently knows only that the target is rubber plantations in African countries such as Gabon and Malawi; actual estate records and surveys are not yet available. The application is ready to collect them, without creating fictional REAL records.

## Start with the supplied facts

Open **Estate administration** from the sidebar, or /administration. Use an existing development account with the appropriate role. All business reads/writes go through the configured Gateway using existing pinned Estate/Spatial APIs; canonical identities and backend authorization are unchanged.

| Action                                                                  | Permission                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Create an estate                                                        | PLATFORM_ADMIN                                                                   |
| Edit an estate; create/edit its divisions and fields; import boundaries | PLATFORM_ADMIN, or ESTATE_ADMIN/ESTATE_MANAGER with its trusted estate_ids scope |
| View the records                                                        | Existing read roles/scopes; VIEWER remains read-only                             |

The page follows the currently selected estate. Forms/import previews prevent silent estate switching; cancel/discard them to select another estate. Leaving with unsaved work asks for confirmation. Saves/imports disable repeated actions while in progress. A 409 can mean a duplicate code or stale version: entries remain visible, and Refresh records lets you reopen the latest record. No automatic create/import retry or destructive delete is supplied.

Create an estate, then at least one division, then its fields. Fields currently represent rubber plantation blocks. Edits carry the observed version and keep estate ownership fixed. A field can be assigned to a division within the same estate, as allowed by the existing API. Active/inactive status is editable; history is not deleted.

## Details to gather

Download /onboarding/plantation-data-worksheet.csv. It is a blank worksheet with headings only, not a bulk metadata import endpoint. Enter the gathered values through the administration forms. Gather:

- Estate code and actual name; country; timezone; status; total area if known.
- Division codes/names and their parent estate.
- Field codes/names and parent division; planted hectares; actual planted and tappable tree counts; status. Clone and planting date are optional.
- Survey/source information and WGS84 estate/division/field boundaries, when available.

| Country example | Country code | IANA timezone     |
| --------------- | ------------ | ----------------- |
| Gabon           | GA           | Africa/Libreville |
| Malawi          | MW           | Africa/Blantyre   |

These examples do not identify an actual plantation or choose its location. Other two-letter countries and valid timezones are supported. Areas are hectares, with up to four decimal places. Tappable trees cannot exceed planted trees. Unknown optional estate area/clone/planting date remain null. Field planted area and tree counts are required by the existing backend contract; do not enter zero as a substitute for unknown information. Existing clone selections are preserved if the clone list cannot be loaded.

## Import actual boundaries

1. Create the estate/division/field metadata first so canonical records exist.
2. Export the owner's survey to RFC 7946 GeoJSON: WGS84 longitude, latitude, optionally altitude. KML/shapefile conversion remains an external GIS step; no coordinate system is guessed.
3. Choose the file in **Import mapped boundaries**. The client accepts Polygon/MultiPolygon FeatureCollections containing 1–100 features and at most 1 MiB. It checks coordinate ranges, closed rings, feature limits and conflicting estate IDs. Topological validity is checked by Spatial/PostGIS on submission.
4. Review the boundary names/types/bounds. Map each feature to the correct estate/division/field using the selectors. A target can occur once per import; separate parts of a field belong in one MultiPolygon. Boundary codes must be unique.
5. Explicitly classify the supplied coordinates as REAL, SIMULATED, ESTIMATED or PREDICTED. No provenance is inferred or automatically upgraded to REAL. This classification does not certify survey accuracy.
6. Submit the import and inspect its job result. FAILED jobs retain the preview and display the service's atomic validation report. COMPLETED jobs refresh spatial data; open Digital twin to inspect it. If a pending job takes longer than polling, use **Check import status**, rather than sending the import again. If the initial request timed out before a job ID returned, inspect existing geometry before retrying.

This is an add-only boundary workflow: records already represented in the current geometry are excluded; existing boundaries are not silently overwritten. Boundary update/history editing needs its own workflow. Metadata creation does not invent geometry. Existing satellite imagery is a background and does not create real field boundaries or measured tree positions.

## Validation and remaining boundaries

Automated verification covers pure request construction/unknown-versus-zero input, country/timezone examples, fixed parents/current versions, role/scope controls, canonical mapping and GeoJSON rejection; browser tests cover the create/division/field/edit/conflict/import path, read-only/scoped behavior, failed import reports and unsaved navigation. Mock browser mutations use labelled SIMULATED fixtures, not the owner's local database. Existing UI and Cesium regressions remain required. Exact current checks are recorded in the Architecture checkpoint after execution.

Current application configuration changes staged by the owner are preserved. No private values, real surveys or worker records are bundled. No new backend endpoints, independent contract release, AEO/production change, Git commit/tag/push or worker/attendance module follows from this UI increment. Real-data onboarding remains awaiting the owner's actual records. M2 device performance remains independently open.
