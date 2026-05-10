/**
 * @file PrecipitationSystem.js
 * @module PrecipitationSystem
 * @description Manages GPU-instanced rain and snow particle sub-systems.
 *              Rain: elongated capsule instances with gravity + downdraft velocity.
 *              Snow: flat disc instances with slow fall + Perlin-noised horizontal drift.
 *              Activation is driven by Zustand weather store data.
 * @author Aetheris 4D
 */

import * as THREE from 'three';

const GLOBE_RADIUS = 6371000;
const MAX_RAIN = 10000;
const MAX_SNOW = 8000;

/**
 * @function perlinFade
 * @description Quintic fade curve for Perlin noise.
 * @param {number} t - Input value in [0, 1].
 * @returns {number} Smoothed value.
 */
function perlinFade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * @function lerp
 * @description Linear interpolation.
 * @param {number} a - Start value.
 * @param {number} b - End value.
 * @param {number} t - Mix factor [0, 1].
 * @returns {number} Interpolated value.
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * @function simplexNoise2D
 * @description Simple 2D hash-based noise for snowflake drift.
 * @param {number} x - X coordinate.
 * @param {number} y - Y coordinate.
 * @returns {number} Noise value in [-1, 1].
 */
function simplexNoise2D(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/**
 * @function randomSurfacePoint
 * @description Generates a random ECEF position on the globe surface with a given altitude.
 * @param {number} altitude - Altitude above globe surface in meters.
 * @returns {THREE.Vector3} Random ECEF position.
 */
function randomSurfacePoint(altitude) {
  const lat = (Math.random() - 0.5) * Math.PI;
  const lon = Math.random() * 2 * Math.PI;
  const r = GLOBE_RADIUS + altitude;
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.cos(lat) * Math.sin(lon),
    r * Math.sin(lat),
  );
}

/**
 * @class PrecipitationSystem
 * @description Manages instanced mesh rain and snow particle systems on the globe.
 */
export class PrecipitationSystem {
  /**
   * @param {THREE.Scene} scene - The Three.js scene to add meshes to.
   */
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    this._initRain();
    this._initSnow();

