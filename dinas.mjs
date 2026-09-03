#!/usr/bin/env node
// dinas.mjs :: pelaksana harian Kantor Dinas
//   dinas                 -> buka kantornya (server + ruangan)
//   dinas --kendali       -> sekalian izinkan halaman menugaskan pekerjaan
//   dinas --pasang        -> pasang hook dulu, baru buka kantor
//   dinas --pasang -g     -> pasang hook untuk semua project
//   dinas --lepas         -> lepas hook, tidak membuka kantor
//   dinas --periksa       -> cuma tampilkan status, tidak menjalankan apa pun
//   dinas --port 4600     -> pakai port lain
//   dinas --buka          -> sekalian buka peramban
//   dinas --versi         -> cetak versi paket saja
//   dinas --layanan       -> daftarkan supaya kantornya nyala sendiri tiap login
//   dinas --layanan --lepas -> cabut pendaftaran itu
//   dinas --layanan --coba  -> cuma cetak yang akan dijalankan, tidak mendaftar
//   dinas --mcp           -> cara mendaftarkan kantor sebagai MCP server ke Claude Code
//   dinas --mcp --json    -> cuma JSON mcpServers-nya
//
// Gunanya bukan menghemat ketikan. Ada tiga hal yang tidak bisa dilihat
// `node server.mjs` sendirian dan justru itu yang paling sering bikin orang
// bingung: biner claude mana yang sebenarnya akan dipanggil, hook-nya sudah
// terpasang atau belum, dan kredensial headless-nya ada atau tidak. Ketiganya
// dilaporkan sebelum servernya jalan.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const ambil = (nama, bawaan) => {
  const i = args.indexOf(nama);
  return i >= 0 && args[i + 1] ? args[i + 1] : bawaan;
};
const ada = (...n) => n.some((x) => args.includes(x));

const PORT = ambil('--port', process.env.AGENT_ROOM_PORT || '4517');
const KENDALI = ada('--kendali', '-k');
const GLOBAL = ada('--global', '-g');
const BUKA = ada('--buka', '-b');

/* ————— versi paket —————
   Dibaca dari package.json di sebelah berkas ini, bukan ditulis ulang di sini,
   supaya cuma ada satu tempat yang perlu dinaikkan. Kalau berkasnya tidak ada
   (salinan lepas tanpa package.json), kop tetap tampil — tanpa angka. */
function versiPaket() {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(DIR, 'package.json'), 'utf8'));
    return typeof p.version === 'string' ? p.version : '';
  } catch { return ''; }
}
const VERSI = versiPaket();

if (ada('--versi', '--version')) {
  if (!VERSI) { console.error('package.json tidak ketemu di ' + DIR); process.exit(1); }
  console.log(VERSI);
  process.exit(0);
}

/* ————— MCP: kantor yang bisa ditanya sesi lain —————
   Tidak menjalankan `claude mcp add` sendiri — mendaftarkan MCP server itu
   mengubah konfigurasi Claude Code milik pengguna, dan itu keputusan yang
   pantas diketik sendiri. Yang dicetak dua-duanya: perintah CLI, dan JSON
   untuk ditempel ke .mcp.json / settings kalau lebih suka begitu. */
