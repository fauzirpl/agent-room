#!/usr/bin/env node
// uji-pegawai.mjs :: penjaga formasi pegawai tetap per proyek.
//
// Yang dijaga di sini satu janji: "pegawai yang kemarin bertugas di folder ini
// besok dipanggil dengan nama yang sama". Janji itu gampang rusak diam-diam —
// nama tetap muncul, cuma orangnya berganti — jadi tiap kasus di bawah
// membandingkan nama LINTAS SESI dan LINTAS RESTART, bukan cuma memastikan
// ada isinya.
//
// Cara kerjanya: menyalakan server.mjs sungguhan sebagai proses anak, dengan
// SELURUH env datanya (formasi, buku induk, agenda, tunda, token, kliping)
// diarahkan ke folder sementara — berkas data asli di repo tidak pernah
// disentuh. Lalu payload hook sintetis dikirim ke POST /event dan hasilnya
// dibaca lewat GET /ruangan serta isi formasi.json.
//
// Dua hal yang perlu diketahui sebelum membaca kasusnya:
//   1. formasi.json ditulis dengan debounce 20 detik, jadi SEMUA pemeriksaan
//      isi berkas dilakukan SESUDAH kantornya ditutup (penutupan memaksa tulis
//      sinkron lewat process.on('exit')).
//   2. Penutupannya lewat pesan IPC, bukan SIGTERM: di Windows SIGTERM
//      mematikan proses tanpa menjalankan handler 'exit', sehingga berkasnya
//      tidak sempat ditulis dan ujinya akan bohong.
//
// Nama pegawai TIDAK PERNAH dipatok harfiah di berkas ini. Daftar NAMA_BAWAAN
// dibaca dari server.mjs lalu undiannya dihitung ulang dengan rumus yang sama
// — jadi menambah nama di ujung daftar tidak memerahkan uji ini, tapi
// menyisipkan nama di tengah (yang memang mengganti orang) langsung ketahuan.
//
// Yang diuji di sini SELALU daftar bawaan: kantor sementaranya lahir tanpa
// nama.json, jadi daftarNama() di server jatuh ke NAMA_BAWAAN.
//
// Pakai:
//   node uji-pegawai.mjs            jalankan semua kasus
//   node uji-pegawai.mjs --simpan   jangan hapus folder sementara (buat mengintip)

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');
const SIMPAN = process.argv.includes('--simpan');

const berwarna = !process.env.NO_COLOR;
const warnai = (kode) => (s) => (berwarna ? '\u001b[' + kode + 'm' + s + '\u001b[0m' : String(s));
const merah = warnai(31);
const hijau = warnai(32);
const kuning = warnai(33);
const abu = warnai(90);
const tebal = warnai(1);

let gagal = 0;
let periksa = 0;
const lulus = (t) => { periksa++; console.log('  ' + hijau('✓') + ' ' + t); };
const tolak = (t, ket) => { periksa++; gagal++; console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(ket) : '')); };
const sama = (t, dapat, harap) => {
  if (dapat === harap) lulus(t + ' ' + abu('= ' + JSON.stringify(dapat)));
  else tolak(t, 'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harap));
};
const benar = (t, syarat, ket) => { if (syarat) lulus(t); else tolak(t, ket || ''); };
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/* --------------------------------------------------- undian tandingan --- */
// Dibaca dari sumbernya supaya tidak ada dua daftar nama yang bisa hanyut.
function daftarDariSumber(src, kunci) {
  const m = new RegExp('const ' + kunci + ' = \\[([\\s\\S]*?)\\];').exec(src);
  if (!m) throw new Error(kunci + ' tidak ketemu di server.mjs');
  return (m[1].match(/'[^']+'/g) || []).map((s) => s.slice(1, -1));
}
const SUMBER = fs.readFileSync(SERVER, 'utf8');
const NAMA_BAWAAN = daftarDariSumber(SUMBER, 'NAMA_BAWAAN');

function undi(proyek, i, dipakai = new Set()) {
  for (let salt = 0; salt < 64; salt++) {
    const h = crypto.createHash('sha256').update(proyek + '#' + i + '#' + salt).digest();
    const nama = NAMA_BAWAAN[h.readUInt16BE(0) % NAMA_BAWAAN.length];
    if (!dipakai.has(nama)) return nama;
  }
  // cermin cabang mentok di pegawaiUndi(): angka di belakang, bukan nama kembar
  const dasar = NAMA_BAWAAN[i % NAMA_BAWAAN.length];
  if (!dipakai.has(dasar)) return dasar;
  for (let n = 2; n < 100; n++) if (!dipakai.has(dasar + ' ' + n)) return dasar + ' ' + n;
  return dasar;
}

/* ------------------------------------------------------- kantor sementara --- */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-pegawai-'));
const PROYEK = path.join(TMP, 'proyek');

function folderProyek(nama, cabang) {
  const p = path.join(PROYEK, nama);
  fs.mkdirSync(path.join(p, '.git'), { recursive: true });
  if (cabang) fs.writeFileSync(path.join(p, '.git', 'HEAD'), 'ref: refs/heads/' + cabang + '\n');
  return p;
}

// Port awalnya dipatok, bukan diacak: beberapa uji lain bisa jalan bersamaan di
// mesin ini, dan port yang sudah dipakai cuma membuat servernya mati saat start
// (coba() mengembalikan null lalu port berikutnya dicoba), bukan menggagalkan uji.
const PORT_MULAI = Number(process.env.AGENT_ROOM_UJI_PORT) || 4642;
let portBerikut = PORT_MULAI;
const kodeAnak = 'process.on(\'message\',(m)=>{if(m===\'tutup\')process.exit(0);});'
  + 'await import(' + JSON.stringify(pathToFileURL(SERVER).href) + ');';

async function coba(dir, port, tambahan = {}) {
  const anak = spawn(process.execPath, ['--input-type=module', '-e', kodeAnak], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      AGENT_ROOM_PORT: String(port),
      AGENT_ROOM_HOST: '127.0.0.1',
      AGENT_ROOM_FORMASI: path.join(dir, 'formasi.json'),
      AGENT_ROOM_BUKU_INDUK: path.join(dir, 'buku-induk.json'),
      AGENT_ROOM_AGENDA_DIR: path.join(dir, 'agenda'),
      AGENT_ROOM_TUNDA_DIR: path.join(dir, 'tunda'),
      AGENT_ROOM_TOKEN_LOG: path.join(dir, 'token-riwayat.jsonl'),
      AGENT_ROOM_KLIPING_LOG: path.join(dir, 'kliping.jsonl'),
      // pagu cuma DIBACA server, tapi tetap diarahkan ke folder sementara:
      // uji tidak boleh membaca satu pun berkas repo yang tidak dikendalikannya
      AGENT_ROOM_PAGU: path.join(dir, 'pagu.json'),
      /* Wajib diarahkan ke kantor sementara: tanpa ini server memungut
         nama.json/suara.json milik repo yang sedang diuji, dan undian
         tandingan di atas (yang selalu memakai NAMA_BAWAAN) langsung
         berbeda dari yang keluar. Uji tidak boleh ikut nasib daftar nama
         pilihan orang yang kebetulan menjalankannya. */
      /* Ke-17 kasus di berkas ini menguji janji mode 'tetap' ("besok
         dipanggil dengan nama yang sama"). Sejak piket acak jadi bawaan,
         modenya harus dipatok dari sini — kalau tidak, ujinya menguji mode
         yang salah dan mengeluh nama berubah padahal memang seharusnya. */
      AGENT_ROOM_PENUGASAN: 'tetap',
      AGENT_ROOM_NAMA: path.join(dir, 'nama.json'),
      AGENT_ROOM_SUARA: path.join(dir, 'suara.json'),
      AGENT_ROOM_SUARA_KUNCI: path.join(dir, '.agent-room-suara-kunci'),
      AGENT_ROOM_SUARA_DIR: path.join(dir, 'suara'),
      AGENT_ROOM_KUNCI: '',
      AGENT_ROOM_LAPOR: '',
      /* 'off', bukan ''. Kosong berarti "tebak dari IP" — server tetap boleh
         menghubungi geojs.io dan open-meteo.com begitu ada yang membuka
         /cuaca. Hari ini tidak ada kasus di sini yang membukanya, jadi ini
         menutup pintu sebelum ada yang memutarnya. Dijaga `uji-jaringan.mjs`. */
      AGENT_ROOM_CUACA: 'off',
      AGENT_ROOM_PEGAWAI_TETAP: '',
      ...tambahan,
    },
  });
  const k = { anak, port, dir, log: [], alamat: 'http://127.0.0.1:' + port, mati: false };
  anak.stdout.on('data', (d) => k.log.push(String(d)));
  anak.stderr.on('data', (d) => k.log.push(String(d)));
  anak.on('exit', () => { k.mati = true; });
  /* Kesiapannya dibaca dari KONSOL ANAK KITA SENDIRI, bukan dari /health.
     Port yang sudah dipakai proses lain (uji lain di mesin yang sama, server
     dinas sungguhan, sisa uji orang lain) menjawab /health dengan riang, dan
     ujinya lalu berbicara dengan kantor yang salah: namanya diambil dari
     kolam proyek lain, dan formasi.json yang diperiksa tidak pernah terisi.
     Baris "ruangan siap -> http://host:port" cuma tercetak kalau anak KITA
     yang berhasil mengikat port itu. */
  const habis = Date.now() + 15000;
  const siap = () => k.log.join('').includes('http://127.0.0.1:' + port);
  while (Date.now() < habis && !siap()) {
    if (k.mati) return null;                  // port dipakai / gagal start: coba port lain
    await tidur(40);
  }
  if (!siap()) { try { k.anak.kill(); } catch { /* sudah mati */ } return null; }
  while (Date.now() < habis) {
    if (k.mati) return null;
    try {
      const r = await fetch(k.alamat + '/health');
      if (r.ok) { await r.json(); return k; }
    } catch { /* belum mendengar */ }
    await tidur(60);
  }
  throw new Error('server uji tidak pernah siap di port ' + port);
}

