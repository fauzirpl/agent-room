#!/usr/bin/env node
/* uji-jaringan.mjs :: gerbang "npm test tidak pernah keluar jaringan".
 *
 * Repo ini menjanjikan dua hal yang sampai sekarang tidak dijaga siapa pun:
 *
 *   1. `npm test` nol-jaringan. Dijaga sendiri-sendiri di tiap harness dengan
 *      tiga cara berbeda, jadi tinggal menunggu ada yang lupa. Memang ada yang
 *      lupa — lihat kasus 4.
 *   2. Nota dinas keluar (`AGENT_ROOM_LAPOR`) cuma membawa METADATA. Tertulis
 *      di docs/02-ruangan.md: "Yang tidak pernah ikut: pikir, ucap, dan
 *      prompt." Nol uji. Sebuah refaktor yang menyelipkan label prompt ke dalam
 *      nota tidak akan memerahkan apa pun hari ini.
 *
 * Yang dipakai: loket nota palsu di 127.0.0.1 dari `penyedia-palsu.mjs`.
 * Uji ini SENGAJA menyalakan jalur keluar (ke loket palsu) supaya ada kontrol
 * positif — gerbang yang cuma bisa hijau tidak membuktikan apa-apa.
 *
 * Pakai:
 *   node uji-jaringan.mjs           jalankan semua kasus
 *   node uji-jaringan.mjs --tampil  cetak juga isi nota yang tertangkap
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loketNota, envTanpaJalurKeluar, ENV_JALUR_KELUAR } from './penyedia-palsu.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');
const TAMPIL = process.argv.includes('--tampil');

const warna = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (n) => (s) => (warna ? '\x1b[' + n + 'm' + s + '\x1b[0m' : s);
const merah = c(31); const hijau = c(32); const abu = c(90); const tebal = c(1);

let periksa = 0; let gagal = 0;
const lulus = (t) => { periksa++; console.log('  ' + hijau('✓') + ' ' + t); };
const tolak = (t, ket) => {
  periksa++; gagal++;
  console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(ket) : ''));
};
const benar = (t, syarat, ket) => { if (syarat) lulus(t); else tolak(t, ket || ''); };
const sama = (t, dapat, harap) => {
  if (dapat === harap) lulus(t + ' ' + abu('= ' + JSON.stringify(dapat)));
  else tolak(t, 'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harap));
};
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ kantor uji --- */

const kantorHidup = new Set();
let portBerikut = 4680;

const sandbox = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), 'ar-jaringan-' + tag + '-'));

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
});

/* `env` diterima UTUH dari pemanggil: separuh gunanya uji ini justru
   membandingkan env yang bocor dengan env yang sudah ditutup. */
async function buka(dir, env) {
  const port = portBerikut++;
  const proc = spawn(process.execPath, [SERVER], {
    cwd: __dirname,
    env: { ...env, AGENT_ROOM_PORT: String(port), AGENT_ROOM_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const k = { proc, port, dir, alamat: 'http://127.0.0.1:' + port, keluar: '' };
  kantorHidup.add(k);
  proc.stdout.setEncoding('utf8'); proc.stdout.on('data', (s) => { k.keluar += s; });
  proc.stderr.setEncoding('utf8'); proc.stderr.on('data', (s) => { k.keluar += s; });

  const batas = Date.now() + 20000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error('server mati saat start:\n' + k.keluar);
    try {
      const r = await fetch(k.alamat + '/health');
      if (r.ok) { await r.arrayBuffer(); break; }
    } catch { /* belum mendengar */ }
    if (Date.now() > batas) throw new Error('server tidak menjawab /health dalam 20 detik');
    await tidur(120);
  }
  return k;
}

function tutup(k) {
  try { k.proc.kill(); } catch { /* sudah mati */ }
  kantorHidup.delete(k);
}

async function hook(k, jenis, sesi, tambahan = {}) {
  const r = await fetch(k.alamat + '/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: jenis, session_id: sesi, cwd: '/tmp/proyek-uji', ...tambahan,
    }),
  });
  await r.arrayBuffer();
  if (r.status !== 204) throw new Error('POST /event menjawab ' + r.status);
  await tidur(30);
}

/* ================================================================ kasus 1 ===
   KONTROL POSITIF. Jalur keluarnya nyata: kalau AGENT_ROOM_LAPOR diisi, satu
   permintaan izin benar-benar melahirkan POST ke luar. Tanpa kasus ini, kasus
   3 bisa hijau cuma karena notanya memang tidak pernah terbit. */
