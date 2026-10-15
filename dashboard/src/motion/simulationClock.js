/**
 * Shared Simulation Clock state and hook
 * Provides synchronized timeline controls for Guided Demo, Batch Assignment, Dispatch Comparison, and Fleet Staging.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function stepClockTime(currentTime, dtSeconds, speed, durationSeconds) {
  const rawNext = currentTime + dtSeconds * speed;
  const isFinished = rawNext >= durationSeconds;
  const nextTime = Math.min(durationSeconds, Math.max(0, rawNext));
  return { nextTime, isFinished };
}

export function detectTriggeredEvents(events, prevTime, nextTime, triggeredSet) {
  if (!events || events.length === 0) return [];
  const triggered = [];
  for (const ev of events) {
    if (
      ev.time <= nextTime &&
      ev.time >= prevTime &&
      (!triggeredSet || !triggeredSet.has(ev.id))
    ) {
      triggered.push(ev);
    }
  }
  return triggered;
}

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

  const currentTimeRef = useRef(0);
  const lastFrameRef = useRef(null);
  const rafRef = useRef(null);
  const triggeredEventsRef = useRef(new Set());

  // Stable references for props that change frequently or by reference
  const eventsRef = useRef(events);
  const onEventTriggerRef = useRef(onEventTrigger);
  const speedRef = useRef(speed);
  const durationSecondsRef = useRef(durationSeconds);

  // Sync latest props into refs cleanly post-commit
  useEffect(() => {
    eventsRef.current = events;
    onEventTriggerRef.current = onEventTrigger;
    speedRef.current = speed;
    durationSecondsRef.current = durationSeconds;
  });

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
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastFrameRef.current = null;
      return;
    }

    function frame(now) {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = now;
      }
      const dtSeconds = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      const prevTime = currentTimeRef.current;
      const { nextTime, isFinished } = stepClockTime(
        prevTime,
        dtSeconds,
        speedRef.current,
        durationSecondsRef.current
      );

      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);

      // Check for event triggers
      const triggered = detectTriggeredEvents(
        eventsRef.current,
        prevTime,
        nextTime,
        triggeredEventsRef.current
      );

      if (triggered.length > 0) {
        for (const ev of triggered) {
          triggeredEventsRef.current.add(ev.id);
          if (onEventTriggerRef.current) {
            onEventTriggerRef.current(ev);
          }
        }
      }

      if (isFinished) {
        setIsPlaying(false);
        lastFrameRef.current = null;
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        return;
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, reducedMotion]);

  const togglePlay = useCallback(() => {
    if (reducedMotion) return;
    if (!isPlaying && currentTimeRef.current >= durationSecondsRef.current) {
      // Reset to start if finished
      currentTimeRef.current = 0;
      setCurrentTime(0);
      triggeredEventsRef.current.clear();
      lastFrameRef.current = null;
      setIsPlaying(true);
      return;
    }
    setIsPlaying((prev) => !prev);
  }, [isPlaying, reducedMotion]);

  const seek = useCallback((time) => {
    const clamped = Math.max(0, Math.min(durationSecondsRef.current, time));
    currentTimeRef.current = clamped;
    setCurrentTime(clamped);
    lastFrameRef.current = null;

    // Reset triggered events past seek point
    triggeredEventsRef.current.clear();
    if (eventsRef.current) {
      for (const ev of eventsRef.current) {
        if (ev.time < clamped) {
          triggeredEventsRef.current.add(ev.id);
        }
      }
    }
  }, []);

  const setPlaybackSpeed = useCallback((s) => {
    setSpeed(s);
  }, []);

  const stepNextEvent = useCallback(() => {
    const current = currentTimeRef.current;
    const dur = durationSecondsRef.current;
    const futureEvents = (eventsRef.current || [])
      .filter((e) => e.time > current + 0.1)
      .sort((a, b) => a.time - b.time);

    if (futureEvents.length > 0) {
      seek(futureEvents[0].time);
      if (onEventTriggerRef.current) {
        onEventTriggerRef.current(futureEvents[0]);
      }
    } else {
      seek(dur);
    }
  }, [seek]);

  const stepPrevEvent = useCallback(() => {
    const current = currentTimeRef.current;
    const pastEvents = (eventsRef.current || [])
      .filter((e) => e.time < current - 0.1)
      .sort((a, b) => b.time - a.time);

    if (pastEvents.length > 0) {
      seek(pastEvents[0].time);
    } else {
      seek(0);
    }
  }, [seek]);

  const reset = useCallback(() => {
    setIsPlaying(false);
    currentTimeRef.current = 0;
    setCurrentTime(0);
    lastFrameRef.current = null;
    triggeredEventsRef.current.clear();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
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
