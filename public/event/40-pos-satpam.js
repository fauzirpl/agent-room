/* ==========================================================================
   POS SATPAM — tiga kejadian di meja jaga yang baru
   ==========================================================================
   Pos satpam (POS_SATPAM di room.js, samping pintu masuk kiri x2..28
   y266..312) lahir sebagai tempat pulang rutinitas patroli, tapi seperti pojok baca
   kemarin, perabot baru tidak punya kejadiannya sendiri. Tiga di sini: tamu
   yang lapor ke pos lalu diarahkan balik ke loket, petugas ronda malam yang
   titip laporan di buku mutasi pagi-pagi, dan penjaga pos yang ketiduran.

   PENJAGANYA pegawai sungguhan, bukan orang luar: pemeran(E, ['satpam'])
   mendahulukan standby berperan satpam (peran itu menempel sejak giliran
   patroli pertamanya, lihat mulaiSatpam), dan kalau belum ada, siapa pun yang
   menganggur jadi "piket jaga pos". Beda dari satpam-patroli (berkas 21) yang
   satpamnya orang luar gambarOrangLuar — makanya ketiganya bentrok dengan
   event itu: dua satpam di ruangan yang sama membuat yang satu tampak seperti
   penyusup.

   TAMUNYA orang luar, masuk lewat PINTU MASUK — tepi kiri di lajur bawah,
   persis jalan masuk pegawai, dan di 3D persis ambang berkusen di dinding
   kiri — lalu turun ke samping kanan meja (x35, y302), di celah antara meja
   jaga dan meja buku tamu (x52). Dulu, waktu posnya masih di pojok kanan
   bawah, tamunya masuk dari tepi kanan di y=334: di 3D itu tembok pejal.
   Samping meja, bukan depannya: gambarOrangLuar selalu menghadap penonton,
   jadi tamu yang berdiri di depan meja akan membelakangi penjaganya.

   Standby tidak bisa bicara (say() dibungkam), jadi yang bercerita di sini
   gerak: tinta di buku mutasi, telunjuk ke arah ruangan, HT yang berbunyi.
   Kalimatnya dibacakan narasi-event.json.
   ========================================================================== */

// Titik-titik yang dipakai ketiga event; semuanya diturunkan dari POS_SATPAM.
const POS_TAMU = { masukY: LANE_DOWN, x: POS_SATPAM.x + POS_SATPAM.w + 7, y: POS_SATPAM.y + 36 };   // samping kanan meja jaga
const POS_BUKU = { x: POS_SATPAM.x + 10, y: POS_SATPAM.y + 30 };    // buku mutasi jaga di daun meja
const POS_HT = { x: POS_SATPAM.x + 19, y: POS_SATPAM.y + 24 };      // HT berdiri di ujung meja
const BENTROK_TAMU = [
  'satpam-patroli', 'buku-tamu-ditandatangani', 'tamu-di-ruang-tunggu', 'tamu-nyasar',
  'tamu-salah-alamat', 'pemohon-surat-di-loket', 'tamu-dinas-kabupaten', 'rombongan-studi-banding',
];

/* Satu langkah orang luar di dua ruas siku: masuk = pintu kiri -> x samping
   meja di lajur bawah, lalu turun ke samping meja; pulang = kebalikannya.
   Mengembalikan true kalau sudah sampai. */
function langkahTamuPos(T, dt, arah) {
  if (arah === 'masuk') {
    if (T.x < POS_TAMU.x) { T.x = Math.min(POS_TAMU.x, T.x + 46 * dt); return false; }
    T.y = Math.min(POS_TAMU.y, T.y + 40 * dt);
    return T.y >= POS_TAMU.y;
  }
  if (T.y > POS_TAMU.masukY) { T.y = Math.max(POS_TAMU.masukY, T.y - 40 * dt); return false; }
  T.x -= 46 * dt;
  return T.x < -16;
}

