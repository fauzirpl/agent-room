/* ==========================================================================
   EASTER EGG — lanjutan gelombang 2
   ========================================================================== */

daftarEvent(

{
  id: 'bolpoin-jatuh-ke-kolong',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 6,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => o.station === 'think')[0];
    if (!a) return;
    E.data.a = a;
    a.pose = 'jongkok';
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 4, () => { a.say('lho, di kuping'); a.pulpenDiTelinga = true; spawn('idea', a.x, a.y - 24); });
    pada(E, 4.5, () => { a.pose = null; });
  },
  gambarLantai(E) {
    const a = E.data.a;
    if (!a || E.umur > 4) return;
    r(Math.round(a.x) - 6, Math.round(a.y) - 2, 1, 2, '#1c4e8a');
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'huruf-spanduk-lepas',
  kelas: 'latar', bobot: B.jarang, cooldown: 3000, durasi: 4,
  syarat: () => !RUANGAN.spanduk,
  mulai() {
    const teks = 'DINAS AI KLOD';
    let idx = new Date().getHours() % teks.length;
    while (teks[idx] === ' ') idx = (idx + 1) % teks.length;
    RUANGAN.spanduk = { hilang: idx, tempel: -1 };
    spawn('paper', 24 + idx * 4.2, 22, '#f0ede2');
  },
},

{
  id: 'kursi-kepala-dicoba-magang',
  kelas: 'latar', bobot: B.jarang, cooldown: 2400, durasi: 9,
  syarat: (S) => !S.orang.some((o) => o.station === 'rapat') && S.orang.some((o) => o.peran === 'magang' && bisaDipinjam(o)),
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['magang']);
    if (!a) return;
    E.data.a = a;
    a.goTo('rapat');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.duduk) { E.data.duduk = true; spawn('idea', a.x, a.y - 26, P.amber); a.say('sebentar saja'); }
    if (E.umur > 8 && E.umur < 8.6) MOD.pintuKadis = true;
    pada(E, 8.3, () => { a.say('eh permisi'); a.laju = 1.8; a.goTo('think'); });
  },
  selesai(E) { if (E.data.a) E.data.a.laju = 1; },
},

{
  id: 'lupa-mau-ngapain',
  kelas: 'latar', bobot: B.jarang, cooldown: 600, durasi: 4,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => o.station === 'think')[0];
    if (!a) return;
    E.data.a = a; E.data.balikX = a.x; E.data.balikY = a.y;
    a.goToXY(a.x + (a.face === 'left' ? -8 : 8), a.y, a.face);
    E.data.tahap = 1;
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && E.data.tahap === 1) {
      E.data.tahap = 2;
      a.say('tadi mau apa ya');
      spawn('talk', a.x, a.y - 24);
    }
    pada(E, 1.5, () => { if (E.data.tahap === 2) { a.goToXY(E.data.balikX, E.data.balikY, null); E.data.tahap = 3; } });
  },
},

