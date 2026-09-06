#!/usr/bin/env node
/* uji-peserta.mjs :: transkrip peserta rapat — isi subagent diserahkan ke
 * pemiliknya, bukan ke sesi induknya.
 *
 * Subagent menulis transkripnya sendiri di berkas terpisah, dan sampai
 * sekarang berkas itu tidak pernah dibaca. Akibatnya pikiran, kalimat, dan
 * token milik peserta rapat hilang seluruhnya — sementara barisnya di berkas
 * INDUK sengaja dilewati (`isSidechain`), karena di sana memang tidak ada
 * apa pun yang bisa dipakai memastikan dia peserta yang mana.
 *
 * Yang dijaga di sini:
 *
 *   1. Dua bentuk jalur berkas peserta, dua-duanya nyata di mesin ini:
 *      `<sesi>/subagents/agent-<id>.jsonl` dan
 *      `<sesi>/subagents/workflows/wf_<run>/agent-<id>.jsonl`.
 *   2. Pikiran, kalimat, dan token terbit membawa `agenId` — itu yang membuat
 *      halaman bisa menaruhnya di atas kepala orang yang benar.
 *   3. TIDAK DOBEL. Baris yang sama ditulis ke berkas peserta DAN berkas
 *      induk tetap dihitung sekali. Ini yang paling gampang rusak diam-diam
 *      dan paling mahal akibatnya: token dobel merusak pagu dan papan SKP.
 *   4. Riwayat token peserta memakai model dari BARIS ITU SENDIRI — subagent
 *      bisa jalan di model yang berbeda dari induknya — dan ditandai
 *      `peserta: true` sebagai field opsional.
 *   5. Token induk tidak tercemar token pesertanya.
 *
 * Nol jaringan: server anak di 127.0.0.1, seluruh berkas data ke folder
 * sementara, transkrip sintetis ditulis sendiri.
 *
 * Pakai:
 *   node uji-peserta.mjs            jalankan semua kasus
 *   node uji-peserta.mjs --tampil   cetak juga event yang tertangkap
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
const TAMPIL = process.argv.includes('--tampil');

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

async function bukaKantor(dir) {
  const port = await portBebas(4810);
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_ROOM_')) delete env[k];
  Object.assign(env, {
    AGENT_ROOM_PORT: String(port), AGENT_ROOM_HOST: '127.0.0.1',
    AGENT_ROOM_CUACA: 'off', AGENT_ROOM_LAPOR: '',
  }, ENV_DATA(dir));

  const proc = spawn(process.execPath, [SERVER], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const k = { proc, port, dir, alamat: 'http://127.0.0.1:' + port, log: '' };
  kantor = k;
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

function tutupKantor() {
  if (!kantor) return;
  try { kantor.proc.kill(); } catch { /* sudah mati */ }
  kantor = null;
}

/* Penadah /stream lewat http polos: `fetch` + ReadableStream menyisakan
   pembacaan yang meledak waktu servernya dimatikan, dan itu bukan kegagalan
   yang perlu dilaporkan harness ini. */
function sadap(port) {
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
          for (const b of blok.split('\n')) {
            if (!b.startsWith('data:')) continue;
            try { ev.push(JSON.parse(b.slice(5).trim())); } catch { /* bukan JSON */ }
          }
        }
      });
      res.on('error', () => { /* server dimatikan di akhir uji */ });
      resolve();
    });
  });
  req.on('error', () => { /* sama */ });
  req.end();
  return { ev, siap, tutup: () => { try { req.destroy(); } catch { /* sudah */ } } };
}

const barisAsisten = (agenId, uuid, model, teks, pikir, usage) => JSON.stringify({
  type: 'assistant', isSidechain: true, agentId: agenId, uuid,
  timestamp: new Date().toISOString(),
  message: {
    model, role: 'assistant', stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: pikir }, { type: 'text', text: teks }],
    usage,
  },
}) + '\n';

