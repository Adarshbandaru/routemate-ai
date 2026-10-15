"""Phase 3 Pydantic Schemas for RouteMate AI."""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


# -------------------------------------------------------------------------
# Payment & Cash Confirmation Schemas
# -------------------------------------------------------------------------
class ConfirmCashPaymentRequest(BaseModel):
    booking_id: str = Field(..., description="UUID or ID of the booking")
    amount: float = Field(..., ge=0.0, description="Cash amount physically collected by driver")


class ConfirmCashPaymentResponse(BaseModel):
    success: bool
    transaction_id: str
    status: str  # 'COMPLETED', 'PENDING', 'FAILED'
    payment_method: str = "CASH"
    amount: float


class PaymentStatusResponse(BaseModel):
    status: str
    method: str = "CASH"
    amount: float
    booking_id: str


# -------------------------------------------------------------------------
# Promo Code Schemas
# -------------------------------------------------------------------------
class PromoCodeItem(BaseModel):
    id: str
    code: str
    discount_type: str  # 'FLAT', 'PERCENTAGE'
    discount_value: float
    max_discount: Optional[float] = None
    min_ride_amount: float = 0.0
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    is_active: bool = True


class ValidatePromoRequest(BaseModel):
    code: str
    ride_amount: float = Field(..., ge=0.0)


class ValidatePromoResponse(BaseModel):
    valid: bool
    discount: float
    final_amount: float
    message: Optional[str] = None


class ApplyPromoRequest(BaseModel):
    booking_id: str
    promo_code: str


class ApplyPromoResponse(BaseModel):
    success: bool
    discount: float
    final_amount: float
    message: Optional[str] = None


# -------------------------------------------------------------------------
# Ratings & Reviews Schemas
# -------------------------------------------------------------------------
class CreateRatingRequest(BaseModel):
    rater_id: Optional[str] = None
    rating: int = Field(..., ge=1, le=5, description="Star rating between 1 and 5")
    review: Optional[str] = Field(None, max_length=1000, description="Optional textual review")
    tags: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Cleanliness, Comfort, Safety, Communication, Professionalism")


class CreateRatingResponse(BaseModel):
    success: bool
    rating_id: str


class DriverRatingsResponse(BaseModel):
    avg_rating: float
    total_reviews: int
    breakdown: Dict[str, int]
    recent_reviews: List[Dict[str, Any]] = []


class BookingRatingResponse(BaseModel):
    rider_rating: Optional[Dict[str, Any]] = None
    driver_rating: Optional[Dict[str, Any]] = None


# -------------------------------------------------------------------------
# Scheduled Bookings Schemas
# -------------------------------------------------------------------------
class ScheduleBookingRequest(BaseModel):
    pickup_lat: float = Field(..., ge=-90.0, le=90.0)
    pickup_lng: float = Field(..., ge=-180.0, le=180.0)
    dropoff_lat: float = Field(..., ge=-90.0, le=90.0)
    dropoff_lng: float = Field(..., ge=-180.0, le=180.0)
    scheduled_time: str = Field(..., description="ISO-8601 future timestamp")
    passenger_count: int = Field(1, ge=1, le=6)
    pickup_location: Optional[str] = "Selected Pickup"
    dropoff_location: Optional[str] = "Selected Destination"
    vehicle_type: Optional[str] = "sedan"
    special_requests: Optional[str] = None


class ScheduleBookingResponse(BaseModel):
    booking_id: str
    estimated_fare: float
    status: str = "SCHEDULED"


class ScheduledBookingItem(BaseModel):
    id: str
    scheduled_time: str
    status: str
    estimated_fare: float
    pickup_location: str
    dropoff_location: str
    passenger_count: int
    special_requests: Optional[str] = None


# -------------------------------------------------------------------------
# Ride Pooling Schemas
# -------------------------------------------------------------------------
class RidePoolRequest(BaseModel):
    pickup_lat: float = Field(..., ge=-90.0, le=90.0)
    pickup_lng: float = Field(..., ge=-180.0, le=180.0)
    dropoff_lat: float = Field(..., ge=-90.0, le=90.0)
    dropoff_lng: float = Field(..., ge=-180.0, le=180.0)
    allow_pooling: bool = True
    booking_id: Optional[str] = None


class RidePoolResponse(BaseModel):
    booking_id: str
    pooled_with: List[Dict[str, Any]] = []
    discount: float = 0.0
    pool_id: Optional[str] = None
    status: str = "MATCHED_OR_STANDALONE"


class BookingPoolStatusResponse(BaseModel):
    pool_id: Optional[str] = None
    riders: int = 1
    discount_per_rider: float = 0.0


