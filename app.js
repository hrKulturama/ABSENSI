// URL dasar Apps Script (TANPA query string di sini, query ditambahkan saat fetch)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxDjfUyqGAaSfJxBHZ2ULgXyttVSgTJFBt9D8KF6m-wvbcNEzEbol9DbtzzPoxMXP79/exec';

// Backend baru (Vercel + Sheets API langsung, skip lapisan eksekusi Apps
// Script). TAHAP 2 migrasi: baru getKaryawan/getProfil/getAbsensi/getLeaderboard
// yang dialihkan ke sini (udah diverifikasi paralel identik dengan Apps
// Script) — endpoint lain (submit absensi, login, payroll, dll) TETAP di
// SCRIPT_URL sampai tahap migrasinya masing-masing selesai & diverifikasi.
const VERCEL_BACKEND_URL = 'https://absensi-backend-ruby.vercel.app/api';

// Kode QR resmi kantor. HARUS sama persis dengan VALID_QR_CODE di Code.gs,
// dipakai untuk validasi instan di HP begitu QR selesai discan (sebelum lanjut ke step lokasi/foto).
const VALID_QR_CODE = 'MABES-SHOEPOLICE';

const GREETINGS = [
  { text: "Di era AI kayak sekarang, yang paling dibutuhin tetep manusia yang konsisten. Lo salah satunya! 💪", emoji: "🤖" },
  { text: "Inflasi boleh naik, tapi semangat lo jangan ikut-ikutan. Tetap gas hari ini!", emoji: "📈" },
  { text: "Dunia lagi berubah cepet banget — yang adaptif yang survive. Lo udah di sini, itu udah langkah pertama!", emoji: "🌍" },
  { text: "Remote work atau onsite, yang penting effort-nya nyata. Hadir hari ini = bukti lo serius!", emoji: "💻" },
  { text: "Di tengah ketidakpastian ekonomi global, orang yang tetap produktif adalah yang paling kuat!", emoji: "🌐" },
  { text: "Teknologi terus maju, tapi attitude yang bagus gak bisa digantiin robot manapun!", emoji: "🦾" },
  { text: "Social media penuh drama, tapi lo pilih fokus kerja. Itu class tersendiri!", emoji: "📵" },
  { text: "Mental health itu penting. Hadir hari ini = jaga diri = investasi jangka panjang!", emoji: "🧠" },
  { text: "Kreator konten lagi booming, tapi foundasi-nya tetap disiplin. Kayak lo!", emoji: "🎬" },
  { text: "Kolaborasi antar manusia tetap jadi kunci di era otomasi. Semangat kerja tim!", emoji: "🤝" },
  { text: "Hustle culture makin ke sini makin sadar: konsistensi > intensitas!", emoji: "⚡" },
  { text: "Sustainability bukan cuma soal lingkungan, tapi juga soal energi lo sehari-hari. Jaga ritme!", emoji: "♻️" },
  { text: "Di zaman scrolling tanpa henti, kemampuan buat fokus itu superpower. Lo lagi melatihnya!", emoji: "🎯" },
  { text: "Ekonomi kreatif Indonesia lagi naik daun — dan lo bagian dari ekosistemnya!", emoji: "🇮🇩" },
  { text: "Gak semua orang bisa bangun pagi dan langsung bergerak. Lo bisa — itu beda!", emoji: "🌅" },
  { text: "Digitalisasi lagi nge-push semua sektor — termasuk dunia kerja lo. Stay relevant!", emoji: "📱" },
  { text: "Dunia pasca pandemi ngajarin satu hal: yang flexible yang bertahan. Lo udah buktiin itu!", emoji: "🌱" },
  { text: "Skill gap lagi jadi isu global, tapi orang yang mau hadir dan belajar gak akan pernah ketinggalan!", emoji: "📚" },
  { text: "Kepercayaan dibangun dari hal kecil — dan absen tepat waktu adalah salah satunya!", emoji: "🔑" },
  { text: "Gen Z udah reshape dunia kerja. Lebih authentic, lebih impact-driven. Lo terlahir di era yang tepat!", emoji: "✨" },
  { text: "Di era information overload, orang yang bisa eksekusi itu langka. Jadilah yang langka!", emoji: "💎" },
  { text: "Supply chain global lagi volatile, tapi semangat kerja lo gak perlu ikut fluktuasi!", emoji: "📦" },
  { text: "Yang genuine yang bertahan — termasuk soal etos kerja!", emoji: "🌿" },
  { text: "Side hustle lagi ngetrend, tapi main job tetap pondasi utama. Jaga yang ini dulu!", emoji: "🏗️" },
  { text: "Semua butuh disiplin yang sama. Sip, lo udah on track!", emoji: "🎯" },
  { text: "Wellbeing di tempat kerja jadi prioritas global. Lo hadir hari ini — itu bentuk self-respect!", emoji: "❤️" },
  { text: "Bulan ini masih panjang, tapi setiap hari yang lo isi itu ngumpulin poin kemenangan kecil!", emoji: "🏆" },
  { text: "Global talent competition semakin ketat, tapi yang paling dicari tetap: yang bisa diandalkan!", emoji: "🌟" },
  { text: "Harga-harga naik tapi harga dirimu jangan turun. Tetap kerja keras!", emoji: "💪" },
  { text: "Dunia kerja hybrid udah jadi normal baru — yang penting output-nya. Dan lo udah mulai!", emoji: "🖥️" },
  { text: "Leadership bukan soal jabatan, tapi soal konsistensi. Dan lo lagi ngebuktiin itu sekarang!", emoji: "👑" },
];

// Icon per jenis absen, dipakai di kartu Riwayat Absensi
const JENIS_ICON = {
  'Absen Masuk': '🟢',
  'Absen Pulang': '🔴',
  'Ijin dari Kantor': '📝',
  'Dinas Lapangan dari Rumah': '🚗',
  'Ijin dari Rumah': '📝',
  'Pulang dari Luar': '🔚',
  'Sakit': '🤒'
};

// STATE
let nama = '';
let jenisAbsen = '', butuhQr = false, butuhKeterangan = false, isSakit = false;
let keterangan = '', screenshotBase64 = '', qrResult = '';
let latitude = '', longitude = '', photoBase64 = '';
let stream = null, html5QrCode = null;
let absensiCache = null;
let chartInstance = null;

// Status absen HARI INI milik user yang lagi login — dipakai buat nyoroti
// tombol yang disarankan & buat pop-up konfirmasi kalau pilihannya kelihatan
// gak masuk akal (misal Absen Masuk lagi padahal tadi udah, atau Absen Pulang
// padahal belum pernah Absen Masuk hari ini).
let statusAbsenHariIni = { hasMasuk: false, hasPulang: false, hasDinas: false, masukRow: null, pulangRow: null };
let sudahAbsenHariIni = false; // status absen hari ini, dipakai buat auto-hide card countdown

// ===== LAZY-LOAD LIBRARY EKSTERNAL =====
// html5-qrcode & chart.js sengaja gak dimuat di index.html lagi (lihat komentar
// di sana) — dimuat di sini, on-demand, cuma pas fiturnya beneran dipakai.
const HTML5_QRCODE_URL = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
const _loadedScripts = new Set();

function loadScriptOnce(url) {
  if (_loadedScripts.has(url)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => { _loadedScripts.add(url); resolve(); };
    s.onerror = () => reject(new Error('Gagal memuat library: ' + url));
    document.head.appendChild(s);
  });
}

// Restart animasi CSS di suatu elemen. CSS animation gak otomatis ulang cuma
// karena isi/teks elemennya diganti — perlu dicabut classnya, paksa reflow
// (baca offsetWidth), baru dipasang lagi.
function restartAnimasi(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}


function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
}
function getWaktu() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat Pagi ☀️';
  if (h < 15) return 'Selamat Siang 🌤️';
  if (h < 18) return 'Selamat Sore 🌇';
  return 'Selamat Malam 🌙';
}
function isLambat(jam, menit) {
  return jam > 8 || (jam === 8 && menit > 5);
}

// NAV
function goPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  const navEl = document.getElementById('nav-' + page);
  if (navEl) navEl.classList.add('active'); // page-absen sengaja gak punya tombol nav lagi
  if (page === 'home') renderHome();
  if (page === 'absen') initAbsenPage();
  if (page === 'leaderboard') renderLeaderboard();
  if (page === 'profil') renderProfil();
  window.scrollTo(0, 0);
}

// ===== SLIP GAJI SAYA (buat semua karyawan, bukan cuma HR) =====
function bukaSlipGajiSaya() {
  goPage('slip-gaji');
  initSlipGajiFilter();
  loadSlipGajiSaya();
}

function initSlipGajiFilter() {
  const selBulan = document.getElementById('sgBulan');
  const inputTahun = document.getElementById('sgTahun');
  if (selBulan.options.length === 0) {
    HR_BULAN_NAMES.forEach((nm, idx) => {
      const opt = document.createElement('option');
      opt.value = idx + 1;
      opt.textContent = nm;
      selBulan.appendChild(opt);
    });
  }
  const now = new Date();
  if (!selBulan.value) selBulan.value = now.getMonth() + 1;
  if (!inputTahun.value) inputTahun.value = now.getFullYear();
}

async function loadSlipGajiSaya() {
  const loading = document.getElementById('sgLoadingBox');
  const errBox = document.getElementById('sgErrorBox');
  const content = document.getElementById('sgContent');
  loading.style.display = 'block';
  errBox.innerHTML = '';
  content.style.display = 'none';

  const month = document.getElementById('sgBulan').value;
  const year = document.getElementById('sgTahun').value;

  try {
    // Nama TIDAK dikirim di URL — server ambil dari token sendiri, jadi gak
    // ada cara buat minta lihat gaji orang lain walau parameter-nya diutak-atik.
    const url = VERCEL_BACKEND_URL + '/getPayroll?month=' + month + '&year=' + year + '&token=' + encodeURIComponent(getToken());
    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();
    loading.style.display = 'none';

    if (data.code === 'UNAUTHORIZED') { sesiHabis(); return; }

    if (data.result !== 'success') {
      errBox.innerHTML = '<div class="status-box status-fail">⚠️ ' + escapeHtml(data.message || 'Belum ada data gaji buat bulan ini.') + '</div>';
      return;
    }

    document.getElementById('sgGajiPokok').textContent = fmtRupiah(data.gajiPokok);
    document.getElementById('sgTunjanganTetap').textContent = fmtRupiah(data.tunjanganTetap);
    document.getElementById('sgSkorLabel').textContent = 'Skor rata-rata (' + data.jumlahHariAbsen + ' hari absen)';
    document.getElementById('sgSkor').textContent = data.skorRataRata;
    document.getElementById('sgTunjanganKehadiran').textContent = fmtRupiah(data.tunjanganKehadiranAktual) + ' / ' + fmtRupiah(data.tunjanganKehadiranDasar);
    document.getElementById('sgJamLembur').textContent = data.totalJamLembur + ' jam';
    document.getElementById('sgTotalLembur').textContent = fmtRupiah(data.totalLembur);
    document.getElementById('sgTotalGaji').textContent = fmtRupiah(data.totalGaji);
    document.getElementById('sgCatatan').textContent = data.catatan || '';
    document.getElementById('sgPdfStatus').innerHTML = '';
    content.style.display = 'block';
  } catch (e) {
    loading.style.display = 'none';
    errBox.innerHTML = '<div class="status-box status-fail">⚠️ Gagal koneksi ke server.</div>';
  }
}

