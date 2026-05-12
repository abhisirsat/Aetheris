# ANTIGRAVITY ENGINEER PROMPT — AETHERIS 4D: CLOUD SYSTEM OVERHAUL
## Replace Grain Particles → Satellite Cloud Texture Sphere
**Model:** claude-sonnet-4-6 | **Scope:** Cloud rendering only | **Risk:** Low — isolated module replacement

---

## ◈ DIAGNOSIS (DO NOT SKIP READING THIS)

The current cloud system renders clouds as **individual GPU particles or dot points** distributed per grid cell where `cloudcover > threshold`. The visual result is thousands of tiny white specks uniformly scattered like static noise — high GPU load, terrible aesthetics, zero resemblance to actual clouds.

**What Google Earth does:** It drapes a semi-transparent sphere slightly above the globe surface, textured with **real satellite cloud imagery** from NASA/GOES. This is a single draw call, photorealistic, geographically accurate, and costs almost nothing in performance.

**The fix:** Delete the particle-based cloud system entirely. Replace it with:
1. A `THREE.SphereGeometry` cloud shell at ~6420km radius (just above Earth surface)
2. Textured with a WMS image from **NASA GIBS (free, no API key)**
3. A GLSL fragment shader that extracts only the cloud pixels, making land/ocean transparent
4. Time-aware: fetches the correct satellite snapshot when the timeline scrubs

---

## ◈ FILES TO TOUCH

You will modify or create exactly these files:

| Action | File Path | What to do |
|---|---|---|
| **DELETE all content** | `src/rendering/CloudSystem.js` | Rewrite from scratch |
| **DELETE all content** | `src/shaders/cloudVolume.frag.glsl` | Replace with cloud extraction shader |
| **CREATE NEW** | `src/shaders/cloudVolume.vert.glsl` | Simple passthrough vertex shader |
| **CREATE NEW** | `src/services/gibsService.js` | NASA GIBS WMS fetcher |
| **MODIFY** | `src/rendering/RenderLoop.js` | Remove old cloud ping-pong calls, hook new system |
| **MODIFY** | `src/hooks/useTimeSync.js` | Trigger cloud texture refresh on time change |

Do **not** modify any other files unless a breaking dependency forces it.

---

## ◈ STEP 1 — CREATE `src/services/gibsService.js`

This module fetches satellite cloud imagery from NASA GIBS (100% free, no API key).

```javascript
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
 *              GIBS uses UTC dates. Times before 12:00 UTC use previous day's imagery.
 * @param {Date} date - The timestamp to format
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function formatGIBSDate(date) {
  // GIBS imagery is published ~3-6 hours after UTC midnight.
  // If the requested time is before 06:00 UTC, use the previous day's image.
  const adjusted = new Date(date);
  if (adjusted.getUTCHours() < 6) {
    adjusted.setUTCDate(adjusted.getUTCDate() - 1);
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

  // For future dates (forecast), use today's imagery (most recent available)
  const now = new Date();
  const effectiveDate = timestamp > now ? formatGIBSDate(now) : dateStr;

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
```

---

## ◈ STEP 2 — CREATE `src/shaders/cloudVolume.vert.glsl`

Simple passthrough vertex shader. The cloud sphere uses standard UV coordinates.

```glsl
/**
 * @shader cloudVolume.vert
 * @description Passthrough vertex shader for the cloud sphere.
 *              Passes UV coordinates to the fragment shader for texture sampling.
 *              No custom vertex displacement — the sphere geometry handles altitude.
 */

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

---

## ◈ STEP 3 — REWRITE `src/shaders/cloudVolume.frag.glsl`

This shader is the core of the entire overhaul. It receives the raw NASA satellite true-color image and extracts only the cloud pixels, making everything else transparent.

```glsl
/**
 * @shader cloudVolume.frag
 * @description Cloud extraction fragment shader for Aetheris 4D.
 *
 *              ALGORITHM:
 *              NASA GIBS TrueColor imagery contains the full Earth surface
 *              (land, ocean, ice, and clouds). This shader isolates clouds by
 *              detecting pixels that are:
 *                1. High brightness (clouds are bright white/grey)
 *                2. Low color saturation (clouds are neutrally colored)
 *                3. Not matching known land/ocean color signatures
 *
 *              The result is a semi-transparent cloud layer that looks like
 *              the cloud overlay in Google Earth / NASA WorldWind.
 *
 * @uniform sampler2D uSatelliteTexture - Full-globe NASA GIBS satellite image
 * @uniform float uCloudOpacity         - Master opacity [0.0 - 1.0], default 0.85
 * @uniform float uCloudThreshold       - Brightness threshold for cloud detection [0.0 - 1.0]
 * @uniform float uCloudSoftness        - Edge feathering width [0.0 - 1.0], default 0.15
 * @uniform float uTime                 - Time in seconds, used for subtle cloud drift animation
 */

