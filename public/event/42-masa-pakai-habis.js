/* ==========================================================================
   MASA PAKAI HABIS — dibereskan orang, bukan lenyap
   ==========================================================================
   Bekas yang punya masa pakai (BEKAS_MASA di room.js) dulu kembali ke nilai
   bawaannya diam-diam begitu masanya lewat: keset yang tadi ada di depan
   pintu kadis tahu-tahu tidak ada. Penonton yang kebetulan melihat cuma
   mendapati barang menghilang dari satu frame ke frame berikutnya.

   Sekarang masa pakai yang lewat membuat bekasnya JATUH TEMPO selama
   BEKAS_TENGGANG_MS (12 jam), dan event di sini yang membereskannya: seorang
   pegawai datang ke barangnya, mengerjakan satu hal yang masuk akal (keset
   digulung, kartu APAR dicabut, piala dimasukkan boks), memanggil
   kembalikanBekas(), lalu — kalau barangnya memang dibawa pergi — mengantarnya
   ke gudang ATK. Satu barang per kejadian, yang paling lama lewat lebih dulu
   (urutan bekasJatuhTempo). Buku riwayat mencatat kalimatnya sendiri karena ia
   membaca bekas, bukan event.

   Kalau tidak ada yang sempat (halaman ditutup, tidak ada yang menganggur),
   kedaluwarsakanBekas() tetap mengembalikannya sesudah tenggang. Foto miring
   dan karpet yang kusam lagi SENGAJA tidak punya adegan: tidak ada orang yang
   memudarkan karpet.

   uji-bekas.mjs memeriksa tiap kunci ADEGAN_HABIS menunjuk bekas bermasa.
   ========================================================================== */

const ADEGAN_HABIS = {
  kesetAda: {
    x: 464, y: 124, hadap: 'up', pose: 'jongkok', lama: 3.5, gulung: true, keGudang: true, debu: true,
    kegiatan: 'menggulung keset yang sudah tipis', barang: 'keset', ucap: 'kesetnya sudah tipis, digulung saja',
    peran: ['pramubakti', 'magang'],
  },
  kartuAPAR: {
    x: 335, y: 152, hadap: 'up', pose: 'angkat', lama: 3, bawa: 'kertas',
    kegiatan: 'mencabut kartu inspeksi APAR', barang: 'kartu', ucap: 'kartu inspeksinya sudah lewat, dicabut dulu',
    peran: ['auditor', 'sandiman', 'teknisi'],
  },
  piala: {
    x: 72, y: 138, hadap: 'up', pose: 'duaangkat', lama: 3, bawa: 'boks', keGudang: true,
    kegiatan: 'memasukkan piala voli ke boks', barang: 'piala', ucap: 'pialanya pindah ke gudang dulu, gantian',
  },
  plangBaru: {
    x: 452, y: 152, hadap: 'up', pose: 'duaangkat', lama: 4, bawa: 'papan', keGudang: true,
    kegiatan: 'menurunkan plang ruang kadis', barang: 'plang', ucap: 'nomenklaturnya ganti lagi, plangnya turun',
  },
  bukuTamu: {
    x: 59, y: 304, hadap: 'up', pose: null, lama: 2.5, bawa: 'buku', keGudang: true,
    kegiatan: 'mengganti buku tamu yang penuh', barang: 'buku tamu lama', ucap: 'bukunya penuh, ganti yang baru',
  },
  baganKotak: {
    x: 118, y: 152, hadap: 'up', pose: 'angkat', lama: 3.5, bawa: 'kertas',
    kegiatan: 'melepas tempelan bagan struktur', barang: 'tempelan', ucap: 'bagannya dicetak ulang, tempelannya dilepas',
    peran: ['humas'],
  },
  labelPatch: {
    stasiun: 'server', pose: 'jongkok', lama: 4, bawa: 'kertas',
    kegiatan: 'mencopot label patch panel', barang: 'label', ucap: 'patch panelnya ditata ulang, labelnya dicopot',
    peran: ['teknisi', 'pranata_muda', 'analis_sistem'],
  },
  kabelRapi: {
    stasiun: 'server', pose: 'jongkok', lama: 4,
    kegiatan: 'menarik kabel perangkat baru', barang: 'kabel', ucap: 'kabel printer barunya ditarik lewat sini dulu',
    peran: ['teknisi', 'pranata_muda', 'analis_sistem'],
  },
  stikerTertempel: {
    x: 30, y: 152, hadap: 'up', pose: 'angkat', lama: 3, bawa: 'kertas',
    kegiatan: 'mencabut stiker inventaris lama', barang: 'stiker', ucap: 'stiker lama dicabut, tunggu pendataan baru',
  },
  spanduk: {
    x: 60, y: 152, hadap: 'up', pose: 'duaangkat', lama: 4,
    kegiatan: 'memasang huruf papan nama', barang: 'huruf', ucap: 'hurufnya sudah datang dari percetakan',
  },
  catMengelupas: {
    x: 200, y: 152, hadap: 'up', pose: 'duaangkat', lama: 4, debu: true,
    kegiatan: 'mengecat dinding yang mengelupas', barang: 'kaleng cat', ucap: 'sekalian dicat ulang, biar tidak ditambal kertas terus',
  },
};

