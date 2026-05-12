/**
 * @file AtmosphericCanvas.js
 * @module AtmosphericCanvas
 * @description Creates a Three.js WebGLRenderer overlaid on the Cesium canvas.
 *              Synchronizes camera with Cesium on every postRender event.
 *              Manages the Wind, Cloud, and Precipitation rendering sub-systems.
 * @author Aetheris 4D
 */

import * as THREE from 'three';
import { syncThreeCameraWithCesium } from '../utils/coordinateSync';
import { WindParticles } from './WindParticles';
import { PrecipitationSystem } from './PrecipitationSystem';
import { CloudSystem } from './CloudSystem.js';
import useTimeStore from '../store/useTimeStore';
import useAtmosphereStore from '../store/useAtmosphereStore';

const GLOBE_RADIUS = 6371000;

/**
 * @class AtmosphericCanvas
 * @description Orchestrates the Three.js overlay canvas synchronized to Cesium.
 */
export class AtmosphericCanvas {
  /**
   * @param {import('cesium').Viewer} cesiumViewer  - The initialized Cesium Viewer.
   * @param {HTMLElement}             container      - Container holding the Cesium canvas.
   * @param {number}                  [particleTextureSize=512] - Wind sim texture size.
   */
  constructor(cesiumViewer, container, particleTextureSize = 512) {
    this.viewer    = cesiumViewer;
    this.container = container;

    this._initRenderer();
    this._initScene();
    this._initWindParticles(particleTextureSize);
    this._initClouds();
    this._initPrecipitation();
    this._bindCameraSync();

    this.layersVisible = { wind: true, clouds: true, precipitation: true };
  }

  // ── Internal setup ──────────────────────────────────────────────

  /**
   * @function _initRenderer
   * @description Creates a transparent Three.js WebGLRenderer layered over Cesium.
   * @returns {void}
   */
  _initRenderer() {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position:      'absolute',
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',
      zIndex:        '2',
    });
    this.container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas:           this.canvas,
      alpha:            true,
      antialias:        false,
      powerPreference:  'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(width || window.innerWidth, height || window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(
      60,
      (width || window.innerWidth) / (height || window.innerHeight),
      100,
      1e10,
    );

    this._resizeObs = new ResizeObserver(() => this._onResize());
    this._resizeObs.observe(this.container);
  }

  /** @returns {void} */
  _onResize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @function _initScene
   * @description Initializes the Three.js scene with ambient lighting.
   * @returns {void}
   */
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  }

  /**
   * @function _initWindParticles
   * @description Initializes the GPU wind particle system.
   * @param {number} textureSize - Simulation texture dimension.
   * @returns {void}
   */
  _initWindParticles(textureSize) {
    this.windParticles = new WindParticles(this.renderer, textureSize);
    this.scene.add(this.windParticles.mesh);
  }

  /**
   * @function _initClouds
   * @description Initializes the satellite cloud texture sphere.
   * @returns {void}
   */
  _initClouds() {
    this.cloudSystem = new CloudSystem(this.scene, {
      segments: 128,
      opacity: 0.85,
      threshold: 0.38,
      softness: 0.12,
      quality: useAtmosphereStore.getState().cloudQuality || 'medium',
    });

    // Load today's clouds immediately on startup
    const initialTimestamp = useTimeStore.getState().currentTimestamp;
    this.cloudSystem.loadTextureForDate(initialTimestamp);

    // Expose to window for debugging (remove in production)
    if (import.meta.env.DEV) window._cloudSystem = this.cloudSystem;
  }

  /**
   * @function _initPrecipitation
   * @returns {void}
   */
  _initPrecipitation() {
    this.precipitation = new PrecipitationSystem(this.scene);
  }

  /**
   * @function _bindCameraSync
   * @description Registers a Cesium postRender listener to keep Three.js camera in sync.
   * @returns {void}
   */
  _bindCameraSync() {
    this._postRenderCb = () => {
      syncThreeCameraWithCesium(this.viewer.camera, this.camera);
    };
    this.viewer.scene.postRender.addEventListener(this._postRenderCb);
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * @function setWindTexture
   * @description Updates the wind field GPU texture used by the particle system.
   * @param {THREE.DataTexture} texture - New wind UV texture.
   * @returns {void}
   */
  setWindTexture(texture) {
    this.windParticles.setWindTexture(texture);
  }

  /**
   * @function setLayerVisibility
   * @description Shows or hides a named atmospheric layer.
   * @param {'wind'|'clouds'|'precipitation'|'temperature'|'pressure'} layer
   * @param {boolean} visible
   * @returns {void}
   */
  setLayerVisibility(layer, visible) {
    if (layer === 'wind') {
      this.windParticles.mesh.visible = visible;
      this.layersVisible.wind = visible;
    }
    if (layer === 'clouds') {
      this.cloudSystem.setVisible(visible);
      this.layersVisible.clouds = visible;
    }
    if (layer === 'precipitation') {
      this.layersVisible.precipitation = visible;
      if (!visible) {
        this.precipitation.activateRain(false);
        this.precipitation.activateSnow(false);
      }
    }
  }

  /**
   * @function updatePrecipitation
   * @description Activates rain/snow sub-systems based on live weather values.
   * @param {number} precipitation - mm/hr.
   * @param {number} snowfall      - mm/hr.
   * @param {number} temperature   - °C at 2m.
   * @returns {void}
   */
  updatePrecipitation(precipitation, snowfall, temperature) {
    if (!this.layersVisible.precipitation) return;
    this.precipitation.activateRain(precipitation > 0.1 && temperature > 2);
    this.precipitation.activateSnow(
      snowfall > 0.01 || (precipitation > 0.1 && temperature <= 2),
    );
  }

  /**
   * @function tick
   * @description Advances all sub-systems and renders the Three.js scene over Cesium.
   * @param {number} deltaTime - Elapsed time since last frame in seconds.
   * @returns {void}
   */
  tick(deltaTime) {
    if (this.cloudSystem && this.layersVisible.clouds) {
      this.cloudSystem.tick(deltaTime);
    }

    if (this.layersVisible.wind) {
      this.windParticles.tick(deltaTime);
    }
    this.precipitation.tick(deltaTime);

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * @function dispose
   * @description Cleans up all GPU resources and removes the overlay canvas.
   * @returns {void}
   */
  dispose() {
    this.viewer.scene.postRender.removeEventListener(this._postRenderCb);
    this._resizeObs.disconnect();
    this.windParticles.dispose();
    this.precipitation.dispose();
    this.cloudSystem.dispose();
    this.renderer.dispose();
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}
