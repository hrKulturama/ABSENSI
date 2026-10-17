/**
 * KONTROL UPLOAD — backend Apps Script untuk kontrol.html
 * ---------------------------------------------------------------
 * Project Apps Script TERPISAH (standalone). Bukan bagian dari
 * Code.js Absensi dan bukan project Report Kreatif.
 *
 * Baca & ubah STATUS YT/IG/TT di tab KALENDER KONTEN
 * (DASHBOARD KULTURAMA V1).
 *
 * Auth: pakai TOKEN LOGIN ABSENSI yang sama (localStorage
 * 'absensi_token'), diverifikasi persis seperti project
 * "Kreatif-Produksi Report Backend": HMAC-SHA256 pakai
 * HR_TOKEN_SECRET. Yang boleh akses: role kreatif, hr, admin.
 *
 * Cara pasang:
 * 1. script.google.com → New project → tempel file ini.
 * 2. Project Settings → Script Properties → tambah:
 *      HR_TOKEN_SECRET = <HARUS SAMA PERSIS dengan di project
 *                         Absensi / Kreatif-Produksi Report Backend>
 * 3. Deploy → New deployment → Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 4. Copy URL /exec → tempel ke KONTROL_API_URL di kontrol.html.
 * 5. Tes: jalankan testVerifikasiToken() dari editor (lihat bawah).
 *
 * Kalau HR_TOKEN_SECRET suatu saat diganti, ganti juga di sini.
 */

const SPREADSHEET_ID = '1raiIO1HccW7IxN9bh9BqUJ7DOHDVBN05GKRQ5xrrfeI';
const TAB = 'KALENDER KONTEN';
const TZ = 'Asia/Jakarta';
const LAST_COL = 30; // A..AD
const STATUS_OPTS = ['', 'Acc', 'Scheduled', 'Uploaded', 'Gagal'];
const PLAT_COL = { YT: 18, IG: 19, TT: 20 }; // R, S, T (1-based)
const MAX_RANGE_DAYS = 62;
const ALLOWED_ROLES = ['kreatif', 'hr', 'admin'];

function doGet(e) {
  return handle_(function () {
    const p = (e && e.parameter) || {};
    cekAkses_(p.token);
    if (p.action === 'list') return list_(p.from, p.to);
    if (p.action === 'ping') return { ok: true };
    throw err_('BAD_REQUEST', 'action tidak dikenal');
  });
}

function doPost(e) {
  return handle_(function () {
    let body;
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (x) { throw err_('BAD_REQUEST', 'Body bukan JSON'); }
    cekAkses_(body.token);
    if (body.action === 'setStatus') return setStatus_(body);
    throw err_('BAD_REQUEST', 'action tidak dikenal');
  });
}

// ---------- actions ----------

function list_(from, to) {
  const f = parseIso_(from), t = parseIso_(to);
  if (!f || !t || t < f) throw err_('BAD_REQUEST', 'from/to harus YYYY-MM-DD');
  if ((t - f) / 86400000 > MAX_RANGE_DAYS) throw err_('BAD_REQUEST', 'Rentang maksimal ' + MAX_RANGE_DAYS + ' hari');

  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return { ok: true, rows: [] };
  const rng = sh.getRange(2, 1, n, LAST_COL);
  const raw = rng.getValues();
  const disp = rng.getDisplayValues();
  const fromS = from, toS = to;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const date = cellDate_(raw[i][0], disp[i][0]);
    if (!date || date < fromS || date > toS) continue;
    const d = disp[i];
    if (!String(d[1]).trim()) continue;
    rows.push({
      row: i + 2, date: date, title: String(d[1]).trim(), akun: d[2], segmen: d[3],
      jamYT: d[4], jamIG: d[5], jamTT: d[6], jenis: d[8],
      producer: d[9], designer: d[12], editor: d[13],
      statusYT: d[17], statusIG: d[18], statusTT: d[19], catatan: d[29]
    });
  }
  return { ok: true, rows: rows, generatedAt: new Date().toISOString() };
}