async function kasus1(loket) {
  console.log(tebal('\nKasus 1 — jalur keluar memang ada (kontrol positif)'));
  const dir = sandbox('a');
  const k = await buka(dir, {
    ...process.env, ...ENV_DATA(dir),
    AGENT_ROOM_CUACA: 'off',
    AGENT_ROOM_LAPOR: loket.url,
  });
  try {
    loket.st.nota.length = 0;
    await hook(k, 'PermissionRequest', 'sesi-kontrol-1', {
      tool_name: 'Bash', tool_input: { command: 'npm test' },
    });
    const datang = await loket.tunggu(1, 5000);
    benar('nota dinas benar-benar dikirim keluar', datang, 'loket palsu tidak menerima apa pun');
    const n = loket.st.nota[0] || {};
    sama('  jenisnya izin-minta', n.jenis, 'izin-minta');
    benar('  membawa kalimat siap-tampil', typeof n.text === 'string' && n.text.length > 0);
    benar('  content = text (Discord & Slack sekali kirim)', n.content === n.text);
    if (TAMPIL) console.log(abu('      ' + JSON.stringify(n)));
  } finally { tutup(k); }
}

/* ================================================================ kasus 2 ===
   JANJI PRIVASI. docs/02-ruangan.md: "Yang tidak pernah ikut: pikir, ucap, dan
   prompt." Sentinel ditanam lewat UserPromptSubmit — kind yang memang bukan
   pemicu — lalu izin diminta dari sesi yang sama. Notanya harus terbit TANPA
   membawa sentinel itu ke mana pun. */
async function kasus2(loket) {
  console.log(tebal('\nKasus 2 — nota cuma metadata, prompt tidak pernah ikut'));
  const SENTINEL = 'RAHASIA-PROMPT-JANGAN-KELUAR';
  const dir = sandbox('b');
  const k = await buka(dir, {
    ...process.env, ...ENV_DATA(dir),
    AGENT_ROOM_CUACA: 'off',
    AGENT_ROOM_LAPOR: loket.url,
  });
  try {
    loket.st.nota.length = 0;
    await hook(k, 'UserPromptSubmit', 'sesi-privasi-2', {
      prompt: SENTINEL + ' tolong hapus semuanya',
    });
    await tidur(250);
    sama('prompt sendiri tidak pernah melahirkan nota', loket.st.nota.length, 0);

    await hook(k, 'PermissionRequest', 'sesi-privasi-2', {
      tool_name: 'Bash', tool_input: { command: 'rm -rf build' },
    });
    benar('izin dari sesi yang sama tetap melahirkan nota', await loket.tunggu(1, 5000));

    const semua = JSON.stringify(loket.st.nota);
    benar('  sentinel prompt tidak ada di nota mana pun',
      !semua.includes(SENTINEL),
      'nota memuat isi prompt — janji privasi di docs/02-ruangan.md pecah');
    benar('  tidak ada medan pikir/ucap/prompt di badan nota',
      !/"(pikir|ucap|prompt|teks|tanya)"\s*:/.test(semua),
      'badan nota: ' + semua.slice(0, 300));
    if (TAMPIL) console.log(abu('      ' + semua.slice(0, 400)));

    /* Jeda per sesi+jenis, tertulis di docs: rentetan izin dari satu sesi harus
       jadi satu kabar, bukan sepuluh. */
    const sebelum = loket.st.nota.length;
    await hook(k, 'PermissionRequest', 'sesi-privasi-2', {
      tool_name: 'Bash', tool_input: { command: 'rm -rf dist' },
    });
    await tidur(300);
    sama('  izin kedua dari sesi yang sama diredam', loket.st.nota.length, sebelum);
  } finally { tutup(k); }
}

/* ================================================================ kasus 3 ===
   PENUTUPNYA BEKERJA. Env pemanggil sengaja dikotori — LAPOR menunjuk loket,
   CUACA dibiarkan kosong (artinya "tebak dari IP", BUKAN mati). Sesudah lewat
   envTanpaJalurKeluar(), tidak satu pun jalur itu boleh hidup. */
