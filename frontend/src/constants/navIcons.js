import {
  LayoutDashboard,
  Laptop,
  Printer,
  ClipboardCheck,
  PackageOpen,
  Send,
  Tag,
  Layers,
  MapPin,
  Building2,
  ListChecks,
  LineChart,
  History,
  UserCog,
  Trash2,
  Settings,
  CreditCard,
  UserRound,
  FileQuestion,
} from 'lucide-react';

/**
 * Ikon lucide-react per kunci modul — dipakai khusus oleh sidebar & tab
 * bergaya Chrome (TabBar.jsx). Terpisah dari `MODULES[].icon` di
 * constants/modules.js (kelas Font Awesome, dipakai bersama backend & masih
 * dirender FA di tempat lain seperti PermissionMatrix) karena katalog modul
 * itu dipakai bersama backend dan tidak semestinya membawa detail pustaka
 * ikon frontend tertentu.
 */
export const NAV_ICONS = {
  dashboard: LayoutDashboard,
  assets: Laptop,
  barcode: Printer,
  opname: ClipboardCheck,
  consumables: PackageOpen,
  requests: Send,
  categories: Tag,
  asset_types: Layers,
  locations: MapPin,
  departments: Building2,
  custom_fields: ListChecks,
  reports: LineChart,
  audit_logs: History,
  users: UserCog,
  trash: Trash2,
  settings: Settings,
  billing: CreditCard,
  /* Satu-satunya halaman tenant yang bukan modul (constants/modules.js) —
     tetap butuh ikon karena tab & sidebar sama-sama bisa menampilkannya. */
  profile: UserRound,
};

export const DEFAULT_NAV_ICON = FileQuestion;
