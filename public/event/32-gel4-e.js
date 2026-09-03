/* ==========================================================================
   TELEPON RUSAK VERSI KANTOR DINAS
   ==========================================================================
   Satu event saja di berkas ini, dan itu memang disengaja: yang dikerjakan
   adalah lubang paling jelas di katalog. Rantai pesan yang isinya melenceng
   tiap kali disampaikan ulang BELUM ADA di katalog. Yang mendekat cuma dua,
   dan dua-duanya bukan ini:

     * nguap-berantai — memang menular dari orang ke orang, tapi yang menular
       adalah GERAKAN (pose 'nguap'), bukan kalimat. Tidak ada isi yang bisa
       berubah karena tidak ada isi sama sekali.
     * nota-dinas-keliling (03-birokrasi-...) — memang berkeliling meja ke
       meja, tapi leluconnya PARAF: berkas yang sama singgah di banyak tangan.
       Isinya justru tidak boleh berubah; itu intinya.

   Satu bisikan sekali-lewat di 24-rapat-dan-tugas.js juga bukan rantai.

   Jadi yang belum pernah dibaca penonton adalah: kalimat yang sama diucapkan
   tiga kali dan tiap kali salah sedikit. Itu yang dibuat.

   ------------------------------------------------------------------ potongan
   Usulan aslinya (t4-2, "Titip pesan, isinya berubah") divonis MAHAL dengan
   dua alasan, dan cuma satu yang benar:

     1. "Empat pemeran dengan penyimpanan dan pemulihan stasiun asal
        (this.stasiunSebelum)." — Ini SALAH BACA MESIN, dan penting untuk
        dicatat supaya tidak ada yang menulis penyimpanan itu lagi.
        lepaskanAktor() (room.js) sudah mengembalikan betah, alpha, bawa,
        pose, mulut, laju, bekuSampai, dan state='idle' begitu event mati —
        lalu agennya pulang sendiri ke mejanya lewat IDLE_AFTER/stasiunPulang.
        Tidak ada satu baris pun yang perlu ditulis di sini untuk itu, dan
        menulis this.stasiunSebelum justru menambah field lengket baru yang
        melanggar aturan 2 tanpa untung apa-apa.

     2. "Biayanya setara event rapat penuh sementara leluconnya seluruhnya ada
        di teks balon." — Ini BENAR, dan diikuti. catatan_teknis usulan
        sendiri menyarankan jalan keluarnya: potong jadi TIGA orang dan buang
        konfirmasi balik. Yang hilang cuma satu perjalanan pulang orang
        terakhir ke orang pertama; yang tersisa (tiga balon melenceng + satu
        tanda tanya) adalah seluruh leluconnya.

   Kerangka estafetnya bukan barang baru: pola "bawa.diam → tunggu → i++ →
   suruh berikutnya" disalin apa adanya dari edar-amplop-patungan
   (20-kultur-kantor-lanjutan-...), yang sudah terbukti jalan berbulan-bulan.
   Bedanya yang diedarkan bukan amplop tapi kalimat, jadi tidak ada a.bawa
   yang dipasang sama sekali.

   -------------------------------------------- kenapa selesai() tidak ada lagi
   Dua versi sebelumnya salah arah dua kali di tempat yang sama, dan itu layak
   ditulis panjang supaya tidak dicoba ketiga kalinya.

   Versi pertama menulis "tidak ada yang perlu dibersihkan di selesai()".
   Itu bohong: event ini memutar orang lewat hadapkan(), dan hadapkan()
   (00-dasar.js) menulis a.hadap DAN a.face. a.hadap LENGKET — lepaskanAktor()
   mereset betah/alpha/bawa/pose/mulut/laju/bekuSampai/state dan tidak
   menyentuh arah sama sekali.

   Versi kedua menambal itu dengan potret E.data.hadapAsli lalu memulihkannya
   di selesai(). Gejalanya hilang untuk pemeran yang MASIH dipegang event,
   tapi penyebabnya utuh, dan verifikator mengukur lubangnya: pemeran yang
   direbut tool call di dalam jendela ~3 detik antara pemutaran dan langkah
   berikutnya disaring keluar oleh yangMasihMain() — arah salah yang ditulis
   event ini ditinggalkan begitu saja. Terukur: rebut q[2] pada detik 17,0 →
   sesudah selesai() tetap think:left/left; rebut q[1] pada detik 8,5 → sama.
   Dan itu tidak sembuh sendiri: handle() cuma memanggil goTo kalau stasiun
   tool-nya BEDA (`if (a.station !== st) a.goTo(st)`), sedangkan stationFor()
   memetakan Bash/PowerShell non-git, TodoWrite, ExitPlanMode, EnterPlanMode,
   AskUserQuestion dan semua tool tak dikenal ke 'think' — stasiun yang sedang
   ditempati orangnya. Jalur IDLE_AFTER juga tertutup untuk dia
   (`this.station !== pulang`, dan stasiunPulang() orang yang sudah di mejanya
   mengembalikan 'think'). Lebih buruk lagi: arrive(), setButuh(), tickKongsi()
   dan tibaPulang() semuanya MEMBACA this.hadap, jadi arah yang salah dipasang
   ulang tiap kali orangnya tiba di mana pun — selamanya.

   Versi ini berhenti menulisnya. Yang dipasang cuma a.face, dan cuma pada
   pemeran yang saat itu berdiri di station 'acara' (bekas goToXY-nya sendiri).
   Preseden persis ada di room.js: tickKongsi sengaja cuma menyentuh face,
   bukan hadap. Alasannya bisa dibuktikan, bukan selera:

     * a.hadap tidak pernah ditulis, jadi tidak ada yang bisa nyangkut, dan
       arrive()/setButuh()/tickKongsi()/tibaPulang() justru MEMULIHKAN arah
       yang benar alih-alih memasang ulang yang salah.
     * face pada orang di station 'acara' dijamin ditimpa langkah berikutnya,
       lewat DUA pintu yang dua-duanya pasti terbuka: (a) tool call — 'acara'
       bukan hasil stationFor() mana pun, jadi `a.station !== st` selalu benar
       dan goTo() menyalakan langkah yang menulis ulang face tiap frame;
       (b) tanpa tool call — sesudah event mati IDLE_AFTER menyuruhnya pulang,
       karena syaratnya `this.station !== pulang` dan stasiunPulang() cuma
       pernah mengembalikan 'think' atau 'idle', tidak pernah 'acara'.
       Peserta rapat yang betah-nya memang sudah true sebelum dipinjam pun
       tertutup: bubar() memasang path baru, dan langkah menulis ulang face.
     * penerima terakhir q[2] — satu-satunya yang tidak pernah berjalan, jadi
       satu-satunya yang tidak punya pintu pemulihan — TIDAK DISENTUH sama
       sekali. Dia mendengar sambil tetap menghadap laptopnya; tanda tanya di
       atas kepalanya yang jadi punchline, bukan arah badannya.

   Disapu, bukan dicontohkan sekali: 3 pengali laju (1 / 0,85 / 0,595) × 60
   susunan tempat duduk × (tanpa perebutan + tiga korban × dua belas detik
   perebutan 0,5..40) = 6.660 jalannya adegan. Hasil: a.hadap ditulis 0 kali,
   face nyangkut pada orang yang berdiri di stasiun nyata 0 kali, q[2] keluar
   dari think:null/up 0 kali. Jendela ~3 detik yang dulu bocor itu memang
   tidak ada lagi — bukan karena dijaring lebih rapat, tapi karena tidak ada
   lagi yang perlu dijaring.

   Sisanya memang tidak ada: pose, bawa, MOD, RUANGAN tidak pernah dipasang,
   dan `a.laju = 1` yang dulu berdiri di selesai() terbukti mubazir —
   lepaskanAktor() memasang laju = 1 untuk SETIAP pemeran, baik yang dilepas
   matikanEvent() maupun yang direbut duluan oleh handle(). Jadi selesai()
   dihapus, bukan dikosongkan: berkas ini sekarang benar-benar tidak punya
   apa pun untuk dibersihkan.

   ------------------------------------------- kenapa durasi bukan penentu lagi
   Keluhan pertama tentang berkas ini adalah punchline-nya terpotong. Versi
   kedua menjawabnya dengan menaikkan durasi 24 → 34. Itu menggeser ambang,
   bukan menutup penyebabnya: durasi tetap satu angka mati yang berlomba
   dengan trayek yang panjangnya tidak dia batasi. Verifikator menembusnya
   lagi — di 0,595 (MOD.lajuGlobal 0,7 × LAJU_LELAH 0,85) dua dari 60 susunan
   mati "DURASI HABIS" di detik 34,02 sesudah cuma 2 dari 3 balon.

   Dan angka konstanta apa pun MEMANG tidak bisa cukup, karena laju pemeran
   ini bukan cuma milik dia sendiri. Dua event lain menurunkan a.laju orang
   yang kebetulan sedang berjalan, tanpa peduli dia sedang dipinjam event
   siapa: hujan-pertama-bau-tanah (18-suasana-lanjutan-...) memasang
   `o.laju = 0.7` untuk SEMUA yang path-nya berisi dan mengembalikannya 5
   detik kemudian, dan kadis-sekdis-rapat-tertutup (24-rapat-dan-tugas)
   memasang `o.laju = 0.6` untuk yang lewat lajur atas dekat pintu — yang
   dikecualikan cuma adaTugas dan pemerannya sendiri, bukan pemeran event
   lain. Kalikan dengan MOD.lajuGlobal 0,7 dan LAJU_LELAH 0,85: langkah kurir
   bisa jatuh ke 0,357×, dan trayek terpanjang 906 px jadi 48,8 detik jalan
   kaki saja. Tidak ada konstanta yang menutup itu tanpa jadi pagar hampir
   semenit yang menggantungkan slot kalau ada yang tersendat.

   Jadi tenggatnya sekarang DIHITUNG DARI TRAYEKNYA, di tick():
     * selama sisa trayek kurir masih memendek, E.sisa ditahan di lantai 4
       detik — jadi pagar durasi TIDAK PERNAH jatuh di tengah satu mata
       rantai, berapa pun lambatnya langkah itu.
     * begitu tidak ada kemajuan 6 detik berturut-turut, event menyerah
       (E.selesaiCepat) — itu yang menjaga aturan 11, bukan durasi. Terukur:
       laju dipaksa 0 pada detik 1/5/10/16 -> event mati 6,0 detik kemudian,
       persis, di keempat-empatnya.
     * lama tayang sesungguhnya tetap ditentukan E.data.tutupPada: 2,5 detik
       sesudah baris ketiga.
   Angka 4 dipilih karena lebih besar dari ekor 2,5 detik. Angka 6 karena
   jeda terpanjang yang SAH tanpa kemajuan adalah jeda 3 detik itu (+ satu dt
   harness = 4); pembekuan dari event lain TIDAK ikut dihitung karena
   dikecualikan terpisah lewat bekuSampai — dan itu perlu, sebab jeda-maghrib
   dan hormat-bendera membekukan semua yang tidak adaTugas selama 8 detik
   penuh. Diuji: pembekuan 8 detik pada detik 3/7/12/18 (dan versi seruangan)
   tidak pernah memutus rantai — tetap 3 balon, tanda tanya tetap utuh 1,2 s.
   ========================================================================== */

