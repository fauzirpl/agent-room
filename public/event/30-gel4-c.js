/* ==========================================================================
   BERKAS YANG BERPUTAR & KABAR DARI PUSAT
   ==========================================================================
   Dua event birokrasi yang sama-sama pernah divonis "mahal", dan sama-sama
   ternyata cuma butuh pola yang SUDAH terbukti di katalog — bukan mesin baru.

   1. oper-berkas-berantai. Katalog sudah punya potongan-potongannya
      (serah-terima-map-antar-bidang: satu operan lalu berhenti;
      nota-dinas-keliling: satu pembawa keliling semua meja, mapnya tidak
      pernah pindah tangan; map-tertukar-ditukar-balik: 4 detik, dua orang,
      tanpa map yang digambar) tapi tidak satu pun menunjukkan LINGKARANNYA
      MENUTUP. Keberatan lama "butuh antrean tujuan per-agen" tidak berlaku:
      tahap bernomor yang maju begitu a.diam sudah dipakai nota-dinas-keliling,
      sandiman-razia-sandi, dan kasi-inspeksi-meja-staf. Tidak ada prop baru,
      tidak ada gambar, tidak ada sortY — mapnya a.bawa 'map-kuning' yang
      memang sudah digambar drawBawaan.

   2. nota-dinas-dari-pusat. Tidak ada satu pun dari 302 event terpasang yang
      menyala pada CAPAIAN BULAT ruangan; audit-token membaca toolCount tapi
      sekali saja dan nadanya menegur boros, bukan merayakan. Vonis "mahal"
      gugur seluruhnya: toolCount sudah global di room.js, drawKadis(active)
      sudah membaca MOD.pintuKadis, dan goToXY + tahap bernomor sudah ada.

   ANGGARAN WAKTU (aturan 11) untuk keduanya.

     * oper-berkas. DUA versi sebelumnya sama-sama menakar dengan satu angka
       durasi, dan dua-duanya meleset ke arah yang sama, karena durasi memang
       konstanta yang berlomba dengan trayek yang panjangnya tidak dia batasi.
       Versi pertama (durasi 36) membiarkan map kuning lenyap dari tangan orang
       yang sedang melangkah. Versi kedua menaikkannya ke 50 dan memasang batas
       sabar — tapi HANYA di cabang penutup; tiga operan pertama tetap menunggu
       `pemegang.diam` tanpa tenggat apa pun, jadi begitu MOD.lajuGlobal turun,
       pagar durasi membunuh event di cabang yang tidak dijaga dan gejalanya
       kembali persis sama, cuma lewat pintu lain.

       Yang sekarang bukan angka baru, tapi TENGGAT. Tiap kali satu mata rantai
       berangkat, operBerangkat() mengukur a.path yang sungguh-sungguh dipasang
       route() dan memasang E.data.tutupPada dari situ; kaki yang jelas tidak
       muat sebelum pagar tutup tidak pernah dijalani; penjaga tunggu yang sama
       berlaku di SEMUA cabang; dan operTurunkanMap() jadi satu-satunya jalan
       map itu turun dari tangan siapa pun. Durasi tinggal jadi pagar terakhir.

       Sapuannya, bukan sampel acak: 504 penempatan — SEMUA urutan 3 dari 9
       posisi menganggur yang nyata, enam MEJA_KERJA_X di y=350 plus tiga slot
       sudut tunggu (slotKe(k,23) = 282/305/259) di y=288 — dikali kadis
       ada/tidak, dikali DELAPAN pengali laju yang benar-benar bisa terjadi:
       1,00; 0,85 (LAJU_LELAH); 0,85 / 0,80 / 0,70 (MOD.lajuGlobal yang ada di
       katalog) dan hasil kalinya 0,7225 / 0,68 / 0,595. Total 8.064
       percobaan, memakai route() asli, langkah Agent.update() asli (SPEED 52,
       dt 1/60) dan urutan frame() yang asli (event di-tick dulu, pemerannya
       bergerak sesudahnya):
         - map lenyap tanpa satu pun aksi : 0 dari 8.064
           (versi kedua: 4 dari 504 di laju 0,68 dan 20 dari 504 di 0,595,
            sebelas di antaranya tepat di tengah langkah)
         - mati karena pagar durasi       : 0 dari 8.064
           (versi kedua: 117 dari 504 di 0,68 dan 195 dari 504 di 0,595 — di
            kasus-kasus itu 'panggung' kadis-sekdis-rapat-tertutup terkunci
            50 detik penuh, karena bentrok() dua arah)
         - umur terpanjang                : 40,5 detik dari durasi 42
           (p50 32,6-35,2 / p90 37,8-39,5 tergantung laju & ada tidaknya kadis)

       Sapuan kedua, kali ini atas nilai durasinya sendiri — 40/42/44/46/48/50
       dikali tujuh pengali dikali kadis dikali 504 penempatan = 42.336
       percobaan — memberi 0 map lenyap dan 0 mati-karena-pagar di SETIAP nilai
       durasi. Jadi keamanan T1 sekarang tidak bergantung pada angka durasinya
       sama sekali; yang ditentukan angka itu tinggal seberapa sering rantainya
       sempat TUNTAS sampai ke pintu kadis / meja disposisi. Di durasi 42:
       89,7% di laju normal, 72,4% waktu lelah, 23,2% di kasus terburuk 0,595.
       Potongannya juga tidak jatuh sembarangan. Di seluruh 42.336 percobaan
       tidak ada SATU PUN yang putus di operan pertama atau kedua; dan khusus
       di durasi 42 laju normal, seluruh 1.008 percobaan sampai ke tahap 3 —
       jadi kalimat penutup leluconnya ('lho, ini kan yang dari saya tadi?')
       tetap jatuh, yang terpotong cuma perjalanan mengantar terakhirnya.
       (Di durasi 40 angka itu belum nol: 24 dari 1.008 terpotong sebelum
       lingkarannya menutup. Itu yang membedakan 42 dari 40.)

       Kenapa 42 dan bukan 50: bentrok() dua arah, jadi selama event 'latar'
       ini hidup, kadis-sekdis-rapat-tertutup ('panggung', durasi 38) tidak
       bisa menyala sama sekali. Saudara sekandungnya di 31-gel4-d.js
       menurunkan durasinya dengan alasan yang persis sama. Terburuknya
       sekarang 40,5 detik, dan itu bukan pagar yang kebetulan tidak tercapai:
       ia tidak pernah tercapai di 42.336 percobaan.

       Perebutan tool call disapu terpisah: 3.840 percobaan — 4 penempatan x
       3 korban (mata rantai ke-0/1/2) x 80 saat pencurian (detik 0,5 sampai
       40,0, langkah 0,5) x 2 laju (1,00 dan 0,595) x kadis ada/tidak.
       Hasilnya 0 perintah gerak ke orang yang sudah dilepas, 0 map yang
       lenyap diam-diam, dan 0 yang tertinggal memegang map sesudah selesai().
       Yang dulu jadi lubang di situ — penerimanya direbut lalu
       `E.selesaiCepat = true` polos, sehingga selesai() yang menghapus map
       dari tangan pemegang yang MASIH milik event — sekarang lewat
       operTurunkanMap() juga.

     * nota-dinas durasi 26, bukan 20. Anggaran rencana (1,5 + 5 + 10 + 2)
       tidak memasukkan perjalanan pertama ke ambang pintu kadis, yang dari
       sudut kiri ruangan makan ~8 detik. Penjadwalan babak keduanya RELATIF
       terhadap saat rombongan benar-benar terkumpul (E.data.kumpulPada),
       bukan detik absolut 10-16: kalau perjalanannya kebetulan pendek,
       adegannya selesai lebih cepat. Tapi "selesai lebih cepat" saja tidak
       cukup — 800 simulasi: rombongan berkumpul di 13,1..19,0 detik, bubar 7
       detik kemudian, jadi SETIAP percobaan menyisakan 1,0..5,9 detik (median
       4,3) event 'panggung' yang hidup di ruangan yang sudah bubar. Karena
       itu sekarang eventnya benar-benar MEMATIKAN DIRI sesudah bubar, bukan
       cuma selesai lebih cepat di atas kertas: mati di 21,6..26,0 detik.
   ========================================================================== */

