/* ==========================================================================
   GELOMBANG 5 — pojok baca yang baru, dan empat sisa katalog yang akhirnya
   bisa dikerjakan
   ==========================================================================
   EMPAT EVENT PERTAMA memakai perabot yang baru lahir hari ini: POJOK BACA di
   pojok kanan lantai (`BACA` di room.js, x582..670 y172..248 — rak buku
   rendah, rak koran, karpet, meja lesehan, tiga bantal duduk). Perabot baru
   selalu meninggalkan lubang yang sama: dia bisa dilihat dan bisa diklik,
   tapi tidak pernah TERJADI apa-apa di situ selain satu rutinitas standby
   yang itu-itu saja. Empat event ini yang mengisinya — korannya diganti tiap
   pagi, bukunya didiskusikan, ada yang ketiduran di atas bantal, dan raknya
   sesekali dilap.

   Bantalnya DIPESAN lewat mesin yang sudah ada (`bacaTempati`/`bacaLepas` di
   room.js), bukan lewat koordinat yang ditulis ulang di sini. Kalau tidak,
   event dan rutinitas standby akan menaruh dua orang di bantal yang sama dan
   yang kedua berdiri menembus yang pertama. Konsekuensinya satu kewajiban:
   siapa pun yang memesan WAJIB melepas di `selesai()`. Pemeran yang direbut
   tool call sungguhan memang dilepas `destroy()` di room.js, tapi event yang
   berakhir normal tidak punya siapa pun yang membereskannya selain dirinya
   sendiri — dan bantal yang bocor satu kali tidak pernah bisa dipakai lagi
   sampai halamannya dimuat ulang.

   EMPAT SISANYA dari katalog rancangan (event-acak.json), dan tiga di
   antaranya divonis "mahal" di rapat karena menuntut mesin yang waktu itu
   belum ada. Sekarang ada semua, dan ketiganya dipangkas di tempat yang sama:
   benda yang menurut rancangan harus PERMANEN digambar event ini sendiri dan
   hilang begitu eventnya selesai. Alasannya sama dengan `dus-kiriman-datang`
   di berkas 04: prop permanen berarti `RUANGAN.*` baru + entri `PROPS` baru +
   ikut golden z-order, untuk benda yang munculnya sesekali.

   * `mcb-jalur-turun` (vonis "layak", kerumitan 3) — rancangan menaruh panel
     MCB di x=414 y=76. Kolom itu SEKARANG TIDAK KOSONG: sapuan piksel
     (PROPS + drawWall keempat tema + seluruh hook gambar registri event)
     memberikannya ke rangka luar rak PC server (`drawServer`, sampai x=418)
     dan ke ekor `kabel-lan-lepas` di x=417. Persegi kosong terdekat yang
     muat 18x22 mulai di x=420, jadi panelnya berdiri di 422..436 y74..92 —
     nol piksel milik perabot lama.
   * `rapat-molor-kopi-masuk` — `rapatAktif` (room.js) yang dulu belum ada
     sekarang menyimpan `sejak` dan `anggota`, jadi "rapat yang sudah lewat
     empat menit dengan tiga orang duduk" bisa ditanyakan apa adanya.
   * `jatah-kuota-cair` — rancangan memasukkan CARAKA dari luar gedung. Yang
     dipakai di sini pegawai sendiri mengambil rim kertas dari GUDANG ATK
     (pintunya sudah ada sejak gelombang lalu): satu sosok luar baru cuma
     untuk mengantar kertas tidak sepadan, sedangkan gudangnya justru memang
     tempat kertas disimpan. Kausalitasnya tetap seperti rancangan — dia
     menyala sebagai `lanjutan` milik `kuota-fotokopi-habis` (berkas 29),
     BUKAN undian sendiri, makanya `bobot: 0`.
   * `foto-bersama` — rancangan membariskan semua orang DI ATAS karpet merah
     (y240/250). Karpet itu ditempati meja rapat beserta sembilan kursinya;
     `senam-jumat` (berkas 04) sudah membuktikan lantai depan meja rapat muat
     formasi grid, jadi safnya ditaruh di situ.
   ========================================================================== */

