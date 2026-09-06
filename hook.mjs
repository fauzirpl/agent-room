#!/usr/bin/env node
// agent-room :: hook forwarder
// Claude Code pipes the hook payload on stdin. We relay it to the local room
// server and get out of the way fast. This runs on EVERY tool call, so it must
// never block, never print, and never exit non-zero.

import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

/* ————— kotak surat hook offline (spool) —————
   Server ruangan mati bukan alasan kehilangan event: payload mentah ditulis
   ke ~/.agent-room/tunda/<ts>-<acak>.json (AGENT_ROOM_TUNDA_DIR mengubah
   foldernya), dan server memungutnya saat start / tiap menit. Dua jalur
   sampai ke sini:
   - `node hook.mjs --tunda`: dipanggil installer sebagai cabang `||` di
     belakang curl — curl memakai `-T -` yang baru membaca stdin SESUDAH
     tersambung, jadi saat koneksi ditolak payloadnya masih utuh untuk kita.
   - hook.mjs sebagai transport utama (install --node): gagal kirim -> tulis.
   Batasnya dijaga di sisi penulis: berkas > 24 jam dibuang, dan kalau sudah
   500 berkas / 20 MB yang paling tua disingkirkan dulu. Isinya payload
   MENTAH (termasuk tool_response), jadi folder & berkasnya 0700/0600.      */
const TUNDA_DIR = process.env.AGENT_ROOM_TUNDA_DIR || path.join(os.homedir(), '.agent-room', 'tunda');
const TUNDA_MAKS_BERKAS = 500;
const TUNDA_MAKS_BYTE = 20 * 1024 * 1024;
const TUNDA_UMUR_MS = 24 * 3600 * 1000;
// Bagian asal opsional; lihat komentar kembarannya di server.mjs.
const TUNDA_RX = /^(\d{13})-[a-z0-9]{1,12}(?:-([a-z]{1,12}))?\.json$/;

function tulisTunda(body, dir = TUNDA_DIR, asal = '') {
  const kini = Date.now();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // yang ada dulu: buang yang kedaluwarsa, lalu sisakan tempat untuk yang baru
  const ada = [];
  for (const nama of fs.readdirSync(dir)) {
    const m = TUNDA_RX.exec(nama);
    if (!m) continue;
    const ts = Number(m[1]);
    const jalur = path.join(dir, nama);
    if (kini - ts > TUNDA_UMUR_MS) { try { fs.unlinkSync(jalur); } catch {} continue; }
    let ukuran = 0;
    try { ukuran = fs.statSync(jalur).size; } catch { continue; }
    ada.push({ ts, jalur, ukuran });
  }
  ada.sort((a, b) => a.ts - b.ts);
  let total = ada.reduce((s, b) => s + b.ukuran, 0);
  while (ada.length && (ada.length >= TUNDA_MAKS_BERKAS || total + body.length > TUNDA_MAKS_BYTE)) {
    const tua = ada.shift();
    try { fs.unlinkSync(tua.jalur); } catch {}
    total -= tua.ukuran;
  }
  if (body.length > TUNDA_MAKS_BYTE) return null;   // satu payload sebesar itu tidak layak ditunda
  /* Asal ikut ke NAMA berkas, bukan ke isinya: isinya payload MENTAH milik
     vendor dan tidak boleh disunting sedikit pun — server harus melihat
     persis apa yang dikirim. Nama berkas satu-satunya tempat yang kita
     miliki sendiri. */
  const nama = kini + '-' + Math.random().toString(36).slice(2, 8)
    + (asal && asal !== 'claude' ? '-' + asal : '') + '.json';
  const jalur = path.join(dir, nama);
  // .tmp lalu rename: server yang kebetulan memungut di tengah tulis tidak
  // pernah melihat berkas setengah jadi
  fs.writeFileSync(jalur + '.tmp', body, { mode: 0o600 });
  fs.renameSync(jalur + '.tmp', jalur);
  return jalur;
}

// AGENT_ROOM_URL (kantor pusat di mesin lain) menang atas HOST/PORT lokal
let ALAMAT = null;
try { if (process.env.AGENT_ROOM_URL) ALAMAT = new URL(process.env.AGENT_ROOM_URL); } catch { ALAMAT = null; }
const PORT = ALAMAT ? Number(ALAMAT.port || 80) : Number(process.env.AGENT_ROOM_PORT || 4517);
const HOST = ALAMAT ? ALAMAT.hostname : (process.env.AGENT_ROOM_HOST || '127.0.0.1');
const BUDGET_MS = 400;

const bail = () => process.exit(0);
const guard = setTimeout(bail, BUDGET_MS);
guard.unref?.();
process.on('uncaughtException', bail);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('error', bail);
const TUNDA_SAJA = process.argv.includes('--tunda');
/* `--asal <vendor>`: dipasang installer untuk hook non-Claude. Tanpa ini,
   event yang tertunda diserap sebagai event Claude berjam-jam kemudian. */
const iAsal = process.argv.indexOf('--asal');
const ASAL = iAsal >= 0 ? String(process.argv[iAsal + 1] || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) : '';
const tunda = (body) => { try { tulisTunda(body, TUNDA_DIR, ASAL); } catch { /* disk penuh / tanpa izin: diam */ } };

process.stdin.on('end', () => {
  const body = Buffer.from(input || '{}', 'utf8');
  if (TUNDA_SAJA) { tunda(body); bail(); return; }
  const req = http.request(
    {
      host: HOST,
      port: PORT,
      path: '/event',
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'content-length': body.length,
        // sama seperti jalur curl: nama mesin selalu, kunci hanya kalau env-nya ada
        'x-agent-room-mesin': os.hostname().replace(/[^\w.-]/g, '').slice(0, 32),
        ...(ASAL && ASAL !== 'claude' ? { 'x-agent-room-asal': ASAL } : {}),
        ...(process.env.AGENT_ROOM_KUNCI ? { 'x-agent-room-kunci': process.env.AGENT_ROOM_KUNCI.trim() } : {}),
      },
    },
    (res) => { res.resume(); res.on('end', bail); }
  );
  req.setTimeout(BUDGET_MS, bail);
  req.on('error', () => { tunda(body); bail(); }); // room server offline -> spool, tetap diam
  req.end(body);
});
