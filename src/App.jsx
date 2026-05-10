/**
 * @file App.jsx
 * @module App
 * @description Root application component for Aetheris 4D.
 *              Orchestrates CesiumJS globe, Three.js atmospheric overlay,
 *              all UI panels, Zustand stores, render loop, and data sync hooks.
 * @author Aetheris 4D
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import CesiumGlobe from './components/Globe/CesiumGlobe';
import TopBar from './components/UI/TopBar';
import HoverDataCard from './components/UI/HoverDataCard';
import TimelineScrubber from './components/UI/TimelineScrubber';
import ControlPanel from './components/UI/ControlPanel';
import SettingsDrawer from './components/UI/SettingsDrawer';
import { AtmosphericCanvas } from './rendering/AtmosphericCanvas';
import { RenderLoop } from './rendering/RenderLoop';
import { runPerformanceBenchmark } from './utils/performanceSampler';
import { useTimeSync } from './hooks/useTimeSync';
import useAtmosphereStore from './store/useAtmosphereStore';
import useWeatherStore from './store/useWeatherStore';
import './index.css';

export default function App() {
  const globeRef       = useRef(null);  // { viewer }
  const atmosphericRef = useRef(null);  // AtmosphericCanvas instance
  const loopRef        = useRef(null);  // RenderLoop instance
  const threeRendRef   = useRef(null);  // THREE.WebGLRenderer

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [initialized,  setInitialized]  = useState(false);
  const [viewer,       setViewer]       = useState(null);

  const { setParticleTier } = useAtmosphereStore();

  // Wire time sync hook (auto-play + debounced weather refetch)
  useTimeSync(viewer);

  // ── Bootstrap after Cesium viewer mounts ─────────────────────────
  const bootstrap = useCallback(async () => {
    const v = globeRef.current?.viewer;
    if (!v || initialized) return;

    setViewer(v);

    // 1. Benchmark → pick particle tier
    const { tier, textureSize } = await runPerformanceBenchmark();
    setParticleTier(tier);

    // 2. Create Three.js atmospheric overlay
    const container = document.getElementById('cesium-container');
    if (!container) return;
    const ac = new AtmosphericCanvas(v, container, textureSize);
    atmosphericRef.current = ac;
    threeRendRef.current   = ac.renderer;

    // 3. Sync layer visibility to AtmosphericCanvas on store changes (Zustand v5)
    let prevLayers = useAtmosphereStore.getState().layersVisible;
    const unsubLayers = useAtmosphereStore.subscribe((state) => {
      if (state.layersVisible === prevLayers) return;
      prevLayers = state.layersVisible;
      Object.entries(state.layersVisible).forEach(([key, visible]) => {
        ac.setLayerVisibility(key, visible);
      });
    });

    // 4. Update precipitation when grid changes (Zustand v5)
    let prevGrid = null;
    const unsubGrid = useWeatherStore.subscribe((state) => {
      const grid = state.activeGrid;
      if (!grid || grid === prevGrid) return;
      prevGrid = grid;
      const mid = grid.points[Math.floor(grid.points.length / 2)];
      const ti  = grid.timeIndex;
      const precip = mid.precipitation[ti]   ?? 0;
      const snow   = mid.snowfall[ti]         ?? 0;
      const temp   = mid.temperature_2m[ti]   ?? 15;
      ac.updatePrecipitation(precip, snow, temp);
    });

    // 5. Start render loop
    const loop = new RenderLoop({ atmosphericCanvas: ac, cesiumViewer: v });
    loop.start();
    loopRef.current = loop;

    // 6. Initial weather fetch
    useWeatherStore.getState().fetchGridForBounds({
      north: 70, south: -70, east: 180, west: -180,
    });

    setInitialized(true);

    // Store unsubs for cleanup
    globeRef._unsubs = [unsubLayers, unsubGrid];
  }, [initialized, setParticleTier]);

  // Poll until Cesium viewer is ready
  useEffect(() => {
    if (initialized) return;
    const id = setInterval(() => {
      if (globeRef.current?.viewer) {
        clearInterval(id);
        bootstrap();
      }
    }, 400);
    return () => clearInterval(id);
  }, [initialized, bootstrap]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      loopRef.current?.stop();
      atmosphericRef.current?.dispose();
      (globeRef._unsubs || []).forEach(fn => fn());
    };
  }, []);

  return (
    <div
      className="dark"
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#050810',
        position: 'relative',
      }}
    >
      {/* Globe — base layer, fills viewport */}
      <CesiumGlobe ref={globeRef} onHover={() => {}} />

      {/* UI overlays */}
      <TopBar onSettingsOpen={() => setSettingsOpen(true)} />
      <HoverDataCard />
      <ControlPanel atmosphericCanvasRef={atmosphericRef} />
      <TimelineScrubber />
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        threeRendererRef={threeRendRef}
      />

      {/* Boot overlay — fades away once initialized */}
      {!initialized && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#050810',
            gap: 20,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontFamily: '"Chakra Petch", sans-serif',
              fontSize: 36,
              fontWeight: 700,
              color: '#00ffff',
              textShadow: '0 0 24px rgba(0,255,255,0.55), 0 0 70px rgba(0,255,255,0.2)',
              letterSpacing: '0.15em',
            }}
          >
            AETHERIS 4D
          </div>

          <div
            style={{
              fontFamily: '"Space Mono", monospace',
              fontSize: 11,
              color: 'rgba(0,255,255,0.5)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Initializing Atmospheric Engine…
          </div>

          {/* Scan-line progress bar */}
          <div
            style={{
              width: 220,
              height: 2,
              background: 'rgba(0,255,255,0.1)',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: '40%',
                background: 'linear-gradient(90deg, transparent, #00ffff, transparent)',
                animation: 'aetheris-scan 1.2s ease-in-out infinite',
              }}
            />
          </div>

          <style>{`
            @keyframes aetheris-scan {
              0%   { transform: translateX(-220px); }
              100% { transform: translateX(440px); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
