/**
 * @file TopBar.jsx
 * @module TopBar
 * @description Fixed top navigation bar for Aetheris 4D.
 *              Displays the logotype, layer toggle pills, live FPS counter,
 *              and a settings icon that opens the SettingsDrawer.
 * @author Aetheris 4D
 */

import React from 'react';
import { Wind, Cloud, CloudRain, Snowflake, Thermometer, Gauge, Settings } from 'lucide-react';
import useAtmosphereStore from '../../store/useAtmosphereStore';

/** @type {{ key: string, label: string, icon: React.ComponentType }[]} */
const LAYERS = [
  { key: 'wind',          label: 'Wind',     icon: Wind },
  { key: 'clouds',        label: 'Clouds',   icon: Cloud },
  { key: 'precipitation', label: 'Rain',     icon: CloudRain },
  { key: 'temperature',   label: 'Temp',     icon: Thermometer },
  { key: 'pressure',      label: 'Pressure', icon: Gauge },
];

/**
 * @component TopBar
 * @param {{ onSettingsOpen: () => void }} props
 */
export default function TopBar({ onSettingsOpen }) {
  const { layersVisible, setLayerVisible, currentFPS } = useAtmosphereStore();

  const fpsColor =
    currentFPS >= 45 ? '#00ff88' :
    currentFPS >= 30 ? '#ffaa00' : '#ff4444';

  return (
    <header
      className="glass-panel"
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        height: 52,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 16,
      }}
    >
      {/* ── Logotype ─────────────────────────────────────────── */}
      <div
        className="plasma-glow"
        style={{
          fontFamily: '"Chakra Petch", sans-serif',
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: '0.12em',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        AETHERIS 4D
      </div>

      <div style={{ width: 1, height: 28, background: 'rgba(0,255,255,0.15)' }} />

      {/* ── Layer Toggles ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          flex: 1,
          overflowX: 'auto',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
        }}
      >
        {LAYERS.map(({ key, label, icon: Icon }) => {
          const active = layersVisible[key];
          return (
            <button
              key={key}
              data-testid={`layer-toggle-${key}`}
              className={`layer-pill${active ? ' active' : ''}`}
              onClick={() => setLayerVisible(key, !active)}
              aria-pressed={active}
            >
              <Icon size={12} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── FPS Counter ───────────────────────────────────────── */}
      <div
        data-testid="fps-counter"
        style={{
          fontFamily: '"Space Mono", monospace',
          fontSize: 12,
          fontWeight: 700,
          color: fpsColor,
          whiteSpace: 'nowrap',
          minWidth: 60,
          textAlign: 'right',
          transition: 'color 0.3s',
        }}
      >
        {currentFPS} FPS
      </div>

      {/* ── Settings Button ───────────────────────────────────── */}
      <button
        onClick={onSettingsOpen}
        aria-label="Open settings"
        style={{
          background: 'none',
          border: '1px solid rgba(0,255,255,0.2)',
          borderRadius: 8,
          color: 'rgba(0,255,255,0.7)',
          cursor: 'pointer',
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'rgba(0,255,255,0.7)';
          e.currentTarget.style.color = '#00ffff';
          e.currentTarget.style.boxShadow = '0 0 12px rgba(0,255,255,0.3)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'rgba(0,255,255,0.2)';
          e.currentTarget.style.color = 'rgba(0,255,255,0.7)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <Settings size={16} />
      </button>
    </header>
  );
}
