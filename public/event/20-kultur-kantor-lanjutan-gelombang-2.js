/* ==========================================================================
   KULTUR KANTOR — lanjutan gelombang 2
   (lap-kacamata-di-ujung-baju SENGAJA dilewati: butuh atribut kacamata baru
   di JABATAN yang belum ada di mana pun, kerumitannya tidak sepadan untuk
   satu event K2 kecil)
   ========================================================================== */

daftarEvent(

{
  id: 'hape-getar-di-meja-kosong',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 8,
  syarat: (S) => S.orang.length >= 4 && S.bekerja.some((o) => o.station !== 'think' && o.station !== 'rapat' && !o.eventKerja),
  mulai(E, S) {
    const slot = slotBebas('think', null);
    if (slot < 0) { E.selesaiCepat = true; return; }
    const a = S.bekerja.find((o) => o.station !== 'think' && o.station !== 'rapat' && !o.eventKerja);
    if (!a) { E.selesaiCepat = true; return; }
    E.data.slot = slot;
    E.data.a = a;
  },
  tick(E) {
    if (E.data.slot == null) return;
    if (E.umur > 1.5 && !E.data.dijemput) {
      E.data.dijemput = true;
      const a = E.data.a;
      a.doingEvent = 'ambil HP di meja';
      a.goToXY(MEJA_KERJA_X[E.data.slot] + 21, 316, 'down');
    }
    if (E.data.dijemput && E.data.a.diam && !E.data.selesai) {
      E.data.selesai = true;
      E.data.selesaiPada = E.umur + 1;
    }
    if (E.data.selesaiPada && E.umur > E.data.selesaiPada) E.selesaiCepat = true;
  },
  gambarProp(E) {
    if (E.data.slot == null || E.umur > 2.5) return;
    const x = MEJA_KERJA_X[E.data.slot];
    const getar = Math.round(Math.sin(now / 30) * 1);
    r(x + 6 + getar, 310, 3, 5, '#20242c');
    r(x + 7 + getar, 311, 1, 2, '#7aa5e8');
  },
  sortY: 349,
  selesai(E) { if (E.data.a) E.data.a.doingEvent = ''; },
},

{
  id: 'jumat-bersih',
  kelas: 'panggung', bobot: B.jarang, cooldown: 5400, durasi: 50,
  syarat: (S) => (new Date().getDay() === 5 && S.jam >= 14 && S.jam < 15.5) || Math.random() < 0.02,
  perluAktor: true,
  mulai(E) {
    E.data.orang = pinjamAktor(E, 2);
    if (E.data.orang[0]) E.data.orang[0].goTo('edit');
    if (E.data.orang[1]) E.data.orang[1].goTo('search');
  },
  tick(E, dt) {
    for (const a of E.data.orang) {
      if (a.diam) { a.pose = 'lap'; if (Math.random() < 6 * dt) spawn('dust', a.x, a.y - 10); }
    }
    pada(E, 40, () => {
      RUANGAN.nodaMeja = [];
      if (RUANGAN.edaran.length) RUANGAN.edaran.pop();
      RUANGAN.tongPenuh = 0;
    });
  },
  selesai(E) { for (const a of E.data.orang) a.pose = null; },
},

{
  id: 'kertas-bekas-dibalik',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 3,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => o.station !== 'rapat')[0];
    if (!a) return;
    E.data.a = a;
    a.bawa = 'kertas';
    a.bawaSampai = now + 12000;
    spawn('paper', 232, 96);
  },
},

{
  id: 'keset-baru-dipasang',
  kelas: 'latar', bobot: B.jarang, cooldown: 999999, durasi: 8,
  syarat: () => !RUANGAN.kesetAda,
  mulai() {
    RUANGAN.kesetAda = true;
    for (let i = 0; i < 3; i++) spawn('dust', 456 + i * 3, 112, '#8a6a4a');
  },
},

{
  id: 'regang-badan-di-kursi',
  kelas: 'latar', bobot: B.sering, cooldown: 40, durasi: 2.5,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => o.station === 'think')[0];
    if (!a) return;
    E.data.a = a;
    a.pose = 'angkat';
  },
  tick(E) {
    pada(E, 1.5, () => { if (E.data.a) { E.data.a.pose = null; hadapkan(E.data.a, E.data.a.x, 40); } });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'selip-pulpen-di-telinga',
  kelas: 'latar', bobot: B.jarang, cooldown: 300, durasi: 2.5,
  syarat: (S) => S.stasiunAktif.has('edit'),
  perluAktor: true,
  mulai(E) {
    const a = pemeranStasiun(E, 'edit');
    if (!a) return;
    a.pulpenDiTelinga = true;
    E.data.a = a;
  },
},

