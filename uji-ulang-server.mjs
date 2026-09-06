#!/usr/bin/env node
/* uji-ulang-server.mjs :: satu hari kerja sungguhan diputar ulang ke SISI SERVER.
 *
 * `uji-ulang.mjs` memutar hari yang sama ke `frame()`/`handle()` milik
 * `room.js` — sisi HALAMAN. Sisi yang justru jadi pintu masuk SEMUA sinyal
 * agen, `server.mjs`, belum pernah diuji dengan bentuk hari penuh: yang ada
 * cuma hari-hari karangan berisi belasan event di `uji-pagu.mjs` dan
 * `uji-pegawai.mjs`. Regresi di `normalize()`, `describe()`, `agendaBaris()`,
 * `catatSesiHidup()`, `bukuIndukCatat()`, dan `putarUlang()` karena itu tidak
 * punya penjaga berbasis hari sungguhan.
 *
 * Harness ini LUAR MURNI: nol perubahan pada `server.mjs`. Semua yang
 * diperiksa dibaca dari luar lewat HTTP — `/stream`, `/buku-induk`, `/ruangan`,
 * `/health`, `/metrics`, dan `/stream?ulang=`.
 *
 * DUA DISTORSI YANG DIAKUI DI MUKA, bukan disembunyikan:
 *
 *   1. WAKTUNYA DIMAMPATKAN. `normalize()` memakai `Date.now()`, dan tidak ada
 *      jalan masuk `ts` dari luar untuk event biasa. Jadi 9,5 jam kerja masuk
 *      dalam hitungan detik. Persis distorsi yang sudah diakui `uji-ulang.mjs`.
 *      Akibatnya yang bergantung pada JARAK waktu — sapuan sesi sepi, jeda
 *      nota, pemadatan riwayat — memang tidak teruji di sini.
 *   2. LABEL MCP DITURUNKAN DARI NAMA TOOL. Fixture menyimpan label kosong
 *      untuk tool `mcp__*` (label aslinya memuat nama server sungguhan, jadi
 *      dibuang penyamar), sedangkan `describe()` membangunnya kembali dari
 *      nama tool sebagai `server · alat`. Itu bukan hanyut — itu memang
 *      perilakunya, dan justru ikut diuji di kasus B.
 *
 * Yang TIDAK teruji dan disebut apa adanya: `butuhManusia`. Fixture hari ini
 * tidak memuat satu pun pemicunya (`izin-minta`/`notify` yang menahan), jadi
 * jalur itu tetap milik `uji-pegawai.mjs` dan `uji-jaringan.mjs`.
 *
 * Nol jaringan: server anak di 127.0.0.1, seluruh berkas data ke folder
 * sementara, cuaca mati, nota dinas keluar dikosongkan.
 *
 * Pakai:
 *   node uji-ulang-server.mjs             putar seluruh hari
 *   node uji-ulang-server.mjs --sampai 400  potong di baris ke-400 (buat iterasi cepat)
 *   node uji-ulang-server.mjs --tampil    cetak rincian tiap invarian
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { muatFixture } from './buat-fixture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');
const TAMPIL = process.argv.includes('--tampil');
const SAMPAI = (() => {
  const i = process.argv.indexOf('--sampai');
  return i > 0 ? Number(process.argv[i + 1]) || 0 : 0;
})();

const warna = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (n) => (s) => (warna ? '\x1b[' + n + 'm' + s + '\x1b[0m' : s);
const merah = c(31); const hijau = c(32); const kuning = c(33); const abu = c(90); const tebal = c(1);

let periksa = 0; let gagal = 0;
const lulus = (t) => { periksa++; console.log('  ' + hijau('✓') + ' ' + t); };
const tolak = (t, ket) => {
  periksa++; gagal++;
  console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(String(ket).slice(0, 500)) : ''));
};
const benar = (t, syarat, ket) => { if (syarat) lulus(t); else tolak(t, ket || ''); };
const sama = (t, dapat, harap) => {
  if (dapat === harap) lulus(t + ' ' + abu('= ' + JSON.stringify(dapat)));
  else tolak(t, 'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harap));
};
const catatan = (t) => console.log('  ' + kuning('!') + ' ' + t);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/* ======================================================= peta balik hook === */

