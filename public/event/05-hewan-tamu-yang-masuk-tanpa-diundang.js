/* ==========================================================================
   HEWAN & TAMU — yang masuk tanpa diundang
   ========================================================================== */

daftarEvent(

/* Kucing bukan Agent: dia tidak punya sesi, tidak boleh muncul di panel kru,
   dan tidak boleh ikut berebut kursi. Yang dia perlukan cuma ikut depth sort,
   supaya pegawai yang lewat di depannya benar-benar menutupinya. */
{
  id: 'kucing-kantor-mampir',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1800, durasi: 45,
  mulai(E) {
    E.data.k = { x: -10, y: 262, fase: 'masuk', jeda: 0, elus: 0 };
  },
  tick(E, dt, S) {
    const K = E.data.k;
    if (K.fase === 'masuk') {
      // jalan patah-patah: berhenti 1-2 detik tiap 20 px
      K.jeda -= dt;
      if (K.jeda <= 0) K.x += 26 * dt;
      if (K.x > K.tandaBerikut) { K.tandaBerikut = K.x + 20; K.jeda = acak(1, 2); }
      if (K.x >= 230) { K.fase = 'tidur'; K.x = 230; K.y = 258; }
    } else if (K.fase === 'pergi') {
      K.x += 40 * dt;
    }
    if (K.fase === 'tidur') {
      // yang lewat dekat berhenti mengelus; tiga elusan dan dia bangun
      for (const o of S.orang) {
        if (o.eventKerja || jarakKe(o, K.x, K.y) > 30) continue;
        if (o.elusSampai && now < o.elusSampai) continue;
        o.elusSampai = now + 6000;
        hadapkan(o, K.x, K.y);
        o.busyUntil = Math.max(o.busyUntil, now + 3000);
        o.pose = 'jongkok';
        spawn('idea', o.x, o.y - 26); spawn('idea', o.x, o.y - 26);
        if (K.elus === 0) o.say('pus, pus');
        if (++K.elus >= 3) K.fase = 'pergi';
        break;
      }
    }
  },
  gambarProp(E) {
    const K = E.data.k;
    if (!K || K.x < -8 || K.x > W + 8) return;
    const x = Math.round(K.x), y = Math.round(K.y);
    const tidur = K.fase === 'tidur';
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#20301f';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 1, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (tidur) {
      r(x, y - 4, 7, 4, '#d98a3a');                 // meringkuk jadi gumpalan
      r(x, y - 4, 7, 1, '#e8a45a');
      r(x + 5, y - 6, 3, 3, '#d98a3a');
      r(x + 6, y - 5, 1, 1, '#3a2a20');
      const ek = Math.sin(now / 900) > 0 ? 0 : 1;
      r(x - 2, y - 2 + ek, 3, 1, '#c97a2a');
    } else {
      r(x, y - 3, 6, 3, '#d98a3a');
      r(x + 5, y - 6, 3, 3, '#d98a3a');
      r(x + 6, y - 5, 1, 1, '#3a2a20');
      r(x + 5, y - 7, 1, 1, '#d98a3a'); r(x + 7, y - 7, 1, 1, '#d98a3a');
      r(x - 2, y - 5 + (Math.sin(now / 200) > 0 ? 0 : 1), 3, 1, '#c97a2a');
      r(x + 1, y, 1, 2, '#c97a2a'); r(x + 4, y, 1, 2, '#c97a2a');
    }
  },
  sortY: 264,
  selesai(E) { for (const o of S.orang) o.pose = null; },
},

{
  id: 'tikus-lewat-kolong',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 6,
  mulai(E) { E.data.x = 40; },
  tick(E, dt, S) {
    // berhenti sebentar tepat di bawah ember penadah — detail yang lucu
    const rem = E.data.x > 340 && E.data.x < 352 && E.umur < 4 ? 0.15 : 1;
    E.data.x += 110 * dt * rem;
    // HANYA yang kebetulan menghadap ke atas yang sadar; sisanya tidak tahu
    if (!E.data.sadar) {
      const saksi = S.orang.find((o) => o.face === 'up' && o.diam && Math.abs(o.x - E.data.x) < 60);
      if (saksi) {
        E.data.sadar = true;
        saksi.busyUntil = Math.max(saksi.busyUntil, now + 2000);
        saksi.say('...');
      }
    }
  },
  gambarProp(E) {
    const x = Math.round(E.data.x);
    if (x > 420) return;
    r(x, 116, 5, 2, '#4a4238');
    r(x + 4, 115, 2, 2, '#4a4238');
    r(x - 3, 116, 3, 1, '#5c5348');            // ekor
  },
  sortY: 117,                                   // di belakang perabot: lewat kolong
},

{
  id: 'burung-di-kusen-jendela',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 18,
  syarat: (S) => S.jam >= 6 && S.jam < 17 && S.luar > 0.5,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 160);
    if (a) { a.doingEvent = 'memandangi burung'; a.goTo('web'); }
  },
  tick(E) {
    pada(E, 14, () => {
      E.data.terbang = true;
      for (let i = 0; i < 3; i++) spawn('dust', 230, 66, '#8a6844');
    });
  },
  gambarDinding(E) {
    if (E.data.terbang) return;
    const x = 228, y = JENDELA.y + JENDELA.h - 4;
    const toleh = Math.sin(now / 1500) > 0 ? 1 : -1;
    r(x, y, 4, 3, '#8a6844');
    r(x + (toleh > 0 ? 3 : 0), y - 2, 2, 2, '#7a5c3e');
    r(x + (toleh > 0 ? 5 : -1), y - 2, 1, 1, '#d9b96a');   // paruh
    r(x + 1, y + 3, 1, 1, '#5c4530'); r(x + 3, y + 3, 1, 1, '#5c4530');
  },
},

{
  id: 'tamu-salah-alamat',
  kelas: 'panggung', bobot: B.sedang, cooldown: 720, durasi: 20,
  perluAktor: true,
  syarat: (S) => S.kerjaJam,
  mulai(E) {
    E.data.t = { x: -14, y: LANE_DOWN, fase: 'masuk' };
    const a = pemeran(E);
    if (a) { a.doingEvent = 'menunjukkan arah'; a.goToXY(216, LANE_DOWN, 'left'); }
  },
  tick(E, dt) {
    const T = E.data.t, a = E.aktor[0];
    if (T.fase === 'masuk') {
      T.x = Math.min(200, T.x + 46 * dt);
      if (T.x >= 200) T.fase = 'bingung';
    } else if (T.fase === 'salah') {
      T.x = Math.min(240, T.x + 30 * dt);     // sempat melangkah ke arah rak server
    } else if (T.fase === 'pulang') {
      T.x -= 52 * dt;
    }
    if (T.fase === 'bingung' && Math.random() < 0.06) spawn('talk', T.x, T.y - 28);
    pada(E, 6, () => { T.fase = 'salah'; });
    pada(E, 10, () => { T.fase = 'bingung'; });
    if (a && a.diam) {
      pada(E, 12, () => { a.pose = 'nunjuk'; hadapkan(a, T.x, T.y); a.say('bidangnya di lantai bawah, Pak, pintu sebelah kiri'); });
      pada(E, 16, () => { a.pose = null; T.fase = 'pulang'; });
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -12) return;
    gambarOrangLuar(T.x, T.y, '#8b9098', null, null, '#3a3f45');
  },
  sortY: 258,
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

);

