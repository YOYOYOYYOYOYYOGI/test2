import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/print.css';
import { PrintPage } from './PrintPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrintPage />
  </StrictMode>,
);