/* Kebalikan EVENT_ALIAS di server.mjs, untuk kind yang MEMANG ada di fixture.
   `nama`, `pagu`, dan `promosi` sengaja tidak ada di sini: ketiganya lahir DI
   server, bukan dikirim hook, jadi mengirimnya justru memalsukan hari. */
const KIND_KE_HOOK = {
  pre: 'PreToolUse',
  post: 'PostToolUse',                 // yang ok:false jadi PostToolUseFailure
  prompt: 'UserPromptSubmit',
  stop: 'Stop',
  'stop-gagal': 'StopFailure',
  'subagent-start': 'SubagentStart',
  'subagent-stop': 'SubagentStop',
  compact: 'PreCompact',
  'compact-selesai': 'PostCompact',
  'session-start': 'SessionStart',
  'session-end': 'SessionEnd',
};
const KIND_LAHIR_DI_SERVER = new Set(['nama', 'pagu', 'promosi']);

/* Untuk `stop-gagal`, fixture menyimpan label berupa TERJEMAHAN kode galatnya
   (`GALAT_STOP` di server.mjs), bukan kodenya. Supaya bisa dikirim balik,
   petanya dibaca dari sumber server — bukan disalin ke sini — jadi menambah
   satu jenis galat di server tidak diam-diam membuat harness ini bohong. */
function petaGalatBalik() {
  const src = fs.readFileSync(SERVER, 'utf8');
  const blok = src.match(/const GALAT_STOP\s*=\s*\{([\s\S]*?)\n\};/);
  if (!blok) throw new Error('GALAT_STOP tidak ketemu di server.mjs — polanya yang basi');
  const balik = new Map();
  for (const m of blok[1].matchAll(/^\s*([a-z_]+)\s*:\s*'([^']+)'/gm)) balik.set(m[2], m[1]);
  if (balik.size < 5) throw new Error('GALAT_STOP terbaca cuma ' + balik.size + ' entri');
  return balik;
}
const GALAT_BALIK = petaGalatBalik();

/* Membangun `tool_input` yang membuat `describe()` di server menghasilkan
   label fixture PERSIS. Kalau sebuah tool tidak bisa dibalik, harness merah
   dengan menyebut nama tool-nya — bukan diam-diam melewatinya. */
function toolInputUntuk(tool, label) {
  if (tool.startsWith('mcp__')) return {};          // label dari nama tool, bukan input
  switch (tool) {
    case 'Bash': case 'PowerShell': return { command: label };
    case 'Read': case 'NotebookEdit': return { file_path: label };
    case 'Edit': case 'Write': return { file_path: label };
    case 'Glob': return { pattern: label };
    case 'Grep': return { pattern: label };          // fixture tidak memuat bagian "di <path>"
    case 'WebSearch': return { query: label };
    case 'Workflow': return { name: label };
    case 'Task': case 'Agent': return { description: label };
    case 'Skill': return { skill: label };
    default: return { nilai: label };                // cabang default describe(): string pertama
  }
}

/* Label yang SEHARUSNYA dihasilkan server untuk baris ini. Untuk tool MCP,
   fixture menyimpan kosong (penyamar membuangnya) sementara server membangunnya
   kembali dari nama tool — jadi itulah yang diharapkan, dan itu ikut diuji. */
function labelDiharapkan(tool, labelFixture) {
  if (tool && tool.startsWith('mcp__')) {
    const m = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(tool);
    return m ? m[1] + ' · ' + m[2] : '';
  }
  return labelFixture || '';
}

