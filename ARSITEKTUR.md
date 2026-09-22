# Arsitektur Backend — Absensi

Dokumen ini isinya status backend TIAP endpoint yang dipanggil app ini (`app.js`, `produksi.html`). Dibuat setelah insiden 2026-09-22: `submitAbsensi` diam-diam sempat nunjuk ke backend Vercel yang gagal untuk sebagian karyawan, dan baru kebuka lewat komplain karyawan — bukan lewat monitoring. Lihat aturan di bagian bawah supaya ini gak kejadian lagi.

## Dua repo GitHub — JANGAN salah edit

- **`hrKulturama/ABSENSI`** (repo ini) — **DIPAKAI**, ini yang aktif dan disebar ke seluruh karyawan sekarang. GitHub Pages: `https://hrkulturama.github.io/ABSENSI/`.
- **`oqaja/ABSENSI`** — **SUDAH TIDAK DIPAKAI**, peninggalan dari sebelum migrasi hosting ke akun `hrkulturama`. Repo & GitHub Pages lama-nya sengaja dibiarkan hidup sebagai rollback plan, TAPI tidak ada karyawan yang memakainya lagi. Kalau mau ubah apa pun soal Absensi, editnya di `hrKulturama/ABSENSI`, bukan di sini.

## Status tiap endpoint

| Endpoint | Backend saat ini | Status | Terakhir diverifikasi |
|---|---|---|---|
| `getKaryawan` | Vercel (`absensi-backend-ruby.vercel.app`) | Lengkap & terverifikasi — respons identik byte-for-byte dengan Apps Script | 2026-09-22 |
| `getProfil` | Vercel | Lengkap & terverifikasi — auth (token invalid → UNAUTHORIZED) konsisten dengan Apps Script | 2026-09-22 |
| `getAbsensi` | Vercel | Lengkap & terverifikasi — auth konsisten dengan Apps Script; sebelumnya (Tahap 2) sudah diverifikasi identik byte-for-byte dengan data asli | 2026-09-22 |
| `getLeaderboard` | Vercel | Lengkap & terverifikasi — auth konsisten dengan Apps Script; sebelumnya (Tahap 2) sudah diverifikasi identik dengan data asli | 2026-09-22 |
| `getPayroll` | Vercel | Lengkap & terverifikasi — auth konsisten dengan Apps Script; sebelumnya sudah diverifikasi identik byte-for-byte | 2026-09-22 |
| `getPayrollSemua` | Vercel (`/api/hr?action=getPayrollSemua`) | Lengkap & terverifikasi — auth konsisten dengan Apps Script | 2026-09-22 |
| `getRekapHR` | Vercel (`/api/hr?action=getRekapHR`) | Lengkap & terverifikasi — auth konsisten dengan Apps Script | 2026-09-22 |
| `getKaryawanHR` | Vercel (`/api/hr?action=getKaryawanHR`) | Lengkap & terverifikasi — auth konsisten dengan Apps Script | 2026-09-22 |
| `getLaporanTemplate` | Vercel (`/api/hr?action=getLaporanTemplate`) | Lengkap & terverifikasi — auth konsisten dengan Apps Script | 2026-09-22 |
| `simpanLaporanTemplate` | Vercel (`/api/hr`, POST) | Ada, kode lengkap (bukan stub) — belum ada tes live baru hari ini (POST tersimpan, resiko nulis CONFIG asli kalau dites sembarangan). Sudah pernah dites simpan+baca sukses saat Tahap 4 | 2026-09-14 (Tahap 4) |
| `hitungUlangSemuaSkor` | Vercel (`/api/hr`, POST) | Ada, kode lengkap (bukan stub) — belum dites ulang hari ini (POST ini menulis ulang seluruh sheet SKOR, sengaja gak diulang tanpa alasan). Sudah pernah dites identik 100% dengan data asli semua karyawan saat Tahap 4 | 2026-09-14 (Tahap 4) |
| `resetPin` | Vercel (`/api/hr`, POST) | Ada, kode lengkap secara struktur (pola sama persis dengan `simpanPinHash` yang sudah tervalidasi di `daftar`) — **TAPI belum pernah dites reset PIN beneran secara live** (cuma jalur error yang pernah dites). Resiko dianggap rendah tapi belum diverifikasi penuh | belum pernah (code review only) |
| `getSlipGajiPdf` | Vercel | Lengkap & terverifikasi — auth konsisten dengan Apps Script; render PDF sudah dites match dengan `getPayroll` saat Tahap 4 | 2026-09-22 |
| `daftar` | Apps Script (`SCRIPT_URL`) | Lengkap — tidak pernah masuk scope migrasi | — |
| `login` | Apps Script (`SCRIPT_URL`) | Lengkap — tidak pernah masuk scope migrasi | — |
| `hrLogin` | Apps Script (`SCRIPT_URL`) | Lengkap — tidak pernah masuk scope migrasi | — |
| `submitAbsensi` | **Apps Script (`SCRIPT_URL`)** — sengaja TETAP di sini, lihat keputusan di bawah | Lengkap (sistem lama, sudah bertahun-tahun jalan) | — |

