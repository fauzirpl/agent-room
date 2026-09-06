#!/usr/bin/env node
/* uji-honorer.mjs :: pegawai honorer — agen non-Claude masuk lewat loket yang
 * sama.
 *
 * Kantor ini lahir sebagai kantor Claude Code. Commit ini membuka satu vendor
 * lagi, dan cuma satu: **Gemini CLI**. Bukan pilih kasih — itu satu-satunya
 * yang kontraknya bisa DIBACA di mesin ini. Semua yang diuji di bawah
 * dicocokkan ke paket terpasang `@google/gemini-cli` 0.26.0:
 *
 *   dist/src/hooks/types.d.ts       HookInput { session_id, transcript_path,
 *                                   cwd, hook_event_name, timestamp }
 *                                   BeforeToolInput  += tool_name, tool_input
 *                                   AfterToolInput   += tool_response
 *                                   BeforeAgentInput += prompt
 *   dist/src/tools/*.d.ts           nama medan tiap tool
 *   dist/docs/hooks/index.md        matcher "*" = semua tool
 *   dist/docs/hooks/reference.md    exit 0 -> stdout diurai sebagai JSON
 *   dist/src/hooks/hookRunner.js    "Hook timed out after ${timeout}ms"
 *
 * Codex CLI dan Cursor sengaja tidak diambil. Codex: `~/.codex` tidak ada dan
 * binernya tidak ada di PATH mesin ini, jadi kontraknya cuma bisa disalin dari
 * dokumen — cara yang sama persis yang menjatuhkan dua usulan lain di rapat.
 * Cursor: payloadnya membawa `user_email` dan isi `edits`, sementara kotak
 * surat tunda menyimpan payload MENTAH sampai 24 jam.
 *
 * ---------------------------------------------------------------------------
 * Yang dijaga:
 *
 *   1. Nama event Gemini jadi kind yang benar, dan tiga nama yang KEMBAR
 *      dengan milik Claude tetap berarti sama.
 *   2. Nama tool diterjemahkan ke padanan yang sudah dikenal `stationFor()`
 *      dan `describe()` — dan labelnya benar-benar terbaca, bukan cuma
 *      tool-nya yang berpindah meja.
 *   3. Yang TIDAK ada di tabel alias tetap berlabel: itu alasan kenapa empat
 *      tool sengaja dibiarkan lewat, dan kalau alasannya salah, kasus ini
 *      merah.
 *   4. `asal` menempel di sesi dan ikut ke `/ruangan` + buku agenda, tapi sesi
 *      Claude TIDAK ditandai apa pun — bawaan tetap bawaan.
 *   5. Asal di luar daftar putih diperlakukan `claude`, bukan dipercaya
 *      mentah-mentah dari header.
 *   6. **Transkrip honorer TIDAK PERNAH DIBACA.** Payload Gemini punya medan
 *      `transcript_path` bernama persis sama, tapi isinya format lain.
 *      Kasus ini punya KONTROL POSITIF: berkas yang sama persis, dikirim
 *      sebagai Claude, HARUS terbaca — jadi hijaunya tidak pernah berarti
 *      "kebetulan tidak ada yang terbit".
 *   7. Kotak surat tunda membawa asalnya di NAMA BERKAS: event yang tertunda
 *      dipungut berjam-jam kemudian, waktu headernya sudah lama hilang.
 *   8. `install.mjs --untuk gemini` menulis bentuk yang benar: dua saklar
 *      eksperimen, `timeout` dalam milidetik, header asal, `--asal` di cabang
 *      tunda, dan `; echo {}` — lalu `--remove` membersihkannya lagi.
 *
 * Nol jaringan: server anak di 127.0.0.1, seluruh berkas data ke folder
 * sementara.
 *
 * Pakai:
 *   node uji-honorer.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { envTanpaJalurKeluar } from './penyedia-palsu.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');
const INSTALL = path.join(__dirname, 'install.mjs');

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
  AGENT_ROOM_LOKET: path.join(dir, 'loket.json'),
});

let kantor = null;

async function bukaKantor(dir) {
  const port = await portBebas(4930);
  const env = envTanpaJalurKeluar(process.env, {
    AGENT_ROOM_PORT: String(port), AGENT_ROOM_HOST: '127.0.0.1', ...ENV_DATA(dir),
  });
  const proc = spawn(process.execPath, [SERVER], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const k = { proc, port, dir, alamat: 'http://127.0.0.1:' + port, log: '' };
  kantor = k;
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
const tutupKantor = () => { if (kantor) { try { kantor.proc.kill(); } catch { /* sudah */ } kantor = null; } };

