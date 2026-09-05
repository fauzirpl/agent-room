/* ==========================================================================
   GELOMBANG 3 — tamu dari luar, guncangan, dan senja
   ==========================================================================
   Enam usulan katalog yang dulu divonis "mahal" karena menuntut kelas Tamu
   dan goToTitik yang belum ada. Dua-duanya kini ada bentuk lain yang cukup:
   gambarOrangLuar() untuk orang non-pegawai (5 event lama sudah memakainya)
   dan goToXY(x, y, hadap) untuk titik bebas. Jadi orang luar di sini TETAP
   objek biasa di E.data — bukan koleksi keempat yang harus dibaca depth sort,
   penghuni(), renderCrew, dan jagaPopulasi (yang mahal dan berisiko dihitung
   sebagai sesi). Konsekuensinya jujur: mereka digambar di satu sortY tetap,
   jadi jangan diparkir di tempat yang menuntut tumpang-tindih rumit.
   ========================================================================== */

daftarEvent(

/* Guncangan sudah punya jalurnya sendiri (MOD.getar, dipakai genset), jadi
   yang tersisa cuma koreografi: semua berhenti, yang duduk berkumpul di
   karpet, lalu kembali ke stasiun MASING-MASING — stasiun terakhirnya
   disimpan dulu, karena goTo() menimpanya. Kemiringan jam dinding di usulan
   aslinya dibuang: drawClock tidak punya sumbu putar dan memutar kanvas cuma
   untuk itu bikin jarumnya pecah. */
{
  id: 'gempa-kecil',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 9,
  // sengaja TANPA perluAktor: guncangan + debu plafon tetap layak ditonton
  // walau tidak ada yang sedang duduk untuk dikumpulkan ke karpet
  mulai(E, S) {
    const duduk = pinjamAktor(E, 4, (o) => o.station === 'think' || o.station === 'rapat');
    E.data.asal = duduk.map((a) => a.station);
    duduk.forEach((a, i) => {
      a.doingEvent = 'menepi, ada gempa';
      a.goToXY(184 + i * 30, 230, 'down');
    });
    const a0 = duduk[0] || S.orang.find((o) => !o.path.length);
    if (a0) a0.say('gempa! keluar dulu');
    for (let i = 0; i < 10; i++) spawn('dust', 40 + Math.random() * 400, 10);
  },
  tick(E, dt, S) {
    // amplitudo naik lalu turun, 0 -> 2 -> 0 sepanjang 3,5 detik pertama.
    // WAJIB ditulis tiap frame: MOD direset di awal setiap frame.
    if (E.umur < 3.5) {
      const t = E.umur / 3.5;
      MOD.getar = 2 * Math.sin(t * Math.PI);
      if (Math.random() < 6 * dt) spawn('dust', 40 + Math.random() * 400, 10);
    }
    // yang tidak ikut menepi cuma berhenti sebentar dan menengadah
    pada(E, 0.2, () => {
      /* mendongak() menyaring sendiri siapa yang tidak boleh diputar: yang
         sedang berjalan, yang sedang dipinjam event lain, dan siapa pun yang
         face-nya 'up' (sprite punggung — memutarnya membalik siluetnya, bukan
         membuatnya mendongak). Pagar adaTugas yang dulu ada di sini sengaja
         tidak diteruskan: peserta rapat memakainya PERMANEN, dan gempa yang
         tidak membuat meja rapat mendongak sama sekali justru yang aneh. */
      mendongak(S.orang, 1000);
    });
    // pulang satu per satu ke stasiun asalnya, bukan serentak
    pada(E, 7, () => {
      E.aktor.forEach((a, i) => {
        const asal = E.data.asal[i] || 'think';
        a.doingEvent = '';
        a.goTo(asal);
      });
    });
  },
  selesai(E) { for (const a of E.aktor) a.doingEvent = ''; },
},

/* Galon: satu-satunya bagian yang butuh mesin adalah kepala dispenser yang
   kosong selama penggantian (MOD.galonLepas, dibaca drawDispenserPantry).
   Sisanya orang luar + satu pegawai yang membantu memegang. */
{
  id: 'tukang-galon-datang',
  kelas: 'latar', bobot: B.sedang, cooldown: 1800, durasi: 40,
  babak: { malam: 0, libur: 0 },
  // Sudah ada galon-habis-diganti (bobot sering, cooldown 240, ambang <= 3):
  // pegawai mengangkat sendiri galonnya. Yang ini versi TUKANG dari luar, dan
  // supaya keduanya tidak berebut pemicu yang sama, ambangnya lebih dalam —
  // dia baru datang kalau sampai tinggal <= 1, artinya tidak ada pegawai yang
  // membereskannya sendiri. bentrokDengan menahan dua adegan galon bersamaan.
  bentrokDengan: ['galon-habis-diganti'],
  syarat: (S) => S.kerjaJam && RUANGAN.gelasDispenser <= 1,
  mulai(E) {
    E.data.t = { x: -14, y: LANE_DOWN, fase: 'masuk' };
  },
  tick(E, dt) {
    const T = E.data.t;
    // 0,8x kecepatan orang biasa: dia memanggul galon
    if (T.fase === 'masuk') {
      T.x = Math.min(424, T.x + 42 * dt);
      if (T.x >= 424) { T.fase = 'pasang'; T.mulaiPasang = E.umur; }
    } else if (T.fase === 'pulang') {
      T.x -= 46 * dt;
    }

    if (T.fase === 'pasang') {
      const t = E.umur - T.mulaiPasang;
      // 4 detik pertama: galon lama dicabut (kepala dispenser kosong) dan
      // galon barunya digambar TERANGKAT di depan badan — bukan hilang dari
      // dua tempat sekaligus, yang terbaca seperti salah gambar
      if (t < 4) { MOD.galonLepas = true; T.panggul = 'angkat'; }
      else if (t < 5) {
        if (!E.data.terpasang) {
          E.data.terpasang = true;
          T.panggul = false;                        // sudah pindah ke dispenser
          RUANGAN.gelasDispenser = 6;
          for (let i = 0; i < 3; i++) spawn('steam', 468, 250, '#b8dcf4');
        }
      } else if (t > 6 && T.fase === 'pasang') { T.fase = 'pulang'; }
    }

    // satu pegawai membantu memegang, berdiri di sebelahnya
    if (!E.data.bantu && T.fase === 'pasang') {
      E.data.bantu = pemeranDekat(E, 424, LANE_DOWN, 260) || pemeran(E);
      if (E.data.bantu) {
        E.data.bantu.doingEvent = 'membantu angkat galon';
        E.data.bantu.pose = 'angkat';
        E.data.bantu.goToXY(410, 268, 'right');
        E.data.bantu.say('satu ya, Bang');
      }
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -12 || T.x > W + 12) return;
    gambarOrangLuar(T.x, T.y, '#3f6285', null, null, '#2b3138');
    if (T.panggul !== false) {
      const x = Math.round(T.x), y = Math.round(T.y);
      // di bahu selama jalan; terangkat di depan dada selama memasang
      const gy = T.panggul === 'angkat' ? y - 24 : y - 30;
      const gx = T.panggul === 'angkat' ? x - 4 : x + 4;
      r(gx, gy, 8, 11, '#7db8e8');
      r(gx + 1, gy + 2, 2, 6, '#b8dcf4');
      r(gx + 3, gy - 2, 3, 2, '#5f9fd4');
    }
  },
  sortY: 262,
  selesai(E) {
    if (E.data.bantu) { E.data.bantu.pose = null; E.data.bantu.doingEvent = ''; }
  },
},

/* Kurir: kardusnya benar-benar menetap — RUANGAN.dusTambahanArsip (0..2) sudah
   ada dan digambar drawArsip, jadi jejaknya permanen tanpa prop baru. */
{
  id: 'kurir-paket-datang',
  kelas: 'latar', bobot: B.sering, cooldown: 540, durasi: 35,
  babak: { malam: 0, libur: 0 },
  syarat: (S) => S.kerjaJam && RUANGAN.dusTambahanArsip < 2,
  mulai(E) {
    E.data.t = { x: -14, y: LANE_DOWN, fase: 'masuk' };
    E.data.a = pemeran(E, ['magang', 'arsiparis']);
    if (E.data.a) {
      E.data.a.doingEvent = 'menerima paket';
      E.data.a.goToXY(30, LANE_DOWN, 'left');
    }
  },
  tick(E, dt) {
    const T = E.data.t, a = E.data.a;
    if (T.fase === 'masuk') {
      T.x = Math.min(14, T.x + 46 * dt);            // berhenti di ambang, tidak masuk jauh
      if (T.x >= 14) T.fase = 'tunggu';
    } else if (T.fase === 'pulang') {
      T.x -= 46 * dt;
    }
    // Tidak ada yang menerima — atau penerimanya keburu ditarik tool call
    // nyata: kurirnya tidak boleh mematung di ambang pintu sampai durasi
    // habis, dia menunggu sebentar lalu pulang sendiri.
    if (!a || a.eventKerja !== E) { if (E.umur > 10 && T.fase === 'tunggu') T.fase = 'pulang'; return; }
    if (T.fase === 'tunggu' && a.diam && !E.data.ttd) {
      E.data.ttd = true;
      a.pose = 'angkat';
      a.say('paketnya atas nama siapa, Bang?');
      E.data.ttdPada = E.umur + 5;                  // tenggat disimpan sekali
    }
    if (E.data.ttdPada && E.umur > E.data.ttdPada && !E.data.bawa) {
      E.data.bawa = true;
      a.pose = null;
      a.bawa = 'boks';
      a.goToXY(54, 138, 'up');                      // ke lemari arsip
      T.fase = 'pulang';
    }
    if (E.data.bawa && a.diam && a.station === 'acara' && a.y < 160 && !E.data.taruh) {
      E.data.taruh = true;
      a.bawa = null;
      RUANGAN.dusTambahanArsip = Math.min(2, RUANGAN.dusTambahanArsip + 1);
      for (let i = 0; i < 3; i++) spawn('dust', 40, 150);
      a.doingEvent = '';
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -12) return;
    gambarOrangLuar(T.x, T.y, '#c26a1e', null, null, '#e07a2c');
    const x = Math.round(T.x), y = Math.round(T.y);
    if (!E.data.bawa) {                             // kardus masih di tangannya
      r(x + 5, y - 20, 10, 8, '#b98d5e');
      r(x + 5, y - 20, 10, 1, '#d9cba8');
      r(x + 9, y - 20, 2, 8, '#e8e0c8');            // lakban
    }
    r(x - 9, y - 16, 5, 7, '#20242c');              // tablet tanda tangan
    r(x - 8, y - 15, 3, 5, '#7aa5e8');
  },
  sortY: 260,
  selesai(E) {
    if (E.data.a) { E.data.a.pose = null; E.data.a.bawa = null; E.data.a.doingEvent = ''; }
  },
},

/* Ojol: kopinya ikut orangnya lewat a.bawa + bawaSampai yang panjang, jadi
   kalau tool call nyata memanggilnya di tengah jalan, gelasnya tetap terbawa
   ke stasiun tujuan — persis detail yang diminta usulannya, dan gratis. */
{
  id: 'ojol-antar-kopi',
  kelas: 'latar', bobot: B.sering, cooldown: 600, durasi: 30,
  syarat: (S) => (S.jam >= 9 && S.jam < 11) || (S.jam >= 14 && S.jam < 16),
  perluAktor: true,
  mulai(E) {
    E.data.t = { x: -14, y: LANE_DOWN, fase: 'masuk' };
    E.data.a = pemeran(E);
    if (E.data.a) {
      E.data.a.doingEvent = 'ambil pesanan ojol';
      E.data.a.laju = 1.3;                          // setengah berlari
      E.data.a.goToXY(28, LANE_DOWN, 'left');
    }
  },
  tick(E, dt) {
    const T = E.data.t, a = E.data.a;
    if (T.fase === 'masuk') {
      T.x = Math.min(12, T.x + 50 * dt);
      if (T.x >= 12) T.fase = 'tunggu';
    } else if (T.fase === 'pulang') {
      T.x -= 50 * dt;
    }
    // kalau dia ditarik tool call di tengah jalan, kopinya memang ikut
    // (a.bawa + bawaSampai), tapi event ini berhenti menyuruhnya
    if (!a || a.eventKerja !== E) return;
    if (T.fase === 'tunggu' && a.diam && !E.data.terima) {
      E.data.terima = true;
      a.say('iya Bang, atas nama saya');
      E.data.terimaPada = E.umur + 4;
    }
    if (E.data.terimaPada && E.umur > E.data.terimaPada && !E.data.pegang) {
      E.data.pegang = true;
      a.bawa = 'gelas';
      a.bawaSampai = now + 120000;                  // kopinya ikut ke mana pun dia dipanggil
      a.laju = 1;
      a.doingEvent = '';
      T.fase = 'pulang';
      a.goTo(stasiunPulang(a));
      spawn('steam', a.x + 8, a.y - 20);
    }
    if (E.data.pegang && Math.random() < 0.4 * dt) spawn('steam', a.x + 8, a.y - 20);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -12) return;
    gambarOrangLuar(T.x, T.y, '#2f7a4a', null, null, '#1d5c36');
    const x = Math.round(T.x), y = Math.round(T.y);
    r(x - 2, y - 22, 5, 4, '#20242c');              // helm masih dipakai
    if (!E.data.pegang) {
      r(x + 5, y - 17, 6, 7, '#e8ece8');            // kantong plastik dua gelas
      r(x + 6, y - 15, 1, 4, '#c9a05a');
      r(x + 8, y - 15, 1, 4, '#c9a05a');
    }
  },
  sortY: 259,
  selesai(E) {
    if (E.data.a) { E.data.a.laju = 1; E.data.a.doingEvent = ''; }
  },
},

