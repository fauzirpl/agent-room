#!/usr/bin/env node
// selaras-suara.mjs :: menghasilkan public/event/99-suara.js — peta
// "id event -> resep efek suara" yang dipakai efekEvent() di room.js.
//
// Kenapa dihasilkan, bukan ditulis tangan: ada 337 event terdaftar, dan
// menuliskan bunyi satu per satu berarti 337 keputusan kecil yang tidak
// mungkin konsisten dan pasti basi tiap gelombang event baru. Sementara
// KEPUTUSANNYA sebenarnya sudah ada: tiap baris di event-acak.json punya
// kolom `suara` — catatan desain hasil rapat ("blip(600,.04) tiap lembar
// keluar", "derit pendek tiap sapuan", "tiga ketukan tumpul beruntun").
// Skrip ini yang menerjemahkan catatan itu ke kosakata EFEK di room.js.
//
// Yang MENANG atas hasil skrip ini: medan `sfx` di definisi event itu
// sendiri (lihat resepEfek di room.js). Event yang tahu bunyinya sendiri
// tidak boleh dikalahkan tebakan; skrip ini malah ikut mencatatnya supaya
// tidak ditulis dua kali.
//
// Pakai:
//   node selaras-suara.mjs             tulis ulang public/event/99-suara.js
//   node selaras-suara.mjs --periksa   exit 1 kalau berkasnya belum selaras
//                                      (untuk CI — tidak menulis apa pun)
//   node selaras-suara.mjs --papan     papan skor: berapa event per resep

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { muatKonteks } from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KATALOG = path.join(__dirname, 'event-acak.json');
const KELUARAN = path.join(__dirname, 'public', 'event', '99-suara.js');
const MANIFEST = path.join(__dirname, 'public', 'event', 'manifest.json');

/* Kosakata EFEK di room.js. Ditulis ulang di sini supaya skrip bisa menolak
   resep yang salah ketik SEBELUM berkasnya ditulis; uji-suara.mjs yang
   menjaga daftar ini tetap sama dengan kamus yang sungguhan (kasus lint) —
   jadi menghapus satu resep di room.js tanpa mengubah sini akan ketahuan
   waktu `npm test`, bukan waktu ruangannya diam tanpa sebab. */
export const KOSAKATA = new Set([
  'nada', 'nadaTurun', 'nadaGanda',
  'bel', 'bip', 'bipGagal', 'klik', 'ketuk', 'derit', 'debum', 'gedebuk',
  'pecah', 'kertas', 'sobek', 'gores', 'stempel', 'laci', 'kursi', 'printer',
  'dengung', 'neon', 'padam', 'nyala', 'kipas', 'getar', 'dering', 'sirene',
  'tetes', 'guyur', 'air', 'sapu', 'langkah', 'pintu', 'angin', 'gemuruh',
  'tepuk', 'sorak', 'meong', 'kicau', 'lalat', 'denting', 'plastik', 'logam',
  'petik', 'jepret', 'sunyi',
]);

/* Aturan kata kunci, DIURUT dari yang paling khusus. Dicocokkan dua kali:
   dulu ke catatan `suara` di katalog (paling dekat dengan maksud desainer),
   baru ke id + nama event (yang selalu ada, termasuk buat 31 event gelombang
   terakhir yang belum masuk katalog).

   Makhluk disebut paling dulu, bahkan sebelum aturan cuaca: capung yang
   masuk SEBELUM hujan itu capung, bukan hujan. */
