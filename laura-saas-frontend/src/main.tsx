import './index.css';
import App from './App.jsx';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';

const SpeedInsights = lazy(() =>
  import('@vercel/speed-insights/react').then((m) => ({ default: m.SpeedInsights }))
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Suspense fallback={null}>
      <SpeedInsights />
    </Suspense>
  </StrictMode>,
);