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
float calcLuminance(vec3 color) {
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
  float bright = calcLuminance(color);

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
