#!/usr/bin/env node
/* uji-izin.mjs :: loket paraf — `mcp-izin.mjs` sebagai proses sungguhan, dan
 * gerbang kendali web di server.
 *
 * Ini jalur tata kelola manusia-di-lingkaran: sesi yang dilahirkan halaman
 * meminta izin lewat `--permission-prompt-tool`, `mcp-izin.mjs` meneruskannya
 * ke kantor, pegawai berdiri mengangkat map, dan baru sesudah kamu menekan
 * Paraf tool-nya boleh jalan. Sampai commit ini, NOL uji menyentuhnya —
 * `mcp-izin.mjs` (186 baris) sama sekali tidak punya penjaga.
 *
 * ---------------------------------------------------------------------------
 * YANG TIDAK DIUJI DI SINI, DAN KENAPA — dibaca dulu sebelum percaya hijaunya.
 *
 * Separuh jalur yang lain — `POST /perintah` → spawn → stream-json →
 * `serapStream()` → `subagent-start/stop` — dijaga `uji-kendali.mjs`, yang
 * memakai pemeran `claude-palsu.mjs` lewat seam `CLAUDE_SKRIP` di server.mjs.
 *
 * Berkas INI sengaja tidak memakai pemeran sama sekali: `mcp-izin.mjs` diadu
 * dengan loket TIRUAN supaya tiap rupa kegagalan loket — 404, gangguan
 * sesaat, habis waktu, loket mati, loket tanpa kunci — bisa DISURUH terjadi.
 * Lewat kantor sungguhan tidak satu pun dari itu bisa dipesan.
 *
 * ---------------------------------------------------------------------------
 * Yang dijaga:
 *
 *   A. `mcp-izin.mjs` sebagai proses sungguhan, diadu dengan LOKET TIRUAN
 *      (`loketParaf()` di penyedia-palsu.mjs): bentuk JSON-RPC, jalur allow,
 *      jalur deny, long-poll yang ditahan bukan berarti ditolak, gangguan
 *      sesaat yang tidak jadi penolakan, habis waktu, loket mati, loket tidak
 *      dikonfigurasi — dan sentinel privasi.
 *   B. Gerbang di kantor SUNGGUHAN, tanpa biner claude sama sekali: kendali
 *      web mati secara bawaan, token, Origin, dan rute izin yang menolak.
 *   C. Penjaga tertulis pertama untuk aturan yang tidak bisa ditawar:
 *      **sesi terminal tidak bisa diparaf dari halaman.** Permintaan izin
 *      yang datang lewat HOOK tidak pernah membawa `paraf`, tidak pernah
 *      masuk `izinTunggu`, dan karena itu tidak ada id yang bisa dipakai
 *      halaman untuk menjawabnya.
 *
 * Nol jaringan: loket tiruan dan kantor sungguhan dua-duanya di 127.0.0.1,
 * seluruh env berkas data ke folder sementara, dan PATH proses anak sengaja
 * dikosongkan supaya `cariClaude()` TIDAK MUNGKIN menemukan claude sungguhan
 * di mesin ini. Tidak ada satu pun agen yang benar-benar lahir dari uji ini.
 *
 * Pakai:
 *   node uji-izin.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loketParaf, envTanpaJalurKeluar } from './penyedia-palsu.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');
const MCP_IZIN = path.join(__dirname, 'mcp-izin.mjs');

const warna = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (n) => (s) => (warna ? '\x1b[' + n + 'm' + s + '\x1b[0m' : s);
const merah = c(31); const hijau = c(32); const abu = c(90); const tebal = c(1);

let periksa = 0; let gagal = 0;
const lulus = (t) => { periksa++; console.log('  ' + hijau('✓') + ' ' + t); };
const tolak = (t, ket) => { periksa++; gagal++; console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(ket) : '')); };
const benar = (t, syarat, ket) => { if (syarat) lulus(t); else tolak(t, ket || ''); };
const sama = (t, dapat, harap) => {
  if (dapat === harap) lulus(t + ' ' + abu('= ' + JSON.stringify(dapat)));
  else tolak(t, 'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harap));
};
const catatan = (t) => console.log('  ' + abu('! ' + t));
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

function portBebas(mulai) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', () => resolve(portBebas(mulai + 1)));
    s.once('listening', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.listen(mulai, '127.0.0.1');
    setTimeout(() => reject(new Error('portBebas menggantung')), 5000).unref?.();
  });
}

/* ————— klien MCP kecil untuk mcp-izin.mjs —————
   Bicara ke proses SUNGGUHAN lewat stdin/stdout, bukan memanggil fungsinya:
   yang mau dijaga justru kontrak antar-prosesnya. */
