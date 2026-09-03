#!/usr/bin/env node
// agent-room :: hook forwarder
// Claude Code pipes the hook payload on stdin. We relay it to the local room
// server and get out of the way fast. This runs on EVERY tool call, so it must
// never block, never print, and never exit non-zero.

import http from 'node:http';
import os from 'node:os';

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
process.stdin.on('end', () => {
  const body = Buffer.from(input || '{}', 'utf8');
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
        ...(process.env.AGENT_ROOM_KUNCI ? { 'x-agent-room-kunci': process.env.AGENT_ROOM_KUNCI.trim() } : {}),
      },
    },
    (res) => { res.resume(); res.on('end', bail); }
  );
  req.setTimeout(BUDGET_MS, bail);
  req.on('error', bail); // room server offline -> silently no-op
  req.end(body);
});
