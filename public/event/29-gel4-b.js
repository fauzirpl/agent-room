/* ==========================================================================
   KUOTA HABIS & SALES YANG DIHINDARI
   ==========================================================================
   Dua usulan yang lolos triase bukan karena temanya baru, tapi karena
   AKIBATNYA belum pernah ada di 302 event terpasang:

     * Enam event printer yang sudah ada semuanya BISA DIBERESKAN — macetnya
       dicabut di detik 9 (printer-macet-kertas), stoknya diisi ulang di
       detik 8 (stok-kertas-habis), hasilnya diambil lalu dicap
       (fotokopi-kilat, numpang-print, cetak-massal-undangan, printer-nge-jam).
       Tidak satu pun yang menyampaikan "tidak bisa diapa-apakan, tunggu bulan
       depan" — padahal itu terjemahan paling jujur dari rate limit.
       kuota-fotokopi-habis satu-satunya yang buntu, dan buntu itu isinya.
     * Semua tamu yang sudah terpasang DIDATANGI dengan senang atau DITOLONG:
       pedagang-gelar-dagangan dikerubuti sampai orang jongkok melihat
       dagangannya, tamu-salah-alamat dan tamu-nyasar diantar,
       pemohon-surat-di-loket dilayani, rombongan-studi-banding dipandu,
       kurir dan ojol diserahi barang. Belum ada satu pun tamu yang orang
       MENGHINDAR darinya, dan itu seluruh lelucon sales-mesin-fotokopi.

   TIGA PENYIMPANGAN dari rencana yang disetujui. Semuanya lahir dari satu
   batas keras: berkas ini tidak boleh menyentuh room.js.

   1. MESIN FOTOKOPINYA TIDAK DIBUAT. Rencananya menaruh prop permanen baru
      (drawFotokopi() di x=157, entri PROPS sortY 118, MOD.kuotaHabis di
      MOD_AWAL) — ketiganya tinggal di room.js. Mesin itu TIDAK dipalsukan
      dari sini: prop yang cuma ada 22 detik lalu lenyap bukan perabot
      kantor, itu halusinasi, dan besok paginya ruangan berbohong. Yang
      dipakai justru mesin yang MEMANG sudah berdiri di ruangan: printer di
      meja printer (drawWindow — badan x202..224 y84..96, mulut kertas
      y92..94, LED di 219,87). Event ini cuma menambah dua benda yang memang
      tidak permanen — selembar 'KUOTA' yang nyangkut di mulut mesin dan LED
      yang berubah merah — keduanya digambar di gambarProp miliknya sendiri.
      Nol baris di room.js. Spesifikasi versi mesin fotokopinya dilaporkan
      utuh ke pemegang room.js, tidak dibuang.
   2. MOD.kuotaHabis TIDAK DIPAKAI. resetMod() berbunyi
      Object.assign(MOD, MOD_AWAL): kunci yang tidak terdaftar di MOD_AWAL
      TIDAK ikut dibersihkan. Menulis MOD.kuotaHabis dari berkas event justru
      melahirkan flag nyangkut selamanya — persis kebalikan dari yang dijaga
      aturan "MOD direset tiap frame". Karena gambarnya milik event sendiri,
      keadaannya dibaca dari E.umur/E.data, dan itu memang aman dibaca tiap
      frame.
   3. BEKAS PERMANEN BROSUR SALES DIBATALKAN, padahal rencananya menyebutnya
      "gratis". Dua alasan yang baru kelihatan waktu diperiksa ke room.js:
        a. drawPropLantai ada di sortY 119, meja rapat di 249. Kertas di ATAS
           taplak tidak akan pernah terlihat lewat propLantai; bekasnya
           terpaksa turun ke lantai, artinya brosurnya teleport ~30 px tepat
           di frame event usai.
        b. cap-ulang-tiga-kali (15-meta) membersihkan sampahnya dengan
           findIndex((p) => p.jenis === 'kertas-bekas') — yang PERTAMA
           ketemu, siapa pun pemiliknya. Menambah 'kertas-bekas' kedua bikin
           dua event saling menghapus sampah masing-masing, dan yang tersisa
           justru bekas milik event yang salah.
      Jadi brosurnya cukup tergeletak di taplak selama adegannya. Bekas
      permanen di meja rapat baru jujur kalau drawRapat yang menggambarnya.
   ========================================================================== */

