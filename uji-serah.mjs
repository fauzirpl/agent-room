#!/usr/bin/env node
/* uji-serah.mjs :: catatan serah terima per proyek.
 *
 * Buku agenda sudah menyimpan jejak lintas sesi sejak lama, tapi tidak ada
 * yang menjahitnya: sesi yang baru masuk di folder yang sama tidak bisa
 * bertanya "tadi rekan seproyek menyentuh berkas apa, apa yang gagal, ada
 * yang masih menunggu paraf?". `/serah-terima` menjawab itu — DETERMINISTIK,
 * dari berkas yang sudah ada, tanpa LLM dan tanpa jaringan keluar.
 *
 * Justru karena tanpa model, tiap angkanya punya jawaban yang benar dan bisa
 * dituliskan lebih dulu. Uji KOTAK HITAM: `server.mjs` dinyalakan sebagai
 * proses sendiri di port bebas dengan SELURUH env data ke folder sementara,
 * buku agendanya ditulis sendiri baris demi baris, lalu rutenya ditanya.
 *
 * ---------------------------------------------------------------------------
 * Yang dijaga, dan kenapa masing-masing pantas dijaga:
 *
 *  1. Tiap sumbu dibaca dari `pre` MILIKNYA sendiri. Berkas dari Edit/Write,
 *     subperintah dari Bash, bacaan dari Read — tercampur satu saja dan
 *     "12 berkas disunting" jadi angka yang tidak berarti apa-apa.
 *  2. Yang gagal dihitung dari `post ok:false`, bukan dari `pre`. Kalau dari
 *     `pre`, angkanya selalu nol dan tidak ada yang sadar.
 *  3. Jendela jam benar-benar memotong, dan memotong dari `ts` — bukan dari
 *     nama berkas hari. Kasus 2 menaruh satu sesi di berkas KEMARIN dan
 *     memintanya lewat `jam=24`: kalau server cuma membuka hari ini, sesi itu
 *     hilang, dan hilangnya justru di jam paling penting (shift pagi membaca
 *     kerja shift malam). Stempelnya dihitung dari tengah malam LOKAL, bukan
 *     mundur tetap — `23 jam 50 menit` jatuh di hari yang SAMA kalau uji
 *     jalan jam 23.55, dan itu bukan hipotesis: harness ini pernah merah
 *     persis karena itu.
 *  4. Ringkasan dijumlah dari SEMUA sesi, daftarnya saja yang dipotong.
 *     Menjumlah dari daftar terpotong membuat kalimat pembukanya berbohong
 *     persis di hari tersibuk. Dan yang dipotong haruslah baris yang isinya
 *     nol lebih dulu: sesi yang cuma menyisakan `session-end` tidak menjawab
 *     apa pun, tapi urut murni-terbaru menaruhnya di puncak.
 * 4b. Subperintah git dibaca dari label yang bentuknya SUNGGUHAN dipakai:
 *     `rtk git …` dan `$(git …)`, bukan cuma `git` di awal baris. Waktu
 *     penjaganya masih menuntut awal baris atau `;&|`, 65 dari 158 label git
 *     di satu hari sungguhan terbuang. Kata yang mentok di ujung label
 *     terpotong dibuang — `dif` bukan perintah, ia potongan `diff`.
 *  5. Proyek lain tidak bocor. Rutenya terbuka tanpa token; "serah terima
 *     agent-room" yang memuat nama berkas proyek lain adalah kebocoran.
 *  6. `AGENT_ROOM_ISI=off` menghapus nama berkas dan subperintah, TAPI angka
 *     tetap benar.
 *  7. Teks bebas milik keadaan tertahan TIDAK ikut keluar. `butuhManusia`
 *     menyimpan label perintah yang sedang menunggu paraf; yang boleh lewat
 *     cuma sebab dan sejak kapan. Kasus 5 memasang KONTROL POSITIF untuk
 *     sentinel itu — perintahnya dibuktikan lebih dulu MASIH ADA di
 *     `/agenda`, berkas yang sama yang dibaca serahTerima(). Tanpa itu,
 *     sentinelnya hijau kapan saja datanya kebetulan kosong.
 *
 * Pakai:  node uji-serah.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');

const warna = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (n) => (s) => (warna ? '\x1b[' + n + 'm' + s + '\x1b[0m' : s);
const merah = c(31); const hijau = c(32); const abu = c(90); const tebal = c(1);

let periksa = 0; let gagal = 0;
const lulus = (t) => { periksa++; console.log('  ' + hijau('✓') + ' ' + t); };
const tolak = (t, ket) => {
  periksa++; gagal++;
  console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(String(ket).slice(0, 400)) : ''));
};
const benar = (t, syarat, ket) => { if (syarat) lulus(t); else tolak(t, ket || ''); };
const sama = (t, dapat, harap) => {
  if (dapat === harap) lulus(t + ' ' + abu('= ' + JSON.stringify(dapat)));
  else tolak(t, 'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harap));
};
const samaJson = (t, dapat, harap) => sama(t, JSON.stringify(dapat), JSON.stringify(harap));
const catatan = (t) => console.log('  ' + abu('! ' + t));
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ port --- */

