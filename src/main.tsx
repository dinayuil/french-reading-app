import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './i18n';
import { applyTheme, watchTheme } from './lib/theme';
import { initializeNativeApp } from './platform/lifecycle';
import './styles/global.css';

applyTheme();
watchTheme();

void initializeNativeApp().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