async function buka(dir, tambahan = {}) {
  fs.mkdirSync(dir, { recursive: true });
  for (let n = 0; n < 30; n++) {
    const port = portBerikut++;
    if (portBerikut > PORT_MULAI + 58) portBerikut = PORT_MULAI;
    const k = await coba(dir, port, tambahan);
    if (k) return k;
  }
  throw new Error('tidak dapat port kosong buat server uji');
}

function tutup(k) {
  return new Promise((selesai) => {
    if (k.mati) { selesai(); return; }
    k.anak.once('exit', () => setTimeout(selesai, 60));   // beri jeda rename .tmp
    k.anak.send('tutup');
    setTimeout(() => { try { k.anak.kill(); } catch { /* sudah mati */ } }, 5000).unref?.();
  });
}

async function hook(k, jenis, sesi, cwd, tambahan = {}) {
  const r = await fetch(k.alamat + '/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hook_event_name: jenis, session_id: sesi, cwd, ...tambahan }),
  });
  if (r.status !== 204) throw new Error('POST /event menjawab ' + r.status);
  await r.arrayBuffer();
  await tidur(20);
}

const mulai = (k, sesi, cwd) => hook(k, 'SessionStart', sesi, cwd, { source: 'startup' });
const pulang = (k, sesi, cwd) => hook(k, 'SessionEnd', sesi, cwd, { reason: 'clear' });

async function ruangan(k) {
  const r = await fetch(k.alamat + '/ruangan');
  return (await r.json()).sesi || [];
}
async function orang(k, sesi) {
  const daftar = await ruangan(k);
  return daftar.find((s) => s.sesi === sesi.slice(0, 12)) || null;
}
async function namaDari(k, sesi) { return (await orang(k, sesi))?.nama ?? null; }

async function kirimJson(k, jalur, isi) {
  const r = await fetch(k.alamat + jalur, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(isi),
  });
  const teks = await r.text();
  await tidur(20);
  return { status: r.status, teks };
}

// Angka batas dibaca dari sumbernya juga, supaya menaikkan batasnya di
// server.mjs tidak perlu disusul mengedit angka di berkas ini.
function angkaDariSumber(kunci) {
  const m = new RegExp('const ' + kunci + ' = (\\d+)').exec(SUMBER);
  if (!m) throw new Error(kunci + ' tidak ketemu di server.mjs');
  return Number(m[1]);
}
/* Isi buku agenda hari itu, satu objek per baris. Dipakai buat membuktikan apa
   yang TIDAK boleh mendarat ke disk, bukan cuma apa yang mendarat. */
function agendaIsi(dir) {
  const d = path.join(dir, 'agenda');
  let berkas = [];
  try { berkas = fs.readdirSync(d).filter((n) => n.endsWith('.jsonl')); } catch { return []; }
  const keluar = [];
  for (const n of berkas) {
    for (const t of fs.readFileSync(path.join(d, n), 'utf8').split('\n')) {
      if (!t.trim()) continue;
      try { keluar.push(JSON.parse(t)); } catch { /* baris terpotong: abaikan */ }
    }
  }
  return keluar;
}