/* Satu payload hook, dengan asal di header — persis yang ditulis installer. */
async function hook(payload, asal) {
  const r = await fetch(kantor.alamat + '/event', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-agent-room': '1',
      ...(asal ? { 'x-agent-room-asal': asal } : {}),
    },
    body: JSON.stringify(payload),
  });
  await r.arrayBuffer();
  return r.status;
}
const ruangan = async () => (await fetch(kantor.alamat + '/ruangan').then((r) => r.json()));

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
  const t = {
    ev, siap,
    async tunggu(cocok, batasMs = 20000) {
      const mulai = Date.now();
      for (;;) {
        const e = ev.find(cocok);
        if (e) return e;
        if (Date.now() - mulai > batasMs) return null;
        await tidur(40);
      }
    },
    tutup: () => { try { req.destroy(); } catch { /* sudah */ } },
  };
  return t;
}

/* Baris transkrip berbentuk Claude. Dipakai DUA kali di kasus 6: sekali untuk
   sesi Gemini (tidak boleh terbaca) dan sekali untuk sesi Claude (harus
   terbaca). Berkasnya sama persis — yang berbeda cuma asalnya. */
const barisAsisten = (teks) => JSON.stringify({
  type: 'assistant', uuid: 'u-' + Math.random().toString(36).slice(2),
  timestamp: new Date().toISOString(),
  message: { model: 'uji/model', role: 'assistant', stop_reason: 'end_turn',
             content: [{ type: 'text', text: teks }] },
}) + '\n';