function klienIzin(env, opsi = {}) {
  const proc = spawn(process.execPath, [MCP_IZIN], {
    cwd: opsi.cwd || os.tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const k = { proc, stdout: '', stderr: '', baris: [], tunggu: new Map(), nomor: 0, mati: false };
  proc.stdout.setEncoding('utf8');
  let sisa = '';
  proc.stdout.on('data', (s) => {
    k.stdout += s;
    sisa += s;
    const potong = sisa.split('\n');
    sisa = potong.pop();
    for (const b of potong) {
      if (!b.trim()) continue;
      k.baris.push(b);
      let m = null;
      try { m = JSON.parse(b); } catch { /* biarkan; kasus 1 yang menagihnya */ }
      if (m && m.id != null && k.tunggu.has(m.id)) { k.tunggu.get(m.id)(m); k.tunggu.delete(m.id); }
    }
  });
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (s) => { k.stderr += s; });
  proc.on('exit', () => { k.mati = true; });

  k.kirim = (obj) => proc.stdin.write(JSON.stringify(obj) + '\n');
  k.minta = (method, params, batasMs = 20000) => {
    const id = ++k.nomor;
    return new Promise((resolve, reject) => {
      const jam = setTimeout(() => { k.tunggu.delete(id); reject(new Error(method + ' tidak dijawab dalam ' + batasMs + 'ms')); }, batasMs);
      k.tunggu.set(id, (m) => { clearTimeout(jam); resolve(m); });
      k.kirim({ jsonrpc: '2.0', id, method, params });
    });
  };
  /* Balasan tools/call membungkus JSON keputusannya sebagai TEKS di
     content[0].text — itu bentuk yang dimengerti CLI, jadi yang diperiksa
     harus hasil parse-nya, bukan objek MCP-nya. */
  k.izin = async (args, batasMs) => {
    const m = await k.minta('tools/call', { name: 'izin', arguments: args }, batasMs);
    const teks = m?.result?.content?.[0]?.text;
    try { return { m, d: JSON.parse(teks) }; } catch { return { m, d: null }; }
  };
  k.tutup = () => { try { proc.stdin.end(); proc.kill(); } catch { /* sudah mati */ } };
  return k;
}

const ENV_IZIN = (url, tambahan = {}) => envTanpaJalurKeluar(process.env, {
  AGENT_ROOM_URL: url,
  AGENT_ROOM_TUGAS: '11111111-2222-3333-4444-555555555555',
  AGENT_ROOM_KUNCI_IZIN: 'kunci-uji-yang-panjang-sekali-0123456789',
  ...tambahan,
});

/* ————— kantor sungguhan, tanpa biner claude ————— */
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
  AGENT_ROOM_ISI: 'off',
});

const kantorHidup = [];

