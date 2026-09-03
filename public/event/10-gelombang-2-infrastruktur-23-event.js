/* ==========================================================================
   GELOMBANG 2 — INFRASTRUKTUR (23 event)
   ========================================================================== */

daftarEvent(

{
  id: 'absensi-ngambek',
  kelas: 'latar', bobot: B.sedang, cooldown: 420, durasi: 10,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'mencoba absen sidik jari';
    a.goToXY(424, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    RUANGAN.absensiMerah = false;
    if (!a || !a.diam) return;
    // tiga percobaan, gagal terus; keempat menyerah ke buku manual
    for (let i = 0; i < 3; i++) {
      pada(E, 1 + i * 1.4, () => { a.pose = 'angkat'; E.data.merahSampai = E.umur + 0.3; spawn('ink', 428, 104, '#c22b2b'); });
      pada(E, 1.6 + i * 1.4, () => { a.pose = null; });
    }
    if (E.umur < (E.data.merahSampai || 0)) RUANGAN.absensiMerah = true;
    pada(E, 6, () => { a.doingEvent = 'menulis absen manual'; a.goToXY(452, 152, 'up'); });
    pada(E, 8, () => { a.say('manual saja lah'); });
  },
  selesai(E) { RUANGAN.absensiMerah = false; if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'ember-ac-penuh',
  kelas: 'latar', bobot: B.sedang, cooldown: 240, durasi: 30,
  syarat: () => RUANGAN.emberIsi >= 88,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['teknisi', 'pranata_muda', 'magang']);
    if (!a) return;
    a.doingEvent = 'membuang air ember';
    a.goToXY(347, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 2, () => { a.pose = 'jongkok'; a.say('penuh lagi embernya.'); });
    pada(E, 4, () => {
      a.pose = null;
      RUANGAN.emberDiangkat = true;
      a.doingEvent = 'membuang ke kamar mandi';
      a.goToXY(452, 152, 'up');
    });
    pada(E, 8, () => { a.alpha = 0; });
    pada(E, 12, () => { a.alpha = 1; RUANGAN.emberIsi = 0; a.goToXY(347, 152, 'up'); });
    pada(E, 16, () => { RUANGAN.emberDiangkat = false; });
  },
  selesai(E) {
    RUANGAN.emberDiangkat = false;
    if (E.aktor[0]) { E.aktor[0].pose = null; E.aktor[0].alpha = 1; }
  },
},

/* Standalone, bukan rantai dari mati-lampu-sekejap: mekanisme lanjutan()
   memakai peluang statis, tidak bisa membaca jam saat itu juga. Efek genset
   dan pembatasan slot rak jadi kejadian sendiri yang berdiri sendiri. */
{
  id: 'genset-nyala',
  kelas: 'latar', bobot: B.langka, cooldown: 1800, durasi: 30,
  syarat: (S) => S.jam < 9 || S.jam >= 15.5,
  mulai(E) {
    E.data.slotAsli = STATIONS.server.slots;
    STATIONS.server.slots = 2;                 // beban dibatasi selama genset
    const a = pemeranDekat(E, 212, 164, 220);
    if (a) { a.doingEvent = 'menengok ke luar'; a.goTo('web'); }
  },
  tick(E) {
    MOD.lampu = 0.6;
    MOD.getar = E.umur < 3 ? 1 : 0;
    const a = E.aktor[0];
    if (a && a.diam) pada(E, 3, () => a.say('genset masuk, jangan nyalakan yang berat dulu'));
  },
  selesai(E) { STATIONS.server.slots = E.data.slotAsli || 4; },
},

{
  id: 'plafon-melendut-noda-air',
  kelas: 'latar', bobot: B.jarang, cooldown: 2700, durasi: 20,
  syarat: () => CUACA.hujanTinggiSejak && Date.now() - CUACA.hujanTinggiSejak < 900000 && RUANGAN.nodaPlafon.length < 3,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['arsiparis', 'magang']);
    if (!a) return;
    a.doingEvent = 'menengadah ke plafon';
    a.goToXY(54, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 3, () => a.say('aduh, tembus lagi'));
    if (Math.random() < 0.04) spawn('dust', 60, 6, '#cbb897');
    pada(E, 8, () => {
      RUANGAN.nodaPlafon.push({ x: 40 + RUANGAN.nodaPlafon.length * 14, w: 12 });
    });
  },
},