/* Isi ring persis seperti yang diterima peramban yang baru menyambung:
   GET /stream?since=0 memuntahkan ring dalam URUTAN PUBLISH, tiap bingkai
   membawa `id:` yang jadi Last-Event-ID kalau koneksinya putus. Ini
   satu-satunya cara jujur memeriksa urutan terbit vs urutan nomor. */
async function ringSSE(k, ms = 400) {
  const ctrl = new AbortController();
  const jam = setTimeout(() => ctrl.abort(), ms);
  let teks = '';
  try {
    const r = await fetch(k.alamat + '/stream?since=0', { signal: ctrl.signal });
    const dec = new TextDecoder();
    for await (const potong of r.body) teks += dec.decode(potong, { stream: true });
  } catch { /* abort memang cara berhentinya */ }
  clearTimeout(jam);
  const keluar = [];
  for (const blok of teks.split('\n\n')) {
    const id = /(?:^|\n)id: (\d+)/.exec(blok);
    const data = /(?:^|\n)data: (.*)/.exec(blok);
    if (!id || !data) continue;
    try { keluar.push({ id: Number(id[1]), ev: JSON.parse(data[1]) }); } catch { /* bukan bingkai event */ }
  }
  return keluar;
}

/* Satu surat di kotak surat hook offline (hook.mjs --tunda menulis begini).
   Dipakai buat membuat sesi yang cap waktunya SUDAH TUA tanpa menunggu 30
   menit sungguhan: terimaEvent() memakai ts asli surat, dan catatSesiHidup()
   menyimpannya apa adanya sebagai `terakhir`. */
function suratTunda(dir, ts, isi) {
  const d = path.join(dir, 'tunda');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, ts + '-' + Math.random().toString(36).slice(2, 8) + '.json'), JSON.stringify(isi));
}

async function tunggu(fn, ms = 8000) {
  const habis = Date.now() + ms;
  while (Date.now() < habis) {
    if (await fn()) return true;
    await tidur(50);
  }
  return false;
}

const berkasFormasi = (dir) => path.join(dir, 'formasi.json');
const adaFormasi = (dir) => fs.existsSync(berkasFormasi(dir));
const bacaFormasi = (dir) => JSON.parse(fs.readFileSync(berkasFormasi(dir), 'utf8'));
const bacaBytes = (dir) => fs.readFileSync(berkasFormasi(dir));
const kursiDi = (isi, proyek) => (isi.proyek && isi.proyek[proyek]) || [];

/* ================================================================ kasus === */
const KASUS = [];
const kasus = (judul, fn) => KASUS.push({ judul, fn });

/* 1 — inti fitur: nama menempel di kursi, bukan di sesi. */
kasus('1. nama menetap lintas sesi di folder yang sama', async () => {
  const dir = path.join(TMP, 'k1');
  const p = folderProyek('kantor-alfa', 'master');
  const k = await buka(dir);
  try {
    await mulai(k, 'sesi-a', p);
    const n1 = await namaDari(k, 'sesi-a');
    benar('sesi A dapat nama tetap ' + abu('"' + n1 + '"'), !!n1, 'namanya kosong');
    sama('  namanya persis hasil undian deterministik', n1, undi('kantor-alfa', 0));
    await pulang(k, 'sesi-a', p);
    await mulai(k, 'sesi-b', p);
    sama('sesi B (id baru) mewarisi nama yang sama', await namaDari(k, 'sesi-b'), n1);
    const a = await orang(k, 'sesi-a');
    benar('sesi A sudah tidak dilaporkan hidup', a === null, 'masih ada di /ruangan');
  } finally { await tutup(k); }
  const kursi = kursiDi(bacaFormasi(dir), 'kantor-alfa');
  sama('  formasi.json cuma punya satu kursi buat proyek ini', kursi.length, 1);
  sama('  nama di berkas sama dengan yang dilaporkan', kursi[0].nama, undi('kantor-alfa', 0));
  benar('  id sesi tidak pernah ikut ke disk',
    !/sesi-a|sesi-b|penghuni/.test(fs.readFileSync(berkasFormasi(dir), 'utf8')),
    'ada jejak id sesi di formasi.json');
});

/* 2 — beberapa pegawai tetap dalam satu proyek + kursi kosong dipakai ulang. */
kasus('2. dua sesi bersamaan dapat dua kursi, kursi kosong diisi ulang', async () => {
  const dir = path.join(TMP, 'k2');
  const p = folderProyek('kantor-beta', 'master');
  const k = await buka(dir);
  try {
    await mulai(k, 'sesi-a', p);
    await mulai(k, 'sesi-b', p);
    const na = await namaDari(k, 'sesi-a');
    const nb = await namaDari(k, 'sesi-b');
    benar('dua sesi bersamaan bernama berbeda ' + abu('"' + na + '" vs "' + nb + '"'), !!na && !!nb && na !== nb,
      'dapat "' + na + '" dan "' + nb + '"');
    sama('  kursi #1 = undian indeks 0', na, undi('kantor-beta', 0));
    sama('  kursi #2 = undian indeks 1', nb, undi('kantor-beta', 1, new Set([na])));
    await pulang(k, 'sesi-a', p);
    await mulai(k, 'sesi-c', p);
    const nc = await namaDari(k, 'sesi-c');
    sama('sesi C menempati kursi #1 yang barusan kosong', nc, na);
    benar('  bukan kursi #3', nc !== nb, 'malah bertabrakan dengan kursi #2');
  } finally { await tutup(k); }
  sama('  formasi.json berhenti di dua kursi', kursiDi(bacaFormasi(dir), 'kantor-beta').length, 2);
});

/* 3 — benar-benar ditulis ke berkas, bukan cuma bertahan di memori. */
kasus('3. nama bertahan setelah server dimatikan dan dinyalakan lagi', async () => {
  const dir = path.join(TMP, 'k3');
  const p = folderProyek('kantor-gama', 'master');
  let k = await buka(dir);
  let n1;
  try {
    await mulai(k, 'sesi-a', p);
    n1 = await namaDari(k, 'sesi-a');
  } finally { await tutup(k); }
  benar('formasi.json tertulis waktu server pamit', adaFormasi(dir), 'berkasnya tidak ada');
  k = await buka(dir);
  try {
    sama('  berkasnya dimuat lagi waktu server nyala', kursiDi(bacaFormasi(dir), 'kantor-gama').length, 1);
    await mulai(k, 'sesi-z', p);
    sama('sesi baru sesudah restart bernama sama', await namaDari(k, 'sesi-z'), n1);
  } finally { await tutup(k); }
});

