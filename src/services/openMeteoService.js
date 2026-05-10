/**
 * @file openMeteoService.js
 * @module OpenMeteoService
 * @description Data ingestion service for Open-Meteo REST APIs.
 *              Fetches forecast and historical weather data for arbitrary lat/lon grids.
 *              Normalizes raw API responses into GPU-ready UV wind texture data.
 *              Caches results keyed by bounding box hash + timestamp hour to avoid
 *              redundant network requests during timeline scrubbing.
 * @author Aetheris 4D
 */

import axios from 'axios';

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_BASE = 'https://archive-api.open-meteo.com/v1/archive';

const HOURLY_PARAMS = [
  'temperature_2m',
  'windspeed_10m',
  'winddirection_10m',
  'precipitation',
  'snowfall',
  'cloudcover',
  'cloudcover_low',
  'cloudcover_mid',
  'cloudcover_high',
  'windspeed_850hPa',
  'winddirection_850hPa',
  'windspeed_500hPa',
  'winddirection_500hPa',
].join(',');

/**
 * @typedef {Object} WeatherPoint
 * @property {number} lat - Latitude in degrees.
 * @property {number} lon - Longitude in degrees.
 * @property {number[]} temperature_2m - 2m temperature (°C) array, hourly.
 * @property {number[]} windspeed_10m - 10m wind speed (m/s) array, hourly.
 * @property {number[]} winddirection_10m - 10m wind direction (°) array, hourly.
 * @property {number[]} precipitation - Precipitation (mm/hr) array, hourly.
 * @property {number[]} snowfall - Snowfall (mm/hr) array, hourly.
 * @property {number[]} cloudcover - Total cloud cover (%) array, hourly.
 * @property {number[]} cloudcover_low - Low cloud cover (%) array, hourly.
 * @property {number[]} cloudcover_mid - Mid cloud cover (%) array, hourly.
 * @property {number[]} cloudcover_high - High cloud cover (%) array, hourly.
 * @property {number[]} windspeed_850hPa - 850 hPa wind speed (m/s) array.
 * @property {number[]} winddirection_850hPa - 850 hPa wind direction (°) array.
 * @property {number[]} windspeed_500hPa - 500 hPa wind speed (m/s) array.
 * @property {number[]} winddirection_500hPa - 500 hPa wind direction (°) array.
 */

/**
 * @typedef {Object} WeatherGrid
 * @property {WeatherPoint[]} points - Array of weather data points on the grid.
 * @property {number} rows - Number of grid rows (latitude axis).
 * @property {number} cols - Number of grid columns (longitude axis).
 * @property {number} timeIndex - Index into the hourly arrays for current time.
 * @property {{ north: number, south: number, east: number, west: number }} bounds - Grid bounds.
 */

/**
 * @typedef {{ north: number, south: number, east: number, west: number }} GridBounds
 */

/** @type {Map<string, WeatherGrid>} Cache keyed by `${boundsHash}_${hourIndex}` */
const cache = new Map();

/**
 * @function hashBounds
 * @description Generates a compact string key from bounding box coordinates.
 * @param {GridBounds} bounds - The geographic bounding box.
 * @returns {string} Hash string for use as a cache key prefix.
 */
function hashBounds(bounds) {
  return `${bounds.north.toFixed(2)}_${bounds.south.toFixed(2)}_${bounds.east.toFixed(2)}_${bounds.west.toFixed(2)}`;
}

/**
 * @function degToRad
 * @description Converts degrees to radians.
 * @param {number} deg - Angle in degrees.
 * @returns {number} Angle in radians.
 */
function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * @function windUV
 * @description Decomposes a wind speed + direction into U (east) and V (north) components.
 * @param {number} speed - Wind speed in m/s.
 * @param {number} dirDeg - Meteorological wind direction in degrees (0=N, 90=E).
 * @returns {{ u: number, v: number }} Wind vector components in m/s.
 */