export function bangunPayload(b, cwdProyek) {
  if (KIND_LAHIR_DI_SERVER.has(b.kind)) return null;
  const hook = KIND_KE_HOOK[b.kind];
  if (!hook) return null;

  const p = { hook_event_name: hook, session_id: b.session, cwd: cwdProyek };
  if (b.kind === 'post' && b.ok === false) p.hook_event_name = 'PostToolUseFailure';

  if (b.kind === 'pre' || b.kind === 'post') {
    p.tool_name = b.tool || '';
    p.tool_input = toolInputUntuk(b.tool || '', b.label || '');
    if (b.panggilan) p.tool_use_id = b.panggilan;
    if (b.ok === false) {
      p.tool_response = { is_error: true, stderr: b.galat || 'gagal' };
      if (b.interupsi) p.is_interrupt = true;
    }
  }
  if (b.kind === 'prompt') p.prompt = b.label || '';
  if (b.kind === 'stop-gagal') {
    p.error = GALAT_BALIK.get(b.label || '') || 'unknown';
    if (b.galat) p.error_details = b.galat;
  }
  if (b.kind === 'subagent-start' || b.kind === 'subagent-stop') {
    if (b.agenId) p.agent_id = b.agenId;
    if (b.agen) p.agent_type = b.agen;
  }
  if (b.kind === 'session-start') p.source = b.label || 'startup';
  if (b.kind === 'session-end') p.reason = b.label || '';
  if (b.kind === 'compact' || b.kind === 'compact-selesai') p.trigger = 'auto';
  if (b.model) p.model = b.model;
  return p;
}

/* ============================================================== kantor uji = */

function portBebas(mulai) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', () => resolve(portBebas(mulai + 1)));
    s.once('listening', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.listen(mulai, '127.0.0.1');
    setTimeout(() => reject(new Error('portBebas menggantung')), 5000).unref?.();
  });
}

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
});

let kantor = null;

/* Folder proyek sintetis + .git/HEAD palsu, meniru folderProyek() di
   uji-pegawai.mjs — supaya kolom `cabang` fixture benar-benar teruji lewat
   cabangGit(), bukan cuma dikirim sebagai field. */
/* Cabang kosong DIHORMATI: 10 baris fixture memang tidak punya `cabang`, dan
   memaksanya ke 'master' akan membuat harness ini menuntut nilai yang tidak
   pernah ada di hari aslinya. Folder tanpa `.git` membuat cabangGit()
   mengembalikan kosong — persis yang diharapkan. */
function folderProyek(akar, nama, cabang) {
  /* Cabangnya jadi folder INDUK, bukan akhiran nama: server mengambil nama
     proyek dari basename(cwd), jadi `proyek-1@master` akan tercatat sebagai
     proyek bernama "proyek-1@master". */
  const p = path.join(akar, cabang || 'tanpa-git', nama);
  fs.mkdirSync(p, { recursive: true });
  if (cabang) {
    fs.mkdirSync(path.join(p, '.git'), { recursive: true });
    fs.writeFileSync(path.join(p, '.git', 'HEAD'), 'ref: refs/heads/' + cabang + '\n');
  }
  return p;
}

async function bukaKantor(dir) {
  const port = await portBebas(4720);
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_ROOM_')) delete env[k];
  Object.assign(env, {
    AGENT_ROOM_PORT: String(port),
    AGENT_ROOM_HOST: '127.0.0.1',
    AGENT_ROOM_CUACA: 'off',
    AGENT_ROOM_LAPOR: '',
  }, ENV_DATA(dir));

  const proc = spawn(process.execPath, [SERVER], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const k = { proc, port, dir, alamat: 'http://127.0.0.1:' + port, keluar: '', salah: '' };
  kantor = k;
  proc.stdout.setEncoding('utf8'); proc.stdout.on('data', (s) => { k.keluar += s; });
  proc.stderr.setEncoding('utf8'); proc.stderr.on('data', (s) => { k.salah += s; });

  const batas = Date.now() + 20000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error('server mati saat start:\n' + k.keluar + k.salah);
    try { const r = await fetch(k.alamat + '/health'); if (r.ok) { await r.arrayBuffer(); break; } } catch { /* belum */ }
    if (Date.now() > batas) throw new Error('server tidak menjawab /health dalam 20 detik');
    await tidur(100);
  }
  return k;
}

function tutupKantor() {
  if (!kantor) return;
  try { kantor.proc.kill(); } catch { /* sudah mati */ }
  kantor = null;
}