/* 4 — pilihan manusia menang dan permanen; mengosongkan = kembali ke undian. */
kasus('4. ganti nama lewat kartu pegawai jadi permanen', async () => {
  const dir = path.join(TMP, 'k4');
  const p = folderProyek('kantor-delta', 'master');
  let k = await buka(dir);
  try {
    await mulai(k, 'sesi-a', p);
    const r = await kirimJson(k, '/nama', { sesi: 'sesi-a', nama: 'Sri Rahayu' });
    sama('POST /nama dijawab 200', r.status, 200);
    sama('  /ruangan langsung memakai nama itu', await namaDari(k, 'sesi-a'), 'Sri Rahayu');
    await pulang(k, 'sesi-a', p);
    await mulai(k, 'sesi-b', p);
    sama('sesi berikutnya mewarisi nama pilihan manusia', await namaDari(k, 'sesi-b'), 'Sri Rahayu');
  } finally { await tutup(k); }
  const kursi1 = kursiDi(bacaFormasi(dir), 'kantor-delta')[0];
  sama('  nama tersimpan di kursi', kursi1.nama, 'Sri Rahayu');
  sama('  ditandai manual', kursi1.manual, true);

  k = await buka(dir);
  try {
    await mulai(k, 'sesi-c', p);
    sama('masih bernama itu sesudah restart', await namaDari(k, 'sesi-c'), 'Sri Rahayu');
    const r = await kirimJson(k, '/nama', { sesi: 'sesi-c', nama: '' });
    sama('POST /nama kosong dijawab 200', r.status, 200);
    sama('  namanya kembali ke undian, bukan jadi anonim',
      await namaDari(k, 'sesi-c'), undi('kantor-delta', 0));
  } finally { await tutup(k); }
  const kursi2 = kursiDi(bacaFormasi(dir), 'kantor-delta')[0];
  sama('  manual dicabut di berkas', kursi2.manual, false);
  sama('  nama di berkas = hasil undian', kursi2.nama, undi('kantor-delta', 0));
});

/* 5 — jabatan ikut menetap, dan id ngawur tidak pernah menyentuh berkas. */
kasus('5. jabatan menetap; id jabatan ngawur ditolak tanpa menulis apa pun', async () => {
  const dir = path.join(TMP, 'k5');
  const p = folderProyek('kantor-epsilon', 'master');
  let k = await buka(dir);
  try {
    await mulai(k, 'sesi-a', p);
    sama('POST /peran sandiman dijawab 200',
      (await kirimJson(k, '/peran', { sesi: 'sesi-a', peran: 'sandiman' })).status, 200);
    await pulang(k, 'sesi-a', p);
    await mulai(k, 'sesi-b', p);
    sama('sesi berikutnya langsung berjabatan sama', (await orang(k, 'sesi-b'))?.peran, 'sandiman');
  } finally { await tutup(k); }
  const kursi = kursiDi(bacaFormasi(dir), 'kantor-epsilon')[0];
  sama('  jabatan tersimpan di kursi', kursi.peran, 'sandiman');
  sama('  ditandai peranManual', kursi.peranManual, true);

  const sebelum = bacaBytes(dir);
  k = await buka(dir);
  try {
    const r = await kirimJson(k, '/peran', { sesi: 'sesi-a', peran: 'bukan jabatan!' });
    sama('POST /peran ngawur ditolak 400', r.status, 400);
  } finally { await tutup(k); }
  benar('  formasi.json byte-identik sesudah penolakan', sebelum.equals(bacaBytes(dir)),
    'berkasnya berubah padahal jabatannya ditolak');

  k = await buka(dir);
  try {
    await mulai(k, 'sesi-c', p);
    sama('  sesi berjabatan tetap tidak kehilangan jabatan karena salah ketik',
      (await kirimJson(k, '/peran', { sesi: 'sesi-c', peran: 'bukan jabatan!' })).status, 400);
    sama('  jabatannya masih terpasang', (await orang(k, 'sesi-c'))?.peran, 'sandiman');
  } finally { await tutup(k); }
  sama('  jabatan di berkas tidak tergores', kursiDi(bacaFormasi(dir), 'kantor-epsilon')[0].peran, 'sandiman');
});

/* 6 — keputusan identitas: kunci = proyek saja, cabang cuma keterangan. */
kasus('6. ganti cabang git tidak mengganti orangnya', async () => {
  const dir = path.join(TMP, 'k6');
  const p = folderProyek('kantor-zeta', 'master');
  const k = await buka(dir);
  let n1;
  try {
    await mulai(k, 'sesi-a', p);
    n1 = await namaDari(k, 'sesi-a');
    sama('cabang awal terbaca', (await orang(k, 'sesi-a'))?.cabang, 'master');
    await pulang(k, 'sesi-a', p);
    fs.writeFileSync(path.join(p, '.git', 'HEAD'), 'ref: refs/heads/fitur-x\n');
    await mulai(k, 'sesi-b', p);
    sama('sesudah checkout cabang lain, namanya tetap', await namaDari(k, 'sesi-b'), n1);
  } finally { await tutup(k); }
  const kursi = kursiDi(bacaFormasi(dir), 'kantor-zeta');
  sama('  tetap satu kursi (cabang tidak memecah pegawai)', kursi.length, 1);
  benar('  cabang tercatat sebagai keterangan di kursi ' + abu('"' + kursi[0].cabangTerakhir + '"'),
    kursi[0].cabangTerakhir === 'master' || kursi[0].cabangTerakhir === 'fitur-x',
    'cabangTerakhir = ' + JSON.stringify(kursi[0].cabangTerakhir));
});

