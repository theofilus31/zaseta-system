import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import LandingPage from './pages/LandingPage.jsx';
import PricingPage from './pages/PricingPage.jsx';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage.jsx';
import TermsOfServicePage from './pages/TermsOfServicePage.jsx';
import LineChart9Demo from './components/ui/sc-line-charts-9-demo.tsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import TenantLogin from './pages/TenantLogin.jsx';
import { useAuth } from './context/AuthContext.jsx';
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
import TrashPage from './pages/TrashPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import Profile from './pages/Profile.jsx';
import QRPrintPage from './pages/QRPrintPage.jsx';
import BatchQrPrintPage from './pages/BatchQrPrintPage.jsx';
import StockOpnamePage from './pages/StockOpnamePage.jsx';
import StockOpnameDetail from './pages/StockOpnameDetail.jsx';
import BastPrintPage from './pages/BastPrintPage.jsx';
import ConsumableList from './pages/ConsumableList.jsx';
import ConsumableDetail from './pages/ConsumableDetail.jsx';
import ConsumableQRPrintPage from './pages/ConsumableQRPrintPage.jsx';
import RequestList from './pages/RequestList.jsx';
import RequestDetail from './pages/RequestDetail.jsx';
import DepreciationReportPage from './pages/DepreciationReportPage.jsx';
import PublicScanPage from './pages/PublicScanPage.jsx';
import ConsumablePublicScanPage from './pages/ConsumablePublicScanPage.jsx';
import PublicRequestPage from './pages/PublicRequestPage.jsx';
import BillingPage from './pages/BillingPage.jsx';
import InvoicePrintPage from './pages/InvoicePrintPage.jsx';
import PlatformDashboard from './pages/PlatformDashboard.jsx';
import PlatformTenants from './pages/PlatformTenants.jsx';
import PlatformAdmins from './pages/PlatformAdmins.jsx';
import PlatformRevenue from './pages/PlatformRevenue.jsx';
import PlatformPlans from './pages/PlatformPlans.jsx';
import PlatformActivity from './pages/PlatformActivity.jsx';
import PlatformAccount from './pages/PlatformAccount.jsx';
import PlatformUsers from './pages/PlatformUsers.jsx';
import PlatformAuditLog from './pages/PlatformAuditLog.jsx';
import PlatformIpWhitelist from './pages/PlatformIpWhitelist.jsx';
import PlatformTestimonials from './pages/PlatformTestimonials.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';

/**
 * Setiap rute menyebutkan modul dan aksi minimal yang dibutuhkannya. Nilai
 * `module` di sini harus cocok dengan kunci di constants/modules.js dan dengan
 * penjaga di backend — keduanya memakai kosakata yang sama.
 */
/* "/" adalah halaman pemasaran publik untuk pengunjung anonim — tapi begitu
   sudah login, tetap diarahkan ke Dasbor seperti sebelumnya, bukan disuguhi
   halaman jualan produk yang sudah mereka pakai. Admin platform diarahkan ke
   panelnya sendiri, bukan Dasbor tenant — lihat catatan di homeForUser(). */
function homeForUser(user) {
  return user?.is_platform_admin ? '/platform/dashboard' : '/dashboard';
}

function HomeRoute() {
  const { user } = useAuth();
  return user ? <Navigate to={homeForUser(user)} replace /> : <LandingPage />;
}

/* Rute tak dikenal ("*") juga ikut aturan yang sama — dulu selalu balik ke
   /dashboard, jadi admin platform yang salah ketik URL malah nyasar ke
   Dasbor tenant. */
