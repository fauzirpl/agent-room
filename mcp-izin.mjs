#!/usr/bin/env node
// mcp-izin.mjs :: loket paraf untuk sesi yang dilahirkan halaman
//
// Server MCP stdio paling minim — tanpa dependency, JSON-RPC 2.0 satu baris
// per pesan di stdin/stdout — yang cuma punya SATU tool: `izin`. Claude Code
// memanggilnya lewat `--permission-prompt-tool mcp__agent-room-izin__izin`
// tiap kali sebuah tool butuh izin di mode non-interaktif. Yang dilakukan:
//
//   1. POST  AGENT_ROOM_URL/izin/tanya   -> server mencatat permintaan, publish
//                                          `izin-minta` bertanda `paraf` supaya
//                                          pegawainya berdiri mengangkat map
//   2. GET   AGENT_ROOM_URL/izin/tunggu  -> long-poll sampai kamu menekan Paraf
//                                          atau Tolak di kartu pegawai
//   3. balas tools/call dengan teks JSON {"behavior":"allow","updatedInput":…}
//      atau {"behavior":"deny","message":"…"} — bentuk yang dimengerti CLI.
//
// Kunci per-tugas (AGENT_ROOM_KUNCI_IZIN) cuma ada di env proses ini, dititip
// server saat spawn; tanpa kunci itu /izin/tanya menolak 403. Isi input tool
// TIDAK pernah dikirim utuh — cuma ringkasan ≤300 karakter — karena isi
// perintah shell atau berkas bukan urusan halaman.
//
// stdout milik JSON-RPC. Apa pun selain itu (log, galat) ke stderr — satu
// baris nyasar di stdout sudah cukup membuat CLI menganggap servernya rusak.

import readline from 'node:readline';

const URL_SERVER = (process.env.AGENT_ROOM_URL || 'http://127.0.0.1:4517').replace(/\/+$/, '');
const TUGAS = process.env.AGENT_ROOM_TUGAS || '';
const KUNCI = process.env.AGENT_ROOM_KUNCI_IZIN || '';
const TIMEOUT_MS = Math.max(1000, Number(process.env.AGENT_ROOM_IZIN_TIMEOUT_MS) || 15 * 60 * 1000);
const POLL_MS = 25 * 1000;                  // server menahan satu poll paling lama segini
const RINGKAS_MAX = 300;

const log = (...a) => { try { process.stderr.write('[mcp-izin] ' + a.join(' ') + '\n'); } catch { /* stderr tutup */ } };

const clip = (v, n) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

/* Ringkasan input yang layak dibaca orang di kartu: perintah shell, nama
   berkas, pola, URL — bukan seluruh objeknya. Yang tidak dikenal dipotong
   dari JSON-nya. Batasnya 300 karakter apa pun bentuknya. */
function ringkasInput(tool, input) {
  const i = input && typeof input === 'object' ? input : {};
  const kandidat = [i.command, i.file_path, i.notebook_path, i.pattern, i.url,
                    i.query, i.prompt, i.description];
  const dapat = kandidat.find((v) => typeof v === 'string' && v.trim());
  if (dapat) return clip(dapat, RINGKAS_MAX);
  try { return clip(JSON.stringify(i), RINGKAS_MAX); } catch { return ''; }
}

async function tanya(tool, input, toolUseId) {
  const r = await fetch(URL_SERVER + '/izin/tanya', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tugas: TUGAS, kunci: KUNCI, tool_name: tool,
      ringkasan: ringkasInput(tool, input),
      tool_use_id: typeof toolUseId === 'string' ? toolUseId.slice(0, 64) : '',
    }),
    signal: AbortSignal.timeout(10 * 1000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error('izin/tanya ' + r.status + (d.pesan ? ' — ' + d.pesan : ''));
  return d.id;
}

/* Long-poll sampai dijawab. Tiap poll ditahan server ≤25 detik lalu menjawab
   {tunggu:true}; diulang sampai batas TIMEOUT_MS, lalu dianggap tidak ada
   paraf. Gangguan jaringan sesaat tidak langsung jadi penolakan — dicoba
   lagi setelah jeda pendek selama batasnya belum lewat. */