function portBebas(mulai) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', () => resolve(portBebas(mulai + 1)));
    s.once('listening', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.listen(mulai, '127.0.0.1');
    setTimeout(() => reject(new Error('portBebas menggantung')), 5000).unref?.();
  });
}

/* --------------------------------------------------------------- sandbox --- */
/* Disalin dari uji-skp.mjs dengan sadar, bukan diimpor: tidak ada satu pun
   uji-*.mjs di repo ini yang mengekspor apa pun. Tiap env data WAJIB ada di
   sini — `lintEnv` di uji-pagu.mjs yang menegakkannya, dan alasannya keras:
   satu yang terlewat berarti harness ini membaca berkas SUNGGUHAN milik
   pemakai, lalu hijau atau merah karena isi laptopnya. */
const ENV_DATA = (dir) => ({
  AGENT_ROOM_FORMASI: path.join(dir, 'formasi.json'),
  AGENT_ROOM_BUKU_INDUK: path.join(dir, 'buku-induk.json'),
  AGENT_ROOM_AGENDA_DIR: path.join(dir, 'agenda'),
  AGENT_ROOM_TUNDA_DIR: path.join(dir, 'tunda'),
  AGENT_ROOM_TOKEN_LOG: path.join(dir, 'token-riwayat.jsonl'),
  AGENT_ROOM_KLIPING_LOG: path.join(dir, 'kliping.jsonl'),
  AGENT_ROOM_PAGU: path.join(dir, 'pagu.json'),
  AGENT_ROOM_NAMA: path.join(dir, 'nama.json'),
  AGENT_ROOM_SUARA: path.join(dir, 'suara.json'),
  AGENT_ROOM_SUARA_KUNCI: path.join(dir, '.agent-room-suara-kunci'),
  AGENT_ROOM_SUARA_DIR: path.join(dir, 'suara'),
  AGENT_ROOM_SOP: path.join(dir, 'sop.json'),
  AGENT_ROOM_LOKET: path.join(dir, 'loket.json'),
});

const kantorHidup = new Set();

async function bukaKantor(dir, tambahan = {}) {
  const port = await portBebas(4880);
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_ROOM_')) delete env[k];
  Object.assign(env, {
    AGENT_ROOM_PORT: String(port), AGENT_ROOM_HOST: '127.0.0.1',
    AGENT_ROOM_CUACA: 'off', AGENT_ROOM_LAPOR: '',
  }, ENV_DATA(dir), tambahan);

  const proc = spawn(process.execPath, [SERVER], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const k = { proc, port, dir, alamat: 'http://127.0.0.1:' + port, log: '' };
  kantorHidup.add(k);
  proc.stdout.setEncoding('utf8'); proc.stdout.on('data', (s) => { k.log += s; });
  proc.stderr.setEncoding('utf8'); proc.stderr.on('data', (s) => { k.log += s; });

  const batas = Date.now() + 20000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error('server mati saat start:\n' + k.log);
    try { const r = await fetch(k.alamat + '/health'); if (r.ok) { await r.arrayBuffer(); break; } } catch { /* belum */ }
    if (Date.now() > batas) throw new Error('server tidak menjawab /health dalam 20 detik');
    await tidur(120);
  }
  return k;
}

function tutupKantor(k) {
  try { k.proc.kill(); } catch { /* sudah mati */ }
  kantorHidup.delete(k);
}

