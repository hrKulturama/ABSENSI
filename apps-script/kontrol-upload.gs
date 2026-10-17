/**
 * KONTROL UPLOAD — backend Apps Script untuk tab Dashboard app Absensi (dashboard.js)
 * ---------------------------------------------------------------
 * Project Apps Script TERPISAH (standalone). Bukan bagian dari
 * Code.js Absensi dan bukan project Report Kreatif.
 *
 * Baca tab KALENDER KONTEN (DASHBOARD KULTURAMA V1), ubah STATUS
 * YT/IG/TT, dan edit isi satu baris konten (tab Dashboard app Absensi).
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
 * 4. Copy URL /exec → tempel ke KONTROL_API_URL di dashboard.js.
 *    Update kode: Deploy → Manage deployments → ✏️ → Version: New version
 *    (URL tetap sama, gak perlu ganti di dashboard.js).
 * 5. Tes: jalankan testVerifikasiToken() dari editor (lihat bawah).
 *
 * Kalau HR_TOKEN_SECRET suatu saat diganti, ganti juga di sini.
 */

const SPREADSHEET_ID = '1raiIO1HccW7IxN9bh9BqUJ7DOHDVBN05GKRQ5xrrfeI';
const TAB = 'KALENDER KONTEN';
const TZ = 'Asia/Jakarta';
const STATUS_OPTS = ['', 'Acc', 'Scheduled', 'Uploaded', 'Gagal'];
const MAX_RANGE_DAYS = 62;
const ALLOWED_ROLES = ['kreatif', 'hr', 'admin'];

// Kolom dicari lewat NAMA HEADER di baris 1, bukan posisi — jadi kolom boleh
// ditambah/dihapus/dipindah di sheet tanpa bikin app salah baca.
// key yang dipakai dashboard.js -> teks header di KALENDER KONTEN.
const FIELDS = {
  tanggal: 'TANGGAL', judul: 'JUDUL KONTEN', akun: 'AKUN', segmen: 'SEGMEN',
  jamYT: 'JAM UP YT', jamIG: 'JAM UP IG', jamTT: 'JAM UP TT', jamFB: 'JAM UP FB',
  jenis: 'JENIS KONTEN', producer: 'PRODUCER', writing: 'WRITING', shooting: 'SHOOTING',
  designer: 'DESIGNER', editor: 'EDITOR', talent1: 'TALENT 1', talent2: 'TALENT 2',
  production: 'PRODUCTION',
  statusYT: 'STATUS YT', statusIG: 'STATUS IG', statusTT: 'STATUS TT', statusFB: 'STATUS FB',
  postYT: 'POST ID YT', postIG: 'POST ID IG', postTT: 'POST ID TT', postFB: 'POST ID FB',
  brand: 'BRAND TAP IN', catatan: 'CATATAN', eventId: 'EVENT ID'
};
const REQUIRED = ['tanggal', 'judul'];
// EVENT ID punya script Google Calendar Sync — cuma dibaca, gak bisa diubah dari app.
const READONLY = ['eventId'];
const JAM_KEYS = ['jamYT', 'jamIG', 'jamTT', 'jamFB']; // disimpan sebagai TEKS ("21.15"), bukan angka
const MULTI_KEYS = ['segmen', 'brand'];

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
    if (body.action === 'updateRow') return updateRow_(body);
    throw err_('BAD_REQUEST', 'action tidak dikenal');
  });
}

// ---------- peta kolom ----------

// { key: index kolom 0-based } dari header baris 1. Key yang header-nya gak ada di sheet dilewati.
function colMap_(sh) {
  const lastCol = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim().toUpperCase(); });
  const map = { _width: lastCol };
  Object.keys(FIELDS).forEach(function (k) {
    const i = head.indexOf(FIELDS[k]);
    if (i !== -1) map[k] = i;
  });
  REQUIRED.forEach(function (k) {
    if (map[k] == null) throw err_('SETUP', 'Kolom "' + FIELDS[k] + '" tidak ditemukan di header ' + TAB);
  });
  return map;
}

function pick_(arr, map, k) { return map[k] == null ? '' : arr[map[k]]; }

// ---------- actions ----------

function list_(from, to) {
  const f = parseIso_(from), t = parseIso_(to);
  if (!f || !t || t < f) throw err_('BAD_REQUEST', 'from/to harus YYYY-MM-DD');
  if ((t - f) / 86400000 > MAX_RANGE_DAYS) throw err_('BAD_REQUEST', 'Rentang maksimal ' + MAX_RANGE_DAYS + ' hari');

  const sh = sheet_();
  const map = colMap_(sh);
  const n = sh.getLastRow() - 1;
  if (n < 1) return { ok: true, rows: [], fields: fieldList_(map), options: {} };
  const rng = sh.getRange(2, 1, n, map._width);
  const raw = rng.getValues();
  const disp = rng.getDisplayValues();
  const rows = [];
  for (let i = 0; i < n; i++) {
    const date = cellDate_(pick_(raw[i], map, 'tanggal'), pick_(disp[i], map, 'tanggal'));
    if (!date || date < from || date > to) continue;
    if (!String(pick_(disp[i], map, 'judul')).trim()) continue;
    rows.push(rowObj_(i + 2, raw[i], disp[i], map));
  }
  return { ok: true, rows: rows, fields: fieldList_(map), options: options_(sh, map), generatedAt: new Date().toISOString() };
}

// Field yang beneran ada di sheet sekarang (dashboard.js cuma nampilin ini).
function fieldList_(map) { return Object.keys(FIELDS).filter(function (k) { return map[k] != null; }); }

