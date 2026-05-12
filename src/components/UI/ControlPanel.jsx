/**
 * @file ControlPanel.jsx
 * @module ControlPanel
 * @description Collapsible right-side control panel (280px).
 *              Sections: Data Source, Wind Settings, Cloud Settings, Precipitation Settings.
 *              All controls are fully wired to Zustand stores and AtmosphericCanvas refs.
 * @author Aetheris 4D
 */

import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Database, Wind, Cloud, CloudRain } from 'lucide-react';
import useAtmosphereStore from '../../store/useAtmosphereStore';
import useWeatherStore from '../../store/useWeatherStore';

/**
 * @component SectionHeader
 * @param {{ icon: React.ComponentType, title: string, expanded: boolean, onToggle: () => void }} props
 */
function SectionHeader({ icon: Icon, title, expanded, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 0',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid rgba(0,255,255,0.08)',
        color: expanded ? '#00ffff' : 'rgba(255,255,255,0.5)',
        cursor: 'pointer',
        transition: 'color 0.2s',
        textAlign: 'left',
      }}
    >
      <Icon size={13} />
      <span style={{ flex: 1, fontFamily: '"Space Mono", monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {title}
      </span>
      <ChevronRight size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
    </button>
  );
}

/**
 * @component LabeledSlider
 * @param {{ label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, format?: (v: number) => string }} props
 */
function LabeledSlider({ label, value, min, max, step, onChange, format }) {
  const display = format ? format(value) : value;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: '"Space Mono", monospace' }}>{label}</span>
        <span style={{ fontSize: 10, color: '#00ffff', fontFamily: '"Space Mono", monospace' }}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}

/**
 * @component ControlPanel
 * @param {{ atmosphericCanvasRef: React.MutableRefObject }} props
 */