/* ------------------------------------------------------ buku agenda uji --- */

/* Versi skema dibaca dari server.mjs, bukan ditulis angka di sini: baris yang
   versinya lebih baru DIBUANG diam-diam, jadi angka basi di sini membuat
   seluruh harness hijau di atas nol baris. */
function skemaAgenda() {
  const m = /const SKEMA = \{[^}]*agenda:\s*(\d+)/.exec(fs.readFileSync(SERVER, 'utf8'));
  if (!m) throw new Error('SKEMA.agenda tidak ketemu di server.mjs — bentuknya berubah?');
  return Number(m[1]);
}
const V = skemaAgenda();

const tanggalLokal = (ts) => {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
};

const MENIT = 60 * 1000;
const JAM = 60 * MENIT;

/* Stempel waktu yang jatuh di berkas hari KEMARIN tapi masih terjangkau
   jendela 24 jam. Tidak ada satu pun angka MUNDUR TETAP yang bisa keduanya:
   `23 jam 50 menit` jatuh di hari yang SAMA kalau uji jalan jam 23.55 (itu
   yang benar-benar terjadi dan bikin harness ini merah), dan `24 jam` selalu
   di luar jendela. Jadi dihitung dari tengah malam LOKAL: satu detik
   sebelumnya sudah pasti kemarin.

   Sisa lubangnya diakui, bukan disembunyikan: di detik TERAKHIR hari, instan
   kemarin yang paling muda pun sudah lewat 24 jam, jadi kasus ini memang
   tidak bisa dibangun — satu detik dari 86.400. Waktu itu terjadi, kasus 2
   MENGATAKANNYA lewat catatan, bukan lulus diam-diam dan bukan merah palsu. */
const AMAN_MS = 5000;         // jarak aman dari tepi jendela, buat waktu jalan server
function tsLintasHari() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const ts = t.getTime() - 1000;
  return Date.now() - ts <= 24 * JAM - AMAN_MS ? ts : 0;
}
let tsLintas = 0;             // 0 = detik terakhir hari, kasusnya dilewati

/* Tiap baris ditaruh di berkas hari MILIKNYA SENDIRI — persis seperti
   agendaTulis() di server. Itu yang membuat kasus lintas-tengah-malam nyata:
   waktunya tidak dikarang, barisnya jatuh ke berkas kemarin karena memang
   kemarin, jam berapa pun harness ini dijalankan. */
function tulisAgenda(dir, baris) {
  const agenda = path.join(dir, 'agenda');
  fs.mkdirSync(agenda, { recursive: true });
  const perHari = new Map();
  for (const b of baris) {
    const tgl = tanggalLokal(b.ts);
    if (!perHari.has(tgl)) perHari.set(tgl, []);
    perHari.get(tgl).push(b);
  }
  for (const [tgl, isi] of perHari) {
    isi.sort((a, b) => a.ts - b.ts);
    fs.appendFileSync(path.join(agenda, tgl + '.jsonl'), isi.map((b) => JSON.stringify(b)).join('\n') + '\n');
  }
  return [...perHari.keys()].sort();
}

/* Perakit baris yang sengaja BODOH: tidak ada logika turunan di sini, tiap
   event ditulis apa adanya. Uji yang menghitung ulang rumus yang diujinya
   cuma akan setuju dengan dirinya sendiri, bukan dengan server. */
let nomor = 0;
function ev(sesi, mundurMs, kind, tambahan = {}) {
  return { v: V, id: 'u' + (++nomor), ts: Date.now() - mundurMs, session: sesi, kind, ok: true, ...tambahan };
}
const pre = (sesi, mundurMs, tool, label, tambahan) => ev(sesi, mundurMs, 'pre', { tool, label, ...tambahan });
const post = (sesi, mundurMs, tool, label, ok, tambahan) =>
  ev(sesi, mundurMs, 'post', { tool, label, ok, durasi: 120, ...tambahan });

const ambil = async (k, q) => {
  const r = await fetch(k.alamat + '/serah-terima?' + new URLSearchParams(q).toString());
  return { status: r.status, isi: await r.json() };
};
const sesiDari = (d, awalan) => (d.sesi || []).find((s) => s.sesi.startsWith(awalan));

