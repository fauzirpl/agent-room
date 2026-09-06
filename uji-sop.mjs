#!/usr/bin/env node
/* uji-sop.mjs :: juknis paraf per proyek — dan pagar yang membuatnya tidak
 * bisa jadi kelonggaran.
 *
 * `sop.json` adalah satu-satunya hal di kantor ini yang bisa MENOLAK sesuatu
 * secara otomatis di gerbang manusia. Justru karena itu ia butuh penjaga yang
 * lebih galak daripada fiturnya sendiri: yang diuji di sini bukan cuma "apakah
 * aturannya jalan", tapi "apakah ia tetap TIDAK BISA melakukan hal-hal yang
 * memang tidak boleh ia lakukan".
 *
 * ---------------------------------------------------------------------------
 * Tiga pagar yang ditagih berkas ini, dan tiap-tiapnya punya kasusnya sendiri:
 *
 *   A. **v1 tidak bisa MEMBERI izin.** `putusan: "paraf"` ditolak waktu
 *      dimuat, bukan diam-diam diabaikan. Juknis cuma boleh menambah
 *      penolakan; kalau ia bisa memberi paraf otomatis, ia berhenti jadi
 *      jaring pengaman dan jadi bypass yang tidak pernah kamu setujui.
 *   B. **Sesi terminal tidak pernah ditahan.** Izin yang datang lewat hook
 *      cuma DIBERI CATATAN `ev.sop`; tidak ada `izin-jawab`, tidak ada yang
 *      berubah, dan jawabannya tetap urusan terminalnya sendiri. Nota bukan
 *      rem — dan kasus 6 yang membuktikannya, bukan komentar di kode.
 *   C. **Tanpa berkasnya, nol jejak.** Tidak ada event ber-`sop`, tidak ada
 *      baris konsol, tidak ada perilaku yang berubah. Fitur berlapis: tidak
 *      ada kunci berarti tidak ada yang rusak.
 *
 * Yang juga dijaga:
 *
 *   - aturan `tolak` benar-benar menolak di `/izin/tanya`, `izin-jawab`
 *     ber-`sumber: "sop"` terbit TANPA ada yang menekan tombol, pegawainya
 *     tidak pernah berdiri menunggu, dan agennya menerima `deny`;
 *   - `parafWajib` memaksa tugas lahir dengan loket paraf walau pemanggilnya
 *     tidak memintanya;
 *   - `modeDilarang` diperiksa pada MODE EFEKTIF. Ini bukan detail: body
 *     TANPA `mode` lahir `bypassPermissions`, jadi memeriksa field `mode`
 *     justru membiarkan lewat mode yang paling mungkin dilarang. Kasus 4
 *     mengirim body tanpa `mode` dan menuntut 400;
 *   - aturan tanpa syarat ditolak waktu dimuat (aturan yang cocok dengan
 *     segalanya bukan juknis, itu memutus telepon), dan aturan lain yang
 *     benar tetap berlaku;
 *   - polanya TIDAK PERNAH sampai ke disk: buku agenda cuma menyalin putusan
 *     dan nomor aturannya, karena regex juknis bisa memuat nama berkas
 *     rahasia proyek;
 *   - berkas rusak = tepat satu peringatan, `/health` tetap 200.
 *
 * Memakai pemeran `claude-palsu.mjs` lewat seam `CLAUDE_SKRIP` — tidak ada
 * biner claude sungguhan yang dipanggil, dan PATH proses server dikosongkan
 * supaya `cariClaude()` mustahil menemukannya.
 *
 * Pakai:
 *   node uji-sop.mjs
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
const PEMERAN = path.join(__dirname, 'claude-palsu.mjs');
const BATAS_MS = 60000;

const warna = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (n) => (s) => (warna ? '\x1b[' + n + 'm' + s + '\x1b[0m' : s);
const merah = c(31); const hijau = c(32); const abu = c(90); const tebal = c(1);

let periksa = 0; let gagal = 0;
const lulus = (t) => { periksa++; console.log('  ' + hijau('✓') + ' ' + t); };
const tolakUji = (t, ket) => { periksa++; gagal++; console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(ket) : '')); };
const benar = (t, syarat, ket) => { if (syarat) lulus(t); else tolakUji(t, ket || ''); };
const sama = (t, dapat, harap) => {
  if (dapat === harap) lulus(t + ' ' + abu('= ' + JSON.stringify(dapat)));
  else tolakUji(t, 'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harap));
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
  /* AGENT_ROOM_ISI sengaja TIDAK dimatikan: kalimat agen satu-satunya bukti
     LANGSUNG bahwa penolakan juknis benar-benar sampai ke agennya, bukan cuma
     tercatat di server. Tidak ada transkrip sungguhan yang terbaca — berkas
     transkrip hanya dibuka kalau ada payload hook yang membawa jalurnya, dan
     harness ini tidak mengirim satu pun. */
});

