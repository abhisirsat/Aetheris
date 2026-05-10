/**
 * @file cloudVolume.vert.glsl
 * @module CloudVolume
 * @description Pass-through vertex shader for the cloud volume full-screen quad.
 * @author Aetheris 4D
 */

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