daftarEvent(

/* --------------------------------------------------------- pojok baca --- */

/* Koran pagi. Dua kaki, bukan satu: pasang yang baru DAN buang yang kemarin.
   Kaki kedua itu yang membuatnya terbaca sebagai kebiasaan kantor, bukan
   sebagai animasi — rak koran yang isinya bertambah tanpa pernah berkurang
   adalah rak yang tidak ada yang mengurusnya. */
{
  id: 'koran-pagi-di-rak-baca',
  kelas: 'latar', bobot: B.sedang, cooldown: 1800, durasi: 40,
  sfx: 'kertas',          // koran dicabut dari jepitan; tebakan selaras-suara jatuh ke 'langkah'
  babak: { kerja: 1.6, apel: 0, istirahat: 0.3, pulang: 0, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 7 && S.jam < 10 && S.orang.some((o) => bisaDipinjam(o)),
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, 654, 196);
    if (!a) return;
    E.data.a = a;
    E.data.tahap = 0;
    a.doingEvent = 'memasang koran hari ini';
    a.goToXY(654, 196, 'up');            // berdiri di karpet, menghadap rak koran
  },
  tick(E) {
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (!a) { E.selesaiCepat = true; return; }      // direbut tool call: tidak ada yang menggantikan
    if (!a.diam) return;
    if (E.data.tahap === 0) {
      E.data.tahap = 1;
      E.data.lanjutPada = E.umur + 3;    // tenggat disimpan SEKALI, lihat catatan pada() di berkas 29
      a.say('koran hari ini sudah datang');
      for (let i = 0; i < 3; i++) spawn('paper', 654, 184);
      a.bawa = 'kertas';                 // edisi kemarin, dicabut dari jepitan
    } else if (E.data.tahap === 1 && E.umur > E.data.lanjutPada) {
      E.data.tahap = 2;
      a.doingEvent = 'buang koran kemarin';
      a.goToXY(pantriX(439), 272, 'up');  // tong sampah pantri
    } else if (E.data.tahap === 2) {
      E.data.tahap = 3;
      E.data.lanjutPada = E.umur + 2;
      spawn('lempar', a.x, a.y - 14);
      a.bawa = null;
    } else if (E.data.tahap === 3 && E.umur > E.data.lanjutPada) {
      E.selesaiCepat = true;
    }
  },
  selesai(E) { if (E.data.a) { E.data.a.bawa = null; E.data.a.bawaSampai = 0; } },
},

/* Dua orang duduk di bantal sebelahan membahas bacaan yang sama. Sengaja
   BUKAN "ngobrol di pojok": yang dibicarakan isi buku, dan kalimatnya
   kalimat kantor — perda retribusi, bukan gosip mutasi (itu sudah punya
   `ngerumpi-di-pantry`). */
{
  id: 'diskusi-buku-di-pojok-baca',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 48,
  babak: { kerja: 1.2, istirahat: 1.8, apel: 0, malam: 0.2, libur: 0 },
  syarat: (S) => S.orang.filter((o) => bisaDipinjam(o)).length >= 2 && bacaSlotBebas() >= 0,
  perluAktor: true,
  mulai(E) {
    E.data.duduk = [];
    for (const o of pinjamAktor(E, 2)) {
      const t = bacaTempati(o);
      if (!t) continue;                  // bantalnya keburu dipakai standby
      o.doingEvent = 'diskusi bacaan di pojok baca';
      o.goToXY(t.x, t.y, 'up');
      E.data.duduk.push(o);
    }
    if (E.data.duduk.length < 2) E.selesaiCepat = true;   // satu orang bukan diskusi
  },
  tick(E) {
    const duduk = yangMasihMain(E, E.data.duduk);
    if (duduk.length < 2) { E.selesaiCepat = true; return; }
    for (const o of duduk) {
      if (!o.diam) continue;
      o.pose = 'dudukLantai';
      if (!o.bawa) o.bawa = 'buku';
    }
    pada(E, 9, () => { const o = yangMasihMain(E, E.data.duduk)[0]; if (o) o.say('ini yang dicari Bu Kasi kemarin'); });
    pada(E, 16, () => { const o = yangMasihMain(E, E.data.duduk)[1]; if (o) o.say('halaman 40-an, yang soal retribusi'); });
    pada(E, 26, () => { const o = yangMasihMain(E, E.data.duduk)[0]; if (o) o.say('difotokopi dulu satu bab, boleh?'); });
    pada(E, 34, () => { E.selesaiCepat = true; });
  },
  selesai(E) {
    for (const o of (E.data.duduk || [])) {
      o.pose = null; o.bawa = null; o.bawaSampai = 0;
      bacaLepas(o);                      // bantalnya dikembalikan, apa pun sebab berhentinya
    }
  },
},