/* Ambang capaian berikutnya. Sengaja variabel tingkat-berkas, bukan RUANGAN.*:
   ini bukan keadaan ruangan yang perlu digambar atau bertahan, cuma penanda
   "kelipatan 100 yang mana yang sudah pernah dirayakan" selama halaman hidup.
   Dinaikkan di mulai(), bukan di selesai() — lihat alasannya di sana. */
let notaAmbang = 100;

/* Menghampiri orang lain dari SISI TEMPAT KITA BERADA. Rencana menulis
   `goToXY(tujuan.x - 14, tujuan.y, 'right')` mati-matian dari kiri; kalau
   pembawanya kebetulan sudah di sebelah kanan tujuannya, dia jadi berjalan
   MELEWATI orang yang mau dia hampiri lalu berbalik. Dua baris ini
   menghilangkan seluruh kelakuan itu. */
function operDekati(pembawa, tujuan) {
  const dariKiri = pembawa.x <= tujuan.x;
  pembawa.goToXY(tujuan.x + (dariKiri ? -14 : 14), tujuan.y,
    dariKiri ? 'right' : 'left');
}

// Kalimat penolakan per operan. Yang ketiga bukan penolakan lagi — itu
// pemilik pertama yang mengenali map kuningnya sendiri.
const OPER_UCAP = [
  'ini bukan di saya, Pak',
  'wah, ini bukan kewenangan bidang saya',
  'lho, ini kan yang dari saya tadi?',
];

/* ================================================== TENGGAT DARI TRAYEK ====
   Ronde pertama menambal T1 dengan dua konstanta: durasi dinaikkan 36 -> 50,
   lalu satu batas sabar dipasang — HANYA di cabang penutup. Gejalanya hilang
   di laju 1,00 dan 0,85; penyebabnya tidak. Penyebabnya: satu-satunya yang
   menghentikan rantai ini adalah `durasi`, sebuah konstanta yang berlomba
   dengan trayek yang panjangnya tidak dia batasi. Begitu MOD.lajuGlobal turun,
   pagar durasi membunuh event di cabang OPERAN — cabang yang tidak dijaga —
   dan selesai() menyapu map kuning dari tangan orang yang sedang melangkah,
   tanpa satu pun aksi yang menjelaskannya.

   Perbaikan di sini membalik arahnya: tiap kali satu mata rantai BERANGKAT,
   tenggatnya dihitung dari trayek yang sungguh-sungguh dipasang route()
   (a.path sesudah goToXY, bukan taksiran), dan durasi tinggal jadi pagar
   terakhir. Angka hasil sapuannya ada di kepala berkas. */

/* Laju jalan paling pelan yang benar-benar bisa terjadi di ruangan ini:
   MOD.lajuGlobal 0,7 (senyap-magrib) dikali LAJU_LELAH 0,85 (Agent.update
   room.js, berlaku waktu stamina < STAMINA_LELAH). Disisir dari seluruh
   public/event/ — cuma ADA tiga penulis MOD.lajuGlobal: senyap-magrib 0,7,
   ramadan-siang-sunyi 0,8, dan serapan-anggaran-akhir-tahun 0,85. Dua yang
   terakhir di atas 0,595, begitu juga hasil kalinya dengan LAJU_LELAH (0,68
   dan 0,7225). Dipakai sebagai LANTAI, jadi tenggat yang dihitung darinya
   tidak pernah optimistis. */
const OPER_LAJU_LANTAI = 0.595;
/* Detik yang disisihkan di ujung durasi buat urutan penutup: map turun ->
   2,5 detik rombongan bubar -> 1,5 detik langkah pulang = 4,0 detik, plus
   1,5 detik kelonggaran. Di bawah pagar ini rantai berhenti menunggu siapa
   pun dan menutup diri di tempat. */
const OPER_SISA_TUTUP = 5.5;
const operPagar = (E) => (E.def.durasi || 42) - OPER_SISA_TUTUP;

