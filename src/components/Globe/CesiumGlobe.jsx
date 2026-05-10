/**
 * @file CesiumGlobe.jsx
 * @module CesiumGlobe
 * @description React component that initializes and manages the CesiumJS Viewer.
 *              Uses Cesium Ion with the new terrain API (Cesium.Terrain.fromWorldTerrain)
 *              and lets Cesium auto-select Bing Maps satellite imagery via the Ion token.
 *              Forwards the viewer instance to the parent via ref for overlay sync.
 * @author Aetheris 4D
 */

import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as Cesium from 'cesium';
import useWeatherStore from '../../store/useWeatherStore';

// Real Cesium Ion token — enables Bing Maps satellite imagery + world terrain
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwZmEwMWViNi01MGVhLTQ0YzctOTlmMS0yYTdmMzgzMTZiMWQiLCJpZCI6Mzk2NzgwLCJpYXQiOjE3NzI0NzAyMTJ9.JbPPJnppF9X9rmO3HZVNJ-WPxpCfAq3tcsYgGOwu7MI';

const CesiumGlobe = forwardRef(function CesiumGlobe({ onHover }, ref) {
  const containerRef = useRef(null);
  const creditRef    = useRef(null);
  const viewerRef    = useRef(null);

  useImperativeHandle(ref, () => ({
    get viewer() { return viewerRef.current; },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    let viewer        = null;
    let screenHandler = null;
    let destroyed     = false;

    // ── Viewer — using NEW Cesium 1.100+ API (same as Gods Eye) ──────
    // No explicit imageryProvider = Cesium auto-selects Bing Maps Aerial via Ion token.
    // terrain: Cesium.Terrain.fromWorldTerrain() = new terrain API (old terrainProvider deprecated).
    viewer = new Cesium.Viewer(containerRef.current, {
      terrain: Cesium.Terrain.fromWorldTerrain({
        requestVertexNormals: true,
        requestWaterMask:     true,
      }),
      animation:            false,
      baseLayerPicker:      false,
      fullscreenButton:     false,
      geocoder:             false,
      homeButton:           false,
      infoBox:              false,
      sceneModePicker:      false,
      selectionIndicator:   false,
      timeline:             false,
      navigationHelpButton: false,
      scene3DOnly:          true,
      shouldAnimate:        true,
      shadows:              false,
      terrainShadows:       Cesium.ShadowMode.DISABLED,
      creditContainer:      creditRef.current,
      skyBox:               false,
      skyAtmosphere:        new Cesium.SkyAtmosphere(),
    });

    // ── Post-init visual settings ──────────────────────────────────────
    viewer.scene.backgroundColor            = Cesium.Color.BLACK;
    viewer.scene.globe.baseColor            = Cesium.Color.BLACK;
    viewer.scene.globe.enableLighting       = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.fog.enabled                = true;
    viewer.scene.fog.density                = 0.0001;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.logarithmicDepthBuffer     = true;
    viewer.resolutionScale                  = window.devicePixelRatio || 1.0;
    viewer.scene.shadowMap.enabled          = false;

    viewerRef.current = viewer;

    // ── Mouse hover → update WeatherStore hoveredPoint ────────────────
    screenHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    screenHandler.setInputAction((movement) => {
      if (destroyed) return;
      const ray = viewer.camera.getPickRay(movement.endPosition);
      if (!ray) { useWeatherStore.getState().setHoveredPoint(null); return; }
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (!cartesian) { useWeatherStore.getState().setHoveredPoint(null); return; }

      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const lat   = Cesium.Math.toDegrees(carto.latitude);
      const lon   = Cesium.Math.toDegrees(carto.longitude);
      const alt   = Math.round(carto.height);

      const { activeGrid } = useWeatherStore.getState();
      let weatherData = null;
      if (activeGrid && activeGrid.points.length > 0) {
        let minDist = Infinity, closestIdx = 0;
        activeGrid.points.forEach((pt, idx) => {
          const d = (pt.lat - lat) ** 2 + (pt.lon - lon) ** 2;
          if (d < minDist) { minDist = d; closestIdx = idx; }
        });
        const pt = activeGrid.points[closestIdx];
        const ti = Math.min(activeGrid.timeIndex ?? 0, (pt.temperature_2m?.length ?? 1) - 1);
        weatherData = {
          temperature:   pt.temperature_2m?.[ti]    ?? null,
          windSpeed:     pt.windspeed_10m?.[ti]      ?? null,
          windDirection: pt.winddirection_10m?.[ti]  ?? null,
          precipitation: pt.precipitation?.[ti]      ?? null,
          snowfall:      pt.snowfall?.[ti]            ?? null,
          cloudcover:    pt.cloudcover?.[ti]          ?? null,
          cloudcoverLow: pt.cloudcover_low?.[ti]     ?? null,
          cloudcoverMid: pt.cloudcover_mid?.[ti]     ?? null,
          alt,
        };
      }
      useWeatherStore.getState().setHoveredPoint({ lat, lon, data: weatherData });
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      destroyed = true;
      screenHandler?.destroy();
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Hidden credit container — suppresses Cesium watermark */}
      <div ref={creditRef} style={{ display: 'none' }} />
      <div
        id="cesium-container"
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
    </>
  );
});

export default CesiumGlobe;
