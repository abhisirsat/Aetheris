/**
 * @file vite.config.js
 * @module ViteConfig
 * @description Vite build configuration for Aetheris 4D.
 *              All CJS transitive deps of @cesium/engine AND @cesium/widgets are
 *              force-included in optimizeDeps so Vite pre-bundles them to ESM.
 *              This prevents the white-screen "does not provide an export named 'default'"
 *              errors that occur when the browser sees raw CJS files.
 * @author Aetheris 4D
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// ALL CommonJS dependencies of @cesium/engine@25.0.0 + @cesium/widgets@15.0.0
// Determined by scanning package.json deps and checking `type` field.
// nosleep.js uses `module` field (has ESM) but still needs pre-bundling for dev.
const CESIUM_CJS_DEPS = [
  // @cesium/engine deps
  'autolinker',
  'bitmap-sdf',
  'draco3d',
  'grapheme-splitter',
  'lerc',
  'mersenne-twister',
  'protobufjs',
  'topojson-client',
  'urijs',
  // @cesium/widgets deps
  'nosleep.js',
];

export default defineConfig({
  base: './',
  plugins: [
    react(),
    cesium(),
  ],
  optimizeDeps: {
    include: CESIUM_CJS_DEPS,
    exclude: ['cesium'],
  },
  build: {
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('cesium')) return 'cesium';
          if (id.includes('three'))  return 'three';
        },
      },
    },
  },
});