/* Satu koneksi keep-alive untuk ~3.100 POST: tanpa ini tiap event bikin
   handshake TCP sendiri dan harness ini jadi menguji kecepatan soket, bukan
   server. */
const agen = new http.Agent({ keepAlive: true, maxSockets: 1 });
function kirimEvent(port, payload) {
  const badan = Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, path: '/event', method: 'POST', agent: agen,
      headers: { 'content-type': 'application/json', 'content-length': badan.length },
    }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end(badan);
  });
}

/* Penadah /stream: mengumpulkan event yang benar-benar disiarkan server. */
function sadapStream(port, saring) {
  const ev = [];
  const req = http.request({ host: '127.0.0.1', port, path: '/stream', method: 'GET', agent: false,
    headers: { accept: 'text/event-stream' } });
  let sisa = '';
  const siap = new Promise((resolve) => {
    req.on('response', (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        sisa += chunk;
        let i;
        while ((i = sisa.indexOf('\n\n')) >= 0) {
          const blok = sisa.slice(0, i); sisa = sisa.slice(i + 2);
          for (const baris of blok.split('\n')) {
            if (!baris.startsWith('data:')) continue;
            try {
              const o = JSON.parse(baris.slice(5).trim());
              if (!saring || saring(o)) ev.push(o);
            } catch { /* bukan JSON: abaikan */ }
          }
        }
      });
      resolve(res);
    });
  });
  req.end();
  return { ev, siap, tutup: () => { try { req.destroy(); } catch { /* sudah */ } } };
}

/* Putar ulang lewat /stream?ulang= — koneksi terpisah yang menutup sendiri. */
function putarUlang(port, tanggal, laju) {
  return new Promise((resolve, reject) => {
    const ev = [];
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', agent: false,
      path: '/stream?ulang=' + tanggal + '&laju=' + laju, headers: { accept: 'text/event-stream' } },
    (res) => {
      res.setEncoding('utf8');
      let sisa = '';
      res.on('data', (chunk) => {
        sisa += chunk;
        let i;
        while ((i = sisa.indexOf('\n\n')) >= 0) {
          const blok = sisa.slice(0, i); sisa = sisa.slice(i + 2);
          for (const baris of blok.split('\n')) {
            if (!baris.startsWith('data:')) continue;
            try { ev.push(JSON.parse(baris.slice(5).trim())); } catch { /* abaikan */ }
          }
        }
        if (ev.some((x) => x.kind === 'ulang-selesai')) { req.destroy(); resolve(ev); }
      });
      res.on('end', () => resolve(ev));
    });
    req.on('error', (e) => (ev.length ? resolve(ev) : reject(e)));
    req.end();
    setTimeout(() => { try { req.destroy(); } catch { /* sudah */ } resolve(ev); }, 60000).unref?.();
  });
}

const ambilJson = async (alamat, jalur) => {
  const r = await fetch(alamat + jalur);
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { _teks: t, _status: r.status }; }
};

/* ================================================================ utama ==== */

