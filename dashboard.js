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
    loadedAt: null, loading: false, error: null, saving: new Set(), win: null,
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
  function rowHealth(rec) {
    const hs = PLATS.map(k => platHealth(rec, k)).filter(h => h !== 'na');
    if (!hs.length) return 'pend';
    if (hs.includes('bad')) return 'bad';
    if (hs.includes('pend')) return 'pend';
    return 'ok';
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
    const w = $('dashWeek'); w.innerHTML = '';
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
      w.dataset.scrolled = '1';
      requestAnimationFrame(() => { w.scrollLeft = Math.max(0, selEl.offsetLeft - w.clientWidth / 2 + selEl.offsetWidth / 2); });
    }
  }

  function renderSummary(list) {
    const w = $('dashSummary'); w.innerHTML = '';
    const bad = list.filter(r => rowHealth(r) === 'bad').length;
    const t = el('div', 'dash-stat' + (bad ? ' alert' : ''));
    t.appendChild(el('div', 'dash-stat-k', 'Telat / Gagal'));
    t.appendChild(el('div', 'dash-stat-v', String(bad)));
    t.appendChild(el('div', 'dash-stat-l', `dari ${list.length} konten`));
    w.appendChild(t);
    PLATS.forEach(k => {
      const slots = list.filter(r => platHealth(r, k) !== 'na');
      const c = { Uploaded: 0, Scheduled: 0, Acc: 0, Gagal: 0, kosong: 0 };
      slots.forEach(r => { const s = r.plat[k].status; if (c[s] != null) c[s]++; else c.kosong++; });
      const n = slots.length || 1;
      const s = el('div', 'dash-stat');
      s.appendChild(el('div', 'dash-stat-k', k));
      const v = el('div', 'dash-stat-v', String(c.Uploaded + c.Scheduled));
      v.appendChild(el('small', null, `/${slots.length}`));
      s.appendChild(v);
      const bar = el('div', 'dash-bar');
      [['Uploaded', 'up'], ['Scheduled', 'sch'], ['Acc', 'acc'], ['Gagal', 'gagal']].forEach(([key, cl]) => {
        if (!c[key]) return; const i = el('i', cl); i.style.width = (c[key] / n * 100) + '%'; bar.appendChild(i);
      });
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', `${c.Uploaded} uploaded, ${c.Scheduled} scheduled, ${c.Acc} acc, ${c.Gagal} gagal, ${c.kosong} belum`);
      s.appendChild(bar);
      w.appendChild(s);
    });
  }

  const JENIS_CLS = { 'Video Panjang': 'vpj', 'Video Pendek': 'vpd', 'Desain': 'dsn', 'Foto': 'foto' };
  const HEALTH_LABEL = { bad: 'Telat', pend: 'Belum', ok: 'Beres' };
  function firstJam(r) { const m = PLATS.map(k => r.plat[k].jam && r.plat[k].jam.min).filter(v => v != null); return m.length ? Math.min(...m) : 9999; }

  function rowCard(r) {
    const h = rowHealth(r);
    const card = el('article', 'card dash-row');
    const top = el('div', 'dash-row-top');
    const tags = el('div', 'dash-tags');
    if (r.akun) tags.appendChild(el('span', 'tag-badge dash-akun', r.akun));
    if (r.jenis) tags.appendChild(el('span', 'tag-badge dash-jenis ' + (JENIS_CLS[r.jenis] || ''), r.jenis));
    if (r.segmen) tags.appendChild(el('span', 'tag-badge dash-seg', r.segmen));
    top.appendChild(tags);
    top.appendChild(el('span', 'dash-health ' + h, HEALTH_LABEL[h]));
    card.appendChild(top);
    card.appendChild(el('h3', 'dash-title', r.title));
    const crew = [['Producer', r.producer], ['Desainer', r.designer], ['Editor', r.editor]].filter(c => c[1]);
    if (crew.length) {
      const c = el('div', 'dash-crew');
      crew.forEach(([k, v], i) => { if (i) c.appendChild(document.createTextNode(' · ')); c.appendChild(document.createTextNode(k + ' ')); c.appendChild(el('b', null, v)); });
      card.appendChild(c);
    }
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
      state.loadedAt = new Date(); state.error = null;
      if (manual) toast('Data terbaru udah ditarik.');
    } catch (err) {
      if (err.code === 'UNAUTHORIZED') { state.loading = false; sesiHabisDariSini(); return; }
      state.error = explain(err);
      if (state.loadedAt) toast(state.error.title + '. ' + state.error.body, true);
    } finally { state.loading = false; if (isPageActive()) render(); }
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