# -------------------------------------------------------------------------
# Favorite Drivers Schemas
# -------------------------------------------------------------------------
class FavoriteDriverRequest(BaseModel):
    user_id: Optional[str] = None


class FavoriteDriverResponse(BaseModel):
    success: bool
    is_favorite: Optional[bool] = None


class IsFavoriteResponse(BaseModel):
    is_favorite: bool


# -------------------------------------------------------------------------
# Receipts & History Schemas
# -------------------------------------------------------------------------
class ReceiptDriverInfo(BaseModel):
    name: Optional[str] = "Driver"
    rating: Optional[float] = None
    vehicle: Optional[str] = None


class ReceiptFareBreakdown(BaseModel):
    base: float
    distance: float
    time: float
    wait: float
    surge_multiplier: float
    tax: float
    discount: float


class TripReceiptResponse(BaseModel):
    booking_id: str
    date: str
    driver: ReceiptDriverInfo
    pickup: str
    dropoff: str
    distance_km: float
    duration_min: int
    fare_breakdown: ReceiptFareBreakdown
    total: float
    payment_method: str = "CASH"
    payment_status: str = "PENDING"


class RideHistoryItem(BaseModel):
    id: str
    date: str
    location: str
    fare: float
    payment_method: str = "CASH"
    status: str = "COMPLETED"
    driver_name: Optional[str] = None


class RideHistoryResponse(BaseModel):
    history: List[RideHistoryItem]
    total_monthly_spend: float = 0.0
    total_rides: int = 0


# -------------------------------------------------------------------------
# Wallet Schemas (Phase 4 Operational Real Ledger)
# -------------------------------------------------------------------------
class WalletResponse(BaseModel):
    balance: float = 0.0
    total_credited: float = 0.0
    total_debited: float = 0.0
    enabled: bool = True
    message: str = "Wallet is active and operational."


class WalletTransactionsResponse(BaseModel):
    transactions: List[Dict[str, Any]] = []
    enabled: bool = True
    message: str = "Wallet transactions ledger active."


class WalletTopupRequest(BaseModel):
    amount: float = Field(..., gt=0.0, description="Amount to add to wallet in INR")
    payment_method: str = Field("RAZORPAY", description="Topup method (RAZORPAY or PROMO)")
    reference_id: Optional[str] = Field(None, description="External reference ID or payment ID")


class WalletTopupResponse(BaseModel):
    success: bool
    wallet_id: str
    balance: float
    credited: float
    transaction_id: str
    message: str = "Wallet topped up successfully."


class WalletPayRequest(BaseModel):
    booking_id: str = Field(..., description="UUID of the booking to pay for using wallet")
    amount: Optional[float] = Field(None, ge=0.0, description="Fare amount to deduct")


class WalletPayResponse(BaseModel):
    success: bool
    transaction_id: str
    status: str = "COMPLETED"
    payment_method: str = "WALLET"
    amount: float
    remaining_balance: float
    message: str = "Ride paid successfully using wallet balance."


# -------------------------------------------------------------------------
# Razorpay Payment Gateway Schemas (Phase 3.5)
# -------------------------------------------------------------------------
class CreateRazorpayOrderRequest(BaseModel):
    booking_id: str = Field(..., description="UUID or ID of the booking")
    amount: Optional[float] = Field(None, ge=0.0, description="Amount in INR. If omitted, fetched from authoritative booking fare")


class CreateRazorpayOrderResponse(BaseModel):
    order_id: str
    amount: int  # Amount in paise (e.g. 26303 for ₹263.03)
    currency: str = "INR"
    key_id: str
    booking_id: str
    sandbox: bool = True


class VerifyRazorpayPaymentRequest(BaseModel):
    booking_id: str = Field(..., description="UUID or ID of the booking")
    razorpay_order_id: str = Field(..., description="Razorpay order identifier")
    razorpay_payment_id: str = Field(..., description="Razorpay payment identifier")
    razorpay_signature: str = Field(..., description="HMAC-SHA256 signature from Razorpay checkout")


class VerifyRazorpayPaymentResponse(BaseModel):
    success: bool
    transaction_id: str
    status: str  # 'COMPLETED', 'FAILED'
    payment_method: str = "RAZORPAY"
    amount: float
    message: Optional[str] = None


class RefundRazorpayPaymentRequest(BaseModel):
    booking_id: str = Field(..., description="UUID or ID of the booking to refund")
    amount: Optional[float] = Field(None, ge=0.0, description="Amount to refund (defaults to full transaction amount)")
    reason: Optional[str] = Field("Customer cancellation", description="Refund reason")


class RefundRazorpayPaymentResponse(BaseModel):
    success: bool
    refund_id: str
    status: str = "REFUNDED"
    amount: float
    message: Optional[str] = None