function NotFoundRedirect() {
  const { user } = useAuth();
  return <Navigate to={homeForUser(user)} replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Publik — tidak butuh login, ini yang diakses saat client scan QR */}
      <Route path="/scan/:code" element={<PublicScanPage />} />

      {/* Pindai barcode barang habis pakai — rute publik terpisah dari
          /scan/:code aset (lihat catatan di migration_consumable_qr.sql). */}
      <Route path="/scan-consumable/:code" element={<ConsumablePublicScanPage />} />

      {/* Publik — halaman harga, ditautkan dari NavBar/Footer LandingPage */}
      <Route path="/harga" element={<PricingPage />} />

      {/* Publik — ditautkan dari Footer & halaman Daftar */}
      <Route path="/kebijakan-privasi" element={<PrivacyPolicyPage />} />
      <Route path="/syarat-ketentuan" element={<TermsOfServicePage />} />

      {/* Pratinjau komponen shadcn/ui (chart) yang baru diintegrasikan --
          data di dalamnya statis/contoh, tidak tersambung ke API mana pun.
          Tidak ditautkan dari menu mana pun, sengaja cuma bisa dibuka lewat
          URL langsung. */}
      <Route path="/dev/chart-demo" element={<LineChart9Demo />} />

      {/* Publik — tautan khusus dibagikan ke karyawan tanpa akun aplikasi
          supaya mereka bisa mengajukan permintaan aset sendiri */}
      <Route path="/ajukan-permintaan" element={<PublicRequestPage />} />

      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Halaman masuk KHUSUS satu tenant (Fase 5 Tahap 2 SaaS), mis.
          /rms/login — lihat catatan di TenantLogin.jsx dan
          RESERVED_SLUGS di backend/src/utils/tenantSlug.js (kode
          perusahaan tidak pernah boleh bentrok dengan path tingkat atas
          lain di sini, termasuk /login & /signup di atas). */}
      <Route path="/:slug/login" element={<TenantLogin />} />

      {/* Semua rute tenant di bawah ini berbagi SATU instance <Layout/>
          (sidebar + tab ala Chrome) lewat <Outlet/> — dipasang di sini,
          bukan lagi oleh masing-masing halaman, supaya sidebar/tab tidak
          dibongkar-pasang ulang setiap kali berpindah halaman (itu yang
          dulu membuat tab yang baru dibuka hilang lagi: TabsProvider ikut
          ter-unmount sebelum sempat menyimpan perubahannya). */}
      <Route element={<Layout />}>
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
        <Route path="/consumables/:id/qr" element={<ProtectedRoute module="consumables"><ConsumableQRPrintPage /></ProtectedRoute>} />

        <Route path="/requests" element={<ProtectedRoute module="requests"><RequestList /></ProtectedRoute>} />
        <Route path="/requests/:id" element={<ProtectedRoute module="requests"><RequestDetail /></ProtectedRoute>} />

        <Route path="/reports/depreciation" element={<ProtectedRoute module="reports"><DepreciationReportPage /></ProtectedRoute>} />

        <Route path="/categories" element={<ProtectedRoute module="categories"><CategoryManagement /></ProtectedRoute>} />
        <Route path="/asset-types" element={<ProtectedRoute module="asset_types"><AssetTypeManagement /></ProtectedRoute>} />
        <Route path="/locations" element={<ProtectedRoute module="locations"><LocationManagement /></ProtectedRoute>} />
        <Route path="/departments" element={<ProtectedRoute module="departments"><DepartmentManagement /></ProtectedRoute>} />
        <Route path="/custom-fields" element={<ProtectedRoute module="custom_fields"><CustomFieldManagement /></ProtectedRoute>} />

        <Route path="/users" element={<ProtectedRoute module="users"><UserManagement /></ProtectedRoute>} />
        <Route path="/audit-logs" element={<ProtectedRoute module="audit_logs"><AuditLogPage /></ProtectedRoute>} />
        <Route path="/trash" element={<ProtectedRoute module="trash"><TrashPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute module="settings"><SettingsPage /></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute module="billing"><BillingPage /></ProtectedRoute>} />
        <Route path="/billing/invoices/:id" element={<ProtectedRoute module="billing"><InvoicePrintPage /></ProtectedRoute>} />
      </Route>

      {/* Lintas tenant, khusus admin platform (Fase 5 SaaS) — bukan modul yang
          tunduk pada matriks izin per-tenant biasa, jadi tidak pakai prop
          `module`. Prop `platform` di ProtectedRoute yang menjaga dua arah:
          harus is_platform_admin untuk masuk sini, dan is_platform_admin
          TIDAK BOLEH masuk ke rute tenant biasa di atas. Panel ini punya
          kerangka & navigasinya sendiri (PlatformLayout.jsx) — TIDAK ikut
          dipindah ke sistem tab ala Chrome di atas. */}
      <Route path="/platform/dashboard" element={<ProtectedRoute platform><PlatformDashboard /></ProtectedRoute>} />
      <Route path="/platform/tenants" element={<ProtectedRoute platform><PlatformTenants /></ProtectedRoute>} />
      <Route path="/platform/admins" element={<ProtectedRoute platform><PlatformAdmins /></ProtectedRoute>} />
      <Route path="/platform/ip-whitelist" element={<ProtectedRoute platform><PlatformIpWhitelist /></ProtectedRoute>} />
      <Route path="/platform/testimonials" element={<ProtectedRoute platform><PlatformTestimonials /></ProtectedRoute>} />
      <Route path="/platform/account" element={<ProtectedRoute platform><PlatformAccount /></ProtectedRoute>} />
      <Route path="/platform/users" element={<ProtectedRoute platform><PlatformUsers /></ProtectedRoute>} />
      <Route path="/platform/audit-log" element={<ProtectedRoute platform><PlatformAuditLog /></ProtectedRoute>} />
      <Route path="/platform/revenue" element={<ProtectedRoute platform><PlatformRevenue /></ProtectedRoute>} />
      <Route path="/platform/plans" element={<ProtectedRoute platform><PlatformPlans /></ProtectedRoute>} />
      <Route path="/platform/activity" element={<ProtectedRoute platform><PlatformActivity /></ProtectedRoute>} />

      <Route path="/" element={<HomeRoute />} />
      <Route path="*" element={<NotFoundRedirect />} />
    </Routes>
  );
}
