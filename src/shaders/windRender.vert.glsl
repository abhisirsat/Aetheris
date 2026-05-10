/**
 * @file windRender.vert.glsl
 * @module WindRender
 * @description Vertex shader for wind particle point rendering.
 *              Reads particle ECEF position from the simulation render target using
 *              a per-vertex particleIndex attribute to compute UV lookup coordinates.
 *              Point size scales with wind speed (1–3px). Forwards speed and age
 *              fraction to the fragment shader for color and fade computation.
 * @author Aetheris 4D
 */

// Per-vertex particle index — set by WindParticles.js BufferGeometry attribute
attribute float particleIndex;

// Simulation output render target — RGBA float: (x,y,z) = ECEF pos, w = age
uniform sampler2D positionTexture;

// UV wind field for speed-based point sizing
uniform sampler2D windTexture;

// 1.0 / textureSize — maps linear index to (col/size, row/size) UV
uniform float texSize;

// Max particle lifetime in seconds — for age fade in fragment shader
uniform float maxAge;

// Globe radius in meters
uniform float globeRadius;

// Forwarded to fragment shader
varying float vSpeed;    // normalized wind speed at this particle [0,1]
varying float vAgeFrac;  // age as fraction of maxAge [0,1]

const float MAX_WIND_MS = 50.0;
const float PI = 3.14159265358979;

vec3 ecefToGeodeticAngles(vec3 pos) {
  float lon = atan(pos.y, pos.x);
  float p   = length(pos.xy);
  float lat = atan(pos.z, p);
  return vec3(lat, lon, length(pos) - globeRadius);
}

vec2 geodeticToWindUV(float lat, float lon) {
  float u = (lon / PI) * 0.5 + 0.5;
  float v = (lat / (PI * 0.5)) * 0.5 + 0.5;
  return vec2(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0));
}

void main() {
  // Convert 1D particle index → 2D texture UV
  float col = mod(particleIndex, texSize);
  float row = floor(particleIndex / texSize);
  vec2 uv = (vec2(col, row) + 0.5) / texSize;

  // Sample particle state (ECEF position + age)
  vec4 particle = texture2D(positionTexture, uv);
  vec3 pos  = particle.xyz;
  float age = particle.w;
  vAgeFrac  = clamp(age / maxAge, 0.0, 1.0);

  // Derive geodetic coords to sample wind speed for point sizing
  vec3 geo    = ecefToGeodeticAngles(pos);
  vec2 windUV = geodeticToWindUV(geo.x, geo.y);
  vec2 wSample = texture2D(windTexture, windUV).rg;
  float speed  = length(wSample) * MAX_WIND_MS;
  vSpeed = clamp(speed / MAX_WIND_MS, 0.0, 1.0);

  // Scale point size: calm=1px, extreme=3px
  gl_PointSize = mix(1.0, 3.0, vSpeed);

  // Project ECEF → clip space
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
