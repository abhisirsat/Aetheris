/**
 * @file SettingsDrawer.jsx
 * @module SettingsDrawer
 * @description Slide-in right drawer (300px) for GPU performance settings.
 *              Contains auto-performance toggle, manual particle tier selector,
 *              ray steps dropdown, 60-second FPS history graph (raw Canvas2D),
 *              and GPU renderer info readout.
 * @author Aetheris 4D
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Cpu, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAtmosphereStore from '../../store/useAtmosphereStore';

/** @type {number[]} Circular buffer of FPS samples for the history graph. */
const fpsHistory = [];
const FPS_HISTORY_LEN = 60;

/**
 * @function getGPUInfo
 * @description Attempts to read GPU renderer string via WEBGL_debug_renderer_info extension.
 * @param {WebGL2RenderingContext | WebGLRenderingContext | null} gl
 * @returns {string} GPU name or fallback message.
 */
function getGPUInfo(gl) {
  if (!gl) return 'Unknown GPU';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (!ext) return 'Info unavailable (privacy restriction)';
  return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'Unknown';
}

/**
 * @component SettingsDrawer
 * @param {{ open: boolean, onClose: () => void, threeRendererRef: React.MutableRefObject }} props
 */
export default function SettingsDrawer({ open, onClose, threeRendererRef }) {
  const { particleTier, setParticleTier, currentFPS } = useAtmosphereStore();
  const [autoPerf, setAutoPerf] = useState(true);
  const [gpuInfo, setGpuInfo] = useState('Detecting…');
  const canvasRef = useRef(null);

  // Populate GPU info once drawer opens
  useEffect(() => {
    if (!open) return;
    const renderer = threeRendererRef?.current;
    if (renderer) {
      const gl = renderer.getContext();
      setGpuInfo(getGPUInfo(gl));
    } else {
      // Fallback: create a temp canvas
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        setGpuInfo(getGPUInfo(gl));
      } catch {
        setGpuInfo('Unavailable');
      }
    }
  }, [open, threeRendererRef]);

  // Update FPS history buffer and redraw graph every frame
  useEffect(() => {
    fpsHistory.push(currentFPS);
    if (fpsHistory.length > FPS_HISTORY_LEN) fpsHistory.shift();

    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const { width, height } = canvasRef.current;
    ctx.clearRect(0, 0, width, height);

    if (fpsHistory.length < 2) return;

    const maxFPS = Math.max(120, ...fpsHistory);
    const minFPS = 0;

    // Grid lines at 30, 60, 90 FPS
    [30, 60, 90].forEach(line => {
      const y = height - ((line - minFPS) / (maxFPS - minFPS)) * height;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '8px monospace';
      ctx.fillText(`${line}`, 2, y - 2);
    });

    // FPS line
    ctx.beginPath();
    fpsHistory.forEach((fps, i) => {
      const x = (i / (FPS_HISTORY_LEN - 1)) * width;
      const y = height - ((fps - minFPS) / (maxFPS - minFPS)) * height;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = currentFPS >= 45 ? '#00ff88' : currentFPS >= 30 ? '#ffaa00' : '#ff4444';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Fill under curve
    ctx.lineTo((fpsHistory.length - 1) / (FPS_HISTORY_LEN - 1) * width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = currentFPS >= 45 ? 'rgba(0,255,136,0.08)' : 'rgba(255,170,0,0.08)';
    ctx.fill();
  }, [currentFPS]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 19,
              background: 'rgba(0,0,0,0.3)',
            }}
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="glass-panel"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: 300,
              zIndex: 20,
              borderRadius: '12px 0 0 12px',
              overflowY: 'auto',
              padding: '16px',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{
                fontFamily: '"Chakra Petch", sans-serif',
                fontSize: 15,
                fontWeight: 700,
                color: '#00ffff',
              }}>
                Performance
              </span>
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ height: 1, background: 'rgba(0,255,255,0.1)', marginBottom: 14 }} />

            {/* Auto Performance Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: '#e0e8ff', fontFamily: '"Space Mono", monospace', fontWeight: 700 }}>
                  Auto Performance
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: '"Space Mono", monospace', marginTop: 2 }}>
                  Auto-select particle tier
                </div>
              </div>
              <button
                onClick={() => setAutoPerf(p => !p)}
                style={{
                  width: 44,
                  height: 22,
                  borderRadius: 11,
                  background: autoPerf ? 'rgba(0,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${autoPerf ? '#00ffff' : 'rgba(255,255,255,0.15)'}`,
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 3,
                  left: autoPerf ? 24 : 3,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: autoPerf ? '#00ffff' : 'rgba(255,255,255,0.4)',
                  transition: 'left 0.2s, background 0.2s',
                }} />
              </button>
            </div>

            {/* Manual Particle Tier */}
            <div style={{ marginBottom: 14, opacity: autoPerf ? 0.35 : 1, transition: 'opacity 0.3s' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: '"Space Mono", monospace', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Particle Tier
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['low', 'medium', 'high']).map(t => (
                  <button
                    key={t}
                    disabled={autoPerf}
                    onClick={() => !autoPerf && setParticleTier(t)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: '"Space Mono", monospace',
                      textTransform: 'capitalize',
                      cursor: autoPerf ? 'not-allowed' : 'pointer',
                      border: `1px solid ${particleTier === t ? 'rgba(0,255,255,0.6)' : 'rgba(255,255,255,0.12)'}`,
                      background: particleTier === t ? 'rgba(0,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                      color: particleTier === t ? '#00ffff' : 'rgba(255,255,255,0.45)',
                      transition: 'all 0.2s',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: '"Space Mono", monospace', marginTop: 3 }}>
                <span>65K pts</span>
                <span>147K pts</span>
                <span>262K pts</span>
              </div>
            </div>

            <div style={{ height: 1, background: 'rgba(0,255,255,0.06)', marginBottom: 14 }} />

            {/* FPS History Graph */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Zap size={12} color="#00ffff" />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: '"Space Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  FPS History (60s)
                </span>
              </div>
              <canvas
                ref={canvasRef}
                width={268}
                height={80}
                style={{
                  width: '100%',
                  height: 80,
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(0,255,255,0.08)',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: '"Space Mono", monospace' }}>
                <span>60s ago</span>
                <span style={{ color: currentFPS >= 45 ? '#00ff88' : currentFPS >= 30 ? '#ffaa00' : '#ff4444' }}>
                  {currentFPS} FPS
                </span>
                <span>Now</span>
              </div>
            </div>

            <div style={{ height: 1, background: 'rgba(0,255,255,0.06)', marginBottom: 14 }} />

            {/* GPU Info */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Cpu size={12} color="#00ffff" />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: '"Space Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  GPU Renderer
                </span>
              </div>
              <div style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.6)',
                fontFamily: '"Space Mono", monospace',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(0,255,255,0.08)',
                borderRadius: 6,
                padding: '8px 10px',
                wordBreak: 'break-word',
                lineHeight: 1.5,
              }}>
                {gpuInfo}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
