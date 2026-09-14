import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/print.css';
import { PrintPage } from './PrintPage';
import { ErrorBoundary } from '../components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PrintPage />
    </ErrorBoundary>
  </StrictMode>,
);