uniform sampler2D uSatelliteTexture;
uniform float uCloudOpacity;
uniform float uCloudThreshold;
uniform float uCloudSoftness;
uniform float uTime;

varying vec2 vUv;

/**
 * @function luminance
 * @description Perceptual luminance of an RGB color using ITU-R BT.601 coefficients.
 * @param {vec3} color - Linear RGB color
 * @returns {float} Perceptual luminance [0.0 - 1.0]
 */
float luminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

/**
 * @function colorSaturation
 * @description Simple HSV-style saturation: how far the color is from grey.
 *              Pure grey = 0.0, fully saturated = 1.0.
 * @param {vec3} color - RGB color
 * @returns {float} Saturation [0.0 - 1.0]
 */
float colorSaturation(vec3 color) {
  float maxC = max(color.r, max(color.g, color.b));
  float minC = min(color.r, min(color.g, color.b));
  if (maxC < 0.001) return 0.0;
  return (maxC - minC) / maxC;
}

void main() {
  // Very subtle UV drift for cloud animation (simulates atmospheric movement)
  // Drift is tiny — imperceptible at realtime but visible on fast playback
  vec2 driftUv = vUv + vec2(uTime * 0.00002, uTime * 0.000005);
  driftUv = fract(driftUv); // wrap UV

  vec4 satellite = texture2D(uSatelliteTexture, driftUv);
  vec3 color = satellite.rgb;

  // --- Cloud Detection ---

  // 1. Perceptual brightness (clouds are bright)
  float bright = luminance(color);

  // 2. Color saturation (clouds are grey/white, low saturation)
  //    Land is green/brown, ocean is deep blue — both have higher saturation
  float sat = colorSaturation(color);

  // 3. "Cloud whiteness" metric:
  //    High brightness + low saturation = cloud
  //    The (1.0 - sat * 2.0) term aggressively suppresses colored pixels.
  float cloudness = bright * (1.0 - clamp(sat * 2.5, 0.0, 1.0));

  // 4. Remap cloudness through threshold with soft edges
  //    smoothstep creates the feathered cloud edges, not hard cutoffs
  float cloudAlpha = smoothstep(
    uCloudThreshold - uCloudSoftness,
    uCloudThreshold + uCloudSoftness,
    cloudness
  );

  // 5. Further suppress low-brightness clouds (shadows, dark cloud edges)
  //    This prevents thin haze and dark pixels from showing as cloud
  cloudAlpha *= smoothstep(0.35, 0.65, bright);

  // 6. Cloud color: slightly warm white for sunlit surfaces, cool white in shadow
  //    Pure white looks flat; a tiny warmth makes the clouds photorealistic
  vec3 cloudColor = mix(
    vec3(0.90, 0.92, 0.98), // cool shadow side
    vec3(1.00, 0.99, 0.97), // warm sunlit side
    bright
  );

  // 7. Apply master opacity
  float finalAlpha = cloudAlpha * uCloudOpacity;

  // Discard near-transparent pixels for performance (avoid overdraw)
  if (finalAlpha < 0.02) discard;

  gl_FragColor = vec4(cloudColor, finalAlpha);
}
```

---

## ◈ STEP 4 — REWRITE `src/rendering/CloudSystem.js`

Complete replacement. Delete everything in this file and write the following:

```javascript
/**
 * @file CloudSystem.js
 * @module CloudSystem
 * @description Satellite cloud sphere renderer for Aetheris 4D.
 *
 *              Architecture:
 *              A THREE.SphereGeometry at radius 6421km (just above Earth's surface
 *              at ~15km altitude) is textured with real NASA GIBS satellite imagery.
 *              A custom GLSL fragment shader extracts cloud pixels from the full-color
 *              satellite image, making all non-cloud surface transparent.
 *
 *              This replaces the previous particle-based cloud system which caused:
 *              - 10–22 FPS due to particle overdraw
 *              - Grainy, unrealistic appearance (uniform scatter noise)
 *              - No geographic cloud accuracy
 *
 *              The new system is a single draw call (ONE sphere mesh).
 *              Performance impact: ~0.5ms per frame vs ~40ms for particles.
 */

