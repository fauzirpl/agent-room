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

  /* Kotak sejajar sumbu. x0..x1, y0..y1 (tinggi), z0..z1 (kedalaman).
     o.sisi: bit sisi yang digambar; o.w: warna per sisi {atas, depan, ...};
     o.e: emisi 0..1. */
  function kotak(S, x0, x1, y0, y1, z0, z1, c, o = {}) {
    const sisi = o.sisi == null ? TANPA_BAWAH : o.sisi, e = o.e || 0, w = o.w || {};
    if (sisi & S_DEPAN) S.segi([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], w.depan || c, UV_POLOS, e);
    if (sisi & S_BELAKANG) S.segi([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], w.belakang || c, UV_POLOS, e);
    if (sisi & S_KANAN) S.segi([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], w.kanan || w.sisi || c, UV_POLOS, e);
    if (sisi & S_KIRI) S.segi([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], w.kiri || w.sisi || c, UV_POLOS, e);
    if (sisi & S_ATAS) S.segi([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], w.atas || c, UV_POLOS, e);
    if (sisi & S_BAWAH) S.segi([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], w.bawah || c, UV_POLOS, e);
  }

  // Kotak terputar (sendi pegawai, kipas, bendera). m: afin 3x4 dari A3.
  const SUDUT = new Float32Array(24);
  function kotakM(S, m, x0, x1, y0, y1, z0, z1, c, e = 0, sisi = SEMUA) {
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? x1 : x0, y = i & 2 ? y1 : y0, z = i & 4 ? z1 : z0;
      SUDUT[i * 3] = m[0] * x + m[1] * y + m[2] * z + m[3];
      SUDUT[i * 3 + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
      SUDUT[i * 3 + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
    }
    const nx = norm3(m[0], m[4], m[8]), ny = norm3(m[1], m[5], m[9]), nz = norm3(m[2], m[6], m[10]);
    const P = (i) => [SUDUT[i * 3], SUDUT[i * 3 + 1], SUDUT[i * 3 + 2]];
    if (sisi & S_DEPAN) S.segi(P(4), P(5), P(7), P(6), nz, c, UV_POLOS, e);
    if (sisi & S_BELAKANG) S.segi(P(1), P(0), P(2), P(3), [-nz[0], -nz[1], -nz[2]], c, UV_POLOS, e);
    if (sisi & S_KANAN) S.segi(P(5), P(1), P(3), P(7), nx, c, UV_POLOS, e);
    if (sisi & S_KIRI) S.segi(P(0), P(4), P(6), P(2), [-nx[0], -nx[1], -nx[2]], c, UV_POLOS, e);
    if (sisi & S_ATAS) S.segi(P(6), P(7), P(3), P(2), ny, c, UV_POLOS, e);
    if (sisi & S_BAWAH) S.segi(P(0), P(1), P(5), P(4), [-ny[0], -ny[1], -ny[2]], c, UV_POLOS, e);
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

  // Bidang bertekstur tegak menghadap +z (atau miring lewat dua titik alas).
  function papan(S, xa, za, xb, zb, y0, y1, uv, c = PUTIH, e = 0) {
    const dx = xb - xa, dz = zb - za, l = Math.hypot(dx, dz) || 1;
    const n = [dz / l, 0, -dx / l];
    S.segi([xa, y0, za], [xb, y0, zb], [xb, y1, zb], [xa, y1, za], [-n[0], 0, -n[2]], c, uv, e);
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
uniform vec3 uLampuPos[4];
uniform vec3 uLampuWarna[4];
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
  for (int i = 0; i < 4; i++) {
    vec3 d = uLampuPos[i] - vPos;
    float jarak = length(d);
    float redam = 1.0 / (1.0 + jarak * jarak * 0.00016);
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
      TIGA.tanpaNeon = true;
      aman(() => drawWall());
      TIGA.tanpaNeon = false;
      // urutan 2D: gambarDinding event tepat sesudah dinding, SEBELUM prop
      // (pintu, jendela) — yang menempel di daun pintu memang tertutup pintunya
      aman(() => gambarLapis('gambarDinding'));
      aman(() => drawEdaran());
      aman(() => drawNomorAntre());
      aman(() => drawCRT());
      aman(() => drawPlakatNilai());
      // jendela + gorden, tanpa meja printer di bawahnya (itu benda 3D)
      aman(() => klip(JENDELA.x - 10, 0, JENDELA.w + 50, JENDELA.y + JENDELA.h + 7, () => drawWindow(stasiun.has('web'))));
      // bagan struktur organisasi, tanpa filing kabinet di bawahnya
      aman(() => klip(103, 18, 58, 43, () => drawFiling(stasiun.has('search'))));
      aman(() => drawKadis(stasiun.has('agent')));
      aman(() => gambarSisipKadis());
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
    polos: new Susun(), dinding: new Susun(), lantai: new Susun(), kulit: new Susun(), papan: new Susun(),
    dinamis: new Susun(), samping: new Susun(), pudar: new Susun(), kartu: new Susun(), tint: new Susun(64),
  };
  const WADAH = {
    polos: new Wadah(false), dinding: new Wadah(false), lantai: new Wadah(false), kulit: new Wadah(false),
    papan: new Wadah(false), dinamis: new Wadah(true), samping: new Wadah(true), pudar: new Wadah(true), kartu: new Wadah(true),
    tint: new Wadah(true),
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
  // Kartu tegak bertekstur (barang di atas meja, daun tanaman): alfa diuji,
  // dua muka. Baris bawah rect jatuh di tinggi y0.
  function standee(s, x0, x1, z, y0) {
    if (!s) return;
    papan(G.papan, x0, z, x1, z, y0, y0 + s.rect.h, s.uv);
  }
  // Dua kartu bersilang: tanaman kelihatan bervolume dari arah mana pun.
  function silang(s, cx, cz, y0) {
    if (!s) return;
    const hw = s.rect.w / 2, y1 = y0 + s.rect.h;
    const d = hw * Math.SQRT1_2;
    papan(G.papan, cx - d, cz - d, cx + d, cz + d, y0, y1, s.uv);
    papan(G.papan, cx - d, cz + d, cx + d, cz - d, y0, y1, s.uv);
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
    K_ = {
      arsip: kulit('arsip', { x: 24, y: 28, w: 60, h: 92 }, (S) => { drawArsip(aktif('read')(S)); drawStiker(); }, 2),
      arsipAtas: kulit('arsipAtas', { x: 24, y: 8, w: 60, h: 20 }, (S) => drawArsip(aktif('read')(S)), 1),
      visi: kulit('visi', { x: 84, y: 64, w: 22, h: 48 }, () => drawVisi(), 0.5),
      filing: kulit('filing', { x: 106, y: 61, w: 52, h: 58 }, (S) => { drawFiling(aktif('search')(S)); drawStiker(); }, 3),
      printer: kulit('printer', { x: 199, y: 82, w: 28, h: 14 }, (S) => drawWindow(aktif('web')(S)), 6),
      stempelAtas: kulit('stempelAtas', { x: 250, y: 18, w: 72, h: 76 }, (S) => drawStempel(aktif('edit')(S)), 4),
      server: kulit('server', { x: 360, y: 29, w: 60, h: 91 }, (S) => { drawServer(aktif('server')(S)); drawStiker(); }, 12),
      absen: kulit('absen', { x: 424, y: 100, w: 9, h: 13 }, () => drawAbsensi(), 2),
      fotokopi: kulit('fotokopi', { x: FOTOKOPI.x, y: FOTOKOPI.y + 12, w: FOTOKOPI.w, h: FOTOKOPI.h - 12 }, () => drawFotokopi(), 6),
      fotokopiAtas: kulit('fotokopiAtas', { x: FOTOKOPI.x, y: FOTOKOPI.y - 12, w: FOTOKOPI.w + 4, h: 24 }, () => drawFotokopi(), 6),
      piala: kulit('piala', { x: LEMARI_PIALA.x, y: LEMARI_PIALA.y, w: LEMARI_PIALA.w, h: LEMARI_PIALA.h }, () => drawLemariPiala(), 1),
      xbanner: kulit('xbanner', { x: XBANNER.x, y: XBANNER.y, w: XBANNER.w, h: XBANNER.h }, () => drawXBanner(), 1),
      rimpel: kulit('rimpel', { x: RAPAT.xFL, y: RAPAT.yF, w: RAPAT.xFR - RAPAT.xFL, h: 19 }, (S) => drawRapat(aktif('rapat')(S)), 1),
      tanaman: kulit('tanaman', { x: 14, y: 232, w: 38, h: 46 }, () => drawPlant(), 1),
      bukuTamu: kulit('bukuTamu', { x: 51, y: 282, w: 16, h: 6 }, () => drawBukuTamu(), 1),
      rakBrosur: kulit('rakBrosur', { x: RAK_BROSUR.x, y: RAK_BROSUR.y, w: RAK_BROSUR.w, h: RAK_BROSUR.h }, () => drawRakBrosur(), 0.5),
      akuarium: kulit('akuarium', { x: AKUARIUM.x, y: AKUARIUM.y, w: AKUARIUM.w, h: AKUARIUM.h }, () => drawAkuarium(), 15),
      palem: kulit('palem', { x: PALEM.x - 2, y: PALEM.y, w: PALEM.w + 4, h: 28 }, () => drawPalem(), 0.5),
      sanitizer: kulit('sanitizer', { x: SANITIZER.x, y: SANITIZER.y, w: SANITIZER.w, h: SANITIZER.h }, () => drawSanitizer(), 0.5),
      penghancur: kulit('penghancur', { x: PENGHANCUR.x, y: PENGHANCUR.y - 3, w: PENGHANCUR.w, h: PENGHANCUR.h + 3 }, () => drawPenghancur(), 1),
      rakBuku: kulit('rakBuku', { x: 584, y: 172, w: 46, h: 14 }, () => drawPojokBaca(), 0.5),
      rakKoran: kulit('rakKoran', { x: 638, y: 174, w: 30, h: 12 }, () => drawPojokBaca(), 0.5),
      konter: kulit('konter', { x: PANTRI.x + 9, y: PANTRI.y + PANTRI.atas + 10, w: 50, h: 10 }, () => drawPantry(), 1),
      microwave: kulit('microwave', { x: PANTRI.x + 34, y: PANTRI.y + PANTRI.atas - 7, w: 21, h: 16 }, () => drawPantry(), 2),
      papanPantri: kulit('papanPantri', { x: PANTRI.x + 14, y: PANTRI.y - 9, w: 26, h: 9 }, () => drawPantry(), 0.3),
      dispenser: kulit('dispenser', { x: pantriX(462), y: 254, w: 18, h: 34 }, () => drawDispenserPantry(), 1),
      posSatpam: kulit('posSatpam', { x: POS_SATPAM.x + 3, y: 296, w: 23, h: 18 }, () => drawPosSatpam(), 1),
      mejaKerja: MEJA_KERJA_X.map((cx, i) => kulit('meja' + i, { x: cx - 32, y: 286, w: 64, h: 44 },
        () => { const x = cx - 32, y = 322; drawMejaTema(i, x, y); gambarKusutMeja(i, x, y); gambarTemaMeja(x, y); }, 1)),
    };
  }

  // ----------------------------------------------------------- bangun statis
  function bangunStatis() {
    for (const k of ['polos', 'dinding', 'lantai', 'kulit', 'papan']) G[k].kosongkan();
    const S = G.polos;

    // --- alas maket: kayu jati gelap, seperti maket gedung di lobi dinas
    // tutupnya 0,5 di bawah lantai: sebidang dengan lantai = z-fighting berkedip
    kotak(S, -12, W + 12, -14, -0.5, DINDING_Z - 12, LANTAI_Z1 + 8, warna('#3a2a1a'), { sisi: SEMUA, w: { atas: warna('#4a3826') } });
    kotak(S, -14, W + 14, -16, -12, DINDING_Z - 14, LANTAI_Z1 + 10, warna('#241a11'), { sisi: SEMUA });

    // --- lantai (lukisan lantai 2D)
    G.lantai.segi([0, 0, LANTAI_Z1], [W, 0, LANTAI_Z1], [W, 0, DINDING_Z], [0, 0, DINDING_Z], [0, 1, 0], PUTIH, [0, 0, 1, 1]);

    // --- dinding belakang: muka depan lukisan dinding 2D, sisanya bata berplester
    G.dinding.segi([0, 0, DINDING_Z], [W, 0, DINDING_Z], [W, TINGGI_DINDING, DINDING_Z], [0, TINGGI_DINDING, DINDING_Z], [0, 0, 1], PUTIH, [0, 0, 1, 1]);
    kotak(S, -6, W + 6, 0, TINGGI_DINDING + 3, DINDING_Z - 6, DINDING_Z, warna('#d8d0b8'), { sisi: S_ATAS | S_BELAKANG | S_KIRI | S_KANAN, w: { atas: warna('#f2ecd8') } });

    // --- perabot dinding
    const k = K_;
    kotakKulit(k.arsip, 24, 84, 0, 92, DINDING_Z + 2, 120);
    standee(k.arsipAtas, 24, 84, 111, 92);
    standee(k.visi, 84, 106, 111, 0);                        // standee VISI berkaki silang
    kotakKulit(k.filing, 106, 158, 0, 58, DINDING_Z + 2, 119);
    // meja printer + printer
    meja(197, 229, DINDING_Z + 1, 117, 20, KAYU, KAYU_TUA, { palang: false });
    kotakKulit(k.printer, 199, 227, 20, 34, 104, 114);
    // meja stempel: barang di atasnya kartu tegak dari lukisan aslinya
    meja(252, 320, DINDING_Z + 1, 118, 22, KAYU, KAYU_TUA);
    standee(k.stempelAtas, 250, 322, 109, 22);
    kotakKulit(k.server, 360, 420, 0, 91, DINDING_Z + 2, 120);
    kotakKulit(k.absen, 424, 433, 26, 39, DINDING_Z, DINDING_Z + 3);
    kotakKulit(k.fotokopi, FOTOKOPI.x, FOTOKOPI.x + FOTOKOPI.w, 0, FOTOKOPI.h - 12, DINDING_Z + 4, 120);
    standee(k.fotokopiAtas, FOTOKOPI.x, FOTOKOPI.x + FOTOKOPI.w + 4, 112, FOTOKOPI.h - 12);
    kotakKulit(k.piala, LEMARI_PIALA.x, LEMARI_PIALA.x + LEMARI_PIALA.w, 0, LEMARI_PIALA.h, DINDING_Z + 2, 120);

    // --- meja rapat: taplak putih, rimpel hijau di muka depan (kulit 2D)
    const R = { x0: 172, x1: 320, z0: 195, z1: 240, h: 16 };
    timbul(152, 340, 176, 252, 0.8, warna('#743030'));          // karpet merah, tebal sejengkal
    kotak(S, R.x0, R.x1, R.h - 2, R.h, R.z0, R.z1, warna('#ece8da'), { sisi: SEMUA, w: { atas: warna('#f1eee2') } });
    if (k.rimpel) G.kulit.segi([R.x0 - 2, 0.8, R.z1 + 0.5], [R.x1 + 2, 0.8, R.z1 + 0.5], [R.x1 + 2, R.h, R.z1 + 0.5], [R.x0 - 2, R.h, R.z1 + 0.5], [0, 0, 1], PUTIH,
      [k.rimpel.uv[0], k.rimpel.uv[1], k.rimpel.uv[2], k.rimpel.uv[1] + (k.rimpel.uv[3] - k.rimpel.uv[1]) * (16 / 19)]);
    const HIJAU = warna('#2c5c38');
    kotak(S, R.x0 - 2, R.x0, 0.8, R.h, R.z0, R.z1 + 0.5, HIJAU);
    kotak(S, R.x1, R.x1 + 2, 0.8, R.h, R.z0, R.z1 + 0.5, HIJAU);
    kotak(S, R.x0, R.x1, 0.8, R.h - 2, R.z0, R.z0 + 1, HIJAU);
    barangMejaRapat(S, R);

    // --- barang lantai tengah
    standee(k.xbanner, XBANNER.x, XBANNER.x + XBANNER.w, 238, 0);
    // tiang bendera: alas + tiang; kainnya berkibar di bagian dinamis
    kotak(S, 127, 139, 0, 3, 267, 277, warna('#7c838a'));
    kotak(S, 129, 137, 3, 5, 269, 275, BESI);
    tabung(S, 133, 272, 1.1, 5, 62, warna('#c9ced4'), { segmen: 6 });
    kotak(S, 131.5, 134.5, 62, 65, 270.5, 273.5, warna(P.gold));
    // tanaman pot kiri: pot bata + daun kartu silang
    kotak(S, 23, 43, 0, 14, 283, 297, warna('#7a4a30'), { w: { atas: warna('#5a3a26') } });
    kotak(S, 21, 45, 12, 16, 281, 299, warna('#8d5738'), { w: { atas: warna('#3a2a1a') } });
    silang(k.tanaman, 33, 290, 14);
    // meja buku tamu
    meja(52, 66, 290, 297, 8, warna('#8d5738'), warna('#6b4126'), { palang: false, tebal: 2, kaki: 2 });
    standee(k.bukuTamu, 51, 67, 293.5, 8);
    // bangku tunggu besi tiga dudukan
    const BT = BANGKU_TUNGGU, baja = warna('#9fb0bd');
    for (let i = 0; i < 3; i++) {
      const sx = BT.x + 1 + i * 14;
      kotak(S, sx, sx + 13, 10, 12, 203, 212, baja, { sisi: SEMUA });
      kotak(S, sx, sx + 13, 12, 24, 202, 204, baja, { sisi: SEMUA });
    }
    kotak(S, BT.x, BT.x + BT.w, 7, 10, 205, 209, BESI_TUA);
    for (const kx of [BT.x + 4, BT.x + BT.w - 7]) kotak(S, kx, kx + 3, 0, 7, 205, 209, BESI_TUA);
    standee(k.rakBrosur, RAK_BROSUR.x, RAK_BROSUR.x + RAK_BROSUR.w, 200, 0);
    kotakKulit(k.akuarium, AKUARIUM.x, AKUARIUM.x + AKUARIUM.w, 0, AKUARIUM.h, 204, 216);
    sofaTamu(S);
    kotak(S, PALEM.x + 5, PALEM.x + 15, 0, 12, 208, 216, warna('#e8e6de'), { w: { atas: warna('#6b5a3a') } });
    silang(k.palem, PALEM.x + 10, 212, 12);
    standee(k.sanitizer, SANITIZER.x, SANITIZER.x + SANITIZER.w, 212, 0);
    // tempat sampah terpilah: hijau organik, kuning anorganik, merah B3
    ['#3e8a4f', '#d1a326', '#c22b2b'].forEach((c, i) => {
      const bx = SAMPAH_PILAH.x + i * 9;
      kotak(S, bx, bx + 8, 0, 15, 294, 302, warna(c));
      kotak(S, bx - 0.5, bx + 8.5, 15, 16.5, 293.5, 302.5, gelapkan(warna(c), 1.25), { sisi: SEMUA });
      kotak(S, bx + 2, bx + 6, 7, 10, 302, 302.3, warna('#f2f2ee'), { sisi: S_DEPAN });
    });
    kotakKulit(k.penghancur, PENGHANCUR.x, PENGHANCUR.x + PENGHANCUR.w, 0, PENGHANCUR.h + 3, 340, 348);

    // --- pojok baca: karpet timbul, meja lesehan & bantal memakai lukisan lantai
    timbul(BACA.alas.x, BACA.alas.x + BACA.alas.w, BACA.alas.y, BACA.alas.y + BACA.alas.h, 0.8, warna('#2f4a6b'));
    timbul(592, 660, 196, 210, 5, warna('#6b4f34'));
    for (const cx of BACA.slot) timbul(cx - 9, cx + 9, 220, 232, 3.5, warna('#6b3b3b'));
    kotakKulit(k.rakBuku, 584, 630, 0, 14, 178, 186);
    kotakKulit(k.rakKoran, 638, 668, 0, 12, 180, 186);

    // --- pos satpam
    meja(POS_SATPAM.x + 3, POS_SATPAM.x + 26, 303, 314, 16, KAYU, warna('#6b4f34'), { palang: false });
    if (k.posSatpam) G.kulit.segi([POS_SATPAM.x + 3, 4, 314.3], [POS_SATPAM.x + 26, 4, 314.3], [POS_SATPAM.x + 26, 13, 314.3], [POS_SATPAM.x + 3, 13, 314.3], [0, 0, 1], PUTIH,
      [k.posSatpam.uv[0], k.posSatpam.uv[1] + (k.posSatpam.uv[3] - k.posSatpam.uv[1]) * (9 / 18), k.posSatpam.uv[2], k.posSatpam.uv[3]]);
    kotak(S, POS_SATPAM.x + 5, POS_SATPAM.x + 14, 16, 16.5, 304, 311, warna(P.paper), { sisi: S_ATAS });
    kotak(S, POS_SATPAM.x + 18, POS_SATPAM.x + 21, 16, 22, 306, 308, warna('#20242c'));

    pantri(S);
    mejaKerja(S);

    for (const k2 of ['polos', 'dinding', 'lantai', 'kulit', 'papan']) WADAH[k2].isi(G[k2]);
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
    standee(K_.papanPantri, px + 14, px + 40, py + 2.5, T);
    /* Counter granit + lemari bawah laminasi. Gambar 2D pantri mencampur
       tampak atas (sekat, meja) dan tampak depan (lemari, microwave) dalam
       satu fungsi, jadi yang dipinjam cuma dua muka yang memang tampak
       depan: pintu lemari bawah dan microwave. Sisanya dibangun di sini. */
    const cz0 = py + 5, cz1 = py + 17, cH = 14;
    kotak(S, px + 8, px + 60, cH - 1.5, cH, cz0, cz1 + 1, warna('#c6cbcd'), { sisi: SEMUA, w: { atas: warna('#d4d8da') } });
    kotak(S, px + 9, px + 59, 0, 4, cz0, cz1 - 0.5, warna('#b6ae99'));
    kotakKulit(K_.konter, px + 9, px + 59, 4, cH - 1.5, cz0, cz1);
    kotak(S, px + 11, px + 31, cH - 0.4, cH + 0.1, cz0 + 2, cz1 - 2, warna('#454e55'), { sisi: S_ATAS });   // bak cuci
    kotak(S, px + 19, px + 21, cH, cH + 9, cz0 + 1, cz0 + 3, warna('#b6bec4'));                          // keran leher angsa
    kotak(S, px + 15, px + 21, cH + 7, cH + 9, cz0 + 1, cz0 + 3, warna('#b6bec4'));
    kotakKulit(K_.microwave, px + 34, px + 55, cH, cH + 16, cz0 + 1, cz0 + 10);
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
    // dispenser: badan berkulit, galon dinamis
    const dx = pantriX(462);
    kotakKulit(K_.dispenser, dx, dx + 18, 0, 34, 280, 290);
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
      // pot mini di tengah
      kotak(S, x0 + 33, x0 + 37, h, h + 4, z0 + 4, z0 + 8, warna('#8a5a3a'));
      standee(K_.mejaKerja[i], x0, x1, z0 + 7, h);
    });
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
    KAM.mata = m.mata; KAM.v = m.v; KAM.p = m.p; KAM.vp = m.vp;
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
  function milikOrang(x, kaki) {
    for (const a of penghuni()) if (a.x === x && a.y === kaki) return true;
    return false;
  }
  function titik3D(x, y, kaki) {
    if (kaki <= FLOOR_TOP) return [x, FLOOR_TOP - y, DINDING_Z + 1];
    let h = kaki - y;
    if (milikOrang(x, kaki)) h *= SKALA_ORANG;
    return [x, h, kaki];
  }
  function proyeksi(x, y, z) {
    const c = M4.titik(KAM.vp, x, y, z);
    if (c[3] <= 0.001) return null;
    return [(c[0] / c[3] * 0.5 + 0.5) * lebarCss, (1 - (c[1] / c[3] * 0.5 + 0.5)) * tinggiCss, c[2] / c[3]];
  }
  function keLayar3D(x, y, kaki) {
    const [X, Y, Z] = titik3D(x, y, kaki);
    const p = proyeksi(X, Y, Z);
    return p ? [p[0], p[1]] : [-9999, -9999];
  }
  function tampak3D(x, y) {
    const p = proyeksi(x, (milikOrang(x, y) ? SKALA_ORANG : 1) * 28, y);
    return !!p && p[0] > -40 && p[0] < lebarCss + 40 && p[1] > -40 && p[1] < tinggiCss + 40 && p[2] < 1;
  }

  // ------------------------------------------------------------- cahaya
  const ARAH_KUNCI = norm3(-0.34, 0.9, 0.62);   // dari kiri-atas-depan: bayangan jatuh ke kanan-belakang
  const CAHAYA = { langit: [0.8, 0.8, 0.78], tanah: [0.6, 0.6, 0.58], kunci: [0.4, 0.39, 0.36], lampuPos: new Float32Array(12), lampuWarna: new Float32Array(12) };
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
    for (let i = 0; i < 4; i++) {
      const cx = NEON_X[i];
      const nyala = cx == null ? 0 : kedipNeon(i) * (0.25 + 0.75 * lampu);
      CAHAYA.lampuPos[i * 3] = cx == null ? 0 : cx;
      CAHAYA.lampuPos[i * 3 + 1] = LAMPU_Y - 4;
      CAHAYA.lampuPos[i * 3 + 2] = LAMPU_Z + 20;
      CAHAYA.lampuWarna[i * 3] = 0.34 * nyala;
      CAHAYA.lampuWarna[i * 3 + 1] = 0.32 * nyala;
      CAHAYA.lampuWarna[i * 3 + 2] = 0.26 * nyala;
    }
  }

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
    for (const x of [-16, W + 16]) for (const y of [-16, TINGGI_DINDING + 30]) for (const z of [DINDING_Z - 16, LANTAI_Z1 + 12]) {
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

  function susunOrang(S, a, dt, alfa) {
    if (a.diKadis) return;
    if (alfa <= 0.02) return;
    let st = keadaanOrang.get(a);
    if (!st) { st = { yaw: YAW[a.face] || 0, duduk: 0 }; keadaanOrang.set(a, st); }
    // hadap: berbelok halus, lewat sudut terpendek
    const tujuan = YAW[a.face] == null ? st.yaw : YAW[a.face];
    let beda = tujuan - st.yaw;
    while (beda > Math.PI) beda -= Math.PI * 2;
    while (beda < -Math.PI) beda += Math.PI * 2;
    st.yaw += beda * (geraKurang3.matches ? 1 : Math.min(1, dt * 14));

    const p = a.pal;
    const rc = a.mesin ? seragamCabang(a.mesin) : null;
    const t = a.phase;
    const kerja = poseKerja(a);
    const jalan = a.state === 'walk';
    // duduk: kursi rapat (turunDuduk), kursi meja kerja, lesehan pojok baca
    const dudukRapat = a.station === 'rapat' && !jalan ? turunDuduk(a) / (DUDUK_PX * DUDUK_FRAME) : 0;
    const dudukMeja = a.station === 'think' && !a.path.length && !a.antre && !a.butuh && Math.abs(a.y - MEJA_KERJA_Y) < 3 ? 1 : 0;
    const lesehan = a.pose === 'dudukLantai' ? 1 : 0;
    const tujuanDuduk = Math.max(dudukRapat, dudukMeja);
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
    const pose = a.butuh ? { l: -6, r: -6 } : a.pose ? posEvent(a) : (kerja ? workArms(a) : null);
    if (pose) { lenganL = sudutLengan(pose.l); lenganR = sudutLengan(pose.r); }

    // dasar: kaki di (x, 0, y) dunia, badan menghadap +z lokal, diskalakan
    let dasar = A3.geser(a.x, 0, a.y);
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
    const tubuh = A3.kali(badan, A3.putarX(a.pose === 'jongkok' ? 0.25 : 0));
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
    } else if (a.bawa) {
      barangBawaan(S, mR, a.bawa, c);
    } else if (kerja) {
      alatKerja(S, a, mL, mR, tubuh, c);
    }

    // --- kepala
    const ngantuk = a.ngantuk || 0;
    const kepala = A3.kali(tubuh, A3.poros(0, 16.5, 0, A3.putarX(ngantuk * 0.12)));
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

    // Dinding samping: rendah kalau kamera ada di baliknya (maket dipotong).
    // Grup sendiri yang tidak ikut lintasan bayangan — dinding setinggi 110
    // dengan cahaya dari kiri akan menggelapkan pintu WC dan lemari arsip.
    G.samping.kosongkan();
    dindingSamping(G.samping, -6, 0, KAM.mata[0] < -4);
    dindingSamping(G.samping, W, W + 6, KAM.mata[0] > W + 4);
    WADAH.samping.isi(G.samping);

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
    for (const kd of KURSI_DEKAT) kursi(S, kd.x, kd.y + 5.6, -1, false);
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
      const layar = nyala ? campur(warna('#173a96'), warna('#9fc3ff'), 0.15 + 0.1 * Math.sin(now / 300 + i)) : warna('#20242c');
      kotak(S, cx + 13, cx + 29, h + 1.6, h + 13.4, 336, 336.2, layar, { sisi: S_DEPAN, e: nyala ? 0.85 : 0 });
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
      kotak(S, 114 + (m % 2), 128 + (m % 2), 58 + m * 3, 61 + m * 3, 104, 116, warna(m % 2 ? '#c9a03a' : '#d9b96a'), { sisi: SEMUA });
    }

    // ember penadah AC: di bawah AC persis, tetesnya jatuh lurus ke dalamnya
    if (!RUANGAN.emberDiangkat) {
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

    // galon dispenser
    if (!MOD.galonLepas) {
      const dx = pantriX(462) + 9;
      tabung(S, dx, 285, 6.5, 34, 45, warna('#7db8e8', 0.85), { segmen: 12, atas: warna('#5f9fd4') });
      tabung(S, dx, 285, 2, 45, 48, warna('#5f9fd4'), { segmen: 8 });
    }

    // pegawai: yang pudar ke grup campur, sisanya pejal
    G.pudar.kosongkan();
    for (const a of penghuni()) {
      const alfa = (a.standby && !a.tetap ? 0.55 : 1) * (a.alpha == null ? 1 : a.alpha);
      susunOrang(alfa < 0.999 ? G.pudar : S, a, dt, alfa);
    }
    // sorotan orang yang kartunya terbuka: cincin di lantai
    if (terpilih && !terpilih.diKadis) cincin(S, terpilih.x, terpilih.y, 9 + Math.sin(now / 240) * 1.2, warna(P.amber), 0.9);
    // sorotan barang: bingkai rusuk emas di kotak 3D-nya (yang diklik lebih
    // tegas dari yang cuma dilewati kursor) — pengganti drawSorotBarang 2D
    const bSorot = barangTerpilih || barangHover;
    if (bSorot) {
      const K2 = barangKeRuangKadis(bSorot) ? SISIP : bSorot.kotak;
      rusuk(S, kotakBarang3D(K2), barangTerpilih ? 0.9 : 0.45, warna(P.gold), 0.6 + 0.4 * Math.sin(now / 260));
    }
    partikel(G.pudar);

    WADAH.dinamis.isi(S);
    WADAH.pudar.isi(G.pudar);
  }

  function dindingSamping(S, x0, x1, rendah) {
    const h = rendah ? 12 : TINGGI_DINDING;
    const z0 = DINDING_Z - 6, z1 = LANTAI_Z1;
    kotak(S, x0, x1, 0, Math.min(h, 10), z0, z1, PLIN, { sisi: SEMUA });
    if (h > 10) kotak(S, x0, x1, 10, Math.min(h, 38), z0, z1, MINT, { sisi: SEMUA });
    if (h > 38) kotak(S, x0 - (x0 < 0 ? 0 : 0.6), x1 + (x0 < 0 ? 0.6 : 0), 38, 40, z0, z1, LIS, { sisi: SEMUA });
    if (h > 40) kotak(S, x0, x1, 40, h + 3, z0, z1, KREM, { sisi: SEMUA, w: { atas: warna('#f2ecd8') } });
  }

  /* Kursi: dudukan setinggi DUDUKAN_Y — persis pinggul pegawai yang sudah
     turun (susunOrang: TURUN_DUDUK x SKALA_ORANG di bawah pinggul berdiri).
     hadap 1: menghadap +z (sisi jauh meja rapat); -1: menghadap -z. */
  const DUDUKAN_Y = 8;
  function kursi(S, cx, cz, hadap, rusak, kecil = false) {
    const w = kecil ? 6 : 7.5, jok = rusak ? warna('#c9ced4') : warna('#3f74c4'), rangka = rusak ? warna('#8b8f86') : warna('#2a4f8a');
    const d = kecil ? 5 : 5.5, y = DUDUKAN_Y;
    kotak(S, cx - w, cx + w, y - 2.5, y, cz - d, cz + d, jok, { sisi: SEMUA, w: { atas: warna(rusak ? '#dfe2e6' : '#5b8ad4') } });
    const zs = cz - hadap * d;
    const puncak = kecil ? 21 : 24;
    kotak(S, cx - w, cx + w, y, puncak, zs - 1.2, zs + 1.2, rangka, { sisi: SEMUA });
    kotak(S, cx - w + 1, cx + w - 1, y + 1.5, puncak - 1, zs + hadap * 1.2, zs + hadap * 1.4, jok, { sisi: hadap > 0 ? S_DEPAN : S_BELAKANG });
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

  /* Partikel 2D (tinta, glyph, uap, tetes AC) dicap kedalamannya SEKALI saat
     pertama terlihat: milik pegawai terdekat → di depan badannya, selebihnya
     menempel di lantai atau dinding. Sesudah itu y 2D-nya tinggal dibaca
     sebagai ketinggian di kedalaman tetap itu. */
  const dalamPartikel = new WeakMap();
  function partikel(S) {
    for (const p of parts) {
      if (p.sisip) continue;
      let z = dalamPartikel.get(p);
      if (z == null) {
        if (p.k === 'drip' && p.dasar == null) z = -1;          // tetes AC: jatuh lurus ke ember
        else {
          let terdekat = null, jarak = 26;
          for (const a of penghuni()) {
            const d = Math.hypot(a.x - p.x, (a.y - 18) - p.y);
            if (d < jarak) { jarak = d; terdekat = a; }
          }
          z = terdekat ? terdekat.y + 2 : p.y <= FLOOR_TOP ? DINDING_Z + 3 : p.y + 6;
        }
        dalamPartikel.set(p, z);
      }
      let X = p.x, Y, Z;
      if (z === -1) { Y = 80 - (p.y - 30) * (70 / 94); Z = 110; }
      else if (z <= DINDING_Z + 4) { Y = FLOOR_TOP - p.y; Z = z; }
      else { Y = Math.max(0.3, (z - p.y) * (z > FLOOR_TOP + 8 ? SKALA_ORANG : 1)); Z = z; }
      const a = Math.min(1, p.life * 1.6) * (p.a == null ? 1 : p.a);
      if (a < 0.05) continue;
      const s = p.s * 0.8;
      kotak(S, X - s / 2, X + s / 2, Y, Y + s, Z - s / 2, Z + s / 2, warna(p.c, Math.max(0.2, a)), { sisi: SEMUA, e: 0.55 });
    }
  }

  // ------------------------------------------------------- kartu event
  /* Tiap event hidup yang punya gambarProp jadi satu kartu tegak di
     kedalaman sortY-nya, persis urutan depth-sort 2D: yang di belakang meja
     rapat tetap di belakang meja rapat. Kanvas kartu dipakai ulang per event. */
  /* Kanvasnya cuma setinggi sortY: yang digambar di bawah garis kaki kartu
     jatuh di bawah lantai, jadi tidak pernah perlu diunggah. Dilukis ulang
     paling sering 25 kali sedetik — event bergerak, tapi tidak secepat layar. */
  const KARTU = new Map();   // E -> { kv, k, tek, sortY, dipakai, terakhir }
  const KK = 2;
  function lukisKartu(E) {
    let kt = KARTU.get(E);
    if (!kt) {
      const sortY = Math.max(DINDING_Z + 4, Math.min(H, E.def.sortY == null ? 118 : E.def.sortY));
      const tinggi = Math.ceil(sortY) + 2;
      const [kv, k] = kanvasBaru(W * KK, tinggi * KK);
      kt = { kv, k, tek: tekstur(W * KK, tinggi * KK, false), sortY, tinggi, dipakai: true, terakhir: -1e9 };
      KARTU.set(E, kt);
    }
    kt.dipakai = true;
    if (now - kt.terakhir < 40) return kt;
    kt.terakhir = now;
    const k = kt.k;
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.clearRect(0, 0, kt.kv.width, kt.kv.height);
    gambarKe(k, () => {
      ctx.setTransform(KK, 0, 0, KK, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      aman(() => E.def.gambarProp(E, S_EVENT()));
      ctx.globalAlpha = 1;
    });
    unggah(kt.tek, kt.kv, false);
    return kt;
  }
  // S (keadaan bersama event) di room.js: dipakai apa adanya kalau ada
  const S_EVENT = () => (typeof S !== 'undefined' ? S : undefined);

  /* gambarAtas: lapisan yang di 2D digambar di atas segalanya. Isinya dua
     macam, dan dibedakan dari pikselnya sendiri, bukan dari daftar event:
       - SELUBUNG LAYAR (kilat foto bersama, mati lampu, rona syukuran):
         keempat pojok kanvas ikut terisi → jadi tint seluruh layar 3D;
       - benda kecil (garis pindai layar, tanda tanya di atas kepala, burung
         di kaca jendela): kotak batasnya dicari, lalu kartunya ditaruh di
         kedalaman aktor pertama event itu — atau menempel di dinding kalau
         seluruh gambarnya jatuh di bidang dinding.
     Kanvasnya berskala 1 dan willReadFrequently: yang mahal di sini
     membaca pikselnya balik, bukan melukisnya. */
  const KARTU_ATAS = new Map();
  function aktorEvent(E) {
    const d = E.data || {};
    const calon = [E.aktor && E.aktor[0], d.a, d.pejabat, d.orang && d.orang[0]];
    return calon.find((o) => o && typeof o.x === 'number' && typeof o.y === 'number') || null;
  }
  function lukisAtas(E) {
    let kt = KARTU_ATAS.get(E);
    if (!kt) {
      const kv = document.createElement('canvas');
      kv.width = W; kv.height = H;
      const k = kv.getContext('2d', { willReadFrequently: true });
      kt = { kv, k, tek: tekstur(W, H, false), terakhir: -1e9, tint: null, z: 0, dinding: false, kosong: true };
      KARTU_ATAS.set(E, kt);
    }
    kt.dipakai = true;
    if (now - kt.terakhir < 50) return kt;
    kt.terakhir = now;
    const k = kt.k;
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.clearRect(0, 0, W, H);
    gambarKe(k, () => {
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      aman(() => E.def.gambarAtas(E, S_EVENT()));
      ctx.globalAlpha = 1;
    });
    const d = k.getImageData(0, 0, W, H).data;
    const pojok = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]].map(([x, y]) => (y * W + x) * 4);
    if (pojok.every((i) => d[i + 3] > 2)) {
      const i = pojok[0];
      kt.tint = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, d[i + 3] / 255];
      kt.kosong = true;
      return kt;
    }
    kt.tint = null;
    let y0 = H, y1 = -1;
    for (let y = 0; y < H; y++) {
      const baris = y * W * 4;
      for (let x = 0; x < W; x += 2) if (d[baris + x * 4 + 3] > 8) { if (y < y0) y0 = y; y1 = y; break; }
    }
    kt.kosong = y1 < 0;
    if (kt.kosong) return kt;
    const a = aktorEvent(E);
    kt.dinding = !a && y1 <= FLOOR_TOP;
    kt.z = kt.dinding ? DINDING_Z + 1.5 : Math.max(DINDING_Z + 4, Math.min(H, a ? a.y + 3 : y1 + 1));
    unggah(kt.tek, kt.kv, false);
    return kt;
  }

  let tintLayar = [];        // [[r,g,b,a], ...] dari selubung layar gambarAtas
  const kartuHidup = [];
  function perbaruiKartu() {
    for (const kt of KARTU.values()) kt.dipakai = false;
    for (const kt of KARTU_ATAS.values()) kt.dipakai = false;
    kartuHidup.length = 0;
    tintLayar = [];
    for (const E of eventHidup) {
      if (E.def.gambarProp) kartuHidup.push({ kt: lukisKartu(E), E, atas: false });
      if (E.def.gambarAtas) {
        const kt = lukisAtas(E);
        if (kt.tint) tintLayar.push(kt.tint);
        else if (!kt.kosong) kartuHidup.push({ kt, E, atas: true });
      }
    }
    for (const [E, kt] of KARTU) {
      if (!kt.dipakai) { gl.deleteTexture(kt.tek); KARTU.delete(E); }
    }
    for (const [E, kt] of KARTU_ATAS) {
      if (!kt.dipakai) { gl.deleteTexture(kt.tek); KARTU_ATAS.delete(E); }
    }
  }

  function susunKartu() {
    const S = G.kartu;
    S.kosongkan();
    for (const { kt, atas } of kartuHidup) {
      if (atas && kt.dinding) {
        // menempel di bidang dinding: baris 0..FLOOR_TOP jatuh di tinggi 110..0
        const z = kt.z;
        S.segi([0, 0, z], [W, 0, z], [W, TINGGI_DINDING, z], [0, TINGGI_DINDING, z], [0, 0, 1], PUTIH, [0, 0, 1, FLOOR_TOP / H]);
        continue;
      }
      // bidang tegak di z: baris 2D y jatuh di tinggi z - y, jadi baris 0
      // kanvas ada di puncak (tinggi z) dan baris z tepat di lantai
      const z = atas ? kt.z : kt.sortY, tinggiKanvas = atas ? H : kt.tinggi;
      S.segi([0, 0, z], [W, 0, z], [W, z, z], [0, z, z], [0, 0, 1], PUTIH, [0, 0, 1, z / tinggiKanvas]);
    }
    WADAH.kartu.isi(S);
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

    hitungCahaya();
    susunDinamis(stasiun, dt);
    susunKartu();
    const t5 = performance.now();
    // rata-rata bergerak per tahap (ms), dibaca lewat window.RUANG3D.waktu
    const ema = (k, v) => { T[k] = T[k] == null ? v : T[k] * 0.9 + v * 0.1; };
    ema('dinding', t1 - t0); ema('lantai', t2 - t1); ema('kulit', t3 - t2); ema('kartu', t4 - t3); ema('susun', t5 - t4);

    // --- lintasan bayangan
    const bayangNyala = !ringanAktif();
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
      WADAH.polos.gambar(); WADAH.kulit.gambar(); WADAH.dinamis.gambar(); WADAH.pudar.gambar();
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
    gl.uniform3fv(u.uLampuPos, CAHAYA.lampuPos);
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
    gl.bindTexture(gl.TEXTURE_2D, TEK_PUTIH); WADAH.polos.gambar(); WADAH.dinamis.gambar(); WADAH.samping.gambar();
    gl.bindTexture(gl.TEXTURE_2D, TEK_DINDING); WADAH.dinding.gambar();
    gl.bindTexture(gl.TEXTURE_2D, TEK_LANTAI); WADAH.lantai.gambar();
    gl.bindTexture(gl.TEXTURE_2D, TEK_KULIT); WADAH.kulit.gambar();
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(u.uUji, 0.5);
    WADAH.papan.gambar();
    // kartu event: satu tekstur per kartu, satu segi empat per kartu
    if (WADAH.kartu.n) {
      gl.bindVertexArray(WADAH.kartu.vao);
      kartuHidup.forEach(({ kt }, i) => {
        gl.bindTexture(gl.TEXTURE_2D, kt.tek);
        gl.drawArrays(gl.TRIANGLES, i * 6, 6);
      });
    }
    // yang tembus pandang: kedalaman dulu (tanpa warna), lalu warna dicampur
    // di permukaan terdepan saja — sosok pudar tetap pejal bentuknya
    if (WADAH.pudar.n) {
      gl.bindTexture(gl.TEXTURE_2D, TEK_PUTIH);
      gl.uniform1f(u.uUji, 0.0);
      gl.uniform1f(u.uPudar, 1);
      gl.enable(gl.CULL_FACE);
      gl.colorMask(false, false, false, false);
      WADAH.pudar.gambar();
      gl.colorMask(true, true, true, true);
      gl.depthMask(false);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      WADAH.pudar.gambar();
      gl.disable(gl.BLEND);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.uniform1f(u.uPudar, 0);
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
      if (a.diKadis) continue;
      const hw = 6 * SKALA_ORANG;
      const t = kenaKotak(r, a.x - hw, a.x + hw, 0, 29 * SKALA_ORANG, a.y - hw, a.y + hw);
      if (t >= 0 && t < tk) { tk = t; kena = a; }
    }
    return kena;
  }
  function pilihBarang(r) {
    let kena = null, tk = Infinity;
    for (const b of daftarBarang()) {
      const k = kotakBarang3D(b.kotak);
      const t = kenaKotak(r, ...k);
      if (t >= 0 && (t < tk - 2 || (Math.abs(t - tk) <= 2 && kena && b.luas < kena.luas))) { tk = t; kena = b; }
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
    if (a) { bukaKartu(a); return; }
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
      KAM.zoom = Math.max(0.6, Math.min(4.5, KAM.zoom * d / Math.max(20, seret.cubit)));
      seret.cubit = d;
      const tengah = [(p.x + q.x) / 2, (p.y + q.y) / 2];
      geserSasaran(tengah[0] - seret.tengah[0], tengah[1] - seret.tengah[1]);
      seret.tengah = tengah;
      return;
    }
    const dx = x - seret.x, dy = y - seret.y;
    if (!seret.jauh && Math.hypot(x - seret.x0, y - seret.y0) > 5) { seret.jauh = true; kanvas.classList.add('seret'); }
    if (!seret.jauh) return;
    if (seret.geser) geserSasaran(dx, dy);
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
    KAM.zoom = Math.max(0.6, Math.min(4.5, KAM.zoom * Math.exp(-e.deltaY * 0.0012)));
  }, { passive: false });
  kanvas.addEventListener('dblclick', () => {
    KAM.yaw = KAM_AWAL.yaw; KAM.pitch = KAM_AWAL.pitch; KAM.zoom = KAM_AWAL.zoom;
    KAM.sasaran = [...KAM_AWAL.sasaran];
  });
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
      tombol.title = aktif ? 'tampilan 3D — seret untuk memutar, roda untuk zoom, klik dua kali untuk kembali. Klik: kembali ke 2D'
        : 'tampilan 2D pixel-art — klik: pindah ke maket 3D';
    }
    if (simpan) ingatan.tulis('tampilan', aktif ? '3d' : '2d');
    if (aktif) { lebarCss = -1; ukurKanvas(); tunjukkanPetunjuk(); }
    else { fit(); petunjuk.classList.remove('tampak'); }
  }

  // Petunjuk kendali, sekali tiap masuk 3D, memudar sendiri: orang yang baru
  // pertama melihat maket ini tidak tahu kanvasnya bisa diputar.
  const petunjuk = document.createElement('div');
  petunjuk.className = 'petunjuk-3d';
  petunjuk.textContent = 'seret: putar maket · klik kanan / shift+seret: geser · roda: dekat–jauh · klik dua kali: tampak awal';
  stageInner.appendChild(petunjuk);
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
