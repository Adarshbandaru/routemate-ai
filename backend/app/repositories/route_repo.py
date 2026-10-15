"""Repository for default corridor routes, search, and user favorites."""

import json
from typing import Any, Dict, List, Optional
from ..core.database import get_connection


class RouteRepository:
    @staticmethod
    def get_all(category: Optional[str] = None, group_key: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        query = "SELECT * FROM default_routes WHERE 1=1"
        params = []
        if category:
            query += " AND category = ?"
            params.append(category)
        if group_key:
            query += " AND group_key = ?"
            params.append(group_key)
        query += " ORDER BY group_key, name"
        cur.execute(query, params)
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            if d.get("polyline"):
                try:
                    d["polyline"] = json.loads(d["polyline"])
                except Exception:
                    pass
            rows.append(d)
        conn.close()
        return rows

    @staticmethod
    def get_by_id(route_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM default_routes WHERE id = ?", (route_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return None
        d = dict(row)
        if d.get("polyline"):
            try:
                d["polyline"] = json.loads(d["polyline"])
            except Exception:
                pass
        return d

    @staticmethod
    def search(query_str: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        if not query_str:
            cur.execute("SELECT * FROM default_routes ORDER BY name LIMIT 10")
        else:
            pattern = f"%{query_str}%"
            cur.execute(
                """
                SELECT * FROM default_routes 
                WHERE name LIKE ? OR pickup_name LIKE ? OR dropoff_name LIKE ? OR pickup_address LIKE ? OR dropoff_address LIKE ?
                ORDER BY name
                """,
                (pattern, pattern, pattern, pattern, pattern),
            )
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            if d.get("polyline"):
                try:
                    d["polyline"] = json.loads(d["polyline"])
                except Exception:
                    pass
            rows.append(d)
        conn.close()
        return rows

    @staticmethod
    def get_favorites(user_id: str) -> List[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT uf.*, dr.name as default_route_name, dr.pickup_name, dr.dropoff_name, dr.distance_km, dr.avg_fare
            FROM user_favorite_routes uf
            LEFT JOIN default_routes dr ON uf.default_route_id = dr.id
            WHERE uf.user_id = ?
            """,
            (user_id,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
