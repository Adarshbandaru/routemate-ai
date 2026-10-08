# RouteMate local API

**Status:** prototype, localhost only. This API has no authentication,
authorization, rate limiting, TLS, persistence, audit log, or production
privacy controls.

Start it with:

```powershell
$env:PYTHONPATH = "src"
py -m routemate.api --port 8000 --model experiments/005_classical_ml/outputs/model.json
```

Endpoints:

- `GET /health`
- `POST /v1/matches`

The match request contains a `rider`, a `drivers` array, and optional `top_k`.
Journey objects use WGS84 decimal coordinates, an offset-aware ISO timestamp,
an explicit route polyline, vehicle capacity/verification, and verification
context. The service retrieves candidates, computes features, applies all hard
feasibility checks, then ranks only eligible candidates. It returns the full
feasibility matrix with deterministic rejection reasons and recommendation
explanations.

The model artifact is optional. Without it, the route/time heuristic is used.
With it, the versioned synthetic logistic artifact ranks eligible rows. The
artifact inference boundary does not perform safety or feasibility checks; the
API performs those checks before inference.

This contract is intentionally local and dependency-free. A future backend
must add authentication, authorization, input size limits, structured logging
without raw locations, request IDs, TLS, persistence, and threat-model review.
