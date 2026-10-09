# RouteMate Local API

**Status:** Prototype, localhost only. This API is dependency-free (standard library `http.server`) and designed for prototyping and local dashboard integration. It includes permissive CORS headers (`*`) to allow web clients on localhost to interact with it.

> [!NOTE]
> This service is an architectural prototype boundary. Production deployment requires external authentication, authorization, TLS termination, persistent audit logging, rate limiting, and differential privacy controls.

## Starting the API Server

Using Python CLI:
```powershell
py -m routemate.api --port 8000
```

With an optional trained ML model artifact:
```powershell
py -m routemate.api --port 8000 --model experiments/005_classical_ml/outputs/model.json
```

Or via the installed entry point:
```powershell
routemate-api --port 8000
```

---

## Endpoints

### 1. Health Check
- **Method:** `GET`
- **Path:** `/health`
- **Response:**
```json
{
  "api_version": "local-api-v1",
  "status": "ok"
}
```

---

### 2. Single-Rider Journey Matching
- **Method:** `POST`
- **Path:** `/v1/matches`
- **Headers:** `Content-Type: application/json`

#### Request Payload
```json
{
  "rider": {
    "journey_id": "rider-101",
    "start": {"latitude": 0.0, "longitude": 0.0},
    "destination": {"latitude": 0.0, "longitude": 0.01},
    "departure": "2026-01-01T08:00:00Z",
    "route": [
      {"latitude": 0.0, "longitude": 0.0},
      {"latitude": 0.0, "longitude": 0.01}
    ],
    "vehicle": {"kind": "none", "capacity": 0, "verified": true},
    "verification": {
      "identity_verified": true,
      "vehicle_verified": true,
      "safety_flags": []
    },
    "seats_requested": 1
  },
  "drivers": [
    {
      "journey_id": "driver-201",
      "start": {"latitude": 0.0, "longitude": 0.0},
      "destination": {"latitude": 0.0, "longitude": 0.012},
      "departure": "2026-01-01T08:05:00Z",
      "route": [
        {"latitude": 0.0, "longitude": 0.0},
        {"latitude": 0.0, "longitude": 0.012}
      ],
      "vehicle": {"kind": "car", "capacity": 3, "verified": true},
      "verification": {
        "identity_verified": true,
        "vehicle_verified": true,
        "safety_flags": []
      },
      "seats_requested": 0
    }
  ],
  "top_k": 3
}
```

#### Response Payload
```json
{
  "api_version": "local-api-v1",
  "rank_method": "route_time_heuristic",
  "retrieved_count": 1,
  "eligible_count": 1,
  "top_k": 3,
  "recommendations": [
    {
      "driver_id": "driver-201",
      "rank": 1,
      "score": 0.941,
      "explanation": {
        "features": {
          "pickup_distance_km": 0.0,
          "destination_distance_km": 0.222,
          "route_similarity": 1.0,
          "direction_similarity": 1.0,
          "detour_km": 0.0,
          "departure_difference_min": 5.0
        },
        "reasons": ["passed all mandatory feasibility checks"]
      }
    }
  ],
  "feasibility_matrix": [
    {
      "driver_id": "driver-201",
      "final_eligible": true,
      "score": 94.1,
      "rejection_reasons": [],
      "checks": {
        "capacity_eligible": true,
        "departure_time_eligible": true,
        "detour_eligible": true,
        "identity_verification": true,
        "pickup_distance_eligible": true,
        "destination_distance_eligible": true,
        "route_direction_compatible": true,
        "vehicle_verification": true
      }
    }
  ],
  "timing_seconds": {
    "retrieval": 0.0001,
    "features": 0.0001,
    "filtering": 0.0001
  }
}
```

---

### 3. Multi-Rider Batch Assignment
- **Method:** `POST`
- **Path:** `/v1/assignments`
- **Headers:** `Content-Type: application/json`

#### Request Payload
```json
{
  "riders": [ ...list of journey objects... ],
  "drivers": [ ...list of journey objects... ],
  "method": "greedy", // "greedy", "auction", or "optimal" (exact branch-and-bound)
  "routing_provider": "urban_grid" // optional: "urban_grid", "geometric" (default: euclidean)
}
```

#### Response Payload
```json
{
  "api_version": "local-api-v1",
  "method": "greedy",
  "matched_rider_count": 4,
  "matched_driver_count": 2,
  "objective_value": 382.4,
  "total_pairs": 16,
  "feasible_edges": 11,
  "unmatched_rider_ids": [],
  "unmatched_driver_ids": ["driver-203", "driver-204"],
  "groups": [
    {
      "driver_id": "driver-201",
      "rider_ids": ["rider-101", "rider-102"],
      "seats_used": 2,
      "remaining_capacity": 1,
      "group_score": 192.1
    },
    {
      "driver_id": "driver-202",
      "rider_ids": ["rider-103", "rider-104"],
      "seats_used": 2,
      "remaining_capacity": 0,
      "group_score": 190.3
    }
  ],
  "timing_seconds": {
    "graph": 0.0012,
    "solve": 0.0003
  }
}
```

---

### 4. Road Network Point-to-Point Routing
- **Method:** `POST`
- **Path:** `/v1/routes`
- **Headers:** `Content-Type: application/json`

#### Request Payload
```json
{
  "origin": {"latitude": 0.0, "longitude": 0.0},
  "destination": {"latitude": 0.0, "longitude": 0.012},
  "waypoints": [],
  "provider": "urban_grid" // "urban_grid" or "geometric"
}
```

#### Response Payload
```json
{
  "api_version": "local-api-v1",
  "provider": "network-graph-urban-grid-4x4",
  "distance_km": 1.45,
  "duration_seconds": 128.4,
  "status": "ok",
  "route": [
    {"latitude": 0.0, "longitude": 0.0},
    {"latitude": 0.0, "longitude": 0.012}
  ],
  "metadata": {
    "edge_count": 2,
    "node_count": 3
  }
}
```

---

### 5. Road Network Circuity Benchmark
- **Method:** `GET`
- **Path:** `/v1/road-benchmark`

#### Response Payload
```json
{
  "api_version": "local-api-v1",
  "total_pairs_evaluated": 30,
  "mean_circuity_factor": 1.341,
  "max_circuity_factor": 3.075,
  "min_circuity_factor": 1.0,
  "mean_euclidean_distance_km": 0.8,
  "mean_road_distance_km": 1.06,
  "mean_geometric_detour_km": 0.56,
  "mean_road_detour_km": 0.59,
  "mean_detour_underestimation_km": 0.04,
  "feasibility_disagreement_count": 0,
  "feasibility_disagreement_rate": 0.0
}
```

