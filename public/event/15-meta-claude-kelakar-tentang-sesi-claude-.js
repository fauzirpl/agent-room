/* ==========================================================================
   META-CLAUDE — kelakar tentang sesi Claude Code itu sendiri
   ========================================================================== */

daftarEvent(

{
  id: 'bengong-menatap-layar',
  kelas: 'latar', bobot: B.sering, cooldown: 90, durasi: 4,
  perluAktor: true,
  mulai(E) { E.data.a = pinjamAktor(E, 1, (o) => o.station === 'think')[0]; },
  tick(E) {
    pada(E, 2, () => { if (E.data.a) spawn('idea', E.data.a.x, E.data.a.y - 30); });
  },
  gambarAtas(E) {
    const a = E.data.a;
    if (a && Math.sin(now / 500) > 0) r(Math.round(a.x) + 4, Math.round(a.y) - 28, 1, 1, '#9fc3ff');
  },
},

{
  id: 'layar-server-idle-logo',
  kelas: 'latar', bobot: B.jarang, cooldown: 480, durasi: 16,
  syarat: (S) => !S.stasiunAktif.has('server'),
  tick(E, dt, S) { if (S.stasiunAktif.has('server')) E.selesaiCepat = true; },
  gambarProp(E) {
    const cx = 396, cy = 116;
    r(cx - 6, cy - 6, 12, 10, '#0c1a14');
    const ang = E.umur * 1.1;
    ctx.strokeStyle = P.amber; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a2 = ang + i * (Math.PI / 4);
      ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a2) * 4, cy + Math.sin(a2) * 4);
    }
    ctx.stroke();
  },
  sortY: 130,
},

{
  id: 'berkas-rangkap-tiga',
  kelas: 'latar', bobot: B.sedang, cooldown: 1200, durasi: 16,
  syarat: (S) => S.stasiunAktif.has('edit'),
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeranStasiun(E, 'edit');
    if (!E.data.a) return;
    E.data.a.bawa = 'map';
    E.data.a.goToXY(246, 214, 'down');
    E.data.tumpuk = [];
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.t1) {
      E.data.t1 = true;
      E.data.tumpuk.push({ x: a.x, y: a.y - 4 });
      spawn('paper', a.x, a.y - 20);
      a.goToXY(54, 132, 'up');
    } else if (a.diam && E.data.t1 && !E.data.t2) {
      E.data.t2 = true;
      E.data.tumpuk.push({ x: a.x, y: a.y - 4 });
      spawn('paper', a.x, a.y - 20);
      a.goToXY(286, 140, 'up');
    } else if (a.diam && E.data.t2 && !E.data.t3) {
      E.data.t3 = true;
      E.data.tumpuk.push({ x: a.x, y: a.y - 4 });
    }
  },
  gambarProp(E) {
    for (const t of (E.data.tumpuk || [])) r(Math.round(t.x) - 3, Math.round(t.y), 6, 2, P.paper);
  },
  sortY: 210,
  selesai(E) { if (E.data.a) E.data.a.bawa = null; },
},

{
  id: 'cap-ulang-tiga-kali',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 10,
  syarat: (S) => S.stasiunAktif.has('edit'),
  perluAktor: true,
  mulai(E) { E.data.a = pemeranStasiun(E, 'edit'); },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => hentakkanStempel(a));
    pada(E, 3, () => {
      for (let i = 0; i < 5; i++) spawn('lempar', a.x + 9, a.y - 14);
      E.data.sampahAda = true;
      RUANGAN.propLantai.push({ x: 344, y: 286, jenis: 'kertas-bekas' });
    });
    pada(E, 5, () => hentakkanStempel(a));
    pada(E, 7, () => { hentakkanStempel(a); for (let i = 0; i < 4; i++) spawn('lempar', a.x + 9, a.y - 14); });
    pada(E, 8, () => { a.pose = 'tepuk'; a.say('nah, lurus'); });
  },
  selesai(E) {
    if (E.data.a) E.data.a.pose = null;
    if (E.data.sampahAda) {
      const i = RUANGAN.propLantai.findIndex((p) => p.jenis === 'kertas-bekas');
      if (i >= 0) RUANGAN.propLantai.splice(i, 1);
    }
  },
},