// Satu baris -> objek untuk dashboard.js. `f` = semua field (teks tampilan), key-nya sesuai FIELDS.
function rowObj_(rowNum, raw, d, map) {
  const f = {};
  Object.keys(FIELDS).forEach(function (k) { if (map[k] != null) f[k] = String(d[map[k]]); });
  return {
    row: rowNum, date: cellDate_(pick_(raw, map, 'tanggal'), pick_(d, map, 'tanggal')),
    title: String(pick_(d, map, 'judul')).trim(), akun: f.akun || '', segmen: f.segmen || '',
    jamYT: f.jamYT || '', jamIG: f.jamIG || '', jamTT: f.jamTT || '', jenis: f.jenis || '',
    producer: f.producer || '', designer: f.designer || '', editor: f.editor || '',
    production: prodMark_(pick_(raw, map, 'production'), f.production),
    statusYT: f.statusYT || '', statusIG: f.statusIG || '', statusTT: f.statusTT || '', catatan: f.catatan || '',
    f: f
  };
}

// Pilihan dropdown tiap field, dari data validation baris terakhir sheet.
// Format: { key: { values: [...], multi: bool } }
function options_(sh, map) {
  const out = {};
  const dvs = sh.getRange(sh.getLastRow(), 1, 1, map._width).getDataValidations()[0];
  Object.keys(FIELDS).forEach(function (k) {
    if (map[k] == null) return;
    const dv = dvs[map[k]];
    if (!dv || dv.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) return;
    out[k] = { values: (dv.getCriteriaValues()[0] || []).map(String), multi: MULTI_KEYS.indexOf(k) !== -1 };
  });
  return out;
}

// Pastikan baris `row` masih konten yang sama (judul + tanggal) sebelum nulis.
function cekIdentitas_(sh, map, row, title, date) {
  const r = sh.getRange(row, 1, 1, map._width);
  const v = r.getValues()[0], dv = r.getDisplayValues()[0];
  if (String(pick_(dv, map, 'judul')).trim() !== String(title || '').trim() ||
      cellDate_(pick_(v, map, 'tanggal'), pick_(dv, map, 'tanggal')) !== date) {
    throw err_('ROW_MOVED', 'Baris di sheet sudah berubah, refresh dulu');
  }
}

// Edit satu baris. body: { row, title, date (identitas lama), changes: { key: "nilai" } }
function updateRow_(b) {
  const row = Number(b.row);
  const changes = b.changes || {};
  const keys = Object.keys(changes);
  if (!row || row < 2) throw err_('BAD_REQUEST', 'row tidak valid');
  if (!keys.length) throw err_('BAD_REQUEST', 'Tidak ada perubahan');
  keys.forEach(function (k) {
    if (!FIELDS[k] || READONLY.indexOf(k) !== -1) throw err_('BAD_REQUEST', 'Field ' + k + ' tidak boleh diubah');
  });
  if (changes.tanggal != null && !parseIso_(changes.tanggal)) throw err_('BAD_REQUEST', 'Tanggal harus YYYY-MM-DD');
  if (changes.judul != null && !String(changes.judul).trim()) throw err_('BAD_REQUEST', 'Judul tidak boleh kosong');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw err_('BUSY', 'Lagi ada yang nyimpen, coba lagi');
  try {
    const sh = sheet_();
    const map = colMap_(sh);
    keys.forEach(function (k) { if (map[k] == null) throw err_('BAD_REQUEST', 'Kolom ' + FIELDS[k] + ' sudah tidak ada di sheet'); });
    cekIdentitas_(sh, map, row, b.title, b.date);
    keys.forEach(function (k) {
      const val = String(changes[k] == null ? '' : changes[k]);
      const cell = sh.getRange(row, map[k] + 1);
      if (k === 'tanggal') cell.setValue(Utilities.parseDate(val, TZ, 'yyyy-MM-dd')); // tengah malam WIB
      else if (JAM_KEYS.indexOf(k) !== -1 && val !== '') cell.setValue("'" + val);    // paksa teks
      else cell.setValue(val);
    });
    SpreadsheetApp.flush();
    const rng = sh.getRange(row, 1, 1, map._width);
    return { ok: true, row: rowObj_(row, rng.getValues()[0], rng.getDisplayValues()[0], map) };
  } finally {
    lock.releaseLock();
  }
}

function setStatus_(b) {
  const row = Number(b.row);
  const key = 'status' + String(b.platform || '');
  const value = String(b.value == null ? '' : b.value);
  if (!row || row < 2 || ['statusYT', 'statusIG', 'statusTT'].indexOf(key) === -1) throw err_('BAD_REQUEST', 'row/platform tidak valid');
  if (STATUS_OPTS.indexOf(value) === -1) throw err_('BAD_REQUEST', 'Status tidak valid');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw err_('BUSY', 'Lagi ada yang nyimpen, coba lagi');
  try {
    const sh = sheet_();
    const map = colMap_(sh);
    if (map[key] == null) throw err_('SETUP', 'Kolom ' + FIELDS[key] + ' tidak ditemukan');
    cekIdentitas_(sh, map, row, b.title, b.date);
    sh.getRange(row, map[key] + 1).setValue(value);
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
// Kolom PRODUCTION = dropdown ✅ / ❌ (jaga-jaga juga kalau suatu saat jadi checkbox).
// Balikin 'done' (✅ / centang), 'no' (❌), atau '' (kosong). Cuma 'done' = beres.
function prodMark_(v, disp) {
  if (v === true) return 'done';
  if (v === false) return '';
  const s = String(disp == null ? '' : disp).trim();
  if (!s) return '';
  if (s.indexOf('✅') !== -1 || s.indexOf('✔') !== -1 || s.indexOf('✓') !== -1 || s.toUpperCase() === 'TRUE') return 'done';
  return 'no';
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
