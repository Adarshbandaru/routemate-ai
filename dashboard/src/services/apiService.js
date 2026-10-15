const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';

const TOKEN_KEY = 'routemate_auth_token';
const USER_KEY = 'routemate_auth_user';

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore local storage errors
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    // ignore
  }
}

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = getStoredToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = json?.detail?.error || json?.message || 'Network request failed';
    throw new Error(errorMsg);
  }
  return json;
}

export const apiService = {
  async checkHealth() {
    return request('/v1/health');
  },

  async sendOtp(phone) {
    return request('/v1/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  async verifyOtp(phone, otp) {
    const res = await request('/v1/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    });
    if (res?.data?.token) {
      setStoredToken(res.data.token);
      setStoredUser(res.data.user);
    }
    return res;
  },

  async getProfile() {
    return request('/v1/user/profile');
  },

  async logout() {
    setStoredToken(null);
    setStoredUser(null);
    try {
      await request('/v1/auth/logout', { method: 'POST' });
    } catch {
      // offline logout is fine
    }
  },

  async getDefaultRoutes() {
    return request('/v1/routes/default');
  },

  async createBooking(bookingData) {
    return request('/v1/bookings/create', {
      method: 'POST',
      body: JSON.stringify(bookingData),
    });
  },

  async getUserBookings() {
    return request('/v1/user/bookings');
  },

  // Driver Endpoints (Phase 2)
  async getDriverProfile(driverId = 'drv_priya') {
    return request(`/v1/drivers/${driverId}/profile`);
  },

  async updateDriverAvailability(driverId = 'drv_priya', available = true) {
    return request(`/v1/drivers/${driverId}/availability`, {
      method: 'PUT',
      body: JSON.stringify({ available }),
    });
  },

  async getDriverRequests(driverId = 'drv_priya') {
    return request(`/v1/drivers/${driverId}/requests`);
  },

  async acceptDriverRequest(driverId, bookingId) {
    return request(`/v1/drivers/${driverId}/requests/${bookingId}/accept`, {
      method: 'POST',
    });
  },

  async rejectDriverRequest(driverId, bookingId) {
    return request(`/v1/drivers/${driverId}/requests/${bookingId}/reject`, {
      method: 'POST',
    });
  },

  async getDriverEarnings(driverId = 'drv_priya') {
    return request(`/v1/drivers/${driverId}/earnings`);
  },

  // In-App Chat & Messaging (Phase 2)
  async getBookingMessages(bookingId) {
    return request(`/v1/bookings/${bookingId}/messages`);
  },

  async sendBookingMessage(bookingId, content, senderId = 'rider') {
    return request(`/v1/bookings/${bookingId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, sender_id: senderId }),
    });
  },

  // -------------------------------------------------------------
  // Phase 3: Advanced Features
  // -------------------------------------------------------------
  // Fare Estimation
  async estimateFare(payload) {
    return request('/v1/fare/estimate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Promo Codes
  async getAvailablePromos() {
    return request('/v1/promo/available');
  },

  async validatePromo(code, rideAmount) {
    return request('/v1/promo/validate', {
      method: 'POST',
      body: JSON.stringify({ code, ride_amount: rideAmount }),
    });
  },

  async applyPromo(bookingId, promoCode) {
    return request('/v1/promo/apply', {
      method: 'POST',
      body: JSON.stringify({ booking_id: bookingId, promo_code: promoCode }),
    });
  },

  // Cash Payment
  async confirmCashPayment(bookingId, amount) {
    return request('/v1/payment/confirm-cash', {
      method: 'POST',
      body: JSON.stringify({ booking_id: bookingId, amount }),
    });
  },

  async getPaymentStatus(bookingId) {
    return request(`/v1/payment/${encodeURIComponent(bookingId)}/status`);
  },

  // Ratings & Reviews
  async rateBooking(bookingId, ratingData) {
    return request(`/v1/booking/${encodeURIComponent(bookingId)}/rate`, {
      method: 'POST',
      body: JSON.stringify(ratingData),
    });
  },

  async getDriverRatings(driverId = 'drv_priya') {
    return request(`/v1/driver/${encodeURIComponent(driverId)}/ratings`);
  },

  async getBookingRating(bookingId) {
    return request(`/v1/booking/${encodeURIComponent(bookingId)}/rating`);
  },

  // Scheduled Bookings
  async scheduleRide(data) {
    return request('/v1/bookings/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getScheduledRides() {
    return request('/v1/bookings/scheduled');
  },

  async confirmScheduledRide(bookingId) {
    return request(`/v1/bookings/scheduled/${encodeURIComponent(bookingId)}/confirm`, {
      method: 'POST',
    });
  },

  async cancelScheduledRide(bookingId) {
    return request(`/v1/bookings/scheduled/${encodeURIComponent(bookingId)}/cancel`, {
      method: 'POST',
    });
  },

  // Ride Pooling
  async poolRide(data) {
    return request('/v1/bookings/pool', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getBookingPoolStatus(bookingId) {
    return request(`/v1/bookings/${encodeURIComponent(bookingId)}/pool`);
  },

  // Favorite Drivers
  async addFavoriteDriver(driverId) {
    return request(`/v1/driver/${encodeURIComponent(driverId)}/favorite`, {
      method: 'POST',
    });
  },

  async getFavoriteDriverStatus(driverId) {
    return request(`/v1/driver/${encodeURIComponent(driverId)}/favorite`);
  },

  async removeFavoriteDriver(driverId) {
    return request(`/v1/driver/${encodeURIComponent(driverId)}/favorite`, {
      method: 'DELETE',
    });
  },

  // Trip Receipt & History
  async getTripReceipt(bookingId) {
    return request(`/v1/bookings/${encodeURIComponent(bookingId)}/receipt`);
  },

  async getRideHistory() {
    return request('/v1/bookings/history');
  },

  // Wallet UI & Operational Ledger (Phase 4)
  async getWallet(userId = 'user_rider_demo') {
    return request(`/v1/wallet/${encodeURIComponent(userId)}`);
  },

  async getWalletTransactions(userId = 'user_rider_demo') {
    return request(`/v1/wallet/${encodeURIComponent(userId)}/transactions`);
  },

  async topupWallet(userId = 'user_rider_demo', amount, paymentMethod = 'RAZORPAY', referenceId = null) {
    return request(`/v1/wallet/${encodeURIComponent(userId)}/topup`, {
      method: 'POST',
      body: JSON.stringify({
        amount,
        payment_method: paymentMethod,
        reference_id: referenceId,
      }),
    });
  },

  async payWithWallet(userId = 'user_rider_demo', bookingId, amount = null) {
    return request(`/v1/wallet/${encodeURIComponent(userId)}/pay`, {
      method: 'POST',
      body: JSON.stringify({
        booking_id: bookingId,
        amount,
      }),
    });
  },

  // Razorpay Gateway (Phase 3.5)
  async createRazorpayOrder(bookingId, amount = null) {
    return request('/v1/payment/razorpay/order', {
      method: 'POST',
      body: JSON.stringify({ booking_id: bookingId, amount }),
    });
  },

  async verifyRazorpayPayment(bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature) {
    return request('/v1/payment/razorpay/verify', {
      method: 'POST',
      body: JSON.stringify({
        booking_id: bookingId,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
      }),
    });
  },

  async refundRazorpayPayment(bookingId, amount = null, reason = 'Customer cancellation') {
    return request('/v1/payment/razorpay/refund', {
      method: 'POST',
      body: JSON.stringify({
        booking_id: bookingId,
        amount,
        reason,
      }),
    });
  },
};

