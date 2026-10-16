import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ui';
import { AuthGate } from './store/AuthContext';
import { DataProvider } from './store/DataContext';
import { ToastProvider } from './store/ToastContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthGate>
            <DataProvider>
              <App />
            </DataProvider>
          </AuthGate>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