/* Satpam: keliling lengkap lewat dua lajur. Bagian usulan "mematikan satu
   neon sampai pagi" SENGAJA dibuang — itu butuh padamnya bertahan lewat batas
   hidup event, sementara MOD.neonMati direset tiap frame; menaruhnya di
   RUANGAN berarti ruangan bisa gelap separuh selamanya kalau eventnya batal
   di tengah. Senternya cuma muncul saat gelap, di mana ia memang terbaca. */
{
  id: 'satpam-patroli',
  kelas: 'latar', bobot: B.sering, cooldown: 480, durasi: 40,
  babak: { malam: 2.5, lembur: 2, apel: 0.5 },
  mulai(E) {
    E.data.t = { x: -14, y: LANE_DOWN, fase: 'masuk', hadap: 'right' };
  },
  tick(E, dt, S) {
    const T = E.data.t;
    if (T.fase === 'masuk') {
      T.x = Math.min(LANE_R, T.x + 44 * dt);
      T.hadap = 'right';
      if (T.x >= LANE_R) { T.fase = 'naik'; }
    } else if (T.fase === 'naik') {
      T.y = Math.max(LANE_UP, T.y - 44 * dt);
      T.hadap = 'up';
      if (T.y <= LANE_UP) { T.fase = 'pintu'; T.pintuPada = E.umur; }
    } else if (T.fase === 'pintu') {
      T.x = Math.min(438, T.x + 44 * dt);
      T.hadap = 'right';
      // memutar gagang pintu kadis: pintunya bergetar, jadi ada akibat
      if (T.x >= 438) {
        MOD.pintuKadis = E.umur % 0.4 < 0.2;
        if (E.umur - T.pintuPada > 5) T.fase = 'susur';
      }
    } else if (T.fase === 'susur') {
      T.x -= 44 * dt;
      T.hadap = 'left';
      if (T.x < -12) T.fase = 'selesai';
    }

    // yang dilewati mengangguk; satpam berhenti kalau ada yang masih di pantry
    if (T.fase === 'susur' || T.fase === 'masuk') {
      for (const o of S.orang) {
        if (o.adaTugas || o.path.length) continue;
        if (Math.abs(o.x - T.x) < 20 && Math.abs(o.y - T.y) < 26) {
          // "mengangguk" tidak dibuat-buat jadi field baru yang tidak ada
          // penggambarnya: cukup dia menoleh ke satpam dan tertahan sekejap
          hadapkan(o, T.x, T.y);
          o.busyUntil = Math.max(o.busyUntil, now + 400);
        }
      }
    }
    if (!E.data.tegur && T.fase === 'masuk' && T.x > 380) {
      const lembur = S.orang.find((o) => o.station === 'idle' && o.diam);
      if (lembur) { E.data.tegur = true; lembur.say('masih lembur, Pak?'); }
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.fase === 'selesai' || T.x < -12) return;
    gambarOrangLuar(T.x, T.y, '#2b3f6b', null, null, '#1c2a48');
    const x = Math.round(T.x), y = Math.round(T.y);
    r(x - 4, y - 24, 8, 2, '#16213a');              // topi
    r(x - 5, y - 22, 10, 1, '#16213a');
    r(x + 5, y - 14, 3, 2, '#c9ced4');              // senter
  },
  gambarLantai(E) {
    const T = E.data.t;
    const A = ambien();
    if (!T || A.lampu < 0.45 || T.fase === 'selesai') return;
    const arah = T.hadap === 'left' ? -1 : 1;
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    ctx.moveTo(T.x + arah * 5, T.y - 12);
    ctx.lineTo(T.x + arah * 26, T.y - 4);
    ctx.lineTo(T.x + arah * 26, T.y + 8);
    ctx.closePath();
    ctx.fillStyle = '#ffe9b0'; ctx.fill();
    ctx.globalAlpha = 1;
  },
  sortY: 261,
},

