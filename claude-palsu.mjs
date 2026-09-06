#!/usr/bin/env node
/* claude-palsu.mjs :: pemeran `claude` untuk uji loop kendali.
 *
 * BUKAN tiruan Claude Code. Ini pemeran panggung: ia membaca argv yang dirakit
 * `lahirkanTugas()`, memainkan satu NASKAH stream-json ke stdout, dan — untuk
 * naskah paraf — benar-benar menjalankan `mcp-izin.mjs` dari `--mcp-config`
 * yang dirakit server, persis seperti CLI sungguhan. Loket parafnya diuji
 * SUNGGUHAN, bukan ditiru.
 *
 * Dipasang lewat `AGENT_ROOM_CLAUDE` yang sudah ada. Server menjalankannya
 * sebagai `node claude-palsu.mjs …` karena namanya berakhiran `.mjs` — lihat
 * `CLAUDE_SKRIP` di server.mjs, dan kantor mengatakannya keras-keras di konsol
 * waktu jalur ini dipakai.
 *
 * ---------------------------------------------------------------------------
 * Berkas ini juga PENJAGA KONTRAK argv. Kalau `lahirkanTugas()` mengubah nama
 * flag, urutannya, atau berhenti mengirim salah satunya, pemeran ini berhenti
 * dengan kode ≠ 0 dan menulis sebabnya ke stderr — dan `uji-kendali.mjs`
 * merah. Itu disengaja: argv adalah antarmuka ke proses agen sungguhan, dan
 * sampai sekarang tidak ada satu pun yang menjaganya.
 *
 * Naskah dipilih dari isi prompt:
 *
 *   naskah:stream        rapat satu peserta — Task, panggilan bersarang
 *                        ber-parent_tool_use_id, tool_result, biaya
 *   naskah:paraf-allow   minta izin lewat mcp-izin; keputusannya dikabarkan
 *                        lewat kalimat agen + biaya (lihat naskahParaf)
 *   naskah:paraf-deny    sama, tapi harapannya ditolak
 *   naskah:gagal         berhenti dengan kode ≠ 0 tanpa pesan result
 *   naskah:bisu          tidak menulis SATU BYTE pun, dan tidak pernah keluar
 *   naskah:tahan         bicara stream-json lalu diam; slotnya tetap terpakai
 *
 * Nol dependency, nol jaringan (kecuali ke kantor di 127.0.0.1 lewat
 * mcp-izin.mjs), dan tidak pernah menyentuh biner claude sungguhan.
 */

import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => process.stderr.write('[claude-palsu] ' + a.join(' ') + '\n');
const tulis = (o) => new Promise((r) => process.stdout.write(JSON.stringify(o) + '\n', r));

/* ————— argv yang dirakit server, dibaca sebagai kontrak ————— */
function bacaArgv() {
  const p = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verbose') { p.verbose = true; continue; }
    if (a.startsWith('--') || a === '-p') { p[a.replace(/^--?/, '')] = argv[++i]; continue; }
  }
  return p;
}
const P = bacaArgv();

const WAJIB = [
  ['p', 'prompt sebagai satu elemen argv'],
  ['session-id', 'id sesi yang ditentukan server'],
  ['output-format', 'bentuk keluaran'],
  ['permission-mode', 'mode izin'],
  ['add-dir', 'folder kerja'],
];
const kurang = WAJIB.filter(([k]) => !P[k]).map(([k, ket]) => k + ' (' + ket + ')');
if (kurang.length) {
  log('argv tidak sesuai kontrak — flag hilang: ' + kurang.join(', '));
  log('argv apa adanya: ' + JSON.stringify(argv));
  process.exit(64);
}
if (P['output-format'] !== 'stream-json') { log('output-format bukan stream-json: ' + P['output-format']); process.exit(64); }
if (!P.verbose) { log('--verbose tidak dikirim; `-p` mensyaratkannya untuk stream-json'); process.exit(64); }

const SID = P['session-id'];
const PROMPT = String(P.p || '');
const naskah = (/naskah:([a-z-]+)/.exec(PROMPT) || [])[1] || 'stream';