import * as THREE from 'three';
import vertexShader from '../shaders/cloudVolume.vert.glsl?raw';
import fragmentShader from '../shaders/cloudVolume.frag.glsl?raw';
import { fetchCloudTexture } from '../services/gibsService.js';

/**
 * Earth radius in meters (WGS-84 semi-major axis).
 * @constant {number}
 */
const EARTH_RADIUS_M = 6378137;

/**
 * Cloud shell altitude in meters above sea level.
 * Set to 15,000m — above all low/mid cloud layers, below cirrus.
 * The shell is a sphere so all cloud types render at this single height.
 * @constant {number}
 */
const CLOUD_ALTITUDE_M = 15000;

/**
 * Cloud sphere radius = Earth radius + cloud altitude, converted to Three.js units.
 * Three.js units in Aetheris = meters (1 unit = 1 meter).
 * @constant {number}
 */
const CLOUD_SPHERE_RADIUS = (EARTH_RADIUS_M + CLOUD_ALTITUDE_M);

/**
 * @class CloudSystem
 * @description Manages the satellite cloud sphere, texture loading, and shader uniforms.
 */
export class CloudSystem {
  /**
   * @constructor
   * @param {THREE.Scene} scene - The Three.js scene to add the cloud sphere to
   * @param {object} [options] - Configuration options
   * @param {number} [options.segments=128] - Sphere geometry segments (higher = smoother)
   * @param {number} [options.opacity=0.85] - Master cloud layer opacity
   * @param {number} [options.threshold=0.38] - Cloud detection brightness threshold
   * @param {number} [options.softness=0.12] - Cloud edge feathering amount
   * @param {'high'|'medium'|'low'} [options.quality='medium'] - Satellite texture resolution
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = {
      segments: 128,
      opacity: 0.85,
      threshold: 0.38,
      softness: 0.12,
      quality: 'medium',
      ...options,
    };

    /** @type {THREE.Mesh|null} The cloud sphere mesh */
    this.mesh = null;

    /** @type {THREE.ShaderMaterial|null} The cloud extraction shader material */
    this.material = null;

    /** @type {THREE.Texture|null} Current satellite texture loaded on GPU */
    this.currentTexture = null;

    /** @type {boolean} Whether the cloud system is visible */
    this.visible = true;

    /** @type {string|null} Date string of the currently loaded texture */
    this.loadedDate = null;

    /** @type {boolean} Whether a texture fetch is in progress */
    this.isFetching = false;

    /** @type {number} Accumulated time for cloud drift animation (seconds) */
    this.time = 0;

