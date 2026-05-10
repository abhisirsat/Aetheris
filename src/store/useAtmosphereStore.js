/**
 * @file useAtmosphereStore.js
 * @module AtmosphereStore
 * @description Zustand store for atmospheric rendering state.
 *              Tracks GPU particle tier, FPS telemetry, and layer visibility toggles.
 * @author Aetheris 4D
 */

import { create } from 'zustand';

/**
 * @typedef {'low' | 'medium' | 'high'} ParticleTier
 */

/**
 * @typedef {Object} LayersVisible
 * @property {boolean} wind        - Wind particle layer visibility.
 * @property {boolean} clouds      - Volumetric cloud layer visibility.
 * @property {boolean} precipitation - Precipitation (rain/snow) layer visibility.
 * @property {boolean} temperature - Temperature overlay visibility.
 * @property {boolean} pressure    - Pressure overlay visibility.
 */

/**
 * @typedef {Object} AtmosphereState
 * @property {ParticleTier} particleTier  - Current GPU particle simulation tier.
 * @property {number}       currentFPS    - Rolling average FPS.
 * @property {LayersVisible} layersVisible - Per-layer boolean toggles.
 * @property {(layer: keyof LayersVisible, visible: boolean) => void} setLayerVisible
 * @property {(tier: ParticleTier) => void} setParticleTier
 * @property {(fps: number) => void} updateFPS
 */

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<AtmosphereState>>} */
const useAtmosphereStore = create((set) => ({
  particleTier: 'high',
  currentFPS: 60,
  layersVisible: {
    wind: true,
    clouds: true,
    precipitation: true,
    temperature: false,
    pressure: false,
  },

  /**
   * @function setLayerVisible
   * @description Sets the visibility state of a named atmospheric layer.
   * @param {keyof LayersVisible} layer - The layer name to toggle.
   * @param {boolean} visible - Whether the layer should be visible.
   */
  setLayerVisible: (layer, visible) =>
    set((state) => ({
      layersVisible: { ...state.layersVisible, [layer]: visible },
    })),

  /**
   * @function setParticleTier
   * @description Sets the GPU particle simulation tier (low/medium/high).
   * @param {ParticleTier} tier - The desired particle quality tier.
   */
  setParticleTier: (tier) => set({ particleTier: tier }),

  /**
   * @function updateFPS
   * @description Updates the rolling FPS telemetry value.
   * @param {number} fps - Current measured frames per second.
   */
  updateFPS: (fps) => set({ currentFPS: fps }),
}));

export default useAtmosphereStore;