async function kasus3(loket) {
  console.log(tebal('\nKasus 3 — envTanpaJalurKeluar menutup semuanya'));
  const dir = sandbox('c');
  const kotor = { ...process.env, AGENT_ROOM_LAPOR: loket.url, AGENT_ROOM_CUACA: '' };
  const bersih = envTanpaJalurKeluar(kotor, ENV_DATA(dir));

  for (const nama of ENV_JALUR_KELUAR) {
    if (nama === 'AGENT_ROOM_CUACA') continue;
    sama('  ' + nama + ' dikosongkan', bersih[nama], '');
  }
  sama('  AGENT_ROOM_CUACA dimatikan (bukan sekadar kosong)', bersih.AGENT_ROOM_CUACA, 'off');

  const k = await buka(dir, bersih);
  try {
    loket.st.nota.length = 0;
    await hook(k, 'PermissionRequest', 'sesi-bersih-3', {
      tool_name: 'Bash', tool_input: { command: 'npm test' },
    });
    await hook(k, 'StopFailure', 'sesi-bersih-3', { error: 'api_error' });
    await tidur(400);
    sama('tidak satu nota pun keluar walau env pemanggil kotor', loket.st.nota.length, 0);

    const r = await fetch(k.alamat + '/cuaca');
    const b = await r.json().catch(() => ({}));
    benar('/cuaca menjawab mati, tidak menghubungi geojs/open-meteo',
      Boolean(b) && b.mati === true,
      'jawaban /cuaca: ' + JSON.stringify(b).slice(0, 160));
  } finally { tutup(k); }
}

/* ================================================================ kasus 4 ===
   KONTRAK HARNESS. Pemeriksaan TEKS, dan itu diakui apa adanya: ia tidak
   menjalankan ujinya, cuma menuntut salah satu dari tiga bentuk penutup yang
   sudah terbukti dipakai di repo ini. Gunanya menangkap harness BARU yang
   lupa, bukan membuktikan yang lama benar — itu tugas kasus 1-3. */
function kasus4() {
  console.log(tebal('\nKasus 4 — tiap harness menutup jalur keluarnya sendiri'));
  const berkas = fs.readdirSync(__dirname).filter((f) => /^uji-.*\.mjs$/.test(f)).sort();
  let diperiksa = 0;
  for (const f of berkas) {
    if (f === 'uji-jaringan.mjs') continue;      // uji ini memang sengaja membukanya
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    const lahirkanServer = /spawn\(/.test(src) && /(server\.mjs|input-type=module)/.test(src);
    const wariskanEnv = /\.\.\.process\.env/.test(src);
    if (!lahirkanServer || !wariskanEnv) continue;   // tidak mewarisi env = tidak bisa bocor
    diperiksa++;

    const sapu = /startsWith\('AGENT_ROOM_'\)/.test(src);
    const pakaiHelper = /envTanpaJalurKeluar\(/.test(src);
    const laporKosong = /AGENT_ROOM_LAPOR:\s*''/.test(src);
    const cuacaMati = /AGENT_ROOM_CUACA:\s*'off'/.test(src);
    const aman = sapu || pakaiHelper || (laporKosong && cuacaMati);

    const cara = sapu ? 'menyapu AGENT_ROOM_*'
      : pakaiHelper ? 'envTanpaJalurKeluar()'
        : 'LAPOR kosong + CUACA off';
    if (aman) { lulus(f + ' ' + abu('(' + cara + ')')); continue; }

    const kurang = [];
    if (!laporKosong) kurang.push('AGENT_ROOM_LAPOR dikosongkan');
    if (!cuacaMati) kurang.push('AGENT_ROOM_CUACA disetel off');
    tolak(f + ' mewarisi env pemanggil tanpa menutup jalur keluar',
      'kurang: ' + kurang.join(' dan ')
      + '. Pakai envTanpaJalurKeluar() dari penyedia-palsu.mjs, sapu AGENT_ROOM_*, '
      + 'atau setel keduanya sendiri.\n      '
      + 'Catatan: AGENT_ROOM_CUACA kosong berarti "tebak dari IP", bukan mati.');
  }
  benar('ada harness yang benar-benar diperiksa', diperiksa > 0,
    'nol harness cocok pola — polanya yang basi, bukan reponya yang bersih');
}

/* -------------------------------------------------------------- jalankan --- */

async function utama() {
  console.log(tebal('uji-jaringan') + abu(' — npm test tidak pernah keluar jaringan'));
  const loket = await loketNota();
  try {
    await kasus1(loket);
    await kasus2(loket);
    await kasus3(loket);
    kasus4();
  } finally {
    for (const k of [...kantorHidup]) tutup(k);
    await loket.tutup();
  }

  console.log('\n' + (gagal
    ? merah(tebal('GAGAL')) + ' ' + gagal + ' dari ' + periksa + ' pemeriksaan'
    : hijau(tebal('LULUS')) + ' ' + periksa + ' pemeriksaan'));
  process.exit(gagal ? 1 : 0);
}

utama().catch((e) => {
  for (const k of [...kantorHidup]) tutup(k);
  console.error(merah('galat: ') + (e && e.stack ? e.stack : e));
  process.exit(1);
});
