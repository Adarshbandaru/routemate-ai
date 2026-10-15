import { useEffect, useRef, useState, useCallback } from 'react';
import { apiService } from '../../services/apiService';

export function useLocationTracker({
  driverId = 'drv_priya',
  enabled = true,
  onLocationUpdate = null,
  updateIntervalMs = 10000,
}) {
  const [coords, setCoords] = useState({
    latitude: 31.2950,
    longitude: 75.6320,
    heading: 180,
    speed: 35,
  });
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);
  const lastEmitRef = useRef(0);

  const pushLocation = useCallback(
    async (lat, lng, heading = 180) => {
      try {
        await apiService.updateDriverLocation(driverId, lat, lng, heading);
      } catch {
        // Fallback or offline simulation
      }
    },
    [driverId]
  );

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    if ('geolocation' in navigator) {
      try {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const now = Date.now();
            const newCoords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              heading: pos.coords.heading || 180,
              speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 35,
            };
            setCoords(newCoords);

            // Throttle backend emission to every 10 seconds
            if (now - lastEmitRef.current >= updateIntervalMs) {
              lastEmitRef.current = now;
              pushLocation(newCoords.latitude, newCoords.longitude, newCoords.heading);
              if (onLocationUpdate) {
                onLocationUpdate(newCoords);
              }
            }
          },
          (err) => {
            setError(err.message);
            // Default fallback to Punjab GT Road corridor anchor
            const fallbackCoords = {
              latitude: 31.2950,
              longitude: 75.6320,
              heading: 180,
              speed: 40,
            };
            setCoords(fallbackCoords);
          },
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 5000,
          }
        );
      } catch {
        // Geolocation error
      }
    }

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [enabled, updateIntervalMs, pushLocation, onLocationUpdate]);

  return { coords, error };
}