if (ada('--mcp')) {
  const skrip = path.join(DIR, 'mcp-room.mjs');
  const url = (process.env.AGENT_ROOM_URL || '').trim() || 'http://127.0.0.1:' + PORT;
  const env = url !== 'http://127.0.0.1:4517' ? { AGENT_ROOM_URL: url } : {};
  const json = { mcpServers: { 'agent-room': { command: process.execPath, args: [skrip], ...(Object.keys(env).length ? { env } : {}) } } };
  if (ada('--json')) {
    console.log(JSON.stringify(json, null, 2));
    process.exit(0);
  }
  const q = (t) => '"' + String(t).replace(/"/g, '\\"') + '"';
  const envCli = Object.entries(env).map(([k, v]) => ' -e ' + k + '=' + v).join('');
  console.log();
  console.log('  Agent Room sebagai MCP server — supaya sesi Claude lain bisa menanyakan kantornya.');
  console.log('  Tools: ruangan_siapa_tertahan, ruangan_sesi_aktif, ruangan_token_hari_ini,');
  console.log('         ruangan_agenda_cari, ruangan_kesehatan  (hanya-baca, metadata saja)');
  console.log();
  console.log('  1. lewat CLI (daftarkan untuk pengguna ini):');
  console.log();
  console.log('     claude mcp add agent-room -s user' + envCli + ' -- ' + q(process.execPath) + ' ' + q(skrip));
  console.log();
  console.log('  2. atau tempel ke .mcp.json (proyek) / ~/.claude.json (mcpServers):');
  console.log();
  for (const b of JSON.stringify(json, null, 2).split('\n')) console.log('     ' + b);
  console.log();
  console.log('  Kantornya harus sedang jalan (`dinas`) di ' + url + ' saat tool dipanggil.');
  console.log('  Uji cepat: echo {"jsonrpc":"2.0","id":1,"method":"tools/list"} | node ' + q(skrip));
  console.log();
  process.exit(0);
}

/* ————— warna ————— */
const pakaiWarna = process.stdout.isTTY && !process.env.NO_COLOR;
const w = (kode) => (t) => (pakaiWarna ? `\x1b[${kode}m${t}\x1b[0m` : String(t));
const merah = w('31'), putih = w('97'), abu = w('90'), hijau = w('32');
const kuning = w('33'), tebal = w('1');

/* ————— kop surat —————
   Bingkainya sengaja ASCII biasa, bukan garis kotak Unicode: konsol Windows
   dengan codepage bawaan menampilkan yang kedua sebagai sampah, dan kop yang
   berantakan lebih buruk daripada kop yang sederhana. */
function kop() {
  const garis = '+' + '-'.repeat(52) + '+';
  const baris = (isi) => '|' + isi.padEnd(52) + '|';
  console.log();
  console.log('  ' + merah(garis));
  const judul = '   DINAS CLAUDE' + (VERSI ? '  v' + VERSI : '');
  console.log('  ' + merah('|') + putih(tebal(judul.padEnd(52))) + merah('|'));
  console.log('  ' + merah('|') + abu('   pemantau sesi Claude Code').padEnd(
    52 + (pakaiWarna ? 9 : 0)) + merah('|'));
  console.log('  ' + merah(garis));
  console.log();
  void baris;
}

/* ————— cari biner claude yang benar —————
   Satu mesin gampang punya dua instalasi sekaligus, dan `where claude` sering
   menemukan yang lama duluan. Versi lama bisa gagal tanpa suara: prosesnya
   lahir, stdout dan stderr kosong, lalu menggantung sampai timeout. Jadi semua
   kandidat dikumpulkan, versinya ditanya satu per satu, dan yang tertinggi yang
   dipakai — bukan yang kebetulan pertama di PATH. */
function versiDari(bin) {
  try {
    const keluar = execFileSync(bin, ['--version'], {
      encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = String(keluar).match(/(\d+)\.(\d+)\.(\d+)/);
    return m ? { teks: m[0], angka: [+m[1], +m[2], +m[3]] } : null;
  } catch {
    return null;
  }
}

function kandidatClaude() {
  const daftar = [];
  const tambah = (p, asal) => {
    if (!p) return;
    const rapi = path.normalize(p);
    if (!fs.existsSync(rapi)) return;
    if (daftar.some((d) => d.path.toLowerCase() === rapi.toLowerCase())) return;
    daftar.push({ path: rapi, asal });
  };

  // 1. yang ditemukan PATH — ini yang dipakai server kalau tidak ditunjuk
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const keluar = execFileSync(cmd, ['claude'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    for (const b of String(keluar).split(/\r?\n/)) if (b.trim()) tambah(b.trim(), 'PATH');
  } catch { /* tidak ada di PATH, bukan masalah */ }

  // 2. instalasi yang ikut aplikasi Claude di desktop, satu folder per versi
  const akar = process.platform === 'win32'
    ? [path.join(process.env.APPDATA || '', 'Claude', 'claude-code')]
    : [path.join(os.homedir(), '.claude', 'versions'),
       path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code')];
  for (const a of akar) {
    let isi = [];
    try { isi = fs.readdirSync(a); } catch { continue; }
    for (const v of isi) {
      tambah(path.join(a, v, process.platform === 'win32' ? 'claude.exe' : 'claude'), 'aplikasi Claude');
    }
  }

  // 3. tempat pemasangan manual yang lazim
  tambah(path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'), 'lokal');

  for (const d of daftar) d.versi = versiDari(d.path);
  const sah = daftar.filter((d) => d.versi);
  sah.sort((a, b) => {
    for (let i = 0; i < 3; i++) if (a.versi.angka[i] !== b.versi.angka[i]) return b.versi.angka[i] - a.versi.angka[i];
    return 0;
  });
  return { semua: daftar, terbaik: sah[0] || null, dariPath: daftar.find((d) => d.asal === 'PATH') || null };
}

/* ————— hook terpasang atau belum ————— */
function cekHook() {
  const hitung = (berkas) => {
    let j;
    try { j = JSON.parse(fs.readFileSync(berkas, 'utf8')); } catch { return 0; }
    const h = j?.hooks;
    if (!h || typeof h !== 'object') return 0;
    let n = 0;
    for (const nama of Object.keys(h)) {
      if (!Array.isArray(h[nama])) continue;
      const punyaKita = h[nama].some((g) => Array.isArray(g?.hooks)
        && g.hooks.some((x) => String(x?.command || '').includes('agent-room')));
      if (punyaKita) n++;
    }
    return n;
  };
  return {
    proyek: hitung(path.join(process.cwd(), '.claude', 'settings.json')),
    global: hitung(path.join(os.homedir(), '.claude', 'settings.json')),
  };
}

/* Kredensial headless: yang dilaporkan cuma ADA atau TIDAK. Isinya tidak pernah
   dibaca, apalagi dicetak — berkas itu berisi token mentah. */
function cekToken() {
  const berkas = process.env.AGENT_ROOM_TOKEN_FILE || path.join(DIR, '.agent-room-token');
  try { return fs.statSync(berkas).size > 0 ? berkas : null; } catch { return null; }
}

const tundaDir = () => process.env.AGENT_ROOM_TUNDA_DIR || path.join(os.homedir(), '.agent-room', 'tunda');
function hitungTunda() {
  try { return fs.readdirSync(tundaDir()).filter((n) => /^\d{13}-[a-z0-9]{1,12}\.json$/.test(n)).length; }
  catch { return 0; }
}

/* ————— laporan sebelum kantor dibuka ————— */
function laporan(bin, hook, token) {
  const baris = (k, v) => console.log('  ' + abu(k.padEnd(13)) + v);
  console.log(tebal('  status kantor'));
  console.log(abu('  ' + '-'.repeat(52)));

  baris('versi', VERSI ? putih('agent-room ' + VERSI) : abu('tidak diketahui  (package.json tidak ada)'));

  if (bin.terbaik) {
    baris('pelaksana', hijau('claude ' + bin.terbaik.versi.teks) + abu('  (' + bin.terbaik.asal + ')'));
    baris('', abu(bin.terbaik.path));
    const p = bin.dariPath;
    if (p && p.versi && p.path.toLowerCase() !== bin.terbaik.path.toLowerCase()) {
      baris('', kuning('PATH menunjuk ' + p.versi.teks + ' — dilewati, yang dipakai ' + bin.terbaik.versi.teks));
    }
  } else {
    baris('pelaksana', merah('claude tidak ketemu') + abu('  (kendali web tidak akan jalan)'));
  }

  const totalHook = hook.proyek + hook.global;
  baris('hook', totalHook
    ? hijau(totalHook + ' event terpasang')
      + abu('  (' + [hook.proyek && hook.proyek + ' project', hook.global && hook.global + ' global']
        .filter(Boolean).join(', ') + ')')
    : kuning('belum terpasang') + abu('  (pasang: dinas --pasang)'));

  baris('kredensial', token
    ? hijau('tersimpan') + abu('  (' + path.basename(token) + ')')
    : abu('belum ada') + abu('  — cuma perlu kalau memakai kendali web'));

  baris('kendali web', KENDALI
    ? kuning('AKTIF') + abu('  — halaman boleh melahirkan sesi & menelusuri folder')
    : abu('mati') + abu('  (nyalakan: dinas --kendali)'));

  baris('alamat', putih('http://127.0.0.1:' + PORT));

  // kotak surat hook offline: berkas yang ditulis hook selagi kantor tutup,
  // dipungut server begitu nyala — angkanya saja, isinya tidak dibaca
  const tunda = hitungTunda();
  baris('surat tunda', tunda
    ? kuning(tunda + ' berkas') + abu('  (' + tundaDir() + '; diserap begitu kantor buka)')
    : abu('tidak ada') + abu('  — hook tidak pernah menulis selagi kantor tutup'));

  // gerbang: kunci event & kantor pusat (multi-mesin) — dibaca dari env yang
  // sama yang dipakai server dan installer, supaya laporannya tidak bohong
  const kunci = (process.env.AGENT_ROOM_KUNCI || '').trim();
  const kantor = (process.env.AGENT_ROOM_URL || '').trim();
  baris('kunci event', kunci
    ? hijau('terpasang') + abu('  (AGENT_ROOM_KUNCI; hook harus membawa header yang sama)')
    : abu('tidak') + abu('  — cukup selama bind tetap 127.0.0.1'));
  if (kantor) baris('kantor pusat', kuning(kantor) + abu('  (AGENT_ROOM_URL: hook mesin ini lapor ke sana)'));
  const bind = (process.env.AGENT_ROOM_HOST || '127.0.0.1').trim();
  if (bind !== '127.0.0.1' && bind !== 'localhost') {
    baris('bind', kunci ? kuning(bind) + abu('  — terbuka ke jaringan, dikunci')
      : merah(bind + '  TANPA KUNCI') + abu('  — isi AGENT_ROOM_KUNCI atau kembali ke 127.0.0.1'));
  }
  console.log(abu('  ' + '-'.repeat(52)));
  console.log();
}

function bukaPeramban(url) {
  const [cmd, argv] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, argv, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); }
  catch { /* tidak bisa buka sendiri, biarkan — alamatnya sudah dicetak */ }
}

/* ————— layanan latar —————
   Mendaftarkan kantor supaya nyala sendiri tiap login, memakai penjadwal bawaan
   tiap OS: Task Scheduler di Windows, systemd --user di Linux, launchd di macOS
   (yang terakhir baru petunjuk, belum ditulis otomatis). Tidak ada daemon
   buatan sendiri — yang sudah ada di OS lebih bisa dipercaya, dan pengguna bisa
   melihat/mencabutnya lewat alat yang sudah mereka kenal.

   Yang diteruskan ke layanan cuma --port dan --kendali. --buka sengaja tidak:
   layanan latar tidak punya urusan membuka peramban. --coba mencetak semua
   perintah dan isi berkas persis seperti yang akan dijalankan, tanpa menyentuh
   apa pun; itu juga satu-satunya jalur yang boleh dipakai di mesin uji. */
function layanan() {
  const COBA = ada('--coba');
  const LEPAS = ada('--lepas');
  // --os hanya dihormati bersama --coba: untuk melihat keluaran platform lain
  const plat = COBA ? ambil('--os', process.platform) : process.platform;
  const node = process.execPath;
  const skrip = path.join(DIR, 'dinas.mjs');
  const argLayanan = [];
  if (String(PORT) !== '4517') argLayanan.push('--port', String(PORT));
  if (KENDALI) argLayanan.push('--kendali');

  const q = (t) => (/[\s"]/.test(t) ? '"' + t.replace(/"/g, '\\"') + '"' : t);
  const perintahKantor = [q(node), q(skrip), ...argLayanan].join(' ');
  const cetak = (t) => console.log('  ' + t);
  const jalankan = (cmd, argv) => {
    cetak(abu('$ ') + [cmd, ...argv].map(q).join(' '));
    if (COBA) return;
    execFileSync(cmd, argv, { stdio: 'inherit' });
  };
  const tulis = (berkas, isi) => {
    cetak(abu((COBA ? 'akan menulis ' : 'menulis ') + berkas));
    console.log();
    for (const b of isi.split('\n')) console.log('    ' + abu(b));
    if (COBA) return;
    fs.mkdirSync(path.dirname(berkas), { recursive: true });
    fs.writeFileSync(berkas, isi, 'utf8');
  };
  const hapus = (berkas) => {
    cetak(abu((COBA ? 'akan menghapus ' : 'menghapus ') + berkas));
    if (COBA) return;
    fs.rmSync(berkas, { force: true });
  };

  console.log(tebal('  layanan latar') + abu(COBA ? '  (--coba: cuma dicetak, tidak dijalankan)' : ''));
  console.log(abu('  ' + '-'.repeat(52)));
  cetak(abu('perintah'.padEnd(13)) + perintahKantor);
  console.log();

  try {
    if (plat === 'win32') {
      const TN = 'AgentRoom';
      if (LEPAS) {
        jalankan('schtasks', ['/Delete', '/TN', TN, '/F']);
      } else {
        jalankan('schtasks', ['/Create', '/F', '/SC', 'ONLOGON', '/TN', TN, '/TR', perintahKantor]);
        console.log();
        cetak(abu('task "' + TN + '" jalan tiap login (jendela konsolnya tampil) — cek: schtasks /Query /TN ' + TN));
      }
    } else if (plat === 'linux') {
      const nama = 'agent-room.service';
      const berkas = path.join(os.homedir(), '.config', 'systemd', 'user', nama);
      if (LEPAS) {
        jalankan('systemctl', ['--user', 'disable', '--now', nama]);
        hapus(berkas);
        jalankan('systemctl', ['--user', 'daemon-reload']);
      } else {
        const unit = [
          '[Unit]',
          'Description=Agent Room - kantor dinas pemantau sesi Claude Code',
          'After=default.target',
          '',
          '[Service]',
          'ExecStart=' + perintahKantor,
          'WorkingDirectory=' + DIR,
          'Restart=on-failure',
          'RestartSec=3',
          '',
          '[Install]',
          'WantedBy=default.target',
          '',
        ].join('\n');
        tulis(berkas, unit);
        console.log();
        jalankan('systemctl', ['--user', 'daemon-reload']);
        jalankan('systemctl', ['--user', 'enable', '--now', nama]);
        console.log();
        cetak(abu('cek: systemctl --user status ' + nama + '  |  log: journalctl --user -u ' + nama));
      }
    } else if (plat === 'darwin') {
      const label = 'id.agent-room.dinas';
      const berkas = path.join(os.homedir(), 'Library', 'LaunchAgents', label + '.plist');
      const xml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const plist = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0"><dict>',
        '  <key>Label</key><string>' + label + '</string>',
        '  <key>ProgramArguments</key><array>',
        ...[node, skrip, ...argLayanan].map((a) => '    <string>' + xml(a) + '</string>'),
        '  </array>',
        '  <key>WorkingDirectory</key><string>' + xml(DIR) + '</string>',
        '  <key>RunAtLoad</key><true/>',
        '  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>',
        '</dict></plist>',
        '',
      ].join('\n');
      cetak(kuning('macOS belum didaftarkan otomatis — lakukan sendiri:'));
      console.log();
      if (LEPAS) {
        cetak(abu('$ launchctl unload -w ' + q(berkas)));
        cetak(abu('$ rm ' + q(berkas)));
      } else {
        cetak(abu('1. simpan isi berikut ke ' + berkas));
        console.log();
        for (const b of plist.split('\n')) console.log('    ' + abu(b));
        cetak(abu('2. $ launchctl load -w ' + q(berkas)));
      }
    } else {
      cetak(kuning('platform ' + plat + ' belum didukung; jalankan ' + perintahKantor + ' lewat penjadwal login milikmu sendiri.'));
    }
  } catch (e) {
    console.log();
    cetak(merah('gagal: ') + (e && e.message ? e.message : e));
    console.log(abu('  ' + '-'.repeat(52)));
    console.log();
    process.exit(1);
  }
  console.log(abu('  ' + '-'.repeat(52)));
  console.log();
  process.exit(0);
}

/* ————— jalan ————— */
kop();

if (ada('--layanan')) {
  layanan();
} else if (ada('--lepas')) {
  const a = ['install.mjs', '--remove']; if (GLOBAL) a.push('--global');
  const r = spawn(process.execPath, a.map((x, i) => (i ? x : path.join(DIR, x))),
                  { stdio: 'inherit', cwd: process.cwd() });
  r.on('close', (k) => process.exit(k ?? 0));
} else {
  const bin = kandidatClaude();
  const token = cekToken();

  if (ada('--pasang')) {
    const a = [path.join(DIR, 'install.mjs')]; if (GLOBAL) a.push('--global');
    const hasil = spawn(process.execPath, a, {
      stdio: 'inherit', cwd: process.cwd(),
      env: { ...process.env, AGENT_ROOM_PORT: String(PORT) },
    });
    hasil.on('close', (k) => (k === 0 ? mulai(bin, token) : process.exit(k ?? 1)));
  } else {
    mulai(bin, token);
  }
}

function mulai(bin, token) {
  laporan(bin, cekHook(), token);
  if (ada('--periksa')) {
    console.log(abu('  (--periksa: cuma memeriksa, kantornya tidak dibuka)'));
    console.log();
    process.exit(0);
  }

  const env = { ...process.env, AGENT_ROOM_PORT: String(PORT) };
  // Inilah gunanya semua penelusuran di atas: server dikasih tahu biner mana
  // yang benar, jadi jebakan dua instalasi tidak pernah kejadian lewat jalur ini.
  if (bin.terbaik && !process.env.AGENT_ROOM_CLAUDE) env.AGENT_ROOM_CLAUDE = bin.terbaik.path;

  const a = [path.join(DIR, 'server.mjs')];
  if (KENDALI) a.push('--izinkan-perintah');
  const srv = spawn(process.execPath, a, { stdio: 'inherit', env });

  if (BUKA) setTimeout(() => bukaPeramban('http://127.0.0.1:' + PORT), 900);

  const bubar = () => { try { srv.kill(); } catch { /* sudah mati */ } };
  process.on('SIGINT', bubar);
  process.on('SIGTERM', bubar);
  srv.on('close', (k) => {
    console.log();
    console.log(abu('  kantor tutup.'));
    process.exit(k ?? 0);
  });
}
