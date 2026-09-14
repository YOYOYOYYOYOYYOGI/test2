import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/base.css';
import { App } from './App';
import { ErrorBoundary } from '../components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);


// The options page continues to run as a Chrome extension.  A regular browser
// tab registers the PWA worker so Android/iPhone users can install the exact
// same application without a second codebase or data model.
const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
if (!isExtension && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`)
      .catch((error) => console.warn('[pwa] service worker registration failed:', error));
  });
}