async function bukaKantor(dir, argv = []) {
  const port = await portBebas(4880);
  /* PATH DIKOSONGKAN dengan sengaja. `cariClaude()` jatuh ke `where claude` /
     `which claude` kalau AGENT_ROOM_CLAUDE tidak dipasang — dan di mesin
     Fauzi itu MENEMUKAN claude sungguhan. Tanpa PATH, perintahnya sendiri
     tidak ketemu, execFileSync melempar, dan CLAUDE jadi null. Itu yang
     membuat harness ini mustahil melahirkan agen sungguhan. */
  const env = envTanpaJalurKeluar(process.env, {
    AGENT_ROOM_PORT: String(port), AGENT_ROOM_HOST: '127.0.0.1',
    ...ENV_DATA(dir), PATH: '', Path: '',
  });
  const proc = spawn(process.execPath, [SERVER, ...argv], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const k = { proc, port, alamat: 'http://127.0.0.1:' + port, log: '' };
  kantorHidup.push(k);
  proc.stdout.setEncoding('utf8'); proc.stdout.on('data', (s) => { k.log += s; });
  proc.stderr.setEncoding('utf8'); proc.stderr.on('data', (s) => { k.log += s; });
  const batas = Date.now() + 20000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error('server mati saat start:\n' + k.log);
    try { const r = await fetch(k.alamat + '/health'); if (r.ok) { await r.arrayBuffer(); break; } } catch { /* belum */ }
    if (Date.now() > batas) throw new Error('server tidak menjawab /health dalam 20 detik:\n' + k.log);
    await tidur(120);
  }
  return k;
}
const tutupSemuaKantor = () => { for (const k of kantorHidup) { try { k.proc.kill(); } catch { /* sudah mati */ } } };

const ambil = async (k, jalur, opsi = {}) => {
  const r = await fetch(k.alamat + jalur, opsi);
  const teks = await r.text();
  let d = null; try { d = JSON.parse(teks); } catch { /* bukan JSON */ }
  return { status: r.status, d, teks };
};
const kirimJson = (k, jalur, badan, header = {}) => ambil(k, jalur, {
  method: 'POST', headers: { 'content-type': 'application/json', ...header }, body: JSON.stringify(badan),
});

/* Penadah /stream lewat http polos — pola yang sama dengan uji-peserta.mjs:
   `fetch` + ReadableStream meninggalkan pembacaan yang meledak waktu
   servernya dimatikan, dan itu bukan kegagalan yang perlu dilaporkan. */
function sadap(port) {
  const ev = [];
  const req = http.request({ host: '127.0.0.1', port, path: '/stream', method: 'GET', agent: false,
    headers: { accept: 'text/event-stream' } });
  let sisa = '';
  const siap = new Promise((resolve) => {
    req.on('response', (res) => {
      res.setEncoding('utf8');
      res.on('data', (s) => {
        sisa += s;
        const potong = sisa.split('\n');
        sisa = potong.pop();
        for (const b of potong) {
          if (!b.startsWith('data:')) continue;
          try { ev.push(JSON.parse(b.slice(5).trim())); } catch { /* pembuka */ }
        }
      });
      res.on('error', () => { /* ditutup harness */ });
      resolve();
    });
  });
  req.on('error', () => { /* ditutup harness */ });
  req.end();
  return { ev, siap, tutup: () => { try { req.destroy(); } catch { /* sudah */ } } };
}

/* ————————————————————————— kasus ————————————————————————— */

