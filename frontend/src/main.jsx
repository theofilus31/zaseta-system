import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { PlatformAuthProvider } from './context/PlatformAuthContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';
import { UnsavedChangesProvider } from './context/UnsavedChangesContext.jsx';
import { BrandingProvider } from './context/BrandingContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <BrandingProvider>
        {/* Sesi admin platform (PlatformAuthProvider) TERPISAH TOTAL dari sesi
            tenant (AuthProvider) -- tidak butuh BrandingProvider tenant, tapi
            dibungkus di dalamnya begini juga tidak masalah, keduanya tidak
            saling baca state. */}
        <PlatformAuthProvider>
          <AuthProvider>
            <NotificationProvider>
              <UnsavedChangesProvider>
                <App />
              </UnsavedChangesProvider>
            </NotificationProvider>
          </AuthProvider>
        </PlatformAuthProvider>
      </BrandingProvider>
    </BrowserRouter>
  </React.StrictMode>
);