/* ================================================================ kasus 1 ===
   Satu sesi, tiap sumbu digerakkan sendiri-sendiri. */
async function kasus1(k) {
  console.log(tebal('\nKasus 1 — tiap sumbu dibaca dari `pre` miliknya sendiri'));
  const { isi } = await ambil(k, { proyek: 'alfa' });
  const s = sesiDari(isi, 'sesi-satu');
  if (!s) { tolak('sesi-satu ada di catatan', JSON.stringify(isi.sesi)); return; }

  samaJson('berkas yang disunting cuma dari Edit/Write, unik, tanpa duplikat',
    s.disunting.slice().sort(), ['a.js', 'b.css', 'catatan.ipynb']);
  sama('  bacaan dihitung terpisah, tidak masuk daftar berkas', s.dibaca, 2);
  samaJson('subperintah git terbaca dari Bash & PowerShell, urut dan unik',
    s.git, ['commit', 'diff', 'pr', 'push', 'rev-parse']);
  sama('  `gitk` bukan `git k` — kata yang cuma berawalan sama tidak ikut',
    s.git.includes('k') || s.git.includes('itk'), false);
  /* Dua bentuk ini yang paling sering dipakai di repo ini, dan keduanya
     TIDAK punya `;&|` maupun awal baris di depan `git`. Waktu penjaganya
     masih menuntut itu, 65 dari 158 label git di satu hari sungguhan
     terbuang — termasuk hampir semua `rtk git …`. */
  sama('  `rtk git diff` terbaca walau `git` tidak di awal', s.git.includes('diff'), true);
  sama('  begitu juga `$(git rev-parse …)`', s.git.includes('rev-parse'), true);
  /* Pelajaran yang sama dengan bolak-balik di papan SKP: label terpotong
     tidak boleh dibaca sebagai isi. `rtk git dif…` melahirkan `dif`, dan
     `dif` lalu berdiri sejajar dengan `diff` seolah dua perintah berbeda. */
  sama('  kata yang mentok di ujung label terpotong dibuang, bukan dicatat',
    s.git.includes('dif'), false);
  sama('yang gagal dihitung dari `post ok:false`, bukan dari `pre`', s.gagal, 2);
  sama('  tool call dihitung dari `pre`', s.toolCall, 12);
  sama('paraf yang ditolak dicatat', s.ditolak, 1);
  samaJson('rencana yang diajukan ikut terbawa', s.rencana, ['Rapikan modul pembayaran']);
  sama('kind terakhir sesi disebut', s.akhir, 'session-end');
  benar('mulai lebih awal daripada selesai', s.mulai > 0 && s.mulai < s.selesai,
    JSON.stringify({ mulai: s.mulai, selesai: s.selesai }));
  sama('sesi yang sudah tutup tidak dilaporkan hidup', s.hidup, false);
  sama('  dan tidak dilaporkan tertahan', s.tertahan, null);
}

/* ================================================================ kasus 2 ===
   Jendela jam. */
