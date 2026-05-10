/**
 * @file cloudVolume.frag.glsl
 * @module CloudVolume
 * @description Volumetric cloud raymarching shader using 3D Worley + FBM noise.
 *              Models three cloud altitude bands (low/mid/high) driven by Open-Meteo data.
 *              Implements Beer-Lambert light extinction for physically-based transmittance.
 * @author Aetheris 4D
 */

precision highp float;

#define RAY_STEPS 32

// Time in seconds — drives cloud drift animation
uniform float time;

// Cloud cover textures from Open-Meteo (grayscale, 0=clear, 1=overcast)
uniform sampler2D cloudCoverLow;   // cloudcover_low — altitude ~1000m
uniform sampler2D cloudCoverMid;   // cloudcover_mid — altitude ~5000m
uniform sampler2D cloudCoverHigh;  // cloudcover_high — altitude ~10000m

// Altitude thresholds in meters above globe surface
uniform float lowAltitude;         // 1000.0 m
uniform float midAltitude;         // 5000.0 m
uniform float highAltitude;        // 10000.0 m

// Sun direction in world space (normalized), from Cesium sun
uniform vec3 sunDirection;

// Beer-Lambert extinction coefficient (controls cloud density appearance)
uniform float extinction;          // typically 0.5–2.0

// Globe radius used to reconstruct world position from UV
uniform float globeRadius;

// UV from screen-space quad
varying vec2 vUv;

const float PI = 3.14159265358979;

// ── Noise functions ─────────────────────────────────────────────────

float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

/**
 * @description 3D value noise used as base for FBM.
 */
float noise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), u.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), u.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), u.x), u.y), u.z
  );
}

/**
 * @description Worley-like cellular noise approximated via 3D value noise octaves.
 */
float worleyNoise(vec3 p) {
  float n = 0.0;
  float freq = 1.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    n += noise3D(p * freq) * amp;
    freq *= 2.13;
    amp *= 0.5;
  }
  return n;
}

/**
 * @description Fractional Brownian motion for cloud shape.
 */
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 5; i++) {
    value += amplitude * worleyNoise(p * freq);
    freq *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// ── Cloud density at a world position ──────────────────────────────
float cloudDensity(vec3 worldPos, float altMeters) {
  // Drift animation
  vec3 animPos = worldPos * 0.00003 + vec3(time * 0.0001, 0.0, 0.0);

  float shape = fbm(animPos);
  shape = max(0.0, shape - 0.45) * 2.5; // threshold to create distinct cloud regions

  // Altitude band weights
  float lowMask  = smoothstep(lowAltitude  - 500.0, lowAltitude  + 500.0, altMeters)
                 * (1.0 - smoothstep(midAltitude - 500.0, midAltitude + 500.0, altMeters));
  float midMask  = smoothstep(midAltitude  - 1000.0, midAltitude  + 1000.0, altMeters)
                 * (1.0 - smoothstep(highAltitude - 1000.0, highAltitude + 1000.0, altMeters));
  float highMask = smoothstep(highAltitude - 2000.0, highAltitude + 2000.0, altMeters);

  // Sample cloud cover data textures
  vec2 worldUV = vec2(
    atan(worldPos.y, worldPos.x) / (2.0 * PI) + 0.5,
    asin(clamp(worldPos.z / length(worldPos), -1.0, 1.0)) / PI + 0.5
  );

  float coverLow  = texture2D(cloudCoverLow,  worldUV).r;
  float coverMid  = texture2D(cloudCoverMid,  worldUV).r;
  float coverHigh = texture2D(cloudCoverHigh, worldUV).r;

  float density = shape * (
    lowMask  * coverLow  * 1.0 +
    midMask  * coverMid  * 0.8 +
    highMask * coverHigh * 0.4
  );

  return clamp(density, 0.0, 1.0);
}

void main() {
  // Reconstruct ray direction from UV (simple sphere raymarching setup)
  // The quad covers the globe; vUv [0,1] maps to lon/lat
  float lon = (vUv.x - 0.5) * 2.0 * PI;
  float lat = (vUv.y - 0.5) * PI;
  vec3 surfaceNormal = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));

  // March from surface upward to atmosphere top
  float marchStart = globeRadius + 200.0;
  float marchEnd   = globeRadius + 12000.0;
  float stepSize   = (marchEnd - marchStart) / float(RAY_STEPS);

  vec4 accumulatedColor = vec4(0.0);
  float transmittance = 1.0;

  for (int i = 0; i < RAY_STEPS; i++) {
    float t = marchStart + float(i) * stepSize;
    vec3 worldPos = surfaceNormal * t;
    float altMeters = t - globeRadius;

    float density = cloudDensity(worldPos, altMeters);

    if (density > 0.001) {
      // Beer-Lambert extinction
      float extinction_step = density * extinction * stepSize * 0.0001;
      transmittance *= exp(-extinction_step);

      // Cloud color: low/mid = slightly warm grey, high cirrus = white
      float isHigh = smoothstep(highAltitude - 1000.0, highAltitude + 1000.0, altMeters);
      vec3 cloudColor = mix(vec3(0.85, 0.87, 0.92), vec3(1.0, 1.0, 1.0), isHigh);

      // Simple single-scattering sun contribution
      float sunDot = max(0.0, dot(surfaceNormal, sunDirection));
      cloudColor *= (0.6 + 0.4 * sunDot);

      accumulatedColor.rgb += cloudColor * density * transmittance;
      accumulatedColor.a   += density * transmittance;

      // Early exit when fully opaque
      if (transmittance < 0.01) break;
    }
  }

  accumulatedColor.a = clamp(accumulatedColor.a * 0.5, 0.0, 0.85);
  gl_FragColor = accumulatedColor;
}
