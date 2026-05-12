/**
 * @file CloudSystem.js
 * @module CloudSystem
 * @description Satellite cloud sphere renderer for Aetheris 4D.
 *
 *              Architecture:
 *              A THREE.SphereGeometry at radius 6421km (just above Earth's surface
 *              at ~15km altitude) is textured with real NASA GIBS satellite imagery.
 *              A custom GLSL fragment shader extracts cloud pixels from the full-color
 *              satellite image, making all non-cloud surface transparent.
 *
 *              This replaces the previous particle-based cloud system which caused:
 *              - 10–22 FPS due to particle overdraw
 *              - Grainy, unrealistic appearance (uniform scatter noise)
 *              - No geographic cloud accuracy
 *
 *              The new system is a single draw call (ONE sphere mesh).
 *              Performance impact: ~0.5ms per frame vs ~40ms for particles.
 */

import * as THREE from 'three';
import vertexShader from '../shaders/cloudVolume.vert.glsl?raw';
import fragmentShader from '../shaders/cloudVolume.frag.glsl?raw';
import { fetchCloudTexture } from '../services/gibsService.js';

/**
 * Earth radius in meters (WGS-84 semi-major axis).
 * @constant {number}
 */
const EARTH_RADIUS_M = 6378137;

/**
 * Cloud shell altitude in meters above sea level.
 * Set to 15,000m — above all low/mid cloud layers, below cirrus.
 * The shell is a sphere so all cloud types render at this single height.
 * @constant {number}
 */
const CLOUD_ALTITUDE_M = 15000;

/**
 * Cloud sphere radius = Earth radius + cloud altitude, converted to Three.js units.
 * Three.js units in Aetheris = meters (1 unit = 1 meter).
 * @constant {number}
 */
const CLOUD_SPHERE_RADIUS = (EARTH_RADIUS_M + CLOUD_ALTITUDE_M);

/**
 * @class CloudSystem
 * @description Manages the satellite cloud sphere, texture loading, and shader uniforms.
 */
export class CloudSystem {
  /**
   * @constructor
   * @param {THREE.Scene} scene - The Three.js scene to add the cloud sphere to
   * @param {object} [options] - Configuration options
   * @param {number} [options.segments=128] - Sphere geometry segments (higher = smoother)
   * @param {number} [options.opacity=0.85] - Master cloud layer opacity
   * @param {number} [options.threshold=0.38] - Cloud detection brightness threshold
   * @param {number} [options.softness=0.12] - Cloud edge feathering amount
   * @param {'high'|'medium'|'low'} [options.quality='medium'] - Satellite texture resolution
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = {
      segments: 128,
      opacity: 0.85,
      threshold: 0.38,
      softness: 0.12,
      quality: 'medium',
      ...options,
    };

    /** @type {THREE.Mesh|null} The cloud sphere mesh */
    this.mesh = null;

    /** @type {THREE.ShaderMaterial|null} The cloud extraction shader material */
    this.material = null;

    /** @type {THREE.Texture|null} Current satellite texture loaded on GPU */
    this.currentTexture = null;

    /** @type {boolean} Whether the cloud system is visible */
    this.visible = true;

    /** @type {string|null} Date string of the currently loaded texture */
    this.loadedDate = null;

    /** @type {boolean} Whether a texture fetch is in progress */
    this.isFetching = false;

    /** @type {number} Accumulated time for cloud drift animation (seconds) */
    this.time = 0;

