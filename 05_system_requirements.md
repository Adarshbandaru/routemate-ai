# RouteMate AI — System Requirements

## Functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-1 | Ingest validated trip requests and constraints | Schema validation tests |
| FR-2 | Normalize coordinates, time zones, and units | Deterministic transformation tests |
| FR-3 | Generate candidate compatible requests | Candidate recall and correctness on fixtures |
| FR-4 | Check group feasibility under capacity, time, and detour limits | Unit tests with infeasible edge cases |
| FR-5 | Produce assignments with objective values and provenance | Versioned output record |
| FR-6 | Explain match constraints and trade-offs | Human-readable explanation fixture |
| FR-7 | Record cancellations, errors, and model/configuration versions | Append-only audit event fixture |

## Non-functional requirements
- **Reproducibility:** pinned code/configuration, deterministic seed where applicable, input snapshot identifiers.
- **Performance:** measure latency and memory by instance size; do not set a production SLA before workload evidence.
- **Safety/privacy:** minimize location precision, encrypt data in transit/at rest where deployed, enforce access control and deletion workflows.
- **Accessibility:** explanations and controls must not rely on color alone; test keyboard and screen-reader flows for any interface.
- **Observability:** distinguish simulated demo, synthetic experiment, real-data run, and human study in every run record.

## Constraints and assumptions
Road-network routing, traffic, and identity data may be missing or stale. A failed route lookup must not silently become a feasible match. All units and coordinate reference systems are explicit.

## Requirement traceability
Every implemented requirement links to a schema field, test/fixture, and evaluation metric. Unmet requirements are reported as such; demo behavior is not acceptance evidence for real-world performance.
