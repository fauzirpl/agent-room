#!/usr/bin/env node
// mcp-room.mjs :: Agent Room sebagai MCP server (stdio)
//
// Arah BALIK dari semua yang lain di repo ini. Biasanya Claude Code yang
// bicara ke kantor (hook -> /event). Di sini kantornya yang bisa DITANYA oleh
// sesi Claude mana pun — "siapa yang lagi tertahan?", "sesi mana yang hidup?",
// "token hari ini berapa?" — tanpa membuka halaman. Server ini tidak menyimpan
// apa pun: tiap tool cuma satu GET ke server ruangan yang sudah jalan, lalu
// hasilnya diringkas satu kalimat Indonesia di atas JSON-nya.
//
// Yang SENGAJA tidak diekspos: pikir, ucap, prompt, isi halaman, token per-
// jalan kendali web, dan route apa pun yang bisa melahirkan/menghentikan sesi.
// Yang ada di sini murni baca metadata — sama kelasnya dengan /health.
//
// Protokol: JSON-RPC 2.0, satu pesan per baris di stdin/stdout. Log HANYA ke
// stderr — stdout adalah kanal protokol, satu baris nyasar merusak sesi.
//
// Pasang:  dinas --mcp   (mencetak perintah `claude mcp add` + JSON mcpServers)
// Alamat:  env AGENT_ROOM_URL, bawaan http://127.0.0.1:4517

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ALAMAT = (process.env.AGENT_ROOM_URL || 'http://127.0.0.1:4517').trim().replace(/\/+$/, '');
const TIMEOUT_MS = 5000;

function versiPaket() {
  try { return String(JSON.parse(fs.readFileSync(path.join(DIR, 'package.json'), 'utf8')).version || '0.0.0'); }
  catch { return '0.0.0'; }
}
const VERSI = versiPaket();
const log = (...a) => console.error('[mcp-room]', ...a);

/* ————— jembatan ke kantor ————— */
async function ambil(jalur) {
  const r = await fetch(ALAMAT + jalur, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) {
    let ket = '';
    try { ket = (await r.json()).galat || ''; } catch { /* bukan JSON */ }
    const e = new Error('HTTP ' + r.status + (ket ? ' — ' + ket : ''));
    e.http = r.status;
    throw e;
  }
  return r.json();
}

const tanggalLokal = (ts = Date.now()) => {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
};
const lama = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1 ? 'baru saja' : m < 60 ? m + ' mnt' : Math.floor(m / 60) + ' jam ' + (m % 60) + ' mnt';
};
const rb = (n) => (Number(n) || 0).toLocaleString('id-ID');