/* 7 — dua folder, dua kolam pegawai. */
kasus('7. proyek berbeda punya pegawai berbeda', async () => {
  const dir = path.join(TMP, 'k7');
  const p = folderProyek('kantor-eta', 'master');
  const q = folderProyek('kantor-theta', 'master');
  let k = await buka(dir);
  let np, nq;
  try {
    await mulai(k, 'sesi-p', p);
    await mulai(k, 'sesi-q', q);
    np = await namaDari(k, 'sesi-p');
    nq = await namaDari(k, 'sesi-q');
    benar('dua proyek, dua nama ' + abu('"' + np + '" vs "' + nq + '"'), np !== nq,
      'dua-duanya "' + np + '"');
  } finally { await tutup(k); }
  const isi = bacaFormasi(dir);
  sama('  dua entri terpisah di formasi.json', Object.keys(isi.proyek).length, 2);
  sama('  kursi kantor-eta', kursiDi(isi, 'kantor-eta')[0].nama, np);
  sama('  kursi kantor-theta', kursiDi(isi, 'kantor-theta')[0].nama, nq);
  k = await buka(dir);
  try {
    await mulai(k, 'sesi-r', p);
    await mulai(k, 'sesi-s', q);
    sama('  sesudah restart, pegawai P kembali', await namaDari(k, 'sesi-r'), np);
    sama('  sesudah restart, pegawai Q kembali', await namaDari(k, 'sesi-s'), nq);
  } finally { await tutup(k); }
});

/* 8 — Aturan 2: event ambient tidak boleh melahirkan atau menyentuh pegawai. */
kasus('8. event ambient tidak menyentuh formasi sama sekali', async () => {
  const dir = path.join(TMP, 'k8');
  const p = folderProyek('kantor-iota', 'master');
  let k = await buka(dir);
  try { await mulai(k, 'sesi-a', p); } finally { await tutup(k); }
  const sebelum = bacaBytes(dir);

  k = await buka(dir);
  let ok = 0;
  try {
    for (const id of ['kucing-lewat', 'lampu-kedip', 'kucing-lewat', 'ac-bocor', 'kucing-lewat']) {
      const r = await kirimJson(k, '/ambien', { id });
      if (r.status === 200) ok++;
    }
    sama('POST /ambien diterima', ok, 5);
    sama('  tidak ada sesi baru yang lahir di ruangan', (await ruangan(k)).length, 0);
  } finally { await tutup(k); }
  benar('  formasi.json byte-identik sebelum & sesudah 5 event ambient',
    sebelum.equals(bacaBytes(dir)), 'ukurannya ' + sebelum.length + ' -> ' + bacaBytes(dir).length + ' byte');
});

/* 9 — migrasi & ketahanan berkas. */
kasus('9a. formasi.json tanpa v dimigrasi utuh', async () => {
  const dir = path.join(TMP, 'k9a');
  fs.mkdirSync(dir, { recursive: true });
  const p = folderProyek('kantor-kappa', 'master');
  fs.writeFileSync(berkasFormasi(dir), JSON.stringify({
    proyek: { 'kantor-kappa': [{ nama: 'Budi Santoso', peran: 'sandiman', sejak: 111, terakhir: 222, manual: true, peranManual: true }] },
  }));
  const k = await buka(dir);
  try {
    await mulai(k, 'sesi-a', p);
    const o = await orang(k, 'sesi-a');
    sama('nama dari berkas v0 dipakai apa adanya', o?.nama, 'Budi Santoso');
    sama('  jabatannya ikut', o?.peran, 'sandiman');
  } finally { await tutup(k); }
  const isi = bacaFormasi(dir);
  sama('  berkas ditulis ulang dengan v terkini', isi.v, 1);
  sama('  sejak (tanggal lantik) tidak hilang', kursiDi(isi, 'kantor-kappa')[0].sejak, 111);
});

kasus('9b. formasi.json ber-v terlalu baru ditolak dengan satu peringatan', async () => {
  const dir = path.join(TMP, 'k9b');
  fs.mkdirSync(dir, { recursive: true });
  const p = folderProyek('kantor-lambda', 'master');
  fs.writeFileSync(berkasFormasi(dir), JSON.stringify({
    v: 99, proyek: { 'kantor-lambda': [{ nama: 'Ngawur Sekali', manual: true }] },
  }));
  const k = await buka(dir);
  try {
    const h = await (await fetch(k.alamat + '/health')).json();
    benar('server tetap hidup', h.ok === true, 'health tidak ok');
    await mulai(k, 'sesi-a', p);
    const n = await namaDari(k, 'sesi-a');
    benar('kursi dari berkas yang ditolak tidak dipakai', n !== 'Ngawur Sekali', 'malah memakai nama dari berkas v99');
    sama('  pegawai baru diundi dari nol', n, undi('kantor-lambda', 0));
  } finally { await tutup(k); }
  const log = k.log.join('');
  const jumlah = (log.match(/formasi: 1 berkas ditolak/g) || []).length;
  sama('  peringatannya tepat satu baris', jumlah, 1);
  benar('  peringatannya menyebut v99', /ber-v99/.test(log), log.slice(0, 200));
});

kasus('9c. formasi.json rusak tidak membuat server gagal start', async () => {
  const dir = path.join(TMP, 'k9c');
  fs.mkdirSync(dir, { recursive: true });
  const p = folderProyek('kantor-mu', 'master');
  fs.writeFileSync(berkasFormasi(dir), '{ ini bukan json sama sekali');
  const k = await buka(dir);
  try {
    await mulai(k, 'sesi-a', p);
    sama('server tetap melayani dan tetap melantik', await namaDari(k, 'sesi-a'), undi('kantor-mu', 0));
  } finally { await tutup(k); }
  sama('  berkas rusak ditimpa berkas sehat', kursiDi(bacaFormasi(dir), 'kantor-mu').length, 1);
  /* Ditimpa boleh, DIAM-DIAM tidak: berkas terpotong (mati listrik saat rename,
     disk penuh) tidak boleh tampak sama dengan kantor yang baru buka. Dua
     cabang penolakan lain sudah memperingatkan; yang ini dulu bisu. */
  const log = k.log.join('');
  sama('  penolakannya diberitahukan tepat sekali', (log.match(/formasi: 1 berkas ditolak/g) || []).length, 1);
  benar('  peringatannya menyebut sebabnya: isinya bukan JSON utuh',
    /bukan JSON utuh/.test(log), log.slice(0, 300) || '(konsol kosong)');
});

kasus('9d. kursi dengan isi ngawur disaring waktu dimuat', async () => {
  const dir = path.join(TMP, 'k9d');
  fs.mkdirSync(dir, { recursive: true });
  const p = folderProyek('kantor-nu', 'master');
  fs.writeFileSync(berkasFormasi(dir), JSON.stringify({
    v: 1, proyek: { 'kantor-nu': [{ nama: 'X'.repeat(300), peran: 'BUKAN JABATAN!', sejak: -5, terakhir: 'kemarin' }] },
  }));
  const k = await buka(dir);
  try {
    await mulai(k, 'sesi-a', p);
    const o = await orang(k, 'sesi-a');
    benar('nama 300 karakter dipotong 24 ' + abu('(' + (o?.nama || '').length + ' karakter)'),
      (o?.nama || '').length <= 24 && (o?.nama || '').length > 0, 'panjangnya ' + (o?.nama || '').length);
    sama('  jabatan ngawur dibuang', o?.peran, '');
  } finally { await tutup(k); }
  const kursi = kursiDi(bacaFormasi(dir), 'kantor-nu')[0];
  benar('  yang ditulis balik pun sudah bersih', kursi.nama.length <= 24 && kursi.peran === '' && kursi.sejak >= 0,
    JSON.stringify(kursi));
});