{
  id: 'analis-beda-bahasa',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 18,
  syarat: (S) => S.orang.some((o) => o.peran === 'analis_kebijakan') && S.orang.some((o) => o.peran === 'analis_sistem'),
  mulai(E, S) {
    const a = S.orang.find((o) => o.peran === 'analis_kebijakan' && bisaDipinjam(o));
    const b = S.orang.find((o) => o.peran === 'analis_sistem' && bisaDipinjam(o));
    if (!a || !b) { E.selesaiCepat = true; return; }
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    b.eventKerja = E; b.betahAsli = b.betah; b.betah = true; E.aktor.push(b);
    E.data.a = a; E.data.b = b;
    a.goToXY(122, 138, 'up'); b.goToXY(142, 138, 'up');
  },
  tick(E) {
    const { a, b } = E.data;
    if (!a || !b) return;
    if (Math.random() < 0.06) spawn('paper', a.x, a.y - 24);
    if (Math.random() < 0.06) spawn('data', b.x, b.y - 24);
    pada(E, 15, () => {
      a.say('kebijakan: maksudnya keluaran layanan');
      const slot = slotBebas('rapat', a);
      if (slot >= 0) { a.slotIdx = slot; a.goTo('rapat'); }
      const slot2 = slotBebas('rapat', b);
      if (slot2 >= 0) { b.slotIdx = slot2; b.goTo('rapat'); }
    });
  },
},

{
  id: 'antre-stempel-berdua',
  kelas: 'latar', bobot: B.sedang, cooldown: 60, durasi: 15,
  syarat: (S) => S.orang.some((o) => o.station === 'edit' && o.slotIdx > 0 && o.diam),
  tick(E, dt, S) {
    const antre = S.orang.filter((o) => o.station === 'edit' && o.slotIdx > 0 && o.diam);
    if (!antre.length) { E.selesaiCepat = true; return; }
    if (Math.random() < 1.5 * dt) { const a = pilih(antre); spawn('step', a.x, a.y); }
  },
},

{
  id: 'arsiparis-bimbing-magang',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 18,
  syarat: (S) => S.orang.some((o) => o.peran === 'arsiparis') && S.orang.some((o) => o.peran === 'magang') && !S.stasiunAktif.has('read'),
  mulai(E, S) {
    const ar = S.orang.find((o) => o.peran === 'arsiparis' && bisaDipinjam(o));
    const mg = S.orang.find((o) => o.peran === 'magang' && bisaDipinjam(o));
    if (!ar || !mg) { E.selesaiCepat = true; return; }
    ar.eventKerja = E; ar.betahAsli = ar.betah; ar.betah = true; E.aktor.push(ar);
    mg.eventKerja = E; mg.betahAsli = mg.betah; mg.betah = true; E.aktor.push(mg);
    E.data.ar = ar; E.data.mg = mg;
    ar.goToXY(54, 138, 'up'); mg.goToXY(73, 138, 'up');
    RUANGAN.laciTerbuka = 1;
  },
  tick(E, dt) {
    if (Math.random() < 0.4 * dt) spawn('dust', 130, 76);
    pada(E, 15, () => { if (E.data.ar) E.data.ar.say('kode klasifikasi dulu, baru tahun'); });
  },
  selesai() { RUANGAN.laciTerbuka = -1; },
},

{
  id: 'bersandar-ayun-kursi',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 4,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => o.station === 'think')[0];
    if (!a) return;
    E.data.a = a;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    a.miring = E.umur < 3.6;
    if (E.umur > 3.6 && !E.data.sentak) { E.data.sentak = true; menoleh([a], a.x - 8, a.y, 500); }
  },
  selesai(E) { if (E.data.a) E.data.a.miring = false; },
},

{
  id: 'dus-arsip-ditumpuk',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 28,
  syarat: () => RUANGAN.dusTambahanArsip < 2,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['arsiparis']);
    if (!a) return;
    E.data.a = a;
    a.bawa = 'boks';
    a.laju = 0.6;
    a.goToXY(452, 300, 'up');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && a.x > 440 && !E.data.angkat) {
      E.data.angkat = true;
      a.goToXY(440, 240, 'up');
    } else if (E.data.angkat && a.diam && Math.abs(a.x - 440) < 4 && Math.abs(a.y - 240) < 4 && !E.data.taruh) {
      E.data.taruh = true;
      RUANGAN.dusTambahanArsip = Math.min(2, RUANGAN.dusTambahanArsip + 1);
      RUANGAN.arsipPenuh = true;
      a.bawa = null;
      a.pose = 'usap';
      E.data.selesaiPada = E.umur + 2;
    }
    if (E.data.selesaiPada && E.umur > E.data.selesaiPada) { a.pose = null; a.laju = 1; }
  },
  selesai(E) { if (E.data.a) { E.data.a.laju = 1; E.data.a.bawa = null; E.data.a.pose = null; } },
},