/* Sesudah makan siang, satu orang ketiduran di atas bukunya. Partikel
   'kantuk' yang sudah ada (kotak naik miring, bukan asap) jadi zzz-nya, dan
   yang membangunkan datang belakangan — itu yang bikin adegannya punya
   akhir, bukan cuma pose diam yang lama-lama jadi aneh. */
{
  id: 'ketiduran-di-pojok-baca',
  kelas: 'latar', bobot: B.jarang, cooldown: 2400, durasi: 46,
  sfx: 'sunyi',
  babak: { istirahat: 2.5, kerja: 0.6, apel: 0, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 12.5 && S.jam < 15
    && S.orang.filter((o) => bisaDipinjam(o)).length >= 2 && bacaSlotBebas() >= 0,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1)[0];
    if (!a) return;
    const t = bacaTempati(a);
    if (!t) { E.selesaiCepat = true; return; }
    E.data.a = a;
    a.doingEvent = 'baca sesudah makan siang';
    a.bawa = 'buku';
    a.goToXY(t.x, t.y, 'up');
  },
  tick(E, dt) {
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (!a) { E.selesaiCepat = true; return; }
    if (a.diam) {
      a.pose = E.data.bangun ? null : 'ngantuk';
      if (!E.data.bangun && Math.random() < 0.8 * dt) spawn('kantuk', a.x + 6, a.y - 26);
    }
    pada(E, 16, () => {
      const b = pinjamAktor(E, 1)[0];
      if (!b) { E.data.bangun = true; return; }     // tidak ada yang membangunkan: bangun sendiri
      E.data.b = b;
      b.doingEvent = 'membangunkan yang ketiduran';
      b.goToXY(Math.min(664, (E.data.a ? E.data.a.x : 622) + 18), 240, 'left');
    });
    const b = masihMain(E, E.data.b) ? E.data.b : null;
    if (b && b.diam && !E.data.bangun) {
      E.data.bangun = true;
      b.say('Pak, sudah jam dua');
      a.bawa = null;
      E.data.bubarPada = E.umur + 3;
    }
    if (E.data.bubarPada && E.umur > E.data.bubarPada) E.selesaiCepat = true;
  },
  selesai(E) {
    const a = E.data.a;
    if (a) { a.pose = null; a.bawa = null; a.bawaSampai = 0; bacaLepas(a); }
    if (E.data.b) E.data.b.pose = null;
  },
},

/* Rak buku dilap. Satu orang, satu lap, satu kalimat — event paling kecil di
   berkas ini, dan memang harus begitu: yang bikin sudut ruangan terasa dipakai
   bukan kejadian besar, tapi kejadian kecil yang berulang. */
{
  id: 'rak-buku-berdebu-dilap',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 34,
  babak: { kerja: 1.2, apel: 0, malam: 0.3, libur: 0 },
  syarat: (S) => S.jam >= 7 && S.jam < 16 && S.orang.some((o) => bisaDipinjam(o)),
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, 606, 196);
    if (!a) return;
    E.data.a = a;
    a.doingEvent = 'mengelap rak buku';
    a.bawa = 'lap';
    a.goToXY(606, 196, 'up');
  },
  tick(E, dt) {
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (!a) { E.selesaiCepat = true; return; }
    if (a.diam) {
      a.pose = 'lap';
      if (Math.random() < 1.6 * dt) spawn('dust', 596 + Math.random() * 28, 182);
    }
    pada(E, 12, () => { const o = masihMain(E, E.data.a) ? E.data.a : null; if (o) o.say('debunya setebal ini, Bu'); });
    pada(E, 20, () => {
      const o = masihMain(E, E.data.a) ? E.data.a : null;
      if (o) { o.pose = null; o.bawa = null; }
      E.selesaiCepat = true;
    });
  },
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.bawa = null; E.data.a.bawaSampai = 0; } },
},

/* ------------------------------------------------- sisa katalog rapat --- */

