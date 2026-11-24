import React from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import App from './App.js';
import './styles.css';
import './workspace.css';
import { registerAppServiceWorker } from './lib/pwa.ts';

registerAppServiceWorker(() => {
  window.dispatchEvent(new CustomEvent('sintaks:sw-update-available'));
});

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