/* Senja: bayangan orang saja. Usulan aslinya juga mau prop tinggi ikut
   berbayang, tapi PROPS cuma {sortY, station, draw} — tidak ada geometri yang
   bisa dibaca, jadi itu butuh mendata ulang posisi+tinggi setiap prop. Yang
   dikerjakan di sini bagian yang paling terbaca: bayangan yang ikut menyapu
   waktu orangnya jalan. */
{
  id: 'senja-bayangan-panjang',
  kelas: 'latar', bobot: B.sering, cooldown: 5400, durasi: 90,
  syarat: (S) => S.jam >= 17.2 && S.jam < 18.4 && S.luar > 0.15,
  // TANPA perluAktor: bayangannya sendiri yang jadi acara; pegawai yang
  // merentangkan lengan cuma bonus kalau memang ada yang menganggur
  mulai(E) {
    E.data.a = pemeran(E);
    if (E.data.a) {
      E.data.a.doingEvent = 'berdiri di berkas senja';
      E.data.a.goToXY(214, 196, 'up');
    }
  },
  tick(E) {
    // naik 0->1 dalam 6 detik, turun lagi di 8 detik terakhir
    const naik = Math.min(1, E.umur / 6);
    const turun = Math.min(1, Math.max(0, (90 - E.umur) / 8));
    MOD.bayangPanjang = Math.min(naik, turun);
    const a = E.data.a;
    if (a && a.eventKerja === E && a.diam && !E.data.rentang) {
      E.data.rentang = true;
      a.pose = 'duaangkat';
      E.data.rentangPada = E.umur + 3;
    }
    if (E.data.rentangPada && E.umur > E.data.rentangPada && E.data.a && E.data.a.pose) {
      E.data.a.pose = null;
      E.data.a.doingEvent = '';
    }
  },
  selesai(E) {
    if (E.data.a) { E.data.a.pose = null; E.data.a.doingEvent = ''; }
  },
},

);

