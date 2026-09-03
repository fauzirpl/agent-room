/* ==========================================================================
   TAMU BIROKRASI — pemohon, rombongan, dan mahasiswa yang salah laci
   ==========================================================================
   Tiga usulan yang semuanya divonis "mahal" karena menuntut kelas Tamu yang
   ikut berebut slot stasiun. Slot itu SENGAJA tidak diambil: aturan ruangan
   ini bilang orang non-pegawai bukan Agent dan tidak masuk penghuni(), dan
   alasannya bukan kerapian melainkan fungsi — tamu yang memblokir stasiun
   berarti sesi Claude Code sungguhan mengantre di belakang lelucon. Jadi
   ketiganya objek biasa di E.data, digambar sendiri, dan yang mereka pinjam
   dari ruangan cuma PEGAWAI-nya, lewat pemeran() yang sudah menyaring.

   Tiga penyimpangan besar dari katalog, semuanya karena alasan yang sama:

   1. pemohon-surat-di-loket TIDAK menempati slot STATIONS.idle (usulan
      aslinya minta itu). Dia berdiri 14 px di depan barisan ruang tunggu —
      terbaca sebagai antrean loket, tanpa memakan satu pun slot pegawai.
      Yang dipertahankan penuh justru cabang jujurnya: kalau sampai detik 52
      tidak ada satu pun pegawai yang bisa dipinjam, dia pulang tanpa
      dilayani. Itu sebabnya event ini TANPA perluAktor — kegagalan melayani
      adalah isi ceritanya, bukan kecelakaan. Sudah ada tamu-di-ruang-tunggu
      (03) yang selalu berhasil dilayani, jadi keduanya dipasang bentrok:
      satu adegan loket saja per waktu, dan yang ini versi yang bisa gagal.

   2. rombongan-studi-banding TIDAK mengunci stasiun. Usulannya minta tiga
      stasiun bergiliran tak bisa dipakai selama dua menit; itu persis
      melawan gunanya ruangan. Gantinya pegawai di sekitar cuma MENOLEH
      (menoleh(), busyUntil pendek) — rombongan lewat, kerja jalan terus.
      Sorotan prop dipasang di gambarLantai sebagai genangan cahaya, bukan
      glow di atas prop: satu event cuma punya satu sortY, dan ketiga prop
      yang dikunjungi ada di tiga kedalaman berbeda (arsip 118, rak 118,
      X-banner 242) — genangan lantai benar untuk ketiganya sekaligus.

   3. mahasiswa-magang-bingung memakai RUANGAN.laciTerbuka yang sudah ada
      (dipakai arsiparis-bimbing-magang), jadi drawFiling tidak perlu
      disentuh. Karena keduanya menulis field yang sama, keduanya dipasang
      bentrok. Bedanya: yang lama butuh pegawai ber-peran 'magang' benar-benar
      ada di layar; yang ini orang luar, jadi jalan di ruangan mana pun.

   Batas yang dibayar: orang luar digambar di SATU sortY tetap per event
   (mesinnya membaca E.def.sortY sekali, bukan per orang), jadi waktu mereka
   melintas jauh dari adegan utamanya urutan tumpang-tindihnya bisa meleset
   sekilas. Dipilih sortY yang benar untuk adegan utama, bukan untuk transit.
   ========================================================================== */

/* Satu wadah, bukan tiga fungsi global lepas: berkas event dimuat sebagai
   classic script yang berbagi satu scope lexical dengan berkas event lain,
   jadi tiap nama tingkat atas di sini ikut jadi milik semua orang. */
