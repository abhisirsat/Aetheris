/**
 * @file useWeatherStore.js
 * @module WeatherStore
 * @description Zustand store for active weather data state.
 *              Manages the fetched WeatherGrid, fetch lifecycle, hover point data,
 *              and the current time index into the grid's hourly arrays.
 * @author Aetheris 4D
 */

import { create } from 'zustand';
import { fetchForecastGrid } from '../services/openMeteoService';

/**
 * @typedef {import('../services/openMeteoService').WeatherGrid} WeatherGrid
 * @typedef {import('../services/openMeteoService').GridBounds} GridBounds
 */

/**
 * @typedef {Object} HoveredPoint
 * @property {number}      lat  - Hovered latitude in degrees.
 * @property {number}      lon  - Hovered longitude in degrees.
 * @property {Object|null} data - Weather data at the hovered position.
 */

/**
 * @typedef {Object} WeatherState
 * @property {WeatherGrid | null}   activeGrid    - Currently loaded weather grid.
 * @property {number}               timeIndex     - Current hour index into grid arrays.
 * @property {boolean}              isFetching    - Whether a network request is in flight.
 * @property {string | null}        fetchError    - Last error message, or null if none.
 * @property {HoveredPoint | null}  hoveredPoint  - Globe hover position + data.
 * @property {(grid: WeatherGrid) => void}             setActiveGrid
 * @property {(idx: number) => void}                   setTimeIndex
 * @property {(point: HoveredPoint | null) => void}    setHoveredPoint
 * @property {(bounds: GridBounds) => Promise<void>}   fetchGridForBounds
 */

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<WeatherState>>} */
const useWeatherStore = create((set, get) => ({
  activeGrid:  null,
  timeIndex:   0,
  isFetching:  false,
  fetchError:  null,
  hoveredPoint: null,

  /**
   * @function setActiveGrid
   * @description Replaces the active weather grid and resets timeIndex to 0.
   * @param {WeatherGrid} grid - New weather grid.
   */
  setActiveGrid: (grid) => set({ activeGrid: grid, timeIndex: 0 }),

  /**
   * @function setTimeIndex
   * @description Updates which hour-slot index is active in the weather arrays.
   * @param {number} idx - Hour index (0 = first fetched hour).
   */
  setTimeIndex: (idx) => set({ timeIndex: idx }),

  /**
   * @function setHoveredPoint
   * @description Updates the globe hover position and associated weather data.
   * @param {HoveredPoint | null} point - Hovered point data, or null to clear.
   */
  setHoveredPoint: (point) => set({ hoveredPoint: point }),

  /**
   * @function fetchGridForBounds
   * @description Fetches fresh weather data for the given bounding box.
   *              On success, updates activeGrid and resets timeIndex.
   * @param {GridBounds} bounds - Geographic bounding box.
   * @returns {Promise<void>}
   */
  fetchGridForBounds: async (bounds) => {
    // Prevent concurrent fetches
    if (get().isFetching) return;
    set({ isFetching: true, fetchError: null });
    try {
      const grid = await fetchForecastGrid(bounds);
      set({ activeGrid: { ...grid, timeIndex: 0 }, timeIndex: 0, isFetching: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[WeatherStore] Fetch failed:', message);
      set({ isFetching: false, fetchError: message });
    }
  },
}));

export default useWeatherStore;