{
  id: 'edar-amplop-patungan',
  kelas: 'latar', bobot: B.sedang, cooldown: 1800, durasi: 26,
  syarat: (S) => S.orang.length >= 3,
  perluAktor: true,
  mulai(E, S) {
    const urutan = pinjamAktor(E, Math.min(4, S.orang.length));
    if (urutan.length < 2) return;
    E.data.urutan = urutan;
    E.data.i = 0;
    urutan[0].bawa = 'amplop-coklat';
    urutan[0].goToXY(urutan[1].x - 12, urutan[1].y, null);
  },
  tick(E) {
    const U = E.data.urutan;
    // Rantai serah-amplop sudah tuntas (E.data.i === U.length) tapi eventnya
    // sendiri masih hidup sampai durasinya habis — tanpa guard ini,
    // U[E.data.i] keluar indeks dan .diam di bawah meledak tiap frame sisanya.
    if (!U || U.length < 2 || E.data.selesai) return;
    const bawa = U[E.data.i];
    if (bawa.diam && !E.data.tunggu) {
      E.data.tunggu = true;
      E.data.tungguSampai = E.umur + 2.5;
      spawn('paper', bawa.x, bawa.y - 20);
    }
    if (E.data.tunggu && E.umur > E.data.tungguSampai) {
      E.data.tunggu = false;
      bawa.bawa = null;
      E.data.i++;
      if (E.data.i >= U.length) {
        const stempel = U[U.length - 1];
        stempel.bawa = 'amplop-coklat';
        stempel.goTo('edit');
        E.data.selesai = true;
      } else {
        U[E.data.i].bawa = 'amplop-coklat';
        const target = U[E.data.i + 1] || null;
        if (target) U[E.data.i].goToXY(target.x - 12, target.y, null);
      }
    }
  },
  selesai(E) { if (E.data.urutan) for (const a of E.data.urutan) a.bawa = null; },
},

{
  id: 'galon-habis-diganti',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 24,
  syarat: () => RUANGAN.gelasDispenser <= 3,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    E.data.a = a;
    a.goTo('idle');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.tekan) {
      E.data.tekan = true;
      a.bawa = 'gelas';
      a.say('Angkat sama-sama, jangan pinggangnya');
      a.goToXY(440, 220, 'up');
    }
    if (E.data.tekan && a.diam && a.x > 430 && !E.data.angkat) {
      E.data.angkat = true;
      a.bawa = 'jerigen';
      a.laju = 0.6;
      // Dispenser sekarang di pantry (x462..480) -- BUKAN di 'idle' (x282)
      // lagi, jadi jalan langsung ke situ, bukan lewat stasiun idle.
      a.goToXY(455, 272, 'right');
    }
    if (E.data.angkat && a.diam && a.x > 452 && !E.data.pasang) {
      E.data.pasang = true;
      a.bawa = null;
      a.laju = 1;
      RUANGAN.gelasDispenser = 6;
      for (let i = 0; i < 4; i++) spawn('splash', 466, 238, '#b8dcf4');
    }
  },
  selesai(E) { if (E.data.a) { E.data.a.laju = 1; E.data.a.bawa = null; } },
},

{
  id: 'gantian-jaga-loket',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 12,
  syarat: (S) => S.orang.some((o) => o.station === 'idle' && o.diam),
  perluAktor: true,
  mulai(E, S) {
    const lama = S.orang.find((o) => o.station === 'idle' && o.diam);
    if (!lama) return;
    lama.eventKerja = E; lama.betahAsli = lama.betah; lama.betah = true; E.aktor.push(lama);
    E.data.lama = lama;
    const baru = pinjamAktor(E, 1, (o) => o.station !== 'idle');
    E.data.baru = baru[0];
    if (E.data.baru) E.data.baru.goToXY(lama.x + 14, lama.y, 'left');
  },
  tick(E) {
    const { lama, baru } = E.data;
    if (!lama) return;
    if (!baru) { pada(E, 2, () => { lama.say('itu jam berapa ya'); }); return; }
    if (baru.diam && !E.data.tukar) {
      E.data.tukar = true;
      spawn('paper', lama.x, lama.y - 20);
      lama.goTo('think');
      baru.goTo('idle');
    }
  },
},