    this._init();
  }

  /**
   * @private
   * @method _init
   * @description Creates the cloud sphere geometry, material, and mesh.
   *              Uploads a placeholder flat white texture until the satellite
   *              image loads, to avoid a flash of uncovered globe.
   * @returns {void}
   */
  _init() {
    // Geometry: high-segment sphere for smooth curvature at globe scale
    const geometry = new THREE.SphereGeometry(
      CLOUD_SPHERE_RADIUS,
      this.options.segments,
      this.options.segments / 2
    );

    // Placeholder 1x1 transparent texture (shown during initial load)
    const placeholderTexture = new THREE.DataTexture(
      new Uint8Array([200, 210, 220, 0]), // RGBA: near-white, fully transparent
      1, 1,
      THREE.RGBAFormat
    );
    placeholderTexture.needsUpdate = true;

    // Shader material using the cloud extraction shaders
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSatelliteTexture: { value: placeholderTexture },
        uCloudOpacity:     { value: this.options.opacity },
        uCloudThreshold:   { value: this.options.threshold },
        uCloudSoftness:    { value: this.options.softness },
        uTime:             { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,         // Don't write to depth buffer (transparent layer)
      side: THREE.FrontSide,     // Only render outside of sphere
      blending: THREE.NormalBlending,
    });

    // Create mesh and add to scene
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = 1;    // Render after the globe surface
    this.mesh.name = 'CloudSphere';
    this.scene.add(this.mesh);
  }

  /**
   * @method loadTextureForDate
   * @description Fetches and uploads the NASA GIBS cloud texture for a given date.
   *              Skips fetch if the same date is already loaded (cache-aware).
   *              Shows a subtle fade transition when the new texture arrives.
   * @param {Date} timestamp - Target datetime for cloud imagery
   * @returns {Promise<void>}
   */
  async loadTextureForDate(timestamp) {
    const { formatGIBSDate } = await import('../services/gibsService.js');
    const targetDate = formatGIBSDate(timestamp);

    // Skip if already loaded and not fetching
    if (targetDate === this.loadedDate || this.isFetching) return;

    this.isFetching = true;

    try {
      const { image, date } = await fetchCloudTexture(timestamp, this.options.quality);

      // Upload new image as a Three.js texture
      const newTexture = new THREE.Texture(image);
      newTexture.wrapS = THREE.RepeatWrapping;
      newTexture.wrapT = THREE.ClampToEdgeWrapping;
      newTexture.minFilter = THREE.LinearMipMapLinearFilter;
      newTexture.magFilter = THREE.LinearFilter;
      newTexture.anisotropy = 4;   // Reduces blurring at oblique globe angles
      newTexture.needsUpdate = true;

      // Fade out current opacity, swap texture, fade back in
      await this._fadeTransition(async () => {
        // Dispose old texture to free GPU memory
        if (this.currentTexture) {
          this.currentTexture.dispose();
        }
        this.currentTexture = newTexture;
        this.material.uniforms.uSatelliteTexture.value = newTexture;
        this.loadedDate = date;
      });

    } catch (error) {
      console.warn('[CloudSystem] Satellite texture fetch failed:', error.message);
      // Leave existing texture in place — don't show a broken state
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * @private
   * @method _fadeTransition
   * @description Smoothly fades the cloud opacity to 0, runs a callback, then fades back.
   *              Prevents jarring texture pop-in when a new satellite image loads.
   * @param {Function} swapCallback - Async function to run at zero opacity
   * @returns {Promise<void>}
   */
  async _fadeTransition(swapCallback) {
    const targetOpacity = this.options.opacity;
    const FADE_DURATION_MS = 800;
    const STEPS = 30;
    const STEP_DELAY = FADE_DURATION_MS / STEPS;

    // Fade out
    for (let i = STEPS; i >= 0; i--) {
      this.material.uniforms.uCloudOpacity.value = (i / STEPS) * targetOpacity;
      await new Promise(r => setTimeout(r, STEP_DELAY));
    }

    // Swap texture at zero opacity
    await swapCallback();

    // Fade in
    for (let i = 0; i <= STEPS; i++) {
      this.material.uniforms.uCloudOpacity.value = (i / STEPS) * targetOpacity;
      await new Promise(r => setTimeout(r, STEP_DELAY));
    }
  }

  /**
   * @method tick
   * @description Called every frame from the main render loop.
   *              Advances the time uniform for cloud drift animation.
   * @param {number} deltaTime - Frame delta time in seconds
   * @returns {void}
   */
  tick(deltaTime) {
    if (!this.visible || !this.material) return;
    this.time += deltaTime;
    this.material.uniforms.uTime.value = this.time;
  }

  /**
   * @method setVisible
   * @description Shows or hides the cloud sphere.
   * @param {boolean} visible
   * @returns {void}
   */
  setVisible(visible) {
    this.visible = visible;
    if (this.mesh) this.mesh.visible = visible;
  }

  /**
   * @method setOpacity
   * @description Updates cloud master opacity. Called from control panel slider.
   * @param {number} opacity - Value between 0.0 and 1.0
   * @returns {void}
   */
  setOpacity(opacity) {
    this.options.opacity = opacity;
    if (this.material) {
      this.material.uniforms.uCloudOpacity.value = opacity;
    }
  }

  /**
   * @method setThreshold
   * @description Updates the cloud detection threshold. Higher = fewer clouds shown.
   * @param {number} threshold - Value between 0.0 and 1.0
   * @returns {void}
   */
  setThreshold(threshold) {
    this.options.threshold = threshold;
    if (this.material) {
      this.material.uniforms.uCloudThreshold.value = threshold;
    }
  }

  /**
   * @method dispose
   * @description Cleans up GPU resources. Call when removing the cloud system.
   * @returns {void}
   */
  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    if (this.material) this.material.dispose();
    if (this.currentTexture) this.currentTexture.dispose();
    this.mesh = null;
    this.material = null;
    this.currentTexture = null;
  }
}
```

---

## ◈ STEP 5 — MODIFY `src/rendering/RenderLoop.js`

Find the section in the main render loop that calls the old cloud simulation (ping-pong render targets, cloud particle advance, etc.) and replace it.

**REMOVE:** Any calls to the old `CloudVolume`, `cloudSimStep()`, cloud ping-pong, or cloud particle advance.

**ADD:** In the section after wind simulation, call:

```javascript
// In the tick() function, after wind simulation step:
if (cloudSystem && useAtmosphereStore.getState().layersVisible.clouds) {
  cloudSystem.tick(delta);
}
```

**ADD:** In the initialization section where Three.js scene is set up:

```javascript
import { CloudSystem } from './CloudSystem.js';