daftarEvent(

/* Tamu lapor ke pos. Mengisi buku mutasi, ditunjuki arah, lalu keluar lagi
   lewat jalan yang sama — ke loket depan, bukan langsung ke dalam. Tidak ada
   punchline; yang dikejar rasa prosedur: bahkan tamu yang sudah sampai di
   pojok kantor tetap diputar balik ke pintu yang benar. */
{
  id: 'tamu-lapor-ke-pos',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 44,
  babak: { kerja: 1.2, istirahat: 0.5, apel: 0, pulang: 0.3, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 8 && S.jam < 15.5 && S.orang.some((o) => bisaDipinjam(o)),
  bentrokDengan: [...BENTROK_TAMU, 'laporan-ronda-di-pos', 'jaga-pos-ketiduran'],
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['satpam']);
    if (!a) return;
    E.data.a = a;
    a.doingEvent = 'jaga pos, menerima tamu';
    a.goToXY(POS_SATPAM.titikX, POS_SATPAM.titikY, 'down');
    E.data.t = { x: -14, y: POS_TAMU.masukY, fase: 'masuk' };
    E.data.tinta = 0;
  },
  tick(E, dt, S) {
    const T = E.data.t;
    if (!T) return;
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (T.fase === 'masuk') {
      if (!langkahTamuPos(T, dt, 'masuk')) return;
      T.fase = 'lapor';
      // Tenggat MUTLAK disimpan sekali (lihat catatan pada() di berkas 29).
      E.data.menyerahPada = E.umur + 14;
      menoleh(S.orang.filter((o) => !o.eventKerja && jarakKe(o, POS_TAMU.x, POS_TAMU.y) < 90),
        POS_TAMU.x, POS_TAMU.y, 1400);
      return;
    }
    if (T.fase === 'lapor') {
      /* Jam lapor mulai saat PENJAGANYA sudah berdiri di pos, bukan saat tamu
         tiba. Versi pertama menghitung dari tibanya tamu, dan penjaga yang
         berangkat dari tengah ruangan baru sampai ±10 detik kemudian — sesudah
         tenggat 8 detik lewat. Akibatnya ketiga coretan tinta keluar dalam
         SATU frame dan tamu langsung pulang: adegannya terlipat habis. */
      if (a && a.diam && E.data.laporMulai == null) E.data.laporMulai = E.umur;
      if (E.data.laporMulai != null) {
        const lewat = E.umur - E.data.laporMulai;
        if (a && a.diam) {
          // Tiga coretan tinta di buku mutasi, satu tiap 2 detik; sesudahnya
          // penjaga menunjuk ke arah ruangan — "loketnya di depan, Pak".
          const mau = Math.min(3, Math.floor(lewat / 2));
          while (E.data.tinta < mau) { E.data.tinta++; spawn('ink', POS_BUKU.x + acak(-2, 2), POS_BUKU.y); }
          a.pose = lewat > 6 ? 'nunjuk' : null;
        }
        if (lewat > 9) { T.fase = 'pulang'; if (a) a.pose = null; }
      } else if (E.umur > E.data.menyerahPada) {
        // Penjaganya tidak kunjung sampai (atau direbut tool call): tamu tidak
        // menunggu selamanya.
        T.fase = 'pulang';
        if (a) a.pose = null;
      }
      return;
    }
    if (T.fase === 'pulang' && langkahTamuPos(T, dt, 'pulang')) E.selesaiCepat = true;
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -16) return;
    gambarOrangLuar(Math.round(T.x), Math.round(T.y) + (T.fase === 'lapor' ? 1 : 0),
      '#4a6a8a', null, T.fase === 'masuk' ? 'map' : null);
  },
  sortY: POS_SATPAM.y + 43,                    // sesudah meja jaga (y+42): tamu di sampingnya, tidak tertutup
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