    this.rainActive = false;
    this.snowActive = false;
  }

  /**
   * @function _initRain
   * @description Creates the instanced mesh for rain particles.
   * @returns {void}
   */
  _initRain() {
    // Elongated capsule approximated as a thin cylinder
    const geo = new THREE.CylinderGeometry(0.2, 0.2, 8, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.59, 0.78, 1.0),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.rainMesh = new THREE.InstancedMesh(geo, mat, MAX_RAIN);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);

    // Store per-instance positions and velocities
    this.rainPositions = [];
    this.rainVelocities = [];
    for (let i = 0; i < MAX_RAIN; i++) {
      const pos = randomSurfacePoint(3000 + Math.random() * 3000);
      this.rainPositions.push(pos);
      this.rainVelocities.push(-9.8 - Math.random() * 5); // m/s downward
    }
    this._applyRainTransforms();
  }

  /**
   * @function _initSnow
   * @description Creates the instanced mesh for snow particles.
   * @returns {void}
   */
  _initSnow() {
    const geo = new THREE.CircleGeometry(4, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.86, 0.94, 1.0),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.snowMesh = new THREE.InstancedMesh(geo, mat, MAX_SNOW);
    this.snowMesh.frustumCulled = false;
    this.snowMesh.visible = false;
    this.scene.add(this.snowMesh);

    this.snowPositions = [];
    this.snowPhases = [];
    for (let i = 0; i < MAX_SNOW; i++) {
      const pos = randomSurfacePoint(1000 + Math.random() * 5000);
      this.snowPositions.push(pos);
      this.snowPhases.push(Math.random() * Math.PI * 2);
    }
    this._applySnowTransforms();
  }

  /**
   * @function _applyRainTransforms
   * @description Writes per-instance matrices for all rain particles to the InstancedMesh.
   * @returns {void}
   */
  _applyRainTransforms() {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < MAX_RAIN; i++) {
      const pos = this.rainPositions[i];
      // Orient so Y-axis points toward globe center (down)
      const normal = pos.clone().normalize();
      dummy.position.copy(pos);
      dummy.up.copy(normal);
      dummy.lookAt(pos.clone().add(new THREE.Vector3(0, 1, 0)));
      dummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, dummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * @function _applySnowTransforms
   * @description Writes per-instance matrices for all snow particles to the InstancedMesh.
   * @returns {void}
   */
  _applySnowTransforms() {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < MAX_SNOW; i++) {
      const pos = this.snowPositions[i];
      dummy.position.copy(pos);
      dummy.updateMatrix();
      this.snowMesh.setMatrixAt(i, dummy.matrix);
    }
    this.snowMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * @function activateRain
   * @description Enables or disables the rain particle sub-system.
   * @param {boolean} active - Whether to show rain.
   * @returns {void}
   */
  activateRain(active) {
    this.rainActive = active;
    this.rainMesh.visible = active;
  }

  /**
   * @function activateSnow
   * @description Enables or disables the snow particle sub-system.
   * @param {boolean} active - Whether to show snow.
   * @returns {void}
   */
  activateSnow(active) {
    this.snowActive = active;
    this.snowMesh.visible = active;
  }

  /**
   * @function tick
   * @description Advances the precipitation simulation by one frame.
   *              Moves rain downward at gravity speed and snow with Perlin drift.
   * @param {number} deltaTime - Elapsed time since last frame in seconds.
   * @returns {void}
   */
  tick(deltaTime) {
    this.time += deltaTime;
    const dt = Math.min(deltaTime, 0.05);
    const dummy = new THREE.Object3D();

    if (this.rainActive) {
      let changed = false;
      for (let i = 0; i < MAX_RAIN; i++) {
        const pos = this.rainPositions[i];
        const normal = pos.clone().normalize();
        const r = pos.length();
        const alt = r - GLOBE_RADIUS;

        // Move downward toward globe
        pos.addScaledVector(normal, this.rainVelocities[i] * dt);

        // Reset when below surface
        if (alt < 10) {
          const newPos = randomSurfacePoint(3000 + Math.random() * 3000);
          this.rainPositions[i].copy(newPos);
        }

        dummy.position.copy(this.rainPositions[i]);
        dummy.lookAt(new THREE.Vector3(0, 0, 0));
        dummy.updateMatrix();
        this.rainMesh.setMatrixAt(i, dummy.matrix);
        changed = true;
      }
      if (changed) this.rainMesh.instanceMatrix.needsUpdate = true;
    }

    if (this.snowActive) {
      let changed = false;
      for (let i = 0; i < MAX_SNOW; i++) {
        const pos = this.snowPositions[i];
        const normal = pos.clone().normalize();
        const alt = pos.length() - GLOBE_RADIUS;

        const phase = this.snowPhases[i];
        // Slow fall
        const fallSpeed = -(0.5 + Math.random() * 1.5);
        pos.addScaledVector(normal, fallSpeed * dt);

        // Perlin horizontal drift
        const noiseX = simplexNoise2D(this.time * 0.3 + i * 0.01, phase) * 2.0;
        const noiseZ = simplexNoise2D(phase + this.time * 0.2, i * 0.01) * 2.0;
        const eastDir = new THREE.Vector3(-Math.sin(phase), Math.cos(phase), 0).normalize();
        const northDir = normal.clone().cross(eastDir).normalize();
        pos.addScaledVector(eastDir, noiseX * dt);
        pos.addScaledVector(northDir, noiseZ * dt);

        if (alt < 5) {
          const newPos = randomSurfacePoint(500 + Math.random() * 4000);
          this.snowPositions[i].copy(newPos);
        }

        dummy.position.copy(this.snowPositions[i]);
        dummy.updateMatrix();
        this.snowMesh.setMatrixAt(i, dummy.matrix);
        changed = true;
      }
      if (changed) this.snowMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * @function dispose
   * @description Releases all GPU resources held by the precipitation system.
   * @returns {void}
   */
  dispose() {
    this.rainMesh.geometry.dispose();
    this.rainMesh.material.dispose();
    this.scene.remove(this.rainMesh);
    this.snowMesh.geometry.dispose();
    this.snowMesh.material.dispose();
    this.scene.remove(this.snowMesh);
  }
}