/* ==========================================================================
   GELOMBANG 3 — lanjutan: angin, kecoa, halusinasi nomor surat, iuran, pers
   ==========================================================================
   Keluhan yang sama muncul di catatan kelima usulan di bawah: "butuh antrean
   tujuan per-agen, karena path habis langsung memanggil arrive()". Antrean itu
   memang masih belum ada — tapi tidak dibutuhkan: perjalanan banyak-perhentian
   di sini dijalankan sebagai tahap bernomor di E.data yang maju begitu
   a.diam, pola yang sudah dipakai kasi-inspeksi-meja-staf dan
   edar-amplop-patungan. Jadi kelimanya turun dari K4 ke K2-K3 tanpa menyentuh
   Agent.update sama sekali.
   ========================================================================== */

daftarEvent(

{
  id: 'angin-kencang-gorden',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 25,
  syarat: (S) => S.luar > 0.3,
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeran(E);
    // tiga titik pendaratan tetap di lajur atas, kiri meja printer
    E.data.titik = [[168, 176], [140, 186], [196, 182]];
    E.data.tahap = -1;
    for (let i = 0; i < 10; i++) spawn('lembar', 212, 84);
  },
  tick(E) {
    if (E.umur < 6) MOD.gordenLepas = true;      // gorden terangkat, ditulis tiap frame
    if (E.umur < 5) MOD.kipas = 1.6;
    const a = E.data.a;
    // berhenti menyuruh begitu pinjamannya dilepas (tool call nyata menariknya)
    if (!a || a.eventKerja !== E) return;
    // mulai memungut: satu titik per perhentian, maju begitu sudah sampai
    if (E.data.tahap < 0) {
      pada(E, 2, () => {
        E.data.tahap = 0;
        a.say('aduh, berkasnya!');
        a.doingEvent = 'memungut berkas';
        a.goToXY(E.data.titik[0][0], E.data.titik[0][1], 'up');
      });
      return;
    }
    if (a.diam && !E.data.jongkokPada) {
      E.data.jongkokPada = E.umur + 0.8;
      a.pose = 'jongkok';
      for (let i = 0; i < 2; i++) spawn('dust', a.x, a.y);
    }
    if (E.data.jongkokPada && E.umur > E.data.jongkokPada) {
      E.data.jongkokPada = 0;
      a.pose = null;
      E.data.tahap++;
      if (E.data.tahap < E.data.titik.length) {
        const [tx, ty] = E.data.titik[E.data.tahap];
        a.goToXY(tx, ty, 'up');
      } else if (!E.data.pulang) {
        E.data.pulang = true;
        a.bawa = 'kertas';
        a.doingEvent = '';
        a.goTo('web');
      }
    }
  },
  gambarLantai(E) {
    // lembar yang masih tergeletak: hilang satu-satu mengikuti tahap pemungutan
    if (E.data.tahap == null) return;
    for (let i = Math.max(0, E.data.tahap); i < E.data.titik.length; i++) {
      const [x, y] = E.data.titik[i];
      r(x, y, 2, 2, '#f4f2ea');
    }
  },
  selesai(E) {
    if (E.data.a) { E.data.a.pose = null; E.data.a.bawa = null; E.data.a.doingEvent = ''; }
  },
},