async function unduhSlipGajiSaya() {
  const statusBox = document.getElementById('sgPdfStatus');
  const month = document.getElementById('sgBulan').value;
  const year = document.getElementById('sgTahun').value;
  statusBox.innerHTML = '<div class="status-box status-ok"><span class="spinner-inline"></span>Membuat PDF...</div>';

  try {
    // Sama kayak di atas — nama gak dikirim, diambil dari token sendiri di server.
    const url = VERCEL_BACKEND_URL + '/getSlipGajiPdf?month=' + month + '&year=' + year + '&token=' + encodeURIComponent(getToken());
    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();

    if (data.code === 'UNAUTHORIZED') { sesiHabis(); return; }

    if (data.result !== 'success') {
      statusBox.innerHTML = '<div class="status-box status-fail">⚠️ ' + escapeHtml(data.message || 'Gagal bikin PDF') + '</div>';
      return;
    }

    const byteChars = atob(data.base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = data.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    statusBox.innerHTML = '<div class="status-box status-ok">✅ PDF terunduh</div>';
  } catch (e) {
    statusBox.innerHTML = '<div class="status-box status-fail">⚠️ Gagal koneksi ke server.</div>';
  }
}

// Masuk ke "Mode HR" DI DALAM app ini (bukan pindah ke file hr.html lagi).
// HR key + token dari server tetap jadi lapisan keamanan beneran; ini cuma jalan pintas.
function masukModeHR() {
  hrEnsureInit();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-hr-root').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  window.scrollTo(0, 0);

  // Akun ber-role "hr" langsung masuk; yang lain tetap lewat gerbang HR key.
  // Server tetap memeriksa ulang tokennya di tiap permintaan data.
  if (tokenHR()) {
    hrGoPage('home');
    hrLoadToday();
    hrLoadRekap();
  } else {
    hrGoPage('gate');
  }
}

// Keluar dari Mode HR, balik ke tab Profil biasa
function keluarModeHR() {
  goPage('profil');
}

// ===== Nav Profil: 1x klik = ke halaman Profil, 3x klik cepat (<600ms) = masuk Mode HR =====
// Sengaja gak ada indikator visual apa pun di UI (biar HR key + token yang jadi lapisan
// keamanan beneran, ini cuma jalan pintas biar HR gak perlu ngetik/inget URL terpisah).
(function setupNavProfilTripleTap() {
  const el = document.getElementById('nav-profil');
  const TAP_WINDOW_MS = 600;
  let tapCount = 0;
  let resetTimer = null;

  el.addEventListener('click', () => {
    tapCount++;
    clearTimeout(resetTimer);

    if (tapCount >= 3) {
      tapCount = 0;
      if (navigator.vibrate) navigator.vibrate(30);
      masukModeHR();
      return;
    }

    // Tunggu sebentar, siapa tau ada klik berikutnya nyusul (jadi bagian dari triple tap).
    // Kalau gak ada, baru dianggap klik tunggal biasa -> pindah ke Profil.
    resetTimer = setTimeout(() => {
      tapCount = 0;
      goPage('profil');
    }, TAP_WINDOW_MS);
  });
})();

// =====================================================================
// ===== SESI: token, nama, role =======================================
// =====================================================================
// PIN sekarang diverifikasi di SERVER. Yang disimpan di HP cuma token
// hasil login (berlaku 12 jam), bukan PIN-nya. Jadi nama di dropdown
// gak bisa lagi dipakai buat "jadi" orang lain.

function getToken() { return localStorage.getItem('absensi_token') || ''; }
function getRole()  { return localStorage.getItem('absensi_role')  || ''; }

function simpanSesi(data) {
  localStorage.setItem('absensi_token', data.token);
  localStorage.setItem('absensi_nama', data.nama);
  localStorage.setItem('absensi_role', data.role || '');
  nama = data.nama;

  // Mulai narik data Home DI SINI JUGA, sebelum gerbang PIN ketutup dan
  // sebelum renderHome() sempet dipanggil — bukan nunggu Home kebuka baru
  // mulai fetch. Begitu Home beneran kebuka, fetchAbsensi/fetchLeaderboard
  // (yang udah dikasih pengaman anti-dobel-panggil di atas) tinggal numpang
  // ke request yang udah/lagi jalan ini, gak mulai dari nol lagi.
  const now = new Date();
  fetchAbsensi(nama, now.getMonth() + 1, now.getFullYear());
  fetchLeaderboard();
}

function hapusSesi() {
  localStorage.removeItem('absensi_token');
  localStorage.removeItem('absensi_role');
  sessionStorage.removeItem('app_gate_unlocked');
}

// Dipanggil kalau server bilang token gak berlaku lagi (kadaluarsa / PIN direset HR).
function sesiHabis() {
  hapusSesi();
  absensiCache = null;
  leaderboardCache = null;
  cekAppGate();
}

// Pembungkus fetch GET: token ikut otomatis, sesi habis ketahuan otomatis.
async function apiGet(action, params) {
  let url = SCRIPT_URL + '?action=' + action + '&token=' + encodeURIComponent(getToken());
  for (const k in (params || {})) {
    url += '&' + k + '=' + encodeURIComponent(params[k]);
  }
  const res = await fetch(url);
  const data = await res.json();
  if (data.code === 'UNAUTHORIZED') { sesiHabis(); throw new Error('Sesi habis'); }
  return data;
}

async function apiPost(body) {
  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  return res.json();
}


// =====================================================================
// ===== APP GATE (wajib login/daftar dulu begitu app dibuka) ==========
// =====================================================================
// Nge-gate SELURUH app (Home/Papan/Profil ikut kekunci). Setelah PIN benar,
// statusnya disimpan di sessionStorage — gak perlu login ulang tiap pindah
// tab, tapi wajib login lagi kalau app ditutup & dibuka ulang.

let daftarNamaCache = null;

// Ambil daftar nama dari server buat isi dropdown (belum butuh token).
async function muatDaftarNama() {
  const sel = document.getElementById('gateNamaSelect');
  try {
    const res = await fetch(VERCEL_BACKEND_URL + '/getKaryawan');
    const data = await res.json();
    if (data.result !== 'success') throw new Error(data.message);

    daftarNamaCache = data.data;
    sel.innerHTML = '<option value="">— Pilih nama —</option>';
    data.data.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k.nama;
      // Nama yang sudah dipakai orang lain ditandai, biar gak salah pilih.
      opt.textContent = k.nama + (k.terdaftar ? ' (sudah terdaftar)' : '');
      opt.disabled = k.terdaftar;
      sel.appendChild(opt);
    });
  } catch (err) {
    sel.innerHTML = '<option value="">Gagal memuat — cek koneksi</option>';
    document.getElementById('gateRegisterErrorBox').innerHTML =
      '<div class="status-box status-fail">Tidak bisa menghubungi server. Cek koneksi internet, lalu buka ulang app.</div>';
  }
}

function cekAppGate() {
  const gate = document.getElementById('appGate');
  const savedNama = localStorage.getItem('absensi_nama');
  const sudahUnlock = sessionStorage.getItem('app_gate_unlocked') === '1';

  // Sudah login di sesi ini DAN token masih tersimpan -> lewat.
  if (sudahUnlock && getToken()) {
    gate.classList.remove('active');
    return;
  }

  gate.classList.add('active');
  document.getElementById('gateRegisterErrorBox').innerHTML = '';
  document.getElementById('gateLoginErrorBox').innerHTML = '';

  if (savedNama) {
    tampilkanKartuLogin(savedNama);
  } else {
    tampilkanKartuDaftar();
  }
}

function tampilkanKartuLogin(namaTersimpan) {
  document.getElementById('gateCardLogin').style.display = 'block';
  document.getElementById('gateCardRegister').style.display = 'none';
  document.getElementById('gateWelcomeText').textContent = 'Selamat datang, ' + namaTersimpan + '! 👋';
  document.getElementById('gatePinLogin').value = '';
}

function tampilkanKartuDaftar() {
  document.getElementById('gateCardRegister').style.display = 'block';
  document.getElementById('gateCardLogin').style.display = 'none';
  if (!daftarNamaCache) muatDaftarNama();
}

function bukaGerbangApp() {
  sessionStorage.setItem('app_gate_unlocked', '1');
  document.getElementById('appGate').classList.remove('active');
  terapkanRoleKeUI();
}

// --- DAFTAR: set PIN pertama kali (PIN dikirim ke server, disimpan sebagai hash) ---
async function gateDaftarDevice() {
  const btn = event && event.target ? event.target : null;
  const namaPilih = document.getElementById('gateNamaSelect').value;
  const pin1 = document.getElementById('gatePinSetup1').value.trim();
  const pin2 = document.getElementById('gatePinSetup2').value.trim();
  const err = document.getElementById('gateRegisterErrorBox');
  err.innerHTML = '';

  if (!namaPilih) { err.innerHTML = '<div class="status-box status-fail">Pilih nama dulu</div>'; return; }
  if (!/^\d{4}$/.test(pin1)) { err.innerHTML = '<div class="status-box status-fail">PIN harus 4 digit angka</div>'; return; }
  if (pin1 !== pin2) { err.innerHTML = '<div class="status-box status-fail">PIN tidak cocok</div>'; return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Mendaftarkan…'; }
  try {
    const data = await apiPost({ action: 'daftar', nama: namaPilih, pin: pin1 });
    if (data.result !== 'success') {
      err.innerHTML = '<div class="status-box status-fail">' + escapeHtml(data.message) + '</div>';
      return;
    }
    simpanSesi(data);
    bukaGerbangApp();
    renderHome();
  } catch (e) {
    err.innerHTML = '<div class="status-box status-fail">Gagal menghubungi server. Cek koneksi internet.</div>';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Daftarkan HP Ini'; }
  }
}

// --- LOGIN: PIN dicek di server, dapat token baru ---
async function gateVerifikasiPin() {
  const btn = event && event.target ? event.target : null;
  const pinInput = document.getElementById('gatePinLogin').value.trim();
  const savedNama = localStorage.getItem('absensi_nama');
  const err = document.getElementById('gateLoginErrorBox');
  err.innerHTML = '';

  if (!/^\d{4}$/.test(pinInput)) { err.innerHTML = '<div class="status-box status-fail">PIN harus 4 digit angka</div>'; return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Memeriksa…'; }
  try {
    const data = await apiPost({ action: 'login', nama: savedNama, pin: pinInput });

    if (data.result !== 'success') {
      // PIN direset HR -> arahkan ke form daftar ulang
      if (data.message === 'BELUM_DAFTAR') {
        localStorage.removeItem('absensi_nama');
        daftarNamaCache = null;
        tampilkanKartuDaftar();
        document.getElementById('gateRegisterErrorBox').innerHTML =
          '<div class="status-box status-fail">PIN kamu sudah direset HR. Silakan pilih nama dan buat PIN baru.</div>';
        return;
      }
      err.innerHTML = '<div class="status-box status-fail">' + escapeHtml(data.message) + '</div>';
      return;
    }

    simpanSesi(data);
    bukaGerbangApp();
    renderHome();
  } catch (e) {
    err.innerHTML = '<div class="status-box status-fail">Gagal menghubungi server. Cek koneksi internet.</div>';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
  }
}


// =====================================================================
// ===== MENU KHUSUS ROLE ==============================================
// =====================================================================
// Kartu menu role cuma muncul kalau role-nya cocok. Ini soal TAMPILAN —
// pengamanan sebenarnya tetap di server (setiap endpoint role dicek ulang
// pakai token), jadi menu yang disembunyikan bukan satu-satunya penghalang.

// Halaman Kreatif dilayani dari folder terpisah di domain yang sama.
// Karena satu domain, token login tetap terbaca di sana.
// Kreatif & Produksi sekarang satu folder sama app ini — otomatis masuk
// cakupan PWA yang ke-install, gak ada lagi resiko "kelempar" ke browser.
const MENU_ROLE = {
  kreatif:  { emoji: '🎨', judul: 'Report Kreatif',  sub: 'Insight platform & progres konten harian', file: 'kreatif.html' },
  produksi: { emoji: '🏭', judul: 'Report Produksi', sub: 'Isi dan lihat laporan tugas tim Produksi', file: 'produksi.html' }
};

function terapkanRoleKeUI() {
  const wrap = document.getElementById('roleMenuWrap');
  if (!wrap) return;

  const role = getRole();
  wrap.innerHTML = '';

  // HR bisa masuk ke semua menu role; role lain cuma menunya sendiri.
  // HR & admin = superuser, lihat semua menu role. Yang lain cuma menunya sendiri.
  const boleh = isSuperuserRole(role) ? Object.keys(MENU_ROLE) : (MENU_ROLE[role] ? [role] : []);
  if (!boleh.length) return;

  boleh.forEach(r => {
    const m = MENU_ROLE[r];
    const el = document.createElement('div');
    el.className = 'action-card mint';
    el.onclick = () => { window.location.href = m.file; };
    el.innerHTML =
      '<div class="action-card-title">' + m.judul + '</div>' +
      '<div class="action-card-sub">' + m.sub + '</div>' +
      '<div class="action-card-emoji">' + m.emoji + '</div>';
    wrap.appendChild(el);
  });
}


// INIT
window.addEventListener('DOMContentLoaded', () => {
  nama = localStorage.getItem('absensi_nama') || '';
  cekAppGate();
  terapkanRoleKeUI();
  updateCountdownCard();
  renderHome();
  initAbsenPage();
});

// ===== HOME (+ KALENDER) =====
async function renderHome() {
  nama = localStorage.getItem('absensi_nama') || '';
  const now = new Date();
  const dayIndex = now.getDate() - 1;
  const nameHash = nama ? hashString(nama) : 0;
  const g = GREETINGS[(dayIndex + nameHash) % GREETINGS.length];
  document.getElementById('greetingWaktu').textContent = getWaktu();
  document.getElementById('greetingNama').textContent = (nama ? 'Hei, ' + nama + '! ' : 'Hei! ') + g.emoji;
  document.getElementById('greetingText').textContent = g.text;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  document.getElementById('countdownNum').textContent = lastDay - now.getDate();
  renderDateScroll();

  // renderHomeRank & renderHomeCalendar masing-masing manggil endpoint BEDA
  // (leaderboard vs absensi), gak saling butuh data satu sama lain. Sebelumnya
  // ditulis satu-satu (await; await; baru panggil rank) jadi network request-nya
  // gantian nunggu padahal bisa bareng — di sini sengaja distart duluan sebelum
  // di-await, biar dua-duanya jalan paralel.
  const rankPromise = renderHomeRank();
  await renderHomeCalendar();
  await renderTodayAbsen();
  await rankPromise;

  const savedFoto = localStorage.getItem('absensi_foto');
  const badgeAvatar = document.querySelector('.badge-circle');
  if (badgeAvatar) badgeAvatar.innerHTML = savedFoto ? '<img src="' + savedFoto + '">' : '👤';
}

function renderDateScroll() {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth(), today = now.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  const container = document.getElementById('dateScroll');
  container.innerHTML = '';
  for (let d = 1; d <= lastDay; d++) {
    const isToday = d === today;
    const el = document.createElement('div');
    el.className = 'date-item' + (isToday ? ' today' : '');
    el.innerHTML = `<span class="day-name">${dayNames[new Date(year,month,d).getDay()]}</span><span class="day-num">${d}</span>`;
    container.appendChild(el);
    if (isToday) setTimeout(() => el.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'start' }), 100);
  }
}

function fmtJam(jam, menit) {
  return String(jam).padStart(2, '0') + ':' + String(menit).padStart(2, '0');
}

