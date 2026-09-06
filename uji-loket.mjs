#!/usr/bin/env node
/* uji-loket.mjs :: loket disposisi — antrean, pembatalan, penghentian, dan
 * tugas yang tidak pernah mulai.
 *
 * `uji-kendali.mjs` menjaga jalur BAHAGIA loop kendali. Berkas ini menjaga
 * sisanya: apa yang terjadi waktu slotnya habis, waktu kamu menarik kembali
 * disposisi yang belum dilahirkan, waktu kamu menghentikan yang sedang jalan,
 * dan waktu sebuah tugas lahir tapi tidak pernah bersuara.
 *
 * Semuanya memakai pemeran `claude-palsu.mjs` lewat seam `CLAUDE_SKRIP` —
 * tidak ada biner claude sungguhan yang pernah dipanggil, dan PATH proses
 * server dikosongkan supaya `cariClaude()` mustahil menemukannya.
 *
 * ---------------------------------------------------------------------------
 * Yang dijaga:
 *
 *   1. Antrean: POST ke-5 waktu keempat slot terpakai dijawab 202 (bukan
 *      ditolak, bukan dipaksa lahir), dengan posisi yang benar, dan event
 *      `antre` terbit supaya halaman ikut tahu.
 *   2. `sifat: 'SEGERA'` menyalip yang BIASA, tapi TIDAK menyalip sesama
 *      SEGERA — antrean prioritas yang tidak stabil bikin urutannya bergantung
 *      pada keberuntungan.
 *   3. Batal antre lewat DUA bentuk (`DELETE /perintah/antre/<id>` dan
 *      `POST /perintah/batal`), dan yang sudah tidak ada dijawab 404 — bukan
 *      200 yang berbohong.
 *   4. Loket penuh: `ANTRE_MAKS` tugas antre lalu yang berikutnya 429, dengan
 *      alasan yang menyebut angkanya.
 *   5. `POST /perintah/hentikan` benar-benar membunuh anaknya: `tugas-selesai`
 *      ok:false terbit, DAN slot yang kosong itu langsung dipakai yang paling
 *      depan di loket. Slot yang bocor berarti kantor macet pelan-pelan.
 *   6. Gerbang penghentian sama ketatnya dengan gerbang pelahiran: token dan
 *      Origin. Kalau tidak, siapa pun yang bisa membuka halaman bisa membunuh
 *      sesi orang.
 *   7. **`tugas-bisu` membedakan "tidak ada hook" dari "tidak ada apa-apa".**
 *      Sesi yang bicara stream-json tanpa hook itu WAJAR (mode --bare); yang
 *      tidak mengirim satu byte pun memang tidak pernah mulai. Komentar di
 *      server.mjs menulis bahwa dulu keduanya dilaporkan sama dan sesi sehat
 *      ikut kena tuduhan yang salah — kasus ini penjaga tertulisnya.
 *
 * ONGKOS WAKTU, dikatakan apa adanya. Kasus 7 butuh `BISU_MS` (25 detik)
 * benar-benar lewat. Tugas bisunya dilahirkan paling awal supaya kasus lain
 * berjalan selama ia menunggu — tapi kasus 0-6 semuanya panggilan HTTP lokal
 * dan selesai di bawah satu detik, jadi yang ditumpangi cuma sepersekian dari
 * 25 detik itu. Terus terang: berkas ini menambah ~26 detik ke `npm test`,
 * dan hampir semuanya menunggu.
 *
 * Itu diterima dengan sengaja. Menghapusnya berarti satu-satunya laporan
 * "sesimu tidak pernah mulai" tidak punya penjaga; mempercepatnya berarti
 * menambah env `AGENT_ROOM_BISU_MS` di kode produksi yang cuma ada untuk uji.
 * Kalau suatu hari ongkosnya terasa mahal, knob itu tiga baris — tapi itu
 * keputusan pemilik repo, bukan keputusan berkas uji.
 *
 * Pakai:
 *   node uji-loket.mjs
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
  AGENT_ROOM_ISI: 'off',
});

let kantor = null;

async function bukaKantor(dir) {
  const port = await portBebas(4910);
  const env = envTanpaJalurKeluar(process.env, {
    AGENT_ROOM_PORT: String(port), AGENT_ROOM_HOST: '127.0.0.1',
    AGENT_ROOM_CLAUDE: PEMERAN,
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

const ambil = async (jalur, opsi = {}) => {
  const r = await fetch(kantor.alamat + jalur, {
    ...opsi, headers: { origin: kantor.alamat, ...(opsi.headers || {}) },
  });
  const teks = await r.text();
  let d = null; try { d = JSON.parse(teks); } catch { /* bukan JSON */ }
  return { status: r.status, d, teks };
};
const kirim = (jalur, badan, header = {}) => ambil(jalur, {
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

async function jalan() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-loket-'));
  const kerja = path.join(dir, 'kerja');
  fs.mkdirSync(kerja, { recursive: true });

  const k = await bukaKantor(dir);
  const tap = sadap(k.port);
  await tap.siap;
  await tidur(150);

  const kd0 = await ambil('/kendali');
  const TOKEN = kd0.d?.token || '';
  const MAKS_JALAN = kd0.d?.maksJalan;
  const ANTRE_MAKS = kd0.d?.antreMaks;
  const suruh = (nama, naskah, tambahan = {}) =>
    kirim('/perintah', { token: TOKEN, prompt: 'naskah:' + naskah, cwd: kerja, nama, ...tambahan });

  console.log(tebal('\nKasus 0 — batasnya dibaca dari kantor, bukan ditulis ulang di sini'));
  benar('/kendali menyebut batas slot & antrean', Number.isFinite(MAKS_JALAN) && Number.isFinite(ANTRE_MAKS),
    JSON.stringify({ MAKS_JALAN, ANTRE_MAKS }));
  catatan('MAKS_JALAN=' + MAKS_JALAN + ', ANTRE_MAKS=' + ANTRE_MAKS
    + ' — angka yang dipakai seluruh berkas ini datang dari server, jadi mengubah konstantanya tidak bikin uji ini bohong');

  /* ---- Tugas bisu dilahirkan PALING AWAL supaya 25 detiknya berjalan di
     latar sementara kasus lain dikerjakan. Ditagih di kasus terakhir. ---- */
  const bisu = await suruh('bisu', 'bisu');
  const sesiBisu = bisu.d?.sesi || '';
  const mulaiBisu = Date.now();

  console.log(tebal('\nKasus 1 — slot habis: yang berikutnya ANTRE, bukan ditolak'));
  const pegang = [];
  for (let i = 0; i < MAKS_JALAN - 1; i++) {
    const r = await suruh('pegang-' + i, 'tahan');
    sama('  tugas pemegang slot ke-' + (i + 1) + ' lahir', r.status, 200);
    pegang.push(r.d?.sesi || '');
  }
  {
    const r = await suruh('antre-1', 'tahan');
    sama('POST ke-' + (MAKS_JALAN + 1) + ' dijawab 202, bukan ditolak', r.status, 202);
    sama('  ditandai antre', r.d?.antre, true);
    sama('  posisinya 1', r.d?.posisi, 1);
    benar('  membawa id yang bisa dipakai membatalkan', /^[0-9a-f]{12}$/.test(r.d?.id || ''), JSON.stringify(r.d?.id));
    const ev = await tap.tunggu((e) => e.kind === 'antre' && e.aksi === 'masuk');
    benar('  event antre terbit supaya halaman ikut tahu', Boolean(ev), '');
    sama('    namanya benar', ev?.tugas?.nama, 'antre-1');
  }

  console.log(tebal('\nKasus 2 — SEGERA menyalip BIASA, tapi tidak menyalip sesama SEGERA'));
  let idSegera1 = '';
  {
    const a = await suruh('antre-2', 'tahan');
    sama('  antre-2 masuk di belakang', a.d?.posisi, 2);
    const s1 = await suruh('segera-1', 'tahan', { sifat: 'SEGERA' });
    idSegera1 = s1.d?.id || '';
    sama('SEGERA pertama menyalip ke posisi 1', s1.d?.posisi, 1);
    const s2 = await suruh('segera-2', 'tahan', { sifat: 'SEGERA' });
    sama('  SEGERA kedua di belakang SEGERA pertama, bukan menyalipnya', s2.d?.posisi, 2);
    const kd = await ambil('/kendali');
    const urut = (kd.d?.antrean || []).map((x) => x.nama);
    sama('  urutan loket', JSON.stringify(urut), JSON.stringify(['segera-1', 'segera-2', 'antre-1', 'antre-2']));
    const sifat = (kd.d?.antrean || []).map((x) => x.sifat);
    sama('  sifatnya ikut terbaca', JSON.stringify(sifat), JSON.stringify(['SEGERA', 'SEGERA', 'BIASA', 'BIASA']));
    benar('  prompt TIDAK ikut ke /kendali', !JSON.stringify(kd.d?.antrean).includes('naskah:'),
      JSON.stringify(kd.d?.antrean).slice(0, 120));
  }

  console.log(tebal('\nKasus 3 — batal antre: dua bentuk, dan yang tidak ada dijawab 404'));
  {
    const hapus = await ambil('/perintah/antre/' + idSegera1 + '?token=' + TOKEN, { method: 'DELETE' });
    sama('DELETE /perintah/antre/<id> menghapusnya', hapus.status, 200);
    const lagi = await ambil('/perintah/antre/' + idSegera1 + '?token=' + TOKEN, { method: 'DELETE' });
    sama('  membatalkan yang sama dua kali -> 404, bukan 200 yang berbohong', lagi.status, 404);
    const kd = await ambil('/kendali');
    const sisa = (kd.d?.antrean || []).map((x) => x.nama);
    sama('  loket menyusut', JSON.stringify(sisa), JSON.stringify(['segera-2', 'antre-1', 'antre-2']));
    const id2 = (kd.d?.antrean || []).find((x) => x.nama === 'antre-2')?.id;
    const batal = await kirim('/perintah/batal', { token: TOKEN, id: id2 });
    sama('POST /perintah/batal juga bisa', batal.status, 200);
    const salah = await kirim('/perintah/batal', { token: 'karangan', id: id2 });
    sama('  token karangan ditolak 403', salah.status, 403);
    const ev = await tap.tunggu((e) => e.kind === 'antre' && e.aksi === 'batal');
    benar('  event batal terbit', Boolean(ev), '');
  }

  console.log(tebal('\nKasus 4 — loket penuh: 429 dengan alasan yang menyebut angkanya'));
  {
    const kd = await ambil('/kendali');
    const kini = (kd.d?.antrean || []).length;
    for (let i = kini; i < ANTRE_MAKS; i++) {
      const r = await suruh('isi-' + i, 'gagal');
      sama('  antrean ke-' + (i + 1) + ' masih diterima', r.status, 202);
    }
    const penuh = await suruh('kelebihan', 'gagal');
    sama('yang melewati batas ditolak 429', penuh.status, 429);
    benar('  alasannya menyebut angka batasnya', String(penuh.d?.pesan || '').includes(String(ANTRE_MAKS)),
      penuh.d?.pesan);
    const kd2 = await ambil('/kendali');
    sama('  dan loketnya memang persis sebanyak batasnya', (kd2.d?.antrean || []).length, ANTRE_MAKS);
  }

  console.log(tebal('\nKasus 5 — hentikan: anaknya mati, dan slot kosong langsung dipakai'));
  {
    // Loket dikosongkan dulu, disisakan SATU yang identitasnya diketahui —
    // supaya "yang lahir sesudah slot kosong" tidak bisa salah orang.
    const kd = await ambil('/kendali');
    for (const t of (kd.d?.antrean || [])) {
      await ambil('/perintah/antre/' + t.id + '?token=' + TOKEN, { method: 'DELETE' });
    }
    const penerus = await suruh('penerus', 'tahan');
    sama('  satu tugas menunggu di loket', penerus.d?.posisi, 1);

    const korban = pegang[0];
    const r = await kirim('/perintah/hentikan', { token: TOKEN, sesi: korban });
    sama('POST /perintah/hentikan diterima', r.status, 200);
    sama('  satu anak kena', r.d?.kena, 1);
    const selesai = await tap.tunggu((e) => e.kind === 'tugas-selesai' && e.session === korban);
    benar('tugas-selesai terbit untuk yang dihentikan', Boolean(selesai), '');
    sama('  ok:false', selesai?.ok, false);
    const lahir = await tap.tunggu((e) => e.kind === 'antre' && e.aksi === 'lahir' && e.tugas?.nama === 'penerus');
    benar('slot yang kosong LANGSUNG dipakai yang paling depan di loket', Boolean(lahir), '');
    const kd2 = await ambil('/kendali');
    sama('  loket kembali kosong', (kd2.d?.antrean || []).length, 0);
    benar('  dan slotnya kembali penuh', (kd2.d?.berjalan || []).length === MAKS_JALAN,
      String((kd2.d?.berjalan || []).length));
  }

  console.log(tebal('\nKasus 6 — gerbang penghentian seketat gerbang pelahiran'));
  {
    const salah = await kirim('/perintah/hentikan', { token: 'karangan', sesi: pegang[1] });
    sama('token karangan ditolak 403', salah.status, 403);
    const asing = await kirim('/perintah/hentikan', { token: TOKEN, sesi: pegang[1] },
      { origin: 'http://jahat.example' });
    sama('Origin asing ditolak 403', asing.status, 403);
    const kd = await ambil('/kendali');
    benar('  dan tidak ada yang ikut mati karenanya',
      (kd.d?.berjalan || []).some((x) => x.sesi === pegang[1]), JSON.stringify((kd.d?.berjalan || []).map((x) => x.sesi)));
    const hantu = await kirim('/perintah/hentikan', { token: TOKEN, sesi: 'sesi-karangan' });
    sama('menghentikan sesi yang tidak ada: 200 tapi nol kena', hantu.d?.kena, 0);
  }

  console.log(tebal('\nKasus 7 — tugas-bisu: "tidak ada hook" bukan "tidak ada apa-apa"'));
  {
    const sisa = Math.max(0, 26000 - (Date.now() - mulaiBisu));
    if (sisa > 500) catatan('menunggu sisa ambang bisu ' + Math.round(sisa / 1000) + ' dtk (dimulai di awal berkas, bukan sekarang)');
    const ev = await tap.tunggu((e) => e.kind === 'tugas-bisu' && e.session === sesiBisu, sisa + BATAS_MS);
    benar('tugas-bisu terbit untuk yang tidak mengirim SATU BYTE pun', Boolean(ev), '');
    sama('  ok:false', ev?.ok, false);
    benar('  labelnya menyebut hook MAUPUN stream', /hook maupun stream/.test(ev?.label || ''), ev?.label);
    /* Sisi lain dari pemisahan itu, dan ini yang dulu salah: sesi yang bicara
       stream-json tanpa hook TIDAK boleh dituduh tidak pernah mulai. */
    const salahTuduh = tap.ev.filter((e) => e.kind === 'tugas-bisu' && e.session !== sesiBisu);
    sama('  sesi yang bicara stream-json TIDAK ikut dituduh', salahTuduh.length, 0);
    /* Baris konsolnya terbit dari timer yang jatuh tempo hampir BERSAMAAN
       dengan tugas-bisu di atas — tugas-tugas itu lahir dalam rentang
       milidetik yang sama. Ditunggu, bukan dibaca sekali lalu dianggap tidak
       ada: uji yang menang-kalah karena urutan dua timer bukan uji. */
    const adaLog = await (async () => {
      const batas = Date.now() + 10000;
      while (Date.now() < batas) {
        if (/jalan tanpa hook/.test(k.log)) return true;
        await tidur(100);
      }
      return false;
    })();
    benar('  dan kantor mengatakan bedanya di konsol', adaLog,
      k.log.split('\n').filter((l) => /tanpa hook|belum mengirim/.test(l)).join(' | ').slice(0, 200));
  }

  /* Naskah `bisu` dan `tahan` memang tidak pernah keluar sendiri. Di mesin ini
     mereka ikut mati waktu servernya dibunuh, tapi itu perilaku Windows yang
     tidak dijanjikan siapa pun — di runner lain bisa jadi tertinggal sebagai
     proses yatim yang menetap selamanya. Jadi ditutup EKSPLISIT lewat rute
     yang barusan diuji sendiri, bukan diserahkan pada keberuntungan. */
  const sisa = await ambil('/kendali');
  for (const j of (sisa.d?.berjalan || [])) {
    await kirim('/perintah/hentikan', { token: TOKEN, sesi: j.sesi });
  }
  /* `kill()` cuma mengirim sinyal; rekamannya dicabut waktu event `close`
     anaknya tiba. Jadi ditunggu benar-benar kosong, bukan dibaca sekali. */
  let tersisa = -1;
  for (const batas = Date.now() + 15000; Date.now() < batas;) {
    const kd = await ambil('/kendali');
    tersisa = (kd.d?.berjalan || []).length;
    if (tersisa === 0) break;
    await tidur(150);
  }
  sama('bersih-bersih: nol tugas tersisa waktu harness pulang', tersisa, 0);

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
  console.error(merah('\nuji-loket meledak: ' + (err && err.stack || err)));
  process.exit(1);
});