const ATURAN = [
  // makhluk
  [/kucing/, 'meong'],
  [/burung|walet|pipit|merpati|gereja(?!an)/, 'kicau'],
  [/kecoa|lalat|nyamuk|laron|serangga|kupu-kupu|capung/, 'lalat'],
  [/cicak|tokek/, 'klik'],
  [/tikus|laba-laba|semut|kadal|cecurut/, 'kertas'],
  [/ayam|kambing|anjing/, 'sorak'],

  /* Hujan, petir, dan guntur SUDAH punya suaranya sendiri di halaman
     (aturSuaraHujan/gemuruh, yang mengikuti /cuaca sungguhan). Menambah bunyi
     kedua di atasnya bukan bikin ramai, bikin BOHONG: yang terdengar jadi dua
     petir untuk satu kilat. */
  [/hujan|petir|guntur|gerimis|kilat/, 'sunyi'],

  /* Kata pendek SELALU dikurung `\b` di DUA sisi. Batas belakang saja itu
     jebakan yang sudah menggigit sekali: `pel\b` ikut mengenai "ditempel" dan
     "panel", `bel\b` mengenai "label", `lap\b` mengenai "gelap", `wa\b`
     mengenai "bawa", `lan\b` mengenai "pelan". Salahnya tidak pernah kelihatan
     — yang terjadi cuma satu event berbunyi keliru, dan tidak ada yang tahu
     bunyi yang benar seperti apa. */
  [/tetes|netes|menetes|rembes|bocor/, 'tetes'],
  [/tumpah|luber|siram|guyur|\bpel\b|ngepel|banjir|basah/, 'guyur'],
  [/galon|dispenser|isi ulang air/, 'air'],

  // pecah, jatuh, roboh
  [/pecah|beling|retak kaca|gelas jatuh/, 'pecah'],
  [/roboh|ambruk|berhamburan|tumbang|patah|jatuh|terjatuh|dus|kardus|debum|tumpul/, 'gedebuk'],

  // kertas & alat tulis
  [/sobek|robek/, 'sobek'],
  [/stempel|\bcap\b|dicap|paraf|bantalan/, 'stempel'],
  [/gores|pena|pulpen|tanda tangan|teken|ttd|coret/, 'gores'],
  [/kertas|lembar|berkas|\bmap\b|arsip lembaran|dokumen|fotokopi|salinan|undangan|surat|nota|disposisi|amplop/, 'kertas'],
  [/printer|cetak|ngeprint|print/, 'printer'],
  [/laci|filing|lemari|kabinet|rak arsip/, 'laci'],

  // pintu, langkah, kursi
  [/derit|engsel|berderit/, 'derit'],
  [/pintu|kusen|ambang|masuk ruang|keluar ruang/, 'pintu'],
  [/ketuk|mengetuk|ketokan/, 'ketuk'],
  [/kursi|duduk|geser kursi|bangku/, 'kursi'],
  [/langkah|jalan kaki|papasan|keliling|lorong|koridor|berjalan/, 'langkah'],
  [/sapu|menyapu|ijuk|\blap\b|dilap|bersih-bersih|vakum/, 'sapu'],

  // listrik & mesin
  [/\bups\b/, 'bip'],
  [/absen|finger|sidik jari|mesin absensi/, 'bip'],
  [/neon|tabung lampu|lampu sebelah/, 'neon'],
  [/padam|mati lampu|pemadaman|listrik mati|token listrik|pln/, 'padam'],
  [/genset|gempa|truk|getaran besar|guncang/, 'gemuruh'],
  [/menyala kembali|nyala lagi|hidup lagi|restart|booting/, 'nyala'],
  [/kipas|baling|\bac\b|pendingin/, 'kipas'],
  [/dengung|berdengung|stabilizer|trafo|ballast|hum/, 'dengung'],
  [/telepon|dering|interkom|panggilan masuk/, 'dering'],
  [/getar|bergetar|\bhp\b|ponsel|whatsapp|\bwa\b|notifikasi hp/, 'getar'],
  [/sirene|ambulans|pemadam|patwal|voorijder/, 'sirene'],
  [/kabel|\blan\b|utp|switch|router|jaringan|internet|wifi|sinyal|server|patch panel/, 'dengung'],
  [/saklar|tombol|klik|colok|steker|terminal/, 'klik'],
  [/layar|laptop|monitor|ketikan|keyboard|mengetik/, 'klik'],

  /* Tamu tenar (gelombang terakhir, 31 event tanpa baris katalog) disebut
     lewat ciri-cirinya, tidak pernah namanya — jadi bunyinya pun ikut ciri
     itu: yang membawa alat musik dipetik, yang berkamera menjepret, yang
     atlet disambut sorak. Tanpa aturan ini semuanya jatuh ke 'langkah' yang
     sama dan seluruh gelombangnya terdengar identik. */
  [/pemusik|penyanyi|rapper|vokalis|gitar|harmonika|biola|pianis|dangdut|orkes/, 'petik'],
  // CCTV punya kamera tapi tidak pernah menjepret — yang terdengar motornya
  [/cctv|kamera pengawas|kamera berbalik/, 'klik'],
  [/kreator|konten|motret|memotret|kamera|fotografer|wartawan|selfie|rekam/, 'jepret'],
  [/atlet|kiper|\bbek\b|lifter|pebulutangkis|pemanjat|pembalap|jersey|timnas|juara|medali/, 'sorak'],

  // orang ramai
  [/tepuk|bertepuk|applause/, 'tepuk'],
  [/sorak|yel|riuh|heboh|rame|ramai|teriak/, 'sorak'],
  [/ulang tahun|syukuran|tumpeng|perayaan|selamat|\bhut\b|potong kue|halal ?bihalal|arisan/, 'tepuk'],
  [/sambutan|amanat|pengarahan|apel|upacara|pidato|aba-aba/, 'denting'],
  [/rapat|pleno|zoom|daring|meeting|briefing/, 'kursi'],

  // benda kecil
  [/gelas|sendok|cangkir|piring|denting|kopi|\bteh\b|minum/, 'denting'],
  [/plastik|kresek|bungkus|gorengan|jajan|snack|kue/, 'plastik'],
  [/apar|logam|besi|tangga|tiang|kunci|gembok|troli|lemari besi|brankas/, 'logam'],
  [/angin|jendela|gorden|tirai|berkas cahaya|awan|mendung|senja|sore|magrib/, 'angin'],
  [/\bbel\b|loket|antre|antrean|nomor urut/, 'bel'],
];

