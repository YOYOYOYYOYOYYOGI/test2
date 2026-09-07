import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/base.css';
import { Popup } from './Popup';
import { ErrorBoundary } from '../components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Popup />
    </ErrorBoundary>
  </StrictMode>,
);