async function kasus2(k) {
  console.log(tebal('\nKasus 2 — jendela jam memotong dari `ts`, bukan dari nama berkas'));
  const delapan = (await ambil(k, { proyek: 'alfa' })).isi;
  benar('bawaan 8 jam tidak menjangkau sesi 24 jam lalu', !sesiDari(delapan, 'sesi-lawas'),
    JSON.stringify(delapan.sesi.map((s) => s.sesi)));
  sama('  jendelanya disebut apa adanya', delapan.jam, 8);

  const penuh = (await ambil(k, { proyek: 'alfa', jam: 24 })).isi;
  benar('jam=24 menjangkaunya', Boolean(sesiDari(penuh, 'sesi-lawas')),
    JSON.stringify(penuh.sesi.map((s) => s.sesi)));
  /* Inti kasus ini, dan pemeriksaannya harus benar JAM BERAPA PUN. Yang
     TIDAK boleh diperiksa: "ada dua berkas hari". Itu benar siang hari dan
     salah lewat tengah malam — jam 00.30 seluruh semaian jatuh ke satu
     berkas kemarin dan berkas hari ini belum ada isinya sama sekali. Yang
     dijaga: barisnya ADA di berkas bertanggal lebih tua daripada hari ini,
     dan server tetap menemukannya — artinya ia memang membuka lebih dari
     satu hari, bukan cuma hari ini. */
  if (!tsLintas) {
    catatan('lintas tengah malam dilewati: uji ini jalan di detik terakhir hari, '
      + 'tidak ada instan yang kemarin DAN di dalam 24 jam');
  } else {
    const hariIni = tanggalLokal(Date.now()) + '.jsonl';
    const berkas = fs.readdirSync(path.join(k.dir, 'agenda')).sort();
    const lintasDi = berkas.find((n) =>
      fs.readFileSync(path.join(k.dir, 'agenda', n), 'utf8').includes('sesi-lintas'));
    benar('  ada baris yang tercatat di berkas hari SEBELUM hari ini',
      Boolean(lintasDi) && lintasDi < hariIni,
      'ada di ' + lintasDi + ', hari ini ' + hariIni + ' — berkas: ' + berkas.join(', '));
    benar('    dan server tetap menemukannya, jadi ia membuka lebih dari satu hari',
      Boolean(sesiDari(penuh, 'sesi-lintas')),
      JSON.stringify(penuh.sesi.map((s) => s.sesi)));
  }

  sama('jam di luar 1–24 dijepit, bukan ditolak', (await ambil(k, { proyek: 'alfa', jam: 999 })).isi.jam, 24);
  sama('  jam negatif jadi 1', (await ambil(k, { proyek: 'alfa', jam: -5 })).isi.jam, 1);
  sama('  jam bukan angka jatuh ke bawaan', (await ambil(k, { proyek: 'alfa', jam: 'pagi' })).isi.jam, 8);
}

/* ================================================================ kasus 3 ===
   Pemilahan proyek. */
async function kasus3(k) {
  console.log(tebal('\nKasus 3 — proyek lain tidak bocor'));
  const alfa = (await ambil(k, { proyek: 'alfa' })).isi;
  const beta = (await ambil(k, { proyek: 'beta' })).isi;
  benar('catatan alfa tidak memuat sesi beta', !sesiDari(alfa, 'sesi-beta'),
    JSON.stringify(alfa.sesi.map((s) => s.sesi)));
  benar('catatan beta memuat sesinya sendiri', Boolean(sesiDari(beta, 'sesi-beta')),
    JSON.stringify(beta.sesi.map((s) => s.sesi)));
  /* Sentinel atas SELURUH badan, bukan atas nama medan: yang dijaga bukan
     "field bocor" melainkan "nama berkas proyek lain muncul di catatan
     proyek ini". */
  benar('  nama berkas milik beta tidak muncul di catatan alfa',
    !JSON.stringify(alfa).includes('rahasia-beta.env'), JSON.stringify(alfa).slice(0, 200));
  sama('jalur lengkap diterima sebagai nama folder',
    (await ambil(k, { proyek: '/home/x/kerja/alfa' })).isi.proyek, 'alfa');
  const kosong = (await ambil(k, { proyek: 'folder-yang-tidak-ada' })).isi;
  sama('proyek tak dikenal menjawab kosong, bukan galat', kosong.sesi.length, 0);
  sama('  ringkasannya nol, bukan hilang', kosong.ringkas.sesi, 0);
  const tanpa = await ambil(k, {});
  sama('proyek yang tidak diisi dijawab 400', tanpa.status, 400);
  benar('  dengan keterangan yang bisa dibaca orang', /proyek wajib/.test(tanpa.isi.galat || ''),
    JSON.stringify(tanpa.isi));
}

/* ================================================================ kasus 4 ===
   Batas daftar & ringkasan yang tidak boleh ikut terpotong. */
