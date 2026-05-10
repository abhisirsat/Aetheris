# ANTIGRAVITY ENGINEER PROMPT — AETHERIS 4D
## Atmospheric Intelligence Engine
**Model:** claude-sonnet-4-6 | **Mode:** Full Implementation | **Style:** Zero Dangling Threads

---

## ◈ MISSION STATEMENT

You are building **Aetheris 4D** — a browser-based, GPU-accelerated "Digital Twin" of the Earth's atmosphere. This is a complete, production-grade application with no placeholder buttons, no stub functions, and no "Coming Soon" states. Every feature you implement must be fully operational. If a UI control exists, it must execute real logic.

The aesthetic is **FUI (Futuristic User Interface)**: dark-mode, glassmorphic panels, high-contrast data overlays, and fluid 60 FPS animations. Think NOAA meets Cyberpunk.

---

## ◈ TECH STACK (ZERO COST — DO NOT DEVIATE)

| Layer | Technology | Notes |
|---|---|---|
| Globe Engine | CesiumJS (1.x latest CDN) | OSM base tiles, terrain elevation |
| 3D Overlay | Three.js (r160+) | Custom atmospheric canvas on top of Cesium |
| Weather Data | Open-Meteo REST API | Free, no key, 15-min intervals, GFS/ICON |
| UI Framework | React 18 + Vite | App Router NOT required; Vite SPA |
| Styling | Tailwind CSS v3 | Glassmorphic utility classes |
| State | Zustand v4 | One global store for all temporal + layer state |
| Testing | Playwright | E2E globe render, mobile/desktop viewport |
| Docs | JSDoc (JS/GLSL) | Every exported function and shader documented |

**Package Manager:** npm  
**Build Tool:** Vite  
**Target Browsers:** Chrome 110+, Firefox 120+, Safari 16+

---

## ◈ PHASE 0 — PROJECT SCAFFOLDING

### 0.1 Initialize Repository

```bash
npm create vite@latest aetheris-4d -- --template react
cd aetheris-4d
npm install
```

### 0.2 Install All Dependencies

```bash
# Core rendering
npm install cesium resium three @react-three/fiber @react-three/drei

# State & data
npm install zustand axios

# UI
npm install tailwindcss autoprefixer postcss
npx tailwindcss init -p

# Testing
npm install -D playwright @playwright/test
npx playwright install chromium

# Dev tools
npm install -D vite-plugin-cesium
```

### 0.3 Vite Configuration