{
  id: 'map-setebal-bantal',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 26,
  syarat: (S) => S.stasiunAktif.has('read'),
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeranStasiun(E, 'read');
    if (!E.data.a) return;
    E.data.a.bawa = 'kardus';
    E.data.a.laju = 0.5;
    E.data.a.say('ini semua dibaca?');
    E.data.a.goTo('think');
    E.data.tinggi = 5;
  },
  tick(E, dt) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.taruh) { E.data.taruh = true; a.bawa = null; }
    if (E.data.taruh && E.data.tinggi > 1) {
      E.data.sortirT = (E.data.sortirT || 0) + dt;
      if (E.data.sortirT > 2) { E.data.sortirT = 0; E.data.tinggi--; spawn('dust', 440, 210); spawn('dust', 444, 208); }
    }
  },
  gambarProp(E) {
    if (!E.data.taruh) return;
    const a = E.data.a;
    const x = Math.round(a.x), y = Math.round(a.y) - 14;
    for (let i = 0; i < E.data.tinggi; i++) r(x - 4, y - i * 3, 9, 3, i % 2 ? '#c9a03a' : '#d9b96a');
  },
  sortY: 349,
  selesai(E) { if (E.data.a) { E.data.a.laju = 1; E.data.a.bawa = null; } },
},

{
  id: 'nota-mentok-di-standby',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 20,
  syarat: (S) => S.orang.length >= 3 && S.orang.some((o) => o.standby),
  mulai(E, S) {
    const sb = S.orang.find((o) => o.standby && bisaDipinjam(o));
    if (!sb) { E.selesaiCepat = true; return; }
    const lain = pinjamAktor(E, 1, (o) => !o.standby);
    if (!lain.length) { E.selesaiCepat = true; return; }
    sb.eventKerja = E; sb.betahAsli = sb.betah; sb.betah = true; E.aktor.push(sb);
    E.data.b = sb;
    E.data.a = lain[0];
    E.data.a.goToXY(sb.x - 12, sb.y, 'right');
  },
  tick(E) {
    const { a, b } = E.data;
    if (!a || !b) return;
    if (a.diam && !E.data.serah) {
      E.data.serah = true;
      spawn('paper', b.x, b.y - 24);
      E.data.diamPada = E.umur;
    }
    if (E.data.serah && !E.data.ambil && E.umur - E.data.diamPada > 5) {
      E.data.ambil = true;
      spawn('paper', b.x, b.y - 24);
      a.goTo('edit');
      a.say('paraf saya saja deh');
    }
    if (E.data.ambil && a.diam && !E.data.cap) {
      E.data.cap = true;
      spawn('ink', a.x + 9, a.y - 14);
    }
  },
},

{
  id: 'saling-tunggu-notulen',
  kelas: 'latar', bobot: B.sedang, cooldown: 540, durasi: 14,
  syarat: (S) => S.orang.filter((o) => o.station === 'rapat').length >= 2,
  tick(E, dt, S) {
    if (!E.data.pair) {
      const duduk = S.orang.filter((o) => o.station === 'rapat' && o.diam && !o.eventKerja);
      if (duduk.length < 2) return;
      const rank = (o) => JABATAN.findIndex((j) => j.id === o.peran);
      E.data.pair = duduk.slice(0, 2).sort((x, y) => rank(y) - rank(x));   // [0] = paling junior
      E.data.pair[0].say('notulennya siapa ya?');
    }
    const [junior] = E.data.pair;
    pada(E, 11, () => { junior.pose = 'angkat'; spawn('ink', junior.x, junior.y - 16); junior.say('tadi katanya Mas...'); });
  },
  selesai(E) { if (E.data.pair) for (const a of E.data.pair) a.pose = null; },
},

