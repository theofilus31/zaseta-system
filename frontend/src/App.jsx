import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AssetList from './pages/AssetList.jsx';
import AssetDetail from './pages/AssetDetail.jsx';
import AssetForm from './pages/AssetForm.jsx';
import CategoryManagement from './pages/CategoryManagement.jsx';
import AssetTypeManagement from './pages/AssetTypeManagement.jsx';
import LocationManagement from './pages/LocationManagement.jsx';
import DepartmentManagement from './pages/DepartmentManagement.jsx';
import CustomFieldManagement from './pages/CustomFieldManagement.jsx';
import UserManagement from './pages/UserManagement.jsx';
import AuditLogPage from './pages/AuditLogPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import Profile from './pages/Profile.jsx';
import QRPrintPage from './pages/QRPrintPage.jsx';
import BatchQrPrintPage from './pages/BatchQrPrintPage.jsx';
import StockOpnamePage from './pages/StockOpnamePage.jsx';
import StockOpnameDetail from './pages/StockOpnameDetail.jsx';
import BastPrintPage from './pages/BastPrintPage.jsx';
import ConsumableList from './pages/ConsumableList.jsx';
import ConsumableDetail from './pages/ConsumableDetail.jsx';
import RequestList from './pages/RequestList.jsx';
import RequestDetail from './pages/RequestDetail.jsx';
import DepreciationReportPage from './pages/DepreciationReportPage.jsx';
import ZecodePage from './pages/ZecodePage.jsx';
import PublicScanPage from './pages/PublicScanPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

/**
 * Setiap rute menyebutkan modul dan aksi minimal yang dibutuhkannya. Nilai
 * `module` di sini harus cocok dengan kunci di constants/modules.js dan dengan
 * penjaga di backend — keduanya memakai kosakata yang sama.
 */
export default function App() {
  return (
    <Routes>
      {/* Publik — tidak butuh login, ini yang diakses saat client scan QR */}
      <Route path="/scan/:code" element={<PublicScanPage />} />

      <Route path="/login" element={<Login />} />

      {/* Profil sendiri selalu boleh dibuka siapa pun yang sudah masuk */}
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

      <Route path="/dashboard" element={<ProtectedRoute module="dashboard"><Dashboard /></ProtectedRoute>} />

      <Route path="/assets" element={<ProtectedRoute module="assets"><AssetList /></ProtectedRoute>} />
      <Route path="/assets/new" element={<ProtectedRoute module="assets" action="create"><AssetForm /></ProtectedRoute>} />
      <Route path="/assets/:id" element={<ProtectedRoute module="assets"><AssetDetail /></ProtectedRoute>} />
      <Route path="/assets/:id/edit" element={<ProtectedRoute module="assets" action="edit"><AssetForm /></ProtectedRoute>} />
      <Route path="/assets/:id/qr" element={<ProtectedRoute module="assets"><QRPrintPage /></ProtectedRoute>} />
      <Route path="/assignments/:id/bast" element={<ProtectedRoute module="assets"><BastPrintPage /></ProtectedRoute>} />

      <Route path="/cetak-barcode-massal" element={<ProtectedRoute module="barcode"><BatchQrPrintPage /></ProtectedRoute>} />

      <Route path="/opname" element={<ProtectedRoute module="opname"><StockOpnamePage /></ProtectedRoute>} />
      <Route path="/opname/:id" element={<ProtectedRoute module="opname"><StockOpnameDetail /></ProtectedRoute>} />

      <Route path="/consumables" element={<ProtectedRoute module="consumables"><ConsumableList /></ProtectedRoute>} />
      <Route path="/consumables/:id" element={<ProtectedRoute module="consumables"><ConsumableDetail /></ProtectedRoute>} />

      <Route path="/requests" element={<ProtectedRoute module="requests"><RequestList /></ProtectedRoute>} />
      <Route path="/requests/:id" element={<ProtectedRoute module="requests"><RequestDetail /></ProtectedRoute>} />

      <Route path="/zecode" element={<ProtectedRoute module="zecode"><ZecodePage /></ProtectedRoute>} />

      <Route path="/reports/depreciation" element={<ProtectedRoute module="reports"><DepreciationReportPage /></ProtectedRoute>} />

      <Route path="/categories" element={<ProtectedRoute module="categories"><CategoryManagement /></ProtectedRoute>} />
      <Route path="/asset-types" element={<ProtectedRoute module="asset_types"><AssetTypeManagement /></ProtectedRoute>} />
      <Route path="/locations" element={<ProtectedRoute module="locations"><LocationManagement /></ProtectedRoute>} />
      <Route path="/departments" element={<ProtectedRoute module="departments"><DepartmentManagement /></ProtectedRoute>} />
      <Route path="/custom-fields" element={<ProtectedRoute module="custom_fields"><CustomFieldManagement /></ProtectedRoute>} />

      <Route path="/users" element={<ProtectedRoute module="users"><UserManagement /></ProtectedRoute>} />
      <Route path="/audit-logs" element={<ProtectedRoute module="audit_logs"><AuditLogPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute module="settings"><SettingsPage /></ProtectedRoute>} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
