#!/usr/bin/env node
/* uji-kuota.mjs :: kuota loket per proyek — dan loop yang tidak boleh membeku.
 *
 * `MAKS_JALAN` menjaga MESIN: empat proses bersamaan, titik. Yang tidak
 * dijaganya: satu proyek boleh memakai keempatnya sekaligus, dan tugas proyek
 * lain menunggu di belakangnya tanpa pernah dapat giliran. `loket.json`
 * menambahkan batas per folder proyek, dan `lahirkanAntrean()` berhenti
 * memanggil kepala-baris.
 *
 * ---------------------------------------------------------------------------
 * YANG SENGAJA TIDAK ADA DI SINI, dan itu keputusan, bukan kelupaan:
 * **tidak ada gerbang jam.** Usulan aslinya memuat `jamBuka`/`jamTutup`/
 * `hariKerja` — ditolak dengan dua alasan yang dua-duanya bisa diperiksa:
 *
 *   1. `babakHari()` di public/room.js SUDAH mendefinisikan jam kantor,
 *      lengkap dengan LIBUR_NASIONAL dan HARI_KEJEPIT yang server tidak tahu.
 *      Definisi kedua di sisi server tidak akan pernah sama jawabannya.
 *   2. docs/01-jalanin.md menulis lurus-lurus soal pagu: "tidak pernah menahan
 *      pegawai, MENAHAN ANTREAN, atau mengubah state siapa pun". Menahan
 *      antrean karena angka di jam dinding persis melakukan yang ketiga.
 *
 * Kuota per proyek beda kelas: ia batas MESIN atas anak yang kantor ini
 * lahirkan sendiri, sekelas `MAKS_JALAN` yang sudah lama ada. Kasus 1 di bawah
 * menagih bahwa tidak ada satu pun medan berbau jam yang menyelinap masuk.
 *
 * ---------------------------------------------------------------------------
 * Yang dijaga:
 *
 *   1. Aturan terbaca, dan `/kendali` TIDAK menyebut jam apa pun.
 *   2. Kuota penuh -> tugasnya ANTRE dengan sebab, bukan ditolak, dan proyek
 *      LAIN tetap lahir walau ia menunggu di depan. Itu inti masalahnya:
 *      dengan `shift()` yang lama, satu proyek yang berhenti menyumbat semua.
 *   3. Batas antre per proyek -> 429 yang menyebut nama proyeknya.
 *   4. **Loop pemilih KELUAR waktu tidak ada kandidat yang lolos.** Ini kasus
 *      terpenting di berkas ini. `lahirkanAntrean()` dulu `while (…) {
 *      antrean.shift() … }` — selalu maju karena shift() selalu mengambil
 *      sesuatu. Begitu shift() diganti pemilih yang boleh TIDAK menemukan
 *      kandidat, `while` tanpa jalan keluar tidak pernah maju: yang terjadi
 *      bukan tugas tertunda, tapi SERVERNYA MEMBEKU.
 *   5. Nomor antre dicabut dari halaman. Pemilih non-kepala-baris membuat
 *      "antre #1" jadi janji yang tidak bisa ditepati — yang di depan bisa
 *      duduk diam sementara yang di belakang lahir.
 *   6. Berkas yang ADA tapi tidak memberi batas kepada siapa pun BERSUARA.
 *      Diam di situ menipu: orang menulis berkas, mengira ia berlaku, dan
 *      tidak ada yang berubah. Yang berlapis itu berkas yang TIDAK ADA.
 *   7. Tanpa berkasnya: FIFO persis seperti sebelum fitur ini ada, nol medan
 *      `tunda`, nol baris konsol.
 *
 * Memakai pemeran `claude-palsu.mjs`; tidak ada biner claude sungguhan yang
 * dipanggil, dan PATH proses server dikosongkan supaya `cariClaude()` mustahil
 * menemukannya.
 *
 * Pakai:
 *   node uji-kuota.mjs
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
  AGENT_ROOM_ISI: 'off',
});

const kantorHidup = [];

async function bukaKantor(dir, berkasLoket) {
  const port = await portBebas(4980);
  fs.mkdirSync(dir, { recursive: true });
  const env = envTanpaJalurKeluar(process.env, {
    AGENT_ROOM_PORT: String(port), AGENT_ROOM_HOST: '127.0.0.1',
    AGENT_ROOM_CLAUDE: PEMERAN,
    ...ENV_DATA(dir),
    // tanpa argumen: berkasnya diarahkan ke folder sandbox yang memang kosong
    ...(berkasLoket ? { AGENT_ROOM_LOKET: berkasLoket } : {}),
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
const kirim = (k, jalur, badan) => ambil(k, jalur, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(badan),
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

/* Bersih-bersih WAJIB: naskah `tahan` tidak pernah keluar sendiri. Di Windows
   ia ikut mati waktu servernya dibunuh, tapi itu tidak dijanjikan siapa pun. */