{
  id: 'kecoa-terbang-heboh',
  kelas: 'panggung', bobot: B.jarang, cooldown: 2100, durasi: 22,
  syarat: (S) => S.orang.length >= 3,
  mulai(E, S) {
    E.data.k = { x: 440, y: 236, fase: 'lari', t: 0, terbang: 0 };
    // dua yang terdekat panik ke lajur seberang
    const dekat = S.orang.filter((o) => bisaDipinjam(o)).slice(0, 2);
    E.data.panik = dekat;
    E.data.asal = dekat.map((o) => o.station);
    dekat.forEach((o, i) => {
      o.eventKerja = E; o.betahAsli = o.betah; o.betah = true; E.aktor.push(o);
      o.laju = 2;
      o.doingEvent = 'menghindar';
      o.goToXY(120 + i * 26, o.y > 200 ? LANE_UP : LANE_DOWN, 'down');
    });
    E.data.sapu = pemeran(E, ['teknisi', 'pranata_muda']);
    if (E.data.sapu) {
      E.data.sapu.bawa = 'sapu';
      E.data.sapu.doingEvent = 'mengusir kecoa';
      E.data.sapu.goToXY(400, 240, 'right');
    }
  },
  tick(E, dt) {
    const K = E.data.k;
    K.t += dt;
    if (K.fase === 'lari') {
      K.x -= 46 * dt;
      if (K.t > 1.2) { K.fase = 'terbang'; K.t = 0; }
    } else if (K.fase === 'terbang') {
      K.x -= 70 * dt;
      K.y = 236 - Math.sin(Math.min(1, K.t / 1.6) * Math.PI) * 34;
      if (K.t > 1.6) { K.fase = 'lari'; K.t = 0; K.terbang++; K.y = 236; }
    }
    if (K.terbang >= 3 && K.fase === 'lari' && K.x < 150) K.fase = 'sembunyi';

    const s = E.data.sapu;
    if (s && s.diam && !E.data.tenang) {
      E.data.tenang = true;
      s.say('sudah, sudah');
      s.pose = 'angkat';
    }
    // Yang panik dipulangkan ke stasiun asalnya. Penjaga eventKerja === E itu
    // wajib: E.data.panik cuma potret waktu mulai(), sedangkan tool call nyata
    // bisa menarik salah satunya di tengah jalan lewat lepasDariEvent(). Tanpa
    // penjaga ini kita merebut kembali pegawai yang sudah punya tugas sungguhan.
    pada(E, 17, () => {
      E.data.panik.forEach((o, i) => {
        if (o.eventKerja !== E) return;
        o.laju = 1; o.doingEvent = '';
        o.goTo(E.data.asal[i] || 'think');
      });
    });
  },
  gambarLantai(E) {
    const K = E.data.k;
    if (!K || K.fase === 'sembunyi' || K.x < 20) return;
    const x = Math.round(K.x), y = Math.round(K.y);
    r(x, y, 4, 2, '#3a2a18');
    r(x - 1, y, 1, 1, '#241a10');
    if (K.fase === 'terbang') {                    // sayap bergetar
      const g = Math.sin(now / 40) > 0 ? 1 : 0;
      r(x, y - 1 - g, 4, 1, '#6b5030');
    }
  },
  selesai(E) {
    for (const o of E.aktor) { o.laju = 1; o.pose = null; o.doingEvent = ''; }
    if (E.data.sapu) E.data.sapu.bawa = null;
  },
},