{
  id: 'magang-salah-sebut-jabatan',
  kelas: 'latar', bobot: B.jarang, cooldown: 840, durasi: 9,
  syarat: (S) => S.orang.some((o) => o.peran === 'magang') && S.orang.some((o) => ['kadis', 'sekdis', 'kabid'].includes(o.peran)),
  mulai(E, S) {
    const magang = S.orang.find((o) => o.peran === 'magang' && bisaDipinjam(o));
    const pejabat = S.orang.find((o) => ['kadis', 'sekdis', 'kabid'].includes(o.peran) && bisaDipinjam(o));
    if (!magang || !pejabat) { E.selesaiCepat = true; return; }
    magang.eventKerja = E; magang.betahAsli = magang.betah; magang.betah = true; E.aktor.push(magang);
    pejabat.eventKerja = E; pejabat.betahAsli = pejabat.betah; pejabat.betah = true; E.aktor.push(pejabat);
    E.data.magang = magang; E.data.pejabat = pejabat;
    const lain = JABATAN.filter((j) => j.id !== pejabat.peran && ['kadis', 'sekdis', 'kabid', 'kasi'].includes(j.id));
    const salah = pilih(lain.length ? lain : JABATAN);
    magang.say('pagi Pak ' + salah.singkat);
    E.data.tanya = true;
  },
  tick(E) {
    const { magang, pejabat } = E.data;
    if (!magang || !pejabat) return;
    pada(E, 3.5, () => { magang.say('...eh, Pak ' + jabatanDari(pejabat.peran).singkat + ', maaf'); });
    pada(E, 4, () => { pejabat.mulut = true; });
    pada(E, 5, () => { pejabat.mulut = false; });
  },
  gambarAtas(E) {
    if (!E.data.tanya || E.umur > 3.5) return;
    const p = E.data.pejabat;
    r(Math.round(p.x) + 3, Math.round(p.y) - 34, 3, 5, '#ffb454');
  },
},

{
  id: 'monitor-crt-bergaris',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 25,
  tick(E, dt, S) {
    MOD.crtAktif = true;
    if (!E.data.ditepuk && E.umur > 4) {
      const dekat = S.orang.find((o) => o.path.length && Math.abs(o.x - 160) < 40 && o.y < 170);
      if (dekat && Math.random() < 0.02) {
        E.data.ditepuk = true;
        E.data.tenangSampai = E.umur + 20;
        spawn('dust', 168, 48); spawn('dust', 170, 46);
      }
    }
    if (E.data.tenangSampai && E.umur < E.data.tenangSampai) MOD.crtAktif = false;
  },
},

{
  id: 'stapler-kosong-njepret',
  kelas: 'latar', bobot: B.jarang, cooldown: 480, durasi: 10,
  syarat: (S) => S.stasiunAktif.has('edit') || S.stasiunAktif.has('web'),
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeranStasiun(E, 'edit') || pemeranStasiun(E, 'web');
    if (E.data.a) E.data.a.say('isinya habis');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1.5, () => { a.doingEvent = 'ambil isi stapler'; a.goTo('read'); });
    if (E.umur > 1.5 && a.diam && a.station === 'read' && !E.data.balik) {
      E.data.balik = true;
      spawn('dust', a.x, a.y - 20);
      a.goTo('web');
    }
  },
  selesai(E) { if (E.data.a) E.data.a.doingEvent = ''; },
},

{
  id: 'ubin-retak-kesandung',
  kelas: 'latar', bobot: B.sering, cooldown: 20, durasi: 1,
  syarat: (S) => S.orang.some((o) => o.path.length && !o.miring),
  mulai(E, S) {
    const calon = S.orang.filter((o) => o.path.length && !o.miring);
    if (!calon.length) { E.selesaiCepat = true; return; }
    const a = pilih(calon);
    E.data.a = a;
    a.miring = true;
    for (let i = 0; i < 4; i++) spawn('dust', a.x, a.y);
    if (Math.random() < 0.3) a.say('aduh');
    menoleh(S.orang.filter((o) => o !== a && jarakKe(o, a.x, a.y) < 40), a.x, a.y, 800);
  },
  selesai(E) { if (E.data.a) E.data.a.miring = false; },
},

