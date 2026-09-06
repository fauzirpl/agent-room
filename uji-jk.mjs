#!/usr/bin/env node
// uji-jk.mjs :: jenis kelamin pegawai — tebakan nama di server, timpaan yang
// bertahan di berkas, dan aturan kepala di sprite.
//
// Kelas bugnya begini. Aksesori kepala dulu murni milik JABATAN: auditor,
// arsiparis, dan humas ber-`head: 'jilbab'`, sandiman dan kadis berpeci,
// pranata madya berkumis. Nama pegawai datang dari daftar terpisah dan
// diundi ke kursi, jadi "Budi Santoso" bisa mendarat di kursi auditor dan
// digambar berjilbab — dan "Sri Rahayu" di kursi pranata madya, berkumis.
//
// Yang dijaga berkas ini ada tiga lapis, karena ketiganya bisa rusak sendiri-
// sendiri:
//   1. TEBAKAN. Ke-32 nama bawaan harus tertebak semua. Kalau tidak, fitur ini
//      tidak menyelesaikan apa pun di pemasangan baru — dan justru pemasangan
//      baru yang paling sering dilihat orang.
//   2. TIMPAAN. Yang diketik manusia harus menang atas tebakan, bertahan di
//      nama.json, dan hidup lagi sesudah server dijalankan ulang.
//   3. GAMBAR. Laki-laki tidak pernah berjilbab, perempuan tidak pernah
//      berkumis, dan yang jenis kelaminnya TIDAK diketahui harus digambar
//      persis seperti sebelum fitur ini ada — piksel per piksel. Lapis ketiga
//      itu yang menjaga tamu event, peserta rapat, dan golden uji lama.
//
// Lapis 1-2 memakai server sungguhan di folder sementara (pola uji-pegawai);
// lapis 3 memutar ulang fillRect drawPerson() ke bingkai piksel (pola
// uji-seragam) dan menghitung warna yang benar-benar bertahan di layar.
//
// Pakai:
//   node uji-jk.mjs              jalankan semua kasus
//   node uji-jk.mjs --tampil     cetak juga peta tebakan nama bawaan

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  muatKonteks, buatSatuOrang, merah, hijau, kuning, abu, tebal,
} from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAMPIL = process.argv.includes('--tampil');

/* -------------------------------------------------------------- pelapor --- */
let lulus = 0, gagal = 0;
const judul = (t) => console.log('\n' + tebal(t));
function ok(nama, syarat, ket) {
  if (syarat) { lulus++; console.log('  ' + hijau('✓') + ' ' + nama); }
  else { gagal++; console.log('  ' + merah('✗') + ' ' + nama); if (ket) console.log('      ' + kuning(ket)); }
}
const sama = (nama, dapat, harus) =>
  ok(nama + ' ' + abu('= ' + JSON.stringify(harus)), dapat === harus,
    'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harus));

/* ================================================== server di folder uji === */
const sandbox = [];
const anak = [];

function sandboxBaru() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-uji-jk-'));
  fs.mkdirSync(path.join(dir, 'proyek-uji'), { recursive: true });
  sandbox.push(dir);
  return dir;
}

/* Semua env berkas data diarahkan ke sandbox. Daftarnya sengaja lengkap dan
   bukan seperlunya: server uji yang satu env-nya kelupaan akan menulis berkas
   data SUNGGUHAN ke dalam folder repo. Alasan panjangnya ada di lintEnv()
   milik uji-pagu.mjs. */
const ENV_DATA = (dir) => ({
  AGENT_ROOM_NAMA: path.join(dir, 'nama.json'),
  AGENT_ROOM_FORMASI: path.join(dir, 'formasi.json'),
  AGENT_ROOM_PAGU: path.join(dir, 'pagu.json'),
  AGENT_ROOM_TOKEN_LOG: path.join(dir, 'token-riwayat.jsonl'),
  AGENT_ROOM_KLIPING_LOG: path.join(dir, 'kliping-mingguan.jsonl'),
  AGENT_ROOM_AGENDA_DIR: path.join(dir, 'agenda'),
  AGENT_ROOM_BUKU_INDUK: path.join(dir, 'buku-induk.json'),
  AGENT_ROOM_TUNDA_DIR: path.join(dir, 'tunda'),
  AGENT_ROOM_SUARA: path.join(dir, 'suara.json'),
  AGENT_ROOM_SUARA_KUNCI: path.join(dir, '.agent-room-suara-kunci'),
  AGENT_ROOM_SUARA_DIR: path.join(dir, 'suara'),
});

