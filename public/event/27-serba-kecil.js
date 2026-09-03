/* ==========================================================================
   SERBA KECIL — semut yang punya sebab, ayam yang punya akibat, rencana
   yang digambar dulu sebelum dieksekusi
   ==========================================================================
   Tiga dari empat usulan di daftar ini divonis "mahal" karena menuntut mesin
   yang dulu belum ada. Dua-duanya kini ada: gambarOrangLuar() untuk orang
   non-pegawai (satpam) dan goToXY() untuk titik bebas, plus pola "tahap
   bernomor di E.data yang maju begitu a.diam" yang sudah dipakai
   kasi-inspeksi-meja-staf dan angin-kencang-gorden. Jadi rantai reaksi
   (jemput lap → kembali → mengelap → buang) tidak perlu antrean tujuan baru
   di Agent sama sekali.

   Usulan keempat — pamit-pulang-salaman-keliling — TIDAK ada di sini, dan
   bukan karena mahal: ritual itu SUDAH JADI di room.js (Agent.pulangKantor,
   dipanggil handle('session-end') untuk sesi yang tuntas — singgah salaman ke
   rekan seproyek, tempel jari di mesin absen, ke pintu, memudar). Menulis
   ulang sebagai event acak berarti dua koreografi pulang yang berebut orang
   yang sama. Lihat catatan di laporan.

   Satu penyimpangan yang berulang di berkas ini: benda yang menurut katalog
   harus MENETAP sesudah eventnya selesai (bungkus gorengan pindah ke atas dus
   arsip, sehelai bulu ayam di karpet) tidak dibuat menetap. RUANGAN memang
   persisten, tapi yang menggambarnya ada di room.js — berkas bersama yang
   tidak boleh disentuh dari sini. Menaruh {jenis:'bulu'} di RUANGAN.propLantai
   cuma menambah objek yang tidak punya cabang gambar: sampah tak terlihat yang
   ikut dihitung event kebersihan. Jadi jejaknya dibereskan di dalam event yang
   sama, oleh orang yang sama — itu jujur, dan tetap ada akibatnya.
   ========================================================================== */

/* Posisi sepanjang polyline siku-siku (semua ruas sejajar sumbu, jadi panjang
   Manhattan = panjang sebenarnya). Dipakai barisan semut supaya jalurnya bisa
   ditulis sebagai daftar titik, bukan mesin fase per ruas. */
function titikSepanjangJalur(jalur, d) {
  for (let i = 1; i < jalur.length; i++) {
    const [ax, ay] = jalur[i - 1], [bx, by] = jalur[i];
    const L = Math.abs(bx - ax) + Math.abs(by - ay);
    if (d <= L) { const t = L ? d / L : 0; return [ax + (bx - ax) * t, ay + (by - ay) * t]; }
    d -= L;
  }
  const ujung = jalur[jalur.length - 1];
  return [ujung[0], ujung[1]];
}
const panjangJalurSiku = (jalur) => {
  let n = 0;
  for (let i = 1; i < jalur.length; i++) n += Math.abs(jalur[i][0] - jalur[i - 1][0]) + Math.abs(jalur[i][1] - jalur[i - 1][1]);
  return n;
};

/* Ayam kampung 7x8 px. Kepalanya maju-mundur 1 px tiap langkah — itu satu-
   satunya hal yang membuat unggas terbaca sebagai unggas di resolusi segini. */
