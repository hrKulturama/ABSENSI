// =====================================================================
// DASHBOARD KONTEN (Kontrol Upload) — tab "Dashboard" di app Absensi.
//
// Baca & ubah STATUS YT/IG/TT di tab KALENDER KONTEN (DASHBOARD KULTURAMA
// V1) lewat project Apps Script standalone "Kontrol Upload"
// (kode: apps-script/kontrol-upload.gs). Bukan bagian dari backend Absensi.
//
// Auth: token login Absensi (localStorage 'absensi_token'), diverifikasi
// backend pakai HR_TOKEN_SECRET yang sama. Cuma role kreatif / hr / admin;
// nav "Dashboard" disembunyiin buat role lain.
//
// Semua isi file ini dibungkus IIFE biar gak nabrak variabel global app.js.
// Yang diekspor cuma window.renderDashboard & window.updateDashboardNav.
// =====================================================================
(() => {
  const KONTROL_API_URL = 'https://script.google.com/macros/s/AKfycbzzt7PwgGJXz00j8j23CsJl0RPM6OAaRqsP2EcC2h-V-NigT0jhh51RlnnJikbS-iCWaQ/exec';
  const ROLE_BOLEH = ['kreatif', 'hr', 'admin'];

  const STATUS_OPTS = ['Acc', 'Scheduled', 'Uploaded', 'Gagal'];
  const PLATS = ['YT', 'IG', 'TT'];
  const JENIS = ['Semua', 'Video Panjang', 'Video Pendek', 'Desain', 'Foto'];
  const AKUN = ['Semua', 'SP', 'FP', 'NSP'];
  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const DAYS_BACK = 7, DAYS_AHEAD = 14;           // chip tanggal yang ditampilkan
  const FETCH_BACK = 10, FETCH_AHEAD = 20;        // rentang data yang ditarik (maks 62 hari)
  const STALE_MS = 60 * 1000;

  const $ = (id) => document.getElementById(id);
  const state = {
    rows: [], date: todayJkt(), jenis: 'Semua', akun: 'Semua', onlyProblem: false,
    loadedAt: null, loading: false, error: null, saving: new Set(), win: null, options: {}, fields: null, backendOld: false,
  };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  try {
    const s = JSON.parse(lsGet('dashboard_prefs') || '{}');
    if (JENIS.includes(s.jenis)) state.jenis = s.jenis;
    if (AKUN.includes(s.akun)) state.akun = s.akun;
    state.onlyProblem = !!s.onlyProblem;
  } catch (e) {}
  function savePrefs() { lsSet('dashboard_prefs', JSON.stringify({ jenis: state.jenis, akun: state.akun, onlyProblem: state.onlyProblem })); }

  const tokenNow = () => lsGet('absensi_token') || '';
  const roleNow = () => String(lsGet('absensi_role') || '').toLowerCase();
  const isPageActive = () => { const p = $('page-dashboard'); return !!(p && p.classList.contains('active')); };

  // ---------- tanggal (selalu WIB) ----------
  function todayJkt() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function nowJktMinutes() { const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number); return h * 60 + m; }
  function iso(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
  function shiftDate(isoStr, n) { const [y, m, d] = isoStr.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n)); return iso(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()); }
  function fmtDay(isoStr) { const [y, m, d] = isoStr.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return { hari: HARI[dt.getUTCDay()], tgl: d, bln: BULAN[m - 1], y }; }
  function parseJam(v) { const s = String(v || '').trim(); if (!s) return null; const m = s.match(/^(\d{1,2})[.:](\d{2})/); if (!m) return { label: s, min: null }; return { label: `${m[1].padStart(2, '0')}.${m[2]}`, min: +m[1] * 60 + +m[2] }; }

  function toRecord(r) {
    return {
      rowNum: r.row, date: r.date, title: r.title, akun: (r.akun || '').trim(), segmen: (r.segmen || '').trim(), jenis: (r.jenis || '').trim(),
      producer: r.producer || '', designer: r.designer || '', editor: r.editor || '', catatan: (r.catatan || '').trim(),
      production: r.production === 'done',
      productionMark: r.production || '',
      // semua field baris ini (key = nama field dari backend, lihat FIELDS di bawah).
      // Backend versi lama belum ngirim `f` — isi dari field yang ada biar detail gak kosong.
      f: r.f || { judul: r.title || '', akun: r.akun || '', segmen: r.segmen || '', jenis: r.jenis || '',
        jamYT: r.jamYT || '', jamIG: r.jamIG || '', jamTT: r.jamTT || '', producer: r.producer || '',
        designer: r.designer || '', editor: r.editor || '', statusYT: r.statusYT || '', statusIG: r.statusIG || '',
        statusTT: r.statusTT || '', catatan: r.catatan || '' },
      plat: {
        YT: { jam: parseJam(r.jamYT), status: (r.statusYT || '').trim() },
        IG: { jam: parseJam(r.jamIG), status: (r.statusIG || '').trim() },
        TT: { jam: parseJam(r.jamTT), status: (r.statusTT || '').trim() },
      },
    };
  }

  // ---------- status ----------
  function isLate(rec, key) {
    const p = rec.plat[key];
    if (p.status === 'Uploaded' || p.status === 'Scheduled' || !p.jam) return false;
    const today = todayJkt();
    if (rec.date < today) return true;
    if (rec.date === today && p.jam.min != null) return nowJktMinutes() > p.jam.min;
    return false;
  }
  // "na" = gak ada slot di platform itu; "ok" / "pend" / "bad"
  function platHealth(rec, key) {
    const p = rec.plat[key];
    if (!p.jam && !p.status) return 'na';
    if (p.status === 'Gagal') return 'bad';
    if (p.status === 'Uploaded' || p.status === 'Scheduled') return 'ok';
    return isLate(rec, key) ? 'bad' : 'pend';
  }
  // Beres / belum ditentukan kolom PRODUCTION (centang = beres).
  // Yang belum beres dan ada platform lewat jam tayang / Gagal ditandai "Telat".
  function rowHealth(rec) {
    if (rec.production) return 'ok';
    const late = PLATS.some(k => platHealth(rec, k) === 'bad');
    return late ? 'bad' : 'pend';
  }
  function filtered(date) {
    return state.rows.filter(r => r.date === date
      && (state.jenis === 'Semua' || r.jenis === state.jenis)
      && (state.akun === 'Semua' || r.akun === state.akun));
  }
  const inWindow = (d) => !!(state.win && d >= state.win.from && d <= state.win.to);

  // ---------- render ----------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function renderChips() {
    const mk = (wrapId, list, cur, set) => {
      const w = $(wrapId); w.innerHTML = '';
      list.forEach(v => {
        const b = el('button', 'dash-chip', v); b.type = 'button';
        b.setAttribute('aria-pressed', cur === v ? 'true' : 'false');
        b.onclick = () => { set(v); savePrefs(); render(); };
        w.appendChild(b);
      });
    };
    mk('dashJenis', JENIS, state.jenis, v => state.jenis = v);
    mk('dashAkun', AKUN, state.akun, v => state.akun = v);
  }

  function renderWeek() {
    const w = $('dashWeek');
    const prevScroll = w.scrollLeft; // dikosongin = scrollLeft ke-reset ke 0, jadi disimpan dulu
    w.innerHTML = '';
    const today = todayJkt();
    const start = shiftDate(today, -DAYS_BACK);
    let selEl = null;
    for (let i = 0; i <= DAYS_BACK + DAYS_AHEAD; i++) {
      const d = shiftDate(start, i); const f = fmtDay(d);
      const list = filtered(d);
      const ready = state.loadedAt && inWindow(d);
      const bad = list.filter(r => rowHealth(r) === 'bad').length;
      const open = list.filter(r => rowHealth(r) !== 'ok').length;
      let st = '', cls = '';
      if (ready && list.length) {
        if (bad) { st = `${bad} telat`; cls = 'bad'; }
        else if (open) { st = `${open} belum`; cls = 'pend'; }
        else { st = 'beres'; cls = 'ok'; }
      }
      const b = el('button', 'dash-day' + (d === state.date ? ' selected' : '') + (d === today ? ' today' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'dash-day-name', d === today ? 'Hari ini' : `${f.hari} · ${f.bln}`));
      b.appendChild(el('span', 'dash-day-num', String(f.tgl)));
      b.appendChild(el('span', 'dash-day-count', ready ? `${list.length} konten` : '·'));
      const s = el('span', 'dash-day-st ' + cls, st || ' '); b.appendChild(s);
      b.setAttribute('aria-label', `${f.hari} ${f.tgl} ${f.bln}${ready ? `: ${list.length} konten${st ? ', ' + st : ''}` : ''}`);
      if (d === state.date) { b.setAttribute('aria-current', 'date'); selEl = b; }
      b.onclick = () => { state.date = d; render(); };
      w.appendChild(b);
    }
    if (selEl && !w.dataset.scrolled) {
      // Pertama kali dibuka: tengahkan tanggal yang dipilih (biasanya hari ini).
      w.dataset.scrolled = '1';
      // Ambil ulang elemennya di sini: strip bisa udah di-render ulang sebelum frame ini jalan.
      requestAnimationFrame(() => {
        const cur = w.querySelector('.dash-day.selected'); if (!cur) return;
        w.scrollLeft = Math.max(0, cur.offsetLeft - w.offsetLeft - w.clientWidth / 2 + cur.offsetWidth / 2);
      });
    } else {
      w.scrollLeft = prevScroll;
    }
  }

  // Ringkasan: satu kartu kecil — Production, Telat, lalu YT/IG/TT (Scheduled+Uploaded / slot).
  function renderSummary(list) {
    const w = $('dashSummary'); w.innerHTML = '';
    const card = el('div', 'dash-sum');
    const item = (k, v, total, cls) => {
      const it = el('div', 'dash-sum-i' + (cls ? ' ' + cls : ''));
      it.appendChild(el('span', 'dash-sum-k', k));
      const val = el('span', 'dash-sum-v', String(v));
      if (total != null) val.appendChild(el('small', null, '/' + total));
      it.appendChild(val);
      card.appendChild(it);
    };
    const done = list.filter(r => r.production).length;
    const late = list.filter(r => rowHealth(r) === 'bad').length;
    item('Production', done, list.length, list.length && done === list.length ? 'ok' : '');
    item('Telat', late, null, late ? 'bad' : '');
    PLATS.forEach(k => {
      const slots = list.filter(r => platHealth(r, k) !== 'na');
      const up = slots.filter(r => r.plat[k].status === 'Uploaded' || r.plat[k].status === 'Scheduled').length;
      item(k, up, slots.length);
    });
    w.appendChild(card);
  }

  const JENIS_CLS = { 'Video Panjang': 'vpj', 'Video Pendek': 'vpd', 'Desain': 'dsn', 'Foto': 'foto' };
  const HEALTH_LABEL = { bad: 'Telat', pend: 'Belum', ok: 'Beres' };
  function firstJam(r) { const m = PLATS.map(k => r.plat[k].jam && r.plat[k].jam.min).filter(v => v != null); return m.length ? Math.min(...m) : 9999; }

  function rowCard(r) {
    const h = rowHealth(r);
    const card = el('article', 'card dash-row dash-row-click');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Lihat detail ' + r.title);
    card.onclick = (e) => { if (e.target.closest('.dash-plats')) return; openDetail(r.rowNum); };
    card.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); openDetail(r.rowNum); } };
    const top = el('div', 'dash-row-top');
    const tags = el('div', 'dash-tags');
    if (r.akun) tags.appendChild(el('span', 'tag-badge dash-akun', r.akun));
    if (r.jenis) tags.appendChild(el('span', 'tag-badge dash-jenis ' + (JENIS_CLS[r.jenis] || ''), r.jenis));
    if (r.segmen) tags.appendChild(el('span', 'tag-badge dash-seg', r.segmen));
    top.appendChild(tags);
    top.appendChild(el('span', 'dash-health ' + h, HEALTH_LABEL[h]));
    card.appendChild(top);
    const th = el('div', 'dash-title-row');
    th.appendChild(el('h3', 'dash-title', r.title));
    th.appendChild(el('span', 'dash-more', 'Detail ›'));
    card.appendChild(th);
    // Baris kecil: crew + status kolom PRODUCTION (✅ / ❌ / — kalau kosong)
    const prodVal = r.production ? '✅' : (r.productionMark === 'no' ? '❌' : '—');
    const crew = [['Producer', r.producer], ['Desainer', r.designer], ['Editor', r.editor]].filter(c => c[1]).concat([['Production', prodVal]]);
    const c = el('div', 'dash-crew');
    crew.forEach(([k, v], i) => { if (i) c.appendChild(document.createTextNode(' · ')); c.appendChild(document.createTextNode(k + ' ')); c.appendChild(el('b', null, v)); });
    card.appendChild(c);
    if (r.catatan) card.appendChild(el('div', 'dash-note', r.catatan));

    const plats = el('div', 'dash-plats');
    PLATS.forEach(k => {
      const pd = r.plat[k];
      const box = el('div', 'dash-plat' + (platHealth(r, k) === 'na' ? ' na' : ''));
      const lab = el('div', 'dash-plat-l');
      lab.appendChild(el('span', null, k + (pd.jam ? ' · ' + pd.jam.label : '')));
      if (isLate(r, k)) lab.appendChild(el('span', 'late', 'TELAT'));
      const sel = el('select', 'dash-sel ' + (STATUS_OPTS.includes(pd.status) ? 's-' + pd.status.toLowerCase() : 's-empty'));
      sel.id = `dash-${r.rowNum}-${k}`;
      sel.setAttribute('aria-label', `Status ${k} untuk ${r.title}`);
      const opts = [''].concat(STATUS_OPTS); if (pd.status && !opts.includes(pd.status)) opts.push(pd.status);
      opts.forEach(o => { const op = el('option', null, o || (pd.jam ? 'Belum' : '—')); op.value = o; sel.appendChild(op); });
      sel.value = pd.status;
      if (state.saving.has(`${r.rowNum}-${k}`)) sel.disabled = true;
      sel.onchange = () => saveStatus(r, k, sel.value, sel);
      box.appendChild(lab); box.appendChild(sel); plats.appendChild(box);
    });
    card.appendChild(plats);
    return card;
  }

  function renderRows(list) {
    const w = $('dashRows'); w.innerHTML = '';
    const f = fmtDay(state.date);
    $('dashListTitle').textContent = `${f.hari}, ${f.tgl} ${f.bln} ${f.y}`;
    if (state.error && !state.loadedAt) {
      const e = el('div', 'card dash-msg err');
      e.appendChild(el('b', null, state.error.title));
      e.appendChild(el('div', null, state.error.body));
      w.appendChild(e); return;
    }
    if (!state.loadedAt || !inWindow(state.date)) { w.appendChild(el('div', 'loading-text', state.loading ? 'Memuat konten…' : 'Data tanggal ini belum dimuat.')); return; }
    let shown = state.onlyProblem ? list.filter(r => rowHealth(r) !== 'ok') : list;
    const order = { bad: 0, pend: 1, ok: 2 };
    shown = shown.slice().sort((a, b) => order[rowHealth(a)] - order[rowHealth(b)] || firstJam(a) - firstJam(b));
    if (!shown.length) {
      w.appendChild(el('div', 'coming-soon-card dash-empty', list.length ? 'Semua konten di tanggal ini udah Scheduled/Uploaded.' : 'Belum ada konten di KALENDER KONTEN untuk tanggal & filter ini.'));
      return;
    }
    shown.forEach(r => w.appendChild(rowCard(r)));
  }

  function renderSync() {
    const l = $('dashSync');
    if (state.loading) l.textContent = 'Sinkron dengan KALENDER KONTEN…';
    else if (state.loadedAt) l.textContent = 'Live dari KALENDER KONTEN · update ' + new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(state.loadedAt) + ' WIB';
    else l.textContent = state.error ? 'Gagal sinkron' : 'Memuat…';
    $('dashRefresh').disabled = state.loading;
  }

  function render() {
    if (!$('page-dashboard')) return;
    $('dashOnlyProblem').checked = state.onlyProblem;
    renderChips(); renderWeek(); renderSync();
    const list = filtered(state.date);
    renderSummary(list); renderRows(list);
  }

  let toastT;
  function toast(msg, bad) {
    const t = $('dashToast'); t.textContent = msg;
    t.className = 'dash-toast' + (bad ? ' bad' : '');
    t.style.display = 'block';
    clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; }, 3500);
  }

  // ---------- backend ----------
  function ApiError(code, message) { const e = new Error(message); e.code = code; return e; }
  async function api(method, params) {
    let res;
    try {
      if (method === 'GET') {
        const q = new URLSearchParams(Object.assign({}, params, { token: tokenNow() }));
        res = await fetch(`${KONTROL_API_URL}?${q}`);
      } else {
        res = await fetch(KONTROL_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({}, params, { token: tokenNow() })) });
      }
    } catch (e) { throw ApiError('NETWORK', 'Nggak bisa nyambung ke server. Cek internet kamu.'); }
    let data; try { data = await res.json(); } catch (e) { throw ApiError('SERVER_ERROR', 'Respons server nggak kebaca.'); }
    if (!data.ok) throw ApiError(data.code || 'SERVER_ERROR', data.message || 'Server error');
    return data;
  }
  function explain(err) {
    switch (err.code) {
      case 'SETUP': return { title: 'Backend belum selesai disetel', body: err.message };
      case 'FORBIDDEN': return { title: 'Akun kamu nggak punya akses', body: 'Dashboard cuma buat role Kreatif, HR, dan admin.' };
      case 'NETWORK': return { title: 'Koneksi putus', body: err.message };
      default: return { title: 'Gagal ambil data', body: err.message };
    }
  }
  function sesiHabisDariSini() {
    // Sama seperti apiGet() di app.js: token ditolak = sesi habis, balik ke gerbang PIN.
    if (typeof window.sesiHabis === 'function') window.sesiHabis();
  }

  async function load(manual) {
    if (state.loading || !tokenNow()) return;
    state.loading = true; renderSync();
    const today = todayJkt();
    const win = { from: shiftDate(today, -FETCH_BACK), to: shiftDate(today, FETCH_AHEAD) };
    try {
      const data = await api('GET', { action: 'list', from: win.from, to: win.to });
      state.rows = data.rows.map(toRecord); state.win = win;
      if (data.options) state.options = data.options;
      if (Array.isArray(data.fields)) { state.fields = data.fields; state.backendOld = false; }
      else if (!state.backendOld) {
        // Apps Script belum di-deploy versi baru (gak ada daftar field / fitur edit).
        state.backendOld = true;
        toast('Backend Apps Script masih versi lama. Detail belum lengkap & edit belum bisa sampai di-deploy ulang.', true);
      }
      state.loadedAt = new Date(); state.error = null;
      if (manual) toast('Data terbaru udah ditarik.');
    } catch (err) {
      if (err.code === 'UNAUTHORIZED') { state.loading = false; sesiHabisDariSini(); return; }
      state.error = explain(err);
      if (state.loadedAt) toast(state.error.title + '. ' + state.error.body, true);
    } finally { state.loading = false; if (isPageActive()) render(); if (detail.rowNum != null && !detail.editing) renderSheet(); }
  }

  async function saveStatus(rec, plat, value, sel) {
    const key = `${rec.rowNum}-${plat}`; const prev = rec.plat[plat].status;
    state.saving.add(key); sel.disabled = true;
    try {
      await api('POST', { action: 'setStatus', row: rec.rowNum, platform: plat, value: value, title: rec.title, date: rec.date });
      rec.plat[plat].status = value;
      toast(`${plat} “${rec.title.length > 36 ? rec.title.slice(0, 36) + '…' : rec.title}” → ${value || 'kosong'}`);
    } catch (err) {
      rec.plat[plat].status = prev;
      if (err.code === 'ROW_MOVED') { state.saving.delete(key); toast('Baris di sheet udah bergeser. Data di-refresh, coba ubah lagi.', true); load(false); return; }
      if (err.code === 'UNAUTHORIZED') { state.saving.delete(key); sesiHabisDariSini(); return; }
      if (err.code === 'NETWORK') toast('Nggak yakin status tersimpan. Tap ↻ buat cek.', true);
      else toast('Status nggak tersimpan. ' + (explain(err).title) + '.', true);
    } finally { state.saving.delete(key); if (isPageActive()) render(); }
  }


  // =====================================================================
  // DETAIL + EDIT KONTEN (panel dari bawah). Kolom = urutan KALENDER KONTEN A..AE.
  // =====================================================================
  // k = key field dari backend (dicocokkan ke header KALENDER KONTEN, bukan posisi kolom).
  const FIELDS = [
    { k: 'judul',      label: 'Judul konten', type: 'textarea', group: 'Konten', required: true },
    { k: 'akun',       label: 'Akun',          type: 'select', group: 'Konten' },
    { k: 'jenis',      label: 'Jenis konten',  type: 'select', group: 'Konten' },
    { k: 'segmen',     label: 'Segmen',        type: 'select', group: 'Konten' },
    { k: 'tanggal',    label: 'Tanggal',       type: 'date',   group: 'Jadwal' },
    { k: 'jamYT',      label: 'Jam up YT',     type: 'select', group: 'Jadwal' },
    { k: 'jamIG',      label: 'Jam up IG',     type: 'select', group: 'Jadwal' },
    { k: 'jamTT',      label: 'Jam up TT',     type: 'select', group: 'Jadwal' },
    { k: 'jamFB',      label: 'Jam up FB',     type: 'select', group: 'Jadwal' },
    { k: 'producer',   label: 'Producer',      type: 'select', group: 'Tim' },
    { k: 'writing',    label: 'Writing',       type: 'select', group: 'Tim' },
    { k: 'shooting',   label: 'Shooting',      type: 'select', group: 'Tim' },
    { k: 'designer',   label: 'Desainer',      type: 'select', group: 'Tim' },
    { k: 'editor',     label: 'Editor',        type: 'select', group: 'Tim' },
    { k: 'talent1',    label: 'Talent 1',      type: 'select', group: 'Tim' },
    { k: 'talent2',    label: 'Talent 2',      type: 'select', group: 'Tim' },
    { k: 'production', label: 'Production',    type: 'select', group: 'Tim' },
    { k: 'statusYT',   label: 'Status YT',     type: 'select', group: 'Status upload' },
    { k: 'statusIG',   label: 'Status IG',     type: 'select', group: 'Status upload' },
    { k: 'statusTT',   label: 'Status TT',     type: 'select', group: 'Status upload' },
    { k: 'statusFB',   label: 'Status FB',     type: 'select', group: 'Status upload' },
    { k: 'postYT',     label: 'Post ID YT',    type: 'text',   group: 'Post ID' },
    { k: 'postIG',     label: 'Post ID IG',    type: 'text',   group: 'Post ID' },
    { k: 'postTT',     label: 'Post ID TT',    type: 'text',   group: 'Post ID' },
    { k: 'postFB',     label: 'Post ID FB',    type: 'text',   group: 'Post ID' },
    { k: 'brand',      label: 'Brand tap in',  type: 'select', group: 'Brand' },
    { k: 'catatan',    label: 'Catatan',       type: 'textarea', group: 'Catatan' },
    { k: 'eventId',    label: 'Event ID kalender', type: 'readonly', group: 'Lainnya' },
  ];
  const GROUPS = ['Konten', 'Jadwal', 'Tim', 'Status upload', 'Post ID', 'Brand', 'Catatan', 'Lainnya'];
  // Field yang kolomnya udah dihapus dari sheet otomatis gak ditampilin.
  const activeFields = () => FIELDS.filter(f => !state.fields || f.k === 'tanggal' || state.fields.includes(f.k));
  const detail = { rowNum: null, editing: false, saving: false };

  const findRec = (rowNum) => state.rows.find(r => r.rowNum === rowNum);
  const cellOf = (rec, k) => (k === 'tanggal' ? rec.date : String(rec.f[k] == null ? '' : rec.f[k]).trim());
  const optFor = (k) => state.options[k] || null;
  const splitMulti = (v) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);

  function ensureSheet() {
    let wrap = $('dashSheetWrap');
    if (wrap) return wrap;
    wrap = el('div', 'dash-sheet-wrap'); wrap.id = 'dashSheetWrap'; wrap.style.display = 'none';
    wrap.onclick = (e) => { if (e.target === wrap) closeDetail(); };
    const sh = el('div', 'dash-sheet'); sh.id = 'dashSheet';
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'dashSheetTitle');
    wrap.appendChild(sh);
    document.body.appendChild(wrap);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && wrap.style.display !== 'none') closeDetail(); });
    return wrap;
  }

  function openDetail(rowNum) {
    detail.rowNum = rowNum; detail.editing = false;
    const wrap = ensureSheet();
    wrap.style.display = 'flex';
    document.body.classList.add('dash-sheet-open');
    renderSheet();
    const sh = $('dashSheet'); sh.scrollTop = 0;
    setTimeout(() => { const b = sh.querySelector('.dash-sheet-close'); if (b) b.focus(); }, 0);
  }
  function closeDetail() {
    if (detail.saving) return;
    const wrap = $('dashSheetWrap'); if (wrap) wrap.style.display = 'none';
    document.body.classList.remove('dash-sheet-open');
    detail.rowNum = null; detail.editing = false;
  }

  function sheetHeader(rec, title) {
    const h = el('div', 'dash-sheet-head');
    const t = el('div', 'dash-sheet-titles');
    t.appendChild(el('div', 'home-eyebrow', title));
    const ttl = el('div', 'dash-sheet-title', rec.title || '(tanpa judul)'); ttl.id = 'dashSheetTitle';
    t.appendChild(ttl);
    h.appendChild(t);
    const x = el('button', 'dash-sheet-close', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Tutup');
    x.onclick = closeDetail;
    h.appendChild(x);
    return h;
  }

  function displayValue(f, rec) {
    if (f.k === 'tanggal') { const d = fmtDay(rec.date); return `${d.hari}, ${d.tgl} ${d.bln} ${d.y}`; }
    return cellOf(rec, f.k);
  }

  function renderSheet() {
    const sh = $('dashSheet'); if (!sh) return;
    const rec = findRec(detail.rowNum);
    sh.innerHTML = '';
    if (!rec) { sh.appendChild(el('div', 'loading-text', 'Konten ini udah nggak ada di data terbaru.')); return; }
    if (detail.editing) return renderEdit(sh, rec);

    sh.appendChild(sheetHeader(rec, 'Detail konten'));
    const tags = el('div', 'dash-tags dash-sheet-tags');
    if (rec.akun) tags.appendChild(el('span', 'tag-badge dash-akun', rec.akun));
    if (rec.jenis) tags.appendChild(el('span', 'tag-badge dash-jenis ' + (JENIS_CLS[rec.jenis] || ''), rec.jenis));
    const h = rowHealth(rec);
    tags.appendChild(el('span', 'dash-health ' + h, HEALTH_LABEL[h]));
    sh.appendChild(tags);

    GROUPS.forEach(g => {
      const fs = activeFields().filter(f => f.group === g && f.k !== 'judul');
      if (!fs.length) return;
      const box = el('section', 'dash-sec');
      box.appendChild(el('div', 'dash-sec-t', g));
      const dl = el('dl', 'dash-kv');
      fs.forEach(f => {
        const v = displayValue(f, rec);
        dl.appendChild(el('dt', null, f.label));
        const dd = el('dd', v ? '' : 'empty');
        if (v && f.type === 'url' && /^https?:\/\//i.test(v)) {
          const a = el('a', null, v); a.href = v; a.target = '_blank'; a.rel = 'noopener'; dd.appendChild(a);
        } else dd.textContent = v || '—';
        dl.appendChild(dd);
      });
      box.appendChild(dl);
      sh.appendChild(box);
    });

    if (state.backendOld) {
      sh.appendChild(el('p', 'dash-sheet-hint warn', 'Backend Apps Script masih versi lama, jadi detail belum lengkap dan konten belum bisa diedit. Deploy versi baru Apps Script Kontrol Upload dulu.'));
      return;
    }
    const act = el('div', 'dash-sheet-actions');
    const edit = el('button', 'btn', 'Edit konten'); edit.type = 'button';
    edit.onclick = () => { detail.editing = true; renderSheet(); $('dashSheet').scrollTop = 0; };
    act.appendChild(edit);
    sh.appendChild(act);
  }

  function fieldControl(f, rec) {
    const id = `dashF_${f.k}`;
    const cur = cellOf(rec, f.k);
    const wrap = el('div', 'dash-field' + (f.type === 'textarea' || (optFor(f.k) && optFor(f.k).multi) ? ' wide' : ''));
    const lab = el('label', null, f.label + (f.required ? ' *' : '')); lab.htmlFor = id;
    wrap.appendChild(lab);
    const opt = optFor(f.k);
    let ctl;
    if (f.type === 'readonly') {
      ctl = el('div', 'dash-ro', cur || '—'); ctl.id = id;
    } else if (f.type === 'date') {
      ctl = el('input'); ctl.type = 'date'; ctl.value = rec.date;
    } else if (f.type === 'textarea') {
      ctl = el('textarea'); ctl.value = cur; ctl.rows = f.k === 'judul' ? 2 : 3;
    } else if (f.type === 'select' && opt && opt.multi) {
      ctl = el('div', 'dash-multi'); ctl.setAttribute('role', 'group'); ctl.setAttribute('aria-label', f.label);
      const chosen = splitMulti(cur);
      const all = opt.values.slice(); chosen.forEach(c => { if (!all.includes(c)) all.push(c); });
      all.forEach(v => {
        const b = el('button', 'dash-chip', v); b.type = 'button';
        b.setAttribute('aria-pressed', chosen.includes(v) ? 'true' : 'false');
        b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
        ctl.appendChild(b);
      });
      lab.removeAttribute('for');
    } else if (f.type === 'select' && opt) {
      ctl = el('select');
      const vals = [''].concat(opt.values);
      const curOpt = vals.find(v => v.trim() === cur);
      if (cur && curOpt == null) vals.push(cur);
      vals.forEach(v => { const o = el('option', null, v || '—'); o.value = v; ctl.appendChild(o); });
      ctl.value = curOpt != null ? curOpt : cur;
    } else {
      ctl = el('input'); ctl.type = 'text'; ctl.value = cur;
    }
    if (ctl.tagName !== 'DIV') ctl.id = id;
    ctl.dataset.field = f.k;
    wrap.appendChild(ctl);
    return wrap;
  }

  function readControl(f) {
    const box = $('dashSheet').querySelector(`[data-field="${f.k}"]`);
    if (!box) return null;
    if (box.classList.contains('dash-multi')) {
      return Array.from(box.querySelectorAll('.dash-chip[aria-pressed="true"]')).map(b => b.textContent).join(', ');
    }
    if (box.classList.contains('dash-ro')) return null;
    return String(box.value == null ? '' : box.value).trim();
  }

  function renderEdit(sh, rec) {
    sh.appendChild(sheetHeader(rec, 'Edit konten'));
    sh.appendChild(el('p', 'dash-sheet-hint', 'Perubahan langsung ketulis ke KALENDER KONTEN setelah kamu tap Simpan.'));
    const form = el('form', 'dash-form');
    form.noValidate = true;
    GROUPS.forEach(g => {
      const fs = activeFields().filter(f => f.group === g);
      if (!fs.length) return;
      const box = el('div', 'dash-sec');
      box.setAttribute('role', 'group'); box.setAttribute('aria-label', g);
      box.appendChild(el('div', 'dash-sec-t', g));
      const grid = el('div', 'dash-fields');
      fs.forEach(f => grid.appendChild(fieldControl(f, rec)));
      box.appendChild(grid);
      form.appendChild(box);
    });
    const err = el('div', 'dash-form-err'); err.id = 'dashFormErr'; err.setAttribute('role', 'alert');
    form.appendChild(err);
    const act = el('div', 'dash-sheet-actions two');
    const cancel = el('button', 'btn btn-secondary', 'Batal'); cancel.type = 'button';
    cancel.onclick = () => { if (detail.saving) return; detail.editing = false; renderSheet(); };
    const save = el('button', 'btn', 'Simpan'); save.type = 'submit'; save.id = 'dashSaveBtn';
    act.appendChild(cancel); act.appendChild(save);
    form.appendChild(act);
    form.onsubmit = (e) => { e.preventDefault(); saveDetail(rec); };
    sh.appendChild(form);
  }

  async function saveDetail(rec) {
    if (detail.saving) return;
    const errBox = $('dashFormErr'); errBox.textContent = '';
    const changes = {};
    activeFields().forEach(f => {
      if (f.type === 'readonly') return;
      const v = readControl(f); if (v == null) return;
      if (v !== cellOf(rec, f.k)) changes[f.k] = v;
    });
    if (changes.judul !== undefined && !changes.judul) { errBox.textContent = 'Judul konten nggak boleh kosong.'; return; }
    if (changes.tanggal !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(changes.tanggal)) { errBox.textContent = 'Tanggal belum diisi.'; return; }
    if (!Object.keys(changes).length) { detail.editing = false; renderSheet(); toast('Nggak ada yang berubah.'); return; }

    detail.saving = true;
    const btn = $('dashSaveBtn'); btn.disabled = true; btn.textContent = 'Menyimpan…';
    try {
      const data = await api('POST', { action: 'updateRow', row: rec.rowNum, title: rec.title, date: rec.date, changes });
      const fresh = toRecord(data.row);
      const idx = state.rows.findIndex(r => r.rowNum === rec.rowNum);
      if (idx !== -1) state.rows[idx] = fresh; else state.rows.push(fresh);
      detail.saving = false; detail.editing = false;
      if (fresh.date !== state.date) {
        const d = fmtDay(fresh.date);
        toast(`Tersimpan. Konten pindah ke ${d.hari}, ${d.tgl} ${d.bln}.`);
      } else toast('Tersimpan ke KALENDER KONTEN.');
      render(); renderSheet();
    } catch (err) {
      detail.saving = false;
      if (err.code === 'UNAUTHORIZED') { closeDetail(); sesiHabisDariSini(); return; }
      if (err.code === 'ROW_MOVED') { errBox.textContent = 'Baris ini udah berubah di sheet (mungkin diedit orang lain). Tutup panel, tap ↻, lalu coba lagi.'; }
      else if (err.code === 'NETWORK') { errBox.textContent = 'Koneksi putus. Belum pasti tersimpan, cek lagi setelah tap ↻.'; }
      else errBox.textContent = 'Gagal menyimpan: ' + (err.message || 'error');
      btn.disabled = false; btn.textContent = 'Simpan';
    }
  }

  // ---------- hook ke app.js ----------
  // Dipanggil dari goPage('dashboard').
  window.renderDashboard = function () {
    if (!ROLE_BOLEH.includes(roleNow())) { if (typeof window.goPage === 'function') window.goPage('home'); return; }
    state.date = state.date || todayJkt();
    const w = $('dashWeek'); if (w) delete w.dataset.scrolled;
    render();
    if (!state.loadedAt || Date.now() - state.loadedAt.getTime() > STALE_MS) load(false);
  };

  // Dipanggil dari terapkanRoleKeUI() tiap kali sesi/role berubah.
  window.updateDashboardNav = function () {
    const nav = $('nav-dashboard'); if (!nav) return;
    const boleh = !!tokenNow() && ROLE_BOLEH.includes(roleNow());
    nav.style.display = boleh ? '' : 'none';
    if (!boleh) {
      state.rows = []; state.loadedAt = null; state.win = null; state.error = null;
      if (isPageActive() && typeof window.goPage === 'function') window.goPage('home');
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('page-dashboard')) return;
    $('dashRefresh').onclick = () => load(true);
    $('dashOnlyProblem').onchange = (e) => { state.onlyProblem = e.target.checked; savePrefs(); render(); };
    window.updateDashboardNav();
    // Link langsung: index.html#dashboard (dipakai kontrol.html lama).
    if (location.hash === '#dashboard') {
      setTimeout(() => {
        if (tokenNow() && ROLE_BOLEH.includes(roleNow()) && typeof window.goPage === 'function') window.goPage('dashboard');
      }, 0);
    }
  });

  // Refresh otomatis tiap 3 menit, cuma kalau tab Dashboard lagi dibuka.
  setInterval(() => {
    if (document.visibilityState === 'visible' && isPageActive() && !state.saving.size) load(false);
  }, 3 * 60 * 1000);
  // Hitung ulang tanda TELAT tiap menit.
  setInterval(() => { if (isPageActive() && state.loadedAt) render(); }, 60 * 1000);
})();