/* Kalau tidak satu pun aturan mengena: bunyi bawaan per kategori katalog.
   Sengaja ada — event tanpa bunyi sama sekali itu event yang tidak terdengar
   terjadi, dan permintaannya memang "tiap event ada suaranya". */
const BAWAAN_KATEGORI = {
  birokrasi: 'kertas',
  infrastruktur: 'dengung',
  insiden: 'gedebuk',
  'hewan-tamu': 'kertas',
  'kultur-kantor': 'kursi',
  'meta-claude': 'klik',
  perayaan: 'tepuk',
  suasana: 'angin',
  'cuaca-waktu': 'angin',
  'easter-egg': 'denting',
};
// 31 event gelombang terakhir belum punya baris katalog; hampir semuanya
// "tamu tenar" yang datang bertamu, jadi bunyinya bunyi orang yang masuk.
const BAWAAN_TANPA_KATALOG = 'langkah';

// blip(1200,.05) / blip(880, .05) — angka yang memang ditulis desainernya
const RX_BLIP = /blip\(\s*(\d+)\s*,\s*(\d*\.\d+|\d+)\s*\)/;

const cocok = (teks) => {
  for (const [rx, resep] of ATURAN) if (rx.test(teks)) return resep;
  return '';
};

/* Satu resep untuk satu event. Urutannya sengaja: kata kunci DULU, angka
   blip belakangan. `blip(600,.04) tiap lembar keluar` itu catatan yang
   menyebut bendanya (lembar kertas keluar dari mesin fotokopi) dan angkanya
   cuma penanda "ada bunyi kecil di sini" — menerjemahkannya jadi nada telanjang
   600 Hz membuang keterangan yang justru paling berguna. Angkanya baru dipakai
   kalau tidak ada satu pun benda yang bisa dikenali. */
export function resepUntuk(e) {
  const catatan = String(e.suara || '').toLowerCase();
  const nama = (String(e.id) + ' ' + String(e.nama || '')).toLowerCase();

  const dariCatatan = cocok(catatan);
  if (dariCatatan) return { resep: dariCatatan, sebab: 'catatan' };

  const dariNama = cocok(nama);
  if (dariNama) return { resep: dariNama, sebab: 'nama' };

  const m = catatan.match(RX_BLIP);
  if (m) {
    const f = Number(m[1]);
    const d = Number(m[2]);
    if (Number.isFinite(f) && f >= 40 && f <= 8000 && d > 0 && d <= 2) {
      const turun = /turun|gagal|ditolak|rendah/.test(catatan);
      return { resep: [turun ? 'nadaTurun' : 'nada', f, d], sebab: 'blip' };
    }
  }

  if (!e.kategori) return { resep: BAWAAN_TANPA_KATALOG, sebab: 'bawaan' };
  return { resep: BAWAAN_KATEGORI[e.kategori] || 'klik', sebab: 'bawaan' };
}