/* Brosur mengkilap 6x8: putih dengan tiga garis warna. Dipakai dua kali (di
   tangan sales dan sesudah ditaruh di taplak), jadi satu fungsi. Namanya
   diberi awalan karena semua berkas event berbagi satu scope lexical. */
function salesGambarBrosur(x, y) {
  r(x, y, 6, 8, '#f4f2ea');
  r(x, y, 6, 1, '#ffffff');
  r(x + 1, y + 2, 4, 1, '#2a4f8a');
  r(x + 1, y + 4, 4, 1, '#c22b2b');
  r(x + 1, y + 6, 3, 1, '#9aa1a6');
}

daftarEvent(

/* Kuota fotokopi habis — satu-satunya event printer yang TIDAK bisa
   diperbaiki siapa pun. Semua tetangganya (macet, stok kertas, nge-jam)
   punya orang yang membetulkan dalam hitungan detik; yang ini cuma punya
   satu kalimat lalu bubar. Karena itu ia bentrok dengan ketujuhnya: dua
   cerita berlawanan tentang satu mesin yang sama di waktu yang sama bikin
   ruangan kelihatan tidak tahu mesinnya sedang kenapa.

   durasi 22 untuk aksi yang habis di detik ~19 (jalan ~4 + sadar 3 + berdiri
   8 + bubar ~4) — sisanya jeda napas, bukan slot yang dikunci percuma. */
{
  id: 'kuota-fotokopi-habis',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 22,
  babak: { malam: 0, libur: 0 },
  bentrokDengan: [
    'printer-macet-kertas', 'stok-kertas-habis', 'cetak-massal-undangan',
    'fotokopi-kilat', 'numpang-print', 'printer-nge-jam',
    'kasi-panggil-magang-fotokopi',
  ],
  /* Minimal dua orang yang bisa dipinjam: yang kena getahnya dan seorang
     pengantre. Satu orang saja di depan mesin cuma orang bengong.

     RADIUSNYA ikut jadi syarat, bukan cuma dipakai di mulai(). mulai() memanggil
     pemeranDekat(E, 212, 164, 220) yang mengembalikan null kalau semua kandidat
     lebih jauh dari 220 px — dan tiga meja kerja MEMANG di luar radius itu:
     slot 3 (444,350) 297 px, slot 1 (374,350) 247 px, slot 2 (86,350) 225 px.
     Kalau dua penganggur terakhir kebetulan di meja-meja itu, mulai() pulang
     dengan tangan kosong, perluAktor membatalkan, dan matikanEvent(E, true)
     MENIMPA cooldown 600 detik dengan 20 detik — event ini lalu ikut undian
     lagi tiap 20 detik selama keadaannya bertahan, memakan jatah event lain. */
  syarat: (S) => S.jam >= 8 && S.jam < 16
    && S.orang.filter((o) => bisaDipinjam(o) && jarakKe(o, 212, 164) < 220).length >= 2,
  perluAktor: true,
  mulai(E) {
    // (212,152): idiom stasiun dinding yang sudah dipakai stok-kertas-habis
    // (54,152) dan berkas lain (132,152 / 286,152) — 12 px di depan lajur
    // atas, tidak menembus kaki meja printer yang berakhir di y=116.
    const a = pemeranDekat(E, 212, 164, 220);
    if (!a) return;                     // perluAktor membatalkan; jangan antre sendirian
    E.data.a = a;
    a.doingEvent = 'mau menggandakan berkas';
    // Berkas yang mau digandakan; DILEPAS di selesai(). Sengaja tanpa
    // a.bawaSampai — kalau diisi, lepaskanAktor() ikut membiarkannya kebawa
    // pulang, dan pegawai yang kertasnya menempel berjam-jam bukan adegan.
    a.bawa = 'kertas';
    a.goToXY(212, 152, 'up');
    // Antrean sungguhan, bukan gerombolan: dua titik di LANE_UP berjarak
    // 14 px, menghadap mesin. 230/244 aman — kursi jauh baru mulai y=169 dan
    // titik berdiri stasiun terdekat (edit, x=286) masih 42 px jauhnya.
    E.data.q = pinjamAktor(E, 2);
    E.data.q.forEach((o, i) => {
      o.doingEvent = 'antre fotokopi';
      o.goToXY(230 + i * 14, 164, 'left');
    });
  },
  tick(E, dt, S) {
    // Potret pemeran TIDAK ikut terpangkas waktu tool call sungguhan merebut
    // orangnya; disaring sekali di sini, dipakai sepanjang tick.
    const a = masihMain(E, E.data.a) ? E.data.a : null;

    /* Pemeran utama direbut tool call sungguhan SEBELUM sempat berdiri diam di
       depan mesin: a jadi null selamanya, jadi sadarPada di bawah tidak pernah
       terisi — dan tanpa sadarPada, bubarPada juga tidak. Akibatnya dua
       pengantre berdiri beku di (230,164) dan (244,164) sampai durasi 22 habis,
       tanpa kalimat, tanpa ping: betah=true (dipasang pinjamAktor) mematikan
       penyelamat IDLE_AFTER di Agent.update(), jadi mereka benar-benar tidak
       bisa pulang sendiri. Tenggat bubarnya dimajukan ke SEKARANG; frame
       berikutnya E.umur sudah melewatinya dan blok bubar menyuruh mereka
       pulang. Eventnya sendiri dibiarkan hidup sampai durasinya: yang tersisa
       memang propnya — lembar 'KUOTA' yang nyangkut di mulut mesin dan LED
       merah — persis seperti ~7 detik terakhir jalur normal. */
    if (!a && !E.data.sadar) { E.data.sadar = true; E.data.bubarPada = E.umur; }

    // Tenggat disimpan SEKALI lalu dibandingkan manual. pada(E, E.umur + 3,
    // ...) tidak akan pernah berbunyi: pada() diam selama E.umur < detik,
    // sedangkan targetnya ikut maju tiap frame.
    if (a && a.diam && E.data.sadarPada == null) E.data.sadarPada = E.umur + 3;

    if (E.data.sadarPada != null && E.umur > E.data.sadarPada && !E.data.sadar) {
      E.data.sadar = true;
      E.data.bubarPada = E.data.sadarPada + 8;
      E.data.sahutPada = E.data.sadarPada + 2.5;
      E.data.blipPada = E.umur + 0.35;              // nada gagal kedua
      if (a) { a.pose = 'silang'; a.say('jatahnya habis, nunggu bulan depan'); }
      spawn('ping', 213, 90); spawn('ping', 213, 90);
      blip(220, 0.12);
      // Yang lain cukup menoleh — mesin buntu tidak butuh kerumunan.
      menoleh(S.orang.filter((o) => !o.eventKerja && jarakKe(o, 212, 152) < 80),
        212, 140, 1600);
    }
    if (E.data.blipPada && E.umur > E.data.blipPada) {
      E.data.blipPada = 0;
      blip(220, 0.12);
    }

    if (E.data.sahutPada && E.umur > E.data.sahutPada) {
      E.data.sahutPada = 0;
      const q0 = yangMasihMain(E, E.data.q)[0];     // yang direbut tool call tidak ikut nyahut
      if (q0) q0.say('bulan depan? berkas saya hari ini');
    }

    if (E.data.bubarPada && E.umur > E.data.bubarPada && !E.data.bubar) {
      E.data.bubar = true;
      for (const o of yangMasihMain(E, E.data.q)) {
        o.doingEvent = '';
        o.goTo(stasiunPulang(o));
      }
      if (a) { a.pose = null; a.doingEvent = ''; a.goTo(stasiunPulang(a)); }
    }
  },
  /* Dua benda, dua-duanya menempel di printer yang SUDAH ada dan dua-duanya
     memang tidak permanen. sortY 118 > 116 (drawWindow), jadi LED bawaan
     mesin benar-benar tertimpa; semuanya di y<=103, jauh di atas kepala
     siapa pun yang berdiri di LANE_UP (y=164, digambar belakangan). */
  gambarProp(E) {
    // Lembar yang setengah keluar lalu berhenti di mulut mesin: satu-satunya
    // yang masih mau dicetak mesin ini hari ini adalah pemberitahuan bahwa
    // dia tidak mau mencetak apa-apa lagi.
    r(202, 94, 22, 9, '#f4f2ea');
    r(202, 94, 22, 1, '#ffffff');
    r(204, 96, 16, 1, '#c22b2b');
    ctx.fillStyle = '#2c3440';
    // 5px, ukuran terkecil yang dipakai ruangan ini (drawWindow sendiri menulis
    // 'STRUKTUR ORG.' dengan 5px). 4px sempat dicoba dan jadi satu-satunya di
    // seluruh basis kode — pada kanvas 480x356 berskala bulat hasilnya noda,
    // bukan tulisan. 'KUOTA' pada Courier 5px ≈ 5 x 3 = 15 px: mulai x=204,
    // berakhir ~219, masih di dalam lembar yang membentang x202..223.
    ctx.font = '5px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('KUOTA', 204, 100);
    // LED mesin: merah berkedip ~1,5 Hz, menimpa LED hijau bawaan drawWindow
    r(219, 87, 2, 2, Math.sin(now / 333) > 0 ? '#e8453f' : '#5c2222');
  },
  sortY: 118,
  selesai(E) {
    // pose LENGKET. E.aktor sudah dipangkas lepaskanAktor(), jadi yang
    // dibersihkan di sini cuma yang memang masih milik event ini.
    for (const o of E.aktor) { o.pose = null; o.doingEvent = ''; }
    if (masihMain(E, E.data.a)) E.data.a.bawa = null;
  },
},

/* Sales mesin fotokopi — satu-satunya tamu di ruangan ini yang orang
   MENGHINDAR darinya. Dia bukan Agent (orang non-pegawai tidak punya sesi,
   tidak muncul di panel kru, tidak ikut berebut slot stasiun), cuma objek
   {x,y,hadap,wp} di E.data yang dimajukan TAMU_BIROKRASI.langkah() dan
   digambar TAMU_BIROKRASI.gambar() — jalur yang sudah dibuktikan
   pemohon-surat-di-loket dan rombongan-studi-banding.

   Perhentiannya TIDAK diambil dari daftar meja apa adanya, tapi dari slotIdx
   pemeran yang benar-benar dipinjam: kalau tidak, sales berpidato di depan
   meja kosong sementara "korbannya" kabur dari ujung ruangan yang lain. Meja
   slot 3 (x=444) dibuang — pojok itu sudah berdesakan dengan pantry
   (x414..478) dan tong sampah (437,278).

   Berdiri di y=302: 20 px di depan papan meja kerja (drawMejaKerja y=322),
   jadi tidak menembus perabot apa pun; sortY 302 > 249 (meja rapat) supaya
   brosur yang ditaruh benar-benar jatuh DI ATAS taplak. Harga yang dibayar
   sama dengan tiga tamu di 25-tamu-birokrasi: satu event cuma punya satu
   sortY, jadi selagi transit di lajur bawah dia lewat di depan pejalan lain.
   Dipilih benar untuk adegan utamanya, bukan untuk transitnya.

   Anggaran durasi, DISIMULASIKAN pada 30 fps memakai jalur() + langkah() yang
   sungguhan, bukan ditaksir: 3 korban terjauh (86/242/374) habis di detik
   43,7; 3 korban dekat 37,8; 2 korban 33,3–36,3; 1 korban 23,1–29,0. Jadi 55
   itu BATAS ATAS, bukan lama tayang — begitu sales melewati tepi kiri layar
   eventnya membunuh diri sendiri (E.selesaiCepat di tick), supaya kelas
   'panggung' tidak mengunci adegan lain 11 sampai 32 detik untuk ruangan yang
   cuma punya satu-dua korban. Jaring pengamannya di detik 42, lihat tick(). */
{
  id: 'sales-mesin-fotokopi',
  kelas: 'panggung', bobot: B.jarang, cooldown: 2400, durasi: 55,
  babak: { apel: 0, istirahat: 0.3, pulang: 0.2, lembur: 0, malam: 0, libur: 0 },
  /* Yang ditulis di sini cuma tamu kelas LATAR. Tiga tamu panggung yang dulu
     terdaftar (pedagang-gelar-dagangan, rombongan-studi-banding,
     tamu-salah-alamat) MUBAZIR: bentrok() sudah menolak lebih dulu lewat
     `def.kelas === 'panggung' && eventHidup.some(panggung)`, jadi baris itu
     tidak pernah menahan apa pun dan malah bikin daftarnya terbaca seolah
     sudah lengkap. Tamu latar-lah yang benar-benar bisa berdiri di ruangan
     yang sama pada detik yang sama — dan dua orang asing sekaligus bikin
     ruangan terbaca seperti lobi, bukan kantor dinas.
     kurir-paket-datang / ojol-antar-kopi / tukang-galon-datang SENGAJA tidak
     ikut: bentrok() dibaca dua arah, jadi mendaftar event berbobot 'sering'
     akan ikut memveto event 'jarang' ini tiap kali salah satunya hidup —
     lagipula mereka menyerahkan barang lalu pergi, tidak berkeliling menawari
     orang seperti tiga di bawah. */
  bentrokDengan: [
    'pemohon-surat-di-loket', 'mahasiswa-magang-bingung', 'tamu-nyasar',
  ],
  syarat: (S) => S.jam >= 9 && S.jam < 15
    && S.orang.filter((o) => o.station === 'think' && bisaDipinjam(o)).length >= 2,
  // Tanpa orang yang kabur ini bukan adegan, cuma orang asing menyeberang
  // ruangan — dan kelas 'panggung' mengunci adegan lain selama dia hidup
  // (15,8 detik untuk cabang tanpa korban, sampai 43,7 detik dengan tiga).
  perluAktor: true,
  mulai(E) {
    const korban = pinjamAktor(E, 3, (o) => o.station === 'think' && o.slotIdx !== 3);
    /* Urut menurut TITIK HENTI, bukan menurut posisi orangnya sekarang.
       bisaDipinjam() cuma menolak state 'work', jadi pegawai yang sedang
       BERJALAN pulang ke mejanya (state 'walk', station-nya sudah 'think')
       tetap boleh dipinjam — dan x-nya saat itu bisa jauh dari mejanya.
       Diurutkan pakai x sekarang, rutenya bisa jadi 374 lalu 86: menyeberang
       ruangan dua kali, persis kebalikan dari yang dijanjikan di sini.
       MEJA_KERJA_X sendiri urut prioritas pakai ([176,374,86,444,242,308]),
       bukan urut kiri-ke-kanan, jadi slotIdx tidak bisa dipakai apa adanya. */
    const pas = korban.map((o) => {
      const mx = MEJA_KERJA_X[o.slotIdx];
      return { o, mx: mx == null ? Math.round(o.x) : mx };
    });
    pas.sort((p, q) => p.mx - q.mx);
    E.data.korban = pas.map((p) => p.o);
    E.data.stop = pas.map((p) => p.mx);
    E.data.tahap = 0;
    E.data.t = { x: -16, y: LANE_DOWN, hadap: 'right', wp: [] };
    if (E.data.stop.length) {
      E.data.fase = 'jalan';
      E.data.t.wp = TAMU_BIROKRASI.jalur(-16, LANE_DOWN, E.data.stop[0], 302);
    } else {
      // Tidak ada yang bisa dicegat: langsung ke meja rapat, brosurnya
      // ditinggal, keluar. Di ruangan sungguhan cabang ini tidak pernah jalan
      // (perluAktor membatalkan lebih dulu) — ini jaring untuk harness.
      E.data.fase = 'rapat';
      E.data.t.wp = TAMU_BIROKRASI.jalur(-16, LANE_DOWN, 246, 240);
    }
  },
  /* Tahap bernomor yang maju begitu langkah() bilang sudah sampai — bukan
     pada() bersarang, dan bukan pada() bertenggat bergerak. Jeda antar
     perhentian disimpan SEKALI di E.data.jedaPada lalu dibandingkan manual.
     Rantainya sengaja else-if: satu peralihan per frame, jadi `sampai` yang
     dihitung di awal frame tidak dipakai ulang untuk wp yang baru dipasang. */
  tick(E, dt) {
    const T = E.data.t;
    if (!T) return;
    const sampai = TAMU_BIROKRASI.langkah(T, dt, 44);   // langkah() sudah berskala dt

    if (E.data.fase === 'jalan' && sampai) {
      E.data.fase = 'tawar';
      E.data.jedaPada = E.umur + 5;
      T.hadap = 'down';                                  // menghadap meja, bukan penonton
      spawn('paper', T.x, T.y - 26);                     // brosurnya diangkat
      spawn('talk', T.x, T.y - 26);
      spawn('talk', T.x, T.y - 26);
      // Korban bisa sudah direbut tool call sungguhan sejak mulai(); yang
      // sudah lepas TIDAK boleh disuruh kabur dari sini.
      const k = yangMasihMain(E, [E.data.korban[E.data.tahap]])[0];
      if (k) {
        hadapkan(k, T.x, T.y);
        k.say('maaf, saya lagi ada berkas');
        k.doingEvent = 'menghindari sales';
        k.goTo('idle');
      }
    } else if (E.data.fase === 'tawar' && E.data.jedaPada && E.umur > E.data.jedaPada) {
      E.data.jedaPada = 0;
      E.data.tahap++;
      if (E.data.tahap < E.data.stop.length) {
        E.data.fase = 'jalan';
        T.wp = TAMU_BIROKRASI.jalur(T.x, T.y, E.data.stop[E.data.tahap], 302);
      } else {
        E.data.fase = 'rapat';
        T.wp = TAMU_BIROKRASI.jalur(T.x, T.y, 246, 240);
      }
    } else if (E.data.fase === 'rapat' && sampai) {
      E.data.fase = 'taruh';
      E.data.taruh = true;
      E.data.pergiPada = E.umur + 3;
      T.hadap = 'up';
      spawn('paper', 234, 210);        // tepat di titik brosur diletakkan (232,208)
    } else if (E.data.fase === 'taruh' && E.data.pergiPada && E.umur > E.data.pergiPada) {
      E.data.pergiPada = 0;
      E.data.fase = 'keluar';
      T.wp = TAMU_BIROKRASI.jalur(T.x, T.y, -26, LANE_DOWN);
    } else if (E.data.fase === 'keluar' && sampai) {
      E.data.fase = 'selesai';
      /* Sudah lewat tepi kiri layar: gambarProp() berhenti menggambar apa pun,
         tapi kelas 'panggung' tetap mengunci SEMUA adegan panggung lain sampai
         durasinya habis. Aksinya sendiri habis jauh lebih awal dari 55 (lihat
         angka simulasi di kepala event ini), jadi tanpa baris ini panggungnya
         terkunci 11 sampai 32 detik untuk pertunjukan yang sudah bubar.
         Idiom yang sama dipakai 20+ event lain; matikanEvent() tetap lewat
         jalur normal, jadi selesai() tetap jalan dan aktornya tetap dilepas. */
      E.selesaiCepat = true;
    }

    /* Jaring pengaman: kalau rutenya tersendat, dia tetap harus sempat keluar
       sebelum durasinya habis — bukan lenyap di tengah ruangan. Ambangnya 13
       detik sebelum durasi, bukan 9: jalan terjauh yang mungkin adalah dari
       perhentian (374,302) ke (-26,252), yaitu 50 px turun + 400 px mendatar =
       450 px pada 44 px/detik = 10,3 detik. Dengan ambang lama 46 dia justru
       LENYAP di x=28 — di tengah ruangan — tepat saat detik 55; persis akibat
       yang jaring ini seharusnya cegah. Ditulis relatif ke durasi supaya tetap
       benar kalau durasinya kelak diubah. */
    if (E.data.fase !== 'keluar' && E.data.fase !== 'selesai'
        && E.umur > E.def.durasi - 13) {
      E.data.fase = 'keluar';
      T.wp = TAMU_BIROKRASI.jalur(T.x, T.y, -26, LANE_DOWN);
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -14 || E.data.fase === 'selesai') return;
    // Kemeja putih + koper hitam; 'koper' sudah ada di drawBawaan.
    TAMU_BIROKRASI.gambar({ x: T.x, y: T.y, hadap: T.hadap, wp: T.wp },
      '#e8e6e0', null, 'koper', '#2b2118');
    /* Brosur, dua tempat. Dua-duanya pernah salah; angka penggantinya diukur
       dengan MEREKAM fillRect sungguhan lewat sandbox uji-event.mjs, bukan
       dikira-kira dari gambar.

       DIBAWA. Angka lama (x-3, y-24) menutupi SELURUH WAJAH sepanjang adegan.
       drawPerson memasang yDagu = y-17 dan drawHead menggambar kepala di baris
       y-25..y-18 kolom x-4..x+3, jadi kartu 6x8 di y-24 menimpa 48 piksel
       kepala — termasuk kedua kotak mata (baris y-21..y-19) dan mulutnya —
       selama fase jalan/tawar/rapat, sekitar 34 dari 55 detik. Sekarang ikut
       idiom drawBawaan: setinggi dada-ke-sabuk (y-15..y-8) di sisi badan.
       x-12 adalah cerminan tepat dari x+6 yang dipakai drawBawaan di sisi
       kanan (sumbu cermin di x: kolom x+k berpasangan dengan x-k-1), jadi
       kartunya menutupi 2 kolom terluar lengan persis seperti koper menutupi
       lengan kanan — dipegang, bukan melayang. Sisinya BERLAWANAN dengan koper
       (drawBawaan: x+6 kalau menghadap selain kiri, x-14 kalau menghadap kiri)
       supaya dua benda 6 px itu tidak pernah bertindih. Hasil ukur sesudah
       diperbaiki: kepala tertimpa 0 px di ketiga arah hadap, lengan 16 px.

       DITARUH. (238,210) menyerempet ubun-ubun sales yang berhenti di
       (246,240): kepalanya x242..249 y215..222, brosurnya x238..243 y210..217 —
       beririsan 9 piksel, dan sortY 302 bikin brosur yang menang. Digeser ke
       (232,208): taplak di y=208 membentang x175..317 (trapRows), gelas
       terdekat berakhir di x230, jadi masih di atas kain dan 0 px menyentuh
       sosok siapa pun. */
    if (E.data.taruh) { salesGambarBrosur(232, 208); return; }
    // Naik-turun mengikuti badannya: drawPerson memakai bob dari a.phase, dan
    // TAMU_BIROKRASI.gambar mengisi phase = now/1000 serta state 'walk' selama
    // wp masih ada. Tanpa ini kartunya terlihat melayang lepas dari tangan.
    const t = now / 1000;
    const bob = T.wp && T.wp.length
      ? (Math.abs(Math.sin(t * 10)) > 0.72 ? -1 : 0)
      : (Math.sin(t * 1.7) > 0.6 ? -1 : 0);
    const bx = T.hadap === 'left' ? Math.round(T.x) + 6 : Math.round(T.x) - 12;
    salesGambarBrosur(bx, Math.round(T.y) + bob - 15);
  },
  sortY: 302,
  selesai(E) {
    // doingEvent LENGKET; sisanya (pose, bawa, laju) tidak pernah disentuh
    // event ini, jadi tidak ada yang perlu dikembalikan.
    for (const o of E.aktor) o.doingEvent = '';
  },
},

);
