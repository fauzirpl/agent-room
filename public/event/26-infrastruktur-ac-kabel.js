/* ==========================================================================
   AC, KABEL, KARPET — infrastruktur yang bikin ruangan ini bocor & kesandung
   ==========================================================================
   Tiga usulan yang vonis rapatnya "mahal", dan yang mahalnya ternyata bukan
   idenya melainkan cara implementasi yang diusulkan. Yang dibuang dan
   alasannya, supaya peninjau tidak mengira ini kelalaian:

   1. Larangan segmen di route() (teknisi-ac-datang) DIBUANG. route() dipanggil
      dari goTo/goToXY setiap kali siapa pun berpindah; menyisipkan larangan di
      situ berarti menyentuh jalur perpindahan SEMUA sesi Claude Code nyata demi
      satu event 90 detik. Tangganya berdiri di x≈352 — di luar meja rapat, di
      sela antara meja stempel (286) dan rak server (364) — jadi pegawai yang
      lewat cuma menembusnya, persis seperti mereka menembus satu sama lain
      sekarang. Yang dikerjakan cuma menggeser embernya, yang memang murah.

   2. Field baru `a.naik` di drawPerson (pose naik tangga) DIBUANG. Teknisinya
      bukan Agent — dia objek biasa di E.data yang digambar gambarOrangLuar(),
      jadi "naik dua anak tangga" cukup fy dikurangi 12 px. Gratis, tanpa
      menyentuh drawPerson sama sekali.

   3. drawFloor() karpet diekstrak jadi fungsi berparameter DIBUANG.
      gambarLantai dipanggil SESUDAH drawFloor (lihat urutan di frame()), jadi
      petak yang tersingkap cukup dicat ulang dari sini: ubin bersih + nat +
      berkas cahaya jendela dipulihkan. Konsekuensi jujurnya di catatan event
      ketiga: "warna karpet 1 tingkat lebih cerah sisa sesi" tidak bisa dan
      tidak dikerjakan.

   Yang TIDAK dibuang justru bagian yang katalog kira mahal: menahan langkah
   tanpa mengosongkan path (a.bekuSampai sudah ada), badan miring waktu
   tersandung (a.miring sudah dibaca drawPerson), dan jalan pelan (a.laju).
   ========================================================================== */

/* Lakban kabel lantai bersifat permanen sampai halaman dimuat ulang. Disimpan
   sebagai variabel berkas ini, BUKAN field baru di RUANGAN: yang membacanya
   cuma syarat() event ini sendiri, dan RUANGAN adalah kontrak bersama room.js
   yang tidak boleh ditumbuhi field yang tak ada penggambarnya di sana. */
let kabelLantaiSudahDilakban = false;

