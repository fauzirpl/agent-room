/* ==========================================================================
   SUASANA — efek yang bagus karena caranya digambar
   ========================================================================== */

daftarEvent(

{
  id: 'mendung-menggantung',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 70,
  syarat: (S) => S.jam >= 9 && S.jam < 16.5 && S.hujan < 0.05,
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'menengok ke luar'; a.goTo('web'); }
  },
  tick(E) {
    // masuk dan keluarnya berangsur, jadi tidak ada loncatan suasana
    const p = Math.min(1, E.umur / 6) * Math.min(1, E.sisa / 6);
    MOD.luar = 1 - 0.65 * p;
    MOD.ambPlus = 0.10 * p;
    MOD.sinar = 1 - 0.8 * p;
    MOD.lampuMin = 0.55 * p;      // neon menyala di siang bolong
    pada(E, 8, () => { const a = E.aktor[0]; if (a) a.say('kayaknya turun hujan'); });
  },
},

{
  id: 'bayangan-awan-lewat',
  kelas: 'latar', bobot: B.sering, cooldown: 90, durasi: 11,
  syarat: (S) => S.luar > 0.6 && S.hujan < 0.1,
  tick(E, dt, S) {
    // berkas jendela ikut meredup saat pitanya lewat — dua efek saling menjelaskan
    const x = -140 + (E.umur / 11) * (W + 180);
    const tumpang = Math.max(0, 1 - Math.abs(x - 215) / 120);
    MOD.sinar = 1 - 0.6 * tumpang;
    E.data.x = x;
    if (tumpang > 0.7) menoleh(S.orang.filter((o) => o.station === 'web'), 212, 40, 1500);
  },
  gambarLantai(E) {
    const x = E.data.x || 0;
    ctx.globalAlpha = 0.075;
    ctx.fillStyle = '#2c3440';
    ctx.beginPath();
    ctx.moveTo(x, FLOOR_TOP); ctx.lineTo(x + 130, FLOOR_TOP);
    ctx.lineTo(x + 130 - 42, H); ctx.lineTo(x - 42, H);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  },
},

{
  id: 'sapuan-lampu-mobil-malam',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 3,
  syarat: (S) => S.lampu > 0.6,
  gambarAtas(E) {
    const x = W + 30 - (E.umur / 3) * (W + 90);
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#dfe8ff';
    ctx.fillRect(x, 0, 26, 70);
    ctx.fillRect(x + 6, 0, 20, 10);
    ctx.globalAlpha = 1;
  },
},

{
  id: 'sirene-lewat-jalan-depan',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 7,
  bentrokDengan: ['sapuan-lampu-mobil-malam'],
  syarat: (S) => !S.petir,
  tick(E, dt, S) {
    pada(E, 0.5, () => menoleh(S.orang, 212, 40, 1200));
  },
  gambarAtas(E) {
    const x = W + 40 - (E.umur / 7) * (W + 120);
    const biru = Math.sin(now / 140) > 0;
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = biru ? '#4a7fd0' : '#c22b2b';
    ctx.fillRect(x, 0, 40, 70);
    ctx.globalAlpha = 1;
    glow(x + 20, 60, 50, biru ? '#4a7fd0' : '#c22b2b', 0.12);
  },
},

{
  id: 'monas-lampu-malam-dipandangi',
  kelas: 'latar', bobot: B.sedang, cooldown: 2400, durasi: 18,
  syarat: (S) => S.lampu > 0.7 && S.hujan < 0.2,
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'memandangi Monas'; a.goTo('web'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (a && a.diam && Math.random() < 0.04) spawn('idea', a.x, a.y - 26);
  },
  gambarDinding(E) {
    klipJendela(() => {
      const py = JENDELA.y + JENDELA.h - 27;
      const d = 0.6 + 0.4 * Math.sin(now / 700);
      r(JENDELA.x + 18, py, 2, 2, '#ffd88a');
      glow(JENDELA.x + 19, py + 1, 8, '#ffd88a', 0.35 * d);
      // lampu kota menyala satu per satu dari kiri ke kanan
      const n = Math.min(12, Math.floor(E.umur / 0.3));
      for (let i = 0; i < n; i++) {
        r(JENDELA.x + 3 + i * 4, JENDELA.y + JENDELA.h - 8, 1, 1, '#ffe0a0');
      }
    });
  },
},

