#!/usr/bin/env node
/* uji-mcp.mjs :: kontrak `mcp-room.mjs`, diuji lewat klien MCP palsu.
 *
 * `mcp-room.mjs` adalah SATU-SATUNYA pintu bagi sesi Claude lain untuk bertanya
 * ke kantor, dan sampai sekarang ia nol uji. Yang bisa hanyut tanpa ketahuan:
 *
 *   - bentuk balasan tool: "satu kalimat Indonesia" lalu "\n" lalu JSON. Klien
 *     membelahnya di "\n" pertama; kalimat yang tiba-tiba memuat "\n" merusak
 *     semua pembacanya sekaligus.
 *   - `isError` yang benar: kantor MATI dan kantor MENOLAK adalah dua hal
 *     berbeda, dan menuduh kantor mati padahal hidup mengirim orang ke arah
 *     yang salah.
 *   - kebersihan stdout. Stdout adalah kanal protokol; satu `console.log`
 *     nyasar merusak sesi klien mana pun. Hari ini yang menyelamatkan cuma
 *     kebiasaan (`log = console.error`), bukan penjaga.
 *   - aturan "MCP tetap HANYA-BACA". Ini ditegakkan lewat PERILAKU, bukan
 *     lewat regex atas sumber: anaknya diarahkan ke proksi pencatat, lalu
 *     dituntut bahwa tiap permintaan yang benar-benar keluar adalah GET ke
 *     rute yang ada di daftar putih. Tool tulis baru akan tertangkap walau
 *     ditulis lewat fungsi pembantu.
 *
 * Nol jaringan: server anak di 127.0.0.1, MCP lewat stdio, proksi di loopback.
 *
 * Pakai:
 *   node uji-mcp.mjs            jalankan semua kasus
 *   node uji-mcp.mjs --tampil   cetak juga tiap permintaan yang tercatat proksi
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');
const MCP = path.join(__dirname, 'mcp-room.mjs');
const TAMPIL = process.argv.includes('--tampil');

/* Daftar putih rute yang boleh disentuh MCP. SENGAJA cuma yang benar-benar
   dipanggil hari ini. Menambah tool yang perlu rute lain berarti menambah
   barisnya DI SINI, di commit yang sama — itu justru gunanya pagar ini:
   pelebaran harus disengaja dan terlihat di diff.

   `/metrics` TIDAK ada di daftar dan itu disengaja: ia menjawab
   `text/plain; version=0.0.4`, sedangkan `ambil()` di mcp-room berakhir dengan
   `r.json()`. Tool yang memanggilnya akan melempar SyntaxError lalu mendarat
   di cabang "Kantor tidak bisa dihubungi" — menuduh kantor mati padahal hidup. */
const RUTE_BOLEH = new Set(['/ruangan', '/token-riwayat', '/agenda', '/health', '/skp']);

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
/* Disalin dari uji-pagu.mjs dengan sadar, bukan diimpor: tidak ada satu pun
   uji-*.mjs di repo ini yang mengekspor apa pun, dan memecah pustaka uji
   bersama menyentuh harness yang sedang dikerjakan orang lain. Itu commit
   tersendiri, bukan selundupan ke sini. */

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

const kantorHidup = new Set();
const anakHidup = new Set();

function sandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ar-mcp-'));
}

async function bukaKantor(dir) {
  const port = await portBebas(4700);
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_ROOM_')) delete env[k];
  Object.assign(env, {
    AGENT_ROOM_PORT: String(port),
    AGENT_ROOM_HOST: '127.0.0.1',
    AGENT_ROOM_CUACA: 'off',
    AGENT_ROOM_LAPOR: '',
  }, ENV_DATA(dir));

  const proc = spawn(process.execPath, [SERVER], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
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

function tutupKantor(k) {
  try { k.proc.kill(); } catch { /* sudah mati */ }
  kantorHidup.delete(k);
}

async function hook(k, jenis, sesi, tambahan = {}) {
  const r = await fetch(k.alamat + '/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: jenis, session_id: sesi, cwd: '/tmp/proyek-mcp', ...tambahan,
    }),
  });
  await r.arrayBuffer();
  if (r.status !== 204) throw new Error('POST /event menjawab ' + r.status);
  await tidur(25);
}