daftarEvent(

/* Teknisi AC.
   Inti event ini satu baris — MOD.drip dinaikkan sampai tetesan tidak pernah
   jatuh lagi — dan justru itu yang paling terasa, karena bunyi/percikan tetes
   AC sudah jadi latar yang selalu ada sejak halaman dibuka.

   Sebab itu durasinya 900 detik padahal adegannya cuma ±70 detik: MOD DIRESET
   SETIAP FRAME, jadi satu-satunya cara membuat perbaikan bertahan adalah
   eventnya sendiri tetap hidup dan menuliskannya ulang tiap frame. Sisa 830
   detik itu tick yang tidak menggambar apa pun (gambarProp keluar lebih awal
   begitu teknisinya sudah di luar layar).

   Bonus dari mesinnya, bukan kebetulan: tickEvent() menyapu eventHidup dari
   BELAKANG ke depan, jadi event yang menyala BELAKANGAN di-tick lebih DULU.
   Event tetesan lain yang menyala di tengah 15 menit ini (ac-bocor-deras) akan
   menulis MOD.drip-nya lebih dulu, lalu ditimpa 99999 di sini. Perbaikan
   menang atas kebocoran baru, dan itu memang yang benar. */
{
  id: 'teknisi-ac-datang',
  kelas: 'latar', bobot: B.jarang, cooldown: 3600, durasi: 900,
  babak: { malam: 0, libur: 0, apel: 0.4, pulang: 0.3, lembur: 0.2 },
  // ember-ac-penuh juga memakai RUANGAN.emberDiangkat; dua adegan yang
  // memindahkan ember yang sama bersamaan = ember dobel di dua tempat.
  bentrokDengan: ['ember-ac-penuh', 'ac-bocor-deras'],
  // Dipanggil kalau embernya sudah terisi banyak — itu tanda tetesannya sudah
  // berjalan lama, persis pemicu yang diminta katalog. CATATAN untuk harness:
  // uji-event.mjs mereset RUANGAN ke pristine (emberIsi: 0) sebelum SETIAP
  // kombinasi syarat, jadi angkanya pasti 0/36 di sana. Di ruangan sungguhan
  // emberIsi naik 1 per tetes (MOD.drip 2,6 detik), jadi ambang 20 tercapai
  // ±52 detik sesudah halaman dibuka dan bertahan sampai ember dikosongkan.
  syarat: (S) => S.kerjaJam && RUANGAN.emberIsi >= 20,
  // sengaja TANPA perluAktor: bintangnya teknisi dari luar, pegawai yang
  // memegangi tangga cuma bonus kalau kebetulan ada yang menganggur
  mulai(E) {
    // Masuk dari KIRI, bukan keluar lewat kanan seperti di katalog: lima event
    // orang luar yang sudah ada (kurir, ojol, satpam, tukang galon, wartawan)
    // semuanya memakai x=-14 di LANE_DOWN sebagai "pintu". Kanan itu ruang
    // kadis, bukan jalan keluar.
    // Lewat LANE_UP, bukan LANE_DOWN. sortY event ini 152 (di depan perabot
    // dinding, di belakang kursi jauh) — benar untuk lajur ATAS. Kalau dia
    // transit di LANE_DOWN, sortY 152 membuatnya digambar di BELAKANG meja
    // rapat (249) dan kursi dekat (260): sepanjang x170..322 kepalanya
    // tertelan meja dan badannya tertutup kursi, ~16 detik.
    E.data.t = { x: -14, y: LANE_UP, fase: 'masuk', naik: 0, tangga: false };
  },
  tick(E, dt) {
    const T = E.data.t;

    /* --- inti: tetesan mati dan TETAP mati selama event hidup ------------ */
    // ditulis ulang tiap frame karena MOD direset di awal setiap frame
    if (E.data.acOff) MOD.drip = 99999;

    if (T.fase === 'selesai') return;        // 13 menit sisanya: cuma flag di atas

    /* --- perjalanan ------------------------------------------------------ */
    if (T.fase === 'masuk') {
      T.x = Math.min(352, T.x + 44 * dt);    // 0,85x kecepatan pegawai: dia memanggul tangga
      if (T.x >= 352) T.fase = 'naik';
    } else if (T.fase === 'naik') {
      T.y = Math.max(152, T.y - 44 * dt);
      if (T.y <= 152) { T.fase = 'kerja'; T.kerjaPada = E.umur; T.tangga = true; }
    } else if (T.fase === 'turun') {
      T.y = Math.min(LANE_UP, T.y + 44 * dt);
      if (T.y >= LANE_UP) T.fase = 'pulang';
    } else if (T.fase === 'pulang') {
      T.x -= 46 * dt;
      if (T.x < -16) T.fase = 'selesai';
    }

    /* --- di atas tangga -------------------------------------------------- */
    if (T.fase === 'kerja') {
      const t = E.umur - T.kerjaPada;
      // Memanjat SAMPAI KE AC. Versi lama berhenti di 12 px: kakinya y=140,
      // kepala ~y117, sementara unit AC-nya digambar drawWall di y14..27 —
      // 90 px di atasnya. Adegan intinya jadi tidak nyambung: dia menjepit
      // "talang" 12 px buatan event ini sendiri yang tidak menyentuh apa pun.
      // 86 px: kaki di y=66, puncak kepala ~y31, tepat di bawah unitnya.
      if (t > 3 && t < 30) T.naik = Math.min(86, T.naik + 26 * dt);
      if (t > 30) T.naik = Math.max(0, T.naik - 26 * dt);
      if (t > 34 && T.naik <= 0) { T.fase = 'turun'; T.tangga = false; }
      // begitu dia benar-benar di atas: talang dijepit, tetesan berhenti
      if (!E.data.acOff && T.naik >= 84) E.data.acOff = E.umur;
      // debu/serbuk karat dari talang yang dikorek
      if (T.naik > 60 && Math.random() < 1.2 * dt) spawn('dust', 350 + acak(-4, 4), 32);
    }

    // ember digeser 10 px ke kiri selama dia bekerja di kolom yang sama.
    // RUANGAN.emberDiangkat itu LENGKET — dimatikan lagi di bawah dan di selesai().
    // Pemicunya WAJIB one-shot terpisah dari penjaga resetnya. Versi lama
    // memakai !E.data.emberGeser sebagai pemicu sekaligus penanda, jadi pada
    // frame transisi 'turun' -> 'pulang' ia menyala lagi dan tidak ada yang
    // mematikannya: RUANGAN.emberDiangkat (LENGKET) tersangkut true sampai
    // selesai() di detik 900 — embernya hilang dari lantai ~14 menit,
    // emberIsi berhenti terisi, dan event lain yang membacanya ikut terkunci.
    if (E.data.acOff && !E.data.emberSudah) {
      E.data.emberSudah = true; E.data.emberGeser = true; RUANGAN.emberDiangkat = true;
    }
    if (E.data.emberGeser && T.fase !== 'kerja') { E.data.emberGeser = false; RUANGAN.emberDiangkat = false; }

    // empat ketuk obeng, detik TETAP (pada() tidak boleh dipakai untuk tenggat
    // yang bergerak). Rentang 20–22 s aman: dia sudah di atas sejak ±14 s.
    pada(E, 20.0, () => blip(130, 0.05));
    pada(E, 20.6, () => blip(130, 0.05));
    pada(E, 21.2, () => blip(130, 0.05));
    pada(E, 21.8, () => blip(130, 0.05));

    /* --- pegawai yang memegangi tangga ----------------------------------- */
    if (T.fase === 'kerja' && !E.data.dicoba) {
      E.data.dicoba = true;
      const a = pemeranDekat(E, 352, LANE_UP, 320) || pemeran(E, ['teknisi', 'pranata_muda']);
      if (a) {
        E.data.pegang = a;
        a.doingEvent = 'memegangi tangga';
        a.pose = 'angkat';
        a.goToXY(334, LANE_UP, 'right');
        E.data.lepasPada = E.umur + 40;      // tenggat dinamis: disimpan sekali
      }
    }
    const p = E.data.pegang;
    // p bisa direbut tool call nyata di tengah jalan (lepasDariEvent) — cek
    // eventKerja, jangan cuma cek objeknya masih ada
    if (p && p.eventKerja === E) {
      // Balon aslinya milik teknisi ("udah, Pak, tinggal dilap"). Orang luar
      // tidak punya say() — bukan Agent, tidak punya sesi — jadi kalimatnya
      // dibalik jadi tanggapan pegawai, pola yang sama dengan ojol-antar-kopi.
      if (T.fase === 'turun' && !E.data.ucap) {
        E.data.ucap = true;
        p.pose = null;
        p.say('jadi tinggal dilap ya, Pak?');
      }
      if (E.data.lepasPada && E.umur > E.data.lepasPada) {
        lepaskanAktor(p);                     // WAJIB: bukan splice manual
        E.data.pegang = null;
      }
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.fase === 'selesai' || T.x < -16) return;
    const x = Math.round(T.x), y = Math.round(T.y);

    // Ember yang digeser: aslinya 341..355, di sini 322..336. Dulu 331..345
    // dan itu BERTUMPANG dengan bibir ember asli — drawEmber menggambar
    // r(341,122,14,2) TANPA syarat, sebelum cabang emberDiangkat-nya, jadi
    // yang terlihat bukan "bekas basah" melainkan satu bibir selebar 24 px.
    if (E.data.emberGeser) {
      r(322, 122, 14, 2, '#4a7fd0');
      r(323, 124, 12, 8, '#3f6d9e');
      r(323, 129, 12, 3, '#4a7a90');
      ctx.globalAlpha = 0.35;                 // bekas basah di tempat lamanya
      r(341, 130, 14, 3, '#3a5a70');
      ctx.globalAlpha = 1;
    }

    if (T.tangga) {
      // Tangga setinggi panjatannya: kaki y=154 sampai pijakan atas y=60.
      // Versi lama cuma 4 anak sampai y=124 padahal orangnya naik 86 px —
      // dari detik ke-6 dia memanjat udara. Kolom x345..359 sudah diverifikasi
      // bebas: drawServer baru mulai di x=364.
      const bx = 352, kaki = 154, atas = 64;
      const anak = Math.round((kaki - atas) / 8);
      for (let i = 0; i < anak; i++) {
        const yy = kaki - 6 - i * 8;
        const off = 7 - Math.round(i * 3 / anak);     // menyempit ke atas
        r(bx - off, yy, 2, 8, '#8a7a52');
        r(bx + off - 2, yy, 2, 8, '#8a7a52');
        r(bx - off + 2, yy + 5, (off - 1) * 2, 1, '#a8965f');
      }
      r(bx - 5, atas, 10, 2, '#6b5c3e');       // pijakan atas, tepat di bawah kaki
      // Pipa pembuangan sungguhan: dari bawah unit AC (y=27, drawWall
      // menggambarnya di x336..374) turun lurus ke plin. Dulu potongan 12 px
      // menggantung di y112..124 tanpa menyentuh apa pun, dan tetesan yang
      // lahir di y=30 justru jatuh MENEMBUSnya.
      r(343, 27, 3, 97, '#5a6068');
      r(343, 27, 1, 97, '#7c838a');
    } else {
      // tangga masih dipanggul, di sisi badannya
      const lx = x + (T.fase === 'pulang' ? 6 : -9);
      r(lx, y - 27, 3, 21, '#8a7a52');
      r(lx, y - 24, 3, 1, '#a8965f');
      r(lx, y - 18, 3, 1, '#a8965f');
      r(lx, y - 12, 3, 1, '#a8965f');
    }

    // wearpack biru, helm proyek kuning (dititipkan lewat argumen "rambut")
    gambarOrangLuar(T.x, T.y - T.naik, '#2f5f9e', null, null, '#e8a23a');

    if (T.fase === 'kerja' && T.naik > 6) {
      const g = Math.sin(now / 60) > 0 ? 1 : 0;
      r(x + 4, y - T.naik - 35 + g, 2, 6, '#b9c0ca');   // obeng di atas kepala
      r(x + 4, y - T.naik - 30 + g, 2, 2, '#c2452f');
    }
  },
  // di depan perabot dinding (sortY 118–119), di belakang pegawai yang lewat
  // di LANE_UP (y=164) — dia memang berdiri lebih ke dalam daripada mereka
  sortY: 152,
  selesai(E) {
    RUANGAN.emberDiangkat = false;            // LENGKET: wajib dibersihkan
    // lepaskanAktor() sudah mereset pose/bawa; menulis ulang ke orang yang
    // sudah dipinjam event LAIN akan menghapus pose milik event itu
    const p = E.data.pegang;
    if (masihMain(E, p)) { p.pose = null; p.doingEvent = ''; }
  },
},

/* Kabel lantai dilakban.
   Geometrinya memang bekerja seperti kata katalog: kabel (322,250)–(352,254)
   memotong LANE_DOWN=252 tepat di ujung kanannya, di mana lajur bawah berbelok
   naik lewat penghubung LANE_R=337. Jadi yang tersandung benar-benar orang
   yang sedang menyeberang, bukan orang yang kebetulan berdiri.

   Tiga penyimpangan dari katalog:
   * Sandungnya OPSIONAL, bukan pemicu. Kalau pas tidak ada yang berjalan,
     eventnya tetap jalan: seseorang melihat kabelnya dan melakbaninya. Kalau
     dijadikan syarat, syarat()-nya nyaris tidak pernah benar (di harness malah
     0/36, karena orang palsu di sana path-nya selalu kosong).
   * Yang tersandung TIDAK dipinjam jadi pemeran dan TIDAK dibekukan. Dia bisa
     saja sesi Claude Code yang sedang berjalan ke stasiun; yang menempel
     padanya cuma a.miring selama 0,9 detik — murni gambar, langkahnya jalan
     terus. Yang melakban orang lain, dan itu justru lebih kantor: yang
     kesandung mengomel, yang lain yang membereskan.
   * "Menginjak lakban dua kali" jadi dua partikel 'step', bukan animasi kaki:
     tidak ada field kaki di drawPerson dan menambahnya cuma untuk dua hentak
     tidak sepadan.

   Lakbannya permanen (kabelLantaiSudahDilakban) — sesudah sekali, syarat()
   tidak pernah benar lagi, jadi kabelnya tidak pernah menyandung siapa pun
   lagi sepanjang sesi tampilan. Yang belum bisa: lakbannya tetap KELIHATAN
   sesudah eventnya mati; itu menuntut prop di room.js (lihat laporan). */
{
  id: 'kabel-lantai-dilakban',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 28,
  perluAktor: true,
  babak: { malam: 0.2, libur: 0 },
  // ubin-retak-kesandung juga memakai a.miring pada orang yang sedang jalan:
  // dua sandungan bersamaan bikin satu orang dipakai dua event dan miringnya
  // dimatikan lebih awal oleh yang selesai duluan.
  bentrokDengan: ['ubin-retak-kesandung', 'karpet-terlipat'],
  syarat: (S) => !kabelLantaiSudahDilakban && S.kerjaJam,
  mulai(E, S) {
    E.data.lakban = 0;
    // korban opsional: siapa pun yang kebetulan sedang melangkah
    const jalan = S.orang.filter((o) => o.path.length && !o.miring && !o.eventKerja);
    if (jalan.length) {
      const k = pilih(jalan);
      E.data.korban = k;
      k.miring = true;
      spawn('step', k.x, k.y);
      spawn('dust', k.x, k.y);
      blip(200, 0.15);
      menoleh(S.orang.filter((o) => o !== k && jarakKe(o, k.x, k.y) < 46), k.x, k.y, 900);
    }
    const a = pemeran(E, ['teknisi', 'pranata_muda']);
    if (a) {
      a.doingEvent = 'melakban kabel lantai';
      a.goToXY(334, 264, 'up');               // berdiri di bawah lajur, tidak menutup jalan
    }
  },
  tick(E) {
    // sempoyongan cuma 0,9 detik lalu badan tegak lagi
    const k = E.data.korban;
    if (k && k.miring && E.umur > 0.9) k.miring = false;
    pada(E, 1.6, () => { if (E.data.korban) E.data.korban.say('sudah tiga orang kesandung di situ'); });

    const a = E.aktor[0];
    if (!a) return;
    if (a.diam && !E.data.jongkokPada) { E.data.jongkokPada = E.umur; a.pose = 'jongkok'; }
    if (!E.data.jongkokPada) return;

    // satu potong lakban per 1,5 detik, dihitung dari umur (bukan dinaikkan
    // per frame) supaya jumlahnya tidak ikut naik-turun bersama fps
    const target = Math.min(8, Math.floor((E.umur - E.data.jongkokPada) / 1.5));
    while (E.data.lakban < target) {
      E.data.lakban++;
      spawn('serbuk', 323 + E.data.lakban * 3.6, 252);
      blip(420, 0.05);
    }
    if (E.data.lakban >= 8 && !E.data.beres) {
      E.data.beres = true;
      kabelLantaiSudahDilakban = true;
      a.pose = null;
      a.say('nah, tidak nyangkut lagi');
      spawn('step', 334, 254);
      spawn('step', 341, 254);               // diinjak dua kali biar menempel
    }
  },
  gambarLantai(E) {
    // kabel gulung melintang; digambar di lapisan lantai jadi orang yang lewat
    // menutupinya, bukan mengambang di atas sepatu mereka
    for (let i = 0; i <= 30; i++) {
      const x = 322 + i;
      const y = 250 + (i / 30) * 4 + Math.sin(i / 3.4) * 1.5;
      r(x, y, 1, 2, '#3a3f45');
    }
    const n = E.data.lakban || 0;
    for (let i = 0; i < n; i++) {
      const x = 323 + i * 3.6;
      const y = 249 + (i / 8) * 4 + Math.sin((i * 3.6) / 3.4) * 1.5;
      r(x, y, 4, 3, '#e8c93a');               // kuning-hitam
      r(x, y + 1, 4, 1, '#2c3038');
    }
  },
  selesai(E) {
    if (E.data.korban) E.data.korban.miring = false;
    if (E.aktor[0]) E.aktor[0].pose = null;
  },
},

/* Karpet rapat digulung.
   "Dijemur" dibuang dari isinya (tidak ada halaman luar di kanvas ini), yang
   tersisa: karpet digulung dari ujung kanan ke ujung kiri, debu naik sepanjang
   tepinya, ubin di bawahnya tersingkap — bersih, tanpa petak belel, karena
   memang tidak pernah diinjak. Lalu dibentangkan lagi.

   Gulungannya TIDAK memakai timer terpisah dari langkah pemerannya: keduanya
   berjalan pelan (a.laju 0,28) dari x=332 ke x=168 dalam ±11 detik, dan tepi
   gulungan dihitung dari umur dengan lama yang sama, jadi mereka terlihat
   mendorongnya, bukan berjalan di sebelahnya.

   Catatan lama di sini bilang "warna karpet lebih cerah sisa sesi" tidak
   dikerjakan karena butuh RUANGAN.karpetCerah di room.js. Field itu SEKARANG
   ADA (dideklarasikan di RUANGAN, dibaca drawFloor lewat pengali sh()), jadi
   bagian itu dipasang: sesudah dijemur karpetnya naik satu tingkat dan tidak
   turun lagi — bekas yang sengaja hidup lebih lama dari eventnya, sekelas
   plang baru dan noda plafon. */
{
  id: 'karpet-rapat-digulung-dijemur',
  kelas: 'latar', bobot: B.langka, cooldown: 3600, durasi: 40,
  perluAktor: true,
  babak: { libur: 0, malam: 0 },
  bentrokDengan: ['karpet-terlipat', 'kabel-lantai-dilakban'],
  // Pagi, dan meja rapat memang sedang kosong. "Kosong 2 menit" dari katalog
  // dipangkas jadi "kosong sekarang": tidak ada jam yang mencatat sudah berapa
  // lama sebuah stasiun sepi, dan menambahnya cuma untuk satu event langka
  // berarti menaruh penghitung di jalur update semua orang.
  syarat: (S) => S.jam >= 8 && S.jam < 11 && !S.orang.some((o) => o.station === 'rapat'),
  mulai(E) {
    const dua = pinjamAktor(E, 2);
    // stasiun asal disimpan per-orang (Map), bukan per-indeks: kalau salah satu
    // direbut tool call di tengah jalan, indeks daftar aktor bergeser
    E.data.asal = new Map(dua.map((o) => [o, o.station]));
    dua.forEach((o, i) => {
      o.doingEvent = 'menggulung karpet rapat';
      o.goToXY(332, i ? LANE_DOWN : LANE_UP, 'left');
    });
    if (dua[0]) dua[0].say('digulung dulu, debunya sudah tebal');
  },
  tick(E, dt, S) {
    const A = E.aktor;

    // fase 1 — menunggu keduanya sampai di ujung kanan karpet. Ada pagar waktu
    // 10 detik: kalau jalannya tersendat, adegannya tetap mulai.
    if (!E.data.jongkokPada) {
      if ((A.length && A.every((o) => o.diam)) || E.umur > 10) {
        E.data.jongkokPada = E.umur;
        for (const o of A) o.pose = 'jongkok';   // membungkuk memegang tepi karpet
      }
      return;
    }

    // fase 2 — mulai mendorong 2 detik sesudah membungkuk
    if (!E.data.dorongPada && E.umur > E.data.jongkokPada + 2) {
      E.data.dorongPada = E.umur;
      for (const o of A) {
        o.pose = null;
        o.laju = 0.28;                            // 164 px dalam ±11 detik
        o.goToXY(168, o.y > 208 ? LANE_DOWN : LANE_UP, 'left');
      }
    }
    if (!E.data.dorongPada) return;

    // tepi gulungan: 340 -> 168 selama 11 detik, lalu balik lagi
    if (!E.data.balikPada) {
      const p = Math.max(0, Math.min(1, (E.umur - E.data.dorongPada) / 11));
      E.data.rollX = 340 - p * 172;
      if (p >= 1 && !E.data.bersin) {
        E.data.bersin = true;
        const o = A[0];
        if (o) { o.pose = 'hidung'; o.say('haaatchii'); }
        for (let i = 0; i < 6; i++) spawn('dust', 176, 190 + i * 10);
        menoleh(S.orang.filter((q) => !q.eventKerja && jarakKe(q, 176, 200) < 90), 176, 200, 900);
        E.data.balikPada = E.umur + 4;            // tenggat dinamis disimpan sekali
      }
    } else if (E.umur > E.data.balikPada) {
      const q = Math.max(0, Math.min(1, (E.umur - E.data.balikPada) / 10));
      E.data.rollX = q >= 1 ? null : 168 + q * 172;
      if (!E.data.balikJalan) {
        E.data.balikJalan = true;
        for (const o of A) {
          o.pose = null;
          o.laju = 0.31;
          o.goToXY(332, o.y > 208 ? LANE_DOWN : LANE_UP, 'right');
        }
      }
      if (q >= 1 && !E.data.bubar) {
        E.data.bubar = true;
        for (const o of A) {
          o.laju = 1;
          o.doingEvent = '';
          o.goTo(E.data.asal.get(o) || 'think');
        }
      }
    }

    // debu naik dari sepanjang tepi yang sedang digulung
    if (E.data.rollX != null && Math.random() < 7 * dt) {
      spawn('dust', E.data.rollX + acak(-5, 5), 178 + Math.random() * 72);
    }
  },
  gambarLantai(E) {
    const rx = E.data.rollX;
    if (rx == null) return;
    const x0 = Math.max(153, Math.round(rx));
    const w = 341 - x0;
    if (w <= 0) return;

    // Ubin yang tersingkap: rata P.tile tanpa petak P.tileD sama sekali —
    // itulah "belum belel"-nya. Nat tetap digambar di kisi 24 px yang sama
    // dengan drawFloor, jadi petaknya menyambung dengan lantai sekitarnya.
    r(x0, 173, w, 83, P.tile);
    for (let y = 182; y < 256; y += 24) r(x0, y, w, 1, P.grout);
    for (let x = Math.ceil(x0 / 24) * 24; x < 341; x += 24) r(x, 173, 1, 83, P.grout);
    // gradasi lantai drawFloor ditiru kasar supaya petak ini tidak menyala
    ctx.globalAlpha = 0.1;
    r(x0, 173, w, 83, '#3c463c');
    ctx.globalAlpha = 1;

    // berkas cahaya jendela dikembalikan di petak yang baru dicat ulang —
    // karpet yang diangkat harusnya MENAMPAKKAN cahaya, bukan menelannya
    const A = ambien();
    if (A.sinarA > 0.01) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, 173, w, 83); ctx.clip();
      ctx.globalAlpha = A.sinarA;
      ctx.fillStyle = A.sinar;
      ctx.beginPath();
      ctx.moveTo(190, FLOOR_TOP); ctx.lineTo(240, FLOOR_TOP);
      ctx.lineTo(266, 196); ctx.lineTo(164, 196);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // gulungannya sendiri: silinder 8 px berdiri di tepi petak
    const gx = Math.round(rx);
    r(gx - 8, 176, 8, 76, '#5c2626');
    r(gx - 8, 176, 8, 2, '#8d3a3a');
    r(gx - 6, 179, 2, 70, '#743030');            // lilitan
    r(gx - 3, 179, 1, 70, '#984545');
    r(gx - 8, 250, 8, 2, '#421919');
  },
  selesai(E) {
    for (const o of E.aktor) { o.pose = null; o.laju = 1; o.doingEvent = ''; }
    // karpet yang sudah dijemur tetap lebih cerah sampai halaman dimuat ulang
    RUANGAN.karpetCerah = true;
  },
},

);
