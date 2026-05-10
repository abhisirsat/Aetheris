/**
 * @file useTimeStore.js
 * @module TimeStore
 * @description Zustand store for 4D timeline state.
 *              Manages current timestamp, playback state, speed, and time range.
 *              Supports scrubbing from 1940-01-01 through the 16-day forecast window.
 * @author Aetheris 4D
 */

import { create } from 'zustand';

/** Earliest supported historical date (Open-Meteo ERA5 archive start). */
const MIN_DATE = new Date('1940-01-01T00:00:00Z');

/**
 * @description Computes the maximum timeline date: today + 16 days in UTC.
 * @returns {Date} Maximum forecast date.
 */
function computeMaxDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 16);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * @typedef {'1x' | '2x' | '4x' | '8x' | '16x'} PlaybackSpeed
 */

/**
 * @typedef {Object} TimeState
 * @property {Date}   currentTimestamp  - Currently selected UTC timestamp.
 * @property {boolean} isPlaying        - Whether timeline auto-play is active.
 * @property {number} playbackSpeed     - Playback multiplier (1, 2, 4, 8, or 16).
 * @property {{ min: Date, max: Date }} timeRange - Full scrub range.
 * @property {(date: Date) => void} setTimestamp
 * @property {() => void} togglePlay
 * @property {(speed: number) => void} setPlaybackSpeed
 * @property {(hours: number) => void} stepForward
 * @property {(hours: number) => void} stepBackward
 */

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<TimeState>>} */
const useTimeStore = create((set, get) => ({
  currentTimestamp: new Date(),
  isPlaying: false,
  playbackSpeed: 1,
  timeRange: {
    min: MIN_DATE,
    max: computeMaxDate(),
  },

  /**
   * @function setTimestamp
   * @description Sets the active timeline position, clamped to the valid range.
   * @param {Date} date - New timestamp to activate.
   */
  setTimestamp: (date) => {
    const { timeRange } = get();
    const clamped = new Date(Math.max(timeRange.min.getTime(), Math.min(timeRange.max.getTime(), date.getTime())));
    set({ currentTimestamp: clamped });
  },

  /**
   * @function togglePlay
   * @description Toggles the auto-play state of the timeline.
   */
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  /**
   * @function setPlaybackSpeed
   * @description Sets the playback speed multiplier.
   * @param {number} speed - Multiplier value (1, 2, 4, 8, or 16).
   */
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  /**
   * @function stepForward
   * @description Advances the timestamp forward by the specified number of hours.
   * @param {number} hours - Number of hours to advance.
   */
  stepForward: (hours) => {
    const { currentTimestamp, timeRange } = get();
    const next = new Date(currentTimestamp.getTime() + hours * 3600 * 1000);
    const clamped = new Date(Math.min(next.getTime(), timeRange.max.getTime()));
    set({ currentTimestamp: clamped });
  },

  /**
   * @function stepBackward
   * @description Moves the timestamp backward by the specified number of hours.
   * @param {number} hours - Number of hours to rewind.
   */
  stepBackward: (hours) => {
    const { currentTimestamp, timeRange } = get();
    const prev = new Date(currentTimestamp.getTime() - hours * 3600 * 1000);
    const clamped = new Date(Math.max(prev.getTime(), timeRange.min.getTime()));
    set({ currentTimestamp: clamped });
  },
}));

export default useTimeStore;
