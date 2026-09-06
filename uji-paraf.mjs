#!/usr/bin/env node
/* uji-paraf.mjs :: loket paraf — telaah risiko, jejak keputusan, buku register.
 *
 * `telaah.mjs` sudah diuji sebagai fungsi murni oleh `uji-telaah.mjs`. Yang
 * belum dijaga siapa pun adalah SAMBUNGANNYA: apakah telaah itu benar-benar
 * sampai ke kartu paraf, ikut ke buku agenda, dan bisa dibaca kembali sebagai
 * register — tanpa membawa isi perintah ke tempat yang tidak seharusnya.
 *
 * Empat hal yang dijaga di sini:
 *
 *   1. Permintaan izin dari HOOK (sesi terminal) ditelaah dari `tool_input`
 *      MENTAH, bukan dari label yang sudah dipotong.
 *   2. Yang ikut ke disk cuma TINGKAT dan NAMA POLA. Isi perintahnya boleh ada
 *      di `label` seperti dulu, tapi tidak boleh bocor lewat pintu baru.
 *   3. `GET /paraf` membaca ulang jejaknya dari buku agenda — bukan tabel baru
 *      yang harus dipelihara — dan menghitung tally-nya benar.
 *   4. Perintah jinak tidak menyalakan pita apa pun. Pita yang menyala terus
 *      sama tidak bergunanya dengan pita yang tidak pernah menyala.
 *
 * Nol jaringan: server anak di 127.0.0.1, seluruh berkas data ke folder
 * sementara. Pembantu sandbox disalin dengan sadar (lihat catatan yang sama di
 * uji-mcp.mjs) — tidak ada satu pun uji-*.mjs di repo ini yang mengekspornya.
 *
 * Pakai:
 *   node uji-paraf.mjs            jalankan semua kasus
 *   node uji-paraf.mjs --tampil   cetak juga baris agenda yang tertangkap
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { telaahRisiko } from './telaah.mjs';

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

/* ---------------------------------------------------------------- kantor --- */

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
});

let kantor = null;

async function bukaKantor(dir) {
  const port = await portBebas(4760);
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_ROOM_')) delete env[k];
  Object.assign(env, {
    AGENT_ROOM_PORT: String(port), AGENT_ROOM_HOST: '127.0.0.1',
    AGENT_ROOM_CUACA: 'off', AGENT_ROOM_LAPOR: '',
  }, ENV_DATA(dir));

  const proc = spawn(process.execPath, [SERVER], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const k = { proc, port, dir, alamat: 'http://127.0.0.1:' + port, keluar: '' };
  kantor = k;
  proc.stdout.setEncoding('utf8'); proc.stdout.on('data', (s) => { k.keluar += s; });
  proc.stderr.setEncoding('utf8'); proc.stderr.on('data', (s) => { k.keluar += s; });

  const batas = Date.now() + 20000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error('server mati saat start:\n' + k.keluar);
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

async function hook(k, jenis, sesi, tambahan = {}) {
  const r = await fetch(k.alamat + '/event', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hook_event_name: jenis, session_id: sesi, cwd: '/tmp/proyek-paraf', ...tambahan }),
  });
  await r.arrayBuffer();
  if (r.status !== 204) throw new Error('POST /event menjawab ' + r.status);
  await tidur(30);
}

const barisAgenda = (dir) => {
  const d = path.join(dir, 'agenda');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).flatMap((f) => fs.readFileSync(path.join(d, f), 'utf8')
    .split('\n').filter((t) => t.trim()).map((t) => { try { return JSON.parse(t); } catch { return null; } })
    .filter(Boolean));
};

/* ================================================================ jalankan == */