// Countdown ke batas absen 08:05, Senin-Sabtu. Minggu disembunyikan.
// Auto-hide juga kalau: user sudah absen apapun hari ini, ATAU sekarang sudah >= 10:00.
function updateCountdownCard() {
  const card = document.getElementById('countdownAbsenCard');
  if (!card) return;
  const now = new Date();
  const day = now.getDay(); // 0 = Minggu

  const batasFitur = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0); // batas fitur 10:00

  // sembunyikan kalau hari Minggu, user udah absen hari ini, atau udah lewat jam 10:00
  if (day === 0 || sudahAbsenHariIni || now >= batasFitur) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  const label = document.getElementById('countdownAbsenLabel');
  const timeEl = document.getElementById('countdownAbsenTime');
  const deadline = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 5, 0);
  const diff = deadline - now;

  if (diff <= 0) {
    card.classList.add('countdown-late');
    label.textContent = 'Batas absen masuk (08:05)';
    timeEl.textContent = '⚠️ Sudah lewat batas';
  } else {
    card.classList.remove('countdown-late');
    const totalSec = Math.floor(diff / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    label.textContent = 'Sisa waktu sebelum batas absen (08:05)';
    timeEl.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
}
setInterval(updateCountdownCard, 1000);

// Ringkasan absen pertama & terakhir hari ini
async function renderTodayAbsen() {
  const wrap = document.getElementById('todaySummaryWrap');
  if (!nama) {
    wrap.style.display = 'none';
    sudahAbsenHariIni = false;
    updateCountdownCard();
    return;
  }
  wrap.style.display = 'flex';

  const now = new Date();
  const absensi = await fetchAbsensi(nama, now.getMonth() + 1, now.getFullYear());
  const todayRows = absensi
    .filter(r => r.tanggal === now.getDate())
    .slice()
    .sort((a, b) => (a.jam !== b.jam ? a.jam - b.jam : a.menit - b.menit));

  const masukEl = document.getElementById('todayMasukJam');
  const pulangEl = document.getElementById('todayPulangJam');

  sudahAbsenHariIni = todayRows.length > 0; // set status sebelum refresh card

  if (todayRows.length) {
    const first = todayRows[0];
    const last = todayRows[todayRows.length - 1];
    masukEl.textContent = fmtJam(first.jam, first.menit);
    pulangEl.textContent = todayRows.length > 1 ? fmtJam(last.jam, last.menit) : '--:--';
  } else {
    masukEl.textContent = '--:--';
    pulangEl.textContent = '--:--';
  }

  updateCountdownCard(); // refresh card countdown setelah tau status absen hari ini
}

async function renderHomeCalendar() {
  const now = new Date();
  const bulanNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  document.getElementById('calMonthLabel').textContent = bulanNames[now.getMonth()] + ' ' + now.getFullYear();
  document.getElementById('calNamaLabel').textContent = nama || '';

  // Render label hari
  const calDayLabels = document.getElementById('calDayLabels');
  calDayLabels.innerHTML = '';
  ['Min','Sen','Sel','Rab','Kam','Jum','Sab'].forEach(d => {
    const el = document.createElement('div'); el.className = 'cal-day-label'; el.textContent = d;
    calDayLabels.appendChild(el);
  });

  const calGrid = document.getElementById('calGrid');
  calGrid.innerHTML = '';

  if (!nama) return; // belum daftar HP, tampilkan kalender kosong

  document.getElementById('homeLoadingBox').style.display = 'block';
  const absensi = await fetchAbsensi(nama, now.getMonth() + 1, now.getFullYear());
  document.getElementById('homeLoadingBox').style.display = 'none';

  const absenDates = new Set(), lambatDates = new Set();
  absensi.forEach(row => {
    const tgl = row.tanggal, jenis = row.jenisAbsen, jam = row.jam, menit = row.menit;
    absenDates.add(tgl);
    if (jenis === 'Absen Masuk' && isLambat(jam, menit)) lambatDates.add(tgl);
  });

  const today = now.getDate(), year = now.getFullYear(), month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div'); el.className = 'cal-day empty'; el.textContent = ''; calGrid.appendChild(el);
  }
  for (let d = 1; d <= lastDay; d++) {
    const el = document.createElement('div');
    let cls = 'cal-day';
    if (d < today) cls += ' past';
    else if (d === today) cls += ' today';
    else cls += ' future';
    if (absenDates.has(d)) cls += ' has-absen';
    if (lambatDates.has(d)) cls += ' lambat';
    el.className = cls; el.textContent = d;
    calGrid.appendChild(el);
  }
}

// ABSEN
function initAbsenPage() {
  const savedNama = localStorage.getItem('absensi_nama');
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));

  // Kalau app-level gate udah unlock (PIN sudah diverifikasi pas buka app),
  // gak perlu minta PIN lagi di tab Absen — langsung ke pemilihan jenis absen.
  const sudahUnlock = sessionStorage.getItem('app_gate_unlocked') === '1';
  if (savedNama && sudahUnlock) {
    nama = savedNama;
    showAbsenStep(2);
    refreshStatusAbsenHariIni(); // async — nyorot tombol begitu data hari ini kebaca
    return;
  }

  if (savedNama) {
    nama = savedNama;
    document.getElementById('welcomeText').textContent = 'Selamat datang, ' + savedNama + '! 👋';
    document.getElementById('step1login').classList.add('active');
    document.getElementById('pinLogin').value = '';
    document.getElementById('loginErrorBox').innerHTML = '';
  } else {
    document.getElementById('step1register').classList.add('active');
  }
}
function showAbsenStep(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById('step' + id).classList.add('active');
}
// Login/daftar sekarang cuma ada SATU pintu: app gate di awal app.
// Dua fungsi ini dulu punya jalur PIN sendiri yang dicek di HP — itu sudah
// dicabut, karena PIN wajib diverifikasi server. Kalau step lama ini
// sempat kebuka, arahkan balik ke gate.
function daftarDevice() { cekAppGate(); }
function verifikasiPin() { cekAppGate(); }
function jamLabel(row) {
  return String(row.jam).padStart(2, '0') + ':' + String(row.menit).padStart(2, '0');
}

// Ambil ulang data absensi HARI INI (selalu fresh, gak pakai cache bulan lain)
// buat nentuin tombol mana yang disarankan & buat cek konflik pas milih jenis.
async function refreshStatusAbsenHariIni() {
  const now = new Date();
  // Dulu di sini ada 2 "absensiCache = null" (sebelum & sesudah fetch) buat
  // maksa selalu ambil data baru — itu yang bikin tab Absen diam-diam
  // ngehapus cache yang harusnya bisa dipakai bareng sama Profil/Leaderboard,
  // biang keladi kenapa pindah tab abis dari sini masih kerasa lag. Sekarang
  // dibiarin aja, cache TTL 60 detik udah cukup buat jaga kesegarannya —
  // dan begitu ada absen baru masuk, submitAbsensi tetap nge-null-in cache
  // secara eksplisit di titik yang beneran perlu.
  const rows = await fetchAbsensi(nama, now.getMonth() + 1, now.getFullYear());
  const todayRows = (rows || []).filter(r => r.tanggal === now.getDate());

  statusAbsenHariIni = {
    hasMasuk: todayRows.some(r => r.jenisAbsen === 'Absen Masuk'),
    hasPulang: todayRows.some(r => r.jenisAbsen === 'Absen Pulang'),
    hasDinas: todayRows.some(r => r.jenisAbsen === 'Dinas Lapangan dari Rumah'),
    masukRow: todayRows.find(r => r.jenisAbsen === 'Absen Masuk') || null,
    pulangRow: todayRows.find(r => r.jenisAbsen === 'Absen Pulang') || null
  };
  terapkanSaranJenisAbsen();
}

// Nyorot tombol yang paling masuk akal buat diklik. Ini cuma NUDGE VISUAL —
// tombol lain tetap aktif normal, biar tetap fleksibel buat kasus di luar
// kebiasaan (misal shift malam, atau emang perlu absen dua kali).
function terapkanSaranJenisAbsen() {
  const btnMasuk = document.getElementById('jenisBtnMasuk');
  const btnPulang = document.getElementById('jenisBtnPulang');
  if (!btnMasuk || !btnPulang) return;

  btnMasuk.classList.remove('disarankan');
  btnPulang.classList.remove('disarankan');

  if (!statusAbsenHariIni.hasMasuk && !statusAbsenHariIni.hasDinas) {
    btnMasuk.classList.add('disarankan');
  } else if (statusAbsenHariIni.hasMasuk && !statusAbsenHariIni.hasPulang) {
    btnPulang.classList.add('disarankan');
  }
}

// Chip "lagi ngapain" — dipasang di step QR/GPS/selfie biar keliatan terus,
// jadi kalau baru sadar salah pilih pas udah di tengah proses, masih bisa balik.
function updateJenisChip() {
  const icon = JENIS_ICON[jenisAbsen] || '📌';
  const html = `${icon} ${escapeHtml(jenisAbsen)} <span class="ganti-link" onclick="showAbsenStep(2)">Ganti</span>`;
  ['chipJenis2b', 'chipJenis2c', 'chipJenis3', 'chipJenis4', 'chipJenis5'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
  const selfieLabel = document.getElementById('selfieInfoText');
  if (selfieLabel) selfieLabel.textContent = 'Ambil foto selfie — ' + jenisAbsen;
}

function pilihJenis(jenis, perluQr, perluKeterangan, sakitMode) {
  // Cek konflik SEBELUM apa pun diubah — kalau user batal, state lama gak keganggu.
  if (jenis === 'Absen Masuk' && statusAbsenHariIni.hasMasuk) {
    const jamStr = statusAbsenHariIni.masukRow ? ' jam ' + jamLabel(statusAbsenHariIni.masukRow) : '';
    if (!confirm('Kamu sudah Absen Masuk hari ini' + jamStr + '.\n\nYakin mau Absen Masuk lagi?')) return;
  }
  if (jenis === 'Absen Pulang') {
    if (statusAbsenHariIni.hasPulang) {
      const jamStr = statusAbsenHariIni.pulangRow ? ' jam ' + jamLabel(statusAbsenHariIni.pulangRow) : '';
      if (!confirm('Kamu sudah Absen Pulang hari ini' + jamStr + '.\n\nYakin mau Absen Pulang lagi?')) return;
    } else if (!statusAbsenHariIni.hasMasuk && !statusAbsenHariIni.hasDinas) {
      if (!confirm('Kamu belum tercatat Absen Masuk hari ini.\n\nYakin mau Absen Pulang?')) return;
    }
  }

  jenisAbsen = jenis; butuhQr = perluQr; butuhKeterangan = perluKeterangan; isSakit = sakitMode;
  screenshotBase64 = ''; keterangan = '';
  document.getElementById('keteranganInput').value = '';
  document.getElementById('keteranganErrorBox').innerHTML = '';
  document.getElementById('uploadErrorBox').innerHTML = '';
  document.getElementById('uploadArea').textContent = '📎 Tap untuk pilih gambar';
  document.getElementById('uploadArea').classList.remove('has-file');
  document.getElementById('screenshotPreview').style.display = 'none';
  updateJenisChip();
  if (butuhKeterangan) { showAbsenStep('2b'); } else { lanjutSetelahKeterangan(); }
}
function submitKeterangan() {
  keterangan = document.getElementById('keteranganInput').value.trim();
  const err = document.getElementById('keteranganErrorBox');
  if (!keterangan) { err.innerHTML = '<div class="status-box status-fail">Keterangan wajib diisi</div>'; return; }
  err.innerHTML = '';
  if (isSakit) { showAbsenStep('2c'); } else { lanjutSetelahKeterangan(); }
}
function previewScreenshot(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    screenshotBase64 = e.target.result;
    document.getElementById('screenshotPreview').src = screenshotBase64;
    document.getElementById('screenshotPreview').style.display = 'block';
    document.getElementById('uploadArea').textContent = '✅ ' + file.name;
    document.getElementById('uploadArea').classList.add('has-file');
  };
  reader.readAsDataURL(file);
}
function submitScreenshot() {
  const err = document.getElementById('uploadErrorBox');
  if (!screenshotBase64) { err.innerHTML = '<div class="status-box status-fail">Screenshot wajib diupload</div>'; return; }
  err.innerHTML = ''; lanjutSetelahKeterangan();
}
function lanjutSetelahKeterangan() {
  if (butuhQr) { showAbsenStep(3); startQrScanner(); }
  else { qrResult = ''; showAbsenStep(4); getLocation(); }
}
async function startQrScanner() {
  await loadScriptOnce(HTML5_QRCODE_URL);
  if (html5QrCode) { try { html5QrCode.stop(); } catch(e){} }
  html5QrCode = new Html5Qrcode("qr-reader");
  html5QrCode.start({ facingMode:"environment" }, { fps:10, qrbox:220 },
    (decodedText) => {
      qrResult = decodedText;
      html5QrCode.stop().catch(() => {});

      // Validasi QR LANGSUNG di HP (client-side), sebelum lanjut ke step lokasi/foto.
      // Kalau QR yang discan bukan QR resmi kantor, batalkan absen ini dan
      // otomatis balik ke pemilihan jenis absen (bukan lanjut submit dengan status "TIDAK VALID").
      if (decodedText === VALID_QR_CODE) {
        document.getElementById('qrResultBox').innerHTML = '<div class="status-box status-ok">✅ QR terbaca &amp; valid</div>';
        restartAnimasi(document.getElementById('qr-reader'), 'qr-sukses');
        setTimeout(() => { showAbsenStep(4); getLocation(); }, 800);
      } else {
        document.getElementById('qrResultBox').innerHTML =
          '<div class="status-box status-fail">❌ QR tidak valid. Ini bukan QR resmi kantor — absen dibatalkan, silakan scan ulang QR di lokasi kantor.</div>';
        setTimeout(() => { kembaliKePemilihanJenis(); }, 2000);
      }
    }, () => {}
  ).catch(err => {
    document.getElementById('qrResultBox').innerHTML = '<div class="status-box status-fail">Gagal akses kamera: ' + err + '</div>';
  });
}

