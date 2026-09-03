/* ==========================================================================
   PERAYAAN BESAR — meja rapat yang berubah jadi meja makan
   ==========================================================================
   Tiga usulan yang sama-sama divonis "mahal" karena menuntut mesin baru:
   koleksi caraka, status agen keluar layar, pose tanpa lengan, dan kind
   partikel 'remah'. Tidak satu pun dibuat. Yang dipakai semuanya sudah ada:
   gambarOrangLuar() untuk caraka, pinjamAktor()+goToXY() untuk mengumpulkan
   orang, pose 'silang' sebagai ganti tangan-di-belakang, dan spawn('serbuk',
   x, y, warna) — spawn() menerima warna pengganti di argumen keempat, jadi
   remah kerupuk cuma serbuk berwarna '#e8c88a', bukan kind baru.

   Satu penyimpangan teknis yang berlaku untuk ketiganya dan perlu ditulis
   sekali di sini: SEMUA benda yang ditaruh DI ATAS taplak meja rapat
   digambar dengan sortY > 249. drawRapat sortY-nya 249 dan taplaknya menutup
   seluruh y=186..226; prop event ber-sortY 200-an (pola yang dipakai
   makan-siang-bareng dan tumpeng-syukuran) digambar SEBELUM taplak, jadi
   tertimpa. Nasi kotak dan hidangan buka puasa di bawah ini memakai 251/261
   supaya benar-benar terlihat di atas taplak, dan tetap di bawah kursi sisi
   dekat (260) / pantry (270) yang memang lebih depan.
   ========================================================================== */

