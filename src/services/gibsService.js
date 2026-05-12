/**
 * @file gibsService.js
 * @module GIBSService
 * @description NASA GIBS (Global Imagery Browse Services) WMS client.
 *              Fetches real-time and historical satellite cloud imagery tiles.
 *              No API key required. Public domain under NASA open data policy.
 */

/**
 * @typedef {Object} GIBSCloudTexture
 * @property {HTMLImageElement} image - Loaded cloud satellite image
 * @property {string} date - ISO date string of the image
 * @property {string} layer - GIBS layer name used
 */

/**
 * Primary GIBS WMS endpoint (EPSG:4326 projection)
 * Serves global satellite imagery at configurable dates and layers.
 */
const GIBS_WMS_BASE = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';

/**
 * Cloud layer priority list — tried in order until one succeeds.
 * VIIRS is the most current (NOAA-20 satellite, near-realtime).
 * MODIS Terra is the fallback (older but very reliable data record).
 */
const CLOUD_LAYER_PRIORITY = [
  'VIIRS_NOAA20_CorrectedReflectance_TrueColor',   // NOAA-20, near-realtime
  'VIIRS_SNPP_CorrectedReflectance_TrueColor',     // Suomi NPP, daily
  'MODIS_Terra_CorrectedReflectance_TrueColor',    // Terra, highly reliable
  'MODIS_Aqua_CorrectedReflectance_TrueColor',     // Aqua, fallback
];

/**
 * Cache: key = "YYYY-MM-DD_layerName", value = HTMLImageElement
 * Prevents re-fetching on timeline scrub within the same day.
 * @type {Map<string, HTMLImageElement>}
 */
const textureCache = new Map();

/**
 * @function formatGIBSDate
 * @description Formats a Date object to YYYY-MM-DD string for GIBS API.
 *              GIBS uses UTC dates. Near-realtime layers fill up progressively 
 *              over the UTC day, causing a "half-earth" glitch if we request today.
 *              To ensure a full globe, we clamp the requested date to the most 
 *              recently *completed* UTC day.
 * @param {Date} date - The timestamp to format
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function formatGIBSDate(date) {
  const adjusted = new Date(date);
  
  const now = new Date();
  const latestComplete = new Date(now);
  
  // A UTC day ends at 24:00 UTC. It takes ~6-12 hours for the global composite 
  // to be 100% processed and published.
  // If current time is before 14:00 UTC, the safest complete day is 2 days ago.
  // If current time is after 14:00 UTC, yesterday is safely complete.
  if (now.getUTCHours() < 14) {
    latestComplete.setUTCDate(latestComplete.getUTCDate() - 2);
  } else {
    latestComplete.setUTCDate(latestComplete.getUTCDate() - 1);
  }
  
  if (adjusted.getTime() > latestComplete.getTime()) {
    adjusted.setTime(latestComplete.getTime());
  }

  return adjusted.toISOString().split('T')[0];
}

/**
 * @function buildGIBSWMSUrl
 * @description Constructs a GIBS WMS GetMap URL for a full-globe cloud image.
 * @param {string} layer - GIBS layer name
 * @param {string} date - Date string YYYY-MM-DD
 * @param {number} [width=4096] - Output image width in pixels
 * @param {number} [height=2048] - Output image height in pixels
 * @returns {string} Complete WMS URL
 */
export function buildGIBSWMSUrl(layer, date, width = 4096, height = 2048) {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: layer,
    SRS: 'EPSG:4326',
    BBOX: '-180,-90,180,90',
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: 'image/jpeg',
    TRANSPARENT: 'false',
    TIME: date,
  });
  return `${GIBS_WMS_BASE}?${params.toString()}`;
}

/**
 * @function fetchCloudTexture
 * @description Fetches a satellite cloud imagery texture for the given timestamp.
 *              Tries each layer in CLOUD_LAYER_PRIORITY until one loads successfully.
 *              Results are cached by date to avoid redundant network requests.
 * @param {Date} timestamp - The target datetime for cloud imagery
 * @param {'high'|'medium'|'low'} [quality='medium'] - Texture resolution tier
 * @returns {Promise<GIBSCloudTexture>} Resolved with the loaded image and metadata
 * @throws {Error} If all layers fail to load
 */
export async function fetchCloudTexture(timestamp, quality = 'medium') {
  const resolutionMap = { high: [4096, 2048], medium: [2048, 1024], low: [1024, 512] };
  const [width, height] = resolutionMap[quality];
  const dateStr = formatGIBSDate(timestamp);

  // For future dates (forecast) or today, effectiveDate is clamped by formatGIBSDate
  const effectiveDate = formatGIBSDate(timestamp);

  for (const layer of CLOUD_LAYER_PRIORITY) {
    const cacheKey = `${effectiveDate}_${layer}_${quality}`;

    if (textureCache.has(cacheKey)) {
      return { image: textureCache.get(cacheKey), date: effectiveDate, layer };
    }

    const url = buildGIBSWMSUrl(layer, effectiveDate, width, height);

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`GIBS layer ${layer} failed for ${effectiveDate}`));
        // Timeout after 15 seconds
        const timeout = setTimeout(() => reject(new Error('GIBS fetch timeout')), 15000);
        img.onload = () => { clearTimeout(timeout); resolve(img); };
        img.src = url;
      });

      textureCache.set(cacheKey, image);
      // Limit cache size to 10 entries to avoid memory pressure
      if (textureCache.size > 10) {
        const firstKey = textureCache.keys().next().value;
        textureCache.delete(firstKey);
      }

      return { image, date: effectiveDate, layer };
    } catch {
      // Try next layer
      continue;
    }
  }

  throw new Error(`All GIBS layers failed for date ${effectiveDate}`);
}

/**
 * @function clearCloudTextureCache
 * @description Clears the in-memory texture cache. Call when memory pressure is high.
 * @returns {void}
 */
export function clearCloudTextureCache() {
  textureCache.clear();
}