/* --------------------------------------------------------- proksi catat --- */
/* Meneruskan ke kantor sungguhan sambil mencatat {method, pathname}. Inilah
   penegakan "hanya-baca": yang diperiksa permintaan yang BENAR-BENAR keluar,
   bukan teks sumber yang gampang diakali refactor. */
async function proksiPencatat(tujuanPort) {
  const jejak = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    jejak.push({ method: req.method, pathname: u.pathname });
    const p = http.request(
      { host: '127.0.0.1', port: tujuanPort, path: req.url, method: req.method, headers: req.headers },
      (hulu) => { res.writeHead(hulu.statusCode, hulu.headers); hulu.pipe(res); },
    );
    p.on('error', () => { try { res.socket.destroy(); } catch { /* sudah putus */ } });
    req.pipe(p);
  });
  const port = await new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv.address().port)));
  return {
    jejak,
    url: 'http://127.0.0.1:' + port,
    tutup: () => new Promise((r) => srv.close(r)),
  };
}

/* ------------------------------------------------------------ klien MCP --- */
/* Klien JSON-RPC berbaris seadanya: satu pesan per baris, korelasi lewat id.
   Tiap baris stdout mentah ikut disimpan supaya kasus kebersihan stdout punya
   bahan — itu satu-satunya cara menangkap console.log yang nyasar. */
function klienMcp(alamatKantor) {
  const proc = spawn(process.execPath, [MCP], {
    cwd: __dirname,
    env: { ...process.env, AGENT_ROOM_URL: alamatKantor },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  anakHidup.add(proc);

  const st = { baris: [], stderr: '', tunggu: new Map(), idBerikut: 1, mati: false };
  let sisa = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    sisa += chunk;
    let i;
    while ((i = sisa.indexOf('\n')) >= 0) {
      const baris = sisa.slice(0, i).replace(/\r$/, '');
      sisa = sisa.slice(i + 1);
      if (!baris.trim()) continue;
      st.baris.push(baris);
      let msg = null;
      try { msg = JSON.parse(baris); } catch { continue; }   // kasus 6 yang menghakiminya
      if (msg && msg.id !== undefined && st.tunggu.has(msg.id)) {
        const { resolve, timer } = st.tunggu.get(msg.id);
        clearTimeout(timer); st.tunggu.delete(msg.id);
        resolve(msg);
      } else st.baris.tanpaPemilik = (st.baris.tanpaPemilik || 0) + 1;
    }
  });
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (s) => { st.stderr += s; });
  proc.on('exit', () => { st.mati = true; });

  const kirimMentah = (teks) => proc.stdin.write(teks + '\n');

  function minta(method, params, batasMs = 15000) {
    const id = st.idBerikut++;
    const p = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        st.tunggu.delete(id);
        reject(new Error('tidak ada jawaban untuk ' + method + ' dalam ' + batasMs + ' ms'
          + (st.stderr ? '\nstderr: ' + st.stderr.slice(-300) : '')));
      }, batasMs);
      st.tunggu.set(id, { resolve, timer });
    });
    kirimMentah(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }));
    return p;
  }

  return {
    st,
    minta,
    kirimMentah,
    async panggil(nama, args) {
      const r = await minta('tools/call', { name: nama, ...(args ? { arguments: args } : {}) });
      return r.result || {};
    },
    tutup() {
      try { proc.stdin.end(); } catch { /* sudah tutup */ }
      try { proc.kill(); } catch { /* sudah mati */ }
      anakHidup.delete(proc);
    },
  };
}

