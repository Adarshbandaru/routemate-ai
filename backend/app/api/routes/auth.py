"""Authentication endpoints for rider accounts and profile management."""

from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Header, Body
from ...schemas.auth import SendOtpRequest, VerifyOtpRequest, RegisterRequest
from ...services.auth_service import AuthService
from ...repositories.user_repo import UserRepository
from ...core.security import verify_jwt_token

router = APIRouter(prefix="/v1/auth", tags=["Authentication"])


def _extract_user(authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split("Bearer ", 1)[1].strip()
    return verify_jwt_token(token)


@router.post("/send-otp")
@router.post("/request-otp")
def request_otp(payload: SendOtpRequest):
    return AuthService.request_otp(payload.phone)


@router.post("/verify-otp")
def verify_otp(payload: VerifyOtpRequest):
    result = AuthService.verify_otp(payload.phone, payload.otp)
    if not result:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP code")
    return result


@router.post("/register")
def register(payload: RegisterRequest):
    return AuthService.register_user(payload.phone, payload.name, payload.email, payload.role or "RIDER")


@router.get("/profile")
def get_profile(authorization: Optional[str] = Header(None)):
    user = _extract_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized or invalid token")
    return {"user": user}


@router.put("/profile")
def update_profile(
    name: Optional[str] = Body(None),
    email: Optional[str] = Body(None),
    authorization: Optional[str] = Header(None),
):
    user = _extract_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    updated = UserRepository.update_profile(user["id"], name=name, email=email)
    return {"success": True, "user": updated}


@router.get("/addresses")
def get_addresses(authorization: Optional[str] = Header(None)):
    user = _extract_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"addresses": UserRepository.get_addresses(user["id"])}


@router.post("/addresses")
def add_address(
    label: str = Body(...),
    lat: float = Body(...),
    lng: float = Body(...),
    address_text: str = Body(...),
    authorization: Optional[str] = Header(None),
):
    user = _extract_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return UserRepository.add_address(user["id"], label, lat, lng, address_text)
