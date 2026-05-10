/**
 * @file useTimeSync.js
 * @module useTimeSync
 * @description React hook that subscribes to timeline timestamp changes and
 *              triggers debounced weather data fetches when the time crosses
 *              an hourly (forecast) or 24-hour (historical) boundary.
 *              Also drives timeline auto-play by advancing the timestamp each second.
 * @author Aetheris 4D
 */

import { useEffect, useRef } from 'react';
import useTimeStore from '../store/useTimeStore';
import useWeatherStore from '../store/useWeatherStore';

const HISTORICAL_CUTOFF_MS = 5 * 24 * 3600 * 1000; // 5 days ago
const DEBOUNCE_MS = 500;

/**
 * @function useTimeSync
 * @description Subscribes to timestamp changes, triggers weather refetch on
 *              boundary crossing, and drives playback auto-advance.
 * @param {import('cesium').Viewer | null} viewer - The Cesium viewer (for bounds extraction).
 * @returns {void}
 */
export function useTimeSync(viewer) {
  const debounceRef       = useRef(null);
  const lastFetchedBound  = useRef(-1);
  const playIntervalRef   = useRef(null);
  // Track previous values for manual diff inside plain subscribe
  const prevIsPlaying     = useRef(false);
  const prevTimestamp     = useRef(null);

  // ── Auto-play: advance 1h × playbackSpeed every second ───────────
  useEffect(() => {
    const stopPlay = () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };

    const unsubscribe = useTimeStore.subscribe((state) => {
      const isPlaying = state.isPlaying;
      if (isPlaying === prevIsPlaying.current) return;
      prevIsPlaying.current = isPlaying;

      stopPlay();
      if (isPlaying) {
        playIntervalRef.current = setInterval(() => {
          const s = useTimeStore.getState();
          if (s.currentTimestamp >= s.timeRange.max) {
            s.togglePlay();
            return;
          }
          s.stepForward(s.playbackSpeed);
        }, 1000);
      }
    });

    return () => {
      unsubscribe();
      stopPlay();
    };
  }, []);

  // ── Debounced fetch on timestamp change ───────────────────────────
  useEffect(() => {
    const unsubscribe = useTimeStore.subscribe((state) => {
      const ts = state.currentTimestamp;
      if (ts === prevTimestamp.current) return;
      prevTimestamp.current = ts;

      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        const nowMs = Date.now();
        const cutoff = nowMs - HISTORICAL_CUTOFF_MS;
        const isHistorical = ts.getTime() < cutoff;
        const boundary = isHistorical
          ? Math.floor(ts.getTime() / (24 * 3600 * 1000))
          : ts.getUTCHours();

        if (boundary === lastFetchedBound.current) return;
        lastFetchedBound.current = boundary;

        let bounds = { north: 70, south: -70, east: 180, west: -180 };
        if (viewer) {
          try {
            const rect = viewer.camera.computeViewRectangle();
            if (rect) {
              const toDeg = (r) => (r * 180) / Math.PI;
              bounds = {
                north: Math.min(85,  toDeg(rect.north)),
                south: Math.max(-85, toDeg(rect.south)),
                east:  toDeg(rect.east),
                west:  toDeg(rect.west),
              };
            }
          } catch {
            // fallback to global
          }
        }

        useWeatherStore.getState().fetchGridForBounds(bounds);
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [viewer]);
}