export default function ControlPanel({ atmosphericCanvasRef }) {
  const [collapsed, setCollapsed] = useState(false);
  const [sections, setSections] = useState({ data: true, wind: true, cloud: false, precip: false });
  const [speedScale, setSpeedScaleLocal] = useState(1.0);
  const [cloudOpacity, setCloudOpacity] = useState({ low: 70, mid: 50, high: 30 });
  const [raySteps, setRaySteps] = useState(32);

  const { layersVisible, setLayerVisible, particleTier, setParticleTier } = useAtmosphereStore();
  const { isFetching, fetchError } = useWeatherStore();

  const lastFetch = new Date().toLocaleTimeString('en-US', { hour12: false });

  const toggleSection = (key) => setSections(s => ({ ...s, [key]: !s[key] }));

  const handleSpeedScale = (v) => {
    setSpeedScaleLocal(v);
    atmosphericCanvasRef.current?.windParticles?.setSpeedScale(v);
  };

  const handleRainToggle = () => {
    const next = !layersVisible.precipitation;
    setLayerVisible('precipitation', next);
    atmosphericCanvasRef.current?.setLayerVisibility('precipitation', next);
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="glass-panel"
        aria-label="Expand control panel"
        style={{
          position: 'absolute',
          top: 76,
          right: 12,
          width: 36,
          height: 36,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          border: '1px solid rgba(0,255,255,0.15)',
          background: 'rgba(0,0,0,0.4)',
        }}
      >
        <ChevronLeft size={16} color="#00ffff" />
      </button>
    );
  }

  return (
    <div
      className="glass-panel"
      style={{
        position: 'absolute',
        top: 76,
        right: 12,
        width: 260,
        zIndex: 10,
        padding: '10px 14px',
        maxHeight: 'calc(100vh - 160px)',
        overflowY: 'auto',
      }}
    >
      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: '"Chakra Petch", sans-serif', fontSize: 13, color: '#00ffff', fontWeight: 600 }}>
          Controls
        </span>
        <button
          onClick={() => setCollapsed(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* ── Data Source ───────────────────────────────────────── */}
      <SectionHeader icon={Database} title="Data Source" expanded={sections.data} onToggle={() => toggleSection('data')} />
      {sections.data && (
        <div style={{ padding: '8px 0' }}>
          <select
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(0,255,255,0.2)',
              borderRadius: 6,
              color: '#e0e8ff',
              padding: '5px 8px',
              fontSize: 11,
              fontFamily: '"Space Mono", monospace',
              marginBottom: 6,
            }}
          >
            <option>GFS Model</option>
            <option>ICON Model</option>
            <option>ERA5 Historical</option>
          </select>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: '"Space Mono", monospace' }}>
            <span>{isFetching ? '⟳ Fetching…' : fetchError ? '⚠ Fetch error' : '✓ Live'}</span>
            <span>Last: {lastFetch}</span>
          </div>
        </div>
      )}

      {/* ── Wind Settings ─────────────────────────────────────── */}
      <SectionHeader icon={Wind} title="Wind" expanded={sections.wind} onToggle={() => toggleSection('wind')} />
      {sections.wind && layersVisible.wind && (
        <div style={{ padding: '8px 0' }}>
          {/* Particle Tier */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: '"Space Mono", monospace', marginBottom: 4 }}>
              Particle Density
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['low', 'medium', 'high'].map(t => (
                <button
                  key={t}
                  onClick={() => setParticleTier(t)}
                  style={{
                    flex: 1,
                    fontSize: 10,
                    fontFamily: '"Space Mono", monospace',
                    padding: '4px 0',
                    borderRadius: 4,
                    cursor: 'pointer',
                    border: `1px solid ${particleTier === t ? 'rgba(0,255,255,0.6)' : 'rgba(255,255,255,0.1)'}`,
                    background: particleTier === t ? 'rgba(0,255,255,0.1)' : 'none',
                    color: particleTier === t ? '#00ffff' : 'rgba(255,255,255,0.4)',
                    textTransform: 'capitalize',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <LabeledSlider
            label="Speed Scale"
            value={speedScale}
            min={0.5}
            max={3}
            step={0.1}
            onChange={handleSpeedScale}
            format={v => `${v.toFixed(1)}×`}
          />

          {/* Wind speed color legend */}
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: '"Space Mono", monospace', marginBottom: 4 }}>
            Speed Legend
          </div>
          <div style={{
            height: 8,
            borderRadius: 4,
            background: 'linear-gradient(to right, rgba(0,200,255,0.8), rgba(100,255,150,0.8), rgba(255,200,0,0.9), rgba(255,50,50,1))',
            marginBottom: 2,
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: '"Space Mono", monospace' }}>
            <span>Calm</span><span>Moderate</span><span>Strong</span><span>Extreme</span>
          </div>
        </div>
      )}

      {/* ── Cloud Settings ────────────────────────────────────── */}
      <SectionHeader icon={Cloud} title="Clouds" expanded={sections.cloud} onToggle={() => toggleSection('cloud')} />
      {sections.cloud && layersVisible.clouds && (
        <div style={{ padding: '8px 0' }}>
          <LabeledSlider
            label="Opacity"
            value={atmosphericCanvasRef.current?.cloudSystem?.options?.opacity ?? 0.85}
            min={0}
            max={1}
            step={0.05}
            onChange={v => {
              if (atmosphericCanvasRef.current?.cloudSystem) {
                atmosphericCanvasRef.current.cloudSystem.setOpacity(v);
              }
              // Force re-render to update slider value
              setCloudOpacity(p => ({ ...p, _force: v }));
            }}
            format={v => `${Math.round(v * 100)}%`}
          />

          <LabeledSlider
            label="Coverage Threshold"
            value={atmosphericCanvasRef.current?.cloudSystem?.options?.threshold ?? 0.38}
            min={0.1}
            max={0.7}
            step={0.02}
            onChange={v => {
              if (atmosphericCanvasRef.current?.cloudSystem) {
                atmosphericCanvasRef.current.cloudSystem.setThreshold(v);
              }
              // Force re-render to update slider value
              setCloudOpacity(p => ({ ...p, _force: v }));
            }}
            format={v => v.toFixed(2)}
          />

          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: '"Space Mono", monospace', marginBottom: 4 }}>
            Texture Quality
          </div>
          <select
            defaultValue={atmosphericCanvasRef.current?.cloudSystem?.options?.quality ?? 'medium'}
            onChange={(e) => {
              if (atmosphericCanvasRef.current?.cloudSystem) {
                const cloudSys = atmosphericCanvasRef.current.cloudSystem;
                cloudSys.options.quality = e.target.value;
                cloudSys.loadedDate = null; // Force reload at new quality
                import('../../store/useTimeStore').then(m => {
                   cloudSys.loadTextureForDate(m.default.getState().currentTimestamp);
                });
              }
            }}
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(0,255,255,0.2)',
              borderRadius: 6,
              color: '#e0e8ff',
              padding: '5px 8px',
              fontSize: 11,
              fontFamily: '"Space Mono", monospace',
              marginBottom: 10,
            }}
          >
            <option value="low">Low (1K)</option>
            <option value="medium">Medium (2K)</option>
            <option value="high">High (4K)</option>
          </select>

          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: '"Space Mono", monospace' }}>
            {atmosphericCanvasRef.current?.cloudSystem?.loadedDate
              ? `Satellite: ${atmosphericCanvasRef.current.cloudSystem.loadedDate}`
              : 'Loading satellite imagery...'}
          </div>
        </div>
      )}

      {/* ── Precipitation ─────────────────────────────────────── */}
      <SectionHeader icon={CloudRain} title="Precipitation" expanded={sections.precip} onToggle={() => toggleSection('precip')} />
      {sections.precip && (
        <div style={{ padding: '8px 0' }}>
          {[
            { key: 'precipitation', label: 'Rain' },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: '"Space Mono", monospace' }}>{label}</span>
              <button
                onClick={handleRainToggle}
                style={{
                  width: 40,
                  height: 20,
                  borderRadius: 10,
                  background: layersVisible[key] ? 'rgba(0,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                  border: `1px solid ${layersVisible[key] ? '#00ffff' : 'rgba(255,255,255,0.2)'}`,
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 2,
                  left: layersVisible[key] ? 22 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: layersVisible[key] ? '#00ffff' : 'rgba(255,255,255,0.4)',
                  transition: 'left 0.2s, background 0.2s',
                }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