{
  id: 'wifi-megap-megap',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 22,
  mulai(E) {
    const a = pemeran(E, ['teknisi', 'pranata_muda']);
    if (a) { a.doingEvent = 'menggoyang kabel UTP'; a.goTo('server'); }
  },
  tick(E) {
    if (Math.random() < 0.2) {
      const p = spawn('ping', 390, 122);
      if (p) { p.vy = 12; p.life = 0.35; }        // paket gugur, bukan naik
    }
    const a = E.aktor[0];
    if (a && a.diam) {
      a.pose = 'angkat';
      pada(E, 6, () => {
        E.data.pulih = true; a.pose = null;
        for (let i = 0; i < 8; i++) spawn('data', 390, 122);
      });
    }
    pada(E, 2, () => a.say('sabar, lagi lemot'));
  },
  gambarProp(E) {
    for (let i = 0; i < 3; i++) {
      const radius = 4 + i * 3;
      const hidup = E.data.pulih || Math.floor(now / 600) % 3 <= i;
      ctx.strokeStyle = hidup ? '#7ee787' : sh('#7ee787', 0.28);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(400, 28, radius, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
  },
  sortY: 27,
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'ac-bocor-deras',
  kelas: 'latar', bobot: B.sering, cooldown: 120, durasi: 18,
  syarat: (S) => S.jam >= 11 && S.jam < 16,
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, 347, 164, 220);
    if (a) { a.doingEvent = 'mengosongkan ember darurat'; a.goToXY(347, 152, 'up'); }
  },
  tick(E) {
    MOD.drip = 0.35;                             // 4-5 tetes sekaligus di udara
    const a = E.aktor[0];
    if (a && a.diam) {
      pada(E, 14, () => { a.pose = 'jongkok'; a.say('filternya belum dicuci dari tahun lalu'); });
      pada(E, 17, () => { RUANGAN.emberIsi = Math.max(0, RUANGAN.emberIsi - 30); a.pose = null; });
    }
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'ac-mati-ruangan-panas',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1200, durasi: 60,
  syarat: (S) => S.jam >= 10 && S.jam < 16,
  mulai(E) {
    pinjamAktor(E, 2).forEach((a, i) => {
      a.doingEvent = 'mengibas dengan map';
      a.bawa = 'map';
      a.pose = 'kipas';
      a.goToXY(386 + i * 28, LANE_DOWN, 'up');
    });
  },
  tick(E) {
    MOD.acMati = true;
    MOD.drip = 99999;                              // tetesan berhenti total
    MOD.ambPlus = Math.min(0.1, MOD.ambPlus + 0.002);
    MOD.kipasSapu = 5;
    pada(E, 4, () => { const a = E.aktor[0]; if (a) a.say('freonnya habis, sudah dilaporkan bulan lalu'); });
  },
  selesai(E) { for (const a of E.aktor) { a.pose = null; a.bawa = null; } },
},

{
  id: 'genset-uji-bulanan',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 20,
  syarat: (S) => S.jam >= 8 && S.jam < 9,
  bentrokDengan: ['mati-lampu-sekejap'],
  tick(E, dt, S) {
    MOD.getar = E.umur < 8 ? 1.4 : 0;
    if (E.umur < 8 && Math.random() < 0.3) spawn('dust', acak(20, W - 20), 12);
    pada(E, 0.3, () => menoleh(S.orang, 240, 0, 1000));
    pada(E, 6, () => { const a = pemeranDekat(E, 390, 164, 220); if (a) { a.doingEvent = 'memeriksa beban UPS'; a.goTo('server'); } });
    pada(E, 8, () => { const a = E.aktor[0]; if (a) a.say('uji genset, tiap tanggal muda'); });
  },
  gambarDinding(E) {
    if (E.umur > 12) return;
    // kepulan asap tipis di balik siluet kota, naik lalu memudar
    klipJendela(() => {
      const y = JENDELA.y + JENDELA.h - 6 - E.umur * 2;
      ctx.globalAlpha = Math.max(0, 0.2 - E.umur * 0.015);
      r(JENDELA.x + 10, y, 8, 4, '#8a8f92');
      ctx.globalAlpha = 1;
    });
  },
},

{
  id: 'gorden-lepas-kait',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 26,
  syarat: (S) => S.luar > 0.6,
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 200);
    if (a) { a.doingEvent = 'silau kena cahaya'; a.goTo('web'); }
  },
  tick(E) {
    MOD.gordenLepas = true;
    MOD.sinar = 1.4;
    const a = E.aktor[0];
    if (a && a.diam) {
      pada(E, 1, () => { a.pose = 'usap'; a.say('silau, Mas.'); });
      pada(E, 3, () => { a.pose = null; a.goToXY(a.x + 12, a.y, a.face); });
    }
    pada(E, 8, () => {
      const b = pemeranDekat(E, 212, 164, 220);
      if (b) { b.doingEvent = 'mengaitkan gorden'; b.pose = 'duaangkat'; b.goToXY(212, 148, 'up'); E.data.b = b; }
    });
    pada(E, 14, () => { if (E.data.b) E.data.b.pose = null; MOD_selesaiGorden(E); });
  },
  gambarDinding(E) {
    if (E.umur > (E.data.tutup || 999)) return;
    r(178, 18, 6, 20, '#5f9068');            // ujung kain melorot, kaca lebih terbuka
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'internet-putus-cari-sinyal',
  kelas: 'panggung', bobot: B.jarang, cooldown: 900, durasi: 30,
  lanjutan: [{ id: 'blink-storm-switch', peluang: 0.25 }],
  mulai(E, S) {
    pinjamAktor(E, 2).forEach((a, i) => {
      a.doingEvent = 'mencari sinyal';
      a.bawa = 'hp';
      a.pose = 'hp';
      a.goTo('web');
    });
    const c = pemeran(E, ['teknisi', 'pranata_muda']);
    if (c) { c.doingEvent = 'mencabut-colok modem'; c.pose = 'jongkok'; c.goTo('server'); }
  },
  tick(E) {
    MOD.internetMati = E.umur < 28;
    for (const a of E.aktor) {
      if (a.bawa === 'hp' && Math.floor(now / 3000) !== a._putar) {
        a._putar = Math.floor(now / 3000);
        a.face = a.face === 'left' ? 'right' : 'left';
      }
    }
    pada(E, 28, () => {
      for (let i = 0; i < 6; i++) spawn('ping', 390, 122);
      for (const a of E.aktor) { a.pose = null; a.bawa = null; }
      const a = E.aktor[0]; if (a) a.say('sudah nyala lagi! jangan disentuh dulu');
    });
  },
  selesai(E) { for (const a of E.aktor) { a.pose = null; a.bawa = null; } },
},

