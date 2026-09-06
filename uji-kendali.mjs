#!/usr/bin/env node
/* uji-kendali.mjs :: loop kendali web ujung ke ujung, dengan PEMERAN.
 *
 * Jalur ini yang paling mungkin rusak diam-diam dan paling mahal akibatnya:
 *
 *   POST /perintah → masukAntrean → lahirkanTugas → spawn → stream-json
 *     → serapStream → session-start / pre / subagent-start / subagent-stop
 *     → izin-minta ber-paraf → /izin/jawab → tugas-selesai ber-biaya
 *
 * Sampai commit ini, nol uji menyentuhnya — argv yang dirakit `lahirkanTugas()`,
 * bentuk balasan `mcp-izin.mjs` (`{behavior:'allow'|'deny'}`), kunci per-tugas,
 * dan `parent_tool_use_id` yang jadi `agenId` semuanya bisa berubah tanpa satu
 * pun gerbang berbunyi.
 *
 * `claude-palsu.mjs` yang jadi pemerannya: ia membaca argv yang sama,
 * memainkan naskah stream-json, dan untuk naskah paraf BENAR-BENAR menjalankan
 * `mcp-izin.mjs` dari `--mcp-config` yang dirakit server. Loket parafnya diuji
 * sungguhan, bukan ditiru — yang tiruan cuma agennya.
 *
 * ---------------------------------------------------------------------------
 * Kenapa ini baru bisa ada sekarang: `server.mjs` memanggil
 * `spawn(CLAUDE, args, { shell:false })`, jadi penunjuk yang berupa skrip
 * mustahil jalan (di Windows `.cmd`/`.mjs` melempar EINVAL sejak perbaikan
 * CVE-2024-27980; di CI Linux semua `.mjs` di indeks git bermode 100644).
 * `CLAUDE_SKRIP` di server.mjs adalah seam-nya — tiga baris, disetujui pemilik
 * repo, dan kantor mengatakannya keras-keras di konsol waktu dipakai. Kasus 1
 * di bawah yang menagih suara itu.
 *
 * Yang dijaga:
 *
 *   1. Seam-nya bersuara — kantor tidak boleh diam waktu memakai pemeran.
 *   2. Argv `lahirkanTugas()` sebagai KONTRAK: pemerannya berhenti dengan kode
 *      64 kalau ada flag yang hilang atau berganti nama, dan itu membuat uji
 *      ini merah.
 *   3. Rapat sungguhan dari stream-json: `session-start` berlabel 'lewat
 *      stream-json', `pre` Task ber-peserta, `subagent-start`/`subagent-stop`
 *      ber-`agenId`, panggilan bersarang yang `agenId`-nya milik pesertanya —
 *      bukan induknya, dan `tugas-selesai` membawa biaya dari pesan `result`.
 *   4. Paraf DIPARAF: izin-minta ber-`paraf.id` terbit, `GET /kendali`
 *      menyebutnya di `izinTunggu`, `POST /izin/jawab` menutupnya, dan
 *      keputusannya BENAR-BENAR sampai ke agen.
 *   5. Paraf DITOLAK: alasan yang kamu ketik sampai ke agen, dan cabang yang
 *      dijalankannya memang cabang deny.
 *
 *      Buktinya kalimat agen + biaya, BUKAN `pre`/`post` tool-nya, dan itu
 *      pelajaran dari uji ini sendiri. Begitu mcp-izin bicara ke
 *      `/izin/tanya`, server memanggil `tandaiHidup()` dan sesi itu dianggap
 *      dipegang hook; sesudah itu `serapStream()` berhenti menerbitkan
 *      tool_use dari stream. Di produksi tool call-nya memang datang dari
 *      hook. Versi pertama uji ini memakai pre/post sebagai bukti, dan itu
 *      hijau DAN merah karena alasan yang salah.
 *
 *      Kasus 3 sekaligus penjaga satu CACAT yang ditemukan uji ini sendiri:
 *      jawaban paraf yang masuk sebelum poll pertama mcp-izin sempat tiba
 *      dulu HILANG — rekamannya sudah dicabut `jawabIzin()`, pollnya dijawab
 *      404, dan mcp-izin menerjemahkan 404 jadi TOLAK. Paraf berubah jadi
 *      Tolak, diam-diam, tanpa jejak. Lihat `izinJawaban` di server.mjs.
 *   6. Kunci per-tugas sampai ke proses MCP lewat ENV — tidak lewat argv, dan
 *      tidak lewat `--mcp-config`. Argv proses bisa dibaca proses lain di
 *      mesin yang sama; itu alasan yang sudah tertulis di server.mjs.
 *   7. Tugas yang gagal terbit sebagai `tugas-selesai` ok:false berkode.
 *
 * Nol jaringan: semuanya 127.0.0.1, seluruh env berkas data ke folder
 * sementara, dan tidak ada biner claude sungguhan yang pernah dipanggil.
 *
 * Pakai:
 *   node uji-kendali.mjs
 *   node uji-kendali.mjs --tampil    cetak juga seluruh event yang tertangkap
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
const TAMPIL = process.argv.includes('--tampil');
/* Anggaran menunggu satu event terbit. Lihat `tunggu()` di bawah — angkanya
   besar karena mesin yang menjalankan 25 harness berurutan jauh lebih sibuk
   daripada mesin yang menjalankan berkas ini sendirian. */