/* ————— klien MCP kecil untuk loket paraf ————— */
function bukaMcp() {
  /* Konfigurasinya diambil dari --mcp-config yang DIRAKIT SERVER, tidak
     dikarang di sini: yang mau dibuktikan justru bahwa isi konfigurasi itu
     benar-benar bisa dijalankan apa adanya. Env-nya digabung ke env kita —
     itu yang dilakukan CLI sungguhan, dan itu pula yang membuat
     AGENT_ROOM_KUNCI_IZIN (yang cuma ada di env kita, tidak pernah di argv
     maupun di konfigurasi) sampai ke proses MCP. */
  let cfg;
  try { cfg = JSON.parse(P['mcp-config'] || '{}'); }
  catch { log('--mcp-config bukan JSON'); process.exit(65); }
  const srv = (cfg.mcpServers || {})['agent-room-izin'];
  if (!srv || !srv.command || !Array.isArray(srv.args)) {
    log('--mcp-config tidak memuat server agent-room-izin yang bisa dijalankan: ' + JSON.stringify(cfg));
    process.exit(65);
  }
  if (P['permission-prompt-tool'] !== 'mcp__agent-room-izin__izin') {
    log('--permission-prompt-tool tidak seperti yang dijanjikan: ' + P['permission-prompt-tool']);
    process.exit(65);
  }
  const anak = spawn(srv.command, srv.args, {
    env: { ...process.env, ...(srv.env || {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const k = { anak, tunggu: new Map(), nomor: 0 };
  let sisa = '';
  anak.stdout.setEncoding('utf8');
  anak.stdout.on('data', (s) => {
    sisa += s;
    const baris = sisa.split('\n');
    sisa = baris.pop();
    for (const b of baris) {
      if (!b.trim()) continue;
      let m = null;
      try { m = JSON.parse(b); } catch { continue; }
      if (m.id != null && k.tunggu.has(m.id)) { k.tunggu.get(m.id)(m); k.tunggu.delete(m.id); }
    }
  });
  anak.stderr.setEncoding('utf8');
  anak.stderr.on('data', (s) => process.stderr.write('[mcp-izin>] ' + s));
  /* Berbatas waktu. Pemeran yang menggantung selamanya membuat harness-nya
     kehabisan waktu dan melaporkan "event tidak terbit" — sebab yang salah
     untuk gejala yang benar. Lebih baik berhenti dengan kode yang jelas. */
  k.minta = (method, params, batasMs = 45000) => new Promise((resolve) => {
    const id = ++k.nomor;
    const jam = setTimeout(() => {
      k.tunggu.delete(id);
      log('mcp-izin tidak menjawab ' + method + ' dalam ' + batasMs + 'ms');
      process.exit(67);
    }, batasMs);
    k.tunggu.set(id, (m) => { clearTimeout(jam); resolve(m); });
    anak.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  k.tutup = () => { try { anak.stdin.end(); anak.kill(); } catch { /* sudah mati */ } };
  return k;
}

/* ————— naskah ————— */
const init = () => tulis({
  type: 'system', subtype: 'init', session_id: SID,
  model: P.model || 'palsu/pemeran-1',
  permissionMode: P['permission-mode'],
  cwd: P['add-dir'],
});
const hasil = (biaya) => tulis({
  type: 'result', subtype: 'success', session_id: SID,
  total_cost_usd: biaya, num_turns: 2, is_error: false,
});

/* Rapat satu peserta. Yang dibuktikan naskah ini: `pre` ber-peserta dan
   `subagent-start` lahir dari SATU tool_use bernama Task, panggilan di
   dalamnya membawa `agenId` karena `parent_tool_use_id`-nya terisi, dan
   `subagent-stop` menyusul waktu tool_result Task-nya datang. */
async function naskahStream() {
  await init();
  await tidur(30);
  await tulis({ type: 'assistant', session_id: SID, message: { role: 'assistant', content: [
    { type: 'text', text: 'Saya panggil satu peserta dulu.' },
    { type: 'tool_use', id: 'toolu_rapat_1', name: 'Task',
      input: { description: 'Telaah berkas', subagent_type: 'Explore' } },
  ] } });
  await tidur(30);
  // panggilan DARI dalam rapat: parent_tool_use_id = id panggilan Task-nya
  await tulis({ type: 'assistant', session_id: SID, parent_tool_use_id: 'toolu_rapat_1',
    message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'toolu_baca_1', name: 'Read', input: { file_path: 'server.mjs' } },
    ] } });
  await tidur(30);
  await tulis({ type: 'user', session_id: SID, parent_tool_use_id: 'toolu_rapat_1',
    message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'toolu_baca_1', is_error: false, content: 'ok' },
    ] } });
  await tidur(30);
  // tool_result Task-nya sendiri: ini yang menutup rapatnya
  await tulis({ type: 'user', session_id: SID, message: { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'toolu_rapat_1', is_error: false, content: 'selesai' },
  ] } });
  await tidur(30);
  await hasil(0.0421);
}

/* Loop paraf ujung ke ujung: mcp-izin.mjs sungguhan dijalankan dari
   --mcp-config yang dirakit server, dan naskahnya baru lanjut sesudah
   balasannya diterima. */