function setStatus_(b) {
  const row = Number(b.row);
  const col = PLAT_COL[b.platform];
  const value = String(b.value == null ? '' : b.value);
  if (!row || row < 2 || !col) throw err_('BAD_REQUEST', 'row/platform tidak valid');
  if (STATUS_OPTS.indexOf(value) === -1) throw err_('BAD_REQUEST', 'Status tidak valid');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw err_('BUSY', 'Lagi ada yang nyimpen, coba lagi');
  try {
    const sh = sheet_();
    const ab = sh.getRange(row, 1, 1, 2);
    const v = ab.getValues()[0], dv = ab.getDisplayValues()[0];
    // Pastikan baris masih konten yang sama (jaga-jaga ada row disisipkan)
    if (String(dv[1]).trim() !== String(b.title || '').trim() || cellDate_(v[0], dv[0]) !== b.date) {
      throw err_('ROW_MOVED', 'Baris di sheet sudah berubah, refresh dulu');
    }
    sh.getRange(row, col).setValue(value);
    return { ok: true, row: row, platform: b.platform, value: value };
  } finally {
    lock.releaseLock();
  }
}

// ---------- helpers ----------

function sheet_() {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TAB);
  if (!sh) throw err_('SETUP', 'Tab ' + TAB + ' tidak ditemukan');
  return sh;
}

// ---------- auth (sama persis dengan Kreatif-Produksi Report Backend) ----------
function signPayload_(payloadB64) {
  const secret = PropertiesService.getScriptProperties().getProperty('HR_TOKEN_SECRET');
  if (!secret) throw err_('SETUP', 'HR_TOKEN_SECRET belum diisi di Script Properties');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payloadB64, secret));
}

// Return { nama, role, exp } kalau token sah, atau null.
function readToken_(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  if (signPayload_(parts[0]) !== parts[1]) return null;
  try {
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) { return null; }
}

function cekAkses_(token) {
  const payload = readToken_(token);
  if (!payload) throw err_('UNAUTHORIZED', 'Sesi habis atau belum login. Masuk lagi lewat app Absensi.');
  const role = String(payload.role || '').toLowerCase();
  if (ALLOWED_ROLES.indexOf(role) === -1) throw err_('FORBIDDEN', 'Role kamu tidak punya akses ke Kontrol Upload.');
  return payload;
}

const MON_ = { jan:1, feb:2, mar:3, apr:4, may:5, mei:5, jun:6, jul:7, aug:8, agu:8, agt:8, sep:9, oct:10, okt:10, nov:11, dec:12, des:12 };
function cellDate_(v, disp) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = String(disp || v || '').trim();
  let m = s.match(/^(\d{1,2})[-\s\/]([A-Za-z]{3,})[-\s\/](\d{4})$/);
  if (m && MON_[m[2].slice(0, 3).toLowerCase()]) return iso_(+m[3], MON_[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return iso_(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso_(+m[1], +m[2], +m[3]);
  return null;
}
function iso_(y, m, d) { return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2); }
function parseIso_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

function err_(code, message) { const e = new Error(message); e.code = code; return e; }

function handle_(fn) {
  let out;
  try { out = fn(); }
  catch (e) { out = { ok: false, code: e.code || 'SERVER_ERROR', message: String(e.message || e) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- tes manual dari editor ----------
// Tempel token dari app Absensi (DevTools → Application → Local Storage →
// absensi_token), lalu Run. Jangan commit token asli ke repo.
function testVerifikasiToken() {
  const TOKEN_UJI = 'TEMPEL_TOKEN_DI_SINI';
  if (TOKEN_UJI === 'TEMPEL_TOKEN_DI_SINI') { Logger.log('Isi dulu TOKEN_UJI.'); return; }
  const p = readToken_(TOKEN_UJI);
  if (!p) { Logger.log('GAGAL: token ditolak. Cek HR_TOKEN_SECRET sama dengan project Absensi, atau token sudah kadaluarsa.'); return; }
  Logger.log('OK: ' + p.nama + ' (' + p.role + '), boleh akses: ' + (ALLOWED_ROLES.indexOf(String(p.role).toLowerCase()) !== -1));
}