daftarEvent(

{
  id: 'pesan-titipan-berubah-isi',
  /* durasi 40 = PAGAR TERAKHIR, bukan lama tayang, dan bukan yang menentukan
     punchline. Yang menutup event ini adalah E.data.tutupPada (2,5 detik
     sesudah baris ketiga) dan penjaga macet di tick().

     Sapuannya: SELURUH MEJA_KERJA_X — enam entri [176,374,86,444,242,308],
     bukan empat yang pertama seperti versi sebelumnya — jadi 20 trio × 3
     pilihan penerima terakhir = 60 susunan, dikali TUJUH pengali laju:
     1 / 0,85 (LAJU_LELAH) / 0,8 / 0,7 (MOD.lajuGlobal) / 0,595 (0,7×0,85) /
     0,4165 (+ a.laju 0,7) / 0,357 (+ a.laju 0,6). Hasil terukur, route() dan
     langkah per frame ASLI:

       laju 1     : 60/60 rantai penuh, tanda tanya utuh 1,2 s 60/60,
                    event mati sendiri detik 18,15..25,97
       laju 0,85  : 60/60, mati 19,77..28,97
       laju 0,8   : 60/60, mati 20,52..30,28
       laju 0,7   : 60/60, mati 22,15..33,32
       laju 0,595 : 60/60, punchline paling telat 35,15, mati 24,52..37,67
       laju 0,4165: 60/60, mati 31,38..50,13   <- LEWAT pagar 40
       laju 0,357 : 60/60, mati 35,12..57,00   <- LEWAT pagar 40

     Jadi 40 memang menutup sampai 0,595 sendirian (37,67 + 2,3 detik sisa),
     tapi dua baris terakhir menunjukkan kenapa itu tidak boleh jadi andalan:
     yang menyelesaikan dua baris itu adalah lantai E.sisa di tick(), bukan
     angka ini. Buktinya langsung: sapuan yang sama dengan durasi DIPAKSA
     6 / 12 / 30 / 40 memberi angka yang identik persis di ketujuh pengali —
     durasi tidak lagi menyentuh hasil apa pun.

     Pagar selonggar ini tidak menggantungkan slot: kelasnya 'latar' tanpa
     bentrokDengan (tidak ada panggung yang terkunci), dan kurir yang benar-
     benar berhenti maju menutup event dalam 6,0 detik — terukur, bukan
     ditaksir (laju dipaksa 0 pada detik 1/5/10/16 -> mati 7,02/11,02/16,00/
     22,02). Cooldown juga tidak ikut molor: cooldownSampai diset di
     nyalakanEvent (room.js), bukan saat mati. */
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 40,
  // "rapat jam 2 di ruang kadis" janggal diucapkan tengah malam atau hari
  // libur; nol = tidak ikut undian sama sekali di babak itu.
  babak: { malam: 0, libur: 0 },
  perluAktor: true,
  syarat: (S) => S.orang.filter((o) => !o.standby && bisaDipinjam(o)).length >= 3,

  mulai(E, S) {
    // Penerima terakhir sebaiknya pejabat — tanda tanyanya lebih terbaca di
    // atas kepala yang seragamnya beda. Tapi cuma sebaiknya: kalau tidak ada,
    // orang ketiga mana pun dipakai (lihat catatan "dua jebakan" di atas).
    const bos = S.orang.find((o) => ['kadis', 'sekdis', 'kabid', 'kasi'].includes(o.peran)
      && !o.standby && bisaDipinjam(o));
    /* SENGAJA bukan dinamai `r`: `r(x,y,w,h,c)` adalah helper gambar global
       room.js dan variabel lokal bernama r menutupinya di seluruh badan
       mulai(). Belum jadi bug selama mulai() tidak menggambar, tapi begitu ada
       yang kelak menambah satu baris gambar di sini (godaan paling umum di
       proyek ini) galatnya bukan pelanggaran aturan 3 yang khas melainkan
       "r is not a function" terhadap sebuah array — jauh lebih sulit dilacak. */
    const dua = pinjamAktor(E, 2, (o) => !o.standby && o !== bos);

    // Pinjam bos manual dengan pola baku magang-salah-sebut-jabatan
    // (17-easter-egg-lanjutan-...): pinjamAktor() memilih sendiri yang paling
    // lama datang, sedangkan di sini orangnya sudah ditentukan.
    let akhir = bos;
    if (akhir) {
      akhir.eventKerja = E; akhir.betahAsli = akhir.betah; akhir.betah = true;
      E.aktor.push(akhir);
    } else {
      akhir = pinjamAktor(E, 1, (o) => !o.standby)[0];
    }

    if (dua.length < 2 || !akhir) { E.selesaiCepat = true; return; }

    /* Urutan dua kurir pertama DIPILIH di sini, bukan dipakai apa adanya dari
       pinjamAktor() (yang mengurut arrivedAt — paling lama diam duluan, bukan
       paling dekat). Yang jadi mata rantai TENGAH adalah yang mejanya lebih
       dekat ke penerima terakhir.

       Kenapa satu perbandingan ini sudah optimal, bukan heuristik asal: cuma
       ada dua susunan yang mungkin, dan total jalan kakinya
       |awal−tengah| + |tengah−akhir|. Suku pertama SAMA di dua-duanya (jarak
       antara kedua kurir itu sendiri), jadi memilih yang total-nya terkecil
       persis sama dengan memilih |tengah−akhir| terkecil. Diukur atas seluruh
       enam MEJA_KERJA_X (60 susunan, route() asli): kasus terburuk turun dari
       1038 px jadi 906 px. Ini tidak mengubah SIAPA yang dipinjam, jadi
       keadilan pinjamAktor tetap utuh; yang berubah cuma arah rantainya. */
    const tengah = Math.abs(dua[0].x - akhir.x) <= Math.abs(dua[1].x - akhir.x) ? dua[0] : dua[1];
    const awal = tengah === dua[0] ? dua[1] : dua[0];

    E.data.q = [awal, tengah, akhir];
    E.data.i = 0;
    // Ditulis manual, bukan digenerate: tiap baris harus salah sedikit dengan
    // cara yang masuk akal — satu detail hilang, satu detail baru menempel.
    E.data.teks = [
      'rapat jam 2 di ruang kadis',
      'rapat jam 2, katanya bawa laptop',
      'jam 2 semua bawa laptop dan laporan',
    ];
    E.data.q[0].goToXY(E.data.q[1].x - 12, E.data.q[1].y, null);
  },

  tick(E) {
    /* Penutup duluan, SEBELUM penjaga E.data.selesai — kalau ditaruh di bawah
       sana ia tidak pernah terbaca dan slotnya tergantung sampai pagar durasi
       habis tanpa gambar apa pun (aturan 11). */
    if (E.data.tutupPada && E.umur > E.data.tutupPada) { E.selesaiCepat = true; return; }
    if (E.data.selesai) return;

    const q = E.data.q;
    if (!q) return;

    /* Aturan 7. q disimpan di E.data, jadi ia TIDAK ikut terpangkas waktu
       lepaskanAktor() memangkas E.aktor. Tool call sungguhan menang: begitu
       salah satu mata rantai direbut, rantainya putus di sini dan tidak ada
       perintah tertunda yang menyeret orang yang sedang bekerja. */
    const bawa = q[E.data.i], tuju = q[E.data.i + 1];
    if (!masihMain(E, bawa) || !masihMain(E, tuju)) {
      E.data.selesai = true; E.selesaiCepat = true; return;
    }

    /* ------------------------------------------ tenggat dihitung dari trayek
       Sisa trayek kurir yang sedang jalan, dalam piksel, dari posisinya
       sekarang lewat titik-titik path yang belum dilewati. Dibulatkan ke px
       lalu dipakai sebagai TANDA KEMAJUAN: selama angka itu masih berubah,
       langkahnya memang sedang jalan — seberapa pun pelannya, dan tanpa perlu
       menebak pengali laju yang dipasang event lain.

       Dua keadaan diam yang SAH ditangani dengan cara yang BERBEDA, dan
       bedanya penting:
         - jeda 3 detik waktu bicara memang membuat tanda berhenti berubah.
           Itu tidak dikecualikan, cuma DITOLERANSI: 3 detik (+ satu dt
           harness, jadi paling buruk 4) masih di bawah ambang 6.
         - pembekuan dari event lain lewat a.bekuSampai DIKECUALIKAN betulan,
           karena panjangnya di luar kendali berkas ini: jeda-maghrib dan
           hormat-bendera membekukan semua yang tidak adaTugas 8 detik penuh,
           lebih lama dari ambang mana pun yang masuk akal. Itu bukan macet,
           itu ruangan yang memang sedang berhenti.

       Selama masih maju, E.sisa ditahan di lantai 4 detik supaya pagar durasi
       tidak pernah jatuh di tengah mata rantai; begitu berhenti maju 6 detik,
       event menyerah sendiri. Itu yang menutup aturan 11, bukan durasi. */
    const MACET = 6, LANTAI = 4;
    let px = 0, wx = bawa.x, wy = bawa.y;
    for (const t of bawa.path) { px += Math.hypot(t.x - wx, t.y - wy); wx = t.x; wy = t.y; }
    const maju = E.data.i + (E.data.tunggu ? 't' : 'j') + Math.round(px);
    if (maju !== E.data.maju || now < bawa.bekuSampai) {
      E.data.maju = maju; E.data.majuSejak = E.umur;
    }
    if (E.umur - E.data.majuSejak > MACET) { E.selesaiCepat = true; return; }
    E.sisa = Math.max(E.sisa, LANTAI);

    if (bawa.diam && !E.data.tunggu) {
      E.data.tunggu = true;
      E.data.tungguSampai = E.umur + 3;
      bawa.say(E.data.teks[E.data.i]);
      /* face SAJA, dan cuma pada si pembicara — yang saat ini pasti sedang
         berdiri di station 'acara' hasil goToXY-nya sendiri. hadapkan()
         SENGAJA tidak dipakai: ia ikut menulis a.hadap yang lengket. Lihat
         "kenapa selesai() tidak ada lagi" di kepala berkas untuk buktinya;
         yang mendengarkan sengaja tidak diputar sama sekali. */
      bawa.face = Math.abs(tuju.x - bawa.x) > Math.abs(tuju.y - bawa.y)
        ? (tuju.x > bawa.x ? 'right' : 'left')
        : (tuju.y > bawa.y ? 'down' : 'up');
      /* Penerima ditahan di tempat oleh betah = true yang dipasang
         pinjamAktor(), BUKAN oleh busyUntil. Di sini dulu ada
         `tuju.busyUntil = Math.max(tuju.busyUntil, now + 2500)` dan baris itu
         mandul: satu-satunya tempat busyUntil bisa menahan orang adalah cabang
         IDLE_AFTER di Agent#update yang dibuka `!this.betah`, dan pemeran event
         selalu betah. Kalaupun bekerja, 2500 ms-nya sudah kedaluwarsa 0,5
         detik sebelum giliran berpindah (jeda event ini 3 detik). Yang
         berpengaruh kalau suatu saat penerima memang perlu dipaku: hentikan
         langkahnya (a.path) atau a.bekuSampai. */
      // Dua butir saja: yang harus dibaca penonton adalah teksnya.
      spawn('talk', bawa.x, bawa.y - 24);
      spawn('talk', bawa.x + 3, bawa.y - 26);
    }

    if (E.data.tunggu && E.umur > E.data.tungguSampai) {
      E.data.tunggu = false;
      E.data.i++;
      if (E.data.i >= 2) {
        // Mata rantai terakhir mengulang versi yang sudah melenceng jauh.
        const p = q[2];
        if (masihMain(E, p)) p.say(E.data.teks[2]);
        E.data.tanyaSejak = E.umur;
        E.data.tutupPada = E.umur + 2.5;
        E.data.selesai = true;
      } else {
        const berikut = q[1], target = q[2];
        // Disaring lagi: yang diperiksa di atas frame ini cuma q[0] dan q[1].
        if (!masihMain(E, berikut) || !masihMain(E, target)) {
          E.data.selesai = true; E.selesaiCepat = true; return;
        }
        berikut.goToXY(target.x - 12, target.y, null);
      }
    }
  },

  // gambarAtas: overlay, tidak butuh sortY. y-34 itu di atas kepala orang
  // berdiri — sama persis dengan magang-salah-sebut-jabatan (17-easter-egg-...).
  gambarAtas(E) {
    if (!E.data.tanyaSejak || E.umur - E.data.tanyaSejak > 1.2) return;
    const p = E.data.q && E.data.q[2];
    if (!masihMain(E, p)) return;
    r(Math.round(p.x) + 3, Math.round(p.y) - 34, 3, 5, '#ffb454');
  },

  // selesai() sengaja TIDAK ADA — lihat "kenapa selesai() tidak ada lagi" di
  // kepala berkas. Event ini tidak memasang satu pun field lengket.
},

);