// Reset ringan: balik ke step pemilihan jenis absen (step2) tanpa perlu login PIN ulang.
// Dipakai saat QR yang discan terbukti tidak valid.
function kembaliKePemilihanJenis() {
  if (html5QrCode) { try { html5QrCode.stop(); } catch(e){} }
  qrResult = ''; keterangan = ''; screenshotBase64 = ''; photoBase64 = '';
  document.getElementById('qrResultBox').innerHTML = '';
  document.getElementById('locationResultBox').innerHTML = '';
  showAbsenStep(2);
}
function getLocation() {
  if (!navigator.geolocation) {
    document.getElementById('locationResultBox').innerHTML = '<div class="status-box status-fail">Browser tidak support GPS</div>'; return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      latitude = pos.coords.latitude; longitude = pos.coords.longitude;
      document.getElementById('locationResultBox').innerHTML =
        '<div class="status-box status-ok">📍 ' + latitude.toFixed(5) + ', ' + longitude.toFixed(5) + '</div>';
      if (isSakit) { setTimeout(() => submitAbsensi(), 800); }
      else { setTimeout(() => { showAbsenStep(5); startCamera(); }, 800); }
    },
    (err) => { document.getElementById('locationResultBox').innerHTML = '<div class="status-box status-fail">Gagal ambil lokasi: ' + err.message + '</div>'; },
    { enableHighAccuracy:true, timeout:10000 }
  );
}
function startCamera() {
  navigator.mediaDevices.getUserMedia({ video: { facingMode:"user" } })
    .then((s) => { stream = s; document.getElementById('camera-view').srcObject = stream; })
    .catch((err) => { alert('Gagal akses kamera: ' + err); });
}
function capturePhoto() {
  const video = document.getElementById('camera-view');
  const canvas = document.getElementById('canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  photoBase64 = canvas.toDataURL('image/jpeg', 0.7);
  restartAnimasi(document.getElementById('cameraFlash'), 'flash');
  document.getElementById('captured-photo').src = photoBase64;
  document.getElementById('captured-photo').style.display = 'block';
  video.style.display = 'none';
  document.getElementById('captureBtn').style.display = 'none';
  document.getElementById('retakeBtn').style.display = 'block';
  document.getElementById('submitBtn').style.display = 'block';
}
function retakePhoto() {
  document.getElementById('camera-view').style.display = 'block';
  document.getElementById('captured-photo').style.display = 'none';
  document.getElementById('captureBtn').style.display = 'block';
  document.getElementById('retakeBtn').style.display = 'none';
  document.getElementById('submitBtn').style.display = 'none';
  photoBase64 = '';
}
function submitAbsensi() {
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengirim...'; }
  if (isSakit) document.getElementById('locationResultBox').innerHTML += '<div class="status-box status-ok" style="margin-top:8px">Mengirim data...</div>';
  // Identitas dikirim lewat token, BUKAN lewat nama. Server yang menentukan
  // absen ini tercatat atas nama siapa — jadi absen gak bisa dititipin.
  //
  // TAHAP 3 migrasi: dialihkan ke backend Vercel (sudah diverifikasi paralel).
  // ROLLBACK CEPAT kalau ada masalah: ganti VERCEL_BACKEND_URL + '/submitAbsensi'
  // di baris fetch() bawah ini balik jadi SCRIPT_URL (constant-nya masih ada,
  // gak dihapus, justru buat ini).
  fetch(VERCEL_BACKEND_URL + '/submitAbsensi', {
    method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ token: getToken(), jenisAbsen, keterangan, isSakit, latitude, longitude, qrResult, butuhQr,
      photoBase64: isSakit ? '' : photoBase64, screenshotBase64: isSakit ? screenshotBase64 : '' })
  })
  .then(res => res.json())
  .then(data => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    absensiCache = null;
    leaderboardCache = null; // absen baru = skor leaderboard ikut berubah, jangan pake cache lama

    // Token kadaluarsa di tengah jalan -> minta PIN lagi, absen belum tercatat.
    if (data.code === 'UNAUTHORIZED') {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '✅ Submit Absensi'; }
      alert('Sesi kamu sudah habis. Masukkan PIN lagi, lalu ulangi absen.');
      sesiHabis();
      return;
    }

    const statusBox = document.getElementById('finalStatus');
    if (data.result === 'success') {
      document.getElementById('finalEmoji').textContent = isSakit ? '🤒' : (butuhQr && data.qrStatus !== 'VALID') ? '⚠️' : '✅';
      if (isSakit) { statusBox.className = 'status-box status-ok'; statusBox.textContent = 'Absensi Sakit berhasil! Semoga cepat sembuh 🙏'; }
      else if (!butuhQr) { statusBox.className = 'status-box status-ok'; statusBox.textContent = '✅ Absensi (' + jenisAbsen + ') berhasil!'; }
      else {
        statusBox.className = 'status-box ' + (data.qrStatus === 'VALID' ? 'status-ok' : 'status-fail');
        statusBox.textContent = data.qrStatus === 'VALID' ? '✅ Absensi berhasil! QR valid.' : '⚠️ Absensi tercatat, QR tidak valid.';
      }
    } else {
      document.getElementById('finalEmoji').textContent = '❌';
      statusBox.className = 'status-box status-fail'; statusBox.textContent = 'Gagal: ' + data.message;
    }
    restartAnimasi(document.getElementById('finalEmoji'), 'anim-pop');
    showAbsenStep(6);
  })
  .catch(err => {
    alert('Gagal mengirim: ' + err);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '✅ Submit Absensi'; }
  });
}
function resetAbsen() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  photoBase64 = ''; qrResult = ''; keterangan = ''; screenshotBase64 = '';
  document.getElementById('captured-photo').style.display = 'none';
  document.getElementById('camera-view').style.display = 'block';
  document.getElementById('captureBtn').style.display = 'block';
  document.getElementById('retakeBtn').style.display = 'none';
  document.getElementById('submitBtn').style.display = 'none';
  document.getElementById('qrResultBox').innerHTML = '';
  document.getElementById('locationResultBox').innerHTML = '';
  initAbsenPage();
}
function resetDevice() {
  if (!confirm('Reset HP ini? Kamu harus daftar ulang setelah ini.')) return;
  localStorage.removeItem('absensi_nama'); localStorage.removeItem('absensi_pin'); localStorage.removeItem('absensi_foto');
  localStorage.removeItem('absensi_token'); localStorage.removeItem('absensi_role');
  sessionStorage.removeItem('app_gate_unlocked');
  nama = ''; absensiCache = null; leaderboardCache = null;
  goPage('absen');
  cekAppGate();
}

// ===== PROFIL (+ RIWAYAT ABSENSI) =====
async function renderProfil() {
  const savedNama = localStorage.getItem('absensi_nama') || '—';
  const savedFoto = localStorage.getItem('absensi_foto');
  document.getElementById('profilNama').textContent = savedNama;
  const fotoEl = document.getElementById('profilFotoEl');
  if (savedFoto) { fotoEl.innerHTML = '<img src="' + savedFoto + '">'; } else { fotoEl.textContent = '👤'; }

  if (savedNama === '—') {
    document.getElementById('riwayatList').innerHTML = '<div class="riwayat-empty">Daftarkan HP dulu di menu Absensi.</div>';
    return;
  }

  document.getElementById('profilLoadingBox').style.display = 'block';
  const now = new Date();
  const absensi = await fetchAbsensi(savedNama, now.getMonth() + 1, now.getFullYear());
  document.getElementById('profilLoadingBox').style.display = 'none';

  // Hitung rekap
  const hadirDates = new Set(), sakitDates = new Set(), ijinDates = new Set(), lambatDates = new Set();

  absensi.forEach(row => {
    const tgl = row.tanggal, jenis = row.jenisAbsen, jam = row.jam, menit = row.menit;
    if (jenis === 'Absen Masuk' || jenis === 'Dinas Lapangan dari Rumah') {
      hadirDates.add(tgl);
      if (jenis === 'Absen Masuk' && isLambat(jam, menit)) lambatDates.add(tgl);
    }
    else if (jenis === 'Sakit') sakitDates.add(tgl);
    else if (jenis === 'Ijin dari Rumah' || jenis === 'Ijin dari Kantor') ijinDates.add(tgl);
  });

  document.getElementById('statHadir').textContent = hadirDates.size;
  document.getElementById('statSakit').textContent = sakitDates.size;
  document.getElementById('statIjin').textContent = ijinDates.size;
  document.getElementById('statLambat').textContent = lambatDates.size;

  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Render chart
  await renderChart(absensi, lastDay, now.getFullYear(), now.getMonth());

  // Render riwayat absensi
  renderRiwayat(absensi);
}

function renderRiwayat(absensi) {
  const container = document.getElementById('riwayatList');
  if (!absensi.length) {
    container.innerHTML = '<div class="card"><div class="riwayat-empty">Belum ada absensi bulan ini.</div></div>';
    return;
  }

  // Kelompokkan per tanggal
  const byDate = new Map();
  absensi.forEach(row => {
    if (!byDate.has(row.tanggal)) byDate.set(row.tanggal, []);
    byDate.get(row.tanggal).push(row);
  });

  const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const now = new Date();

  // Hari terbaru ditampilkan paling atas
  const sortedDates = [...byDate.keys()].sort((a, b) => b - a);

  container.innerHTML = sortedDates.map((tgl, idx) => {
    // Di dalam satu hari, mulai dari jam paling awal (Absen Masuk dulu)
    const items = byDate.get(tgl).slice().sort((a, b) => {
      if (a.jam !== b.jam) return a.jam - b.jam;
      return a.menit - b.menit;
    });
    const dayName = dayNames[new Date(now.getFullYear(), now.getMonth(), tgl).getDay()];

    const itemsHtml = items.map(row => {
      const icon = JENIS_ICON[row.jenisAbsen] || '📌';
      const jam = String(row.jam).padStart(2, '0') + ':' + String(row.menit).padStart(2, '0');
      const lambatTag = (row.jenisAbsen === 'Absen Masuk' && isLambat(row.jam, row.menit))
        ? '<span class="riwayat-lambat">Terlambat</span>' : '';
      const ketHtml = row.keterangan
        ? '<div class="riwayat-ket">' + escapeHtml(row.keterangan) + '</div>' : '';
      return `<div class="riwayat-item">
        <div class="riwayat-icon">${icon}</div>
        <div class="riwayat-info">
          <div class="riwayat-jenis">${escapeHtml(row.jenisAbsen)}${lambatTag}</div>
          <div class="riwayat-meta">${jam}</div>
          ${ketHtml}
        </div>
      </div>`;
    }).join('');

    const jamPertama = String(items[0].jam).padStart(2, '0') + ':' + String(items[0].menit).padStart(2, '0');
    const ringkasan = items.length > 1 ? `${items.length} log · mulai ${jamPertama}` : jamPertama;
    const expandedCls = idx === 0 ? ' expanded' : ''; // hari terbaru langsung terbuka

    return `<div class="riwayat-day-card${expandedCls}">
      <div class="riwayat-day-header" onclick="this.parentElement.classList.toggle('expanded')">
        <div class="riwayat-day-title">${dayName}, Tgl ${tgl}</div>
        <div class="riwayat-day-summary">${ringkasan} <span class="riwayat-day-chevron">▾</span></div>
      </div>
      <div class="riwayat-day-body">
        ${itemsHtml}
      </div>
    </div>`;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Grafik jam masuk harian: bar tinggi = jam check-in (Absen Masuk / Dinas Lapangan dari Rumah),
// hijau kalau tepat waktu, merah kalau lewat 08:05, plus garis putus-putus batas 08:05.
async function renderChart(absensi, lastDay, year, month) {
  await loadScriptOnce(CHART_JS_URL);
  const BATAS_JAM = 8 + 5 / 60; // 08:05 dalam desimal jam

  // Ambil jam check-in PALING AWAL per hari (kalau ada beberapa baris di hari yang sama)
  const jamMasukPerDay = new Array(lastDay).fill(null);
  const seenDay = new Set();

  absensi
    .filter(r => r.jenisAbsen === 'Absen Masuk' || r.jenisAbsen === 'Dinas Lapangan dari Rumah')
    .slice()
    .sort((a, b) => (a.jam !== b.jam ? a.jam - b.jam : a.menit - b.menit))
    .forEach(row => {
      if (seenDay.has(row.tanggal)) return;
      seenDay.add(row.tanggal);
      jamMasukPerDay[row.tanggal - 1] = +(row.jam + row.menit / 60).toFixed(3);
    });

  const labels = Array.from({length: lastDay}, (_, i) => i + 1);
  const garisBatas = new Array(lastDay).fill(BATAS_JAM);
  const barColors = jamMasukPerDay.map(v => v === null ? 'rgba(0,0,0,0)' : (v > BATAS_JAM ? '#E24545' : '#00B383'));

  const validValues = jamMasukPerDay.filter(v => v !== null);
  let yMin = 6, yMax = 10;
  if (validValues.length) {
    yMin = Math.floor(Math.min(6, Math.min(...validValues) - 0.5));
    yMax = Math.ceil(Math.max(10, Math.max(...validValues) + 0.5));
  }

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  const ctx = document.getElementById('absenChart').getContext('2d');
  chartInstance = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Jam Masuk',
          data: jamMasukPerDay,
          backgroundColor: barColors,
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.7,
        },
        {
          type: 'line',
          label: 'Batas (08:05)',
          data: garisBatas,
          borderColor: '#ACA89D',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0,
        },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: { color: '#77746C', font: { size: 10 }, boxWidth: 10, padding: 10, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.raw === null) return 'Tidak absen';
              const totalMin = Math.round(ctx.raw * 60);
              const h = Math.floor(totalMin / 60), m = totalMin % 60;
              const jamStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
              return ctx.dataset.label === 'Batas (08:05)' ? 'Batas: ' + jamStr : 'Masuk: ' + jamStr;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#77746C', font: { size: 10 }, maxTicksLimit: 10 }, grid: { color: 'rgba(32,31,28,0.05)' }, border: { color: 'transparent' } },
        y: {
          min: yMin, max: yMax,
          ticks: {
            color: '#77746C', font: { size: 10 }, stepSize: 1,
            callback: v => String(v).padStart(2, '0') + ':00'
          },
          grid: { color: 'rgba(32,31,28,0.05)' }, border: { color: 'transparent' }
        }
      }
    }
  });
}

let absensiFetchPromise = null; // request yang lagi jalan — biar gak dobel manggil bareng (prefetch pas login + render Home)
let absensiCacheTime = 0;
const CACHE_TTL_MS = 60000; // 1 menit — cukup buat mulus pindah2 tab abis login, tapi gak nyimpen data basi kelamaan

async function fetchAbsensi(nama, month, year) {
  const cacheSegar = absensiCache && (Date.now() - absensiCacheTime < CACHE_TTL_MS);
  if (cacheSegar) return absensiCache;
  if (!nama || nama === '—') return [];
  if (absensiFetchPromise) return absensiFetchPromise; // udah ada yang jalan, numpang nunggu itu aja

  absensiFetchPromise = (async () => {
    try {
      // nama TIDAK dikirim lagi — server ambil dari token, jadi gak bisa ngintip riwayat orang lain
      const url = VERCEL_BACKEND_URL + '/getAbsensi?token=' + encodeURIComponent(getToken()) + '&month=' + month + '&year=' + year;
      console.log('[fetchAbsensi] URL:', url);

      const res = await fetch(url, { redirect: 'follow' });
      const rawText = await res.text();
      console.log('[fetchAbsensi] Raw response:', rawText.substring(0, 200));

      // Kalau response bukan JSON (HTML error page), tangkap lebih jelas
      if (rawText.trim().startsWith('<')) {
        console.error('[fetchAbsensi] Response berupa HTML, bukan JSON. Apps Script belum di-update atau belum di-deploy ulang.');
        showLoadingError('⚠️ Gagal memuat data. Pastikan Apps Script sudah di-update dan di-deploy ulang.');
        return [];
      }

      const data = JSON.parse(rawText);
      console.log('[fetchAbsensi] Parsed data:', data);

      // Token kadaluarsa / PIN direset HR -> minta login lagi, bukan diam-diam kosong
      if (data.code === 'UNAUTHORIZED') { sesiHabis(); return []; }

      if (data.result === 'success') {
        absensiCache = data.data;
        absensiCacheTime = Date.now();
        return data.data;
      } else {
        console.error('[fetchAbsensi] Error dari Apps Script:', data.message);
        showLoadingError('⚠️ Error: ' + (data.message || 'Unknown error'));
      }
    } catch(e) {
      console.error('[fetchAbsensi] Fetch gagal:', e);
      showLoadingError('⚠️ Gagal koneksi ke server. Cek jaringan atau Apps Script URL.');
    } finally {
      absensiFetchPromise = null;
    }
    return [];
  })();

  return absensiFetchPromise;
}

function showLoadingError(msg) {
  ['homeLoadingBox', 'profilLoadingBox'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  });
}

// ===== SISTEM POIN KEHADIRAN (dipakai buat Leaderboard) =====