let portBerikut = 4620;
async function buka(dir) {
  const port = portBerikut++;
  const anakProses = spawn(process.execPath, [path.join(__dirname, 'server.mjs')], {
    env: {
      ...process.env, ...ENV_DATA(dir),
      AGENT_ROOM_PORT: String(port),
      AGENT_ROOM_ISI: 'off', AGENT_ROOM_CUACA: 'off',
      /* Wajib dikosongkan, bukan sekadar tidak diisi: env pemanggil ikut
         diwariskan, jadi mesin yang kebetulan memasang AGENT_ROOM_LAPOR akan
         membuat `npm test` benar-benar mem-POST ke webhook sungguhan.
         Dijaga `uji-jaringan.mjs` kasus 4. */
      AGENT_ROOM_LAPOR: '', AGENT_ROOM_LAPOR_SELESAI: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  anakProses.stdout.resume();
  anakProses.stderr.resume();
  anak.push(anakProses);
  const alamat = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 100; i++) {
    try { await fetch(alamat + '/health'); return { alamat, proses: anakProses, dir }; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('server uji tidak pernah siap di ' + alamat);
}

function tutup(k) {
  try { k.proses.kill(); } catch { /* sudah mati */ }
  const i = anak.indexOf(k.proses);
  if (i >= 0) anak.splice(i, 1);
}

const H = (k) => ({ 'content-type': 'application/json', origin: k.alamat });
const ambil = async (k, jalur, opt) => (await fetch(k.alamat + jalur, {
  ...opt, headers: { origin: k.alamat, ...(opt && opt.headers) },
})).json();

async function hook(k, sesi, nama) {
  await fetch(k.alamat + '/event', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: 'SessionStart', session_id: sesi,
      cwd: path.join(k.dir, 'proyek-uji'), source: 'startup',
    }),
  }).then((r) => r.arrayBuffer());
  if (nama) {
    await ambil(k, '/nama', {
      method: 'POST', headers: H(k),
      body: JSON.stringify({ sesi: sesi.slice(0, 12), nama }),
    });
  }
  await new Promise((r) => setTimeout(r, 30));
}

const jkDi = async (k, nama) => {
  const d = await ambil(k, '/ruangan');
  const s = (d.sesi || []).find((x) => x.nama === nama);
  return s ? s.jk : '(sesinya tidak ada)';
};

/* ============================================ 1. tebakan dari nama bawaan == */
async function kasusTebakan() {
  judul('1. tebakan jenis kelamin dari daftar nama bawaan');
  const k = await buka(sandboxBaru());
  try {
    const d = await ambil(k, '/nama/daftar');
    const bawaan = d.bawaan || [];
    ok('daftar nama bawaan terbaca dari server ' + abu('(' + bawaan.length + ' nama)'),
      bawaan.length >= 30, 'cuma ' + bawaan.length + ' nama');

    /* Ditanyakan lewat sesi sungguhan, bukan lewat endpoint tebakan tersendiri:
       yang mau dijamin adalah jalur yang BENAR-BENAR dipakai halaman. */
    const hasil = [];
    for (let i = 0; i < bawaan.length; i++) {
      const sesi = 'tebak' + String(i).padStart(7, '0');
      await hook(k, sesi, bawaan[i]);
      hasil.push([bawaan[i], await jkDi(k, bawaan[i])]);
    }
    if (TAMPIL) for (const [n, jk] of hasil) console.log('      ' + abu(n.padEnd(24)) + (jk || '-'));

    const kosong = hasil.filter(([, jk]) => jk !== 'L' && jk !== 'P').map(([n]) => n);
    ok('SEMUA nama bawaan tertebak jenis kelaminnya',
      kosong.length === 0,
      'belum tertebak: ' + kosong.join(', ') + ' — tambahkan nama depannya ke JK_DEPAN_* di server.mjs');

    const l = hasil.filter(([, jk]) => jk === 'L').length;
    const p = hasil.filter(([, jk]) => jk === 'P').length;
    ok('tebakannya tidak berat sebelah ' + abu(l + ' L / ' + p + ' P'),
      l >= 5 && p >= 5, l + ' L, ' + p + ' P — satu sisi terlalu sedikit, tabelnya mungkin salah');

    /* Nama yang memang tidak ada di kamus harus jatuh ke '' — BUKAN ditebak
       asal. '' berarti "ikut jabatan", yaitu perilaku lama, dan itu jauh lebih
       aman daripada menebak salah setengah waktu. */
    await hook(k, 'asing000000a', 'Zorblax Ktulu');
    sama('nama yang tidak dikenal jatuh ke kosong, bukan ditebak asal',
      await jkDi(k, 'Zorblax Ktulu'), '');
  } finally { tutup(k); }
}

/* ================================================ 2. timpaan manual ======== */
async function kasusTimpaan() {
  judul('2. timpaan manual menang atas tebakan, dan bertahan di berkas');
  const dir = sandboxBaru();
  let k = await buka(dir);
  try {
    await hook(k, 'timpa000001a', 'Budi Santoso');
    sama('sebelum ditimpa, Budi tertebak L', await jkDi(k, 'Budi Santoso'), 'L');

    const r = await ambil(k, '/jk', {
      method: 'POST', headers: H(k), body: JSON.stringify({ nama: 'Budi Santoso', jk: 'P' }),
    });
    sama('POST /jk menjawab jk yang baru', r.jk, 'P');
    sama('POST /jk tetap melaporkan tebakan aslinya', r.tebakan, 'L');
    sama('timpaan menang atas tebakan', await jkDi(k, 'Budi Santoso'), 'P');

    const d = await ambil(k, '/nama/daftar');
    sama('/nama/daftar ikut membawa peta timpaan', (d.jk || {})['budi santoso'], 'P');

    const berkas = JSON.parse(fs.readFileSync(path.join(dir, 'nama.json'), 'utf8'));
    sama('nama.json naik ke v3', berkas.v, 3);
    sama('timpaan tertulis di nama.json', (berkas.jk || {})['budi santoso'], 'P');

    /* Yang paling gampang rusak: timpaan yang cuma hidup di memori. */
    tutup(k);
    k = await buka(dir);
    await hook(k, 'timpa000001a', 'Budi Santoso');
    sama('timpaan hidup lagi sesudah server dijalankan ulang',
      await jkDi(k, 'Budi Santoso'), 'P');

    await ambil(k, '/jk', {
      method: 'POST', headers: H(k), body: JSON.stringify({ nama: 'Budi Santoso', jk: '' }),
    });
    sama('kiriman kosong mencabut timpaan, kembali ke tebakan',
      await jkDi(k, 'Budi Santoso'), 'L');

    const kotor = await ambil(k, '/jk', {
      method: 'POST', headers: H(k), body: JSON.stringify({ nama: 'Budi Santoso', jk: 'banci-banciL' }),
    });
    sama('nilai yang bukan L/P diperlakukan sebagai pencabutan, bukan disimpan',
      kotor.jk, 'L');

    /* Timpaan menempel di NAMA, jadi sesi lain yang bernama sama ikut. Itu
       yang bikin "besok orangnya digambar sama" benar-benar berlaku. */
    await ambil(k, '/jk', {
      method: 'POST', headers: H(k), body: JSON.stringify({ nama: 'Budi Santoso', jk: 'P' }),
    });
    await hook(k, 'timpa000002b', 'Budi Santoso');
    sama('sesi lain dengan nama yang sama ikut kena timpaan',
      await jkDi(k, 'Budi Santoso'), 'P');

    /* Huruf besar-kecil dan spasi ganda tidak boleh bikin dua entri berbeda. */
    const beda = await ambil(k, '/jk', {
      method: 'POST', headers: H(k), body: JSON.stringify({ nama: '  budi   SANTOSO ', jk: 'L' }),
    });
    sama('kunci dinormalkan: spasi ganda & huruf besar menunjuk orang yang sama', beda.jk, 'L');
    const d2 = await ambil(k, '/nama/daftar');
    sama('tidak lahir entri kembar di peta', Object.keys(d2.jk || {}).length, 1);
  } finally { tutup(k); }
}

/* ============================================ 3. panel daftar nama ========= */
async function kasusPanel() {
  judul('3. panel daftar nama menyimpan peta timpaan');
  const dir = sandboxBaru();
  const k = await buka(dir);
  try {
    await ambil(k, '/nama/daftar', {
      method: 'POST', headers: H(k),
      body: JSON.stringify({
        penuh: [{ nama: 'Oji', peran: 'auditor' }, { nama: 'Nia', peran: '' }],
        jk: { oji: 'L', nia: 'P' },
      }),
    });
    const d = await ambil(k, '/nama/daftar');
    sama('peta dari panel tersimpan (Oji)', (d.jk || {}).oji, 'L');
    sama('peta dari panel tersimpan (Nia)', (d.jk || {}).nia, 'P');

    await hook(k, 'panel000001a', 'Oji');
    sama('nama yang tidak tertebak pun benar karena ditimpa panel',
      await jkDi(k, 'Oji'), 'L');

    /* Panel mengirim peta UTUH tiap simpan; menghilangkan entri = mencabut. */
    await ambil(k, '/nama/daftar', {
      method: 'POST', headers: H(k),
      body: JSON.stringify({ penuh: [{ nama: 'Oji', peran: 'auditor' }], jk: { nia: 'P' } }),
    });
    const d2 = await ambil(k, '/nama/daftar');
    sama('entri yang dihapus dari peta ikut tercabut', (d2.jk || {}).oji, undefined);

    /* Panel LAMA (tanpa kolom jk) tidak boleh menghapus timpaan yang sudah ada:
       kiriman tanpa field `jk` sama sekali berarti "jangan sentuh". */
    await ambil(k, '/nama/daftar', {
      method: 'POST', headers: H(k), body: JSON.stringify({ penuh: [{ nama: 'Nia', peran: '' }] }),
    });
    const d3 = await ambil(k, '/nama/daftar');
    sama('kiriman tanpa field jk tidak menghapus peta yang ada', (d3.jk || {}).nia, 'P');
  } finally { tutup(k); }
}

/* ================================================ 4. aturan kepala ========= */
/* Semua fillRect drawPerson() diputar ulang ke bingkai piksel: yang dihitung
   warna TERAKHIR di tiap petak, jadi jilbab yang ketiban lengan atau rambut
   yang ketiban peci memang hilang dari hitungan — persis seperti yang dilihat
   mata di layar. Polanya diambil dari uji-seragam.mjs, tidak diubah. */
function kasusGambar() {
  judul('4. aturan kepala di sprite (piksel yang benar-benar bertahan)');
  const ctx = muatKonteks();
  const H2 = ctx.__jembatan__;
  const cp = ctx.__ctxPalsu;
  const fillRectAsli = cp.fillRect;

  /* PECI dan KUMIS deklarasi `const` di room.js, jadi TIDAK ikut jadi properti
     context vm — `ctx.PECI` diam-diam undefined, dan hitungan warnanya jatuh
     ke nol tanpa pernah salah. Uji yang lulus karena pembandingnya kosong
     lebih berbahaya daripada uji yang gagal, jadi warnanya dibaca dari SUMBER
     room.js — pola yang sama dipakai uji-seragam.mjs untuk warna baju harian. */
  const SUMBER = fs.readFileSync(path.join(__dirname, 'public', 'room.js'), 'utf8');
  const dariSumber = (pola, nama) => {
    const m = SUMBER.match(pola);
    if (!m) throw new Error('tidak ketemu di room.js: ' + nama + ' — polanya sudah tidak cocok');
    return m[1];
  };
  const PECI_ISI = dariSumber(/const PECI = \{ isi: '(#[0-9a-fA-F]{6})'/, 'PECI.isi');
  const KUMIS = dariSumber(/const KUMIS = '(#[0-9a-fA-F]{6})'/, 'KUMIS');

  function petaPiksel(o) {
    const peta = new Map();
    cp.fillRect = function (x, y, w, h) {
      fillRectAsli.call(cp, x, y, w, h);
      const c = String(cp.fillStyle).toLowerCase();
      for (let j = 0; j < (h | 0); j++) {
        for (let i = 0; i < (w | 0); i++) peta.set(((x | 0) + i) + ',' + ((y | 0) + j), c);
      }
    };
    try { ctx.drawPerson(o); } finally { cp.fillRect = fillRectAsli; }
    return peta;
  }
  const hitung = (peta, warna) =>
    [...peta.values()].filter((c) => c === String(warna).toLowerCase()).length;

  /* Satu orang, satu jabatan, satu jenis kelamin — selebihnya identik, supaya
     bedanya cuma bisa datang dari aturan kepala. */
  function orang(peran, jk) {
    const o = buatSatuOrang(ctx, 'nganggur');
    o.phase = 0; o.x = 200; o.y = 260; o.face = 'down';
    o.setPeran ? o.setPeran(peran) : (o.peran = peran, o.pal = H2.jabatanDari(peran).pal);
    o.jk = jk;
    return o;
  }

  const palAuditor = H2.jabatanDari('auditor').pal;
  const palMadya = H2.jabatanDari('pranata_madya').pal;
  const palSandiman = H2.jabatanDari('sandiman').pal;

  ok('prasyarat: auditor memang jabatan berjilbab di tabel', palAuditor.head === 'jilbab',
    'head auditor = ' + palAuditor.head);
  ok('prasyarat: pranata madya memang berkumis di tabel', palMadya.kumis === true,
    'kumis pranata madya = ' + palMadya.kumis);
  ok('prasyarat: sandiman memang berpeci di tabel', palSandiman.head === 'peci',
    'head sandiman = ' + palSandiman.head);

  // --- laki-laki di kursi berjilbab
  const lakiAuditor = petaPiksel(orang('auditor', 'L'));
  sama('laki-laki di kursi auditor: nol piksel jilbab',
    hitung(lakiAuditor, ctx.jilbabWarna(palAuditor)), 0);
  ok('laki-laki di kursi auditor tetap punya rambut',
    hitung(lakiAuditor, ctx.rambutWarna(palAuditor)) > 0,
    'nol piksel rambut — jabatan berjilbab tidak punya pal.hair, cadangannya tidak terpakai');

  // --- perempuan di kursi berkumis
  const wanitaMadya = petaPiksel(orang('pranata_madya', 'P'));
  sama('perempuan di kursi pranata madya: nol piksel kumis',
    hitung(wanitaMadya, KUMIS), 0);
  ok('perempuan di kursi pranata madya digambar berjilbab',
    hitung(wanitaMadya, ctx.jilbabWarna(palMadya)) > 0,
    'nol piksel jilbab — jabatan tanpa pal.jilbab tidak dapat warna cadangan');

  // --- perempuan di kursi berpeci
  const wanitaSandiman = petaPiksel(orang('sandiman', 'P'));
  sama('perempuan di kursi sandiman: nol piksel peci',
    hitung(wanitaSandiman, PECI_ISI), 0);
  ok('perempuan di kursi sandiman digambar berjilbab',
    hitung(wanitaSandiman, ctx.jilbabWarna(palSandiman)) > 0, 'nol piksel jilbab');

  // --- laki-laki di kursi berpeci TIDAK kehilangan pecinya: peci itu tanda
  //     jabatan, bukan tanda gender, jadi tidak boleh ikut dicabut
  const lakiSandiman = petaPiksel(orang('sandiman', 'L'));
  ok('laki-laki di kursi sandiman tetap berpeci',
    hitung(lakiSandiman, PECI_ISI) > 0, 'pecinya ikut hilang — itu tanda jabatan, bukan gender');

  /* --- warna kerudung wajib DITULIS di tabel jabatan, bukan diturunkan dari
     warna baju. Sebabnya konkret: terapkanSeragamHarian() menimpa pal.main
     tiap hari, jadi kerudung turunan ikut berubah warna tiap hari — dan di
     hari kemeja putih SELURUH kantor kebagian abu-abu yang sama. Pagar ini
     yang bikin jabatan baru tidak bisa lahir tanpa warnanya sendiri.

     Daftar id-nya dibaca dari sumber: JABATAN deklarasi `const`, jadi tidak
     ikut jadi properti context vm dan tidak ada di __jembatan__. */
  const blokJabatan = SUMBER.slice(SUMBER.indexOf('const JABATAN = ['),
    SUMBER.indexOf('const JABATAN_ID = new Map'));
  const idJabatan = [...blokJabatan.matchAll(/\{ id: '([a-z_]+)', nama: '/g)].map((m) => m[1]);
  ok('daftar jabatan terbaca dari sumber ' + abu('(' + idJabatan.length + ' jabatan)'),
    idJabatan.length >= 10, 'cuma ' + idJabatan.length + ' — polanya mungkin sudah tidak cocok');

  const palDari = (id) => H2.jabatanDari(id).pal;
  const tanpaWarna = idJabatan.filter((id) => !palDari(id).jilbab);
  ok('tiap jabatan punya warna kerudungnya sendiri di tabel',
    tanpaWarna.length === 0,
    'belum punya: ' + tanpaWarna.join(', ') + ' — tambahkan jilbab: "#..." di pal-nya');
  const warna = idJabatan.map((id) => String(palDari(id).jilbab).toLowerCase());
  const kembar = [...new Set(warna.filter((w, i) => warna.indexOf(w) !== i))];
  ok('tidak ada dua jabatan berkerudung warna sama',
    kembar.length === 0, 'warna kembar: ' + kembar.join(', '));

  /* Seragam harian tidak boleh menyeret warna kerudung: dia cuma menimpa
     main/pants/pattern. Diperiksa dengan menjalankannya, bukan dengan percaya. */
  const sebelumKerudung = idJabatan.map((id) => palDari(id).jilbab);
  ctx.terapkanSeragamHarian();
  const sesudahKerudung = idJabatan.map((id) => palDari(id).jilbab);
  ok('terapkanSeragamHarian() tidak menyentuh warna kerudung',
    sebelumKerudung.every((w, i) => w === sesudahKerudung[i]),
    'ada kerudung yang ikut berubah waktu seragam harian dipasang');

  /* --- YANG PALING PENTING: tidak tahu = tidak berubah sama sekali.
     Ini yang menjaga tamu event, peserta rapat, dan golden uji lama. Dibanding
     piksel per piksel, bukan cuma "jumlahnya mirip". */
  for (const peran of ['auditor', 'pranata_madya', 'sandiman', 'pranata_muda', 'humas']) {
    const kosong = petaPiksel(orang(peran, ''));
    const takAda = petaPiksel(orang(peran, undefined));
    let beda = 0;
    const kunci = new Set([...kosong.keys(), ...takAda.keys()]);
    for (const kk of kunci) if (kosong.get(kk) !== takAda.get(kk)) beda++;
    sama('jk kosong = jk tak diisi, piksel per piksel · ' + peran, beda, 0);
  }
}

/* ==================================================================== jalan */
try {
  await kasusTebakan();
  await kasusTimpaan();
  await kasusPanel();
  kasusGambar();
} finally {
  for (const a of anak) { try { a.kill(); } catch { /* sudah mati */ } }
  for (const d of sandbox) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* biar */ } }
}

console.log();
if (gagal) {
  console.log(merah(tebal(gagal + ' GAGAL')) + ' dari ' + (lulus + gagal) + ' pemeriksaan');
  process.exit(1);
}
console.log(hijau(tebal('SEMUA LULUS')) + ' — ' + lulus + ' pemeriksaan jenis kelamin');