{
  id: 'cctv-menyapu-ruangan',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 18,
  tick(E, dt, S) {
    const frac = (E.umur % 9) / 9;
    const t = frac < 0.5 ? frac * 2 : (1 - frac) * 2;
    E.data.sapuX = 466 - t * 400;
    if (!E.data.melambai) {
      const kena = S.orang.find((o) => !o.adaTugas && o.y > 100 && Math.abs(o.x - E.data.sapuX) < 26);
      if (kena) {
        E.data.melambai = kena;
        kena.pose = 'salam';
        kena.say('Halo, Pak Kadis, kalau lagi lihat');
        E.data.lambaiSampai = E.umur + 1.2;
      }
    }
    if (E.data.melambai && E.data.lambaiSampai && E.umur > E.data.lambaiSampai) { E.data.melambai.pose = null; E.data.melambai = null; }
  },
  gambarLantai(E) {
    const x = E.data.sapuX == null ? 466 : E.data.sapuX;
    ctx.globalAlpha = 0.06;
    ctx.beginPath();
    ctx.moveTo(466, 18);
    ctx.lineTo(x - 30, 356); ctx.lineTo(x + 30, 356);
    ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.globalAlpha = 1;
  },
  selesai(E) { if (E.data.melambai) E.data.melambai.pose = null; },
},

{
  id: 'cicak-jatuh',
  kelas: 'latar', bobot: B.langka, cooldown: 1800, durasi: 13,
  syarat: (S) => S.stasiunAktif.has('edit'),
  mulai(E) { E.data.x = 110; E.data.y = 62; E.data.jeda = 0.8; },
  tick(E, dt) {
    const D = E.data;
    if (!D.jatuh) {
      D.jeda -= dt;
      if (D.jeda <= 0) { D.x += 20; D.jeda = 0.8; }
      if (D.x >= 270) D.jatuh = true;
    } else {
      D.vy = (D.vy || 0) + 240 * dt;
      D.y += D.vy * dt;
      if (D.y >= 112) {
        D.y = 112;
        if (!D.mendarat) {
          D.mendarat = true;
          const a = pemeranStasiun(E, 'edit');
          if (a) { E.data.a = a; a.miring = true; a.say('aduh!'); E.data.selesaiPada = E.umur + 3; }
        }
      }
      D.x -= 12 * dt;
    }
    if (E.data.selesaiPada && E.umur > E.data.selesaiPada && E.data.a) { E.data.a.miring = false; E.data.a = null; }
  },
  gambarDinding(E) {
    if (E.data.jatuh) return;
    const x = Math.round(E.data.x);
    r(x, 62, 4, 2, '#8a8070'); r(x + 4, 61, 2, 2, '#8a8070');
  },
  gambarProp(E) {
    if (!E.data.jatuh) return;
    r(Math.round(E.data.x), Math.round(E.data.y), 4, 2, '#8a8070');
  },
  sortY: 120,
  selesai(E) { if (E.data.a) E.data.a.miring = false; },
},

{
  id: 'gerhana-sebagian',
  kelas: 'panggung', bobot: B.langka, cooldown: 10800, durasi: 80,
  syarat: (S) => S.jam > 10 && S.jam < 14 && S.luar > 0.7 && CUACA.hujan < 0.1,
  mulai(E) {
    E.data.orang = pinjamAktor(E, 3);
    E.data.orang.forEach((a, i) => a.goToXY(200 + i * 14, 138, 'up'));
  },
  tick(E) {
    const jarak = Math.abs(E.umur - 40);
    const inten = Math.max(0, 1 - jarak / 34);
    MOD.luar = 1 - inten * 0.55;
    MOD.ambPlus = inten * 0.16;
    MOD.lampuMin = inten > 0.3 ? 0.6 : 0;
    pada(E, 8, () => { for (const a of E.data.orang) a.bawa = 'hp'; });
  },
  gambarAtas(E) {
    const A = ambien();
    if (A.luar < 0.06) return;
    const tJ = (A.jam - 5.7) / 12.6;
    if (tJ < 0 || tJ > 1) return;
    const mx = JENDELA.x + 5 + (JENDELA.w - 10) * tJ;
    const my = JENDELA.y + JENDELA.h - 13 - Math.sin(tJ * Math.PI) * (JENDELA.h - 20);
    const tutup = Math.min(0.7, Math.max(0, 1 - Math.abs(E.umur - 40) / 34) * 0.7);
    if (tutup <= 0.02) return;
    klipJendela(() => r(Math.round(mx - 1 - tutup * 3), Math.round(my - 1), Math.max(1, Math.round(tutup * 3)), 3, A.atas));
  },
  selesai(E) { for (const a of E.data.orang) a.bawa = null; },
},

