import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App.js';
import { PlaybackProvider } from './playback/PlaybackProvider.js';
import './styles.css';

const el = document.getElementById('root');
if (!el) {
  throw new Error('root element missing');
}

createRoot(el).render(
  <StrictMode>
    <HashRouter>
      <PlaybackProvider>
        <App />
      </PlaybackProvider>
    </HashRouter>
  </StrictMode>
);