async function kasus4(k) {
  console.log(tebal('\nKasus 4 — daftarnya dipotong, ringkasannya tidak'));
  const r = (await ambil(k, { proyek: 'ramai' })).isi;
  sama('daftar sesi dipotong di 12', r.sesi.length, 12);
  sama('  sisanya dihitung, bukan didiamkan', r.sesiLain, 6);
  sama('ringkasan menghitung SEMUA 18 sesi', r.ringkas.sesi, 18);
  /* Tiap sesi ramai punya tepat satu `pre`; kalau ringkasannya dijumlah dari
     daftar yang sudah dipotong, angkanya 12 dan kalimat pembukanya bohong. */
  sama('  tool call dijumlah dari semuanya, bukan dari 12 yang tampil', r.ringkas.toolCall, 15);
  /* Tiga sesi `sepi-` LEBIH BARU daripada kelima belas yang bekerja. Urut
     murni-terbaru akan menaruh ketiganya di puncak dan menggusur tiga sesi
     yang benar-benar mengerjakan sesuatu keluar dari daftar — padahal baris
     yang isinya nol tidak menjawab apa pun bagi yang membacanya. */
  benar('sesi yang cuma menutup diri tidak menggusur yang bekerja',
    r.sesi.every((x) => x.toolCall > 0), JSON.stringify(r.sesi.map((x) => [x.sesi, x.toolCall])));
  benar('  di antara yang setara, tetap urut dari yang paling baru',
    r.sesi.every((x, i, a) => i === 0 || a[i - 1].selesai >= x.selesai),
    JSON.stringify(r.sesi.map((x) => x.selesai)));
  /* Kontrol positif: yang tergusur memang ADA, bukan tidak pernah tercatat. */
  const semua = (await ambil(k, { proyek: 'ramai', jam: 24 })).isi;
  sama('  yang tergusur tetap terhitung di ringkasan', semua.ringkas.sesi, 18);

  const luber = (await ambil(k, { proyek: 'luber' })).isi;
  const s = sesiDari(luber, 'sesi-luber');
  sama('nama berkas per sesi dipotong di 20', (s || { disunting: [] }).disunting.length, 20);
  sama('  sisanya dihitung', (s || {}).disuntingLain, 5);
  sama('  tapi jumlah berkas proyeknya utuh', luber.ringkas.berkas, 25);
}

/* ================================================================ kasus 5 ===
   Keadaan hidup: hanya sebab dan sejak kapan yang lewat. */
async function kasus5(k) {
  console.log(tebal('\nKasus 5 — yang masih tertahan, tanpa teks perintahnya'));
  const kirim = async (jenis, sesi, tambahan = {}) => {
    const r = await fetch(k.alamat + '/event', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hook_event_name: jenis, session_id: sesi, cwd: '/kerja/gamma', ...tambahan }),
    });
    await r.arrayBuffer();
    if (r.status !== 204) throw new Error('POST /event menjawab ' + r.status);
    await tidur(25);
  };
  await kirim('SessionStart', 'sesi-nunggu', { source: 'startup' });
  await kirim('PreToolUse', 'sesi-nunggu', { tool_name: 'Write', tool_input: { file_path: '/kerja/gamma/naskah.md' } });
  await kirim('PermissionRequest', 'sesi-nunggu', { tool_name: 'Bash', tool_input: { command: 'rm -rf /kerja/gamma/build' } });
  await kirim('SessionStart', 'sesi-jalan', { source: 'startup' });
  await kirim('PreToolUse', 'sesi-jalan', { tool_name: 'Read', tool_input: { file_path: '/kerja/gamma/a.txt' } });
  await tidur(150);

  const g = (await ambil(k, { proyek: 'gamma' })).isi;
  sama('dua sesi hidup terbaca', g.ringkas.hidup, 2);
  sama('  satu di antaranya tertahan', g.ringkas.tertahan, 1);
  const nunggu = sesiDari(g, 'sesi-nunggu');
  sama('  sebabnya disebut', ((nunggu && nunggu.tertahan) || {}).sebab, 'izin');
  benar('  beserta sejak kapan, supaya lamanya bisa dihitung pemanggil',
    Number.isFinite(((nunggu && nunggu.tertahan) || {}).sejak) && nunggu.tertahan.sejak > 0,
    JSON.stringify(nunggu && nunggu.tertahan));
  /* KONTROL POSITIF untuk sentinel di bawah: perintahnya MEMANG tersimpan di
     kantor — dia yang sedang menunggu paraf — jadi tidak-adanya di catatan
     serah terima berarti sesuatu, bukan sekadar data yang kebetulan kosong. */
  const buku = await (await fetch(k.alamat + '/agenda?proyek=gamma&kind=izin-minta')).text();
  benar('  kontrol positif: perintahnya memang ada di buku agenda yang sama',
    buku.includes('rm -rf'), buku.slice(0, 240));
  const teks = JSON.stringify(g);
  benar('  tapi TIDAK ikut ke catatan serah terima', !teks.includes('rm -rf'), teks.slice(0, 240));
  benar('  begitu juga medan teks bebas lain', !/"alasan"|"galat"/.test(teks), teks.slice(0, 240));
  sama('sesi yang jalan tidak dilaporkan tertahan', (sesiDari(g, 'sesi-jalan') || {}).tertahan, null);
  samaJson('berkas yang baru disentuh sesi hidup sudah masuk',
    (sesiDari(g, 'sesi-nunggu') || {}).disunting, ['naskah.md']);
}