// Sisa panjang trayek seseorang, dalam piksel: dari posisinya sekarang
// menyusuri waypoint route() yang belum dia lewati.
function operSisaTrayek(a) {
  let px = 0, x = a.x, y = a.y;
  for (const p of a.path) { px += Math.hypot(p.x - x, p.y - y); x = p.x; y = p.y; }
  return px;
}
// Laju efektif orang ini SEKARANG — untuk MENAKSIR, bukan untuk menjaga.
const operLajuKini = (a) => (MOD.lajuGlobal || 1)
  * ((a.stamina == null ? 1 : a.stamina) < STAMINA_LELAH ? LAJU_LELAH : 1);

/* Dipanggil TEPAT SESUDAH goToXY/operDekati: trayeknya sudah jadi a.path,
   jadi jaraknya sungguhan.
   false = kaki ini jelas tidak muat sebelum pagar tutup; pemanggilnya
   menutup rantai di tempat alih-alih menjalaninya sampai pagar durasi. */
function operBerangkat(E, a, jeda) {
  const px = operSisaTrayek(a);
  const pagar = operPagar(E);
  // Taksirannya pakai laju SEKARANG, bukan lantai: kalau pakai lantai, kaki
  // yang sebenarnya muat di laju normal ikut dibatalkan.
  if (E.umur + px / (SPEED * operLajuKini(a)) + jeda > pagar) return false;
  // Tenggat penjaganya justru pakai LANTAI, jadi ia tidak pernah lewat lebih
  // dulu dari orang yang masih berjalan wajar. 2 detik pagar bawah supaya
  // kaki sependek apa pun tidak sudah dianggap telat di frame pertamanya.
  E.data.tutupPada = Math.min(pagar, E.umur + px / (SPEED * OPER_LAJU_LANTAI) + 2);
  return true;
}

/* SATU-SATUNYA jalan keluar map kuning dari tangan orang, dipakai oleh kedua
   ujung: mata rantai yang benar-benar sampai (tiba = true) dan tenggat trayek
   yang lewat di operan mana pun (tiba = false). Karena tidak ada cabang lain
   yang mengakhiri rantai, selesai() tidak pernah lagi jadi tempat PERTAMA map
   itu hilang — itu inti perbaikan T1. */
function operTurunkanMap(E, a, tiba) {
  E.data.sampai = E.umur;
  E.data.bubarPada = E.umur + 2.5;
  a.bawa = null;
  a.doingEvent = '';
  spawn('paper', a.x, a.y - 22);
  if (!tiba) {
    /* Kehabisan waktu di tengah trayek, atau rantainya putus karena tool call
       merebut penerimanya. Mapnya tetap TURUN lewat satu aksi yang terlihat,
       tapi tidak boleh mengklaim yang tidak terjadi: pintu kadis tidak dibuka
       dan RUANGAN.mapDisposisi tidak dinaikkan, karena dia memang belum
       sampai ke pintu maupun ke meja stempel. */
    a.say('saya simpan dulu, nanti saya susulkan');
    return;
  }
  if (E.data.adaKadis) {
    E.data.pintuDari = E.umur;                 // cuma di sini pintunya dibuka
    for (let i = 0; i < 3; i++) spawn('paper', a.x, a.y - 22);
    a.say('sekalian saya bawa ke Pak Kadis');
  } else {
    RUANGAN.mapDisposisi = Math.min(5, RUANGAN.mapDisposisi + 1);
    spawn('ink', 286, 132);
    a.say('saya taruh di meja disposisi saja');
  }
}

/* Rantainya dipilih dari TETANGGA, bukan dari tiga yang paling lama diam:
   pinjamAktor mengurutkan calon menurut arrivedAt saja, jadi ia dengan senang
   hati menyerahkan pegawai di meja 86, 374, dan 444 sekaligus. Bijinya tetap
   yang paling lama diam (supaya giliran main tetap adil), dua sisanya yang
   TERDEKAT ke biji itu.

   Ini PENGHEMATAN, bukan perbaikan — keselamatan T1 sama sekali tidak
   bergantung padanya. Sapuan pembanding yang cuma mengubah cara pilihnya
   (504 penempatan x kadis ada/tidak x lima pengali laju) memberi map-lenyap 0
   dan mati-karena-pagar-durasi 0 di KEDUA cara; yang berubah hanya seberapa
   sering leluconnya sempat selesai — tetangga vs pinjamAktor(E,3):
     laju 1,000  tuntas 89,7% vs 82,9%   putus sebelum lingkaran menutup 0 vs 10
     laju 0,850         72,4% vs 63,8%                                  32 vs 56
     laju 0,800         63,4% vs 54,1%                                  56 vs 88
     laju 0,680         38,7% vs 33,3%                                 156 vs 228
     laju 0,595         23,2% vs 20,9%                                 304 vs 382
   Jangan dibaca lebih besar dari itu. Panjang putarannya sendiri cuma turun
   dari 1.324 px (86/374/444, ditutup mengantar ke ruang kadis) jadi 1.180 px
   (tiga meja bersebelahan 176/242/308), karena tiap operan sudah membayar
   ~200 px naik-turun ke lajur y=252 berapa pun jarak mendatarnya. Yang
   benar-benar pendek cuma trio yang kebetulan sama-sama di sudut tunggu:
   572 px. (Diukur dengan memanggil route() asli lewat goToXY yang sama.) */
function operPilihRantai(E, S) {
  const biji = pinjamAktor(E, 1)[0];
  if (!biji) return [];
  const dekat = S.orang.filter((o) => bisaDipinjam(o))
    .sort((p, q) => jarakKe(p, biji.x, biji.y) - jarakKe(q, biji.x, biji.y))
    .slice(0, 2);
  const dua = pinjamAktor(E, 2, (o) => dekat.indexOf(o) >= 0);
  // pinjamAktor mengembalikan urut arrivedAt; diurut ulang supaya operan
  // pertama jadi yang terdekat — kelilingnya segitiga, jadi total trayeknya
  // sama saja, cuma adegannya lebih cepat mulai bergerak.
  dua.sort((p, q) => jarakKe(p, biji.x, biji.y) - jarakKe(q, biji.x, biji.y));
  return [biji, ...dua];
}