{
  id: 'nomor-surat-karangan',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 15,
  syarat: (S) => S.orang.filter((o) => o.station !== 'rapat').length >= 2,
  perluAktor: true,
  mulai(E) {
    E.data.cap = pemeranStasiun(E, 'edit') || pemeran(E);
    E.data.arsip = pemeran(E, ['arsiparis']);
    if (E.data.cap) E.data.cap.doingEvent = 'menomori surat';
  },
  tick(E) {
    const c = E.data.cap, ar = E.data.arsip;
    if (!c || c.eventKerja !== E) return;     // pengecap ditarik tool call nyata
    // tiga hantaman mantap, ritme cepat — yakin betul, isinya ngawur
    pada(E, 1, () => { hentakkanStempel(c); c.say('No. 421/XX/2026 — pokoknya ada, saya yakin'); });
    pada(E, 1.5, () => hentakkanStempel(c));
    pada(E, 2, () => hentakkanStempel(c));
    if (ar) {
      pada(E, 2.4, () => { ar.pose = 'angkat'; E.data.tanya = true; });
      pada(E, 5, () => { E.data.tanya = false; });
    }
    pada(E, 5.5, () => { c.doingEvent = 'mengecek nomor ke arsip'; c.goTo('read'); });
    if (E.umur > 6 && c.diam && c.station === 'read' && !E.data.tukar) {
      E.data.tukar = true;
      for (let i = 0; i < 3; i++) spawn('paper', c.x, c.y - 20);
      if (ar) ar.pose = null;
      E.data.tukarPada = E.umur + 2;
    }
    if (E.data.tukarPada && E.umur > E.data.tukarPada && !E.data.balik) {
      E.data.balik = true;
      c.doingEvent = 'mengecap ulang';
      c.goTo('edit');
    }
    if (E.data.balik && c.diam && c.station === 'edit' && !E.data.ulang) {
      E.data.ulang = true;
      hentakkanStempel(c);          // sekali saja, pelan
    }
  },
  gambarAtas(E) {
    if (!E.data.tanya || !E.data.arsip) return;
    const a = E.data.arsip;
    r(Math.round(a.x) + 3, Math.round(a.y) - 36, 3, 5, '#ffb454');
  },
  selesai(E) {
    if (E.data.arsip) E.data.arsip.pose = null;
    if (E.data.cap) E.data.cap.doingEvent = '';
  },
},