// Absen Masuk / check-in Dinas Lapangan: makin pagi makin gede bonusnya
// <08:00 -> 100 + 1 poin per 5 menit lebih awal, BONUS DICAP MAKSIMAL 50 (jadi total max 150),
//           dicapai di 250 menit lebih awal (~03:50) — praktis gak pernah kesentuh di dunia nyata,
//           jadi efeknya bonus ini landai terus seiring makin pagi, gak mentok cepet kayak sebelumnya
// 08:00-08:05 -> turun linear 100 -> 95
// 08:05-09:00 -> turun linear 95 -> 0
// >=09:00 -> 0
function scoreAbsenMasuk(jam, menit) {
  const t = jam * 60 + menit;
  const startWork = 8 * 60;       // 08:00
  const lateSoft = 8 * 60 + 5;    // 08:05
  const lateHard = 9 * 60;        // 09:00

  if (t < startWork) {
    const earlyMinutes = startWork - t;
    const bonus = Math.min(Math.floor(earlyMinutes / 5), 50); // 1 poin tiap 5 menit, dicap di 50
    return 100 + bonus; // maksimal 150
  }
  if (t <= lateSoft) {
    const ratio = (t - startWork) / (lateSoft - startWork);
    return Math.round(100 - ratio * 5); // 100 -> 95
  }
  if (t <= lateHard) {
    const ratio = (t - lateSoft) / (lateHard - lateSoft);
    return Math.round(95 - ratio * 95); // 95 -> 0
  }
  return 0;
}

// Ijin dari Rumah: dilihat dari jam Absen Masuk susulan hari itu
// <=08:05 -> 100, 08:05-12:00 -> 100->50, 12:00-17:00 -> 50->0, >=17:00 -> 0
function scoreIjinRumahMasuk(jam, menit) {
  const t = jam * 60 + menit;
  const deadline = 8 * 60 + 5; // 08:05
  const noon = 12 * 60;        // 12:00
  const endWork = 17 * 60;     // 17:00

  if (t <= deadline) return 100;
  if (t <= noon) {
    const ratio = (t - deadline) / (noon - deadline);
    return Math.round(100 - ratio * 50); // 100 -> 50
  }
  if (t <= endWork) {
    const ratio = (t - noon) / (endWork - noon);
    return Math.round(50 - ratio * 50); // 50 -> 0
  }
  return 0;
}

// Ijin dari Kantor: makin pagi absen ijinnya makin gede potongannya
// <=08:00 -> 0, 08:00-12:00 -> 0->50, 12:00-13:00 -> flat 50, 13:00-17:00 -> 50->100, >=17:00 -> 100
function scoreIjinKantor(jam, menit) {
  const t = jam * 60 + menit;
  const startWork = 8 * 60;   // 08:00
  const noon = 12 * 60;       // 12:00
  const onePM = 13 * 60;      // 13:00
  const endWork = 17 * 60;    // 17:00

  if (t <= startWork) return 0;
  if (t >= endWork) return 100;
  if (t >= noon && t <= onePM) return 50;
  if (t < noon) {
    const ratio = (t - startWork) / (noon - startWork);
    return Math.round(ratio * 50);
  }
  const ratio = (t - onePM) / (endWork - onePM);
  return Math.round(50 + ratio * 50);
}

// Durasi kerja Dinas Lapangan (Pulang dari Luar - Dinas Lapangan dari Rumah), target 9 jam.
// Boleh lebih dari 100 kalau checkout SEBELUM jam 17:00 tapi durasinya udah lewat 9 jam
// (mulai dinasnya pagi banget). Begitu checkout jam 17:00 ke atas, dicap 100 — gak ada
// bonus lembur tambahan lagi walau durasinya jauh lebih dari 9 jam.
// Skor Dinas Lapangan dari DURASI KERJA AKTUAL (checkout - checkin), murni
// linear — 9 jam (540 menit) = 100 poin, gak ada cap di atasnya. Sebelumnya
// dicap 120, tapi itu ternyata gak adil buat yang kerja jauh lebih lama
// (14 jam cuma dapet 120, padahal proporsional harusnya ~156).
function scoreDurasiKerja(jamMulai, menitMulai, jamAkhir, menitAkhir) {
  const mulai = jamMulai * 60 + menitMulai;
  const akhir = jamAkhir * 60 + menitAkhir;
  const durasiMenit = Math.max(0, akhir - mulai);
  const target = 9 * 60; // 540 menit = basis 100 poin
  return Math.round((durasiMenit / target) * 100);
}

// Hitung skor satu hari berdasarkan kumpulan baris absen di hari itu
function computeDailyScore(dayRows) {
  const has = j => dayRows.some(r => r.jenisAbsen === j);
  const get = j => dayRows.find(r => r.jenisAbsen === j);

  if (has('Sakit')) return 50;

  if (has('Dinas Lapangan dari Rumah')) {
    const mulai = get('Dinas Lapangan dari Rumah');
    const akhir = get('Pulang dari Luar');
    // Belum checkout: skor sementara dari jam checkin (biar ada angka, self-correct pas nanti checkout).
    if (!akhir) return scoreAbsenMasuk(mulai.jam, mulai.menit);
    // Udah checkout: murni dari durasi kerja aktual, gak digabung sama bonus checkin lagi.
    return scoreDurasiKerja(mulai.jam, mulai.menit, akhir.jam, akhir.menit);
  }

  if (has('Ijin dari Rumah')) {
    const masuk = get('Absen Masuk');
    if (!masuk) return 0; // ijin seharian, gak ada absen masuk susulan
    return scoreIjinRumahMasuk(masuk.jam, masuk.menit);
  }

  if (has('Ijin dari Kantor')) {
    const ijin = get('Ijin dari Kantor');
    return scoreIjinKantor(ijin.jam, ijin.menit);
  }

  if (has('Absen Masuk')) {
    const masuk = get('Absen Masuk');
    return scoreAbsenMasuk(masuk.jam, masuk.menit);
  }

  return 0; // gak ada absen sama sekali hari itu (alpha)
}

// Rata-ratakan skor harian ke semua hari kerja (Senin-Sabtu) sejak Juli 2026 sampai hari ini
// Akumulasikan (jumlahkan, BUKAN rata-rata) poin harian, tapi CUMA untuk bulan berjalan.
// Reset otomatis tiap tanggal 1, biar adil buat karyawan yang baru gabung.
// Minggu bukan hari wajib: kalau ada absen di hari Minggu poinnya IKUT NAMBAH (bonus),
// kalau kosong ya cuma nambah 0 (gak ngurangin total).
function hitungTotalPoin(allData) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1, todayDate = now.getDate();

  const byDate = new Map();
  allData.forEach(row => {
    if (row.tahun !== y || row.bulan !== m) return; // cuma pakai data bulan ini
    const key = row.tanggal;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(row);
  });

  let totalScore = 0;
  for (let d = 1; d <= todayDate; d++) {
    const dayRows = byDate.get(d) || [];
    totalScore += computeDailyScore(dayRows); // hari kosong (termasuk Minggu tanpa absen) otomatis nambah 0
  }

  return totalScore;
}

// ===== LEADERBOARD =====
let leaderboardFetchPromise = null; // sama kayak absensiFetchPromise, anti-dobel-panggil bareng
let leaderboardCache = null;
let leaderboardCacheTime = 0;

async function fetchLeaderboard() {
  const cacheSegar = leaderboardCache && (Date.now() - leaderboardCacheTime < CACHE_TTL_MS);
  if (cacheSegar) return leaderboardCache;
  if (leaderboardFetchPromise) return leaderboardFetchPromise; // udah ada yang jalan, numpang situ aja

  leaderboardFetchPromise = (async () => {
    try {
      const now = new Date();
      // Kirim bulan-tahun eksplisit — server sekarang cuma balikin data bulan ini
      // (bukan seluruh histori lagi), jadi makin cepat makin lama app ini jalan.
      const url = VERCEL_BACKEND_URL + '/getLeaderboard?month=' + (now.getMonth() + 1) + '&year=' + now.getFullYear() + '&token=' + encodeURIComponent(getToken());
      const res = await fetch(url, { redirect: 'follow' });
      const rawText = await res.text();

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error('[fetchLeaderboard] Response BUKAN JSON — kemungkinan Apps Script belum di-deploy ulang dengan action "getLeaderboard". Raw response:', rawText.substring(0, 200));
        return { ok: false, data: [] };
      }

      if (data.result === 'success') {
        const hasil = { ok: true, data: data.data };
        leaderboardCache = hasil;
        leaderboardCacheTime = Date.now();
        return hasil;
      }

      // Token kadaluarsa / PIN direset HR -> minta login lagi
      if (data.code === 'UNAUTHORIZED') { sesiHabis(); return { ok: false, data: [], sesiHabis: true }; }

      console.error('[fetchLeaderboard] Error dari Apps Script:', data.message);
      return { ok: false, data: [] };
    } catch (e) {
      console.error('fetchLeaderboard error:', e);
      return { ok: false, data: [] };
    } finally {
      leaderboardFetchPromise = null;
    }
  })();

  return leaderboardFetchPromise;
}

// Hitung & tampilkan peringkat user saat ini di card Leaderboard pada Home
async function renderHomeRank() {
  const badge = document.getElementById('homeRankNum');
  if (!badge) return;

  if (!nama) { badge.textContent = '—'; return; }

  const result = await fetchLeaderboard();
  if (!result.ok) { badge.textContent = '—'; return; }

  // Server sekarang udah ngirim poin siap pakai (dari sheet SKOR), gak perlu
  // dihitung ulang di HP lagi kayak sebelumnya.
  const ranked = [...result.data].sort((a, b) => b.poin - a.poin || a.nama.localeCompare(b.nama));

  const idx = ranked.findIndex(e => e.nama === nama);
  badge.textContent = idx === -1 ? '—' : '#' + (idx + 1);
}

async function renderLeaderboard() {
  const top3Wrap = document.getElementById('lbTop3');
  const restList = document.getElementById('lbRestList');
  const hintEl = document.getElementById('lbHint');
  if (!top3Wrap) return;

  const result = await fetchLeaderboard();
  if (!result.ok) {
    top3Wrap.innerHTML = '';
    restList.innerHTML = '';
    hintEl.textContent = result.sesiHabis
      ? 'Sesi kamu sudah habis. Masukkan PIN lagi untuk melihat leaderboard.'
      : 'Leaderboard belum bisa dimuat. Cek koneksi, lalu buka ulang halaman ini.';
    hintEl.style.display = 'block';
    return;
  }
  hintEl.style.display = 'none';

  // Server sekarang udah ngirim poin siap pakai (dari sheet SKOR), gak perlu
  // dihitung ulang di HP lagi kayak sebelumnya.
  const ranked = [...result.data].sort((a, b) => b.poin - a.poin || a.nama.localeCompare(b.nama));

  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  // Urutan tampil: rank 2 (kiri), rank 1 (tengah, paling tinggi), rank 3 (kanan)
  const displayOrder = [1, 0, 2].filter(i => top3[i]);

  top3Wrap.innerHTML = displayOrder.map(i => {
    const emp = top3[i];
    const rank = i + 1;
    const initial = emp.nama.charAt(0).toUpperCase();
    const isMe = emp.nama === nama;
    return `<div class="lb-top-col rank-${rank}${isMe ? ' lb-me' : ''}">
      <div class="lb-top-avatar">${initial}</div>
      <div class="lb-top-name">${escapeHtml(emp.nama)}</div>
      <div class="lb-top-badge">${emp.poin} poin</div>
      <div class="lb-bar">${rank}</div>
    </div>`;
  }).join('');

  restList.innerHTML = rest.length ? rest.map((emp, idx) => {
    const rank = idx + 4;
    const initial = emp.nama.charAt(0).toUpperCase();
    const isMe = emp.nama === nama;
    return `<div class="lb-rest-item${isMe ? ' lb-me' : ''}">
      <div class="lb-rest-rank">${String(rank).padStart(2, '0')}</div>
      <div class="lb-rest-avatar">${initial}</div>
      <div class="lb-rest-info">
        <div class="lb-rest-name">${escapeHtml(emp.nama)}</div>
        <div class="lb-rest-pts">${emp.poin} poin</div>
      </div>
    </div>`;
  }).join('') : '';
}

function gantiProfilFoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    localStorage.setItem('absensi_foto', e.target.result);
    document.getElementById('profilFotoEl').innerHTML = '<img src="' + e.target.result + '">';
  };
  reader.readAsDataURL(file);
}

// =====================================================================
// ===== MODE HR — dulunya file terpisah hr.html, sekarang jadi mode  ====
// ===== di dalam Profil (masuk lewat triple-tap ikon Profil).        ====
// SCRIPT_URL, JENIS_ICON, isLambat(), escapeHtml() PAKAI yang sudah  ====
// dideklarasikan di atas (di bagian app absensi), sengaja gak diulang.====
// =====================================================================

const HR_BULAN_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HR_DAY_NAMES = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

let hrInitialized = false;
let hrRekapCache = [];
let hrTodayCache = [];
let hrSelectedNama = '';
let hrSelectedMonth = 0, hrSelectedYear = 0, hrSelectedTanggal = null; // null = sebulan penuh, angka = 1 hari
let hrDetailFromToday = false;
let hrDetailRowsFlat = []; // row absensi lengkap (foto/lokasi/QR) yang sedang tampil di halaman Detail

// Isi dropdown bulan/tahun + label "Hari Ini" sekali aja, saat pertama kali Mode HR dibuka
function hrEnsureInit() {
  if (hrInitialized) return;
  hrInitialized = true;

  const now = new Date();
  const filterBulan = document.getElementById('hrFilterBulan');
  HR_BULAN_NAMES.forEach((b, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1; opt.textContent = b;
    if (i === now.getMonth()) opt.selected = true;
    filterBulan.appendChild(opt);
  });
  document.getElementById('hrFilterTahun').value = now.getFullYear();

  document.getElementById('hrHariIniLabel').textContent =
    HR_DAY_NAMES[now.getDay()] + ', ' + now.getDate() + ' ' + HR_BULAN_NAMES[now.getMonth()] + ' ' + now.getFullYear();
}

function hrGoPage(id) {
  document.querySelectorAll('#page-hr-root .page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-hr-' + id).classList.add('active');
  window.scrollTo(0, 0);
}