async function utama() {
  console.log(tebal('uji-peserta') + abu(' — isi subagent diserahkan ke pemiliknya'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-peserta-'));
  const SID = '11111111-2222-3333-4444-555555555555';
  const AG1 = 'a0langsung111111';        // berkas di subagents/
  const AG2 = 'a0workflow222222';        // berkas di subagents/workflows/wf_x/
  const proj = path.join(dir, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  const indukJ = path.join(proj, SID + '.jsonl');
  fs.writeFileSync(indukJ, '');
  const subDir = path.join(proj, SID, 'subagents');
  const wfDir = path.join(subDir, 'workflows', 'wf_uji123');
  fs.mkdirSync(wfDir, { recursive: true });

  const k = await bukaKantor(dir);
  const s = sadap(k.port);
  await s.siap;

  const hook = (p) => fetch(k.alamat + '/event', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: SID, cwd: proj, transcript_path: indukJ, ...p }),
  }).then((r) => r.arrayBuffer());

  try {
    await hook({ hook_event_name: 'SessionStart', source: 'startup' });

    /* ------------------------------------------------------------ kasus 1 */
    console.log(tebal('\nKasus 1 — berkas peserta di subagents/'));
    const p1 = path.join(subDir, 'agent-' + AG1 + '.jsonl');
    fs.writeFileSync(p1, '');
    await hook({ hook_event_name: 'SubagentStart', agent_id: AG1, agent_type: 'Explore' });
    await tidur(900);
    fs.appendFileSync(p1, barisAsisten(AG1, 'u-1', 'model-peserta-satu',
      'sudah saya telusuri, hasilnya tiga berkas', 'menelusuri berkasnya dulu',
      { input_tokens: 700, output_tokens: 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }));
    await tidur(2200);

    const pikir = s.ev.filter((e) => e.kind === 'pikir');
    const ucap = s.ev.filter((e) => e.kind === 'ucap');
    const tok = s.ev.filter((e) => e.kind === 'token');
    if (TAMPIL) console.log(abu('      ' + JSON.stringify({ pikir: pikir.length, ucap: ucap.length, tok: tok.length })));
    sama('pikiran peserta terbit', pikir.length, 1);
    sama('  membawa agenId pemiliknya', (pikir[0] || {}).agenId, AG1);
    sama('  membawa jenis agennya', (pikir[0] || {}).agen, 'Explore');
    sama('kalimat penutupnya terbit', ucap.length, 1);
    sama('  ditandai akhir giliran', (ucap[0] || {}).akhir, true);
    sama('  membawa agenId pemiliknya', (ucap[0] || {}).agenId, AG1);
    sama('token peserta terbit', tok.length, 1);
    sama('  membawa agenId pemiliknya', (tok[0] || {}).agenId, AG1);
    sama('  angkanya persis yang ditulis', ((tok[0] || {}).token || {}).input, 700);

    /* ------------------------------------------------------------ kasus 2 */
    console.log(tebal('\nKasus 2 — baris yang sama di dua berkas tidak dihitung dua kali'));
    const sebelum = s.ev.filter((e) => e.kind === 'token').length;
    fs.appendFileSync(indukJ, barisAsisten(AG1, 'u-1', 'model-peserta-satu',
      'sudah saya telusuri, hasilnya tiga berkas', 'menelusuri berkasnya dulu',
      { input_tokens: 700, output_tokens: 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }));
    await tidur(2200);
    sama('baris sidechain di berkas induk tetap dilewati',
      s.ev.filter((e) => e.kind === 'token').length, sebelum);

    /* ------------------------------------------------------------ kasus 3 */
    console.log(tebal('\nKasus 3 — berkas peserta di subagents/workflows/'));
    const p2 = path.join(wfDir, 'agent-' + AG2 + '.jsonl');
    fs.writeFileSync(p2, '');
    await hook({ hook_event_name: 'SubagentStart', agent_id: AG2, agent_type: 'Plan' });
    await tidur(900);
    fs.appendFileSync(p2, barisAsisten(AG2, 'u-2', 'model-peserta-dua',
      'rancangannya sudah saya susun', 'menimbang dua pendekatan',
      { input_tokens: 50, output_tokens: 9, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }));
    await tidur(2200);
    const tok2 = s.ev.filter((e) => e.kind === 'token' && e.agenId === AG2);
    sama('token peserta workflow terbit', tok2.length, 1);
    sama('  jalur wf_<run> ikut ditemukan', ((tok2[0] || {}).token || {}).input, 50);

    /* ------------------------------------------------------------ kasus 4 */
    console.log(tebal('\nKasus 4 — riwayat token: model dari barisnya, ditandai peserta'));
    const rw = fs.existsSync(path.join(dir, 'token-riwayat.jsonl'))
      ? fs.readFileSync(path.join(dir, 'token-riwayat.jsonl'), 'utf8').trim().split('\n').map((x) => JSON.parse(x))
      : [];
    sama('dua baris riwayat, bukan tiga', rw.length, 2);
    benar('  modelnya dari baris peserta, bukan dari sesi induk',
      rw.some((x) => x.model === 'model-peserta-satu') && rw.some((x) => x.model === 'model-peserta-dua'),
      JSON.stringify(rw.map((x) => x.model)));
    benar('  ditandai peserta:true', rw.every((x) => x.peserta === true), JSON.stringify(rw));
    benar('  tidak ada medan asing di baris riwayat',
      rw.every((x) => Object.keys(x).every((kk) => ['v', 'ts', 'proyek', 'model', 'peserta', 'input', 'output', 'cacheTulis', 'cacheBaca'].includes(kk))),
      JSON.stringify(Object.keys(rw[0] || {})));

    /* ------------------------------------------------------------ kasus 5 */
    console.log(tebal('\nKasus 5 — token induk tidak tercemar token pesertanya'));
    const indukTok = s.ev.filter((e) => e.kind === 'token' && !e.agenId);
    sama('induk belum punya token sendiri', indukTok.length, 0);
    benar('  server tidak mengeluh sepanjang uji',
      !/payload diabaikan|tidak bisa dipantau/.test(k.log), k.log.slice(0, 200));
  } finally {
    s.tutup();
    tutupKantor();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* biarkan OS */ }
  }

  console.log('\n' + (gagal
    ? merah(tebal('GAGAL')) + ' ' + gagal + ' dari ' + periksa + ' pemeriksaan'
    : hijau(tebal('LULUS')) + ' ' + periksa + ' pemeriksaan'));
  process.exit(gagal ? 1 : 0);
}

utama().catch((e) => {
  tutupKantor();
  console.error(merah('galat: ') + (e && e.stack ? e.stack : e));
  process.exit(1);
});