async function bersihkan(k, token) {
  /* Loketnya DIKOSONGKAN DULU, baru yang berjalan dihentikan. Urutan
     terbaliknya tidak pernah selesai: tiap tugas yang mati membebaskan slot,
     `lahirkanAntrean()` langsung melahirkan yang berikutnya, dan `berjalan`
     tidak pernah kosong sampai antreannya habis sendiri. */
  const awal = await ambil(k, '/kendali');
  for (const t of (awal.d?.antrean || [])) {
    await ambil(k, '/perintah/antre/' + t.id + '?token=' + token, { method: 'DELETE' });
  }
  const sisa = await ambil(k, '/kendali');
  for (const j of (sisa.d?.berjalan || [])) await kirim(k, '/perintah/hentikan', { token, sesi: j.sesi });
  for (const batas = Date.now() + 15000; Date.now() < batas;) {
    const kd = await ambil(k, '/kendali');
    if (!(kd.d?.berjalan || []).length && !(kd.d?.antrean || []).length) return 0;
    await tidur(150);
  }
  return -1;
}

async function jalan() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-kuota-'));
  const kA = path.join(dir, 'proyek-a'); fs.mkdirSync(kA, { recursive: true });
  const kB = path.join(dir, 'proyek-b'); fs.mkdirSync(kB, { recursive: true });
  const kC = path.join(dir, 'proyek-c'); fs.mkdirSync(kC, { recursive: true });

  const berkas = path.join(dir, 'loket.json');
  fs.writeFileSync(berkas, JSON.stringify({
    v: 1, maksJalanProyek: { 'proyek-a': 1, '*': 2 }, maksAntreProyek: 2,
  }, null, 2));

  const k = await bukaKantor(path.join(dir, 'kantor'), berkas);
  const tap = sadap(k.port);
  await tap.siap;
  await tidur(150);
  const kd0 = await ambil(k, '/kendali');
  const TOKEN = kd0.d?.token || '';
  const suruh = (nama, naskah, cwd) =>
    kirim(k, '/perintah', { token: TOKEN, prompt: 'naskah:' + naskah, cwd, nama, mode: 'default' });

  console.log(tebal('\nKasus 1 — aturan terbaca, dan tidak ada satu pun medan berbau JAM'));
  {
    benar('kantor mengaku kuota loket aktif', /kuota loket aktif/.test(k.log),
      k.log.split('\n').filter((l) => /loket/.test(l)).join(' | ').slice(0, 200));
    benar('  dan menyebut sendiri bahwa ini batas mesin tanpa gerbang jam',
      /tanpa gerbang jam/.test(k.log), '');
    sama('/kendali menyebut aturannya apa adanya', JSON.stringify(kd0.d?.loket?.aturan),
      JSON.stringify({ 'proyek-a': 1, '*': 2 }));
    sama('  berikut batas antre per proyek', kd0.d?.loket?.maksAntreProyek, 2);
    /* Pagar terhadap gerbang jam yang sengaja tidak dibangun: kalau suatu hari
       ada yang menambahkannya diam-diam, medannya akan muncul di sini. */
    benar('  dan TIDAK ada medan buka/tutup/jam sama sekali',
      !/buka|tutup|jam|hari/i.test(JSON.stringify(kd0.d?.loket)), JSON.stringify(kd0.d?.loket));
    /* Komentarnya dibuang dulu. server.mjs memang MENYEBUT jamBuka/jamTutup —
       justru untuk menerangkan kenapa keduanya tidak ada. Lint yang membaca
       komentar akan merah karena kalimat yang menjelaskan dirinya sendiri. */
    const kode = fs.readFileSync(SERVER, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    sama('  KODE server tidak punya jamBuka/jamTutup/hariKerja',
      /jamBuka|jamTutup|hariKerja/.test(kode), false);
    sama('  dan tidak ada penjadwal loket', /loketJadwal|loketBuka/.test(kode), false);
  }

  console.log(tebal('\nKasus 2 — proyek yang penuh kuota berhenti memblokir yang lain'));
  {
    const a1 = await suruh('a-satu', 'tahan', kA);
    sama('proyek A tugas ke-1 lahir', a1.status, 200);
    const a2 = await suruh('a-dua', 'tahan', kA);
    sama('proyek A tugas ke-2 ANTRE, bukan ditolak', a2.status, 202);
    sama('  sebabnya kuota proyek, bukan slot mesin', a2.d?.sebab, 'kuota-proyek');
    /* Inti masalahnya. Dengan `shift()` yang lama, A#2 yang tidak bisa lahir
       akan menyumbat B di belakangnya untuk selamanya. */
    const b1 = await suruh('b-satu', 'tahan', kB);
    sama('proyek B tetap LAHIR walau A menunggu di depannya', b1.status, 200);

    const kd = await ambil(k, '/kendali');
    const antre = kd.d?.antrean || [];
    sama('  loket berisi satu tugas', antre.length, 1);
    sama('    yang membawa sebab tundanya', antre[0]?.tunda, 'kuota-proyek');
    const r = await ambil(k, '/ruangan');
    sama('  /ruangan ikut menghitung yang tertahan kuota', r.d?.antrean?.tunda, 1);
    const m = await ambil(k, '/metrics');
    benar('  /metrics memisahkan sebabnya',
      /agent_room_antrean_tunda\{sebab="kuota-proyek"\} 1/.test(m.teks),
      (m.teks.match(/agent_room_antrean_tunda.*/g) || []).join(' | '));
  }

  console.log(tebal('\nKasus 3 — batas antre per proyek: 429 yang menyebut proyeknya'));
  {
    const a3 = await suruh('a-tiga', 'tahan', kA);
    sama('antrean proyek A ke-2 masih diterima', a3.status, 202);
    const a4 = await suruh('a-empat', 'tahan', kA);
    sama('yang melewati batas antre proyek ditolak 429', a4.status, 429);
    benar('  pesannya menyebut nama proyeknya', /proyek-a/.test(a4.d?.pesan || ''), a4.d?.pesan);
    benar('  berikut angkanya', /2 tugas antre/.test(a4.d?.pesan || ''), a4.d?.pesan);
    const b2 = await suruh('b-dua', 'tahan', kB);
    sama('  tapi proyek LAIN masih boleh menyetor', b2.status, 200);
  }

  console.log(tebal('\nKasus 4 — pemilih KELUAR waktu nol kandidat lolos, bukan membeku'));
  {
    /* Keadaannya dirakit persis: proyek A penuh kuota (1/1) dengan antrean
       yang isinya HANYA proyek A, lalu satu tugas proyek lain dibiarkan
       SELESAI supaya `lahirkanAntrean()` benar-benar dipanggil dengan
       `jalan.size < MAKS_JALAN` DAN nol kandidat yang lolos. Kalau loopnya
       tidak punya `break`, server berhenti menjawab di sini. */
    const kd = await ambil(k, '/kendali');
    const antreA = (kd.d?.antrean || []).filter((t) => t.cwd === 'proyek-a').length;
    benar('loket berisi tugas proyek A yang belum bisa lahir', antreA >= 1, String(antreA));
    /* Proyek KETIGA, bukan B: B sudah memakai jatah bawaan '*' = 2, jadi
       pemicunya sendiri akan ikut antre dan tidak pernah memicu apa pun. */
    const pemicu = await suruh('pemicu', 'gagal', kC);
    sama('  satu tugas proyek lain dilahirkan sebagai pemicu', pemicu.status, 200);
    const selesai = await tap.tunggu((e) => e.kind === 'tugas-selesai' && e.session === pemicu.d?.sesi);
    benar('  pemicunya selesai — pemilih dipanggil dengan nol kandidat', Boolean(selesai), '');
    /* Buktinya server MASIH MENJAWAB. Kalau loopnya membeku, `tunggu` di atas
       sudah merah lebih dulu dan permintaan ini tidak akan pernah dijawab. */
    const sehat = await ambil(k, '/health');
    sama('server masih menjawab /health sesudahnya', sehat.status, 200);
    const kd2 = await ambil(k, '/kendali');
    benar('  dan loketnya utuh, tidak dikosongkan paksa',
      (kd2.d?.antrean || []).length >= 1, String((kd2.d?.antrean || []).length));
  }

  console.log(tebal('\nKasus 5 — antrean maju sendiri begitu kuota proyeknya longgar'));
  {
    const kd = await ambil(k, '/kendali');
    // `berjalan` membawa cwd PENUH (rute ini juga mengirim cwdBawaan);
    // `antrean` lewat ringkasAntre() membawa basename. Dua bentuk, satu rute.
    const a1 = (kd.d?.berjalan || []).find((j) => path.basename(j.cwd || '') === 'proyek-a');
    benar('proyek A memang sedang memakai jatahnya', Boolean(a1),
      JSON.stringify((kd.d?.berjalan || []).map((j) => path.basename(j.cwd || ''))));
    await kirim(k, '/perintah/hentikan', { token: TOKEN, sesi: a1.sesi });
    const lahir = await tap.tunggu((e) => e.kind === 'antre' && e.aksi === 'lahir'
      && e.tugas?.cwd === 'proyek-a');
    benar('begitu jatahnya kosong, tugas A yang antre LAHIR sendiri', Boolean(lahir),
      'tidak ada event antre/lahir untuk proyek-a');
  }

  console.log(tebal('\nKasus 6 — nomor antre dicabut dari halaman'));
  {
    /* Pemilih non-kepala-baris membuat "antre #1" jadi janji yang tidak bisa
       ditepati. Dijaga di SUMBER karena renderAntrean() kode DOM yang tidak
       dijalankan harness ini; `\r?\n` supaya polanya tetap cocok di checkout
       Windows yang ber-CRLF. */
    const src = fs.readFileSync(path.join(__dirname, 'public', 'room.js'), 'utf8');
    const blok = /function renderAntrean\(\)[\s\S]*?\r?\n\}\r?\n/.exec(src);
    benar('blok renderAntrean() ketemu untuk diperiksa', Boolean(blok), '');
    if (blok) {
      /* Komentar dibuang dulu — komentar di fungsi itu MENYEBUT "antre #1"
         justru untuk menerangkan kenapa ia dicabut. Lint yang membaca komentar
         merah karena kalimat yang menjelaskan dirinya sendiri; ini jebakan
         yang sama dengan lint jam di kasus 1, dan dua-duanya sudah menggigit. */
      const kodeBlok = blok[0]
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
      sama('  tidak lagi menjanjikan nomor antre', /antre #/.test(kodeBlok), false);
      benar('  menampilkan SEBABnya', /kuota proyek penuh/.test(kodeBlok), '');
      benar('  dan titelnya mengatakan urutan bukan janji', /bukan janji/.test(kodeBlok),
        kodeBlok.slice(0, 240));
    }
    sama('kadis juga tidak lagi menulis nomor urut', /<\/b><span>#/.test(src), false);
  }

  const sisa = await bersihkan(k, TOKEN);
  sama('bersih-bersih kantor pertama', sisa, 0);
  tap.tutup();

  console.log(tebal('\nKasus 7 — berkas yang tidak memberi batas apa pun BERSUARA'));
  {
    const kosong = path.join(dir, 'loket-kosong.json');
    fs.writeFileSync(kosong, JSON.stringify({ v: 1, maksJalanProyek: {} }));
    const k2 = await bukaKantor(path.join(dir, 'kosong'), kosong);
    benar('kantor menyebut berkasnya tidak memberi kuota kepada siapa pun',
      /tidak memberi kuota kepada siapa pun/.test(k2.log),
      k2.log.split('\n').filter((l) => /loket/.test(l)).join(' | ').slice(0, 200));
    const kd = await ambil(k2, '/kendali');
    sama('  dan kuotanya mati, bukan setengah jalan', kd.d?.loket?.aktif, false);

    const rusak = path.join(dir, 'loket-rusak.json');
    fs.writeFileSync(rusak, '{ bukan json');
    const k3 = await bukaKantor(path.join(dir, 'rusak'), rusak);
    const h = await ambil(k3, '/health');
    sama('berkas rusak: /health tetap 200', h.status, 200);
    sama('  tepat satu peringatan',
      k3.log.split('\n').filter((l) => /\[agent-room\] loket:/.test(l)).length, 1);

    const angkaNgawur = path.join(dir, 'loket-ngawur.json');
    fs.writeFileSync(angkaNgawur, JSON.stringify({ v: 1, maksJalanProyek: { 'p-x': 0, 'p-y': 99, 'p-z': 2 } }));
    const k4 = await bukaKantor(path.join(dir, 'ngawur'), angkaNgawur);
    benar('kuota di luar 1–MAKS_JALAN dilewati dengan sebabnya',
      /bukan bilangan 1/.test(k4.log), k4.log.split('\n').filter((l) => /loket/.test(l)).join(' | ').slice(0, 200));
    const kd4 = await ambil(k4, '/kendali');
    sama('  dan yang masuk akal tetap berlaku', JSON.stringify(kd4.d?.loket?.aturan), JSON.stringify({ 'p-z': 2 }));
  }

  console.log(tebal('\nKasus 8 — tanpa loket.json: persis seperti sebelum fitur ini ada'));
  {
    const k5 = await bukaKantor(path.join(dir, 'polos'), null);
    const kd = await ambil(k5, '/kendali');
    const TOK = kd.d?.token || '';
    sama('/kendali mengaku kuota tidak aktif', kd.d?.loket?.aktif, false);
    sama('  dan tidak menyebut satu aturan pun', Object.keys(kd.d?.loket?.aturan || {}).length, 0);
    sama('  nol baris konsol menyebut loket', k5.log.split('\n').filter((l) => /loket:/.test(l)).length, 0);

    /* Empat tugas satu proyek — dengan kuota, ini akan tertahan; tanpa berkas,
       keempatnya lahir sampai MAKS_JALAN seperti dulu. */
    const kerja = path.join(dir, 'proyek-a');
    const hasil = [];
    for (let i = 0; i < 4; i++) {
      hasil.push((await kirim(k5, '/perintah', {
        token: TOK, prompt: 'naskah:tahan', cwd: kerja, nama: 'polos-' + i, mode: 'default',
      })).status);
    }
    sama('empat tugas SATU proyek semuanya lahir', JSON.stringify(hasil), JSON.stringify([200, 200, 200, 200]));
    const ke5 = await kirim(k5, '/perintah', {
      token: TOK, prompt: 'naskah:tahan', cwd: kerja, nama: 'polos-5', mode: 'default',
    });
    sama('  yang kelima antre karena MESINnya penuh', ke5.status, 202);
    sama('    dan sebabnya slot-penuh, bukan kuota', ke5.d?.sebab, 'slot-penuh');
    const kd2 = await ambil(k5, '/kendali');
    sama('    tanpa medan tunda yang terisi', (kd2.d?.antrean || [])[0]?.tunda, '');
    sama('bersih-bersih kantor polos', await bersihkan(k5, TOK), 0);
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
  console.error(merah('\nuji-kuota meledak: ' + (err && err.stack || err)));
  process.exit(1);
});
