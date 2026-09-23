/**
 * Mock req/res minimal untuk memanggil middleware/controller (asyncHandler)
 * langsung sebagai fungsi biasa di test — tanpa perlu menghidupkan server
 * Express + autentikasi JWT sungguhan segala. `res` menampung status/body
 * yang dikirim supaya bisa diperiksa lewat assert.
 */
// `platformAdmin` ikut disertakan (bukan cuma `user`) supaya satu helper yang
// sama bisa dipakai memanggil controller tenant (authenticate -> req.user)
// MAUPUN controller admin platform (authenticatePlatform -> req.platformAdmin,
// lihat platformController.js sejak migration_separate_platform_admins.sql)
// tanpa test perlu tahu bedanya -- controller yang dipanggil cuma membaca
// field yang relevan untuknya, field yang satunya diam saja tidak dipakai.
function mockReq({ tenantId, userId = 1, body = {}, params = {}, query = {} } = {}) {
  return {
    user: { id: userId, tenant_id: tenantId, name: 'Uji', email: 'uji@example.test' },
    platformAdmin: { id: userId, name: 'Uji Admin Platform', email: 'admin-uji@example.test' },
    body, params, query, ip: '127.0.0.1',
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

/**
 * Middleware/controller di proyek ini SELALU dibungkus `asyncHandler`
 * (lihat utils/asyncHandler.js) — fungsi LUARnya balik SEKETIKA (`undefined`,
 * tanpa menunggu), pekerjaan async sungguhan jalan di promise lepas di
 * dalamnya. Jadi menunggu lewat `await fn(...)` atau `.then()` pada hasil
 * panggilan `fn(...)` TIDAK BISA DIANDALKAN — race lomba, bisa selesai
 * sebelum res.json()/next() sungguhan dipanggil (persis begitu jalur "blokir"
 * tidak pernah memanggil next() sama sekali). Makanya `res.json` di-hook
 * LANGSUNG supaya translate-nya jadi resolve seketika dipanggil, bukan
 * dicek belakangan.
 */
function runMiddleware(fn, req) {
  return new Promise((resolve, reject) => {
    const res = mockRes();
    let settled = false;

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      originalJson(payload);
      if (!settled) { settled = true; resolve({ res, nextCalled: false }); }
      return res;
    };

    const next = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err); else resolve({ res, nextCalled: true });
    };

    Promise.resolve(fn(req, res, next)).catch((err) => {
      if (!settled) { settled = true; reject(err); }
    });
  });
}

module.exports = { mockReq, mockRes, runMiddleware };
