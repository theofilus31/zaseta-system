import axios from 'axios';

/**
 * Instance axios TERPISAH dari axiosClient.js tenant — sesi admin platform
 * (localStorage key `platformToken`, BUKAN `token`) tidak boleh tercampur
 * sama sekali dengan sesi tenant, sejak migration_separate_platform_admins.sql
 * memisahkan akunnya total demi keamanan. Dipakai SEMUA pages/Platform*.jsx
 * dan komponen panel admin platform lainnya.
 */
const platformAxiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

platformAxiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('platformToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

platformAxiosClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('platformToken');
      localStorage.removeItem('platformAdmin');
      if (!window.location.pathname.includes('/platform/login')) {
        window.location.href = '/platform/login';
      }
    }
    return Promise.reject(err);
  }
);

export default platformAxiosClient;
