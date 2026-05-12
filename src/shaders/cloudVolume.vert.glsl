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