async function naskahParaf() {
  await init();
  const mcp = bukaMcp();
  await mcp.minta('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  const masuk = { command: 'rm -rf build/sementara', description: 'bersihkan hasil bangun' };
  const jawab = await mcp.minta('tools/call', {
    name: 'izin',
    arguments: { tool_name: 'Bash', input: masuk, tool_use_id: 'toolu_paraf_1' },
  });
  mcp.tutup();
  let d = null;
  try { d = JSON.parse(jawab?.result?.content?.[0]?.text); } catch { /* dijaga di bawah */ }
  if (!d || !d.behavior) {
    log('balasan loket paraf tidak berbentuk {behavior}: ' + JSON.stringify(jawab));
    process.exit(66);
  }
  log('loket menjawab: ' + d.behavior);
  /* Keputusannya dikabarkan lewat KALIMAT agen dan lewat BIAYA, bukan lewat
     `pre`/`post` tool-nya. Bukan pilihan gaya: begitu `mcp-izin.mjs` bicara ke
     `/izin/tanya`, server memanggil `tandaiHidup()` dan sesi itu dianggap
     dipegang hook — sesudah itu `serapStream()` berhenti menerbitkan tool_use
     dari stream (`if (rec.hidup) return`). Di produksi tool call-nya memang
     datang dari hook; di panggung ini tidak ada hook sama sekali. Jadi bukti
     bahwa balasan loket benar-benar sampai ke agen harus lewat jalur yang
     TIDAK ikut mati: kalimat agen (diterbitkan sebelum gerbang `rec.hidup`)
     dan `total_cost_usd` yang berbeda per cabang. */
  if (d.behavior === 'allow') {
    await tulis({ type: 'assistant', session_id: SID, message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'toolu_paraf_1', name: 'Bash', input: d.updatedInput || masuk },
    ] } });
    await tidur(30);
    await tulis({ type: 'user', session_id: SID, message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'toolu_paraf_1', is_error: false, content: 'ok' },
    ] } });
    await tidur(30);
    await tulis({ type: 'assistant', session_id: SID, message: { role: 'assistant', content: [
      { type: 'text', text: 'PARAF DITERIMA, perintahnya sudah dijalankan.' },
    ] } });
    await tidur(30);
    await hasil(0.0075);
    return;
  }
  await tulis({ type: 'assistant', session_id: SID, message: { role: 'assistant', content: [
    { type: 'text', text: 'PARAF DITOLAK, tidak jadi: ' + (d.message || 'ditolak dari ruangan') },
  ] } });
  await tidur(30);
  await hasil(0.0011);
}

async function naskahGagal() {
  await init();
  await tidur(30);
  log('naskah gagal: berhenti dengan kode 3');
  process.exit(3);
}

/* Dua naskah yang kerjanya justru TIDAK berbuat apa-apa, dan bedanya penting.
   `BISU_MS` di server memisahkan "tidak ada hook" dari "tidak ada apa-apa":
   yang pertama wajar (mode --bare, hook tidak terpasang), yang kedua berarti
   sesinya memang tidak pernah mulai — biasanya kredensial headless. Dulu
   keduanya dilaporkan sama, dan sesi sehat ikut kena tuduhan yang salah.

   naskah:bisu  tidak menulis SATU BYTE pun -> tugas-bisu harus terbit
   naskah:tahan menulis init lalu diam      -> tugas-bisu TIDAK boleh terbit,
                                               dan slotnya tetap terpakai */
function tetapHidup(alasan) {
  log(alasan + ' — menunggu dibunuh');
  // pegangan supaya event loop tidak habis dan prosesnya benar-benar bertahan
  setInterval(() => {}, 1 << 30);
}
async function naskahBisu() { tetapHidup('naskah bisu: tidak menulis apa pun'); }
async function naskahTahan() {
  await init();
  tetapHidup('naskah tahan: sudah bicara stream-json, slotnya dipegang');
}

const NASKAH = {
  'stream': naskahStream,
  'paraf-allow': naskahParaf,
  'paraf-deny': naskahParaf,
  'gagal': naskahGagal,
  'bisu': naskahBisu,
  'tahan': naskahTahan,
};
// Naskah yang memang tidak pernah selesai sendiri: dibunuh harness/tugas,
// bukan keluar dengan kode 0 begitu fungsinya balik.
const MENETAP = new Set(['bisu', 'tahan']);

const main = NASKAH[naskah];
if (!main) { log('naskah tidak dikenal: ' + naskah); process.exit(64); }
main().then(() => { if (!MENETAP.has(naskah)) process.exit(0); }).catch((err) => {
  log('meledak: ' + (err && err.stack || err));
  process.exit(70);
});