const BATAS_MS = 60000;

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
  /* AGENT_ROOM_ISI sengaja TIDAK dimatikan di sini — beda dengan harness lain.
     Kalimat agen adalah satu-satunya jalur bukti yang masih hidup sesudah
     `tandaiHidup()` menyerahkan kendali ke hook (lihat kasus 3). Tidak ada
     transkrip sungguhan yang terbaca: berkas transkrip cuma dibuka kalau ada
     payload hook yang membawa jalurnya, dan uji ini tidak mengirim satu pun. */
});

let kantor = null;

async function bukaKantor(dir) {
  const port = await portBebas(4890);
  /* PATH tetap dikosongkan walau AGENT_ROOM_CLAUDE sudah menunjuk pemeran:
     kalau suatu hari seam-nya rusak dan penunjuknya diabaikan, `cariClaude()`
     TIDAK boleh jatuh ke claude sungguhan di mesin ini. Yang dipakai
     server buat menjalankan pemeran adalah process.execPath, bukan PATH. */
  const env = envTanpaJalurKeluar(process.env, {
    AGENT_ROOM_PORT: String(port), AGENT_ROOM_HOST: '127.0.0.1',
    AGENT_ROOM_CLAUDE: PEMERAN,
    /* Dibaca mcp-izin.mjs; bawaannya 15 menit dan itu mustahil di uji.
       Sengaja jauh DI BAWAH anggaran tunggu harness (BATAS_MS): kalau loop
       parafnya sampai jatuh ke habis-waktu, yang terjadi harus penolakan
       cepat yang terbaca — bukan harness yang kehabisan waktu duluan dan
       melaporkan "tidak terbit" untuk sesuatu yang sebenarnya sedang jalan. */
    AGENT_ROOM_IZIN_TIMEOUT_MS: '8000',
    ...ENV_DATA(dir), PATH: '', Path: '',
  });
  const proc = spawn(process.execPath, [SERVER, '--izinkan-perintah'], {
    cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const k = { proc, port, alamat: 'http://127.0.0.1:' + port, log: '' };
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

const ASAL = () => ({ origin: kantor.alamat });
const ambil = async (jalur, opsi = {}) => {
  const r = await fetch(kantor.alamat + jalur, { ...opsi, headers: { ...ASAL(), ...(opsi.headers || {}) } });
  const teks = await r.text();
  let d = null; try { d = JSON.parse(teks); } catch { /* bukan JSON */ }
  return { status: r.status, d, teks };
};
const kirim = (jalur, badan) => ambil(jalur, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(badan),
});

/* Penadah /stream lewat http polos — pola yang sama dengan uji-peserta.mjs. */
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
    ev, siap, lamaGagal: 0,
    /* Menunggu event yang cocok benar-benar terbit. Tugasnya proses lain, jadi
       uji tidak boleh menganggap ia sudah selesai begitu POST-nya dijawab.

       Anggarannya longgar dengan sengaja. Satu rantai di sini bisa memuat dua
       proses node yang lahir, satu long-poll HTTP, dan satu keputusan yang
       dipalsukan — dan waktu `npm test` menjalankan 25 harness berurutan,
       mesinnya jauh lebih sibuk daripada waktu berkas ini dijalankan sendiri.
       Anggaran 20 detik sempat membuat harness ini MERAH di suite penuh dan
       HIJAU sendirian; itu bukan uji yang bisa dipercaya, dan angka yang
       lebih besar di sini tidak melemahkan apa pun — yang ditunggu event
       yang memang harus terbit, bukan jeda yang dikarang. */
    async tunggu(cocok, batasMs = BATAS_MS) {
      const mulai = Date.now();
      for (;;) {
        const e = ev.find(cocok);
        if (e) return e;
        if (Date.now() - mulai > batasMs) { t.lamaGagal = Date.now() - mulai; return null; }
        await tidur(40);
      }
    },
    tutup: () => { try { req.destroy(); } catch { /* sudah */ } },
  };
  return t;
}