{
  id: 'humas-latihan-sambutan',
  kelas: 'latar', bobot: B.jarang, cooldown: 600, durasi: 20,
  syarat: (S) => S.orang.some((o) => o.peran === 'humas') && S.orang.length < 6,
  mulai(E, S) {
    const a = S.orang.find((o) => o.peran === 'humas' && bisaDipinjam(o));
    if (!a) { E.selesaiCepat = true; return; }
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    E.data.a = a;
    a.goToXY(30, 220, 'down');
  },
  tick(E, dt) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && Math.random() < 0.3 * dt) spawn('talk', a.x, a.y - 26);
    pada(E, 15, () => { a.say('yang terhormat, Bapak/Ibu...'); });
    if (!E.data.penonton && E.umur > 8) {
      const p = pinjamAktor(E, 1, (o) => o !== a);
      if (p.length) { E.data.penonton = p[0]; E.data.penonton.goToXY(a.x, a.y + 20, 'up'); }
    }
    if (E.data.penonton && E.data.penonton.diam && !E.data.tepuk) {
      E.data.tepuk = true;
      E.data.penonton.pose = 'tepuk';
      E.data.penonton.say('lanjut, bagus itu');
    }
  },
  selesai(E) { if (E.data.penonton) E.data.penonton.pose = null; },
},

{
  id: 'istirahat-sholat-dzuhur',
  kelas: 'latar', bobot: B.sering, cooldown: 10800, durasi: 45,
  syarat: (S) => (S.jam > 12 && S.jam < 12.5) || (S.jam > 15.25 && S.jam < 15.75),
  mulai(E, S) {
    const a = S.orang.find((o) => bisaDipinjam(o));
    if (a) a.say('Duluan ya, titip meja');
  },
  tick(E) {
    MOD.hening = Math.sin(E.umur * 0.3) > 0.3;
    if (!E.data.kopi && E.umur > 5) {
      const a = pinjamAktor(E, 1, (o) => o.station !== 'idle');
      if (a.length) { E.data.kopi = a[0]; E.data.kopi.goTo('idle'); }
    }
  },
},

{
  id: 'kabar-cuaca-di-grup',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 25,
  syarat: () => CUACA.hujan > 0.4 || sedangJalan('kilat-menyambar'),
  perluAktor: true,
  mulai(E) {
    E.data.orang = pinjamAktor(E, 3);
    for (const a of E.data.orang) { a.bawa = 'hp'; a.bekuSampai = now + 24000; }
  },
  tick(E) {
    if (Math.random() < 0.05) { const a = pilih(E.data.orang); if (a) spawn('ping', a.x, a.y - 22); }
    pada(E, 20, () => { for (const a of E.data.orang) { a.bawa = null; a.bekuSampai = 0; } });
  },
  selesai(E) { for (const a of E.data.orang) { a.bawa = null; a.bekuSampai = 0; } },
},

{
  id: 'kabid-kasi-adu-argumen',
  kelas: 'latar', bobot: B.sedang, cooldown: 540, durasi: 15,
  syarat: (S) => S.orang.some((o) => o.peran === 'kabid') && S.orang.some((o) => o.peran === 'kasi'),
  mulai(E, S) {
    const kabid = S.orang.find((o) => o.peran === 'kabid' && bisaDipinjam(o));
    const kasi = S.orang.find((o) => o.peran === 'kasi' && bisaDipinjam(o));
    if (!kabid || !kasi) { E.selesaiCepat = true; return; }
    kabid.eventKerja = E; kabid.betahAsli = kabid.betah; kabid.betah = true; E.aktor.push(kabid);
    kasi.eventKerja = E; kasi.betahAsli = kasi.betah; kasi.betah = true; E.aktor.push(kasi);
    E.data.kabid = kabid; E.data.kasi = kasi;
    kabid.goToXY(226, 210, 'down'); kasi.goToXY(266, 210, 'down');
  },
  tick(E) {
    const { kabid, kasi } = E.data;
    if (!kabid || !kasi) return;
    pada(E, 2, () => { kabid.say('itu bukan kewenangan kita'); });
    pada(E, 5, () => { kasi.say('di juknis boleh, Pak'); });
    pada(E, 8, () => { kabid.pose = 'nunjuk'; });
    pada(E, 10, () => { kabid.pose = null; kasi.laju = 1.3; kasi.goTo('read'); });
    pada(E, 14, () => { kasi.laju = 1; kasi.goTo('rapat'); });
  },
  selesai(E) {
    if (E.data.kabid) E.data.kabid.pose = null;
    if (E.data.kasi) E.data.kasi.laju = 1;
  },
},

