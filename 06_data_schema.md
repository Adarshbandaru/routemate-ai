# RouteMate AI — Initial Data Schema

## Conventions
JSON-like logical schema; implementation format may be JSON/Parquet/SQL. Timestamps are ISO-8601 with offset; coordinates are WGS84 (`EPSG:4326`) unless a routing provider says otherwise. IDs are opaque. Store the least precision needed for the approved use.

## `trip_request`
| Field | Type | Required | Notes |
|---|---|---|---|
| request_id | string | yes | pseudonymous, unique within dataset |
| created_at | timestamp | yes | ingestion time |
| origin | object | yes | latitude/longitude or approved zone; avoid raw home address |
| destination | object | yes | same minimization rule |
| departure_window | object | yes | start/end timestamps |
| seats | integer | yes | positive; capacity semantics explicit |
| constraints | object | yes | max wait/detour, accessibility, baggage, etc. |
| consent_scope | enum | yes for real data | approved purpose and retention class |
| source_class | enum | yes | `synthetic`, `simulated_demo`, `real`, `experimental` |

## `route_option`
`route_id`, `request_ids`, ordered or summarized path geometry, distance_m, duration_s, generated_at, routing_source/version, uncertainty (bounds or distribution), and `source_class`. Do not imply traffic truth when using static or synthetic routing.

## `match_assignment`
`assignment_id`, `request_ids`, `vehicle_id` (pseudonymous or null), capacity, stops/order, feasibility checks, objective_components, config_version, algorithm_version, created_at, and `source_class`.

## `evaluation_run`
`run_id`, dataset_snapshot, scenario_id, seed, algorithm/config versions, metric definitions, start/end time, compute environment, status, and evidence class. Results must reference this record.

## Data quality and governance
Validate ranges, temporal ordering, duplicate IDs, missingness, impossible coordinates, and consent scope. Keep raw and transformed data access separate; log lineage. Synthetic records must never be presented as observed journeys. Real data requires lawful basis/consent, retention limit, deletion mechanism, and access review.