/* MCB satu jalur turun. Bedanya dengan `neon-sebelah-mati` (berkas 10) bukan
   jumlah tabungnya, tapi SEBAB dan AKIBATNYA: yang itu satu tabung mati dan
   orangnya cuma melapor supaya dicatat, yang ini satu JALUR turun (dua tabung
   sisi timur sekaligus) dan ada yang benar-benar menaikkannya lagi. Karena
   dua-duanya memadamkan tabung yang sama, keduanya bentrok. */
{
  id: 'mcb-jalur-turun',
  kelas: 'panggung', bobot: B.jarang, cooldown: 900, durasi: 28,
  sfx: 'padam',
  bentrokDengan: ['neon-sebelah-mati', 'mati-lampu-sekejap', 'kedipan-listrik'],
  syarat: (S) => S.lampu > 0.3,
  mulai(E) { E.data.turun = true; },
  tick(E) {
    /* Ditulis tiap frame selama turun, dan TIDAK pernah ditulis `0` waktu
       sudah naik: MOD direset tiap frame, jadi menulis nol cuma akan
       membanting tabung yang sedang ditahan padam event tetangga. */
    if (E.data.turun) { MOD.neonMati[1] = 1; MOD.neonMati[2] = 1; }
    pada(E, 2.5, () => {
      const a = pemeranDekat(E, 428, 164, 260);
      if (!a) return;                              // tidak ada yang bisa dipinjam: jalurnya baru pulih waktu durasinya habis
      E.data.a = a;
      a.doingEvent = 'menaikkan MCB jalur timur';
      a.goToXY(428, 152, 'up');
    });
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (a && a.diam && E.data.turun) {
      if (E.data.raihPada == null) E.data.raihPada = E.umur + 2;   // meraih panel dulu, bukan langsung naik
      a.pose = 'angkat';
      if (E.umur > E.data.raihPada) {
        E.data.turun = false;
        a.pose = null;
        a.say('cuma MCB jalur timur, bukan mati lampu');
        E.data.bubarPada = E.umur + 3;
      }
    }
    if (E.data.bubarPada && E.umur > E.data.bubarPada) E.selesaiCepat = true;
  },
  /* Panel 14x18 di x422..436 y74..92 — persegi kosong yang diverifikasi
     sapuan piksel (lihat kepala berkas). Tiga tuas; yang tengah turun 3 px
     dan merah selama jalurnya mati. */
  gambarDinding(E) {
    const x = 422, y = 74;
    r(x, y, 14, 18, '#dfe2e6');
    r(x, y, 14, 1, '#f2f4f6');
    r(x, y + 17, 14, 1, '#b9bfc6');
    r(x + 1, y + 2, 12, 14, '#c9cdd1');
    r(x + 2, y + 3, 10, 1, '#8f979f');              // rel tuas
    for (let i = 0; i < 3; i++) {
      const tx = x + 3 + i * 4;
      const jatuh = i === 1 && E.data.turun;
      r(tx, y + 5 + (jatuh ? 3 : 0), 3, 5, jatuh ? '#c22b2b' : '#3a4048');
      r(tx, y + 5 + (jatuh ? 3 : 0), 3, 1, jatuh ? '#e05a5a' : '#5a626c');
    }
    r(x + 2, y + 13, 10, 3, '#b0b6bd');             // label jalur
    r(x + 3, y + 14, 8, 1, '#7d848c');
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

/* Rapat molor, kopi masuk. Syaratnya membaca rapat SUNGGUHAN (rapatAktif di
   room.js, diisi tool Task/Agent), bukan tebakan jam: kalau tidak ada sesi
   yang sedang rapat, kejadian ini memang tidak masuk akal. */
{
  id: 'rapat-molor-kopi-masuk',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 44,
  sfx: 'denting',        // gelas beradu di nampan, bukan kursi digeser
  syarat: (S) => S.orang.some((o) => bisaDipinjam(o))
    && rapatAktif.some((rp) => (rp.anggota || []).length >= 3 && now - rp.sejak > 240000),
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, pantriX(466), 256);
    if (!a) return;
    E.data.a = a;
    E.data.tahap = 0;
    a.doingEvent = 'ambil kopi buat yang rapat';
    a.goToXY(pantriX(466), 256, 'up');             // dispenser pantri
  },
  tick(E) {
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (!a) { E.selesaiCepat = true; return; }
    if (E.data.tahap >= 2 && Math.random() < 0.05) spawn('steam', 262, 192);
    if (!a.diam) return;
    if (E.data.tahap === 0) {
      E.data.tahap = 1;
      E.data.lanjutPada = E.umur + 3;
      for (let i = 0; i < 3; i++) spawn('steam', a.x, a.y - 20);
      a.bawa = 'gelas';
    } else if (E.data.tahap === 1 && E.umur > E.data.lanjutPada) {
      E.data.tahap = 2;
      a.doingEvent = 'antar kopi ke meja rapat';
      a.goToXY(262, 240, 'up');                    // sisi dekat meja rapat, idiom gorengan-di-meja-rapat
    } else if (E.data.tahap === 2) {
      E.data.tahap = 3;
      E.data.lanjutPada = E.umur + 4;
      a.bawa = null;                               // gelasnya ditaruh: mulai digambar gambarProp
      a.say('kopinya, Pak, sekalian yang di ujung');
      /* Yang duduk rapat cuma MENOLEH — mereka tidak dipinjam event ini, dan
         menulis `hadap` ke orang yang tidak pernah dapat perjalanan baru
         membuat arahnya menempel sampai sesinya berakhir. */
      menoleh(S.orang.filter((o) => o.station === 'rapat'), 262, 196, 1400);
    } else if (E.data.tahap === 3 && E.umur > E.data.lanjutPada) {
      E.data.tahap = 4;
      a.doingEvent = '';
      a.goTo('idle');
      E.data.bubarPada = E.umur + 4;
    } else if (E.data.tahap === 4 && E.data.bubarPada && E.umur > E.data.bubarPada) {
      E.selesaiCepat = true;
    }
  },
  // Nampan gelas di ujung meja rapat, sisi yang tidak dipakai nampan gorengan
  // (236..256): dua gelas kecil beruap.
  gambarProp(E) {
    if ((E.data.tahap || 0) < 3) return;
    r(258, 196, 14, 5, '#c9cdd1');
    r(258, 196, 14, 1, '#eef0f2');
    r(260, 192, 4, 5, '#f2f0e6');
    r(260, 192, 4, 1, '#c9b07a');
    r(266, 192, 4, 5, '#f2f0e6');
    r(266, 192, 4, 1, '#c9b07a');
  },
  sortY: 202,
  selesai(E) { if (E.data.a) { E.data.a.bawa = null; E.data.a.bawaSampai = 0; } },
},