function bangun() {
  const ctx = muatKonteks();
  const terdaftar = ctx.__jembatan__.EVENT_ACAK || [];
  const katalog = JSON.parse(fs.readFileSync(KATALOG, 'utf8')).events || [];
  const dariKatalog = new Map(katalog.map((e) => [e.id, e]));

  const peta = [];
  const papan = {};
  let punyaSfx = 0;
  for (const def of terdaftar) {
    // `sfx` di definisinya sudah jadi jawaban; tidak perlu ditulis dua kali
    if (def.sfx) { punyaSfx++; continue; }
    const e = dariKatalog.get(def.id) || { id: def.id };
    const { resep } = resepUntuk(e);
    const kunci = Array.isArray(resep) ? resep[0] : resep;
    if (!KOSAKATA.has(kunci)) throw new Error('resep tidak dikenal: ' + kunci + ' (' + def.id + ')');
    papan[kunci] = (papan[kunci] || 0) + 1;
    peta.push([def.id, resep]);
  }
  return { peta, papan, punyaSfx, terdaftar: terdaftar.length };
}

const kutip = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const nilai = (r) => (Array.isArray(r)
  ? '[' + kutip(r[0]) + ', ' + r.slice(1).join(', ') + ']'
  : kutip(r));

function tulisTeks(h) {
  const lebar = Math.max(...h.peta.map(([id]) => id.length)) + 3;
  const baris = h.peta.map(([id, r]) => '  ' + (kutip(id) + ':').padEnd(lebar) + ' ' + nilai(r) + ',');
  return [
    '/* agent-room :: bunyi tiap event acak — DIHASILKAN selaras-suara.mjs.',
    '   JANGAN disunting tangan: jalankan `node selaras-suara.mjs` sesudah',
    '   menambah event, dan `npm test` akan menolak kalau berkas ini basi.',
    '',
    '   Isinya id event -> resep di kamus EFEK (room.js). Resepnya nama BENDA,',
    '   bukan nama event: 337 kejadian tidak butuh 337 bunyi, yang dibutuhkan',
    '   cuma cukup kosakata untuk membedakan "ada yang jatuh" dari "ada yang',
    '   mengetuk pintu". Asal terjemahannya kolom `suara` di event-acak.json —',
    '   catatan desain rapat, jadi bunyinya keputusan lama yang dipakai ulang,',
    '   bukan tebakan baru.',
    '',
    '   Event boleh menimpanya lewat medan `sfx` di definisinya sendiri; yang',
    '   begitu sengaja TIDAK ikut di daftar ini supaya tidak ditulis dua kali.',
    '',
    '   ' + h.peta.length + ' event di sini, ' + h.punyaSfx + ' pakai `sfx` sendiri, dari '
      + h.terdaftar + ' yang terdaftar. */',
    'daftarSuaraEvent({',
    ...baris,
    '});',
    '',
  ].join('\r\n');
}

function papanSkor(h) {
  const urut = Object.entries(h.papan).sort((a, b) => b[1] - a[1]);
  console.log('  ' + h.peta.length + ' event dipetakan, ' + h.punyaSfx + ' pakai `sfx` sendiri');
  for (const [k, n] of urut) console.log('    ' + k.padEnd(12) + String(n).padStart(4));
}

function main() {
  const argv = process.argv.slice(2);
  const h = bangun();
  const teks = tulisTeks(h);

  if (argv.includes('--papan')) { papanSkor(h); return; }

  let lama = '';
  try { lama = fs.readFileSync(KELUARAN, 'utf8'); } catch { lama = ''; }

  if (argv.includes('--periksa')) {
    if (lama === teks) {
      console.log('  selaras-suara: public/event/99-suara.js selaras ('
        + h.peta.length + ' event)');
      return;
    }
    console.log('  selaras-suara: public/event/99-suara.js BELUM selaras —'
      + ' jalankan `node selaras-suara.mjs`');
    process.exit(1);
  }

  if (lama === teks) { console.log('  selaras-suara: sudah selaras, tidak ada yang ditulis'); return; }
  fs.writeFileSync(KELUARAN, teks);
  console.log('  selaras-suara: public/event/99-suara.js ditulis ulang ('
    + h.peta.length + ' event)');

  // Berkas baru tidak berguna kalau tidak disambung — manifest yang memutuskan
  // apa yang benar-benar dikirim ke halaman.
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (!man.berkas.includes('99-suara.js')) {
    man.berkas.push('99-suara.js');
    fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2) + '\n');
    console.log('  selaras-suara: 99-suara.js didaftarkan di manifest.json');
  }
}

/* Cuma jalan kalau memang DIPANGGIL, bukan kalau di-import. uji-suara.mjs
   mengimpor resepUntuk/KOSAKATA dari sini untuk lintnya; tanpa penjaga ini,
   `npm test` diam-diam menulis ulang 99-suara.js dan manifest.json — uji yang
   mengubah repo itu uji yang tidak bisa dipercaya. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