{
  id: 'kotak-dana-sosial-keliling',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 30,
  syarat: (S) => S.orang.filter((o) => o.station === 'think').length >= 3
    && !S.orang.some((o) => o.station === 'rapat'),
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeran(E, ['humas']);
    if (!E.data.a) return;
    E.data.a.doingEvent = 'mengedarkan kotak dana sosial';
    E.data.a.say('iuran duka, seikhlasnya');
    E.data.isi = 0;
    E.data.tahap = 0;
    E.data.a.goToXY(MEJA_KERJA_X[0] + 8, 336, 'down');
  },
  tick(E, dt, S) {
    const a = E.data.a;
    if (!a || a.eventKerja !== E) return;     // pembawa kotak ditarik tool call
    if (a.diam && !E.data.tungguPada) E.data.tungguPada = E.umur + 3;
    if (E.data.tungguPada && E.umur > E.data.tungguPada) {
      E.data.tungguPada = 0;
      // yang duduk di meja ini menyumbang — kecuali yang sedang bekerja
      const meja = MEJA_KERJA_X[E.data.tahap];
      const penghuniMeja = S.orang.find((o) => o.station === 'think' && Math.abs(o.x - meja) < 16);
      if (penghuniMeja && penghuniMeja.state === 'work') {
        a.say('nanti saja ya');
      } else if (penghuniMeja) {
        E.data.isi = Math.min(5, E.data.isi + 1);
        spawn('paper', penghuniMeja.x, penghuniMeja.y - 22);
        spawn('paper', penghuniMeja.x + 3, penghuniMeja.y - 22);
      }
      E.data.tahap++;
      if (E.data.tahap < MEJA_KERJA_X.length) {
        a.goToXY(MEJA_KERJA_X[E.data.tahap] + 8, 336, 'down');
      } else if (!E.data.taruh) {
        E.data.taruh = true;
        a.doingEvent = '';
        a.goToXY(246, 236, 'up');       // kotaknya ditaruh di tepi meja rapat
      }
    }
  },
  gambarProp(E) {
    const a = E.data.a;
    if (!a) return;
    const x = Math.round(E.data.taruh ? 240 : a.x + 6);
    const y = Math.round(E.data.taruh ? 232 : a.y - 20);
    r(x, y, 8, 6, '#8a6844');
    r(x, y, 8, 1, '#a5804f');
    r(x + 3, y - 1, 3, 1, '#3a2a18');             // celah masuk
    for (let i = 0; i < (E.data.isi || 0); i++) r(x + 1, y + 4 - i, 6, 1, P.paper);
  },
  sortY: 349,
  selesai(E) { if (E.data.a) E.data.a.doingEvent = ''; },
},

