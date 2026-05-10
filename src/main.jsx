/**
 * @file main.jsx
 * @module Main
 * @description Entry point for Aetheris 4D. Mounts the React app into #root.
 *              Uses React 18 createRoot API. No StrictMode (avoids Cesium double-init).
 * @author Aetheris 4D
 */

import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const root = document.getElementById('root');
createRoot(root).render(<App />);
