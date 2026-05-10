/**
 * @file coordinateSync.js
 * @module CoordinateSync
 * @description Utility functions for converting between Cesium (ECEF/Cartesian3)
 *              and Three.js (Vector3) coordinate systems, and geodetic conversions.
 *              Part of Aetheris 4D atmospheric rendering pipeline.
 * @author Aetheris 4D
 */

import * as THREE from 'three';

// WGS-84 ellipsoid constants
const WGS84_A = 6378137.0;          // semi-major axis in meters
const WGS84_B = 6356752.3142;       // semi-minor axis in meters
const WGS84_E2 = 1 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A); // eccentricity squared

/**
 * @function cesiumCartesian3ToThreeVector3
 * @description Converts a Cesium Cartesian3 (ECEF) to a Three.js Vector3.
 *              The scale is preserved (values in meters).
 * @param {{ x: number, y: number, z: number }} cartesian - Cesium Cartesian3 object.
 * @returns {THREE.Vector3} Equivalent Three.js Vector3 in ECEF meters.
 */
export function cesiumCartesian3ToThreeVector3(cartesian) {
  return new THREE.Vector3(cartesian.x, cartesian.z, -cartesian.y);
}

/**
 * @function geodeticToECEF
 * @description Converts geodetic coordinates (lat/lon/alt) to ECEF Cartesian
 *              using the WGS-84 ellipsoid model, returned as a Three.js Vector3.
 * @param {number} latDeg - Geodetic latitude in degrees (−90 to +90).
 * @param {number} lonDeg - Geodetic longitude in degrees (−180 to +180).
 * @param {number} altM   - Altitude above ellipsoid in meters.
 * @returns {THREE.Vector3} ECEF position in Three.js coordinate space (meters).
 */
export function geodeticToECEF(latDeg, lonDeg, altM) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(lat) * Math.sin(lat));
  const x = (N + altM) * Math.cos(lat) * Math.cos(lon);
  const y = (N + altM) * Math.cos(lat) * Math.sin(lon);
  const z = (N * (1 - WGS84_E2) + altM) * Math.sin(lat);
  // Remap to Three.js coord space (Y-up): Three Y = Cesium Z, Three Z = -Cesium Y
  return new THREE.Vector3(x, z, -y);
}

/**
 * @function ECEFToGeodetic
 * @description Converts an ECEF position (Three.js Vector3) to geodetic coordinates
 *              using the iterative Bowring method on the WGS-84 ellipsoid.
 * @param {THREE.Vector3} vec3 - ECEF position in Three.js coordinate space (meters).
 * @returns {{ lat: number, lon: number, alt: number }} Geodetic coordinates;
 *          lat/lon in degrees, alt in meters above ellipsoid.
 */
export function ECEFToGeodetic(vec3) {
  // Remap from Three.js to standard ECEF
  const x = vec3.x;
  const y = -vec3.z;
  const z = vec3.y;

  const lon = Math.atan2(y, x);
  const p = Math.sqrt(x * x + y * y);
  let lat = Math.atan2(z, p * (1 - WGS84_E2));

  // Iterative refinement (Bowring)
  for (let i = 0; i < 5; i++) {
    const sinLat = Math.sin(lat);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    lat = Math.atan2(z + WGS84_E2 * N * sinLat, p);
  }

  const sinLat = Math.sin(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const alt = p / Math.cos(lat) - N;

  return {
    lat: (lat * 180) / Math.PI,
    lon: (lon * 180) / Math.PI,
    alt,
  };
}

/**
 * @function syncThreeCameraWithCesium
 * @description Synchronizes a Three.js PerspectiveCamera with the current Cesium camera.
 *              Must be called every frame in the render loop.
 * @param {import('cesium').Camera} cesiumCamera - The active Cesium camera instance.
 * @param {THREE.PerspectiveCamera} threeCamera - The Three.js camera to synchronize.
 * @returns {void}
 */
export function syncThreeCameraWithCesium(cesiumCamera, threeCamera) {
  const pos = cesiumCamera.position;
  const dir = cesiumCamera.direction;
  const up = cesiumCamera.up;

  threeCamera.position.copy(cesiumCartesian3ToThreeVector3(pos));

  const target = cesiumCartesian3ToThreeVector3({
    x: pos.x + dir.x,
    y: pos.y + dir.y,
    z: pos.z + dir.z,
  });
  threeCamera.up.copy(cesiumCartesian3ToThreeVector3(up));
  threeCamera.lookAt(target);

  // Match FOV from Cesium frustum
  if (cesiumCamera.frustum && cesiumCamera.frustum.fovy) {
    threeCamera.fov = (cesiumCamera.frustum.fovy * 180) / Math.PI;
    threeCamera.updateProjectionMatrix();
  }
}