/* ================================================================ kasus 6 ===
   AGENT_ROOM_ISI=off: nama berkas hilang, angka tetap. */
async function kasus6(dir) {
  console.log(tebal('\nKasus 6 — AGENT_ROOM_ISI=off: nama hilang, angka tetap'));
  const k = await bukaKantor(dir, { AGENT_ROOM_ISI: 'off' });
  try {
    const r = (await ambil(k, { proyek: 'alfa' })).isi;
    const s = sesiDari(r, 'sesi-satu');
    if (!s) { tolak('sesi-satu tetap tercatat walau isinya mati', JSON.stringify(r.sesi)); return; }
    samaJson('daftar berkas kosong — label memang tidak dibaca', s.disunting, []);
    samaJson('  subperintah git juga kosong', s.git, []);
    samaJson('  rencana juga kosong', s.rencana, []);
    sama('tapi tool call tetap dihitung', s.toolCall, 12);
    sama('  yang gagal tetap dihitung', s.gagal, 2);
    sama('  bacaan tetap dihitung', s.dibaca, 2);
    sama('  paraf yang ditolak tetap dihitung', s.ditolak, 1);
    sama('  jumlah berkas proyek jadi nol, bukan angka karangan', r.ringkas.berkas, 0);
  } finally { tutupKantor(k); }
}

/* ------------------------------------------------------------------ semai --- */