/* Laporan ronda malam. Pagi-pagi, petugas ronda (orang luar, seragam khaki,
   senter masih di tangan) mampir ke pos, menandatangani buku mutasi bersama
   penjaga pagi, menyerahkan laporannya, lalu pulang. Satu-satunya kejadian
   pagi di pos — sebelum apel, dan tidak saat apel. */
{
  id: 'laporan-ronda-di-pos',
  kelas: 'latar', bobot: B.jarang, cooldown: 7200, durasi: 46,
  babak: { apel: 0, istirahat: 0, pulang: 0, lembur: 0, malam: 0.6, libur: 0.6 },
  syarat: (S) => S.jam >= 6 && S.jam < 9 && S.orang.some((o) => bisaDipinjam(o)),
  bentrokDengan: [...BENTROK_TAMU, 'tamu-lapor-ke-pos', 'jaga-pos-ketiduran'],
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['satpam']);
    if (!a) return;
    E.data.a = a;
    a.doingEvent = 'terima laporan ronda malam';
    a.goToXY(POS_SATPAM.titikX, POS_SATPAM.titikY, 'down');
    E.data.t = { x: -14, y: POS_TAMU.masukY, fase: 'masuk' };
    E.data.tinta = 0;
  },
  tick(E, dt) {
    const T = E.data.t;
    if (!T) return;
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (T.fase === 'masuk') {
      if (!langkahTamuPos(T, dt, 'masuk')) return;
      T.fase = 'serah';
      E.data.menyerahPada = E.umur + 14;
      return;
    }
    if (T.fase === 'serah') {
      // Sama seperti tamu-lapor-ke-pos: jamnya mulai saat penjaga sudah di pos.
      if (a && a.diam && E.data.serahMulai == null) E.data.serahMulai = E.umur;
      if (E.data.serahMulai != null) {
        const lewat = E.umur - E.data.serahMulai;
        if (a && a.diam) {
          // dua tanda tangan (yang pulang, lalu yang jaga), lalu penjaga menerima laporannya
          const mau = Math.min(2, Math.floor(lewat / 3));
          while (E.data.tinta < mau) { E.data.tinta++; spawn('ink', POS_BUKU.x + (E.data.tinta === 1 ? -3 : 3), POS_BUKU.y); }
          a.pose = lewat > 7 ? 'angkat' : null;
          if (lewat > 7 && !E.data.terima) { E.data.terima = true; spawn('paper', POS_TAMU.x + 6, POS_TAMU.y - 18); }
        }
        if (lewat > 10) { T.fase = 'pulang'; if (a) a.pose = null; }
      } else if (E.umur > E.data.menyerahPada) {
        T.fase = 'pulang';
        if (a) a.pose = null;
      }
      return;
    }
    if (T.fase === 'pulang' && langkahTamuPos(T, dt, 'pulang')) E.selesaiCepat = true;
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -16) return;
    gambarOrangLuar(Math.round(T.x), Math.round(T.y), '#6b5a3a', null,
      T.fase === 'serah' ? null : 'senter', '#20242c');
  },
  sortY: POS_SATPAM.y + 43,
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

/* Penjaga pos ketiduran. Sesudah makan siang atau waktu lembur, penjaga di
   meja jaga terkantuk-kantuk (partikel 'kantuk' yang sudah ada), sampai HT di
   mejanya berbunyi dan dia tersentak bangun. HT-nya yang menutup adegan,
   bukan orang lain: pos itu memang tempat yang sepi. */
{
  id: 'jaga-pos-ketiduran',
  kelas: 'latar', bobot: B.jarang, cooldown: 3600, durasi: 34,
  sfx: 'sunyi',
  babak: { lembur: 2, malam: 2.5, istirahat: 0.8, kerja: 0.3, apel: 0, pulang: 0.4 },
  syarat: (S) => ((S.jam >= 13 && S.jam < 14.5) || S.jam >= 18 || S.jam < 6)
    && S.orang.some((o) => bisaDipinjam(o)),
  bentrokDengan: ['satpam-patroli', 'tamu-lapor-ke-pos', 'laporan-ronda-di-pos'],
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['satpam']);
    if (!a) return;
    E.data.a = a;
    a.doingEvent = 'jaga pos';
    a.goToXY(POS_SATPAM.titikX, POS_SATPAM.titikY, 'down');
  },
  tick(E, dt) {
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (!a) { E.selesaiCepat = true; return; }
    if (!a.diam) return;
    if (E.data.tidurSejak == null) E.data.tidurSejak = E.umur;
    if (!E.data.kaget) {
      if (E.umur - E.data.tidurSejak < 14) {
        a.pose = 'ngantuk';
        if (Math.random() < 0.8 * dt) spawn('kantuk', a.x + 6, a.y - 26);
        return;
      }
      E.data.kaget = true;                     // HT berbunyi
      E.data.bubarPada = E.umur + 4;
      a.pose = 'hormat';                       // tersentak tegak, refleks siap
      for (let i = 0; i < 4; i++) spawn('ping', POS_HT.x, POS_HT.y);
      blip(880, 0.08);
      return;
    }
    if (E.umur > E.data.bubarPada - 2) a.pose = null;
    if (E.umur > E.data.bubarPada) E.selesaiCepat = true;
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

);