function gambarAyamKampung(fx, fy, arah, maju) {
  const x = Math.round(fx), y = Math.round(fy), k = arah < 0 ? -1 : 1;
  const m = maju ? 1 : 0;
  r(x - 1, y - 2, 1, 2, '#d9a33a');                  // kaki
  r(x + 1, y - 2, 1, 2, '#d9a33a');
  r(x - 4 * k - (k > 0 ? 0 : 3), y - 10, 3, 4, '#8a6844');   // ekor, selalu di belakang
  r(x - 3, y - 8, 7, 6, '#e0d2b4');                  // badan
  r(x - 3, y - 8, 7, 1, '#f2e8d2');
  const hx = x + k * (3 + m), hy = y - 12;
  r(hx - 1, hy, 3, 4, '#e0d2b4');                    // leher + kepala
  r(hx - 1, hy - 2, 2, 2, '#c22b2b');                // jengger
  r(hx + k * 2, hy + 2, 1, 1, '#e8a33a');            // paruh
  r(hx + (k > 0 ? 1 : 0), hy + 1, 1, 1, '#2c2620');  // mata
}

/* Isi flipchart: empat kotak dan tiga panah, muncul bergantian (kotak, panah,
   kotak, ...). Koordinatnya absolut supaya gambarProp tidak perlu menghitung
   ulang offset tiap frame. */
const FLIP_KOTAK = [[100, 214], [110, 221], [100, 228], [110, 235]];
const FLIP_PANAH = [[106, 217], [105, 224], [106, 231]];