daftarEvent(

/* Map kuning yang kembali ke tangan yang pertama. Yang membuat lelucon ini
   bisa ditulis murah: mapnya tidak pernah jadi PROP — dia a.bawa, jadi dia
   ikut badan pembawanya secara otomatis, ikut depth sort secara otomatis, dan
   ikut dibersihkan lepaskanAktor kalau pembawanya direbut tool call.

   Cabang "kadis tidak ada -> tumpukan dus bertambah" dari usulan asli DIBUANG
   dan diganti, bukan dipalsukan: tinggi tumpukan dus itu RUANGAN.dusTambahanArsip
   yang sudah di-cap 2 dan sudah dimiliki kurir-paket-datang serta
   dus-arsip-ditumpuk. Menambahnya di sini hampir pasti tidak akan pernah
   terlihat (nilainya sudah mentok), jadi akibatnya bohong. Gantinya
   RUANGAN.mapDisposisi — tumpukan map di meja stempel yang punya penggambar
   sendiri di drawStempel, naik satu lapis, dan menyusut sendiri begitu ada
   yang memakai meja stempel. */
{
  id: 'oper-berkas-berantai',
  // 'latar': tiga orang berjalan bergantian tidak menuntut panggung kosong.
  // durasi 42 itu PAGAR TERAKHIR yang tidak pernah terpakai, bukan lama
  // tayang: rantainya menutup diri lewat tenggat trayek (operBerangkat +
  // penjaga tunggu di tick) lalu mati lewat E.selesaiCepat. Angka sapuannya
  // di kepala berkas — 0 dari 8.064 percobaan mati karena pagar durasi, umur
  // terpanjang 40,5 detik.
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 42,
  perluAktor: true,
  // apel: 0 mutlak — barisan apel tidak boleh dibubarkan cuma untuk mengoper
  // map. malam & libur dikecilkan, bukan dimatikan: lembur memang ada, tapi
  // tiga orang yang saling menolak map jam tiga pagi terbaca sebagai
  // kerusakan, bukan lelucon. Tanpa field ini syaratnya cuma "3 orang yang
  // bisaDipinjam", dan pegawai standby ikut terhitung penghuni() — jadi
  // event ini memang bisa menyala jam 03.00 dan di tengah apel.
  babak: { apel: 0, malam: 0.3, libur: 0.2 },
  bentrokDengan: [
    // Dua event yang sama-sama mengedarkan map dan akan terbaca sebagai
    // adegan yang sama kalau jalan bersamaan.
    'nota-dinas-keliling', 'serah-terima-map-antar-bidang',
    /* Dan satu lagi yang bukan soal map: event ini MENULIS MOD.pintuKadis
       (lihat E.data.pintuDari di tick), jadi ia penulis pintu kadis yang
       ke sekian. kadis-sekdis-rapat-tertutup (24-rapat-dan-tugas.js) memelihara
       daftar bentrok berisi lima event 'latar' justru karena 'panggung' tidak
       menahan 'latar' — tapi daftar itu disusun dengan menyisir public/event/
       SEBELUM berkas ini lahir, jadi ia tidak memuat kami, dan berkas itu
       bukan milik saya. Karena bentrok() sekarang dua arah (room.js: "dulu
       daftar ini cuma dibaca dari sisi KANDIDAT"), menyebutnya DI SINI sudah
       cukup — perlindungannya utuh lagi tanpa menyunting berkas orang lain.
       Tanpa ini, seluruh lelucon "pintu tertutup rapat, dua orang di dalam"
       batal di layar: pintunya menganga 3,5 detik di tengah adegan tertutup.
       Saudara sekandungnya di 31-gel4-d.js menyelesaikannya persis begini. */
    'kadis-sekdis-rapat-tertutup',
  ],
  syarat: (S) => S.orang.filter(bisaDipinjam).length >= 3,
  mulai(E, S) {
    const R = E.data.rantai = operPilihRantai(E, S);
    // perluAktor cuma memeriksa "ada aktor atau tidak"; dua orang tidak cukup
    // untuk lingkaran yang menutup, jadi dibatalkan sendiri.
    if (R.length < 3) { E.selesaiCepat = true; return; }
    E.data.tahap = 0;
    E.data.tibaPada = null;
    // Ditentukan SEKARANG, bukan di tahap terakhir: kalau kadisnya kebetulan
    // pergi di tengah adegan, tujuan pembawanya tidak boleh berubah di tengah
    // jalan sesudah dia berjalan setengah ruangan.
    E.data.adaKadis = S.orang.some((o) => o.peran === 'kadis');
    operDekati(R[0], R[1]);
    if (!operBerangkat(E, R[0], 3)) {
      /* Trayek pembukanya saja sudah tidak muat sebelum pagar tutup (ruangan
         yang orangnya terlanjur tersebar, MOD.lajuGlobal sedang turun).
         Dibatalkan SEBELUM ada map di tangan siapa pun — lebih baik tidak ada
         adegan daripada adegan empat detik yang isinya cuma menaruh map lagi.
         rantai dikosongkan supaya tick() berhenti di penjaga pertamanya. */
      R[0].goTo(stasiunPulang(R[0]));
      E.data.rantai = null;
      E.selesaiCepat = true;
      return;
    }
    R[0].doingEvent = 'mengoper berkas';
    R[0].bawa = 'map-kuning';
  },
  tick(E) {
    const R = E.data.rantai;
    if (!R || R.length < 3) return;

    /* ATURAN 1: MOD direset SETIAP frame. Pintu kadis ditulis ULANG di sini
       lewat cek rentang — terbuka sejak pembawa terakhir sampai di ambangnya
       (E.data.pintuDari) sampai 3,5 detik sesudahnya. Ditaruh SEBELUM
       penyaring pemeran supaya pintunya tidak membanting tutup di tengah
       animasi cuma karena tool call kebetulan datang di detik itu.

       pintuDari HANYA diisi di cabang "kadisnya ada". Versi pertama memakai
       satu penanda untuk dua hal sekaligus (aturan 10) dan akibatnya pintu
       ruang kadis ikut menganga waktu mapnya justru dibawa ke meja stempel
       karena kadisnya tidak ada — pintu terbuka tanpa siapa pun di baliknya. */
    if (E.data.pintuDari != null && E.umur < E.data.pintuDari + 3.5) MOD.pintuKadis = true;

    const tahap = E.data.tahap;
    const pemegang = R[tahap % 3];

    /* ATURAN 7 di depan segalanya. Begitu satu mata rantai direbut tool call
       sungguhan, event berhenti menyuruh SIAPA PUN — bukan cuma berhenti
       menyuruh yang direbut. Rantai yang putus di tengah tidak bisa diteruskan
       dengan jujur: mapnya ada di tangan orang yang sekarang jelas-jelas
       sedang bekerja di panel. */
    if (!masihMain(E, pemegang)) { E.selesaiCepat = true; return; }

    /* ---- mapnya sudah turun: bubar, lalu event mematikan diri -------------
       Diperiksa PALING ATAS. Sesudah bubar pemegangnya sudah disuruh
       goTo(stasiunPulang) — pemegang.diam jadi false lagi, dan penjaga tunggu
       di bawah akan return duluan tiap frame sehingga E.selesaiCepat tidak
       pernah sempat terbaca.

       Kenapa mematikan diri sama sekali: sejak bentrokDengan-nya menahan
       kadis-sekdis-rapat-tertutup, tiap detik event 'latar' ini hidup ikut
       menahan sebuah 'panggung'. 1,5 detik dulu supaya langkah pulang pertama
       sempat terlihat, baru mati. */
    if (E.data.sampai != null) {
      if (E.data.pulangPada) {
        if (E.umur > E.data.pulangPada) E.selesaiCepat = true;
        return;
      }
      if (E.umur > E.data.bubarPada) {
        // yangMasihMain, bukan E.data.rantai langsung: dua yang lain bisa saja
        // sudah direbut tool call selagi yang ini mengantar mapnya
        for (const o of yangMasihMain(E, R)) {
          o.doingEvent = '';
          o.goTo(stasiunPulang(o));
        }
        E.data.pulangPada = E.umur + 1.5;
      }
      return;
    }

    /* Rantai putus karena penerimanya direbut tool call. Dulu ini
       `E.selesaiCepat = true` polos — dan itu berarti selesai() yang menghapus
       map kuning dari tangan pemegang yang MASIH milik kami, diam-diam.
       Sekarang mapnya turun lewat aksi yang sama dengan tenggat trayek.
       Pemegangnya sendiri sudah lolos masihMain di atas, jadi menyentuhnya
       tidak melanggar aturan 7. */
    const penerima = tahap < 3 ? R[(tahap + 1) % 3] : null;
    if (penerima && !masihMain(E, penerima)) {
      operTurunkanMap(E, pemegang, false);
      return;
    }

    /* ---- PENJAGA TUNGGU: satu untuk SEMUA mata rantai --------------------
       Inilah perbaikan T1 yang sebenarnya. Versi ronde pertama menaruh batas
       sabar HANYA di cabang tahap >= 3; tiga operan pertama cuma punya
       `if (!pemegang.diam) return;` tanpa tenggat apa pun, jadi satu-satunya
       yang menghentikan mereka adalah pagar durasi — dan matinya di cabang
       yang tak dijaga itu yang membuat selesai() menyapu map kuning dari
       tangan orang yang sedang melangkah.

       E.data.tutupPada dipasang ulang tiap kali satu mata rantai berangkat
       (operBerangkat), dihitung dari panjang a.path yang sungguhan dibagi
       laju LANTAI 0,595 — jadi ia tidak pernah lewat lebih dulu dari orang
       yang masih berjalan wajar. Dan karena operBerangkat memakai Math.min
       dengan operPagar(E), tenggat ini tidak pernah jatuh SESUDAH pagar
       tutup: pagar durasi tidak pernah kebagian giliran membunuh event ini.

       Sengaja TIDAK memaksa pemegangnya berhenti dulu: goToXY ke titiknya
       sendiri justru bikin dia mampir ke lajur (y 252) lalu balik lagi —
       route() menambahkan {x, LANE} begitu |y - lane| > 4, jadi orang yang
       berdiri di y=240 dapat jalan memutar 24 px. Membiarkannya menuntaskan
       langkah terakhir jauh lebih tenang dilihat. */
    if (!pemegang.diam) {
      if (E.umur < E.data.tutupPada) return;
      operTurunkanMap(E, pemegang, false);
      return;
    }

    // ---- babak penutup: mapnya sudah balik ke tangan pertama --------------
    if (tahap >= 3) { operTurunkanMap(E, pemegang, true); return; }

    // ---- operan 0, 1, 2 ---------------------------------------------------

    // Pola tenggat persis nota-dinas-keliling: catat detik tibanya SEKALI,
    // lalu bandingkan manual (aturan 4 — pada(E, E.umur + 3, ..) tidak pernah
    // jalan). Yang menerima berhenti 3 detik memandangi mapnya dulu.
    if (E.data.tibaPada == null) {
      E.data.tibaPada = E.umur;
      hadapkan(penerima, pemegang.x, pemegang.y);
      penerima.busyUntil = Math.max(penerima.busyUntil, now + 3000);
      spawn('paper', penerima.x, penerima.y - 20);
      spawn('talk', penerima.x, penerima.y - 26);
      penerima.say(OPER_UCAP[tahap] || OPER_UCAP[0]);
      return;
    }
    if (E.umur - E.data.tibaPada <= 3) return;

    E.data.tibaPada = null;
    pemegang.bawa = null;
    // Yang sudah lepas tangan TIDAK dipulangkan: dia ikut menonton mapnya
    // berkeliling, dan itu justru inti leluconnya. Labelnya diganti supaya
    // panel kru tidak terus menulis 'mengoper berkas' untuk orang yang
    // tangannya sudah kosong.
    pemegang.doingEvent = 'menunggu berkasnya balik';
    E.data.tahap++;
    penerima.bawa = 'map-kuning';

    if (E.data.tahap >= 3) {
      // lingkarannya menutup: yang memulai memegang lagi map yang sama
      spawn('idea', penerima.x, penerima.y - 24);
      // 452,152 praktis STATIONS.agent (452,140) digeser turun ke lajur —
      // ambang pintu kadis y=110, jadi berdiri di 152 tidak menembus kusen.
      if (E.data.adaKadis) penerima.goToXY(452, 152, 'up');
      else penerima.goToXY(286, 152, 'up');       // depan meja stempel
      // jeda 0: begitu sampai, blok penutupnya langsung jalan. Labelnya
      // dipasang SESUDAH tenggatnya lolos, supaya panel kru tidak pernah
      // menulis "mengantar berkas ke ruang kadis" untuk perjalanan yang kami
      // sendiri sudah tahu tidak akan sampai.
      if (operBerangkat(E, penerima, 0)) {
        penerima.doingEvent = E.data.adaKadis
          ? 'mengantar berkas ke ruang kadis'
          : 'menaruh berkas di meja disposisi';
      } else {
        operTurunkanMap(E, penerima, false);
      }
    } else {
      operDekati(penerima, R[(E.data.tahap + 1) % 3]);
      if (operBerangkat(E, penerima, 3)) penerima.doingEvent = 'mengoper berkas';
      else operTurunkanMap(E, penerima, false);
    }
  },
  /* Aturan 2: a.bawa LENGKET. Sapuan ini sekarang JARING TERAKHIR, bukan lagi
     jalan keluar yang biasa: tiga cabang yang dulu berakhir di sini —
     penerima direbut tool call, tenggat trayek lewat, pagar durasi habis —
     semuanya sekarang lewat operTurunkanMap(), yang menurunkan mapnya dengan
     partikel 'paper' dan satu kalimat. Yang tersisa untuk sapuan ini cuma
     jalur yang memang di luar kuasa event: pemegangnya sendiri direbut tool
     call sambil memegang map (lepaskanAktor room.js sudah menjatuhkannya,
     kecuali kalau bawaSampai-nya belum lewat).

     Disisir dari E.data.rantai, BUKAN dari E.aktor — orang yang direbut tool
     call di tengah sudah keluar dari E.aktor tapi potretnya masih di rantai.
     Membersihkan bawa bukan perintah gerak, jadi tidak melanggar aturan 7.

     Yang dihapus HANYA map kami sendiri: kalau dia sempat direbut event lain
     dan sekarang membawa gelas kopi, itu bukan urusan event ini. doingEvent
     cuma disentuh untuk yang masih milik kami — lepaskanAktor sudah
     membersihkan milik yang direbut. */
  selesai(E) {
    for (const o of E.data.rantai || []) {
      if (!o) continue;
      if (o.bawa === 'map-kuning') o.bawa = null;
      if (masihMain(E, o)) o.doingEvent = '';
    }
  },
},

/* Nota dinas dari pusat: satu-satunya event di katalog yang menyala pada
   CAPAIAN ruangan yang sungguhan — kelipatan 100 tool call sejak halaman
   dibuka. Bukan teguran seperti audit-token, tapi kabar baik: pintu kadis
   terbuka, amplop diantar ke meja rapat, dan tiga orang berkerumun membacanya.

   Amplopnya digambar di DUA lapis yang berbeda dengan sengaja:
     * yang tergeletak di ambang pintu -> gambarLantai, digambar tepat sesudah
       drawFloor dan SEBELUM semua prop dan orang. Dia memang benda di lantai;
       kalau ikut sortY 250 milik gambarProp dia akan menimpa KEPALA orang
       yang berdiri di depan pintu kadis (aturan 13).
     * yang sudah di atas taplak -> gambarProp, sortY 250: satu piksel di atas
       drawRapat (249) supaya benar-benar di ATAS taplak, dan tetap di bawah
       pejalan pita bawah (y 230..266 dapat +24 -> 264) supaya tidak menimpa
       kepala rombongan yang berdiri membacanya.
   Konsekuensi dari kalimat terakhir itu yang sempat terlewat: karena amplop
   mejanya KALAH dari orang, dia tidak boleh berbagi kolom x dengan satu pun
   kepala pembacanya — kalau tidak, benda yang jadi inti seluruh adegan justru
   yang paling tidak terlihat. Hitungan kotaknya ada di gambarProp. */
{
  id: 'nota-dinas-dari-pusat',
  kelas: 'panggung', bobot: B.jarang, cooldown: 300, durasi: 26,
  perluAktor: true,
  // apel: barisan tidak boleh dibubarkan untuk urusan surat. malam & libur
  // dikecilkan, bukan dimatikan: kiriman pusat memang bisa datang telat.
  babak: { apel: 0, malam: 0.3, libur: 0.3 },
  // Semua pemilik keadaan pintu kadis / MOD.pintuKadis. Kalau salah satunya
  // jalan, pintunya sudah punya cerita sendiri.
  bentrokDengan: ['kadis-sekdis-rapat-tertutup', 'kadis-sidak-keliling',
    'pengarahan-kadis', 'inspektorat-mendadak'],
  syarat: (S) => toolCount >= notaAmbang
    && S.orang.filter(bisaDipinjam).length >= 2,
  mulai(E, S) {
    E.data.n = Math.floor(toolCount / 100) * 100;
    /* Dinaikkan DI SINI, bukan di selesai(): kalau adegannya batal (tidak
       dapat pemeran, atau ruangannya keburu sibuk) ambangnya tetap maju, jadi
       event ini tidak mencoba merayakan kelipatan yang sama berkali-kali
       sepanjang sisa sesi. */
    notaAmbang = E.data.n + 100;
    const a = E.data.a = pemeran(E, ['sekdis', 'arsiparis', 'magang']);
    if (!a) return;                              // perluAktor yang membatalkan
    E.data.tahap = 0;
    a.doingEvent = 'mengambil nota dinas dari pusat';
    // 452,138 praktis STATIONS.agent (452,140) — titik yang sudah terbukti
    // terjangkau route(). Pintu kadisnya sendiri x440..474 y28..110, jadi
    // berdiri di y=138 tidak menembus kusen dan masih jauh di atas pantry
    // (mulai y=196).
    a.goToXY(452, 138, 'up');
  },
  tick(E) {
    /* ATURAN 1: MOD direset SETIAP frame, jadi pintu kadis ditulis ULANG tiap
       frame lewat cek rentang — bukan sekali di mulai(). Rentangnya: sejak
       detik 0,5 sampai 2 detik sesudah amplopnya diangkat, dan tidak pernah
       lewat detik 14. Batas keras itu yang menjaga pintunya tidak menganga
       sisa event kalau pembawanya keburu direbut tool call sebelum sampai. */
    const tutup = Math.min(14, E.data.tutupPada || 14);
    if (E.umur > 0.5 && E.umur < tutup) MOD.pintuKadis = true;

    // ATURAN 7: potret E.data.a tidak ikut terpangkas waktu tool call merebut
    // orangnya, jadi disaring di sini sebelum satu perintah pun diberikan.
    const a = masihMain(E, E.data.a) ? E.data.a : null;

    /* Tahap 2 diperiksa DULUAN, di ATAS penjaga `a`. Blok itu sama sekali
       tidak memerlukan pembawa notanya: seluruh perintahnya sudah lewat
       yangMasihMain(E, E.aktor). Versi pertama menaruh `if (!a) return;` di
       atas segalanya, jadi kalau HANYA pembawanya yang direbut tool call
       sesudah rombongan berkumpul — kasus paling lazim, satu sesi dapat tool
       call dan dua lainnya tidak — E.data.bubar tidak pernah diset. Simulasi
       (route() asli, pencurian 0,5 detik sesudah kumpulPada): dua pembaca
       cuma pernah menerima goToXY ke 210,240 dan 282,240 lalu berdiri
       mematung di depan meja rapat 10,8 detik sampai durasinya habis, tanpa
       satu pun goTo(stasiunPulang) — dan baru benar-benar pulang IDLE_AFTER
       (7 detik) sesudah itu. Di panel kru pembawanya jelas-jelas sedang
       bekerja di mejanya, dua rekannya masih "membaca nota dinas". */
    if (E.data.tahap === 2) {
      // Semua relatif terhadap kumpulPada, bukan detik absolut: perjalanan ke
      // pintu kadis panjangnya berbeda-beda tergantung pembawanya berangkat
      // dari mana (lihat catatan anggaran waktu di kepala berkas).
      const k = E.data.kumpulPada;
      if (E.umur > k + 1 && E.umur < k + 7) {
        // 'talk' BERGILIRAN satu orang per 1,2 detik, pola penghitung yang sama
        // dengan ngerumpi-di-pantry — tiga balon serempak terbaca sebagai
        // kerusakan, bukan sebagai percakapan
        const g = Math.floor((E.umur - k) / 1.2);
        if (g !== E.data.g) {
          E.data.g = g;
          const siap = yangMasihMain(E, E.aktor).filter((o) => o.diam);
          if (siap.length) {
            const o = siap[g % siap.length];
            spawn('talk', o.x, o.y - 26);
          }
        }
      }
      if (E.umur > k + 7 && !E.data.bubar) {
        E.data.bubar = true;
        // JANGAN shift/splice E.aktor sendiri (aturan 9): eventKerja-nya akan
        // menggantung. Dilepas rapi oleh matikanEvent waktu durasinya habis.
        for (const o of yangMasihMain(E, E.aktor.slice())) {
          o.doingEvent = '';
          o.goTo(stasiunPulang(o));
        }
        /* ...dan sesudah itu event ini benar-benar mati, tidak menunggu jam
           dinding. 800 simulasi: rombongan berkumpul di 13,1..19,0 detik lalu
           bubar 7 detik kemudian, jadi SETIAP percobaan menyisakan 1,0..5,9
           detik (median 4,3) slot 'panggung' terkunci untuk ruangan yang
           sudah kosong. 1,5 detik dulu supaya langkah pulang pertama sempat
           terlihat, baru mati. */
        E.data.pulangPada = E.umur + 1.5;
      }
      if (E.data.pulangPada && E.umur > E.data.pulangPada) E.selesaiCepat = true;
      return;
    }

    /* Tahap 0 & 1 memang bergantung SEPENUHNYA pada pembawanya: tidak ada
       pemeran lain di panggung dan amplopnya masih di tangannya, jadi tidak
       ada adegan yang bisa diteruskan dengan jujur kalau dia direbut. Dan
       karena kelasnya 'panggung', membiarkan event ini hidup sampai durasinya
       habis mengunci slot panggung sampai 23 detik tanpa satu pun aksi
       (aturan 11) — simulasi: pembawa dicuri di t=3, event baru mati di
       t=26,0, amplop lantai tetap tergambar 1561 frame penuh dan pintu kadis
       menganga 0,5..14,0 tanpa siapa pun di sana. Saudaranya di berkas ini,
       oper-berkas-berantai, sudah memakai E.selesaiCepat untuk kasus yang
       sama; ini menyamakannya. */
    if (!a) { E.selesaiCepat = true; return; }

    // ---- tahap 0: berdiri di ambang pintu, menunduk mengambil amplop ------
    if (E.data.tahap === 0) {
      if (!a.diam) return;
      // aturan 4: tenggat disimpan SEKALI lalu dibandingkan manual —
      // pada(E, E.umur + 1.5, ..) tidak pernah jalan
      if (!E.data.jedaPada) E.data.jedaPada = E.umur + 1.5;
      if (E.umur > E.data.jedaPada) {
        E.data.jedaPada = 0;
        E.data.tahap = 1;
        E.data.ambil = true;                     // amplop lantai berhenti digambar
        E.data.tutupPada = E.umur + 2;
        a.bawa = 'amplop';
        a.say('ada nota dinas dari pusat');
        a.doingEvent = 'membawa nota dinas ke meja rapat';
        // y=240: titik berdiri di depan meja rapat yang sudah dipakai
        // gorengan-di-meja-rapat dan oleh-oleh-dinas-luar — tepat di bawah
        // rimpel taplak (RAPAT.yF 226 + tinggi rimpel 14)
        a.goToXY(246, 240, 'up');
      }
      return;
    }

    // ---- tahap 1: menaruh amplop, memanggil yang lain --------------------
    if (E.data.tahap === 1) {
      if (!a.diam) return;
      E.data.tahap = 2;
      E.data.taruh = true;
      E.data.kumpulPada = E.umur;
      a.bawa = null;
      // Partikelnya dipusatkan di 234, ikut amplopnya (lihat gambarProp), bukan
      // di 246: di 246 semburan kertasnya jatuh tepat di muka pembacanya
      // sendiri (kepala orang di x=246 menempati x241..250, y214..223).
      for (let i = 0; i < 6; i++) spawn('paper', 234, 216);
      for (let i = 0; i < 2; i++) spawn('idea', 234, 214, P.gold);
      /* BUKAN 'hari ini'. toolCount (room.js: `let toolCount = 0`, dinaikkan
         di satu tempat waktu tool call masuk) menghitung SEJAK HALAMAN INI
         DIBUKA — tidak pernah direset tengah malam. Halaman yang dibiarkan
         terbuka semalaman akan mengklaim angka kemarin sebagai "hari ini",
         dan halaman yang baru dimuat jam 15.00 mengklaim satu jam terakhir
         sebagai sehari penuh. Kalimatnya dibuat tidak menyebut rentang waktu
         sama sekali, jadi ia benar untuk dua-duanya. */
      a.say('tembus ' + E.data.n + ' berkas');
      a.doingEvent = 'membaca nota dinas';
      // Dipinjam BARU DI SINI, bukan di mulai(): tiga orang yang berdiri
      // mematung sepuluh detik menunggu pembawanya berjalan itu mahal dan
      // terbaca aneh. yangMasihMain dipakai walau baru dipinjam sedetik lalu:
      // tool call bisa masuk di frame yang sama.
      E.data.lain = pinjamAktor(E, 2);
      yangMasihMain(E, E.data.lain).forEach((o, i) => {
        o.doingEvent = 'membaca nota dinas';
        // 210 dan 282, bukan 214 dan 278: menghindari berdiri tepat di atas
        // dua kursi rapat sisi dekat (KURSI_DEKAT)
        o.goToXY(210 + i * 72, 240, 'up');
      });
      return;
    }
  },
  /* Amplop yang masih tergeletak di ambang pintu kadis. Lapis LANTAI, jadi
     dia di belakang semua orang dan semua prop — persis seperti benda yang
     memang ada di ubin. x=462 (bukan 452): pembawanya berdiri di x=452 dan
     kepalanya menempati x448..456, jadi amplop di tengah pintu akan tertimbun
     badannya sendiri sebelum sempat terbaca. */
  gambarLantai(E) {
    if (E.data.ambil) return;
    r(462, 116, 8, 5, '#f2efe4');
    r(462, 116, 8, 1, '#ffffff');
    r(467, 117, 2, 2, P.amber);                  // cap pusat
  },
  /* Amplop yang sudah di atas taplak. x=230, BUKAN 238 seperti versi pertama.
     Celah taplaknya sendiri memang benar di dua-duanya (map rapat berhenti di
     x=228, notulen mulai di x=238 y221, mic tengah berhenti di y207, gelas
     226 berhenti di y209) — yang terlewat justru BADAN PEMBACANYA. Dihitung
     dari room.js: drawPerson memakai x = Math.round(a.x) dan yDagu = y - 17,
     drawHead memakai yT = yDagu - 8 dan gumpal(x-4, yT, 8, 8), jadi kotak
     kepala orang di (246,240) adalah x241..250, y214..223 — dan bahu-lengannya
     melebar lagi ke x238..253 di pita y214..226. Orangnya memang MENANG:
     pejalan di pita 230..266 dapat sortY a.y+24 = 264, di atas sortY 250 kami.

     Dihitung piksel demi piksel dengan memanggil drawPerson() asli di sandbox
     lalu merekam fillRect-nya: amplop di x=238 kehilangan 22 dari 40
     pikselnya, termasuk KEEMPAT piksel cap amber-nya — benda yang jadi inti
     seluruh adegan justru yang paling tidak terlihat. Di x=230 angkanya
     0 dari 40, dan ia tetap tidak menyentuh satu pun benda di atas taplak
     (satu-satunya yang masuk pita y214..218 adalah map rapat x214..228).
     Pergeseran yang sama sudah pernah dilakukan untuk amplop LANTAI di
     gambarLantai (452 -> 462) dengan alasan persis sama; ini menyusulkannya
     ke amplop meja. */
  gambarProp(E) {
    if (!E.data.taruh) return;
    r(230, 214, 8, 5, '#f2efe4');
    r(230, 214, 8, 1, '#ffffff');
    r(235, 215, 2, 2, P.amber);
  },
  sortY: 250,
  /* Aturan 2: a.bawa dan doingEvent LENGKET. MOD sengaja TIDAK disentuh di
     sini — dia direset sendiri tiap frame, dan menulisnya dari selesai()
     cuma bikin orang mengira flag itu perlu dimatikan manual.

     Yang dihapus HANYA amplop milik PEMBAWANYA, disiplin yang sama dengan
     oper-berkas-berantai di atas. Versi pertama menyapu o.bawa = null untuk
     seluruh E.aktor, termasuk dua pembaca yang tidak pernah kami beri apa
     pun: kalau salah satunya masih memegang gelas dengan bawaSampai yang
     belum lewat — dan lepaskanAktor di room.js sengaja MEMPERTAHANKAN bawa
     selama `now <= a.bawaSampai` — gelasnya lenyap lebih cepat dari mestinya.

     Pembawanya disisir terpisah dari E.aktor karena dia bisa saja sudah
     direbut tool call dan keluar dari E.aktor; kalau dia kebetulan punya
     bawaSampai sisa event lain, lepaskanAktor justru menahan amplop KAMI di
     tangannya. Membersihkan bawa bukan perintah gerak, jadi tidak melanggar
     aturan 7. */
  selesai(E) {
    const a = E.data.a;
    if (a && a.bawa === 'amplop') a.bawa = null;
    for (const o of E.aktor) o.doingEvent = '';
  },
},

);
