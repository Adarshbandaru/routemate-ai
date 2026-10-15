/**
 * Shared Simulation Clock state and hook
 * Provides synchronized timeline controls for Guided Demo, Batch Assignment, Dispatch Comparison, and Fleet Staging.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function useSimulationClock({
  durationSeconds = 60,
  initialSpeed = 1,
  events = [],
  autoPlay = false,
  reducedMotion = false,
  onEventTrigger = null,
} = {}) {
  const [isPlaying, setIsPlaying] = useState(autoPlay && !reducedMotion);
  const [currentTime, setCurrentTime] = useState(0); // [0, durationSeconds]
  const [speed, setSpeed] = useState(initialSpeed); // 0.5, 1, 2, 4
  const lastFrameRef = useRef(null);
  const rafRef = useRef(null);
  const triggeredEventsRef = useRef(new Set());

  // Handle visibility change: auto-pause when tab is hidden
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden && isPlaying) {
        setIsPlaying(false);
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying]);

  // Main rAF animation loop
  useEffect(() => {
    if (!isPlaying || reducedMotion) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
      return;
    }

    function frame(now) {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = now;
      }
      const dtSeconds = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      setCurrentTime((prevTime) => {
        const nextTime = prevTime + dtSeconds * speed;
        if (nextTime >= durationSeconds) {
          setIsPlaying(false);
          return durationSeconds;
        }

        // Check for event triggers
        if (events && events.length > 0 && onEventTrigger) {
          for (const ev of events) {
            if (
              ev.time <= nextTime &&
              ev.time >= prevTime &&
              !triggeredEventsRef.current.has(ev.id)
            ) {
              triggeredEventsRef.current.add(ev.id);
              onEventTrigger(ev);
            }
          }
        }

        return nextTime;
      });

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, speed, durationSeconds, events, onEventTrigger, reducedMotion]);

  const togglePlay = useCallback(() => {
    if (reducedMotion) return;
    setIsPlaying((prev) => {
      if (!prev && currentTime >= durationSeconds) {
        // Reset to start if finished
        setCurrentTime(0);
        triggeredEventsRef.current.clear();
      }
      return !prev;
    });
  }, [currentTime, durationSeconds, reducedMotion]);

  const seek = useCallback((time) => {
    const clamped = Math.max(0, Math.min(durationSeconds, time));
    setCurrentTime(clamped);
    // Reset triggered events past seek point
    triggeredEventsRef.current.clear();
    for (const ev of events) {
      if (ev.time < clamped) triggeredEventsRef.current.add(ev.id);
    }
  }, [durationSeconds, events]);

  const setPlaybackSpeed = useCallback((s) => {
    setSpeed(s);
  }, []);

  const stepNextEvent = useCallback(() => {
    // Find next event ahead of current time
    const futureEvents = events.filter((e) => e.time > currentTime + 0.1).sort((a, b) => a.time - b.time);
    if (futureEvents.length > 0) {
      seek(futureEvents[0].time);
      if (onEventTrigger) onEventTrigger(futureEvents[0]);
    } else {
      seek(durationSeconds);
    }
  }, [events, currentTime, durationSeconds, seek, onEventTrigger]);

  const stepPrevEvent = useCallback(() => {
    // Find previous event behind current time
    const pastEvents = events.filter((e) => e.time < currentTime - 0.1).sort((a, b) => b.time - a.time);
    if (pastEvents.length > 0) {
      seek(pastEvents[0].time);
    } else {
      seek(0);
    }
  }, [events, currentTime, seek]);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    triggeredEventsRef.current.clear();
  }, []);

  return {
    currentTime,
    progress: durationSeconds > 0 ? currentTime / durationSeconds : 0,
    isPlaying,
    speed,
    togglePlay,
    seek,
    setSpeed: setPlaybackSpeed,
    stepNextEvent,
    stepPrevEvent,
    reset,
    durationSeconds,
  };
}
