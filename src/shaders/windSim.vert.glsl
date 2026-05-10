/**
 * @file windSim.vert.glsl
 * @module WindSimulation
 * @description Pass-through vertex shader for the wind simulation ping-pong quad.
 * @author Aetheris 4D
 */

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
