# RouteMate AI — Milestone 1

This repository currently contains the research foundation and a small standard-library-only prototype for comparing two journeys. It is not a production ride-sharing service.

## Run the simulated prototype

From a fresh clone:

```powershell
py -m pip install -e .
py -m routemate.cli
```

Or use the installed entry point:

```powershell
routemate-demo
```

The output is explicitly **simulated data only**. It does not represent real users, routes, acceptance behavior, safety, or experimental results.

The haversine formula uses Earth radius 6371.0088 km. Route overlap is the mean fraction of vertices within a configurable tolerance of the other polyline (symmetric); direction compares endpoint bearings. Pickup detour is `max(0, distance(driver_start,pickup) + distance(pickup,driver_destination) - distance(driver_start,driver_destination))`. The score is a weighted 0–100 rule-based compatibility index with capacity and safety hard constraints, not a calibrated probability.