/* ————— tools ————— */
const TOOLS = [
  {
    name: 'ruangan_siapa_tertahan',
    description: 'Sesi Claude Code yang butuh manusia (minta izin/tanya), macet karena galat, atau tugas '
      + 'yang masih antre di loket. / Sessions waiting on a human, stopped on error, or queued.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async jalankan() {
      const r = await ambil('/ruangan');
      const kini = r.ts || Date.now();
      const tertahan = (r.sesi || []).filter((s) => s.butuh || s.macet).map((s) => ({
        sesi: s.sesi, nama: s.nama, proyek: s.proyek, cabang: s.cabang, mesin: s.mesin,
        keadaan: s.butuh ? 'butuh-manusia' : 'macet',
        sebab: s.butuh ? s.butuh.sebab : s.macet.jenis,
        tool: s.tool, sejakTerakhir: lama(kini - s.terakhir),
      }));
      const antre = r.antrean || { jumlah: 0, nama: [] };
      const ringkas = tertahan.length === 0 && antre.jumlah === 0
        ? 'Tidak ada yang tertahan: semua sesi jalan sendiri, loket disposisi kosong.'
        : `${tertahan.length} sesi tertahan (${tertahan.filter((t) => t.keadaan === 'butuh-manusia').length} butuh jawabanmu, `
          + `${tertahan.filter((t) => t.keadaan === 'macet').length} macet), ${antre.jumlah} tugas antre.`;
      return { ringkas, data: { tertahan, antrean: antre, mesin: r.mesin } };
    },
  },
  {
    name: 'ruangan_sesi_aktif',
    description: 'Daftar sesi Claude Code yang hidup di kantor: id, proyek, cabang git, mesin, tool terakhir, '
      + 'sejak kapan. / Live sessions with project, branch, machine, last tool, and uptime.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async jalankan() {
      const r = await ambil('/ruangan');
      const kini = r.ts || Date.now();
      const sesi = (r.sesi || []).map((s) => ({
        sesi: s.sesi, nama: s.nama, peran: s.peran, model: s.model,
        proyek: s.proyek, cabang: s.cabang, mesin: s.mesin,
        toolTerakhir: s.tool, kind: s.kind,
        sejak: new Date(s.sejak).toISOString(), lamaHidup: lama(kini - s.sejak),
        terakhir: lama(kini - s.terakhir) + ' lalu',
        keadaan: s.butuh ? 'butuh-manusia' : s.macet ? 'macet' : (s.kind === 'stop' ? 'menganggur' : 'bekerja'),
      }));
      const proyek = [...new Set(sesi.map((s) => s.proyek).filter(Boolean))];
      const ringkas = sesi.length === 0 ? 'Kantor sepi: tidak ada sesi yang hidup.'
        : `${sesi.length} sesi hidup di ${proyek.length} proyek (${proyek.slice(0, 5).join(', ')}${proyek.length > 5 ? ', …' : ''}); `
          + `${r.viewers || 0} halaman menonton.`;
      return { ringkas, data: { sesi, jalan: r.jalan, viewers: r.viewers, mesin: r.mesin } };
    },
  },
  {
    name: 'ruangan_token_hari_ini',
    description: 'Pemakaian token hari ini: total dan rincian per proyek, plus total sepanjang masa. '
      + '/ Today\'s token usage, total and per project, plus all-time total.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async jalankan() {
      const r = await ambil('/token-riwayat');
      const hariIni = tanggalLokal();
      const h = (r.harian || []).find((x) => x.tanggal === hariIni)
        || { tanggal: hariIni, input: 0, output: 0, cacheTulis: 0, cacheBaca: 0, proyek: {} };
      const perProyek = Object.entries(h.proyek || {})
        .map(([nama, v]) => ({ nama, input: v.input || 0, output: v.output || 0 }))
        .sort((a, b) => (b.input + b.output) - (a.input + a.output));
      const ringkas = `Hari ini ${rb(h.input)} token masuk + ${rb(h.output)} keluar`
        + (perProyek.length ? ` di ${perProyek.length} proyek (terbesar: ${perProyek[0].nama})` : ', belum ada yang tercatat')
        + `; sepanjang masa ${rb((r.total || {}).input)} masuk + ${rb((r.total || {}).output)} keluar.`;
      return {
        ringkas,
        data: {
          tanggal: hariIni,
          hariIni: { input: h.input, output: h.output, cacheTulis: h.cacheTulis, cacheBaca: h.cacheBaca },
          perProyek, total: r.total, tercatatSejak: r.sejak ? new Date(r.sejak).toISOString() : null,
        },
      };
    },
  },
  {
    name: 'ruangan_agenda_cari',
    description: 'Cari buku agenda (log event metadata, simpan 30 hari): kata kunci, proyek, sesi, rentang '
      + 'tanggal YYYY-MM-DD. Terbaru dulu. / Search the daily activity log by keyword, project, session, date range.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'kata kunci: dicocokkan ke label, tool, kind, proyek' },
        proyek: { type: 'string', description: 'nama folder proyek (basename cwd)' },
        sesi: { type: 'string', description: 'id sesi 12 karakter' },
        kind: { type: 'string', description: 'jenis event: pre, post, prompt, stop, izin-minta, …' },
        dari: { type: 'string', description: 'YYYY-MM-DD, bawaan hari ini' },
        sampai: { type: 'string', description: 'YYYY-MM-DD, bawaan = dari' },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: 'bawaan 50' },
      },
      additionalProperties: false,
    },
    async jalankan(p = {}) {
      const q = new URLSearchParams();
      for (const k of ['q', 'proyek', 'sesi', 'kind', 'dari', 'sampai']) if (p[k]) q.set(k, String(p[k]));
      q.set('limit', String(Math.min(500, Math.max(1, Number(p.limit) || 50))));
      const r = await ambil('/agenda?' + q.toString());
      const baris = (r.baris || []).map((b) => ({
        waktu: new Date(b.ts).toISOString(), sesi: b.session, proyek: b.cwd, cabang: b.cabang,
        kind: b.kind, tool: b.tool, label: b.label, ok: b.ok, nama: b.nama,
      }));
      const ringkas = baris.length === 0
        ? `Tidak ada baris agenda yang cocok untuk ${r.dari}${r.sampai !== r.dari ? '–' + r.sampai : ''}.`
        : `${baris.length} baris agenda (${r.dari}${r.sampai !== r.dari ? '–' + r.sampai : ''}), terbaru ${baris[0].waktu}.`;
      return { ringkas, data: { dari: r.dari, sampai: r.sampai, jumlah: r.jumlah, baris } };
    },
  },
  {
    name: 'ruangan_kesehatan',
    description: 'Server ruangan hidup atau tidak: jumlah event, penonton, port. / Health of the room server.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async jalankan() {
      const r = await ambil('/health');
      const ringkas = r.ok
        ? `Kantor buka di ${ALAMAT}: ${rb(r.events)} event tercatat, ${r.viewers} penonton, port ${r.port}.`
        : `Kantor menjawab, tapi ok=false.`;
      return { ringkas, data: r };
    },
  },
];
const PETA_TOOL = new Map(TOOLS.map((t) => [t.name, t]));

