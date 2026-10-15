"""Repository for user accounts, profiles, addresses, and sessions."""

import uuid
from typing import Any, Dict, List, Optional
from ..core.database import get_connection


class UserRepository:
    @staticmethod
    def get_by_id(user_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def get_by_phone(phone: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE phone = ?", (phone,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def create(user_id: str, phone: str, name: str, email: Optional[str] = None, role: str = "RIDER") -> Dict[str, Any]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (id, phone, name, email, role) VALUES (?, ?, ?, ?, ?)",
            (user_id, phone, name, email, role),
        )
        conn.commit()
        conn.close()
        return {"id": user_id, "phone": phone, "name": name, "email": email, "role": role}

    @staticmethod
    def update_profile(user_id: str, name: Optional[str] = None, email: Optional[str] = None) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        if name and email:
            cur.execute("UPDATE users SET name = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (name, email, user_id))
        elif name:
            cur.execute("UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (name, user_id))
        elif email:
            cur.execute("UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (email, user_id))
        conn.commit()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def get_addresses(user_id: str) -> List[Dict[str, Any]]:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM user_addresses WHERE user_id = ?", (user_id,))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

    @staticmethod
    def add_address(user_id: str, label: str, lat: float, lng: float, address_text: str) -> Dict[str, Any]:
        conn = get_connection()
        cur = conn.cursor()
        addr_id = f"addr_{uuid.uuid4().hex[:12]}"
        cur.execute(
            "INSERT INTO user_addresses (id, user_id, label, lat, lng, address_text) VALUES (?, ?, ?, ?, ?, ?)",
            (addr_id, user_id, label, lat, lng, address_text),
        )
        conn.commit()
        conn.close()
        return {"id": addr_id, "user_id": user_id, "label": label, "lat": lat, "lng": lng, "address_text": address_text}
