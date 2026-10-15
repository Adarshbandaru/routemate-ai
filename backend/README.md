# RouteMate AI - Mobility Backend API

FastAPI service powering the RouteMate AI Punjab shared-mobility product demo (Rapido/Uber/Ola style interface).

## How to Run

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Start the FastAPI server:
```bash
python api.py
```
The server will be available at `http://localhost:8000`.

## Endpoints

- `GET /v1/health` - Backend health check
- `GET /v1/scenarios` - List all scenarios
- `GET /v1/scenario/{scenario_id}` - Detailed scenario data with routes and drivers
- `POST /v1/confirm-ride` - Confirm a ride pairing with driver