/* 10 — batas formasi: sesi ke-13 dan seterusnya jalan tanpa nama tetap. */
kasus('10. 15 sesi bersamaan berhenti di 12 kursi', async () => {
  const dir = path.join(TMP, 'k10');
  const p = folderProyek('kantor-xi', 'master');
  const k = await buka(dir);
  try {
    for (let i = 0; i < 15; i++) await mulai(k, 'sesi-' + String(i).padStart(2, '0'), p);
    const daftar = await ruangan(k);
    sama('15 sesi hidup di ruangan', daftar.length, 15);
    const bernama = daftar.filter((s) => s.nama);
    sama('  yang dapat nama tetap', bernama.length, 12);
    sama('  yang jalan tanpa nama tetap', daftar.length - bernama.length, 3);
    sama('  tidak ada nama kembar', new Set(bernama.map((s) => s.nama)).size, 12);
  } finally { await tutup(k); }
  sama('  formasi.json berhenti di FORMASI_MAKS', kursiDi(bacaFormasi(dir), 'kantor-xi').length, 12);
});

/* 11 — tenaga kontrak dari halaman tidak mencuri kursi staf tetap. */
kasus('11. sesi bernama dari formulir tugas tidak menempati kursi', async () => {
  const dir = path.join(TMP, 'k11');
  const p = folderProyek('kantor-omikron', 'master');
  const k = await buka(dir);
  try {
    sama('POST /nama sebelum event pertama dijawab 200',
      (await kirimJson(k, '/nama', { sesi: 'tugas-ekspor', nama: 'tugas ekspor' })).status, 200);
    await mulai(k, 'tugas-ekspor', p);
    sama('namanya tetap nama dari formulir', await namaDari(k, 'tugas-ekspor'), 'tugas ekspor');
    await mulai(k, 'sesi-staf', p);
    sama('  staf tetap yang datang kemudian tetap dapat kursi #1',
      await namaDari(k, 'sesi-staf'), undi('kantor-omikron', 0));
  } finally { await tutup(k); }
  const kursi = kursiDi(bacaFormasi(dir), 'kantor-omikron');
  sama('  cuma satu kursi yang lahir, bukan dua', kursi.length, 1);
  benar('  nama tenaga kontrak tidak ikut ke formasi.json',
    !/tugas ekspor/.test(fs.readFileSync(berkasFormasi(dir), 'utf8')), 'namanya ikut tertulis');
});

/* 12 — sapuan kursi basi harus melepas orangnya LENGKAP.
   Sesi yang cap waktunya sudah tua dibuat lewat kotak surat hook offline:
   surat tunda membawa ts aslinya, dan catatSesiHidup() menyimpan ts itu apa
   adanya sebagai `terakhir` — jadi sesi yang baru saja diserap sudah lahir
   dalam keadaan "diam dua jam", tanpa uji ini perlu menunggu 30 menit. */
kasus('12. kursi yang tersapu dilepas lengkap: tidak ada dua orang bernama sama', async () => {
  const dir = path.join(TMP, 'k12');
  fs.mkdirSync(dir, { recursive: true });
  const p = folderProyek('kantor-sapu', 'master');
  const lama = Date.now() - 2 * 3600 * 1000;      // > PEGAWAI_SEPI_MS, < jendela 3 jam /ruangan
  suratTunda(dir, lama, { hook_event_name: 'SessionStart', session_id: 'basi00000001', cwd: p, source: 'startup' });
  suratTunda(dir, lama + 1, { hook_event_name: 'SessionStart', session_id: 'basi00000002', cwd: p, source: 'startup' });
  const k = await buka(dir);
  let nh;
  try {
    benar('dua surat tunda diserap jadi dua sesi hidup',
      await tunggu(async () => (await ruangan(k)).length >= 2), 'kotak surat tunda tidak pernah masuk');
    const n1 = await namaDari(k, 'basi00000001');
    const n2 = await namaDari(k, 'basi00000002');
    benar('dua sesi hidup tidak boleh bernama sama ' + abu('"' + n1 + '" vs "' + n2 + '"'),
      !(n1 && n2 && n1 === n2), 'dua-duanya dipanggil "' + n1 + '" padahal kursinya cuma satu');
    await mulai(k, 'sesi-hidup', p);
    nh = await namaDari(k, 'sesi-hidup');
    sama('sesi yang benar-benar hidup menempati kursi #1', nh, undi('kantor-sapu', 0));
    // yang tersapu bekerja lagi: dia harus DILANTIK ULANG, bukan tertahan
    // selamanya oleh gerbang "sudah punya nama = tenaga kontrak"
    await mulai(k, 'basi00000001', p);
    const nb = await namaDari(k, 'basi00000001');
    benar('sesi yang tersapu dilantik ulang, bukan menumpang nama orang lain ' + abu('"' + nb + '"'),
      !!nb && nb !== nh, 'dia dipanggil "' + nb + '", sama dengan penghuni kursi #1');
    sama('  dia mendapat kursi #2', nb, undi('kantor-sapu', 1, new Set([nh])));
    const bernama = (await ruangan(k)).map((s) => s.nama).filter(Boolean);
    sama('  tidak ada nama kembar di seluruh ruangan', new Set(bernama).size, bernama.length);
  } finally { await tutup(k); }
  sama('  formasi.json memang punya dua kursi sekarang', kursiDi(bacaFormasi(dir), 'kantor-sapu').length, 2);
});