{
  id: 'kasi-inspeksi-meja-staf',
  // durasi dilonggarkan dari 19 — alasan sama: 6 meja sekarang, bukan 4.
  kelas: 'latar', bobot: B.sering, cooldown: 360, durasi: 27,
  syarat: (S) => S.orang.some((o) => o.peran === 'kasi') && S.orang.filter((o) => o.station === 'think').length >= 2,
  mulai(E, S) {
    const kasi = S.orang.find((o) => o.peran === 'kasi' && bisaDipinjam(o));
    if (!kasi) { E.selesaiCepat = true; return; }
    kasi.eventKerja = E; kasi.betahAsli = kasi.betah; kasi.betah = true; E.aktor.push(kasi);
    E.data.kasi = kasi; E.data.i = 0;
    kasi.goToXY(MEJA_KERJA_X[0] + 5, 316, 'down');
  },
  tick(E) {
    const kasi = E.data.kasi;
    if (!kasi) return;
    if (kasi.diam && !E.data.tunggu) {
      E.data.tunggu = true;
      E.data.tungguSampai = E.umur + 4;
      spawn('scan', kasi.x, kasi.y - 20);
    }
    if (E.data.tunggu && E.umur > E.data.tungguSampai) {
      E.data.tunggu = false;
      E.data.i++;
      if (E.data.i < MEJA_KERJA_X.length) kasi.goToXY(MEJA_KERJA_X[E.data.i] + 5, 316, 'down');
      else if (!E.data.selesai) { E.data.selesai = true; kasi.say('lanjut, lanjut'); }
    }
  },
},

{
  id: 'kasi-panggil-magang-fotokopi',
  kelas: 'latar', bobot: B.sedang, cooldown: 240, durasi: 14,
  syarat: (S) => S.orang.some((o) => ['kasi', 'kabid'].includes(o.peran)) && S.orang.some((o) => o.peran === 'magang'),
  mulai(E, S) {
    const kasi = S.orang.find((o) => ['kasi', 'kabid'].includes(o.peran) && bisaDipinjam(o));
    const mg = S.orang.find((o) => o.peran === 'magang' && bisaDipinjam(o));
    if (!kasi || !mg) { E.selesaiCepat = true; return; }
    kasi.eventKerja = E; kasi.betahAsli = kasi.betah; kasi.betah = true; E.aktor.push(kasi);
    mg.eventKerja = E; mg.betahAsli = mg.betah; mg.betah = true; E.aktor.push(mg);
    E.data.kasi = kasi; E.data.mg = mg;
    kasi.say('tolong gandakan 15 rangkap');
    mg.goToXY(kasi.x - 10, kasi.y, 'right');
  },
  tick(E) {
    const { kasi, mg } = E.data;
    if (!kasi || !mg) return;
    if (mg.diam && !E.data.terima) {
      E.data.terima = true;
      mg.say('siap');
      mg.bawa = 'kertas';
      mg.goTo('web');
    }
    if (E.data.terima && mg.diam && mg.station === 'web' && !E.data.ping) {
      E.data.ping = true;
      E.data.pingSampai = E.umur + 5;
    }
    if (E.data.ping && E.umur > E.data.pingSampai && !E.data.balik) {
      E.data.balik = true;
      mg.bawa = 'kertas';
      mg.goToXY(kasi.x, kasi.y, null);
    }
    if (E.data.balik && mg.diam && !E.data.serah) {
      E.data.serah = true;
      spawn('paper', kasi.x, kasi.y - 20);
      mg.bawa = null;
    }
  },
  selesai(E) { if (E.data.mg) E.data.mg.bawa = null; },
},

{
  id: 'kerja-bakti-berkas',
  kelas: 'latar', bobot: B.jarang, cooldown: 600, durasi: 35,
  syarat: (S) => (RUANGAN.mapDisposisi >= 2 || RUANGAN.tumpukanFiling >= 2) && S.nganggur.length >= 3,
  perluAktor: true,
  mulai(E) {
    const tiga = pinjamAktor(E, 3);
    if (tiga.length < 2) return;
    E.data.orang = tiga;
    tiga.forEach((a, i) => a.goToXY(40 + i * 30, LANE_UP, 'up'));
  },
  tick(E, dt) {
    const O = E.data.orang;
    if (!O || O.length < 2) return;
    if (!O.every((a) => a.diam)) return;
    E.data.opT = (E.data.opT || 0) + dt;
    const jeda = O.length >= 3 ? 1.5 : 2.5;
    if (E.data.opT > jeda) {
      E.data.opT = 0;
      spawn('paper', O[0].x, O[0].y - 20);
      E.data.putaran = (E.data.putaran || 0) + 1;
      if (E.data.putaran % 3 === 0) {
        if (RUANGAN.mapDisposisi > 0) RUANGAN.mapDisposisi--;
        else if (RUANGAN.tumpukanFiling > 0) RUANGAN.tumpukanFiling--;
        for (let i = 0; i < 4; i++) spawn('dust', O[0].x, O[0].y);
      }
    }
  },
},

