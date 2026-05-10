/**
 * @file WindParticles.js
 * @module WindParticles
 * @description GPU-driven wind particle simulation using a ping-pong render target technique.
 *              Two WebGLRenderTargets alternate as simulation input/output each frame.
 *              Particles are advected by UV wind field data uploaded as a DataTexture.
 *              Render tier (particle count) is determined by performanceSampler.js at startup.
 * @author Aetheris 4D
 */

import * as THREE from 'three';
import windSimVert from '../shaders/windSim.vert.glsl?raw';
import windSimFrag from '../shaders/windSim.frag.glsl?raw';
import windRenderVert from '../shaders/windRender.vert.glsl?raw';
import windRenderFrag from '../shaders/windRender.frag.glsl?raw';

/** WGS-84 mean Earth radius in meters. */
const GLOBE_RADIUS = 6371000;

/**
 * @function createInitialPositionData
 * @description Generates random particle positions on the globe surface packed as
 *              RGBA float32: {x,y,z} = ECEF position (m), w = age in seconds.
 * @param {number} count   - Total number of particles.
 * @param {number} maxAge  - Maximum particle lifetime in seconds.
 * @returns {Float32Array} RGBA float data for the initial position texture.
 */
function createInitialPositionData(count, maxAge) {
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const lat = (Math.random() - 0.5) * Math.PI;
    const lon = (Math.random() - 0.5) * 2 * Math.PI;
    const r   = GLOBE_RADIUS + 10;
    data[i * 4]     = r * Math.cos(lat) * Math.cos(lon);
    data[i * 4 + 1] = r * Math.cos(lat) * Math.sin(lon);
    data[i * 4 + 2] = r * Math.sin(lat);
    data[i * 4 + 3] = Math.random() * maxAge; // stagger birth times
  }
  return data;
}

/**
 * @class WindParticles
 * @description Manages the full GPU wind particle pipeline:
 *   - Ping-pong simulation render targets (position advection)
 *   - THREE.Points render mesh (position texture → clip-space)
 *   - Dynamic tier switching via textureSize
 */
export class WindParticles {
  /**
   * @param {THREE.WebGLRenderer} renderer       - The Three.js renderer.
   * @param {number} [textureSize=512]            - Simulation texture dimension (square).
   * @param {number} [maxAge=120]                 - Max particle lifetime in seconds.
   * @param {number} [speedScale=1.0]             - Wind speed multiplier.
   */
  constructor(renderer, textureSize = 512, maxAge = 120, speedScale = 1.0) {
    this.renderer      = renderer;
    this.textureSize   = textureSize;
    this.maxAge        = maxAge;
    this.speedScale    = speedScale;
    this.particleCount = textureSize * textureSize;

    this._buildDefaultWindTexture();
    this._initSimulation();
    this._initRenderMesh();
  }

  // ── Internal helpers ─────────────────────────────────────────────

  /**
   * @function _createRT
   * @description Creates a floating-point RGBA WebGLRenderTarget.
   * @param {number} size - Width and height.
   * @returns {THREE.WebGLRenderTarget}
   */
  _createRT(size) {
    return new THREE.WebGLRenderTarget(size, size, {
      minFilter:    THREE.NearestFilter,
      magFilter:    THREE.NearestFilter,
      format:       THREE.RGBAFormat,
      type:         THREE.FloatType,
      depthBuffer:  false,
      stencilBuffer: false,
    });
  }

  /**
   * @function _buildDefaultWindTexture
   * @description Creates a 64×64 zero-wind RG float texture as the default until
   *              real Open-Meteo data is uploaded.
   * @returns {void}
   */
  _buildDefaultWindTexture() {
    const size = 64;
    const data = new Float32Array(size * size * 2); // all zeros = no wind
    this.windTexture = new THREE.DataTexture(
      data, size, size, THREE.RGFormat, THREE.FloatType,
    );
    this.windTexture.magFilter = THREE.LinearFilter;
    this.windTexture.minFilter = THREE.LinearFilter;
    this.windTexture.wrapS     = THREE.RepeatWrapping;
    this.windTexture.wrapT     = THREE.ClampToEdgeWrapping;
    this.windTexture.needsUpdate = true;
  }

