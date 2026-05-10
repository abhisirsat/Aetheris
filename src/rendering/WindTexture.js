/**
 * @file WindTexture.js
 * @module WindTexture
 * @description Creates and manages a THREE.DataTexture for GPU wind field upload.
 *              Packs normalized U (east) wind component into R channel,
 *              V (north) component into G channel as 32-bit floats.
 *              Supports hot-swapping texture data without GPU re-allocation.
 * @author Aetheris 4D
 */

import * as THREE from 'three';

/**
 * @typedef {{ uChannel: Float32Array, vChannel: Float32Array, width: number, height: number }} UVTextureData
 */

/**
 * @class WindTexture
 * @description Wraps a THREE.DataTexture for wind UV field data.
 *              R = normalized U (east-west) wind [-1, +1].
 *              G = normalized V (north-south) wind [-1, +1].
 */
export class WindTexture {
  /**
   * @param {number} [width=64]  - Initial texture width in texels.
   * @param {number} [height=64] - Initial texture height in texels.
   */
  constructor(width = 64, height = 64) {
    this.width  = width;
    this.height = height;
    this.texture = this._buildTexture(new Float32Array(width * height * 2), width, height);
  }

  /**
   * @function _buildTexture
   * @description Allocates a new RG float DataTexture from a packed Float32Array.
   * @param {Float32Array} data   - Interleaved RG float data (R=U, G=V).
   * @param {number}       width  - Texture width.
   * @param {number}       height - Texture height.
   * @returns {THREE.DataTexture}
   */
  _buildTexture(data, width, height) {
    const tex = new THREE.DataTexture(data, width, height, THREE.RGFormat, THREE.FloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS     = THREE.RepeatWrapping;
    tex.wrapT     = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * @function update
   * @description Hot-swaps the wind field data. If dimensions changed, reallocates GPU texture.
   *              Otherwise overwrites in-place and sets needsUpdate = true.
   * @param {UVTextureData} uvData - New UV wind texture data from normalizeToUVTexture().
   * @returns {void}
   */
  update({ uChannel, vChannel, width, height }) {
    const packed = this._pack(uChannel, vChannel, width * height);

    if (width !== this.width || height !== this.height) {
      this.texture.dispose();
      this.texture = this._buildTexture(packed, width, height);
      this.width   = width;
      this.height  = height;
    } else {
      this.texture.image.data.set(packed);
      this.texture.needsUpdate = true;
    }
  }

  /**
   * @function _pack
   * @description Interleaves separate U and V arrays into a single RG float buffer.
   * @param {Float32Array} uChannel - East-west wind components [-1, +1].
   * @param {Float32Array} vChannel - North-south wind components [-1, +1].
   * @param {number}       count    - Total texel count (width × height).
   * @returns {Float32Array} Packed RG buffer.
   */
  _pack(uChannel, vChannel, count) {
    const out = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      out[i * 2]     = uChannel[i];
      out[i * 2 + 1] = vChannel[i];
    }
    return out;
  }

  /**
   * @function dispose
   * @description Releases GPU memory held by this texture.
   * @returns {void}
   */
  dispose() {
    this.texture.dispose();
  }
}