/* 13 — yang pamit tidak perlu kursi. */
kasus('13. SessionEnd sebagai event pertama tidak melahirkan pegawai hantu', async () => {
  const dir = path.join(TMP, 'k13');
  const hantu = folderProyek('kantor-hantu', 'master');
  const riil = folderProyek('kantor-riil', 'master');
  const k = await buka(dir);
  try {
    await pulang(k, 'hantu0000001', hantu);
    const nama = (await ringSSE(k)).filter((b) => b.ev.kind === 'nama');
    sama('tidak ada pengumuman nama buat orang yang justru sedang pamit', nama.length, 0);
    sama('  ruangannya tetap kosong', (await ruangan(k)).length, 0);
    await mulai(k, 'sesi-riil', riil);            // supaya berkasnya benar-benar ditulis
    benar('  staf sungguhan tetap dilantik seperti biasa', !!(await namaDari(k, 'sesi-riil')), 'malah tidak dapat nama');
  } finally { await tutup(k); }
  const isi = bacaFormasi(dir);
  benar('folder yang cuma ditinggali sesi pamit tidak punya formasi',
    !isi.proyek['kantor-hantu'], 'proyek tercatat: ' + JSON.stringify(Object.keys(isi.proyek)));
  sama('  cuma folder yang benar-benar dikerjakan yang tercatat', Object.keys(isi.proyek).length, 1);
});

/* 14 — pengumuman pelantikan itu siaran, bukan kejadian yang perlu diarsipkan. */
kasus('14. baris kind:"nama" tidak pernah mendarat di buku agenda', async () => {
  const dir = path.join(TMP, 'k14');
  const p = folderProyek('kantor-pi', 'master');
  const k = await buka(dir);
  try {
    await mulai(k, 'sesi-a', p);
    await kirimJson(k, '/nama', { sesi: 'sesi-a', nama: 'Sri Rahayu' });
    await hook(k, 'PreToolUse', 'sesi-a', p, { tool_name: 'Read', tool_input: { file_path: 'catatan.md' } });
  } finally { await tutup(k); }
  const baris = agendaIsi(dir);
  benar('buku agendanya memang terisi', baris.length >= 2, 'cuma ' + baris.length + ' baris');
  sama('  tidak ada satu pun baris kind:"nama"', baris.filter((b) => b.kind === 'nama').length, 0);
  benar('  identitasnya tetap terbawa di baris kegiatan biasa',
    baris.some((b) => b.kind === 'pre' && b.nama === 'Sri Rahayu'),
    'kind di agenda: ' + JSON.stringify(baris.map((b) => b.kind)));
});

/* 15 — invarian "urutan publish = urutan id" yang dipakai susulan Last-Event-ID. */
kasus('15. nomor event searah dengan urutan terbitnya', async () => {
  const dir = path.join(TMP, 'k15');
  const p = folderProyek('kantor-rho', 'master');
  const k = await buka(dir);
  try {
    await mulai(k, 'sesi-a', p);
    const bingkai = await ringSSE(k);
    const nomor = bingkai.map((b) => b.id);
    benar('ring memang berisi bingkai ber-id', nomor.length >= 2, 'cuma ' + nomor.length + ' bingkai');
    benar('id naik terus mengikuti urutan terbit ' + abu(JSON.stringify(nomor)),
      nomor.every((v, i) => i === 0 || v > nomor[i - 1]),
      'urutan id yang keluar: ' + JSON.stringify(nomor));
    const iNama = bingkai.findIndex((b) => b.ev.kind === 'nama');
    const iAwal = bingkai.findIndex((b) => b.ev.kind === 'session-start');
    benar('pengumuman nama terbit sebelum event pemicunya', iNama >= 0 && iAwal > iNama,
      'posisi nama=' + iNama + ', session-start=' + iAwal);
    benar('  dan nomornya lebih KECIL dari event pemicunya',
      iNama >= 0 && iAwal >= 0 && bingkai[iNama].id < bingkai[iAwal].id,
      'id nama=' + (bingkai[iNama] || {}).id + ', id session-start=' + (bingkai[iAwal] || {}).id);
    sama('  tidak ada nomor kembar', new Set(nomor).size, nomor.length);
  } finally { await tutup(k); }
});

/* 16 — jumlah folder dibatasi, sama seperti semua dimensi lain di berkas ini. */
kasus('16. jumlah proyek di formasi.json dipangkas, yang terlama dibuang duluan', async () => {
  const dir = path.join(TMP, 'k16');
  fs.mkdirSync(dir, { recursive: true });
  const FORMASI_PROYEK_MAKS = angkaDariSumber('FORMASI_PROYEK_MAKS');
  const n = FORMASI_PROYEK_MAKS + 20;
  const proyek = {};
  const kunci = (i) => 'arsip-' + String(i).padStart(3, '0');
  for (let i = 0; i < n; i++) {
    proyek[kunci(i)] = [{ nama: 'Pegawai ' + i, peran: '', sejak: 1000 + i, terakhir: 1000 + i, manual: true }];
  }
  fs.writeFileSync(berkasFormasi(dir), JSON.stringify({ v: 1, proyek }));
  const k = await buka(dir);
  try {
    benar('server tetap hidup dengan berkas segemuk itu',
      (await (await fetch(k.alamat + '/health')).json()).ok === true, 'health tidak ok');
  } finally { await tutup(k); }
  const isi = bacaFormasi(dir);
  sama('berkas ' + n + ' proyek dipangkas ke batas', Object.keys(isi.proyek).length, FORMASI_PROYEK_MAKS);
  benar('  yang paling baru ditengok bertahan', !!isi.proyek[kunci(n - 1)], 'malah ikut dibuang');
  benar('  yang paling lama tidak ditengok dibuang', !isi.proyek[kunci(0)], 'masih ada');

  // dan folder yang lahir SELAGI server hidup pun ikut dibatasi
  const dir2 = path.join(TMP, 'k16b');
  fs.mkdirSync(dir2, { recursive: true });
  const proyek2 = {};
  for (let i = 0; i < FORMASI_PROYEK_MAKS - 3; i++) {
    proyek2['lama-' + String(i).padStart(3, '0')] = [{ nama: 'Pegawai ' + i, sejak: 1000 + i, terakhir: 1000 + i }];
  }
  fs.writeFileSync(berkasFormasi(dir2), JSON.stringify({ v: 1, proyek: proyek2 }));
  const k2 = await buka(dir2);
  try {
    for (let i = 0; i < 6; i++) await mulai(k2, 'baru0000000' + i, folderProyek('kantor-baru-' + i, 'master'));
  } finally { await tutup(k2); }
  const isi2 = bacaFormasi(dir2);
  sama('  folder baru yang datang saat server hidup pun ikut dibatasi',
    Object.keys(isi2.proyek).length, FORMASI_PROYEK_MAKS);
  benar('  enam folder yang barusan dipakai tidak ikut terbuang',
    [0, 1, 2, 3, 4, 5].every((i) => !!isi2.proyek['kantor-baru-' + i]),
    'yang tersisa: ' + JSON.stringify(Object.keys(isi2.proyek).filter((s) => s.startsWith('kantor-baru'))));
  benar('  yang dibuang tiga folder terlama', !isi2.proyek['lama-000'] && !!isi2.proyek['lama-060'],
    'yang terbuang bukan yang paling tua');
});

