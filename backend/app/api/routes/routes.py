"""Route catalog and corridor search endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Header, Body
from ...repositories.route_repo import RouteRepository
from ...core.security import verify_jwt_token

router = APIRouter(prefix="/v1/routes", tags=["Routes"])


def _extract_user_id(authorization: Optional[str]) -> str:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        user = verify_jwt_token(token)
        if user:
            return user["id"]
    return "user_rider_demo"


@router.get("")
def get_routes(
    category: Optional[str] = Query(None),
    group: Optional[str] = Query(None),
):
    routes = RouteRepository.get_all(category=category, group_key=group)
    return {
        "success": True,
        "count": len(routes),
        "corridor": "Punjab GT Road (NH-44)",
        "routes": routes,
    }


@router.get("/search")
def search_routes(q: Optional[str] = Query(None)):
    matches = RouteRepository.search(q)
    return {
        "success": True,
        "query": q,
        "count": len(matches),
        "results": matches,
    }


@router.get("/favorites")
def get_favorites(authorization: Optional[str] = Header(None)):
    user_id = _extract_user_id(authorization)
    favs = RouteRepository.get_favorites(user_id)
    return {"success": True, "favorites": favs}


@router.get("/{route_id}")
def get_route_detail(route_id: str):
    r = RouteRepository.get_by_id(route_id)
    if not r:
        raise HTTPException(status_code=404, detail="Route not found")
    return {"success": True, "route": r}