// ===== GATE =====
async function hrCekKey() {
  const key = document.getElementById('hrKeyInput').value.trim();
  const err = document.getElementById('hrGateErrorBox');
  const btn = document.querySelector('#page-hr-gate .btn');
  if (!key) { err.innerHTML = '<div class="status-box status-fail">HR Key wajib diisi</div>'; return; }
  err.innerHTML = '';
  btn.disabled = true;
  btn.textContent = 'Memeriksa...';

  try {
    // Key cuma dikirim SEKALI di sini, lewat POST body (bukan nempel di URL).
    // Kalau cocok, server balikin token sementara yang dipakai buat semua request selanjutnya.
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'hrLogin', key: key })
    });
    const rawText = await res.text();
    if (rawText.trim().startsWith('<')) throw new Error('HTML_RESPONSE');
    const data = JSON.parse(rawText);

    if (data.result !== 'success' || !data.token) {
      err.innerHTML = '<div class="status-box status-fail">HR Key salah.</div>';
      return;
    }

    localStorage.setItem('hr_token', data.token);
    document.getElementById('hrKeyInput').value = '';
    hrGoPage('home');
    hrLoadToday();
    hrLoadRekap();
  } catch (e) {
    err.innerHTML = '<div class="status-box status-fail">⚠️ Gagal menghubungi server. Coba lagi.</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
}

function hrLogout() {
  localStorage.removeItem('hr_token');
  document.getElementById('hrKeyInput').value = '';
  hrGoPage('gate');
}

// HR & admin sama-sama superuser (admin dipakai buat pihak eksternal
// yang butuh akses penuh tapi bukan karyawan). Dipakai di banyak tempat,
// jadi disatukan di sini biar konsisten.
function isSuperuserRole(role) { return role === 'hr' || role === 'admin'; }

// Dipanggil tiap kali server bilang token invalid/expired.
function hrHandleUnauthorized(errBox) {
  // Masuk lewat akun superuser (hr/admin): yang habis itu sesi utama, jadi
  // seluruh app perlu login ulang — bukan cuma Mode HR.
  if (isSuperuserRole(getRole())) {
    errBox.innerHTML = '<div class="status-box status-fail">Sesi kamu sudah habis. Masukkan PIN lagi.</div>';
    setTimeout(() => { keluarModeHR(); sesiHabis(); }, 900);
    return;
  }
  // Masuk lewat HR key: cukup ulangi login HR.
  localStorage.removeItem('hr_token');
  errBox.innerHTML = '<div class="status-box status-fail">Sesi HR berakhir. Silakan login ulang.</div>';
  setTimeout(() => hrGoPage('gate'), 900);
}

// ===== FETCH HELPER =====
// Ada dua jalan masuk ke Mode HR:
//   1. Login biasa dengan akun ber-role "hr" atau "admin" -> token utama sudah cukup
//   2. Login lewat HR key (buat yang tidak punya akun superuser) -> pakai hr_token
// Yang pertama didahulukan supaya superuser tidak perlu login dua kali.
function tokenHR() {
  if (isSuperuserRole(getRole()) && getToken()) return getToken();
  return localStorage.getItem('hr_token') || '';
}

async function hrFetchRekap(month, year) {
  const url = VERCEL_BACKEND_URL + '/hr?action=getRekapHR&token=' + encodeURIComponent(tokenHR()) + '&month=' + month + '&year=' + year;
  const res = await fetch(url, { redirect: 'follow' });
  const rawText = await res.text();
  if (rawText.trim().startsWith('<')) {
    throw new Error('HTML_RESPONSE');
  }
  return JSON.parse(rawText);
}

// ===== CARD: HARI INI =====
async function hrLoadToday() {
  const now = new Date();
  const todayDate = now.getDate();
  const loading = document.getElementById('hrHariIniLoading');
  const errBox = document.getElementById('hrHariIniErrorBox');
  const list = document.getElementById('hrHariIniList');
  loading.style.display = 'block';
  errBox.innerHTML = '';
  list.innerHTML = '';

  try {
    const data = await hrFetchRekap(now.getMonth() + 1, now.getFullYear());
    loading.style.display = 'none';

    if (data.result !== 'success') {
      if (data.code === 'UNAUTHORIZED' || data.message === 'Unauthorized') {
        hrHandleUnauthorized(errBox);
      } else {
        errBox.innerHTML = '<div class="status-box status-fail">⚠️ ' + escapeHtml(data.message || 'Error') + '</div>';
      }
      return;
    }

    hrTodayCache = data.data.map(emp => ({
      nama: emp.nama,
      absensi: emp.absensi.filter(a => a.tanggal === todayDate)
    }));
    hrRenderHariIni();
  } catch (e) {
    loading.style.display = 'none';
    errBox.innerHTML = '<div class="status-box status-fail">⚠️ Gagal memuat data hari ini.</div>';
  }
}

function hrStatusHariIni(absensiHariIni) {
  const hasMasuk = absensiHariIni.some(r => r.jenisAbsen === 'Absen Masuk');
  const hasDinas = absensiHariIni.some(r => r.jenisAbsen === 'Dinas Lapangan dari Rumah');
  const hasSakit = absensiHariIni.some(r => r.jenisAbsen === 'Sakit');
  const hasIjinRumah = absensiHariIni.some(r => r.jenisAbsen === 'Ijin dari Rumah');
  const hasIjinKantor = absensiHariIni.some(r => r.jenisAbsen === 'Ijin dari Kantor');
  const masukRow = absensiHariIni.find(r => r.jenisAbsen === 'Absen Masuk');

  if (hasMasuk) {
    const jam = String(masukRow.jam).padStart(2, '0') + ':' + String(masukRow.menit).padStart(2, '0');
    const telatRaw = isLambat(masukRow.jam, masukRow.menit);
    // Kalau sebelumnya sudah "Ijin dari Rumah", masuk telat TIDAK dianggap terlambat
    if (telatRaw && hasIjinRumah) {
      return { cls: 'info', text: 'Ijin, masuk ' + jam };
    }
    return { cls: telatRaw ? 'warn' : 'ok', text: (telatRaw ? 'Telat, masuk ' : 'Hadir ') + jam };
  }
  if (hasDinas) return { cls: 'info', text: 'Dinas Lapangan (tanpa Absen Masuk)' };
  if (hasSakit) return { cls: 'warn', text: 'Sakit' };
  if (hasIjinRumah || hasIjinKantor) return { cls: 'info', text: 'Ijin' };
  return { cls: 'warn', text: 'Belum absen' };
}

function hrRenderHariIni() {
  const container = document.getElementById('hrHariIniList');
  if (!hrTodayCache.length) {
    container.innerHTML = '<div class="riwayat-empty">Tidak ada data karyawan.</div>';
    return;
  }
  const sorted = [...hrTodayCache].sort((a, b) => a.nama.localeCompare(b.nama));
  container.innerHTML = sorted.map(emp => {
    const st = hrStatusHariIni(emp.absensi);
    const initial = emp.nama.charAt(0).toUpperCase();
    return `<div class="hr-emp-item" onclick="hrOpenDetailFromToday('${escapeHtml(emp.nama)}')">
      <div class="hr-emp-avatar">${initial}</div>
      <div class="hr-emp-info">
        <div class="hr-emp-nama">${escapeHtml(emp.nama)}</div>
        <div class="hr-emp-stats"><span class="${st.cls}">${st.text}</span></div>
      </div>
      <div class="hr-emp-arrow">›</div>
    </div>`;
  }).join('');
}

function hrOpenDetailFromToday(nama) {
  hrDetailFromToday = true;
  const now = new Date();
  const emp = hrTodayCache.find(e => e.nama === nama);
  hrShowDetail(nama, emp ? emp.absensi : [], now.getMonth() + 1, now.getFullYear(), now.getDate());
}

// ===== CARD: REKAP BULANAN =====
function hrResetFilterTanggal() {
  document.getElementById('hrFilterTanggal').value = '';
  document.getElementById('hrResetTanggalBtn').style.display = 'none';
  hrLoadRekap();
}

async function hrLoadRekap() {
  const tanggalInput = document.getElementById('hrFilterTanggal').value; // format yyyy-mm-dd atau ''
  let month, year, tanggalFilter = null;

  if (tanggalInput) {
    const parts = tanggalInput.split('-');
    year = parseInt(parts[0]);
    month = parseInt(parts[1]);
    tanggalFilter = parseInt(parts[2]);
    document.getElementById('hrResetTanggalBtn').style.display = 'block';
  } else {
    month = parseInt(document.getElementById('hrFilterBulan').value);
    year = parseInt(document.getElementById('hrFilterTahun').value);
    document.getElementById('hrResetTanggalBtn').style.display = 'none';
  }

  hrSelectedMonth = month; hrSelectedYear = year; hrSelectedTanggal = tanggalFilter;

  const listLoadingBox = document.getElementById('hrListLoadingBox');
  const listErrorBox = document.getElementById('hrListErrorBox');
  const empList = document.getElementById('hrEmpList');
  listLoadingBox.style.display = 'block';
  listErrorBox.innerHTML = '';
  empList.innerHTML = '';

  try {
    const data = await hrFetchRekap(month, year);
    listLoadingBox.style.display = 'none';

    if (data.result !== 'success') {
      if (data.code === 'UNAUTHORIZED' || data.message === 'Unauthorized') {
        hrHandleUnauthorized(listErrorBox);
      } else {
        listErrorBox.innerHTML = '<div class="status-box status-fail">⚠️ ' + escapeHtml(data.message || 'Error') + '</div>';
      }
      return;
    }

    hrRekapCache = data.data.map(emp => ({
      nama: emp.nama,
      absensi: tanggalFilter ? emp.absensi.filter(a => a.tanggal === tanggalFilter) : emp.absensi
    }));
    hrRenderEmpList();
  } catch (e) {
    listLoadingBox.style.display = 'none';
    listErrorBox.innerHTML = '<div class="status-box status-fail">⚠️ Gagal koneksi ke server.</div>';
  }
}

function hrHitungStat(absensi) {
  const hadirDates = new Set(), sakitDates = new Set(), ijinDates = new Set(), lambatDates = new Set();
  absensi.forEach(row => {
    const tgl = row.tanggal, jenis = row.jenisAbsen, jam = row.jam, menit = row.menit;
    if (jenis === 'Absen Masuk' || jenis === 'Dinas Lapangan dari Rumah') {
      hadirDates.add(tgl);
      if (jenis === 'Absen Masuk' && isLambat(jam, menit)) lambatDates.add(tgl);
    } else if (jenis === 'Sakit') sakitDates.add(tgl);
    else if (jenis === 'Ijin dari Rumah' || jenis === 'Ijin dari Kantor') ijinDates.add(tgl);
  });
  return { hadir: hadirDates.size, sakit: sakitDates.size, ijin: ijinDates.size, lambat: lambatDates.size };
}

function hrRenderEmpList() {
  const container = document.getElementById('hrEmpList');
  if (!hrRekapCache.length) {
    container.innerHTML = '<div class="riwayat-empty">Tidak ada data karyawan.</div>';
    return;
  }
  const sorted = [...hrRekapCache].sort((a, b) => a.nama.localeCompare(b.nama));
  container.innerHTML = sorted.map(emp => {
    const stat = hrHitungStat(emp.absensi);
    const initial = emp.nama.charAt(0).toUpperCase();
    const kosongTag = stat.hadir === 0 && stat.sakit === 0 && stat.ijin === 0
      ? '<span class="warn">Tidak ada absen</span>' : '';
    return `<div class="hr-emp-item" onclick="hrOpenDetailFromRekap('${escapeHtml(emp.nama)}')">
      <div class="hr-emp-avatar">${initial}</div>
      <div class="hr-emp-info">
        <div class="hr-emp-nama">${escapeHtml(emp.nama)}</div>
        <div class="hr-emp-stats">
          ${kosongTag || ('Hadir ' + stat.hadir + ' • Sakit ' + stat.sakit + ' • Ijin ' + stat.ijin + (stat.lambat ? ' • <span class="warn">Telat ' + stat.lambat + '</span>' : ''))}
        </div>
      </div>
      <div class="hr-emp-arrow">›</div>
    </div>`;
  }).join('');
}

function hrOpenDetailFromRekap(nama) {
  hrDetailFromToday = false;
  const emp = hrRekapCache.find(e => e.nama === nama);
  hrShowDetail(nama, emp ? emp.absensi : [], hrSelectedMonth, hrSelectedYear, hrSelectedTanggal);
}

// ===== DETAIL KARYAWAN (dipakai oleh kedua card) =====
function hrShowDetail(nama, absensi, month, year, tanggal) {
  hrSelectedNama = nama;
  document.getElementById('hrDetailNama').textContent = nama;
  document.getElementById('hrDetailPeriodeLabel').textContent = tanggal
    ? (tanggal + ' ' + HR_BULAN_NAMES[month - 1] + ' ' + year)
    : (HR_BULAN_NAMES[month - 1] + ' ' + year);

  const stat = hrHitungStat(absensi);
  document.getElementById('hrDStatHadir').textContent = stat.hadir;
  document.getElementById('hrDStatSakit').textContent = stat.sakit;
  document.getElementById('hrDStatIjin').textContent = stat.ijin;
  document.getElementById('hrDStatLambat').textContent = stat.lambat;

  hrRenderDetailRiwayat(absensi, month, year);
  hrGoPage('detail');
}

function hrBackToHome() { hrGoPage('home'); }

// ===== KELOLA PIN KARYAWAN =====
let hrKaryawanCache = [];

function hrGoToKaryawan() {
  hrGoPage('karyawan');
  hrLoadKaryawanList();
}

// ===== REVIEW PAYROLL =====
let hrPayrollCache = [];

function fmtRupiah(n) {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}

function hrGoToPayroll() {
  hrGoPage('payroll');
  hrInitPayrollFilter();
  hrLoadPayroll();
}

function hrInitPayrollFilter() {
  const selBulan = document.getElementById('hrPayrollBulan');
  const inputTahun = document.getElementById('hrPayrollTahun');
  if (selBulan.options.length === 0) {
    HR_BULAN_NAMES.forEach((nm, idx) => {
      const opt = document.createElement('option');
      opt.value = idx + 1;
      opt.textContent = nm;
      selBulan.appendChild(opt);
    });
  }
  const now = new Date();
  if (!selBulan.value) selBulan.value = now.getMonth() + 1;
  if (!inputTahun.value) inputTahun.value = now.getFullYear();
}

async function hrLoadPayroll() {
  const loading = document.getElementById('hrPayrollLoadingBox');
  const errBox = document.getElementById('hrPayrollErrorBox');
  const listBox = document.getElementById('hrPayrollList');
  const totalCard = document.getElementById('hrPayrollTotalCard');
  loading.style.display = 'block';
  errBox.innerHTML = '';
  listBox.innerHTML = '';
  totalCard.style.display = 'none';

  const month = document.getElementById('hrPayrollBulan').value;
  const year = document.getElementById('hrPayrollTahun').value;

  try {
    const url = VERCEL_BACKEND_URL + '/hr?action=getPayrollSemua&month=' + month + '&year=' + year + '&token=' + encodeURIComponent(tokenHR());
    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();
    loading.style.display = 'none';

    if (data.result !== 'success') {
      if (data.code === 'UNAUTHORIZED' || data.message === 'Unauthorized') {
        hrHandleUnauthorized(errBox);
      } else {
        errBox.innerHTML = '<div class="status-box status-fail">⚠️ ' + escapeHtml(data.message || 'Error') + '</div>';
      }
      return;
    }

    hrPayrollCache = data.data || [];
    hrRenderPayrollList();
  } catch (e) {
    loading.style.display = 'none';
    errBox.innerHTML = '<div class="status-box status-fail">⚠️ Gagal koneksi ke server.</div>';
  }
}