{
  id: 'kipas-direbut-arah',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 18,
  syarat: (S) => S.jam > 11 && S.jam < 15 && S.orang.filter((o) => o.station === 'think').length >= 2,
  mulai(E, S) {
    const a = S.orang.find((o) => o.station === 'think' && bisaDipinjam(o));
    if (!a) { E.selesaiCepat = true; return; }
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    E.data.a = a;
    a.goToXY(400, 280, 'up');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.putar) {
      E.data.putar = true;
      RUANGAN.kipasArah = a.x < 400 ? -1 : 1;
      a.goTo('think');
    }
    if (!E.data.b && E.umur > 8) {
      const b = pinjamAktor(E, 1, (o) => o.station === 'think' && o !== a);
      if (b.length) { E.data.b = b[0]; E.data.b.goToXY(400, 280, 'up'); }
    }
    if (E.data.b && E.data.b.diam && !E.data.putar2) {
      E.data.putar2 = true;
      RUANGAN.kipasArah *= -1;
      spawn('talk', E.data.b.x, E.data.b.y - 24);
      E.data.b.say('Gantian ya, panas nih');
      E.data.b.goTo('think');
    }
  },
},

{
  id: 'kopi-pagi-dispenser',
  babak: { kerja: 1.5, apel: .3 },   // pengali bobot per babak hari kerja (S.babak)
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 20,
  syarat: (S) => S.jam > 7 && S.jam < 9.5 && S.nganggur.length >= 2,
  perluAktor: true,
  mulai(E) {
    E.data.orang = pinjamAktor(E, 2);
    if (E.data.orang.length < 2) return;
    // Dua orang juga tidak muat di pojok dispenser -- berhadapan di lantai
    // pantry, pola sama seperti kopi-jam-sepuluh.
    E.data.orang[0].goToXY(432, 278, 'right');
    E.data.orang[1].goToXY(452, 278, 'left');
  },
  tick(E, dt) {
    const O = E.data.orang;
    if (!O || O.length < 2) return;
    if (O.every((a) => a.diam)) {
      if (Math.random() < 0.3 * dt) { const a = pilih(O); spawn('talk', a.x, a.y - 24); }
      if (Math.random() < 0.15 * dt) { const a = pilih(O); spawn('steam', a.x + 4, a.y - 20); }
    }
  },
},

{
  id: 'kunci-lemari-hilang',
  kelas: 'latar', bobot: B.jarang, cooldown: 1080, durasi: 30,
  syarat: (S) => !S.stasiunAktif.has('read'),
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    E.data.a = a;
    a.say('Kuncinya di siapa?');
    a.goToXY(54, 138, 'up');
    E.data.titik = [[176, 306], [286, 140], [54, 138]];
    E.data.i = -1;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && E.umur > 3) {
      if (!E.data.tunggu) { E.data.tunggu = true; E.data.tungguSampai = E.umur + 3; }
      else if (E.umur > E.data.tungguSampai) {
        E.data.tunggu = false;
        E.data.i++;
        if (E.data.i < E.data.titik.length) {
          const [tx, ty] = E.data.titik[E.data.i];
          a.goToXY(tx, ty, null);
          if (E.data.i === E.data.titik.length - 1) a.say('Ketemu!');
        }
      }
    }
    if (a.adaTugas) a.busyUntil = Math.max(a.busyUntil, now + 2000);
  },
},

{
  id: 'kupu-kupu-tanda-tamu',
  kelas: 'latar', bobot: B.jarang, cooldown: 1500, durasi: 30,
  syarat: (S) => S.jam > 8 && S.jam < 15,
  mulai(E) { E.data.x = JENDELA.x; E.data.y = JENDELA.y + 20; E.data.tahap = 0; E.data.t = 0; },
  tick(E, dt) {
    const D = E.data;
    D.t += dt;
    if (D.tahap === 0) { D.x += 14 * dt; D.y += Math.sin(D.t * 4) * 3; if (D.x > 300) { D.tahap = 1; D.t = 0; } }
    else if (D.tahap === 1) { D.x = 300; D.y = 16; if (D.t > 5) { D.tahap = 2; D.t = 0; } }
    else if (D.tahap === 2) { D.x = 44; D.y = 258; if (D.t > 5) { D.tahap = 3; D.t = 0; } }
    else { D.x -= 20 * dt; }
    if (!D.dibilang && D.t > 0.3 && D.tahap >= 1) {
      D.dibilang = true;
      const a = pemeran(E);
      if (a) a.say('wah, ada kupu-kupu — bakal ada tamu');
    }
  },
  gambarAtas(E) {
    const x = Math.round(E.data.x), y = Math.round(E.data.y);
    r(x, y, 4, 3, '#c9a03a');
    r(x + 1, y - 1, 2, 1, Math.sin(now / 90) > 0 ? '#e8c05a' : '#c9a03a');
  },
},