{
  id: 'bulan-purnama-besar',
  kelas: 'latar', bobot: B.jarang, cooldown: 5400, durasi: 90,
  syarat: (S) => S.lampu > 0.7 && S.hujan < 0.1,
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'melihat purnama'; a.goTo('web'); }
  },
  tick(E) {
    pada(E, 6, () => { const a = E.aktor[0]; if (a) a.say('purnama'); });
  },
  gambarDinding() {
    klipJendela(() => {
      const cx = JENDELA.x + 40, cy = JENDELA.y + 11;
      glow(cx, cy, 18, '#cfd8e8', 0.5);
      ctx.fillStyle = '#e8eef8';
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8d2e0';
      ctx.beginPath(); ctx.arc(cx - 2, cy - 1, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 3, cy + 2, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#cfd8e8';
      ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
  },
},

{
  id: 'layangan-nyangkut-kabel',
  kelas: 'latar', bobot: B.jarang, cooldown: 1500, durasi: 14,
  syarat: (S) => S.jam >= 10 && S.jam < 17 && S.hujan < 0.1,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 180);
    if (a) { a.doingEvent = 'melihat layangan'; a.goTo('web'); }
  },
  tick(E) {
    pada(E, 5, () => { const a = E.aktor[0]; if (a) a.say('layangan lagi…'); });
  },
  gambarDinding(E) {
    klipJendela(() => {
      const y0 = JENDELA.y + 14;
      ctx.strokeStyle = '#3a4450'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(JENDELA.x, y0); ctx.lineTo(JENDELA.x + JENDELA.w, y0 + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(JENDELA.x, y0 + 5); ctx.lineTo(JENDELA.x + JENDELA.w, y0 + 11); ctx.stroke();
      const lx = JENDELA.x + 26, ly = y0 + 3;
      r(lx, ly, 5, 3, P.red);
      r(lx, ly + 3, 5, 3, '#f4f2ec');
      for (let i = 0; i < 8; i++) {
        r(lx + 2 + Math.round(Math.sin(now / 300 + i / 2) * 2), ly + 6 + i, 1, 1, '#c9c2ae');
      }
      if (E.umur > 7) {                          // dua anak kecil menunjuk
        r(JENDELA.x + 14, JENDELA.y + JENDELA.h - 6, 2, 4, '#2c3440');
        r(JENDELA.x + 18, JENDELA.y + JENDELA.h - 5, 2, 3, '#2c3440');
      }
    });
  },
},

{
  id: 'kucing-berantem-di-parkiran',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 8,
  syarat: (S) => S.lampu > 0.7,
  tick(E, dt, S) {
    pada(E, 1, () => menoleh(S.orang, 212, 40, 2000));
    pada(E, 1.2, () => { const a = S.orang.find((o) => o.diam); if (a) a.say('berisik amat'); });
  },
  gambarDinding(E) {
    klipJendela(() => {
      const y = JENDELA.y + JENDELA.h - 6;
      const t = now / 90;
      r(JENDELA.x + 12 + Math.round(Math.sin(t) * 6), y, 4, 3, '#1a1d21');
      r(JENDELA.x + 22 + Math.round(Math.cos(t * 1.3) * 6), y, 4, 3, '#1a1d21');
    });
  },
},

{
  id: 'detak-jam-terdengar',
  kelas: 'latar', bobot: B.sedang, cooldown: 240, durasi: 4,
  syarat: (S) => S.orang.length <= 1 && now - (toolTerakhir || 0) > 30000,
  tick(E, dt, S) {
    MOD.jamDetak = true;
    MOD.ambPlus = 0.03;
    pada(E, 0.5, () => menoleh(S.orang, 168, 38, 3000));
  },
},

{
  id: 'langkah-bergema',
  kelas: 'latar', bobot: B.sedang, cooldown: 300, durasi: 4,
  syarat: (S) => S.orang.length <= 2 && S.orang.some((o) => o.path.length),
  tick(E, dt, S) {
    // jejak dobel: satu di kaki, satu bayangan yang hidup lebih lama
    for (const o of S.orang) {
      if (!o.path.length) continue;
      if (Math.random() < 0.08) {
        const p = spawn('step', o.x, o.y);
        if (p) { p.life = 1.2; p.c = '#8b9098'; }
      }
    }
  },
},

{
  id: 'lirik-jam-dinding',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 2,
  syarat: (S) => S.orang.some((o) => o.diam),
  mulai(E, S) { E.data.a = pilih(S.orang.filter((o) => o.diam)); },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    MOD.jamSorot = 1;
    pada(E, 0.2, () => hadapkan(a, 168, 38));
  },
},

{
  id: 'usap-tengkuk-lalu-lanjut',
  kelas: 'latar', bobot: B.sering, cooldown: 120, durasi: 2,
  syarat: (S) => S.orang.some((o) => o.diam && !o.eventKerja),
  mulai(E, S) { E.data.a = pilih(S.orang.filter((o) => o.diam && !o.eventKerja)); },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 0.2, () => { a.pose = 'usap'; });
    pada(E, 1.4, () => { a.pose = null; spawn('steam', a.x, a.y - 26); });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'bersiul-pelan-sendirian',
  kelas: 'latar', bobot: B.jarang, cooldown: 600, durasi: 4,
  syarat: (S) => S.sesi === 1,
  mulai(E, S) { E.data.a = [...agents.values()][0]; E.data.jumlah = S.sesi; },
  tick(E, dt, S) {
    const a = E.data.a;
    if (!a) return;
    // ada yang masuk ruangan: siulan berhenti mendadak, dia langsung menunduk
    if (S.sesi !== E.data.jumlah) { E.selesaiCepat = true; hadapkan(a, a.x, a.y + 20); return; }
    if (Math.floor(E.umur) !== E.data.n) {
      E.data.n = Math.floor(E.umur);
      const p = spawn('talk', a.x + 4, a.y - 24);
      if (p) { p.life = 1.8; p.vy = -6; }
    }
  },
},

{
  id: 'gelas-kopi-menumpuk-senior',
  kelas: 'latar', bobot: B.sedang, cooldown: 1800, durasi: 8,
  syarat: () => [...agents.values()].some((a) => Date.now() - a.sejak > 1800000)
    && RUANGAN.gelasMenumpuk < 4,
  mulai(E) {
    E.data.a = [...agents.values()].sort((x, y) => x.sejak - y.sejak)[0];
    RUANGAN.gelasMenumpuk++;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => { a.mulut = true; spawn('steam', a.x, a.y - 26); });
    pada(E, 1.6, () => { a.mulut = false; a.say('jam berapa ini...'); });
  },
  gambarProp(E) {
    const a = E.data.a;
    if (!a || a.station !== 'think') return;
    // gelas berjejer di sudut mejanya; bertambah tiap setengah jam sesi hidup
    for (let i = 0; i < RUANGAN.gelasMenumpuk; i++) {
      r(a.x - 26 + i * 5, 300, 3, 4, '#f2f0e6');
      r(a.x - 26 + i * 5, 300, 3, 1, '#c9b07a');
    }
  },
  sortY: 349,
  selesai(E) { if (E.data.a) E.data.a.mulut = false; },
},

);