function hrRenderPayrollList() {
  const listBox = document.getElementById('hrPayrollList');
  const totalCard = document.getElementById('hrPayrollTotalCard');
  const totalNum = document.getElementById('hrPayrollTotalNum');
  const totalSub = document.getElementById('hrPayrollTotalSub');

  const valid = hrPayrollCache.filter(e => !e.error);
  const bermasalah = hrPayrollCache.filter(e => e.error);

  if (valid.length) {
    const grandTotal = valid.reduce((sum, e) => sum + e.totalGaji, 0);
    totalNum.textContent = fmtRupiah(grandTotal);
    totalSub.textContent = valid.length + ' karyawan'
      + (bermasalah.length ? ' • ' + bermasalah.length + ' belum ada data gaji' : '');
    totalCard.style.display = 'block';
  } else {
    totalCard.style.display = 'none';
  }

  const sorted = [...valid].sort((a, b) => a.nama.localeCompare(b.nama));

  let html = sorted.map((e, idx) => {
    const namaSafe = escapeHtml(e.nama);
    return `<div class="hr-payroll-item" id="hrPayrollItem${idx}">
      <div class="hr-payroll-head" onclick="hrTogglePayrollDetail(${idx})">
        <div class="hr-payroll-nama">${namaSafe}<span class="hr-payroll-chevron">▾</span></div>
        <div class="hr-payroll-total">${fmtRupiah(e.totalGaji)}</div>
      </div>
      <div class="hr-payroll-detail">
        <div class="hr-payroll-row"><span>Gaji Pokok</span><span>${fmtRupiah(e.gajiPokok)}</span></div>
        <div class="hr-payroll-row"><span>Tunjangan Tetap</span><span>${fmtRupiah(e.tunjanganTetap)}</span></div>
        <div class="hr-payroll-row"><span>Skor rata-rata (${e.jumlahHariAbsen} hari absen)</span><span>${e.skorRataRata}</span></div>
        <div class="hr-payroll-row"><span>Tunjangan Kehadiran</span><span>${fmtRupiah(e.tunjanganKehadiranAktual)} / ${fmtRupiah(e.tunjanganKehadiranDasar)}</span></div>
        <div class="hr-payroll-row"><span>Jam Lembur</span><span>${e.totalJamLembur} jam</span></div>
        <div class="hr-payroll-row"><span>Total Lembur</span><span>${fmtRupiah(e.totalLembur)}</span></div>
        <div class="hr-payroll-row total-row"><span>Total Gaji</span><span>${fmtRupiah(e.totalGaji)}</span></div>
        <div class="info-text" style="text-align:left; margin-top:8px; font-size:11px">${escapeHtml(e.catatan || '')}</div>
        <button class="btn btn-secondary" style="margin-top:10px" onclick="event.stopPropagation(); hrUnduhSlipGaji('${namaSafe.replace(/'/g, "\\'")}', ${e.bulan}, ${e.tahun}, ${idx})">📄 Unduh PDF Slip Gaji</button>
        <div id="hrPdfStatus${idx}"></div>
      </div>
    </div>`;
  }).join('');

  if (bermasalah.length) {
    html += bermasalah.map(e => `<div class="hr-payroll-item">
      <div class="hr-payroll-nama">${escapeHtml(e.nama)}</div>
      <div class="hr-payroll-warn">⚠️ ${escapeHtml(e.error)}</div>
    </div>`).join('');
  }

  listBox.innerHTML = html || '<div class="riwayat-empty">Belum ada karyawan di sistem.</div>';
}

function hrTogglePayrollDetail(idx) {
  const el = document.getElementById('hrPayrollItem' + idx);
  if (el) el.classList.toggle('open');
}

async function hrUnduhSlipGaji(nama, month, year, idx) {
  const statusBox = document.getElementById('hrPdfStatus' + idx);
  if (statusBox) statusBox.innerHTML = '<div class="status-box status-ok"><span class="spinner-inline"></span>Membuat PDF...</div>';

  try {
    const url = VERCEL_BACKEND_URL + '/getSlipGajiPdf?nama=' + encodeURIComponent(nama) + '&month=' + month + '&year=' + year + '&token=' + encodeURIComponent(tokenHR());
    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();

    if (data.result !== 'success') {
      if (statusBox) statusBox.innerHTML = '<div class="status-box status-fail">⚠️ ' + escapeHtml(data.message || 'Gagal bikin PDF') + '</div>';
      return;
    }

    // Base64 -> Blob -> trigger download, tanpa nyimpen apa pun ke server.
    const byteChars = atob(data.base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = data.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    if (statusBox) statusBox.innerHTML = '<div class="status-box status-ok">✅ PDF terunduh</div>';
  } catch (e) {
    if (statusBox) statusBox.innerHTML = '<div class="status-box status-fail">⚠️ Gagal koneksi ke server.</div>';
  }
}

async function hrLoadKaryawanList() {
  const loading = document.getElementById('hrKrLoadingBox');
  const errBox = document.getElementById('hrKrErrorBox');
  const listBox = document.getElementById('hrKrList');
  loading.style.display = 'block';
  errBox.innerHTML = '';
  listBox.innerHTML = '';

  try {
    const url = VERCEL_BACKEND_URL + '/hr?action=getKaryawanHR&token=' + encodeURIComponent(tokenHR());
    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();
    loading.style.display = 'none';

    if (data.result !== 'success') {
      if (data.code === 'UNAUTHORIZED' || data.message === 'Unauthorized') {
        hrHandleUnauthorized(errBox);
      } else {
        errBox.innerHTML = '<div class="status-box status-fail">⚠️ ' + escapeHtml(data.message || 'Error') + '</div>';
      }
      return;
    }

    hrKaryawanCache = data.data; // [{ nama, role, terdaftar }]
    hrRenderKaryawanList();
  } catch (e) {
    loading.style.display = 'none';
    errBox.innerHTML = '<div class="status-box status-fail">⚠️ Gagal koneksi ke server.</div>';
  }
}

function hrRenderKaryawanList() {
  const container = document.getElementById('hrKrList');
  const q = (document.getElementById('hrKrSearch').value || '').trim().toLowerCase();

  const filtered = hrKaryawanCache.filter(k => k.nama.toLowerCase().includes(q));
  if (!filtered.length) {
    container.innerHTML = '<div class="riwayat-empty">' + (hrKaryawanCache.length ? 'Tidak ada nama yang cocok.' : 'Belum ada karyawan terdaftar di sheet KARYAWAN.') + '</div>';
    return;
  }

  const sorted = [...filtered].sort((a, b) => a.nama.localeCompare(b.nama));
  container.innerHTML = sorted.map(k => {
    const namaSafe = escapeHtml(k.nama);
    const badgePin = k.terdaftar
      ? '<span class="hr-kr-pin-badge terdaftar">🔒 PIN aktif</span>'
      : '<span class="hr-kr-pin-badge kosong">Belum daftar PIN</span>';
    return `<div class="hr-kr-item">
      <div class="hr-kr-info">
        <div class="hr-kr-nama">${namaSafe}</div>
        <div class="hr-kr-meta">
          <span class="hr-kr-role">${escapeHtml(k.role || '—')}</span>
          ${badgePin}
        </div>
      </div>
      <button class="hr-kr-reset-btn" ${k.terdaftar ? '' : 'disabled'} onclick="hrResetPinKaryawan('${namaSafe.replace(/'/g, "\\'")}')">
        Reset PIN
      </button>
    </div>`;
  }).join('');
}

async function hrHitungUlangSemuaSkor(btnEl) {
  const now = new Date();
  const konfirmasi = confirm(
    'Hitung ulang skor SEMUA karyawan buat bulan ' + HR_BULAN_NAMES[now.getMonth()] + ' ' + now.getFullYear() + '?\n\n' +
    'Ini bakal nimpa semua angka yang sekarang ada di sheet SKOR bulan ini, dihitung ulang pakai formula skor yang aktif SEKARANG. ' +
    'Biasanya dipakai abis formula skor diubah, biar semua orang langsung ke-update serentak.'
  );
  if (!konfirmasi) return;

  const teksAsli = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = 'Menghitung...';

  try {
    const res = await fetch(VERCEL_BACKEND_URL + '/hr', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'hitungUlangSemuaSkor', token: tokenHR() })
    });
    const data = await res.json();

    if (data.result !== 'success') {
      if (data.code === 'UNAUTHORIZED' || data.message === 'Unauthorized') {
        alert('Sesi HR habis, silakan masuk Mode HR lagi.');
      } else {
        alert('Gagal: ' + (data.message || 'Error tidak diketahui'));
      }
      return;
    }

    // Leaderboard & Home rank di HP siapa pun yang lagi buka bisa aja masih
    // nyimpen cache lama — paksa refresh biar gak nampilin angka yang baru
    // aja ditimpa server.
    leaderboardCache = null;

    alert('Selesai! ' + data.jumlahKaryawan + ' karyawan sudah dihitung ulang buat bulan ' + data.bulan + '/' + data.tahun + '.');
  } catch (e) {
    alert('Gagal koneksi ke server.');
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = teksAsli;
  }
}

async function hrResetPinKaryawan(nama) {
  const konfirmasi = confirm(
    'Reset PIN "' + nama + '"?\n\n' +
    'Orang ini akan langsung ter-logout dari HP-nya dan wajib daftar ulang PIN baru dari awal. Aksi ini tidak bisa dibatalkan.'
  );
  if (!konfirmasi) return;

  const errBox = document.getElementById('hrKrErrorBox');
  errBox.innerHTML = '';

  try {
    const res = await fetch(VERCEL_BACKEND_URL + '/hr', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'resetPin', token: tokenHR(), nama })
    });
    const data = await res.json();

    if (data.result !== 'success') {
      if (data.code === 'UNAUTHORIZED' || data.message === 'Unauthorized') {
        hrHandleUnauthorized(errBox);
      } else {
        errBox.innerHTML = '<div class="status-box status-fail">⚠️ ' + escapeHtml(data.message || 'Gagal reset PIN.') + '</div>';
      }
      return;
    }

    // Perbarui status di cache lokal tanpa perlu fetch ulang semuanya
    const item = hrKaryawanCache.find(k => k.nama === nama);
    if (item) item.terdaftar = false;
    hrRenderKaryawanList();
  } catch (e) {
    errBox.innerHTML = '<div class="status-box status-fail">⚠️ Gagal koneksi ke server.</div>';
  }
}

function hrRenderDetailRiwayat(absensi, month, year) {
  const container = document.getElementById('hrDetailRiwayat');
  hrDetailRowsFlat = [];
  if (!absensi.length) {
    container.innerHTML = '<div class="card"><div class="riwayat-empty">Tidak ada absensi pada periode ini.</div></div>';
    return;
  }

  const byDate = new Map();
  absensi.forEach(row => {
    if (!byDate.has(row.tanggal)) byDate.set(row.tanggal, []);
    byDate.get(row.tanggal).push(row);
  });

  const sortedDates = [...byDate.keys()].sort((a, b) => b - a);

  container.innerHTML = sortedDates.map(tgl => {
    const itemsForDay = byDate.get(tgl);
    const items = itemsForDay.slice().sort((a, b) => {
      if (a.jam !== b.jam) return a.jam - b.jam;
      return a.menit - b.menit;
    });
    const dayName = HR_DAY_NAMES[new Date(year, month - 1, tgl).getDay()];

    // Cek: dinas lapangan tanpa absen masuk di hari itu
    const hasMasuk = itemsForDay.some(r => r.jenisAbsen === 'Absen Masuk');
    const hasDinas = itemsForDay.some(r => r.jenisAbsen === 'Dinas Lapangan dari Rumah');
    const dinasBadge = (hasDinas && !hasMasuk)
      ? '<span class="riwayat-dinas-badge">Dinas Lapangan (tanpa Absen Masuk)</span>' : '';

    // Skor hari itu — pakai fungsi yang sama kayak Leaderboard, biar angkanya
    // konsisten. Satu skor per hari (bukan per baris), karena kalau ada
    // beberapa jenis absen di hari yang sama, cuma yang prioritas tertinggi
    // yang dipakai (lihat computeDailyScore).
    const skorHari = computeDailyScore(itemsForDay);
    const kelasPoin = skorHari >= 100 ? 'poin-bagus' : skorHari >= 50 ? 'poin-sedang' : 'poin-kurang';
    const poinBadge = `<span class="riwayat-poin-badge ${kelasPoin}">${skorHari} poin</span>`;

    const itemsHtml = items.map(row => {
      const icon = JENIS_ICON[row.jenisAbsen] || '📌';
      const jam = String(row.jam).padStart(2, '0') + ':' + String(row.menit).padStart(2, '0');
      const lambatTag = (row.jenisAbsen === 'Absen Masuk' && isLambat(row.jam, row.menit))
        ? '<span class="riwayat-lambat">Terlambat</span>' : '';
      const ketHtml = row.keterangan ? '<div class="riwayat-ket">' + escapeHtml(row.keterangan) + '</div>' : '';

      // Simpan row lengkap (termasuk lokasi/foto/QR) ke array global, dipakai saat modal dibuka
      hrDetailRowsFlat.push(row);
      const idx = hrDetailRowsFlat.length - 1;
      const hasDetail = row.fotoSelfie || row.latitude || row.statusQr || row.screenshotBukti;
      const hintHtml = hasDetail ? '<div class="riwayat-item-hint">Ketuk untuk lihat foto & lokasi ›</div>' : '';

      return `<div class="riwayat-item clickable" onclick="hrOpenAbsenDetail(${idx})">
        <div class="riwayat-icon">${icon}</div>
        <div class="riwayat-info">
          <div class="riwayat-jenis">${escapeHtml(row.jenisAbsen)}${lambatTag}</div>
          <div class="riwayat-meta">${jam}</div>
          ${ketHtml}
          ${hintHtml}
        </div>
      </div>`;
    }).join('');

    return `<div class="riwayat-day-card">
      <div class="riwayat-day-title" style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; font-family:var(--font-display); font-weight:800; font-size:13px; color:var(--ink); text-transform:uppercase; letter-spacing:0.4px; margin-bottom:8px">${dayName}, Tgl ${tgl} ${dinasBadge}${poinBadge}</div>
      ${itemsHtml}
    </div>`;
  }).join('');
}