{
  id: 'wartawan-motret',
  kelas: 'panggung', bobot: B.jarang, cooldown: 2400, durasi: 45,
  syarat: (S) => S.jam >= 9 && S.jam < 15 && S.orang.length >= 4,
  perluAktor: true,
  mulai(E) {
    E.data.t = { x: -14, y: LANE_DOWN, fase: 'masuk' };
    E.data.baris = pinjamAktor(E, 4);
    E.data.asal = E.data.baris.map((o) => o.station);
    E.data.baris.forEach((o, i) => {
      o.doingEvent = 'difoto wartawan';
      o.goToXY(34 + i * 16, 232, 'down');
    });
    if (E.data.baris[0]) E.data.baris[0].say('rapiin krahnya');
  },
  tick(E, dt) {
    const T = E.data.t;
    if (T.fase === 'masuk') {
      T.x = Math.min(70, T.x + 46 * dt);
      if (T.x >= 70) T.fase = 'motret';
    } else if (T.fase === 'pulang') {
      T.x -= 46 * dt;
    }
    // merapikan seragam sebentar, lalu berdiri kaku menghadap kamera.
    // milik(o) menyaring pemeran yang sudah ditarik tool call nyata di tengah
    // sesi foto: E.data.baris cuma potret waktu mulai(), sementara
    // lepasDariEvent() bisa melepas siapa pun kapan saja.
    const milik = (o) => o.eventKerja === E;
    pada(E, 6, () => { for (const o of E.data.baris.filter(milik)) o.pose = 'usap'; });
    pada(E, 8, () => { for (const o of E.data.baris.filter(milik)) o.pose = 'silang'; });
    // tiga jepretan berjarak 6 detik — waktunya disimpan buat kilatan
    for (const t of [12, 18, 24]) pada(E, t, () => { E.data.jepretPada = E.umur; });
    pada(E, 28, () => {
      T.fase = 'pulang';
      E.data.baris.forEach((o, i) => {
        if (o.eventKerja !== E) return;
        o.pose = null; o.doingEvent = '';
        o.goTo(E.data.asal[i] || 'think');
      });
    });
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -12) return;
    gambarOrangLuar(T.x, T.y, '#7a6a4a', null, null, '#4a3f2a');
    const x = Math.round(T.x), y = Math.round(T.y);
    r(x - 2, y - 20, 6, 4, '#20242c');            // kamera
    r(x + 4, y - 19, 2, 2, '#5a6068');            // lensa
  },
  gambarAtas(E) {
    // kilatan: putih penuh yang turun cepat, jalur yang sama dengan kilat
    const j = E.data.jepretPada;
    if (j == null) return;
    const t = E.umur - j;
    if (t < 0 || t > 0.25) return;
    ctx.globalAlpha = 0.55 * (1 - t / 0.25);
    r(0, 0, W, H, '#ffffff');
    ctx.globalAlpha = 1;
  },
  sortY: 258,
  selesai(E) {
    for (const o of (E.data.baris || [])) { o.pose = null; o.doingEvent = ''; }
  },
},

);

/* Terakhir dari kelompok ini, dan satu-satunya yang benar-benar terkunci sejak
   awal: katalog memvonisnya "layak-dengan-catatan" dengan alasan tepat — tidak
   ada kacamata di drawHead sama sekali, jadi tidak ada yang bisa dilepas.
   Sekarang kacamata jadi atribut jabatan (pal.kacamata di JABATAN: auditor,
   statistisi, analis sistem, analis kebijakan) dan drawHead membacanya, jadi
   eventnya tinggal menyalakan a.kacamataLepas sebentar. */
daftarEvent(

{
  id: 'lap-kacamata-di-ujung-baju',
  kelas: 'latar', bobot: B.jarang, cooldown: 420, durasi: 4,
  perluAktor: true,
  syarat: (S) => S.orang.some((o) => o.pal && o.pal.kacamata && bisaDipinjam(o)),
  mulai(E) {
    const a = pemeran(E, ['auditor', 'statistisi', 'analis_sistem', 'analis_kebijakan']);
    // pemeran() jatuh ke siapa saja kalau perannya tidak ada — di sini itu
    // tidak boleh: yang tidak berkacamata tidak punya apa-apa untuk dilap.
    if (!a || !a.pal.kacamata) { E.selesaiCepat = true; return; }
    E.data.a = a;
    a.doingEvent = 'melap kacamata';
    a.kacamataLepas = true;
    a.pose = 'usap';
  },
  tick(E) {
    const a = E.data.a;
    if (!masihMain(E, a)) return;
    // dipakai lagi, lalu melangkah lebih mantap: sisa event dia berhenti
    // memicing dan langsung lanjut ke tujuannya
    pada(E, 2.6, () => {
      if (!masihMain(E, a)) return;
      a.kacamataLepas = false;
      a.pose = null;
      E.data.kilau = E.umur;
    });
  },
  gambarAtas(E) {
    // satu frame kilau putih di lensa waktu dipakai lagi — r(), bukan partikel
    const a = E.data.a;
    if (!a || E.data.kilau == null || E.umur - E.data.kilau > 0.12) return;
    r(Math.round(a.x) - 3, Math.round(a.y) - 27, 6, 1, '#ffffff');
  },
  selesai(E) {
    const a = E.data.a;
    if (a) { a.kacamataLepas = false; a.pose = null; a.doingEvent = ''; }
  },
},

);