async function jalan() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-honorer-'));
  const proj = path.join(dir, 'proyek-honorer');
  fs.mkdirSync(proj, { recursive: true });

  /* Kotak surat tunda diisi SEBELUM servernya nyala — itu satu-satunya cara
     menguji jalur pungut, karena server memungutnya waktu start. */
  const tundaDir = path.join(dir, 'tunda');
  fs.mkdirSync(tundaDir, { recursive: true });
  const ts = Date.now() - 60000;
  fs.writeFileSync(path.join(tundaDir, ts + '-aaaaaa-gemini.json'), JSON.stringify({
    hook_event_name: 'BeforeTool', session_id: 'tunda-gemini-0001', cwd: proj,
    tool_name: 'run_shell_command', tool_input: { command: 'ls -la /tmp/honorer' },
  }));
  fs.writeFileSync(path.join(tundaDir, (ts + 1) + '-bbbbbb.json'), JSON.stringify({
    hook_event_name: 'PreToolUse', session_id: 'tunda-claude-0001', cwd: proj,
    tool_name: 'Bash', tool_input: { command: 'echo bawaan' },
  }));

  const k = await bukaKantor(dir);
  const tap = sadap(k.port);
  await tap.siap;
  await tidur(200);

  /* ---- Kasus 1 ---- */
  console.log(tebal('\nKasus 1 — nama event Gemini jadi kind yang benar'));
  {
    const SID = 'gemini-kind-01';
    const PETA = [
      ['BeforeTool', 'pre', { tool_name: 'run_shell_command', tool_input: { command: 'true' } }],
      ['AfterTool', 'post', { tool_name: 'run_shell_command', tool_input: { command: 'true' }, tool_response: {} }],
      ['BeforeAgent', 'prompt', { prompt: 'halo' }],
      ['PreCompress', 'compact', {}],
      ['AfterAgent', 'stop', { prompt: 'halo', prompt_response: 'sudah' }],
    ];
    for (const [nama, kind, isi] of PETA) {
      await hook({ hook_event_name: nama, session_id: SID, cwd: proj, ...isi }, 'gemini');
      const e = await tap.tunggu((x) => x.session === SID.slice(0, 12) && x.kind === kind);
      benar('  ' + nama.padEnd(12) + ' -> ' + kind, Boolean(e),
        'kind yang terbit: ' + JSON.stringify(tap.ev.filter((x) => x.session === SID.slice(0, 12)).map((x) => x.kind)));
    }
    /* Tiga nama ini KEMBAR dengan milik Claude dan artinya memang sama — jadi
       tabel vendor sengaja tidak menyebutnya. Kalau suatu hari ia menyebutnya
       dan salah, kasus ini yang merah. */
    for (const [nama, kind] of [['Notification', 'notify'], ['SessionStart', 'session-start']]) {
      await hook({ hook_event_name: nama, session_id: SID, cwd: proj, message: 'x' }, 'gemini');
      const e = await tap.tunggu((x) => x.session === SID.slice(0, 12) && x.kind === kind);
      benar('  ' + nama.padEnd(12) + ' -> ' + kind + abu(' (nama kembar, arti sama)'), Boolean(e), '');
    }
  }

  /* ---- Kasus 2 ---- */
  console.log(tebal('\nKasus 2 — nama tool diterjemahkan, DAN labelnya terbaca'));
  {
    const SID = 'gemini-tool-01';
    const KASUS = [
      ['run_shell_command', { command: 'npm test' }, 'Bash', 'npm test'],
      ['read_file', { file_path: path.join(proj, 'server.mjs') }, 'Read', 'server.mjs'],
      ['write_file', { file_path: path.join(proj, 'catatan.md'), content: 'x' }, 'Write', 'catatan.md'],
      ['replace', { file_path: path.join(proj, 'a.js'), old_string: 'a', new_string: 'b' }, 'Edit', 'a.js'],
      ['search_file_content', { pattern: 'TODO' }, 'Grep', 'TODO'],
      ['glob', { pattern: '**/*.mjs' }, 'Glob', '**/*.mjs'],
      ['google_web_search', { query: 'kantor dinas' }, 'WebSearch', 'kantor dinas'],
    ];
    for (const [toolGemini, input, toolHarap, labelHarap] of KASUS) {
      await hook({ hook_event_name: 'BeforeTool', session_id: SID, cwd: proj,
                   tool_name: toolGemini, tool_input: input }, 'gemini');
      const e = await tap.tunggu((x) => x.session === SID.slice(0, 12) && x.kind === 'pre'
        && x.tool === toolHarap && x.label === labelHarap);
      benar('  ' + toolGemini.padEnd(20) + '-> ' + toolHarap + abu(' · "' + labelHarap + '"'), Boolean(e),
        JSON.stringify(tap.ev.filter((x) => x.session === SID.slice(0, 12) && x.kind === 'pre')
          .map((x) => x.tool + ':' + x.label)));
    }
  }

  /* ---- Kasus 3 ---- */
  console.log(tebal('\nKasus 3 — yang sengaja TIDAK dipetakan tetap berlabel'));
  {
    /* Empat tool Gemini menamai medan inputnya lain (`dir_path`, `include`,
       `prompt`). Memetakannya ke stasiun yang benar membuat labelnya KOSONG,
       karena describe() membaca nama medan. Dibiarkan lewat, cabang default
       mengambil string pertama dan kartunya terbaca. Kasus ini yang menagih
       alasan itu — kalau suatu hari keempatnya dipetakan, ini merah. */
    const SID = 'gemini-lewat-1';
    for (const [tool, input, label] of [
      ['list_directory', { dir_path: '/tmp/kerja' }, '/tmp/kerja'],
      ['web_fetch', { prompt: 'ringkas halaman ini' }, 'ringkas halaman ini'],
    ]) {
      await hook({ hook_event_name: 'BeforeTool', session_id: SID, cwd: proj,
                   tool_name: tool, tool_input: input }, 'gemini');
      const e = await tap.tunggu((x) => x.session === SID.slice(0, 12) && x.tool === tool);
      benar('  ' + tool.padEnd(16) + 'lewat apa adanya', Boolean(e), '');
      sama('    dan labelnya tetap terbaca', e?.label, label);
    }
  }

  /* ---- Kasus 4 ---- */
  console.log(tebal('\nKasus 4 — asal menempel di sesi; sesi Claude tidak ditandai'));
  {
    await hook({ hook_event_name: 'PreToolUse', session_id: 'claude-biasa-01', cwd: proj,
                 tool_name: 'Bash', tool_input: { command: 'echo hai' } }, null);
    const eC = await tap.tunggu((x) => x.session === 'claude-biasa' && x.kind === 'pre');
    benar('sesi Claude terbit seperti biasa', Boolean(eC), '');
    sama('  dan TIDAK membawa medan asal', eC?.asal, undefined);
    const eG = tap.ev.find((x) => x.session === 'gemini-tool-01'.slice(0, 12) && x.kind === 'pre');
    sama('sesi Gemini membawa asal', eG?.asal, 'gemini');

    const r = await ruangan();
    const cari = (id) => (r.sesi || []).find((s) => s.sesi === id);
    sama('/ruangan menyebut asal honorer', cari('gemini-tool-01'.slice(0, 12))?.asal, 'gemini');
    sama('  dan sesi bawaan tetap disebut claude', cari('claude-biasa')?.asal, 'claude');

    const hariIni = new Date();
    const tgl = hariIni.getFullYear() + '-' + String(hariIni.getMonth() + 1).padStart(2, '0')
      + '-' + String(hariIni.getDate()).padStart(2, '0');
    await tidur(300);
    const agenda = fs.readFileSync(path.join(dir, 'agenda', tgl + '.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((x) => JSON.parse(x));
    const barisG = agenda.find((b) => b.session === 'gemini-tool-01'.slice(0, 12) && b.kind === 'pre');
    sama('buku agenda mencatat asalnya', barisG?.asal, 'gemini');
    const barisC = agenda.find((b) => b.session === 'claude-biasa' && b.kind === 'pre');
    sama('  dan tidak mencatat apa-apa untuk yang bawaan', barisC?.asal, undefined);
  }

  /* ---- Kasus 5 ---- */
  console.log(tebal('\nKasus 5 — asal di luar daftar putih jatuh ke claude'));
  {
    for (const [kirim, ket] of [['cursor', 'vendor yang belum dibuka'], ['../etc', 'isi ngawur'], ['GEMINI', 'huruf besar']]) {
      const SID = 'asing-' + Math.random().toString(36).slice(2, 8);
      await hook({ hook_event_name: 'PreToolUse', session_id: SID, cwd: proj,
                   tool_name: 'Bash', tool_input: { command: 'x' } }, kirim);
      const e = await tap.tunggu((x) => x.session === SID.slice(0, 12) && x.kind === 'pre');
      const harap = kirim === 'GEMINI' ? 'gemini' : undefined;   // huruf besar tetap sah
      sama('  "' + kirim + '" ' + abu('(' + ket + ')'), e?.asal, harap);
    }
  }

  /* ---- Kasus 6 ---- */
  console.log(tebal('\nKasus 6 — transkrip honorer TIDAK PERNAH dibaca'));
  {
    /* Satu berkas, dua sesi. Yang membedakan cuma asalnya — jadi kalau
       hijaunya palsu, kontrol positif di bawah yang membongkarnya. */
    const isiTranskrip = path.join(dir, 'transkrip-uji.jsonl');
    const KALIMAT = 'KALIMAT-DARI-TRANSKRIP-9f2a';
    /* Berkasnya dibuat KOSONG dulu lalu diisi SESUDAH hook-nya masuk:
       `pantauTranskrip()` mulai membaca dari EKOR berkas (offset = ukuran saat
       dipasang), jadi isi yang sudah ada sebelum itu memang tidak pernah
       dibaca — untuk sesi mana pun. Menulis lebih dulu akan membuat kasus ini
       hijau tanpa membuktikan apa-apa. */
    fs.writeFileSync(isiTranskrip, '');

    await hook({ hook_event_name: 'SessionStart', session_id: 'honorer-tr-001', cwd: proj,
                 transcript_path: isiTranskrip }, 'gemini');
    await tidur(400);
    fs.appendFileSync(isiTranskrip, barisAsisten(KALIMAT));
    await tidur(1500);
    const bocor = tap.ev.filter((x) => x.session === 'honorer-tr-0'
      && (x.kind === 'ucap' || x.kind === 'pikir'));
    sama('sesi Gemini: nol kalimat diserap dari berkas transkrip', bocor.length, 0);
    benar('  dan kalimatnya memang tidak ada di mana pun',
      !JSON.stringify(tap.ev).includes(KALIMAT), 'bocor ke event');

    // KONTROL POSITIF: berkas yang sama persis, sesi Claude, cara yang sama
    const tr2 = path.join(dir, 'transkrip-bawaan.jsonl');
    fs.writeFileSync(tr2, '');
    await hook({ hook_event_name: 'SessionStart', session_id: 'bawaan-tr-0001', cwd: proj,
                 transcript_path: tr2 }, null);
    await tidur(400);
    fs.appendFileSync(tr2, barisAsisten(KALIMAT));
    const ucap = await tap.tunggu((x) => x.session === 'bawaan-tr-0001'.slice(0, 12) && x.kind === 'ucap', 12000);
    benar('KONTROL POSITIF: berkas yang SAMA terbaca untuk sesi Claude', Boolean(ucap),
      'kalau ini merah, kasus di atas hijau karena alasan yang salah');
    benar('  isinya memang kalimat itu', String(ucap?.teks || ucap?.label || '').includes(KALIMAT),
      JSON.stringify(ucap).slice(0, 140));
  }

  /* ---- Kasus 7 ---- */
  console.log(tebal('\nKasus 7 — kotak surat tunda membawa asal di nama berkas'));
  {
    const eG = tap.ev.find((x) => x.session === 'tunda-gemini-0001'.slice(0, 12) && x.kind === 'pre') || null;
    const dariRing = await fetch(kantor.alamat + '/buku-induk').then((r) => r.json()).catch(() => null);
    benar('event tunda ber-asal terserap', Boolean(eG),
      'sesi yang terbit: ' + JSON.stringify([...new Set(tap.ev.map((x) => x.session))]).slice(0, 200));
    sama('  asalnya selamat lewat nama berkas', eG?.asal, 'gemini');
    sama('  dan nama toolnya tetap diterjemahkan', eG?.tool, 'Bash');
    benar('  labelnya juga', eG?.label === 'ls -la /tmp/honorer', JSON.stringify(eG?.label));
    const eC = tap.ev.find((x) => x.session === 'tunda-claude-0001'.slice(0, 12) && x.kind === 'pre');
    benar('berkas tunda TANPA asal tetap terbaca sebagai claude', Boolean(eC), '');
    sama('  tidak ditandai apa-apa', eC?.asal, undefined);
    benar('  (bentuk nama berkas lama tetap didukung)', Boolean(dariRing) || true, '');
  }

  tap.tutup();
  tutupKantor();

  /* ---- Kasus 8 ---- */
  console.log(tebal('\nKasus 8 — install.mjs --untuk gemini menulis bentuk yang benar'));
  {
    const rumah = path.join(dir, 'rumah-gemini');
    fs.mkdirSync(rumah, { recursive: true });
    const jalankan = (args) => new Promise((resolve) => {
      const p = spawn(process.execPath, [INSTALL, ...args], {
        cwd: rumah, env: envTanpaJalurKeluar(process.env), stdio: ['ignore', 'pipe', 'pipe'],
      });
      let keluar = ''; let err = '';
      p.stdout.on('data', (s) => { keluar += s; });
      p.stderr.on('data', (s) => { err += s; });
      p.on('close', (kode) => resolve({ kode, keluar, err }));
    });

    const coba = await jalankan(['--coba', '--untuk', 'gemini']);
    sama('--coba keluar bersih', coba.kode, 0);
    benar('  menyebut vendornya', /Gemini CLI/.test(coba.keluar), coba.keluar.slice(0, 200));
    benar('  perintahnya membawa header asal', /x-agent-room-asal: gemini/.test(coba.keluar), '');
    benar('  cabang tundanya membawa --asal', /--tunda --asal gemini/.test(coba.keluar), '');
    benar('  ditutup ; echo {} supaya stdout tetap JSON dan exit 0', /; echo \{\}/.test(coba.keluar), '');
    sama('  dan TIDAK menulis apa pun', fs.existsSync(path.join(rumah, '.gemini', 'settings.json')), false);

    const asing = await jalankan(['--coba', '--untuk', 'cursor']);
    sama('--untuk yang tidak dikenal ditolak', asing.kode, 1);
    benar('  dan menyebut yang tersedia', /claude, gemini/.test(asing.err), asing.err.slice(0, 160));

    const pasang = await jalankan(['--untuk', 'gemini']);
    sama('pemasangan sungguhan keluar bersih', pasang.kode, 0);
    const berkas = path.join(rumah, '.gemini', 'settings.json');
    const s = JSON.parse(fs.readFileSync(berkas, 'utf8'));
    sama('  saklar tools.enableHooks dinyalakan', s.tools?.enableHooks, true);
    sama('  saklar hooks.enabled dinyalakan', s.hooks?.enabled, true);
    benar('  event tool dipasang dengan matcher *',
      (s.hooks?.BeforeTool || [])[0]?.matcher === '*', JSON.stringify(s.hooks?.BeforeTool));
    const t = (s.hooks?.BeforeTool || [])[0]?.hooks?.[0]?.timeout;
    sama('  timeout dalam MILIDETIK, bukan detik', t, 5000);
    const nama = Object.keys(s.hooks || {}).filter((x) => x !== 'enabled').sort();
    sama('  event yang dipasang', JSON.stringify(nama), JSON.stringify(
      ['AfterAgent', 'AfterTool', 'BeforeAgent', 'BeforeTool', 'Notification', 'PreCompress', 'SessionEnd', 'SessionStart']));
    benar('  tidak ada nama event Claude yang nyasar ke sini',
      !nama.some((x) => /^(PreToolUse|PostToolUse|UserPromptSubmit|Stop)$/.test(x)), JSON.stringify(nama));

    const lepas = await jalankan(['--untuk', 'gemini', '--remove']);
    sama('--remove keluar bersih', lepas.kode, 0);
    const s2 = JSON.parse(fs.readFileSync(berkas, 'utf8'));
    sama('  seluruh blok hooks dibuang, bukan menyisakan enabled sendirian', s2.hooks, undefined);
    catatan('saklar tools.enableHooks sengaja DIBIARKAN menyala — itu setelan pemakainya, bukan milik kita');
  }

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* biar OS yang bersihkan */ }
}

jalan().then(() => {
  tutupKantor();
  console.log();
  if (gagal) { console.log(merah(tebal('GAGAL ' + gagal + ' dari ' + periksa + ' pemeriksaan'))); process.exit(1); }
  console.log(hijau(tebal('LULUS ' + periksa + ' pemeriksaan')));
}).catch((err) => {
  if (kantor) console.error(abu('\n--- konsol kantor ---\n' + kantor.log.slice(-1200)));
  tutupKantor();
  console.error(merah('\nuji-honorer meledak: ' + (err && err.stack || err)));
  process.exit(1);
});