{
  id: 'jam-dinding-mati',
  kelas: 'latar', bobot: B.langka, cooldown: 2400, durasi: 75,
  syarat: () => !RUANGAN.jamBeku,
  mulai(E) {
    const d = new Date();
    const mn = (d.getMinutes() + d.getSeconds() / 60) / 60;
    RUANGAN.jamBeku = { hr: ((d.getHours() % 12) + mn) / 12, mn, sc: d.getSeconds() / 60 };
  },
  tick(E, dt, S) {
    MOD.jamGetar = E.umur < 10;
    pada(E, 1, () => menoleh(S.orang.filter((o) => o.diam), 168, 38, 1200));
    if (E.umur > 55 && !E.data.mulaiPerbaikan) {
      const a = pemeranDekat(E, 168, 164, 220);
      if (a) {
        E.data.mulaiPerbaikan = true;
        E.data.a = a;
        a.doingEvent = 'mengganti baterai jam';
        a.pose = 'angkat';
        a.goToXY(168, 152, 'up');
      }
    }
    if (E.data.a && E.data.a.diam) {
      pada(E, 61, () => {
        const d = new Date();
        const mn2 = (d.getMinutes() + d.getSeconds() / 60) / 60;
        RUANGAN.jamBeku = null;                  // ikut jam nyata lagi
        E.data.a.pose = null;
      });
    }
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

/* Bukaan jendela belum dimodelkan sebagai state geometri (kusennya statis di
   drawWindow) — membuatnya dari nol berarti proyek sendiri. Disederhanakan:
   dua orang mendorong serempak, hentakan debu, TANPA menyimpan status
   "jendela terbuka" yang permanen. */
{
  id: 'jendela-macet-didorong-berdua',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 16,
  syarat: (S) => S.luar > 0.8 && S.jam >= 12 && S.jam < 14,
  mulai(E) {
    pinjamAktor(E, 2).forEach((a) => { a.doingEvent = 'mendorong jendela'; a.goToXY(200, 152, 'up'); });
  },
  tick(E) {
    for (const a of E.aktor) if (a.diam) {
      const dorong = Math.sin(now / 130) > 0;
      a.pose = dorong ? 'nunjuk' : null;
    }
    pada(E, 3, () => {
      for (let i = 0; i < 8; i++) spawn('dust', 210, 66);
      const a = E.aktor[0]; if (a) a.say('satu… dua… tiga');
    });
    pada(E, 6, () => { for (const a of E.aktor) a.pose = null; });
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'kedipan-listrik',
  kelas: 'panggung', bobot: B.sedang, cooldown: 360, durasi: 9,
  bentrokDengan: ['mati-lampu-sekejap', 'genset-uji-bulanan'],
  syarat: () => !CUACA.petir,
  tick(E, dt, S) {
    const t = E.umur;
    MOD.neonMati = t < 0.55 ? [1, 1] : [0, 0];
    MOD.lampu = t < 0.55 ? 0 : 1;
    pada(E, 0.05, () => { for (const o of S.orang) if (!o.path.length) o.busyUntil = Math.max(o.busyUntil, now + 1400); });
    pada(E, 0.1, () => { menoleh(S.orang, 0, 0, 1); for (const o of S.orang.slice(0, 2)) spawn('talk', o.x, o.y - 26); });
    pada(E, 5.5, () => {
      const a = pemeranDekat(E, 390, 164, 240);
      if (a) { a.doingEvent = 'memeriksa rak'; a.goTo('server'); }
    });
  },
  gambarAtas(E) {
    const t = E.umur;
    let a2 = 0;
    if (t < 0.55) a2 = t < 0.033 ? t / 0.033 * 0.72 : (t < 0.16 ? 0.72 : Math.max(0, 0.72 * (1 - (t - 0.16) / 0.1)));
    if (a2 > 0.01) { ctx.globalAlpha = a2; ctx.fillStyle = '#06090f'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  },
},

{
  id: 'kipas-menoleh',
  kelas: 'latar', bobot: B.sering, cooldown: 240, durasi: 25,
  tick(E) {
    MOD.kipasSapu = 7;
    pada(E, 4, () => {
      const target = pilih([374, 444]);
      spawn('paper', target, 300);
      RUANGAN.kertasLantai.push({ x: target - 2, y: 306, sisa: 10 });
      const a = pemeranDekat(E, target, 316, 90);
      if (a) { E.data.a = a; a.doingEvent = 'memungut lembar'; a.goToXY(target, 310, 'down'); }
    });
    if (E.data.a && E.data.a.diam) {
      pada(E, 6, () => { E.data.a.pose = 'jongkok'; E.data.a.say('wadaw'); });
      pada(E, 7.5, () => { E.data.a.pose = null; if (RUANGAN.kertasLantai.length) RUANGAN.kertasLantai.pop(); });
    }
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

/* Blackout penuh dengan pemulihan genset — narasi genset digabung ke sini
   (bukan dirantai ke id 'genset-nyala' yang terpisah) supaya syarat jam bisa
   diperiksa langsung, bukan lewat peluang statis yang tidak baca waktu. */
{
  id: 'mati-lampu-sekejap',
  kelas: 'panggung', bobot: B.jarang, cooldown: 480, durasi: 9,
  bentrokDengan: ['kedipan-listrik', 'genset-uji-bulanan'],
  mulai(E, S) {
    E.data.genset = S.jam < 9 || S.jam >= 15.5;
    if (E.data.genset) { E.data.slotAsli = STATIONS.server.slots; STATIONS.server.slots = 2; }
  },
  tick(E, dt, S) {
    const genset = E.data.genset;
    MOD.neonMati = E.umur < 4 ? [1, 1] : [genset ? 0.15 : 0, genset ? 0.15 : 0];
    MOD.lampu = E.umur < 4 ? 0 : (genset ? 0.85 : 1);
    MOD.getar = genset && E.umur >= 4 ? 1 : 0;
    pada(E, 0.1, () => { for (const o of S.orang) o.busyUntil = Math.max(o.busyUntil, now + 1800); });
    pada(E, 0.15, () => { for (const o of S.orang.slice(0, 3)) spawn('talk', o.x, o.y - 26); });
    pada(E, 4.2, () => {
      const a = pemeran(E, ['teknisi', 'pranata_muda']);
      if (a) {
        a.doingEvent = 'memeriksa rak setelah listrik balik';
        a.goTo('server');
        a.say(genset ? 'yaaah… tenang, genset jalan' : 'sudah nyala lagi');
        for (let i = 0; i < 4; i++) spawn('data', 390, 122);
      }
    });
  },
  gambarAtas(E) {
    // Mematikan MOD.lampu saja nyaris tak kelihatan siang bolong — jendela
    // masih menerangi ruangan. Overlay gelap eksplisit inilah yang bikin
    // "mati lampu" terbaca kapan pun jam berapa pun, sama seperti kedipan-listrik.
    const t = E.umur;
    let a2 = t < 0.1 ? t / 0.1 * 0.6 : (t < 4 ? 0.6 : 0);
    if (E.data.genset && t >= 4 && t < 4.6) {
      // neon genset tersendat nyala: dua kedipan cepat sebelum stabil
      a2 = Math.floor((t - 4) / 0.15) % 2 ? 0.22 : 0.04;
    }
    if (a2 > 0.01) { ctx.globalAlpha = a2; ctx.fillStyle = '#06090f'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  },
  selesai(E) { if (E.data.genset) STATIONS.server.slots = E.data.slotAsli || 4; },
},

{
  id: 'neon-sebelah-mati',
  kelas: 'panggung', bobot: B.sedang, cooldown: 720, durasi: 45,
  syarat: (S) => S.lampu > 0.3,
  mulai(E) {
    E.data.sisi = Math.random() < 0.5 ? 0 : 1;     // 0 = kiri (170), 1 = kanan (410)
  },
  tick(E) {
    const i = E.data.sisi;
    const t = E.umur;
    MOD.neonMati[i] = t < 1.2
      ? [1, 0.2, 0, 0.6, 0][Math.min(4, Math.floor(t / 0.24))]
      : (t > 43 ? Math.max(0, 1 - (t - 43) / 1.5) : 1);
    pada(E, 3, () => {
      const a = pemeranDekat(E, i === 0 ? 170 : 410, 164, 220);
      if (a) { a.doingEvent = 'melapor lampu mati'; a.goTo('server'); a.say('tolong catat, Pak, TL yang ' + (i === 0 ? 'kiri' : 'kanan')); }
    });
  },
  gambarAtas(E) {
    const i = E.data.sisi;
    const g = MOD.neonMati[i];
    if (g < 0.3) return;
    ctx.globalAlpha = 0.07 * g;
    ctx.fillStyle = '#2c3440';
    if (i === 0) r(0, 0, 240, H, '#2c3440'); else r(240, 0, W - 240, H, '#2c3440');
    ctx.globalAlpha = 1;
  },
},

{
  id: 'printer-nge-jam',
  kelas: 'latar', bobot: B.sedang, cooldown: 420, durasi: 12,
  syarat: (S) => S.stasiunAktif.has('web') || S.orang.some(bisaDipinjam),
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 220);
    if (a) { a.doingEvent = 'menarik kertas nyangkut'; a.goTo('web'); }
  },
  tick(E) {
    MOD.printerMacet = !E.data.beres;
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    for (let i = 0; i < 3; i++) {
      pada(E, 2 + i * 1.6, () => { a.pose = 'angkat'; });
      pada(E, 2.6 + i * 1.6, () => { a.pose = null; });
    }
    pada(E, 7, () => {
      E.data.beres = true; a.pose = null;
      for (let i = 0; i < 5; i++) spawn('paper', a.x + 4, a.y - 20);
      spawn('lempar', a.x + 4, a.y - 18);
      a.say('kena roller lagi');
    });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'printer-toner-dikocok',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 22,
  syarat: () => RUANGAN.toner < 0.9,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'mengocok toner printer';
    a.goTo('web');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 3, () => { a.bawa = 'toner'; });
    if (E.umur > 5 && E.umur < 10) {
      a.pose = 'kipas';
      if (Math.random() < 0.3) spawn('serbuk', a.x + 4, a.y - 8);
    }
    pada(E, 10, () => { a.pose = null; a.bawa = null; RUANGAN.toner = 1; });
    pada(E, 12, () => { for (let i = 0; i < 3; i++) spawn('paper', 214, 118); });
    pada(E, 4, () => a.say('masih bisa seratus lembar lagi ini'));
  },
  selesai(E) { const a = E.aktor[0]; if (a) { a.pose = null; a.bawa = null; } },
},

{
  id: 'rak-server-divakum',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1500, durasi: 35,
  syarat: (S) => S.jam >= 7 && S.jam < 9,
  mulai(E) {
    const a = pemeran(E, ['magang', 'teknisi']);
    if (a) { a.doingEvent = 'menyedot debu rak'; a.goTo('server'); }
  },
  tick(E, dt, S) {
    if (Math.random() < 0.35) {
      const p = spawn('dust', 390, 100);
      if (p) p.vx -= 8;
    }
    for (const o of S.orang) {
      if (o.eventKerja || jarakKe(o, 390, 130) > 40 || jarakKe(o, 390, 130) < 8) continue;
      o.pose = 'hidung';
      o.busyUntil = Math.max(o.busyUntil, now + 800);
    }
    pada(E, 20, () => { const a = E.aktor[0]; if (a) a.say('debunya setahun tidak pernah disedot'); });
  },
  gambarProp() {
    r(352, 128, 12, 10, '#3565b0');            // vacuum kecil
    r(352, 128, 12, 2, '#79c0ff');
  },
  sortY: 133,
  selesai(E, S) { for (const o of S.orang) if (o.pose === 'hidung') o.pose = null; },
},

{
  id: 'teknisi-dipanggil-ke-kolong-meja',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 16,
  syarat: (S) => S.orang.some((o) => o.station === 'think' && o.diam),
  mulai(E, S) {
    const korban = pilih(S.orang.filter((o) => o.station === 'think' && o.diam));
    if (!korban) return;
    E.data.slot = korban.slotIdx;
    E.data.x = MEJA_KERJA_X[korban.slotIdx];
    const teknisi = pemeran(E, ['teknisi', 'pranata_muda']);
    E.data.adaTeknisi = !!teknisi;
    if (teknisi) { teknisi.doingEvent = 'membetulkan kabel di kolong meja'; teknisi.goToXY(E.data.x, 300, 'down'); }
    else { korban.eventKerja = E; korban.betahAsli = korban.betah; korban.betah = true; E.aktor.push(korban); }
  },
  tick(E) {
    if (E.data.slot == null) { E.selesaiCepat = true; return; }
    MOD.mejaPadam = E.umur < (E.data.adaTeknisi ? 9 : 6) ? E.data.slot : -1;
    if (E.data.adaTeknisi) {
      const t = E.aktor[0];
      if (t && t.diam) {
        t.pose = 'jongkok';
        if (Math.random() < 0.1) spawn('dust', t.x, t.y - 6);
        if (Math.random() < 0.1) spawn('ping', t.x, t.y - 10);
        pada(E, 9, () => { t.pose = null; for (let i = 0; i < 3; i++) spawn('data', t.x, t.y - 20); });
      }
    } else {
      const p = E.aktor[0];
      if (p && p.diam) { p.pose = 'jongkok'; pada(E, 4, () => { p.pose = null; }); }
    }
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'ubin-retak-nambah',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 8,
  syarat: () => RUANGAN.retakExtra.length < 6,
  tick(E, dt, S) {
    if (E.data.gx == null) {
      const kandidat = [[7, 2], [11, 4], [4, 5], [14, 3], [9, 6]]
        .filter(([gx, gy]) => !RUANGAN.retakExtra.some((k) => k.gx === gx && k.gy === gy));
      if (!kandidat.length) { E.selesaiCepat = true; return; }
      [E.data.gx, E.data.gy] = pilih(kandidat);
      E.data.t = Math.random();
      RUANGAN.retakExtra.push({ gx: E.data.gx, gy: E.data.gy, t: E.data.t });
      for (let i = 0; i < 5; i++) spawn('dust', E.data.gx * 24 + 12, FLOOR_TOP + E.data.gy * 24 + 12);
    }
    const px = E.data.gx * 24 + 12, py = FLOOR_TOP + E.data.gy * 24 + 12;
    // pegawai yang kebetulan lewat langsung berhenti — tidak ada penghindaran
    // permanen di route(): itu akan menumpuk aturan selamanya di pencari jalur
    // yang dipakai SEMUA agen, dan retakan tambahan sudah cukup terasa tanpa itu
    for (const o of S.orang) {
      if (o.eventKerja || o.path.length || jarakKe(o, px, py) > 24) continue;
      hadapkan(o, px, py);
      o.busyUntil = Math.max(o.busyUntil, now + 1600);
      o.say('nanti dilaporkan ke Umum.');
      break;
    }
  },
},

{
  id: 'wifi-sudut-lemah',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 25,
  syarat: (S) => S.orang.some((o) => o.station === 'think' && o.slotIdx === 3 && o.diam),
  perluAktor: true,
  mulai(E, S) {
    const a = S.orang.find((o) => o.station === 'think' && o.slotIdx === 3 && o.diam && bisaDipinjam(o));
    if (!a) return;
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    a.doingEvent = 'pindah cari sinyal';
    a.bawa = 'laptop';
    MOD.mejaPadam = 3;
    a.goToXY(360, 152, 'up');
  },
  tick(E) {
    MOD.wifiLemahSlot = 3;
    const a = E.aktor[0];
    if (a && a.diam) {
      a.pose = 'dudukLantai';
      if (Math.random() < 0.06) spawn('data', a.x, a.y - 22);
      pada(E, 2, () => a.say('di pojok sini sinyalnya cuma satu batang'));
    }
    pada(E, 22, () => { if (a) { a.pose = null; a.bawa = null; a.goToXY(444, 300, 'down'); } });
  },
  gambarDinding() {
    const x = 300, y = 20;                       // digeser dari (300,14): hindari Garuda
    r(x, y, 10, 10, '#f2f0e6');
    r(x + 3, y + 3, 2, 2, MOD.wifiLemahSlot === 3 && Math.sin(now / 260) > 0 ? '#e8a33a' : '#57d06a');
  },
  selesai(E) { if (E.aktor[0]) { E.aktor[0].pose = null; E.aktor[0].bawa = null; } },
},

);

/* Dua kait kecil yang dipakai lebih dari satu event di atas. */
function MOD_selesaiGorden(E) {
  E.data.tutup = E.umur;
  MOD.gordenLepas = false;
  MOD.sinar = 1;
}