// ===== LAPORAN WA =====
function hrGreetingNow() {
  const h = new Date().getHours();
  if (h < 11) return 'Pagi';
  if (h < 15) return 'Siang';
  return 'Sore';
}

// Cache template di sesi ini biar gak fetch ulang tiap buka Laporan WA —
// di-reset (null) begitu HR nyimpen template baru dari halaman edit.
let hrLaporanTemplateCache = null;

async function hrAmbilLaporanTemplate() {
  if (hrLaporanTemplateCache) return hrLaporanTemplateCache;
  try {
    const url = VERCEL_BACKEND_URL + '/hr?action=getLaporanTemplate&token=' + encodeURIComponent(tokenHR());
    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();
    if (data.result === 'success') {
      hrLaporanTemplateCache = data.template;
      return data.template;
    }
  } catch (e) { /* fallback ke default kalau gagal fetch */ }
  return null; // null -> pemanggil pakai fallback default-nya sendiri
}

async function hrBuildLaporanText() {
  const now = new Date();
  const tanggalLabel = now.getDate() + ' ' + HR_BULAN_NAMES[now.getMonth()] + ' ' + now.getFullYear();

  const tidakMasuk = [];
  const terlambat = [];
  const dinas = [];
  const ijin = [];

  (hrTodayCache || []).forEach(emp => {
    const absensi = emp.absensi || [];
    const hasMasuk = absensi.some(a => a.jenisAbsen === 'Absen Masuk');
    const hasDinas = absensi.some(a => a.jenisAbsen === 'Dinas Lapangan dari Rumah');
    const hasSakit = absensi.some(a => a.jenisAbsen === 'Sakit');
    const hasIjinRumah = absensi.some(a => a.jenisAbsen === 'Ijin dari Rumah');
    const hasIjinKantor = absensi.some(a => a.jenisAbsen === 'Ijin dari Kantor');
    const masukRow = absensi.find(a => a.jenisAbsen === 'Absen Masuk');

    // 1. Tidak masuk kerja: sakit, atau sama sekali tidak ada absen (masuk/dinas/ijin)
    if (hasSakit) {
      tidakMasuk.push(emp.nama + ' - Sakit');
    } else if (!hasMasuk && !hasDinas && !hasIjinRumah && !hasIjinKantor) {
      tidakMasuk.push(emp.nama);
    }

    // 2. Datang terlambat: dilihat dari jam record "Absen Masuk".
    //    Tapi kalau sebelumnya dia sudah "Ijin dari Rumah", masuk telat TIDAK
    //    dihitung terlambat (sudah dianggap masuk kategori Ijin Per jam).
    if (masukRow && isLambat(masukRow.jam, masukRow.menit) && !hasIjinRumah) {
      terlambat.push(emp.nama);
    }

    // 3. Dinas luar / WFH
    if (hasDinas) dinas.push(emp.nama);

    // 5. Ijin per jam: HANYA untuk jenis absen "Ijin dari Rumah".
    //    "Ijin dari Kantor" tidak pernah masuk kategori ini.
    if (hasIjinRumah) ijin.push(emp.nama);
  });

  const fmt = (arr) => arr.map(n => '- ' + n).join('\n');

  // Template default (dipakai kalau belum pernah di-custom / gagal fetch)
  // sengaja SAMA PERSIS format-nya kayak versi hardcode sebelumnya, biar
  // gak ada yang berubah buat HR yang belum pernah sentuh halaman edit.
  const templateDefault =
    'Selamat {{GREETING}},\n' +
    'Berikut report absensi tanggal {{TANGGAL}}:\n' +
    '1. Tidak masuk kerja ({{TIDAK_MASUK_COUNT}} orang)\n' +
    '{{TIDAK_MASUK_LIST}}\n' +
    '2. Datang terlambat ({{TERLAMBAT_COUNT}} orang)\n' +
    '{{TERLAMBAT_LIST}}\n' +
    '3. Dinas luar / WFH ({{DINAS_COUNT}} orang)\n' +
    '{{DINAS_LIST}}\n' +
    '4. Libur ganti hari Minggu (0 orang)\n' +
    '[isi manual jika ada]\n' +
    '5. Ijin Per jam ({{IJIN_COUNT}} orang)\n' +
    '{{IJIN_LIST}}';

  const template = (await hrAmbilLaporanTemplate()) || templateDefault;

  const nilai = {
    '{{GREETING}}': hrGreetingNow(),
    '{{TANGGAL}}': tanggalLabel,
    '{{TIDAK_MASUK_COUNT}}': String(tidakMasuk.length),
    '{{TIDAK_MASUK_LIST}}': fmt(tidakMasuk),
    '{{TERLAMBAT_COUNT}}': String(terlambat.length),
    '{{TERLAMBAT_LIST}}': fmt(terlambat),
    '{{DINAS_COUNT}}': String(dinas.length),
    '{{DINAS_LIST}}': fmt(dinas),
    '{{IJIN_COUNT}}': String(ijin.length),
    '{{IJIN_LIST}}': fmt(ijin)
  };

  let text = template;
  Object.keys(nilai).forEach(placeholder => {
    text = text.split(placeholder).join(nilai[placeholder]);
  });

  // Di template default, TIDAK ADA baris yang sengaja kosong — semua baris
  // isinya teks atau placeholder. Jadi kalau ada baris yang habis substitusi
  // jadi kosong (list kategori 0 orang), itu artefak, bukan spasi yang
  // disengaja — dibuang biar hasilnya identik sama versi lama (yang emang
  // gak nulis baris apa pun kalau daftarnya kosong).
  return text.split('\n').filter(line => line.trim() !== '').join('\n').trim();
}

async function hrOpenLaporanWA() {
  const text = await hrBuildLaporanText();
  document.getElementById('hrLaporanText').value = text;
  document.getElementById('hrCopyToast').textContent = '';
  hrGoPage('report');
}

function hrBackToHomeFromReport() { hrGoPage('home'); }

// ===== EDIT TEMPLATE LAPORAN WA =====
function hrGoToEditTemplate() {
  hrGoPage('template');
  hrLoadTemplateEditor();
}

async function hrLoadTemplateEditor() {
  const loading = document.getElementById('hrTemplateLoadingBox');
  const errBox = document.getElementById('hrTemplateErrorBox');
  const textarea = document.getElementById('hrTemplateText');
  const actions = document.getElementById('hrTemplateActions');
  loading.style.display = 'block';
  errBox.innerHTML = '';
  textarea.style.display = 'none';
  actions.style.display = 'none';
  document.getElementById('hrTemplateStatus').textContent = '';

  try {
    const url = VERCEL_BACKEND_URL + '/hr?action=getLaporanTemplate&token=' + encodeURIComponent(tokenHR());
    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();
    loading.style.display = 'none';

    if (data.result !== 'success') {
      if (data.code === 'UNAUTHORIZED' || data.message === 'Unauthorized') {
        errBox.innerHTML = '<div class="status-box status-fail">⚠️ Sesi HR habis, masuk Mode HR lagi.</div>';
      } else {
        errBox.innerHTML = '<div class="status-box status-fail">⚠️ ' + escapeHtml(data.message || 'Gagal memuat template.') + '</div>';
      }
      return;
    }

    hrTemplateDefaultCache = data.templateDefault;
    textarea.value = data.template;
    textarea.style.display = 'block';
    actions.style.display = 'flex';
  } catch (e) {
    loading.style.display = 'none';
    errBox.innerHTML = '<div class="status-box status-fail">⚠️ Gagal koneksi ke server.</div>';
  }
}

let hrTemplateDefaultCache = null;

function hrKembalikanTemplateDefault() {
  if (!hrTemplateDefaultCache) return;
  if (!confirm('Isi kotak teks dengan template default? Perubahan ini belum tersimpan sampai kamu klik "Simpan".')) return;
  document.getElementById('hrTemplateText').value = hrTemplateDefaultCache;
}

async function hrSimpanTemplate() {
  const template = document.getElementById('hrTemplateText').value;
  const statusBox = document.getElementById('hrTemplateStatus');

  if (!template.trim()) {
    statusBox.innerHTML = '<div class="status-box status-fail">⚠️ Template gak boleh kosong.</div>';
    return;
  }

  statusBox.innerHTML = '<span class="spinner-inline"></span>Menyimpan...';

  try {
    const res = await fetch(VERCEL_BACKEND_URL + '/hr', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'simpanLaporanTemplate', token: tokenHR(), template })
    });
    const data = await res.json();

    if (data.result !== 'success') {
      statusBox.innerHTML = '<div class="status-box status-fail">⚠️ ' + escapeHtml(data.message || 'Gagal menyimpan.') + '</div>';
      return;
    }

    // Cache template di sesi Laporan WA sekarang basi, paksa fetch ulang
    // lain kali "Laporan ke WA" dibuka biar langsung kepake yang baru.
    hrLaporanTemplateCache = null;

    statusBox.innerHTML = '<div class="status-box status-ok">✅ Tersimpan</div>';
  } catch (e) {
    statusBox.innerHTML = '<div class="status-box status-fail">⚠️ Gagal koneksi ke server.</div>';
  }
}

function hrSalinLaporan() {
  const ta = document.getElementById('hrLaporanText');
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, 99999);
  const toast = document.getElementById('hrCopyToast');
  navigator.clipboard.writeText(ta.value).then(() => {
    toast.textContent = '✓ Teks tersalin';
  }).catch(() => {
    try {
      document.execCommand('copy');
      toast.textContent = '✓ Teks tersalin';
    } catch (e) {
      toast.textContent = 'Gagal menyalin, silakan copy manual';
    }
  });
}

function hrKirimKeWA() {
  const text = document.getElementById('hrLaporanText').value;
  const url = 'https://wa.me/?text=' + encodeURIComponent(text);
  window.open(url, '_blank');
}

// ===== MODAL DETAIL ABSEN (foto, lokasi, status QR) =====

// Ubah link "Google Drive file" (dari file.getUrl()) jadi link gambar yang bisa
// langsung dipakai di tag <img>. Syarat: file di folder harus di-share "Anyone with the link".
function hrDriveThumbUrl(driveUrl) {
  if (!driveUrl) return '';
  const match = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return driveUrl;
  return 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w1000';
}

function hrRenderFotoBox(url, emptyText) {
  if (!url) {
    return '<div class="hr-modal-photo-empty">' + emptyText + '</div>';
  }
  const thumb = hrDriveThumbUrl(url);
  return '<img class="hr-modal-photo" src="' + thumb + '" alt="Foto absen" '
    + 'onerror="this.outerHTML=\'<div class=&quot;hr-modal-photo-empty&quot;>Foto belum bisa ditampilkan langsung. Buka manual lewat link di bawah.</div>\'">'
    + '<a class="hr-modal-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">Buka foto asli di Google Drive ↗</a>';
}

function hrOpenAbsenDetail(idx) {
  const row = hrDetailRowsFlat[idx];
  if (!row) return;

  const jam = String(row.jam).padStart(2, '0') + ':' + String(row.menit).padStart(2, '0');
  document.getElementById('hrAmTitle').textContent = row.jenisAbsen + ' • ' + jam;

  // Foto selfie (atau screenshot kalau jenisnya Sakit dan tidak ada foto selfie)
  const isSakitRow = row.jenisAbsen === 'Sakit';
  document.getElementById('hrAmFotoBox').innerHTML = hrRenderFotoBox(
    row.fotoSelfie,
    isSakitRow ? 'Tidak ada selfie (absen Sakit).' : 'Tidak ada foto untuk absen ini.'
  );

  // Lokasi GPS
  const lokasiBox = document.getElementById('hrAmLokasiBox');
  if (row.latitude != null && row.longitude != null && row.latitude !== '' && row.longitude !== '') {
    const mapsUrl = 'https://www.google.com/maps?q=' + row.latitude + ',' + row.longitude;
    const embedUrl = 'https://maps.google.com/maps?q=' + row.latitude + ',' + row.longitude + '&z=16&output=embed';
    lokasiBox.innerHTML = `
      <iframe class="hr-modal-map" src="${embedUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      <div class="hr-modal-row"><div class="k">Latitude</div><div class="v">${escapeHtml(String(row.latitude))}</div></div>
      <div class="hr-modal-row"><div class="k">Longitude</div><div class="v">${escapeHtml(String(row.longitude))}</div></div>
      <a class="hr-modal-link" href="${mapsUrl}" target="_blank" rel="noopener">Buka lokasi di Google Maps ↗</a>`;
  } else {
    lokasiBox.innerHTML = '<div class="hr-modal-photo-empty">Lokasi tidak tercatat untuk absen ini.</div>';
  }

  // Lokasi QR Code
  const qrBox = document.getElementById('hrAmQrBox');
  if (row.statusQr || row.hasilQr) {
    const isValid = row.statusQr === 'VALID';
    qrBox.innerHTML = `
      <div class="hr-modal-row">
        <div class="k">Lokasi Scan</div>
        <div class="v">${escapeHtml(row.hasilQr || '-')}</div>
      </div>
      <div class="hr-modal-row">
        <div class="k">Validitas</div>
        <div class="v ${isValid ? 'hr-qr-valid' : 'hr-qr-invalid'}">${escapeHtml(row.statusQr || '-')}</div>
      </div>`;
  } else {
    qrBox.innerHTML = '<div class="hr-modal-photo-empty">Absen ini tidak menggunakan QR code.</div>';
  }

  // Screenshot bukti sakit
  const ssSection = document.getElementById('hrAmScreenshotSection');
  if (row.screenshotBukti) {
    ssSection.style.display = 'block';
    document.getElementById('hrAmScreenshotBox').innerHTML = hrRenderFotoBox(row.screenshotBukti, 'Tidak ada screenshot.');
  } else {
    ssSection.style.display = 'none';
  }

  // Keterangan
  const ketSection = document.getElementById('hrAmKeteranganSection');
  if (row.keterangan) {
    ketSection.style.display = 'block';
    document.getElementById('hrAmKeteranganBox').textContent = row.keterangan;
  } else {
    ketSection.style.display = 'none';
  }

  document.getElementById('hrAbsenModalBackdrop').classList.add('active');
}

function hrCloseAbsenDetail() {
  document.getElementById('hrAbsenModalBackdrop').classList.remove('active');
}

// Daftarkan service worker biar app ini bisa di-"Install" ke home screen (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW gagal register:', err));
  });
}