function windUV(speed, dirDeg) {
  const rad = degToRad(dirDeg);
  const u = -speed * Math.sin(rad);  // eastward component
  const v = -speed * Math.cos(rad);  // northward component
  return { u, v };
}

/**
 * @function fetchSinglePoint
 * @description Fetches hourly weather data for a single lat/lon point from Open-Meteo.
 * @param {number} lat - Latitude in degrees.
 * @param {number} lon - Longitude in degrees.
 * @param {boolean} [historical=false] - Whether to use the archive endpoint.
 * @param {string} [startDate] - ISO date string for archive start (e.g. '2020-01-01').
 * @param {string} [endDate] - ISO date string for archive end (e.g. '2020-01-31').
 * @returns {Promise<WeatherPoint>} Normalized weather point data.
 */
async function fetchSinglePoint(lat, lon, historical = false, startDate, endDate) {
  const params = {
    latitude: lat,
    longitude: lon,
    hourly: HOURLY_PARAMS,
    timezone: 'auto',
    models: 'best_match',
  };

  let url = FORECAST_BASE;
  if (historical && startDate && endDate) {
    url = ARCHIVE_BASE;
    params.start_date = startDate;
    params.end_date = endDate;
  } else {
    params.forecast_days = 16;
  }

  const response = await axios.get(url, { params, timeout: 15000 });
  const h = response.data.hourly;

  return {
    lat,
    lon,
    temperature_2m: h.temperature_2m ?? [],
    windspeed_10m: h.windspeed_10m ?? [],
    winddirection_10m: h.winddirection_10m ?? [],
    precipitation: h.precipitation ?? [],
    snowfall: h.snowfall ?? [],
    cloudcover: h.cloudcover ?? [],
    cloudcover_low: h.cloudcover_low ?? [],
    cloudcover_mid: h.cloudcover_mid ?? [],
    cloudcover_high: h.cloudcover_high ?? [],
    windspeed_850hPa: h.windspeed_850hPa ?? [],
    winddirection_850hPa: h.winddirection_850hPa ?? [],
    windspeed_500hPa: h.windspeed_500hPa ?? [],
    winddirection_500hPa: h.winddirection_500hPa ?? [],
  };
}

/**
 * @function fetchForecastGrid
 * @description Fetches weather data for a 5×5 grid of lat/lon points within the
 *              specified bounding box and returns a normalized WeatherGrid object.
 *              Results are cached to avoid redundant API calls.
 * @param {GridBounds} bounds - Geographic bounding box {north, south, east, west}.
 * @returns {Promise<WeatherGrid>} The fetched and cached weather grid.
 */
