/* ==========================================================================
   META CLAUDE CODE — kenyataan sesi diterjemahkan jadi kejadian kantor
   ========================================================================== */

daftarEvent(

/* Terjemahan dari: tidak ada tool call sama sekali. Bukan ruangan yang mati,
   tapi ruangan yang menunggu — dan itu beda tampilannya. */
{
  id: 'layar-mengantuk',
  kelas: 'latar', bobot: B.sering, cooldown: 60, durasi: 180,
  syarat: () => now - (toolTerakhir || 0) > 180000,
  tick(E, dt, S) {
    const naik = Math.min(1, E.umur / 5);
    MOD.layarPucat = naik;
    MOD.vignette = 0.3 + 0.12 * naik;
    // begitu ada tool call masuk, event ini berhenti seketika
    if (now - (toolTerakhir || 0) < 2000) { E.selesaiCepat = true; return; }
    for (const o of S.orang) {
      if (o.station !== 'think' || !o.diam) continue;
      const f = (E.umur + o.slot * 3) % 12;
      o.mulut = f > 11.2;
      if (f > 11.2 && Math.random() < 0.1) spawn('kantuk', o.x + 6, o.y - 26);
    }
  },
  selesai(E) { for (const o of S.orang) o.mulut = false; },
},

{
  id: 'menunggu-disposisi-di-depan-pintu',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 40,
  perluAktor: true,
  syarat: (S) => S.sesi > 0 && now - (toolTerakhir || 0) > 45000,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menunggu disposisi';
    a.bawa = 'map';
    a.goToXY(452, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    // helaan napas tiap delapan detik; itu satu-satunya yang bergerak
    if (Math.floor(E.umur / 8) !== E.data.n) {
      E.data.n = Math.floor(E.umur / 8);
      spawn('steam', a.x + 4, a.y - 22);
    }
    if (Math.floor(E.umur / 11) !== E.data.l) {
      E.data.l = Math.floor(E.umur / 11);
      hadapkan(a, 168, 38);                    // melirik jam
      MOD.jamSorot = 1;
    } else {
      hadapkan(a, 452, 120);
    }
    pada(E, 5, () => a.say('masih di dalam'));
    // tool call datang: pintu terbuka, dia langsung berangkat tanpa jeda
    if (now - (toolTerakhir || 0) < 1500) { MOD.pintuKadis = true; E.selesaiCepat = true; }
  },
},

{
  id: 'layar-berkedip-serempak',
  kelas: 'latar', bobot: B.jarang, cooldown: 480, durasi: 3,
  tick(E, dt, S) {
    MOD.layarPutih = E.umur < 0.1 ? 1 : Math.max(0, 0.5 - E.umur * 0.4);
    pada(E, 0.2, () => {
      for (const o of S.orang) {
        if (o.path.length) { o.busyUntil = Math.max(o.busyUntil, now + 500); hadapkan(o, o.x, 316); }
      }
      for (const mx of MEJA_KERJA_X) { spawn('idea', mx + 21, 296); spawn('idea', mx + 21, 296); }
    });
  },
  gambarAtas(E) {
    // satu garis pindai turun di tiap layar yang menyala
    if (E.umur > 0.9) return;
    const gy = 300 + E.umur * 16;
    ctx.globalAlpha = 0.5;
    for (const mx of MEJA_KERJA_X) r(mx + 14, gy, 14, 1, '#ffffff');
    ctx.globalAlpha = 1;
  },
},

{
  id: 'ketikan-serempak-sesaat',
  kelas: 'latar', bobot: B.jarang, cooldown: 420, durasi: 2.5,
  syarat: (S) => S.orang.filter((o) => o.station === 'think' && o.state === 'work').length >= 3,
  tick(E) {
    // riak menyeberangi baris meja, kiri ke kanan, jeda 0,12 detik per meja
    const urut = [...MEJA_KERJA_X].sort((a, b) => a - b);
    urut.forEach((mx, i) => {
      pada(E, 0.3 + i * 0.12, () => { spawn('glyph', mx + 20, 296); spawn('glyph', mx + 20, 296); });
    });
    pada(E, 1.1, () => {
      // jeda sunyi serempak: semua fase animasi dibekukan setengah detik
      for (const o of penghuni()) if (o.station === 'think') o.busyUntil = Math.max(o.busyUntil, now + 500);
    });
  },
},

{
  id: 'laptop-restart-paksa',
  kelas: 'latar', bobot: B.sedang, cooldown: 540, durasi: 13,
  syarat: (S) => S.orang.some((o) => o.station === 'think' && o.diam),
  mulai(E, S) {
    E.data.a = pilih(S.orang.filter((o) => o.station === 'think' && o.diam));
  },
  tick(E) {
    const a = E.data.a;
    if (E.umur < 3) MOD.layarPutih = 0.9;              // layar biru penuh
    else if (E.umur < 7) MOD.mejaPadam = a ? a.slotIdx : -1;
    else MOD.layar = Math.min(1, (E.umur - 7) / 0.8);  // menyala bertahap
    if (!a) return;
    pada(E, 1, () => { a.pose = 'jongkok'; a.say('jangan sekarang, dong'); });
    // pekerjaannya benar-benar tertunda, bukan cuma gambarnya berubah
    pada(E, 1.2, () => { a.busyUntil = Math.max(a.busyUntil, now + 7000); });
    pada(E, 8, () => { a.pose = null; });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'arsip-hilang-satu-map',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 17,
  perluAktor: true,
  syarat: (S) => S.stasiunAktif.has('search') || S.orang.some(bisaDipinjam),
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'mencari map yang hilang'; a.goTo('search'); }
  },
  tick(E) {
    // tiga laci menganga sekaligus, semuanya kosong
    MOD.laciKosong = Math.min(3, Math.floor(E.umur / 1.5));
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (Math.random() < 0.08) spawn('dust', 132, 128);
    pada(E, 8, () => a.say('tidak ada di laci mana pun'));
    pada(E, 10, () => { a.doingEvent = 'menemui arsiparis'; a.goTo('read'); });
    pada(E, 15, () => { a.pose = 'duaangkat'; });    // arsiparis mengangkat bahu
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'berkas-ditarik-lagi-dari-stempel',
  kelas: 'latar', bobot: B.sedang, cooldown: 1080, durasi: 11,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menarik berkas yang sudah dicap';
    a.goTo('edit');                       // path lama dibatalkan, dialihkan ke sini
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 2, () => {
      a.say('eh, ada yang kurang');
      // 'ink' dengan vy positif: capnya ditarik mundur, bukan dibubuhkan
      for (let i = 0; i < 4; i++) {
        const p = spawn('ink', 292, 118);
        if (p) { p.vy = 22; p.g = 0; }
      }
    });
    pada(E, 8, () => { RUANGAN.mapDisposisi = Math.min(5, RUANGAN.mapDisposisi + 1); });
  },
},