/* Jatah kuota cair — lanjutan `kuota-fotokopi-habis` (berkas 29), bukan
   undian sendiri: `bobot: 0` membuat penjadwal melewatinya (pilihBerbobot
   menyaring bobot 0), sedangkan jalur lanjutan dan `?event=jatah-kuota-cair`
   tetap bisa menyalakannya. Itu yang membuat urutannya selalu benar — kertas
   tidak pernah datang sebelum ada yang kehabisan. */
{
  id: 'jatah-kuota-cair',
  kelas: 'latar', bobot: 0, cooldown: 1200, durasi: 40,
  sfx: 'kertas',
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, GUDANG.titikX, GUDANG.titikY);
    if (!a) return;
    E.data.a = a;
    E.data.tahap = 0;
    a.doingEvent = 'ambil rim kertas di gudang';
    a.goToXY(GUDANG.titikX, GUDANG.titikY, 'up');
  },
  tick(E) {
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (!a) { E.selesaiCepat = true; return; }
    if (!a.diam) return;
    if (E.data.tahap === 0) {
      E.data.tahap = 1;
      E.data.lanjutPada = E.umur + 3;
      a.bawa = 'kardus';                           // rim kertas, dibawa dua tangan
    } else if (E.data.tahap === 1 && E.umur > E.data.lanjutPada) {
      E.data.tahap = 2;
      a.doingEvent = 'isi kertas mesin fotokopi';
      a.goToXY(FOTOKOPI_TITIK.x, FOTOKOPI_TITIK.y, 'up');
    } else if (E.data.tahap === 2) {
      E.data.tahap = 3;
      E.data.lanjutPada = E.umur + 5;
      a.bawa = null;
      a.pose = 'jongkok';                          // menaruh rim di laci bawah mesin
      a.say('jatahnya turun, sudah bisa dipakai lagi');
      for (let i = 0; i < 3; i++) spawn('paper', FOTOKOPI_TITIK.x, FOTOKOPI_TITIK.y - 20);
    } else if (E.data.tahap === 3 && E.umur > E.data.lanjutPada) {
      a.pose = null;
      E.selesaiCepat = true;
    }
  },
  // Rim kertas yang sudah ditaruh di sebelah mesin, selama eventnya masih jalan.
  gambarProp(E) {
    if ((E.data.tahap || 0) < 3) return;
    const x = FOTOKOPI_TITIK.x + 10, y = 126;
    r(x, y, 10, 6, '#f2f0e6');
    r(x, y, 10, 1, '#ffffff');
    r(x, y + 3, 10, 1, '#c9cdd1');
    r(x + 2, y + 1, 6, 1, '#7aa5e8');              // pita merek
  },
  sortY: 134,
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.bawa = null; E.data.a.bawaSampai = 0; } },
},

