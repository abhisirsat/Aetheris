/**
 * @file windSim.frag.glsl
 * @module WindSimulation
 * @description GPU simulation shader for wind particle advection.
 *              Reads UV wind texture, advances particle position by wind vector,
 *              resets particles that exceed maxAge or exit globe bounds.
 *              Part of Aetheris 4D atmospheric rendering pipeline.
 * @shader WindSimulation
 * @author Aetheris 4D
 */

precision highp float;

// Current particle positions (RGBA = x, y, z, age) — ping-pong input
uniform sampler2D positionTexture;

// UV wind field packed as RG float texture (R=U east, G=V north) — range [-1,+1]
uniform sampler2D windTexture;

// Time since last frame in seconds
uniform float deltaTime;

// WGS-84 mean Earth radius in meters
uniform float globeRadius;

// Speed multiplier applied to wind vector displacement
uniform float speedScale;

// Maximum particle lifetime in seconds before reset
uniform float maxAge;

// Random seed for position resets (changes each frame)
uniform float randomSeed;

// Varying passed from the pass-through vertex shader
varying vec2 vUv;

// ── Constants ───────────────────────────────────────────────────────
const float PI = 3.14159265358979;
const float TWO_PI = 6.28318530717959;
const float ATMOSPHERE_TOP = 15000.0;    // meters above surface
const float MAX_WIND_MS = 50.0;          // normalization factor for UV texture

// ── PRNG ────────────────────────────────────────────────────────────
/**
 * @description Hash-based pseudo-random float in [0, 1).
 * @param {vec2} seed - Seed vector.
 * @returns {float} Pseudo-random value.
 */
float rand(vec2 seed) {
  return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453123);
}

// ── Spherical helpers ────────────────────────────────────────────────
/**
 * @description Converts ECEF Cartesian to geodetic (lat radians, lon radians, altitude m).
 */
vec3 ecefToGeodetic(vec3 pos) {
  float lon = atan(pos.y, pos.x);
  float p = length(pos.xy);
  float lat = atan(pos.z, p);
  float alt = length(pos) - globeRadius;
  return vec3(lat, lon, alt);
}

/**
 * @description Converts geodetic (lat radians, lon radians, altitude m) to ECEF Cartesian.
 */
vec3 geodeticToECEF(vec3 geo) {
  float lat = geo.x;
  float lon = geo.y;
  float alt = geo.z;
  float r = globeRadius + alt;
  return vec3(
    r * cos(lat) * cos(lon),
    r * cos(lat) * sin(lon),
    r * sin(lat)
  );
}

/**
 * @description Maps geodetic lat/lon to wind texture UV coordinates.
 */
vec2 geodeticToWindUV(float lat, float lon) {
  // lat: [-PI/2, PI/2] → [0,1]; lon: [-PI, PI] → [0,1]
  float u = (lon / PI) * 0.5 + 0.5;
  float v = (lat / (PI * 0.5)) * 0.5 + 0.5;
  return vec2(u, v);
}

/**
 * @description Generates a random surface position on the globe.
 */
vec3 randomSurfacePos(vec2 seed) {
  float lat = (rand(seed) - 0.5) * PI;
  float lon = (rand(seed + vec2(1.7, 3.1)) - 0.5) * TWO_PI;
  return geodeticToECEF(vec3(lat, lon, 10.0));
}

void main() {
  // Sample current particle state
  vec4 particle = texture2D(positionTexture, vUv);
  vec3 pos = particle.xyz;       // ECEF position (meters)
  float age = particle.w;        // age in seconds

  // Derive geodetic coordinates
  vec3 geo = ecefToGeodetic(pos);
  float lat = geo.x;
  float lon = geo.y;
  float alt = geo.z;

  // Check reset conditions: exceeded max age OR escaped atmosphere
  bool shouldReset = (age >= maxAge) || (alt > ATMOSPHERE_TOP) || (alt < -500.0);

  if (shouldReset) {
    vec2 seed = vUv + vec2(randomSeed, randomSeed * 0.7);
    pos = randomSurfacePos(seed);
    age = rand(seed + vec2(0.3, 0.9)) * maxAge * 0.5; // stagger birth times
  } else {
    // Sample wind at this location
    vec2 windUV = geodeticToWindUV(lat, lon);
    vec2 windSample = texture2D(windTexture, windUV).rg;

    // Decode normalized UV wind to m/s
    float windU = windSample.r * MAX_WIND_MS; // eastward m/s
    float windV = windSample.g * MAX_WIND_MS; // northward m/s

    // Convert wind to ECEF displacement
    // East tangent vector at this point
    vec3 eastDir = vec3(-sin(lon), cos(lon), 0.0);
    // North tangent vector at this point
    vec3 northDir = vec3(-sin(lat) * cos(lon), -sin(lat) * sin(lon), cos(lat));

    vec3 windDisplacement = (eastDir * windU + northDir * windV) * speedScale * deltaTime;

    // Advance position
    pos += windDisplacement;

    // Keep particle on/near surface (slight upward drift for visibility)
    float newR = length(pos);
    float targetR = globeRadius + clamp(alt + 50.0 * deltaTime, 10.0, ATMOSPHERE_TOP);
    pos = normalize(pos) * targetR;

    age += deltaTime;
  }

  gl_FragColor = vec4(pos, age);
}