async function jalan() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-kendali-'));
  const kerja = path.join(dir, 'kerja');
  fs.mkdirSync(kerja, { recursive: true });

  const k = await bukaKantor(dir);
  const tap = sadap(k.port);
  await tap.siap;
  await tidur(200);

  console.log(tebal('\nKasus 1 — seam pemeran BERSUARA, dan kantor mengaku siap'));
  {
    benar('konsol menyebut sedang memakai SKRIP, bukan biner',
      /memakai SKRIP/.test(k.log), k.log.split('\n').filter((l) => /agent-room/.test(l)).slice(-4).join(' | '));
    benar('  dan menyebut ini jalur UJI', /jalur UJI/.test(k.log), '');
    const kd = await ambil('/kendali');
    sama('/kendali mengaku siap melahirkan sesi', kd.d?.siap, true);
    benar('  penunjuknya memang pemeran', String(kd.d?.alasan || '') === '', kd.d?.alasan);
  }
  const kd = await ambil('/kendali');
  const TOKEN = kd.d?.token || '';

  console.log(tebal('\nKasus 2 — rapat sungguhan dari stream-json'));
  let sesiStream = '';
  {
    const r = await kirim('/perintah', { token: TOKEN, prompt: 'naskah:stream — telaah berkas', cwd: kerja, nama: 'telaah' });
    sama('POST /perintah diterima', r.status, 200);
    sesiStream = r.d?.sesi || '';
    benar('  membalas id sesinya', sesiStream.length === 12, JSON.stringify(r.d));

    const milik = (kind) => (e) => e.kind === kind && e.session === sesiStream;
    benar('tugas-mulai terbit', Boolean(await tap.tunggu(milik('tugas-mulai'))), '');
    const mulai = await tap.tunggu((e) => milik('session-start')(e));
    benar('session-start terbit', Boolean(mulai), '');
    sama('  labelnya menyebut asalnya', mulai?.label, 'lewat stream-json');
    sama('  modelnya dari pesan init', mulai?.model, 'palsu/pemeran-1');

    const preTask = await tap.tunggu((e) => milik('pre')(e) && e.tool === 'Task');
    benar('pre Task terbit', Boolean(preTask), '');
    benar('  membawa nama pesertanya', (preTask?.peserta || [])[0] === 'Telaah berkas', JSON.stringify(preTask?.peserta));
    const mulaiAgen = await tap.tunggu(milik('subagent-start'));
    benar('subagent-start terbit', Boolean(mulaiAgen), '');
    sama('  agenId-nya id panggilan Task', mulaiAgen?.agenId, 'toolu_rapat_1');

    /* Ini inti Tahap 2A yang belum pernah diuji ujung-ke-ujung: panggilan di
       DALAM rapat harus membawa agenId pesertanya, bukan kosong. Tanpa itu
       pekerjaan peserta jatuh ke pegawai induk yang justru sedang menunggu. */
    const preBaca = await tap.tunggu((e) => milik('pre')(e) && e.tool === 'Read');
    benar('pre Read dari dalam rapat terbit', Boolean(preBaca), '');
    sama('  agenId-nya milik pesertanya, bukan induknya', preBaca?.agenId, 'toolu_rapat_1');
    const post = await tap.tunggu((e) => milik('post')(e) && e.tool === 'Read');
    benar('post Read menyusul', Boolean(post), '');
    sama('  agenId-nya juga milik pesertanya', post?.agenId, 'toolu_rapat_1');

    const henti = await tap.tunggu(milik('subagent-stop'));
    benar('subagent-stop terbit waktu tool_result Task datang', Boolean(henti), '');
    sama('  agenId-nya sama dengan yang membukanya', henti?.agenId, 'toolu_rapat_1');

    const selesai = await tap.tunggu(milik('tugas-selesai'));
    benar('tugas-selesai terbit', Boolean(selesai), '');
    sama('  ok', selesai?.ok, true);
    sama('  biayanya dari pesan result', selesai?.biaya?.usd, 0.0421);
    sama('  ditandai BUKAN angka resmi', selesai?.biaya?.resmi, false);
  }

  console.log(tebal('\nKasus 3 — paraf dari ruangan: DIPARAF, dan keputusannya sampai ke agen'));
  {
    const r = await kirim('/perintah', {
      token: TOKEN, prompt: 'naskah:paraf-allow — bersihkan', cwd: kerja, nama: 'bersih', paraf: true,
    });
    sama('POST /perintah dengan paraf:true diterima', r.status, 200);
    const sesi = r.d?.sesi || '';
    const milik = (kind) => (e) => e.kind === kind && e.session === sesi;

    const minta = await tap.tunggu(milik('izin-minta'));
    benar('izin-minta terbit dari loket paraf', Boolean(minta), '');
    benar('  membawa id paraf yang bisa ditekan halaman', Boolean(minta?.paraf?.id), JSON.stringify(minta?.paraf));
    sama('  menyebut tool yang minta izin', minta?.paraf?.tool, 'Bash');
    benar('  ringkasannya isi perintah yang dipotong, bukan seluruh objeknya',
      typeof minta?.label === 'string' && minta.label.startsWith('rm -rf build'), JSON.stringify(minta?.label));
    benar('  membawa telaah risiko dari mcp-izin', minta?.risiko?.tingkat === 'tinggi', JSON.stringify(minta?.risiko));

    const kdTunggu = await ambil('/kendali');
    const antre = (kdTunggu.d?.izinTunggu || []).map((x) => x.id);
    benar('GET /kendali menyebutnya di izinTunggu', antre.includes(minta.paraf.id), JSON.stringify(antre));

    const j = await kirim('/izin/jawab', { id: minta.paraf.id, keputusan: 'paraf', token: TOKEN });
    sama('POST /izin/jawab diterima', j.status, 200);
    const jawab = await tap.tunggu((e) => e.kind === 'izin-jawab' && e.session === sesi);
    benar('izin-jawab terbit', Boolean(jawab), '');
    sama('  sumbernya halaman', jawab?.sumber, 'halaman');
    sama('  keputusannya paraf', jawab?.keputusan, 'paraf');

    /* Bukti bahwa parafnya benar-benar sampai KE AGEN, bukan cuma tercatat di
       server. Yang dipakai kalimat agen dan biaya, BUKAN `pre`/`post` tool-nya
       — dan itu bukan pilihan gaya. Begitu mcp-izin bicara ke /izin/tanya,
       server memanggil `tandaiHidup()` dan sesi itu dianggap dipegang hook;
       sesudah itu `serapStream()` berhenti menerbitkan tool_use dari stream
       (`if (rec.hidup) return`). Di produksi tool call-nya datang dari hook,
       di panggung ini tidak ada hook sama sekali. Memakai pre/post sebagai
       bukti akan hijau/merah karena alasan yang salah. */
    const ucap = await tap.tunggu((e) => e.session === sesi && /PARAF DITERIMA/.test(e.label || e.teks || ''));
    benar('agennya mengabarkan parafnya diterima', Boolean(ucap),
      JSON.stringify(tap.ev.filter((e) => e.session === sesi).map((e) => e.kind + ':' + (e.label || ''))));
    const selesai = await tap.tunggu(milik('tugas-selesai'));
    sama('tugas-selesai ok', selesai?.ok, true);
    sama('  biaya cabang ALLOW', selesai?.biaya?.usd, 0.0075);

    /* Kunci per-tugas TIDAK boleh ada di argv proses mana pun, dan tidak boleh
       ikut di --mcp-config. Ia cuma hidup di env — alasannya sudah tertulis di
       server.mjs: baris perintah proses bisa dibaca proses lain di mesin yang
       sama, isi env-nya tidak. */
    const kdKunci = await ambil('/kendali');
    const teks = JSON.stringify(kdKunci.d) + k.log;
    benar('kunci izin tidak pernah muncul di /kendali maupun konsol',
      !/AGENT_ROOM_KUNCI_IZIN=[0-9a-f]{8}/.test(teks) && !/"kunciIzin"/.test(teks), teks.slice(0, 120));
  }

  console.log(tebal('\nKasus 4 — paraf DITOLAK: alasannya sampai ke agen'));
  {
    const r = await kirim('/perintah', {
      token: TOKEN, prompt: 'naskah:paraf-deny — bersihkan', cwd: kerja, nama: 'tolak', paraf: true,
    });
    const sesi = r.d?.sesi || '';
    const milik = (kind) => (e) => e.kind === kind && e.session === sesi;
    const minta = await tap.tunggu(milik('izin-minta'));
    benar('izin-minta terbit', Boolean(minta), '');
    const j = await kirim('/izin/jawab', { id: minta.paraf.id, keputusan: 'tolak', pesan: 'jangan yang itu', token: TOKEN });
    sama('POST /izin/jawab (tolak) diterima', j.status, 200);
    const jawab = await tap.tunggu((e) => e.kind === 'izin-jawab' && e.session === sesi);
    sama('  keputusannya tolak', jawab?.keputusan, 'tolak');

    const ucap = await tap.tunggu((e) => e.session === sesi && /PARAF DITOLAK/.test(e.label || e.teks || ''));
    benar('agennya mengabarkan parafnya ditolak', Boolean(ucap),
      JSON.stringify(tap.ev.filter((e) => e.session === sesi).map((e) => e.kind + ':' + (e.label || ''))));
    benar('  berikut alasan yang kamu ketik', /jangan yang itu/.test(ucap?.label || ucap?.teks || ''),
      JSON.stringify(ucap?.label || ucap?.teks));
    const selesai = await tap.tunggu(milik('tugas-selesai'));
    benar('tugas-selesai terbit', Boolean(selesai), '');
    /* Biaya cabang deny BERBEDA dari cabang allow. Ini pembeda yang tidak bisa
       hijau karena kebetulan: kalau balasan loket tidak sampai ke pemeran,
       cabang mana pun tidak akan jalan dan angkanya tidak akan cocok. */
    sama('  biaya cabang DENY, bukan cabang allow', selesai?.biaya?.usd, 0.0011);
  }

  console.log(tebal('\nKasus 5 — tugas gagal terbit sebagai kegagalan, bukan diam'));
  {
    const r = await kirim('/perintah', { token: TOKEN, prompt: 'naskah:gagal', cwd: kerja, nama: 'rusak' });
    const sesi = r.d?.sesi || '';
    const selesai = await tap.tunggu((e) => e.kind === 'tugas-selesai' && e.session === sesi);
    benar('tugas-selesai terbit', Boolean(selesai), '');
    sama('  ok:false', selesai?.ok, false);
    benar('  labelnya menyebut kode keluarnya', /kode 3/.test(selesai?.label || ''), selesai?.label);
    benar('  dan tidak ada biaya yang dikarang', selesai?.biaya === undefined, JSON.stringify(selesai?.biaya));
  }

  console.log(tebal('\nKasus 6 — kontrak argv dijaga pemerannya sendiri'));
  {
    /* Pemeran berhenti dengan kode 64 kalau flag yang dijanjikan
       `lahirkanTugas()` hilang atau berganti nama. Kalau itu terjadi, empat
       kasus di atas sudah merah duluan — jadi yang dibuktikan di sini cukup
       bahwa mekanisme penjaganya memang hidup, bukan komentar belaka. */
    const uji = spawn(process.execPath, [PEMERAN, '-p', 'naskah:stream'], {
      env: envTanpaJalurKeluar(process.env), stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    uji.stderr.setEncoding('utf8'); uji.stderr.on('data', (s) => { err += s; });
    const kode = await new Promise((res) => uji.on('close', res));
    sama('argv tanpa --session-id ditolak pemeran', kode, 64);
    benar('  dan sebabnya disebut', /flag hilang/.test(err), err.slice(0, 120));
  }

  if (TAMPIL) {
    console.log(abu('\n--- seluruh event yang tertangkap ---'));
    for (const e of tap.ev) console.log(abu('  ' + e.kind + ' ' + (e.session || '') + ' ' + (e.tool || '') + ' ' + (e.label || '')));
  }

  tap.tutup();
  tutupKantor();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* biar OS yang bersihkan */ }
}

jalan().then(() => {
  tutupKantor();
  console.log();
  if (gagal) { console.log(merah(tebal('GAGAL ' + gagal + ' dari ' + periksa + ' pemeriksaan'))); process.exit(1); }
  console.log(hijau(tebal('LULUS ' + periksa + ' pemeriksaan')));
}).catch((err) => {
  if (kantor) console.error(abu('\n--- konsol kantor ---\n' + kantor.log.slice(-1500)));
  tutupKantor();
  console.error(merah('\nuji-kendali meledak: ' + (err && err.stack || err)));
  process.exit(1);
});