const TAMU_BIROKRASI = {

  /* gambarOrangLuar() di 00-dasar.js mengunci face:'down'. Di ketiga event ini
     arah hadap justru bagian dari isi ceritanya — rombongan menghadap prop
     yang dijelaskan, pemohon menoleh ke jam dinding, mahasiswa menghadap laci.
     Jadi dibuat varian lokal, bukan menambah parameter ke helper bersama yang
     sudah dipakai belasan event lain. Bentuk objeknya sengaja sama persis
     dengan yang dititipkan gambarOrangLuar ke drawPerson. */
  gambar(o, baju, motif, bawa, kepala) {
    drawPerson({
      x: o.x, y: o.y,
      face: o.hadap || 'down',
      state: o.wp && o.wp.length ? 'walk' : 'idle',
      phase: now / 1000, slot: 0,
      pal: {
        main: baju, pants: '#3a3f45', skin: '#e0ae80',
        hair: kepala || '#2b2118', head: 'hair', pattern: motif || null,
      },
      bawa: bawa || null,
    });
  },

  /* Perjalanan banyak-perhentian untuk orang luar: daftar titik di o.wp,
     dimakan satu per satu. Sengaja TIDAK memakai route() milik Agent —
     route() menghasilkan path yang dimakan Agent.update(), sedangkan orang
     luar tidak punya update(). Mengembalikan true kalau sudah sampai. */
  langkah(o, dt, laju) {
    if (!o.wp || !o.wp.length) return true;
    const [tx, ty] = o.wp[0];
    const dx = tx - o.x, dy = ty - o.y;
    const jarak = Math.hypot(dx, dy);
    const maju = (laju || 44) * dt;
    if (jarak <= maju) {                       // termasuk jarak 0: langsung dipatok
      o.x = tx; o.y = ty;
      o.wp.shift();
      return !o.wp.length;
    }
    o.x += (dx / jarak) * maju;
    o.y += (dy / jarak) * maju;
    o.hadap = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    return false;
  },

  /* Titik-titik jalan dari (x,y) ke (tx,ty) memutari meja rapat, meniru
     aturan route(): naik ke lajur, lewat penghubung yang totalnya lebih
     pendek, baru turun. Ditulis ulang di sini karena orang luar tidak punya
     lane/slot, jadi tidak bisa menumpang route() apa adanya. */
  jalur(x, y, tx, ty) {
    const tengah = (LANE_UP + LANE_DOWN) / 2;
    const asal = y < tengah ? LANE_UP : LANE_DOWN;
    const tuju = ty < tengah ? LANE_UP : LANE_DOWN;
    const wp = [];
    if (Math.abs(y - asal) > 3) wp.push([x, asal]);
    if (asal !== tuju) {
      const kon = Math.abs(x - LANE_L) + Math.abs(tx - LANE_L)
        <= Math.abs(x - LANE_R) + Math.abs(tx - LANE_R) ? LANE_L : LANE_R;
      wp.push([kon, asal]);
      wp.push([kon, tuju]);
    }
    wp.push([tx, tuju]);
    if (Math.abs(ty - tuju) > 3) wp.push([tx, ty]);
    return wp;
  },

  /* Tiga perhentian studi banding. baris[] = tiga titik berjajar 18 px di
     lajur, semuanya sudah dicek tidak menembus perabot: 48..92 dan 356..392
     di LANE_UP jauh dari kursi jauh (x181..311, y169..192); 56..92 di y236
     ada di sela X-banner (x16..42) dan tiang bendera (x132). */
  studi: [
    {
      baris: [[48, LANE_UP], [66, LANE_UP], [84, LANE_UP]],
      pandu: [108, LANE_UP], hadapRom: 'up',
      kata: 'ini arsip sejak 2011, Pak',
      fx: 'dust', fxAt: [54, 122], sorot: [54, 140],
    },
    {
      baris: [[356, LANE_UP], [374, LANE_UP], [392, LANE_UP]],
      pandu: [412, LANE_UP], hadapRom: 'up',
      kata: 'servernya dua, Pak',
      fx: 'data', fxAt: [390, 122], sorot: [390, 142],
    },
    {
      baris: [[56, 236], [74, 236], [92, 236]],
      pandu: [112, 236], hadapRom: 'left',
      kata: 'kami zona integritas',
      fx: 'ping', fxAt: [30, 212], sorot: [30, 218],
    },
  ],

  keStop(o, s, i) {
    const P = this.studi[s];
    return this.jalur(o.x, o.y, P.baris[i][0], P.baris[i][1]);
  },

  pulangkanRombongan(E) {
    E.data.fase = 'pulang';
    E.data.rom.forEach((o, i) => { o.wp = this.jalur(o.x, o.y, -30 - i * 16, LANE_DOWN); });
    const g = E.data.g;
    if (g && g.eventKerja === E) {
      g.pose = null;
      g.doingEvent = '';
      g.say('terima kasih kunjungannya');
      g.goTo(stasiunPulang(g));
    }
  },
};

