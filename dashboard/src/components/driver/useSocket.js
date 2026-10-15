import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    (import.meta.env.VITE_SOCKET_URL || import.meta.env.REACT_APP_SOCKET_URL)) ||
  'http://localhost:8000';

export function useSocket(driverId = 'drv_priya', token = null) {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [lastAccepted, setLastAccepted] = useState(null);
  const [messages, setMessages] = useState([]);
  const [cancelledBookingId, setCancelledBookingId] = useState(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
      autoConnect: true,
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('driver:connect', { driver_id: driverId, status: 'online' });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('booking:new_request', (data) => {
      setIncomingRequest(data);
    });

    socket.on('booking:accepted', (data) => {
      setLastAccepted(data);
    });

    socket.on('booking:message', (data) => {
      setMessages((prev) => [...prev, data]);
    });

    socket.on('booking:rider_cancelled', (data) => {
      setCancelledBookingId(data?.booking_id);
    });

    return () => {
      socket.disconnect();
    };
  }, [driverId, token]);

  const getSocket = useCallback(() => socketRef.current, []);

  const emitLocationUpdate = useCallback(
    (coords) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('driver:location_update', {
          driver_id: driverId,
          ...coords,
        });
      }
    },
    [driverId]
  );

  const respondToRequest = useCallback(
    (bookingId, response) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('driver:respond_request', {
          booking_id: bookingId,
          driver_id: driverId,
          response, // 'ACCEPT' | 'REJECT'
        });
      }
    },
    [driverId]
  );

  const sendMessage = useCallback(
    (bookingId, message) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('driver:message', {
          booking_id: bookingId,
          driver_id: driverId,
          message,
        });
      }
    },
    [driverId]
  );

  return {
    getSocket,
    isConnected,
    incomingRequest,
    setIncomingRequest,
    lastAccepted,
    messages,
    cancelledBookingId,
    emitLocationUpdate,
    respondToRequest,
    sendMessage,
  };
}