async function tunggu(id) {
  const batas = Date.now() + TIMEOUT_MS;
  while (Date.now() < batas) {
    const sisa = batas - Date.now();
    const q = new URLSearchParams({ tugas: TUGAS, kunci: KUNCI, id });
    let d;
    try {
      const r = await fetch(URL_SERVER + '/izin/tunggu?' + q, {
        signal: AbortSignal.timeout(Math.min(POLL_MS + 5000, sisa + 1000)),
      });
      if (r.status === 404) return { keputusan: 'tolak', pesan: 'permintaan izin sudah tidak ada (tugasnya berakhir?)' };
      if (!r.ok) throw new Error('HTTP ' + r.status);
      d = await r.json();
    } catch (err) {
      log('poll gagal: ' + err.message);
      await new Promise((res) => setTimeout(res, Math.min(2000, Math.max(0, batas - Date.now()))));
      continue;
    }
    if (d && d.keputusan) return d;
  }
  return { keputusan: 'tolak', pesan: 'tidak ada paraf' };
}

const TOOL_IZIN = {
  name: 'izin',
  description: 'Minta paraf dari ruangan agent-room untuk satu panggilan tool. '
    + 'Dipanggil Claude Code sendiri lewat --permission-prompt-tool; menahan '
    + 'sampai Paraf/Tolak ditekan di kartu pegawai, atau 15 menit.',
  inputSchema: {
    type: 'object',
    properties: {
      tool_name: { type: 'string', description: 'nama tool yang minta izin' },
      input: { type: 'object', description: 'argumen tool apa adanya' },
      tool_use_id: { type: 'string', description: 'id panggilan tool (opsional)' },
    },
    required: ['tool_name', 'input'],
  },
};

async function panggil(args) {
  const tool = String(args.tool_name || '');
  const input = args.input && typeof args.input === 'object' ? args.input : {};
  if (!TUGAS || !KUNCI) {
    return { behavior: 'deny', message: 'loket paraf tidak dikonfigurasi (AGENT_ROOM_TUGAS/KUNCI_IZIN kosong)' };
  }
  let id;
  try { id = await tanya(tool, input, args.tool_use_id); }
  catch (err) {
    log('gagal mengajukan izin: ' + err.message);
    return { behavior: 'deny', message: 'loket paraf tidak bisa dihubungi: ' + err.message };
  }
  log('izin ' + id + ' diajukan untuk ' + tool + ', menunggu paraf…');
  const j = await tunggu(id);
  if (j.keputusan === 'paraf') {
    log('izin ' + id + ' diparaf');
    return { behavior: 'allow', updatedInput: input };
  }
  log('izin ' + id + ' ditolak: ' + (j.pesan || ''));
  return { behavior: 'deny', message: j.pesan || 'ditolak dari ruangan' };
}

/* ------------------------------------------------------------ JSON-RPC --- */
const kirim = (obj) => { process.stdout.write(JSON.stringify(obj) + '\n'); };
const balas = (id, result) => kirim({ jsonrpc: '2.0', id, result });
const galat = (id, code, message) => kirim({ jsonrpc: '2.0', id, error: { code, message } });

async function tangani(m) {
  const id = m.id;
  const ada = id !== undefined && id !== null;
  switch (m.method) {
    case 'initialize':
      return balas(id, {
        protocolVersion: (m.params && m.params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'agent-room-izin', version: '1.0.0' },
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;                                 // notifikasi: tidak dibalas
    case 'ping':
      return ada ? balas(id, {}) : undefined;
    case 'tools/list':
      return balas(id, { tools: [TOOL_IZIN] });
    case 'tools/call': {
      const p = m.params || {};
      if (p.name !== 'izin') return galat(id, -32602, 'tool tidak dikenal: ' + p.name);
      const hasil = await panggil(p.arguments || {});
      return balas(id, { content: [{ type: 'text', text: JSON.stringify(hasil) }] });
    }
    default:
      if (ada) galat(id, -32601, 'metode tidak dikenal: ' + m.method);
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (baris) => {
  const t = baris.trim();
  if (!t) return;
  let m;
  try { m = JSON.parse(t); } catch { return galat(null, -32700, 'JSON rusak'); }
  if (!m || typeof m !== 'object') return;
  tangani(m).catch((err) => {
    log('galat internal: ' + (err && err.stack || err));
    if (m.id !== undefined && m.id !== null) galat(m.id, -32603, String(err && err.message || err));
  });
});
rl.on('close', () => process.exit(0));
process.stdin.on('error', () => process.exit(0));
