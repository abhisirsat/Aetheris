/**
 * @file performanceSampler.js
 * @module PerformanceSampler
 * @description Benchmarks GPU particle throughput on startup to determine
 *              the optimal particle tier (low/medium/high) for this device.
 *              Prevents sub-30-FPS scenarios by auto-scaling simulation resolution.
 * @author Aetheris 4D
 */

/**
 * @typedef {'low' | 'medium' | 'high'} ParticleTier
 */

/**
 * @typedef {{ tier: ParticleTier, fps: number, textureSize: number }} BenchmarkResult
 */

/**
 * @function measureFPS
 * @description Measures average FPS over a given number of animation frames.
 * @param {number} frames - Number of frames to sample.
 * @returns {Promise<number>} Average FPS over the sampled frames.
 */
function measureFPS(frames) {
  return new Promise((resolve) => {
    let count = 0;
    let start = performance.now();

    function tick() {
      count++;
      if (count >= frames) {
        const elapsed = (performance.now() - start) / 1000;
        resolve(frames / elapsed);
      } else {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  });
}

/**
 * @function runPerformanceBenchmark
 * @description Samples 60 animation frames to estimate device GPU throughput
 *              and returns the appropriate particle tier and texture resolution.
 * @returns {Promise<BenchmarkResult>} Benchmark result with tier, fps, and textureSize.
 */
export async function runPerformanceBenchmark() {
  const fps = await measureFPS(60);

  /** @type {ParticleTier} */
  let tier;
  let textureSize;

  if (fps < 45) {
    tier = 'low';
    textureSize = 256;
  } else if (fps < 55) {
    tier = 'medium';
    textureSize = 384;
  } else {
    tier = 'high';
    textureSize = 512;
  }

  console.info(`[PerformanceSampler] Measured ${fps.toFixed(1)} FPS → tier: ${tier} (${textureSize}×${textureSize})`);
  return { tier, fps, textureSize };
}

/**
 * @function tierToTextureSize
 * @description Maps a particle tier string to the corresponding texture dimension.
 * @param {ParticleTier} tier - The particle tier identifier.
 * @returns {number} Texture width/height in texels.
 */
export function tierToTextureSize(tier) {
  const map = { low: 256, medium: 384, high: 512 };
  return map[tier] ?? 512;
}
