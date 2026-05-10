/**
 * @file TimelineScrubber.jsx
 * @module TimelineScrubber
 * @description Full-width 4D timeline scrubber panel at the bottom of the viewport.
 *              Supports scrubbing from 1940-01-01 through +16 day forecast.
 *              Color-codes three time zones: historical (amber), recent (cyan), forecast (purple).
 *              Displays current UTC datetime and full playback controls.
 * @author Aetheris 4D
 */

import React, { useCallback, useMemo } from 'react';
import {
  SkipBack, Rewind, Play, Pause, FastForward, SkipForward,
} from 'lucide-react';
import useTimeStore from '../../store/useTimeStore';

const SPEEDS = [1, 2, 4, 8, 16];

/**
 * @function formatUTC
 * @description Formats a Date as 'YYYY MMM DD — HH:MM UTC'.
 * @param {Date} date
 * @returns {string}
 */
function formatUTC(date) {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const y  = date.getUTCFullYear();
  const mo = months[date.getUTCMonth()];
  const d  = String(date.getUTCDate()).padStart(2, '0');
  const h  = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y} ${mo} ${d} — ${h}:${mi} UTC`;
}

/**
 * @component TimelineScrubber
 */
export default function TimelineScrubber() {
  const {
    currentTimestamp,
    isPlaying,
    playbackSpeed,
    timeRange,
    setTimestamp,
    togglePlay,
    setPlaybackSpeed,
    stepForward,
    stepBackward,
  } = useTimeStore();

  const minMs = timeRange.min.getTime();
  const maxMs = timeRange.max.getTime();
  const totalMs = maxMs - minMs;
  const nowMs = Date.now();

  // Slider value: 0–100000 for precision
  const sliderValue = Math.round(((currentTimestamp.getTime() - minMs) / totalMs) * 100000);

  /** @type {{ left: string, width: string, className: string }[]} */
  const zones = useMemo(() => {
    const fiveDaysAgoMs = nowMs - 5 * 24 * 3600 * 1000;
    const histEnd = Math.max(0, Math.min(1, (fiveDaysAgoMs - minMs) / totalMs));
    const recentEnd = Math.max(0, Math.min(1, (nowMs - minMs) / totalMs));
    return [
      { left: '0%',                       width: `${histEnd * 100}%`,               className: 'timeline-historical', label: 'Historical' },
      { left: `${histEnd * 100}%`,        width: `${(recentEnd - histEnd) * 100}%`, className: 'timeline-recent',     label: 'Recent' },
      { left: `${recentEnd * 100}%`,      width: `${(1 - recentEnd) * 100}%`,       className: 'timeline-forecast',   label: 'Forecast' },
    ];
  }, [minMs, totalMs, nowMs]);

  // "NOW" indicator position
  const nowFrac = Math.max(0, Math.min(1, (nowMs - minMs) / totalMs));

  const handleSliderChange = useCallback((e) => {
    const frac = Number(e.target.value) / 100000;
    const newDate = new Date(minMs + frac * totalMs);
    setTimestamp(newDate);
  }, [minMs, totalMs, setTimestamp]);

  const iconBtn = (onClick, children, label) => (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        background: 'none',
        border: 'none',
        color: 'rgba(255,255,255,0.7)',
        cursor: 'pointer',
        padding: '4px 6px',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        transition: 'color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.color = '#00ffff'}
      onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
    >
      {children}
    </button>
  );

  return (
    <div
      className="glass-panel"
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        right: 12,
        height: 80,
        zIndex: 10,
        padding: '8px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {/* ── Date Display ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          data-testid="current-datetime"
          style={{
            fontFamily: '"Space Mono", monospace',
            fontSize: 13,
            fontWeight: 700,
            color: '#00ffff',
            letterSpacing: '0.06em',
            textShadow: '0 0 8px rgba(0,255,255,0.4)',
          }}
        >
          {formatUTC(currentTimestamp)}
        </div>

        {/* ── Speed Selector ──────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4 }}>
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => setPlaybackSpeed(s)}
              style={{
                background: playbackSpeed === s ? 'rgba(0,255,255,0.15)' : 'none',
                border: `1px solid ${playbackSpeed === s ? 'rgba(0,255,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: playbackSpeed === s ? '#00ffff' : 'rgba(255,255,255,0.4)',
                borderRadius: 4,
                fontSize: 10,
                fontFamily: '"Space Mono", monospace',
                padding: '2px 6px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* ── Track + Slider ────────────────────────────────────── */}
      <div style={{ position: 'relative', height: 12 }}>
        {/* Colored zone bands */}
        <div style={{ position: 'absolute', inset: '4px 0', borderRadius: 2, overflow: 'hidden', display: 'flex' }}>
          {zones.map(z => (
            <div key={z.label} className={z.className} style={{ width: z.width, height: '100%' }} />
          ))}
        </div>

        {/* NOW indicator */}
        <div
          style={{
            position: 'absolute',
            left: `${nowFrac * 100}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: '#00ffff',
            boxShadow: '0 0 6px rgba(0,255,255,0.8)',
            zIndex: 2,
            transform: 'translateX(-50%)',
          }}
        />

        {/* Slider input */}
        <input
          data-testid="timeline-scrubber"
          type="range"
          min={0}
          max={100000}
          value={sliderValue}
          onChange={handleSliderChange}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0.001,
            cursor: 'pointer',
            zIndex: 3,
          }}
        />
      </div>

      {/* ── Playback Controls ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        {iconBtn(() => setTimestamp(timeRange.min), <SkipBack size={14} />, 'Go to start')}
        {iconBtn(() => stepBackward(6), <span style={{ fontSize: 10, fontFamily: '"Space Mono"', letterSpacing: -1 }}>−6h</span>, 'Back 6h')}
        {iconBtn(() => stepBackward(1), <span style={{ fontSize: 10, fontFamily: '"Space Mono"', letterSpacing: -1 }}>−1h</span>, 'Back 1h')}
        {iconBtn(togglePlay, isPlaying ? <Pause size={16} /> : <Play size={16} />, isPlaying ? 'Pause' : 'Play')}
        {iconBtn(() => stepForward(1), <span style={{ fontSize: 10, fontFamily: '"Space Mono"', letterSpacing: -1 }}>+1h</span>, 'Forward 1h')}
        {iconBtn(() => stepForward(6), <span style={{ fontSize: 10, fontFamily: '"Space Mono"', letterSpacing: -1 }}>+6h</span>, 'Forward 6h')}
        {iconBtn(() => setTimestamp(timeRange.max), <SkipForward size={14} />, 'Go to end')}
      </div>
    </div>
  );
}