daftarEvent(

/* Pemohon surat: satu-satunya event tamu di ruangan ini yang boleh GAGAL.
   Tanpa perluAktor, dan pemakaian pemeran di dalamnya semuanya dijaga null —
   kalau seluruh ruangan sedang bekerja (state 'work' / adaTugas), tidak ada
   yang bisa dipinjam, dan itulah adegannya: dia menunggu, melirik jam, lalu
   pulang. Balon punya Agent, orang luar tidak punya say(); jadi kalimat
   pemohon dititipkan ke partikel 'talk' di atas kepalanya dan yang berbalon
   sungguhan cuma pegawainya — konvensi yang sama dengan tamu-di-ruang-tunggu. */
{
  id: 'pemohon-surat-di-loket',
  // durasi 72, bukan 65: rantai layanannya tiga perjalanan (loket -> stempel ->
  // loket) plus pemohon yang harus sempat berjalan keluar layar. Kalau
  // durasinya mepet, pemohon yang telat dilayani hilang mendadak di tengah
  // ruangan waktu event dimatikan — itu bukan adegan, itu bug yang kelihatan.
  kelas: 'latar', bobot: B.sedang, cooldown: 420, durasi: 72,
  // Katalog menaksir "sering". Diturunkan ke sedang dengan sengaja: ruangan
  // ini sudah punya tamu-di-ruang-tunggu, nomor-antrean-loket, dan
  // lama-menunggu-di-ruang-tunggu; satu lagi berbobot 9 bikin loket ramai
  // terus-menerus dan lelucon "gagal dilayani" jadi kehilangan tenaganya.
  babak: { apel: 0.3, istirahat: 0.5, pulang: 0.3, lembur: 0, malam: 0, libur: 0 },
  bentrokDengan: ['tamu-di-ruang-tunggu'],
  syarat: (S) => S.jam >= 8 && S.jam < 15,
  mulai(E) {
    // Berdiri di (198,302): 14 px DI DEPAN barisan ruang tunggu (STATIONS.idle
    // y=288) dan 38 px di kiri slot terdekatnya (x=236) — terbaca satu antrean
    // dengan mereka tanpa menempati satu pun slot pegawai. Meja kerja baru
    // mulai di y=322, jadi tidak menabrak apa pun.
    E.data.t = {
      x: -16, y: LANE_DOWN, hadap: 'right', fase: 'masuk',
      wp: [[198, LANE_DOWN], [198, 302]],
    };
    E.data.tahap = 0;
    RUANGAN.antre = (RUANGAN.antre % 99) + 1;      // papan nomor benar-benar maju
    spawn('ping', 218, 34);
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TAMU_BIROKRASI.langkah(T, dt, 44);
    if (T.fase === 'masuk' && sampai) { T.fase = 'tunggu'; T.hadap = 'right'; }
    if (T.fase === 'pulang' && sampai) T.fase = 'selesai';

    /* Pelayan bisa direbut tool call sungguhan di tengah rantai
       (lepasDariEvent dipanggil dari handle()), dan E.data.a jadi basi.
       Diperiksa, bukan dipakai buta — kalau mapnya sudah dicap dia tetap
       pulang senang; kalau belum, rantainya diulang dari nol. */
    if (E.data.a && E.data.a.eventKerja !== E) {
      E.data.a = null;
      if (T.dilayani && T.fase === 'tunggu') {
        T.fase = 'pulang';
        T.wp = [[198, LANE_DOWN], [-26, LANE_DOWN]];
      } else {
        E.data.tahap = 0;
      }
    }
    const a = E.data.a;

    /* Melirik jam dinding 1 detik tiap 8 detik. MOD DIRESET SETIAP FRAME,
       jadi sorotnya wajib ditulis ulang lewat cek rentang seperti ini —
       bukan disetel sekali di mulai(). */
    if (T.fase === 'tunggu') {
      if (E.umur % 8 < 1) { MOD.jamSorot = 1; T.hadap = 'up'; }
      else T.hadap = 'right';
    }

    /* Mencari yang mau melayani, dicoba ULANG tiap 3 detik sampai detik 44 —
       bukan sampai mepet durasi: sesudah itu rantai tiga perjalanannya tidak
       akan sempat tuntas sebelum event dimatikan. Tenggatnya disimpan sekali
       lalu dibandingkan manual: pada() cuma sah untuk detik tetap,
       pada(E, E.umur + 3, ..) tidak akan pernah berbunyi. */
    if (!a && T.fase === 'tunggu' && E.umur > 24 && E.umur < 44
        && E.umur > (E.data.cariPada || 0)) {
      E.data.cariPada = E.umur + 3;
      const p = pemeran(E, ['humas', 'magang']);
      if (p) {
        E.data.a = p;
        E.data.tahap = 1;
        p.doingEvent = 'melayani pemohon di loket';
        p.goToXY(218, 300, 'left');
      }
    }

    // Tidak ada satu pun yang bisa dipinjam sampai detik 48: dia pulang tanpa
    // dilayani. Akibat yang berbeda, dan itu yang jujur untuk kantor sibuk.
    if (!E.data.a && T.fase === 'tunggu' && E.umur > 48) {
      T.fase = 'pulang';
      T.wp = [[198, LANE_DOWN], [-26, LANE_DOWN]];
      T.kecewa = true;
      for (let i = 0; i < 3; i++) spawn('talk', T.x, T.y - 26);
    }

    if (!a) return;

    // Rantai layanan tiga tahap: hampiri -> bawa map ke stempel -> antar balik.
    // Majunya dari a.diam, pola yang sama dengan kasi-inspeksi-meja-staf —
    // tidak butuh antrean tujuan per-agen yang memang belum ada.
    if (E.data.tahap === 1 && a.diam) {
      E.data.tahap = 2;
      T.mapDiambil = true;
      a.bawa = 'map';
      a.say('mapnya saya bawa ke stempel dulu ya, Pak');
      a.goTo('edit');
    } else if (E.data.tahap === 2 && a.diam && a.station === 'edit') {
      E.data.tahap = 3;
      hentakkanStempel(a);
      blip(300, 0.07);
      E.data.capPada = E.umur + 1.4;
    } else if (E.data.tahap === 3 && E.data.capPada && E.umur > E.data.capPada) {
      E.data.tahap = 4;
      hentakkanStempel(a);                      // dua hentakan: cap + tanggal
      blip(300, 0.07);
      E.data.balikPada = E.umur + 1.6;
    } else if (E.data.tahap === 4 && E.data.balikPada && E.umur > E.data.balikPada) {
      E.data.tahap = 5;
      a.bawa = 'kertas';
      a.goToXY(218, 300, 'left');
    } else if (E.data.tahap === 5 && a.diam) {
      E.data.tahap = 6;
      a.bawa = null;
      T.dilayani = true;
      T.bungkukSampai = E.umur + 2.4;           // membungkuk: badan turun 2 px
      a.say('sudah, Pak, capnya sudah');
      for (let i = 0; i < 3; i++) spawn('talk', T.x, T.y - 26);
    } else if (E.data.tahap === 6 && T.bungkukSampai && E.umur > T.bungkukSampai) {
      E.data.tahap = 7;
      T.fase = 'pulang';
      T.wp = [[198, LANE_DOWN], [-26, LANE_DOWN]];
      a.doingEvent = '';
      a.goTo(stasiunPulang(a));                 // pelayannya balik kerja duluan
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -14 || T.fase === 'selesai') return;
    const bungkuk = T.bungkukSampai && E.umur < T.bungkukSampai ? 2 : 0;
    const y = T.y + bungkuk;
    const bawa = T.dilayani ? 'kertas' : (T.mapDiambil ? null : 'map');
    TAMU_BIROKRASI.gambar({ x: T.x, y, hadap: T.hadap, wp: T.wp },
      '#6f7b63', null, bawa, '#2b2118');
    // Cap merah 1 px di kertas yang sudah distempel — titik itu satu-satunya
    // bukti bahwa dia benar-benar dilayani, bukan cuma diusir dengan sopan.
    if (T.dilayani) {
      const bx = T.hadap === 'left' ? Math.round(T.x) - 14 : Math.round(T.x) + 6;
      r(bx + 4, Math.round(y) - 10, 2, 2, '#c22b2b');
    }
  },
  sortY: 302,
  selesai(E) {
    const a = E.data.a;
    if (a && a.eventKerja === E) { a.bawa = null; a.doingEvent = ''; }
  },
},

/* Rombongan studi banding: tiga tamu berbatik SAMA PERSIS (pal identik — itu
   yang bikin mereka terbaca satu rombongan, bukan tiga tamu kebetulan) plus
   satu pemandu. Pengikut TIDAK memakai buffer posisi pemimpin seperti usulan
   aslinya: buffer itu pola baru yang harus dijaga tiap frame, sedangkan tiga
   daftar titik yang ujungnya digeser 18 px menghasilkan barisan yang sama
   dengan kode yang bisa dibaca sekali jalan. Panjangnya dipotong dari 120 ke
   110 detik karena kelas 'panggung' mengunci semua adegan lain selama itu. */
{
  id: 'rombongan-studi-banding',
  kelas: 'panggung', bobot: B.langka, cooldown: 7200, durasi: 110,
  babak: { apel: 0, istirahat: 0.3, pulang: 0, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 9 && S.jam < 13 && S.orang.length >= 3,
  perluAktor: true,                              // tanpa pemandu ini cuma tiga orang asing
  mulai(E) {
    E.data.rom = [0, 1, 2].map((i) => ({
      x: -20 - i * 16, y: LANE_DOWN, hadap: 'right', wp: [],
    }));
    E.data.stop = 0;
    E.data.fase = 'jalan';
    E.data.rom.forEach((o, i) => { o.wp = TAMU_BIROKRASI.keStop(o, 0, i); });
    const g = pemeran(E, ['humas']);
    E.data.g = g;
    if (!g) return;
    g.doingEvent = 'memandu rombongan studi banding';
    const P = TAMU_BIROKRASI.studi[0];
    g.goToXY(P.pandu[0], P.pandu[1], 'left');
    g.say('mari, Bapak-Ibu, kita mulai dari arsip');
  },
  tick(E, dt, S) {
    if (E.data.g && E.data.g.eventKerja !== E) E.data.g = null;   // direbut tool call
    const g = E.data.g;

    let semuaSampai = true;
    for (const o of E.data.rom) {
      if (!TAMU_BIROKRASI.langkah(o, dt, 40)) semuaSampai = false;
    }

    if (E.data.fase === 'jalan' && semuaSampai && (!g || g.diam)) {
      const P = TAMU_BIROKRASI.studi[E.data.stop];
      E.data.fase = 'berhenti';
      E.data.henti = E.umur;
      E.data.kilat = null;
      for (const o of E.data.rom) o.hadap = P.hadapRom;
      if (g) {
        g.pose = 'nunjuk';
        hadapkan(g, P.sorot[0], P.sorot[1]);
        g.say(P.kata);
      }
      for (let i = 0; i < 4; i++) spawn(P.fx, P.fxAt[0], P.fxAt[1]);
      blip(480, 0.08);
      /* Usulannya minta pegawai di stasiun itu MENYINGKIR dan stasiunnya
         terkunci. Dibuang: mengunci tiga stasiun bergiliran selama dua menit
         berarti sesi Claude Code sungguhan menumpuk menunggu lelucon selesai.
         Yang tersisa akibat yang benar dan gratis — mereka menoleh. */
      menoleh(S.orang.filter((o) => jarakKe(o, P.sorot[0], P.sorot[1]) < 70),
        P.baris[1][0], P.baris[1][1], 2500);
    }

    if (E.data.fase === 'berhenti') {
      // satu tamu memotret, 6 detik sesudah rombongan berhenti
      if (E.data.kilat == null && E.umur - E.data.henti > 6) {
        E.data.kilat = E.umur;
        blip(900, 0.05);
      }
      if (E.umur - E.data.henti > 18) {
        E.data.stop++;
        if (E.data.stop < TAMU_BIROKRASI.studi.length) {
          const P2 = TAMU_BIROKRASI.studi[E.data.stop];
          E.data.fase = 'jalan';
          if (g) { g.pose = null; g.goToXY(P2.pandu[0], P2.pandu[1], 'left'); }
          E.data.rom.forEach((o, i) => { o.wp = TAMU_BIROKRASI.keStop(o, E.data.stop, i); });
        } else {
          TAMU_BIROKRASI.pulangkanRombongan(E);
        }
      }
    }

    // Jaring pengaman: kalau perjalanannya tersendat (pemandu direbut, jalur
    // panjang), rombongan tetap harus sempat keluar sebelum durasi habis.
    if (E.data.fase !== 'pulang' && E.umur > 94) TAMU_BIROKRASI.pulangkanRombongan(E);
  },
  gambarLantai(E) {
    // Sorotan prop yang sedang dijelaskan, sebagai genangan cahaya di lantai:
    // satu event cuma punya satu sortY, sedangkan ketiga prop yang dikunjungi
    // ada di tiga kedalaman berbeda — genangan lantai benar untuk ketiganya.
    if (E.data.fase !== 'berhenti') return;
    const P = TAMU_BIROKRASI.studi[E.data.stop];
    if (!P) return;
    const t = Math.min(1, Math.max(0, (E.umur - (E.data.henti || 0)) / 1.5));
    glow(P.sorot[0], P.sorot[1], 34, '#ffe9b0', 0.13 * t);
  },
  gambarProp(E) {
    const R = E.data.rom;
    if (!R) return;
    R.forEach((o, i) => {
      if (o.x < -18 || o.x > W + 18) return;
      // batik seragam: main + pattern identik bertiga, cuma bawaannya beda
      TAMU_BIROKRASI.gambar(o, '#6b4a2a', '#d9ab5e',
        i === 2 ? 'hp' : (i === 0 ? 'map-kuning' : null), '#2b2118');
    });
    const k = E.data.kilat;
    if (k != null && E.umur - k < 0.18 && R[2]) {
      ctx.globalAlpha = 0.8 * (1 - (E.umur - k) / 0.18);
      r(Math.round(R[2].x) - 4, Math.round(R[2].y) - 30, 10, 10, '#fffdf4');
      ctx.globalAlpha = 1;
    }
  },
  sortY: 246,
  selesai(E) {
    const g = E.data.g;
    if (g && g.eventKerja === E) { g.pose = null; g.doingEvent = ''; }
  },
},

/* Mahasiswa magang: orang LUAR, bukan pegawai ber-peran 'magang'. Itu bedanya
   dengan arsiparis-bimbing-magang yang sudah terpasang — yang lama butuh sesi
   magang benar-benar ada di layar, yang ini jalan di ruangan mana pun, dan
   yang diceritakan bukan bimbingan yang rapi melainkan tiga laci yang salah
   dan map yang tumpah. Karena keduanya menulis RUANGAN.laciTerbuka yang sama,
   keduanya dipasang bentrok. */
{
  id: 'mahasiswa-magang-bingung',
  kelas: 'latar', bobot: B.sedang, cooldown: 1500, durasi: 70,
  babak: { apel: 0.3, istirahat: 0.3, pulang: 0, lembur: 0, malam: 0, libur: 0 },
  bentrokDengan: ['arsiparis-bimbing-magang'],
  // !stasiunAktif.has('search'): jangan menaruh orang luar berdiri menempel
  // di filing kabinet yang sedang dipakai sesi sungguhan.
  syarat: (S) => S.jam >= 8 && S.jam < 12 && S.orang.length >= 2
    && !S.stasiunAktif.has('search'),
  perluAktor: true,
  mulai(E) {
    // Berdiri di (104,150): tepat di bawah tepi kiri filing kabinet (x108..156,
    // y62..118), 28 px dari titik berdiri stasiun 'search' (132,138) — dekat
    // laci tapi tidak berimpit dengan pegawai yang benar-benar bekerja di situ.
    // Naiknya lurus di x=104: tiang bendera ada di x132 dan meja rapat mulai
    // x170, jadi koridor kiri antar-lajur itu memang kosong.
    E.data.m = {
      x: -16, y: LANE_DOWN, hadap: 'right', fase: 'masuk',
      wp: [[104, LANE_DOWN], [104, 150]],
    };
    E.data.kertas = [];
    const a = pemeran(E, ['arsiparis', 'pranata_muda']);
    E.data.ar = a;
    if (a) a.doingEvent = 'membimbing mahasiswa magang';
  },
  tick(E, dt, S) {
    const M = E.data.m;
    const sampai = TAMU_BIROKRASI.langkah(M, dt, 44);
    if (M.fase === 'masuk' && sampai) { M.fase = 'bingung'; M.hadap = 'up'; }
    if (M.fase === 'ke-stempel' && sampai) M.hadap = 'up';
    if (M.fase === 'pulang' && sampai) M.fase = 'selesai';

    /* RUANGAN tidak pernah direset mesin, jadi laciTerbuka dihitung ULANG dari
       -1 di tiap frame di sini — pola MOD yang sengaja dipinjam ke field
       RUANGAN, supaya laci benar-benar menutup lagi di antara tarikan alih-alih
       menganga sampai event berikutnya. Dibersihkan lagi di selesai(). */
    let laci = -1;
    const salah = [[9, 2], [15, 0], [21, 2]];
    for (const [t0, idx] of salah) if (E.umur > t0 && E.umur < t0 + 2.2) laci = idx;
    if (E.data.benarDari != null && E.umur > E.data.benarDari
      && E.umur < E.data.benarDari + 16) laci = 1;
    RUANGAN.laciTerbuka = laci;

    for (const [t0] of salah) {
      pada(E, t0, () => { spawn('dust', 130, 76); spawn('dust', 126, 78); blip(260, 0.06); });
    }

    // Map tumpah: tiga kotak kertas menetap di lantai SAMPAI DIPUNGUT, bukan
    // hilang sendiri sesudah 15 detik seperti usulannya — kalau tidak ada yang
    // memungut, kertas yang tergeletak itu justru kalimat yang lebih benar.
    pada(E, 13, () => {
      for (let i = 0; i < 4; i++) spawn('paper', 106, 138);
      E.data.kertas = [[96, 158], [110, 162], [122, 157]];
    });

    // Balon punya Agent; orang luar cuma bisa mengeluarkan partikel 'talk'.
    if (M.fase === 'bingung' && Math.random() < 0.3 * dt) spawn('talk', M.x, M.y - 26);

    // Dia membawa mapnya ke meja stempel, lalu pamit keluar. Dua perhentian
    // ini di luar penjaga aktor: mahasiswanya harus tetap keluar ruangan
    // walaupun tidak ada seorang pun yang jadi menolongnya.
    pada(E, 46, () => {
      M.fase = 'ke-stempel';
      M.wp = TAMU_BIROKRASI.jalur(M.x, M.y, 264, 150);
    });
    pada(E, 58, () => {
      M.fase = 'pulang';
      M.wp = TAMU_BIROKRASI.jalur(M.x, M.y, -26, LANE_DOWN);
    });

    if (E.data.ar && E.data.ar.eventKerja !== E) E.data.ar = null;   // direbut tool call
    const a = E.data.ar;
    if (!a) return;

    pada(E, 19, () => { a.goToXY(128, 150, 'up'); });

    if (E.umur > 19 && a.diam && a.station === 'acara' && E.data.benarDari == null) {
      E.data.benarDari = E.umur;
      a.say('yang mana? oh — yang ini, tahun 2019');
      E.data.pungutPada = E.umur + 4;              // tenggat disimpan, dibanding manual
    }

    if (E.data.pungutPada && E.data.kertas.length && E.umur > E.data.pungutPada) {
      E.data.kertas.pop();                         // satu kotak hilang per tunduk
      spawn('paper', 110, 150);
      E.data.pungutPada = E.umur + 3.2;
    }
    // menunduk 1,2 detik sebelum tiap pungutan; dihitung ulang tiap frame
    a.pose = (E.data.pungutPada && E.data.kertas.length
      && E.data.pungutPada - E.umur < 1.2) ? 'jongkok' : null;

    // Sudah beres: arsiparisnya DILEPAS (lewat lepaskanAktor, bukan dibuang
    // dari E.aktor diam-diam) supaya tidak tertahan 25 detik sisa durasi cuma
    // untuk menonton mahasiswa berjalan keluar.
    if (E.data.benarDari != null && !E.data.kertas.length && !E.data.lepas
      && E.umur > E.data.benarDari + 14) {
      E.data.lepas = true;
      lepaskanAktor(a);
      a.goTo(stasiunPulang(a));
      E.data.ar = null;
    }
  },
  gambarLantai(E) {
    for (const t of (E.data.kertas || [])) r(t[0], t[1], 2, 2, '#f4f2ea');
  },
  gambarProp(E) {
    const M = E.data.m;
    if (!M || M.x < -14 || M.fase === 'selesai') return;
    // jaket almamater: kuning kunyit dengan motif hijau di lengan
    TAMU_BIROKRASI.gambar(M, '#c9a83a', '#3f6b45', 'map-kuning', '#2b2118');
    if (M.fase === 'bingung' && Math.sin(now / 300) > 0) {
      r(Math.round(M.x) - 1, Math.round(M.y) - 30, 2, 4, '#e8a02c');   // tanda bingung
    }
  },
  // sortY dipilih untuk adegan utamanya (berdiri di y150 di depan kabinet),
  // bukan untuk transitnya di lajur bawah — satu event cuma punya satu.
  sortY: 152,
  selesai(E) {
    RUANGAN.laciTerbuka = -1;
    const a = E.data.ar;
    if (a && a.eventKerja === E) { a.pose = null; a.doingEvent = ''; }
  },
},

);