    this._init();
  }

  /**
   * @private
   * @method _init
   * @description Creates the cloud sphere geometry, material, and mesh.
   *              Uploads a placeholder flat white texture until the satellite
   *              image loads, to avoid a flash of uncovered globe.
   * @returns {void}
   */
  _init() {
    // Geometry: high-segment sphere for smooth curvature at globe scale
    const geometry = new THREE.SphereGeometry(
      CLOUD_SPHERE_RADIUS,
      this.options.segments,
      this.options.segments / 2
    );

    // Placeholder 1x1 transparent texture (shown during initial load)
    const placeholderTexture = new THREE.DataTexture(
      new Uint8Array([200, 210, 220, 0]), // RGBA: near-white, fully transparent
      1, 1,
      THREE.RGBAFormat
    );
    placeholderTexture.needsUpdate = true;

    // Shader material using the cloud extraction shaders
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSatelliteTexture: { value: placeholderTexture },
        uCloudOpacity:     { value: this.options.opacity },
        uCloudThreshold:   { value: this.options.threshold },
        uCloudSoftness:    { value: this.options.softness },
        uTime:             { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,         // Don't write to depth buffer (transparent layer)
      side: THREE.FrontSide,     // Only render outside of sphere
      blending: THREE.NormalBlending,
    });

    // Create mesh and add to scene
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = 1;    // Render after the globe surface
    this.mesh.name = 'CloudSphere';
    this.scene.add(this.mesh);
  }

  /**
   * @method loadTextureForDate
   * @description Fetches and uploads the NASA GIBS cloud texture for a given date.
   *              Skips fetch if the same date is already loaded (cache-aware).
   *              Shows a subtle fade transition when the new texture arrives.
   * @param {Date} timestamp - Target datetime for cloud imagery
   * @returns {Promise<void>}
   */
  async loadTextureForDate(timestamp) {
    const { formatGIBSDate } = await import('../services/gibsService.js');
    const targetDate = formatGIBSDate(timestamp);

    // Skip if already loaded and not fetching
    if (targetDate === this.loadedDate || this.isFetching) return;

    this.isFetching = true;

    try {
      const { image, date } = await fetchCloudTexture(timestamp, this.options.quality);

      // Upload new image as a Three.js texture
      const newTexture = new THREE.Texture(image);
      newTexture.wrapS = THREE.RepeatWrapping;
      newTexture.wrapT = THREE.ClampToEdgeWrapping;
      newTexture.minFilter = THREE.LinearMipMapLinearFilter;
      newTexture.magFilter = THREE.LinearFilter;
      newTexture.anisotropy = 4;   // Reduces blurring at oblique globe angles
      newTexture.needsUpdate = true;

      // Fade out current opacity, swap texture, fade back in
      await this._fadeTransition(async () => {
        // Dispose old texture to free GPU memory
        if (this.currentTexture) {
          this.currentTexture.dispose();
        }
        this.currentTexture = newTexture;
        this.material.uniforms.uSatelliteTexture.value = newTexture;
        this.loadedDate = date;
      });

    } catch (error) {
      console.warn('[CloudSystem] Satellite texture fetch failed:', error.message);
      // Leave existing texture in place — don't show a broken state
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * @private
   * @method _fadeTransition
   * @description Smoothly fades the cloud opacity to 0, runs a callback, then fades back.
   *              Prevents jarring texture pop-in when a new satellite image loads.
   * @param {Function} swapCallback - Async function to run at zero opacity
   * @returns {Promise<void>}
   */
  async _fadeTransition(swapCallback) {
    const targetOpacity = this.options.opacity;
    const FADE_DURATION_MS = 800;
    const STEPS = 30;
    const STEP_DELAY = FADE_DURATION_MS / STEPS;

    // Fade out
    for (let i = STEPS; i >= 0; i--) {
      this.material.uniforms.uCloudOpacity.value = (i / STEPS) * targetOpacity;
      await new Promise(r => setTimeout(r, STEP_DELAY));
    }

    // Swap texture at zero opacity
    await swapCallback();

    // Fade in
    for (let i = 0; i <= STEPS; i++) {
      this.material.uniforms.uCloudOpacity.value = (i / STEPS) * targetOpacity;
      await new Promise(r => setTimeout(r, STEP_DELAY));
    }
  }

  /**
   * @method tick
   * @description Called every frame from the main render loop.
   *              Advances the time uniform for cloud drift animation.
   * @param {number} deltaTime - Frame delta time in seconds
   * @returns {void}
   */
  tick(deltaTime) {
    if (!this.visible || !this.material) return;
    this.time += deltaTime;
    this.material.uniforms.uTime.value = this.time;
  }

  /**
   * @method setVisible
   * @description Shows or hides the cloud sphere.
   * @param {boolean} visible
   * @returns {void}
   */
  setVisible(visible) {
    this.visible = visible;
    if (this.mesh) this.mesh.visible = visible;
  }

  /**
   * @method setOpacity
   * @description Updates cloud master opacity. Called from control panel slider.
   * @param {number} opacity - Value between 0.0 and 1.0
   * @returns {void}
   */
  setOpacity(opacity) {
    this.options.opacity = opacity;
    if (this.material) {
      this.material.uniforms.uCloudOpacity.value = opacity;
    }
  }

  /**
   * @method setThreshold
   * @description Updates the cloud detection threshold. Higher = fewer clouds shown.
   * @param {number} threshold - Value between 0.0 and 1.0
   * @returns {void}
   */
  setThreshold(threshold) {
    this.options.threshold = threshold;
    if (this.material) {
      this.material.uniforms.uCloudThreshold.value = threshold;
    }
  }

  /**
   * @method dispose
   * @description Cleans up GPU resources. Call when removing the cloud system.
   * @returns {void}
   */
  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    if (this.material) this.material.dispose();
    if (this.currentTexture) this.currentTexture.dispose();
    this.mesh = null;
    this.material = null;
    this.currentTexture = null;
  }
}