Endpoint publik `getKaryawan` gak butuh token. Semua endpoint lain butuh token valid (hasil `login`/`hrLogin`) — sudah dicek: token tidak valid ditolak dengan pesan `UNAUTHORIZED` yang identik di Apps Script maupun Vercel, jadi tidak ada endpoint yang diam-diam menerima request tanpa otentikasi.

Catatan: `kreatif.html` dan bagian dashboard Produksi di `produksi.html` (`APPS_SCRIPT_URL`/`APPS_SCRIPT_URL_DASHBOARD`) manggil project Apps Script **LAIN** (dashboard Kreatif), di luar scope dokumen ini — bukan bagian dari sistem Absensi/Code.js yang dibahas di sini.

## Keputusan: `submitAbsensi` TETAP di Apps Script

Diputuskan 2026-09-22, sadar — bukan kelupaan atau technical debt yang belum sempat dikerjakan.

**Kronologi singkat:** `submitAbsensi` sempat dipindah ke backend Vercel (implementasi lengkap, sudah lewat verifikasi paralel sebelumnya), tapi gagal live untuk sebagian karyawan sehingga absen mereka tidak tercatat selama beberapa jam. Langsung di-rollback balik ke Apps Script (`SCRIPT_URL`) di commit `306fdfc`.

**Kenapa gak dicoba lagi:** Alasan awal migrasi ke Vercel (Apps Script kerasa lambat) sebagian besar sudah teratasi lewat optimasi lain (materialized view sheet `SKOR`, baca-2-tahap di beberapa endpoint) yang dikerjakan jauh sebelum eksperimen Vercel ini ada. Resiko melanjutkan migrasi alur paling kritis ini (satu-satunya jalur karyawan mencatat kehadiran, sekaligus upload foto ke Drive) tidak sebanding dengan manfaatnya sekarang.

**Status endpoint di Vercel:** `/api/submitAbsensi` **tidak dihapus**, tapi dinonaktifkan — sekarang selalu balikin HTTP 410 dengan pesan error jelas (`ENDPOINT_DISABLED`) kalau kepanggil, bukan lagi memproses request. Implementasi lengkapnya (yang sempat gagal live) disimpan di `reference/submitAbsensi.reference.js` di repo `Absensi-Vercel` untuk referensi nanti kalau migrasi ini mau dicoba lagi — file itu sengaja ditaruh di luar folder `api/` supaya Vercel tidak menjadikannya endpoint aktif.

Di frontend (`app.js`), satu-satunya jalur `submitAbsensi()` mengarah ke `SCRIPT_URL`. Tidak ada sisa kode yang masih memanggil `VERCEL_BACKEND_URL` untuk aksi ini.

## Aturan wajib ke depannya

**Kalau ada endpoint yang dipindah backend-nya (Apps Script ↔ Vercel), file ini WAJIB diupdate di commit yang sama — jangan dipisah, jangan ditunda.**

Insiden 2026-09-22 terjadi justru karena migrasi endpoint berjalan diam-diam tanpa dokumentasi terpusat yang gampang dicek — sampai ada yang komplain baru ketahuan separuh sistem sudah pindah backend. Update tabel di atas setiap kali:
- Endpoint baru dipindah ke Vercel, atau dibalikin ke Apps Script.
- Status verifikasi suatu endpoint berubah (baru dites live, atau ditemukan bug).
- Ada endpoint baru ditambahkan ke salah satu backend.