daftarEvent(

/* Nasi kotak: bukan undian waktu, tapi imbalan atas rapat yang panjang —
   syaratnya membaca a.arrivedAt (stempel waktu tiba di stasiun, sudah ada dan
   dipakai pinjamAktor) sehingga "3 kursi terisi terus-menerus >70 detik" bisa
   dijawab tanpa menyimpan pencatat waktu sendiri di luar event.

   Dua penyimpangan dari usulan:
   1. Caraka masuk dari TEPI KIRI, bukan dari pintu kadis. Pintu kadis itu
      pintu ruang dalam; lima event orang-luar yang sudah ada (kurir, ojol,
      tukang galon, satpam, wartawan) semuanya masuk dari kiri, dan menaruh
      satu-satunya pengantar yang datang dari arah berlawanan bikin dia
      terbaca sebagai staf ruang kadis, bukan orang luar.
   2. "Kotak sisa hilang setelah 60 detik" tidak dibuat sebagai timer sendiri:
      prop event lenyap begitu eventnya mati, jadi durasinya saja yang
      dipanjangkan ke 54 detik. Menaruhnya di RUANGAN supaya bertahan lewat
      batas hidup event berarti kotak nasi bisa nyangkut di meja selamanya
      kalau eventnya batal di tengah — persis jebakan yang dihindari
      satpam-patroli waktu menolak memadamkan neon sampai pagi. */
{
  id: 'nasi-kotak-datang',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 54,
  babak: { malam: 0, libur: 0 },
  // jangan dua lapis makanan di satu taplak
  bentrokDengan: ['makan-siang-bareng', 'tumpeng-syukuran', 'gorengan-di-meja-rapat', 'buka-puasa-bersama'],
  syarat: (S) => {
    if (!S.kerjaJam) return false;
    const duduk = S.orang.filter((o) => o.station === 'rapat' && !o.antre);
    // rapatnya harus sudah BERJALAN, bukan baru saja duduk
    return duduk.filter((o) => now - o.arrivedAt > 70000).length >= 3;
  },
  // sengaja TANPA perluAktor: caraka bukan aktor pinjaman, dan kotak yang
  // tidak diambil siapa-siapa memang bagian dari leluconnya
  mulai(E) {
    E.data.t = { x: -14, y: LANE_DOWN, fase: 'masuk' };
    E.data.tumpuk = 0;
    E.data.kotak = [];        // [{ o, x, y }] kotak yang sudah di depan orang
    E.data.poseLepas = [];    // [{ o, pada }] lengan yang harus diturunkan lagi
  },
  tick(E, dt) {
    const T = E.data.t;
    if (T.fase === 'masuk') {
      T.x = Math.min(330, T.x + 46 * dt);
      if (T.x >= 330) T.fase = 'naik';
    } else if (T.fase === 'naik') {
      T.y = Math.max(236, T.y - 46 * dt);
      if (T.y <= 236) { T.fase = 'taruh'; T.taruhPada = E.umur + 1.2; }
    } else if (T.fase === 'taruh') {
      if (T.taruhPada && E.umur > T.taruhPada && !E.data.taruh) {
        E.data.taruh = true;
        E.data.taruhUmur = E.umur;
        E.data.tumpuk = 3;
        E.data.ambilPada = E.umur + 2.5;
        T.fase = 'pulang';
      }
    } else if (T.fase === 'pulang') {
      if (T.y < LANE_DOWN) T.y = Math.min(LANE_DOWN, T.y + 46 * dt);
      else T.x -= 46 * dt;
    }

    // Masih hangat: uap dari puncak tumpukan, 20 detik pertama saja. Sesudah
    // itu berhenti walau kotaknya belum diambil — dingin, dan itu memang
    // bagian dari leluconnya.
    if (E.data.taruh && E.data.tumpuk > 0 && E.umur - E.data.taruhUmur < 20
      && Math.random() < 0.5 * dt * E.data.tumpuk) {
      spawn('steam', 311, 219 - E.data.tumpuk * 5);
    }

    /* Daftar yang duduk dibaca ULANG tiap frame dari penghuni() — bukan
       disimpan sekali di mulai(). Peserta rapat (fan-out Task) bisa destroy()
       kapan saja; kalau referensinya dipegang, kotaknya tertinggal melayang di
       atas taplak. Ini jebakan yang sama dengan bubarkanSatu. */
    const duduk = [];
    for (const o of penghuni()) if (o.station === 'rapat' && !o.antre) duduk.push(o);
    if (E.data.kotak.length) {
      E.data.kotak = E.data.kotak.filter((k) => duduk.indexOf(k.o) >= 0);
    }

    // bergiliran, berjeda 2,5 detik
    if (E.data.taruh && E.data.tumpuk > 0 && E.data.ambilPada && E.umur > E.data.ambilPada) {
      E.data.ambilPada = E.umur + 2.5;
      const o = duduk.find((p) => !E.data.kotak.some((k) => k.o === p));
      if (o) {
        E.data.tumpuk--;
        // sisi jauh meja: kotaknya di depan layar mini; sisi dekat (kursi
        // membelakangi kamera): di tepi depan taplak, di depan badannya
        const jauh = o.y < 220;
        E.data.kotak.push({ o, x: Math.round(o.x) - 3, y: jauh ? 201 : 214 });
        spawn('paper', o.x, o.y - 20);
        if (!E.data.ucap) { E.data.ucap = true; o.say('makasih, Mas'); }
        /* Peserta rapat TIDAK dipinjam (mereka memang harus tetap duduk dan
           bisa sedang menangani tool call), jadi posenya cuma disentuh kalau
           dia benar-benar sedang tidak bekerja, dan tenggat penurunannya
           disimpan sekali — bukan pada() bertarget bergerak. */
        if (!o.adaTugas && o.state !== 'work') {
          o.pose = 'angkat';
          E.data.poseLepas.push({ o, pada: E.umur + 1.5 });
        }
      }
    }
    for (let i = E.data.poseLepas.length - 1; i >= 0; i--) {
      const p = E.data.poseLepas[i];
      if (E.umur > p.pada) {
        if (p.o && p.o.pose === 'angkat') p.o.pose = null;
        E.data.poseLepas.splice(i, 1);
      }
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (T && T.x > -12 && T.x < W + 12) {
      gambarOrangLuar(T.x, T.y, '#8a6f4a', null, null, '#2b2118');
      if (!E.data.taruh) {                        // tiga kotak masih dipanggul
        const x = Math.round(T.x) - 4, y = Math.round(T.y) - 32;
        for (let i = 0; i < 3; i++) {
          r(x, y + i * 5, 9, 5, '#f2ece0');
          r(x, y + i * 5, 9, 1, '#d9d4c3');
          r(x + 6, y + 2 + i * 5, 2, 1, '#c9a03a');   // karet gelang
        }
      }
    }
    // tumpukan di ujung kanan taplak, di luar jangkauan gelas dan botol
    for (let i = 0; i < (E.data.tumpuk || 0); i++) {
      const y = 217 - i * 5;
      r(307, y, 9, 5, '#f2ece0');
      r(307, y, 9, 1, '#d9d4c3');
      r(313, y + 2, 2, 1, '#c9a03a');
    }
    for (const k of (E.data.kotak || [])) {
      r(k.x, k.y, 6, 4, '#f2ece0');
      r(k.x, k.y, 6, 1, '#d9d4c3');
      r(k.x + 1, k.y + 2, 2, 1, '#c9a03a');
    }
  },
  // 261: di atas taplak (249) dan kursi sisi dekat (260) — kotaknya tidak
  // bertabrakan dengan sandaran kursi mana pun, jadi aman diangkat ke depan
  sortY: 261,
  selesai(E) {
    for (const p of (E.data.poseLepas || [])) {
      if (p.o && p.o.pose === 'angkat') p.o.pose = null;
    }
  },
},

/* Buka puasa: satu-satunya event di berkas ini yang benar-benar mengambil
   alih ruangan, jadi 'panggung'.

   Tiga bagian usulan dibuang, semuanya dengan alasan yang sama — sudah ada
   yang mengerjakannya, atau harganya mesin baru:
   1. "Hanya kalau ramadan-siang-sunyi aktif": mustahil. Syarat event itu
      berhenti di jam 17.75, jadi ia TIDAK PERNAH hidup saat magrib. Yang
      dipakai di sini sumber yang sama persis, taksirHijri(), langsung.
   2. Melepas kain penutup dispenser: kain itu prop milik ramadan-siang-sunyi
      sendiri dan cuma ada selama event itu hidup — pada jam ini ia sudah
      mati, dispensernya sudah telanjang. Tidak ada yang perlu dilepas.
   3. Tiga pegawai keluar kanvas untuk salat: butuh status agen keluar layar,
      dan itu bertabrakan langsung dengan mesin pulangKantor(). Bagian salat
      magrib pun sudah punya rumah sendiri (jeda-maghrib, senyap-magrib);
      yang belum ada cuma HIDANGANNYA, jadi itu yang dibuat. */
{
  id: 'buka-puasa-bersama',
  kelas: 'panggung', bobot: B.jarang, cooldown: 82800, durasi: 100,
  bentrokDengan: ['nasi-kotak-datang', 'gorengan-di-meja-rapat'],
  syarat: (S) => {
    const h = taksirHijri(new Date());
    // kursiKosong() ikut dijaga: adegannya orang DUDUK menghadap takjil.
    // Tanpa ini, meja rapat yang sudah penuh membuat goTo('rapat') menandai
    // sisanya a.antre — mereka berdiri di pinggir sepanjang 100 detik sambil
    // menatap kurma yang tidak kebagian tempat.
    return h.bulan === 9 && S.jam >= 17.6 && S.jam < 18.3 && kursiKosong() >= 3;
  },
  perluAktor: true,
  mulai(E) {
    // Pinjam sebanyak kursi yang benar-benar kosong, maksimal 5.
    E.data.duduk = pinjamAktor(E, Math.min(5, kursiKosong()));
    if (E.data.duduk.length < 2) { E.selesaiCepat = true; return; }
    E.data.asal = E.data.duduk.map((a) => a.station);
    for (const a of E.data.duduk) {
      a.doingEvent = 'menunggu azan magrib';
      a.goTo('rapat');
    }
  },
  tick(E, dt) {
    // Menunggu: yang duduk memang DIAM — tidak ada partikel kerja, neon tidak
    // berkedip. MOD direset tiap frame, jadi rentangnya ditulis ulang terus.
    if (E.umur < 30) MOD.hening = true;
    if (E.umur > 28 && E.umur < 36) MOD.ambPlus = 0.04;

    // uap dari tiga gelas teh sepanjang acara
    if (Math.random() < 1.1 * dt) spawn('steam', pilih([201, 247, 293]), 205);

    pada(E, 30, () => {
      const a = E.data.duduk[0];
      if (a) a.say('alhamdulillah');
    });
    // ledakan obrolan dua detik: azan, semua serentak
    if (E.umur > 30 && E.umur < 32) {
      for (const a of E.data.duduk) if (Math.random() < 4 * dt) spawn('talk', a.x, a.y - 24);
    }
    pada(E, 32.5, () => { for (const a of yangMasihMain(E, E.data.duduk)) a.pose = 'angkat'; });
    if (E.umur > 33 && E.umur < 58 && Math.random() < 1.6 * dt) {
      const a = pilih(E.data.duduk);
      if (a) spawn('steam', a.x, a.y - 18);
    }
    pada(E, 58, () => { for (const a of yangMasihMain(E, E.data.duduk)) a.pose = null; });
    pada(E, 62, () => { const a = E.data.duduk[1]; if (masihMain(E, a)) a.say('kurmanya diambil, jangan malu-malu'); });
    pada(E, 88, () => {
      // yang sudah direbut tool call sungguhan tidak diseret balik ke mejanya
      E.data.duduk.forEach((a, i) => {
        if (!masihMain(E, a)) return;
        a.doingEvent = ''; a.goTo(E.data.asal[i] || 'think');
      });
    });
  },
  gambarProp(E) {
    // sembilan takjil berjajar sepanjang taplak — x-nya berhenti di 306
    // supaya kotak terakhir (6 px) tetap di dalam tepi kanan meja pada y ini
    for (let i = 0; i < 9; i++) {
      const x = 186 + i * 15;
      r(x, 203, 6, 4, '#d9b46a');
      r(x, 203, 6, 1, '#efd299');
      r(x + 2, 205, 2, 1, '#8a6844');
    }
    for (const gx of [200, 246, 292]) {           // gelas teh
      r(gx, 206, 3, 5, '#a86a3a');
      r(gx, 206, 3, 1, '#c98d55');
    }
    for (let i = 0; i < 3; i++) r(238 + i * 4, 216, 2, 2, '#4a2f1c');   // sepiring kurma
  },
  sortY: 251,
  selesai(E) {
    for (const a of (E.data.duduk || [])) { a.pose = null; a.doingEvent = ''; }
  },
},

/* Lomba kerupuk: yang paling banyak menyimpang dari usulan, dan alasannya
   geometri, bukan selera.

   Usulan menaruh tali di y=200 dan pemain di y=228. Dua-duanya JATUH DI DALAM
   meja rapat: trapesium taplak menempati y=186..226 dan rimpel hijaunya
   menjuntai sampai y=242. Pemain di sana bukan berdiri di karpet, tapi
   tenggelam di dalam meja. Seluruh arena digeser ke pita depan yang memang
   kosong: tali di y=262 (persis di bawah tepi bawah karpet merah, 252),
   pemain di y=300, penonton tetap di LANE_DOWN. Kerupuknya jadi jatuh tepat
   di ketinggian mulut pemain — yang justru tidak terjadi di tata letak asli.

   Dua yang lain: pose tangan-di-belakang tidak dibuat (itu cabang baru di
   drawPerson, berkas milik orang lain) — dipakai 'silang', yang sama-sama
   membaca "tangan tidak dipakai"; dan kepala naik-turun 1 px dilewati karena
   satu-satunya cara menggesernya adalah mengutak-atik a.y, yang dibaca depth
   sort dan pathing. Yang bergerak kerupuknya, dan itu cukup: mata penonton
   memang mengikuti kerupuk, bukan tengkuk pemain. */
{
  id: 'lomba-makan-kerupuk',
  // Durasi dipangkas 90 -> 42. Seluruh aksinya memang habis di detik ~24
  // (pada(E,11) + enam gigitan x maks 2,05 s), dan sesudah itu gambarProp
  // melewati semua kerupuk karena k.gigit >= 6 — sisanya cuma dua garis tali
  // dan tujuh orang membeku. Kelas 'panggung' berarti 54 detik kosong itu
  // sekaligus MENGUNCI semua event panggung lain lewat bentrok().
  kelas: 'panggung', bobot: B.langka, cooldown: 43200, durasi: 42,
  // RUANGAN.tema, bukan getMonth() sendiri. Registri TEMA-lah yang berwenang:
  // 'agustusan' berlaku 1..17 Agustus (getMonth()===7 saja masih menyala
  // 18..31 Agustus, jauh sesudah umbul-umbulnya diturunkan), dan hanya lewat
  // RUANGAN.tema uji ?tema=agustusan bisa memicunya di luar Agustus.
  // S.orang.length juga salah hitung: itu SEMUA penghuni termasuk yang sedang
  // menjalankan tool call. pinjamAktor(E,3) di mulai() cuma melihat yang
  // bisaDipinjam(), jadi syaratnya harus memakai ukuran yang sama.
  syarat: (S) => RUANGAN.tema === 'agustusan' && S.jam >= 13 && S.jam < 15
    && S.orang.filter((o) => bisaDipinjam(o)).length >= 3,
  perluAktor: true,
  mulai(E) {
    const main = pinjamAktor(E, 3);
    if (!main.length) { E.selesaiCepat = true; return; }
    E.data.X = [200, 245, 290].slice(0, main.length);
    E.data.main = main;
    E.data.asal = main.map((a) => a.station);
    main.forEach((a, i) => {
      a.doingEvent = 'lomba makan kerupuk';
      a.goToXY(E.data.X[i], 300, 'down');
    });
    // Pemenang ditentukan di awal seperti diminta usulan: jedanya paling
    // pendek. Sisanya diberi jeda berbeda-beda supaya tidak habis serempak.
    E.data.menang = (Math.random() * main.length) | 0;
    E.data.krupuk = main.map((a, i) => ({
      gigit: 0, pada: 0, jeda: i === E.data.menang ? 1.05 : 1.55 + i * 0.25,
    }));
    const tonton = pinjamAktor(E, 4);
    E.data.tonton = tonton;
    E.data.tontonAsal = tonton.map((a) => a.station);
    const TX = [150, 172, 320, 342];
    tonton.forEach((a, i) => {
      a.doingEvent = 'nonton lomba kerupuk';
      a.goToXY(TX[i], LANE_DOWN, 'down');
    });
  },
  tick(E, dt) {
    const M = E.data.main || [];
    const K = E.data.krupuk || [];
    pada(E, 8, () => {
      for (const a of M) a.pose = 'silang';       // tangan tidak dipakai
      E.data.gantung = true;
    });
    pada(E, 9.5, () => { const t = (E.data.tonton || [])[0]; if (t) t.say('ayo, dikit lagi!'); });
    // aba-aba: tenggat gigitan pertama disimpan sekali di sini, bukan lewat
    // pada() bertarget bergerak
    pada(E, 11, () => { for (const k of K) k.pada = E.umur + k.jeda; });

    for (let i = 0; i < K.length; i++) {
      const k = K[i];
      if (!k.pada || k.gigit >= 6) continue;
      if (E.umur <= k.pada) continue;
      k.pada = E.umur + k.jeda;
      k.gigit++;
      const x = E.data.X[i] + Math.sin(now / 380 + i) * 2;
      for (let s = 0; s < 2; s++) spawn('serbuk', x, 279, '#e8c88a');   // remah
      if (k.gigit >= 6 && E.data.juara == null) {
        E.data.juara = i;
        E.data.juaraPada = E.umur;
        const a = M[i];
        if (a) { a.pose = 'angkat'; a.say('habis! saya duluan'); }
        for (const t of (E.data.tonton || [])) {
          spawn('talk', t.x, t.y - 24);
          spawn('talk', t.x + 4, t.y - 26);
        }
      }
    }

    // sorakan penonton selama lomba berjalan
    if (E.data.gantung && E.data.juara == null && Math.random() < 0.9 * dt) {
      const t = pilih(E.data.tonton || []);
      if (t) spawn('talk', t.x, t.y - 24);
    }
    // tangan juara turun lagi sesudah 3 detik
    if (E.data.juaraPada && E.umur > E.data.juaraPada + 3) {
      const a = M[E.data.juara];
      if (a && a.pose === 'angkat') a.pose = 'silang';
    }

    pada(E, 30, () => {
      // potret pemeran tidak ikut terpangkas waktu tool call merebut orangnya
      M.forEach((a, i) => {
        if (!masihMain(E, a)) return;
        a.pose = null; a.doingEvent = ''; a.goTo(E.data.asal[i] || 'think');
      });
      (E.data.tonton || []).forEach((a, i) => {
        if (!masihMain(E, a)) return;
        a.doingEvent = '';
        a.goTo((E.data.tontonAsal || [])[i] || 'think');
      });
      E.data.gantung = false;
    });
  },
  gambarProp(E) {
    if (!E.data.gantung || !E.data.krupuk) return;
    // Talinya dipendekkan dari x160..330 jadi x188..302 — hanya sepanjang tiga
    // titik peserta (E.data.X = 200/245/290) plus sedikit ujung. sortY 301 di
    // bawah sengaja: kerupuknya harus tergambar DI DEPAN wajah peserta yang
    // berdiri di y=300. Tapi dengan tali sepanjang 170 px, sortY setinggi itu
    // ikut menimpa KEPALA orang yang berdiri di ruang tunggu (STATIONS.idle
    // x=282 y=288, kepala ~y=258) — talinya melintang di mukanya.
    const t1 = 188, t2 = 302;
    r(t1, 262, t2 - t1, 1, '#e8d8a0');            // tali rafia
    r(t1, 263, t2 - t1, 1, '#c9b880');
    for (let i = 0; i < E.data.X.length; i++) {
      const k = E.data.krupuk[i];
      if (!k || k.gigit >= 6) continue;
      const cx = Math.round(E.data.X[i] + Math.sin(now / 380 + i) * 2);
      r(cx, 264, 1, 10, '#e8d8a0');               // benang gantungan
      const tahap = k.gigit < 2 ? 0 : (k.gigit < 4 ? 1 : 2);
      const w = [7, 5, 3][tahap], h = [6, 4, 3][tahap];
      const bx = cx - (w >> 1);
      r(bx, 274, w, h, '#e8c88a');
      r(bx, 274, w, 1, '#f2dcaa');
      r(bx + 1, 276, 1, 1, '#c9a86a');            // lubang kerupuk
      if (w > 3) r(bx + w - 2, 275, 1, 1, '#c9a86a');
    }
  },
  // 301: sedikit di depan pemain (kaki y=300) supaya kerupuk jatuh di depan
  // wajahnya, bukan di belakang kepala
  sortY: 301,
  selesai(E) {
    for (const a of (E.data.main || [])) { a.pose = null; a.doingEvent = ''; }
    for (const a of (E.data.tonton || [])) a.doingEvent = '';
  },
},

);