/* Membelah `content[0].text` seperti klien sungguhan: kalimat, lalu JSON. */
function belah(hasil) {
  const teks = ((hasil.content || [])[0] || {}).text || '';
  const i = teks.indexOf('\n');
  if (i < 0) return { kalimat: teks, data: undefined, adaPisah: false };
  const kalimat = teks.slice(0, i);
  let data; let sah = true;
  try { data = JSON.parse(teks.slice(i + 1)); } catch { sah = false; }
  return { kalimat, data, adaPisah: true, sah };
}

/* ================================================================ kasus 1 ===
   Jabat tangan. Yang dijaga: identitas server, versi yang tidak boleh hanyut
   dari package.json, dan notifikasi yang tidak boleh dijawab. */
async function kasus1(cli) {
  console.log(tebal('\nKasus 1 — jabat tangan MCP'));
  const init = await cli.minta('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  const r = init.result || {};
  sama('serverInfo.name', (r.serverInfo || {}).name, 'agent-room');
  const versiPaket = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
  sama('  versinya dari package.json, bukan ditulis tangan', (r.serverInfo || {}).version, versiPaket);
  benar('  mengumumkan kemampuan tools', Boolean(r.capabilities && r.capabilities.tools));
  benar('  membawa instructions untuk agen', typeof r.instructions === 'string' && r.instructions.length > 20);

  const p = await cli.minta('ping');
  benar('ping dijawab objek kosong', p.result && Object.keys(p.result).length === 0,
    JSON.stringify(p.result));

  /* notifications/initialized tidak boleh dijawab sama sekali. Kalau dijawab,
     baris jawabannya akan muncul tanpa pemilik dan kasus 6 ikut merah. */
  const sebelum = cli.st.baris.length;
  cli.kirimMentah(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  await tidur(250);
  sama('notifications/initialized tidak dijawab', cli.st.baris.length, sebelum);
}

/* ================================================================ kasus 2 ===
   Kontrak bentuk tool, dibaca dari tools/list — bukan dari regex atas sumber. */
async function kasus2(cli) {
  console.log(tebal('\nKasus 2 — kontrak tools/list'));
  const r = await cli.minta('tools/list');
  const tools = (r.result || {}).tools || [];
  benar('tools/list mengembalikan daftar', tools.length >= 5, 'dapat ' + tools.length + ' tool');
  for (const t of tools) {
    const dwibahasa = typeof t.description === 'string' && t.description.includes(' / ');
    const tertutup = t.inputSchema && t.inputSchema.additionalProperties === false;
    benar('  ' + t.name + abu(' — description dwibahasa + schema tertutup'),
      dwibahasa && tertutup,
      (!dwibahasa ? "description tidak memuat ' / ' (dwibahasa ID/EN). " : '')
      + (!tertutup ? 'inputSchema.additionalProperties bukan false.' : ''));
  }
  benar('  semua nama berawalan ruangan_', tools.every((t) => /^ruangan_/.test(t.name)),
    tools.map((t) => t.name).join(', '));
  return tools;
}

/* ================================================================ kasus 3 ===
   Bentuk balasan tiap tool: kalimat, "\n", JSON. Dijalankan untuk SEMUA tool
   yang dilaporkan tools/list, jadi tool baru ikut terjaga tanpa menyunting
   berkas ini. */
async function kasus3(cli, tools) {
  console.log(tebal('\nKasus 3 — tiap tool: satu kalimat, lalu JSON'));
  for (const t of tools) {
    const hasil = await cli.panggil(t.name);
    if (hasil.isError) { tolak(t.name + ' tidak boleh isError di kantor yang sehat', belah(hasil).kalimat); continue; }
    const b = belah(hasil);
    const rapi = b.adaPisah && b.sah && b.kalimat.length > 0 && !b.kalimat.includes('{');
    benar(t.name + abu(' — ' + b.kalimat.slice(0, 62)), rapi,
      !b.adaPisah ? 'tidak ada "\\n" pemisah kalimat dan JSON'
        : !b.sah ? 'bagian sesudah "\\n" bukan JSON yang sah'
          : b.kalimat.includes('{') ? 'kalimat ringkasnya kemasukan JSON' : 'kalimatnya kosong');
  }
}

/* ================================================================ kasus 4 ===
   Isi mengikuti keadaan yang disemai. Yang ditegaskan HANYA kunci yang memang
   dipetakan tiap tool — potretRuangan() baru saja bertambah `jk` (748cb30) yang
   tidak dipetakan mcp-room, dan golden seluruh muatan akan pecah tiap ada
   penambahan seperti itu lalu melatih orang mengabaikan uji ini. */
async function kasus4(cli) {
  console.log(tebal('\nKasus 4 — isi mengikuti keadaan kantor'));

  const tertahan = belah(await cli.panggil('ruangan_siapa_tertahan'));
  const daftar = (tertahan.data || {}).tertahan || [];
  sama('dua sesi tertahan terbaca', daftar.length, 2);
  const keadaan = daftar.map((d) => d.keadaan).sort();
  benar('  satu butuh-manusia, satu macet', JSON.stringify(keadaan) === JSON.stringify(['butuh-manusia', 'macet']),
    JSON.stringify(keadaan));
  /* `tertahanSelama` dihitung dari stempel `sejak` pada keadaan tertahan, bukan
     ditebak dari kapan sesi terakhir bersuara — dua hal yang berbeda. */
  const KUNCI_TERTAHAN = ['sesi', 'nama', 'proyek', 'cabang', 'mesin', 'keadaan', 'sebab', 'tool', 'sejakTerakhir', 'tertahanSelama'];
  const kurang = daftar.length ? KUNCI_TERTAHAN.filter((k) => !(k in daftar[0])) : KUNCI_TERTAHAN;
  benar('  tiap baris membawa kunci yang dijanjikan', kurang.length === 0, 'kunci hilang: ' + kurang.join(', '));

  const aktif = belah(await cli.panggil('ruangan_sesi_aktif'));
  const sesi = (aktif.data || {}).sesi || [];
  sama('tiga sesi hidup terbaca', sesi.length, 3);
  const KUNCI_SESI = ['sesi', 'nama', 'proyek', 'cabang', 'toolTerakhir', 'keadaan', 'lamaHidup', 'mode', 'kuasa'];
  const kurang2 = sesi.length ? KUNCI_SESI.filter((k) => !(k in sesi[0])) : KUNCI_SESI;
  benar('  tiap sesi membawa kunci yang dijanjikan', kurang2.length === 0, 'kunci hilang: ' + kurang2.join(', '));
  benar('  `jk` di hulu tidak ikut bocor ke MCP', !('jk' in (sesi[0] || {})),
    'mcp-room mulai meneruskan field yang tidak dipetakannya');

  /* Surat kuasa. Yang penting bagi agen lain: sesi berkuasa penuh TIDAK akan
     pernah minta paraf, jadi diamnya bukan tanda ia sedang menunggu dijawab. */
  /* Id sesi dipotong 12 karakter di server, jadi cocokkan awalannya —
     bukan string utuh yang kita kirim. */
  const berkuasa = sesi.find((s) => s.sesi.startsWith('sesi-macet'));
  sama('mode izin sesi terbaca apa adanya', (berkuasa || {}).mode, 'bypassPermissions');
  sama('  diterjemahkan jadi surat kuasa', (berkuasa || {}).kuasa, 'kuasa penuh');
  const tanpaMode = sesi.find((s) => s.sesi.startsWith('sesi-izin'));
  sama('  sesi tanpa mode tidak dikarang-karang', (tanpaMode || {}).kuasa, '');

  /* Berputar-putar. Sesi kerja disemai tiga Read yang PERSIS sama; sesi izin
     disemai tool berbeda-beda dan tidak boleh ikut tertandai. */
  const berputar = sesi.find((s) => s.sesi.startsWith('sesi-kerja'));
  sama('sesi yang mengulang operasi sama ditandai', (berputar || {}).putar, 'ulang-sama');
  sama('  sesi yang tidak mengulang tidak ditandai', (tanpaMode || {}).putar, '');

  const token = belah(await cli.panggil('ruangan_token_hari_ini'));
  const t = (token.data || {}).hariIni || {};
  sama('token hari ini persis yang disemai (masuk)', t.input, 1200);
  sama('token hari ini persis yang disemai (keluar)', t.output, 340);

  const agenda = belah(await cli.panggil('ruangan_agenda_cari', { kind: 'pre', limit: 10 }));
  const baris = (agenda.data || {}).baris || [];
  benar('agenda menemukan baris pre yang disemai', baris.length >= 1, 'dapat ' + baris.length + ' baris');
  if (baris.length) {
    const KUNCI_AGENDA = ['waktu', 'sesi', 'proyek', 'kind', 'tool'];
    const kurang3 = KUNCI_AGENDA.filter((k) => !(k in baris[0]));
    benar('  barisnya membawa kunci yang dijanjikan', kurang3.length === 0, 'kunci hilang: ' + kurang3.join(', '));
  }

  const sehat = belah(await cli.panggil('ruangan_kesehatan'));
  benar('ruangan_kesehatan melaporkan kantor buka', /Kantor buka/.test(sehat.kalimat), sehat.kalimat);

  /* Papan SKP lewat MCP. Yang dijaga di sini kontrak bentuknya, bukan angkanya
     — kebenaran nilainya urusan uji-skp.mjs, yang menulis buku agendanya
     sendiri. Satu hal yang memang cuma bisa dijaga di sini: rumusnya IKUT
     KELUAR. Nilai tanpa bobot yang menyertainya cuma angka yang harus
     dipercaya, dan agen lain tidak bisa membantahnya. */
  const skp = belah(await cli.panggil('ruangan_skp'));
  const dSkp = skp.data || {};
  benar('ruangan_skp membawa rentang tanggalnya', Boolean(dSkp.rentang && dSkp.rentang.dari && dSkp.rentang.sampai),
    JSON.stringify(dSkp.rentang));
  const SUMBU = ['rasioGagal', 'bolakBalik', 'tertahan', 'gagalBeruntun', 'rapatYatim'];
  const kurangBobot = SUMBU.filter((k) => !Number.isFinite((dSkp.bobot || {})[k]));
  benar('  rumusnya ikut keluar: bobot tiap sumbu', kurangBobot.length === 0, 'sumbu tanpa bobot: ' + kurangBobot.join(', '));
  const kurangJenuh = SUMBU.filter((k) => !Number.isFinite((dSkp.jenuh || {})[k]));
  benar('  titik jenuh tiap sumbu ikut keluar', kurangJenuh.length === 0, 'sumbu tanpa jenuh: ' + kurangJenuh.join(', '));
  sama('  bobot berjumlah 100', Object.values(dSkp.bobot || {}).reduce((a, b) => a + b, 0), 100);
  benar('  dasar bolak-balik disebut', ['tool+label', 'mati'].includes(dSkp.bolakBalikDasar), String(dSkp.bolakBalikDasar));
  benar('  proyek & sesi berupa larik', Array.isArray(dSkp.proyek) && Array.isArray(dSkp.sesi),
    typeof dSkp.proyek + '/' + typeof dSkp.sesi);
  for (const baris of [...(dSkp.proyek || []), ...(dSkp.sesi || [])].slice(0, 8)) {
    benar('  nilai tiap baris 0–100 atau null', baris.nilai === null || (baris.nilai >= 0 && baris.nilai <= 100),
      JSON.stringify(baris.nilai));
    benar('  sumbu yang dipakai disebut namanya', Array.isArray(baris.bobotDipakai)
      && baris.bobotDipakai.every((k) => SUMBU.includes(k)), JSON.stringify(baris.bobotDipakai));
  }
  /* Isi kerja tidak boleh ikut lewat pintu baru ini. Sekelas sentinel di
     uji-paraf.mjs: yang disaring bukan nama medan, tapi seluruh badan balasan. */
  const teksSkp = JSON.stringify(skp.data);
  benar('  tidak ada label/isi kerja yang ikut keluar',
    !/"label"|"galat"|"alasan"|"tanya"/.test(teksSkp), teksSkp.slice(0, 160));
  const saring = belah(await cli.panggil('ruangan_skp', { proyek: 'proyek-yang-tidak-ada' }));
  sama('  saringan proyek yang tidak cocok mengosongkan daftar', ((saring.data || {}).proyek || []).length, 0);
  benar('    dan mengatakannya, bukan diam', /Tidak ada yang tercatat/.test(saring.kalimat), saring.kalimat);

  /* Pohon delegasi. Ini sekaligus bukti ujung-ke-ujung bahwa `agent_id` pada
     `pre` benar-benar dibaca server: tanpa itu `toolN` peserta tidak akan
     pernah naik dari nol. */
  const pohon = belah(await cli.panggil('ruangan_pohon_delegasi'));
  const daftarPohon = (pohon.data || {}).pohon || [];
  sama('satu sesi induk punya peserta', daftarPohon.length, 1);
  const anak = (daftarPohon[0] || {}).peserta || [];
  sama('  pesertanya satu', anak.length, 1);
  sama('  jenis agennya terbaca', (anak[0] || {}).agen, 'Explore');
  benar('  tool call peserta dihitung ke pesertanya, bukan ke induk',
    (anak[0] || {}).toolN >= 1, JSON.stringify(anak[0]));
  benar('  induk yang sudah stop disebut menunggu peserta, bukan menganggur',
    (daftarPohon[0] || {}).indukKeadaan === 'menunggu peserta',
    JSON.stringify((daftarPohon[0] || {}).indukKeadaan));
  benar('  ringkasnya menyebut delegasinya', /mendelegasikan 1 agen/.test(pohon.kalimat), pohon.kalimat);
}

/* ================================================================ kasus 5 ===
   Dua cabang galat yang WAJIB berbeda, plus galat protokol. */
async function kasus5(cli, kantor) {
  console.log(tebal('\nKasus 5 — galat: menolak ≠ mati'));

  /* Kantor HIDUP tapi menolak: tanggal yang tidak sah -> 400 dari /agenda. */
  const tolakan = await cli.panggil('ruangan_agenda_cari', { dari: 'bukan-tanggal' });
  benar('permintaan yang ditolak ditandai isError', tolakan.isError === true);
  const teksTolak = ((tolakan.content || [])[0] || {}).text || '';
  benar('  bunyinya "Kantor menolak", bukan "tidak bisa dihubungi"',
    /Kantor menolak/.test(teksTolak) && !/tidak bisa dihubungi/.test(teksTolak), teksTolak);

  /* Method asing tetap dijawab dengan galat JSON-RPC yang benar. */
  const asing = await cli.minta('metode/ngawur');
  benar('method tidak dikenal -> -32601', asing.error && asing.error.code === -32601,
    JSON.stringify(asing));

  /* Baris yang bukan JSON -> -32700 dengan id null. */
  const sebelum = cli.st.baris.length;
  cli.kirimMentah('{ ini bukan json }');
  await tidur(250);
  const baru = cli.st.baris.slice(sebelum).map((b) => { try { return JSON.parse(b); } catch { return null; } });
  const parse = baru.find((m) => m && m.error && m.error.code === -32700);
  benar('baris bukan JSON -> -32700', Boolean(parse), JSON.stringify(baru));
  if (parse) sama('  id-nya null, bukan hilang', parse.id, null);

  /* Permintaan sah TANPA id adalah notifikasi: tidak boleh dijawab sama
     sekali. Sebelum diperbaiki, mcp-room menjawabnya dengan respons tanpa
     kunci `id` — respons JSON-RPC yang tidak sah. */
  const sebelum2 = cli.st.baris.length;
  cli.kirimMentah(JSON.stringify({ jsonrpc: '2.0', method: 'ping' }));
  await tidur(250);
  sama('permintaan tanpa id (notifikasi) tidak dijawab', cli.st.baris.length, sebelum2);

  /* Kantor MATI: klien terpisah yang diarahkan ke port yang tidak didengarkan
     siapa pun. Sengaja tidak lewat proksi — proksi yang gagal meneruskan akan
     menghasilkan galat HTTP, dan yang mau diuji justru kegagalan transport. */
  const kosong = await portBebas(4900);
  const mati = klienMcp('http://127.0.0.1:' + kosong);
  try {
    await mati.minta('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    const h = await mati.panggil('ruangan_kesehatan');
    benar('kantor mati ditandai isError', h.isError === true);
    const teks = ((h.content || [])[0] || {}).text || '';
    benar('  bunyinya "tidak bisa dihubungi", bukan "menolak"',
      /tidak bisa dihubungi/.test(teks) && !/Kantor menolak/.test(teks), teks);
    benar('  menyebut env AGENT_ROOM_URL sebagai jalan keluarnya',
      /AGENT_ROOM_URL/.test(teks), teks);
  } finally { mati.tutup(); }

  benar('kantor tetap hidup sesudah semua kasus galat', kantor.proc.exitCode === null);
}

/* ================================================================ kasus 6 ===
   KEBERSIHAN STDOUT. Stdout adalah kanal protokol. Satu console.log nyasar
   merusak sesi klien mana pun, dan hari ini tidak ada yang menangkapnya. */
function kasus6(cli) {
  console.log(tebal('\nKasus 6 — stdout murni JSON-RPC'));
  const cacat = [];
  for (const b of cli.st.baris) {
    let m = null;
    try { m = JSON.parse(b); } catch { cacat.push('bukan JSON: ' + b.slice(0, 80)); continue; }
    if (!m || m.jsonrpc !== '2.0') cacat.push('tanpa jsonrpc 2.0: ' + b.slice(0, 80));
  }
  benar('tiap baris stdout adalah pesan JSON-RPC 2.0 ' + abu('(' + cli.st.baris.length + ' baris)'),
    cacat.length === 0, cacat.slice(0, 3).join(' | '));
  benar('  log memang pergi ke stderr', /agent-room MCP siap/.test(cli.st.stderr),
    'stderr: ' + cli.st.stderr.slice(0, 200));
}

/* ================================================================ kasus 7 ===
   HANYA-BACA, ditegakkan lewat perilaku. Sesudah SEMUA tool dipanggil, tiap
   permintaan yang benar-benar keluar harus GET ke rute di daftar putih. */
function kasus7(proksi) {
  console.log(tebal('\nKasus 7 — MCP tetap hanya-baca'));
  const jejak = proksi.jejak;
  if (TAMPIL) for (const j of jejak) console.log(abu('      ' + j.method + ' ' + j.pathname));
  benar('proksi mencatat permintaan yang keluar', jejak.length > 0,
    'nol permintaan tercatat — proksinya yang tidak terpasang, bukan MCP-nya yang pendiam');

  const bukanGet = jejak.filter((j) => j.method !== 'GET');
  benar('tidak ada permintaan selain GET',
    bukanGet.length === 0,
    bukanGet.map((j) => j.method + ' ' + j.pathname).join(', '));

  const liar = [...new Set(jejak.filter((j) => !RUTE_BOLEH.has(j.pathname)).map((j) => j.pathname))];
  benar('tiap rute ada di daftar putih ' + abu('(' + [...RUTE_BOLEH].join(', ') + ')'),
    liar.length === 0,
    'rute di luar daftar: ' + liar.join(', ')
    + '. Kalau memang disengaja, tambahkan ke RUTE_BOLEH di uji-mcp.mjs pada commit yang sama.');
}

/* -------------------------------------------------------------- jalankan --- */

async function utama() {
  console.log(tebal('uji-mcp') + abu(' — kontrak mcp-room.mjs lewat klien MCP palsu'));

  const dir = sandbox();
  /* Riwayat token disemai SEBELUM server menyala: server membacanya sekali
     saat start (riwayatMuat), jadi menulisnya belakangan tidak terbaca. */
  const kini = Date.now();
  fs.writeFileSync(path.join(dir, 'token-riwayat.jsonl'),
    JSON.stringify({ v: 1, ts: kini, proyek: 'proyek-mcp', model: 'claude-uji', input: 1200, output: 340, cacheTulis: 0, cacheBaca: 0 }) + '\n');

  const kantor = await bukaKantor(dir);
  const proksi = await proksiPencatat(kantor.port);
  const cli = klienMcp(proksi.url);

  try {
    /* Semai keadaan: satu sesi bekerja, satu minta izin, satu macet. */
    await hook(kantor, 'SessionStart', 'sesi-kerja-aa', { source: 'startup' });
    await hook(kantor, 'PreToolUse', 'sesi-kerja-aa', { tool_name: 'Read', tool_input: { file_path: '/tmp/a.txt' } });
    /* Tiga Read yang PERSIS sama: memicu detektor berputar-putar. */
    for (let i = 0; i < 3; i++) {
      await hook(kantor, 'PreToolUse', 'sesi-kerja-aa', {
        tool_name: 'Read', tool_input: { file_path: '/tmp/berulang.txt' },
      });
    }
    await hook(kantor, 'SessionStart', 'sesi-izin-bb', { source: 'startup' });
    await hook(kantor, 'PermissionRequest', 'sesi-izin-bb', { tool_name: 'Bash', tool_input: { command: 'rm -rf build' } });
    await hook(kantor, 'SessionStart', 'sesi-macet-cc', { source: 'startup' });
    await hook(kantor, 'StopFailure', 'sesi-macet-cc', { error: 'api_error', permission_mode: 'bypassPermissions' });

    /* Satu subagent di bawah sesi-kerja-aa, lalu satu tool call MILIK peserta
       itu (payload membawa agent_id, persis seperti hook yang menyala di dalam
       subagent), lalu induknya menutup gilirannya sementara pesertanya masih
       jalan — keadaan lazim, bukan pojok. */
    await hook(kantor, 'SubagentStart', 'sesi-kerja-aa', { agent_id: 'ag-uji-1', agent_type: 'Explore' });
    await hook(kantor, 'PreToolUse', 'sesi-kerja-aa', {
      agent_id: 'ag-uji-1', agent_type: 'Explore',
      tool_name: 'Grep', tool_input: { pattern: 'telaahRisiko' },
    });
    await hook(kantor, 'Stop', 'sesi-kerja-aa', {});
    await tidur(150);

    await kasus1(cli);
    const tools = await kasus2(cli);
    await kasus3(cli, tools);
    await kasus4(cli);
    await kasus5(cli, kantor);
    kasus6(cli);
    kasus7(proksi);
  } finally {
    cli.tutup();
    await proksi.tutup();
    for (const k of [...kantorHidup]) tutupKantor(k);
    for (const p of [...anakHidup]) { try { p.kill(); } catch { /* sudah mati */ } }
  }

  console.log('\n' + (gagal
    ? merah(tebal('GAGAL')) + ' ' + gagal + ' dari ' + periksa + ' pemeriksaan'
    : hijau(tebal('LULUS')) + ' ' + periksa + ' pemeriksaan'));
  process.exit(gagal ? 1 : 0);
}

utama().catch((e) => {
  for (const k of [...kantorHidup]) tutupKantor(k);
  for (const p of [...anakHidup]) { try { p.kill(); } catch { /* sudah mati */ } }
  console.error(merah('galat: ') + (e && e.stack ? e.stack : e));
  process.exit(1);
});