`vite.config.js` must:
- Import and register `vite-plugin-cesium` (handles Cesium's static asset copying automatically)
- Set `base: './'` for relative asset paths
- Define `CESIUM_BASE_URL` env var pointing to `/node_modules/cesium/Build/Cesium`
- Alias `cesium` to `cesium/Source/Cesium`

### 0.4 Tailwind Configuration

In `tailwind.config.js`:
- Set `darkMode: 'class'`
- Extend theme with custom `fontFamily`: use **Space Mono** (monospace data readouts) + **Chakra Petch** (display headings) — load both from Google Fonts
- Extend `colors` with:
  - `aetheris.void`: `#050810` (near-black background)
  - `aetheris.plasma`: `#00FFFF` (primary accent — cyan)
  - `aetheris.solar`: `#FF6B35` (warning/hot layer accent)
  - `aetheris.storm`: `#7B2FBE` (precipitation/cloud accent)
  - `aetheris.ice`: `#B8E4FF` (snow/cold data)
  - `aetheris.glass`: `rgba(255,255,255,0.06)` (glassmorphic panel fill)
- Add custom `backdropBlur` values: `xs: 4px`, `panel: 12px`

### 0.5 Global CSS (`index.css`)

- Import Tailwind directives
- Define CSS custom properties for all `aetheris.*` colors
- Add a base `body` style: `background: #050810`, `overflow: hidden`, `font-family: 'Space Mono'`
- Add a `.glass-panel` utility class:
  - `background: rgba(255,255,255,0.05)`
  - `backdrop-filter: blur(12px)`
  - `border: 1px solid rgba(0,255,255,0.15)`
  - `border-radius: 12px`
  - `box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)`

---

## ◈ PHASE 1 — THE DIGITAL EARTH

### 1.1 Cesium Globe Setup (`src/components/Globe/CesiumGlobe.jsx`)

Initialize a `Viewer` with the following exact configuration:

```javascript
const viewer = new Cesium.Viewer(containerRef.current, {
  imageryProvider: new Cesium.OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/'
  }),
  terrainProvider: await Cesium.createWorldTerrainAsync({
    requestWaterMask: false,
    requestVertexNormals: true
  }),
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  creditContainer: document.createElement('div'), // hide Cesium credits
  skyBox: false,
  skyAtmosphere: new Cesium.SkyAtmosphere(),
  shadows: false,
  msaaSamples: 4
});
```

Apply post-initialization settings:
- `viewer.scene.globe.enableLighting = true`
- `viewer.scene.globe.showGroundAtmosphere = true`
- `viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#050810')`
- `viewer.scene.fog.enabled = true`, `viewer.scene.fog.density = 0.0001`

**JSDoc this component fully.** Export the `viewer` instance via a React ref forwarded to parent.

### 1.2 Three.js Atmospheric Overlay (`src/rendering/AtmosphericCanvas.js`)

After Cesium viewer is mounted:
1. Create a **second** `THREE.WebGLRenderer` that shares the same `<canvas>` element OR is an absolutely-positioned transparent canvas layered directly over the Cesium canvas (z-index strategy).
2. The Three.js scene coordinate system must be synchronized to Cesium's camera on every `viewer.scene.postRender` event:
   - Read `viewer.camera.position` (Cartesian3)
   - Read `viewer.camera.direction` and `viewer.camera.up`
   - Apply to `THREE.PerspectiveCamera` via a conversion utility (`cesiumCartesian3ToThreeVector3`)
3. This overlay is the **Atmospheric Canvas** — the Three.js scene where all particles and volumetric effects live.

Write the coordinate conversion utility `src/utils/coordinateSync.js`:
- `cesiumCartesian3ToThreeVector3(cartesian)` → `THREE.Vector3`
- `geodeticToECEF(lat, lon, alt)` → `THREE.Vector3` using WGS-84 ellipsoid constants
- `ECEFToGeodetic(vec3)` → `{lat, lon, alt}`
- All functions must be JSDoc documented with `@param` and `@returns` types.

---

## ◈ PHASE 2 — DATA INGESTION ENGINE

### 2.1 Open-Meteo Fetcher (`src/services/openMeteoService.js`)

Build a service module that fetches from `https://api.open-meteo.com/v1/forecast`.

**Required parameters for every call:**
```
latitude, longitude,
hourly=temperature_2m,windspeed_10m,winddirection_10m,precipitation,
        snowfall,cloudcover,cloudcover_low,cloudcover_mid,cloudcover_high,
        windspeed_850hPa,winddirection_850hPa,windspeed_500hPa,winddirection_500hPa,
timezone=auto,
forecast_days=16,
models=best_match
```

**Historical data:** Use endpoint `https://archive-api.open-meteo.com/v1/archive` with `start_date` and `end_date` params, same hourly fields. Support going back to `1940-01-01`.

Expose these functions:
- `fetchForecastGrid(bounds)` — `bounds: {north, south, east, west}` — fetches a 5x5 grid of lat/lon points within the bounding box and returns a normalized `WeatherGrid` object.
- `fetchHistoricalPoint(lat, lon, startDate, endDate)` — for timeline scrubbing into the past.
- `normalizeToUVTexture(weatherGrid, width, height)` — converts the grid into two `Float32Array`s:
  - `uChannel`: normalized wind U-component (east-west) per pixel, range −1 to 1
  - `vChannel`: normalized wind V-component (north-south) per pixel, range −1 to 1
  - Returns a `{uChannel, vChannel, width, height}` object ready for GPU upload.

**Cache all fetched data** in a `Map` keyed by `{bounds_hash}_{timestamp_hour}` to avoid re-fetching on timeline scrub.

### 2.2 UV Wind Texture GPU Upload (`src/rendering/WindTexture.js`)

- Accept `{uChannel, vChannel, width, height}` from the normalizer.
- Create a `THREE.DataTexture` with format `THREE.RGFormat`, type `THREE.FloatType`.
- Pack U into R channel, V into G channel.
- Set `magFilter: THREE.LinearFilter`, `minFilter: THREE.LinearFilter` for smooth interpolation.
- Expose `update(newData)` to hot-swap texture data without GPU re-allocation (use `.needsUpdate = true`).

---

## ◈ PHASE 3 — THE SHADER PIPELINE

### 3.1 Wind Particle System (`src/rendering/WindParticles.js`)

**Architecture:** GPU-driven particle simulation using a ping-pong render target technique.

1. Allocate two `THREE.WebGLRenderTarget`s of size `512x512` (262,144 particles). Each texel stores `{x, y, z, age}` as RGBA float.
2. **Simulation Shader (GLSL Fragment — `src/shaders/windSim.frag.glsl`):**
   ```glsl
   // JSDoc-style comment block required at top of file
   // @shader WindSimulation
   // @description Reads wind UV texture, advances particle position by wind vector,
   //              resets particles that exceed maxAge or exit globe bounds.
   uniform sampler2D positionTexture;   // current particle positions
   uniform sampler2D windTexture;       // UV wind field
   uniform float deltaTime;
   uniform float globeRadius;
   uniform float speedScale;
   uniform float maxAge;
   // ... full implementation
   ```
   - Sample wind texture using the particle's lat/lon (derived from its ECEF position).
   - Move the particle along the wind vector, scaled by `speedScale` and `deltaTime`.
   - If `age > maxAge` OR particle escapes atmosphere (altitude > 15000m): reset to random position on globe surface with `age = 0`.
   - Terrain avoidance: if particle altitude < terrain height at that lat/lon, deflect upward along terrain normal.

3. **Render Shader (GLSL Vertex + Fragment — `windRender.vert.glsl` / `windRender.frag.glsl`):**
   - Vertex shader reads position from simulation render target (texture lookup by `gl_VertexID`).
   - Renders as `THREE.Points` with `gl_PointSize` between 1.0–3.0 based on wind speed.
   - Fragment shader colors each particle using a speed gradient:
     - Calm (0–5 m/s): `rgba(0, 200, 255, 0.4)` (cool cyan)
     - Moderate (5–15 m/s): `rgba(100, 255, 150, 0.6)` (green)
     - Strong (15–30 m/s): `rgba(255, 200, 0, 0.8)` (amber)
     - Extreme (30+ m/s): `rgba(255, 50, 50, 1.0)` (red)
   - Fade particles by `age / maxAge` for a trailing effect.

4. **Particle Count Scaling (Performance Adaptive):**
   - On initialization, run `src/utils/performanceSampler.js`:
     - Render a 1-second benchmark of 100,000 particles.
     - If FPS < 45: use `256x256` texture (65,536 particles)
     - If 45 ≤ FPS < 55: use `384x384` (147,456 particles)
     - If FPS ≥ 55: use `512x512` (262,144 particles)
   - Store tier in Zustand: `useAtmosphereStore.getState().particleTier`
   - Expose `setParticleTier(tier)` action to allow manual override from settings panel.

### 3.2 Volumetric Cloud Shader (`src/shaders/cloudVolume.frag.glsl`)

Implement raymarching through 3D Worley + FBM noise to simulate cloud volumes.

**Shader Uniforms:**
```glsl
uniform float time;
uniform sampler2D cloudCoverLow;     // from Open-Meteo: cloudcover_low as texture
uniform sampler2D cloudCoverMid;     // cloudcover_mid
uniform sampler2D cloudCoverHigh;    // cloudcover_high
uniform float lowAltitude;           // 1000m
uniform float midAltitude;           // 5000m
uniform float highAltitude;          // 10000m
uniform vec3 sunDirection;           // from Cesium skybox sun position
uniform float extinction;            // Beer-Lambert extinction coefficient
```

**Raymarching Loop:**
- Cast 32 rays per fragment (adjustable via `#define RAY_STEPS 32`).
- For each step, sample Worley noise at `(pos + time*0.0001)` for cloud drift animation.
- Apply `cloudCoverLow/Mid/High` textures to modulate density at respective altitude bands.
- Compute Beer-Lambert light extinction: `transmittance *= exp(-density * extinction * stepSize)`.
- Accumulate color: low clouds = `vec3(0.9, 0.9, 0.95)`, high cirrus = `vec3(1.0, 1.0, 1.0)` with sub-scatter.
- Early-exit loop when `transmittance < 0.01`.

Render the cloud volume on a full-screen quad rendered at the globe's atmosphere layer (altitude ~1000–12000m mesh).

### 3.3 3D Precipitation System (`src/rendering/PrecipitationSystem.js`)

Separate from wind particles. Manages two sub-systems:

**Rain:**
- `THREE.InstancedMesh` of elongated capsules (10,000 max).
- Vertical velocity = `9.8 m/s base + downdraft_velocity` sampled from wind V-component at surface.
- Instanced positions reset at top of bounding box when below terrain.
- Color: `rgba(150, 200, 255, 0.6)` with slight elongation in direction of fall (velocity-based rotation).

**Snow:**
- `THREE.InstancedMesh` of flat discs (8,000 max).
- Velocity: slow downward (0.5–2 m/s) + horizontal drift from wind U/V at surface.
- Apply Perlin noise to each snowflake's drift path for organic swirl.
- Color: `rgba(220, 240, 255, 0.85)`.

**Activation Logic:** Read from Zustand `useWeatherStore`:
- If `precipitation > 0.1 mm/hr` AND `temperature_2m > 2°C`: activate Rain.
- If `snowfall > 0.01 mm/hr` OR (`precipitation > 0.1` AND `temperature_2m ≤ 2°C`): activate Snow.
- Both can be active simultaneously (sleet).

---

## ◈ PHASE 4 — ZUSTAND STATE ARCHITECTURE

### 4.1 Stores (`src/store/`)

Create three separate Zustand stores:

**`useAtmosphereStore.js`**
```javascript
{
  particleTier: 'high' | 'medium' | 'low',
  currentFPS: number,
  layersVisible: {
    wind: boolean,
    clouds: boolean,
    precipitation: boolean,
    temperature: boolean,
    pressure: boolean
  },
  setLayerVisible: (layer, bool) => void,
  setParticleTier: (tier) => void,
  updateFPS: (fps) => void
}
```

**`useTimeStore.js`**
```javascript
{
  currentTimestamp: Date,        // current selected time
  isPlaying: boolean,            // timeline auto-play
  playbackSpeed: number,         // 1x, 2x, 4x, 8x, 16x
  timeRange: { min: Date, max: Date }, // 1940-01-01 to +16 days
  setTimestamp: (date) => void,
  togglePlay: () => void,
  setPlaybackSpeed: (speed) => void,
  stepForward: (hours: number) => void,
  stepBackward: (hours: number) => void
}
```

**`useWeatherStore.js`**
```javascript
{
  activeGrid: WeatherGrid | null,   // current fetched grid
  isFetching: boolean,
  fetchError: string | null,
  hoveredPoint: { lat, lon, data } | null,
  setActiveGrid: (grid) => void,
  setHoveredPoint: (point) => void,
  fetchGridForBounds: (bounds) => Promise<void>  // calls openMeteoService
}
```

---

## ◈ PHASE 5 — UI COMPONENTS

All UI panels use the `.glass-panel` class. No opaque panels. All icons from `lucide-react`.

### 5.1 Main App Layout (`src/App.jsx`)

```
┌─────────────────────────────────────────────────────┐
│  [TopBar: Logo + Layer Toggles + FPS Counter]       │
│                                                     │
│  ←GLOBE FILLS ENTIRE VIEWPORT→                      │
│                                                     │
│  [LeftPanel: Hover Data Card]  [RightPanel: Layers] │
│                                                     │
│  [Bottom: 4D Timeline Scrubber — full width]        │
└─────────────────────────────────────────────────────┘
```

All panels are `position: absolute` overlaid on the globe canvas. No layout that shrinks the globe.

### 5.2 TopBar (`src/components/UI/TopBar.jsx`)

- Left: **AETHERIS 4D** logotype in `Chakra Petch` font, cyan glow text-shadow.
- Center: Layer toggle pills — **Wind | Clouds | Rain | Snow | Temp | Pressure** — each a toggle button. Active state: cyan border + subtle cyan background. Inactive: glass panel.
- Right: **FPS Counter** displaying `useAtmosphereStore.currentFPS` in monospace green. Turns amber if < 45, red if < 30. Next to it: **⚙ Settings** icon opening the performance settings drawer.

### 5.3 Right Control Panel (`src/components/UI/ControlPanel.jsx`)

Collapsible, 280px wide. Sections:

**Data Source:**
- Dropdown: `GFS Model` / `ICON Model` / `ERA5 Historical`
- Badge showing last fetch time.

**Wind Settings (visible when Wind layer is on):**
- Slider: Particle Density (Low / Medium / High)
- Slider: Speed Scale (0.5x – 3x)
- Color Legend bar (calm → extreme)

**Cloud Settings:**
- Sliders: Low / Mid / High cloud opacity (0–100%)
- Ray Steps selector: 16 / 32 / 64 (affects quality vs FPS)

**Precipitation Settings:**
- Toggle: Rain On/Off
- Toggle: Snow On/Off
- Particle count readout (live)

### 5.4 Hover Data Card (`src/components/UI/HoverDataCard.jsx`)

Appears bottom-left when user hovers the globe. Shows data for hovered lat/lon:

```
📍 21.3°N, 72.8°E  |  Alt: 12m
──────────────────────────────
🌡 Temperature       24.3°C
💨 Wind Speed        18.4 m/s  ↗ NE
☁ Cloud Cover       72%  (Low: 40%, Mid: 62%)
🌧 Precipitation     1.2 mm/hr
❄ Snowfall          0 mm/hr
📊 Pressure         1013.2 hPa
```

Animate card entrance with `framer-motion` `AnimatePresence` — slide in from left, fade out on un-hover.

### 5.5 4D Timeline Scrubber (`src/components/UI/TimelineScrubber.jsx`)

Full-width bottom panel, 80px tall:

- **Scrub Track:** A horizontal slider covering the full date range (min: 1940-01-01, max: today+16 days).
  - The range between 1940 and "5 days ago" is colored in a muted amber (historical data).
  - "5 days ago" to "now" is colored cyan (recent analysis).
  - "Now" to +16 days is colored in a dim purple (forecast).
  - Animated vertical "NOW" indicator line.
- **Current Date/Time Display:** Large monospace readout center-top of the panel: `2024 MAR 15 — 14:00 UTC`.
- **Playback Controls:** ⏮ ⏪ ⏯ ⏩ ⏭ buttons, centered below the date. Speed selector: `1x 2x 4x 8x 16x`.
- **Step Buttons:** `−6h`, `−1h`, `+1h`, `+6h` quick jump buttons flanking the play controls.

When playing, advance `useTimeStore.currentTimestamp` by `1 hour * playbackSpeed` every second. Trigger `fetchGridForBounds` debounced (only re-fetch when timestamp crosses a 1-hour boundary for forecast or 24-hour boundary for historical).

### 5.6 Performance Settings Drawer (`src/components/UI/SettingsDrawer.jsx`)

Slides in from the right (300px). Contains:

- **Auto Performance:** Toggle (default ON). When ON, `performanceSampler.js` auto-selects particle tier.
- **Manual Particle Tier:** Radio buttons: Low / Medium / High (enabled only when Auto is OFF).
- **Ray Steps:** Dropdown: 16 / 32 / 64.
- **FPS History Graph:** A small `<canvas>` showing the last 60 seconds of FPS as a line graph (drawn with raw Canvas2D API, no library).
- **GPU Info:** Display `renderer.getContext().getExtension('WEBGL_debug_renderer_info')` to show GPU name.

---

## ◈ PHASE 6 — REAL-TIME LOOP & SYNC

### 6.1 Main Animation Loop (`src/rendering/RenderLoop.js`)

```javascript
/**
 * @description Main render loop. Synchronizes Cesium + Three.js cameras,
 * advances wind simulation, and dispatches FPS telemetry.
 */
function tick() {
  const now = performance.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  // 1. FPS calculation (rolling average over 60 frames)
  // 2. Dispatch FPS to useAtmosphereStore
  // 3. Run wind simulation ping-pong
  // 4. Sync Three.js camera to Cesium camera
  // 5. Render Three.js scene (transparent, over Cesium)
  // 6. requestAnimationFrame(tick)
}
```

### 6.2 Data Refresh on Time Change

In `src/hooks/useTimeSync.js`:
- Subscribe to `useTimeStore.currentTimestamp`.
- On change, compute the bounding box from `viewer.camera.computeViewRectangle()`.
- Call `useWeatherStore.fetchGridForBounds(bounds)` (debounced 500ms).
- On new grid available, call `WindTexture.update(normalizeToUVTexture(grid))`.

---

## ◈ PHASE 7 — TESTING (PLAYWRIGHT)

File: `tests/globe.spec.js`

Write the following E2E tests:

```javascript
test.describe('Aetheris 4D Globe Render Tests', () => {

  test('Globe renders on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:5173');
    // Wait for Cesium globe canvas to appear
    await page.waitForSelector('canvas', { timeout: 15000 });
    // Assert canvas has non-zero dimensions
    // Assert TopBar is visible
    // Assert Timeline Scrubber is visible
  });

  test('Globe renders on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 Pro
    await page.goto('http://localhost:5173');
    await page.waitForSelector('canvas', { timeout: 15000 });
    // Assert UI does not overflow
    // Assert timeline scrubber is present (may be collapsed)
  });

  test('Layer toggle — Wind particles appear and disappear', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForSelector('[data-testid="layer-toggle-wind"]');
    // Click wind toggle OFF
    await page.click('[data-testid="layer-toggle-wind"]');
    // Assert wind particle canvas layer is hidden (aria-hidden or display:none)
    // Click wind toggle ON
    await page.click('[data-testid="layer-toggle-wind"]');
    // Assert wind particle canvas layer is visible
  });

  test('Timeline scrubber changes displayed date', async ({ page }) => {
    await page.goto('http://localhost:5173');
    const scrubber = await page.locator('[data-testid="timeline-scrubber"]');
    // Read initial date text
    const initialDate = await page.locator('[data-testid="current-datetime"]').innerText();
    // Drag scrubber slightly right
    await scrubber.dragTo(scrubber, { targetPosition: { x: 100, y: 0 } });
    const newDate = await page.locator('[data-testid="current-datetime"]').innerText();
    expect(newDate).not.toBe(initialDate);
  });

  test('Hover card appears on globe hover', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForSelector('canvas');
    await page.mouse.move(960, 540); // center of 1920x1080
    await page.waitForSelector('[data-testid="hover-data-card"]', { timeout: 5000 });
  });

  test('FPS counter displays a number', async ({ page }) => {
    await page.goto('http://localhost:5173');
    const fpsEl = await page.waitForSelector('[data-testid="fps-counter"]');
    const text = await fpsEl.innerText();
    expect(parseInt(text)).toBeGreaterThan(0);
  });

});
```

Add `data-testid` attributes to all relevant components during implementation.

---

## ◈ PHASE 8 — DOCUMENTATION STANDARD

Every file must have a file-level JSDoc block:

```javascript
/**
 * @file windSim.frag.glsl
 * @module WindSimulation
 * @description GPU simulation shader for wind particle advection.
 *              Reads UV wind texture, advances particles, resets escaped particles.
 *              Part of Aetheris 4D atmospheric rendering pipeline.
 * @author Aetheris 4D
 */
```

Every exported JS function:
```javascript
/**
 * @function normalizeToUVTexture
 * @description Converts a WeatherGrid into a GPU-ready UV texture data object.
 * @param {WeatherGrid} weatherGrid - Normalized grid from Open-Meteo fetcher.
 * @param {number} width - Output texture width in pixels.
 * @param {number} height - Output texture height in pixels.
 * @returns {{ uChannel: Float32Array, vChannel: Float32Array, width: number, height: number }}
 */
```

Every GLSL uniform in every shader file must have an inline comment explaining its source and units.

---

## ◈ IMPLEMENTATION ORDER (SEQUENTIAL — DO NOT SKIP)

Execute exactly in this order. Complete each phase fully before starting the next.

```
Phase 0  →  Scaffold + deps + Tailwind + fonts + CSS vars
Phase 1  →  CesiumJS globe renders in browser (OSM tiles visible)
Phase 1b →  Three.js canvas overlaid, camera sync confirmed
Phase 2  →  Open-Meteo fetch working, data logged to console
Phase 2b →  UV Texture generated from fetched data, uploaded to GPU
Phase 3  →  Wind particles rendering on globe (ping-pong simulation)
Phase 3b →  Cloud raymarching visible (even if simplified initially)
Phase 3c →  Precipitation (rain + snow) particle systems active
Phase 4  →  All three Zustand stores wired, state flows correctly
Phase 5  →  All UI panels rendered (TopBar, Timeline, HoverCard, ControlPanel)
Phase 5b →  Timeline scrubber controls time, data re-fetches on scrub
Phase 6  →  Render loop stable, FPS meter live, performance sampler runs on startup
Phase 7  →  All Playwright tests pass
Phase 8  →  JSDoc on every file, GLSL inline comments complete
```

---

## ◈ HARD CONSTRAINTS

1. **No placeholder code.** If you write `// TODO`, the build is incomplete.
2. **No feature stubs.** If a button exists in the UI, the function it calls must be fully implemented.
3. **Performance floor:** Application must never drop below 30 FPS on hardware with a discrete GPU. `performanceSampler.js` enforces this by downgrading particle tier automatically.
4. **Zero external paid APIs.** Open-Meteo, OSM, and NOAA are all free. Do not introduce any API that requires a key or payment.
5. **No `any` types in JSDoc.** All parameters and returns must be typed precisely.
6. **All Playwright tests must pass** before the project is considered complete.
7. **Mobile layout must not break.** At 390px viewport width, the globe still fills the screen and controls collapse gracefully (bottom sheet pattern for timeline, icon-only TopBar).

---

## ◈ DELIVERABLE VERIFICATION CHECKLIST

Before declaring the task complete, confirm:

- [ ] `npm run dev` starts without errors
- [ ] Globe renders with OSM tiles visible
- [ ] Wind particles animate smoothly over the globe
- [ ] Cloud layer is visible (even as textured plane if raymarching is too heavy — must toggle)
- [ ] Rain and snow particle systems activate based on live weather data
- [ ] Timeline scrubber changes the displayed UTC timestamp
- [ ] Scrubbing timeline triggers new data fetch (verify in Network tab)
- [ ] Hover card displays correct weather values on globe hover
- [ ] FPS counter is live and color-coded
- [ ] All 6 Playwright tests pass: `npx playwright test`
- [ ] No `console.error` output during normal operation
- [ ] `npm run build` completes without errors (Vite production build)

---

*This is a zero-compromise specification. Aetheris 4D ships complete or not at all.*
