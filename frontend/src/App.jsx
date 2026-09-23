import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import LandingPage from './pages/LandingPage.jsx';
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
import StockOpnamePage from './pages/StockOpnamePage.jsx';
import StockOpnameDetail from './pages/StockOpnameDetail.jsx';
import ConsumableList from './pages/ConsumableList.jsx';
import ConsumableDetail from './pages/ConsumableDetail.jsx';
import RequestList from './pages/RequestList.jsx';
import RequestDetail from './pages/RequestDetail.jsx';
import PublicScanPage from './pages/PublicScanPage.jsx';
import ConsumablePublicScanPage from './pages/ConsumablePublicScanPage.jsx';
import PublicRequestPage from './pages/PublicRequestPage.jsx';
import BillingPage from './pages/BillingPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import RouteLoadingFallback from './components/RouteLoadingFallback.jsx';

/* Dimuat lazy (React.lazy + Suspense di bawah), BUKAN import biasa di atas --
   masing-masing hanya dibuka segelintir orang (admin platform saja, atau
   sekali-sekali untuk cetak/laporan), jadi tidak wajar dipikul SETIAP
   pengunjung lewat bundle utama. Lihat catatan bundle-size hasil audit
   codebase -- ini bukan perbaikan bug, murni supaya beban unduhan awal
   (termasuk untuk pengunjung anonim landing page) tidak ikut menanggung
   kode yang mereka sendiri tidak pernah pakai. */
const PricingPage = lazy(() => import('./pages/PricingPage.jsx'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage.jsx'));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage.jsx'));
const LineChart9Demo = lazy(() => import('./components/ui/sc-line-charts-9-demo.tsx'));
const QRPrintPage = lazy(() => import('./pages/QRPrintPage.jsx'));
const BatchQrPrintPage = lazy(() => import('./pages/BatchQrPrintPage.jsx'));
const BastPrintPage = lazy(() => import('./pages/BastPrintPage.jsx'));
const ConsumableQRPrintPage = lazy(() => import('./pages/ConsumableQRPrintPage.jsx'));
const InvoicePrintPage = lazy(() => import('./pages/InvoicePrintPage.jsx'));
const DepreciationReportPage = lazy(() => import('./pages/DepreciationReportPage.jsx'));
const PlatformLogin = lazy(() => import('./pages/PlatformLogin.jsx'));
const PlatformDashboard = lazy(() => import('./pages/PlatformDashboard.jsx'));
const PlatformTenants = lazy(() => import('./pages/PlatformTenants.jsx'));
const PlatformAdmins = lazy(() => import('./pages/PlatformAdmins.jsx'));
const PlatformRevenue = lazy(() => import('./pages/PlatformRevenue.jsx'));
const PlatformPlans = lazy(() => import('./pages/PlatformPlans.jsx'));
const PlatformActivity = lazy(() => import('./pages/PlatformActivity.jsx'));
const PlatformAccount = lazy(() => import('./pages/PlatformAccount.jsx'));
const PlatformUsers = lazy(() => import('./pages/PlatformUsers.jsx'));
const PlatformAuditLog = lazy(() => import('./pages/PlatformAuditLog.jsx'));
const PlatformIpWhitelist = lazy(() => import('./pages/PlatformIpWhitelist.jsx'));
const PlatformTestimonials = lazy(() => import('./pages/PlatformTestimonials.jsx'));

/**
 * Setiap rute menyebutkan modul dan aksi minimal yang dibutuhkannya. Nilai
 * `module` di sini harus cocok dengan kunci di constants/modules.js dan dengan
 * penjaga di backend — keduanya memakai kosakata yang sama.
 */
/* "/" adalah halaman pemasaran publik untuk pengunjung anonim — tapi begitu
   sudah login, tetap diarahkan ke Dasbor seperti sebelumnya, bukan disuguhi
   halaman jualan produk yang sudah mereka pakai. Admin platform TIDAK PERNAH
   punya sesi tenant (dua sesi terpisah total sejak
   migration_separate_platform_admins.sql, lihat PlatformAuthContext.jsx),
   jadi `user` di sini selalu berarti pengguna tenant biasa. */
function homeForUser() {
  return '/dashboard';
}

function HomeRoute() {
  const { user } = useAuth();
  return user ? <Navigate to={homeForUser()} replace /> : <LandingPage />;
}

/* Rute tak dikenal ("*") — path di bawah /platform/* diarahkan ke sesi
   admin platform-nya sendiri (bukan /dashboard tenant), supaya admin
   platform yang salah ketik URL panelnya sendiri tidak nyasar ke sesi
   tenant yang memang tidak pernah dipunyainya. */
function NotFoundRedirect() {
  const { user } = useAuth();
  const location = useLocation();
  if (location.pathname.startsWith('/platform/')) {
    return <Navigate to="/platform/dashboard" replace />;
  }
  return user ? <Navigate to={homeForUser()} replace /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
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

      {/* Lintas tenant, khusus admin platform (Fase 5 SaaS) — sesi TERPISAH
          TOTAL dari sesi tenant sejak migration_separate_platform_admins.sql
          (lihat PlatformAuthContext.jsx), bukan modul yang tunduk pada
          matriks izin per-tenant biasa, jadi tidak pakai prop `module`. Prop
          `platform` di ProtectedRoute mendelegasikan penjagaannya ke sesi
          admin platform sendiri. Panel ini punya kerangka & navigasinya
          sendiri (PlatformLayout.jsx) — TIDAK ikut dipindah ke sistem tab ala
          Chrome di atas.

          /platform/login SENGAJA TIDAK ditautkan dari halaman publik mana
          pun (landing page, /login, /:slug/login) — hanya bisa dibuka lewat
          URL langsung, lihat catatan di pages/PlatformLogin.jsx. */}
      <Route path="/platform/login" element={<PlatformLogin />} />
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
    </Suspense>
  );
}