  /**
   * @function _initSimulation
   * @description Allocates ping-pong render targets, seeds initial positions,
   *              and builds the simulation ShaderMaterial.
   * @returns {void}
   */
  _initSimulation() {
    const { textureSize: size, maxAge } = this;
    const count = size * size;

    // Seed texture
    const initData = createInitialPositionData(count, maxAge);
    const initTex  = new THREE.DataTexture(initData, size, size, THREE.RGBAFormat, THREE.FloatType);
    initTex.needsUpdate = true;

    // Allocate ping-pong targets
    this.rtA = this._createRT(size);
    this.rtB = this._createRT(size);

    // Blit seed into rtA via a one-shot render
    const seedMat   = new THREE.MeshBasicMaterial({ map: initTex });
    const seedMesh  = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), seedMat);
    const seedScene = new THREE.Scene();
    const seedCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    seedScene.add(seedMesh);
    this.renderer.setRenderTarget(this.rtA);
    this.renderer.render(seedScene, seedCam);
    this.renderer.setRenderTarget(null);
    seedMat.dispose();
    seedMesh.geometry.dispose();
    initTex.dispose();

    this.readRT  = this.rtA;
    this.writeRT = this.rtB;

    // Simulation material
    this.simMaterial = new THREE.ShaderMaterial({
      vertexShader:   windSimVert,
      fragmentShader: windSimFrag,
      uniforms: {
        positionTexture: { value: this.readRT.texture },
        windTexture:     { value: this.windTexture },
        deltaTime:       { value: 0.016 },
        globeRadius:     { value: GLOBE_RADIUS },
        speedScale:      { value: this.speedScale },
        maxAge:          { value: maxAge },
        randomSeed:      { value: Math.random() },
      },
    });

    this.simScene  = new THREE.Scene();
    this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const simQuad  = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMaterial);
    this.simScene.add(simQuad);
  }

  /**
   * @function _initRenderMesh
   * @description Creates the THREE.Points mesh whose vertex shader reads positions
   *              from the simulation render target via a `particleIndex` attribute.
   * @returns {void}
   */
  _initRenderMesh() {
    const count = this.particleCount;
    const geo   = new THREE.BufferGeometry();

    // particleIndex: float array 0,1,2,...,count-1
    const indices = new Float32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
    geo.setAttribute('particleIndex', new THREE.BufferAttribute(indices, 1));

    // Dummy position attribute — actual world positions come from texture in VS
    const dummyPos = new Float32Array(count * 3); // all zeros
    geo.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));

    this.renderMaterial = new THREE.ShaderMaterial({
      vertexShader:   windRenderVert,
      fragmentShader: windRenderFrag,
      uniforms: {
        positionTexture: { value: this.readRT.texture },
        windTexture:     { value: this.windTexture },
        texSize:         { value: this.textureSize },
        maxAge:          { value: this.maxAge },
        globeRadius:     { value: GLOBE_RADIUS },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Points(geo, this.renderMaterial);
    this.mesh.frustumCulled = false;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * @function setWindTexture
   * @description Replaces the wind UV GPU texture on both sim and render shaders.
   * @param {THREE.DataTexture} texture - New wind field texture.
   * @returns {void}
   */
  setWindTexture(texture) {
    this.windTexture = texture;
    this.simMaterial.uniforms.windTexture.value    = texture;
    this.renderMaterial.uniforms.windTexture.value = texture;
  }

  /**
   * @function setSpeedScale
   * @description Updates the wind speed multiplier on the simulation shader.
   * @param {number} scale - Multiplier (0.5–3.0).
   * @returns {void}
   */
  setSpeedScale(scale) {
    this.speedScale = scale;
    this.simMaterial.uniforms.speedScale.value = scale;
  }

  /**
   * @function tick
   * @description Advances the wind simulation by one frame (ping-pong) and
   *              updates the render mesh to read from the new position buffer.
   * @param {number} deltaTime - Elapsed time since last frame in seconds.
   * @returns {void}
   */
  tick(deltaTime) {
    this.simMaterial.uniforms.deltaTime.value       = Math.min(deltaTime, 0.05);
    this.simMaterial.uniforms.positionTexture.value = this.readRT.texture;
    this.simMaterial.uniforms.randomSeed.value      = Math.random();

    // Simulate into writeRT
    this.renderer.setRenderTarget(this.writeRT);
    this.renderer.render(this.simScene, this.simCamera);
    this.renderer.setRenderTarget(null);

    // Swap
    const tmp    = this.readRT;
    this.readRT  = this.writeRT;
    this.writeRT = tmp;

    // Point render reads from the newly written target
    this.renderMaterial.uniforms.positionTexture.value = this.readRT.texture;
  }

  /**
   * @function dispose
   * @description Releases all GPU resources held by this particle system.
   * @returns {void}
   */
  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.windTexture.dispose();
    this.simMaterial.dispose();
    this.renderMaterial.dispose();
    this.mesh.geometry.dispose();
  }
}