{
  id: 'map-tertukar-ditukar-balik',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 4,
  perluAktor: true,
  syarat: (S) => !S.orang.some((o) => o.station === 'rapat'),
  mulai(E) {
    const dua = pinjamAktor(E, 2);
    if (dua.length < 2) return;
    E.data.a = dua[0]; E.data.b = dua[1];
    E.data.a.goToXY(240, 254, 'right');
    E.data.b.goToXY(252, 254, 'left');
  },
  tick(E) {
    const { a, b } = E.data;
    if (!a || !b) return;
    if (a.diam && b.diam && !E.data.tukar) {
      E.data.tukar = true;
      spawn('talk', 246, 250);
    }
  },
},

{
  id: 'salah-duduk-kursi-kadis',
  kelas: 'latar', bobot: B.jarang, cooldown: 600, durasi: 9,
  syarat: (S) => S.orang.some((o) => o.peran === 'kadis') && S.orang.some((o) => o.station === 'rapat' && o.slotIdx === 0 && o.peran !== 'kadis'),
  mulai(E, S) {
    const salah = S.orang.find((o) => o.station === 'rapat' && o.slotIdx === 0 && o.peran !== 'kadis');
    if (!salah) { E.selesaiCepat = true; return; }
    salah.eventKerja = E; salah.betahAsli = salah.betah; salah.betah = true; E.aktor.push(salah);
    E.data.salah = salah;
    const sebelah = pinjamAktor(E, 1, (o) => o.station === 'rapat' && o.slotIdx === 1);
    E.data.sebelah = sebelah[0];
  },
  tick(E) {
    const { salah, sebelah } = E.data;
    if (!salah) return;
    pada(E, 3, () => { if (sebelah) sebelah.say('itu kursi Pak Kadis'); });
    pada(E, 4, () => {
      salah.say('eh, maaf');
      const baru = slotBebas('rapat', salah);
      if (baru >= 0) { salah.slotIdx = baru; salah.goTo('rapat'); }
      else salah.goTo('think');
    });
  },
  gambarAtas(E) {
    if (E.umur < 3 || E.umur > 4 || !E.data.sebelah) return;
    const s = E.data.sebelah;
    r(Math.round(s.x) + 3, Math.round(s.y) - 34, 2, 5, '#e8d873');
  },
},

{
  id: 'salah-ketik-nama-kadis',
  kelas: 'latar', bobot: B.langka, cooldown: 5400, durasi: 12,
  lanjutan: [{ id: 'numpang-print', peluang: 1 }],
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeranStasiun(E, 'web') || pemeran(E);
    if (!E.data.a) return;
    E.data.a.bawa = 'kertas';
    E.data.a.goTo('think');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.baca) {
      E.data.baca = true;
      a.say('astaga, nama Pak Kadis kurang satu huruf');
      a.laju = 1.5;
      a.goToXY(439, 276, 'down');
    }
    // Dulu "x > 340": arahnya pasti dari kiri karena tong-nya jauh dari
    // meja kerja manapun. Sekarang tong ada di pantry (x439) yang lebih
    // dekat ke sebagian meja -- jarak ke target, bukan ambang satu arah,
    // supaya tetap benar dari kedua sisi.
    if (E.data.baca && a.diam && Math.abs(a.x - 439) < 10 && !E.data.buang) {
      E.data.buang = true;
      for (let i = 0; i < 4; i++) spawn('paper', 439, 276);
      a.bawa = null;
      a.laju = 1;
      a.goTo('web');
    }
  },
  selesai(E) { if (E.data.a) { E.data.a.laju = 1; E.data.a.bawa = null; } },
},

);