{
  id: 'serah-terima-map-antar-bidang',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 12,
  syarat: (S) => S.stasiunAktif.has('rapat'),
  perluAktor: true,
  mulai(E, S) {
    const penerima = S.orang.find((o) => o.station === 'rapat' && o.diam);
    if (!penerima) return;
    const lain = pinjamAktor(E, 1, (o) => o.station !== 'rapat');
    if (!lain.length) return;
    E.data.penerima = penerima;
    E.data.a = lain[0];
    E.data.a.bawa = 'map';
    E.data.a.goToXY(penerima.x - 14, penerima.y, 'right');
  },
  tick(E) {
    const { a, penerima } = E.data;
    if (!a || !penerima) return;
    if (a.diam && !E.data.serah) {
      E.data.serah = true;
      spawn('idea', penerima.x, penerima.y - 24);
      spawn('idea', a.x, a.y - 24);
      a.bawa = null;
      a.say('tolong dilanjutkan');
    }
  },
  selesai(E) { if (E.data.a) E.data.a.bawa = null; },
},

{
  id: 'sesi-hilang-tanpa-pamit',
  kelas: 'latar', bobot: B.jarang, cooldown: 780, durasi: 22,
  syarat: (S) => S.orang.filter((o) => o.station === 'think' && o.diam).length >= 2,
  mulai(E, S) {
    const dipakai = new Set(S.orang.filter((o) => o.station === 'think' && o.diam).map((o) => o.slotIdx));
    let slot = -1;
    for (let i = 0; i < MEJA_KERJA_X.length; i++) { if (!dipakai.has(i)) { slot = i; break; } }
    if (slot < 0) { E.selesaiCepat = true; return; }
    E.data.slot = slot;
  },
  tick(E, dt, S) {
    if (E.data.slot == null) return;
    MOD.mejaHantu = E.data.slot;
    if (!E.data.a && E.umur > 3) {
      const dekat = pinjamAktor(E, 1, (o) => o.station === 'think');
      if (dekat.length) {
        E.data.a = dekat[0];
        E.data.a.doingEvent = 'menutup laptop yang ditinggal';
        E.data.a.goToXY(MEJA_KERJA_X[E.data.slot] + 21, 316, 'down');
      }
    }
    if (E.data.a && E.data.a.diam && !E.data.tutup) {
      E.data.tutup = true;
      E.data.a.say('ditinggal lagi');
      E.data.selesaiPada = E.umur + 2;
    }
    if (E.data.selesaiPada && E.umur > E.data.selesaiPada) E.selesaiCepat = true;
  },
  selesai(E) { if (E.data.a) E.data.a.doingEvent = ''; },
},

{
  id: 'undangan-belum-bubar',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 12,
  syarat: () => peserta.some((p) => p.diam && p.station === 'rapat' && now - p.arrivedAt > 120000),
  mulai(E) {
    E.data.p = peserta.find((p) => p.diam && p.station === 'rapat' && now - p.arrivedAt > 120000);
    if (!E.data.p) { E.selesaiCepat = true; return; }
  },
  tick(E) {
    const p = E.data.p;
    if (!p || p.station !== 'rapat') { E.selesaiCepat = true; return; }
    if (Math.random() < 0.06) spawn('glyph', p.x, p.y - 26, '#8b8f86');
    if (!E.data.a && E.umur > 2) {
      const a = pinjamAktor(E, 1);
      if (a.length) { E.data.a = a[0]; E.data.a.goToXY(p.x, p.y - 20, 'down'); }
    }
    if (E.data.a && E.data.a.diam && !E.data.tegur) {
      E.data.tegur = true;
      E.data.a.say('rapatnya sudah selesai, Mas');
      p.say('nunggu notulen dulu');
    }
  },
},

);