async function utama() {
  console.log(tebal('uji-ulang-server') + abu(' — hari sungguhan diputar ke server.mjs, bukan ke room.js'));

  const { kepala, baris } = muatFixture();
  const semua = SAMPAI > 0 ? baris.slice(0, SAMPAI) : baris;
  const kirim = semua.filter((b) => !KIND_LAHIR_DI_SERVER.has(b.kind) && KIND_KE_HOOK[b.kind]);
  const dilewati = semua.length - kirim.length;
  console.log(abu(`  fixture ${kepala.dari} · ${semua.length} baris · ${kirim.length} dikirim sebagai hook · `
    + `${dilewati} dilewati (lahir di server)`));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-ulang-server-'));
  const akarProyek = path.join(dir, 'proyek');

  /* Folder proyek per (proyek, cabang) supaya cabangGit() punya bahan. */
  const cwdPeta = new Map();
  for (const b of kirim) {
    const proyek = b.cwd || 'tanpa-proyek';
    const cabang = b.cabang || '';
    const kunci = proyek + '@' + cabang;
    if (!cwdPeta.has(kunci)) cwdPeta.set(kunci, folderProyek(akarProyek, proyek, cabang));
  }

  const k = await bukaKantor(dir);
  const sadap = sadapStream(k.port, (o) => o && o.kind && o.kind !== 'beat');
  await sadap.siap;
  await tidur(150);

  /* ---------------------------------------------------------- A: kirim --- */
  console.log(tebal('\nA — seluruh hari diterima server'));
  const mulai = Date.now();
  const bukan204 = [];
  for (const b of kirim) {
    const cwd = cwdPeta.get((b.cwd || 'tanpa-proyek') + '@' + (b.cabang || ''));
    const kode = await kirimEvent(k.port, bangunPayload(b, cwd));
    if (kode !== 204) bukan204.push({ kind: b.kind, kode });
  }
  const detik = ((Date.now() - mulai) / 1000).toFixed(1);
  sama('semua payload dijawab 204 ' + abu('(' + detik + ' dtk)'), bukan204.length, 0);
  if (bukan204.length) tolak('  contoh yang gagal', JSON.stringify(bukan204.slice(0, 3)));

  await tidur(600);   // beri server waktu menulis agenda & buku induk

  const dibuang = (k.salah + k.keluar).match(/payload (diabaikan|dilewati)[^\n]*/g) || [];
  sama('tidak ada payload yang diabaikan server', dibuang.length, 0);
  if (dibuang.length) tolak('  contoh', dibuang.slice(0, 2).join(' | '));

  /* ------------------------------------------- B: normalize() & describe() */
  console.log(tebal('\nB — event yang terbit cocok dengan hari aslinya'));
  const terbit = sadap.ev.filter((o) => KIND_KE_HOOK[o.kind]);
  benar('jumlah event terbit >= yang dikirim', terbit.length >= kirim.length,
    'terbit ' + terbit.length + ', dikirim ' + kirim.length);

  const bedaLabel = []; const bedaLain = [];
  const n = Math.min(terbit.length, kirim.length);
  for (let i = 0; i < n; i++) {
    const a = kirim[i]; const t = terbit[i];
    const harapLabel = labelDiharapkan(a.tool, a.label);
    if ((a.tool || '') !== (t.tool || '')) bedaLain.push(`#${i} tool ${a.tool} != ${t.tool}`);
    else if ((a.cwd || '') !== (t.cwd || '')) bedaLain.push(`#${i} proyek ${a.cwd} != ${t.cwd}`);
    else if ((a.cabang || '') !== (t.cabang || '')) bedaLain.push(`#${i} cabang ${a.cabang} != ${t.cabang}`);
    else if (harapLabel !== (t.label || '')) bedaLabel.push(`#${i} ${a.tool || 'kind:' + a.kind}: harap «${harapLabel}» dapat «${t.label}»`);
  }
  sama('tool, proyek, dan cabang cocok untuk tiap event', bedaLain.length, 0);
  if (bedaLain.length) tolak('  contoh', bedaLain.slice(0, 3).join(' | '));
  sama('label hasil describe() cocok untuk tiap event', bedaLabel.length, 0);
  if (bedaLabel.length) {
    tolak('  label yang tidak bisa dibalik', bedaLabel.slice(0, 3).join(' | ')
      + ' — tambahkan tool-nya di toolInputUntuk() pada uji-ulang-server.mjs');
  }
  const mcpUji = kirim.filter((b) => b.tool && b.tool.startsWith('mcp__')).length;
  benar('label MCP dibangun dari nama tool, bukan dari input ' + abu('(' + mcpUji + ' baris)'),
    mcpUji > 0 && bedaLabel.length === 0);

  /* ---------------------------------------------------- C: buku induk ---- */
  console.log(tebal('\nC — buku induk mencatat hari yang sama'));
  const bi = await ambilJson(k.alamat, '/buku-induk');
  const proyekBi = bi.proyek || {};
  const harapTool = new Map(); const harapGagal = new Map(); const harapSesi = new Map();
  for (const b of kirim) {
    const p = b.cwd || '';
    if (!p) continue;
    if (b.kind === 'pre' && b.tool) harapTool.set(p, (harapTool.get(p) || 0) + 1);
    if (b.kind === 'post' && b.ok === false) harapGagal.set(p, (harapGagal.get(p) || 0) + 1);
    if (!harapSesi.has(p)) harapSesi.set(p, new Set());
    harapSesi.get(p).add(b.session);
  }
  let bedaTool = 0; let bedaGagal = 0; let bedaSesi = 0;
  for (const [p, jml] of harapTool) {
    const r = proyekBi[p] || {};
    if (r.toolCall !== jml) { bedaTool++; if (TAMPIL) console.log(abu(`      ${p}: toolCall ${r.toolCall} != ${jml}`)); }
    if ((r.gagal || 0) !== (harapGagal.get(p) || 0)) { bedaGagal++; if (TAMPIL) console.log(abu(`      ${p}: gagal ${r.gagal} != ${harapGagal.get(p) || 0}`)); }
    if ((r.sesi || 0) !== harapSesi.get(p).size) { bedaSesi++; if (TAMPIL) console.log(abu(`      ${p}: sesi ${r.sesi} != ${harapSesi.get(p).size}`)); }
  }
  const totalPre = [...harapTool.values()].reduce((a, b) => a + b, 0);
  sama('toolCall per proyek == jumlah `pre` bertool ' + abu('(' + totalPre + ' total)'), bedaTool, 0);
  sama('gagal per proyek == jumlah `post` ok:false', bedaGagal, 0);
  sama('sesi per proyek == sesi berbeda di fixture', bedaSesi, 0);

  /* ------------------------------------------------------- D: putar ulang */
  console.log(tebal('\nD — buku agenda bisa diputar ulang utuh'));
  const hariIni = new Date();
  const tgl = hariIni.getFullYear() + '-' + String(hariIni.getMonth() + 1).padStart(2, '0')
    + '-' + String(hariIni.getDate()).padStart(2, '0');
  const berkasAgenda = path.join(dir, 'agenda', tgl + '.jsonl');
  const barisAgenda = fs.existsSync(berkasAgenda)
    ? fs.readFileSync(berkasAgenda, 'utf8').split('\n').filter((t) => t.trim()) : [];
  benar('agenda hari ini benar-benar ditulis', barisAgenda.length > 0, berkasAgenda);

  const diputar = await putarUlang(k.port, tgl, 600);
  const isiUlang = diputar.filter((o) => o.kind && o.kind !== 'ulang-selesai');
  benar('putar ulang mengeluarkan baris sebanyak yang tercatat agenda',
    isiUlang.length === barisAgenda.length,
    'diputar ' + isiUlang.length + ', di agenda ' + barisAgenda.length);
  benar('  ditutup penanda ulang-selesai', diputar.some((o) => o.kind === 'ulang-selesai'));

  /* Bukan sekadar hitungan: satu `pre` dan satu `stop-gagal` diperiksa
     field-nya, karena itu yang menguji daftar putih agendaBaris(). */
  const prePutar = isiUlang.find((o) => o.kind === 'pre' && o.tool && o.panggilan);
  if (prePutar) {
    const punya = ['session', 'cwd', 'tool', 'label', 'panggilan', 'cabang'].filter((f) => prePutar[f] !== undefined);
    benar('  satu baris `pre` kembali utuh ' + abu('(' + punya.join(', ') + ')'), punya.length >= 5,
      JSON.stringify(prePutar).slice(0, 200));
  } else tolak('  tidak ada baris `pre` ber-panggilan di hasil putar ulang');

  const gagalPutar = isiUlang.find((o) => o.kind === 'stop-gagal');
  if (gagalPutar) {
    benar('  satu baris `stop-gagal` membawa sebab galatnya',
      Boolean(gagalPutar.label || gagalPutar.galat), JSON.stringify(gagalPutar).slice(0, 200));
  } else tolak('  tidak ada baris `stop-gagal` di hasil putar ulang');

  /* ------------------------------------------------------------ E: macet - */
  console.log(tebal('\nE — sesi macet menyala lalu padam'));
  const jmlStopGagal = kirim.filter((b) => b.kind === 'stop-gagal').length;
  const macetTerbit = sadap.ev.filter((o) => o.kind === 'stop-gagal').length;
  sama('tiap stop-gagal fixture terbit sebagai event', macetTerbit, jmlStopGagal);

  const ruang = await ambilJson(k.alamat, '/ruangan');
  const sesiMacet = (ruang.sesi || []).filter((s) => s.macet);
  const sesiTerakhirGagal = new Set();
  const terakhirPerSesi = new Map();
  for (const b of kirim) terakhirPerSesi.set(b.session, b.kind);
  for (const [s, kind] of terakhirPerSesi) if (kind === 'stop-gagal') sesiTerakhirGagal.add(s);
  benar('yang masih macet cuma sesi yang event terakhirnya stop-gagal',
    sesiMacet.every((s) => sesiTerakhirGagal.has(s.sesi)),
    'macet: ' + sesiMacet.map((s) => s.sesi).join(', ')
    + ' | seharusnya: ' + [...sesiTerakhirGagal].join(', '));
  catatan('butuhManusia TIDAK teruji di sini — fixture ini tidak memuat pemicunya '
    + abu('(izin-minta / notifikasi yang menahan)'));

  /* --------------------------------------------------------- F: sesudahnya */
  console.log(tebal('\nF — keadaan server sesudah hari habis'));
  const sehat = await ambilJson(k.alamat, '/health');
  benar('server masih hidup dan menjawab /health', sehat.ok === true, JSON.stringify(sehat).slice(0, 160));
  if (typeof sehat.memoriMB === 'number') {
    benar('memoriMB di bawah ambang ' + abu('(' + sehat.memoriMB + ' MB, ambang 300)'),
      sehat.memoriMB < 300, sehat.memoriMB + ' MB');
  }

  /* Daftar hadir: PENGHITUNG saja, tidak ada yang berubah karenanya. Yang
     diuji cuma bentuknya masuk akal — sesi sintetis di sini memang tidak
     punya berkas di ~/.claude/sessions, jadi semuanya harus jatuh ke yatim. */
  const absen = sehat.absen || {};
  benar('/health membawa penghitung daftar hadir', typeof absen.terbaca === 'number', JSON.stringify(absen));
  benar('  sesi sintetis dihitung yatim, bukan cocok', absen.cocok === 0, JSON.stringify(absen));
  benar('  tidak ada yang divonis mati', absen.mati === 0, JSON.stringify(absen));

  const berakhir = new Set(kirim.filter((b) => b.kind === 'session-end').map((b) => b.session));
  const semuaSesi = new Set(kirim.map((b) => b.session).filter(Boolean));
  const harapHidup = [...semuaSesi].filter((s) => !berakhir.has(s)).length;
  sama('sesi hidup == sesi yang tidak pernah kirim session-end',
    (ruang.sesi || []).length, harapHidup);

  const metrik = await (await fetch(k.alamat + '/metrics')).text();
  const m = /agent_room_sesi_hidup (\d+)/.exec(metrik);
  benar('/metrics melaporkan angka sesi hidup yang sama',
    Boolean(m) && Number(m[1]) === harapHidup,
    m ? 'metrics ' + m[1] + ' vs ' + harapHidup : 'metrik agent_room_sesi_hidup tidak ada');

  sadap.tutup();
  tutupKantor();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* biarkan OS */ }

  console.log('\n' + (gagal
    ? merah(tebal('GAGAL')) + ' ' + gagal + ' dari ' + periksa + ' pemeriksaan'
    : hijau(tebal('LULUS')) + ' ' + periksa + ' pemeriksaan'
      + abu(` · ${kirim.length} event, ${detik} dtk`)));
  process.exit(gagal ? 1 : 0);
}

utama().catch((e) => {
  tutupKantor();
  console.error(merah('galat: ') + (e && e.stack ? e.stack : e));
  process.exit(1);
});
