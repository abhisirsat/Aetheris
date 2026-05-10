/**
 * @file HoverDataCard.jsx
 * @module HoverDataCard
 * @description Floating data card that appears bottom-left when the user hovers the globe.
 *              Displays temperature, wind, cloud cover, precipitation, and snowfall data
 *              for the hovered lat/lon point. Animates in/out with framer-motion.
 * @author Aetheris 4D
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Thermometer, Wind, Cloud, CloudRain, Snowflake, Gauge, MapPin } from 'lucide-react';
import useWeatherStore from '../../store/useWeatherStore';

/**
 * @function windDirLabel
 * @description Converts a meteorological wind direction in degrees to a compass label.
 * @param {number | null} deg - Wind direction in degrees (0=N, 90=E).
 * @returns {string} Compass direction label (e.g. 'NE', 'SW').
 */
function windDirLabel(deg) {
  if (deg == null) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * @function fmt
 * @description Formats a nullable number to fixed decimal places, or '—' if null.
 * @param {number | null} v - Value to format.
 * @param {number} [dec=1] - Decimal places.
 * @returns {string} Formatted string.
 */
function fmt(v, dec = 1) {
  return v != null ? v.toFixed(dec) : '—';
}

/**
 * @component DataRow
 * @param {{ icon: React.ComponentType, label: string, value: string, color?: string }} props
 */
function DataRow({ icon: Icon, label, value, color = 'rgba(255,255,255,0.85)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
      <Icon size={13} color="rgba(0,255,255,0.6)" style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', minWidth: 90, fontFamily: '"Space Mono", monospace' }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: '"Space Mono", monospace' }}>
        {value}
      </span>
    </div>
  );
}

/**
 * @component HoverDataCard
 * @description Renders the animated hover data card using the Zustand weather store's hoveredPoint.
 */
export default function HoverDataCard() {
  const hoveredPoint = useWeatherStore(s => s.hoveredPoint);

  return (
    <AnimatePresence>
      {hoveredPoint && (
        <motion.div
          data-testid="hover-data-card"
          key="hover-card"
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -40, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="glass-panel"
          style={{
            position: 'absolute',
            bottom: 96,
            left: 12,
            width: 280,
            zIndex: 10,
            padding: '12px 14px',
          }}
        >
          {/* ── Location header ────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <MapPin size={13} color="#00ffff" />
            <span style={{
              fontSize: 11,
              color: '#00ffff',
              fontFamily: '"Space Mono", monospace',
              fontWeight: 700,
            }}>
              {fmt(hoveredPoint.lat, 1)}°{hoveredPoint.lat >= 0 ? 'N' : 'S'}
              {'  '}
              {fmt(Math.abs(hoveredPoint.lon), 1)}°{hoveredPoint.lon >= 0 ? 'E' : 'W'}
              {hoveredPoint.data?.alt != null ? `  ·  ${Math.round(hoveredPoint.data.alt)}m` : ''}
            </span>
          </div>

          <div style={{ height: 1, background: 'rgba(0,255,255,0.1)', marginBottom: 8 }} />

          {hoveredPoint.data ? (
            <>
              <DataRow
                icon={Thermometer}
                label="Temperature"
                value={`${fmt(hoveredPoint.data.temperature)}°C`}
                color={
                  hoveredPoint.data.temperature > 30 ? '#FF6B35' :
                  hoveredPoint.data.temperature < 0  ? '#B8E4FF' : '#e0e8ff'
                }
              />
              <DataRow
                icon={Wind}
                label="Wind Speed"
                value={`${fmt(hoveredPoint.data.windSpeed)} m/s  ${windDirLabel(hoveredPoint.data.windDirection)}`}
              />
              <DataRow
                icon={Cloud}
                label="Cloud Cover"
                value={
                  `${fmt(hoveredPoint.data.cloudcover, 0)}%` +
                  (hoveredPoint.data.cloudcoverLow != null
                    ? `  (Lo:${fmt(hoveredPoint.data.cloudcoverLow, 0)}% Mi:${fmt(hoveredPoint.data.cloudcoverMid, 0)}%)`
                    : '')
                }
              />
              <DataRow
                icon={CloudRain}
                label="Precipitation"
                value={`${fmt(hoveredPoint.data.precipitation, 2)} mm/hr`}
                color={hoveredPoint.data.precipitation > 1 ? '#7B2FBE' : '#e0e8ff'}
              />
              <DataRow
                icon={Snowflake}
                label="Snowfall"
                value={`${fmt(hoveredPoint.data.snowfall, 2)} mm/hr`}
                color={hoveredPoint.data.snowfall > 0 ? '#B8E4FF' : '#e0e8ff'}
              />
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: '"Space Mono", monospace' }}>
              Loading weather data…
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