async function jalan() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-izin-'));

  /* ---------------- A. mcp-izin.mjs sebagai proses sungguhan ---------------- */
  const loket = await loketParaf();

  console.log(tebal('\nKasus 1 — bentuk protokol: satu tool, stdout murni JSON-RPC'));
  {
    const k = klienIzin(ENV_IZIN(loket.url));
    const init = await k.minta('initialize', { protocolVersion: '2024-11-05' });
    sama('initialize menyebut namanya', init.result?.serverInfo?.name, 'agent-room-izin');
    k.kirim({ jsonrpc: '2.0', method: 'notifications/initialized' });   // notifikasi: tidak dibalas
    const daftar = await k.minta('tools/list');
    const tools = daftar.result?.tools || [];
    sama('tools/list mengembalikan tepat satu tool', tools.length, 1);
    sama('  namanya izin', tools[0]?.name, 'izin');
    const wajib = tools[0]?.inputSchema?.required || [];
    benar('  tool_name & input wajib', wajib.includes('tool_name') && wajib.includes('input'), JSON.stringify(wajib));
    const pong = await k.minta('ping');
    benar('ping dijawab kosong, bukan galat', pong.result && !pong.error, JSON.stringify(pong));
    const asing = await k.minta('metode/karangan');
    sama('metode tidak dikenal -> -32601', asing.error?.code, -32601);
    const toolAsing = await k.minta('tools/call', { name: 'bukan-izin', arguments: {} });
    sama('tool tidak dikenal -> -32602', toolAsing.error?.code, -32602);
    // baris rusak: id-nya null, jadi tidak bisa ditunggu lewat k.minta
    const sebelum = k.baris.length;
    k.kirim2 = () => k.proc.stdin.write('{ ini bukan json\n');
    k.kirim2();
    await tidur(300);
    const rusak = k.baris.slice(sebelum).map((b) => { try { return JSON.parse(b); } catch { return null; } });
    benar('baris bukan JSON -> -32700 ber-id null',
      rusak.some((m) => m && m.error?.code === -32700 && m.id === null), JSON.stringify(rusak));
    /* stdout milik protokol. Satu baris log yang nyasar ke sana sudah cukup
       membuat CLI menganggap servernya rusak — dan itu kegagalan yang cuma
       kelihatan kalau ada yang benar-benar membaca stdout-nya. */
    const bukanRpc = k.baris.filter((b) => { try { const m = JSON.parse(b); return m.jsonrpc !== '2.0'; } catch { return true; } });
    sama('tiap baris stdout adalah JSON-RPC 2.0 ' + abu('(' + k.baris.length + ' baris)'), bukanRpc.length, 0);
    benar('  lognya pergi ke stderr', k.stderr.length >= 0 && !/\[mcp-izin\]/.test(k.stdout), k.stdout.slice(0, 120));
    k.tutup();
  }

  console.log(tebal('\nKasus 2 — diparaf: allow, dan long-poll yang ditahan bukan penolakan'));
  {
    loket.st.tanya.length = 0; loket.st.tunggu.length = 0;
    loket.st.antrean = [{ tunggu: true }, { tunggu: true }, { keputusan: 'paraf' }];
    const k = klienIzin(ENV_IZIN(loket.url));
    await k.minta('initialize', {});
    const masuk = { command: 'rm -rf build', description: 'bersihkan' };
    const { d } = await k.izin({ tool_name: 'Bash', input: masuk, tool_use_id: 'toolu_abc123' });
    sama('keputusannya allow', d?.behavior, 'allow');
    sama('  input dikembalikan APA ADANYA', JSON.stringify(d?.updatedInput), JSON.stringify(masuk));
    sama('  loket ditanya tepat sekali', loket.st.tanya.length, 1);
    benar('  dan di-poll lebih dari sekali sebelum dijawab ' + abu('(' + loket.st.tunggu.length + '×)'),
      loket.st.tunggu.length >= 3, String(loket.st.tunggu.length));
    const t = loket.st.tanya[0] || {};
    sama('  permintaannya membawa id tugas', t.tugas, '11111111-2222-3333-4444-555555555555');
    benar('  membawa kunci dari env, bukan dari argv', t.kunci === 'kunci-uji-yang-panjang-sekali-0123456789',
      String(t.kunci).slice(0, 20));
    sama('  membawa nama tool', t.tool_name, 'Bash');
    sama('  membawa id panggilannya', t.tool_use_id, 'toolu_abc123');
    benar('  membawa telaah risiko yang dihitung DI SISI MCP dari input utuh',
      t.risiko?.tingkat === 'tinggi', JSON.stringify(t.risiko));
    const q = loket.st.tunggu[0] || {};
    benar('  poll-nya juga membawa tugas+kunci+id', q.tugas && q.kunci && q.id, JSON.stringify(q));
    k.tutup();
  }

  console.log(tebal('\nKasus 3 — ditolak dari ruangan: deny berpesan'));
  {
    loket.st.antrean = [{ keputusan: 'tolak', pesan: 'jangan yang itu dulu' }];
    const k = klienIzin(ENV_IZIN(loket.url));
    await k.minta('initialize', {});
    const { d } = await k.izin({ tool_name: 'Bash', input: { command: 'ls' } });
    sama('keputusannya deny', d?.behavior, 'deny');
    sama('  pesannya diteruskan apa adanya', d?.message, 'jangan yang itu dulu');
    benar('  tidak ada updatedInput di jalur deny', d?.updatedInput === undefined, JSON.stringify(d));
    k.tutup();
  }

  console.log(tebal('\nKasus 4 — permintaannya hilang: deny, bukan menggantung'));
  {
    loket.st.antrean = [{ http: 404 }];
    const k = klienIzin(ENV_IZIN(loket.url));
    await k.minta('initialize', {});
    const { d } = await k.izin({ tool_name: 'Read', input: { file_path: 'a.txt' } }, 10000);
    sama('keputusannya deny', d?.behavior, 'deny');
    benar('  pesannya menyebut permintaannya sudah tidak ada', /sudah tidak ada/.test(d?.message || ''), d?.message);
    k.tutup();
  }

  console.log(tebal('\nKasus 5 — gangguan sesaat BUKAN penolakan'));
  {
    /* Ini yang membedakan loket yang sabar dari loket yang gampang menyerah:
       dua poll gagal lalu diparaf harus tetap allow. Kalau tidak, satu kedip
       jaringan lokal berubah jadi penolakan yang tidak pernah kamu putuskan. */
    loket.st.antrean = [{ http: 500 }, { http: 500 }, { keputusan: 'paraf' }];
    loket.st.tunggu.length = 0;
    const k = klienIzin(ENV_IZIN(loket.url));
    await k.minta('initialize', {});
    const { d } = await k.izin({ tool_name: 'Bash', input: { command: 'ls' } }, 30000);
    sama('dua poll gagal lalu diparaf tetap allow', d?.behavior, 'allow');
    benar('  memang dicoba ulang ' + abu('(' + loket.st.tunggu.length + ' poll)'),
      loket.st.tunggu.length >= 3, String(loket.st.tunggu.length));
    k.tutup();
  }

  console.log(tebal('\nKasus 6 — habis waktu: deny "tidak ada paraf"'));
  {
    loket.st.antrean = [];
    loket.st.tetap = { tunggu: true };                 // tidak pernah dijawab orang
    const k = klienIzin(ENV_IZIN(loket.url, { AGENT_ROOM_IZIN_TIMEOUT_MS: '1200' }));
    await k.minta('initialize', {});
    const mulai = Date.now();
    const { d } = await k.izin({ tool_name: 'Bash', input: { command: 'ls' } }, 20000);
    const lama = Date.now() - mulai;
    sama('keputusannya deny', d?.behavior, 'deny');
    sama('  pesannya "tidak ada paraf"', d?.message, 'tidak ada paraf');
    benar('  dan benar-benar menunggu dulu ' + abu('(' + lama + 'ms)'), lama >= 1000, String(lama));
    loket.st.tetap = { keputusan: 'paraf' };
    k.tutup();
  }

  console.log(tebal('\nKasus 7 — loket tidak dikonfigurasi: menolak TANPA bertanya'));
  {
    /* Bukan cuma "hasilnya deny": yang penting ia tidak menghubungi siapa pun.
       Loket tanpa kunci yang tetap mengetuk pintu kantor adalah permintaan
       yang pasti ditolak 403 — bising, dan menyesatkan waktu dibaca di log. */
    loket.st.tanya.length = 0;
    const env = envTanpaJalurKeluar(process.env, { AGENT_ROOM_URL: loket.url });
    delete env.AGENT_ROOM_TUGAS; delete env.AGENT_ROOM_KUNCI_IZIN;
    const k = klienIzin(env);
    await k.minta('initialize', {});
    const { d } = await k.izin({ tool_name: 'Bash', input: { command: 'ls' } });
    sama('keputusannya deny', d?.behavior, 'deny');
    benar('  pesannya menyebut belum dikonfigurasi', /tidak dikonfigurasi/.test(d?.message || ''), d?.message);
    sama('  dan loketnya tidak pernah dihubungi', loket.st.tanya.length, 0);
    k.tutup();
  }

  console.log(tebal('\nKasus 8 — sentinel privasi: isi kerja tidak pernah sampai ke loket'));
  {
    /* Janji yang tertulis di kepala mcp-izin.mjs: input tool TIDAK pernah
       dikirim utuh. Yang diperiksa di sini bukan nama medannya, tapi SELURUH
       badan permintaan — kalau rahasianya muncul di mana pun, merah. */
    const RAHASIA = 'RAHASIA-JANGAN-KELUAR-9f3a2b7c1d';
    loket.st.tanya.length = 0;
    loket.st.antrean = [{ keputusan: 'paraf' }, { keputusan: 'paraf' }, { keputusan: 'paraf' }];
    loket.st.tetap = { keputusan: 'paraf' };
    const k = klienIzin(ENV_IZIN(loket.url));
    await k.minta('initialize', {});
    await k.izin({ tool_name: 'Write', input: { file_path: 'nota.txt', content: RAHASIA } });
    await k.izin({ tool_name: 'Edit', input: { file_path: 'nota.txt', old_string: 'a', new_string: RAHASIA } });
    const panjang = 'echo mulai; ' + 'x'.repeat(900) + '; echo ' + RAHASIA;
    await k.izin({ tool_name: 'Bash', input: { command: panjang } });
    const semua = JSON.stringify(loket.st.tanya);
    sama('tiga permintaan sampai ke loket', loket.st.tanya.length, 3);
    /* KONTROL POSITIF dulu. "rahasianya tidak ada" gampang sekali hijau
       karena alasan yang salah — badan permintaannya kosong, loketnya tidak
       mencatat, atau ringkasannya memang selalu kosong. Jadi dibuktikan
       lebih dulu bahwa yang diperiksa ini benar-benar berisi: potongan
       perintah yang MEMANG boleh lewat harus kelihatan. */
    benar('  kontrol positif: potongan yang memang boleh lewat memang terlihat',
      semua.includes('echo mulai'), semua.slice(0, 160));
    sama('  isi berkas (content) tidak pernah ikut', semua.includes(RAHASIA), false);
    const rBash = loket.st.tanya[2] || {};
    benar('  perintah panjang dipotong ≤300 dan ditandai …',
      (rBash.ringkasan || '').length <= 300 && rBash.ringkasan.endsWith('…'),
      JSON.stringify((rBash.ringkasan || '').length));
    const tanda = (rBash.risiko || {}).tanda || [];
    benar('  risiko cuma membawa NAMA POLA, bukan potongan perintah',
      tanda.every((x) => typeof x === 'string' && !x.includes('x'.repeat(20))), JSON.stringify(tanda));
    const rWrite = loket.st.tanya[0] || {};
    sama('  ringkasan Write memakai nama berkas, bukan isinya', rWrite.ringkasan, 'nota.txt');
    k.tutup();
  }

  console.log(tebal('\nKasus 9 — loket mati: deny yang jujur, prosesnya tetap hidup'));
  {
    const mati = await loketParaf();
    const alamatMati = mati.url;
    await mati.tutup();
    const k = klienIzin(ENV_IZIN(alamatMati));
    await k.minta('initialize', {});
    const { d } = await k.izin({ tool_name: 'Bash', input: { command: 'ls' } }, 20000);
    sama('keputusannya deny', d?.behavior, 'deny');
    benar('  pesannya membedakan "tidak bisa dihubungi" dari "ditolak"',
      /tidak bisa dihubungi/.test(d?.message || ''), d?.message);
    const lagi = await k.minta('tools/list');
    benar('  prosesnya tidak ikut mati', !k.mati && (lagi.result?.tools || []).length === 1, JSON.stringify(lagi).slice(0, 90));
    k.tutup();
  }

  await loket.tutup();

  /* ---------------- B. gerbang kantor sungguhan, tanpa claude ---------------- */
  console.log(tebal('\nKasus 10 — kendali web MATI secara bawaan'));
  const diam = await bukaKantor(path.join(dir, 'diam'));
  {
    const kd = await ambil(diam, '/kendali');
    sama('/kendali mengaku kendali web mati', kd.d?.izin, false);
    sama('  tidak ada token yang bisa dipungut', kd.d?.token, null);
    const pr = await kirimJson(diam, '/perintah', { prompt: 'halo', token: 'apa saja' });
    sama('POST /perintah ditolak 403', pr.status, 403);
    benar('  alasannya disebut', /kendali web mati/.test(pr.d?.pesan || ''), pr.d?.pesan);
    const jw = await kirimJson(diam, '/izin/jawab', { id: 'apa-saja', keputusan: 'paraf', token: 'x' });
    sama('POST /izin/jawab juga ditolak 403', jw.status, 403);
  }

  console.log(tebal('\nKasus 11 — kendali web nyala, tapi tidak ada biner claude'));
  const hidup = await bukaKantor(path.join(dir, 'hidup'), ['--izinkan-perintah']);
  let TOKEN = '';
  {
    const kd = await ambil(hidup, '/kendali');
    sama('/kendali mengaku kendali web nyala', kd.d?.izin, true);
    sama('  tapi belum siap karena binernya tidak ketemu', kd.d?.siap, false);
    benar('  alasannya disebut apa adanya', /claude tidak ketemu/.test(kd.d?.alasan || ''), kd.d?.alasan);
    TOKEN = kd.d?.token || '';
    benar('  tokennya diberikan', TOKEN.length >= 16, String(TOKEN.length));
    const salah = await kirimJson(hidup, '/perintah', { prompt: 'halo', token: 'token-karangan' });
    sama('token karangan ditolak 403', salah.status, 403);
    /* PAGAR KESELAMATAN, bukan sekadar urutan pemeriksaan. `POST /perintah`
       bertoken BENAR akan sungguh-sungguh men-spawn claude kalau kantor ini
       ternyata menemukannya — dan kalau penghapusan PATH gagal di mesin lain,
       uji ini yang akan melahirkan agen sungguhan di folder sementara.
       Jadi panggilannya dijaga: cuma dikirim sesudah kantor sendiri mengaku
       `siap:false`. Kalau ternyata siap, ini merah TANPA memanggil apa pun. */
    if (kd.d?.siap) {
      tolak('menolak memanggil /perintah — kantor mengaku SIAP, PATH tidak benar-benar kosong',
        'binernya: ' + JSON.stringify(kd.d?.alasan));
    } else {
      const benarToken = await kirimJson(hidup, '/perintah', { prompt: 'halo', token: TOKEN });
      sama('token benar pun berhenti di "biner tidak ketemu" ' + abu('(nol agen lahir)'), benarToken.status, 500);
    }
    catatan('PATH proses server sengaja dikosongkan — cariClaude() mustahil menemukan claude sungguhan di mesin ini');
  }

  console.log(tebal('\nKasus 12 — Origin asing ditolak di seluruh rute kendali'));
  {
    const asing = { origin: 'http://jahat.example' };
    for (const [nama, jalur, cara] of [
      ['/kendali', '/kendali', 'GET'],
      ['/perintah', '/perintah', 'POST'],
      ['/izin/tanya', '/izin/tanya', 'POST'],
      ['/izin/jawab', '/izin/jawab', 'POST'],
    ]) {
      const r = cara === 'GET'
        ? await ambil(hidup, jalur, { headers: asing })
        : await kirimJson(hidup, jalur, { token: TOKEN }, asing);
      sama('  ' + nama + ' dari Origin asing', r.status, 403);
    }
    const sendiri = await ambil(hidup, '/kendali', { headers: { origin: hidup.alamat } });
    sama('  Origin halaman sendiri tetap boleh', sendiri.status, 200);
  }

  console.log(tebal('\nKasus 13 — /izin/tanya menolak tugas yang tidak ada'));
  {
    const r = await kirimJson(hidup, '/izin/tanya', {
      tugas: '99999999-8888-7777-6666-555555555555', kunci: 'karangan',
      tool_name: 'Bash', ringkasan: 'ls',
    });
    sama('tugas karangan ditolak 403', r.status, 403);
    benar('  pesannya tidak membocorkan yang benar', /kunci izin tidak cocok/.test(r.d?.pesan || ''), r.d?.pesan);
    const j = await kirimJson(hidup, '/izin/jawab', { id: 'karangan', keputusan: 'paraf', token: TOKEN });
    sama('menjawab izin yang tidak ada -> 404', j.status, 404);
  }

  /* ---------------- C. aturan yang tidak bisa ditawar ---------------- */
  console.log(tebal('\nKasus 14 — SESI TERMINAL TIDAK BISA DIPARAF DARI HALAMAN'));
  {
    /* Aturan ini sudah lama tertulis di DESIGN dan sudah lama benar, tapi
       belum pernah ada yang menjaganya. Permintaan izin yang datang lewat
       HOOK (sesi terminal) tidak boleh membawa `paraf`, karena `paraf` itulah
       yang membuat halaman menggambar tombolnya. Tanpa id, tidak ada yang
       bisa dijawab — dan itu harus tetap benar walau id-nya ditebak. */
    const tap = sadap(hidup.port);
    await tap.siap;
    await tidur(150);
    const SESI = 'terminal-0001-aaaa-bbbb-cccccccccccc';
    const r = await kirimJson(hidup, '/event', {
      hook_event_name: 'PermissionRequest', session_id: SESI, cwd: dir,
      tool_name: 'Bash', tool_input: { command: 'rm -rf /' },
    }, { 'x-agent-room': '1' });
    benar('hook izin-minta diterima kantor', r.status === 204 || r.status === 200, String(r.status));
    await tidur(400);
    const minta = tap.ev.filter((e) => e.kind === 'izin-minta');
    benar('event izin-minta terbit', minta.length >= 1, JSON.stringify(tap.ev.map((e) => e.kind)));
    const e = minta[minta.length - 1] || {};
    sama('  TIDAK membawa `paraf` — halaman tidak punya tombol', e.paraf === undefined, true);
    const kd = await ambil(hidup, '/kendali', { headers: { origin: hidup.alamat } });
    sama('  tidak masuk daftar izinTunggu', (kd.d?.izinTunggu || []).length, 0);
    /* Tebak id-nya dari yang paling mungkin dipakai halaman. Semuanya harus
       404: bukan karena idnya salah, tapi karena memang tidak ada yang bisa
       diparaf untuk sesi terminal. */
    for (const tebakan of [SESI, SESI.slice(0, 12), String(e.id), 'izin-palsu-01']) {
      const j = await kirimJson(hidup, '/izin/jawab', { id: tebakan, keputusan: 'paraf', token: TOKEN });
      sama('  menjawab dengan id tebakan ' + abu(JSON.stringify(tebakan.slice(0, 14))), j.status, 404);
    }
    tap.tutup();
  }

  tutupSemuaKantor();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* biar OS yang bersihkan */ }
}

jalan().then(() => {
  tutupSemuaKantor();
  console.log();
  catatan('separuh jalur yang lain (POST /perintah → stream-json) dijaga uji-kendali.mjs');
  if (gagal) { console.log(merah(tebal('GAGAL ' + gagal + ' dari ' + periksa + ' pemeriksaan'))); process.exit(1); }
  console.log(hijau(tebal('LULUS ' + periksa + ' pemeriksaan')));
}).catch((err) => {
  tutupSemuaKantor();
  console.error(merah('\nuji-izin meledak: ' + (err && err.stack || err)));
  process.exit(1);
});