export async function fetchForecastGrid(bounds) {
  const now = new Date();
  const hourIndex = now.getUTCHours();
  const cacheKey = `${hashBounds(bounds)}_${now.toISOString().slice(0, 13)}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const GRID_SIZE = 5;
  const latStep = (bounds.north - bounds.south) / (GRID_SIZE - 1);
  const lonStep = (bounds.east - bounds.west) / (GRID_SIZE - 1);

  const fetchPromises = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const lat = bounds.south + row * latStep;
      const lon = bounds.west + col * lonStep;
      fetchPromises.push(fetchSinglePoint(lat, lon));
    }
  }

  const points = await Promise.all(fetchPromises);

  /** @type {WeatherGrid} */
  const grid = {
    points,
    rows: GRID_SIZE,
    cols: GRID_SIZE,
    timeIndex: hourIndex,
    bounds,
  };

  cache.set(cacheKey, grid);
  if (cache.size > 50) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }

  return grid;
}

/**
 * @function fetchHistoricalPoint
 * @description Fetches historical weather data for a single point from the Open-Meteo archive.
 * @param {number} lat - Latitude in degrees.
 * @param {number} lon - Longitude in degrees.
 * @param {string} startDate - ISO date string (e.g. '1940-01-01').
 * @param {string} endDate - ISO date string (e.g. '1940-01-31').
 * @returns {Promise<WeatherPoint>} Historical weather point data.
 */
export async function fetchHistoricalPoint(lat, lon, startDate, endDate) {
  return fetchSinglePoint(lat, lon, true, startDate, endDate);
}

/**
 * @function normalizeToUVTexture
 * @description Converts a WeatherGrid into two Float32Arrays suitable for GPU texture upload.
 *              U channel = normalized eastward wind component (range −1 to +1).
 *              V channel = normalized northward wind component (range −1 to +1).
 * @param {WeatherGrid} weatherGrid - Normalized grid from Open-Meteo fetcher.
 * @param {number} width - Output texture width in pixels.
 * @param {number} height - Output texture height in pixels.
 * @returns {{ uChannel: Float32Array, vChannel: Float32Array, width: number, height: number }}
 *          GPU-ready UV texture data object.
 */
export function normalizeToUVTexture(weatherGrid, width, height) {
  const uChannel = new Float32Array(width * height);
  const vChannel = new Float32Array(width * height);
  const { points, rows, cols, timeIndex } = weatherGrid;

  const MAX_WIND_SPEED = 50; // m/s — used for normalization to [−1, +1]

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      // Bilinear interpolation across the 5×5 grid
      const gx = (px / (width - 1)) * (cols - 1);
      const gy = (py / (height - 1)) * (rows - 1);
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const x1 = Math.min(x0 + 1, cols - 1);
      const y1 = Math.min(y0 + 1, rows - 1);
      const fx = gx - x0;
      const fy = gy - y0;

      const getUV = (row, col) => {
        const pt = points[row * cols + col];
        const ti = Math.min(timeIndex, (pt.windspeed_10m.length || 1) - 1);
        const speed = pt.windspeed_10m[ti] ?? 0;
        const dir = pt.winddirection_10m[ti] ?? 0;
        return windUV(speed, dir);
      };

      const uv00 = getUV(y0, x0);
      const uv10 = getUV(y0, x1);
      const uv01 = getUV(y1, x0);
      const uv11 = getUV(y1, x1);

      const u = uv00.u * (1 - fx) * (1 - fy) + uv10.u * fx * (1 - fy)
              + uv01.u * (1 - fx) * fy       + uv11.u * fx * fy;
      const v = uv00.v * (1 - fx) * (1 - fy) + uv10.v * fx * (1 - fy)
              + uv01.v * (1 - fx) * fy       + uv11.v * fx * fy;

      const idx = py * width + px;
      uChannel[idx] = Math.max(-1, Math.min(1, u / MAX_WIND_SPEED));
      vChannel[idx] = Math.max(-1, Math.min(1, v / MAX_WIND_SPEED));
    }
  }

  return { uChannel, vChannel, width, height };
}

/**
 * @function getCurrentWeatherAtPoint
 * @description Extracts the current time-slice weather values from a WeatherGrid for a
 *              specific grid point index.
 * @param {WeatherGrid} grid - The active weather grid.
 * @param {number} pointIndex - Index into grid.points array.
 * @returns {Object} Weather snapshot at the specified point and current time index.
 */
export function getCurrentWeatherAtPoint(grid, pointIndex) {
  const pt = grid.points[pointIndex];
  const ti = Math.min(grid.timeIndex, (pt.temperature_2m.length || 1) - 1);
  return {
    lat: pt.lat,
    lon: pt.lon,
    temperature: pt.temperature_2m[ti] ?? null,
    windSpeed: pt.windspeed_10m[ti] ?? null,
    windDirection: pt.winddirection_10m[ti] ?? null,
    precipitation: pt.precipitation[ti] ?? null,
    snowfall: pt.snowfall[ti] ?? null,
    cloudcover: pt.cloudcover[ti] ?? null,
    cloudcoverLow: pt.cloudcover_low[ti] ?? null,
    cloudcoverMid: pt.cloudcover_mid[ti] ?? null,
    cloudcoverHigh: pt.cloudcover_high[ti] ?? null,
  };
}