{
  id: 'luruskan-kursi-rapat',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 4,
  syarat: (S) => S.orang.length <= 2 && RUANGAN.geserKursi.some((v) => v),
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['magang', 'arsiparis', 'teknisi', 'statistisi']);
    if (!a) return;
    E.data.a = a;
    a.goToXY(RAPAT.cx, 178, 'up');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.rapikan) {
      E.data.rapikan = true;
      for (let i = 0; i < RUANGAN.geserKursi.length; i++) {
        if (RUANGAN.geserKursi[i]) spawn('dust', RAPAT.cx + slotKe(i), 186);
      }
      RUANGAN.geserKursi = [];
    }
  },
},

{
  id: 'makan-siang-bareng',
  babak: { istirahat: 2, apel: 0 },   // pengali bobot per babak hari kerja (S.babak)
  kelas: 'panggung', bobot: B.sering, cooldown: 420, durasi: 26,
  perluAktor: true,
  syarat: (S) => S.orang.length >= 3 && S.jam >= 11.5 && S.jam < 13.5,
  mulai(E) {
    pinjamAktor(E, 3).forEach((a, i) => {
      a.doingEvent = 'makan siang bareng';
      a.goToXY(RAPAT.cx + slotKe(i), 190, 'up');
    });
  },
  tick(E) {
    if (Math.random() < 0.03) spawn('steam', RAPAT.cx, 188);
    pada(E, 5, () => { const a = E.aktor[0]; if (a) a.say('makan siang dulu, ya'); });
    pada(E, 16, () => { const a = E.aktor[1]; if (a) a.say('nasi kotaknya itu-itu lagi'); });
  },
  gambarProp(E) {
    const y = 194;
    for (let i = 0; i < 3; i++) {
      const x = 228 + i * 13;
      r(x, y, 8, 6, '#c9a86a');      // kotak nasi
      r(x, y, 8, 2, '#f2ece0');      // tutup putih
      r(x + 2, y + 3, 2, 2, '#5f8a42'); // lalapan/sambal
    }
  },
  sortY: 202,
},

{
  id: 'papasan-di-lorong-minggir',
  kelas: 'latar', bobot: B.sering, cooldown: 3, durasi: 2,
  mulai(E, S) {
    const jalan = S.orang.filter((o) => o.path.length && !o.eventKerja);
    let pasang = null;
    for (let i = 0; i < jalan.length && !pasang; i++) {
      for (let j = i + 1; j < jalan.length; j++) {
        const a = jalan[i], b = jalan[j];
        if (Math.abs(a.y - b.y) < 6 && jarakKe(a, b.x, b.y) < 14 && a.x !== b.x) { pasang = [a, b]; break; }
      }
    }
    if (!pasang) { E.selesaiCepat = true; return; }
    const [a, b] = pasang;
    const rankA = JABATAN.findIndex((j) => j.id === a.peran), rankB = JABATAN.findIndex((j) => j.id === b.peran);
    const minggir = rankA > rankB ? a : b;
    minggir.bekuSampai = now + 400;
    E.data.minggir = minggir;
  },
  selesai(E) { if (E.data.minggir) E.data.minggir.bekuSampai = 0; },
},

{
  id: 'pinjam-charger-keliling',
  kelas: 'latar', bobot: B.sering, cooldown: 420, durasi: 18,
  syarat: (S) => S.orang.length >= 3 && S.orang.filter((o) => o.station === 'think').length >= 1,
  perluAktor: true,
  mulai(E, S) {
    const a = pinjamAktor(E, 1, (o) => o.station !== 'think')[0];
    if (!a) return;
    E.data.a = a;
    E.data.meja = S.orang.filter((o) => o.station === 'think');
    E.data.tahap = 0;
    const target = E.data.meja[0];
    if (target) a.goToXY(target.x + 10, target.y, 'left'); else E.selesaiCepat = true;
  },
  tick(E) {
    const a = E.data.a;
    const meja = E.data.meja;
    if (!a || !meja || !meja.length) return;
    if (a.diam && !E.data.tunggu) { E.data.tunggu = true; E.data.tungguSampai = E.umur + 2; }
    else if (E.data.tunggu && E.umur > E.data.tungguSampai) {
      E.data.tunggu = false;
      E.data.tahap++;
      if (E.data.tahap < meja.length) {
        a.goToXY(meja[E.data.tahap].x + 10, meja[E.data.tahap].y, 'left');
        if (E.data.tahap === meja.length - 1) a.say('colokannya nganggur nggak?');
      } else if (!E.data.selesai) {
        E.data.selesai = true;
        a.doingEvent = 'numpang colokan';
      }
    }
  },
  selesai(E) { if (E.data.a) E.data.a.doingEvent = ''; },
},