daftarEvent(

{
  id: 'bekas-habis-masa-pakai',
  kelas: 'latar', bobot: B.sering, cooldown: 90, durasi: 75,
  babak: { kerja: 1, istirahat: 0.6, apel: 0, lembur: 0.4, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 7.5 && S.jam < 17 && bekasJatuhTempo().some((k) => k in ADEGAN_HABIS)
    && S.orang.some((o) => bisaDipinjam(o)),
  perluAktor: true,
  mulai(E) {
    // ?event= melewati syarat: tanpa yang jatuh tempo tidak ada yang dibereskan
    const k = bekasJatuhTempo().find((x) => x in ADEGAN_HABIS);
    if (!k) { E.selesaiCepat = true; return; }
    const A = ADEGAN_HABIS[k];
    const a = pemeran(E, A.peran);
    if (!a) return;
    Object.assign(E.data, { a, k, A, tahap: 'datang' });
    a.doingEvent = A.kegiatan;
    if (A.stasiun) a.goTo(A.stasiun); else a.goToXY(A.x, A.y, A.hadap);
  },
  tick(E) {
    const T = E.data;
    const a = masihMain(E, T.a) ? T.a : null;
    if (!a) { E.selesaiCepat = true; return; }
    if (!a.diam) return;
    if (T.tahap === 'datang') {
      T.tahap = 'kerja';
      T.lanjutPada = E.umur + T.A.lama;
      a.pose = T.A.pose || null;
      a.say(T.A.ucap);
      if (T.A.debu) for (let i = 0; i < 3; i++) spawn('dust', a.x, a.y - 4);
      return;
    }
    if (T.tahap === 'kerja') {
      if (E.umur < T.lanjutPada) return;
      a.pose = null;
      // buku riwayat mencatat kalimatnya sendiri; false = sudah dikembalikan jalur lain
      if (!kembalikanBekas(T.k)) { E.selesaiCepat = true; return; }
      if (T.A.gulung) T.dibawa = 'keset'; else if (T.A.bawa) a.bawa = T.A.bawa;
      if (T.A.keGudang) {
        T.tahap = 'gudang';
        a.doingEvent = 'membawa ' + T.A.barang + ' ke gudang';
        a.goToXY(GUDANG.titikX, GUDANG.titikY, 'up');
      } else {
        T.tahap = 'selesai';
        T.pulangPada = E.umur + 1.5;
      }
      return;
    }
    if (T.tahap === 'gudang') {
      T.tahap = 'selesai';
      T.pulangPada = E.umur + 1.2;
      T.dibawa = null;
      a.bawa = null;
      return;
    }
    if (T.tahap === 'selesai' && E.umur > T.pulangPada) E.selesaiCepat = true;
  },
  // Keset yang digulung dijinjing melintasi separuh ruangan: digambar di atas
  // segalanya, pola yang sama dengan kursi di kursi-rapat-rusak-diganti.
  gambarAtas(E) {
    const a = E.data.a;
    if (E.data.dibawa !== 'keset' || !a || a.eventKerja !== E) return;
    const x = Math.round(a.x) + 3, y = Math.round(a.y) - 20;
    r(x, y, 11, 4, '#3f4a3a');
    r(x, y, 11, 1, '#5a6a4a');
    r(x, y, 1, 4, '#7a2020'); r(x + 10, y, 1, 4, '#7a2020');
  },
  selesai(E) {
    const a = E.data.a;
    if (a) { a.pose = null; a.bawa = null; }
    E.data.dibawa = null;
  },
},

);
