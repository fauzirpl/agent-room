/* ==========================================================================
   HEWAN TAMU — makhluk kecil yang numpang lewat
   (cicak-berburu-di-neon SENGAJA dilewati: dobel dengan cicak-di-dinding
   yang sudah ada, dua cicak dengan aturan gerak beda cuma bikin bingung)
   ========================================================================== */

daftarEvent(

{
  id: 'lalat-nabrak-kaca',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 16,
  syarat: (S) => S.luar > 0.5,
  mulai(E) {
    E.data.x = JENDELA.x + JENDELA.w / 2;
    E.data.y = JENDELA.y + JENDELA.h / 2;
    E.data.vx = pilih([-38, 38]);
    E.data.vy = pilih([-30, 30]);
  },
  tick(E, dt) {
    const D = E.data;
    if (D.keluar) { D.x += 50 * dt; return; }
    D.x += D.vx * dt; D.y += D.vy * dt;
    if (D.x < JENDELA.x + 2 || D.x > JENDELA.x + JENDELA.w - 2) { D.vx *= -1; spawn('dust', D.x, D.y); }
    if (D.y < JENDELA.y + 2 || D.y > JENDELA.y + JENDELA.h - 2) { D.vy *= -1; spawn('dust', D.x, D.y); }
    if (!D.dibantu) {
      D.dibantu = true;
      D.a = pemeranStasiun(E, 'web');
      if (D.a) { D.a.pose = 'mengipas'; D.a.say('hus! hus!'); D.tandaiPada = E.umur; }
    }
    if (D.a && D.tandaiPada != null && E.umur - D.tandaiPada > 2.6) {
      D.keluar = true;
      D.a.pose = null;
    }
  },
  gambarAtas(E) {
    if (E.data.keluar && E.data.x > JENDELA.x + JENDELA.w + 6) return;
    klipJendela(() => r(Math.round(E.data.x), Math.round(E.data.y), 1, 1, '#1c1c1c'));
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'tikus-lari-di-atas-plafon',
  kelas: 'latar', bobot: B.sedang, cooldown: 1080, durasi: 5,
  syarat: (S) => S.malam || !S.kerjaJam,
  mulai(E, S) {
    E.data.maju = 0;
    for (const o of S.orang) {
      if (o.path.length || o.eventKerja) continue;
      hadapkan(o, o.x, o.y - 200);
      o.busyUntil = Math.max(o.busyUntil, now + 1500);
    }
    const a = S.orang.find((o) => !o.path.length && !o.eventKerja);
    if (a) a.say('itu apa ya');
  },
  tick(E, dt) {
    E.data.maju += 72 * dt;
    if (Math.random() < 0.35) spawn('dust', 90 + E.data.maju, 8);
  },
  gambarDinding(E) {
    const x = 90 + E.data.maju;
    if (x > 380) return;
    r(Math.round(x) - 6, 2, 12, 2, sh(P.cream, 0.85));
  },
},

{
  id: 'tokek-berbunyi',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 14,
  syarat: (S) => S.lampu > 0.7,
  mulai(E) { E.data.n = 0; },
  tick(E) {
    pada(E, 1, () => { E.data.n = 1; });
    pada(E, 4.5, () => { E.data.n = 2; });
    pada(E, 8, () => { E.data.n = 3; });
    pada(E, 11.5, () => {
      E.data.n = 4;
      E.data.a = pemeran(E);
      if (E.data.a) E.data.a.say('tujuh!');
    });
    pada(E, 13, () => { if (E.data.a) lepaskanAktor(E.data.a); });
    const titik = [1, 4.5, 8, 11.5];
    for (const t of titik) { if (E.umur > t && E.umur < t + 0.3) { MOD.lampu *= 0.94; break; } }
  },
  gambarDinding(E) {
    if (E.data.n <= 0) return;
    ctx.globalAlpha = 0.55;
    r(20, 6, 8, 3, '#14100d');
    ctx.globalAlpha = 1;
  },
},

{
  id: 'capung-masuk-sebelum-hujan',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 12,
  syarat: (S) => CUACA.hujan > 0.2 && CUACA.hujan < 0.7,
  mulai(E) { E.data.x = 186; E.data.y = 138; E.data.fase = 'masuk'; E.data.t = 0; },
  tick(E, dt) {
    const D = E.data;
    D.t += dt;
    if (D.fase === 'masuk') {
      D.x += 26 * dt;
      D.y = 138 + Math.sin(D.t * 3) * 8;
      if (D.x > 246) { D.fase = 'hinggap'; D.t = 0; }
    } else if (D.fase === 'hinggap') {
      D.x = 246; D.y = 210;
      if (D.t > 2.5) { D.fase = 'keluar'; D.t = 0; }
    } else {
      D.x -= 30 * dt;
      D.y = 138 + Math.sin(D.t * 3) * 8;
    }
    if (!D.dibantu && D.t > 1 && D.fase === 'hinggap') {
      D.dibantu = true;
      const a = pemeran(E);
      if (a) { a.say('mau hujan nih'); a.goTo('web'); lepaskanAktor(a); }
    }
  },
  gambarProp(E) {
    const x = Math.round(E.data.x), y = Math.round(E.data.y);
    r(x, y, 3, 1, '#3e6b4f');
    r(x - 1, y - 1, 1, 1, Math.sin(now / 60) > 0 ? '#dfe8ee' : '#3e6b4f');
    r(x + 4, y - 1, 1, 1, Math.sin(now / 60 + 2) > 0 ? '#dfe8ee' : '#3e6b4f');
  },
  sortY: 200,
},

{
  id: 'kucing-di-atas-keyboard',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 25,
  perluAktor: true,
  syarat: (S) => S.bekerja.some((o) => o.station === 'think'),
  mulai(E) {
    E.data.a = pemeranStasiun(E, 'think');
    if (!E.data.a) return;
    E.data.a.pose = 'diam';
    E.data.a.bekuSampai = now + 25000;
    E.data.a.say('sabar ya, Pak Kucing');
  },
  gambarProp(E) {
    const a = E.data.a;
    if (!a) return;
    const x = Math.round(a.x), y = Math.round(a.y) - 22;
    r(x + 3, y, 8, 6, '#c9a06a');
    r(x + 3, y - 2, 2, 2, '#c9a06a'); r(x + 8, y - 2, 2, 2, '#c9a06a');
    r(x + 3 + (Math.sin(now / 90) > 0 ? 1 : 0), y + 5, 2, 1, '#c9a06a');
  },
  sortY: 349,
  selesai(E) {
    if (E.data.a) { E.data.a.pose = null; E.data.a.bekuSampai = 0; E.data.a.busyUntil += 3000; }
  },
},

{
  id: 'kucing-kantor',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 40,
  syarat: (S) => CUACA.hujan < 0.2 && S.jam > 14,
  mulai(E) { E.data.x = -10; E.data.y = LANE_DOWN; E.data.fase = 'masuk'; E.data.t = 0; E.data.jilat = 0; },
  tick(E, dt) {
    const D = E.data;
    D.t += dt;
    if (D.fase === 'masuk') {
      D.x += SPEED * 0.35 * dt;
      D.jilat += dt;
      if (D.jilat > 3.8) D.jilat = 0;
      if (D.x > 246) { D.fase = 'duduk'; D.t = 0; }
    } else if (D.fase === 'duduk') {
      if (!D.dibelai && D.t > 1) {
        D.dibelai = true;
        const a = pemeranDekat(E, D.x, D.y, 160);
        if (a) { D.a = a; a.pose = 'jongkok'; a.goToXY(D.x - 12, D.y, 'right'); }
      }
      if (D.a && D.a.diam && !D.hati) {
        D.hati = true;
        for (let i = 0; i < 3; i++) spawn('hati', D.a.x - 6, D.a.y - 30);
      }
      if (D.t > 10) {
        D.fase = 'keluar'; D.t = 0;
        if (D.a) { D.a.pose = null; lepaskanAktor(D.a); D.a = null; }
      }
    } else {
      D.x += SPEED * 0.5 * dt;
    }
  },
  gambarProp(E) {
    const D = E.data;
    const x = Math.round(D.x), y = Math.round(D.y);
    const duduk = D.fase === 'duduk';
    ctx.globalAlpha = 0.15; ctx.fillStyle = '#20301f';
    ctx.beginPath(); ctx.ellipse(x, y + 1, duduk ? 4 : 5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (duduk) {
      r(x - 3, y - 5, 6, 5, '#c9a06a');
      r(x - 4, y - 8, 4, 4, '#c9a06a');
      const ang = Math.sin(now / 220);
      r(x + 2 + Math.round(ang * 2), y - 4 - Math.round(Math.abs(ang) * 2), 1, 3, '#c9a06a');
    } else {
      r(x - 4, y - 4, 7, 4, '#c9a06a');
      r(x - 3, y - 3, 7, 1, sh('#c9a06a', 0.75));
      r(x + 3, y - 7, 4, 4, '#c9a06a');
      r(x + 3, y - 8, 1, 1, '#c9a06a'); r(x + 6, y - 8, 1, 1, '#c9a06a');
      if (D.jilat > 0 && D.jilat < 0.8) r(x + 4, y - 5, 2, 2, '#c9a06a');
      const tail = Math.round(Math.sin(now / 220) * 3);
      r(x - 5 + tail, y - 6, 2, 2, '#c9a06a');
    }
  },
  sortY: 253,
},

{
  id: 'kucing-tidur-di-rak-server',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 70,
  syarat: (S) => S.lampu > 0.5 && !S.stasiunAktif.has('server'),
  tick(E, dt, S) {
    if (S.stasiunAktif.has('server') && !E.data.diusir) { E.data.diusir = true; E.selesaiCepat = true; }
    if (!E.data.a && E.umur > 1) {
      E.data.a = pemeran(E, ['teknisi']);
      if (E.data.a) { E.data.a.doingEvent = 'mengusir kucing'; E.data.a.goTo('server'); }
    }
    if (E.data.a && E.data.a.diam && !E.data.ngomong) {
      E.data.ngomong = true;
      E.data.a.say('jangan di situ, panas');
      E.data.turunPada = E.umur + 3;
    }
    if (E.data.turunPada && E.umur > E.data.turunPada) E.selesaiCepat = true;
  },
  gambarProp() {
    const x = 388, y = 34;
    r(x, y, 9, 6, '#c9a06a');
    r(x - 1, y - 1, 4, 4, '#c9a06a');
    r(x + 8, y + 4, 1, 6, '#c9a06a');
  },
  sortY: 150,
  selesai(E) { if (E.data.a) E.data.a.doingEvent = ''; },
},

{
  id: 'kutu-lampu-neon',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 35,
  syarat: (S) => S.lampu > 0.7 && !MOD.hening,
  mulai(E) {
    E.data.cx = pilih(NEON_X); E.data.cy = 16;
    E.data.laron = [];
    for (let i = 0; i < 14; i++) E.data.laron.push(spawn('laron', E.data.cx, E.data.cy));
  },
  tick(E) {
    pada(E, 26, () => {
      for (const p of E.data.laron) { if (p.life > 0 && Math.random() < 0.5) p.g = 120; }
    });
    if (!E.data.sapu && E.umur > 30) {
      E.data.sapu = true;
      const a = pemeran(E);
      if (a) { E.data.a = a; a.bawa = 'sapu'; a.goToXY(E.data.cx, 150, 'up'); }
    }
  },
},

{
  id: 'nyamuk-sore',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 20,
  perluAktor: true,
  syarat: (S) => (S.jam > 16.5 && S.jam < 19) || sedangJalan('kutu-lampu-neon'),
  mulai(E) {
    E.data.a = pemeran(E);
    E.data.tepuk = 0;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (Math.random() < 0.05) spawn('dust', a.x + Math.sin(now / 300) * 12, a.y - 24);
    for (const t of [4, 9, 14, 19]) {
      pada(E, t, () => {
        E.data.tepuk++;
        a.pose = 'tepuk'; a.tandaTepukSampai = E.umur + 0.3;
        for (let i = 0; i < 4; i++) spawn('step', a.x, a.y - 20);
        if (E.data.tepuk >= 4) { a.say('kena!'); E.selesaiCepat = true; }
      });
    }
    if (a.tandaTepukSampai && E.umur > a.tandaTepukSampai) { a.pose = null; a.tandaTepukSampai = 0; }
  },
  gambarProp(E) {
    const a = E.data.a;
    if (!a || E.data.tepuk >= 4) return;
    const t = E.umur;
    const x = a.x + Math.sin(t * 2.4) * 8, y = a.y - 30 + Math.sin(t * 3.7) * 6;
    r(Math.round(x), Math.round(y), 1, 1, '#2c2620');
  },
  sortY: 340,
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

);