{
  id: 'standby-ditanya-tidak-menjawab',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 10,
  syarat: (S) => S.sesi > 0 && S.orang.some((o) => o.standby && o.diam),
  mulai(E, S) {
    const sb = pilih(S.orang.filter((o) => o.standby && o.diam));
    if (!sb) return;
    const a = S.orang.find((o) => !o.standby && bisaDipinjam(o) && jarakKe(o, sb.x, sb.y) < 200);
    if (!a) return;
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    a.doingEvent = 'bertanya ke pegawai standby';
    E.data.sb = sb;
    a.goToXY(sb.x + 16, sb.y, 'left');
  },
  tick(E) {
    const a = E.aktor[0], sb = E.data.sb;
    if (!a || !sb || !a.diam) return;
    hadapkan(a, sb.x, sb.y);
    pada(E, 1, () => {
      a.say('mas ini bagian mana ya?');
      spawn('talk', a.x, a.y - 26); spawn('talk', a.x, a.y - 26);
    });
    // standby memang dibungkam: tidak ada balon, tidak ada partikel dari dia
    pada(E, 5, () => { a.pose = 'duaangkat'; });
    pada(E, 8, () => { a.pose = null; });
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'peserta-ketiduran',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 25,
  syarat: () => peserta.some((p) => p.diam && now - p.arrivedAt > 100000),
  mulai(E) {
    E.data.p = peserta.find((p) => p.diam && now - p.arrivedAt > 100000);
  },
  tick(E) {
    const p = E.data.p;
    // peserta bisa bubar kapan saja; kalau sudah tidak terdaftar, hentikan
    if (!p || peserta.indexOf(p) < 0) { E.selesaiCepat = true; return; }
    const f = E.umur % 12;
    // turunnya cepat, naiknya lambat — itu yang bikin terbaca mengantuk
    p.ngantuk = f < 8 ? Math.min(3, f * 1.5) : Math.max(0, 3 - (f - 8) * 0.75);
    if (f < 8 && Math.random() < 0.02) spawn('kantuk', p.x + 6, p.y - 28);
    if (f > 8 && f < 8.4) {
      const sebelah = peserta.find((q) => q !== p && Math.abs(q.x - p.x) < 40);
      if (sebelah) hadapkan(sebelah, p.x, p.y);
    }
  },
  selesai(E) { if (E.data.p) E.data.p.ngantuk = 0; },
},

{
  id: 'audit-token',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 25,
  perluAktor: true,
  // Dua pintu masuk: sesi yang sudah panjang (toolCount), atau yang sedang
  // boros sekarang — S.lajuToken = token/menit 5 menit terakhir, semua jenis
  // termasuk cache baca. 120 ribu/menit itu sesi yang giliran-gilirannya
  // berat, bukan yang sekadar aktif. `?? 0`: potret lama/harness tidak punya.
  syarat: (S) => toolCount > 150 || (S.lajuToken ?? 0) > 120000,
  mulai(E, S) {
    const sibuk = [...agents.values()].sort((a, b) => b.calls - a.calls)[0];
    const a = pemeran(E, ['auditor', 'statistisi']);
    if (!a) return;
    a.doingEvent = 'mengaudit pemakaian';
    E.data.target = sibuk;
    a.goToXY(sibuk ? sibuk.x + 16 : 240, sibuk ? sibuk.y : 300, 'left');
  },
  tick(E) {
    const a = E.aktor[0], t = E.data.target;
    if (!a || !a.diam) return;
    a.pose = 'duaangkat';
    if (t) { MOD.mejaPadam = -1; hadapkan(t, a.x, a.y); t.busyUntil = Math.max(t.busyUntil, now + 2000); }
    pada(E, 8, () => a.say('pemakaian bulan ini naik, tolong dihemat ya'));
    pada(E, 20, () => { a.pose = null; });
  },
  gambarProp(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    // gulungan kertas panjang yang menjuntai — makin dibentang makin panjang
    const p = Math.min(1, Math.max(0, (E.umur - 4) / 6));
    r(a.x + 8, a.y - 14, 3, Math.round(20 + p * 40), P.paper);
    r(a.x + 8, a.y - 14, 3, 1, '#c9c2ae');
  },
  sortY: 349,
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

);