daftarEvent(

/* ------------------------------------------------------- semut ke gorengan --
   Sudah ada semut-antre-ubin-retak (barisan titik menyusur lantai, tanpa sebab
   dan tanpa akibat). Yang ini SENGAJA bukan kembarannya: barisannya punya
   TUJUAN (bungkus gorengan yang ditinggal di meja kerja), punya SEBAB yang
   bisa diperiksa (event gorengan baru saja jalan), dan punya AKIBAT (ada yang
   berdiri, menjemput lap, mengelap, lalu membuang bungkusnya). Karena itu
   jalurnya juga beda: dia MEMANJAT dari lantai ke papan meja, bukan menyusur
   lantai mendatar.

   Pemicunya tidak butuh field baru: gorengan-di-meja-rapat ber-cooldown 300
   detik dan cooldownSampai disetel saat event MULAI, jadi "sisa cooldown
   antara 0 dan 120 detik" persis berarti "gorengan itu jalan 3–5 menit yang
   lalu" — rentang yang diminta katalog, dibaca dari mesin yang sudah ada. */
{
  id: 'semut-mengular-ke-gorengan',
  kelas: 'latar', bobot: B.sedang, cooldown: 1200, durasi: 52,
  babak: { malam: 0, libur: 0 },
  // TANPA perluAktor: barisan semutnya sendiri sudah tontonan (itu premis
  // event lama yang sudah terbukti). Yang mengelap cuma bonus kalau ada yang
  // menganggur — semua pemakaiannya dijaga null di bawah.
  syarat: (S) => {
    if (!S.kerjaJam) return false;
    const cd = (typeof cooldownSampai !== 'undefined' && cooldownSampai.get('gorengan-di-meja-rapat')) || 0;
    const sisa = cd - now;
    return sisa > 0 && sisa < 120000;
  },
  mulai(E, S) {
    // Mejanya = meja orang yang sedang duduk kalau ada (dia yang tadi bawa
    // gorengan ke tempatnya sendiri); kalau ruangan kosong, meja pertama.
    const duduk = S.orang.find((o) => o.station === 'think' && o.diam);
    E.data.slot = duduk && duduk.slotIdx >= 0 ? duduk.slotIdx : 0;
    const cx = MEJA_KERJA_X[E.data.slot] || MEJA_KERJA_X[0];
    E.data.cx = cx;
    const bx = cx + 8;                    // sumbu naik: di antara pot mini (cx+4) dan laptop (cx+13)
    // Sarang diambil dari sisi yang lebih lapang supaya barisannya tidak
    // pernah keluar kanvas untuk meja pojok kiri (cx 86) maupun kanan (cx 444).
    const sx = bx < W / 2 ? bx + 62 : bx - 62;
    E.data.jalur = [[sx, 294], [bx, 294], [bx, 328]];
    E.data.panjang = panjangJalurSiku(E.data.jalur);
    E.data.maju = 0;
    E.data.hapus = 0;                     // berapa semut terdepan sudah terhapus lap
    E.data.bungkus = true;
    E.data.tahap = -1;                    // -1 belum ada yang berdiri
  },
  tick(E, dt) {
    // 10 px/dtk: kepala barisan sampai bungkus di detik ~9,5, ekornya ~15.
    // Sesudah itu maju ditahan di ujung supaya barisannya tetap terentang dari
    // meja sampai tengah lantai, bukan menumpuk jadi satu titik di bungkus.
    E.data.maju = Math.min(E.data.panjang, E.data.maju + 10 * dt);
    E.data.getar = E.data.maju >= E.data.panjang && E.data.hapus < 14;

    // Pemeran baru dicari sesudah barisannya benar-benar terbaca — kalau
    // dipinjam di mulai(), dia berdiri bengong 14 detik tanpa sebab.
    if (E.data.tahap < 0 && E.umur > 14) {
      const cx = E.data.cx;
      const a = pinjamAktor(E, 1, (o) => o.station === 'think' && Math.abs(o.x - cx) < 16)[0]
        || pemeran(E, ['magang', 'pranata_muda']);
      if (!a) { E.data.tahap = 9; return; }   // tidak ada yang bisa dipinjam: semutnya jalan terus
      E.data.a = a;
      E.data.tahap = 0;
      a.doingEvent = 'ambil lap ke pantry';
      a.say('kok rame di meja saya');
      a.goToXY(424, 280, 'up');              // meja pantry, tempat lap digantung
    }

    // Direbut tool call sungguhan? tahapnya dimatikan (9 = cabang "tidak ada
    // yang bisa dipinjam"), jadi semutnya tetap jalan tapi tidak ada lagi yang
    // disuruh. tahap sudah >= 0, jadi peminjaman di atas tidak menyala ulang.
    if (E.data.a && !masihMain(E, E.data.a)) { E.data.a = null; E.data.tahap = 9; }
    const a = E.data.a;
    if (!a) return;

    if (E.data.tahap === 0 && a.diam) {
      E.data.tahap = 1;
      a.bawa = 'lap';
      a.doingEvent = 'mengelap meja';
      // 350 = MEJA_KERJA_Y: di y=344 papan meja (drawMejaKerja sortY 348)
      // digambar DI ATAS pinggangnya
      a.goToXY(E.data.cx + 8, 350, 'up');
    } else if (E.data.tahap === 1 && a.diam) {
      E.data.tahap = 2;
      a.pose = 'lap';
      a.say('pantesan manis');
      E.data.lapSampai = E.umur + 3;         // tenggat dinamis: disimpan sekali, dibanding manual
    } else if (E.data.tahap === 2) {
      // barisan terhapus dari yang paling jauh dari sarang (yang di bungkus)
      // mundur satu per satu — bukan lenyap serempak
      const sisa = Math.max(0, E.data.lapSampai - E.umur);
      E.data.hapus = Math.min(14, Math.round(14 * (1 - sisa / 3)));
      if (Math.random() < 3 * dt) spawn('dust', E.data.cx + 6, 330);
      if (E.umur > E.data.lapSampai) {
        E.data.tahap = 3;
        E.data.hapus = 14;
        E.data.bungkus = false;              // diremas, ikut di tangan
        a.pose = null;
        a.bawa = 'kertas';
        a.doingEvent = 'buang bungkus';
        a.goToXY(439, 270, 'up');            // tong sampah
      }
    } else if (E.data.tahap === 3 && a.diam) {
      E.data.tahap = 4;
      a.bawa = null;
      a.doingEvent = '';
      RUANGAN.tongPenuh = Math.min(1, RUANGAN.tongPenuh + 0.06);
      for (let i = 0; i < 2; i++) spawn('dust', 439, 272);
    }
  },
  gambarProp(E) {
    if (!E.data.jalur) return;
    const cx = E.data.cx;
    if (E.data.bungkus) {
      // bergetar 1 px selagi barisannya sampai — bungkusnya yang "hidup",
      // bukan semutnya yang harus digambar naik ke atasnya satu-satu
      const by = 325 + (E.data.getar && Math.sin(now / 60) > 0 ? 1 : 0);
      r(cx + 5, by, 7, 5, '#c9b088');
      r(cx + 5, by, 7, 1, '#ddc9a0');
      r(cx + 7, by + 2, 3, 2, '#a8845a');            // noda minyak tembus kertas
    }
    for (let i = E.data.hapus; i < 14; i++) {
      const d = E.data.maju - i * 4;
      if (d < 0) continue;
      const [x, y] = titikSepanjangJalur(E.data.jalur, d);
      // goyangan 1 px: tanpa ini barisan yang sudah mentok terbaca sebagai
      // garis putus-putus mati, bukan antrean yang masih bergerak
      const goyang = Math.sin(now / 180 + i * 1.7) > 0 ? 0 : 1;
      r(x, y + (y > 320 ? 0 : goyang), 1, 1, '#2c2620');
    }
  },
  sortY: 349,          // sesudah drawMejaKerja (348): semut & bungkus di ATAS papan meja
  selesai(E) {
    // yang sudah dipinjam event lain jangan ditimpa: lepaskanAktor() sudah
    // mereset pose/bawa waktu dia direbut
    const a = E.data.a;
    if (masihMain(E, a)) { a.pose = null; a.bawa = null; a.doingEvent = ''; }
  },
},

/* ----------------------------------------------------------------- ayam ----
   Katalog menuntut tiga sistem: kelas Tamu, target kejaran yang di-update tiap
   frame, dan satu event memaksa event lain jalan. Ketiganya dihindari tanpa
   kehilangan lelucon:
     * satpamnya orang luar biasa di E.data + gambarOrangLuar(), sama seperti
       lima event tamu yang sudah jalan — bukan kelas baru;
     * kejarannya memang dinamis, tapi itu MURAH karena satpam ini bukan Agent:
       posisinya milik event, tidak lewat route() yang dihitung sekali;
     * satpam-patroli TIDAK dipanggil paksa — dia cuma dimasukkan ke
       bentrokDengan supaya tidak ada dua satpam di ruangan yang sama.
   Yang dibuang: balon "hus! hus!" dari mulut satpam. Balon itu elemen DOM
   milik Agent, dan orang luar sengaja bukan Agent (aturan 12). Teriakannya
   diwakili partikel 'talk' — bahasa yang sudah dipakai seluruh ruangan ini. */
{
  id: 'ayam-nyelonong-masuk',
  kelas: 'panggung', bobot: B.langka, cooldown: 10800, durasi: 34,
  babak: { malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 6 && S.jam < 9,
  bentrokDengan: ['satpam-patroli', 'kucing-kantor', 'kucing-kantor-mampir'],
  // TANPA perluAktor: ayam yang masuk sendiri lalu diusir satpam tetap layak
  // ditonton di kantor yang baru buka dan masih kosong.
  mulai(E) {
    E.data.ay = { x: -12, y: LANE_DOWN, arah: 1, fase: 'masuk', t: 0, patuk: 0 };
    E.data.tonton = pinjamAktor(E, 2, (o) => o.station === 'think');
    E.data.hadapAsli = E.data.tonton.map((o) => o.hadap);
    for (const o of E.data.tonton) o.doingEvent = 'menonton, tidak membantu';
  },
  tick(E, dt) {
    const A = E.data.ay;
    A.t += dt;
    // langkah patah-patah: kepala maju/mundur bergantian tiap 0,22 detik
    A.maju = Math.floor(A.t / 0.22) % 2 === 0;

    if (A.fase === 'masuk') {
      A.x += 40 * dt;
      if (A.x > 168) { A.fase = 'patuk'; A.t = 0; }
    } else if (A.fase === 'patuk') {
      if (A.t > 1.1) {
        A.t = 0; A.patuk++;
        for (let i = 0; i < 3; i++) spawn('dust', A.x + 4, A.y - 2);
        if (A.patuk >= 3) { A.fase = 'karpet'; }
      }
    } else if (A.fase === 'karpet') {
      // naik ke karpet merah (y 176..252) di sisi kirinya — sengaja x < 200,
      // di luar rentang kursi rapat sisi dekat (203..289) yang akan menelannya
      A.y = Math.max(238, A.y - 14 * dt);
      A.x = Math.min(180, A.x + 8 * dt);
      if (A.y <= 238) A.fase = 'diam';
    } else if (A.fase === 'kabur') {
      A.arah = -1;
      A.x -= 66 * dt;
      A.y = Math.min(LANE_DOWN, A.y + 16 * dt);
      if (A.x < -14) A.fase = 'keluar';
    }

    // satpam masuk belakangan: dia baru tahu setelah ada yang ribut
    if (!E.data.sp && E.umur > 7) E.data.sp = { x: -14, y: LANE_DOWN };
    const P2 = E.data.sp;
    if (P2) {
      // 1,5x kecepatan orang (SPEED 52); target = 14 px di belakang ayam,
      // dihitung ulang tiap frame — itu yang bikin kejarannya terbaca
      const target = A.fase === 'keluar' ? -30 : A.x - 14;
      const dx = target - P2.x;
      P2.x += Math.sign(dx) * Math.min(Math.abs(dx), 78 * dt);
      P2.hadap = dx < 0 ? 'left' : 'right';
      if (Math.random() < 1.6 * dt) spawn('talk', P2.x + 2, P2.y - 30);
      // ayam kabur begitu satpam sudah dekat — dan sehelai bulu tertinggal
      // persis di titik dia melonjak
      if ((A.fase === 'diam' || A.fase === 'patuk' || A.fase === 'karpet')
        && Math.abs(P2.x - A.x) < 34) {
        A.fase = 'kabur';
        E.data.bulu = { x: Math.round(A.x) - 2, y: Math.round(A.y) - 6 };
        for (let i = 0; i < 4; i++) spawn('dust', A.x, A.y - 4);
        blip(300, 0.05);
      }
    }

    // dua pegawai berdiri di mejanya dan cuma menoleh mengikuti ayamnya —
    // tidak dipindah dari meja: yang lucu justru mereka menonton tanpa bangkit
    for (const o of yangMasihMain(E, E.data.tonton)) {
      hadapkan(o, A.x, A.y);
      o.busyUntil = Math.max(o.busyUntil, now + 700);
    }
    pada(E, 5, () => { const o = E.data.tonton[0]; if (o) o.say('ayam siapa itu?'); });
    pada(E, 13, () => { const o = E.data.tonton[1]; if (o) o.say('bukan punya kantor'); });

    // sesudah dua-duanya keluar, salah satu memungut bulunya. Katalog mau bulu
    // itu MENETAP sampai event kebersihan; propLantai tidak punya cabang
    // gambar 'bulu' dan room.js tidak boleh disentuh dari sini, jadi jejaknya
    // dibereskan di dalam event ini juga — tetap ada akibat, tanpa menambah
    // sampah tak terlihat yang permanen.
    pada(E, 24, () => {
      const o = E.data.tonton[0];
      if (!masihMain(E, o) || !E.data.bulu) return;
      E.data.pungut = o;
      o.doingEvent = 'memungut bulu ayam';
      o.goToXY(E.data.bulu.x, E.data.bulu.y + 12, 'up');
    });
    if (E.data.pungut && !masihMain(E, E.data.pungut)) E.data.pungut = null;
    const p = E.data.pungut;
    if (p && p.diam && !E.data.jongkokSampai) {
      E.data.jongkokSampai = E.umur + 1.5;
      p.pose = 'jongkok';
    }
    if (p && E.data.jongkokSampai && E.umur > E.data.jongkokSampai && E.data.bulu) {
      E.data.bulu = null;
      p.pose = null;
      p.doingEvent = '';
      p.say('bulu ayam, serius');
      p.goTo('think');
    }
  },
  gambarProp(E) {
    const A = E.data.ay;
    if (!A) return;
    if (E.data.bulu) {
      r(E.data.bulu.x, E.data.bulu.y, 2, 1, '#f2ece0');
      r(E.data.bulu.x + 2, E.data.bulu.y + 1, 1, 1, '#d9d2c2');
    }
    const P2 = E.data.sp;
    if (P2 && P2.x > -12 && P2.x < W + 12) {
      gambarOrangLuar(P2.x, P2.y, '#2b3f6b', null, null, '#1c2a48');
      const x = Math.round(P2.x), y = Math.round(P2.y);
      r(x - 4, y - 24, 8, 2, '#16213a');              // topi pet
      r(x - 5, y - 22, 10, 1, '#16213a');
    }
    if (A.fase !== 'keluar' && A.x > -14 && A.x < W + 14) {
      gambarAyamKampung(A.x, A.y, A.arah, A.maju);
    }
  },
  // 276 = pola yang dipakai room.js untuk pejalan di pita bawah (a.y + 24):
  // ayam & satpam lewat DI DEPAN sandaran kursi rapat sisi dekat, sama seperti
  // pegawai yang menyusur LANE_DOWN.
  sortY: 276,
  selesai(E) {
    (E.data.tonton || []).forEach((o, i) => {
      if (!masihMain(E, o)) return;      // sudah direbut: bukan urusan kita lagi
      o.pose = null;
      o.doingEvent = '';
      // hadap dikembalikan sendiri: lepaskanAktor() mereset pose/bawa, bukan arah
      if (o.station === 'think') o.hadap = o.face = E.data.hadapAsli[i] || 'up';
    });
  },
},

/* ------------------------------------------------------------- flipchart ---
   Terjemahan plan mode: belum boleh menyentuh berkas, rencananya dulu.

   Dua koreksi dari catatan rapat dijalankan apa adanya:
     * posisi x=138 dasar 250 memang menabrak tiang dan alas bendera
       (x 127..150, y 213..274). Flipchart digeser ke x 96..122 dasar 254 —
       di kiri bendera, di luar karpet merah (mulai x=152), di luar lajur
       penghubung kiri LANE_L=160, dan jauh di atas meja kerja pojok kiri
       (y 315..348). Masih terbaca "di kiri meja rapat".
     * gerbang penundaan di Agent.goTo('edit') DIBUANG. Menunda pegawai yang
       benar-benar sedang Edit/Write bikin halaman berbohong soal pekerjaan
       yang sedang jalan — dan itu satu-satunya hal yang tidak boleh dilakukan
       ruangan ini. Akibat yang terlihat diganti yang jujur: begitu bagannya
       LENGKAP, penggambarnya jalan ke meja stempel dan mengecap sekali. Baru
       sesudah rencananya utuh, eksekusinya boleh turun. */
{
  id: 'bagan-di-flipchart',
  kelas: 'latar', bobot: B.sedang, cooldown: 660, durasi: 32,
  babak: { malam: 0, libur: 0 },
  syarat: (S) => S.orang.some((o) => o.station === 'rapat'),
  perluAktor: true,
  mulai(E, S) {
    // penggambarnya diambil dari luar meja rapat kalau bisa: kalau yang
    // dipinjam justru satu-satunya yang duduk, tidak ada yang menonton bagan
    E.data.a = pinjamAktor(E, 1, (o) => o.station !== 'rapat')[0] || pemeran(E);
    E.data.langkah = 0;
    E.data.duduk = S.orang.filter((o) => o.station === 'rapat' && !o.adaTugas);
    E.data.hadapAsli = E.data.duduk.map((o) => o.hadap);
    const a = E.data.a;
    if (!a) return;
    a.doingEvent = 'bikin bagan dulu';
    a.goToXY(88, 250, 'right');            // berdiri di KIRI flipchart, hadap ke kertasnya
  },
  tick(E, dt) {
    // semua yang duduk di meja rapat menghadap flipchart. Ditulis tiap frame:
    // hadap/face lengket, tapi orang bisa berpindah stasiun di tengah event —
    // yang sudah pergi tidak boleh ikut dipaksa menoleh lagi.
    for (const o of E.data.duduk) {
      if (o.station !== 'rapat' || o.adaTugas) continue;
      hadapkan(o, 110, 232);
    }

    const a = E.data.a;
    // berhenti menyuruh begitu penggambarnya direbut tool call sungguhan
    if (!masihMain(E, a)) return;

    if (!E.data.mulaiGambar && a.diam) {
      E.data.mulaiGambar = true;
      E.data.gambarSejak = E.umur;         // tenggat dinamis disimpan sekali
      a.pose = 'nunjuk';
      a.say('belum dieksekusi, rencananya dulu');
    }
    if (E.data.mulaiGambar && E.data.langkah < 7) {
      const target = Math.min(7, Math.floor((E.umur - E.data.gambarSejak) / 1.6));
      while (E.data.langkah < target) {
        E.data.langkah++;
        blip(340, 0.05);
        spawn('ink', 112, 226, '#c22b2b');
      }
      if (E.data.langkah >= 7) {
        E.data.penuhSejak = E.umur;
        a.pose = null;
        a.say('baru boleh dieksekusi');
      }
    }
    // rencana lengkap -> eksekusi: satu hentakan stempel di meja stempel
    if (E.data.penuhSejak && !E.data.kirim && E.umur > E.data.penuhSejak + 2) {
      E.data.kirim = true;
      a.doingEvent = 'eksekusi rencana';
      a.goTo('edit');
    }
    if (E.data.kirim && !E.data.cap && a.diam && a.station === 'edit') {
      E.data.cap = true;
      hentakkanStempel(a);
      a.doingEvent = '';
    }
  },
  gambarProp(E) {
    const x = 96, y = 210;                 // kertas 26x36, dasar kaki di 254
    r(x + 2, 246, 1, 8, '#7c838a');        // tiga kaki 1 px
    r(x + 12, 246, 1, 8, '#7c838a');
    r(x + 23, 246, 1, 8, '#7c838a');
    r(x, y, 26, 36, '#efe8d4');            // kertas krem
    r(x, y, 26, 1, '#f7f2e2');
    r(x - 1, y - 3, 28, 4, '#8b8f86');     // penjepit abu
    r(x - 1, y - 3, 28, 1, '#a8b1a3');
    const n = E.data.langkah || 0;
    for (let i = 0; i < FLIP_KOTAK.length; i++) {
      if (n < i * 2 + 1) break;
      const [kx, ky] = FLIP_KOTAK[i];
      r(kx, ky, 6, 4, '#c22b2b');
      r(kx + 1, ky + 1, 4, 2, '#efe8d4');
    }
    for (let i = 0; i < FLIP_PANAH.length; i++) {
      if (n < i * 2 + 2) break;
      const [px, py] = FLIP_PANAH[i];
      r(px, py, 5, 1, '#c22b2b');
      r(px + 4, py - 1, 1, 3, '#c22b2b');  // mata panah
    }
    // spidol merah di tangan penggambar, digambar di sisi kanan badannya
    // (x+7) supaya tidak tertelan sprite-nya sendiri yang di-sort belakangan
    const a = E.data.a;
    if (a && a.pose === 'nunjuk') r(Math.round(a.x) + 7, Math.round(a.y) - 20, 4, 1, '#c22b2b');
  },
  sortY: 253,
  selesai(E) {
    if (E.data.a) { E.data.a.pose = null; E.data.a.doingEvent = ''; }
    (E.data.duduk || []).forEach((o, i) => {
      if (o.station !== 'rapat') return;
      o.hadap = o.face = E.data.hadapAsli[i] || 'down';
    });
  },
},

);