function semai(dir) {
  const baris = [];

  /* — alfa / sesi-satu: satu sesi lengkap, tiap sumbu digerakkan sendiri — */
  const A = 'sesi-satu-aa';
  const alfa = { cwd: 'alfa' };
  const t = (menit) => 3 * JAM - menit * MENIT;
  baris.push(ev(A, t(0), 'prompt', alfa));
  baris.push(pre(A, t(1), 'Edit', 'a.js', alfa), post(A, t(2), 'Edit', 'a.js', true, alfa));
  // berkas yang sama disunting dua kali: daftarnya UNIK, bukan riwayat
  baris.push(pre(A, t(3), 'Edit', 'a.js', alfa), post(A, t(4), 'Edit', 'a.js', true, alfa));
  baris.push(pre(A, t(5), 'Write', 'b.css', alfa), post(A, t(6), 'Write', 'b.css', false, alfa));
  baris.push(pre(A, t(7), 'NotebookEdit', 'catatan.ipynb', alfa));
  baris.push(pre(A, t(8), 'Read', 'a.js', alfa), post(A, t(9), 'Read', 'a.js', true, alfa));
  baris.push(pre(A, t(10), 'Read', 'README.md', alfa));
  baris.push(pre(A, t(11), 'Bash', 'git commit -m "rapikan"', alfa));
  baris.push(post(A, t(12), 'Bash', 'git commit -m "rapikan"', false, alfa));
  // `gitk` di depan: kata yang cuma BERAWALAN `git` tidak boleh dibaca sebagai
  // subperintah, dan `git push` sesudah `&&` harus tetap terbaca
  // `gitk` di depan: kata yang cuma BERAWALAN `git` tidak boleh dibaca sebagai
  // subperintah, dan `git push` sesudah `&&` harus tetap terbaca
  baris.push(pre(A, t(13), 'Bash', 'gitk --all && git push origin master', alfa));
  baris.push(pre(A, t(14), 'PowerShell', 'gh pr view 12', alfa));
  // bentuk yang paling lazim di repo ini: `rtk` di depan, dan `$(git …)`
  baris.push(pre(A, t(18), 'Bash', 'rtk git diff --stat && echo $(git rev-parse HEAD)', alfa));
  // label yang DIPOTONG clip(): `dif` bukan subperintah, itu potongan `diff`
  baris.push(pre(A, t(19), 'Bash', 'cd /x && cat a && rtk git dif…', alfa));
  baris.push(pre(A, t(15), 'ExitPlanMode', 'Rapikan modul pembayaran', alfa));
  baris.push(ev(A, t(16), 'izin-tolak', { ...alfa, alasan: 'tidak sekarang' }));
  baris.push(ev(A, t(20), 'session-end', alfa));

  /* — alfa / sesi-lawas: 23 jam 50 menit lalu. Angkanya dipilih supaya jam
     berapa pun uji ini jalan, ia SELALU di luar jendela 8 jam dan SELALU di
     dalam jendela 24 jam. Yang TIDAK dijanjikannya: berkas hari mana ia
     jatuh — itu tugas `sesi-lintas` di bawah. — */
  const L = 'sesi-lawas-bb';
  baris.push(pre(L, 23 * JAM + 50 * MENIT, 'Edit', 'lawas.js', alfa));
  baris.push(ev(L, 23 * JAM + 49 * MENIT, 'session-end', alfa));

  /* — alfa / sesi-lintas: satu detik sebelum tengah malam lokal, jadi di
     berkas kemarin dan masih terjangkau `jam=24` — */
  tsLintas = tsLintasHari();
  if (tsLintas) baris.push({ ...pre('sesi-lintas', 0, 'Edit', 'lintas.js', alfa), ts: tsLintas });

  /* — beta: satu sesi di proyek lain, nama berkasnya sengaja mencolok — */
  baris.push(pre('sesi-beta-cc', 2 * JAM, 'Write', 'rahasia-beta.env', { cwd: 'beta' }));
  baris.push(ev('sesi-beta-cc', 2 * JAM - MENIT, 'session-end', { cwd: 'beta' }));

  /* — ramai: 15 sesi, buat menguji potong daftar lawan ringkasan — */
  for (let i = 0; i < 15; i++) {
    const id = 'ramai-' + String(i).padStart(2, '0') + '-zz';
    baris.push(pre(id, 4 * JAM - i * MENIT, 'Read', 'r' + i + '.txt', { cwd: 'ramai' }));
  }

  /* — ramai, bagian dua: tiga sesi yang di dalam jendela ini cuma menyisakan
     `session-end`, dan LEBIH BARU daripada kelima belas yang bekerja. Urut
     murni-terbaru akan menaruh ketiganya di puncak dan menggusur tiga sesi
     yang benar-benar mengerjakan sesuatu keluar dari dua belas baris. */
  for (let i = 0; i < 3; i++) {
    baris.push(ev('sepi-' + i + '-zz', 30 * MENIT - i * MENIT, 'session-end', { cwd: 'ramai' }));
  }

  /* — luber: satu sesi menyentuh 25 berkas berbeda — */
  for (let i = 0; i < 25; i++) {
    baris.push(pre('sesi-luber-dd', 5 * JAM - i * MENIT, 'Edit', 'berkas-' + i + '.js', { cwd: 'luber' }));
  }

  return tulisAgenda(dir, baris);
}

/* ------------------------------------------------------------------ utama --- */

async function utama() {
  console.log(tebal('uji-serah') + abu(' — catatan serah terima per proyek, tanpa LLM'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-serah-'));
  const hari = semai(dir);
  console.log(abu('  buku agenda sintetis: ' + hari.join(', ')));

  const k = await bukaKantor(dir);
  try {
    await kasus1(k);
    await kasus2(k);
    await kasus3(k);
    await kasus4(k);
    await kasus5(k);
  } finally { tutupKantor(k); }
  await kasus6(dir);

  console.log('\n' + (gagal
    ? merah(tebal('GAGAL')) + ' ' + gagal + ' dari ' + periksa + ' pemeriksaan'
    : hijau(tebal('LULUS')) + ' ' + periksa + ' pemeriksaan'));
  process.exit(gagal ? 1 : 0);
}

utama().catch((e) => {
  for (const k of [...kantorHidup]) tutupKantor(k);
  console.error(merah('galat: ') + (e && e.stack ? e.stack : e));
  process.exit(1);
});