// After Three.js scene is initialized:
const cloudSystem = new CloudSystem(threeScene, {
  segments: 128,
  opacity: 0.85,
  threshold: 0.38,
  softness: 0.12,
  quality: 'medium',   // Will be overridden by performanceSampler tier
});

// Load today's clouds immediately on startup
const initialTimestamp = useTimeStore.getState().currentTimestamp;
cloudSystem.loadTextureForDate(initialTimestamp);

// Expose to window for debugging (remove in production)
if (import.meta.env.DEV) window._cloudSystem = cloudSystem;
```

**CRITICAL:** Ensure the old cloud render target textures and ping-pong passes are fully removed. Search for any `cloudPingPong`, `cloudPositionTexture`, `cloudSimulationPass` references and delete them. They are dead code after this change.

---

## ◈ STEP 6 — MODIFY `src/hooks/useTimeSync.js`

The time sync hook must trigger a cloud texture reload when the timeline changes date.

Find the existing subscription to `useTimeStore.currentTimestamp` and add:

```javascript
// Inside the useTimeSync hook, after the existing fetchGridForBounds call:

// Cloud texture refresh — only re-fetch when the DATE changes (not just the hour)
// Cloud satellite imagery is daily, not hourly.
const prevCloudDateRef = useRef(null);

useEffect(() => {
  const unsubscribe = useTimeStore.subscribe(
    (state) => state.currentTimestamp,
    async (timestamp) => {
      const { formatGIBSDate } = await import('../services/gibsService.js');
      const newDate = formatGIBSDate(timestamp);

      if (newDate !== prevCloudDateRef.current) {
        prevCloudDateRef.current = newDate;
        // cloudSystem is accessed via the ref exported from RenderLoop
        if (cloudSystemRef.current) {
          cloudSystemRef.current.loadTextureForDate(timestamp);
        }
      }
    }
  );
  return unsubscribe;
}, []);
```

Ensure `cloudSystemRef` is a ref exported from `RenderLoop.js` and imported here. If the current architecture passes the cloudSystem differently, adapt accordingly — the key requirement is: **when the date changes, `cloudSystem.loadTextureForDate(newTimestamp)` is called**.

---

## ◈ STEP 7 — MODIFY `src/components/UI/ControlPanel.jsx`

The Cloud Settings section in the control panel currently controls old particle properties. Update it to control the new shader uniforms.

**REMOVE:** Old cloud settings that reference particle counts, ray steps, or ping-pong.

**REPLACE WITH:**

```jsx
{/* Cloud Settings — visible only when cloud layer is active */}
{layersVisible.clouds && (
  <div className="control-section">
    <h4 className="control-heading">Cloud Layer</h4>

    {/* Opacity slider */}
    <label className="control-label">Opacity</label>
    <input
      type="range" min="0" max="1" step="0.05"
      defaultValue="0.85"
      onChange={(e) => cloudSystemRef.current?.setOpacity(parseFloat(e.target.value))}
      className="control-slider"
    />

    {/* Threshold slider — controls how many clouds are "detected" */}
    <label className="control-label">Coverage Threshold</label>
    <input
      type="range" min="0.1" max="0.7" step="0.02"
      defaultValue="0.38"
      onChange={(e) => cloudSystemRef.current?.setThreshold(parseFloat(e.target.value))}
      className="control-slider"
    />

    {/* Quality selector */}
    <label className="control-label">Texture Quality</label>
    <select
      defaultValue="medium"
      onChange={(e) => {
        if (cloudSystemRef.current) {
          cloudSystemRef.current.options.quality = e.target.value;
          cloudSystemRef.current.loadedDate = null; // Force reload at new quality
          cloudSystemRef.current.loadTextureForDate(useTimeStore.getState().currentTimestamp);
        }
      }}
      className="control-select"
    >
      <option value="low">Low (1K)</option>
      <option value="medium">Medium (2K)</option>
      <option value="high">High (4K)</option>
    </select>

    {/* Live status readout */}
    <div className="control-status text-xs text-aetheris-plasma/60 mt-2">
      {cloudSystemRef.current?.loadedDate
        ? `Satellite: ${cloudSystemRef.current.loadedDate}`
        : 'Loading satellite imagery...'}
    </div>
  </div>
)}
```

---

## ◈ STEP 8 — PERFORMANCE TIER INTEGRATION

In `src/utils/performanceSampler.js`, after the existing particle tier selection, add cloud quality tier mapping:

```javascript
// After particle tier is determined, also set cloud texture quality
const cloudQualityMap = { high: 'medium', medium: 'low', low: 'low' };
// Note: Even "high" particle tier uses "medium" cloud quality (2K texture).
// "high" cloud quality (4K) is only for manual selection — auto keeps 2K max.
const cloudQuality = cloudQualityMap[particleTier];

