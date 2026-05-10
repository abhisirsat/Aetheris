/**
 * @file RenderLoop.js
 * @module RenderLoop
 * @description Main render loop coordinating Cesium + Three.js frame timing,
 *              FPS telemetry dispatch, and atmospheric sub-system advancement.
 *              Maintains a 60-frame rolling FPS average and dispatches to Zustand.
 * @author Aetheris 4D
 */

import useAtmosphereStore from '../store/useAtmosphereStore';

/**
 * @typedef {Object} RenderLoopConfig
 * @property {import('./AtmosphericCanvas').AtmosphericCanvas} atmosphericCanvas
 * @property {import('cesium').Viewer} cesiumViewer
 */

/**
 * @class RenderLoop
 * @description Drives the main animation loop, advancing all rendering sub-systems
 *              and publishing FPS telemetry to Zustand each frame.
 */
export class RenderLoop {
  /**
   * @param {RenderLoopConfig} config - Configuration object.
   */
  constructor({ atmosphericCanvas, cesiumViewer }) {
    this.atmosphericCanvas = atmosphericCanvas;
    this.cesiumViewer = cesiumViewer;

    /** @type {number[]} Rolling FPS sample buffer (60 frames). */
    this._fpsSamples = [];

    /** @type {number} Timestamp of last frame in ms. */
    this._lastTime = performance.now();

    /** @type {number | null} requestAnimationFrame handle. */
    this._rafHandle = null;

    /** @type {boolean} Whether the loop is running. */
    this._running = false;
  }

  /**
   * @function start
   * @description Starts the render loop.
   * @returns {void}
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._rafHandle = requestAnimationFrame(this._tick.bind(this));
  }

  /**
   * @function stop
   * @description Stops the render loop.
   * @returns {void}
   */
  stop() {
    this._running = false;
    if (this._rafHandle !== null) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }
  }

  /**
   * @function _tick
   * @description Core frame callback — advances all systems and schedules the next frame.
   * @param {number} now - Current timestamp from requestAnimationFrame (ms).
   * @returns {void}
   */
  _tick(now) {
    if (!this._running) return;

    // ── 1. Compute delta time ──────────────────────────────────────
    const delta = Math.min((now - this._lastTime) / 1000, 0.1); // cap at 100ms
    this._lastTime = now;

    // ── 2. Rolling 60-frame FPS average ───────────────────────────
    if (delta > 0) {
      this._fpsSamples.push(1 / delta);
      if (this._fpsSamples.length > 60) this._fpsSamples.shift();
      const avgFps = this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;

      // ── 3. Dispatch FPS to Zustand ─────────────────────────────
      useAtmosphereStore.getState().updateFPS(Math.round(avgFps));
    }

    // ── 4. Advance Three.js atmospheric systems ────────────────────
    this.atmosphericCanvas.tick(delta);

    // ── 5. Schedule next frame ─────────────────────────────────────
    this._rafHandle = requestAnimationFrame(this._tick.bind(this));
  }
}