async function utama() {
  console.log(tebal('uji-paraf') + abu(' — telaah risiko sampai ke kartu, agenda, dan buku register'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-paraf-'));
  const k = await bukaKantor(dir);
  const SENTINEL = 'RAHASIA-PERINTAH-JANGAN-JADI-TANDA';

  try {
    /* ------------------------------------------------------------ kasus 1 */
    console.log(tebal('\nKasus 1 — izin dari hook ditelaah dari tool_input mentah'));
    await hook(k, 'PermissionRequest', 'sesi-bahaya', {
      tool_name: 'Bash', tool_input: { command: 'rm -rf build && git push --force origin ' + SENTINEL },
    });
    await tidur(250);
    const baris = barisAgenda(dir);
    const izin = baris.find((b) => b.kind === 'izin-minta');
    benar('baris izin-minta tercatat di agenda', Boolean(izin), JSON.stringify(baris.map((b) => b.kind)));
    sama('  tingkatnya tinggi', (izin || {}).risiko, 'tinggi');
    benar('  nama polanya ikut', String((izin || {}).tanda || '').includes('hapus-rekursif-paksa'),
      JSON.stringify((izin || {}).tanda));
    benar('  dua pola sekaligus terbaca', String((izin || {}).tanda || '').includes('git-push-paksa'),
      JSON.stringify((izin || {}).tanda));
    if (TAMPIL) console.log(abu('      ' + JSON.stringify(izin)));

    /* ------------------------------------------------------------ kasus 2 */
    console.log(tebal('\nKasus 2 — tanda tidak pernah membawa isi perintah'));
    benar('sentinel tidak muncul di medan risiko/tanda mana pun',
      !baris.some((b) => String(b.risiko || '').includes(SENTINEL) || String(b.tanda || '').includes(SENTINEL)),
      'telaah membawa potongan perintah ke medan barunya');
    const telaahLangsung = telaahRisiko('Bash', { command: 'rm -rf ' + SENTINEL });
    benar('  modulnya sendiri juga tidak membocorkannya',
      !JSON.stringify(telaahLangsung).includes(SENTINEL), JSON.stringify(telaahLangsung));

    /* ------------------------------------------------------------ kasus 3 */
    console.log(tebal('\nKasus 3 — perintah jinak tidak menyalakan pita apa pun'));
    await hook(k, 'PermissionRequest', 'sesi-jinak', {
      tool_name: 'Read', tool_input: { file_path: '/tmp/catatan.md' },
    });
    await tidur(250);
    const jinak = barisAgenda(dir).filter((b) => b.kind === 'izin-minta' && b.session.startsWith('sesi-jinak'))[0];
    benar('izin jinak tercatat', Boolean(jinak));
    sama('  tanpa tingkat risiko', (jinak || {}).risiko, undefined);
    sama('  tanpa nama pola', (jinak || {}).tanda, undefined);

    /* ------------------------------------------------------------ kasus 3b */
    console.log(tebal('\nKasus 3b — instansi luar minta keterangan'));
    const TANYA = 'PERTANYAAN-RAHASIA-JANGAN-KE-DISK';
    await hook(k, 'Elicitation', 'sesi-elicit', {
      mcp_server_name: 'supabase', message: 'Pilih project: ' + TANYA, elicitationId: 'e1',
    });
    await tidur(250);
    const ru1 = await (await fetch(k.alamat + '/ruangan')).json();
    const se = (ru1.sesi || []).find((x) => x.sesi.startsWith('sesi-elicit'));
    benar('elicitation menyalakan keadaan butuh manusia', Boolean(se && se.butuh), JSON.stringify(se));
    sama('  sebabnya tanya', ((se || {}).butuh || {}).sebab, 'tanya');
    const el = barisAgenda(dir).find((x) => x.kind === 'elicit');
    sama('  labelnya nama instansinya, bukan pertanyaannya', (el || {}).label, 'supabase');
    benar('  pertanyaannya TIDAK pernah sampai ke disk',
      !JSON.stringify(barisAgenda(dir)).includes(TANYA),
      'isi pertanyaan bocor ke buku agenda lewat hook elicitation');
    await hook(k, 'ElicitationResult', 'sesi-elicit', { mcp_server_name: 'supabase', elicitationId: 'e1' });
    await tidur(250);
    const ru2 = await (await fetch(k.alamat + '/ruangan')).json();
    const se2 = (ru2.sesi || []).find((x) => x.sesi.startsWith('sesi-elicit'));
    benar('  jawabannya mencabut keadaan tertahan', !((se2 || {}).butuh), JSON.stringify(se2 && se2.butuh));

    /* ------------------------------------------------------------ kasus 4 */
    console.log(tebal('\nKasus 4 — buku register dibaca ulang dari agenda'));
    const reg = await (await fetch(k.alamat + '/paraf')).json();
    benar('/paraf menjawab dengan rentang & tally', Boolean(reg.tally) && Boolean(reg.dari),
      JSON.stringify(reg).slice(0, 200));
    sama('  satu permintaan berisiko tinggi terhitung', reg.tally.tinggi, 1);
    sama('  dua baris izin terbaca', reg.jumlah, 2);
    benar('  terbaru di atas', reg.baris.length >= 2 && reg.baris[0].ts >= reg.baris[1].ts);
    const kolom = ['ts', 'sesi', 'proyek', 'kind', 'tool', 'keputusan', 'sumber', 'tunggu', 'risiko', 'tanda'];
    const kurang = kolom.filter((x) => !(x in (reg.baris[0] || {})));
    benar('  tiap baris membawa kolom yang dijanjikan', kurang.length === 0, 'kurang: ' + kurang.join(', '));
    benar('  isi perintah tidak ikut ke register',
      !JSON.stringify(reg).includes(SENTINEL),
      'register membawa potongan perintah — jalur baru yang bocor');

    /* ------------------------------------------------------------ kasus 5 */
    console.log(tebal('\nKasus 5 — rentang tanggal dijaga seperti /skp'));
    const salah = await fetch(k.alamat + '/paraf?dari=bukan-tanggal');
    sama('tanggal ngawur ditolak 400', salah.status, 400);
    await salah.arrayBuffer();
    const kosong = await (await fetch(k.alamat + '/paraf?dari=2020-01-01&sampai=2020-01-02')).json();
    sama('  rentang tanpa data menjawab nol baris, bukan galat', kosong.jumlah, 0);
  } finally {
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
