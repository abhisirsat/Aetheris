/**
 * @file windRender.frag.glsl
 * @module WindRender
 * @description Fragment shader for wind particle rendering.
 *              Colors each particle based on wind speed using a 4-stop gradient:
 *              Calm (cyan) → Moderate (green) → Strong (amber) → Extreme (red).
 *              Fades particles by age fraction for trailing effect.
 * @author Aetheris 4D
 */

precision highp float;

// Speed fraction [0,1] passed from vertex shader
varying float vSpeed;

// Age fraction [0,1] — 0=fresh, 1=about to reset
varying float vAgeFrac;

/**
 * @description Maps a wind speed fraction to an RGBA color using a 4-stop gradient.
 * Calm    0.00–0.10: rgba(0,200,255,0.4)   — cool cyan
 * Moderate 0.10–0.30: rgba(100,255,150,0.6) — green
 * Strong   0.30–0.60: rgba(255,200,0,0.8)  — amber
 * Extreme  0.60–1.00: rgba(255,50,50,1.0)  — red
 */
vec4 speedColor(float s) {
  if (s < 0.1) {
    return mix(vec4(0.0, 0.78, 1.0, 0.4), vec4(0.39, 1.0, 0.59, 0.6), s / 0.1);
  } else if (s < 0.3) {
    return mix(vec4(0.39, 1.0, 0.59, 0.6), vec4(1.0, 0.78, 0.0, 0.8), (s - 0.1) / 0.2);
  } else if (s < 0.6) {
    return mix(vec4(1.0, 0.78, 0.0, 0.8), vec4(1.0, 0.2, 0.2, 1.0), (s - 0.3) / 0.3);
  } else {
    return vec4(1.0, 0.2, 0.2, 1.0);
  }
}

void main() {
  // Soft circular point shape
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);
  if (dist > 0.5) discard;

  vec4 color = speedColor(vSpeed);

  // Fade by age: particles fade out as they approach maxAge
  float ageFade = 1.0 - smoothstep(0.7, 1.0, vAgeFrac);
  color.a *= ageFade;

  // Soft edge
  color.a *= smoothstep(0.5, 0.3, dist);

  gl_FragColor = color;
}