const kantorHidup = [];

async function bukaKantor(dir, berkasSop) {
  const port = await portBebas(4960);
  const env = envTanpaJalurKeluar(process.env, {
    AGENT_ROOM_PORT: String(port), AGENT_ROOM_HOST: '127.0.0.1',
    AGENT_ROOM_CLAUDE: PEMERAN,
    AGENT_ROOM_IZIN_TIMEOUT_MS: '8000',
    ...ENV_DATA(dir),
    ...(berkasSop ? { AGENT_ROOM_SOP: berkasSop } : { AGENT_ROOM_SOP: path.join(dir, 'tidak-ada.json') }),
    PATH: '', Path: '',
  });
  const proc = spawn(process.execPath, [SERVER, '--izinkan-perintah'], {
    cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const k = { proc, port, dir, alamat: 'http://127.0.0.1:' + port, log: '' };
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
const tutupSemua = () => { for (const k of kantorHidup) { try { k.proc.kill(); } catch { /* sudah */ } } };

const ambil = (k, jalur, opsi = {}) => fetch(k.alamat + jalur, {
  ...opsi, headers: { origin: k.alamat, ...(opsi.headers || {}) },
}).then(async (r) => {
  const teks = await r.text();
  let d = null; try { d = JSON.parse(teks); } catch { /* bukan JSON */ }
  return { status: r.status, d, teks };
});
const kirim = (k, jalur, badan, header = {}) => ambil(k, jalur, {
  method: 'POST', headers: { 'content-type': 'application/json', ...header }, body: JSON.stringify(badan),
});

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
    async tunggu(cocok, batasMs = BATAS_MS) {
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

const tulisSop = (dir, nama, isi) => {
  const p = path.join(dir, nama);
  fs.writeFileSync(p, typeof isi === 'string' ? isi : JSON.stringify(isi, null, 2));
  return p;
};

async function jalan() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-sop-'));
  // nama FOLDER kerja itulah kunci proyek di sop.json
  const kerja = path.join(dir, 'proyek-juknis');
  fs.mkdirSync(kerja, { recursive: true });
  const kerjaMode = path.join(dir, 'proyek-mode');
  fs.mkdirSync(kerjaMode, { recursive: true });

  /* ---------------- Kasus 1 — pagar A: v1 tidak bisa memberi izin ---------- */
  console.log(tebal('\nKasus 1 — PAGAR: juknis tidak bisa MEMBERI paraf otomatis'));
  {
    const berkas = tulisSop(dir, 'sop-paraf.json', {
      v: 1,
      proyek: { 'proyek-juknis': { aturan: [
        { putusan: 'paraf', tool: 'Bash', pesan: 'coba melewati manusia' },
        { putusan: 'tolak', tool: 'Read', pesan: 'yang ini sah' },
      ] } },
    });
    const k = await bukaKantor(path.join(dir, 'k1'), berkas);
    benar('aturan berputusan "paraf" ditolak waktu dimuat',
      /berputusan "paraf"/.test(k.log), k.log.split('\n').filter((l) => /sop/.test(l)).join(' | ').slice(0, 220));
    benar('  alasannya disebut terang: paraf otomatis sengaja tidak ada',
      /paraf otomatis sengaja tidak ada/.test(k.log), '');
    benar('  aturan lain yang benar TETAP berlaku', /1 proyek, 1 aturan/.test(k.log),
      k.log.split('\n').filter((l) => /juknis paraf aktif/.test(l)).join(''));
    const kd = await ambil(k, '/kendali');
    sama('  dan juknisnya tetap aktif', kd.d?.sop?.aktif, true);
  }

  /* ---------------- Kasus 2 — aturan tolak benar-benar menolak ------------- */
  console.log(tebal('\nKasus 2 — aturan tolak: ditolak tanpa ada yang menekan tombol'));
  const berkasUtama = tulisSop(dir, 'sop-utama.json', {
    v: 1,
    proyek: {
      'proyek-juknis': {
        parafWajib: true,
        modeDilarang: ['bypassPermissions'],
        aturan: [{ putusan: 'tolak', tool: 'Bash', pola: 'rm\\s+-rf', pesan: 'juknis: jangan menyapu isi build' }],
      },
      /* Proyek kedua sengaja TANPA parafWajib. Kasus 4 butuh itu: di proyek
         yang memakai parafWajib, mode efektif tugas tanpa `mode` menjadi
         'default' dan bypassPermissions memang tidak pernah terjangkau — jadi
         lubang yang mau ditagih justru tertutup oleh tetangganya, dan ujinya
         hijau tanpa membuktikan apa pun. */
      'proyek-mode': { modeDilarang: ['bypassPermissions'], aturan: [] },
    },
  });
  const k2 = await bukaKantor(path.join(dir, 'k2'), berkasUtama);
  const tap = sadap(k2.port);
  await tap.siap;
  await tidur(150);
  const TOKEN = (await ambil(k2, '/kendali')).d?.token || '';
  {
    /* `naskah:paraf-allow` meminta izin untuk `rm -rf build/sementara`.
       Aturannya cocok, jadi yang harus terjadi: ditolak juknis, dan agennya
       menerima deny — padahal harness ini TIDAK PERNAH memanggil /izin/jawab. */
    const r = await kirim(k2, '/perintah', {
      token: TOKEN, prompt: 'naskah:paraf-allow', cwd: kerja, nama: 'kena-juknis', paraf: true,
    });
    sama('tugas lahir', r.status, 200);
    const sesi = r.d?.sesi || '';
    const minta = await tap.tunggu((e) => e.kind === 'izin-minta' && e.session === sesi);
    benar('izin-minta tetap terbit — permintaannya memang pernah ada', Boolean(minta), '');
    sama('  membawa putusan juknis', minta?.sop?.putusan, 'tolak');
    sama('  berikut NOMOR aturannya', minta?.sop?.aturan, 1);
    sama('  TIDAK membawa tombol paraf', minta?.paraf, undefined);
    sama('  dan pegawainya tidak pernah berdiri menunggu', minta?.butuh, undefined);

    const jawab = await tap.tunggu((e) => e.kind === 'izin-jawab' && e.session === sesi);
    benar('izin-jawab terbit tanpa ada yang menekan tombol', Boolean(jawab), '');
    sama('  keputusannya tolak', jawab?.keputusan, 'tolak');
    sama('  sumbernya sop, bukan halaman', jawab?.sumber, 'sop');
    benar('  pesannya pesan juknismu sendiri', /jangan menyapu isi build/.test(jawab?.label || ''), jawab?.label);

    const ucap = await tap.tunggu((e) => e.session === sesi && /PARAF DITOLAK/.test(e.label || e.teks || ''));
    benar('agennya benar-benar menerima deny', Boolean(ucap), '');
    const selesai = await tap.tunggu((e) => e.kind === 'tugas-selesai' && e.session === sesi);
    sama('  dan cabang deny yang dijalankannya', selesai?.biaya?.usd, 0.0011);
  }

  /* ---------------- Kasus 3 — polanya tidak pernah ke disk ----------------- */
  console.log(tebal('\nKasus 3 — pola juknis TIDAK PERNAH sampai ke buku agenda'));
  {
    await tidur(400);
    const hariIni = new Date();
    const tgl = hariIni.getFullYear() + '-' + String(hariIni.getMonth() + 1).padStart(2, '0')
      + '-' + String(hariIni.getDate()).padStart(2, '0');
    const jalur = path.join(dir, 'k2', 'agenda', tgl + '.jsonl');
    const teks = fs.readFileSync(jalur, 'utf8');
    const baris = teks.split('\n').filter(Boolean).map((x) => JSON.parse(x));
    const berSop = baris.filter((b) => b.sop);
    benar('buku agenda memuat barisnya', berSop.length >= 1, String(berSop.length));
    sama('  putusannya ikut', berSop[0]?.sop?.putusan, 'tolak');
    sama('  nomor aturannya ikut', berSop[0]?.sop?.aturan, 1);
    /* KONTROL POSITIF dulu: pastikan yang diperiksa memang berisi, supaya
       "polanya tidak ada" tidak hijau karena berkasnya kebetulan kosong. */
    benar('  kontrol positif: barisnya memang berisi', /"kind":"izin-minta"/.test(teks), teks.slice(0, 120));
    sama('  dan POLANYA tidak ada di seluruh berkas', teks.includes('rm\\s+-rf'), false);
    benar('    juga tidak dalam bentuk apa pun', !/pola/.test(teks), 'kata "pola" muncul di agenda');
  }

  /* ---------------- Kasus 4 — modeDilarang pada MODE EFEKTIF --------------- */
  console.log(tebal('\nKasus 4 — modeDilarang diperiksa pada mode EFEKTIF, bukan field body'));
  {
    /* Inti kasus ini: body TANPA `mode` lahir bypassPermissions. Memeriksa
       field `mode` akan meloloskannya — justru mode yang paling mungkin
       dilarang. Yang benar memeriksa hasil akhirnya. */
    const tanpaMode = await kirim(k2, '/perintah', {
      token: TOKEN, prompt: 'naskah:stream', cwd: kerjaMode, nama: 'tanpa-mode',
    });
    sama('body TANPA mode ditolak 400', tanpaMode.status, 400);
    benar('  alasannya menyebut mode efektifnya', /bypassPermissions/.test(tanpaMode.d?.pesan || ''), tanpaMode.d?.pesan);
    benar('  dan menyebut bahwa itu mode bawaan', /mode bawaan/.test(tanpaMode.d?.pesan || ''), tanpaMode.d?.pesan);

    const modeJelas = await kirim(k2, '/perintah', {
      token: TOKEN, prompt: 'naskah:stream', cwd: kerjaMode, nama: 'mode-jelas', mode: 'bypassPermissions',
    });
    sama('body yang menyebut mode terlarang juga ditolak', modeJelas.status, 400);

    /* Yang ber-paraf lahir dengan mode `default`, jadi TIDAK terlarang —
       larangan ini soal mode, bukan soal menolak semua tugas. */
    const berParaf = await kirim(k2, '/perintah', {
      token: TOKEN, prompt: 'naskah:gagal', cwd: kerjaMode, nama: 'ber-paraf', paraf: true,
    });
    sama('tugas ber-paraf (mode efektif "default") tetap boleh lahir', berParaf.status, 200);
    /* Akibat sampingan `parafWajib` yang pantas dicatat: di proyek yang
       memakainya, body tanpa `mode` MEMANG tidak pernah jadi
       bypassPermissions — parafWajib mengubah mode efektifnya lebih dulu.
       Dua rem itu bekerja sama, bukan saling menutupi. */
    const diWajib = await kirim(k2, '/perintah', {
      token: TOKEN, prompt: 'naskah:gagal', cwd: kerja, nama: 'wajib-paraf',
    });
    sama('di proyek ber-parafWajib, body tanpa mode justru lolos (efektifnya "default")',
      diWajib.status, 200);
  }

  /* ---------------- Kasus 5 — parafWajib ---------------------------------- */
  console.log(tebal('\nKasus 5 — parafWajib memaksa loket paraf walau tidak diminta'));
  {
    /* Tidak diamati lewat argv, tapi lewat AKIBATNYA: `claude-palsu.mjs`
       berhenti berkode 65 kalau --mcp-config tidak ada. Jadi kalau tugas ini
       sampai ke loket paraf, --permission-prompt-tool memang terpasang. */
    const r = await kirim(k2, '/perintah', {
      token: TOKEN, prompt: 'naskah:paraf-allow', cwd: kerja, nama: 'tanpa-minta-paraf', mode: 'default',
    });
    sama('tugas lahir tanpa meminta paraf', r.status, 200);
    const sesi = r.d?.sesi || '';
    const minta = await tap.tunggu((e) => e.kind === 'izin-minta' && e.session === sesi);
    benar('tapi tetap sampai ke loket paraf — parafWajib berlaku', Boolean(minta),
      'kalau null: pemerannya keluar kode 65 karena --mcp-config tidak ada');
    const mulai = tap.ev.find((e) => e.kind === 'tugas-mulai' && e.session === sesi);
    sama('  dan tugas-mulai menandainya ber-paraf', mulai?.paraf, true);
  }

  tap.tutup();

  /* ---------------- Kasus 6 — pagar B: sesi terminal tidak ditahan --------- */
  console.log(tebal('\nKasus 6 — PAGAR: sesi terminal cuma DICATAT, tidak pernah ditahan'));
  {
    const tap2 = sadap(k2.port);
    await tap2.siap;
    await tidur(150);
    const SESI = 'terminal-sop-01';
    const r = await kirim(k2, '/event', {
      hook_event_name: 'PermissionRequest', session_id: SESI, cwd: kerja,
      tool_name: 'Bash', tool_input: { command: 'rm -rf build/lama' },
    }, { 'x-agent-room': '1' });
    benar('hook izin-minta diterima', r.status === 204 || r.status === 200, String(r.status));
    await tidur(500);
    const ev = tap2.ev.filter((e) => e.kind === 'izin-minta' && e.session === SESI.slice(0, 12));
    benar('eventnya terbit', ev.length >= 1, JSON.stringify(tap2.ev.map((e) => e.kind)));
    sama('  DICATAT menabrak juknis', ev[0]?.sop?.putusan, 'tolak');
    sama('  nomor aturannya ikut', ev[0]?.sop?.aturan, 1);
    /* Ini pagarnya: catatan, bukan keputusan. Tidak ada izin-jawab, tidak ada
       yang dibatalkan, dan jawabannya tetap urusan terminalnya sendiri. */
    const jawab = tap2.ev.filter((e) => e.kind === 'izin-jawab' && e.session === SESI.slice(0, 12));
    sama('  dan TIDAK ada izin-jawab yang terbit untuknya', jawab.length, 0);
    sama('  balasan /event tetap 204 tanpa badan', r.status, 204);
    tap2.tutup();
  }

  /* ---------------- Kasus 7 — validator aturan ---------------------------- */
  console.log(tebal('\nKasus 7 — aturan tanpa syarat ditolak; yang benar tetap berlaku'));
  {
    const berkas = tulisSop(dir, 'sop-ngawur.json', {
      v: 1,
      proyek: { 'proyek-juknis': { aturan: [
        { putusan: 'tolak', pesan: 'menolak segalanya' },
        { putusan: 'tolak', pola: '[', pesan: 'regex rusak' },
        { putusan: 'tolak', tool: 'Bash', pesan: 'yang ini sah' },
      ] } },
    });
    const k = await bukaKantor(path.join(dir, 'k7'), berkas);
    benar('aturan tanpa tool/pola/risiko ditolak', /tidak menyebut tool, pola, maupun risiko/.test(k.log),
      k.log.split('\n').filter((l) => /sop:/.test(l)).join(' | ').slice(0, 240));
    benar('  alasannya menjelaskan akibatnya', /menolak SEMUA izin/.test(k.log), '');
    benar('regex rusak ditolak dengan sebabnya', /bukan regex sah/.test(k.log), '');
    benar('  dan yang benar TETAP berlaku', /1 proyek, 1 aturan/.test(k.log),
      k.log.split('\n').filter((l) => /juknis paraf aktif/.test(l)).join(''));
  }

  /* ---------------- Kasus 8 — berkas rusak -------------------------------- */
  console.log(tebal('\nKasus 8 — berkas rusak: tepat satu peringatan, kantor tetap buka'));
  {
    const berkas = tulisSop(dir, 'sop-rusak.json', '{ ini bukan json');
    const k = await bukaKantor(path.join(dir, 'k8'), berkas);
    const h = await ambil(k, '/health');
    sama('/health tetap 200', h.status, 200);
    const baris = k.log.split('\n').filter((l) => /\[agent-room\] sop:/.test(l));
    sama('  tepat satu peringatan', baris.length, 1);
    benar('  yang menyebut berkasnya tidak terbaca', /bukan objek JSON/.test(baris[0] || ''), baris[0]);
    const kd = await ambil(k, '/kendali');
    sama('  dan juknisnya mati, bukan setengah jalan', kd.d?.sop?.aktif, false);
  }

  /* ---------------- Kasus 9 — pagar C: tanpa berkas, nol jejak ------------- */
  console.log(tebal('\nKasus 9 — PAGAR: tanpa sop.json, nol jejak sama sekali'));
  {
    const k = await bukaKantor(path.join(dir, 'k9'), null);
    const tap3 = sadap(k.port);
    await tap3.siap;
    await tidur(150);
    const kd = await ambil(k, '/kendali');
    sama('/kendali mengaku juknis tidak aktif', kd.d?.sop?.aktif, false);
    sama('  dan tidak menyebut satu proyek pun', (kd.d?.sop?.proyek || []).length, 0);
    const SESI = 'tanpa-juknis-1';
    await kirim(k, '/event', {
      hook_event_name: 'PermissionRequest', session_id: SESI, cwd: kerja,
      tool_name: 'Bash', tool_input: { command: 'rm -rf build/lama' },
    }, { 'x-agent-room': '1' });
    await tidur(400);
    const ev = tap3.ev.filter((e) => e.kind === 'izin-minta');
    benar('event yang sama tetap terbit', ev.length >= 1, '');
    sama('  tapi tanpa medan sop sama sekali', ev[0]?.sop, undefined);
    sama('  dan nol baris konsol menyebut juknis', k.log.split('\n').filter((l) => /juknis|sop:/.test(l)).length, 0);
    tap3.tutup();
  }

  /* ---------------- Kasus 10 — lint: /event tidak bisa menahan ------------- */
  console.log(tebal('\nKasus 10 — LINT: tidak ada jalur dari /event yang bisa menahan siapa pun'));
  {
    /* Pagar B dijaga dua kali: sekali lewat perilaku (kasus 6), sekali lewat
       bentuk kode. `jawabIzin()` satu-satunya yang bisa memutuskan sebuah
       permintaan izin — kalau ia sampai bisa dipanggil dari `normalize()`,
       sesi terminal bisa ditahan tanpa ada yang sadar. */
    const src = fs.readFileSync(SERVER, 'utf8');
    /* `\r?\n` bukan kerapian: berkas yang di-checkout git di Windows berakhiran
       CRLF, jadi pola yang mengeja `\n}` polos hijau di pohon kerja penulisnya
       dan MERAH di checkout siapa pun yang lain. Ketahuan waktu harness ini
       dijalankan di tree yang diekstrak `git checkout-index`. */
    const blokNormalize = /function normalize\(raw[\s\S]*?\r?\n\}\r?\n/.exec(src);
    benar('blok normalize() ketemu untuk diperiksa', Boolean(blokNormalize), '');
    if (blokNormalize) {
      benar('  normalize() memanggil sopPutuskan (memang mencatat)',
        blokNormalize[0].includes('sopPutuskan('), '');
      sama('  tapi TIDAK memanggil jawabIzin', blokNormalize[0].includes('jawabIzin('), false);
      sama('  dan tidak menyentuh izinTunggu', blokNormalize[0].includes('izinTunggu'), false);
    }
    /* Tiap pemanggil `jawabIzin()` WAJIB menyebut sumbernya, dan sumbernya
       wajib dari daftar yang dikenal. Bukan menghitung jumlah pemanggil —
       angka ambang yang dikarang akan merah tiap kali ada yang menyentuh
       berkasnya, tanpa satu pun keadaan berbahaya. Yang berbahaya justru
       sumber BARU yang tidak pernah diumumkan: buku register memisahkan
       keputusanmu sendiri dari penolakan mesin lewat medan itu, dan sumber
       yang tidak dikenal akan menyamar jadi salah satunya. */
    const SUMBER_SAH = new Set(['halaman', 'waktu habis', 'server', 'sop']);
    const sumber = [];
    for (const m of src.matchAll(/jawabIzin\(/g)) {
      let i = m.index + m[0].length; let dalam = 1; const mulai = i;
      while (i < src.length && dalam > 0) {
        if (src[i] === '(') dalam++;
        else if (src[i] === ')') dalam--;
        i++;
      }
      const arg = src.slice(mulai, i - 1);
      const kutip = [...arg.matchAll(/'([^']*)'/g)];
      if (kutip.length) sumber.push(kutip[kutip.length - 1][1]);
    }
    benar('tiap pemanggil jawabIzin menyebut sumbernya ' + abu('(' + sumber.length + ' pemanggil)'),
      sumber.length >= 4, JSON.stringify(sumber));
    const liar = [...new Set(sumber.filter((s) => !SUMBER_SAH.has(s)))];
    sama('  dan tiap sumber ada di daftar yang dikenal', liar.join(', ') || 'semuanya dikenal', 'semuanya dikenal');
    benar('  termasuk sumber juknis yang baru', sumber.includes('sop'), JSON.stringify(sumber));
    catatan('sumber sah: halaman (tombol), waktu habis (timer), server (tugas berakhir), sop (juknis)');
  }

  tutupSemua();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* biar OS yang bersihkan */ }
}

jalan().then(() => {
  tutupSemua();
  console.log();
  if (gagal) { console.log(merah(tebal('GAGAL ' + gagal + ' dari ' + periksa + ' pemeriksaan'))); process.exit(1); }
  console.log(hijau(tebal('LULUS ' + periksa + ' pemeriksaan')));
}).catch((err) => {
  const k = kantorHidup[kantorHidup.length - 1];
  if (k) console.error(abu('\n--- konsol kantor ---\n' + k.log.slice(-1200)));
  tutupSemua();
  console.error(merah('\nuji-sop meledak: ' + (err && err.stack || err)));
  process.exit(1);
});