/* 17 — saklar mati buat pemasangan yang tidak meminta fitur ini. */
kasus('17. AGENT_ROOM_PEGAWAI_TETAP=off mengembalikan perilaku sebelum fitur ini ada', async () => {
  const dir = path.join(TMP, 'k17');
  fs.mkdirSync(dir, { recursive: true });
  const p = folderProyek('kantor-sigma', 'master');
  fs.writeFileSync(berkasFormasi(dir), JSON.stringify({
    v: 1, proyek: { 'kantor-sigma': [{ nama: 'Pegawai Lama', sejak: 5, terakhir: 5, manual: true }] },
  }));
  const sebelum = bacaBytes(dir);
  const k = await buka(dir, { AGENT_ROOM_PEGAWAI_TETAP: 'off' });
  try {
    await mulai(k, 'sesi-a', p);
    sama('sesi terminal kembali tanpa nama panggilan', (await orang(k, 'sesi-a'))?.nama, '');
    sama('  tidak ada pengumuman nama di ring', (await ringSSE(k)).filter((b) => b.ev.kind === 'nama').length, 0);
    sama('  ganti nama manual tetap dilayani seperti dulu',
      (await kirimJson(k, '/nama', { sesi: 'sesi-a', nama: 'Sri Rahayu' })).status, 200);
    sama('  dan berlaku buat sesi ini saja', await namaDari(k, 'sesi-a'), 'Sri Rahayu');
  } finally { await tutup(k); }
  benar('formasi.json yang sudah ada tidak disentuh sama sekali', sebelum.equals(bacaBytes(dir)),
    'berkasnya berubah padahal fiturnya dimatikan');

  const dir2 = path.join(TMP, 'k17b');
  const k2 = await buka(dir2, { AGENT_ROOM_PEGAWAI_TETAP: 'off' });
  try { await mulai(k2, 'sesi-a', p); } finally { await tutup(k2); }
  benar('  dan formasi.json tidak pernah lahir di pemasangan yang bersih', !adaFormasi(dir2),
    'berkasnya lahir juga padahal fiturnya dimatikan');
});

/* 18 — saklar mode penugasan yang dipilih di panel harus selamat dari
   restart. Pernah tidak: namaMuat() membaca `penugasan` dari nama.json dan
   POST /nama/daftar mengisinya, tapi namaTulis() cuma menulis {v, penuh} —
   jadi pilihan 'tetap' diam-diam kembali ke 'acak' tiap server nyala ulang,
   dan satu-satunya cara membuatnya bertahan adalah AGENT_ROOM_PENUGASAN,
   yang justru mengunci saklarnya di panel.

   Env-nya DIKOSONGKAN di sini — harness ini memasang 'tetap' buat 17 kasus
   di atas, dan env yang menang akan membuat uji ini lulus tanpa pernah
   menyentuh nama.json. Yang diuji justru jalur berkasnya. */
kasus('18. mode penugasan pilihan panel bertahan sesudah server nyala ulang', async () => {
  const dir = path.join(TMP, 'k18');
  const tanpaEnv = { AGENT_ROOM_PENUGASAN: '' };
  const bacaNama = (d) => JSON.parse(fs.readFileSync(path.join(d, 'nama.json'), 'utf8'));
  const daftar = async (k) => (await (await fetch(k.alamat + '/nama/daftar')).json());

  let k = await buka(dir, tanpaEnv);
  try {
    const awal = await daftar(k);
    sama('selama env tidak ikut campur, bawaannya acak', awal.penugasan, 'acak');
    benar('  dan saklarnya tidak terkunci', awal.penugasanTerkunci === false,
      'panel malah diberi tahu saklarnya terkunci');
    const r = await kirimJson(k, '/nama/daftar', { penuh: ['Oji', 'Sumala'], penugasan: 'tetap' });
    sama('panel memilih "tetap": dijawab 200', r.status, 200);
    sama('  dan langsung berlaku di server yang sama', (await daftar(k)).penugasan, 'tetap');
  } finally { await tutup(k); }

  sama('pilihannya mendarat di nama.json', bacaNama(dir).penugasan, 'tetap');

  k = await buka(dir, tanpaEnv);
  try {
    sama('server yang baru nyala masih melaporkan "tetap"', (await daftar(k)).penugasan, 'tetap');
  } finally { await tutup(k); }

  /* '' = belum pernah dipilih. Ditulis apa adanya, bukan dipaksa jadi 'acak':
     penugasan() sudah menerjemahkannya waktu dibaca, dan bedanya dipakai
     panel buat membedakan bawaan dari pilihan sadar. */
  const dir2 = path.join(TMP, 'k18b');
  const k2 = await buka(dir2, tanpaEnv);
  try { await kirimJson(k2, '/nama/daftar', { penuh: ['Oji'] }); } finally { await tutup(k2); }
  const isi2 = bacaNama(dir2);
  benar('menyimpan daftar tanpa menyentuh saklar tetap menulis medannya',
    Object.prototype.hasOwnProperty.call(isi2, 'penugasan'), 'kunci penugasan tidak ada di berkas');
  sama('  dan isinya tidak dikarang jadi pilihan sadar', isi2.penugasan, '');

  const k3 = await buka(dir2, tanpaEnv);
  try {
    sama('  waktu dibaca lagi tetap jatuh ke acak', (await daftar(k3)).penugasan, 'acak');
  } finally { await tutup(k3); }
});

/* ================================================================ jalan === */
console.log(tebal('\nUji formasi pegawai tetap') + abu('  (folder sementara: ' + TMP + ')'));
for (const { judul, fn } of KASUS) {
  console.log('\n' + tebal(judul));
  try {
    await fn();
  } catch (err) {
    tolak(judul, 'kasusnya melempar: ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err));
  }
}

if (!SIMPAN) { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* biar saja */ } }
console.log('\n' + (gagal
  ? merah('GAGAL: ' + gagal + ' dari ' + periksa + ' pemeriksaan')
  : hijau('LULUS: ' + periksa + ' pemeriksaan'))
  + (SIMPAN ? kuning('  (folder sementara disimpan: ' + TMP + ')') : ''));
process.exit(gagal ? 1 : 0);