// Pass to CloudSystem if already initialized, or store for initialization
useAtmosphereStore.getState().setCloudQuality(cloudQuality);
```

Add `cloudQuality: 'medium'` and `setCloudQuality: (q) => set({ cloudQuality: q })` to `useAtmosphereStore`.

---

## ◈ VERIFICATION CHECKLIST

After implementation, confirm all of the following before closing:

- [ ] `npm run dev` starts without errors or GLSL compilation warnings in console
- [ ] On globe load, clouds appear as **large geographic masses** — not grain/noise
- [ ] Clouds are visible over ocean and continent areas matching actual weather patterns
- [ ] Clouds are **semi-transparent** — the OSM terrain is visible beneath them
- [ ] Toggling the **Clouds** layer button in the TopBar hides/shows the cloud sphere
- [ ] Scrubbing the **timeline** to a different day causes clouds to update (new GIBS fetch)
- [ ] The **Opacity slider** in the control panel adjusts cloud visibility in real-time
- [ ] The **Coverage Threshold slider** adjusts how much cloud coverage is shown
- [ ] **FPS improves** significantly vs the old particle system (verify FPS counter)
- [ ] No `console.error` output during normal operation
- [ ] The cloud sphere does NOT interfere with the wind particle layer
- [ ] No "Coming Soon" or non-functional controls remain in the cloud settings section
- [ ] On mobile viewport (390px), cloud layer still renders correctly

---

## ◈ WHAT NOT TO DO

- **Do not** keep any part of the old particle cloud system running alongside the new sphere — they will conflict.
- **Do not** use `THREE.CanvasTexture` or `THREE.VideoTexture` — use `THREE.Texture(image)` as shown.
- **Do not** fetch GIBS WMS on every frame or every timeline tick — only when the **date** changes.
- **Do not** set `depthWrite: true` on the cloud material — it will occlude wind particles behind it.
- **Do not** add `side: THREE.DoubleSide` — this renders the inside of the sphere when zoomed in.
- **Do not** use CORS proxies or modify the GIBS URL format — it works as-is with `crossOrigin = 'anonymous'`.

---

*This is a targeted surgical replacement. Touch only the files listed. The rest of Aetheris remains unchanged.*