/* Foto bersama. Dinyalakan sendiri sesekali, dan SELALU menyusul
   `penghargaan-zona-integritas` lewat lanjutan di berkas 16 — piagam yang
   baru diterima tanpa foto bersama itu bukan kantor dinas. */
{
  id: 'foto-bersama',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 46,
  sfx: 'jepret',
  babak: { kerja: 1, apel: 0, malam: 0.2, libur: 0 },
  syarat: (S) => S.jam > 8 && S.jam < 16 && S.orang.filter((o) => bisaDipinjam(o)).length >= 4,
  perluAktor: true,
  mulai(E) {
    const calon = pinjamAktor(E, 6);
    if (calon.length < 4) { E.selesaiCepat = true; return; }
    E.data.juru = calon[0];
    E.data.baris = calon.slice(1);
    E.data.juru.doingEvent = 'jadi juru foto';
    E.data.juru.goToXY(204, 318, 'up');
    /* Dua saf di lantai depan meja rapat (bukan di atas karpetnya — di situ
       ada mejanya). Titik-titiknya sekeluarga dengan grid senam-jumat. */
    /* Kotak x170..250 y262..302 disapu dulu: nol perabot, dan cukup jauh dari
       slot kelima ruang tunggu (x=236) supaya penunggu loket tidak berdiri
       menembus saf depan. */
    const SAF = [[180, 286], [204, 286], [228, 286], [192, 270], [216, 270]];
    E.data.baris.forEach((a, i) => {
      const [x, y] = SAF[i % SAF.length];
      a.doingEvent = 'foto bersama';
      a.goToXY(x, y, 'down');
    });
  },
  tick(E) {
    const juru = masihMain(E, E.data.juru) ? E.data.juru : null;
    const baris = yangMasihMain(E, E.data.baris);
    if (!juru || baris.length < 2) { E.selesaiCepat = true; return; }   // tinggal berdua bukan foto bersama
    pada(E, 9, () => { const j = masihMain(E, E.data.juru) ? E.data.juru : null; if (j) j.say('yang belakang agak rapat'); });
    pada(E, 14, () => { const j = masihMain(E, E.data.juru) ? E.data.juru : null; if (j) j.say('satu... dua...'); });
    pada(E, 17, () => {
      E.data.kilat = E.umur;
      for (const a of yangMasihMain(E, E.data.baris)) a.pose = 'tepuk';
    });
    pada(E, 22, () => {
      for (const a of yangMasihMain(E, E.data.baris)) a.pose = null;
      E.selesaiCepat = true;
    });
  },
  // Kamera di depan wajah juru foto: kotak 6x5 + lensa.
  gambarProp(E) {
    const j = E.data.juru;
    if (!j || j.eventKerja !== E) return;
    const x = Math.round(j.x) - 3, y = Math.round(j.y) - 26;
    r(x, y, 6, 5, '#2b2f35');
    r(x, y, 6, 1, '#464d55');
    r(x + 2, y + 1, 3, 3, '#7d848c');
    r(x + 3, y + 2, 1, 1, '#cfe6ff');
  },
  sortY: 330,
  // Kilat blitz: putih sekejap di ATAS segalanya, 0,14 detik.
  gambarAtas(E) {
    const k = E.data.kilat;
    if (k == null || E.umur > k + 0.14) return;
    ctx.globalAlpha = 0.55 * (1 - (E.umur - k) / 0.14);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  },
  selesai(E) {
    for (const a of (E.data.baris || [])) a.pose = null;
    if (E.data.juru) E.data.juru.doingEvent = '';
  },
},

);
