/* ==========================================================================
   PERAYAAN
   ========================================================================== */

daftarEvent(

{
  id: 'ulang-tahun-pegawai',
  kelas: 'panggung', bobot: B.jarang, cooldown: 7200, durasi: 24,
  perluAktor: true,
  syarat: (S) => S.orang.length >= 3,
  mulai(E) {
    const org = pinjamAktor(E, 5);
    E.data.yangUlangTahun = org[0];
    org.forEach((a) => { a.doingEvent = 'ikut potong kue'; a.goTo('rapat'); });
  },
  tick(E) {
    for (const a of E.aktor) if (a.diam) a.pose = 'tepuk';
    pada(E, 8, () => { const a = E.aktor[0]; if (a) a.say('potong kuenya!'); });
    pada(E, 12, () => {
      E.data.tiup = true;
      for (let i = 0; i < 8; i++) spawn('steam', 246, 190);
      for (let i = 0; i < 25; i++) spawn('confetti', 246, 120);
    });
  },
  gambarProp(E) {
    const x = 239, y = 192;
    r(x, y, 14, 8, '#8a6844');                   // kue
    r(x, y, 14, 2, '#f2ece0');
    if (!E.data.tiup) {
      r(x + 7, y - 3, 1, 3, '#f2f0e6');          // lilin
      r(x + 7, y - 4, 1, 1, Math.sin(now / 90) > 0 ? '#ffd06a' : '#ffb454');
    }
  },
  sortY: 202,
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'kocok-arisan-bulanan',
  kelas: 'panggung', bobot: B.jarang, cooldown: 7200, durasi: 22,
  perluAktor: true,
  syarat: (S) => S.orang.length >= 4,
  mulai(E) {
    const org = pinjamAktor(E, 5);
    org.forEach((a) => { a.doingEvent = 'ikut kocok arisan'; a.goTo('rapat'); });
    E.data.menang = org[org.length - 1];
  },
  tick(E) {
    pada(E, 14, () => {
      E.data.keluar = true;
      const p = spawn('paper', 246, 190);
      if (p) p.s = 2;
    });
    pada(E, 16, () => {
      const m = E.data.menang;
      if (m) { m.say('dapat! rezeki anak sholeh'); for (let i = 0; i < 6; i++) spawn('confetti', m.x, m.y - 30); }
    });
  },
  gambarProp(E) {
    const goyang = E.data.keluar ? 0 : (Math.sin(now / 60) > 0 ? 2 : -2);
    const x = 241 + goyang, y = 188;
    ctx.globalAlpha = 0.55;
    r(x, y, 10, 12, '#cfe0f2');                  // toples bening
    ctx.globalAlpha = 1;
    r(x, y, 10, 1, '#eef4fa');
    if (!E.data.keluar) for (let i = 0; i < 4; i++) r(x + 2 + (i % 3) * 2, y + 5 + (i % 2) * 3, 1, 3, P.paper);
  },
  sortY: 202,
},

{
  id: 'oleh-oleh-dinas-luar',
  kelas: 'panggung', bobot: B.jarang, cooldown: 5400, durasi: 20,
  perluAktor: true,
  mulai(E) {
    E.data.sisa = 5;
    const org = pinjamAktor(E, 4);
    org.forEach((a, i) => { a.doingEvent = 'ambil oleh-oleh'; a.goToXY(214 + i * 20, 240, 'up'); });
  },
  tick(E) {
    for (const a of E.aktor) {
      if (!a.diam || a.sudahAmbil) continue;
      a.sudahAmbil = true;
      if (E.data.sisa > 0) { E.data.sisa--; a.bawa = 'amplop'; a.bawaSampai = now + 90000; }
      spawn('paper', a.x, a.y - 24);
    }
    pada(E, 3, () => { const a = E.aktor[0]; if (a) a.say('dari Makassar, silakan'); });
  },
  selesai(E) { for (const a of E.aktor) a.sudahAmbil = false; },
  gambarProp(E) {
    const x = 236, y = 192;
    r(x, y, 18, 8, '#a37b4e');                   // kardus oleh-oleh
    r(x, y, 18, 1, '#b98d5e');
    r(x + 8, y - 1, 3, 9, '#c22b2b');            // pita
    r(x - 1, y - 3, 5, 3, '#a37b4e');            // flap terbuka
    r(x + 15, y - 3, 5, 3, '#a37b4e');
    for (let i = 0; i < E.data.sisa; i++) {
      r(x + 2 + i * 3, y + 2, 3, 3, ['#c9a03a', '#3e6b4f', '#b03030', '#3565b0', '#d2a8ff'][i]);
    }
  },
  sortY: 202,
},

/* Paling murah dari kelompok perayaan karena JABATAN sudah punya pal.pattern
   dan drawPerson sudah menanganinya: yang batik tidak memakai lidah bahu, jadi
   siluetnya benar-benar berubah, bukan cuma warnanya. */
{
  id: 'hari-batik-nasional',
  kelas: 'panggung', bobot: B.langka, cooldown: 43200, durasi: 40,
  syarat: (S) => (S.tanggal === 2 && new Date().getMonth() === 9) || S.jam < 0,
  mulai(E, S) {
    E.data.asli = new Map();
    E.data.antre = [...S.orang];
  },
  tick(E, dt, S) {
    // satu per satu, jeda 0,6 detik, tiap pergantian disertai kilau sekejap
    const target = Math.floor(E.umur / 0.6);
    while (E.data.antre.length && E.data.asli.size < target) {
      const a = E.data.antre.shift();
      if (!a) break;
      E.data.asli.set(a, a.pal);
      a.pal = { ...a.pal, main: pilih(['#6b4a2a', '#2c4468']), pattern: '#d9ab5e' };
      spawn('idea', a.x, a.y - 24, '#ffffff');
    }
    pada(E, 26, () => { const a = S.orang[0]; if (a) a.say('batiknya seragam ya'); });
  },
  selesai(E) { for (const [a, pal] of E.data.asli) a.pal = pal; },
},

);

