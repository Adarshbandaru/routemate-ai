import { Play, Pause, SkipBack, SkipForward, RotateCcw, Clock } from 'lucide-react';

export default function SimulationClockBar({
  clock,
  events = [],
  reducedMotion = false,
  title = 'Simulation Clock',
}) {
  const {
    currentTime,
    progress,
    isPlaying,
    speed,
    togglePlay,
    seek,
    setSpeed,
    stepNextEvent,
    stepPrevEvent,
    reset,
    durationSeconds,
  } = clock;

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toFixed(1);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(4, '0')}`;
  };

  const speedOptions = [0.5, 1, 2, 4];

  return (
    <div className="simulation-clock-bar" role="region" aria-label="Simulation Playback Timeline">
      <div className="clock-bar-header">
        <div className="clock-title-group">
          <Clock size={15} className="text-accent" aria-hidden="true" />
          <span className="clock-title">{title}</span>
          <span className="badge warning sim-badge">Simulated</span>
          {reducedMotion && <span className="badge neutral">Step Mode (Reduced Motion)</span>}
        </div>

        <div className="clock-time-display font-mono">
          <span className="current-time">{formatTime(currentTime)}</span>
          <span className="time-sep">/</span>
          <span className="total-time">{formatTime(durationSeconds)}</span>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginLeft: '4px' }}>({(progress * 100).toFixed(0)}%)</span>
        </div>
      </div>

      {/* Scrubber track with event tick marks */}
      <div className="timeline-track-container">
        <input
          type="range"
          min="0"
          max={durationSeconds}
          step="0.1"
          value={currentTime}
          onChange={(e) => seek(parseFloat(e.target.value))}
          className="timeline-scrubber"
          aria-label="Simulation timeline scrubber"
        />

        {/* Event ticks */}
        <div className="timeline-event-ticks" aria-hidden="true">
          {events.map((ev) => {
            const leftPct = (ev.time / durationSeconds) * 100;
            const isPassed = currentTime >= ev.time;
            return (
              <div
                key={ev.id}
                className={`timeline-tick ${isPassed ? 'passed' : ''} ${ev.type || ''}`}
                style={{ left: `${leftPct}%` }}
                title={`${ev.label} at ${formatTime(ev.time)}`}
              />
            );
          })}
        </div>
      </div>

      {/* Transport Controls */}
      <div className="clock-controls-row">
        <div className="transport-btns">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={reset}
            title="Reset to 00:00 (R)"
            aria-label="Reset timeline"
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={stepPrevEvent}
            title="Step to previous event (←)"
            aria-label="Previous simulation event"
          >
            <SkipBack size={14} />
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm play-btn"
            onClick={togglePlay}
            disabled={reducedMotion}
            title={isPlaying ? 'Pause (Space)' : 'Play simulation (Space)'}
            aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={stepNextEvent}
            title="Step to next event (→)"
            aria-label="Next simulation event"
          >
            <SkipForward size={14} />
          </button>
        </div>

        {/* Speed selectors */}
        <div className="speed-selector" role="group" aria-label="Playback speed">
          <span className="speed-label">Speed:</span>
          {speedOptions.map((s) => (
            <button
              key={s}
              type="button"
              className={`speed-btn ${speed === s ? 'active' : ''}`}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
