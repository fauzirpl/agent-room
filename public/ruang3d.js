/* agent-room :: ruang3d — kantor yang sama, dalam tiga dimensi

   Ruangan ini tetap SATU dunia. Simulasinya — pegawai, rute, stasiun, event
   acak, Aturan 1 — jalan di room.js persis seperti sebelumnya, di kisi
   672x356 yang sama. Berkas ini cuma cara lain MELIHATNYA: maket kantor yang
   bisa diputar dengan tetikus, bukan jendela pixel-art yang dikunci dari depan.

   Tiga keputusan yang membentuk sisanya:

   1. NOL PUSTAKA. WebGL2 ditulis tangan (matriks, shader, peta bayangan),
      sama seperti musik lofi dan bunyi event yang disintesis sendiri: kantor
      ini tidak memuat apa pun dari luar mesinmu.

   2. KERANGKA 3D, KULIT 2D. Dinding, lantai, dan muka perabot dilukis oleh
      fungsi gambar room.js yang SAMA PERSIS (lewat gambarKe) ke kanvas
      tekstur. Jam dinding tetap berdetak, cuaca di jendela tetap sungguhan,
      LED rak server tetap berkedip, dan 360 event acak tetap kelihatan —
      lapisan gambarProp-nya jadi kartu tegak di kedalaman sortY-nya. Yang
      dibangun ulang sebagai benda 3D cuma BENTUKNYA: kotak, tabung, orang.

   3. PROYEKSI OBLIK SEBAGAI KAMUS. Gambar 2D ruangan ini proyeksi oblik:
      titik (x, tinggi h, kedalaman z) jatuh di layar 2D pada (x, z - h).
      Balikannya — z = garis kaki, h = kaki - y — yang dipakai untuk menaruh
      apa pun yang cuma punya koordinat 2D: balon ucap, kartu pegawai,
      partikel, kartu event. Titik yang garis kakinya di atas lantai
      (kaki <= FLOOR_TOP) menempel di bidang dinding.

   Koordinat 3D: X = x dunia 2D, Z = y dunia 2D (kedalaman; makin besar makin
   dekat ke penonton), Y = tinggi. Dinding belakang DIMUNDURKAN 10 satuan ke
   Z=100 (DINDING_Z): di 2D perabot dinding cuma "setebal" 8 px antara dasar
   dinding (110) dan garis kakinya (118..120) — di 3D itu jadi lemari setipis
   papan. Dinding yang mundur memberi mereka kedalaman 18..20 tanpa menggeser
   satu pun garis kaki, jadi rute dan stasiun tetap berdiri di depan
   mejanya masing-masing.

   Gagal = diam: tanpa WebGL2, di harness uji (VM tanpa DOM sungguhan), atau
   di ?kadis=1, berkas ini tidak menyalakan apa pun dan room.js tetap 2D. */
(() => {
  'use strict';

  // ------------------------------------------------------------- gerbang
  if (typeof TIGA === 'undefined' || typeof gambarKe !== 'function') return;
  if (typeof MODE_KADIS !== 'undefined' && MODE_KADIS) return;
  const kanvas = document.getElementById('room3d');
  if (!kanvas || typeof kanvas.getContext !== 'function') return;
  const tombol = document.getElementById('tampilanBtn');

  const gl = kanvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) {
    if (tombol) { tombol.disabled = true; tombol.title = 'tampilan 3D butuh WebGL2 — peramban ini tidak menyediakannya'; }
    return;
  }

  // ------------------------------------------------------------ konstanta
  const DINDING_Z = FLOOR_TOP - 10;        // bidang dinding belakang
  const TINGGI_DINDING = FLOOR_TOP;        // 110: tinggi dinding = tinggi bidang dinding 2D
  const LANTAI_Z1 = H + 8;                 // lantai sedikit melewati tepi depan: sandaran kursi meja kerja
  const K = 3;                             // texel per satuan dunia untuk dinding, lantai, dan kulit perabot
  const ATLAS = 2048;
  /* Pegawai 3D 1,4x sprite-nya. Sprite 2D 28 px itu gaya chibi, dan perabot
     2D (meja kerja setinggi 18, meja stempel 24, pintu 80..86) diukur untuk
     orang yang lebih besar: di skala 1 pegawainya jadi anak kecil di kantor
     raksasa. 1,4 membuat meja setinggi perut dan pintu setinggi pintu. */
  const SKALA_ORANG = 1.4;
  /* Meja rapat 3D: taplak setinggi h di atas z0..z1. Bidang atasnya di 2D
     (trapesium RAPAT.yB 186 .. yF 226) direntang ke z itu oleh zRapat() —
     dipakai barang event yang ditaruh di atas taplak. */
  const MEJA_RAPAT = { x0: 172, x1: 320, z0: 195, z1: 240, h: 16 };
  const zRapat = (y) => MEJA_RAPAT.z0
    + Math.max(0, Math.min(1, (y - RAPAT.yB) / (RAPAT.yF - RAPAT.yB))) * (MEJA_RAPAT.z1 - MEJA_RAPAT.z0);
  const geraKurang3 = matchMedia('(prefers-reduced-motion: reduce)');

  // --------------------------------------------------------------- warna
  const cacheWarna = new Map();
  function warna(c, a = 1) {
    const kunci = c + '|' + a;
    let v = cacheWarna.get(kunci);
    if (!v) {
      const [r, g, b] = bagiWarna(c);
      v = [r / 255, g / 255, b / 255, a];
      cacheWarna.set(kunci, v);
    }
    return v;
  }
  const gelapkan = (c, f) => [c[0] * f, c[1] * f, c[2] * f, c[3]];
  const campur = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t, p[3] + (q[3] - p[3]) * t];

  // ------------------------------------------------------------- matriks
  // Kolom-mayor seperti WebGL: elemen (baris j, kolom i) di [i*4 + j].
  const M4 = {
    kali(a, b) {
      const o = new Float32Array(16);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          o[i * 4 + j] = a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] + a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3];
        }
      }
      return o;
    },
    perspektif(fovy, aspek, n, f) {
      const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
      m[0] = t / aspek; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
      return m;
    },
    orto(l, r, b, t, n, f) {
      const m = new Float32Array(16);
      m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
      m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1;
      return m;
    },
    lihat(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
      let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      const m = new Float32Array(16);
      m[0] = xx; m[4] = xy; m[8] = xz; m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
      m[1] = yx; m[5] = yy; m[9] = yz; m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
      m[2] = zx; m[6] = zy; m[10] = zz; m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
      m[15] = 1;
      return m;
    },
    titik(m, x, y, z) {
      return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
        m[3] * x + m[7] * y + m[11] * z + m[15],
      ];
    },
    balik(m) {
      const a = m, o = new Float32Array(16);
      const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
      const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
      const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
      const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
      const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
      o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d;
      o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
      o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d;
      o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
      o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d;
      o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
      o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d;
      o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
      return o;
    },
  };

  /* Transformasi afin 3x4 baris-mayor [a b c tx; d e f ty; g h i tz] untuk
     sendi pegawai. kali(A, B) = terapkan B dulu, baru A. */
  const A3 = {
    satu: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    geser: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z],
    skala: (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0],
    putarY(t) { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; },
    putarX(t) { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; },
    putarZ(t) { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; },
    kali(A, B) {
      const o = new Array(12);
      for (let r = 0; r < 3; r++) {
        const a0 = A[r * 4], a1 = A[r * 4 + 1], a2 = A[r * 4 + 2];
        o[r * 4] = a0 * B[0] + a1 * B[4] + a2 * B[8];
        o[r * 4 + 1] = a0 * B[1] + a1 * B[5] + a2 * B[9];
        o[r * 4 + 2] = a0 * B[2] + a1 * B[6] + a2 * B[10];
        o[r * 4 + 3] = a0 * B[3] + a1 * B[7] + a2 * B[11] + A[r * 4 + 3];
      }
      return o;
    },
    // putar di sekitar titik poros (px,py,pz)
    poros(px, py, pz, R) { return A3.kali(A3.geser(px, py, pz), A3.kali(R, A3.geser(-px, -py, -pz))); },
  };

  // ---------------------------------------------------------- penyusun mesh
  /* Satu titik = 13 float: posisi(3) normal(3) warna rgba(4) uv(2) emisi(1).
     Semua bangun di berkas ini lewat sini: bidang, kotak, kotak terputar. */
  const LANGKAH = 13;
  const UV_POLOS = [0.5, 0.5, 0.5, 0.5];
  class Susun {
    constructor(kap = 4096) { this.d = new Float32Array(kap * LANGKAH); this.n = 0; }
    kosongkan() { this.n = 0; }
    get jumlah() { return this.n / LANGKAH; }
    jamin(k) {
      if (this.n + k <= this.d.length) return;
      let L = this.d.length;
      while (this.n + k > L) L *= 2;
      const b = new Float32Array(L);
      b.set(this.d.subarray(0, this.n));
      this.d = b;
    }
    t(x, y, z, nx, ny, nz, c, u, v, e) {
      const d = this.d, i = this.n;
      d[i] = x; d[i + 1] = y; d[i + 2] = z; d[i + 3] = nx; d[i + 4] = ny; d[i + 5] = nz;
      d[i + 6] = c[0]; d[i + 7] = c[1]; d[i + 8] = c[2]; d[i + 9] = c[3];
      d[i + 10] = u; d[i + 11] = v; d[i + 12] = e;
      this.n = i + LANGKAH;
    }
    /* Segi empat p0..p3 berlawanan jarum jam dilihat dari depan: p0 kiri-bawah,
       p1 kanan-bawah, p2 kanan-atas, p3 kiri-atas. uv = [u0,v0,u1,v1] dengan
       v0 = baris ATAS tekstur (kanvas tidak dibalik waktu diunggah). */
    // segi empat dari sudut-sudut di penyangga SUDUT (lihat kotak()/kotakM())
    sudut(a, b, c2, d, nx, ny, nz, c, e) {
      this.jamin(6 * LANGKAH);
      const P = SUDUT;
      this.t(P[a * 3], P[a * 3 + 1], P[a * 3 + 2], nx, ny, nz, c, 0.5, 0.5, e);
      this.t(P[b * 3], P[b * 3 + 1], P[b * 3 + 2], nx, ny, nz, c, 0.5, 0.5, e);
      this.t(P[c2 * 3], P[c2 * 3 + 1], P[c2 * 3 + 2], nx, ny, nz, c, 0.5, 0.5, e);
      this.t(P[a * 3], P[a * 3 + 1], P[a * 3 + 2], nx, ny, nz, c, 0.5, 0.5, e);
      this.t(P[c2 * 3], P[c2 * 3 + 1], P[c2 * 3 + 2], nx, ny, nz, c, 0.5, 0.5, e);
      this.t(P[d * 3], P[d * 3 + 1], P[d * 3 + 2], nx, ny, nz, c, 0.5, 0.5, e);
    }
    // segitiga dengan uv per titik (cakram jam dinding, kipas segitiga)
    tri(p0, p1, p2, n, c, t0, t1, t2, e = 0) {
      this.jamin(3 * LANGKAH);
      this.t(p0[0], p0[1], p0[2], n[0], n[1], n[2], c, t0[0], t0[1], e);
      this.t(p1[0], p1[1], p1[2], n[0], n[1], n[2], c, t1[0], t1[1], e);
      this.t(p2[0], p2[1], p2[2], n[0], n[1], n[2], c, t2[0], t2[1], e);
    }
    segi(p0, p1, p2, p3, n, c, uv = UV_POLOS, e = 0) {
      this.jamin(6 * LANGKAH);
      const [u0, v0, u1, v1] = uv;
      this.t(p0[0], p0[1], p0[2], n[0], n[1], n[2], c, u0, v1, e);
      this.t(p1[0], p1[1], p1[2], n[0], n[1], n[2], c, u1, v1, e);
      this.t(p2[0], p2[1], p2[2], n[0], n[1], n[2], c, u1, v0, e);
      this.t(p0[0], p0[1], p0[2], n[0], n[1], n[2], c, u0, v1, e);
      this.t(p2[0], p2[1], p2[2], n[0], n[1], n[2], c, u1, v0, e);
      this.t(p3[0], p3[1], p3[2], n[0], n[1], n[2], c, u0, v0, e);
    }
  }

  // sisi kotak sebagai bit: depan(+z) belakang(-z) kanan(+x) kiri(-x) atas(+y) bawah(-y)
  const S_DEPAN = 1, S_BELAKANG = 2, S_KANAN = 4, S_KIRI = 8, S_ATAS = 16, S_BAWAH = 32;
  const SEMUA = 63, TANPA_BAWAH = 31;

  /* Delapan sudut kotak ditulis ke SATU penyangga bersama (indeks
     x | y<<1 | z<<2), lalu enam mukanya dibaca langsung dari situ lewat
     Susun.sudut() — tanpa satu larik kecil pun per titik. Ini jalur terpanas
     berkas ini: tiap pegawai ±45 kotak, tiap frame. Urutan sudut tiap muka
     berlawanan jarum jam dilihat dari luar (culling bergantung padanya). */
  const SUDUT = new Float32Array(24);
  const MUKA = [   // [bit sisi, i0, i1, i2, i3, sumbu normal (0 x, 1 y, 2 z), tanda]
    [1, 4, 5, 7, 6, 2, 1], [2, 1, 0, 2, 3, 2, -1], [4, 5, 1, 3, 7, 0, 1],
    [8, 0, 4, 6, 2, 0, -1], [16, 6, 7, 3, 2, 1, 1], [32, 0, 1, 5, 4, 1, -1],
  ];
  /* Kotak sejajar sumbu. x0..x1, y0..y1 (tinggi), z0..z1 (kedalaman).
     o.sisi: bit sisi yang digambar; o.w: warna per sisi {atas, depan, ...};
     o.e: emisi 0..1. */
  function kotak(S, x0, x1, y0, y1, z0, z1, c, o = {}) {
    const sisi = o.sisi == null ? TANPA_BAWAH : o.sisi, e = o.e || 0, w = o.w;
    for (let i = 0; i < 8; i++) {
      SUDUT[i * 3] = i & 1 ? x1 : x0; SUDUT[i * 3 + 1] = i & 2 ? y1 : y0; SUDUT[i * 3 + 2] = i & 4 ? z1 : z0;
    }
    for (let f = 0; f < 6; f++) {
      const M = MUKA[f], bit = M[0], sumbu = M[5], tanda = M[6];
      if (!(sisi & bit)) continue;
      let warnaMuka = c;
      if (w) {
        warnaMuka = bit === S_DEPAN ? w.depan : bit === S_BELAKANG ? w.belakang : bit === S_ATAS ? w.atas
          : bit === S_BAWAH ? w.bawah : bit === S_KANAN ? (w.kanan || w.sisi) : (w.kiri || w.sisi);
        warnaMuka = warnaMuka || c;
      }
      S.sudut(M[1], M[2], M[3], M[4], sumbu === 0 ? tanda : 0, sumbu === 1 ? tanda : 0, sumbu === 2 ? tanda : 0, warnaMuka, e);
    }
  }
  // Kotak terputar (sendi pegawai, kipas, bendera). m: afin 3x4 dari A3.
  function kotakM(S, m, x0, x1, y0, y1, z0, z1, c, e = 0, sisi = SEMUA) {
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? x1 : x0, y = i & 2 ? y1 : y0, z = i & 4 ? z1 : z0;
      SUDUT[i * 3] = m[0] * x + m[1] * y + m[2] * z + m[3];
      SUDUT[i * 3 + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
      SUDUT[i * 3 + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
    }
    // sumbu lokal yang sudah diputar = kolom matriks; dinormalkan (ada skala)
    const lx = Math.hypot(m[0], m[4], m[8]) || 1, ly = Math.hypot(m[1], m[5], m[9]) || 1, lz = Math.hypot(m[2], m[6], m[10]) || 1;
    for (let f = 0; f < 6; f++) {
      const M = MUKA[f], sumbu = M[5];
      if (!(sisi & M[0])) continue;
      const k = M[6] / (sumbu === 0 ? lx : sumbu === 1 ? ly : lz);
      S.sudut(M[1], M[2], M[3], M[4], m[sumbu] * k, m[4 + sumbu] * k, m[8 + sumbu] * k, c, e);
    }
  }
  function norm3(x, y, z) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }

  // Tabung bersegi (tiang bendera, APAR, ember, tong). Tutup atas ikut.
  function tabung(S, cx, cz, r, y0, y1, c, o = {}) {
    const n = o.segmen || 10, e = o.e || 0, ca = o.atas || c;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      const am = (a0 + a1) / 2;
      S.segi([x1, y0, z1], [x0, y0, z0], [x0, y1, z0], [x1, y1, z1], [Math.cos(am), 0, Math.sin(am)], c, UV_POLOS, e);
      // tutup: kipas segitiga (pusat, v1, v0) — berlawanan jarum jam dilihat dari atas
      if (!o.tanpaAtas) S.segi([cx, y1, cz], [cx, y1, cz], [x1, y1, z1], [x0, y1, z0], [0, 1, 0], ca, UV_POLOS, e);
    }
  }

  const PUTIH = [1, 1, 1, 1];

  // ------------------------------------------------------------- shader
  const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec4 aWarna;
layout(location=3) in vec2 aUV;
layout(location=4) in float aEmisi;
uniform mat4 uVP;
uniform mat4 uCahayaVP;
out vec3 vPos; out vec3 vNor; out vec4 vWarna; out vec2 vUV; out float vEmisi; out vec3 vBayang;
void main() {
  vPos = aPos; vNor = aNor; vWarna = aWarna; vUV = aUV; vEmisi = aEmisi;
  vec4 lc = uCahayaVP * vec4(aPos + aNor * 0.7, 1.0);
  vBayang = lc.xyz / lc.w * 0.5 + 0.5;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;
  const FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vPos; in vec3 vNor; in vec4 vWarna; in vec2 vUV; in float vEmisi; in vec3 vBayang;
uniform sampler2D uTeks;
uniform sampler2DShadow uPeta;
uniform vec3 uArah;
uniform vec3 uKunci;
uniform vec3 uLangit;
uniform vec3 uTanah;
uniform vec4 uLampuPos[16];     // xyz posisi, w = redaman (lampu ruangan 0,00016; lampu meja 0,025)
uniform vec3 uLampuWarna[16];
uniform float uUji;
uniform float uBayangNyala;
uniform float uTexel;
uniform float uPudar;      // 1: lintasan campur (alfa sungguhan), 0: alfa lewat dither
out vec4 hasil;
float bayang() {
  if (uBayangNyala < 0.5) return 1.0;
  if (vBayang.x < 0.0 || vBayang.x > 1.0 || vBayang.y < 0.0 || vBayang.y > 1.0 || vBayang.z > 1.0) return 1.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++)
    for (int j = -1; j <= 1; j++)
      s += texture(uPeta, vec3(vBayang.xy + vec2(float(i), float(j)) * uTexel, vBayang.z - 0.0012));
  return s / 9.0;
}
// ambang dither Bayer 4x4: transparansi tanpa urutan gambar
float bayer(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main() {
  vec4 t = texture(uTeks, vUV);
  if (t.a < uUji) discard;
  vec3 dasar = (t.rgb / max(t.a, 0.001)) * vWarna.rgb;
  if (uPudar < 0.5 && vWarna.a < 0.999 && vWarna.a < bayer(gl_FragCoord.xy)) discard;
  vec3 n = normalize(vNor);
  if (!gl_FrontFacing) n = -n;
  vec3 cahaya = mix(uTanah, uLangit, n.y * 0.5 + 0.5);
  cahaya += uKunci * max(dot(n, uArah), 0.0) * bayang();
  for (int i = 0; i < 16; i++) {
    vec3 d = uLampuPos[i].xyz - vPos;
    float jarak = max(length(d), 0.001);
    float redam = 1.0 / (1.0 + jarak * jarak * uLampuPos[i].w);
    cahaya += uLampuWarna[i] * (0.35 + 0.65 * max(dot(n, d / jarak), 0.0)) * redam;
  }
  vec3 rgb = dasar * mix(cahaya, vec3(1.0), clamp(vEmisi, 0.0, 1.0));
  hasil = vec4(rgb, uPudar > 0.5 ? vWarna.a : 1.0);
}`;
  const VS_BAYANG = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uCahayaVP;
void main() { gl_Position = uCahayaVP * vec4(aPos, 1.0); }`;
  const FS_BAYANG = `#version 300 es
precision mediump float;
out vec4 hasil;
void main() { hasil = vec4(1.0); }`;

  function program(vs, fs) {
    const buat = (jenis, src) => {
      const s = gl.createShader(jenis);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, buat(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, buat(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('program: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const nama = info.name.replace(/\[0\]$/, '');
      u[nama] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  let PROG, PROG_BAYANG;
  try {
    PROG = program(VS, FS);
    PROG_BAYANG = program(VS_BAYANG, FS_BAYANG);
  } catch (e) {
    console.warn('[3d]', e);
    if (tombol) { tombol.disabled = true; tombol.title = 'tampilan 3D gagal disiapkan: ' + e.message; }
    return;
  }

  // ------------------------------------------------------------ penyangga
  class Wadah {
    constructor(dinamis) {
      this.vao = gl.createVertexArray();
      this.vbo = gl.createBuffer();
      this.dinamis = dinamis;
      this.n = 0;
      this.kap = 0;
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      const B = LANGKAH * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, B, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, B, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, B, 24);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, B, 40);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, B, 48);
      gl.bindVertexArray(null);
    }
    isi(S) {
      this.n = S.jumlah;
      // WebGL2: panjang 0 di bufferSubData berarti "salin SELURUH sisa larik",
      // bukan "tidak ada yang disalin" — wadah kosong harus berhenti di sini
      if (!S.n) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      const bytes = S.n * 4;
      if (bytes > this.kap) {
        this.kap = Math.max(bytes, this.kap * 2);
        gl.bufferData(gl.ARRAY_BUFFER, this.kap, this.dinamis ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, S.d, 0, S.n);
      this.n = S.jumlah;
    }
    gambar() {
      if (!this.n) return;
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.n);
    }
  }

  // ------------------------------------------------------------- tekstur
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const anis = gl.getExtension('EXT_texture_filter_anisotropic');
  /* halus: mipmap + anisotropi (dinding, lantai, atlas kulit — dilihat
     miring dan dari jauh). Tanpa halus: tanpa mipmap, untuk kartu event yang
     diunggah ulang tiap beberapa frame dan tidak sanggup membayar mipmap. */
  function tekstur(w, h, halus = true) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, halus ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    // perbesaran NEAREST: dari dekat pikselnya tetap kotak, seperti pixel-art aslinya
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (anis && halus) gl.texParameterf(gl.TEXTURE_2D, anis.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    return t;
  }
  // sumber seukuran teksturnya: timpa isi, jangan alokasi ulang
  function unggah(t, sumber, mip = true) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sumber);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  }
  const TEK_PUTIH = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, TEK_PUTIH);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

  function kanvasBaru(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const k = c.getContext('2d');
    k.imageSmoothingEnabled = false;
    return [c, k];
  }

  // ---------------------------------------------- lapisan dinding & lantai
  /* Dinding: seluruh bidang dinding 2D (baris 0..110) apa adanya — drawWall,
     prop yang menempel di dinding, gambarDinding event, dan bukaan ruang
     kadis. Perabot yang BERDIRI di depan dinding tidak ikut: mereka jadi
     benda 3D sendiri, jadi dinding di belakangnya harus polos. Fungsi yang
     menggambar dua-duanya (drawWindow: jendela + meja printer, drawFiling:
     kabinet + bagan) dipanggil di dalam klip bagian dindingnya saja. */
  const [kvDinding, kDinding] = kanvasBaru(W * K, TINGGI_DINDING * K);
  const TEK_DINDING = tekstur(kvDinding.width, kvDinding.height);
  // Lantai: dunia y DINDING_Z..LANTAI_Z1. Pita 100..110 (di bawah dinding
  // yang dimundurkan) dan 356..364 disalin dari baris ubin terdekat.
  const [kvLantai, kLantai] = kanvasBaru(W * K, (LANTAI_Z1 - DINDING_Z) * K);
  const TEK_LANTAI = tekstur(kvLantai.width, kvLantai.height);

  const klip = (x, y, w, h, fn) => { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); fn(); ctx.restore(); };
  const aman = (fn) => { try { fn(); } catch (e) { catatGalat(e); } };
  let galatTerakhir = '';
  function catatGalat(e) {
    const s = String(e && e.message || e);
    if (s !== galatTerakhir) { galatTerakhir = s; console.warn('[3d]', e); }
  }

  function lukisDinding(stasiun) {
    gambarKe(kDinding, () => {
      ctx.setTransform(K, 0, 0, K, 0, 0);
      ctx.clearRect(0, 0, W, TINGGI_DINDING);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      TIGA.tanpaNeon = TIGA.tanpaCCTV = true;      // neon & kubah CCTV: benda 3D sendiri
      aman(() => drawWall());
      TIGA.tanpaNeon = TIGA.tanpaCCTV = false;
      // urutan 2D: gambarDinding event tepat sesudah dinding, SEBELUM prop
      // (pintu, jendela) — yang menempel di daun pintu memang tertutup pintunya
      aman(() => gambarLapis('gambarDinding'));
      aman(() => drawEdaran());
      aman(() => drawNomorAntre());
      // monitor CRT: benda 3D di rak dinding sendiri (monitorCRT, kulit 'crt'),
      // bukan lukisan di bidang dinding — kalau ikut, dari samping kelihatan dobel
      aman(() => drawPlakatNilai());
      // jendela + gorden, tanpa meja printer di bawahnya (itu benda 3D)
      aman(() => klip(JENDELA.x - 10, 0, JENDELA.w + 50, JENDELA.y + JENDELA.h + 7, () => drawWindow(stasiun.has('web'))));
      // bagan struktur organisasi, tanpa filing kabinet di bawahnya
      aman(() => klip(103, 18, 58, 43, () => drawFiling(stasiun.has('search'))));
      aman(() => drawKadis(stasiun.has('agent')));
      // bukaan ruang kadis: cuma KUSEN-nya yang dilukis — isinya ruangan 3D
      // sungguhan di balik lubang dinding (bangunRuangKadis), bukan lukisan
      aman(() => { if (sisipBoleh()) drawKusenSisip(); });
      ctx.globalAlpha = 1;
    });
    unggah(TEK_DINDING, kvDinding);
  }

  function lukisLantai() {
    gambarKe(kLantai, () => {
      ctx.setTransform(K, 0, 0, K, 0, -DINDING_Z * K);
      ctx.clearRect(0, DINDING_Z, W, LANTAI_Z1 - DINDING_Z);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      aman(() => {
        const L = lantaiLapis();
        const perBaris = L.height / (H - FLOOR_TOP);
        ctx.drawImage(L, 0, 0, L.width, 10 * perBaris, 0, DINDING_Z, W, FLOOR_TOP - DINDING_Z);
        ctx.drawImage(L, 0, L.height - 8 * perBaris, L.width, 8 * perBaris, 0, H, W, LANTAI_Z1 - H);
      });
      aman(() => drawFloor());
      aman(() => drawPropLantai());
      aman(() => gambarLapis('gambarLantai'));
      // keset & plat pintu kadis yang jatuh di bawah garis dinding
      aman(() => klip(0, FLOOR_TOP, W, 20, () => drawKadis(false)));
      ctx.globalAlpha = 1;
    });
    unggah(TEK_LANTAI, kvLantai);
  }

  // ------------------------------------------------------ kulit perabot
  /* Satu kulit = satu kotak 2D (rect) yang dilukis fungsi gambar aslinya ke
     kanvas kecilnya sendiri, lalu diunggah ke atlas di tempat tetapnya. Yang
     berkedip (rak server, akuarium) dilukis ulang lebih sering; sisanya
     sesekali saja — cukup buat keadaan RUANGAN yang berubah pelan. */
  const TEK_KULIT = tekstur(ATLAS, ATLAS);
  const KULIT = [];
  let rakX = 0, rakY = 0, rakT = 0, kulitKotor = false;
  function kulit(id, rect, gambar, laju = 1) {
    const w = Math.ceil(rect.w * K), h = Math.ceil(rect.h * K);
    if (rakX + w + 4 > ATLAS) { rakX = 0; rakY += rakT + 4; rakT = 0; }
    if (rakY + h + 4 > ATLAS) { console.warn('[3d] atlas penuh', id); return null; }
    const px = rakX + 2, py = rakY + 2;
    rakX += w + 4; rakT = Math.max(rakT, h);
    const [kv, k] = kanvasBaru(w, h);
    const s = {
      id, rect, gambar, laju, kv, k, px, py, w, h, terakhir: -1e9,
      uv: [px / ATLAS, py / ATLAS, (px + w) / ATLAS, (py + h) / ATLAS],
      sisi: null, atas: null,
    };
    KULIT.push(s);
    return s;
  }
  function lukisKulit(s, stasiun) {
    const { k, rect } = s;
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.clearRect(0, 0, s.w, s.h);
    gambarKe(k, () => {
      ctx.setTransform(K, 0, 0, K, -rect.x * K, -rect.y * K);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      klip(rect.x, rect.y, rect.w, rect.h, () => aman(() => s.gambar(stasiun)));
      ctx.globalAlpha = 1;
    });
    gl.bindTexture(gl.TEXTURE_2D, TEK_KULIT);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, s.px, s.py, gl.RGBA, gl.UNSIGNED_BYTE, s.kv);
    kulitKotor = true;
    s.terakhir = now;
    if (!s.sisi) cicipWarna(s);
  }
  // Warna sisi & tutup kotak diambil dari tepi kulitnya sendiri: kolom paling
  // kiri untuk samping, baris paling atas untuk tutup. Lemari kayu dapat
  // samping kayu, rak server samping besi gelap — tanpa tabel warna kedua.
  function cicipWarna(s) {
    try {
      const d = s.k.getImageData(0, 0, s.w, s.h).data;
      const rata = (titik) => {
        let r = 0, g = 0, b = 0, n = 0;
        for (const [x, y] of titik) {
          const i = (y * s.w + x) * 4;
          if (d[i + 3] < 128) continue;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        return n ? [r / n / 255, g / n / 255, b / n / 255, 1] : null;
      };
      const kiri = [], atas = [];
      for (let y = 0; y < s.h; y += 2) kiri.push([Math.min(s.w - 1, 1), y]);
      for (let x = 0; x < s.w; x += 2) atas.push([x, Math.min(s.h - 1, 1)]);
      s.sisi = rata(kiri) || [0.5, 0.45, 0.4, 1];
      s.atas = rata(atas) || s.sisi;
    } catch { s.sisi = [0.5, 0.45, 0.4, 1]; s.atas = s.sisi; }
  }

  // ------------------------------------------------------------ adegan
  /* Grup menurut tekstur: satu wadah = satu drawArrays. Yang statis dibangun
     sekali di frame 3D pertama; yang dinamis disusun ulang tiap frame. */
  /* pudar: yang tembus pandang sungguhan — pegawai standby (0,55 seperti di
     2D), yang memudar di ambang pintu, dan partikel. Digambar paling akhir
     dalam dua lintasan: kedalaman dulu, lalu warna dicampur di permukaan
     terdepan saja, jadi sosoknya tetap utuh, bukan tumpukan kotak bening. */
  const G = {
    polos: new Susun(), dinding: new Susun(), lantai: new Susun(), kulit: new Susun(),
    dinamis: new Susun(), samping: new Susun(), pudar: new Susun(), kartu: new Susun(), tint: new Susun(64),
    kadisPolos: new Susun(), kadisKulit: new Susun(), sumbat: new Susun(64), kartuSisi: new Susun(), berkas: new Susun(64), dinamisKulit: new Susun(64),
    perabot: new Susun(), kaca: new Susun(64), temaDinding: new Susun(64), sinar: new Susun(64),
  };
  /* perabot: isi perabot yang ikut keadaan RUANGAN (tumpukan berkas, map
     disposisi, buku tamu, kusut meja, tanaman layu, isi lemari arsip). Tidak
     disusun tiap frame — dibangun ulang cuma waktu tandaPerabot() berubah.
     kaca: air akuarium & pintu kaca lemari piala — tembus pandang di lintasan
     pudar, tapi TIDAK ikut peta bayangan (kaca yang membayangi isinya sendiri
     menggelapkan piala di baliknya).
     sinar: kembaran dinamisnya — cahaya & hawa yang bukan benda (genangan
     lampu meja, hembusan AC, petak silau matahari). Disusun tiap frame,
     dicampur di lintasan pudar, tidak berbayang: petak silau 0,15 di atas
     lantai yang ikut peta bayangan malah menggelapkan lantai di bawahnya. */
  const WADAH = {
    polos: new Wadah(false), dinding: new Wadah(false), lantai: new Wadah(false), kulit: new Wadah(false),
    dinamis: new Wadah(true), samping: new Wadah(true), pudar: new Wadah(true), kartu: new Wadah(true),
    tint: new Wadah(true), kadisPolos: new Wadah(false), kadisKulit: new Wadah(false), sumbat: new Wadah(true),
    kartuSisi: new Wadah(true), berkas: new Wadah(true), dinamisKulit: new Wadah(true), perabot: new Wadah(false),
    kaca: new Wadah(false), temaDinding: new Wadah(false), sinar: new Wadah(true),
  };

  /* Kotak yang muka depannya kulit 2D. Muka depan ada di z1 (garis kaki 2D) dan
     kulitnya direntang dari y0 ke y1; tinggi kotak sengaja sama dengan tinggi
     rect kulitnya, jadi satu piksel dunia tetap satu satuan tinggi. */
  function kotakKulit(s, x0, x1, y0, y1, z0, z1, o = {}) {
    if (!s) { kotak(G.polos, x0, x1, y0, y1, z0, z1, warna('#8a8f86')); return; }
    G.kulit.segi([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], PUTIH, s.uv, o.e || 0);
    const sisi = () => s.sisi || [0.5, 0.45, 0.4, 1];
    const atas = () => s.atas || sisi();
    // warna sisi baru ada sesudah kulit dilukis pertama kali — bangunStatis
    // dipanggil sesudah semua kulit dilukis, jadi di sini sudah terisi
    kotak(G.polos, x0, x1, y0, y1, z0, z1, sisi(), { sisi: S_KIRI | S_KANAN | S_ATAS | S_BELAKANG, w: { atas: o.atas || atas() } });
  }
  /* Relief kulit. Perabot berkulit tidak lagi kotak bermuka papan: mukanya
     dipecah jadi lapisan menurut bagian lukisannya — unit rak yang menonjol
     dari rongga, laci, panel, pintu. Tiap lapisan kotak sendiri; mukanya
     potongan kulit yang SAMA (LED tetap berkedip, angka tetap berganti),
     sisi-sisinya warna tepi lukisan di tempat itu, dicicip dari kanvas
     kulitnya. Lapisan {x, y, w, h} dalam koordinat 2D, {z0, z1} kedalaman;
     tinggi 3D = peta.dasar + (peta.kaki - y2D) * peta.kh, x satu banding satu. */
  function cicipKulit(s, x0, y0, x1, y1) {
    if (!s.data) { try { s.data = s.k.getImageData(0, 0, s.w, s.h).data; } catch { return [0.5, 0.5, 0.5, 1]; } }
    const R = s.rect, d = s.data;
    let r = 0, g = 0, b = 0, n = 0;
    const X0 = Math.max(0, Math.floor((x0 - R.x) * K)), X1 = Math.min(s.w - 1, Math.ceil((x1 - R.x) * K) - 1);
    const Y0 = Math.max(0, Math.floor((y0 - R.y) * K)), Y1 = Math.min(s.h - 1, Math.ceil((y1 - R.y) * K) - 1);
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const i = (y * s.w + x) * 4;
      if (d[i + 3] < 128) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    return n ? [r / n / 255, g / n / 255, b / n / 255, 1] : (s.sisi || [0.5, 0.5, 0.5, 1]);
  }
  function lapisKulit(S, Sk, s, peta, L, geserZ = 0) {
    const h3 = (y) => peta.dasar + (peta.kaki - y) * peta.kh;
    const x0 = L.x, x1 = L.x + L.w, y0 = h3(L.y + L.h), y1 = h3(L.y), z0 = L.z0 + geserZ, z1 = L.z1 + geserZ;
    Sk.segi([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], PUTIH, subUV(s, x0, L.y, x1, L.y + L.h), L.e || 0);
    if (!L.w3) {
      const t = 0.7;
      L.w3 = { atas: cicipKulit(s, x0, L.y, x1, L.y + t), bawah: cicipKulit(s, x0, L.y + L.h - t, x1, L.y + L.h),
        kiri: cicipKulit(s, x0, L.y, x0 + t, L.y + L.h), kanan: cicipKulit(s, x1 - t, L.y, x1, L.y + L.h) };
    }
    kotak(S, x0, x1, y0, y1, z0, z1, L.w3.kiri, { sisi: L.sisi == null ? S_KIRI | S_KANAN | S_ATAS | S_BAWAH : L.sisi, w: L.w3 });
  }
  function reliefKulit(S, Sk, s, peta, lapisan) {
    for (const L of lapisan) lapisKulit(S, Sk, s, peta, L);
  }
  // Benda rendah yang tutupnya memakai lukisan lantai 2D di tapaknya sendiri
  // (karpet, meja lesehan, bantal): lukisannya sudah benar dilihat dari atas.
  function timbul(x0, x1, z0, z1, h, sisiWarna) {
    const u0 = x0 / W, u1 = x1 / W;
    const v0 = (z0 - DINDING_Z) / (LANTAI_Z1 - DINDING_Z), v1 = (z1 - DINDING_Z) / (LANTAI_Z1 - DINDING_Z);
    G.lantai.segi([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], PUTIH, [u0, v0, u1, v1]);
    kotak(G.polos, x0, x1, 0, h, z0, z1, sisiWarna, { sisi: S_DEPAN | S_BELAKANG | S_KIRI | S_KANAN });
  }

  const KAYU = warna(P.wood), KAYU_TUA = warna(P.woodD), BESI = warna('#9aa1a6'), BESI_TUA = warna('#5a6068');
  const KREM = warna(P.cream), MINT = warna(P.mint), LIS = warna(P.rail), PLIN = warna(P.base);

  // meja berkaki empat: papan setebal 3, kaki 3x3 di sudut, palang di belakang
  function meja(x0, x1, z0, z1, h, cPapan, cKaki, o = {}) {
    const t = o.tebal || 3, k = o.kaki || 3;
    kotak(G.polos, x0, x1, h - t, h, z0, z1, cPapan, { sisi: SEMUA });
    for (const kx of [x0 + 1, x1 - 1 - k]) {
      for (const kz of [z0 + 1, z1 - 1 - k]) kotak(G.polos, kx, kx + k, 0, h - t, kz, kz + k, cKaki);
    }
    if (o.palang !== false) kotak(G.polos, x0 + 2, x1 - 2, h * 0.35, h * 0.35 + 2, z0 + 1.5, z0 + 3, cKaki);
  }

  // ------------------------------------------------------- daftar kulit
  let K_ = null;   // semua kulit bernama, diisi siapkanKulit()
  function siapkanKulit() {
    const aktif = (st) => (S) => S.has(st);
    /* Yang dulu kartu tegak — lemari arsip, barang di atas meja stempel,
       fotokopi, dan meja kerja, tanaman & palem, buku tamu, rak brosur,
       sanitizer — sekarang voxel (bagian "Perabot voxel"), begitu juga
       akuarium, kedua lemari piala, dan rak pojok baca, jadi tidak punya
       kulit lagi; mesin absen & penghancur kertas juga (penuh voxel). Yang
       tersisa di sini cuma muka yang memang lukisan — kain X-banner, papan
       VISI, muka depan lemari/mesin — dan itu pun dipasang sebagai relief
       (reliefKulit: unit, laci, panel yang menonjol dari mukanya). */
    K_ = {
      visi: kulit('visi', { x: 84, y: 64, w: 22, h: 48 }, () => drawVisi(), 0.5),
      // laci filing selalu dilukis TERTUTUP: laci yang ketarik keluar
      // dikerjakan laci 3D (laciFiling), bukan lukisan yang menimpa laci di bawahnya
      filing: kulit('filing', { x: 106, y: 62, w: 52, h: 57 }, () => filingTertutup(() => { drawFiling(false); drawStiker(); }), 3),
      server: kulit('server', { x: 360, y: 29, w: 60, h: 91 }, (S) => { drawServer(aktif('server')(S)); drawStiker(); }, 12),
      // layar monitor CRT di rak dinding (monitorCRT); tidak lagi ikut lukisan dinding
      crt: kulit('crt', { x: 159, y: 45, w: 18, h: 16 }, () => drawCRT(), 6),
      fotokopi: kulit('fotokopi', { x: FOTOKOPI.x, y: FOTOKOPI.y + 12, w: FOTOKOPI.w, h: FOTOKOPI.h - 12 }, () => drawFotokopi(), 6),
      // daun pintu kadis: lukisan pintu TERTUTUP (panel timbul, gagang kuningan,
      // plat tendang & titik kuningan jumlah tamu); bukanya dikerjakan daun 3D
      pintuKadis: kulit('pintuKadis', { x: PINTU_KADIS.x + 3, y: PINTU_KADIS.y + 4, w: PINTU_KADIS.w - 6, h: PINTU_KADIS.h - 4 },
        () => denganNilai(MOD, 'pintuKadis', false, () => drawKadis(false)), 2),
      // kain X-banner selalu dilukis TEGAK: miring & rebahnya dikerjakan
      // geometri 3D (xBanner), bukan lukisan yang memendek
      xbanner: kulit('xbanner', { x: XBANNER.x, y: XBANNER.y, w: XBANNER.w, h: XBANNER.h }, () => denganNilai(RUANGAN.xbanner, 'sudut', 0, drawXBanner), 1),
      rimpel: kulit('rimpel', { x: RAPAT.xFL, y: RAPAT.yF, w: RAPAT.xFR - RAPAT.xFL, h: 19 }, (S) => drawRapat(aktif('rapat')(S)), 1),
      konter: kulit('konter', { x: PANTRI.x + 9, y: PANTRI.y + PANTRI.atas + 10, w: 50, h: 10 }, () => drawPantry(), 1),
      microwave: kulit('microwave', { x: PANTRI.x + 34, y: PANTRI.y + PANTRI.atas - 7, w: 21, h: 16 }, () => drawPantry(), 2),
      papanPantri: kulit('papanPantri', { x: PANTRI.x + 14, y: PANTRI.y - 9, w: 26, h: 9 }, () => drawPantry(), 0.3),
      dispenser: kulit('dispenser', { x: pantriX(462), y: 254, w: 18, h: 34 }, () => drawDispenserPantry(), 1),
      posSatpam: kulit('posSatpam', { x: POS_SATPAM.x + 3, y: 296, w: 23, h: 18 }, () => drawPosSatpam(), 1),
      // trio pejabat ruang kadis: dilukis fungsi yang sama dengan dinding ruang utama
      fotoKadis: kulit('fotoKadis', { x: 268, y: 6, w: 12, h: 15 }, () => drawPortrait(268, 6), 0.2),
      garudaKadis: kulit('garudaKadis', { x: 290, y: 6, w: 20, h: 16 }, () => drawGaruda(300, 6), 0.2),
      // daun pintu WC & gudang: selalu lukisan TERTUTUP-nya (plang, kisi yang
      // berpendar waktu terisi, strip hazard, gembok) — pintu yang terbuka di
      // 3D adalah daun yang mengayun, bukan lukisan isi ruangan di daunnya
      pintuWC: kulit('pintuWC', { x: WC.x + 2, y: WC.y + 2, w: WC.w - 4, h: WC.h - 2 }, () => tertutup(wcKeadaan, drawPintuWC), 3),
      pintuGudang: kulit('pintuGudang', { x: GUDANG.x + 2, y: GUDANG.y + 2, w: GUDANG.w - 4, h: GUDANG.h - 2 }, () => tertutup(gudangKeadaan, drawPintuGudang), 3),
    };
  }

  // Lukis dengan satu nilai keadaan ditahan sementara SELAMA fungsi gambarnya
  // jalan (sinkron), lalu dikembalikan — juga kalau gambarnya melempar.
  function denganNilai(obj, kunci, nilai, gambar) {
    if (!obj) { gambar(); return; }
    const simpan = obj[kunci];
    obj[kunci] = nilai;
    try { gambar(); } finally { obj[kunci] = simpan; }
  }
  // pintu WC & gudang dilukis tertutup: daun 3D-lah yang membukanya
  const tertutup = (keadaan, gambar) => denganNilai(keadaan, 'bukaSampai', 0, gambar);
  // lemari filing dilukis dengan ketiga lacinya tertutup & berisi (drawFiling)
  const filingTertutup = (gambar) => denganNilai(RUANGAN, 'laciBuka', 0, () => denganNilai(RUANGAN, 'laciTerbuka', -1,
    () => denganNilai(RUANGAN, 'laciCelah', 0, () => denganNilai(MOD, 'laciKosong', 0, gambar))));
  // uv sebagian kulit: kotak 2D (x0,y0)-(x1,y1) yang ada di dalam rect kulitnya
  function subUV(s, x0, y0, x1, y1) {
    const R = s.rect;
    return [(s.px + (x0 - R.x) * K) / ATLAS, (s.py + (y0 - R.y) * K) / ATLAS, (s.px + (x1 - R.x) * K) / ATLAS, (s.py + (y1 - R.y) * K) / ATLAS];
  }

  // ------------------------------------------- perabot berkulit bertekstur timbul
  /* Rak server (drawServer 2D, rangka 362..418 x y31..120): rangka luar setebal
     rak, rongga dalam masuk ke z 116,5, lima unit (patch panel, dua server,
     storage, switch) menonjol dari rongganya, papan nama & UPS paling depan. */
  function rakServer(S, s) {
    if (!s) { kotakKulit(s, 360, 420, 0, 91, DINDING_Z + 2, 120); return; }
    const z0 = DINDING_Z + 2, r0 = 116.5;
    const L = [
      { x: 362, y: 31, w: 56, h: 89, z0, z1: r0, sisi: S_KIRI | S_KANAN | S_ATAS },      // punggung = dasar rongga
      { x: 362, y: 31, w: 4, h: 89, z0: r0, z1: 120 },                                 // tiang kiri
      { x: 414, y: 31, w: 4, h: 89, z0: r0, z1: 120 },                                 // tiang kanan
      { x: 366, y: 31, w: 48, h: 17, z0: r0, z1: 120, sisi: S_ATAS | S_BAWAH },        // kepala rak
      { x: 366, y: 103, w: 48, h: 17, z0: r0, z1: 120, sisi: S_ATAS },                 // kaki rak
      { x: 367, y: 37, w: 46, h: 10, z0: 120, z1: 120.7 },                             // papan nama PC SERVER
      { x: 367, y: 103, w: 46, h: 13, z0: 120, z1: 120.9 },                            // UPS
    ];
    for (let u = 0; u < 5; u++) L.push({ x: 368, y: 49 + u * 11, w: 44, h: 10, z0: r0, z1: 119.3 });
    reliefKulit(S, G.kulit, s, { dasar: 0, kaki: 120, kh: 1 }, L);
  }
  /* Lemari filing (drawFiling 2D, badan 107..157 x y62..119): badannya relief
     statis; ketiga lacinya kotak sungguhan yang meluncur keluar (laciFiling)
     waktu ada yang mencari berkas, laci yang tertinggal terbuka, atau yang
     sudah dikosongkan. Kulitnya dilukis tertutup (filingTertutup). */
  const FILING = { muka: 117.6, buka: [0, 0, 0], laci: [] };
  function badanFiling(S, s) {
    if (!s) { kotakKulit(s, 106, 158, 0, 57, DINDING_Z + 2, 119); return; }
    lapisKulit(S, G.kulit, s, { dasar: 0, kaki: 119, kh: 1 }, { x: 107, y: 62, w: 50, h: 57, z0: DINDING_Z + 2, z1: FILING.muka, sisi: S_KIRI | S_KANAN | S_ATAS });
  }
  function laciFiling(S, Sk, dt, stasiun) {
    const s = K_ && K_.filing;
    if (!s) return;
    const aktif = stasiun.has('search'), peta = { dasar: 0, kaki: 119, kh: 1 };
    for (let i = 0; i < 3; i++) {
      const kosong = i < (MOD.laciKosong || 0);
      const buka = kosong || ((aktif || RUANGAN.laciBuka > 0) && i === 0) || i === RUANGAN.laciTerbuka;
      const tuju = buka ? 10 : (i === 0 && RUANGAN.laciCelah > 0 ? RUANGAN.laciCelah * 1.4 : 0);
      FILING.buka[i] += (tuju - FILING.buka[i]) * (geraKurang3.matches ? 1 : Math.min(1, Math.max(0, dt) * 8));
      const b = FILING.buka[i], dy = 66 + i * 17, hT = 119 - dy, hB = hT - 14, zf = FILING.muka + 1 + b;
      const L = FILING.laci[i] || (FILING.laci[i] = { x: 111, y: dy, w: 42, h: 14, z0: FILING.muka - 14, z1: FILING.muka + 1, sisi: S_KIRI | S_KANAN | S_BAWAH });
      lapisKulit(S, Sk, s, peta, L, b);                                               // muka laci + badannya, meluncur sejauh b
      kotak(S, 126, 138, hT - 9, hT - 6, zf, zf + 0.9, warna('#8b939b'), { sisi: SEMUA });   // gagang logam
      // dasar laci yang gelap tepat di bawah bibirnya: dari atas terbaca lubang
      kotak(S, 111.4, 152.6, hT - 1.6, hT - 1.5, zf - 15, zf - 0.4, warna(kosong ? '#1a1d21' : '#2a2e33'), { sisi: S_ATAS });
      if (b > 1.5 && !kosong) {
        for (let f = 0; f < 5; f++) {                                                   // map gantung, tab berwarna menyembul
          const mz = zf - 1.4 - (f % 2) * 1.2 - Math.min(9, b - 1) * 0.5;
          kotak(S, 113 + f * 8, 119 + f * 8, hB + 3, hT + 0.7, mz - 0.5, mz, warna(['#c9a03a', '#3e6b4f', '#b03030'][f % 3]), { sisi: SEMUA });
        }
      }
    }
  }
  /* Fotokopi (drawFotokopi 2D, badan y92..118 di atas roda): dua laci kertas
     menonjol bergagang, lis merek, roda sungguhan di bawahnya, baki keluaran
     di sisi kanan. Tutup kaca & panelnya sudah voxel (atasFotokopi). */
  function fotokopiRelief(S, s) {
    const F = FOTOKOPI, z0 = DINDING_Z + 4;
    if (!s) { kotakKulit(s, F.x, F.x + F.w, 0, F.h - 12, z0, 120); return; }
    const kaki = F.y + F.h, abu = warna('#3a3f45');
    reliefKulit(S, G.kulit, s, { dasar: 0, kaki, kh: 1 }, [
      { x: F.x, y: F.y + 12, w: F.w, h: F.h - 14, z0, z1: 119.2, sisi: S_KIRI | S_KANAN | S_ATAS | S_BAWAH },   // badan di atas roda
      { x: F.x + 3, y: F.y + 22, w: F.w - 8, h: 6, z0: 117, z1: 120.3 },                                         // laci kertas atas
      { x: F.x + 3, y: F.y + 30, w: F.w - 8, h: 6, z0: 117, z1: 120.3 },                                         // laci kertas bawah
      { x: F.x + 3, y: F.y + 16, w: 10, h: 2, z0: 119, z1: 119.5 },                                              // lis merek
    ]);
    for (const ly of [F.y + 22, F.y + 30]) kotak(S, F.x + F.w / 2 - 5, F.x + F.w / 2 + 3, kaki - ly - 4, kaki - ly - 3, 120.3, 121, warna('#8d948c'), { sisi: SEMUA });
    for (const rx of [F.x + 2, F.x + F.w - 7]) for (const rz of [z0 + 1, 117]) kotak(S, rx, rx + 5, 0, 2, rz, rz + 2, abu, { sisi: SEMUA });   // roda
    kotak(S, F.x + F.w, F.x + F.w + 4, 24.2, 25, 108, 116, warna('#b9bdb6'), { sisi: SEMUA });                    // baki keluaran
  }
  /* Dispenser pantri (drawDispenserPantry 2D): ceruk tempat gelas masuk 2,4 ke
     dalam badan, keran panas & dingin menonjol dari punggung ceruk, baki tetes
     berkisi di dasarnya. */
  function dispenserRelief(S, s, dx) {
    if (!s) { kotakKulit(s, dx, dx + 18, 0, 34, 280, 290); return; }
    const z0 = 280, zn = 287.6;
    reliefKulit(S, G.kulit, s, { dasar: 0, kaki: 288, kh: 1 }, [
      { x: dx, y: 254, w: 18, h: 8, z0, z1: 290, sisi: S_KIRI | S_KANAN | S_ATAS | S_BAWAH },          // kepala, di atas ceruk
      { x: dx, y: 273, w: 18, h: 15, z0, z1: 290, sisi: S_KIRI | S_KANAN | S_ATAS },                   // badan bawah
      { x: dx, y: 262, w: 2, h: 11, z0, z1: 290, sisi: S_KIRI | S_KANAN },                             // tiang kiri ceruk
      { x: dx + 14, y: 262, w: 4, h: 11, z0, z1: 290, sisi: S_KIRI | S_KANAN },                        // tiang kanan ceruk
      { x: dx + 2, y: 262, w: 12, h: 11, z0, z1: zn, sisi: 0 },                                        // punggung ceruk
    ]);
    for (const [kx, c] of [[dx + 3, '#c03030'], [dx + 9, P.blue]]) {
      kotak(S, kx, kx + 3, 19, 22, zn, zn + 1.6, warna(c), { sisi: SEMUA });                         // keran
      kotak(S, kx + 1, kx + 2, 17.4, 19, zn + 0.6, zn + 1.4, warna('#c9cdd1'), { sisi: SEMUA });      // moncong
    }
    kotak(S, dx + 2, dx + 14, 15, 16.2, zn - 0.5, 290.6, warna('#c9cdd1'), { sisi: SEMUA, w: { atas: warna('#9aa1a6') } });   // baki tetes
    for (let i = 0; i < 4; i++) kotak(S, dx + 3 + i * 3, dx + 4 + i * 3, 16.2, 16.25, zn, 290.2, warna('#6b7278'), { sisi: S_ATAS });   // kisi
  }
  /* Microwave (drawPantry 2D, mx = PANTRI.x+34): jendela berjaring masuk 0,7 ke
     dalam bingkai pintunya, panel tombol rata dengan bingkai, gagang batang. */
  function microwaveRelief(S, s, px, cz0, cH) {
    const mx = px + 34, my = PANTRI.y + PANTRI.atas - 7, zb = cz0 + 1, zf = cz0 + 10;
    if (!s) { kotakKulit(s, mx, mx + 21, cH, cH + 16, zb, zf); return; }
    const lekuk = zf - 0.7;
    reliefKulit(S, G.kulit, s, { dasar: cH, kaki: my + 16, kh: 1 }, [
      { x: mx, y: my, w: 21, h: 16, z0: zb, z1: lekuk, sisi: S_KIRI | S_KANAN | S_ATAS },
      { x: mx, y: my, w: 21, h: 2, z0: lekuk, z1: zf, sisi: S_ATAS | S_BAWAH },             // bingkai atas
      { x: mx, y: my + 14, w: 21, h: 2, z0: lekuk, z1: zf, sisi: S_ATAS },                  // bingkai bawah
      { x: mx, y: my + 2, w: 1, h: 12, z0: lekuk, z1: zf, sisi: S_KANAN },                  // bingkai kiri
      { x: mx + 13, y: my + 2, w: 8, h: 12, z0: lekuk, z1: zf, sisi: S_KIRI },              // panel tombol
    ]);
    kotak(S, mx + 12.6, mx + 13.6, cH + 3, cH + 13, zf, zf + 1.1, warna('#8d9498'), { sisi: SEMUA });   // gagang batang
  }
  /* Lemari bawah counter pantri: dua daun pintu laminasi menonjol dari
     kusennya, masing-masing bertarikan logam. */
  function konterRelief(S, s, px, cz1, cH) {
    if (!s) { kotakKulit(s, px + 9, px + 59, 4, cH - 1.5, cz1 - 12, cz1); return; }
    const kh = (cH - 1.5 - 4) / 10, h3 = (y) => 4 + (223 - y) * kh;
    reliefKulit(S, G.kulit, s, { dasar: 4, kaki: 223, kh }, [
      { x: px + 9, y: 213, w: 50, h: 10, z0: cz1 - 12, z1: cz1 - 0.4, sisi: S_KIRI | S_KANAN },
      { x: px + 10, y: 214, w: 23, h: 8, z0: cz1 - 0.4, z1: cz1 },                          // daun kiri
      { x: px + 34, y: 214, w: 24, h: 8, z0: cz1 - 0.4, z1: cz1 },                          // daun kanan
    ]);
    for (const hx of [px + 28, px + 36]) kotak(S, hx, hx + 4, h3(218), h3(217), cz1, cz1 + 0.8, warna('#7c838a'), { sisi: SEMUA });
  }
  /* Penghancur kertas (drawPenghancur 2D), penuh voxel: tong berjendela yang
     memperlihatkan serpihan, kepala mesin bercelah, lampu siap, roda, dan
     lembar yang menunggu giliran di celahnya. */
  function penghancurVoxel(S) {
    const P2 = PENGHANCUR, x0 = P2.x, x1 = P2.x + P2.w, z0 = 340, z1 = 348, gelap = warna('#20242a');
    kotak(S, x0 + 1, x1 - 1, 2, 26, z0 + 0.5, z1 - 0.5, warna('#4a5058'), { sisi: SEMUA });
    kotak(S, x0 + 4, x1 - 4, 6, 22, z1 - 0.5, z1 - 0.4, gelap, { sisi: S_DEPAN });
    for (let i = 0; i < 6; i++) kotak(S, x0 + 5 + i * 2, x0 + 6 + i * 2, 6.5, 10 + (i % 3) * 2.5, z1 - 0.4, z1 - 0.3, warna('#e4ddc8'), { sisi: S_DEPAN });
    kotak(S, x0, x1, 26, 32, z0, z1, warna('#3a3f45'), { sisi: SEMUA, w: { atas: warna('#5a6068') } });
    kotak(S, x0 + 3, x1 - 3, 32, 32.08, z0 + 3.4, z0 + 4.4, gelap, { sisi: S_ATAS });                      // celah kertas
    kotak(S, x1 - 4, x1 - 2, 28.5, 29.5, z1, z1 + 0.15, warna('#57d06a'), { sisi: S_DEPAN, e: 0.9 });       // lampu siap
    kotak(S, x0 + 6, x1 - 6, 32, 35, z0 + 3.7, z0 + 4.1, warna(P.paper), { sisi: SEMUA });                 // lembar menunggu
    for (const [rx, rz] of [[x0 + 2, z1 - 2.5], [x1 - 4, z1 - 2.5], [x0 + 2, z0 + 1], [x1 - 4, z0 + 1]]) kotak(S, rx, rx + 2, 0, 2, rz, rz + 1.5, gelap);
  }
  // Mesin absen sidik jari di tembok (drawAbsensi 2D), dinamis: lampu layarnya
  // berkedip pelan, bantalan jempolnya merah selama absensinya bermasalah
  function mesinAbsen(S) {
    const merah = RUANGAN.absensiMerah, z = DINDING_Z, hijau = Math.sin(now / 500) > 0;
    kotak(S, 424, 433, 26, 39, z, z + 3, warna('#dfe2e6'), { sisi: SEMUA, w: { atas: warna('#f2f4f6') } });
    kotak(S, 426, 431, 33, 36, z + 3, z + 3.1, warna('#141a20'), { sisi: S_DEPAN });
    kotak(S, 427, 430, 34.4, 35, z + 3.1, z + 3.2, warna(merah ? '#e8453f' : hijau ? '#57d06a' : '#3e9450'), { sisi: S_DEPAN, e: 0.9 });
    kotak(S, 426, 431, 28, 32, z + 3, z + 3.7, warna(merah ? '#e8a0a0' : '#5fb56a'), { sisi: SEMUA, e: 0.25 });
  }

  // ----------------------------------------------------------- bangun statis
  function bangunStatis() {
    for (const k of ['polos', 'dinding', 'lantai', 'kulit', 'kaca']) G[k].kosongkan();
    const S = G.polos;

    // --- alas maket: kayu jati gelap, seperti maket gedung di lobi dinas
    // tutupnya 0,5 di bawah lantai: sebidang dengan lantai = z-fighting berkedip
    kotak(S, -12, W + 12, -14, -0.5, DINDING_Z - 12, LANTAI_Z1 + 8, warna('#3a2a1a'), { sisi: SEMUA, w: { atas: warna('#4a3826') } });
    kotak(S, -14, W + 14, -16, -12, DINDING_Z - 14, LANTAI_Z1 + 10, warna('#241a11'), { sisi: SEMUA });

    // --- lantai (lukisan lantai 2D)
    G.lantai.segi([0, 0, LANTAI_Z1], [W, 0, LANTAI_Z1], [W, 0, DINDING_Z], [0, 0, DINDING_Z], [0, 1, 0], PUTIH, [0, 0, 1, 1]);

    // --- dinding belakang: muka depan lukisan dinding 2D, dilubangi jendela
    // ruang kadis; badannya tembok berplester setebal 6; pajangannya timbul
    dindingBerlubang(S);
    reliefDinding(S);
    monitorCRT(S);

    // --- perabot dinding
    const k = K_;
    lemariArsip(S);                                          // rak terbuka; isinya di grup perabot
    standeeVisi(S);                                          // standee VISI berkaki silang
    // kulitnya mulai y=62: baris 61 milik bingkai bagan yang digambar sesudah kabinet
    badanFiling(S, k.filing);                                // lacinya dinamis: laciFiling
    // meja printer; printernya di bagian dinamis (bisa macet: tutup terangkat)
    meja(197, 229, DINDING_Z + 1, 117, 20, KAYU, KAYU_TUA, { palang: false });
    // meja stempel: bak, stempel, rak surat; tumpukan berkasnya di grup perabot
    meja(252, 320, DINDING_Z + 1, 118, 22, KAYU, KAYU_TUA);
    barangMejaStempel(S);
    rakServer(S, k.server);
    fotokopiRelief(S, k.fotokopi);                           // mesin absen: voxel dinamis (lampunya berkedip)
    atasFotokopi(S);
    lemariPiala(S);                                          // berpintu kaca; isinya voxel

    // --- meja rapat: taplak putih, rimpel hijau di muka depan (kulit 2D)
    const R = MEJA_RAPAT;
    timbul(152, 340, 176, 252, 0.8, warna('#743030'));          // karpet merah, tebal sejengkal
    kotak(S, R.x0, R.x1, R.h - 2, R.h, R.z0, R.z1, warna('#ece8da'), { sisi: SEMUA, w: { atas: warna('#f1eee2') } });
    if (k.rimpel) G.kulit.segi([R.x0 - 2, 0.8, R.z1 + 0.5], [R.x1 + 2, 0.8, R.z1 + 0.5], [R.x1 + 2, R.h, R.z1 + 0.5], [R.x0 - 2, R.h, R.z1 + 0.5], [0, 0, 1], PUTIH,
      [k.rimpel.uv[0], k.rimpel.uv[1], k.rimpel.uv[2], k.rimpel.uv[1] + (k.rimpel.uv[3] - k.rimpel.uv[1]) * (16 / 19)]);
    const HIJAU = warna('#2c5c38');
    kotak(S, R.x0 - 2, R.x0, 0.8, R.h, R.z0, R.z1 + 0.5, HIJAU);
    kotak(S, R.x1, R.x1 + 2, 0.8, R.h, R.z0, R.z1 + 0.5, HIJAU);
    kotak(S, R.x0, R.x1, 0.8, R.h - 2, R.z0, R.z0 + 1, HIJAU);
    barangMejaRapat(S, R);

    // --- barang lantai tengah (X-banner di bagian dinamis: dia bisa miring & rebah)
    // tiang bendera: alas + tiang; kainnya berkibar di bagian dinamis
    kotak(S, 127, 139, 0, 3, 267, 277, warna('#7c838a'));
    kotak(S, 129, 137, 3, 5, 269, 275, BESI);
    tabung(S, 133, 272, 1.1, 5, 62, warna('#c9ced4'), { segmen: 6 });
    kotak(S, 131.5, 134.5, 62, 65, 270.5, 273.5, warna(P.gold));
    // tanaman pot kiri: pot bata; daunnya voxel di grup perabot (bisa layu)
    kotak(S, 23, 43, 0, 14, 283, 297, warna('#7a4a30'), { w: { atas: warna('#5a3a26') } });
    kotak(S, 21, 45, 12, 16, 281, 299, warna('#8d5738'), { w: { atas: warna('#3a2a1a') } });
    // meja buku tamu + bukunya yang terbuka (tintanya di grup perabot)
    meja(52, 66, 290, 297, 8, warna('#8d5738'), warna('#6b4126'), { palang: false, tebal: 2, kaki: 2 });
    bukuTamu(S);
    // bangku tunggu besi tiga dudukan
    const BT = BANGKU_TUNGGU, baja = warna('#9fb0bd');
    for (let i = 0; i < 3; i++) {
      const sx = BT.x + 1 + i * 14;
      kotak(S, sx, sx + 13, 10, 12, 203, 212, baja, { sisi: SEMUA });
      kotak(S, sx, sx + 13, 12, 24, 202, 204, baja, { sisi: SEMUA });
    }
    kotak(S, BT.x, BT.x + BT.w, 7, 10, 205, 209, BESI_TUA);
    for (const kx of [BT.x + 4, BT.x + BT.w - 7]) kotak(S, kx, kx + 3, 0, 7, 205, 209, BESI_TUA);
    rakBrosur(S);
    akuarium(S);                                             // airnya di grup kaca, arwananya berenang di dinamis
    sofaTamu(S);
    kotak(S, PALEM.x + 5, PALEM.x + 15, 0, 12, 208, 216, warna('#e8e6de'), { w: { atas: warna('#6b5a3a') } });
    palemVoxel(S, PALEM.x + 10, 212, 12);
    sanitizer(S);
    // tempat sampah terpilah: hijau organik, kuning anorganik, merah B3
    ['#3e8a4f', '#d1a326', '#c22b2b'].forEach((c, i) => {
      const bx = SAMPAH_PILAH.x + i * 9;
      kotak(S, bx, bx + 8, 0, 15, 294, 302, warna(c));
      kotak(S, bx - 0.5, bx + 8.5, 15, 16.5, 293.5, 302.5, gelapkan(warna(c), 1.25), { sisi: SEMUA });
      kotak(S, bx + 2, bx + 6, 7, 10, 302, 302.3, warna('#f2f2ee'), { sisi: S_DEPAN });
    });
    penghancurVoxel(S);

    // --- pojok baca: karpet timbul, meja lesehan & bantal memakai lukisan lantai
    timbul(BACA.alas.x, BACA.alas.x + BACA.alas.w, BACA.alas.y, BACA.alas.y + BACA.alas.h, 0.8, warna('#2f4a6b'));
    timbul(592, 660, 196, 210, 5, warna('#6b4f34'));
    for (const cx of BACA.slot) timbul(cx - 9, cx + 9, 220, 232, 3.5, warna('#6b3b3b'));
    rakPojokBaca(S);                                         // korannya di grup perabot (kemarin = kekuningan)
    bacaanLesehan(S);

    // --- pos satpam
    meja(POS_SATPAM.x + 3, POS_SATPAM.x + 26, 303, 314, 16, KAYU, warna('#6b4f34'), { palang: false });
    if (k.posSatpam) G.kulit.segi([POS_SATPAM.x + 3, 4, 314.3], [POS_SATPAM.x + 26, 4, 314.3], [POS_SATPAM.x + 26, 13, 314.3], [POS_SATPAM.x + 3, 13, 314.3], [0, 0, 1], PUTIH,
      [k.posSatpam.uv[0], k.posSatpam.uv[1] + (k.posSatpam.uv[3] - k.posSatpam.uv[1]) * (9 / 18), k.posSatpam.uv[2], k.posSatpam.uv[3]]);
    kotak(S, POS_SATPAM.x + 5, POS_SATPAM.x + 14, 16, 16.5, 304, 311, warna(P.paper), { sisi: S_ATAS });
    kotak(S, POS_SATPAM.x + 18, POS_SATPAM.x + 21, 16, 22, 306, 308, warna('#20242c'));
    kursiLipatSatpam(S);

    pantri(S);
    mejaKerja(S);
    bangunRuangWC(S);
    bangunRuangGudang(S);
    kusenPintuKadis(S);
    bangunLorongKadis(S);

    for (const k2 of ['polos', 'dinding', 'lantai', 'kulit', 'kaca']) WADAH[k2].isi(G[k2]);
    bangunRuangKadis();
  }

  function barangMejaRapat(S, R) {
    // mikrofon, gelas, botol, map, notulen — kecil, statis
    for (const mx of [208, 246, 284]) {
      kotak(S, mx - 2, mx + 3, R.h, R.h + 1, 205, 208, warna('#3a3f45'));
      kotak(S, mx, mx + 1, R.h + 1, R.h + 8, 206, 207, warna('#5a6068'));
      kotak(S, mx - 1, mx + 2, R.h + 7, R.h + 10, 205.5, 207.5, warna('#2c3038'));
    }
    for (const [gx, gz] of [[190, 228], [226, 224], [266, 224], [302, 228]]) {
      tabung(S, gx + 2.5, gz, 2.2, R.h, R.h + 5, warna('#eef2f6'), { segmen: 8, atas: warna('#c9a05a') });
    }
    for (const bx of [198, 292]) {
      tabung(S, bx + 1.5, 226, 1.6, R.h, R.h + 8, warna('#bcd8e8'), { segmen: 6 });
      tabung(S, bx + 1.5, 226, 1.6, R.h + 8, R.h + 10, warna('#3565b0'), { segmen: 6 });
    }
    kotak(S, 214, 229, R.h, R.h + 1.2, 228, 234, warna('#c9a03a'));
    kotak(S, 258, 273, R.h, R.h + 1.2, 230, 236, warna('#3e6b4f'));
    kotak(S, 238, 251, R.h, R.h + 0.6, 233, 238, warna(P.paper));
  }

  function sofaTamu(S) {
    const { x, w } = SOFA_TAMU;
    const kulitSofa = warna('#7a2e2a'), terang = warna('#9a3d36'), bingkai = warna('#5f4530');
    kotak(S, x + 1, x + w - 1, 0, 6, 196, 209, bingkai);
    kotak(S, x + 5, x + w - 5, 6, 10, 198, 209, terang, { sisi: SEMUA });
    kotak(S, x + 3, x + w - 3, 6, 22, 195, 199, kulitSofa, { sisi: SEMUA });
    for (const ax of [x, x + w - 5]) kotak(S, ax, ax + 5, 6, 15, 195, 209, kulitSofa, { sisi: SEMUA });
    // meja kopi kaca + toples & koran
    const mx = x + 16;
    kotak(S, mx, mx + 26, 7, 8.5, 211, 218, warna('#a9c7cf'), { sisi: SEMUA, w: { atas: warna('#c6e0e6') } });
    for (const kx of [mx + 1, mx + 23]) kotak(S, kx, kx + 2, 0, 7, 212, 217, warna('#6d5535'));
    tabung(S, mx + 6.5, 214, 2.6, 8.5, 13, warna('#e8e4d4'), { segmen: 8, atas: warna(P.red) });
    kotak(S, mx + 13, mx + 22, 8.5, 9, 213, 217, warna('#e4ddc8'));
  }

  function pantri(S) {
    const px = PANTRI.x, py = PANTRI.y, x1 = PANTRI.x1, y1 = PANTRI.y1, tb = PANTRI.tebal;
    const p0 = PANTRI.pintuY, p1 = PANTRI.pintuY + PANTRI.pintuH;
    const T = 30, kayu = KAYU, pucuk = gelapkan(KAYU, 1.3);
    kotak(S, px, x1, 0, T, py, py + 5, kayu, { sisi: SEMUA, w: { atas: pucuk } });                 // sekat belakang
    kotak(S, px, px + tb, 0, T, py + 5, p0, kayu, { sisi: SEMUA, w: { atas: pucuk } });             // sekat kiri, atas pintu
    kotak(S, px, px + tb, 0, T, p1, y1, kayu, { sisi: SEMUA, w: { atas: pucuk } });                 // sekat kiri, bawah pintu
    for (const kz of [p0 - 3, p1]) kotak(S, px - 1, px + tb + 1, 0, T + 2, kz, kz + 3, gelapkan(KAYU, 1.16), { sisi: SEMUA });
    // papan PANTRI di atas sekat: kertas berbingkai setebal jari, bukan kartu tipis
    const sp = K_.papanPantri;
    if (sp) {
      const sx0 = px + 14, sx1 = px + 40, sz = py + 2.6;
      G.kulit.segi([sx0, T, sz], [sx1, T, sz], [sx1, T + 9, sz], [sx0, T + 9, sz], [0, 0, 1], PUTIH, sp.uv);
      kotak(S, sx0, sx1, T, T + 9, sz - 0.8, sz, warna('#e4ddc8'), { sisi: S_KIRI | S_KANAN | S_ATAS | S_BELAKANG });
    }
    /* Counter granit + lemari bawah laminasi. Gambar 2D pantri mencampur
       tampak atas (sekat, meja) dan tampak depan (lemari, microwave) dalam
       satu fungsi, jadi yang dipinjam cuma dua muka yang memang tampak
       depan: pintu lemari bawah dan microwave. Sisanya dibangun di sini. */
    const cz0 = py + 5, cz1 = py + 17, cH = 14;
    kotak(S, px + 8, px + 60, cH - 1.5, cH, cz0, cz1 + 1, warna('#c6cbcd'), { sisi: SEMUA, w: { atas: warna('#d4d8da') } });
    kotak(S, px + 9, px + 59, 0, 4, cz0, cz1 - 0.5, warna('#b6ae99'));
    konterRelief(S, K_.konter, px, cz1, cH);
    kotak(S, px + 11, px + 31, cH - 0.4, cH + 0.1, cz0 + 2, cz1 - 2, warna('#454e55'), { sisi: S_ATAS });   // bak cuci
    kotak(S, px + 19, px + 21, cH, cH + 9, cz0 + 1, cz0 + 3, warna('#b6bec4'));                          // keran leher angsa
    kotak(S, px + 15, px + 21, cH + 7, cH + 9, cz0 + 1, cz0 + 3, warna('#b6bec4'));
    microwaveRelief(S, K_.microwave, px, cz0, cH);
    kotak(S, px + 57, px + 63, cH, cH + 8, cz0 + 3, cz0 + 8, warna('#dfe3e6'), { w: { atas: warna('#ffffff') } });   // teko listrik
    for (let i = 0; i < 3; i++) kotak(S, px + 50 + i * 3, px + 51.5 + i * 3, cH + 9, cH + 17, py + 5.2, py + 6.5, warna('#eef0ea'), { sisi: SEMUA });  // rak piring
    // kardus arsip pindahan di sudut sekat
    kotak(S, px + 8, px + 19, 0, 11, py + 34, py + 45, warna('#a37b4e'));
    kotak(S, px + 10, px + 19, 11, 20, py + 35, py + 44, warna('#b98d5e'));
    // meja kafe kaki satu + dua stul
    const tx = px + 28, tz = py + 64;
    tabung(S, tx, tz, 10, 14, 16, KAYU, { segmen: 14, atas: pucuk });
    tabung(S, tx, tz, 1.6, 1, 14, KAYU_TUA, { segmen: 6 });
    tabung(S, tx, tz, 5, 0, 1.5, KAYU_TUA, { segmen: 10 });
    for (const sx of [tx - 15, tx + 16]) {
      tabung(S, sx, tz + 6, 3.6, 8, 10, KAYU_TUA, { segmen: 8, atas: gelapkan(KAYU_TUA, 1.3) });
      tabung(S, sx, tz + 6, 1, 0, 8, KAYU_TUA, { segmen: 5 });
    }
    // dispenser: badan berkulit bertekstur timbul (keran, baki tetes), galon dinamis
    const dx = pantriX(462);
    dispenserRelief(S, K_.dispenser, dx);
    tabung(S, pantriX(437) + 4.5, 283, 5, 0, 11, warna('#2a4f8a'), { segmen: 10, atas: warna('#3f74c4') });
  }

  /* Meja kerja setinggi 15, bukan 18 seperti di 2D: di 3D pegawainya DUDUK
     di kursinya (di 2D dia berdiri menutupi kursi dan terbaca duduk), dan
     papan setinggi 18 jatuh di bahu orang duduk berskala SKALA_ORANG. */
  const MEJA_H = 15;
  function mejaKerja(S) {
    MEJA_KERJA_X.forEach((cx, i) => {
      const x0 = cx - 32, x1 = cx + 32, z0 = 331, z1 = 347, h = MEJA_H;
      meja(x0, x1, z0, z1, h, KAYU, KAYU_TUA, { tebal: 3.5, kaki: 4 });
      // laptop: badan & engsel statis, layarnya dinamis (nyala/padam)
      kotak(S, cx + 11, cx + 31, h, h + 1.2, z0 + 5, z0 + 13, warna('#b6bcc1'), { sisi: SEMUA });
      kotak(S, cx + 12, cx + 30, h + 1.2, h + 14, z0 + 4, z0 + 5, warna('#9aa1a6'), { sisi: SEMUA });
      // lampu meja di sudut kiri
      kotak(S, x0 + 1, x0 + 5, h, h + 1, z0 + 3, z0 + 7, warna('#1d1712'));
      kotak(S, x0 + 2.5, x0 + 3.5, h + 1, h + 11, z0 + 4.5, z0 + 5.5, warna('#1d1712'));
      // pot mini di tengah, tiga tangkai daun
      kotak(S, x0 + 33, x0 + 37, h, h + 4, z0 + 4, z0 + 8, warna('#8a5a3a'), { w: { atas: warna('#3a2a1a') } });
      for (const [dx, t, dz, c] of [[1, 9, 1.5, '#3e6b4f'], [3, 8, 2, '#4f8a56'], [2, 10, 1, '#3e6b4f']]) {
        kotak(S, x0 + 33 + dx, x0 + 34 + dx, h + 4, h + t, z0 + 4 + dz, z0 + 5 + dz, warna(c));
      }
      temaMeja(S, i, x0, h, z0);
    });
  }

  // ---------------------------------------------------------- perabot voxel
  /* Perabot yang di putaran awal masih kartu tegak (lukisan 2D yang berdiri)
     sekarang dibangun dari kotak, mengikuti gambar 2D-nya piksel demi piksel:
     tiap r(x, y, w, h) diterjemahkan jadi kotak di tempat & tingginya, dengan
     kedalaman yang masuk akal. Yang statis masuk G.polos; yang ikut keadaan
     RUANGAN masuk grup perabot (bangunPerabot); yang bergerak tiap frame
     (X-banner rebah, lampu fotokopi, cap basah) di susunDinamis. */

  // Batang tipis dari (x0,y0) ke (x1,y1) di bidang xy lokal m (rangka silang).
  function batangM(S, m, x0, y0, x1, y1, z0, z1, t, c) {
    const dx = x1 - x0, dy = y1 - y0, pjg = Math.hypot(dx, dy);
    const mb = A3.kali(m, A3.kali(A3.geser(x0, y0, 0), A3.putarZ(Math.atan2(-dx, dy))));
    kotakM(S, mb, -t / 2, t / 2, 0, pjg, z0, z1, c);
  }
  // Stiker inventaris (drawStiker): label kuning bergaris di muka depan.
  function stikerInventaris(S, x, h, z) {
    kotak(S, x, x + 4, h, h + 3, z, z + 0.12, warna('#e8d873'), { sisi: S_DEPAN });
    kotak(S, x, x + 3, h + 1.6, h + 2, z + 0.12, z + 0.18, warna('#2c3038'), { sisi: S_DEPAN });
    kotak(S, x, x + 2, h + 0.8, h + 1.2, z + 0.12, z + 0.18, warna('#2c3038'), { sisi: S_DEPAN });
  }
  const adaStiker = (nama) => !!(RUANGAN.stikerTertempel && RUANGAN.stikerTertempel.has && RUANGAN.stikerTertempel.has(nama));

  /* Palem kuning (drawPalem): batang ramping berumpun, tujuh pelepah yang
     melengkung ke segala arah, tiap ruasnya berpasangan anak daun menjuntai.
     Angka naik/jangkau diturunkan dari DAUN 2D (dy, dx), jadi pelepah yang
     di 2D tegak tetap tegak. y0 = permukaan tanah pot. */
  function palemVoxel(S, cx, cz, y0, s = 1) {
    const BATANG = warna('#8a7a3a'), D1 = warna('#4f8a56'), D2 = warna('#6fae62');
    const puncak = y0 + 14 * s;
    kotak(S, cx - 0.9 * s, cx + 0.9 * s, y0, puncak, cz - 0.9 * s, cz + 0.9 * s, BATANG);
    kotak(S, cx + 0.9 * s, cx + 2.3 * s, y0, y0 + 9 * s, cz - 1.8 * s, cz - 0.4 * s, BATANG);
    const NAIK = [3, 8, 12, 11, 6, 1, -3], JANGKAU = [10, 8, 3, 5, 9, 11, 10];
    for (let i = 0; i < 7; i++) {
      const arah = i * (Math.PI * 2 / 7) + 0.4, putar = A3.putarY(-arah);
      const naik = NAIK[i] * s, jangkau = JANGKAU[i] * s;
      for (let k = 1; k <= 6; k++) {
        const t = k / 6, h = jangkau * t;
        const px = cx + Math.cos(arah) * h, pz = cz + Math.sin(arah) * h, py = puncak + naik * t - 3 * s * t * t;
        const r = 0.6 * s;
        kotak(S, px - r, px + r, py - r, py + r, pz - r, pz + r, k % 2 ? D1 : D2);
        const pjg = (4.4 - 2.4 * t) * s;                      // anak daun memendek ke ujung
        for (const sisi of [1, -1]) {
          const m = A3.kali(A3.geser(px, py, pz), A3.kali(putar, A3.putarX(sisi * 0.75)));
          kotakM(S, m, -0.5 * s, 0.5 * s, -0.12 * s, 0.12 * s, sisi > 0 ? 0 : -pjg, sisi > 0 ? pjg : 0, k % 2 ? D2 : D1);
        }
      }
    }
  }

  /* Tanaman pot sudut kiri (drawPlant): daun dari kubus yang mengecil ke
     ujung, persis leafP 2D (4,3,3,2,2,1,1 piksel), tapi menyebar ke segala
     arah. Layu = hijaunya luntur ke cokelat dan ujungnya menunduk (2D: daun
     turun sampai 4 px). [arah, jangkau, naik, warna]; arah 0 = +x, π/2 = +z. */
  const DAUN_TANAMAN = [
    [Math.PI * 1.1, 11, 18, '#3f6b45'], [-0.35, 11, 16, '#4f8a56'], [Math.PI * 0.62, 4, 24, '#4f8a56'],
    [Math.PI * 1.6, 6, 22, '#3f6b45'], [Math.PI * 0.88, 16, 9, '#356038'], [Math.PI * 0.3, 9, 17, '#4f8a56'],
  ];
  function tanamanVoxel(S) {
    const L = Math.max(0, Math.min(1, RUANGAN.tanamanLayu || 0));
    const cx = 33, cz = 290, y0 = 15.5, cokelat = warna('#8a7a3a');
    for (const [arah, jangkau, naik, c] of DAUN_TANAMAN) {
      const col = L > 0.01 ? campur(warna(c), cokelat, L) : warna(c);
      const ux = Math.cos(arah), uz = Math.sin(arah);
      // 14 kubus rapat sepanjang jalur leafP (t 0..6/7), bukan 7 berjarak:
      // ujung daun yang 1 piksel jadi titik-titik lepas kalau tidak bertumpuk
      for (let i = 0; i < 14; i++) {
        const t = (i / 13) * (6 / 7), w = Math.max(1.6, 4 * (1 - t)) * 0.9;
        const px = cx + ux * jangkau * t, pz = cz + uz * jangkau * t;
        const py = y0 + (naik - L * 4) * t - L * 6 * t * t;
        kotak(S, px - w / 2, px + w / 2, py, py + w, pz - w / 2, pz + w / 2, col, { sisi: SEMUA });
      }
    }
  }

  /* Lemari arsip (drawArsip): RAK TERBUKA, bukan lemari berpintu — rangka
     jati, punggung gelap, empat papan rak. Baris 0 & 2 ordner berdiri, baris
     1 & 3 tumpukan map/bundel bertali (isiLemariArsip, grup perabot). Tinggi
     papan = 120 - by 2D, jadi isinya duduk persis di baris yang sama. */
  const ARSIP = { x0: 24, x1: 84, z0: DINDING_Z + 2, z1: 120, h: 92 };
  const ARSIP_PAPAN = [69, 48, 27, 6];
  const ORDNER = ['#3e6b4f', '#b03030', '#3565b0', '#c9a03a', '#3e6b4f', '#7a4a26'];
  function lemariArsip(S) {
    const A = ARSIP, jati = KAYU_TUA, papan = warna('#a3805a');
    kotak(S, A.x0 + 2, A.x1 - 2, 0, A.h - 2, A.z0, A.z0 + 1.5, warna('#7a5c3e'), { sisi: SEMUA });   // punggung
    kotak(S, A.x0, A.x0 + 2, 0, A.h, A.z0, A.z1, jati, { sisi: SEMUA });
    kotak(S, A.x1 - 2, A.x1, 0, A.h, A.z0, A.z1, jati, { sisi: SEMUA });
    kotak(S, A.x0, A.x1, A.h - 2, A.h, A.z0, A.z1, jati, { sisi: SEMUA, w: { atas: gelapkan(jati, 1.15) } });
    kotak(S, A.x0 + 2, A.x1 - 2, 0, 3, A.z0, A.z1, jati, { sisi: SEMUA });                          // plint
    for (const t of ARSIP_PAPAN) kotak(S, A.x0 + 2, A.x1 - 2, t - 3, t, A.z0 + 1.5, A.z1 - 0.5, papan, { sisi: SEMUA, w: { atas: gelapkan(papan, 1.08) } });
  }
  function isiLemariArsip(S) {
    const A = ARSIP, R = RUANGAN, depan = A.z1 - 3;
    ARSIP_PAPAN.forEach((dasar, row) => {
      if (row % 2 === 0) {
        // ordner berdiri: punggungnya menghadap ruangan, berlabel & berlubang ring
        for (let i = 0, bx = 31; bx < 73 && i < 9; i++, bx += 6) {
          kotak(S, bx, bx + 5, dasar, dasar + 15, A.z0 + 3, depan, warna(ORDNER[(i + row) % ORDNER.length]), { sisi: SEMUA });
          kotak(S, bx + 1, bx + 4, dasar + 6, dasar + 11, depan, depan + 0.15, warna(P.paper), { sisi: S_DEPAN });
          kotak(S, bx + 2, bx + 3, dasar + 3, dasar + 4, depan, depan + 0.15, warna('#2c3440'), { sisi: S_DEPAN });
        }
        return;
      }
      // tumpukan map + bundel bertali; boksHilang = satu bundel sedang dipinjam bidang lain
      for (let s = 0; s < 3; s++) {
        if ((row === 1 ? s : s + 3) === R.boksHilang) continue;
        const sx = 31 + s * 17;
        for (let l = 0; l < 6; l++) {
          kotak(S, sx + (l % 2), sx + (l % 2) + 13, dasar + l * 2, dasar + l * 2 + 2, A.z0 + 4, depan - 1, warna(l % 2 ? '#e4ddc8' : P.paper), { sisi: SEMUA });
        }
        if (s === 1) {
          kotak(S, sx + 1, sx + 14, dasar + 12, dasar + 13.2, A.z0 + 4, depan - 1, warna('#c98a5c'), { sisi: SEMUA });
          kotak(S, sx + 6, sx + 8, dasar, dasar + 13.4, depan - 1, depan - 0.8, warna('#5f4530'), { sisi: S_DEPAN | S_KIRI | S_KANAN });
          kotak(S, sx + 6, sx + 8, dasar + 13.2, dasar + 13.4, A.z0 + 4, depan - 1, warna('#5f4530'), { sisi: S_ATAS });
        }
      }
    });
    // kepenuhan: map menyembul miring dari tepi rak, dus tambahan di DEPAN lemari
    if (R.arsipPenuh) {
      for (const [x, c, miring] of [[74, '#c98a5c', 0.35], [77.5, '#e4ddc8', 0.5]]) {
        kotakM(S, A3.kali(A3.geser(x, ARSIP_PAPAN[2], A.z1 - 6), A3.putarX(miring)), 0, 3, 0, 13, -0.4, 0.4, warna(c));
      }
      for (let d = 0; d < (R.dusTambahanArsip | 0); d++) {
        const dx = 30 + d * 24;
        kotak(S, dx, dx + 20, 0, 14, A.z1 + 1, A.z1 + 13, warna('#b98d5e'), { sisi: SEMUA, w: { atas: warna('#c9a070') } });
        kotak(S, dx + 8, dx + 12, 14, 14.1, A.z1 + 1, A.z1 + 13, warna('#d9cba8'), { sisi: S_ATAS });
        kotak(S, dx + 8, dx + 12, 0, 14, A.z1 + 13, A.z1 + 13.12, warna('#d9cba8'), { sisi: S_DEPAN });
      }
    }
    // di atas lemari: dua dus arsip, map kliping mingguan, piala voli antar-OPD
    const h = A.h;
    kotak(S, 32, 50, h, h + 12, A.z0 + 2, A.z0 + 14, warna('#b98d5e'), { sisi: SEMUA, w: { atas: warna('#d9cba8') } });
    kotak(S, 36, 46, h + 3, h + 7, A.z0 + 14, A.z0 + 14.15, warna(P.paper), { sisi: S_DEPAN });
    kotak(S, 56, 70, h, h + 7, A.z0 + 3, A.z0 + 11, warna('#b98d5e'), { sisi: SEMUA, w: { atas: warna('#c9a070') } });
    for (let k = 0; k < Math.min(10, R.arsipKlipingLembar | 0); k++) {
      kotak(S, 54, 69, h + k * 1.6, h + k * 1.6 + 1.6, A.z0 + 12, A.z0 + 17, warna(k % 2 ? '#8a3a2e' : '#a34536'), { sisi: SEMUA });
    }
    if (R.piala) {
      const emas = warna(P.gold);
      kotak(S, 72, 78, h, h + 2, 107, 113, warna('#5f4530'), { sisi: SEMUA });
      kotak(S, 74.2, 75.8, h + 2, h + 5, 109.2, 110.8, warna('#9a7a1a'));
      kotak(S, 72.5, 77.5, h + 5, h + 9, 107.5, 112.5, emas, { sisi: SEMUA, e: 0.15 });
      kotak(S, 73, 77, h + 9, h + 10.5, 108, 112, emas, { sisi: SEMUA, e: 0.2 });
      kotak(S, 71.4, 72.5, h + 6, h + 8, 109.5, 110.5, emas); kotak(S, 77.5, 78.6, h + 6, h + 8, 109.5, 110.5, emas);
    }
    if (adaStiker('arsip')) stikerInventaris(S, 30, 3, A.z1 - 0.5);
  }

  /* Standee VISI (drawVisi): papan bertulisan dari lukisannya sendiri (uv
     sebagian kulit, tanpa garis rangka yang ikut terlukis), tebal sejari,
     rangka silang besi di belakangnya, bohlamnya berpendar. */
  function standeeVisi(S) {
    const x = 84, w = 22, z = 111, h = 48;
    kotak(S, x + 1, x + w - 1, 0, h, z - 0.6, z, warna('#f0ede2'), { sisi: S_KIRI | S_KANAN | S_ATAS | S_BELAKANG });
    if (K_.visi) G.kulit.segi([x + 1, 0, z], [x + w - 1, 0, z], [x + w - 1, h, z], [x + 1, h, z], [0, 0, 1], PUTIH, subUV(K_.visi, x + 1, 64, x + w - 1, 112));
    const besi = warna('#7c838a'), m = A3.geser(0, 0, z - 1.4);
    batangM(S, m, x, 0, x + w, h, -0.3, 0.3, 0.8, besi);
    batangM(S, m, x + w, 0, x, h, -0.3, 0.3, 0.8, besi);
    kotak(S, x + w / 2 - 2, x + w / 2 + 2, 29, 33, z, z + 0.3, warna('#e8d873'), { sisi: S_DEPAN | S_ATAS | S_KIRI | S_KANAN, e: 0.5 });
  }

  /* Meja stempel (drawStempel): bak stempel, dua stempel kayu bergagang,
     rak surat dua susun. Tumpukan berkas, map disposisi, goresan pulpen,
     noda tinta, dan warna bantalan ikut RUANGAN (isiMejaStempel); cap basah
     yang mengering bergerak tiap frame (susunDinamis). */
  const MEJA_STEMPEL_H = 22;
  let puncakStempel = MEJA_STEMPEL_H;                 // tinggi lembar teratas tumpukan berkas
  function barangMejaStempel(S) {
    const h = MEJA_STEMPEL_H;
    kotak(S, 278, 288, h, h + 2, 107, 114, warna(P.ink), { sisi: SEMUA });
    for (const sx of [290, 298]) {
      kotak(S, sx, sx + 6, h, h + 1.2, 108, 112, warna('#1d1712'), { sisi: SEMUA });         // karet
      kotak(S, sx + 0.4, sx + 5.6, h + 1.2, h + 2.6, 108.3, 111.7, warna('#33261c'), { sisi: SEMUA });
      kotak(S, sx + 2.2, sx + 3.8, h + 2.6, h + 6.5, 109.2, 110.8, warna('#8a5a3a'));
      kotak(S, sx + 1.6, sx + 4.4, h + 6.5, h + 8.2, 108.6, 111.4, warna('#a8734a'), { sisi: SEMUA });
    }
    const kuning = warna('#c9b178');
    for (const px of [306, 319]) for (const pz of [104, 113]) kotak(S, px, px + 1, h, h + 12, pz, pz + 1, kuning);
    for (const t of [26, 32]) {
      kotak(S, 306, 320, t, t + 0.8, 104, 114, kuning, { sisi: SEMUA });
      kotak(S, 308, 318, t + 0.8, t + 2.2, 105, 112.5, warna(P.paper), { sisi: SEMUA, w: { atas: warna('#f6f3e9') } });
    }
  }
  function isiMejaStempel(S) {
    const R = RUANGAN, h = MEJA_STEMPEL_H;
    let atas = h;
    for (let l = 0; l < (R.tumpukanStempel | 0); l++) {          // rapi = tepinya lurus
      const g = R.stempelRapi ? 0 : l % 3;
      kotak(S, 256 + g, 269 + g, atas, atas + 1.8, 104, 115, warna(l % 2 ? '#e4ddc8' : P.paper), { sisi: SEMUA });
      atas += 1.8;
    }
    kotak(S, 257, 270, atas, atas + 1.2, 104.5, 114.5, warna('#e8a0a8'), { sisi: SEMUA });   // map disposisi pink
    atas += 1.2;
    for (let m = 0; m < (R.mapDisposisi | 0); m++) {             // surat masuk antaran caraka
      const g = m % 2;
      kotak(S, 256 + g, 269 + g, atas, atas + 1.6, 105, 114, warna(m % 2 ? '#e8a0a8' : '#f0b8bf'), { sisi: SEMUA });
      kotak(S, 257 + g, 262 + g, atas + 0.4, atas + 1.2, 114, 114.12, warna('#c88b93'), { sisi: S_DEPAN });
      atas += 1.6;
    }
    const CORET = ['#c9c2ae', '#9a927c', '#3a4658'];
    for (let c = 0; c < Math.min(3, R.coretKertas | 0); c++) {
      kotak(S, 258, 261, atas, atas + 0.1, 112.6 - c * 1.2, 113.1 - c * 1.2, warna(CORET[c]), { sisi: S_ATAS });
    }
    puncakStempel = atas;
    kotak(S, 279, 287, h + 2, h + 2.1, 108, 113, warna(R.bantalanKering ? '#d9908f' : '#c03030'), { sisi: S_ATAS });
    for (const n of R.nodaMeja || []) {                          // noda tinta permanen di papan meja
      const nx = 254 + n.x, nz = 101 + Math.max(0, Math.min(8, n.y - 22)) / 8 * 15;
      kotak(S, nx, nx + 2, h, h + 0.1, nz, nz + 2, warna('#8f2626'), { sisi: S_ATAS });
    }
    if (adaStiker('stempel')) stikerInventaris(S, 258, h - 3, 118);
  }

  /* Bagian atas mesin fotokopi (drawFotokopi): tutup kaca, pengumpan dokumen
     berkertas asli, panel tombol, baki keluaran. Rim cadangan ikut
     RUANGAN.rimKertas; lampu panel, sinar pindai, dan lembar hasil menyala
     selama ada yang memakainya (susunDinamis). */
  function atasFotokopi(S) {
    const F = FOTOKOPI, h = F.h - 12;
    kotak(S, F.x + 1, F.x + F.w - 11, h, h + 2, 105, 119, warna('#5a6068'), { sisi: SEMUA, w: { atas: warna('#7c838a') } });
    kotak(S, F.x + 3, F.x + F.w - 14, h + 2, h + 5, 106, 113, warna('#c4c8c0'), { sisi: SEMUA, w: { atas: warna('#d6d9d2') } });
    kotak(S, F.x + 3, F.x + F.w - 14, h + 2, h + 2.8, 113, 117, warna('#d6d9d2'), { sisi: SEMUA });
    kotak(S, F.x + 4, F.x + F.w - 15, h + 5, h + 5.4, 107, 112, warna(P.paper), { sisi: SEMUA });
    kotak(S, F.x + F.w - 11, F.x + F.w - 1, h, h + 3, 111, 120, warna('#3a3f45'), { sisi: SEMUA, w: { atas: warna('#454b53') } });
    kotak(S, F.x + F.w, F.x + F.w + 5, 24, 25, 107, 117, warna('#b9bdb6'), { sisi: SEMUA });
  }
  function rimFotokopi(S) {
    for (let i = 0; i < Math.min(3, RUANGAN.rimKertas | 0); i++) {
      const y = FOTOKOPI.h - 12 + i * 2.6;
      kotak(S, 517, 528, y, y + 2.6, 104.5, 110.5, warna('#f2f0e6'), { sisi: SEMUA, w: { atas: warna('#ffffff') } });
      kotak(S, 520, 526, y + 0.8, y + 1.6, 110.5, 110.62, warna(i % 2 ? '#d9a33a' : '#7aa5e8'), { sisi: S_DEPAN });
    }
  }

  // Rak brosur (drawRakBrosur): tiang & kaki, tiga kantong kawat, sepasang
  // leaflet bersandar di tiap kantong.
  function rakBrosur(S) {
    const R = RAK_BROSUR, zb = R.y + R.h, besi = warna('#9aa1a6');
    kotak(S, R.x + 2, R.x + R.w - 2, 0, 1, zb - 6, zb, warna('#3a3f45'), { sisi: SEMUA });
    kotak(S, R.x + 7, R.x + 9, 1, 27, zb - 4, zb - 2.5, warna('#7c838a'));
    [[P.red, '#f2f0e6'], ['#3565b0', '#f3e27a'], ['#3e6b4f', '#f2f0e6']].forEach(([a, b], i) => {
      const hb = zb - (R.y + i * 8 + 9);                          // bibir kantong: 21, 13, 5
      kotak(S, R.x, R.x + R.w, hb - 0.6, hb, zb - 4.5, zb - 0.5, besi, { sisi: SEMUA });
      kotak(S, R.x, R.x + R.w, hb, hb + 1.8, zb - 1, zb - 0.4, besi, { sisi: SEMUA });
      for (const [lx, muka, tanda, t0, t1] of [[R.x + 1, a, b, 4.5, 6.5], [R.x + 9, b, a, 4.5, 5.5]]) {
        const m = A3.kali(A3.geser(lx, hb, zb - 2.2), A3.putarX(-0.22));
        kotakM(S, m, 0, 6, 0, 7.5, -0.25, 0.25, warna(muka));
        kotakM(S, m, 1, 5, t0, t1, 0.25, 0.32, warna(tanda), 0, S_DEPAN);
      }
    });
  }

  // Tiang hand sanitizer injak (drawSanitizer): alas, tiang, pedal, dudukan,
  // botol berjendela cairan, kepala pompa biru.
  function sanitizer(S) {
    const s = SANITIZER, zb = s.y + s.h, cx = s.x + s.w / 2;
    kotak(S, s.x, s.x + s.w, 0, 1.2, zb - 5, zb + 3, warna('#5a6068'), { sisi: SEMUA });
    kotak(S, cx - 1, cx + 1, 1.2, 19, zb - 2, zb, warna('#9aa1a6'));
    kotak(S, cx + 1, cx + 6, 0.6, 1.6, zb, zb + 3, warna('#3a3f45'), { sisi: SEMUA });
    kotak(S, s.x + 1, s.x + s.w - 1, 19, 20, zb - 4.5, zb + 1, warna('#5a6068'), { sisi: SEMUA });
    kotak(S, s.x + 2, s.x + s.w - 2, 20, 28, zb - 4, zb + 0.5, warna('#f2f3ef'), { sisi: SEMUA, w: { atas: warna('#ffffff') } });
    kotak(S, s.x + 2.6, s.x + s.w - 2.6, 21.5, 25.5, zb + 0.5, zb + 0.62, warna('#7ec8f0'), { sisi: S_DEPAN });
    kotak(S, cx - 1.5, cx + 1.5, 28, 30, zb - 3, zb - 0.5, warna('#3565b0'), { sisi: SEMUA });
    kotak(S, cx - 0.5, cx + 0.5, 29, 29.8, zb - 0.5, zb + 1.8, warna('#3565b0'), { sisi: SEMUA });
  }

  // Buku tamu terbuka di mejanya (drawBukuTamu): sampul, dua halaman, punggung.
  // Baris tinta yang menumpuk & bolpoin bertalinya ikut RUANGAN.bukuTamu.
  function bukuTamu(S) {
    kotak(S, 53.5, 65.5, 8, 8.4, 291, 296, warna('#7a2020'), { sisi: SEMUA });
    for (const [x0, x1] of [[54, 59.4], [59.6, 65]]) kotak(S, x0, x1, 8.4, 9.2, 291.4, 295.6, warna('#f2f0e6'), { sisi: SEMUA });
    kotak(S, 59.4, 59.6, 8.4, 8.9, 291.4, 295.6, warna('#cfc9b4'), { sisi: S_ATAS });
  }
  function tintaBukuTamu(S) {
    const n = Math.min(10, RUANGAN.bukuTamu | 0), tinta = warna('#3a4a86');
    for (let i = 0; i < n; i++) {
      const kiri = i < 5, baris = (kiri ? i : i - 5) % 3, x = kiri ? 55 : 61;
      kotak(S, x, x + 3, 9.2, 9.3, 292.2 + baris * 1.2, 292.6 + baris * 1.2, tinta, { sisi: S_ATAS });
    }
    if (n > 0) kotak(S, 64.4, 65, 9.2, 9.8, 291, 295.5, warna('#2f3640'), { sisi: SEMUA });
  }

  // Kursi lipat pos satpam (drawPosSatpamKursi): sandaran menghadap ruangan,
  // satpamnya berdiri di depannya.
  function kursiLipatSatpam(S) {
    const x = POS_SATPAM.titikX - 6, zs = 286, besi = warna('#5a626c');
    for (const kx of [x + 0.6, x + 10.6]) {
      kotak(S, kx, kx + 0.8, 0, 20, zs, zs + 0.8, besi);              // kaki belakang = tiang sandaran
      kotak(S, kx, kx + 0.8, 0, 7, zs + 6, zs + 6.8, besi);           // kaki depan
    }
    kotak(S, x, x + 12, 7, 8.4, zs + 0.4, zs + 7, warna('#4a525c'), { sisi: SEMUA, w: { atas: warna('#56606a') } });
    kotak(S, x, x + 12, 13, 20, zs - 0.2, zs + 0.8, warna('#3a4048'), { sisi: SEMUA });
    kotak(S, x + 0.6, x + 11.4, 2.5, 3.1, zs + 0.2, zs + 0.8, besi);
  }

  /* Pernak-pernik identitas meja kerja (drawMejaTema), zona x+6..+29 dan
     kedalaman z0+5..+15 — tumpukan kusut harian menempati lajur belakang
     z0+0,6..+4,6 (kusutMeja), jadi keduanya tidak pernah bertabrakan. */
  function temaMeja(S, i, x0, h, z0) {
    const w = (c) => (typeof c === 'string' ? warna(c) : c);
    const b = (a, a1, y, y1, z, z1, c, o) => kotak(S, x0 + a, x0 + a1, h + y, h + y1, z0 + z, z0 + z1, w(c), o);
    const SM = { sisi: SEMUA };
    switch (i) {
      case 0:                                            // meja rapi
        b(6, 21, 0, 3.5, 13, 15, '#1d1712', { sisi: SEMUA, w: { atas: warna('#2c241c') } });   // papan nama
        b(7, 20, 1.6, 2.3, 15, 15.1, P.gold, { sisi: S_DEPAN, e: 0.1 });
        ['#c9a03a', '#3e6b4f', '#b03030'].forEach((c, l) => b(8, 20, l * 1.2, l * 1.2 + 1.2, 5.5, 12, c, SM));
        b(21.5, 24.5, 0, 5, 6, 9, '#e4ddc8', { sisi: SEMUA, w: { atas: warna('#3a3f45') } });  // wadah pulpen
        b(21.9, 22.6, 5, 7.6, 7, 7.7, '#c23b3b'); b(22.8, 23.5, 5, 8.4, 7.4, 8.1, '#3565b0'); b(23.6, 24.2, 5, 7, 6.8, 7.5, '#2c3440');
        break;
      case 1:                                            // meja berantakan
        b(6, 18, 0, 0.5, 9, 14, P.paper, SM);
        b(9, 25, 0.5, 1.3, 5.5, 11, '#e4ddc8', SM);       // lapis tengah nongol, mau longsor
        b(7, 17, 1.3, 1.8, 6.5, 10.5, P.paper, SM);
        kotakM(S, A3.kali(A3.geser(x0 + 22, h + 1.8, z0 + 8), A3.putarY(0.3)), -3, 3, 0, 0.8, -2, 2, warna('#b03030'));   // map merah nyelip miring
        b(23, 27, 0, 2.6, 11, 14, '#e4ddc8', { sisi: SEMUA, w: { atas: warna('#c9c2ac') } });  // kertas kusut
        b(24, 30, 0, 0.1, 13.6, 15.4, campur(KAYU, warna('#6b4a2e'), 0.45), { sisi: S_ATAS });   // noda kopi
        break;
      case 2:                                            // meja otaku: figure chibi + manga
        b(7, 14, 0, 1, 7, 12, '#2c3440', SM);
        b(8, 13, 1, 4.5, 8.5, 10.5, P.blue, SM);
        b(7.4, 8, 2.2, 3.8, 9, 10, '#f0c79c'); b(13, 13.6, 2.2, 3.8, 9, 10, '#f0c79c');
        b(8.8, 12.2, 4.5, 7.9, 8, 11.4, '#f0c79c', SM);
        b(8.6, 12.4, 7.1, 8.5, 7.8, 10.6, '#2c2018', SM);
        ['#c23b3b', '#d1a326', '#3e6b4f', P.mag].forEach((c, l) => b(16 + l * 3, 18 + l * 3, 0, 7, 5.5, 11.5, c, SM));
        break;
      case 3:                                            // meja kpoper: lightstick + photocard
        b(7, 11, 0, 0.8, 7, 11, '#2c3440', SM);
        b(8.4, 9.6, 0.8, 7, 8.4, 9.6, '#e4ddc8');
        b(6.8, 11.2, 7, 11, 6.8, 11.2, P.mag, { sisi: SEMUA, e: 0.5 });
        b(15, 20, 0, 7, 9, 9.6, P.paper, SM); b(16, 19, 1, 6, 9.6, 9.7, P.blueL, { sisi: S_DEPAN });
        b(20.5, 25.5, 0, 6.5, 10, 10.6, P.paper, SM); b(21.5, 24.5, 1, 5.5, 10.6, 10.7, '#e8a0a8', { sisi: S_DEPAN });
        break;
      case 4:                                            // meja tanaman: pot kecil & sedang
        b(7, 12, 0, 4, 8, 13, '#8a5a3a', { sisi: SEMUA, w: { atas: warna('#3a2a1a') } });
        b(15, 21, 0, 5.5, 7, 13, '#8a5a3a', { sisi: SEMUA, w: { atas: warna('#3a2a1a') } });
        for (const [x, y0, t, z, c] of [[8, 4, 10, 10, '#3e6b4f'], [10, 4, 9, 10.5, '#4f8a56'], [9, 4, 11.5, 9.5, '#3e6b4f'],
          [16, 5.5, 11, 9.5, '#3e6b4f'], [18, 5.5, 10.5, 10, '#4f8a56'], [20, 5.5, 9.5, 9, '#3e6b4f']]) {
          b(x, x + 1, y0, t, z, z + 1, c);
          b(x - 0.6, x + 1.6, t - 1.4, t, z - 0.6, z + 1.6, c, SM);
        }
        break;
      case 6:                                            // meja baru: barang BMN belum dibuka
        b(7, 18, 0, 6.5, 6, 13, '#b98d5e', { sisi: SEMUA, w: { atas: warna('#d2a877') } });
        b(12, 13, 6.5, 6.6, 6, 13, '#a37b4e', { sisi: S_ATAS });
        b(12, 13, 0, 6.5, 13, 13.1, '#a37b4e', { sisi: S_DEPAN });
        b(8, 11, 3, 5, 13, 13.1, '#e8d873', { sisi: S_DEPAN });                                 // stiker BMN
        b(20, 28, 0, 0.3, 9, 14, P.paper, SM);                                                  // lembar BAST
        b(21, 26, 0.3, 0.4, 10, 10.5, '#9aa1a6', { sisi: S_ATAS }); b(21, 24, 0.3, 0.4, 12, 12.5, '#9aa1a6', { sisi: S_ATAS });
        break;
      default:                                           // meja PNS klasik: termos, toples, foto keluarga
        b(7, 12, 0, 9, 8, 13, '#4a7fd0', { sisi: SEMUA, w: { atas: warna('#79b0e8') } });
        b(7.8, 11.2, 9, 11, 8.8, 12.2, '#2c3440', SM);
        tabung(S, x0 + 17, z0 + 10.5, 3, h, h + 5, campur(warna('#e8e4d4'), warna('#d9b96a'), 0.55), { segmen: 10, atas: warna('#8a6844') });
        tabung(S, x0 + 17, z0 + 10.5, 3.2, h + 5, h + 6.2, warna('#8a6844'), { segmen: 10 });
        b(22, 28, 0, 6, 8.5, 9.3, '#8a5a3a', SM);
        b(23, 27, 1, 5, 9.3, 9.4, '#f0ede2', { sisi: S_DEPAN });
        b(24.5, 25.5, 0, 4, 7.4, 8.5, '#6b4126');
    }
  }

  /* Kusut harian (gambarKusutMeja): lapis berkas yang menumpuk per meja
     menurut kusutKini() & KUSUT_MEJA_MAKS, map yang disandarkan, lembar yang
     nyeruak, dus arsip di kolong meja — angka ambangnya sama persis dengan
     2D. Plus bendera kecil bertiang lidi waktu tema agustusan. */
  function kusutMeja(S) {
    const k = kusutKini(), h = MEJA_H, z0 = 331;
    MEJA_KERJA_X.forEach((cx, i) => {
      const x0 = cx - 32;
      if (RUANGAN.tema === 'agustusan') {
        kotak(S, x0 + 37.4, x0 + 38, h, h + 12, z0 + 5, z0 + 5.6, warna('#c9ced4'));
        kotak(S, x0 + 38, x0 + 42.6, h + 10, h + 12, z0 + 5.1, z0 + 5.5, warna(P.red), { sisi: SEMUA });
        kotak(S, x0 + 38, x0 + 42.6, h + 8, h + 10, z0 + 5.1, z0 + 5.5, warna('#f4f2ec'), { sisi: SEMUA });
      }
      const maks = KUSUT_MEJA_MAKS[i] || 3;
      const lapis = Math.min(maks, Math.floor(k * maks + 0.45));
      if (lapis <= 0) return;
      let atas = h;
      for (let l = 0; l < lapis; l++) {
        const c = KUSUT_MAP[(i + l * 2) % KUSUT_MAP.length], g = (i + l) % 3, lebar = 20 - l * 2;
        kotak(S, x0 + 6 + g, x0 + 6 + g + lebar, atas, atas + 1.3, z0 + 0.6, z0 + 4.6, warna(c), { sisi: SEMUA, w: { atas: warna(sh(c, 1.18)) } });
        atas += 1.3;
      }
      if (k > 0.62 + (i % 3) * 0.06) {
        const m = A3.kali(A3.geser(x0 + 28.5, h, z0 + 2.6), A3.putarZ(0.3));
        kotakM(S, m, -0.6, 0.6, 0, 7, -1.8, 1.8, warna(['#b03030', '#2f5f8a', '#3e6b4f'][i % 3]));
      }
      if (k > 0.82) {
        kotak(S, x0 + 8, x0 + 20, atas, atas + 0.3, z0 + 1, z0 + 6.2, warna(P.paper), { sisi: SEMUA });
        kotak(S, x0 + 18, x0 + 20, atas + 0.3, atas + 0.45, z0 + 5, z0 + 6.2, warna('#c9c2ac'), { sisi: S_ATAS });
      }
      if (k > 0.55) {
        const dus = Math.min(3, Math.floor((k - 0.55) * 6) + 1);
        for (let l = 0; l < dus; l++) {
          const dx = x0 + 9 + (l % 2), lebar = 14 - l * 2;
          kotak(S, dx, dx + lebar, l * 3.7, l * 3.7 + 3.6, z0 + 3.5, z0 + 13, warna(l % 2 ? '#c2b393' : '#a8977a'), { sisi: SEMUA, w: { atas: warna(l % 2 ? '#d4c5a5' : '#bcab8c') } });
        }
      }
    });
  }

  /* Gorden jendela (drawWindow): lambrequin hijau melintang berlipat, pita
     emas & rumbai bergerigi; dua panel samping berlipat — kiri selalu 6,
     kanan selebar RUANGAN.gordenKanan (ditarik waktu silau sore) — diikat
     pita emas. Menggantung di depan ceruk jendela yang terlukis di dinding. */
  function gordenJendela(S) {
    const J = JENDELA, hijau = warna('#3e6b4f'), terang = warna('#5f9068'), gelap = warna('#2c4e38'), emas = warna(P.gold);
    const atas = FLOOR_TOP - (J.y - 8), bawah = FLOOR_TOP - (J.y - 2);           // lambrequin 86..92
    const x0 = J.x - 8, x1 = J.x + J.w + 8;
    for (let i = 0, a = x0; a < x1; i++, a += 4) {
      const maju = i % 2 ? 0.6 : 0;
      kotak(S, a, Math.min(x1, a + 4), bawah, atas, 100.6 + maju, 102.4 + maju, i % 2 ? terang : hijau, { sisi: SEMUA });
    }
    kotak(S, x0, x1, bawah - 0.8, bawah, 102.4, 103.4, emas, { sisi: SEMUA, e: 0.1 });
    for (let i = 0; i < 9; i++) kotak(S, x0 + i * 8, x0 + i * 8 + 4, bawah - 3.4, bawah - 0.8, 101.4, 102.8, hijau, { sisi: SEMUA });
    const hB = FLOOR_TOP - (J.y + J.h + 4);                                     // panel 38..86
    for (const [gx, lebar] of [[J.x - 8, 6], [J.x + J.w + 2, Math.max(2, RUANGAN.gordenKanan || 6)]]) {
      const n = Math.max(2, Math.round(lebar / 2));
      for (let i = 0; i < n; i++) {
        const a = gx + (lebar / n) * i, b = gx + (lebar / n) * (i + 1), maju = i % 2 ? 0.7 : 0;
        kotak(S, a, b, hB, bawah, 100.3 + maju, 101.7 + maju, [terang, hijau, gelap][i % 3], { sisi: SEMUA });
      }
      kotak(S, gx - 0.3, gx + lebar + 0.3, FLOOR_TOP - (J.y + 29), FLOOR_TOP - (J.y + 26), 100.1, 102.7, emas, { sisi: SEMUA, e: 0.1 });
    }
  }

  /* Akuarium arwana (drawAkuarium): kabinet kayu bertombol kuningan, tangki
     berbingkai gelap, lampu penutup yang menyala, pasir, tanaman air, batu
     aerator. Airnya kotak tembus pandang di grup kaca; arwana emasnya
     berenang bolak-balik dengan rumus 2D yang sama (ikanAkuarium, dinamis). */
  const AQ = { x0: AKUARIUM.x, x1: AKUARIUM.x + AKUARIUM.w, z0: 204, z1: AKUARIUM.y + AKUARIUM.h };   // 352..380, kaki 216
  function akuarium(S) {
    const A = AQ, rangka = warna('#3a3f45'), kab = warna('#5f4530');
    kotak(S, A.x0, A.x1, 0, 16, A.z0, A.z1, kab, { sisi: SEMUA, w: { atas: gelapkan(kab, 1.35) } });
    kotak(S, A.x0 + 13.5, A.x0 + 14.5, 2, 14, A.z1, A.z1 + 0.12, KAYU_TUA, { sisi: S_DEPAN });
    for (const kx of [A.x0 + 10, A.x0 + 16]) kotak(S, kx, kx + 2, 8, 9.5, A.z1, A.z1 + 0.5, warna(P.gold), { sisi: SEMUA, e: 0.15 });
    kotak(S, A.x0, A.x1, 16, 17, A.z0, A.z1, rangka, { sisi: SEMUA });
    kotak(S, A.x0, A.x1, 34, 36, A.z0, A.z1, rangka, { sisi: SEMUA, w: { atas: warna('#454b53') } });
    kotak(S, A.x0 + 1, A.x1 - 1, 33.7, 34, A.z0 + 1, A.z1 - 1, warna('#d6f0fa'), { sisi: S_BAWAH, e: 0.7 });
    for (const x of [A.x0, A.x1 - 0.6]) for (const z of [A.z0, A.z1 - 0.6]) kotak(S, x, x + 0.6, 17, 34, z, z + 0.6, rangka);
    kotak(S, A.x0 + 0.6, A.x1 - 0.6, 17, 18.6, A.z0 + 0.6, A.z1 - 0.6, warna('#c9b48a'), { sisi: S_ATAS });
    for (const [x, t, z, c] of [[A.x0 + 4, 26, A.z0 + 8, '#4f8a56'], [A.x0 + 5, 28, A.z0 + 9, '#3e6b4f'],
      [A.x0 + 22, 25, A.z0 + 8.5, '#4f8a56'], [A.x0 + 7, 23, A.z0 + 3, '#3e6b4f']]) {
      kotak(S, x, x + 1, 18.6, t, z, z + 1, warna(c));
    }
    kotak(S, A.x0 + 18, A.x0 + 21, 18.6, 19.6, A.z0 + 5, A.z0 + 7, warna('#7c838a'), { sisi: SEMUA });
    // air & kaca di atas permukaannya: tembus pandang, tanpa bayangan
    kotak(G.kaca, A.x0 + 0.6, A.x1 - 0.6, 17, 32.5, A.z0 + 0.6, A.z1 - 0.6, warna('#2f7896', 0.42), { sisi: SEMUA, w: { atas: warna('#8fd0e8', 0.5) } });
    kotak(G.kaca, A.x0 + 0.6, A.x1 - 0.6, 32.5, 33.7, A.z0 + 0.6, A.z1 - 0.6, warna('#c9e4ec', 0.14), { sisi: S_DEPAN | S_KIRI | S_KANAN | S_BELAKANG });
  }
  function ikanAkuarium(S) {
    const A = AQ, cx = (A.x0 + A.x1) / 2;
    const k = Math.sin(now / 2400), arah = Math.cos(now / 2400) > 0 ? 1 : -1;
    const fx = cx + k * 6, fh = 24.5 + Math.sin(now / 700) * 0.8, fz = (A.z0 + A.z1) / 2 + Math.sin(now / 1900) * 2;
    const emas = warna('#e0a030'), oranye = warna('#c96a28');
    kotak(S, fx - 4, fx + 4, fh - 0.5, fh + 1.5, fz - 0.8, fz + 0.8, emas, { sisi: SEMUA });
    kotak(S, fx - 4, fx + 4, fh - 1.5, fh - 0.5, fz - 0.7, fz + 0.7, oranye, { sisi: SEMUA });
    const ekor = arah > 0 ? fx - 6 : fx + 4, mata = arah > 0 ? fx + 2.6 : fx - 3.4, sirip = arah > 0 ? fx - 2.5 : fx - 0.5;
    kotak(S, ekor, ekor + 2, fh - 1.6, fh + 1.9, fz - 0.35, fz + 0.35, oranye, { sisi: SEMUA });
    kotak(S, mata, mata + 0.8, fh + 0.4, fh + 1.1, fz - 0.85, fz + 0.85, warna('#1b1712'), { sisi: SEMUA });
    kotak(S, sirip, sirip + 3, fh + 1.5, fh + 2.2, fz - 0.2, fz + 0.2, oranye, { sisi: SEMUA });
    for (let i = 0; i < 3; i++) {                     // gelembung naik dari batu aerator
      const b = (now / 1400 + i / 3) % 1, h = 19.6 + b * 12.4, x = A.x0 + 19.1 + Math.sin(b * 9 + i) * 0.4;
      kotak(S, x, x + 0.8, h, h + 0.8, A.z0 + 5.6, A.z0 + 6.4, warna('#d6f0fa'), { sisi: SEMUA });
    }
  }

  /* Lemari piala (drawLemariPiala): rangka jati, bagian atas berpintu kaca
     dengan punggung gelap dan dua rak kaca, lemari bawah tertutup. Rak 1
     piala emas besar, plakat, piala perak; rak 2 dua medali tersemat dan
     piala kecil (+ piala voli kalau sudah menang, grup perabot); rak 3
     piagam berbingkai dan foto bersama. Kaca pintunya di grup kaca. */
  const LP = { x0: LEMARI_PIALA.x, x1: LEMARI_PIALA.x + LEMARI_PIALA.w, z0: DINDING_Z + 2, z1: 120, h: LEMARI_PIALA.h };   // 534..572 x 0..76
  function piala3D(S, px, dasar, tg, c, z) {
    const cw = warna(c), e = 0.12;
    kotak(S, px - 2, px + 3, dasar, dasar + 3, z - 2, z + 2, warna(sh(c, 0.7)), { sisi: SEMUA });
    kotak(S, px - 1, px + 2, dasar + 3, dasar + 6, z - 1, z + 1, cw, { sisi: SEMUA, e });
    kotak(S, px - 3, px + 4, dasar + 6, dasar + tg, z - 2.5, z + 2.5, cw, { sisi: SEMUA, e, w: { atas: warna(sh(c, 1.4)) } });
    kotak(S, px - 5, px - 3, dasar + tg - 4, dasar + tg - 1, z - 0.6, z + 0.6, cw, { sisi: SEMUA, e });
    kotak(S, px + 4, px + 6, dasar + tg - 4, dasar + tg - 1, z - 0.6, z + 0.6, cw, { sisi: SEMUA, e });
  }
  function lemariPiala(S) {
    const L = LP, jati = KAYU_TUA, bawah = 17.5, atas = L.h - 3, zk = L.z1 - 0.8, zp = L.z0 + 8, tengah = (L.x0 + L.x1) / 2;
    kotak(S, L.x0 + 2, L.x1 - 2, bawah, atas, L.z0, L.z0 + 1.2, warna('#26302f'), { sisi: SEMUA });
    kotak(S, L.x0, L.x0 + 2, 0, L.h, L.z0, L.z1, jati, { sisi: SEMUA });
    kotak(S, L.x1 - 2, L.x1, 0, L.h, L.z0, L.z1, jati, { sisi: SEMUA });
    kotak(S, L.x0, L.x1, atas, L.h, L.z0, L.z1, jati, { sisi: SEMUA, w: { atas: gelapkan(jati, 1.35) } });
    kotak(S, L.x0 + 2, L.x1 - 2, 0, bawah, L.z0, L.z1 - 0.4, warna('#7a5638'), { sisi: SEMUA, w: { atas: warna('#c9d6d6') } });
    kotak(S, tengah - 0.5, tengah + 0.5, 1.5, bawah - 1.5, L.z1 - 0.4, L.z1 - 0.28, jati, { sisi: S_DEPAN });
    for (const kx of [tengah - 4, tengah + 2]) kotak(S, kx, kx + 2, 8, 10, L.z1 - 0.4, L.z1 + 0.2, warna(P.gold), { sisi: SEMUA, e: 0.15 });
    for (const t of [37, 55]) kotak(S, L.x0 + 2, L.x1 - 2, t - 0.6, t, L.z0 + 1.2, zk - 0.6, warna('#c9d6d6'), { sisi: SEMUA });
    kotak(S, tengah - 0.5, tengah + 0.5, bawah, atas, zk - 0.4, zk + 0.4, jati, { sisi: SEMUA });
    // rak 1
    piala3D(S, L.x0 + 9, 55, 14, P.gold, zp);
    kotak(S, L.x0 + 16, L.x0 + 24, 55, 64, zp + 1, zp + 2.2, warna('#6d5535'), { sisi: SEMUA });
    kotak(S, L.x0 + 17, L.x0 + 23, 58, 63, zp + 2.2, zp + 2.3, warna(P.gold), { sisi: S_DEPAN, e: 0.1 });
    piala3D(S, L.x0 + 30, 55, 11, '#c9ced1', zp);
    // rak 2: medali bertali merah-putih tersemat di punggung lemari
    for (let i = 0; i < 2; i++) {
      const mx = L.x0 + 6 + i * 6, zm = L.z0 + 1.2;
      kotak(S, mx, mx + 1, 42, 49, zm, zm + 0.3, warna(P.red), { sisi: SEMUA });
      kotak(S, mx + 1, mx + 2, 42, 49, zm, zm + 0.3, warna('#f2f2ee'), { sisi: SEMUA });
      kotak(S, mx, mx + 3, 39, 42, zm, zm + 0.5, warna(i ? '#c9ced1' : P.gold), { sisi: SEMUA, e: 0.12 });
    }
    piala3D(S, L.x0 + 24, 37, 9, P.gold, zp);
    // rak 3 (tutup lemari bawah): piagam & foto bersama, berdiri agak bersandar
    const bingkai = (x0, x1, tinggi, isi, garis) => {
      const m = A3.kali(A3.geser(0, bawah, zp), A3.putarX(-0.12));
      kotakM(S, m, x0, x1, 0, tinggi, -0.4, 0.4, warna('#6d5535'));
      kotakM(S, m, x0 + 1, x1 - 1, 1, tinggi - 1, 0.4, 0.48, warna(isi), 0, S_DEPAN);
      for (const [a, b, h0, h1, c] of garis) kotakM(S, m, a, b, h0, h1, 0.48, 0.52, warna(c), 0, S_DEPAN);
    };
    bingkai(L.x0 + 5, L.x0 + 17, 11, P.paper, [[L.x0 + 7, L.x0 + 15, 8, 9, P.gold], [L.x0 + 7, L.x0 + 13, 5, 6, '#9aa1a6']]);
    bingkai(L.x0 + 21, L.x0 + 34, 9, '#8fb3d0', [[L.x0 + 23, L.x0 + 32, 2, 5, '#3a4a60']]);
    // pintu kaca + dua kilap miring (grup kaca)
    kotak(G.kaca, L.x0 + 2, L.x1 - 2, bawah, atas, zk - 0.1, zk + 0.1, warna('#c9d6d6', 0.16), { sisi: S_DEPAN });
    for (let i = 0; i < 10; i++) {
      kotak(G.kaca, L.x0 + 6 + i, L.x0 + 7 + i, 69 - 2 * i, 71 - 2 * i, zk + 0.1, zk + 0.15, warna('#ffffff', 0.3), { sisi: S_DEPAN });
      kotak(G.kaca, L.x0 + 24 + i, L.x0 + 25 + i, 65 - 2 * i, 67 - 2 * i, zk + 0.1, zk + 0.15, warna('#ffffff', 0.3), { sisi: S_DEPAN });
    }
  }
  function pialaVoliLemari(S) {
    if (RUANGAN.piala) piala3D(S, LP.x0 + 31, 37, 12, '#e8c14a', LP.z0 + 5.5);
  }

  /* Rak pojok baca (drawPojokBaca): rak buku pendek dua susun — satu buku
     dicabut separuh — dan rak koran bertongkat penjepit dengan majalah
     bersampul biru. Warna korannya ikut koranBasi() (grup perabot). */
  function rakPojokBaca(S) {
    const zb = 186, z0 = 178, tiang = warna('#6b4f34');
    kotak(S, 584, 586, 0, 14, z0, zb, tiang, { sisi: SEMUA });
    kotak(S, 628, 630, 0, 14, z0, zb, tiang, { sisi: SEMUA });
    kotak(S, 586, 628, 1, 12, z0, z0 + 0.6, tiang, { sisi: S_DEPAN });
    kotak(S, 584, 630, 12, 14, z0, zb, warna('#a5825a'), { sisi: SEMUA });
    kotak(S, 586, 628, 4, 6, z0, zb, warna('#8a6844'), { sisi: SEMUA });
    kotak(S, 584, 630, 0, 1, z0, zb, tiang, { sisi: SEMUA });
    const PUNGGUNG = ['#7a2020', '#2f4f7a', '#3e6b4f', '#c9a03a', '#6b3b6b', '#a35a2a'];
    for (let i = 0; i < 14; i++) {
      const x = 587 + i * 3;
      if (x > 626) break;
      const atas = PUNGGUNG[i % 6], bawah = PUNGGUNG[(i + 3) % 6];
      if (i === 5) kotak(S, x, x + 2, 6, 11, z0 + 3, zb + 1.5, warna(sh(atas, 0.75)), { sisi: SEMUA });
      else {
        kotak(S, x, x + 2, 6, 12, z0 + 1, zb - 0.5, warna(atas), { sisi: SEMUA });
        kotak(S, x, x + 2, 10.6, 11.2, zb - 0.5, zb - 0.4, warna(sh(atas, 1.35)), { sisi: S_DEPAN });
      }
      kotak(S, x, x + 2, 1, 4, z0 + 1, zb - 0.5, warna(bawah), { sisi: SEMUA });
      kotak(S, x, x + 2, 3.2, 3.6, zb - 0.5, zb - 0.4, warna(sh(bawah, 1.35)), { sisi: S_DEPAN });
    }
    kotak(S, 638, 640, 0, 12, 182, 184, tiang, { sisi: SEMUA });
    kotak(S, 666, 668, 0, 12, 182, 184, tiang, { sisi: SEMUA });
    kotak(S, 638, 668, 0, 1, 180, 186, tiang, { sisi: SEMUA });
    kotak(S, 640, 666, 10, 11, 182.6, 183.4, warna('#8a6844'), { sisi: SEMUA });
    kotak(S, 656, 665, 1.5, 10.6, 183.4, 184.2, warna('#3565b0'), { sisi: SEMUA, w: { atas: warna('#c8d8f0') } });
    kotak(S, 657, 664, 3.5, 6.5, 184.2, 184.3, warna('#e8c04a'), { sisi: S_DEPAN });
    kotak(S, 656, 665, 4, 10.6, 181.8, 182.6, warna('#3565b0'), { sisi: SEMUA });
  }
  function koranRak(S) {
    const c = warna(koranBasi() ? '#e3d6a8' : P.paper), baris = warna('#b9c0ca');
    kotak(S, 641, 653, 1.5, 10.6, 183.4, 184.2, c, { sisi: SEMUA });
    kotak(S, 641, 653, 4, 10.6, 181.8, 182.6, c, { sisi: SEMUA });
    kotak(S, 641, 653, 10.1, 10.6, 184.2, 184.3, baris, { sisi: S_DEPAN });
    for (let i = 0; i < 3; i++) kotak(S, 642, 652, 7.6 - i * 2, 8 - i * 2, 184.2, 184.3, baris, { sisi: S_DEPAN });
  }

  /* Dekor tema kalender (gambarTemaDinding): spanduk di atas jendela
     (agustusan, HUT KORPRI, tahun anggaran) jadi KAIN — muka lukisan dinding
     yang sama dipotong lajur-lajur miring yang bergelombang, diikat tali ke
     paku; umbul-umbul merah putih bertali sepanjang tembok (agustusan), yang
     memutus di depan perabot tinggi persis seperti tertutup perabotnya di 2D;
     papan imsakiyah Ramadan timbul. Ikut grup perabot (tema ada di tandanya). */
  const SPANDUK = { x: 192, y: 4, w: 74, h: 12 };
  const PAPAN_RAMADAN = { x: 417, y: 53, w: 22, h: 32 };
  /* Umbul-umbul menempel rapat di tembok (z +0,5): lukisannya di dinding persis
     di belakangnya, jadi tidak kelihatan dobel dari samping, dan lemari arsip,
     AC, rak server, lemari piala menutupinya sendiri seperti di 2D. Yang
     dilewati cuma yang di 2D tertutup lukisan lain: kaca jendela & pintu kadis. */
  const UMBUL_LEWATI = [[176, 248], [436, 492]];
  function temaDinding(S, St) {
    const t = RUANGAN.tema;
    if (!t) return;
    const uv = (x0, y0, x1, y1) => [x0 / W, y0 / FLOOR_TOP, x1 / W, y1 / FLOOR_TOP];
    if (t === 'agustusan' || t === 'korpri' || t === 'tahun-anggaran') {
      const SP = SPANDUK, h0 = FLOOR_TOP - (SP.y + SP.h), h1 = FLOOR_TOP - SP.y, n = 10;
      const c = warna(t === 'agustusan' ? P.red : t === 'korpri' ? '#28406b' : '#3e6b4f');
      const zx = (x) => DINDING_Z + 0.9 + 0.35 * Math.sin((x - SP.x) * 0.35);
      for (let i = 0; i < n; i++) {
        const xa = SP.x + (SP.w / n) * i, xb = SP.x + (SP.w / n) * (i + 1), za = zx(xa), zb = zx(xb);
        const l = Math.hypot(xb - xa, zb - za), nor = [-(zb - za) / l, 0, (xb - xa) / l];
        St.segi([xa, h0, za], [xb, h0, zb], [xb, h1, zb], [xa, h1, za], nor, PUTIH, uv(xa, SP.y, xb, SP.y + SP.h));
        S.segi([xb, h0, zb - 0.25], [xa, h0, za - 0.25], [xa, h1, za - 0.25], [xb, h1, zb - 0.25], [-nor[0], 0, -nor[2]], gelapkan(c, 0.8));
      }
      for (const [x0, x1, xp] of [[SP.x - 3, SP.x, SP.x - 3.6], [SP.x + SP.w, SP.x + SP.w + 3, SP.x + SP.w + 2.6]]) {
        kotak(S, x0, x1, h1 - 4.4, h1 - 3.6, DINDING_Z + 0.2, DINDING_Z + 1.2, warna('#8b8f86'), { sisi: SEMUA });   // tali
        kotak(S, xp, xp + 1, h1 - 5, h1 - 3, DINDING_Z, DINDING_Z + 0.8, warna('#5a6068'), { sisi: SEMUA });        // paku
      }
    }
    if (t === 'agustusan') {
      const tali = warna('#b9bcb2'), merah = warna(P.red), putih = warna('#f4f2ec'), zt = DINDING_Z + 0.5;
      let mulai = 0;
      for (const [a, b] of [...UMBUL_LEWATI, [W, W]]) {
        if (a > mulai) kotak(S, mulai, a, 85.2, 85.8, zt - 0.2, zt + 0.2, tali, { sisi: SEMUA });
        mulai = b;
      }
      for (let x = 2; x < W; x += 8) {
        if (UMBUL_LEWATI.some(([a, b]) => x + 6 > a && x < b)) continue;
        const c = ((x / 8) | 0) % 2 === 0 ? merah : putih;
        const m = A3.kali(A3.geser(0, 85.2, zt), A3.putarX(-0.05 - 0.04 * (1 + Math.sin(x * 0.3))));   // ujungnya sedikit terangkat dari tembok
        kotakM(S, m, x, x + 6, -2, 0, -0.15, 0.15, c);
        kotakM(S, m, x + 1, x + 5, -4, -2, -0.15, 0.15, c);
        kotakM(S, m, x + 2, x + 4, -5.5, -4, -0.15, 0.15, c);
      }
    }
    if (t === 'ramadan') {
      const R2 = PAPAN_RAMADAN, h0 = FLOOR_TOP - (R2.y + R2.h), h1 = FLOOR_TOP - R2.y, z1 = DINDING_Z + 1.5;
      St.segi([R2.x, h0, z1], [R2.x + R2.w, h0, z1], [R2.x + R2.w, h1, z1], [R2.x, h1, z1], [0, 0, 1], PUTIH, uv(R2.x, R2.y, R2.x + R2.w, R2.y + R2.h));
      kotak(S, R2.x, R2.x + R2.w, h0, h1, DINDING_Z, z1, warna('#6d5535'), { sisi: S_ATAS | S_BAWAH | S_KIRI | S_KANAN });
    }
  }

  /* Printer di meja kecil bawah jendela (bagian akhir drawWindow): badan
     krem, kertas di baki belakang, celah & baki keluaran, stapler.
     MOD.printerMacet: badannya memendek 3 (seperti 2D), tutupnya terangkat,
     selembar kertas tersangkut miring dan bergetar, lampu berkedip merah
     cepat; MOD.internetMati: merah tetap; biasa: hijau berdenyut pelan. */
  function printerVoxel(S) {
    const macet = !!MOD.printerMacet, h = 20, tinggi = macet ? 9 : 12, krem = warna('#ddd6c1');
    kotak(S, 202, 224, h, h + tinggi, 104, 114, krem, { sisi: SEMUA, w: { atas: warna('#e8e2cf') } });
    kotak(S, 204, 220, h + tinggi, h + tinggi + 3, 104.5, 106, warna(P.paper), { sisi: SEMUA });
    kotak(S, 204, 222, h + 2, h + 3, 114, 114.1, warna('#c4bda8'), { sisi: S_DEPAN });
    kotak(S, 205, 221, h + 1.4, h + 1.9, 114, 117, krem, { sisi: SEMUA });
    kotak(S, 199, 204, h, h + 2, 108, 111, warna('#3a3f45'), { sisi: SEMUA, w: { atas: warna('#5a6068') } });   // stapler kosong
    if (macet) {
      kotakM(S, A3.kali(A3.geser(0, h + tinggi, 104), A3.putarX(-0.6)), 202, 224, 0, 1.2, 0, 10, krem);
      const g = Math.sin(now / 55) > 0 ? 1 : 0;
      kotakM(S, A3.kali(A3.geser(206 + g, h + 2.2, 114), A3.putarX(-0.35)), 0, 10, -0.1, 0.1, 0, 4, warna('#f4f2ea'));
    }
    const nyala = macet ? Math.sin(now / 140) > 0 : MOD.internetMati ? true : Math.sin(now / 500) > 0;
    const led = macet ? (nyala ? '#e8453f' : '#5c2222') : MOD.internetMati ? '#c22b2b' : (nyala ? '#57d06a' : '#2c5c38');
    kotak(S, 219, 221, h + 7, h + 9, 114, 114.2, warna(led), { sisi: S_DEPAN, e: nyala ? 0.9 : 0 });
  }

  // Sandal jepit di depan pintu WC — cuma kalau WC-nya kosong (drawSandalWC):
  // yang di dalam memakainya.
  function sandalWC(S) {
    if (wcTerisi()) return;
    const tali = warna('#2f5fb0');
    for (const [x, z] of [[15, 111], [19, 112]]) {
      kotak(S, x, x + 3, 0, 0.5, z, z + 6, warna('#eef0ea'), { sisi: SEMUA });
      kotak(S, x + 1, x + 2, 0.5, 0.9, z + 1, z + 1.6, tali, { sisi: SEMUA });
      kotak(S, x, x + 1, 0.5, 0.8, z + 2, z + 2.6, tali, { sisi: SEMUA });
      kotak(S, x + 2, x + 3, 0.5, 0.8, z + 2, z + 2.6, tali, { sisi: SEMUA });
    }
  }

  // Bacaan di meja lesehan & karpet pojok baca (gambarKarpetBaca): koran
  // terbuka, dua buku bertumpuk, segelas teh; dua buku tergeletak di karpet.
  function bacaanLesehan(S) {
    const h = 5;                                             // tutup meja lesehan yang ditimbulkan
    kotak(S, 600, 612, h, h + 0.3, 199, 206, warna(P.paper), { sisi: SEMUA });
    kotak(S, 605.8, 606.2, h + 0.3, h + 0.36, 199, 206, warna('#b9c0ca'), { sisi: S_ATAS });
    kotak(S, 620, 630, h, h + 1.2, 200, 205, warna('#7a2020'), { sisi: SEMUA, w: { atas: warna('#a83a3a') } });
    kotak(S, 622, 632, h + 1.2, h + 2.2, 202, 207, warna('#2f4f7a'), { sisi: SEMUA });
    tabung(S, 642.5, 203, 2.3, h, h + 5, warna('#f2f0e6'), { segmen: 8, atas: warna('#c9b07a') });
    kotak(S, 587, 596, 0.8, 1.9, 232, 237.5, warna('#3e6b4f'), { sisi: SEMUA, w: { atas: warna('#5d8f6c') } });
    kotak(S, 589, 598, 0.8, 1.9, 237.5, 242, warna('#7a2020'), { sisi: SEMUA, w: { atas: warna('#a83a3a') } });
    kotak(S, 596, 598, 1.9, 2, 237.8, 241, warna(P.paper), { sisi: S_ATAS });
  }

  /* Keset baru di ambang pintu kadis (RUANGAN.kesetAda): tikar hijau tua
     bertepi merah dengan alur — lukisannya di tekstur lantai tertutup tepat. */
  function kesetKadis(S) {
    if (!RUANGAN.kesetAda) return;
    const x0 = PINTU_KADIS.x - 3, x1 = PINTU_KADIS.x + PINTU_KADIS.w + 3, z0 = FLOOR_TOP, z1 = FLOOR_TOP + 7;
    kotak(S, x0, x1, 0, 0.7, z0, z1, warna('#3f4a3a'), { sisi: SEMUA });
    for (const x of [x0, x1 - 1]) kotak(S, x, x + 1, 0.7, 0.78, z0, z1, warna('#7a2020'), { sisi: S_ATAS });
    for (let i = 0; i * 6 < PINTU_KADIS.w; i++) kotak(S, x0 + 2 + i * 6, x0 + 6 + i * 6, 0.7, 0.78, z0 + 3, z0 + 4, warna(sh('#3f4a3a', 0.85)), { sisi: S_ATAS });
  }

  /* Ceceran di lantai: kertas dikepal & lembaran rebah (gambarKusutLantai,
     muncul menurut ambang kusut masing-masing), plus barang tercecer dari
     event (RUANGAN.propLantai: map merah, map disposisi, daun, kertas bekas).
     Tiap benda menutup tepat cetakan lukisannya di tekstur lantai. */
  function cecerLantai(S) {
    const k = kusutKini();
    for (const c of KUSUT_LANTAI) {
      if (k <= c.a + 0.025) continue;                   // lukisannya yang memudar masuk dulu
      if (c.gumpal) {
        kotak(S, c.x, c.x + 4, 0, 2.4, c.y, c.y + 3, warna('#e4ddc8'), { sisi: SEMUA, w: { atas: warna('#f6f3e9') } });
        kotak(S, c.x + 0.8, c.x + 3, 2.4, 3.2, c.y + 0.6, c.y + 2.4, warna('#f6f3e9'), { sisi: SEMUA });
      } else {
        kotak(S, c.x, c.x + 6, 0, 0.3, c.y + 0.5, c.y + 3, warna(P.paper), { sisi: SEMUA, w: { atas: warna('#f6f3e9') } });
        kotakM(S, A3.kali(A3.geser(c.x + 5, 0.3, c.y + 0.5), A3.putarZ(0.6)), 0, 1.4, -0.1, 0.1, 0, 2.2, warna('#d9d4c2'));
      }
    }
    for (const p of RUANGAN.propLantai || []) {
      if (p.jenis === 'map-merah' || p.jenis === 'map-menunggu') {
        kotak(S, p.x, p.x + 12, 0, 0.8, p.y, p.y + 5, warna(p.jenis === 'map-merah' ? '#c9a03a' : '#e8a0a8'), { sisi: SEMUA });
        if (p.jenis === 'map-merah') kotakM(S, A3.kali(A3.geser(p.x + 9, 0.8, p.y + 1.5), A3.putarY(-0.14)), -3, 3, 0, 0.3, -1.5, 1.5, warna('#c22b2b'));
      } else if (p.jenis === 'daun') {
        kotak(S, p.x, p.x + 2, 0, 0.3, p.y, p.y + 2, warna('#4f8a56'), { sisi: SEMUA });
      } else if (p.jenis === 'kertas-bekas') {
        kotak(S, p.x, p.x + 4, 0, 1.2, p.y, p.y + 3, warna('#e4ddc8'), { sisi: SEMUA });
      }
    }
  }

  /* Tanda keadaan grup perabot: kalau sama dengan frame lalu, grupnya tidak
     disentuh. Kusut dimasukkan sebagai lapis per meja (bukan k mentah yang
     berubah tiap detik), layu dibulatkan ke 1/20. */
  function tandaPerabot() {
    const R = RUANGAN, k = kusutKini();
    let kusut = '';
    for (let i = 0; i < MEJA_KERJA_X.length; i++) {
      const maks = KUSUT_MEJA_MAKS[i] || 3;
      kusut += Math.min(maks, Math.floor(k * maks + 0.45)) + (k > 0.62 + (i % 3) * 0.06 ? 'm' : '');
    }
    kusut += (k > 0.82 ? 'L' : '') + (k > 0.55 ? Math.min(3, Math.floor((k - 0.55) * 6) + 1) : 0);
    return [R.boksHilang, R.arsipPenuh ? 1 : 0, R.dusTambahanArsip | 0, Math.min(10, R.arsipKlipingLembar | 0), R.piala ? 1 : 0,
      (adaStiker('arsip') ? 'a' : '') + (adaStiker('stempel') ? 's' : ''), R.tumpukanStempel | 0, R.stempelRapi ? 1 : 0,
      R.mapDisposisi | 0, R.coretKertas | 0, (R.nodaMeja || []).length, R.bantalanKering ? 1 : 0, Math.min(3, R.rimKertas | 0),
      Math.min(10, R.bukuTamu | 0), R.tema || '', Math.round((R.tanamanLayu || 0) * 20), kusut,
      Math.round((R.gordenKanan || 6) * 2), koranBasi() ? 1 : 0, R.kesetAda ? 1 : 0,
      KUSUT_LANTAI.filter((c) => k > c.a + 0.025).length,
      (R.propLantai || []).map((p) => p.jenis + Math.round(p.x) + ',' + Math.round(p.y)).join(';')].join('|');
  }
  let tandaPerabotTerakhir = null;
  function bangunPerabot() {
    const S = G.perabot;
    S.kosongkan();
    isiLemariArsip(S);
    isiMejaStempel(S);
    rimFotokopi(S);
    tintaBukuTamu(S);
    kusutMeja(S);
    tanamanVoxel(S);
    gordenJendela(S);
    pialaVoliLemari(S);
    koranRak(S);
    kesetKadis(S);
    cecerLantai(S);
    G.temaDinding.kosongkan();
    temaDinding(S, G.temaDinding);
    WADAH.perabot.isi(S);
    WADAH.temaDinding.isi(G.temaDinding);
  }

  /* X-banner (drawXBanner) yang benar-benar MIRING lalu REBAH: kainnya
     lukisan banner tegak (kulit 'xbanner', dilukis dengan sudut ditahan 0),
     seluruh rakitan — kain, rangka silang, kaki — berputar pada tepi belakang
     kakinya mengikuti RUANGAN.xbanner.sudut (0 tegak .. 1 rebah telentang). */
  function xBanner(S, Sk) {
    const XB = XBANNER, s = Math.max(0, Math.min(1, (RUANGAN.xbanner && RUANGAN.xbanner.sudut) || 0));
    const m = A3.kali(A3.geser(0, 0, 238), A3.poros(0, 0, -2.2, A3.putarX(-s * (Math.PI / 2 - 0.04))));
    kotakM(S, m, XB.x + 1, XB.x + 25, 4, 50, -0.5, 0, warna('#e9e5d6'), 0, S_BELAKANG | S_KIRI | S_KANAN | S_ATAS | S_BAWAH);
    if (K_.xbanner) mukaKulitM(Sk, m, XB.x + 1, XB.x + 25, 4, 50, 0, subUV(K_.xbanner, XB.x + 1, XB.y + 2, XB.x + 25, XB.y + 48));
    const besi = warna('#7c838a');
    batangM(S, m, XB.x, 0, XB.x + 26, 52, -1.6, -0.9, 0.9, besi);
    batangM(S, m, XB.x + 26, 0, XB.x, 52, -1.6, -0.9, 0.9, besi);
    for (const kx of [XB.x, XB.x + 26]) kotakM(S, m, kx - 2, kx + 2, 0, 0.8, -2.2, 1.6, warna('#5a6068'));
  }

  // ---------------------------------------------------------- ruang kadis 3D
  /* Di 2D, ruang kadis adalah BUKAAN berbingkai di dinding (SISIP): lukisan
     ruangan mini yang diklip ke kotak 72x46. Di 3D dindingnya benar-benar
     dilubangi di bingkai itu, dan di baliknya berdiri ruangan sungguhan —
     terbuka ke atas seperti seluruh maket, jadi bisa diintip lewat jendela
     dari ruang utama ATAU dilihat dari atas.

     Koordinat bukaan tetap bahasa simulasinya: tamu berdiri di KADIS_TITIK
     (x 302..342, y 69..73), kadis di (329, 65), ambang dalam (350, 71).
     x dipakai apa adanya — kursi tamu dan meja jati tetap tepat di balik
     jendelanya — sedangkan y bukaan (garis lantai SISIP_LANTAI = 58 ke ambang
     bawah 75) direntang jadi kedalaman ruangan: kadisZ(). */
  const LUBANG = {
    x0: SISIP.x + 3, x1: SISIP.x + SISIP.w - 3,                    // 293..359: di dalam tiang kusen
    y0: FLOOR_TOP - (SISIP.y + SISIP.h - 4), y1: FLOOR_TOP - (SISIP.y + 6),   // tinggi 35..71: di antara ambang
  };
  const RK = { x0: 262, x1: 390, z0: 30, z1: DINDING_Z - 6 };       // ruang kadis: 128 x 64, di balik tembok bersama
  const kadisZ = (y) => RK.z0 + 10 + (y - SISIP_LANTAI) * 2.6;      // 58→40, 65→58, 69→69, 73→79
  const KADIS_SIAP = typeof SISIP_LANTAI === 'number' && typeof KADIS_TITIK !== 'undefined';

  // Muka depan dinding belakang, dilubangi di jendela ruang kadis: empat
  // potong bertekstur lukisan dinding, uv-nya dipotong di tempat yang sama.
  function mukaDinding(x0, x1, h0, h1, S = G.dinding) {
    const uv = [x0 / W, (FLOOR_TOP - h1) / FLOOR_TOP, x1 / W, (FLOOR_TOP - h0) / FLOOR_TOP];
    S.segi([x0, h0, DINDING_Z], [x1, h0, DINDING_Z], [x1, h1, DINDING_Z], [x0, h1, DINDING_Z], [0, 0, 1], PUTIH, uv);
  }
  /* Tembok bersama berlubang TIGA: jendela ruang kadis, pintu WC, pintu
     gudang. Semua tepi lubang membagi dinding jadi kisi sel; sel yang bukan
     lubang dilukis dengan potongan tekstur dinding di tempatnya sendiri, jadi
     tidak ada sambungan yang kelihatan. Pintu turun sampai lantai: ambang
     bawahnya jadi pelat lantai setebal tembok, bukan kusen. */
  const PINTU_WC_L = { x0: WC.x + 2, x1: WC.x + WC.w - 2, y0: 0, y1: FLOOR_TOP - (WC.y + 2) };                 // 2..22 x 0..78
  const PINTU_GUDANG_L = { x0: GUDANG.x + 2, x1: GUDANG.x + GUDANG.w - 2, y0: 0, y1: FLOOR_TOP - (GUDANG.y + 2) };   // 610..638 x 0..78
  // jendela kantor: kacanya mundur ke punggung tembok (lihat dindingBerlubang)
  const JENDELA_L = { x0: JENDELA.x, x1: JENDELA.x + JENDELA.w, y0: FLOOR_TOP - (JENDELA.y + JENDELA.h), y1: FLOOR_TOP - JENDELA.y };   // 186..238 x 42..84
  // pintu kadis dua daun: lubangnya di dalam kusen jati (3 kiri-kanan, 4 atas)
  const PINTU_KADIS_L = { x0: PINTU_KADIS.x + 3, x1: PINTU_KADIS.x + PINTU_KADIS.w - 3, y0: 0, y1: FLOOR_TOP - (PINTU_KADIS.y + 4) };   // 443..485 x 0..82
  function semuaLubang() {
    return [
      { ...LUBANG, kusen: KAYU_TUA, ambang: gelapkan(KAYU, 1.1) },
      { ...PINTU_WC_L, kusen: warna('#c9ced1'), ambang: warna('#9aa2a7') },          // kusen aluminium
      { ...PINTU_GUDANG_L, kusen: warna('#565c4e'), ambang: warna('#6a7060') },      // kusen metal gudang
      { ...JENDELA_L, kusen: warna(P.creamD), ambang: warna('#e8e2cf') },            // tebal tembok berplester
      { ...PINTU_KADIS_L, kusen: warna('#4a3626'), ambang: warna('#3a2a1c') },       // kusen jati pintu pejabat
    ];
  }
  function dindingBerlubang(S) {
    const T = TINGGI_DINDING, zb = DINDING_Z - 6, lubang = semuaLubang();
    const unik = (a) => [...new Set(a)].sort((p, q) => p - q);
    const xs = unik([0, W, ...lubang.flatMap((L) => [L.x0, L.x1])]);
    const hs = unik([0, T, ...lubang.flatMap((L) => [L.y0, L.y1])]);
    const diLubang = (x, h) => lubang.some((L) => x > L.x0 && x < L.x1 && h > L.y0 && h < L.y1);
    const plester = warna('#d8d0b8');
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < hs.length - 1; j++) {
        const x0 = xs[i], x1 = xs[i + 1], h0 = hs[j], h1 = hs[j + 1];
        if (diLubang((x0 + x1) / 2, (h0 + h1) / 2)) continue;
        mukaDinding(x0, x1, h0, h1);
        kotak(S, x0, x1, h0, h1, zb, DINDING_Z, plester, { sisi: S_BELAKANG });
      }
    }
    // badan tembok setebal 6: tutup, dua ujung, dan pita punggung di atas 110
    kotak(S, -6, W + 6, 0, T + 3, zb, DINDING_Z, plester, { sisi: S_ATAS | S_KIRI | S_KANAN, w: { atas: warna('#f2ecd8') } });
    kotak(S, -6, 0, 0, T, zb, DINDING_Z, plester, { sisi: S_BELAKANG });
    kotak(S, W, W + 6, 0, T, zb, DINDING_Z, plester, { sisi: S_BELAKANG });
    kotak(S, -6, W + 6, T, T + 3, zb, DINDING_Z, plester, { sisi: S_BELAKANG });
    for (const L of lubang) {
      // kusen bertebal: sisi dalam lubang (urutan titik mengikuti muka kotak():
      // berlawanan jarum jam dilihat dari dalam lubang, atau culling membuangnya)
      if (L.y0 > 0) S.segi([L.x0, L.y0, DINDING_Z], [L.x1, L.y0, DINDING_Z], [L.x1, L.y0, zb], [L.x0, L.y0, zb], [0, 1, 0], L.ambang);
      else kotak(S, L.x0, L.x1, 0, 0.35, zb, DINDING_Z, L.ambang, { sisi: S_ATAS });   // pelat ambang pintu
      S.segi([L.x0, L.y1, zb], [L.x1, L.y1, zb], [L.x1, L.y1, DINDING_Z], [L.x0, L.y1, DINDING_Z], [0, -1, 0], L.kusen);
      S.segi([L.x0, L.y0, DINDING_Z], [L.x0, L.y0, zb], [L.x0, L.y1, zb], [L.x0, L.y1, DINDING_Z], [1, 0, 0], L.kusen);
      S.segi([L.x1, L.y0, zb], [L.x1, L.y0, DINDING_Z], [L.x1, L.y1, DINDING_Z], [L.x1, L.y1, zb], [-1, 0, 0], L.kusen);
    }
    // ambang bawah jendela kadis menjorok ke ruang utama — tempat orang menaruh map sambil menunggu
    kotak(S, SISIP.x, SISIP.x + SISIP.w, LUBANG.y0 - 3, LUBANG.y0, DINDING_Z, DINDING_Z + 3.5, KAYU, { sisi: SEMUA, w: { atas: gelapkan(KAYU, 1.25) } });

    /* Jendela kantor: kacanya di punggung tembok, memakai potongan LUKISAN
       DINDING yang sama (drawWindow: langit ikut jam, matahari/bulan/bintang,
       awan, kota & Monas, hujan, kilat, kaca berkabut, dan event yang
       menggambar di kaca) — semuanya tetap hidup, cuma sekarang terlihat di
       balik tebal tembok. Kusen aluminium & tiang silangnya timbul tepat di
       atas yang terlukis, ambangnya menjorok ke ruangan. */
    const J = JENDELA_L, zk = zb + 0.3, alu = warna('#9aa1a6');
    G.dinding.segi([J.x0, J.y0, zk], [J.x1, J.y0, zk], [J.x1, J.y1, zk], [J.x0, J.y1, zk], [0, 0, 1], PUTIH,
      [J.x0 / W, (FLOOR_TOP - J.y1) / FLOOR_TOP, J.x1 / W, (FLOOR_TOP - J.y0) / FLOOR_TOP]);
    const tx = (J.x0 + J.x1) / 2, th = (J.y0 + J.y1) / 2;
    for (const [x0, x1, h0, h1] of [[J.x0, J.x1, J.y0, J.y0 + 1], [J.x0, J.x1, J.y1 - 1, J.y1], [J.x0, J.x0 + 1, J.y0, J.y1],
      [J.x1 - 1, J.x1, J.y0, J.y1], [tx - 1, tx + 1, J.y0, J.y1], [J.x0, J.x1, th - 1, th + 1]]) {
      kotak(S, x0, x1, h0, h1, zk, zk + 1.2, alu, { sisi: SEMUA });
    }
    kotak(S, J.x0 - 2, J.x1 + 2, J.y0 - 2.5, J.y0, DINDING_Z, DINDING_Z + 3, warna('#e8e2cf'), { sisi: SEMUA, w: { atas: warna('#f2ecd8') } });
  }

  /* Pajangan dinding TIMBUL. Benda yang di 2D cuma lukisan di bidang dinding
     — papan nama dinas, foto pejabat, Garuda, jam, AC, papan-papan — diberi
     tebal: kotak (atau cakram untuk yang bundar) yang menonjol dari tembok.
     Muka depannya tetap TEKSTUR DINDING HIDUP di kotak yang sama, jadi jarum
     jam tetap berdetak dan LED AC tetap berkedip di muka yang menonjol itu;
     samping-sampingnya dicicip dari tepi lukisannya sendiri. Bayangan tempel
     yang sudah dilukis bayangDinding() jatuh pas di belakangnya. */
  const TIMBUL_DINDING = [
    { x: 18, y: 7, w: 134, h: 15, d: 1.6 },          // papan nama dinas
    { x: 104, y: 20, w: 56, h: 42, d: 1.2 },         // bagan struktur organisasi
    { x: 336, y: 14, w: 38, h: 10, d: 9 },           // AC split: badan atasnya (sirip & rumah bawah: acSplit)
    // kubah CCTV (kubahCCTV) dan monitor CRT (monitorCRT) dibangun sungguhan
    { x: 376, y: 16, w: 40, h: 30, d: 1.2 },         // plakat nilai
    { x: 268, y: 6, w: 12, h: 15, d: 1.6 },          // foto pejabat kiri
    { x: 290, y: 6, w: 20, h: 16, d: 1 },            // Garuda
    { x: 320, y: 6, w: 12, h: 15, d: 1.6 },          // foto pejabat kanan
    { x: 447, y: 3, w: 34, h: 16, d: 1.6 },          // plang KEPALA DINAS
    { ...PAPAN_KINERJA, d: 1.4 }, { ...PAPAN_UMUM, d: 1.4 }, { ...KOTAK_P3K, d: 4 },
    { ...POSTER_AKHLAK, d: 0.8 }, { ...NOMOR_ANTRE, d: 3 }, { ...PANEL_MCB, d: 3 },
  ];
  const CAKRAM_DINDING = [
    { cx: 168, cy: 38, r: 7.6, d: 1.8 },             // jam dinding
    { cx: 430, cy: 44, r: 5.6, d: 0.8 },             // rambu dilarang merokok
  ];
  function reliefDinding(S) {
    let piksel = null;
    try { piksel = kDinding.getImageData(0, 0, kvDinding.width, kvDinding.height).data; } catch { /* tanpa cicip: warna cadangan */ }
    const cicip = (x0, y0, x1, y1) => {
      if (!piksel) return warna('#8a8f86');
      let r = 0, g = 0, b = 0, n = 0;
      const X0 = Math.max(0, Math.round(x0 * K)), X1 = Math.min(kvDinding.width - 1, Math.round(x1 * K));
      const Y0 = Math.max(0, Math.round(y0 * K)), Y1 = Math.min(kvDinding.height - 1, Math.round(y1 * K));
      for (let y = Y0; y <= Y1; y += 2) for (let x = X0; x <= X1; x += 2) {
        const i = (y * kvDinding.width + x) * 4;
        r += piksel[i]; g += piksel[i + 1]; b += piksel[i + 2]; n++;
      }
      return n ? [r / n / 255, g / n / 255, b / n / 255, 1] : warna('#8a8f86');
    };
    for (const T of TIMBUL_DINDING) {
      const z1 = DINDING_Z + T.d, h0 = FLOOR_TOP - (T.y + T.h), h1 = FLOOR_TOP - T.y;
      G.dinding.segi([T.x, h0, z1], [T.x + T.w, h0, z1], [T.x + T.w, h1, z1], [T.x, h1, z1], [0, 0, 1], PUTIH,
        [T.x / W, T.y / FLOOR_TOP, (T.x + T.w) / W, (T.y + T.h) / FLOOR_TOP]);
      kotak(S, T.x, T.x + T.w, h0, h1, DINDING_Z, z1, null, {
        sisi: S_ATAS | S_BAWAH | S_KIRI | S_KANAN,
        w: {
          atas: cicip(T.x, T.y, T.x + T.w, T.y + 0.6), bawah: cicip(T.x, T.y + T.h - 0.6, T.x + T.w, T.y + T.h),
          kiri: cicip(T.x, T.y, T.x + 0.6, T.y + T.h), kanan: cicip(T.x + T.w - 0.6, T.y, T.x + T.w, T.y + T.h),
        },
      });
    }
    for (const C of CAKRAM_DINDING) {
      const n = 24, z1 = DINDING_Z + C.d, h0 = FLOOR_TOP - C.cy;
      const tepi = cicip(C.cx - C.r, C.cy - 0.6, C.cx + C.r, C.cy + 0.6);
      const titik = (a, z) => [C.cx + Math.cos(a) * C.r, h0 + Math.sin(a) * C.r, z];
      const uv = (p) => [p[0] / W, (FLOOR_TOP - p[1]) / FLOOR_TOP];
      const pusat = [C.cx, h0, z1];
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const p0 = titik(a0, z1), p1 = titik(a1, z1);
        G.dinding.tri(pusat, p0, p1, [0, 0, 1], PUTIH, uv(pusat), uv(p0), uv(p1));
        const am = (a0 + a1) / 2;
        S.segi(titik(a0, DINDING_Z), titik(a1, DINDING_Z), p1, p0, [Math.cos(am), Math.sin(am), 0], tepi);
      }
    }
  }

  /* --------------------------------------------- pajangan dinding yang hidup
     AC split (drawWall 2D, 336..374 x y14..27): badan atasnya relief dinding
     (LED-nya tetap lukisan hidup); di bawahnya rumah sirip yang masuk sedikit,
     sirip yang mengayun pelan selama AC menyala (rapat waktu MOD.acMati), dan
     hembusan dingin tipis yang turun dari mulutnya. Tetesnya sudah partikel. */
  function acSplit(S) {
    const mati = !!MOD.acMati, zDepan = DINDING_Z + 9;
    kotak(S, 336, 374, 83, 86, DINDING_Z, zDepan - 2.4, warna('#d5d9d0'), { sisi: SEMUA });
    kotak(S, 337.5, 372.5, 84, 85.6, zDepan - 2.4, zDepan - 2.3, warna('#2c3038'), { sisi: S_DEPAN });   // mulut angin
    const sudut = mati ? 0 : 0.55 + 0.35 * Math.sin(now / 1800);
    kotakM(S, A3.poros(0, 86, zDepan - 0.6, A3.putarX(-sudut)), 337.5, 372.5, 82.6, 86, zDepan - 1, zDepan - 0.6, warna('#e4e7e0'));
    if (mati) return;
    for (let k = 0; k < 4; k++) {
      const t = ((now / 1500) + k * 0.27) % 1, x = 342 + k * 8 + Math.sin(now / 700 + k) * 1.5;
      kotak(G.sinar, x, x + 3.5, 83 - t * 20, 85 - t * 20, zDepan + t * 12, zDepan + t * 12 + 2.5,
        [0.86, 0.95, 1, 0.18 * (1 - t) * Math.min(1, t * 5)], { sisi: SEMUA, e: 1 });   // berpendar: di bayangan badan AC tanpa itu jadi noda kelabu
    }
  }
  /* Kubah CCTV di pojok kiri-atas (drawWall 2D, 4..14 x y4..12): pelat dinding,
     lengan, rumah kubah, dan lensa yang MENOLEH — membidik titik sapuan selama
     cctv-menyapu-ruangan, pegawai yang kartunya dibuka, atau orang terdekat
     yang sedang berjalan; tanpa sasaran ia menyapu pelan sendiri. LED merahnya
     berkedip seperti 2D. */
  const CCTV = { yaw: 0.7, pitch: 0.45, x: 9, y: 100.4, z: DINDING_Z + 5.5 };
  function kubahCCTV(S, dt) {
    const C = CCTV, abu = warna('#9aa1a6'), kubah = warna('#2c3038');
    kotak(S, 4, 14, 101.6, 106.4, DINDING_Z, DINDING_Z + 1.2, warna('#7c838a'), { sisi: SEMUA });
    kotak(S, 8.3, 9.7, 102.6, 104, DINDING_Z + 1.2, C.z, abu, { sisi: SEMUA });
    tabung(S, C.x, C.z, 3.7, 101.4, 102.8, abu, { segmen: 12 });
    tabung(S, C.x, C.z, 3.5, 100.5, 101.4, kubah, { segmen: 12 });
    tabung(S, C.x, C.z, 3.0, 99.7, 100.5, kubah, { segmen: 12 });
    tabung(S, C.x, C.z, 2.2, 99.1, 99.7, kubah, { segmen: 10 });
    let sasaran = null;
    const sapu = eventHidup.find((E) => E.def.id === 'cctv-menyapu-ruangan');
    if (sapu && sapu.data.sapuX != null) sasaran = [sapu.data.sapuX, 10, 300];
    else if (terpilih && !terpilih.diKadis) { const [px, pz] = posisiOrang(terpilih); sasaran = [px, 20, pz]; }
    else {
      let jarak = Infinity;
      for (const a of penghuni()) {
        if (a.diKadis || a.state !== 'walk') continue;
        const [px, pz] = posisiOrang(a), d = Math.hypot(px - C.x, pz - C.z);
        if (d < jarak) { jarak = d; sasaran = [px, 20, pz]; }
      }
    }
    let yaw = 0.7 + 0.45 * Math.sin(now / 5200), pitch = 0.42;
    if (sasaran) {
      const dx = sasaran[0] - C.x, dy = sasaran[1] - C.y, dz = sasaran[2] - C.z;
      yaw = Math.atan2(dx, dz); pitch = Math.atan2(-dy, Math.hypot(dx, dz));
    }
    const k = geraKurang3.matches ? 1 : Math.min(1, Math.max(0, dt) * 2.5);
    C.yaw += Math.atan2(Math.sin(yaw - C.yaw), Math.cos(yaw - C.yaw)) * k;
    C.pitch += (pitch - C.pitch) * k;
    const m = A3.kali(A3.geser(C.x, C.y, C.z), A3.kali(A3.putarY(C.yaw), A3.putarX(C.pitch)));
    kotakM(S, m, -1.15, 1.15, -1.15, 1.15, 1.9, 2.5, warna('#5a6068'));                                // cincin lensa
    kotakM(S, m, -0.8, 0.8, -0.8, 0.8, 2.5, 3.3, warna('#101418'), 0.15);                              // lensa
    const led = Math.sin(now / 1000) > 0;
    kotakM(S, m, 1.3, 1.8, 0.9, 1.4, 2.2, 2.6, warna(led ? P.red : '#5c2222'), led ? 1 : 0);
  }
  /* Monitor CRT bekas di rak dinding (drawCRT 2D, 159..177 x y45..64): layarnya
     kulit hidup sendiri (bar gulingnya waktu MOD.crtAktif) dan sedikit
     memancar; di belakangnya tabung yang menirus ke tembok, di bawahnya leher,
     dudukan, dan papan rak bersiku besi. */
  function monitorCRT(S) {
    const s = K_ && K_.crt;
    const z = DINDING_Z, rangka = warna('#3a3f45'), tabungW = warna('#2f3439');
    kotak(S, 158.5, 179.5, 44.6, 46, z, z + 17, KAYU, { sisi: SEMUA, w: { atas: gelapkan(KAYU, 1.12) } });   // papan rak
    for (const bx of [159.5, 177.5]) kotak(S, bx, bx + 1, 38, 44.6, z, z + 9, BESI_TUA, { sisi: SEMUA });    // siku
    kotak(S, 163, 173, 46, 47.2, z + 4, z + 14, warna('#2b2f34'));                                             // dudukan
    kotak(S, 166, 170, 47.2, 49, z + 7, z + 11, rangka);                                                      // leher
    kotak(S, 162, 174, 51, 63, z + 4, z + 12, tabungW, { sisi: SEMUA });                                       // tabung
    kotak(S, 165, 171, 53.5, 60.5, z + 1, z + 4, tabungW, { sisi: SEMUA });                                    // pangkal tabung
    kotak(S, 159, 177, 49, 65, z + 12, z + 16, rangka, { sisi: S_KIRI | S_KANAN | S_ATAS | S_BAWAH });        // bingkai
    if (s) G.kulit.segi([159, 49, z + 16], [177, 49, z + 16], [177, 65, z + 16], [159, 65, z + 16], [0, 0, 1], PUTIH, s.uv, 0.25);
    else kotak(S, 159, 177, 49, 65, z + 12, z + 16, warna('#1d3a2a'), { sisi: S_DEPAN });
  }

  // tembok berpita (plin · mint · lis · krem), sama seperti ruang utama
  function pita(S, x0, x1, z0, z1, h = TINGGI_DINDING, sisi = SEMUA) {
    kotak(S, x0, x1, 0, Math.min(h, 10), z0, z1, PLIN, { sisi });
    kotak(S, x0, x1, 10, Math.min(h, 38), z0, z1, MINT, { sisi });
    kotak(S, x0, x1, 38, 40, z0, z1, LIS, { sisi });
    kotak(S, x0, x1, 40, h, z0, z1, KREM, { sisi, w: { atas: warna('#f2ecd8') } });
  }

  /* Isi ruang kadis, grup statisnya sendiri (kadisPolos/kadisKulit): setelan
     bukaan 'mati' berarti nol jejak — grupnya tidak digambar sama sekali. */
  function bangunRuangKadis() {
    const S = G.kadisPolos;
    S.kosongkan(); G.kadisKulit.kosongkan();
    if (!KADIS_SIAP) return;
    // alas maket di bawahnya + lantai ubin + karpet merah tua
    kotak(S, RK.x0 - 6, RK.x1 + 6, -14, -0.5, RK.z0 - 8, DINDING_Z - 11, warna('#3a2a1a'), { sisi: SEMUA, w: { atas: warna('#4a3826') } });
    kotak(S, RK.x0, RK.x1, -0.5, 0, RK.z0, RK.z1, warna(P.tile), { sisi: S_ATAS });
    for (let z = RK.z0 + 9; z < RK.z1; z += 9) kotak(S, RK.x0, RK.x1, 0, 0.05, z, z + 0.4, warna(P.grout), { sisi: S_ATAS });
    kotak(S, 280, 372, 0, 0.6, RK.z0 + 14, RK.z1 - 2, warna('#743030'), { sisi: SEMUA });
    kotak(S, 283, 369, 0.6, 0.9, RK.z0 + 16, RK.z1 - 4, warna('#8d3a3a'), { sisi: S_ATAS });
    // tiga tembok sendiri (tembok keempat = punggung tembok bersama) — sisi
    // dalam punggung tembok bersama ikut dicat pita, kecuali lubang jendelanya
    pita(S, RK.x0 - 2, RK.x1 + 2, RK.z0 - 2, RK.z0);
    pita(S, RK.x0 - 2, RK.x0, RK.z0, RK.z1);
    pita(S, RK.x1, RK.x1 + 2, RK.z0, RK.z1);
    const zp = RK.z1 - 0.3;
    pita(S, RK.x0, LUBANG.x0, zp, RK.z1, TINGGI_DINDING, S_BELAKANG);
    pita(S, LUBANG.x1, RK.x1, zp, RK.z1, TINGGI_DINDING, S_BELAKANG);
    pita(S, LUBANG.x0, LUBANG.x1, zp, RK.z1, LUBANG.y0, S_BELAKANG);
    kotak(S, LUBANG.x0, LUBANG.x1, LUBANG.y1, TINGGI_DINDING, zp, RK.z1, KREM, { sisi: S_BELAKANG });

    // trio wajib di dinding belakang: foto pejabat — Garuda — foto pejabat
    const k = K_, zd = RK.z0 + 0.4;
    for (const [s, x, w, h] of [[k.fotoKadis, 300, 12, 15], [k.garudaKadis, 316, 20, 16], [k.fotoKadis, 340, 12, 15]]) {
      if (!s) continue;
      G.kadisKulit.segi([x, 60, zd + 1], [x + w, 60, zd + 1], [x + w, 60 + h, zd + 1], [x, 60 + h, zd + 1], [0, 0, 1], PUTIH, s.uv);
      kotak(S, x, x + w, 60, 60 + h, zd, zd + 1, warna('#6d5535'), { sisi: S_KIRI | S_KANAN | S_ATAS | S_BAWAH });
    }
    // lemari piala di pojok kanan belakang: versi ringkas lemari ruang utama,
    // rak terbuka (tanpa kaca: ruangan ini cuma kelihatan lewat jendela/atas)
    lemariPialaKadis(S);
    // pintu dalam di tembok kanan, dekat jendela: ke sanalah tamu masuk
    const zP0 = RK.z1 - 30, zP1 = RK.z1 - 6;
    kotak(S, RK.x1 - 1.2, RK.x1, 0, 46, zP0 - 1.5, zP1 + 1.5, warna('#4a3626'), { sisi: SEMUA });
    kotak(S, RK.x1 - 1.8, RK.x1 - 1.2, 0, 44, zP0, zP1, warna('#6b4a30'), { sisi: SEMUA });
    for (const [h0, h1] of [[6, 20], [24, 40]]) kotak(S, RK.x1 - 2.2, RK.x1 - 1.8, h0, h1, zP0 + 2.5, zP1 - 2.5, warna('#5c3f29'), { sisi: S_KIRI });
    kotak(S, RK.x1 - 2.8, RK.x1 - 1.8, 21, 23, zP0 + 2, zP0 + 4, warna(P.gold), { sisi: SEMUA, e: 0.2 });
    // meja jati berlis kuningan + map disposisi, telepon, bendera meja
    const MK = { x0: 306, x1: 335, z0: 62, z1: 71, h: 18 };
    kotak(S, MK.x0, MK.x1, MK.h - 3, MK.h, MK.z0, MK.z1, KAYU_TUA, { sisi: SEMUA, w: { atas: gelapkan(KAYU, 0.95) } });
    kotak(S, MK.x0, MK.x1, MK.h - 1.6, MK.h - 1, MK.z1, MK.z1 + 0.25, warna(P.gold), { sisi: S_DEPAN, e: 0.15 });
    kotak(S, MK.x0 + 1, MK.x1 - 1, 0, MK.h - 3, MK.z0 + 1, MK.z0 + 2.5, KAYU_TUA);           // panel depan (hadap kadis)
    for (const kx of [MK.x0 + 1, MK.x1 - 3]) kotak(S, kx, kx + 2, 0, MK.h - 3, MK.z1 - 3, MK.z1 - 1, KAYU_TUA);
    kotak(S, MK.x0 + 3, MK.x0 + 11, MK.h, MK.h + 2.4, MK.z0 + 2, MK.z0 + 7, warna(P.paper));
    kotak(S, MK.x0 + 3, MK.x0 + 11, MK.h + 2.4, MK.h + 2.8, MK.z0 + 2, MK.z0 + 7, warna('#c9a03a'), { sisi: S_ATAS });
    kotak(S, MK.x1 - 8, MK.x1 - 2, MK.h, MK.h + 2.5, MK.z0 + 2, MK.z0 + 6, warna('#2c3440'));
    const bx = MK.x0 + 16;
    kotak(S, bx - 3, bx + 9, MK.h, MK.h + 1, MK.z0 + 3, MK.z0 + 5, warna('#7c838a'));
    for (const [px, atas, bawah] of [[bx, P.red, '#f4f2ec'], [bx + 6, '#c9a03a', '#1c4e8a']]) {
      kotak(S, px, px + 0.6, MK.h + 1, MK.h + 11, MK.z0 + 3.7, MK.z0 + 4.3, warna('#9aa1a6'));
      kotak(S, px + 0.6, px + 4, MK.h + 8, MK.h + 11, MK.z0 + 3.8, MK.z0 + 4.2, warna(atas), { sisi: SEMUA });
      kotak(S, px + 0.6, px + 4, MK.h + 5, MK.h + 8, MK.z0 + 3.8, MK.z0 + 4.2, warna(bawah), { sisi: SEMUA });
    }
    // kursi kadis bersandaran tinggi + tiga kursi tamu (tamunya berdiri melapor di depannya)
    kursi(S, kadisNpcX(), kadisZ(65) - 4 * SKALA_ORANG, 1, false);
    kotak(S, kadisNpcX() - 6.5, kadisNpcX() + 6.5, 24, 30, kadisZ(65) - 4 * SKALA_ORANG - 6.7, kadisZ(65) - 4 * SKALA_ORANG - 4.3, warna('#3a3f45'), { sisi: SEMUA });
    for (const t of KADIS_TITIK) kursi(S, t.x, kadisZ(t.y) + 4 * SKALA_ORANG, -1, false);
    // palem kecil di pojok kiri: palem voxel yang sama dengan ruang tunggu
    kotak(S, 268, 278, 0, 10, RK.z0 + 4, RK.z0 + 14, warna('#e8e6de'), { w: { atas: warna('#6b5a3a') } });
    palemVoxel(S, 273, RK.z0 + 9, 10, 0.9);
    // lampu gantung kantor kadis — sumber cahaya keempat di shader
    kotak(S, 312, 340, KADIS_LAMPU.y + 2, KADIS_LAMPU.y + 3.5, KADIS_LAMPU.z - 2.5, KADIS_LAMPU.z + 2.5, warna('#b9bcb2'), { sisi: SEMUA });
    for (const kx of [314, 338]) kotak(S, kx - 0.4, kx + 0.4, KADIS_LAMPU.y + 3.5, TINGGI_DINDING, KADIS_LAMPU.z - 0.4, KADIS_LAMPU.z + 0.4, warna('#8b8f86'), { sisi: SEMUA });
    WADAH.kadisPolos.isi(S);
    WADAH.kadisKulit.isi(G.kadisKulit);
  }
  const KADIS_LAMPU = { x: 326, y: 96, z: 58 };
  const kadisNpcX = () => (kadisNpc ? kadisNpc.x : 329);

  /* Gorden vitrase di dalam lubang, tersibak mengikuti RUANG_KADIS.t persis
     seperti drawGordenSisip: dua panel dari tepi ke tengah, lebarnya
     menyusut sampai tinggal lipatan 2 satuan di tiap sisi. */
  function gordenKadis(S) {
    const L = LUBANG, t = RUANG_KADIS.t;
    const separuh = (L.x1 - L.x0) / 2;
    const lebar = Math.max(2, separuh - (separuh - 2) * t);
    const kain = warna('#c9d3c0'), lipat = warna(sh('#c9d3c0', 0.8));
    const zg = DINDING_Z - 3.2;
    for (const kiri of [true, false]) {
      const a = kiri ? L.x0 : L.x1 - lebar;
      const n = Math.max(1, Math.round(lebar / 2.4));
      for (let i = 0; i < n; i++) {
        const x0 = a + (lebar / n) * i, x1 = a + (lebar / n) * (i + 1);
        const maju = i % 2 ? 0.45 : -0.45;                 // lipatan bergelombang
        kotak(S, x0, x1, L.y0 + 0.3, L.y1 - 1, zg + maju - 0.3, zg + maju + 0.3, i % 2 ? kain : lipat, { sisi: SEMUA });
      }
    }
    kotak(S, L.x0, L.x1, L.y1 - 1.2, L.y1, zg - 1, zg + 1, KAYU_TUA, { sisi: SEMUA });   // rel gorden
  }

  // ------------------------------------------------------ WC & gudang 3D
  /* Di 2D pintu WC dan gudang cuma lukisan: yang masuk berdiri di ambang lalu
     MEMUDAR, dan isi ruangannya dilukis di daun pintu selagi terbuka. Di 3D
     tembok bersamanya dilubangi, daun pintunya sungguhan (berengsel, mengayun
     ke dalam selama bukaSampai), dan di baliknya ada ruangannya:
       WC     — berplafon: isinya cuma kelihatan lewat pintu yang terbuka.
                Keramik biru, bak mandi & gayung, kloset jongkok, lampu yang
                menyala selama ada orangnya. Yang masuk tetap memudar seperti
                di 2D — sambil melangkah melewati pintunya;
       gudang — terbuka ke atas seperti seluruh maket: rak besi berisi kardus
                & rim kertas, bohlam telanjang, barang bekas yang disimpan.
                Yang mengambil ATK benar-benar kelihatan di dalam, meraih rak,
                lalu keluar membawa kardusnya.
     Daun pintunya memakai lukisan pintu tertutup dari drawPintuWC()/
     drawPintuGudang() yang sama — plang pria·WC·wanita, kisi yang berpendar
     waktu terisi, strip hazard, gembok — jadi tandanya tetap terbaca. */
  const RUANG_WC = { x0: -6, x1: 32, z0: 62, z1: DINDING_Z - 6, h: 54 };
  const RUANG_GUDANG = { x0: 590, x1: 658, z0: 52, z1: DINDING_Z - 6, h: 70 };
  const ZD = DINDING_Z - 1.6;                                        // sumbu engsel: daun mundur dari muka tembok
  const DAUN = {
    wc: { L: PINTU_WC_L, keadaan: () => wcKeadaan, sudut: 0, punggung: '#a9c4cf' },
    gudang: { L: PINTU_GUDANG_L, keadaan: () => gudangKeadaan, sudut: 0, punggung: '#6a7060' },
  };

  function bangunRuangWC(S) {
    const R = RUANG_WC, keramik = warna('#a6c6cf'), nat = warna('#93b6c0');
    kotak(S, R.x0, R.x1, -14, -0.5, R.z0 - 6, R.z1, warna('#3a2a1a'), { sisi: SEMUA });            // alas maket
    kotak(S, R.x0, R.x1, -0.5, 0, R.z0, R.z1, warna('#8fb0bb'), { sisi: S_ATAS });                // lantai basah
    for (let z = R.z0 + 5; z < R.z1; z += 5) kotak(S, R.x0, R.x1, 0, 0.05, z, z + 0.3, nat, { sisi: S_ATAS });
    // dinding keramik + plafon (tutup dari luar, putih dari dalam)
    kotak(S, R.x0, R.x0 + 2, 0, R.h, R.z0, R.z1, keramik, { sisi: SEMUA });
    kotak(S, R.x1 - 2, R.x1, 0, R.h, R.z0, R.z1, keramik, { sisi: SEMUA });
    kotak(S, R.x0, R.x1, 0, R.h, R.z0 - 2, R.z0, keramik, { sisi: SEMUA });
    for (let h = 6; h < R.h; h += 6) {
      kotak(S, R.x0 + 2, R.x0 + 2.2, h, h + 0.3, R.z0, R.z1, nat, { sisi: S_KANAN });
      kotak(S, R.x1 - 2.2, R.x1 - 2, h, h + 0.3, R.z0, R.z1, nat, { sisi: S_KIRI });
      kotak(S, R.x0 + 2, R.x1 - 2, h, h + 0.3, R.z0, R.z0 + 0.2, nat, { sisi: S_DEPAN });
    }
    kotak(S, R.x0, R.x1, R.h, R.h + 2, R.z0 - 2, R.z1, warna('#d8d0b8'), { sisi: SEMUA, w: { bawah: warna('#eef2f4'), atas: warna('#cfc7ae') } });
    // punggung tembok bersama di dalam WC ikut berkeramik, kecuali lubang pintunya
    const zp = R.z1 - 0.3, L = PINTU_WC_L;
    kotak(S, R.x0 + 2, L.x0, 0, R.h, zp, R.z1, keramik, { sisi: S_BELAKANG });
    kotak(S, L.x1, R.x1 - 2, 0, R.h, zp, R.z1, keramik, { sisi: S_BELAKANG });
    kotak(S, L.x0, L.x1, L.y1, R.h, zp, R.z1, keramik, { sisi: S_BELAKANG });
    // bak mandi berkeramik + air + gayung, kloset jongkok
    kotak(S, 8, 28, 0, 15, R.z0, R.z0 + 12, warna('#3f7f99'), { sisi: SEMUA, w: { atas: warna('#d6ecf2') } });
    kotak(S, 9.5, 26.5, 14.2, 15.05, R.z0 + 1.5, R.z0 + 10.5, warna('#2a6a86'), { sisi: S_ATAS, e: 0.15 });
    kotak(S, 12, 16, 15, 17.5, R.z0 + 10, R.z0 + 13.5, warna('#e0628e'), { sisi: SEMUA });
    kotak(S, 16, 20, 16.5, 17.3, R.z0 + 11.2, R.z0 + 12.2, warna('#e0628e'), { sisi: SEMUA });
    kotak(S, -2, 8, 0, 1.6, R.z0 + 16, R.z0 + 27, warna('#eef0ea'), { sisi: SEMUA });
    kotak(S, 1, 5, 1.6, 1.7, R.z0 + 19, R.z0 + 24, warna('#5a6068'), { sisi: S_ATAS });
  }

  function bangunRuangGudang(S) {
    const R = RUANG_GUDANG, dinding = warna('#b9bdb6'), besi = warna('#34362d');
    kotak(S, R.x0, R.x1, -14, -0.5, R.z0 - 6, R.z1, warna('#3a2a1a'), { sisi: SEMUA });
    kotak(S, R.x0, R.x1, -0.5, 0, R.z0, R.z1, warna('#8a8f86'), { sisi: S_ATAS });                // lantai semen
    kotak(S, R.x0, R.x0 + 2, 0, R.h, R.z0, R.z1, dinding, { sisi: SEMUA, w: { atas: warna('#d8d0b8') } });
    kotak(S, R.x1 - 2, R.x1, 0, R.h, R.z0, R.z1, dinding, { sisi: SEMUA, w: { atas: warna('#d8d0b8') } });
    kotak(S, R.x0, R.x1, 0, R.h, R.z0 - 2, R.z0, dinding, { sisi: SEMUA, w: { atas: warna('#d8d0b8') } });
    const zp = R.z1 - 0.3, L = PINTU_GUDANG_L;
    kotak(S, R.x0 + 2, L.x0, 0, R.h, zp, R.z1, dinding, { sisi: S_BELAKANG });
    kotak(S, L.x1, R.x1 - 2, 0, R.h, zp, R.z1, dinding, { sisi: S_BELAKANG });
    kotak(S, L.x0, L.x1, L.y1, R.h, zp, R.z1, dinding, { sisi: S_BELAKANG });
    // dua rak besi di dinding belakang, empat susun: kardus ATK & rim kertas
    const KARDUS = warna('#b98d5e'), LAKBAN = warna('#d9cba8'), RIM = warna('#f2f0e6');
    for (const [rx0, rx1] of [[R.x0 + 4, R.x0 + 32], [R.x0 + 35, R.x1 - 4]]) {
      for (const kx of [rx0, rx1 - 1.5]) for (const kz of [R.z0 + 0.5, R.z0 + 8.5]) kotak(S, kx, kx + 1.5, 0, 60, kz, kz + 1.5, besi);
      for (const h of [2, 20, 38, 56]) kotak(S, rx0, rx1, h, h + 1.4, R.z0 + 0.5, R.z0 + 10, besi, { sisi: SEMUA });
      for (const [i, h] of [[0, 3.4], [1, 21.4], [2, 39.4]]) {
        let x = rx0 + 1.5;
        for (let n = 0; x < rx1 - 5; n++) {
          const kardus = (n + i) % 3 !== 2, w = kardus ? 8 : 6, t = kardus ? 8 + ((n * 7 + i) % 3) * 2 : 5;
          kotak(S, x, x + w, h, h + t, R.z0 + 1.5, R.z0 + 9, kardus ? KARDUS : RIM, { sisi: SEMUA, w: { atas: kardus ? LAKBAN : warna('#ffffff') } });
          x += w + 1.2;
        }
      }
    }
    // balok melintang + bohlam telanjang yang tergantung di tengah ruangan
    kotak(S, R.x0, R.x1, R.h - 3, R.h - 1, (R.z0 + R.z1) / 2 - 1, (R.z0 + R.z1) / 2 + 1, besi, { sisi: SEMUA });
    kotak(S, 623.6, 624.4, R.h - 16, R.h - 3, (R.z0 + R.z1) / 2 - 0.4, (R.z0 + R.z1) / 2 + 0.4, warna('#2c3038'), { sisi: SEMUA });
  }
  /* Barang bekas yang disimpan (RUANGAN.isiGudang) sebagai voxel kecil: bentuk
     & warnanya dari gambarBarangBekas() 2D, s satuan per piksel lukisannya.
     (x, y, z) = pojok kiri-bawah-belakang alasnya. */
  function barangBekas3D(S, jenis, x, y, z, s) {
    const k = (x0, x1, y0, y1, z0, z1, c, atas) =>
      kotak(S, x + x0 * s, x + x1 * s, y + y0 * s, y + y1 * s, z + z0 * s, z + z1 * s, warna(c), { sisi: SEMUA, w: atas ? { atas: warna(atas) } : null });
    switch (jenis) {
      case 'keset':      // digulung, berdiri; pinggiran merahnya di kedua ujung
        k(0, 3, 0, 7, 0, 3, '#3f4a3a', '#7a2020');
        k(-0.1, 3.1, 0, 1, -0.1, 3.1, '#7a2020');
        break;
      case 'piala':
        k(0, 4, 0, 2, 0, 3, '#6b4a2a');
        k(0.5, 3.5, 2, 6, 0.3, 2.7, '#e8c14a', '#fff3b0');
        break;
      case 'plang':      // plang lama bersandar di kaki penyangganya
        k(0.5, 3.5, 0, 0.8, 0, 3, '#5e3a24');
        k(0, 4, 0.8, 8, 1, 2, '#8d5738', '#c9a03a');
        k(1, 3, 5.5, 6.3, 2, 2.15, '#e8e4d4');
        break;
      case 'bukuTamu':   // buku besar: sampul merah mengapit blok halaman
        k(0, 4, 0, 0.4, 0, 3, '#7a2020');
        k(0.1, 3.9, 0.4, 2.6, 0.1, 2.9, '#e8e4d4');
        k(0, 4, 2.6, 3, 0, 3, '#7a2020');
        break;
      case 'kursi':
        for (const [lx, lz] of [[0, 0], [3.2, 0], [0, 3.2], [3.2, 3.2]]) k(lx, lx + 0.8, 0, 3, lz, lz + 0.8, '#6a6e66');
        k(0, 4, 3, 4, 0, 4, '#8b8f86');
        k(0, 4, 4, 8, 0, 0.8, '#8b8f86');
        break;
      default:           // kardus
        k(0, 4, 0, 4, 0, 4, '#b98d5e', '#d9cba8');
    }
  }
  /* Pintu kadis (drawKadis): pintu DUA DAUN berkusen jati dengan lis mahkota.
     Di 2D daun kanannya terbuka ke dalam selama stasiun 'agent' dipakai (atau
     MOD.pintuKadis dari event): gelap di dalam, cahaya kuning dari ruangan.
     Di 3D tembok dilubangi di dalam kusennya, daun kanan berengsel di tepi
     kanan dan benar-benar mengayun, dan di baliknya lorong berpanel kayu
     beratap — ujungnya pintu ruangan yang terang hangat. */
  const LORONG_KADIS = { x0: PINTU_KADIS.x - 4, x1: PINTU_KADIS.x + PINTU_KADIS.w + 4, z0: 70, z1: DINDING_Z - 6, h: 90 };   // 436..492
  const DAUN_KADIS = { sudut: 0 };
  function kusenPintuKadis(S) {
    const P2 = PINTU_KADIS, jati = warna('#4a3626'), z0 = DINDING_Z;
    kotak(S, P2.x, P2.x + 3, 0, P2.h, z0, z0 + 1.4, jati, { sisi: SEMUA });
    kotak(S, P2.x + P2.w - 3, P2.x + P2.w, 0, P2.h, z0, z0 + 1.4, jati, { sisi: SEMUA });
    kotak(S, P2.x + 3, P2.x + P2.w - 3, P2.h - 4, P2.h, z0, z0 + 1.4, jati, { sisi: SEMUA });
    kotak(S, P2.x - 2, P2.x + P2.w + 2, P2.h, P2.h + 3, z0, z0 + 2.6, warna('#3a2a1c'), { sisi: SEMUA, w: { atas: warna('#6b4a30') } });   // lis mahkota
  }
  function bangunLorongKadis(S) {
    const R = LORONG_KADIS, panel = warna('#4a3626'), lis = warna('#6b4a30');
    kotak(S, R.x0, R.x1, -14, -0.5, R.z0 - 6, R.z1, warna('#3a2a1a'), { sisi: SEMUA });               // alas maket
    kotak(S, R.x0, R.x1, -0.5, 0, R.z0, R.z1, warna('#3a2a20'), { sisi: S_ATAS });
    kotak(S, R.x0 + 6, R.x1 - 6, 0, 0.3, R.z0 + 1, R.z1, warna('#5a2a26'), { sisi: S_ATAS });         // karpet merah tua
    kotak(S, R.x0, R.x0 + 2, 0, R.h, R.z0, R.z1, panel, { sisi: SEMUA });
    kotak(S, R.x1 - 2, R.x1, 0, R.h, R.z0, R.z1, panel, { sisi: SEMUA });
    kotak(S, R.x0, R.x1, 0, R.h, R.z0 - 2, R.z0, panel, { sisi: SEMUA });
    kotak(S, R.x0, R.x1, R.h, R.h + 2, R.z0 - 2, R.z1, warna('#d8d0b8'), { sisi: SEMUA, w: { bawah: warna('#2a1e14') } });   // plafon
    for (const h of [30, 31.2]) {                                                                    // lis panel kayu
      kotak(S, R.x0 + 2, R.x0 + 2.4, h, h + 0.6, R.z0, R.z1, lis, { sisi: S_KANAN });
      kotak(S, R.x1 - 2.4, R.x1 - 2, h, h + 0.6, R.z0, R.z1, lis, { sisi: S_KIRI });
    }
    // punggung tembok bersama di dalam lorong, kecuali lubang pintunya
    const zp = R.z1 - 0.3, L = PINTU_KADIS_L;
    kotak(S, R.x0 + 2, L.x0, 0, R.h, zp, R.z1, panel, { sisi: S_BELAKANG });
    kotak(S, L.x1, R.x1 - 2, 0, R.h, zp, R.z1, panel, { sisi: S_BELAKANG });
    kotak(S, L.x0, L.x1, L.y1, R.h, zp, R.z1, panel, { sisi: S_BELAKANG });
    // ujung lorong: pintu ruangan yang terbuka, terang hangat — "cahaya kuning dari ruangan"
    const tengah = (R.x0 + R.x1) / 2;
    kotak(S, tengah - 13, tengah + 13, 0, 64, R.z0, R.z0 + 0.4, warna('#ffd88a'), { sisi: S_DEPAN, e: 0.85 });
    kotak(S, tengah - 15, tengah - 13, 0, 66, R.z0, R.z0 + 1.6, lis, { sisi: SEMUA });
    kotak(S, tengah + 13, tengah + 15, 0, 66, R.z0, R.z0 + 1.6, lis, { sisi: SEMUA });
    kotak(S, tengah - 15, tengah + 15, 64, 66, R.z0, R.z0 + 1.6, lis, { sisi: SEMUA });
    kotak(S, tengah - 4, tengah + 4, 0, 0.35, R.z0 + 0.4, R.z0 + 14, warna('#ffd88a', 1), { sisi: S_ATAS, e: 0.25 });   // pantulan di karpet
  }
  // Daun kiri selalu tertutup, daun kanan mengayun ke dalam selama terbuka.
  function daunKadis(S, Sk, stasiun, dt) {
    const L = PINTU_KADIS_L, P2 = PINTU_KADIS, tengah = P2.x + P2.w / 2, tinggi = L.y1 - L.y0, ZK = DINDING_Z - 1.6;
    const tuju = stasiun.has('agent') || MOD.pintuKadis ? 1.45 : 0;
    DAUN_KADIS.sudut += (tuju - DAUN_KADIS.sudut) * (geraKurang3.matches ? 1 : Math.min(1, Math.max(0, dt) * 6));
    const kulitDaun = K_.pintuKadis, kayu = warna('#6b4a30'), sisi = S_BELAKANG | S_KIRI | S_KANAN | S_ATAS;
    const yA = P2.y + 4, yB = P2.y + P2.h;
    const mL = A3.geser(L.x0, 0, ZK);
    kotakM(S, mL, 0, tengah - L.x0, 0, tinggi, -0.8, 0.6, kayu, 0, sisi);
    if (kulitDaun) mukaKulitM(Sk, mL, 0, tengah - L.x0, 0, tinggi, 0.6, subUV(kulitDaun, L.x0, yA, tengah, yB));
    const mR = A3.kali(A3.geser(L.x1, 0, ZK), A3.putarY(-DAUN_KADIS.sudut));
    kotakM(S, mR, tengah - L.x1, 0, 0, tinggi, -0.8, 0.6, kayu, 0, sisi);
    if (kulitDaun) mukaKulitM(Sk, mR, tengah - L.x1, 0, 0, tinggi, 0.6, subUV(kulitDaun, tengah, yA, L.x1, yB));
  }
  /* Lemari piala kecil di ruang kadis: versi ringkas lemari ruang utama —
     rangka jati, punggung gelap, dua rak kaca, lemari bawah; piala emas,
     piala perak, plakat. Rak terbuka: ruangan ini cuma terlihat lewat
     jendelanya atau dari atas, kaca di sini cuma menghalangi. */
  function lemariPialaKadis(S) {
    const x0 = 364, x1 = 384, z0 = RK.z0, z1 = RK.z0 + 11, h = 40, jati = KAYU_TUA, zp = z0 + 5.5;
    kotak(S, x0 + 1.5, x1 - 1.5, 10, h - 2, z0, z0 + 1, warna('#26302f'), { sisi: SEMUA });
    kotak(S, x0, x0 + 1.5, 0, h, z0, z1, jati, { sisi: SEMUA });
    kotak(S, x1 - 1.5, x1, 0, h, z0, z1, jati, { sisi: SEMUA });
    kotak(S, x0, x1, h - 2, h, z0, z1, jati, { sisi: SEMUA, w: { atas: gelapkan(jati, 1.35) } });
    kotak(S, x0 + 1.5, x1 - 1.5, 0, 10, z0, z1 - 0.3, warna('#7a5638'), { sisi: SEMUA, w: { atas: warna('#c9d6d6') } });
    for (const kx of [372, 375]) kotak(S, kx, kx + 1.2, 4.5, 5.7, z1 - 0.3, z1 + 0.2, warna(P.gold), { sisi: SEMUA, e: 0.15 });
    for (const t of [20, 30]) kotak(S, x0 + 1.5, x1 - 1.5, t - 0.5, t, z0 + 1, z1 - 0.5, warna('#c9d6d6'), { sisi: SEMUA });
    piala3D(S, 373.5, 20, 9, P.gold, zp);
    kotak(S, 366.5, 372.5, 30, 37, zp, zp + 1.2, warna('#6d5535'), { sisi: SEMUA });            // plakat
    kotak(S, 367.5, 371.5, 32, 36, zp + 1.2, zp + 1.3, warna(P.gold), { sisi: S_DEPAN, e: 0.1 });
    piala3D(S, 377, 30, 7, '#c9ced1', zp);
  }
  const BOHLAM_GUDANG = () => [624, RUANG_GUDANG.h - 19, (RUANG_GUDANG.z0 + RUANG_GUDANG.z1) / 2];
  const LAMPU_WC = () => [12, RUANG_WC.h - 3, (RUANG_WC.z0 + RUANG_WC.z1) / 2 + 4];

  // Pintu terbuka selama bukaSampai; daunnya mengayun ke dalam, dilunakkan.
  function pintuTerbuka(D) { return now < D.keadaan().bukaSampai; }
  function ayunDaun(dt) {
    for (const D of Object.values(DAUN)) {
      const tuju = pintuTerbuka(D) ? 1.6 : 0;
      D.sudut += (tuju - D.sudut) * (geraKurang3.matches ? 1 : Math.min(1, Math.max(0, dt) * 9));
    }
  }
  // Muka bertekstur yang ikut diputar (daun pintu): sudut & normal lewat m.
  function mukaKulitM(S, m, x0, x1, y0, y1, z, uv, arahZ = 1) {
    const T = (x, y) => [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
    const n = norm3(m[2] * arahZ, m[6] * arahZ, m[10] * arahZ);
    if (arahZ > 0) S.segi(T(x0, y0), T(x1, y0), T(x1, y1), T(x0, y1), n, PUTIH, uv);
    else S.segi(T(x1, y0), T(x0, y0), T(x0, y1), T(x1, y1), n, PUTIH, [uv[2], uv[1], uv[0], uv[3]]);
  }
  function daunPintu(S, Sk, D, kulitDaun) {
    const L = D.L, lebar = L.x1 - L.x0, tinggi = L.y1 - L.y0;
    const m = A3.kali(A3.geser(L.x0, 0, ZD), A3.putarY(D.sudut));     // engsel di tepi kiri daun
    kotakM(S, m, 0, lebar, 0, tinggi, -0.6, 0.6, warna(D.punggung), 0, S_BELAKANG | S_KIRI | S_KANAN | S_ATAS);
    if (kulitDaun) mukaKulitM(Sk, m, 0, lebar, 0, tinggi, 0.6, kulitDaun.uv);
    else kotakM(S, m, 0, lebar, 0, tinggi, -0.6, 0.6, warna(D.punggung), 0, S_DEPAN);
  }

  /* Yang ke WC/gudang di simulasi cuma berdiri di ambang lalu memudar. Di 3D
     pudar itu diterjemahkan jadi LANGKAH: alpha 1→0 ('masuk') berarti dia
     sedang melangkah dari ambang ke dalam, 0→1 ('keluar') sedang melangkah
     keluar. Posisi simulasinya tidak disentuh — ini murni cara melihatnya.
     Gudang terbuka ke atas, jadi penghuninya tidak memudar: dia kelihatan
     meraih rak, lalu keluar membawa kardus yang baru diberikan simulasi
     sesudah dia sampai di ambang. */
  function tampilanKhusus(a) {
    const pudar = Math.max(0, Math.min(1, a.alpha == null ? 1 : a.alpha));
    if (a.tugasWC === 'masuk' || a.tugasWC === 'keluar') {
      const k = 1 - pudar;
      return { x: a.x, z: a.y - k * 28, jalan: k > 0.02 && k < 0.98 };
    }
    if (a.tugasGudang === 'masuk' || a.tugasGudang === 'keluar') {
      const k = 1 - pudar;
      return { x: a.x, z: a.y - k * 40, alfa: 1, jalan: k > 0.02 && k < 0.98, bawa: a.tugasGudang === 'keluar' ? 'kardus' : undefined };
    }
    if (a.tugasGudang === 'dalam') {
      const t = now / 1000 + (a.phase || 0);
      return { x: a.x + Math.sin(t * 0.45) * 9, z: RUANG_GUDANG.z0 + 17, alfa: 1, face: 'up',
        pose: Math.sin(t * 1.3) > 0.2 ? 'duaangkat' : 'diam' };
    }
    return null;
  }

  // --------------------------------------------------------------- kamera
  const KAM = {
    yaw: 0, pitch: 0.7, zoom: 1, sasaran: [W / 2, 22, (DINDING_Z + LANTAI_Z1) / 2 + 10],
    yawK: 0, pitchK: 0.7, jarakK: 700, sasaranK: [W / 2, 22, 240],
    fov: 30 * Math.PI / 180, dasar: 700,
    mata: [0, 0, 0], vp: new Float32Array(16), v: new Float32Array(16), p: new Float32Array(16),
    lebar: 1, tinggi: 1, geser: 0,
  };
  const KAM_AWAL = { yaw: 0, pitch: 0.7, zoom: 1, sasaran: [...KAM.sasaran] };

  // titik-titik yang harus masuk bingkai pada tampak awal
  const SUDUT_MAKET = [];
  for (const x of [-12, W + 12]) for (const z of [DINDING_Z - 8, LANTAI_Z1 + 8]) for (const y of [-14, TINGGI_DINDING + 4]) SUDUT_MAKET.push([x, y, z]);

  function matriksKamera(yaw, pitch, jarak, s) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const mata = [s[0] + Math.sin(yaw) * cp * jarak, s[1] + sp * jarak, s[2] + Math.cos(yaw) * cp * jarak];
    const v = M4.lihat(mata, s, [0, 1, 0]);
    const p = M4.perspektif(KAM.fov, KAM.lebar / KAM.tinggi, 8, jarak * 3 + 800);
    return { mata, v, p, vp: M4.kali(p, v) };
  }
  // jarak terdekat yang masih memuat seluruh maket (tampak awal, yaw 0)
  function hitungJarakDasar() {
    let lo = 200, hi = 3000;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      const { vp } = matriksKamera(0, KAM_AWAL.pitch, mid, KAM_AWAL.sasaran);
      let muat = true;
      for (const [x, y, z] of SUDUT_MAKET) {
        const c = M4.titik(vp, x, y, z);
        if (c[3] <= 0 || Math.abs(c[0] / c[3]) > 0.97 || Math.abs(c[1] / c[3]) > 0.94) { muat = false; break; }
      }
      if (muat) hi = mid; else lo = mid;
    }
    KAM.dasar = hi;
  }

  /* Bidikan: kamera 2D (tickKamera) tetap yang memutuskan KE MANA melihat —
     mode ikut, sinematik, klik barang, X-banner, bukaan ruang kadis. Di sini
     cuma diterjemahkan ke titik 3D. Tanpa bidikan, kembali ke tampak orang
     yang memegang tetikus. */
  function fokus3D() {
    const kotakKe = (b) => {
      const kaki = b.y + b.h;
      if (kaki <= FLOOR_TOP + 2) return [b.x + b.w / 2, FLOOR_TOP - (b.y + b.h / 2), DINDING_Z + 2];
      return [b.x + b.w / 2, b.h / 2, Math.min(kaki - 4, LANTAI_Z1)];
    };
    if (BANNER.zoom) return { titik: kotakKe(XBANNER), zoom: 3.2 };
    if (RUANG_KADIS.zoom) return { titik: kotakKe(SISIP), zoom: 3 };
    if (barangTerpilih) {
      const b = barangTerpilih;
      const K2 = barangKeRuangKadis(b) ? SISIP : b.kotak;
      return { titik: kotakKe(K2), zoom: Math.min(3.2, zoomBarang(K2) * 0.9) };
    }
    if (KAMERA.targetZoom > 1.01) {
      return { titik: [KAMERA.targetX, 16 * SKALA_ORANG, KAMERA.targetY + 13], zoom: KAMERA.targetZoom * 0.95 };
    }
    return null;
  }

  /* POV: klik seorang pegawai di 3D = melihat dari matanya. Kamera berdiri di
     depan wajah bonekanya — matriks kepala dari susunOrang, jadi ikut duduk,
     menoleh, terkantuk-kantuk, dan naik-turun waktu berjalan — memandang ke
     arah hadapnya; seret = menoleh di luar arah itu, roda = lebar pandang.
     Bonekanya sendiri tidak digambar selama kamera di dalam kepalanya.
     Selesai kalau kartunya ditutup (klik tempat kosong, ✕), Esc, tombol di
     pita bawah, atau orangnya pergi; klik orang lain yang kelihatan = pindah
     ke matanya. Peralihan maket <-> mata ±0,45 detik. */
  const POV = { orang: null, bekas: null, t: 0, lirikYaw: 0, lirikPitch: 0, otomatis: true, fov: 58 * Math.PI / 180 };
  const SUSUN_HAMPA = { sudut() {}, segi() {}, tri() {} };   // susunOrang tanpa geometri: cuma keadaannya yang maju
  function mulaiPov(a) {
    if (POV.orang !== a) { POV.lirikYaw = 0; POV.lirikPitch = 0; POV.otomatis = true; }
    POV.orang = a; POV.bekas = a;
    perbaruiHudPov();
  }
  function keluarPov() {
    if (!POV.orang) return;
    POV.orang = null;
    perbaruiHudPov();
  }
  // penghuni() itu generator (agents, peserta, standby), bukan larik
  function masihDiRuangan(a) {
    for (const o of penghuni()) if (o === a) return true;
    return false;
  }
  // Mata pegawai di dunia 3D, dari matriks kepala terbarunya (dihitung ulang
  // dengan dt 0: posisi sekarang, tanpa memajukan pelunakan hadap & duduknya)
  function mataOrang(a) {
    susunOrang(SUSUN_HAMPA, a, 0, 1, tampilanKhusus(a));
    const st = keadaanOrang.get(a), K = st && st.kepala;
    if (!K) return null;
    const mata = [K[1] * 21.2 + K[2] * 4.4 + K[3], K[5] * 21.2 + K[6] * 4.4 + K[7], K[9] * 21.2 + K[10] * 4.4 + K[11]];
    const depan = norm3(K[2], K[6], K[10]);
    return { mata, hadap: Math.atan2(depan[0], depan[2]), angguk: Math.asin(Math.max(-1, Math.min(1, depan[1]))) };
  }
  /* Ke mana matanya memang tertuju di luar hadap badannya, selama penonton
     belum menoleh sendiri: pegawai yang duduk di meja kerja menatap laptopnya
     di kanan depan (layar cx+13..cx+29, z 336) — bukan sekat meja lurus di
     depannya, yang membuat layarnya jatuh di luar bidang pandang. */
  function lirikOtomatis(a, mp) {
    if (a.station !== 'think' || (a.path && a.path.length) || Math.abs(a.y - MEJA_KERJA_Y) >= 3) return [0, 0];
    const dx = a.x + 21 - mp.mata[0], dz = 336 - mp.mata[2], dy = MEJA_H + 7.5 - mp.mata[1];
    return [Math.atan2(dx, dz) - mp.hadap, Math.atan2(dy, Math.hypot(dx, dz)) - mp.angguk + 0.1];
  }

  function tickKamera3D(dt) {
    ukurKanvas();
    const f = fokus3D();
    const sasaran = f ? f.titik : KAM.sasaran;
    const jarak = KAM.dasar / (f ? Math.max(KAM.zoom, f.zoom) : KAM.zoom);
    // dt dijepit >= 0: pelunakan dengan k negatif menjauh dari tujuan dan meledak
    const k = geraKurang3.matches ? 1 : 1 - Math.exp(-Math.max(0, dt) * 7);
    KAM.yawK += (KAM.yaw - KAM.yawK) * k;
    KAM.pitchK += (KAM.pitch - KAM.pitchK) * k;
    KAM.jarakK += (jarak - KAM.jarakK) * k;
    for (let i = 0; i < 3; i++) KAM.sasaranK[i] += (sasaran[i] - KAM.sasaranK[i]) * k;
    const s = [...KAM.sasaranK];
    if (MOD.getar) s[1] += Math.sin(now / 40) * MOD.getar * 0.9;   // getaran genset/gempa
    const m = matriksKamera(KAM.yawK, KAM.pitchK, KAM.jarakK, s);

    // POV menyatu dengan kamera maket lewat POV.t (0 = maket, 1 = mata)
    if (POV.orang && (terpilih !== POV.orang || !masihDiRuangan(POV.orang))) keluarPov();
    const tuju = POV.orang ? 1 : 0;
    POV.t = geraKurang3.matches ? tuju : POV.t + Math.max(-dt * 2.2, Math.min(dt * 2.2, tuju - POV.t));
    const siapa = POV.orang || POV.bekas, mp = POV.t > 0 && siapa ? mataOrang(siapa) : null;
    if (!mp) {
      if (POV.t <= 0) POV.bekas = null;
      KAM.mata = m.mata; KAM.v = m.v; KAM.p = m.p; KAM.vp = m.vp;
      return;
    }
    if (POV.otomatis) {
      const [ly, lp] = lirikOtomatis(siapa, mp), kl = geraKurang3.matches ? 1 : 1 - Math.exp(-Math.max(0, dt) * 3);
      POV.lirikYaw += Math.atan2(Math.sin(ly - POV.lirikYaw), Math.cos(ly - POV.lirikYaw)) * kl;
      POV.lirikPitch += (lp - POV.lirikPitch) * kl;
    }
    const h = mp.hadap + POV.lirikYaw, p = Math.max(-1.1, Math.min(0.9, mp.angguk - 0.1 + POV.lirikPitch));
    const arah = [Math.sin(h) * Math.cos(p), Math.sin(p), Math.cos(h) * Math.cos(p)];
    const e = POV.t * POV.t * (3 - 2 * POV.t);
    const antara = (a, b) => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
    const mata = antara(m.mata, mp.mata);
    const lihat = antara(s, [mp.mata[0] + arah[0] * 40, mp.mata[1] + arah[1] * 40, mp.mata[2] + arah[2] * 40]);
    KAM.mata = mata;
    KAM.v = M4.lihat(mata, lihat, [0, 1, 0]);
    KAM.p = M4.perspektif(KAM.fov + (POV.fov - KAM.fov) * e, KAM.lebar / KAM.tinggi,
      8 + (0.5 - 8) * e, (KAM.jarakK * 3 + 800) * (1 - e) + 1600 * e);
    KAM.vp = M4.kali(KAM.p, KAM.v);
  }

  let lebarCss = 0, tinggiCss = 0, dprPakai = 1;
  function ukurKanvas() {
    const w = stageInner.clientWidth, h = stageInner.clientHeight;
    const dpr = Math.min(ringanAktif() ? 1 : 2, window.devicePixelRatio || 1);
    if (w === lebarCss && h === tinggiCss && dpr === dprPakai) return;
    lebarCss = w; tinggiCss = h; dprPakai = dpr;
    kanvas.width = Math.max(1, Math.round(w * dpr));
    kanvas.height = Math.max(1, Math.round(h * dpr));
    KAM.lebar = kanvas.width; KAM.tinggi = kanvas.height;
    hitungJarakDasar();
  }

  // ---------------------------------------------- proyeksi titik 2D → layar
  /* Pegawai yang garis kakinya persis (x, kaki) — balon dan kartunya diukur
     dari tinggi sprite 2D, jadi di 3D tingginya ikut dikali SKALA_ORANG.
     Barang tidak: perabot 3D setinggi perabot 2D-nya. Dicocokkan ke posisi
     SAAT DITANYA, bukan potret awal frame: balon dihitung sesudah pegawainya
     melangkah, jadi potret akan meleset untuk setiap orang yang berjalan. */
  function orangDi(x, kaki) {
    for (const a of penghuni()) if (a.x === x && a.y === kaki) return a;
    return null;
  }
  // Kaki pegawai di dunia 3D: koordinat lantai apa adanya; yang di dalam ruang
  // kadis (koordinat bukaan) dipetakan ke ruangan di balik dinding.
  function posisiOrang(a) {
    if ((a.diKadis || a === kadisNpc) && KADIS_SIAP) return [a.x, kadisZ(a.y)];
    const ganti = tampilanKhusus(a);
    return ganti ? [ganti.x, ganti.z] : [a.x, a.y];
  }
  function titik3D(x, y, kaki) {
    const a = orangDi(x, kaki);
    if (a) { const [X, Z] = posisiOrang(a); return [X, (kaki - y) * SKALA_ORANG, Z]; }
    if (kaki <= FLOOR_TOP) return [x, FLOOR_TOP - y, DINDING_Z + 1];
    return [x, kaki - y, kaki];
  }
  function proyeksi(x, y, z) {
    const c = M4.titik(KAM.vp, x, y, z);
    if (c[3] <= 0.001) return null;
    return [(c[0] / c[3] * 0.5 + 0.5) * lebarCss, (1 - (c[1] / c[3] * 0.5 + 0.5)) * tinggiCss, c[2] / c[3]];
  }
  function keLayar3D(x, y, kaki) {
    // POV: kartu orang yang matanya dipakai kamera diparkir di tepi kiri,
    // bukan di tengah pandangannya sendiri
    if (POV.t > 0.5 && POV.orang && orangDi(x, kaki) === POV.orang) return [16, tinggiCss * 0.5];
    const [X, Y, Z] = titik3D(x, y, kaki);
    const p = proyeksi(X, Y, Z);
    return p ? [p[0], p[1]] : [-9999, -9999];
  }
  function tampak3D(x, y) {
    const a = orangDi(x, y);
    if (a && a === POV.orang && POV.t > 0.5) return false;     // balonnya sendiri: dia kameranya
    const [X, Z] = a ? posisiOrang(a) : [x, y];
    const p = proyeksi(X, (a ? SKALA_ORANG : 1) * 28, Z);
    return !!p && p[0] > -40 && p[0] < lebarCss + 40 && p[1] > -40 && p[1] < tinggiCss + 40 && p[2] < 1;
  }

  // ------------------------------------------------------------- cahaya
  const ARAH_KUNCI = norm3(-0.34, 0.9, 0.62);   // dari kiri-atas-depan: bayangan jatuh ke kanan-belakang
  // 16 lampu titik: xyz + redaman per lampu (lampu ruangan menjangkau jauh, lampu meja cuma mejanya)
  const CAHAYA = { langit: [0.8, 0.8, 0.78], tanah: [0.6, 0.6, 0.58], kunci: [0.4, 0.39, 0.36], lampuPos: new Float32Array(64), lampuWarna: new Float32Array(48) };
  const REDAM_RUANGAN = 0.00016, REDAM_MEJA = 0.025;
  function pasangLampu(i, x, y, z, r, g, b, redam = REDAM_RUANGAN) {
    CAHAYA.lampuPos[i * 4] = x; CAHAYA.lampuPos[i * 4 + 1] = y; CAHAYA.lampuPos[i * 4 + 2] = z; CAHAYA.lampuPos[i * 4 + 3] = redam;
    CAHAYA.lampuWarna[i * 3] = r; CAHAYA.lampuWarna[i * 3 + 1] = g; CAHAYA.lampuWarna[i * 3 + 2] = b;
  }
  // lampu meja yang menyala (meja terpakai, bukan meja padam) — diisi susunDinamis,
  // dibaca hitungCahaya frame berikutnya
  const LAMPU_MEJA = MEJA_KERJA_X.map(() => 0);
  const LAMPU_Z = 150, LAMPU_Y = 97;
  function hitungCahaya() {
    const A = ambien();
    const siang = Math.max(0, Math.min(1, A.luar));
    const amb = warna(A.amb);
    const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    // siang: terang netral; malam: kebiruan temaram — selubung ambA 2D
    // diterjemahkan jadi pengali cahaya, bukan lapisan warna di atas gambar
    let langit = lerp3([0.34, 0.38, 0.52], [0.84, 0.84, 0.82], siang);
    let tanah = lerp3([0.22, 0.24, 0.32], [0.62, 0.62, 0.6], siang);
    const redup = Math.min(0.6, A.ambA);
    const tint = [amb[0] * 1.6 + 0.2, amb[1] * 1.6 + 0.2, amb[2] * 1.6 + 0.2];
    langit = lerp3(langit, [langit[0] * tint[0], langit[1] * tint[1], langit[2] * tint[2]], redup);
    tanah = lerp3(tanah, [tanah[0] * tint[0], tanah[1] * tint[1], tanah[2] * tint[2]], redup);
    const lampu = A.lampu;
    let kunci = lerp3([0.3, 0.29, 0.25], [0.44, 0.43, 0.4], siang);
    kunci = kunci.map((v) => v * (0.55 + 0.45 * Math.max(siang, Math.min(1, MOD.lampu))));
    if (kilat > 0) { langit = langit.map((v) => v + 0.55 * kilat); tanah = tanah.map((v) => v + 0.35 * kilat); }
    CAHAYA.langit = langit; CAHAYA.tanah = tanah; CAHAYA.kunci = kunci;
    for (let i = 0; i < 3; i++) {
      const cx = NEON_X[i];
      const nyala = cx == null ? 0 : kedipNeon(i) * (0.25 + 0.75 * lampu);
      pasangLampu(i, cx == null ? 0 : cx, LAMPU_Y - 4, LAMPU_Z + 20, 0.34 * nyala, 0.32 * nyala, 0.26 * nyala);
    }
    // lampu keempat: lampu gantung kantor kadis. Ruangan itu ada di bayangan
    // tembok bersama, jadi tanpa lampunya sendiri dia cuma kotak gelap.
    // Cahayanya juga yang merembes sedikit lewat jendela ke ruang utama.
    const kadis = KADIS_SIAP && sisipBoleh() ? 0.7 + 0.3 * lampu : 0;
    pasangLampu(3, KADIS_LAMPU.x, KADIS_LAMPU.y - 6, KADIS_LAMPU.z, 0.5 * kadis, 0.44 * kadis, 0.32 * kadis);
    // lampu kelima & keenam: lampu WC (putih dingin) dan bohlam gudang (kuning),
    // menyala selama ada orangnya atau pintunya terbuka
    const wc = wcTerisi() || pintuTerbuka(DAUN.wc) ? 1 : 0;
    const gd = gudangTerisi() || pintuTerbuka(DAUN.gudang) ? 1 : 0;
    const [wx, wy, wz] = LAMPU_WC(), [bx, by, bz] = BOHLAM_GUDANG();
    pasangLampu(4, wx, wy - 4, wz, 0.42 * wc, 0.46 * wc, 0.5 * wc);
    pasangLampu(5, bx, by, bz, 0.5 * gd, 0.42 * gd, 0.26 * gd);
    /* lampu ketujuh dst.: lampu meja kerja, kuning hangat dan berjangkauan
       pendek — menerangi papan meja, laptop, dan wajah pegawainya, bukan
       ruangan. Siang nyaris tak terasa; malam (lembur) jadi genangan hangat. */
    MEJA_KERJA_X.forEach((cx, i) => {
      const n = LAMPU_MEJA[i] * (0.15 + 0.85 * lampu);
      pasangLampu(6 + i, cx - 28.5, MEJA_H + 6.5, 335.5, 0.9 * n, 0.72 * n, 0.42 * n, REDAM_MEJA);
    });
    MALAM.lampu = lampu;
  }
  const MALAM = { lampu: 0 };      // 0 siang .. 1 malam, dari ambien() — dipakai genangan lampu meja

  // --------------------------------------------------------- peta bayangan
  const PETA_N = 2048;
  const PETA = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, PETA);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, PETA_N, PETA_N);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const FB_BAYANG = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, FB_BAYANG);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, PETA, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // Kamera cahaya ortografis yang memeluk seluruh maket
  const CAHAYA_VP = (() => {
    const pusat = [W / 2, 40, (DINDING_Z + LANTAI_Z1) / 2];
    const mata = [pusat[0] + ARAH_KUNCI[0] * 600, pusat[1] + ARAH_KUNCI[1] * 600, pusat[2] + ARAH_KUNCI[2] * 600];
    const v = M4.lihat(mata, pusat, [0, 0, -1]);
    let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity, n = Infinity, f = -Infinity;
    // z mulai di belakang ruang kadis: tembok bersama ikut membayangi ruangan itu
    for (const x of [-16, W + 16]) for (const y of [-16, TINGGI_DINDING + 30]) for (const z of [RK.z0 - 10, LANTAI_Z1 + 12]) {
      const c = M4.titik(v, x, y, z);
      l = Math.min(l, c[0]); r = Math.max(r, c[0]); b = Math.min(b, c[1]); t = Math.max(t, c[1]);
      n = Math.min(n, -c[2]); f = Math.max(f, -c[2]);
    }
    return M4.kali(M4.orto(l, r, b, t, n - 10, f + 10), v);
  })();

  // ---------------------------------------------------------- pegawai 3D
  const keadaanOrang = new WeakMap();   // per pegawai: yaw halus, duduk halus
  const TURUN_DUDUK = 8.5 - 8 / SKALA_ORANG;   // pinggul lokal 8.5 → dudukan dunia 8
  const YAW = { down: 0, up: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 };
  const sudutLengan = (lift) => Math.max(-0.35, Math.min(1, -lift / 9)) * 2.5;

  /* ganti: tampilan pengganti dari tampilanKhusus() (posisi, hadap, langkah,
     pose, barang bawaan) — dipakai tanpa pernah menulis ke objek simulasinya. */
  function susunOrang(S, a, dt, alfa, ganti = null) {
    if (alfa <= 0.02) return;
    // Yang menghadap kadis berdiri di koordinat bukaan; di 3D dia ada di
    // ruangan sungguhan di balik dinding (posisiOrang memetakannya).
    const diRuangKadis = a.diKadis || a === kadisNpc;
    if (diRuangKadis && !KADIS_SIAP) return;
    const [px, pz] = ganti ? [ganti.x, ganti.z] : posisiOrang(a);
    const wajah = ganti && ganti.face ? ganti.face : a.face;
    const poseNama = ganti && ganti.pose !== undefined ? ganti.pose : a.pose;
    const bawaNama = ganti && ganti.bawa !== undefined ? ganti.bawa : a.bawa;
    let st = keadaanOrang.get(a);
    if (!st) { st = { yaw: YAW[wajah] || 0, duduk: 0 }; keadaanOrang.set(a, st); }
    // hadap: berbelok halus, lewat sudut terpendek
    const tujuan = YAW[wajah] == null ? st.yaw : YAW[wajah];
    let beda = tujuan - st.yaw;
    while (beda > Math.PI) beda -= Math.PI * 2;
    while (beda < -Math.PI) beda += Math.PI * 2;
    st.yaw += beda * (geraKurang3.matches ? 1 : Math.min(1, dt * 14));

    const p = a.pal;
    const rc = a.mesin ? seragamCabang(a.mesin) : null;
    const t = a.phase;
    const jalan = ganti && ganti.jalan != null ? ganti.jalan : a.state === 'walk';
    const kerja = !jalan && poseKerja(a);
    // duduk: kursi rapat (turunDuduk), kursi meja kerja, lesehan pojok baca
    const dudukRapat = a.station === 'rapat' && !jalan ? turunDuduk(a) / (DUDUK_PX * DUDUK_FRAME) : 0;
    const dudukMeja = a.station === 'think' && !a.path.length && !a.antre && !a.butuh && Math.abs(a.y - MEJA_KERJA_Y) < 3 ? 1 : 0;
    // di ruang kadis cuma kadisnya yang duduk. Tamu BERDIRI melapor di depan
    // kursinya — adatnya memang begitu, dan kepala orang duduk (±33) tenggelam
    // di bawah ambang jendela (35): dari ruang utama dia tidak akan kelihatan.
    const dudukKadis = a === kadisNpc ? 1 : 0;
    const lesehan = poseNama === 'dudukLantai' ? 1 : 0;
    const tujuanDuduk = Math.max(dudukRapat, dudukMeja, dudukKadis);
    st.duduk += (tujuanDuduk - st.duduk) * (geraKurang3.matches ? 1 : Math.min(1, dt * 9));
    const duduk = lesehan ? 0 : st.duduk;

    let ayun = 0, bob = 0, angkatL = 0, angkatR = 0;
    let lenganL = 0, lenganR = 0;
    if (jalan) {
      const s = Math.sin(t * 10);
      ayun = s;
      bob = Math.abs(s) > 0.72 ? 0.8 : 0;
      angkatL = Math.max(0, s); angkatR = Math.max(0, -s);
      lenganL = -s * 0.5; lenganR = s * 0.5;
    } else if (kerja) {
      bob = Math.sin(t * 4) > 0.85 ? 0.6 : 0;
    } else if (!a.tegak) {
      bob = Math.sin(t * 1.7) > 0.6 ? 0.5 : 0;
    }
    if (a.stamina != null && a.stamina < STAMINA_LELAH) bob -= 0.8;
    const pose = a.butuh ? { l: -6, r: -6 } : poseNama ? posEvent({ pose: poseNama, phase: t }) : (kerja ? workArms(a) : null);
    if (pose) { lenganL = sudutLengan(pose.l); lenganR = sudutLengan(pose.r); }

    // dasar: kaki di (x, 0, z) dunia (tamu event yang memanjat: terangkat),
    // badan menghadap +z lokal, diskalakan
    let dasar = A3.geser(px, a.angkat || 0, pz);
    if (a.rebah) dasar = A3.kali(dasar, A3.putarZ(-a.rebah));
    dasar = A3.kali(dasar, A3.kali(A3.putarY(st.yaw), A3.skala(SKALA_ORANG)));
    if (a.miring) dasar = A3.kali(dasar, A3.putarZ(-0.18));

    const c = (hex) => warna(hex, alfa);
    const kulitC = c(p.skin), bajuC = c(p.main), celanaC = c(p.pants);
    // Pinggul turun ke dudukan kursi (DUDUKAN_Y dunia = 8.5 - TURUN_DUDUK lokal
    // dikali SKALA_ORANG) dan mundur sepanjang paha: kaki 2D-nya (a.x, a.y)
    // tetap di tempat, badan yang duduk di atas kursi di belakangnya.
    const pinggul = 8.5 - TURUN_DUDUK * duduk - (lesehan ? 6.9 : 0) + bob * 0.3;
    const mundur = -4 * duduk;
    const badan = A3.kali(dasar, A3.geser(0, pinggul - 8.5, mundur));

    // --- kaki: paha dari pinggul, betis dari lutut; duduk = paha mendatar
    const alas = c(a.sandal ? SANDAL : SEPATU);
    for (const [sisi, angkat, ayunKaki] of [[-1, angkatL, ayun], [1, angkatR, -ayun]]) {
      const hx = sisi * 2.3;
      const sudutPaha = jalan ? ayunKaki * 0.55 : (lesehan ? 1.5 : duduk * 1.5);
      const sudutLutut = jalan ? angkat * 0.7 : (lesehan ? 2.9 : duduk * 1.5);   // lesehan: betis terlipat di bawah paha
      const paha = A3.kali(badan, A3.poros(hx, 8.5, 0, A3.putarX(-sudutPaha)));
      kotakM(S, paha, hx - 1.5, hx + 1.5, 4.5, 8.8, -1.5, 1.5, celanaC);
      const betis = A3.kali(paha, A3.poros(hx, 4.5, 0, A3.putarX(sudutLutut)));
      kotakM(S, betis, hx - 1.45, hx + 1.45, 1.6, 4.6, -1.45, 1.45, celanaC);
      kotakM(S, betis, hx - 1.6, hx + 1.6, 0, 1.7, -1.8, 2.9, alas);
    }

    // --- badan
    const tubuh = A3.kali(badan, A3.putarX(poseNama === 'jongkok' ? 0.25 : 0));
    const sabuk = c(sh(p.pants, 0.7));
    kotakM(S, tubuh, -4.4, 4.4, 8, 9, -2.3, 2.3, sabuk);
    kotakM(S, tubuh, -0.8, 0.8, 8.1, 8.9, 2.3, 2.55, c(P.gold), 0.2);
    const kainBadan = rc ? c(rc.rompi) : bajuC;
    kotakM(S, tubuh, -4.3, 4.3, 9, 16, -2.2, 2.2, bajuC);
    if (rc) {
      kotakM(S, tubuh, -4.5, -2.4, 9.2, 15.8, -2.4, 2.4, kainBadan);
      kotakM(S, tubuh, 2.4, 4.5, 9.2, 15.8, -2.4, 2.4, kainBadan);
      kotakM(S, tubuh, -4.5, -2.6, 14.2, 15, 2.35, 2.6, c(rc.pangkat), 0.3);
      kotakM(S, tubuh, 2.6, 4.5, 14.2, 15, 2.35, 2.6, c(rc.pangkat), 0.3);
    }
    if (p.seragam === 'ob') {
      const O = SERAGAM_PETUGAS.ob;
      kotakM(S, tubuh, -4.4, 4.4, 13, 16.1, -2.3, 2.3, c(O.yoke));
      kotakM(S, tubuh, -4.45, 4.45, 12.6, 13, -2.35, 2.35, c(O.piping));
    } else if (p.seragam === 'satpam') {
      const SP = SERAGAM_PETUGAS.satpam;
      kotakM(S, tubuh, -4.3, -2.3, 15.9, 16.3, -2, 2, c(SP.tali));
      kotakM(S, tubuh, 2.3, 4.3, 15.9, 16.3, -2, 2, c(SP.tali));
      kotakM(S, tubuh, -3.4, -1.2, 12.6, 13.4, 2.2, 2.4, c(SP.papanNama));
      kotakM(S, tubuh, 1.2, 3.4, 12.6, 13.4, 2.2, 2.4, c(SP.tanda));
      kotakM(S, tubuh, -3, -2.2, 11.4, 12.2, 2.2, 2.45, c(SP.lencana), 0.3);
    } else if (!p.pattern) {
      // lidah bahu PNS
      kotakM(S, tubuh, -4.3, -2.3, 15.9, 16.3, -1.8, 1.8, c(sh(p.main, 0.62)));
      kotakM(S, tubuh, 2.3, 4.3, 15.9, 16.3, -1.8, 1.8, c(sh(p.main, 0.62)));
    }
    if (p.pattern && !p.seragam) {
      // motif batik: titik-titik tetap di dada & punggung
      const pc = c(p.pattern);
      for (let i = 0; i < 7; i++) {
        const bx = -3.4 + ((i * 3) % 7) * 1.05, by = 9.6 + ((i * 5) % 6) * 1.05;
        kotakM(S, tubuh, bx, bx + 0.8, by, by + 0.8, 2.2, 2.35, pc);
        kotakM(S, tubuh, -bx - 0.8, -bx, by, by + 0.8, -2.35, -2.2, pc);
      }
    }
    if (!p.seragam) {
      kotakM(S, tubuh, -1.2, 1.2, 15.1, 16, 2.2, 2.45, c(sh(p.main, 0.8)));        // kerah
      for (const by of [10.2, 12.2, 14.2]) kotakM(S, tubuh, -0.3, 0.3, by, by + 0.6, 2.2, 2.4, c(garisTepi(p.main)));
    }

    // --- lengan: poros di bahu, diayun maju (sumbu x lokal)
    const lenganKain = p.seragam === 'ob' ? c(SERAGAM_PETUGAS.ob.yoke) : bajuC;
    const lengan = (sisi, sudut) => {
      const lx = sisi * 5.4;
      const m = A3.kali(tubuh, A3.poros(lx, 15.4, 0, A3.putarX(-sudut)));
      const pendek = p.seragam ? 4 : 6;
      kotakM(S, m, lx - 1.05, lx + 1.05, 15.4 - pendek, 16.2, -1.05, 1.05, lenganKain);
      if (pendek < 6) kotakM(S, m, lx - 0.95, lx + 0.95, 9.4, 15.4 - pendek, -0.95, 0.95, kulitC);
      if (p.seragam === 'satpam') kotakM(S, m, lx - 1.1, lx + 1.1, 14.2, 15, -1.1, 1.1, c(SERAGAM_PETUGAS.satpam.emblem));
      kotakM(S, m, lx - 0.95, lx + 0.95, 7.4, 9.4, -0.95, 0.95, kulitC);
      return m;
    };
    const mL = lengan(-1, lenganL);
    const mR = lengan(1, lenganR);

    // --- barang di tangan
    if (a.butuh) {
      kotakM(S, tubuh, -4.8, 4.8, 9.8, 16.2, 2.6, 3.4, c('#e8a0a8'));                 // map disposisi
      kotakM(S, tubuh, 1.2, 3.8, 11.2, 13.8, 3.4, 3.6, c('#c03030'), 0.2);             // cap merah
    } else if (bawaNama) {
      barangBawaan(S, mR, bawaNama, c);
    } else if (kerja) {
      alatKerja(S, a, mL, mR, tubuh, c);
    }

    // --- kepala
    const ngantuk = a.ngantuk || 0;
    const kepala = A3.kali(tubuh, A3.poros(0, 16.5, 0, A3.putarX(ngantuk * 0.12)));
    st.kepala = kepala;                                   // mata kamera POV (mataOrang)
    const jenisKepala = kepalaEfektif(a);
    kotakM(S, kepala, -1, 1, 16, 17.2, -1, 1, kulitC);                                  // leher
    kotakM(S, kepala, -4, 4, 17, 25, -3.5, 3.5, kulitC);
    const mata = c('#1b1712');
    const kedip = sedangKedip(a);
    const yMata = kedip ? 21 : 20.5, tMata = kedip ? 0.4 : 1.5;
    kotakM(S, kepala, -2.6, -1.4, yMata, yMata + tMata, 3.5, 3.75, mata);
    kotakM(S, kepala, 1.4, 2.6, yMata, yMata + tMata, 3.5, 3.75, mata);
    kotakM(S, kepala, -1, 1, 18.6, 19.1, 3.5, 3.6, c(sh(p.skin, 0.72)));              // mulut
    if (p.kacamata) {
      const kc = c(KACAMATA);
      kotakM(S, kepala, -3.2, -0.8, 22.2, 22.6, 3.55, 3.85, kc);
      kotakM(S, kepala, 0.8, 3.2, 22.2, 22.6, 3.55, 3.85, kc);
      kotakM(S, kepala, -3.2, -0.8, 19.9, 20.2, 3.55, 3.85, kc);
      kotakM(S, kepala, 0.8, 3.2, 19.9, 20.2, 3.55, 3.85, kc);
      kotakM(S, kepala, -0.8, 0.8, 21.6, 21.9, 3.55, 3.85, kc);
    }
    if (p.kumis && jenisKepala !== 'jilbab') kotakM(S, kepala, -1.7, 1.7, 19.2, 19.9, 3.5, 3.8, c(KUMIS));
    if (jenisKepala === 'jilbab') {
      const jc = c(jilbabWarna(p));
      kotakM(S, kepala, -4.7, 4.7, 24, 26.9, -4.1, 4.1, jc);
      kotakM(S, kepala, -4.7, 4.7, 16.4, 24, -4.1, -2.6, jc);
      kotakM(S, kepala, -4.7, -3.2, 16.4, 24, -2.6, 4.1, jc);
      kotakM(S, kepala, 3.2, 4.7, 16.4, 24, -2.6, 4.1, jc);
      kotakM(S, kepala, -4.7, 4.7, 15.6, 17.6, -3.6, 4.1, jc);
      kotakM(S, tubuh, -5.1, 5.1, 13.4, 16.1, -2.8, 2.9, jc);                           // juntaian di bahu
      kotakM(S, tubuh, -0.4, 0.4, 14.3, 15.1, 2.9, 3.1, c(P.gold), 0.3);              // jarum emas
    } else if (jenisKepala === 'peci') {
      kotakM(S, kepala, -4.25, 4.25, 24.4, 28.2, -3.65, 3.65, c(PECI.isi));
      kotakM(S, kepala, -4.3, 4.3, 24.4, 25.1, -3.7, 3.7, c(PECI.pita));
      kotakM(S, kepala, -4.4, 4.4, 20, 24.4, -3.8, -2.8, c(rambutWarna(p)));
    } else if (jenisKepala === 'topi') {
      const T = TOPI_SATPAM;
      kotakM(S, kepala, -4.45, 4.45, 24.2, 27.8, -3.85, 3.85, c(T.isi));
      kotakM(S, kepala, -3.6, 3.6, 24.2, 24.9, 3.6, 6.4, c(T.lidah));
      kotakM(S, kepala, -0.7, 0.7, 25.6, 26.8, 3.85, 4, c(T.monogram), 0.3);
      kotakM(S, kepala, -4.4, 4.4, 20, 24.2, -3.8, -2.8, c(rambutWarna(p)));
    } else {
      const rb = c(rambutWarna(p));
      kotakM(S, kepala, -4.4, 4.4, 23.6, 26.4, -3.9, 3.9, rb);
      kotakM(S, kepala, -4.4, 4.4, 18.4, 23.6, -3.9, -2.7, rb);
      kotakM(S, kepala, -4.4, -3.9, 21, 23.6, -2.7, 1.8, rb);
      kotakM(S, kepala, 3.9, 4.4, 21, 23.6, -2.7, 1.8, rb);
      kotakM(S, kepala, -4.4, 1.6, 23.2, 24.2, 3.5, 3.95, rb);                         // poni
    }
  }

  const BAWAAN = {
    map: ['#d9b96a', 5.5, 4.5, 1.2], 'map-pink': ['#e8a0a8', 5.5, 4.5, 1.2], 'map-hijau': ['#4f8a56', 5.5, 4.5, 1.2],
    'map-merah': ['#b03030', 5.5, 4.5, 1.2], 'map-biru': ['#3565b0', 5.5, 4.5, 1.2], 'map-kuning': ['#c9a03a', 5.5, 4.5, 1.2],
    gelas: ['#f2f0e6', 2.4, 3.2, 2.4], teko: ['#c9cdd1', 4, 4, 3.5], botol: ['#8f2626', 2.4, 5, 2.4],
    kardus: ['#b98d5e', 6.5, 5.5, 5], hp: ['#20242c', 2, 3.5, 0.6], kertas: [P.paper, 5, 5.5, 0.4],
    sapu: ['#8a6844', 0.8, 13, 0.8], amplop: ['#f2f0e6', 5.5, 3.5, 0.4], laptop: ['#9aa1a6', 6.5, 0.8, 5],
    toner: ['#20242c', 5, 4, 3], jerigen: ['#d8b23a', 4, 5.5, 3], apar: ['#b02a2a', 3.4, 6.5, 3.4], ember: ['#4a7fd0', 4.8, 4.2, 4.8],
    lap: ['#e8e4d4', 4, 3, 1], papan: ['#8a6844', 4.5, 5.5, 0.6], boks: ['#b98d5e', 5.5, 4, 4], 'amplop-coklat': ['#a37b4e', 5, 3.5, 0.5],
    koper: ['#4a3626', 4.5, 3.8, 2], buku: ['#2f4f7a', 4.8, 5, 1.4], senter: ['#2b2f35', 1.4, 4.5, 1.4],
    obeng: ['#b9c0ca', 0.8, 5.5, 0.8],      // teknisi AC di anak tangga (bukan a.bawa 2D: dititipkan model event-nya)
    kantong: ['#e8ece8', 4.5, 5.5, 3.5],    // kresek ojol (model event)
  };
  function barangBawaan(S, mR, jenis, c) {
    const b = BAWAAN[jenis];
    if (!b) return;
    const [col, w, h, d] = b;
    const hx = 5.4;
    kotakM(S, mR, hx - w / 2, hx + w / 2, 8.2 - h / 2, 8.2 + h / 2, 1 - d / 2, 1 + d / 2, c(col));
  }
  function alatKerja(S, a, mL, mR, tubuh, c) {
    switch (a.station) {
      case 'read': kotakM(S, tubuh, -4.6, 4.6, 11, 16.6, 2.8, 3.4, c('#d9b96a')); break;
      case 'edit': {
        const naik = Math.sin(a.phase * 7) > 0 ? 2.5 : 0;
        kotakM(S, mR, 4.6, 6.2, 5.4 + naik, 8.4 + naik, 0.4, 2, c('#33261c'));
        break;
      }
      case 'agent': kotakM(S, mL, -8.2, -2.8, 6.8, 11.2, 0.5, 1.5, c('#e8a0a8')); break;
      case 'search': kotakM(S, mR, 4.4, 6.4, 5.2, 7.2, 1, 1.4, c('#8b98a6'), 0.2); break;
      case 'rapat':
        if (a.face !== 'up' && a.slot % 2 === 0) kotakM(S, tubuh, 3.4, 8.8, 9.8, 10.4, 3.2, 7.2, c(P.paper));
        break;
    }
  }

  // ------------------------------------------------------ benda dinamis
  function susunDinamis(stasiun, dt) {
    const S = G.dinamis;
    S.kosongkan();
    // grup tembus pandang dikosongkan paling awal: uap AC dan genangan lampu
    // meja menulis ke grup sinar jauh sebelum pegawai & partikel ke grup pudar
    G.pudar.kosongkan();
    G.sinar.kosongkan();

    // Dinding samping: rendah kalau kamera ada di baliknya (maket dipotong).
    // Grup sendiri yang tidak ikut lintasan bayangan — dinding setinggi 110
    // dengan cahaya dari kiri akan menggelapkan pintu WC dan lemari arsip.
    G.samping.kosongkan();
    dindingSamping(G.samping, -6, 0, KAM.mata[0] < -4);
    dindingSamping(G.samping, W, W + 6, KAM.mata[0] > W + 4);
    if (POV.t > 0) tutupMaketPov(G.samping);
    WADAH.samping.isi(G.samping);

    // pajangan dinding yang bergerak: sirip AC, lensa CCTV
    acSplit(S);
    kubahCCTV(S, dt);

    // lampu neon gantung: tabung menyala sesuai kedipNeon
    NEON_X.forEach((cx, i) => {
      const fl = kedipNeon(i);
      kotak(S, cx - 14.5, cx - 13.5, LAMPU_Y + 3, TINGGI_DINDING + 2, LAMPU_Z - 0.5, LAMPU_Z + 0.5, warna('#8b8f86'), { sisi: SEMUA });
      kotak(S, cx + 13.5, cx + 14.5, LAMPU_Y + 3, TINGGI_DINDING + 2, LAMPU_Z - 0.5, LAMPU_Z + 0.5, warna('#8b8f86'), { sisi: SEMUA });
      kotak(S, cx - 20, cx + 20, LAMPU_Y + 2, LAMPU_Y + 4, LAMPU_Z - 3, LAMPU_Z + 3, warna('#b9bcb2'), { sisi: SEMUA });
      kotak(S, cx - 18, cx + 18, LAMPU_Y, LAMPU_Y + 2, LAMPU_Z - 1.6, LAMPU_Z + 1.6, campur(warna('#6b6e66'), warna('#fbfcf3'), Math.min(1, fl)), { sisi: SEMUA, e: fl });
    });

    // kursi rapat: 7 sisi jauh (ada yang digeser/dipinjam/rusak), 2 sisi dekat
    for (let k = 0; k < KURSI_N; k++) {
      if (k === RUANGAN.kursiDipinjam) continue;
      const kx = RAPAT.cx + slotKe(k);
      const geser = RUANGAN.geserKursi[k] || 0;
      kursi(S, kx, 187 - geser, 1, RUANGAN.kursiRusak.has(k));
    }
    // Kursi kosong yang berputar sendiri (event): di 2D sandarannya cuma
    // menyempit-melebar; di sini kursi sisi dekat pertama sungguh berputar dua
    // kali sambil melambat, berhenti di arah semula
    const putarSendiri = eventHidup.find((E) => E.def.id === 'kursi-kosong-berputar-sendiri');
    KURSI_DEKAT.forEach((kd, i) => kursi(S, kd.x, kd.y + 5.6, -1, false, false,
      i === 0 && putarSendiri ? Math.PI * 4 * (1 - (1 - Math.min(1, putarSendiri.umur / 4)) ** 2) : 0));
    if (RUANGAN.kursiTambahanAda) kursi(S, KURSI_TAMBAHAN.x, KURSI_TAMBAHAN.y + 10, -1, false);

    // layar mini meja rapat: menghadap kursi sisi jauh, menyala waktu rapat
    const rapatNyala = stasiun.has('rapat');
    for (let k = 0; k < KURSI_N; k++) {
      const nx = RAPAT.cx + slotKe(k);
      kotak(S, nx - 6.5, nx + 6.5, 16, 17, 199, 203, warna('#3a3f45'));
      kotak(S, nx - 7, nx + 7, 17, 25, 199.5, 201, warna('#20242c'), { sisi: SEMUA });
      const layar = rapatNyala ? campur(warna('#173a96'), warna('#4ec9b0'), 0.25 + 0.25 * Math.sin(now / 700 + k)) : warna('#141a20');
      kotak(S, nx - 6, nx + 6, 18, 24, 199.3, 199.5, layar, { sisi: S_BELAKANG, e: rapatNyala ? 0.9 : 0 });
    }

    // meja kerja: kursi (serong kalau kusut & kosong), layar laptop
    const terpakai = new Set();
    for (const a of penghuni()) if (a.station === 'think' && !a.path.length && !a.antre) terpakai.add(a.slotIdx);
    MEJA_KERJA_X.forEach((cx, i) => {
      const serong = kusutKini() > 0.42 && !terpakai.has(i) ? (KUSUT_KURSI[i] || 0) : 0;
      kursi(S, cx + serong, 355.6, -1, false, true);
      const h = MEJA_H;
      const nyala = (terpakai.has(i) || MOD.mejaHantu === i) && MOD.mejaPadam !== i;
      LAMPU_MEJA[i] = nyala ? 1 : 0;                         // lampu titik mejanya (hitungCahaya)
      const layar = nyala ? campur(warna('#173a96'), warna('#9fc3ff'), 0.15 + 0.1 * Math.sin(now / 300 + i)) : warna('#20242c');
      kotak(S, cx + 13, cx + 29, h + 1.6, h + 13.4, 336, 336.2, layar, { sisi: S_DEPAN, e: nyala ? 0.85 : 0 });
      // genangan cahaya lampu meja di papan meja: tiga cakram hangat bertingkat
      // (di lintasan pudar cuma yang teratas yang dicampur, jadi pinggirnya
      // memudar bertahap), cuma terasa waktu ruangan gelap
      if (nyala && MALAM.lampu > 0.05) {
        [[7.5, 0.1], [5.5, 0.18], [3, 0.28]].forEach(([r, al], j) => {
          tabung(G.sinar, cx - 22, 339, r, h + 0.04 + j * 0.03, h + 0.06 + j * 0.03, [1, 0.86, 0.55, al * MALAM.lampu], { segmen: 14, e: 1 });
        });
      }
      if (nyala) {
        for (let b = 0; b < 3; b++) {
          const lw = 3 + ((b * 5 + ((now * MOD.layar / 150) | 0) + i * 3) % 9);
          kotak(S, cx + 14, cx + 14 + lw, h + 11 - b * 3, h + 11.6 - b * 3, 336.2, 336.3, warna(b ? '#bcd0ff' : '#ffffff'), { sisi: S_DEPAN, e: 1 });
        }
        kotak(S, cx - 30.5, cx - 26.5, h + 9, h + 11, 332.5, 336.5, warna('#ffe9a0'), { sisi: SEMUA, e: 1 });   // bohlam lampu meja
      }
      kotak(S, cx - 32, cx - 25, h + 11, h + 13.5, 332, 337, warna('#2c3440'), { sisi: S_ATAS | S_DEPAN | S_KIRI | S_KANAN });   // kap
    });

    // tumpukan map di atas filing kabinet
    for (let m = 0; m < RUANGAN.tumpukanFiling; m++) {
      kotak(S, 114 + (m % 2), 128 + (m % 2), 57 + m * 3, 60 + m * 3, 104, 116, warna(m % 2 ? '#c9a03a' : '#d9b96a'), { sisi: SEMUA });
    }

    // Stasiun yang sedang dipakai: pendar kuning sayup di tepi depan papan rak
    // arsip / bibir meja stempel — pengganti glow() 2D yang dulu terlukis di kartunya
    const sorot = warna(P.amber);
    if (stasiun.has('read')) for (const t of ARSIP_PAPAN) kotak(S, ARSIP.x0 + 2, ARSIP.x1 - 2, t - 0.6, t, ARSIP.z1 - 0.5, ARSIP.z1 - 0.3, sorot, { sisi: S_DEPAN, e: 0.45 });
    if (stasiun.has('edit')) kotak(S, 252, 320, MEJA_STEMPEL_H - 0.7, MEJA_STEMPEL_H - 0.1, 118, 118.2, sorot, { sisi: S_DEPAN, e: 0.45 });
    // lemari arsip yang penuh sesekali menghamburkan debu (drawArsip 2D: 4%/frame 30 fps)
    if (RUANGAN.arsipPenuh && Math.random() < 1.2 * dt) spawn('dust', 76, 60);
    // cap basah di lembar teratas meja stempel: merah segar lalu mengering
    for (const b of RUANGAN.bekasStempel || []) {
      const z0 = 105 + (b.dy || 0) * 1.5, y = puncakStempel;
      kotak(S, 261, 266, y, y + 0.1, z0, z0 + 3, campur(warna('#e05050'), warna('#c03030'), Math.max(0, Math.min(1, 1 - b.sisa / 2.5))), { sisi: S_ATAS });
      if (b.sisa > 1.7) kotak(S, 262, b.sisa > 2.1 ? 264 : 263, y + 0.1, y + 0.15, z0 + 0.6, z0 + 1.4, warna('#ffffff'), { sisi: S_ATAS, e: 0.6 });
    }
    // fotokopi: lampu panel, sinar pindai yang menyapu di bawah tutup kaca, lembar hasil
    const dipakai = !!fotokopiDipakai(), F = FOTOKOPI, hF = F.h - 12;
    kotak(S, F.x + F.w - 10, F.x + F.w - 5, hF + 3, hF + 3.1, 113, 115, dipakai ? warna('#7ee787') : warna('#2f5a3a'), { sisi: S_ATAS, e: dipakai ? 1 : 0 });
    kotak(S, F.x + F.w - 4, F.x + F.w - 2, hF + 3, hF + 3.1, 113, 115, dipakai ? warna(P.amber) : warna('#6b5a2a'), { sisi: S_ATAS, e: dipakai ? 1 : 0 });
    if (dipakai) {
      const sx = F.x + 1 + ((now / 900) % 1) * (F.w - 14);
      kotak(S, sx, sx + 2, hF + 0.3, hF + 1.7, 119, 119.15, warna('#e8fff0'), { sisi: S_DEPAN, e: 1 });
      kotak(S, F.x + F.w + 0.5, F.x + F.w + 4.5, 25, 25.3, 108, 116, warna(P.paper), { sisi: SEMUA });
    }

    // ember penadah AC: di bawah AC persis, tetesnya jatuh lurus ke dalamnya.
    // Selama tangga teknisi AC berdiri di tempatnya, ember itu digambar
    // tergeser oleh model event-nya (kaki tangganya menapak di sini)
    if (!RUANGAN.emberDiangkat && !tanggaTeknisiBerdiri()) {
      tabung(S, 348, 110, 6.5, 0, 9, warna(P.blue), { segmen: 12, atas: warna('#2a4a8a') });
      const isi = (RUANGAN.emberIsi || 0) / 90;
      if (isi > 0.02) tabung(S, 348, 110, 6, 0, 8 * isi, campur(warna(P.blue), warna('#4a7a90'), isi), { segmen: 12, atas: warna('#9fd0ee') });
    }
    // APAR di samping rak server
    if (!RUANGAN.aparDiangkat) {
      const ay = RUANGAN.aparAngkat || 0;
      tabung(S, 335, 112, 4, ay, 17 + ay, warna('#b02a2a'), { segmen: 10, atas: warna('#d24545') });
      kotak(S, 331, 339, 9 + ay, 12 + ay, 107.5, 116.5, warna('#f0ede2'), { sisi: S_DEPAN | S_KIRI | S_KANAN });
      kotak(S, 333, 337, 17 + ay, 22 + ay, 110, 114, warna('#7c838a'));
    }

    // bendera merah putih berkibar di tiangnya (turun waktu apel)
    const turun = apelBendera * 38;
    for (let i = 0; i < 16; i++) {
      const dz = Math.sin(now / 300 + i * 0.55) * 1.2;
      const y0 = 50 - turun;
      kotak(S, 134 + i, 135 + i, y0, y0 + 6, 272 + dz - 0.3, 272 + dz + 0.3, warna(P.red), { sisi: SEMUA });
      kotak(S, 134 + i, 135 + i, y0 - 6, y0, 272 + dz - 0.3, 272 + dz + 0.3, warna('#f4f2ec'), { sisi: SEMUA });
    }

    kipasAngin(S);

    // Ruang kadis: gorden mengikuti RUANG_KADIS.t, kadisnya duduk di balik
    // meja jati. Setelan bukaan 'mati' = dinding polos seperti sebelum fitur
    // ini ada: lubangnya disumbat potongan lukisan dinding yang sama.
    G.sumbat.kosongkan();
    if (KADIS_SIAP && sisipBoleh()) {
      gordenKadis(S);
      if (kadisNpc) susunOrang(S, kadisNpc, dt, 1);
    } else {
      mukaDinding(LUBANG.x0, LUBANG.x1, LUBANG.y0, LUBANG.y1, G.sumbat);
    }
    WADAH.sumbat.isi(G.sumbat);

    // WC & gudang: daun pintu mengayun ke dalam selama bukaSampai; lampu WC dan
    // bohlam gudang menyala selama ada orangnya atau pintunya terbuka
    ayunDaun(dt);
    G.dinamisKulit.kosongkan();
    daunPintu(S, G.dinamisKulit, DAUN.wc, K_.pintuWC);
    daunPintu(S, G.dinamisKulit, DAUN.gudang, K_.pintuGudang);
    daunKadis(S, G.dinamisKulit, stasiun, dt);
    xBanner(S, G.dinamisKulit);
    laciFiling(S, G.dinamisKulit, dt, stasiun);
    WADAH.dinamisKulit.isi(G.dinamisKulit);
    mesinAbsen(S);
    const wcNyala = wcTerisi() || pintuTerbuka(DAUN.wc), gudangNyala = gudangTerisi() || pintuTerbuka(DAUN.gudang);
    const [lx, ly, lz] = LAMPU_WC();
    kotak(S, lx - 6, lx + 6, ly + 1.4, ly + 2, lz - 3, lz + 3, wcNyala ? warna('#f4fbff') : warna('#b9c6cc'), { sisi: S_BAWAH, e: wcNyala ? 1 : 0 });
    const [bx, by, bz] = BOHLAM_GUDANG();
    kotak(S, bx - 1.4, bx + 1.4, by, by + 3, bz - 1.4, bz + 1.4, gudangNyala ? warna('#ffe9b0') : warna('#8a8576'), { sisi: SEMUA, e: gudangNyala ? 1 : 0 });
    // barang bekas: tiga yang pertama di lantai gudang (drawPintuGudang), yang
    // ke-4 dst. menumpuk di kanan pintu (drawDusGudang) — urutan & jumlah sama.
    // Tumpukan luar berdiri di atas palet: lukisan 2D-nya (x643..662 y104..112)
    // juga tercetak di tekstur lantai, dan paletnya yang menutup cetakan itu.
    const adaBekas = Math.max(0, RUANGAN.isiGudang.length - MOD.gudangDiangkut);
    for (let i = 0; i < Math.min(3, adaBekas); i++) {
      barangBekas3D(S, RUANGAN.isiGudang[i].jenis, RUANG_GUDANG.x1 - 14, 0, RUANG_GUDANG.z0 + 13 + i * 9.5, 2);
    }
    const luber = Math.min(4, adaBekas - 3);
    if (luber > 0) {
      for (const z of [104, 108, 112]) kotak(S, 642, 663, 0, 0.8, z, z + 1.4, warna('#7a5c3e'), { sisi: SEMUA });
      kotak(S, 642, 663, 0.8, 1.6, 103.5, 113.5, warna('#a3805a'), { sisi: SEMUA, w: { atas: warna('#b8946a') } });
      for (let i = 0; i < luber; i++) barangBekas3D(S, RUANGAN.isiGudang[3 + i].jenis, 643 + i * 5, 1.6, 106, 1.2);
    }
    // kardus kosong ditumpuk di depan pintu gudang — cuma selagi gudangnya kosong
    // (drawDusGudang); yang terlukis di lantai tertutup tepat oleh kotak ini
    if (!gudangTerisi()) {
      const gx = GUDANG.x + GUDANG.w / 2;
      kotak(S, gx - 8, gx - 1, 0, 5, 104, 111, warna('#b98d5e'), { sisi: SEMUA, w: { atas: warna('#d9cba8') } });
      kotak(S, gx + 2, gx + 8, 0, 4, 107.5, 113, warna('#b98d5e'), { sisi: SEMUA, w: { atas: warna('#d9cba8') } });
    }

    ikanAkuarium(S);
    printerVoxel(S);
    sandalWC(S);

    // galon dispenser
    if (!MOD.galonLepas) {
      const dx = pantriX(462) + 9;
      tabung(S, dx, 285, 6.5, 34, 45, warna('#7db8e8', 0.85), { segmen: 12, atas: warna('#5f9fd4') });
      tabung(S, dx, 285, 2, 45, 48, warna('#5f9fd4'), { segmen: 8 });
    }

    // pegawai: yang pudar ke grup campur, sisanya pejal. Yang matanya sedang
    // dipakai kamera POV tidak digambar (keadaannya tetap maju lewat SUSUN_HAMPA)
    const tanpaBadan = POV.t > 0.4 ? POV.orang || POV.bekas : null;
    for (const a of penghuni()) {
      const ganti = tampilanKhusus(a);                        // yang sedang masuk/keluar WC & gudang
      const nyata = ganti && ganti.alfa != null ? ganti.alfa : (a.alpha == null ? 1 : a.alpha);
      const alfa = (a.standby && !a.tetap ? 0.55 : 1) * nyata;
      susunOrang(a === tanpaBadan ? SUSUN_HAMPA : alfa < 0.999 ? G.pudar : S, a, dt, alfa, ganti);
    }
    // tamu event (sosok drawPerson di gambar event): boneka voxel di tempatnya sendiri
    for (const { o, alfa } of ORANG_EVENT.daftar) susunOrang(alfa < 0.999 ? G.pudar : S, o, dt, alfa);
    // hewan & barang event yang bermodel: kucing kantor, tikus, isi meja rapat, tangga...
    for (const E of eventHidup) {
      const model = MODEL_EVENT[E.def.id];
      if (model) aman(() => model(S, E));
    }
    // sorotan orang yang kartunya terbuka: cincin di lantai
    if (terpilih && !terpilih.diKadis && terpilih !== tanpaBadan) cincin(S, terpilih.x, terpilih.y, 9 + Math.sin(now / 240) * 1.2, warna(P.amber), 0.9);
    // sorotan barang: bingkai rusuk emas di kotak 3D-nya (yang diklik lebih
    // tegas dari yang cuma dilewati kursor) — pengganti drawSorotBarang 2D
    const bSorot = barangTerpilih || barangHover;
    if (bSorot) {
      const K2 = barangKeRuangKadis(bSorot) ? SISIP : bSorot.kotak;
      rusuk(S, kotakBarang3D(K2), barangTerpilih ? 0.9 : 0.45, warna(P.gold), 0.6 + 0.4 * Math.sin(now / 260));
    }
    partikel(G.pudar);
    susunDebu(G.pudar);

    WADAH.dinamis.isi(S);
    WADAH.pudar.isi(G.pudar);
    WADAH.sinar.isi(G.sinar);
  }

  function dindingSamping(S, x0, x1, rendah) {
    const h = rendah ? 12 : TINGGI_DINDING;
    const z0 = DINDING_Z - 6, z1 = LANTAI_Z1;
    kotak(S, x0, x1, 0, Math.min(h, 10), z0, z1, PLIN, { sisi: SEMUA });
    if (h > 10) kotak(S, x0, x1, 10, Math.min(h, 38), z0, z1, MINT, { sisi: SEMUA });
    if (h > 38) kotak(S, x0 - (x0 < 0 ? 0 : 0.6), x1 + (x0 < 0 ? 0.6 : 0), 38, 40, z0, z1, LIS, { sisi: SEMUA });
    if (h > 40) kotak(S, x0, x1, 40, h + 3, z0, z1, KREM, { sisi: SEMUA, w: { atas: warna('#f2ecd8') } });
  }
  /* Maket tidak berdinding depan dan tidak berplafon — dari mata pegawai yang
     menghadap ke depan itu jurang hitam. Selama POV ditutup: dinding depan
     berpita & plafon setinggi tembok belakang. Cuma muka DALAM-nya yang
     digambar, jadi dari kamera maket (di luar ruangan) tetap tidak kelihatan. */
  function tutupMaketPov(S) {
    const z0 = LANTAI_Z1, z1 = LANTAI_Z1 + 6, x0 = -6, x1 = W + 6, sisi = S_BELAKANG;
    kotak(S, x0, x1, 0, 10, z0, z1, PLIN, { sisi });
    kotak(S, x0, x1, 10, 38, z0, z1, MINT, { sisi });
    kotak(S, x0, x1, 38, 40, z0 - 0.6, z1, LIS, { sisi });
    kotak(S, x0, x1, 40, TINGGI_DINDING + 3, z0, z1, KREM, { sisi });
    kotak(S, x0, x1, TINGGI_DINDING, TINGGI_DINDING + 1, DINDING_Z - 6, z1, warna('#eeebe0'), { sisi: S_BAWAH });
  }

  /* Kursi: dudukan setinggi DUDUKAN_Y — persis pinggul pegawai yang sudah
     turun (susunOrang: TURUN_DUDUK x SKALA_ORANG di bawah pinggul berdiri).
     hadap 1: menghadap +z (sisi jauh meja rapat); -1: menghadap -z. */
  const DUDUKAN_Y = 8;
  // putar: dudukan & sandaran berputar mengitari tiangnya (kursi yang
  // berputar sendiri); kaki bintangnya tetap
  function kursi(S, cx, cz, hadap, rusak, kecil = false, putar = 0) {
    const w = kecil ? 6 : 7.5, jok = rusak ? warna('#c9ced4') : warna('#3f74c4'), rangka = rusak ? warna('#8b8f86') : warna('#2a4f8a');
    const d = kecil ? 5 : 5.5, y = DUDUKAN_Y;
    const puncak = kecil ? 21 : 24;
    if (putar) {
      const m = A3.kali(A3.geser(cx, 0, cz), A3.putarY(putar)), zs = -hadap * d;
      kotakM(S, m, -w, w, y - 2.5, y, -d, d, jok);
      kotakM(S, m, -w, w, y, puncak, zs - 1.2, zs + 1.2, rangka);
      kotakM(S, m, -w + 1, w - 1, y + 1.5, puncak - 1, zs + hadap * 1.2, zs + hadap * 1.4, jok);
    } else {
      kotak(S, cx - w, cx + w, y - 2.5, y, cz - d, cz + d, jok, { sisi: SEMUA, w: { atas: warna(rusak ? '#dfe2e6' : '#5b8ad4') } });
      const zs = cz - hadap * d;
      kotak(S, cx - w, cx + w, y, puncak, zs - 1.2, zs + 1.2, rangka, { sisi: SEMUA });
      kotak(S, cx - w + 1, cx + w - 1, y + 1.5, puncak - 1, zs + hadap * 1.2, zs + hadap * 1.4, jok, { sisi: hadap > 0 ? S_DEPAN : S_BELAKANG });
    }
    kotak(S, cx - 1, cx + 1, 1.5, y - 2.5, cz - 1, cz + 1, BESI);
    kotak(S, cx - 5, cx + 5, 0, 1.5, cz - 1, cz + 1, BESI_TUA);
    kotak(S, cx - 1, cx + 1, 0, 1.5, cz - 5, cz + 5, BESI_TUA);
  }

  function kipasAngin(S) {
    const sapu = MOD.kipasSapu ? Math.sin(now / 1114) * MOD.kipasSapu : 0;
    const dasarCx = MOD.kipasCx || 400;
    const arah = MOD.kipasCx ? 0 : RUANGAN.kipasArah * 6;
    const cx = dasarCx + (MOD.kipasCx ? 0 : sapu) + arah + Math.sin(now / 64) * MOD.kipasGoyang;
    const cz = 290;
    tabung(S, cx, cz, 9, 0, 2, warna('#7c838a'), { segmen: 14, atas: warna('#9aa1a6') });
    tabung(S, cx, cz, 1.2, 2, 34, warna('#c9ced4'), { segmen: 6 });
    // kepala: menoleh mengikuti sapuan/arah rebutan (sama seperti 2D)
    const yawKepala = -(sapu * 0.06 + (MOD.kipasCx ? 0 : RUANGAN.kipasArah * 0.45));
    const kep = A3.kali(A3.geser(cx, 40, cz), A3.putarY(yawKepala));
    const abu = warna('#aeb4ba'), kisi = warna('#dde1e4');
    kotakM(S, kep, -2.8, 2.8, -2.8, 2.8, -6, -1.2, abu);                  // rumah motor
    kotakM(S, kep, -1, 1, -8, -2.8, -3.6, -1.6, abu);                      // leher ke tiang
    // cincin pelindung depan & belakang: 16 keping yang saling menyambung
    const n = 16, rr = 10.5, lebar = (Math.PI * 2 * rr) / n * 1.12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (const z of [2.4, -1.2]) {
        const m = A3.kali(kep, A3.kali(A3.geser(0, 0, z), A3.putarZ(a)));
        kotakM(S, m, -lebar / 2, lebar / 2, rr, rr + 0.8, -0.35, 0.35, kisi);
      }
    }
    // jari-jari kisi depan + pusat bermerek
    for (let i = 0; i < 4; i++) {
      const m = A3.kali(kep, A3.kali(A3.geser(0, 0, 2.4), A3.putarZ(i * Math.PI / 4)));
      kotakM(S, m, -0.25, 0.25, -rr, rr, -0.2, 0.2, kisi);
    }
    kotakM(S, kep, -1.6, 1.6, -1.6, 1.6, 2.2, 3, warna('#7c838a'));
    // baling-baling: berputar menurut putarKipas (0 = macet, lambat = tegangan turun)
    for (let i = 0; i < 3; i++) {
      const m = A3.kali(kep, A3.kali(A3.geser(0, 0, 0.6), A3.putarZ(putarKipas + i * 2.094)));
      kotakM(S, m, -1.8, 1.8, 1.2, 9.5, -0.25, 0.25, warna('#eef0f2'));
    }
  }

  // Dua belas rusuk sebuah kotak [x0,x1,y0,y1,z0,z1] sebagai batang tipis bercahaya.
  function rusuk(S, [x0, x1, y0, y1, z0, z1], t, c, e) {
    const X = [x0 - t, x1 + t], Y = [Math.max(0, y0 - t), y1 + t], Z = [z0 - t, z1 + t];
    for (const y of Y) for (const z of Z) kotak(S, X[0], X[1], y - t / 2, y + t / 2, z - t / 2, z + t / 2, c, { sisi: SEMUA, e });
    for (const x of X) for (const z of Z) kotak(S, x - t / 2, x + t / 2, Y[0], Y[1], z - t / 2, z + t / 2, c, { sisi: SEMUA, e });
    for (const x of X) for (const y of Y) kotak(S, x - t / 2, x + t / 2, y - t / 2, y + t / 2, Z[0], Z[1], c, { sisi: SEMUA, e });
  }

  // Cincin sorotan di lantai: 24 keping tipis, masing-masing sejajar garis
  // singgung lingkarannya (putarY membawa +z lokal ke arah jari-jari).
  function cincin(S, x, z, r, c, e) {
    const n = 24, panjang = (Math.PI * 2 * r) / n * 1.08;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      const m = A3.kali(A3.geser(x, 0.5, z), A3.putarY(Math.PI / 2 - a));
      kotakM(S, m, -panjang / 2, panjang / 2, 0, 0.5, r, r + 1.5, c, e, S_ATAS);
    }
  }

  /* Partikel 2D (tinta, glyph, uap, tetes AC) dicap tempatnya SEKALI saat
     pertama terlihat, lalu y 2D-nya tinggal dibaca sebagai ketinggian di
     kedalaman tetap itu. Capnya satu dari empat:
       ember — tetes AC: jatuh lurus dari AC ke ember tepat di bawahnya;
       kadis — milik tamu ruang kadis (p.sisip): ikut ke ruangan di balik dinding;
       orang — milik pegawai terdekat: di depan badannya, tinggi dikali SKALA_ORANG;
       dinding / lantai — selebihnya, menurut garis dinding 2D. */
  const capPartikel = new WeakMap();
  function capBaru(p) {
    if (p.k === 'drip' && p.dasar == null) return { jenis: 'ember' };
    const terdekat = (saring, batas) => {
      let o = null, jarak = batas;
      for (const a of penghuni()) {
        if (!saring(a)) continue;
        const d = Math.hypot(a.x - p.x, (a.y - 18) - p.y);
        if (d < jarak) { jarak = d; o = a; }
      }
      return o;
    };
    if (p.sisip) {
      const a = terdekat((o) => o.diKadis, Infinity);
      return { jenis: 'kadis', kaki: a ? a.y : 70 };
    }
    const a = terdekat((o) => !o.diKadis, 26);
    if (a) return { jenis: 'orang', kaki: a.y + 2 };
    return p.y <= FLOOR_TOP ? { jenis: 'dinding' } : { jenis: 'lantai', kaki: p.y + 6 };
  }
  function partikel(S) {
    const adaKadis = KADIS_SIAP && sisipBoleh();
    for (const p of parts) {
      if (p.sisip && !adaKadis) continue;
      let cap = capPartikel.get(p);
      if (!cap) { cap = capBaru(p); capPartikel.set(p, cap); }
      let Y, Z;
      switch (cap.jenis) {
        case 'ember': Y = 80 - (p.y - 30) * (70 / 94); Z = 110; break;
        case 'kadis': Y = Math.max(0.3, (cap.kaki - p.y) * SKALA_ORANG); Z = kadisZ(cap.kaki); break;
        case 'orang': Y = Math.max(0.3, (cap.kaki - p.y) * SKALA_ORANG); Z = cap.kaki; break;
        case 'dinding': Y = FLOOR_TOP - p.y; Z = DINDING_Z + 3; break;
        default: Y = Math.max(0.3, cap.kaki - p.y); Z = cap.kaki;
      }
      const a = Math.min(1, p.life * 1.6) * (p.a == null ? 1 : p.a);
      if (a < 0.05) continue;
      const s = p.s * 0.8;
      kotak(S, p.x - s / 2, p.x + s / 2, Y, Y + s, Z - s / 2, Z + s / 2, warna(p.c, Math.max(0.2, a)), { sisi: SEMUA, e: 0.55 });
    }
  }

  // ------------------------------------------------- debu & berkas cahaya
  /* Pasangan 3D drawDebu(): debu yang cuma kelihatan waktu ditembus cahaya.
     Debu 2D hidup di koordinat layar; di sini debunya punya volume sendiri —
     prisma berkas jendela (dari kaca turun ke petak sinar di lantai yang
     dilukis drawFloor) waktu siang, dan kerucut di bawah tiap neon waktu
     malam. Kapan menyala dan seberapa kuat diambil dari debuSumber() yang
     sama, jadi debu 3D lahir & padam bersama debu 2D-nya. Berkas jendelanya
     sendiri ikut digambar sebagai selubung cahaya aditif yang tipis. */
  const DEBU3D_MAKS = 48;
  const debu3d = [];
  const JEN = { x0: JENDELA.x, x1: JENDELA.x + JENDELA.w, hB: FLOOR_TOP - (JENDELA.y + JENDELA.h), hA: FLOOR_TOP - JENDELA.y };
  const SINAR_DEKAT = { x0: 190, x1: 240, z: FLOOR_TOP }, SINAR_JAUH = { x0: 164, x1: 266, z: 196 };   // petak sinar drawFloor
  // u melintang (0 kiri..1 kanan), v: 0 tepi bawah kaca..1 tepi atas, t: 0 di kaca..1 di lantai.
  // Cahaya dari tepi bawah kaca jatuh di tepi dekat petak, dari tepi atas di tepi jauhnya.
  function titikBerkas(u, v, t) {
    const kx = JEN.x0 + (JEN.x1 - JEN.x0) * u, kh = JEN.hB + (JEN.hA - JEN.hB) * v;
    const lx0 = SINAR_DEKAT.x0 + (SINAR_JAUH.x0 - SINAR_DEKAT.x0) * v, lx1 = SINAR_DEKAT.x1 + (SINAR_JAUH.x1 - SINAR_DEKAT.x1) * v;
    const lx = lx0 + (lx1 - lx0) * u, lz = SINAR_DEKAT.z + (SINAR_JAUH.z - SINAR_DEKAT.z) * v;
    return [kx + (lx - kx) * t, kh * (1 - t), DINDING_Z + (lz - DINDING_Z) * t];
  }
  function perbaruiDebu3D(dt) {
    if (ringanAktif()) { debu3d.length = 0; return; }
    const sumber = debuSumber(ambien());
    if (sumber.length && debu3d.length < DEBU3D_MAKS && Math.random() < dt * 7) {
      const s = sumber[(Math.random() * sumber.length) | 0];
      let p;
      if (s.jenis === 'neon') {
        const t = Math.random(), rr = (6 + 34 * t) * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
        p = [NEON_X[s.i] + Math.cos(a) * rr, (LAMPU_Y - 2) * (1 - t), LAMPU_Z + Math.sin(a) * rr];
      } else p = titikBerkas(Math.random(), Math.random(), 0.08 + Math.random() * 0.84);
      debu3d.push({ p, jenis: s.jenis, i: s.i, v: [(Math.random() - 0.5) * 1.6, -(0.4 + Math.random()), (Math.random() - 0.5) * 1.6],
        fase: Math.random() * 6.28, umur: 0, life: 5 + Math.random() * 6 });
    }
    for (let i = debu3d.length - 1; i >= 0; i--) {
      const d = debu3d[i];
      d.umur += dt;
      d.p[0] += (d.v[0] + Math.sin(now / 900 + d.fase) * 1.1) * dt;
      d.p[1] += d.v[1] * dt;
      d.p[2] += (d.v[2] + Math.cos(now / 1100 + d.fase) * 1.1) * dt;
      if (d.umur >= d.life || d.p[1] < 0.5) debu3d.splice(i, 1);
    }
  }
  function susunDebu(S) {
    const A = ambien();
    for (const d of debu3d) {
      const kuat = d.jenis === 'neon' ? A.lampu * kedipNeon(d.i) : Math.min(1, A.luar);
      const pudar = Math.min(1, d.umur * 0.8, (d.life - d.umur) * 0.8);
      const a = 0.6 * kuat * pudar * (0.7 + 0.3 * Math.sin(now / 350 + d.fase * 3));
      if (a < 0.03) continue;
      const s = 0.4;
      kotak(S, d.p[0] - s, d.p[0] + s, d.p[1] - s, d.p[1] + s, d.p[2] - s, d.p[2] + s,
        warna(d.jenis === 'neon' ? '#fff0c8' : '#fffbe8', a), { sisi: SEMUA, e: 1 });
    }
  }
  // Selubung berkas jendela: empat muka prisma, dipotong empat irisan yang
  // makin pudar mendekati lantai, digambar aditif tanpa menulis kedalaman.
  function susunBerkas(S) {
    S.kosongkan();
    const A = ambien();
    const kuat = A.sinarA * Math.min(1, A.luar) * (1 - 0.6 * CUACA.hujan) * 0.9;
    if (kuat < 0.006 || ringanAktif()) return;
    const [r, g, b] = warna(A.sinar);
    const muka = [
      [(t) => titikBerkas(0, 0, t), (t) => titikBerkas(1, 0, t)],
      [(t) => titikBerkas(1, 1, t), (t) => titikBerkas(0, 1, t)],
      [(t) => titikBerkas(0, 1, t), (t) => titikBerkas(0, 0, t)],
      [(t) => titikBerkas(1, 0, t), (t) => titikBerkas(1, 1, t)],
    ];
    for (let k = 0; k < 4; k++) {
      const t0 = k / 4, t1 = (k + 1) / 4, f = kuat * (1 - t0 * 0.75);
      const c = [r * f, g * f, b * f, 1];
      for (const [kiri, kanan] of muka) S.segi(kiri(t1), kanan(t1), kanan(t0), kiri(t0), [0, 0, 1], c, UV_POLOS, 1);
    }
  }

  // ------------------------------------------------------- kartu event
  /* Gambar event jadi KARTU BERTEBAL. Tiap event hidup dilukis ke kanvasnya
     sendiri berskala 1 (satu texel per piksel dunia — gambar event memang
     pixel-art), lalu siluetnya dipindai: tiap tepi antara piksel isi dan
     piksel kosong jadi sisi setebal TEBAL_KARTU berwarna piksel tepinya.
     Kucing yang lewat jadi sprite voxel, bukan potongan kertas: dari samping
     dia tetap punya badan. Muka depan & belakangnya tekstur kanvas itu sendiri.

     Letaknya:
       gambarProp — tegak di kedalaman sortY-nya, persis urutan depth-sort 2D:
         yang di belakang meja rapat tetap di belakang meja rapat;
       gambarAtas — dipilah dari pikselnya sendiri, bukan dari daftar event:
         keempat pojok terisi (kilat foto bersama, mati lampu, rona syukuran)
         jadi selubung seluruh layar; selebihnya kartu di kedalaman aktor
         pertama event itu, atau menempel di dinding kalau seluruh gambarnya
         jatuh di bidang dinding.

     Yang mahal di sini membaca pikselnya balik, bukan melukisnya: kanvasnya
     willReadFrequently, pemindaian tepinya dibatasi kotak isinya, dan semua
     itu paling sering 20 kali sedetik. */
  const TEBAL_KARTU = 3;
  const TEPI_MAKS = 3000;          // lebih dari ini: gambarnya terlalu berisik untuk diberi tebal
  const KARTU_PROP = new Map();    // E -> kartu
  const KARTU_ATAS = new Map();
  // S (keadaan bersama event) di room.js: dipakai apa adanya kalau ada
  const S_EVENT = () => (typeof S !== 'undefined' ? S : undefined);
  function aktorEvent(E) {
    const d = E.data || {};
    const calon = [E.aktor && E.aktor[0], d.a, d.pejabat, d.orang && d.orang[0]];
    return calon.find((o) => o && typeof o.x === 'number' && typeof o.y === 'number') || null;
  }
  // lebar: kanvas selebar dunia (kartu event) atau sesempit stiker aksesori,
  // yang lalu digeser ke x0 dunianya tiap frame
  function kartuUntuk(peta, E, tinggi, lebar = W) {
    let kt = peta.get(E);
    if (!kt) {
      const kv = document.createElement('canvas');
      kv.width = lebar; kv.height = tinggi;
      const k = kv.getContext('2d', { willReadFrequently: true });
      kt = { kv, k, tek: tekstur(lebar, tinggi, false), tinggi, lebar, x0: 0, terakhir: -1e9, tepi: null, kosong: true,
        tint: null, z: 0, dasar: 0, dinding: false };
      peta.set(E, kt);
    }
    kt.dipakai = true;
    return kt;
  }
  // Lukis ulang (≤ 20x sedetik) dan kembalikan pikselnya; null = belum waktunya.
  function lukisKartu(kt, gambar) {
    if (now - kt.terakhir < 50) return null;
    kt.terakhir = now;
    const { k, kv } = kt;
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.clearRect(0, 0, kv.width, kv.height);
    gambarKe(k, () => {
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      aman(gambar);
      ctx.globalAlpha = 1;
    });
    return k.getImageData(0, 0, kv.width, kv.height).data;
  }
  // Kotak isi (alfa >= 128) lewat tampilan 32-bit: satu baca per piksel.
  function kotakIsi(d, w, h) {
    const u = new Uint32Array(d.buffer, d.byteOffset, w * h);
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) {
      const b = y * w;
      let ada = false;
      for (let x = 0; x < w; x++) {
        if ((u[b + x] >>> 24) >= 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; ada = true; }
      }
      if (ada) { if (y < y0) y0 = y; y1 = y; }
    }
    return y1 < 0 ? null : { x0, x1, y0, y1 };
  }
  /* Tepi siluet di dalam kotak isinya, dirangkai jadi ruas panjang: tepi
     tegak di batas kolom x (antara x-1 dan x) sepanjang baris, tepi datar di
     batas baris y sepanjang kolom. Ruas diputus kalau arah atau warnanya
     berganti, jadi sisi bendera merah-putih tetap merah di atas, putih di
     bawah. arah +1: piksel isi di kiri (muka +x) / di bawah (muka atas). */
  function cariTepi(d, w, kotakIsiNya) {
    const { x0, x1, y0, y1 } = kotakIsiNya;
    const isi = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && d[(y * w + x) * 4 + 3] >= 128;
    const iw = (x, y) => (y * w + x) * 4;
    const mirip = (i, j) => Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) < 40;
    const tepi = [];
    const tutup = (jalur) => {
      if (!jalur.arah) return;
      const i = jalur.piksel;
      tepi.push({ tegak: jalur.tegak, garis: jalur.garis, a: jalur.mulai, b: jalur.akhir, arah: jalur.arah,
        c: [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, 1] });
    };
    for (let x = x0; x <= x1 + 1; x++) {
      const jalur = { tegak: true, garis: x, arah: 0, mulai: 0, akhir: 0, piksel: 0 };
      for (let y = y0; y <= y1 + 1; y++) {
        const a = y > y1 ? 0 : (isi(x - 1, y) ? 1 : 0) - (isi(x, y) ? 1 : 0);
        const p = a > 0 ? iw(x - 1, y) : a < 0 ? iw(x, y) : 0;
        if (a !== jalur.arah || (a && !mirip(p, jalur.piksel))) {
          jalur.akhir = y; tutup(jalur);
          jalur.arah = a; jalur.mulai = y; jalur.piksel = p;
        }
      }
      if (tepi.length > TEPI_MAKS) return null;
    }
    for (let y = y0; y <= y1 + 1; y++) {
      const jalur = { tegak: false, garis: y, arah: 0, mulai: 0, akhir: 0, piksel: 0 };
      for (let x = x0; x <= x1 + 1; x++) {
        const a = x > x1 ? 0 : (isi(x, y) ? 1 : 0) - (isi(x, y - 1) ? 1 : 0);
        const p = a > 0 ? iw(x, y) : a < 0 ? iw(x, y - 1) : 0;
        if (a !== jalur.arah || (a && !mirip(p, jalur.piksel))) {
          jalur.akhir = x; tutup(jalur);
          jalur.arah = a; jalur.mulai = x; jalur.piksel = p;
        }
      }
      if (tepi.length > TEPI_MAKS) return null;
    }
    return tepi;
  }

  /* ------------------------------------------------- tamu event jadi boneka
     Semua sosok orang di gambar event lewat SATU pintu: drawPerson() —
     dipanggil gambarOrangLuar (00-dasar), TAMU_BIROKRASI.gambar, dan
     TOKOH.gambar (tamu tenar). Di kartu, sosok itu berdiri di kedalaman sortY
     milik EVENT, bukan di tempat orangnya; tamu yang lewat di lajur lain jadi
     guntingan kertas yang salah tempat. Jadi:
       - ±30x sedetik gambar event dijalankan sekali di KANVAS HAMPA (semua
         perintah gambar tidak melakukan apa-apa) sambil drawPerson diganti
         pencatat: tiap sosok tercatat dengan pal/hadap/langkah/bawaan dan
         globalAlpha-nya, lalu berdiri sebagai boneka voxel di (x, y)-nya
         sendiri — segaya pegawai, berbayang, ikut pudar;
       - waktu kartu event dilukis, drawPerson & TOKOH.gambar dilewati:
         kartunya tinggal berisi properti event;
       - aksesori tamu tenar (topi, helm, kacamata hitam, raket...) dilukis
         ke STIKER kecilnya sendiri, diperbesar SKALA_ORANG di sekitar titik
         kakinya, dan menempel di depan boneka — x-nya mengikuti tiap frame. */
  const HAMPA = (() => {
    const isi = {
      globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif',
      textBaseline: 'alphabetic', textAlign: 'start', imageSmoothingEnabled: false,
      globalCompositeOperation: 'source-over', canvas: { width: W, height: H },
    };
    const tumpuk = [], kosong = () => {};
    const khusus = {
      save: () => { tumpuk.push(isi.globalAlpha); },
      restore: () => { if (tumpuk.length) isi.globalAlpha = tumpuk.pop(); },
      measureText: (t) => ({ width: String(t).length * 3 }),
      createLinearGradient: () => ({ addColorStop: kosong }),
      createRadialGradient: () => ({ addColorStop: kosong }),
      createPattern: () => null,
      getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(4) }),
      isPointInPath: () => false,
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      getLineDash: () => [],
    };
    const ctxHampa = new Proxy(isi, {
      get: (t, k) => (k in khusus ? khusus[k] : k in t ? t[k] : kosong),
      set: (t, k, v) => { t[k] = v; return true; },
    });
    return { ctx: ctxHampa, isi, reset() { isi.globalAlpha = 1; tumpuk.length = 0; } };
  })();
  const adaTokoh = () => typeof TOKOH === 'object' && TOKOH && typeof TOKOH.gambar === 'function';
  const ORANG_EVENT = { daftar: [], terakhir: -1e9 };
  const tiruanEvent = new WeakMap();     // E -> [orang tiruan per urutan panggil]: yaw tetap halus
  function catatOrangEvent() {
    if (now - ORANG_EVENT.terakhir < 33) return;
    ORANG_EVENT.terakhir = now;
    const daftar = [], asliDraw = window.drawPerson, tokohAda = adaTokoh(), asliTokoh = tokohAda ? TOKOH.gambar : null;
    let E = null, urut = 0, tokohKini = null;
    window.drawPerson = (a) => {
      if (!a || typeof a.x !== 'number' || typeof a.y !== 'number' || !a.pal) return;
      let arr = tiruanEvent.get(E);
      if (!arr) { arr = []; tiruanEvent.set(E, arr); }
      const o = arr[urut] || (arr[urut] = { path: [], pose: null });
      urut++;
      // Di 2D tak ada yang bisa BERDIRI di jalur perabot dinding (y < 121):
      // tamu dengan kaki setinggi itu sedang memanjat/melompat di depan
      // perabot. Bonekanya ditaruh di muka perabot dan diangkat selisihnya.
      o.x = a.x; o.y = a.y < 121 ? 122 : a.y; o.angkat = a.y < 121 ? 121 - a.y : 0;
      o.face = a.face || 'down'; o.state = a.state || 'idle';
      // gambarOrangLuar selalu 'idle' & menghadap penonton: di 2D itu gaya, di
      // 3D tamu yang berpindah jadi meluncur menyamping. Yang bergerak sejak
      // catatan lalu melangkah dan menghadap arah jalannya; berhenti = seperti 2D.
      const gx = o.xLalu == null ? 0 : a.x - o.xLalu, gy = o.yLalu == null ? 0 : a.y - o.yLalu;
      o.xLalu = a.x; o.yLalu = a.y;
      if (Math.abs(gx) + Math.abs(gy) > 0.05 && o.state !== 'walk') {
        o.state = 'walk';
        if (o.face === 'down') o.face = Math.abs(gx) > Math.abs(gy) ? (gx > 0 ? 'right' : 'left') : (gy > 0 ? 'down' : 'up');
      }
      o.phase = a.phase || 0; o.slot = a.slot || 0; o.pal = a.pal; o.bawa = a.bawa || null; o.pose = null;
      // event bermodel boleh menyunting bonekanya: teknisi di anak tangga,
      // kurir yang menjinjing kardus (lihat bermodel())
      const model = MODEL_EVENT[E.def.id];
      if (model && model.orang) aman(() => model.orang(E, o));
      const g = +HAMPA.isi.globalAlpha;
      daftar.push({ o, alfa: Number.isFinite(g) ? Math.max(0, Math.min(1, g)) : 1, tokoh: tokohKini });
    };
    if (tokohAda) TOKOH.gambar = function (t) { tokohKini = t; try { return asliTokoh.call(this, t); } finally { tokohKini = null; } };
    try {
      for (E of eventHidup) {
        urut = 0;
        for (const lapis of ['gambarProp', 'gambarAtas']) {
          if (!E.def[lapis]) continue;
          HAMPA.reset();
          gambarKe(HAMPA.ctx, () => aman(() => E.def[lapis](E, S_EVENT())));
        }
      }
    } finally {
      window.drawPerson = asliDraw;
      if (tokohAda) TOKOH.gambar = asliTokoh;
    }
    ORANG_EVENT.daftar = daftar;
  }
  // Lukis gambar event TANPA sosok orangnya (badannya sudah jadi boneka voxel,
  // aksesori tamu tenar jadi stiker sendiri).
  function tanpaSosok(gambar) {
    return () => {
      const asliDraw = window.drawPerson, tokohAda = adaTokoh(), asliTokoh = tokohAda ? TOKOH.gambar : null;
      window.drawPerson = () => {};
      if (tokohAda) TOKOH.gambar = () => {};
      try { gambar(); } finally {
        window.drawPerson = asliDraw;
        if (tokohAda) TOKOH.gambar = asliTokoh;
      }
    };
  }
  /* Hewan event yang punya model voxel sendiri: kartunya tidak dilukis, yang
     berdiri boneka 3D dari keadaan E.data yang sama. Kucing kantor (lima
     event) dengan tiga pose — jalan (kaki melangkah, ekor bergoyang), duduk
     (tegak, ekor melingkar di kaki), tidur (meringkuk, napas naik-turun) — dan
     tikus yang lewat kolong. Warna bulu ikut lukisan 2D tiap event; ukuran
     dikali SKALA_ORANG seperti pegawai. yaw 0 = menghadap +x. */
  function kucing3D(S, x, z, h, pose, c, yaw) {
    const m = A3.kali(A3.geser(x, h, z), A3.kali(A3.putarY(yaw), A3.skala(SKALA_ORANG)));
    const bulu = warna(c), terang = warna(sh(c, 1.15)), gelap = warna(sh(c, 0.82)), mata = warna('#3a2a20'), hidung = warna('#d98a8a');
    if (pose === 'tidur') {
      const n = 1 + Math.sin(now / 900) * 0.05;
      kotakM(S, m, -3.5, 3.2, 0, 3 * n, -2.4, 2.4, bulu);                       // badan meringkuk
      kotakM(S, m, -3.2, 2.9, 3 * n, 3.4 * n, -2, 2, terang);
      const kp = A3.kali(m, A3.geser(2.2, 0, 0));
      kotakM(S, kp, 0, 2.6, 0.2, 2.6, -1.5, 1.5, bulu);                          // kepala bersandar di depan
      kotakM(S, kp, 0.4, 1.2, 2.6, 3.4, -1.3, -0.5, bulu); kotakM(S, kp, 0.4, 1.2, 2.6, 3.4, 0.5, 1.3, bulu);
      kotakM(S, kp, 2.6, 2.7, 1.5, 1.7, -1, -0.3, mata); kotakM(S, kp, 2.6, 2.7, 1.5, 1.7, 0.3, 1, mata);   // mata terpejam
      const ek = Math.sin(now / 900) * 0.3;
      kotakM(S, m, -3.8, 2.6, 0, 0.9, 2.4 + ek, 3.2 + ek, gelap);               // ekor melingkar
      return;
    }
    if (pose === 'duduk') {
      kotakM(S, m, -2, 1.6, 0, 3.6, -1.9, 1.9, bulu);                            // pinggul
      kotakM(S, m, -0.6, 2.2, 2.6, 6, -1.5, 1.5, bulu);                          // dada tegak
      kotakM(S, m, 1.2, 2, 0, 3, -1.2, -0.5, terang); kotakM(S, m, 1.2, 2, 0, 3, 0.5, 1.2, terang);   // kaki depan
      kotakM(S, m, -0.2, 3, 5.6, 8.6, -1.6, 1.6, bulu);                          // kepala
      kotakM(S, m, 0.2, 1, 8.6, 9.5, -1.4, -0.6, bulu); kotakM(S, m, 0.2, 1, 8.6, 9.5, 0.6, 1.4, bulu);
      kotakM(S, m, 3, 3.1, 7, 7.7, -1.1, -0.5, mata); kotakM(S, m, 3, 3.1, 7, 7.7, 0.5, 1.1, mata);
      kotakM(S, m, 3, 3.15, 6.3, 6.7, -0.25, 0.25, hidung);
      const ek = Math.sin(now / 220) * 0.6;
      kotakM(S, m, -2.6, 2.4, 0, 0.8, 1.9 + ek * 0.4, 2.7 + ek * 0.4, gelap);   // ekor melingkar di kaki
      return;
    }
    // jalan: empat kaki melangkah berselang, ekor tegak bergoyang
    const t = now / 1000, langkah = Math.sin(t * 12) * 0.6;
    for (const [lx, lz, f] of [[1.8, -0.9, 1], [1.8, 0.9, -1], [-2.2, -0.9, -1], [-2.2, 0.9, 1]]) {
      kotakM(S, m, lx - 0.4 + langkah * f, lx + 0.4 + langkah * f, 0, 2.2, lz - 0.4, lz + 0.4, gelap);
    }
    kotakM(S, m, -3, 2.8, 2, 4.8, -1.5, 1.5, bulu);                              // badan
    kotakM(S, m, -2.8, 2.6, 4.8, 5.1, -1.2, 1.2, terang);
    kotakM(S, m, 2.2, 5.2, 3.8, 6.8, -1.5, 1.5, bulu);                           // kepala
    kotakM(S, m, 2.8, 3.6, 6.8, 7.7, -1.4, -0.6, bulu); kotakM(S, m, 2.8, 3.6, 6.8, 7.7, 0.6, 1.4, bulu);   // telinga
    kotakM(S, m, 5.2, 5.3, 5.4, 6, -1.1, -0.5, mata); kotakM(S, m, 5.2, 5.3, 5.4, 6, 0.5, 1.1, mata);
    kotakM(S, m, 5.2, 5.35, 4.6, 5, -0.25, 0.25, hidung);
    const ekor = A3.kali(m, A3.poros(-3, 4.6, 0, A3.putarZ(0.9 + Math.sin(now / 200) * 0.25)));
    kotakM(S, ekor, -6, -3, 4.3, 5.1, -0.4, 0.4, gelap);
  }
  function tikus3D(S, x, z) {
    const m = A3.kali(A3.geser(x, 0, z), A3.skala(SKALA_ORANG)), abu = warna('#4a4238'), ekor = warna('#5c5348');
    kotakM(S, m, 0, 5, 0.3, 2.2, -1, 1, abu);
    kotakM(S, m, 4, 6.2, 0.5, 2.3, -0.8, 0.8, abu);
    kotakM(S, m, 4.2, 4.9, 2.1, 2.8, -0.9, -0.3, ekor); kotakM(S, m, 4.2, 4.9, 2.1, 2.8, 0.3, 0.9, ekor);
    kotakM(S, m, -3.4, 0, 0.6, 1, -0.2, 0.2, ekor);
  }
  const MODEL_EVENT = {
    'kucing-kantor-mampir': (S, E) => {
      const K = E.data.k;
      if (K && K.x >= -8 && K.x <= W + 8) kucing3D(S, K.x + 3, K.y, 0, K.fase === 'tidur' ? 'tidur' : 'jalan', '#d98a3a', 0);
    },
    'kucing-kantor': (S, E) => {
      const D = E.data;
      if (D.x != null) kucing3D(S, D.x, D.y, 0, D.fase === 'duduk' ? 'duduk' : 'jalan', '#c9a06a', D.fase === 'duduk' ? Math.PI : 0);
    },
    // duduk di atas keyboard laptop pegawainya, menghadap dia
    'kucing-di-atas-keyboard': (S, E) => {
      const a = E.data.a;
      if (a) kucing3D(S, a.x + 21, 340, MEJA_H + 1.2, 'duduk', '#c9a06a', -Math.PI / 2);
    },
    'kucing-tidur-di-rak-server': (S) => kucing3D(S, 392, 111, 91, 'tidur', '#c9a06a', Math.PI),
    'kucing-tidur-di-karpet': (S) => kucing3D(S, 242, 246, 0.8, 'tidur', '#d99a4e', 0),
    'tikus-lewat-kolong': (S, E) => { if (E.data.x != null && E.data.x <= 420) tikus3D(S, E.data.x, 116); },
  };

  /* ------------------------------------------------- barang event bermodel
     Barang yang paling sering muncul di gambar event ikut jadi voxel, dari
     keadaan E.data yang sama dengan lukisan 2D-nya. Fungsi biasa = kartu
     gambarProp-nya tidak dilukis lagi; opsi lewat bermodel():
       atas: true      — kartu gambarAtas-nya juga (barang yang sedang dijinjing)
       klip: {x,y,w,h} — kartu gambarProp TETAP dilukis, tapi cuma di bidang ini
                         (kertas flipchart: coretannya hidup, kakinya voxel)
       orang(E, o)     — sunting boneka tamu event dari catatOrangEvent()
                         (teknisi di anak tangga, kurir yang menjinjing kardus)
     Barang di atas taplak meja rapat berdiri di permukaan meja 3D (setinggi
     MEJA_RAPAT.h) di pita kosongnya, z 209..223: di belakang pita itu mik
     (z 205..208), di depannya gelas, botol & map yang statis. Ukurannya ikut
     lukisan 2D, satu satuan per piksel, seperti perabot — bukan SKALA_ORANG. */
  const bermodel = (fn, opsi) => Object.assign(fn, opsi);
  // Balok persegi setebal t dari titik a ke titik b: kaki tangga & easel, gagang pel.
  function balok(S, a, b, t, c, e = 0) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz) || 1, uy = [dx / L, dy / L, dz / L];
    const bantu = Math.abs(uy[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    const ux = norm3(bantu[1] * uy[2] - bantu[2] * uy[1], bantu[2] * uy[0] - bantu[0] * uy[2], bantu[0] * uy[1] - bantu[1] * uy[0]);
    const uz = [ux[1] * uy[2] - ux[2] * uy[1], ux[2] * uy[0] - ux[0] * uy[2], ux[0] * uy[1] - ux[1] * uy[0]];
    kotakM(S, [ux[0], uy[0], uz[0], a[0], ux[1], uy[1], uz[1], a[1], ux[2], uy[2], uz[2], a[2]], -t / 2, t / 2, 0, L, -t / 2, t / 2, c, e);
  }
  // Nampan seng berbibir (gorengan, gelas kopi)
  function nampan(S, x0, x1, z0, z1) {
    const h = MEJA_RAPAT.h, seng = warna('#c9cdd1'), bibir = warna('#eef0f2');
    kotak(S, x0, x1, h, h + 0.5, z0, z1, seng);
    kotak(S, x0, x1, h + 0.5, h + 1.1, z0, z0 + 0.6, bibir); kotak(S, x0, x1, h + 0.5, h + 1.1, z1 - 0.6, z1, bibir);
    kotak(S, x0, x0 + 0.6, h + 0.5, h + 1.1, z0 + 0.6, z1 - 0.6, bibir); kotak(S, x1 - 0.6, x1, h + 0.5, h + 1.1, z0 + 0.6, z1 - 0.6, bibir);
  }
  // Toples bening di atas taplak: kacanya tembus pandang (grup pudar), isinya pejal
  function toples(S, cx, cz, r, tinggi, kaca, tutup) {
    const h = MEJA_RAPAT.h;
    tabung(G.pudar, cx, cz, r, h, h + tinggi, warna(kaca, 0.45), { segmen: 12, tanpaAtas: true });
    tabung(S, cx, cz, r + 0.25, h + tinggi, h + tinggi + 1.1, warna(tutup), { segmen: 12 });
  }
  /* Kerucut 'awas licin' (gambarKerucutLicin 2D: alas 8, badan berstrip
     putih, setinggi 9). h0: tinggi alasnya — kerucut yang dijinjing. */
  function kerucutLicin3D(S, cx, cz, h0 = 0) {
    kotak(S, cx - 4, cx + 4, h0, h0 + 1, cz - 4, cz + 4, warna('#c98a1e'), { sisi: SEMUA });
    tabung(S, cx, cz, 2.7, h0 + 1, h0 + 4, warna('#e8a83a'), { segmen: 8 });
    tabung(S, cx, cz, 2.2, h0 + 4, h0 + 5.2, warna('#f2f0e6'), { segmen: 8 });
    tabung(S, cx, cz, 1.6, h0 + 5.2, h0 + 8, warna('#e8a83a'), { segmen: 8 });
    tabung(S, cx, cz, 0.8, h0 + 8, h0 + 9, warna('#f2c46a'), { segmen: 6 });
  }
  // Papan lipat kuning "awas licin" (gambarPapanLicin): dua daun bertemu di puncak
  function papanLicin3D(S, x, z) {
    for (const [arah, c] of [[1, '#e8b23a'], [-1, '#c9901e']]) {
      const m = A3.kali(A3.geser(0, 0, z + arah * 2.5), A3.putarX(-arah * 0.225));
      kotakM(S, m, x - 4, x + 4, 0, 11.3, -0.2, 0.2, warna(c));
      const zl = arah > 0 ? [0.2, 0.3] : [-0.3, -0.2];
      for (const hb of [3, 6]) kotakM(S, m, x - 4, x + 4, hb, hb + 0.8, zl[0], zl[1], warna('#2c3038'));
    }
  }
  /* Payung lipat (gambarPayungLipat): ujung logam, kain hitam kebiruan yang
     tergulung, batang, gagang kayu melengkung — setinggi 33 seperti 2D.
     miring: rebah ke +x (bersandar). */
  function payung3D(S, x, z, h0, miring) {
    const m = A3.kali(A3.geser(x, h0, z), A3.putarZ(-miring)), kain = warna('#20303f'), lipat = warna('#3b5468');
    kotakM(S, m, -0.35, 0.35, 0, 1.5, -0.35, 0.35, warna('#3a3f45'));
    kotakM(S, m, -1.1, 1.1, 1.5, 20, -1.1, 1.1, kain);
    kotakM(S, m, -1.5, 1.5, 6, 18, -1.5, 1.5, kain);
    kotakM(S, m, -0.3, 0.3, 7, 17, 1.5, 1.6, lipat);                                  // jahitan lipatan
    kotakM(S, m, -1.6, 1.6, 12.2, 13, -1.6, 1.6, warna('#2f4557'));                    // tali pengikat
    kotakM(S, m, -0.4, 0.4, 20, 29.5, -0.4, 0.4, warna('#4a5058'));                    // batang
    const kayu = warna('#6b4a2e');
    kotakM(S, m, -0.6, 0.6, 29.5, 33, -0.6, 0.6, kayu);
    kotakM(S, m, -3.2, 0.6, 32.2, 33.2, -0.6, 0.6, kayu);                              // gagang melengkung
    kotakM(S, m, -3.2, -2.2, 30.4, 33.2, -0.6, 0.6, kayu);
  }
  /* Tangga lipat teknisi AC, berdiri di bawah unit AC (x 336..374) merapat ke
     tembok: kaki depan beranak tangga 125 -> 118, kaki belakang 104 -> 114,5,
     pijakan atas setinggi 42. Bonekanya menapak di anak tangga lewat zTeknisi(). */
  const TANGGA = { x0: 346, x1: 358, zDepan: 125, zBelakang: 104, puncak: 42 };
  function tanggaLipat(S) {
    const T = TANGGA, kayu = warna('#8a7a52'), anak = warna('#a8965f'), zAtas = T.zDepan - 7;
    for (const x of [T.x0, T.x1]) {
      balok(S, [x, 0, T.zDepan], [x, T.puncak, zAtas], 1.2, kayu);
      balok(S, [x, 0, T.zBelakang], [x, T.puncak, zAtas - 3.5], 1.2, kayu);
      balok(S, [x, 14, T.zDepan - 7 * 14 / T.puncak], [x, 14, T.zBelakang + 10.5 * 14 / T.puncak], 0.6, warna('#5a6068'));   // palang pengunci
    }
    for (let h = 7; h < T.puncak; h += 7) {
      const z = T.zDepan - 7 * h / T.puncak;
      kotak(S, T.x0, T.x1, h - 0.45, h + 0.45, z - 0.8, z + 0.8, anak, { sisi: SEMUA });
    }
    kotak(S, T.x0 - 0.8, T.x1 + 0.8, T.puncak, T.puncak + 1.4, zAtas - 4.5, zAtas + 0.8, warna('#6b5c3e'), { sisi: SEMUA });
  }
  // terlipat dan dipanggul: dua pasang kaki rapat, tegak di sisi badan
  function tanggaPanggul(S, x, z) {
    const kayu = warna('#8a7a52'), anak = warna('#a8965f');
    kotak(S, x - 0.6, x + 0.6, 8, 38, z - 6, z - 4.8, kayu, { sisi: SEMUA });
    kotak(S, x - 0.6, x + 0.6, 8, 38, z + 4.8, z + 6, kayu, { sisi: SEMUA });
    for (let h = 12; h < 38; h += 7) kotak(S, x - 0.45, x + 0.45, h, h + 0.8, z - 4.8, z + 4.8, anak);
  }
  /* Kedalaman teknisi: lajur atas waktu datang/pulang; T.y 164 -> 152 waktu
     'naik' (berjalan ke kaki tangga) direntang ke depan anak tangga; waktu
     memanjat bergeser dari depan anak tangga terbawah ke atas pijakan atas. */
  function zTeknisi(T) {
    const z0 = TANGGA.zDepan + 3.2;
    if (T.fase === 'kerja') return z0 - (z0 - 116) * angkatTeknisi(T) / (TANGGA.puncak + 1.4);
    if (T.fase === 'naik' || T.fase === 'turun') return z0 + (T.y - 152) * (LANE_UP - z0) / (LANE_UP - 152);
    return T.y;
  }
  // 2D naik sampai 86 px (kaki di y66, kepala tepat di bawah AC y14..27); di
  // 3D sampai ke pijakan atas: puncak kepalanya ±3 di bawah badan AC (h 83..96)
  const angkatTeknisi = (T) => (TANGGA.puncak + 1.4) * Math.min(1, (T.naik || 0) / 86);
  const tanggaTeknisiBerdiri = () => eventHidup.some((E) => E.def.id === 'teknisi-ac-datang' && E.data.t && E.data.t.tangga);

  Object.assign(MODEL_EVENT, {
    // --- di atas taplak meja rapat
    'gorengan-di-meja-rapat': (S, E) => {
      const h = MEJA_RAPAT.h;
      nampan(S, 236, 256, 210, 220);
      // dua baris tiga; yang diambil hilang dari belakang seperti di 2D
      for (let i = 0; i < Math.min(6, E.data.sisa || 0); i++) {
        const gx = 238.5 + (i % 3) * 5.5, gz = 212 + Math.floor(i / 3) * 3.8;
        const c = warna(i % 2 ? '#b5762e' : '#c98a3a');
        kotak(S, gx, gx + 4, h + 0.5, h + 2, gz, gz + 3, c);
        kotak(S, gx + 0.6, gx + 3.4, h + 2, h + 2.6, gz + 0.5, gz + 2.5, gelapkan(c, 1.12));
      }
    },
    'makan-siang-bareng': (S) => {
      const h = MEJA_RAPAT.h;
      for (let i = 0; i < 3; i++) {
        const x = 228 + i * 13;
        kotak(S, x, x + 8, h, h + 3.2, 211, 218, warna('#c9a86a'));                           // kotak nasi karton
        kotak(S, x + 0.5, x + 7.5, h + 3.2, h + 3.3, 211.5, 217.5, warna('#f4f1e8'), { sisi: S_ATAS });   // nasi
        kotak(S, x + 1, x + 3.5, h + 3.3, h + 4, 213, 215.5, warna('#5f8a42'));               // lalapan
        kotak(S, x + 4.5, x + 7, h + 3.3, h + 4.3, 213.5, 216.5, warna('#8a5a2e'));           // lauk
        kotak(S, x + 5.5, x + 6.5, h + 3.3, h + 3.8, 211.8, 212.8, warna('#c22b2b'));         // sambal
        kotak(S, x, x + 8, h + 3.2, h + 9.6, 210.4, 211, warna('#f2ece0'), { sisi: SEMUA });  // tutup putih terbuka
      }
    },
    'rapat-molor-kopi-masuk': (S, E) => {
      if ((E.data.tahap || 0) < 3) return;
      const h = MEJA_RAPAT.h;
      nampan(S, 258, 272, 210, 218);
      for (const gx of [262, 268]) {
        tabung(S, gx, 214, 1.7, h + 0.5, h + 5, warna('#f2f0e6'), { segmen: 8, atas: warna('#6b4a2e') });
        kotak(S, gx + 1.5, gx + 2.7, h + 1.5, h + 3.8, 213.6, 214.4, warna('#f2f0e6'), { sisi: SEMUA });   // pegangan
      }
    },
    'ulang-tahun-pegawai': (S, E) => {
      const h = MEJA_RAPAT.h, cx = 246, cz = 215;
      tabung(S, cx, cz, 6.6, h, h + 0.4, warna('#eef0f2'), { segmen: 14 });                  // piring
      tabung(S, cx, cz, 5.4, h + 0.4, h + 5, warna('#8a6844'), { segmen: 14, atas: warna('#f2ece0') });
      tabung(S, cx, cz, 5.55, h + 4, h + 5, warna('#f2ece0'), { segmen: 14, tanpaAtas: true });   // krim meleleh di tepi
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, x = cx + Math.cos(a) * 4, z = cz + Math.sin(a) * 4;
        kotak(S, x - 0.5, x + 0.5, h + 5, h + 5.9, z - 0.5, z + 0.5, warna('#c22b2b'));     // ceri
      }
      if (!E.data.tiup) {
        kotak(S, cx - 0.35, cx + 0.35, h + 5, h + 8, cz - 0.35, cz + 0.35, warna('#f2f0e6'));   // lilin
        const nyala = Math.sin(now / 90) > 0;
        kotak(S, cx - 0.45, cx + 0.45, h + 8.2, h + 9.6 + (nyala ? 0.3 : 0), cz - 0.45, cz + 0.45,
          warna(nyala ? '#ffd06a' : '#ffb454'), { sisi: SEMUA, e: 1 });
      }
    },
    // toples undian dikocok ke kanan-kiri sampai satu nama keluar
    'kocok-arisan-bulanan': (S, E) => {
      const h = MEJA_RAPAT.h, cx = 246 + (E.data.keluar ? 0 : (Math.sin(now / 60) > 0 ? 1.2 : -1.2)), cz = 214;
      if (!E.data.keluar) {
        for (let i = 0; i < 4; i++) {
          const gx = cx - 2 + (i % 2) * 2.6, gz = cz - 1.6 + Math.floor(i / 2) * 2.2;
          kotak(S, gx, gx + 1.1, h + 0.3, h + 3.4, gz, gz + 1.1, warna(P.paper));
        }
      }
      toples(S, cx, cz, 4.2, 10, '#cfe0f2', '#eef4fa');
    },
    'oleh-oleh-dinas-luar': (S, E) => {
      const h = MEJA_RAPAT.h, x0 = 237, x1 = 255, z0 = 211, z1 = 219, t = 6;
      const kardus = warna('#a37b4e'), terang = warna('#b98d5e');
      kotak(S, x0, x1, h, h + 0.4, z0, z1, kardus);
      kotak(S, x0, x1, h, h + t, z0, z0 + 0.5, kardus, { sisi: SEMUA });
      kotak(S, x0, x1, h, h + t, z1 - 0.5, z1, kardus, { sisi: SEMUA });
      kotak(S, x0, x0 + 0.5, h, h + t, z0, z1, kardus, { sisi: SEMUA });
      kotak(S, x1 - 0.5, x1, h, h + t, z0, z1, kardus, { sisi: SEMUA });
      // dua tutup terbuka, terkuak ke kiri & kanan (flap 2D)
      for (const [px, arah] of [[x0, 1], [x1, -1]]) {
        kotakM(S, A3.poros(px, h + t, 0, A3.putarZ(arah * 2.2)), arah > 0 ? px : px - 9, arah > 0 ? px + 9 : px, h + t, h + t + 0.4, z0, z1, terang);
      }
      kotak(S, 245, 248, h, h + t + 0.1, z1, z1 + 0.15, warna('#c22b2b'), { sisi: S_DEPAN | S_ATAS });   // pita merah
      const isi = ['#c9a03a', '#3e6b4f', '#b03030', '#3565b0', '#d2a8ff'];
      for (let i = 0; i < Math.min(5, E.data.sisa || 0); i++) {
        const bx = x0 + 1.5 + i * 3.1;
        kotak(S, bx, bx + 2.6, h + 0.4, h + t + 1, z0 + 1.5, z1 - 1.5, warna(isi[i]));
      }
    },
    // nasi kuning bertingkat di tampah berdaun pisang; 12 tingkat waktu utuh,
    // susut 3 tingkat tiap 8 detik sesudah dipotong (cabai merah di puncaknya)
    'tumpeng-syukuran': (S, E) => {
      const h = MEJA_RAPAT.h, cx = 246, cz = 215, baris = Math.max(0, E.data.baris || 0);
      tabung(S, cx, cz, 9.5, h, h + 0.6, warna('#c9a86a'), { segmen: 16 });
      tabung(S, cx, cz, 8.8, h + 0.6, h + 0.8, warna('#3e6b4f'), { segmen: 16 });
      ['#c98a3a', '#f2f0e6', '#5f8a42', '#8a5a2e', '#e8c93a', '#c22b2b', '#5f8a42', '#c98a3a'].forEach((c, i, semua) => {
        const a = (i / semua.length) * Math.PI * 2, lx = cx + Math.cos(a) * 7.2, lz = cz + Math.sin(a) * 7.2;
        kotak(S, lx - 1, lx + 1, h + 0.8, h + 2, lz - 1, lz + 1, warna(c));               // lauk pauk melingkar
      });
      const nasi = warna('#f2c14e');
      for (let i = 0; i < baris; i++) {
        tabung(S, cx, cz, (18 - i * 1.4) * 0.31, h + 0.8 + i * 2, h + 2.8 + i * 2, nasi, { segmen: 12 });
      }
      if (E.data.potong && baris > 0) kotak(S, cx - 0.5, cx + 0.5, h + 0.8 + baris * 2, h + 2.8 + baris * 2, cz - 0.5, cz + 0.5, warna('#c22b2b'));
    },
    'rapat-pleno-kursi-penuh': (S) => {
      const h = MEJA_RAPAT.h;
      kotak(S, 238, 248, h, h + 2.2, 212, 219, warna(P.paper));                              // tumpukan berkas
      for (let i = 1; i < 4; i++) kotak(S, 238, 248, h + i * 0.55, h + i * 0.55 + 0.1, 219, 219.05, warna('#d9d4c2'), { sisi: S_DEPAN });
      const nyala = Math.sin(now / 300) > 0;                                                   // LED mik tengah berkedip
      kotak(S, 246, 247.4, h + 0.3, h + 0.8, 208, 208.15, warna(nyala ? '#e8453f' : '#5c2222'), { sisi: S_DEPAN, e: nyala ? 1 : 0 });
    },
    // laptop rapat daring: layarnya menghadap penonton seperti di 2D, beku = abu
    'rapat-daring': (S, E) => {
      const h = MEJA_RAPAT.h, x0 = 239, x1 = 253, zb = 209.5, zf = 217;
      kotak(S, x0, x1, h, h + 0.7, zb, zf, warna('#b6bcc1'));
      kotak(S, x0 + 1, x1 - 1, h + 0.7, h + 0.75, zb + 2, zf - 2.5, warna('#3a3f45'), { sisi: S_ATAS });
      const m = A3.poros(0, h + 0.7, zb, A3.putarX(-0.12)), beku = !!E.data.beku;
      kotakM(S, m, x0, x1, h + 0.7, h + 10, zb - 0.6, zb, warna('#9aa1a6'));
      kotakM(S, m, x0 + 0.8, x1 - 0.8, h + 1.5, h + 9.2, zb, zb + 0.05, warna(beku ? '#6a7078' : '#1c4e8a'), beku ? 0.3 : 0.9, S_DEPAN);
      if (!beku) {
        const k = Math.floor(now / 260) % 3;
        for (let i = 0; i < 3; i++) {
          kotakM(S, m, x0 + 2, x0 + 5 + i * 2, h + 7.5 - i * 2, h + 8.1 - i * 2, zb + 0.05, zb + 0.1, warna(i === k ? '#ffffff' : '#7aa5e8'), 1, S_DEPAN);
        }
      }
    },
    // sembilan takjil berjajar, tiga gelas teh manis, sepiring kurma
    'buka-puasa-bersama': (S) => {
      const h = MEJA_RAPAT.h;
      for (let i = 0; i < 9; i++) {
        const x = 186 + i * 15;
        kotak(S, x, x + 6, h, h + 2.6, 214, 219, warna('#d9b46a'));
        kotak(S, x + 0.4, x + 5.6, h + 2.6, h + 2.7, 214.4, 218.6, warna('#efd299'), { sisi: S_ATAS });
        kotak(S, x + 2, x + 4, h + 2.7, h + 3.3, 215.5, 217.5, warna('#8a6844'));
      }
      for (const gx of [201.5, 247.5, 293.5]) tabung(S, gx, 222, 1.6, h, h + 4.5, warna('#a86a3a'), { segmen: 8, atas: warna('#c98d55') });
      tabung(S, 244, 228, 4.5, h, h + 0.5, warna('#eef0f2'), { segmen: 12 });
      for (let i = 0; i < 5; i++) {
        const kx = 241.2 + (i % 3) * 2.2, kz = 226.6 + Math.floor(i / 3) * 2.2;
        kotak(S, kx, kx + 1.4, h + 0.5, h + 1.4, kz, kz + 1.3, warna('#4a2f1c'));
      }
    },
    'halal-bihalal-lebaran': (S) => {
      const h = MEJA_RAPAT.h, cx = 235, cz = 223;
      ['#c9a03a', '#b03030', '#3e6b4f', '#e0ae80', '#c9a03a', '#e0ae80'].forEach((c, i) => {
        const a = i * 1.7, x = cx + Math.cos(a) * 1.4, z = cz + Math.sin(a) * 1.4, y = h + 0.4 + (i % 3) * 1.6;
        kotak(S, x - 0.6, x + 0.6, y, y + 1.1, z - 0.6, z + 0.6, warna(c));                // kue kering warna-warni
      });
      toples(S, cx, cz, 3, 6.5, '#dcd6c4', '#8a6844');
    },
    'nota-dinas-dari-pusat': (S, E) => {
      if (!E.data.taruh) return;
      const h = MEJA_RAPAT.h;
      kotak(S, 230, 238, h, h + 0.4, 229, 234, warna('#f2efe4'));                             // amplop dari pusat
      kotak(S, 235, 237, h + 0.4, h + 0.5, 229.6, 231.6, warna(P.amber), { sisi: S_ATAS });
    },

    // --- tangga, alat, dan bawaan
    'teknisi-ac-datang': bermodel((S, E) => {
      const T = E.data.t;
      if (!T || T.fase === 'selesai' || T.x < -16) return;
      if (T.tangga) {
        tanggaLipat(S);
        tabung(S, 343, 101.4, 1.1, 0, 83, warna('#5a6068'), { segmen: 6 });                   // pipa pembuangan dari bawah AC ke plin
      } else {
        tanggaPanggul(S, T.x + (T.fase === 'pulang' ? 8.4 : -12.6), zTeknisi(T));
      }
      // ember penadahnya digeser ke kiri selama tangga berdiri; bekas basah di tempat lamanya
      if (T.tangga || E.data.emberGeser) {
        tabung(S, 329, 124, 6.5, 0, 9, warna(P.blue), { segmen: 12, atas: warna('#2a4a8a') });
        const isi = (RUANGAN.emberIsi || 0) / 90;
        if (isi > 0.02) tabung(S, 329, 124, 6, 0, 8 * isi, campur(warna(P.blue), warna('#4a7a90'), isi), { segmen: 12, atas: warna('#9fd0ee') });
      }
      if (E.data.emberGeser) kotak(G.pudar, 341.5, 354.5, 0.06, 0.12, 104, 116, warna('#3a5a70', 0.35), { sisi: S_ATAS });
    }, {
      orang(E, o) {
        const T = E.data.t;
        if (!T) return;
        o.x = T.x; o.y = zTeknisi(T); o.angkat = 0;
        if (T.fase === 'kerja') {
          o.angkat = angkatTeknisi(T);
          o.face = 'up';
          if (T.naik > 6) { o.pose = 'angkat'; o.bawa = 'obeng'; }
        } else {
          o.state = 'walk';
          o.face = { naik: 'up', turun: 'down', pulang: 'left' }[T.fase] || 'right';
        }
      },
    }),
    'bagan-di-flipchart': bermodel((S) => {
      // kertas & penjepitnya tetap kartu (bidang klip); kaki tripod & papan sandarannya voxel
      const z = 253, besi = warna('#7c838a');
      balok(S, [97.6, 0, z + 3.5], [99, 7.5, z - 1], 0.9, besi);
      balok(S, [120.4, 0, z + 3.5], [119, 7.5, z - 1], 0.9, besi);
      balok(S, [109, 0, z - 13], [109, 41, z - 2.2], 0.9, besi);
      kotak(S, 95.5, 122.5, 7, 43, z - 2.3, z - 1.6, warna('#4a5058'), { sisi: SEMUA });
    }, { klip: { x: 94, y: 206, w: 30, h: 40 } }),
    // kurir selalu menghadap penonton: kardus di tangan kanannya (sisi +x, a.bawa
    // boneka), tablet tanda tangan di tangan kirinya
    'kurir-paket-datang': bermodel((S, E) => {
      const T = E.data.t;
      if (!T || T.x < -12) return;
      const s = SKALA_ORANG, x = T.x, z = T.y;
      kotak(S, x - 9 * s, x - 4 * s, 9 * s, 16 * s, z + 2.4, z + 3.2, warna('#20242c'), { sisi: SEMUA });
      kotak(S, x - 8 * s, x - 5 * s, 10 * s, 15 * s, z + 3.2, z + 3.3, warna('#7aa5e8'), { sisi: S_DEPAN, e: 0.6 });
    }, { orang(E, o) { if (!E.data.bawa) o.bawa = 'kardus'; } }),
    // gagang pel dari tangan petugas ke kepala pel yang menyapu lantai di depan kakinya
    'ob-ngepel-lantai': (S, E) => {
      const T = E.data.t;
      if (!T || T.x < -14) return;
      const arah = T.fase === 'pulang' ? -1 : 1, s = SKALA_ORANG, z = LANE_DOWN, kx = T.x + arah * 8 * s;
      balok(S, [T.x + arah * 7 * s, 18 * s, z + 2], [kx, 0.8, z + 8], 0.8, warna('#8a6844'));
      kotak(S, kx - 5.2, kx + 5.2, 0, 0.5, z + 6.3, z + 10.2, warna('#9aa1a6'));
      kotak(S, kx - 5, kx + 5, 0.5, 1.5, z + 6.5, z + 10, warna('#c9c3b0'));
      if (E.data.papan) papanLicin3D(S, 196, 268);
    },
    'payung-basah-di-pojok': bermodel((S, E) => {
      if (E.data.taruh) { payung3D(S, 54, 270, 0, 0.07); return; }
      const a = E.data.a;
      if (!a || a.eventKerja !== E) return;
      const [px, pz] = posisiOrang(a);
      payung3D(S, px + (a.face === 'left' ? -7 : 7), pz + 1.5, 1.5, 0);       // dijinjing tegak di sisi badan
    }, { atas: true }),
    'ember-luber-lantai-licin': bermodel((S, E) => {
      if (E.data.kerucut) { kerucutLicin3D(S, 328, 166); kerucutLicin3D(S, 370, 166); }
      const a = E.data.a;
      if (!E.data.bawa || !a) return;
      const [px, pz] = posisiOrang(a);
      kerucutLicin3D(S, px + (a.face === 'left' ? -8 : 8), pz + 2, 9);         // dijinjing setinggi pinggang
    }, { atas: true }),
    // ember kedua di bawah atap yang bocor (pojok kiri depan)
    'atap-bocor-musim-hujan': (S) => {
      if (!RUANGAN.emberKedua) return;
      tabung(S, 118, 249, 4.2, 0, 6, warna('#4a7fd0'), { segmen: 10, atas: warna('#79b0e8') });
    },

    // --- yang lain
    // laba-laba turun dari plafon di atas meja rapat, ujung benangnya
    // bergoyang waktu menggantung (d.y 6 -> 214 di 2D = 108 -> 23 di sini)
    'laba-laba-turun-di-rapat': (S, E) => {
      const d = E.data, y = Math.min(214, d.y || 6);
      const x = 246 + ((!d.naik && y >= 214) ? Math.sin(now / 420) * 0.8 : 0), z = 222;
      const h = MEJA_RAPAT.h + 7 + (214 - y) * (85 / 208), hitam = warna('#2a241e');
      kotak(G.pudar, x - 0.09, x + 0.09, h + 1.6, TINGGI_DINDING + 2, z - 0.09, z + 0.09, warna('#e8e8e0', 0.55), { sisi: S_DEPAN | S_BELAKANG | S_KIRI | S_KANAN });
      kotak(S, x - 1, x + 1, h, h + 1.4, z - 1.1, z + 1.1, hitam, { sisi: SEMUA });
      kotak(S, x - 0.6, x + 0.6, h + 1.3, h + 2, z - 0.6, z + 0.6, hitam, { sisi: SEMUA });
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const kz = z - 1 + i * 0.66, lutut = [x + sx * 2.2, h + 1.6, kz + (i - 1.5) * 0.5];
          balok(S, [x + sx * 0.8, h + 0.8, kz], lutut, 0.25, hitam);
          balok(S, lutut, [x + sx * 2.9, h - 0.6, kz + (i - 1.5) * 0.8], 0.25, hitam);
        }
      }
    },
    // toa pengumuman di tembok, di atas lambrequin gorden jendela
    'pengumuman-lewat-toa': (S) => {
      const abu = warna('#8b9098');
      kotak(S, 200, 202, 94, 95.6, DINDING_Z, 109, warna('#aeb4ba'), { sisi: SEMUA });        // lengan siku dari tembok
      const m = A3.kali(A3.geser(201, 91, 108.5), A3.putarX(0.35));                          // corong menunduk ke ruangan
      kotakM(S, m, -1.8, 1.8, -1.8, 1.8, -2.5, 0.5, abu);
      kotakM(S, m, -5, 5, -3.4, 3.4, 0.5, 4, abu);
      kotakM(S, m, -4.2, 4.2, -2.7, 2.7, 4, 4.1, warna('#2c3038'), 0, S_DEPAN);
    },
    // kursinya sendiri yang berputar (kursi sisi dekat di susunDinamis)
    'kursi-kosong-berputar-sendiri': () => {},
  });

  /* ------------------------------------- barang event bermodel, gelombang 2
     Yang tadinya berdiri sebagai kartu padahal tergeletak (dagangan, semut,
     colokan, dus ambruk, petak silau sore), bawaan orang luar yang paling
     sering lewat (kantong kopi ojol, topi & senter satpam, galon, nasi kotak,
     kotak dana sosial), perangkat kantor yang berulah (telepon, wifi,
     stabilizer, fotokopi, printer, layar rak server, kaca pintu kadis), ayam
     kampung, dan lomba makan kerupuk. Barang yang dipanggul menempel ke
     matriks badan boneka (st.kepala dari susunOrang), jadi ikut arah hadapnya. */
  const bertopi = (o) => { o.pal = { ...o.pal, head: 'topi' }; };   // pal-nya objek baru tiap gambarOrangLuar
  const badanTamu = (E, i = 0) => {
    const arr = tiruanEvent.get(E), o = arr && arr[i], st = o && keadaanOrang.get(o);
    return st && st.kepala;
  };
  const badanPegawai = (a) => { const st = a && keadaanOrang.get(a); return st && st.kepala; };
  // Ayam kampung (gambarAyamKampung): badan krem, ekor cokelat tegak, jengger
  // merah; lokal menghadap +x, arah -1 = menghadap -x. patuk: kepala menunduk.
  function ayam3D(S, x, z, arah, maju, patuk) {
    const m = A3.kali(A3.geser(x, 0, z), A3.kali(A3.putarY(arah < 0 ? Math.PI : 0), A3.skala(SKALA_ORANG)));
    const badan = warna('#e0d2b4'), kaki = warna('#d9a33a'), angguk = maju ? 0.35 : 0;
    kotakM(S, m, -0.8, -0.2, 0, 2.2, -1, -0.4, kaki); kotakM(S, m, 0.2, 0.8, 0, 2.2, 0.4, 1, kaki);
    kotakM(S, m, -2.8, 2.2, 2.2 + angguk, 6 + angguk, -1.8, 1.8, badan);
    kotakM(S, m, -2.4, 1.8, 6 + angguk, 6.4 + angguk, -1.5, 1.5, warna('#f2e8d2'));
    kotakM(S, m, -4.2, -2.4, 4.4 + angguk, 8.6 + angguk, -1.1, 1.1, warna('#8a6844'));          // ekor tegak
    const kp = A3.kali(m, A3.poros(1.8, 5.8 + angguk, 0, A3.putarZ(patuk ? -1 : 0)));
    kotakM(S, kp, 1.2, 3, 5.8 + angguk, 9.8 + angguk, -0.9, 0.9, badan);                       // leher & kepala
    kotakM(S, kp, 1.5, 2.6, 9.8 + angguk, 11.2 + angguk, -0.35, 0.35, warna('#c22b2b'));         // jengger
    kotakM(S, kp, 2.4, 3.6, 7.6 + angguk, 8.4 + angguk, -0.5, 0.5, warna('#c22b2b'));            // gelambir
    kotakM(S, kp, 3, 4.2, 8.6 + angguk, 9.2 + angguk, -0.35, 0.35, warna('#e8a33a'));            // paruh
    for (const s of [-1, 1]) kotakM(S, kp, 2.6, 3.05, 9 + angguk, 9.5 + angguk, s * 0.55 - 0.2, s * 0.55 + 0.2, warna('#2c2620'));
  }
  // Galon biru dipanggul di bahu kanan, rebah ke depan-belakang (matriks badan K)
  function galonDipanggul(S, K) {
    const m = A3.kali(K, A3.poros(5.2, 18, 0, A3.putarX(Math.PI / 2)));
    const air = warna('#7db8e8', 0.9);
    kotakM(S, m, 4.2, 8.6, 13.5, 21.5, -2.2, 2.2, air);
    kotakM(S, m, 4.6, 8.2, 21.5, 22.5, -1.8, 1.8, air);
    kotakM(S, m, 5.6, 7.2, 22.5, 23.6, -0.8, 0.8, warna('#5f9fd4'));                           // tutup
  }
  // Kerupuk putih yang digantung: cakram tipis menghadap penonton, berlubang
  function kerupuk3D(S, cx, cy, z, r) {
    const c = warna('#e8c88a'), terang = warna('#f2dcaa');
    for (let j = -2; j <= 2; j++) {
      const y = cy + (j / 2.5) * r, w = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
      kotak(S, cx - w, cx + w, y - r / 5, y + r / 5, z - 0.25, z + 0.25, j === 2 ? terang : c, { sisi: SEMUA });
    }
    kotak(S, cx - r * 0.5, cx - r * 0.2, cy - r * 0.1, cy + r * 0.2, z + 0.25, z + 0.3, warna('#c9a86a'), { sisi: S_DEPAN });
  }

  Object.assign(MODEL_EVENT, {
    // --- yang tergeletak
    'pedagang-gelar-dagangan': (S, E) => {
      const P2 = E.data.pedagang;
      if (!P2 || P2.fase !== 'gelar') return;
      kotak(S, 168, 194, 0, 0.4, 264, 274, warna('#8a5f8a'), { sisi: SEMUA, w: { atas: warna('#9a6c9a') } });   // kain digelar
      kotak(S, 168, 194, 0.4, 0.45, 264, 265, warna('#a67fa6'), { sisi: S_ATAS });
      const warnaDagangan = ['#c9a03a', '#3e6b4f', '#b03030', '#3565b0'];
      for (let i = 0; i < 8; i++) {
        const x = 170 + (i % 4) * 6, z = 266 + ((i / 4) | 0) * 4, t = 1.8 + ((i * 7) % 3) * 0.9;
        kotak(S, x, x + 4, 0.4, 0.4 + t, z, z + 3, warna(warnaDagangan[i % 4]));
        kotak(S, x + 0.5, x + 3.5, 0.4 + t, 0.5 + t, z + 0.5, z + 2.5, warna('#f2f0e6'), { sisi: S_ATAS });   // label
      }
    },
    // barisan semut: di lantai sepanjang z 294, lalu ke belakang meja kerja,
    // memanjat sisinya, dan di atas meja menuju bungkus gorengan
    'semut-mengular-ke-gorengan': (S, E) => {
      const D = E.data;
      if (!D.jalur) return;
      const cx = D.cx, bx = cx + 8, sx = D.jalur[0][0], h = MEJA_H, hitam = warna('#2c2620');
      if (D.bungkus) {                                     // di antara pot mini (cx+1..5) dan laptop (cx+11..)
        const getar = D.getar && Math.sin(now / 60) > 0 ? 0.3 : 0;
        kotak(S, cx + 5.5, cx + 10.8, h, h + 1.2 + getar, 339, 344, warna('#c9b088'));               // bungkus kertas minyak
        kotak(S, cx + 7, cx + 9.5, h + 1.2 + getar, h + 1.3 + getar, 340.5, 342.5, warna('#a8845a'), { sisi: S_ATAS });
      }
      const L1 = Math.abs(sx - bx), titik = [[sx, 0, 294], [bx, 0, 294], [bx, 0, 330.6], [bx, h + 0.1, 330.6], [bx, h + 0.1, 339]];
      const ruas = [];
      for (let i = 1; i < titik.length; i++) ruas.push(Math.hypot(titik[i][0] - titik[i - 1][0], titik[i][1] - titik[i - 1][1], titik[i][2] - titik[i - 1][2]));
      const total3 = ruas.reduce((p, q) => p + q, 0), total2 = L1 + 34;
      const di = (d) => {
        let sisa = d * total3 / total2;
        for (let i = 0; i < ruas.length; i++) {
          if (sisa <= ruas[i]) { const t = sisa / ruas[i], A = titik[i], B = titik[i + 1]; return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; }
          sisa -= ruas[i];
        }
        return titik[titik.length - 1];
      };
      for (let i = D.hapus; i < 14; i++) {
        const d = D.maju - i * 4;
        if (d < 0) continue;
        const [x, y, z] = di(d), naik = y > 0.5 && y < h;
        kotak(S, x - 0.4, x + 0.4, y, y + (naik ? 0.8 : 0.45), z - (naik ? 0.25 : 0.4), z + (naik ? 0.05 : 0.4), hitam, { sisi: SEMUA });
      }
    },
    // terminal colokan penuh di lantai kolong meja kerja, kabelnya semrawut ke depan
    'colokan-terminal-penuh': (S, E) => {
      kotak(S, 150, 166, 0, 1.6, 334, 339, warna('#eef0ea'), { sisi: SEMUA, w: { atas: warna('#ffffff') } });
      const n = E.data.cabut ? 3 : 4, kabel = warna('#4a5058');
      for (let i = 0; i < n; i++) kotak(S, 152 + i * 4, 155 + i * 4, 1.6, 3.6, 335, 338, warna('#c9cdd1'), { sisi: SEMUA });
      for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 6; k++) {
          const x = 153.5 + i * 4 + Math.sin(k / 1.2 + i) * 2, z = 339 + k * 2.2;
          kotak(S, x - 0.35, x + 0.35, 0, 0.55, z, z + 2.3, kabel);
        }
      }
    },
    'dus-arsip-ambruk': (S, E) => {
      if (E.data.sisa <= 0) return;
      const x = pantriX(410), dus = warna('#a37b4e');
      // dus terguling: rebah, mulutnya menghadap penonton, kertasnya tumpah
      kotak(S, x, x + 20, 0, 9, 294, 304, dus, { sisi: TANPA_BAWAH & ~S_DEPAN });
      kotak(S, x + 1, x + 19, 0.5, 8.5, 303.6, 303.8, warna('#5a4026'), { sisi: S_DEPAN });                 // dalam dus yang gelap
      kotak(S, x + 2, x + 18, 0.5, 4, 296, 304.5, warna(P.paper), { sisi: TANPA_BAWAH });                   // tumpukan berkas di mulutnya
      for (let i = 0; i < Math.min(6, E.data.sisa); i++) {
        const px = pantriX(400) + i * 11, pz = 309 + (i % 2) * 4;
        kotakM(S, A3.kali(A3.geser(px + 2, 0.05 + i * 0.02, pz), A3.putarY(0.3 * (i % 3) - 0.3)), -3, 3, 0, 0.25, -2, 2, warna(P.paper));
      }
    },
    // tiga dus berkas auditor di depan ujung kiri meja rapat (2D-nya di x196..234
    // bertumpuk dengan kursi sisi dekat pertama — di 3D kursi itu benda pejal)
    'audit-bpk': (S, E) => {
      if (E.umur > 68) return;
      for (let d = 0; d < 3; d++) {
        const x = 168 + d * 12;
        kotak(S, x, x + 11.6, 0, 10, 247, 256, warna('#a37b4e'), { w: { atas: warna('#b98d5e') } });          // dus berkas audit
        kotak(S, x + 2, x + 9.6, 3, 7, 256, 256.1, warna('#b98d5e'), { sisi: S_DEPAN });
        kotak(S, x + 3.5, x + 8, 4.5, 5.5, 256.1, 256.15, warna(P.paper), { sisi: S_DEPAN });                // label
      }
    },
    // silau matahari sore menembus jendela: petak hangat di lantai, memudar 6 detik
    'silau-sore-gorden': (S, E) => {
      if (E.umur > 6) return;
      const c = warna('#ffd88a'), ca = [c[0], c[1], c[2], 0.26 * Math.max(0, 1 - E.umur / 6)];
      G.sinar.segi([150, 0.15, 200], [300, 0.15, 200], [238, 0.15, 101], [186, 0.15, 101], [0, 1, 0], ca, UV_POLOS, 0.7);
    },
    // cahaya monitor lembur sudah dipancarkan layar-layar 3D-nya sendiri
    'lembur-sampai-malam': () => {},

    // --- bawaan orang luar
    'ojol-antar-kopi': bermodel(() => {}, { orang(E, o) { if (!E.data.pegang) o.bawa = 'kantong'; } }),
    'ojol-datang-bawa-pesanan': bermodel(() => {}, { orang(E, o) { o.bawa = 'kantong'; } }),
    'satpam-patroli': bermodel(() => {}, { orang(E, o) { bertopi(o); o.bawa = 'senter'; } }),
    'tukang-galon-datang': (S, E) => {
      const T = E.data.t, K = badanTamu(E);
      if (!T || T.panggul === false || !K) return;
      if (T.panggul === 'angkat') {
        const [px, pz] = [T.x, T.y];
        tabung(S, px, pz + 5, 4.4, 18, 30, warna('#7db8e8', 0.9), { segmen: 10, atas: warna('#5f9fd4') });   // diangkat ke dispenser
      } else galonDipanggul(S, K);
    },
    'nasi-kotak-datang': (S, E) => {
      const T = E.data.t, h = MEJA_RAPAT.h, putih = warna('#f2ece0'), karet = warna('#c9a03a');
      const kotakNasi = (x0, x1, y0, z0, z1) => {
        kotak(S, x0, x1, y0, y0 + 3.4, z0, z1, putih, { w: { atas: warna('#f6f1e6') } });
        kotak(S, x0 + (x1 - x0) * 0.6, x0 + (x1 - x0) * 0.7, y0, y0 + 3.5, z0 - 0.05, z1 + 0.05, karet);   // karet gelang
      };
      if (T && T.x > -12 && T.x < W + 12 && !E.data.taruh) {
        const K = badanTamu(E);
        if (K) {                                                                                       // tiga kotak dipanggul di bahu kanan
          for (let i = 0; i < 3; i++) {
            kotakM(S, K, 4.2, 10.6, 16.6 + i * 2.6, 19 + i * 2.6, -2.4, 2.4, putih);
            kotakM(S, K, 8.2, 8.9, 16.6 + i * 2.6, 19.05 + i * 2.6, -2.45, 2.45, karet);
          }
        }
      }
      for (let i = 0; i < (E.data.tumpuk || 0); i++) kotakNasi(306, 315, h + i * 3.5, 231, 238);   // tumpukan di ujung meja rapat
      for (const k of (E.data.kotak || [])) {
        const z = k.y < 210 ? 214 : 230;
        kotakNasi(k.x, k.x + 7, h, z, z + 5);
      }
    },
    'kotak-dana-sosial-keliling': (S, E) => {
      const a = E.data.a;
      if (!a) return;
      const kayu = warna('#8a6844'), isi = E.data.isi || 0;
      const kotakDana = (m) => {
        kotakM(S, m, -3, 3, 0, 5, -2.5, 2.5, kayu);
        kotakM(S, m, -3.1, 3.1, 5, 5.4, -2.6, 2.6, warna('#a5804f'));
        kotakM(S, m, -1.2, 1.2, 5.4, 5.45, -0.3, 0.3, warna('#3a2a18'));                               // celah
        for (let i = 0; i < Math.min(5, isi); i++) kotakM(S, m, -1 + i * 0.3, 0.6 + i * 0.3, 4.4, 6.2 + i * 0.25, -0.12, 0.12, warna(P.paper));
      };
      if (E.data.taruh) { kotakDana(A3.geser(244, MEJA_RAPAT.h, 234)); return; }                    // di tepi depan meja rapat
      const K = badanPegawai(a);                                    // 2D juga tidak menanyakan eventKerja-nya
      if (K) kotakDana(A3.kali(K, A3.kali(A3.geser(4.6, 10.5, 3.6), A3.skala(1 / SKALA_ORANG))));   // didekap di dada kanan
    },
    'ayam-nyelonong-masuk': bermodel((S, E) => {
      const A = E.data.ay;
      if (!A) return;
      if (E.data.bulu) {
        kotak(S, E.data.bulu.x, E.data.bulu.x + 2, 0, 0.3, E.data.bulu.y - 1, E.data.bulu.y + 0.5, warna('#f2ece0'), { sisi: SEMUA });
      }
      if (A.fase !== 'keluar' && A.x > -14 && A.x < W + 14) {
        ayam3D(S, A.x, A.y, A.arah, A.maju, A.fase === 'patuk' && Math.sin(now / 110) > 0);
      }
    }, { orang(E, o) { bertopi(o); } }),

    // --- perangkat kantor
    // telepon meja di tepi depan meja stempel, gagangnya bergetar; gelombang dering memudar ke atas
    'telepon-kantor-berdering': (S, E) => {
      const h = MEJA_STEMPEL_H, getar = !E.data.diangkat && Math.sin(now / 50) > 0 ? 0.5 : 0;
      kotak(S, 296, 306, h, h + 2, 113.4, 117.8, warna('#6a7078'), { w: { atas: warna('#8b9098') } });
      kotak(S, 299, 303, h + 2, h + 2.2, 114.5, 116.5, warna('#2c3038'), { sisi: S_ATAS });                    // tombol
      if (!E.data.diangkat) {
        kotak(S, 296.5 + getar, 305.5 + getar, h + 2.2 + getar * 0.6, h + 3.4 + getar * 0.6, 113.8, 115.4, warna('#4a5058'), { sisi: SEMUA });
        const p = (Math.sin(now / 190) + 1) / 2, r = 4 + p * 4, c = warna('#8b9098');
        for (let i = 0; i <= 8; i++) {
          const a = Math.PI * i / 8, x = 301 + Math.cos(a) * r, y = h + 3 + Math.sin(a) * r;
          kotak(G.pudar, x - 0.4, x + 0.4, y - 0.4, y + 0.4, 115.4, 116, [c[0], c[1], c[2], 1 - p], { sisi: SEMUA });
        }
      }
    },
    // tiga busur sinyal di atas rak server: yang padam belum tersambung lagi
    'wifi-megap-megap': (S, E) => {
      for (let i = 0; i < 3; i++) {
        const hidup = E.data.pulih || Math.floor(now / 600) % 3 <= i, c = hidup ? warna('#7ee787') : warna('#2f4a36');
        const r = 4 + i * 3;
        for (let k = 0; k <= 6; k++) {
          const a = Math.PI * (0.15 + 0.7 * k / 6), x = 400 + Math.cos(a) * r, y = 92 + Math.sin(a) * r;
          kotak(S, x - 0.55, x + 0.55, y - 0.4, y + 0.4, 110.6, 111.4, c, { sisi: SEMUA, e: hidup ? 0.9 : 0 });
        }
      }
    },
    // stabilizer menempel di tembok di atas ember AC, jarumnya mengamuk sampai disentuh
    'stabilizer-berdengung': (S, E) => {
      const g = E.data.diam ? 0 : (Math.sin(now / 42) > 0 ? 0.3 : -0.3), x0 = 346 + g, z1 = DINDING_Z + 5.5;
      kotak(S, x0, x0 + 14, 30, 41, DINDING_Z, z1, warna('#e2ddc8'), { sisi: SEMUA, w: { atas: warna('#f2eeda') } });
      kotak(S, x0 + 1, x0 + 13, 31, 32.6, z1, z1 + 0.1, warna('#cdc7ad'), { sisi: S_DEPAN });
      kotak(S, x0 + 2, x0 + 9, 34, 39.5, z1, z1 + 0.1, warna('#f6f3e9'), { sisi: S_DEPAN });                // muka meter
      const su = Math.PI - Math.PI * (E.data.jarum || 0);
      kotakM(S, A3.kali(A3.geser(x0 + 5.5, 34.6, z1 + 0.15), A3.putarZ(su - Math.PI / 2)), -0.2, 0.2, 0, 4, 0, 0.1, warna('#2c3440'));
      const led = E.data.diam ? '#3e6b4f' : '#c22b2b';
      kotak(S, x0 + 10.5, x0 + 12, 37, 38.5, z1, z1 + 0.25, warna(led), { sisi: SEMUA, e: 0.9 });
    },
    // fotokopi macet: lampu merah berkedip di panelnya, laci kertas bawah tertarik keluar
    'kertas-nyangkut-di-fotokopi': (S, E) => {
      const F = FOTOKOPI, T = E.data.tahap, hF = F.h - 12;
      if ((T === 'macet' || T === 'cabut') && Math.floor(now / 300) % 2) kotak(S, F.x + F.w - 5, F.x + F.w - 3, hF + 0.1, hF + 0.6, 116, 118, warna('#e05a5a'), { sisi: SEMUA, e: 1 });
      if (T === 'cabut' || T === 'isi') {
        // laci kertas bawah relief fotokopi (h 4..10, muka 120,3) yang tertarik keluar
        kotak(S, F.x + 3, F.x + F.w - 5, 4, 10, 117, 127, warna('#b4b8b0'), { sisi: SEMUA, w: { atas: warna('#c8ccc4') } });
        kotak(S, F.x + 5, F.x + F.w - 7, 10, 10.1, 118, 126, warna(P.paper), { sisi: S_ATAS });                // rim kertas di dalamnya
        kotak(S, F.x + 12, F.x + F.w - 14, 6, 7, 127, 127.6, warna('#8d948c'), { sisi: SEMUA });              // pegangan laci
      }
    },
    // kertas "KUOTA" ditempel di muka printer, lampunya merah berkedip
    'kuota-fotokopi-habis': (S) => {
      const z = 114.1, h = 20;
      kotak(S, 203, 223, h + 2.6, h + 9.4, z, z + 0.15, warna('#f4f2ea'), { sisi: SEMUA });
      kotak(S, 204, 222, h + 8.4, h + 8.8, z + 0.15, z + 0.2, warna('#c22b2b'), { sisi: S_DEPAN });
      for (let i = 0; i < 5; i++) kotak(S, 205 + i * 3.3, 207.4 + i * 3.3, h + 4.6, h + 7, z + 0.15, z + 0.2, warna('#2c3440'), { sisi: S_DEPAN });
      const nyala = Math.sin(now / 333) > 0, atas = h + (MOD.printerMacet ? 9 : 12);   // di tutup printer (printerVoxel)
      kotak(S, 219, 221, atas, atas + 0.6, 111, 113, warna(nyala ? '#e8453f' : '#5c2222'), { sisi: SEMUA, e: nyala ? 1 : 0 });
    },
    // silau matahari sore di layar rak server: petak putih yang memudar
    'matahari-silau-monitor': (S, E) => {
      if (E.umur > 10) return;
      kotak(G.sinar, 384, 394, 0.5, 12, 121, 121.1, [1, 1, 1, 0.5 * Math.max(0, 1 - E.umur / 10)], { sisi: S_DEPAN, e: 0.8 });   // di muka UPS (120,9)
    },
    // layar rak server menganggur: logo jeruji amber berputar di layar gelap
    'layar-server-idle-logo': (S, E) => {
      kotak(S, 390, 402, 1, 11, 120.92, 121.02, warna('#0c1a14'), { sisi: S_DEPAN });               // di muka UPS (120,9)
      const amber = warna(P.amber);
      for (let i = 0; i < 4; i++) {
        kotakM(S, A3.kali(A3.geser(396, 5.5, 121.04), A3.putarZ(E.umur * 1.1 + i * Math.PI / 4)), -4, 4, -0.25, 0.25, 0, 0.05, amber, 0.9, S_DEPAN);
      }
    },
    // vakum kecil di kaki rak server, selangnya menjulur ke kolong rak
    'rak-server-divakum': (S) => {
      const biru = warna('#3565b0');
      kotak(S, 352, 364, 0.6, 7, 129, 137, biru, { sisi: SEMUA, w: { atas: warna('#79c0ff') } });
      for (const [x, z] of [[353.5, 130], [362.5, 130], [353.5, 136], [362.5, 136]]) kotak(S, x - 0.8, x + 0.8, 0, 0.6, z - 0.8, z + 0.8, warna('#20242c'));
      balok(S, [358, 5, 129], [361, 2, 124], 1.1, warna('#4a5058'));                                        // selang
      balok(S, [361, 2, 124], [362, 0.6, 121.2], 1.1, warna('#4a5058'));
      kotak(S, 359, 366, 0, 1, 120.4, 122, warna('#2c3038'), { sisi: SEMUA });                              // mulut sedot
    },
    // kadis & sekdis rapat di balik pintu: kaca daun kiri pintunya menyala hangat
    'kadis-sekdis-rapat-tertutup': (S, E) => {
      if (E.data.masukPada == null || !E.data.keluar) return;
      const t = E.umur - E.data.masukPada;
      if (t < 1.2 || t > E.data.keluar) return;
      const z = DINDING_Z - 1.6 + 0.6;
      kotak(S, 452, 462, 52, 64, z, z + 0.12, warna('#3a2a18'), { sisi: S_DEPAN });
      kotak(S, 453, 461, 53, 63, z + 0.12, z + 0.2, warna('#e8bf6a'), { sisi: S_DEPAN, e: 0.6 + 0.12 * Math.sin(now / 620) });
      kotak(S, 452, 462, 58.4, 59.4, z + 0.2, z + 0.3, warna('#3a2a18'), { sisi: S_DEPAN });                // palang kusen kaca
    },

    // --- lomba makan kerupuk (17-an): tali rafia di antara dua tiang bambu,
    //     kerupuk tergantung tepat di depan mulut pesertanya, menyusut tiap digigit
    'lomba-makan-kerupuk': (S, E) => {
      if (!E.data.gantung || !E.data.krupuk) return;
      const z = 306.5, h = 52, bambu = warna('#c9b06a'), tali = warna('#e8d8a0');
      for (const tx of [184, 306]) {
        tabung(S, tx, z, 1.1, 0, h + 4, bambu, { segmen: 6, atas: warna('#a89050') });
        kotak(S, tx - 3, tx + 3, 0, 1.4, z - 3, z + 3, warna('#7a6a3a'));                              // alas pemberat
      }
      kotak(S, 184, 306, h - 0.3, h + 0.3, z - 0.3, z + 0.3, tali, { sisi: SEMUA });
      E.data.X.forEach((x0, i) => {
        const k = E.data.krupuk[i];
        if (!k || k.gigit >= 6) return;
        const cx = x0 + Math.sin(now / 380 + i) * 2, r = [5, 3.6, 2.2][k.gigit < 2 ? 0 : k.gigit < 4 ? 1 : 2], cy = 29;
        kotak(S, cx - 0.12, cx + 0.12, cy + r, h, z - 0.12, z + 0.12, tali);
        kerupuk3D(S, cx, cy, z, r);
      });
    },
  });

  const KARTU_AKSESORI = new Map();      // tamu tenar -> stiker aksesori
  const STIKER = { lebar: 80, tinggi: 72, kaki: 64 };
  function perbaruiStikerAksesori(t, o) {
    const kt = kartuUntuk(KARTU_AKSESORI, t, STIKER.tinggi, STIKER.lebar);
    kt.x0 = o.x - STIKER.lebar / 2;
    kt.z = o.y + 4.5;
    kt.dasar = STIKER.kaki;
    kt.angkat = o.angkat || 0;
    const x = Math.round(t.x), y = Math.round(t.y), s = SKALA_ORANG;
    const d = lukisKartu(kt, () => {
      ctx.setTransform(s, 0, 0, s, STIKER.lebar / 2 - s * x, STIKER.kaki - s * y);
      t.aksesori(x, y, t.hadap || 'down', t);
    });
    if (!d) return kt;
    const kotakNya = kotakIsi(d, STIKER.lebar, STIKER.tinggi);
    kt.kosong = !kotakNya;
    kt.tepi = kotakNya ? cariTepi(d, STIKER.lebar, kotakNya) : null;
    if (!kt.kosong) unggah(kt.tek, kt.kv, false);
    return kt;
  }

  // klip: cuma bidang ini yang dilukis (model event yang sebagian voxel)
  function perbaruiKartuProp(E, klip = null) {
    const sortY = Math.max(DINDING_Z + 4, Math.min(H, E.def.sortY == null ? 118 : E.def.sortY));
    const kt = kartuUntuk(KARTU_PROP, E, Math.ceil(sortY) + 2);
    const lukis = tanpaSosok(() => E.def.gambarProp(E, S_EVENT()));
    const d = lukisKartu(kt, !klip ? lukis : () => {
      ctx.save();
      ctx.beginPath(); ctx.rect(klip.x, klip.y, klip.w, klip.h); ctx.clip();
      try { lukis(); } finally { ctx.restore(); }
    });
    if (!d) return kt;
    const kotakNya = kotakIsi(d, W, kt.tinggi);
    kt.kosong = !kotakNya;
    /* Barang di atas taplak meja rapat (sortY 249..255 — sesudah meja rapat
       — dan isinya habis di dalam bidang mejanya): kartunya berdiri DI ATAS
       meja 3D, digeser ke kedalaman tepi bawah gambarnya, bukan di lantai
       depan meja. Yang bermodel voxel tidak lewat sini. */
    const diMeja = kotakNya && sortY >= 249 && sortY < 256 && kotakNya.y1 <= RAPAT.yF
      && kotakNya.x0 >= RAPAT.xFL && kotakNya.x1 <= RAPAT.xFR;
    kt.z = diMeja ? zRapat(kotakNya.y1) : sortY;
    kt.dasar = diMeja ? kotakNya.y1 + 1 : sortY;
    kt.angkat = diMeja ? MEJA_RAPAT.h : 0;
    kt.tepi = kotakNya ? cariTepi(d, W, kotakNya) : null;
    if (!kt.kosong) unggah(kt.tek, kt.kv, false);
    return kt;
  }
  function perbaruiKartuAtas(E) {
    const kt = kartuUntuk(KARTU_ATAS, E, H);
    const d = lukisKartu(kt, tanpaSosok(() => E.def.gambarAtas(E, S_EVENT())));
    if (!d) return kt;
    const pojok = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]].map(([x, y]) => (y * W + x) * 4);
    if (pojok.every((i) => d[i + 3] > 2)) {
      const i = pojok[0];
      kt.tint = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, d[i + 3] / 255];
      kt.kosong = true;
      return kt;
    }
    kt.tint = null;
    const kotakNya = kotakIsi(d, W, H);
    kt.kosong = !kotakNya;
    if (kt.kosong) return kt;
    const a = aktorEvent(E);
    kt.dinding = !a && kotakNya.y1 <= FLOOR_TOP;
    kt.z = kt.dinding ? DINDING_Z : Math.max(DINDING_Z + 4, Math.min(H, a ? a.y + 3 : kotakNya.y1 + 1));
    kt.dasar = kt.dinding ? FLOOR_TOP : kt.z;
    kt.tepi = cariTepi(d, W, kotakNya);
    unggah(kt.tek, kt.kv, false);
    return kt;
  }

  let tintLayar = [];        // [[r,g,b,a], ...] dari selubung layar gambarAtas
  const kartuHidup = [];
  function perbaruiKartu() {
    for (const kt of KARTU_PROP.values()) kt.dipakai = false;
    for (const kt of KARTU_ATAS.values()) kt.dipakai = false;
    for (const kt of KARTU_AKSESORI.values()) kt.dipakai = false;
    kartuHidup.length = 0;
    tintLayar = [];
    catatOrangEvent();
    for (const { o, tokoh } of ORANG_EVENT.daftar) {
      if (!tokoh || typeof tokoh.aksesori !== 'function') continue;
      const kt = perbaruiStikerAksesori(tokoh, o);
      if (!kt.kosong) kartuHidup.push(kt);
    }
    for (const E of eventHidup) {
      // yang bermodel voxel tidak berkartu — kecuali bidang klip-nya, dan
      // kartu gambarAtas-nya cuma kalau modelnya tidak mengambil alih (atas)
      const model = MODEL_EVENT[E.def.id];
      if (E.def.gambarProp && (!model || model.klip)) {
        const kt = perbaruiKartuProp(E, model ? model.klip : null);
        if (!kt.kosong) kartuHidup.push(kt);
      }
      if (E.def.gambarAtas && !(model && model.atas)) {
        const kt = perbaruiKartuAtas(E);
        if (kt.tint) tintLayar.push(kt.tint);
        else if (!kt.kosong) kartuHidup.push(kt);
      }
    }
    for (const peta of [KARTU_PROP, KARTU_ATAS, KARTU_AKSESORI]) {
      for (const [E, kt] of peta) if (!kt.dipakai) { gl.deleteTexture(kt.tek); peta.delete(E); }
    }
  }

  /* Tiap kartu: muka depan & belakang bertekstur (12 titik, digambar per
     tekstur) + sisi-sisi siluetnya tanpa tekstur. Baris kanvas y jatuh di
     tinggi dasar - y; yang jatuh di bawah lantai dipotong. Kartu dinding
     menonjol dari bidang dinding, sisanya berdiri setebal TEBAL_KARTU
     mengapit kedalamannya. */
  function susunKartu() {
    const S = G.kartu, Ss = G.kartuSisi;
    S.kosongkan(); Ss.kosongkan();
    for (const kt of kartuHidup) {
      const zf = kt.dinding ? DINDING_Z + 0.4 + TEBAL_KARTU : kt.z + TEBAL_KARTU / 2;
      const zb = kt.dinding ? DINDING_Z + 0.4 : kt.z - TEBAL_KARTU / 2;
      const ang = kt.angkat || 0;                              // stiker tamu yang sedang memanjat
      const hb0 = Math.max(0, kt.dasar - kt.tinggi), hb = hb0 + ang, ht = kt.dasar + ang;
      const uv = [0, 0, 1, (kt.dasar - hb0) / kt.tinggi];
      const xa = kt.x0, xb = kt.x0 + kt.lebar;
      S.segi([xa, hb, zf], [xb, hb, zf], [xb, ht, zf], [xa, ht, zf], [0, 0, 1], PUTIH, uv);
      S.segi([xb, hb, zb], [xa, hb, zb], [xa, ht, zb], [xb, ht, zb], [0, 0, -1], PUTIH, [1, 0, 0, uv[3]]);
      if (!kt.tepi) continue;
      for (const t of kt.tepi) {
        if (t.tegak) {
          const h0 = Math.max(0, kt.dasar - t.b) + ang, h1 = kt.dasar - t.a + ang;
          if (h1 <= ang) continue;
          const x = kt.x0 + t.garis;
          if (t.arah > 0) Ss.segi([x, h0, zf], [x, h0, zb], [x, h1, zb], [x, h1, zf], [1, 0, 0], t.c);
          else Ss.segi([x, h0, zb], [x, h0, zf], [x, h1, zf], [x, h1, zb], [-1, 0, 0], t.c);
        } else {
          const h = kt.dasar - t.garis + ang, a = kt.x0 + t.a, b = kt.x0 + t.b;
          if (h < ang) continue;
          if (t.arah > 0) Ss.segi([a, h, zf], [b, h, zf], [b, h, zb], [a, h, zb], [0, 1, 0], t.c);
          else Ss.segi([a, h, zb], [b, h, zb], [b, h, zf], [a, h, zf], [0, -1, 0], t.c);
        }
      }
    }
    WADAH.kartu.isi(S);
    WADAH.kartuSisi.isi(Ss);
    // selubung layar: segi empat penuh di ruang klip (uVP identitas)
    G.tint.kosongkan();
    for (const c of tintLayar) G.tint.segi([-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [0, 0, 1], c, UV_POLOS, 1);
    WADAH.tint.isi(G.tint);
  }
  const IDENTITAS = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  // ---------------------------------------------------------------- lukis
  let jamDinding = -1e9, jamLantai = -1e9, sudahBangun = false, stasiunTerakhir = '';
  const WAKTU = {};
  function gambar3D(stasiun) {
    const dt = Math.max(0, Math.min(0.05, (now - (gambar3D.t || now)) / 1000));
    gambar3D.t = now;
    if (!sudahBangun) {
      siapkanKulit();
      for (const s of KULIT) lukisKulit(s, stasiun);
      // dinding dilukis SEBELUM geometri statis: relief pajangan dinding
      // mencicip warna tepinya dari lukisan ini
      lukisDinding(stasiun); jamDinding = now;
      bangunStatis();
      sudahBangun = true;
    }
    const kunciStasiun = [...stasiun].sort().join(',');
    const stasiunBerubah = kunciStasiun !== stasiunTerakhir;
    stasiunTerakhir = kunciStasiun;
    const T = WAKTU, t0 = performance.now();
    // Mode ringan: bayangan & resolusi sudah diturunkan di tempatnya masing-
    // masing; di sini lukisan ulang tekstur 2D-nya ikut separuh sesering.
    const jarang = ringanAktif() ? 2 : 1;
    if (now - jamDinding > 50 * jarang || stasiunBerubah) { lukisDinding(stasiun); jamDinding = now; }
    const t1 = performance.now();
    if (now - jamLantai > 150 * jarang) { lukisLantai(); jamLantai = now; }
    const t2 = performance.now();
    for (const s of KULIT) {
      if (stasiunBerubah || now - s.terakhir > 1000 * jarang / s.laju) lukisKulit(s, stasiun);
    }
    if (kulitKotor) { gl.bindTexture(gl.TEXTURE_2D, TEK_KULIT); gl.generateMipmap(gl.TEXTURE_2D); kulitKotor = false; }
    const t3 = performance.now();
    perbaruiKartu();
    const t4 = performance.now();

    // isi perabot yang ikut keadaan RUANGAN: dibangun ulang hanya kalau berubah
    const tp = tandaPerabot();
    if (tp !== tandaPerabotTerakhir) { bangunPerabot(); tandaPerabotTerakhir = tp; }
    const t4a = performance.now();
    hitungCahaya();
    perbaruiDebu3D(dt);
    susunDinamis(stasiun, dt);
    const t4b = performance.now();
    susunKartu();
    susunBerkas(G.berkas);
    WADAH.berkas.isi(G.berkas);
    const t5 = performance.now();
    // rata-rata bergerak per tahap (ms), dibaca lewat window.RUANG3D.waktu;
    // susun dirinci: perabot (tanda + bangun ulang), dinamis, kartuSusun
    const ema = (k, v) => { T[k] = T[k] == null ? v : T[k] * 0.9 + v * 0.1; };
    ema('dinding', t1 - t0); ema('lantai', t2 - t1); ema('kulit', t3 - t2); ema('kartu', t4 - t3); ema('susun', t5 - t4);
    ema('perabot', t4a - t4); ema('dinamis', t4b - t4a); ema('kartuSusun', t5 - t4b);

    // --- lintasan bayangan
    const bayangNyala = !ringanAktif();
    const adaKadis = KADIS_SIAP && sisipBoleh();
    if (bayangNyala) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, FB_BAYANG);
      gl.viewport(0, 0, PETA_N, PETA_N);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2, 4);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(PROG_BAYANG.p);
      gl.uniformMatrix4fv(PROG_BAYANG.u.uCahayaVP, false, CAHAYA_VP);
      WADAH.polos.gambar(); WADAH.perabot.gambar(); WADAH.kulit.gambar(); WADAH.dinamis.gambar(); WADAH.pudar.gambar();
      if (adaKadis) WADAH.kadisPolos.gambar();
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // --- lintasan utama
    gl.viewport(0, 0, kanvas.width, kanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(PROG.p);
    const u = PROG.u;
    gl.uniformMatrix4fv(u.uVP, false, KAM.vp);
    gl.uniformMatrix4fv(u.uCahayaVP, false, CAHAYA_VP);
    gl.uniform3fv(u.uArah, ARAH_KUNCI);
    gl.uniform3fv(u.uKunci, CAHAYA.kunci);
    gl.uniform3fv(u.uLangit, CAHAYA.langit);
    gl.uniform3fv(u.uTanah, CAHAYA.tanah);
    gl.uniform4fv(u.uLampuPos, CAHAYA.lampuPos);
    gl.uniform3fv(u.uLampuWarna, CAHAYA.lampuWarna);
    gl.uniform1f(u.uBayangNyala, bayangNyala ? 1 : 0);
    gl.uniform1f(u.uTexel, 1 / PETA_N);
    gl.uniform1f(u.uPudar, 0);
    gl.uniform1i(u.uTeks, 0);
    gl.uniform1i(u.uPeta, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, PETA);
    gl.activeTexture(gl.TEXTURE0);

    gl.enable(gl.CULL_FACE);
    gl.uniform1f(u.uUji, 0.02);
    gl.bindTexture(gl.TEXTURE_2D, TEK_PUTIH); WADAH.polos.gambar(); WADAH.perabot.gambar(); WADAH.dinamis.gambar(); WADAH.samping.gambar();
    if (adaKadis) WADAH.kadisPolos.gambar();
    gl.bindTexture(gl.TEXTURE_2D, TEK_DINDING); WADAH.dinding.gambar(); WADAH.temaDinding.gambar();
    if (!adaKadis) WADAH.sumbat.gambar();
    gl.bindTexture(gl.TEXTURE_2D, TEK_LANTAI); WADAH.lantai.gambar();
    gl.bindTexture(gl.TEXTURE_2D, TEK_KULIT); WADAH.kulit.gambar(); WADAH.dinamisKulit.gambar();
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(u.uUji, 0.5);
    if (adaKadis) WADAH.kadisKulit.gambar();
    // kartu event: muka depan + belakang per tekstur (12 titik per kartu),
    // lalu sisi-sisi siluetnya sekaligus tanpa tekstur
    if (WADAH.kartu.n) {
      gl.bindVertexArray(WADAH.kartu.vao);
      kartuHidup.forEach((kt, i) => {
        gl.bindTexture(gl.TEXTURE_2D, kt.tek);
        gl.drawArrays(gl.TRIANGLES, i * 12, 12);
      });
      gl.bindTexture(gl.TEXTURE_2D, TEK_PUTIH);
      gl.uniform1f(u.uUji, 0.02);
      WADAH.kartuSisi.gambar();
    }
    // yang tembus pandang: kedalaman dulu (tanpa warna), lalu warna dicampur
    // di permukaan terdepan saja — sosok pudar tetap pejal bentuknya. Kaca
    // (air akuarium, pintu lemari piala) dan sinar (genangan lampu, uap AC,
    // silau) ikut lintasan ini, tidak ikut bayangan.
    if (WADAH.pudar.n || WADAH.kaca.n || WADAH.sinar.n) {
      gl.bindTexture(gl.TEXTURE_2D, TEK_PUTIH);
      gl.uniform1f(u.uUji, 0.0);
      gl.uniform1f(u.uPudar, 1);
      gl.enable(gl.CULL_FACE);
      gl.colorMask(false, false, false, false);
      WADAH.pudar.gambar(); WADAH.kaca.gambar(); WADAH.sinar.gambar();
      gl.colorMask(true, true, true, true);
      gl.depthMask(false);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      WADAH.pudar.gambar(); WADAH.kaca.gambar(); WADAH.sinar.gambar();
      gl.disable(gl.BLEND);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.uniform1f(u.uPudar, 0);
    }
    // berkas cahaya jendela: aditif, tanpa menulis kedalaman, alfa kanvas tetap
    if (WADAH.berkas.n) {
      gl.bindTexture(gl.TEXTURE_2D, TEK_PUTIH);
      gl.uniform1f(u.uUji, 0);
      gl.disable(gl.CULL_FACE);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      WADAH.berkas.gambar();
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
    // selubung layar dari gambarAtas (kilat foto, mati lampu): paling akhir,
    // di atas segalanya, persis urutan 2D-nya
    if (WADAH.tint.n) {
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindTexture(gl.TEXTURE_2D, TEK_PUTIH);
      gl.uniformMatrix4fv(u.uVP, false, IDENTITAS);
      gl.uniform1f(u.uPudar, 1);
      gl.uniform1f(u.uUji, 0);
      WADAH.tint.gambar();
      gl.uniform1f(u.uPudar, 0);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
    }
    gl.bindVertexArray(null);
  }

  // ---------------------------------------------------------- memilih
  /* Klik di 3D: sinar dari kamera lewat piksel yang diklik. Pegawai menang
     dulu (sama seperti 2D), lalu X-banner & bukaan ruang kadis, lalu perabot. */
  function sinar(cx, cy) {
    const x = (cx / lebarCss) * 2 - 1, y = 1 - (cy / tinggiCss) * 2;
    const inv = M4.balik(KAM.vp);
    const a = M4.titik(inv, x, y, -1), b = M4.titik(inv, x, y, 1);
    const p0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], p1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
    return { o: p0, d: norm3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) };
  }
  function kenaKotak(r, x0, x1, y0, y1, z0, z1) {
    let tmin = 0, tmax = Infinity;
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(r.d[i]) < 1e-9) { if (r.o[i] < lo[i] || r.o[i] > hi[i]) return -1; continue; }
      let t1 = (lo[i] - r.o[i]) / r.d[i], t2 = (hi[i] - r.o[i]) / r.d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    return tmin;
  }
  function kotakBarang3D(K2) {
    const kaki = K2.y + K2.h;
    if (kaki <= FLOOR_TOP + 2) return [K2.x, K2.x + K2.w, FLOOR_TOP - kaki, FLOOR_TOP - K2.y, DINDING_Z - 1, DINDING_Z + 4];
    const z1 = kaki, z0 = Math.max(DINDING_Z, kaki - Math.max(10, Math.min(46, K2.h * 0.8)));
    return [K2.x, K2.x + K2.w, 0, K2.h, z0, z1];
  }
  function pilihOrang(r) {
    let kena = null, tk = Infinity;
    for (const a of penghuni()) {
      // POV: sinarnya berangkat dari dalam kepala orang itu sendiri — dia selalu
      // kena di jarak 0 dan menelan semua klik ke orang lain
      if (a === POV.orang && POV.t > 0.3) continue;
      // tamu kadis cuma bisa diklik lewat jendelanya (atau dari atas tembok)
      if (a.diKadis && (!KADIS_SIAP || !sisipBoleh() || !lewatJendela(r))) continue;
      const [X, Z] = posisiOrang(a);
      const hw = 6 * SKALA_ORANG;
      const t = kenaKotak(r, X - hw, X + hw, 0, 29 * SKALA_ORANG, Z - hw, Z + hw);
      if (t >= 0 && t < tk) { tk = t; kena = a; }
    }
    return kena;
  }
  // Sinar yang menuju ruang di balik tembok harus lewat lubang jendelanya,
  // atau melintas di atas tembok (kamera tinggi melihat ke dalam maket).
  function lewatJendela(r) {
    if (Math.abs(r.d[2]) < 1e-6) return false;
    const t = (DINDING_Z - r.o[2]) / r.d[2];
    if (t < 0) return true;                          // kamera sudah di balik tembok
    const x = r.o[0] + r.d[0] * t, h = r.o[1] + r.d[1] * t;
    if (h > TINGGI_DINDING + 3) return true;
    return x > LUBANG.x0 && x < LUBANG.x1 && h > LUBANG.y0 && h < LUBANG.y1;
  }
  function pilihBarang(r) {
    let kena = null, tk = Infinity;
    // POV: kotak pilih yang memuat mata kamera itu sendiri (meja tempat dia
    // duduk, meja rapat di sebelahnya) kena di jarak 0 ke arah mana pun
    const tMin = POV.t > 0.3 ? 1 : 0;
    for (const b of daftarBarang()) {
      const k = kotakBarang3D(b.kotak);
      const t = kenaKotak(r, ...k);
      if (t >= tMin && (t < tk - 2 || (Math.abs(t - tk) <= 2 && kena && b.luas < kena.luas))) { tk = t; kena = b; }
    }
    return kena;
  }
  function kenaDinding(r, K2) {
    const k = kotakBarang3D(K2);
    return kenaKotak(r, ...k) >= 0;
  }
  function klik3D(cx, cy) {
    const r = sinar(cx, cy);
    const a = pilihOrang(r);
    if (a) { bukaKartu(a); mulaiPov(a); return; }
    tutupKartu();
    const barangLama = barangTerpilih;
    tutupKartuBarang();
    if (kenaDinding(r, XBANNER) && klikBanner(XBANNER.x + 2, XBANNER.y + 2)) return;
    if (RUANG_KADIS.t > 0 && kenaDinding(r, SISIP) && klikSisip(SISIP.x + 2, SISIP.y + 2)) return;
    const b = pilihBarang(r);
    if (b && b !== barangLama) bukaKartuBarang(b);
  }

  // ---------------------------------------------------- tetikus & sentuh
  const tunjuk = new Map();   // pointerId -> {x, y}
  let seret = null;           // { x, y, tombol, jauh, cubit }
  function posisi(e) {
    const r = kanvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  kanvas.addEventListener('pointerdown', (e) => {
    const [x, y] = posisi(e);
    tunjuk.set(e.pointerId, { x, y });
    try { kanvas.setPointerCapture(e.pointerId); } catch { /* pointer sintetis/sudah lepas: seret tetap jalan tanpa tangkapan */ }
    if (tunjuk.size === 2) {
      const [p, q] = [...tunjuk.values()];
      seret = { cubit: Math.hypot(p.x - q.x, p.y - q.y), tengah: [(p.x + q.x) / 2, (p.y + q.y) / 2], jauh: true };
      return;
    }
    seret = { x, y, x0: x, y0: y, tombol: e.button, geser: e.button === 2 || e.shiftKey || e.ctrlKey, jauh: false };
  });
  kanvas.addEventListener('pointermove', (e) => {
    const [x, y] = posisi(e);
    if (tunjuk.has(e.pointerId)) tunjuk.set(e.pointerId, { x, y });
    if (!seret) {
      if (e.pointerType === 'mouse') hover(x, y);
      return;
    }
    if (seret.cubit != null && tunjuk.size === 2) {
      const [p, q] = [...tunjuk.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      const tengah = [(p.x + q.x) / 2, (p.y + q.y) / 2];
      if (POV.orang) lebarPandang(Math.max(20, seret.cubit) / d);       // POV: cubit = lebar pandang
      else {
        KAM.zoom = Math.max(0.6, Math.min(4.5, KAM.zoom * d / Math.max(20, seret.cubit)));
        geserSasaran(tengah[0] - seret.tengah[0], tengah[1] - seret.tengah[1]);
      }
      seret.cubit = d;
      seret.tengah = tengah;
      return;
    }
    const dx = x - seret.x, dy = y - seret.y;
    if (!seret.jauh && Math.hypot(x - seret.x0, y - seret.y0) > 5) { seret.jauh = true; kanvas.classList.add('seret'); }
    if (!seret.jauh) return;
    if (POV.orang) {
      // POV: menoleh di luar arah hadap orangnya (seret ke kanan = menoleh ke kanan)
      POV.otomatis = false;
      POV.lirikYaw = Math.max(-Math.PI, Math.min(Math.PI, POV.lirikYaw - dx * 0.005));
      POV.lirikPitch = Math.max(-0.95, Math.min(0.8, POV.lirikPitch - dy * 0.004));
    } else if (seret.geser) geserSasaran(dx, dy);
    else {
      KAM.yaw = Math.max(-1.3, Math.min(1.3, KAM.yaw - dx * 0.006));
      KAM.pitch = Math.max(0.1, Math.min(1.45, KAM.pitch + dy * 0.005));
    }
    seret.x = x; seret.y = y;
  });
  const lepas = (e) => {
    tunjuk.delete(e.pointerId);
    if (!seret) return;
    const [x, y] = posisi(e);
    if (!seret.jauh && seret.cubit == null && e.type === 'pointerup' && seret.tombol === 0) klik3D(x, y);
    if (tunjuk.size === 0) { seret = null; kanvas.classList.remove('seret'); }
  };
  kanvas.addEventListener('pointerup', lepas);
  kanvas.addEventListener('pointercancel', lepas);
  kanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  kanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (POV.orang) { lebarPandang(Math.exp(e.deltaY * 0.001)); return; }
    KAM.zoom = Math.max(0.6, Math.min(4.5, KAM.zoom * Math.exp(-e.deltaY * 0.0012)));
  }, { passive: false });
  const lebarPandang = (kali) => { POV.fov = Math.max(0.6, Math.min(1.5, POV.fov * kali)); };   // ±34°..86°
  kanvas.addEventListener('dblclick', () => {
    // POV: kembali memandang lurus ke depan orangnya (maketnya tidak disentuh)
    if (POV.orang) { POV.otomatis = true; POV.fov = 58 * Math.PI / 180; return; }
    KAM.yaw = KAM_AWAL.yaw; KAM.pitch = KAM_AWAL.pitch; KAM.zoom = KAM_AWAL.zoom;
    KAM.sasaran = [...KAM_AWAL.sasaran];
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && POV.orang) keluarPov(); });
  kanvas.addEventListener('mouseleave', () => { barangHover = null; kanvas.classList.remove('tunjuk'); });
  /* Geser = "memegang lantai": titik lantai di bawah kursor ikut kursor.
     kanan kamera = (cos yaw, 0, -sin yaw), maju di lantai = (-sin yaw, 0, -cos yaw);
     seret mendatar menggeser sasaran berlawanan dengan kanan, seret tegak
     sepanjang maju dibagi sin(pitch) karena lantai tampak memendek. */
  function geserSasaran(dx, dy) {
    const k = KAM.jarakK / tinggiCss * 1.05;
    const cy = Math.cos(KAM.yawK), sy = Math.sin(KAM.yawK);
    const tegak = dy / Math.max(0.35, Math.sin(KAM.pitchK));
    const s = KAM.sasaran;
    s[0] = Math.max(-40, Math.min(W + 40, s[0] + (-cy * dx - sy * tegak) * k));
    s[2] = Math.max(DINDING_Z - 20, Math.min(LANTAI_Z1 + 40, s[2] + (sy * dx - cy * tegak) * k));
  }
  let hoverT = 0;
  function hover(x, y) {
    if (now - hoverT < 50) return;
    hoverT = now;
    const r = sinar(x, y);
    const orang = pilihOrang(r);
    const b = orang ? null : pilihBarang(r);
    barangHover = b;
    kanvas.classList.toggle('tunjuk', !!(orang || b));
  }

  // ------------------------------------------------------------ nyala/mati
  function pilihTampilan(tiga, simpan) {
    const bisa = !!gl;
    const aktif = tiga && bisa;
    TIGA.aktif = aktif;
    kanvas.hidden = !aktif;
    document.body.classList.toggle('tampil-3d', aktif);
    if (tombol) {
      tombol.setAttribute('aria-pressed', aktif ? 'true' : 'false');
      tombol.classList.toggle('nyala', aktif);
      tombol.textContent = aktif ? '3D' : '2D';
      tombol.title = aktif ? 'tampilan 3D — seret untuk memutar, roda untuk zoom, klik dua kali untuk kembali, klik pegawai untuk melihat dari matanya. Klik: kembali ke 2D'
        : 'tampilan 2D pixel-art — klik: pindah ke maket 3D';
    }
    if (simpan) ingatan.tulis('tampilan', aktif ? '3d' : '2d');
    if (aktif) { lebarCss = -1; ukurKanvas(); tunjukkanPetunjuk(); }
    else { keluarPov(); fit(); petunjuk.classList.remove('tampak'); }
  }

  // Petunjuk kendali, sekali tiap masuk 3D, memudar sendiri: orang yang baru
  // pertama melihat maket ini tidak tahu kanvasnya bisa diputar.
  const petunjuk = document.createElement('div');
  petunjuk.className = 'petunjuk-3d';
  petunjuk.textContent = 'seret: putar maket · klik kanan / shift+seret: geser · roda: dekat–jauh · klik dua kali: tampak awal · klik pegawai: lihat dari matanya';
  stageInner.appendChild(petunjuk);

  // Pita POV: mata siapa yang sedang dipakai, cara menoleh, dan jalan pulang ke maket
  const hudPov = document.createElement('div');
  hudPov.className = 'pov-3d';
  hudPov.hidden = true;
  hudPov.innerHTML = '<span class="pov-judul"></span>'
    + '<span class="pov-kunci">seret: menoleh · roda: lebar pandang · klik orang lain: pindah · Esc: keluar</span>'
    + '<button type="button" class="pov-keluar">kembali ke maket</button>';
  stageInner.appendChild(hudPov);
  hudPov.querySelector('.pov-keluar').addEventListener('click', keluarPov);
  function perbaruiHudPov() {
    hudPov.hidden = !POV.orang;
    if (POV.orang) hudPov.querySelector('.pov-judul').textContent = 'dari mata ' + namaTampil(POV.orang);
    if (POV.orang) petunjuk.classList.remove('tampak');
  }
  let petunjukTimer = 0;
  function tunjukkanPetunjuk() {
    petunjuk.classList.add('tampak');
    clearTimeout(petunjukTimer);
    petunjukTimer = setTimeout(() => petunjuk.classList.remove('tampak'), 6500);
  }
  kanvas.addEventListener('pointerdown', () => petunjuk.classList.remove('tampak'));

  // Konteks WebGL bisa dicabut peramban (driver GPU diulang, tab lain rakus
  // memori). Membangun ulang semua sumber daya tidak sepadan: pulang ke 2D,
  // dan muat ulang halaman mengembalikan 3D-nya.
  kanvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    gagalTotal(new Error('konteks WebGL dicabut peramban — muat ulang halaman untuk 3D lagi'));
  });
  if (tombol) tombol.addEventListener('click', () => pilihTampilan(!TIGA.aktif, true));

  TIGA.kamera = (dt) => { try { tickKamera3D(dt); } catch (e) { gagalTotal(e); } };
  TIGA.gambar = (stasiun) => {
    const t0 = performance.now();
    try { gambar3D(stasiun); } catch (e) { gagalTotal(e); }
    const d = performance.now() - t0;
    WAKTU.total = WAKTU.total == null ? d : WAKTU.total * 0.9 + d * 0.1;
  };
  TIGA.keLayar = keLayar3D;
  TIGA.tampak = tampak3D;
  // Galat yang lolos sampai sini berarti 3D-nya tidak bisa dipercaya lagi:
  // pulang ke 2D saja, jangan biarkan ruangan membeku.
  function gagalTotal(e) {
    console.error('[3d] dimatikan:', e);
    try { laporGalat('3d: ' + (e && e.message || e), 'ruang3d.js'); } catch { /* laporan cuma bonus */ }
    pilihTampilan(false, false);
    if (tombol) { tombol.disabled = true; tombol.title = 'tampilan 3D dimatikan karena galat: ' + (e && e.message || e); }
  }

  new ResizeObserver(() => { if (TIGA.aktif) ukurKanvas(); }).observe(stageInner);

  const dariUrl = MODE_URL.get('tampilan');
  const bawaan = MODE_OVERLAY ? '2d' : '3d';
  const pilihan = dariUrl === '2d' || dariUrl === '3d' ? dariUrl : ingatan.baca('tampilan', bawaan);
  pilihTampilan(pilihan === '3d', false);

  // pintu buat yang memeriksa dari konsol
  window.RUANG3D = { get aktif() { return TIGA.aktif; }, kamera: KAM, waktu: WAKTU, pilih: (v) => pilihTampilan(v, true) };
})();