{
  id: 'pranata-madya-bimbing-pranata-pertama',
  kelas: 'latar', bobot: B.sering, cooldown: 360, durasi: 17,
  syarat: (S) => S.orang.some((o) => ['pranata_madya', 'analis_sistem'].includes(o.peran) && o.station === 'think')
    && S.orang.some((o) => ['pranata_pertama', 'pranata_muda', 'magang'].includes(o.peran) && o.station === 'think'),
  mulai(E, S) {
    const senior = S.orang.find((o) => ['pranata_madya', 'analis_sistem'].includes(o.peran) && o.station === 'think' && bisaDipinjam(o));
    const junior = S.orang.find((o) => ['pranata_pertama', 'pranata_muda', 'magang'].includes(o.peran) && o.station === 'think' && o !== senior && bisaDipinjam(o));
    if (!senior || !junior) { E.selesaiCepat = true; return; }
    senior.eventKerja = E; senior.betahAsli = senior.betah; senior.betah = true; E.aktor.push(senior);
    E.data.senior = senior; E.data.junior = junior;
    E.data.magang = junior.peran === 'magang';
    senior.goToXY(junior.x - 10, junior.y + 6, 'up');
  },
  tick(E) {
    const { senior, junior } = E.data;
    if (!senior || !junior) return;
    if (senior.diam) senior.pose = 'nunjuk';
    const t = E.data.magang ? 14 : 10;
    pada(E, t, () => { spawn('idea', junior.x, junior.y - 26, P.amber); });
    pada(E, t + 1, () => { senior.pose = null; senior.say('coba dari sini dulu'); });
  },
  selesai(E) { if (E.data.senior) E.data.senior.pose = null; },
},

{
  id: 'tamu-merokok-ditegur-rambu',
  kelas: 'latar', bobot: B.sedang, cooldown: 1500, durasi: 14,
  syarat: (S) => S.orang.some((o) => o.station === 'idle' && o.diam),
  mulai(E, S) {
    const t = S.orang.find((o) => o.station === 'idle' && o.diam);
    if (!t) { E.selesaiCepat = true; return; }
    E.data.tamuX = t.x; E.data.tamuY = t.y;
  },
  tick(E) {
    if (Math.random() < 0.3) spawn('asap', E.data.tamuX, E.data.tamuY - 30);
    if (!E.data.a && E.umur > 3) {
      const a = pemeran(E);
      if (a) { E.data.a = a; a.goToXY(E.data.tamuX + 12, E.data.tamuY, 'left'); }
    }
    if (E.data.a && E.data.a.diam && !E.data.tegur) {
      E.data.tegur = true;
      E.data.a.pose = 'nunjuk';
      E.data.a.say('maaf, di luar ya pak');
      E.data.rambuSampai = E.umur + 2;
    }
  },
  gambarAtas(E) {
    if (E.data.rambuSampai && E.umur < E.data.rambuSampai && Math.sin(now / 90) > 0) r(428, 42, 4, 4, '#ffffff');
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  // Bukan dari katalog EVENT-ACAK.md — permintaan langsung: kerjaan yang
  // tetap jalan di jam istirahat (12.00-13.00 waktu mesin penonton) bikin
  // pegawainya ngomel2 sendiri, tanpa berhenti dari stasiunnya. Sengaja
  // TIDAK lewat pinjamAktor/pemeranStasiun: target harus sesi yang beneran
  // S.bekerja (lagi ada tool call jalan), bukan yang dipinjam dari nganggur.
  id: 'ngomel-jam-istirahat',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 13,
  syarat: (S) => S.jam >= 12 && S.jam < 13 && S.bekerja.some((o) => !o.eventKerja),
  mulai(E, S) {
    const calon = S.bekerja.filter((o) => !o.eventKerja);
    if (!calon.length) { E.selesaiCepat = true; return; }
    E.data.a = pilih(calon);
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 0.4, () => a.say('sudah jam istirahat ini...'));
    pada(E, 4.8, () => a.say('perut keroncongan, kerjaan jalan terus'));
    pada(E, 9.2, () => a.say('nasi bungkusnya dingin duluan'));
  },
},

);