/* ————— JSON-RPC ————— */
const kirim = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const jawab = (id, result) => kirim({ jsonrpc: '2.0', id, result });
const galat = (id, code, message) => kirim({ jsonrpc: '2.0', id, error: { code, message } });

async function panggilTool(nama, args) {
  const t = PETA_TOOL.get(nama);
  if (!t) return { content: [{ type: 'text', text: 'tool tidak dikenal: ' + nama }], isError: true };
  try {
    const { ringkas, data } = await t.jalankan(args || {});
    return { content: [{ type: 'text', text: ringkas + '\n' + JSON.stringify(data) }] };
  } catch (err) {
    if (err && err.http) {
      // kantornya hidup, permintaannya yang ditolak — jangan menuduh servernya mati
      return { content: [{ type: 'text', text: 'Kantor menolak permintaan: ' + err.message }], isError: true };
    }
    const sebab = err && (err.name === 'TimeoutError' ? 'lewat ' + TIMEOUT_MS / 1000 + ' dtk'
      : err.cause && err.cause.code ? err.cause.code : err.message);
    return {
      content: [{ type: 'text', text: `Kantor tidak bisa dihubungi di ${ALAMAT} (${sebab}). `
        + 'Pastikan `dinas` sedang jalan; alamat lain lewat env AGENT_ROOM_URL.' }],
      isError: true,
    };
  }
}

async function tangani(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
  const { id, method, params } = msg;
  const adaId = id !== undefined && id !== null;
  if (typeof method !== 'string') { if (adaId) galat(id, -32600, 'permintaan tidak sah'); return; }
  if (method.startsWith('notifications/')) return;         // termasuk notifications/initialized
  /* Tanpa `id` sebuah pesan adalah NOTIFIKASI menurut JSON-RPC 2.0, dan
     notifikasi tidak boleh dijawab. Dulu keempat cabang di bawah memanggil
     jawab(id, …) tanpa memeriksa ini, jadi `{"jsonrpc":"2.0","method":"ping"}`
     menghasilkan `{"jsonrpc":"2.0","result":{}}` — respons tanpa `id`, tidak
     sah, dan klien yang ketat berhak memutus sesi karenanya. Dijaga
     `uji-mcp.mjs`. */
  if (!adaId) return;
  switch (method) {
    case 'initialize':
      jawab(id, {
        protocolVersion: (params && params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'agent-room', version: VERSI },
        instructions: 'Tanya kantor dinas Agent Room: sesi Claude Code yang hidup, yang tertahan, token hari ini, '
          + 'dan buku agenda. Semua hanya-baca, metadata saja.',
      });
      return;
    case 'ping':
      jawab(id, {});
      return;
    case 'tools/list':
      jawab(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      return;
    case 'tools/call':
      jawab(id, await panggilTool(params && params.name, params && params.arguments));
      return;
    default:
      if (adaId) galat(id, -32601, 'method tidak dikenal: ' + method);
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let antre = Promise.resolve();
rl.on('line', (baris) => {
  const t = baris.trim();
  if (!t) return;
  let msg;
  try { msg = JSON.parse(t); }
  catch { galat(null, -32700, 'JSON tidak bisa diurai'); return; }
  // berurutan supaya jawaban tidak saling mendahului untuk klien yang mengharapkannya
  antre = antre.then(() => tangani(msg)).catch((e) => log('galat menangani pesan:', e && e.message));
});
rl.on('close', () => process.exit(0));
process.stdin.on('error', () => process.exit(0));
log('agent-room MCP siap, kantor di ' + ALAMAT);
