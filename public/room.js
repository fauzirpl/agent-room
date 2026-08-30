/* agent-room :: renderer — edisi kantor dinas
   Kantor pemerintahan Indonesia dalam pixel-art. Satu pegawai (voxel 3D,
   gaya Crossy Road) per sesi Claude Code; tiap tool call dia jalan ke
   meja/stasiun yang sesuai lalu kerja di sana. */

const W = 480, H = 356;   // baris meja kerja menempati strip baru di bawah
const FLOOR_TOP = 110;
const IDLE_AFTER = 7000;   // ms tanpa event -> balik ke meja kerja sendiri
const SPEED = 52;          // px per detik

// Meja rapat menempati tengah ruangan, jadi tidak bisa ditembus. Semua
// perpindahan lewat dua lajur mendatar yang disambung dua lajur tegak.
const LANE_UP = 164;       // lajur di depan meja-meja dinding
const LANE_DOWN = 252;     // lajur di depan meja rapat
const LANE_L = 160;        // penghubung kiri, celah antara bendera dan karpet
const LANE_R = 337;        // penghubung kanan

const canvas = document.getElementById('room');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const overlay = document.getElementById('overlay');
const stageInner = document.getElementById('stageInner');
const logEl = document.getElementById('log');
const crewEl = document.getElementById('crew');

let now = performance.now();
let scale = 2, offX = 0, offY = 0;
// lebar panggung, dicatat waktu fit(): balon pikiran dijaga supaya tidak
// separuh keluar layar waktu orangnya berdiri di tepi ruangan
let panggungW = 0;

function fit() {
  const availW = stageInner.clientWidth - 36;
  const availH = stageInner.clientHeight - 36;
  let s = Math.min(availW / W, availH / H);
  scale = s >= 2 ? Math.floor(s) : Math.max(0.6, s);
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
  const cr = canvas.getBoundingClientRect();
  const pr = stageInner.getBoundingClientRect();
  offX = cr.left - pr.left;
  offY = cr.top - pr.top;
  panggungW = pr.width;
}
new ResizeObserver(fit).observe(stageInner);

/* ---------------------------------------------------------------- palette */
const P = {
  cream: '#e9e2cb', creamD: '#ddd4b8',
  mint: '#aecdb6', mintD: '#9cbfa5',
  rail: '#7fae8d', base: '#5f7a68',
  tile: '#d8dcd3', tileD: '#cdd2c7', grout: '#b3b8ac',
  wood: '#8a6844', woodD: '#5f4530',
  metal: '#7c8578', metalL: '#a8b1a3',
  gold: '#d1a326', red: '#c22b2b', blue: '#3565b0',
  amber: '#ffb454', teal: '#4ec9b0', green: '#7ee787',
  blueL: '#79c0ff', mag: '#d2a8ff',
  paper: '#f2f0e6', ink: '#2c3440',
};

const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

function glow(x, y, radius, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------- voxel util */
const shadeCache = new Map();
function sh(hex, f) {
  const key = hex + f;
  let v = shadeCache.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const c = (b) => Math.min(255, Math.round(((n >> b) & 255) * f));
  v = `rgb(${c(16)},${c(8)},${c(0)})`;
  shadeCache.set(key, v);
  return v;
}

/* Balok 3D pixel: (x,y) = pojok kiri-bawah muka depan; kedalaman ke kanan-atas.
   Tiga sisi kena cahaya beda: atas terang, depan normal, kanan gelap. */
function box3(x, y, w, h, d, c) {
  const t = sh(c, 1.28), s = sh(c, 0.66);
  r(x, y - h, w, h, c);
  for (let i = 1; i <= d; i++) {
    r(x + i, y - h - i, w, 1, t);
    r(x + w + i - 1, y - h - i, 1, h, s);
  }
}

/* --------------------------------------------------------------- stations */
// Empat meja kerja di baris paling depan — tempat pegawai duduk saat berpikir.
// Titik x-nya BUKAN dipilih supaya rapi, tapi diambil dari koridor turun yang
// benar-benar bebas perabot (54..118, 159..194, 369..381, 419..471). Jarak yang
// rapi akan memaksa pegawai menembus ruang tunggu atau kipas menuju mejanya.
const MEJA_KERJA_X = [176, 374, 86, 444];   // urut prioritas pemakaian
const MEJA_KERJA_Y = 316;                   // garis kaki pegawai yang duduk

const STATIONS = {
  read:   { x: 54,  y: 138, lane: LANE_UP,   face: 'up',   name: 'lemari arsip',   fx: 'dust'  },
  search: { x: 132, y: 138, lane: LANE_UP,   face: 'up',   name: 'filing kabinet', fx: 'scan'  },
  web:    { x: 212, y: 138, lane: LANE_UP,   face: 'up',   name: 'meja printer',   fx: 'ping'  },
  edit:   { x: 286, y: 140, lane: LANE_UP,   face: 'up',   name: 'meja stempel',   fx: 'ink'   },
  // Rak PC server, satu-satunya mesin berdiri di ruangan ini. Slotnya dibatasi
  // empat: yang kelima jatuh tepat di atas ember penadah tetesan AC.
  server: { x: 390, y: 141, lane: LANE_UP,   step: 20, slots: 4,
            face: 'up', name: 'PC server',      fx: 'data'  },
  agent:  { x: 452, y: 140, lane: LANE_UP,   face: 'up',   name: 'ruang kadis',    fx: 'paper' },
  rapat:  { x: 246, y: 192, lane: LANE_UP,   face: 'down', name: 'meja rapat',     fx: 'talk'  },
  // empat meja kerja; slotsX dipakai karena jaraknya tidak seragam
  think:  { x: 176, y: MEJA_KERJA_Y, lane: LANE_DOWN, slotsX: MEJA_KERJA_X,
            face: 'down', name: 'meja kerja',     fx: 'idea'  },
  // ruang tunggu ditaruh di baris depan tengah, sejajar meja disposisi: jaraknya
  // ke semua stasiun kira-kira sama, jadi tidak ada sisi yang jadi trip panjang.
  // Langkah slotnya 23 biar yang berdiri menunggu tidak saling tumpang.
  idle:   { x: 282, y: 288, lane: LANE_DOWN, step: 23,
            face: 'down', name: 'ruang tunggu', fx: 'steam' },
};

const TOOL_STATION = {
  Read: 'read', Glob: 'read', NotebookRead: 'read',
  Grep: 'search', Search: 'search', ToolSearch: 'search',
  Edit: 'edit', Write: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit', Artifact: 'edit',
  // Bash & kawan-kawan sengaja tidak didaftar di sini: mejanya ditentukan ISI
  // perintahnya, bukan nama tool-nya. Lihat stationFor di bawah.
  WebFetch: 'web', WebSearch: 'web',
  Task: 'rapat', Agent: 'rapat', Workflow: 'rapat', TaskOutput: 'rapat', TaskStop: 'rapat',
  Skill: 'agent', SendMessage: 'agent',
  TodoWrite: 'think', ExitPlanMode: 'think', EnterPlanMode: 'think', AskUserQuestion: 'think',
};
// Tiap meja kerja sudah punya laptop sendiri, jadi perintah shell biasa
// dikerjakan pegawainya di mejanya. Yang menyeret dia berdiri ke rak server
// cuma urusan git: mendorong, menarik, dan mencatat perubahan.
const SHELL_TOOL = /^(Bash|PowerShell|BashOutput|KillShell)$/;
// Kegiatan berpikir — menyusun agenda, menyusun/mengajukan rencana, menunggu
// arahan — dikerjakan di tempat yang sedang dia tempati: di meja rapat selagi
// ada subagent yang benar-benar berjalan, di meja kerja kalau dia sendirian.
// Sengaja hanya kelompok ini: perintah shell juga jatuh ke 'think' kalau bukan
// urusan git, dan menjalankan perintah bukan berpikir.
const THINK_TOOL = /^(TodoWrite|ExitPlanMode|EnterPlanMode|AskUserQuestion)$/;
const stationFor = (tool, label, session) => {
  if (!tool) return 'think';
  if (SHELL_TOOL.test(tool)) return segmenGit(label) ? 'server' : 'think';
  if (THINK_TOOL.test(tool) && session && sedangRapat(session)) return 'rapat';
  return TOOL_STATION[tool] || (tool.startsWith('mcp__') ? 'agent' : 'think');
};

// Efek partikel yang menempel pada TOOL, bukan pada mejanya: satu meja kerja
// bisa dipakai menyusun agenda (lampu ide) atau menjalankan perintah (glyph).
const FX_TOOL = { Bash: 'glyph', PowerShell: 'glyph', BashOutput: 'glyph', KillShell: 'glyph' };

/* ------------------------------------------------- bahasa kegiatan ------ */
/* Yang dibaca orang bukan nama tool, tapi apa yang lagi dikerjakan pegawainya. */
const KEGIATAN = {
  Read: 'membaca berkas', Glob: 'mendata berkas', NotebookRead: 'membaca catatan',
  Grep: 'mencari data', Search: 'mencari data', ToolSearch: 'mencari alat',
  Edit: 'merevisi berkas', MultiEdit: 'merevisi berkas', Write: 'menyusun berkas',
  NotebookEdit: 'merevisi catatan', Artifact: 'menerbitkan dokumen',
  Bash: 'menjalankan perintah', PowerShell: 'menjalankan perintah',
  BashOutput: 'memeriksa hasil', KillShell: 'menghentikan proses',
  WebFetch: 'membuka situs', WebSearch: 'mencari informasi',
  Task: 'menggelar rapat', Agent: 'menggelar rapat', Workflow: 'memimpin rapat besar',
  TaskOutput: 'membaca hasil rapat', TaskStop: 'menutup rapat',
  Skill: 'menghadap kadis', SendMessage: 'mengirim nota dinas',
  TodoWrite: 'menyusun agenda', ExitPlanMode: 'mengajukan rencana',
  EnterPlanMode: 'menyusun rencana', AskUserQuestion: 'menunggu arahan',
};

// Perintah shell panjang penuh flag tidak enak dibaca. Buang dulu segmen
// pengantar seperti `cd ...` supaya yang tampil program yang benar-benar
// dijalankan, lalu ambil nama programnya saja kalau masih terlalu panjang.
const NOISE = /^(cd|echo|export|set|source|\.)$/;
// Pembungkus yang tidak menambah arti apa pun ke perintahnya. Tanpa ini
// `rtk git push` terbaca sebagai program `rtk`, dan pegawainya tidak pernah
// sampai ke rak server.
const PEMBUNGKUS = /^(rtk|sudo|command|time|winpty|env)$/;
const PROGRAM_GIT = /^(git|gh|glab|hub|jj|lazygit|tig)(\.exe)?$/i;

// Kata-kata satu segmen perintah, pembungkus di depannya sudah dibuang.
function kataPerintah(seg) {
  const kata = String(seg).trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < kata.length && PEMBUNGKUS.test(kata[i])) i++;
  return kata.slice(i);
}

// Segmen pertama yang programnya git atau kerabatnya, atau null. Dipakai dua
// kali: memilih stasiun, dan memilih frasa kegiatan yang tampil.
function segmenGit(cmd) {
  for (const seg of String(cmd || '').split(/&&|\|\||;|\|/)) {
    const kata = kataPerintah(seg);
    if (kata.length && PROGRAM_GIT.test(kata[0])) return kata;
  }
  return null;
}

// Urusan git punya bahasanya sendiri: "menjalankan perintah git push" tidak
// mengatakan apa-apa, "mengirim perubahan origin main" mengatakan semuanya.
const KEGIATAN_GIT = {
  push: 'mengirim perubahan', pull: 'menarik perubahan', fetch: 'menarik pembaruan',
  clone: 'menyalin repositori', init: 'membuka repositori', remote: 'mengatur server asal',
  add: 'menyiapkan perubahan', commit: 'mencatat perubahan', status: 'memeriksa perubahan',
  diff: 'membandingkan perubahan', show: 'membaca perubahan', log: 'membaca riwayat',
  blame: 'menelusuri riwayat', branch: 'mengurus cabang', checkout: 'berpindah cabang',
  switch: 'berpindah cabang', merge: 'menggabung cabang', rebase: 'menata ulang riwayat',
  cherry: 'memetik perubahan', revert: 'membatalkan perubahan', reset: 'mengembalikan berkas',
  restore: 'mengembalikan berkas', stash: 'menyimpan sementara', tag: 'menandai versi',
  worktree: 'menyiapkan ruang kerja', clean: 'membersihkan berkas', submodule: 'mengurus submodul',
};

function kegiatanGit(cmd) {
  const kata = segmenGit(cmd);
  if (!kata) return null;
  const prog = kata[0].replace(/\.exe$/i, '').toLowerCase();
  let i = 1;                                  // lewati flag global: git -C folder status
  while (i < kata.length && kata[i].startsWith('-')) i += kata[i] === '-C' ? 2 : 1;
  const arg = kata.slice(i);
  if (prog !== 'git') return ['mengurus ' + prog, arg.slice(0, 2).join(' ')];
  const v = KEGIATAN_GIT[(arg[0] || '').toLowerCase().replace(/-.*$/, '')];
  return v ? [v, arg.slice(1, 3).join(' ')] : ['mengurus repositori', arg.slice(0, 2).join(' ')];
}

function ringkasPerintah(o) {
  if (!o) return '';
  const seg = o.split(/&&|\|\||;/).map((s) => kataPerintah(s).join(' ')).filter(Boolean);
  const inti = seg.find((s) => !NOISE.test(s.split(/\s+/)[0])) || seg[0] || o;
  if (inti.length <= 30 && !/\s-{1,2}\w/.test(inti)) return inti;
  return inti.split(/\s+/)[0];
}

function kegiatan(tool, label) {
  let o = label || '';
  if (!tool) return ['bekerja', o];
  if (tool.startsWith('mcp__')) {
    let srv = (tool.split('__')[1] || '').replace(/[-_]/g, ' ');
    // sebagian server MCP bernama UUID; kalau dipecah jadi deretan kata palsu
    if (!srv || /^[0-9a-f][0-9a-f ]{14,}$/i.test(srv)) srv = 'sistem luar';
    return ['berkoordinasi dengan', srv];
  }
  if (tool === 'Bash' || tool === 'PowerShell') {
    const g = kegiatanGit(o);
    if (g) return g;
    o = ringkasPerintah(o);
  }
  const v = KEGIATAN[tool];
  return v ? [v, o] : ['memakai ' + tool, o];
}

/* ------------------------------------------------- suasana waktu nyata ---
   Ruangan mengikuti jam di mesin penontonnya: pagi segar kekuningan, siang
   terang, senja jingga, malam gelap dengan neon hangat sebagai cahaya utama.
   Parameternya diinterpolasi mulus antar patokan jam, jadi suasananya
   bergeser pelan-pelan, tidak pernah meloncat. */

// Uji suasana tanpa menunggu jamnya tiba: tambah ?jam=18.4 di URL.
const JAM_PAKSA = parseFloat(new URLSearchParams(location.search).get('jam'));

const rgbCache = new Map();
function bagiWarna(w2) {
  let v = rgbCache.get(w2);
  if (!v) {
    if (w2[0] === '#') {
      const n = parseInt(w2.slice(1), 16);
      v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    } else {
      v = w2.match(/\d+/g).map(Number);      // 'rgb(r,g,b)' hasil lerp sebelumnya
    }
    rgbCache.set(w2, v);
  }
  return v;
}
function lerpHex(h1, h2, t) {
  const a = bagiWarna(h1), b = bagiWarna(h2);
  const c = (i) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

/* Patokan suasana per jam. atas/bawah = gradasi langit jendela, awan = warna
   awan, amb+ambA = selubung warna seisi ruangan, lampu = intensitas neon
   hangat, sinar+sinarA = berkas cahaya jendela di lantai, luar = seberapa
   terang dunia luar (mengatur matahari, awan, dan warna kota),
   bintang/bulan = kemunculannya di jendela. */
const FASE_HARI = [
  { jam: 0,    atas: '#0c1524', bawah: '#243450', awan: '#3c4a66', amb: '#0d1730', ambA: .38, lampu: 1,   sinar: '#9ab8d8', sinarA: .05, luar: 0,   bintang: 1,   bulan: 1 },
  { jam: 4.6,  atas: '#0c1524', bawah: '#243450', awan: '#3c4a66', amb: '#0d1730', ambA: .38, lampu: 1,   sinar: '#9ab8d8', sinarA: .05, luar: 0,   bintang: 1,   bulan: 1 },
  { jam: 5.4,  atas: '#1c2444', bawah: '#454a78', awan: '#5c5a80', amb: '#131b38', ambA: .27, lampu: .9,  sinar: '#a8b4d4', sinarA: .05, luar: .06, bintang: .55, bulan: .7 },
  { jam: 6.2,  atas: '#3e4a80', bawah: '#e8945e', awan: '#e8a878', amb: '#3c2a44', ambA: .15, lampu: .55, sinar: '#ffc890', sinarA: .08, luar: .4,  bintang: .12, bulan: .25 },
  { jam: 7.2,  atas: '#7fb2dc', bawah: '#ffe2b4', awan: '#fff2dc', amb: '#ffd9a0', ambA: .05, lampu: .18, sinar: '#ffe2a8', sinarA: .12, luar: 1,   bintang: 0,   bulan: 0 },
  { jam: 9,    atas: '#8fc8ea', bawah: '#d3ecf8', awan: '#ffffff', amb: '#fff6e0', ambA: .02, lampu: 0,   sinar: '#fdf3d8', sinarA: .09, luar: 1,   bintang: 0,   bulan: 0 },
  { jam: 15.5, atas: '#8fc8ea', bawah: '#d3ecf8', awan: '#ffffff', amb: '#fff6e0', ambA: 0,   lampu: 0,   sinar: '#fdf3d8', sinarA: .09, luar: 1,   bintang: 0,   bulan: 0 },
  { jam: 16.8, atas: '#7ab0d8', bawah: '#f6d9a4', awan: '#ffe9c4', amb: '#ffce8a', ambA: .05, lampu: .1,  sinar: '#ffd88a', sinarA: .1,  luar: .95, bintang: 0,   bulan: 0 },
  { jam: 17.9, atas: '#5c5194', bawah: '#ff8f48', awan: '#ff9f62', amb: '#c8642e', ambA: .13, lampu: .4,  sinar: '#ff9a4e', sinarA: .14, luar: .55, bintang: 0,   bulan: 0 },
  { jam: 18.8, atas: '#252b56', bawah: '#b85238', awan: '#6a4a5c', amb: '#38284a', ambA: .24, lampu: .78, sinar: '#d88a5c', sinarA: .07, luar: .15, bintang: .4,  bulan: .5 },
  { jam: 19.8, atas: '#0e1730', bawah: '#2c3a58', awan: '#3c4a66', amb: '#0e1730', ambA: .36, lampu: 1,   sinar: '#9ab8d8', sinarA: .05, luar: 0,   bintang: 1,   bulan: 1 },
];

let ambBasis = null, ambDetik = -1;
let ambKini = null, ambFrame = -1;

/* Suasana dihitung dua tingkat. Yang mahal (mencari patokan jam, lerp warna)
   cukup sekali per detik dan disimpan di ambBasis. Yang dipasang event berubah
   tiap frame, jadi diterapkan di atas salinannya — kalau ditumpuk langsung ke
   cache, mendung yang lewat akan menggelapkan ruangan selamanya. */
function ambien() {
  const detik = (now / 1000) | 0;
  if (!ambBasis || detik !== ambDetik) { ambDetik = detik; ambBasis = hitungAmbien(); }
  if (ambKini && ambFrame === now) return ambKini;
  ambFrame = now;
  ambKini = { ...ambBasis };
  if (MOD.ambPlus) {
    ambKini.amb = lerpHex(ambKini.amb, '#3a4356', Math.min(1, MOD.ambPlus * 5));
    ambKini.ambA = Math.min(0.6, ambKini.ambA + MOD.ambPlus);
  }
  if (MOD.sinar !== 1) ambKini.sinarA *= MOD.sinar;
  if (MOD.luar !== 1) {
    ambKini.luar *= MOD.luar;
    ambKini.atas = lerpHex(ambKini.atas, '#6f7686', (1 - MOD.luar) * 0.7);
    ambKini.bawah = lerpHex(ambKini.bawah, '#8a909c', (1 - MOD.luar) * 0.7);
    ambKini.awan = lerpHex(ambKini.awan, '#6f7686', (1 - MOD.luar) * 0.85);
  }
  if (MOD.lampuMin) ambKini.lampu = Math.max(ambKini.lampu, MOD.lampuMin);
  return ambKini;
}

function hitungAmbien() {
  const d = new Date();
  let jam = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  if (Number.isFinite(JAM_PAKSA)) jam = ((JAM_PAKSA % 24) + 24) % 24;
  let a = FASE_HARI[FASE_HARI.length - 1];
  let b = { ...FASE_HARI[0], jam: 24 };                    // lewat tengah malam
  for (let i = 0; i < FASE_HARI.length - 1; i++) {
    if (jam >= FASE_HARI[i].jam && jam < FASE_HARI[i + 1].jam) {
      a = FASE_HARI[i]; b = FASE_HARI[i + 1];
      break;
    }
  }
  const t = (jam - a.jam) / (b.jam - a.jam);
  const num = (k) => a[k] + (b[k] - a[k]) * t;
  const A = {
    jam,
    atas: lerpHex(a.atas, b.atas, t),
    bawah: lerpHex(a.bawah, b.bawah, t),
    awan: lerpHex(a.awan, b.awan, t),
    amb: lerpHex(a.amb, b.amb, t),
    sinar: lerpHex(a.sinar, b.sinar, t),
    ambA: num('ambA'), lampu: num('lampu'), sinarA: num('sinarA'),
    luar: num('luar'), bintang: num('bintang'), bulan: num('bulan'),
  };
  // Hujan menimpa jam: langit mengelabu, dunia luar meredup, berkas cahaya
  // jendela pudar, dan neon ikut menyala — kantor waktu hujan deras siang
  // hari memang menyalakan lampu. Kelabunya menyesuaikan terang langit saat
  // itu, jadi hujan malam tetap gelap, bukan mendadak abu-abu muda.
  const hj = CUACA.hujan;
  if (hj > 0.01) {
    const kelabu = lerpHex('#2b333e', '#7b8792', A.luar);
    const kelabuMuda = lerpHex('#39434e', '#9aa5b0', A.luar);
    A.atas = lerpHex(A.atas, kelabu, 0.65 * hj);
    A.bawah = lerpHex(A.bawah, kelabuMuda, 0.65 * hj);
    A.awan = lerpHex(A.awan, kelabu, 0.75 * hj);
    A.sinar = lerpHex(A.sinar, '#aab6c2', 0.7 * hj);
    A.amb = lerpHex(A.amb, '#333c48', 0.45 * hj);
    A.ambA = Math.min(0.5, A.ambA + 0.08 * hj);
    A.sinarA *= 1 - 0.6 * hj;
    A.luar *= 1 - 0.55 * hj;
    A.lampu = Math.max(A.lampu, 0.55 * hj);
    A.bintang *= 1 - 0.85 * hj;
    A.bulan *= 1 - 0.75 * hj;
  }
  return A;
}

/* --------------------------------------------------------------- cuaca ---
   Hujan di jendela mengikuti hujan sungguhan: saat halaman dibuka (lalu tiap
   10 menit) dia bertanya ke GET /cuaca — server menebak lokasi dari IP dan
   membaca open-meteo. Kalau servernya versi lama, offline, atau fiturnya
   dimatikan, halaman jatuh ke "hujan sesekali": dadu deterministik per jam,
   sama untuk semua penonton. Uji cepat: ?hujan=gerimis|deras|petir|0..1 */
const CUACA = { hujan: 0, petir: false, sumber: 'menunggu', hujanTinggiSejak: 0 };

const HUJAN_PAKSA = (() => {
  const v = new URLSearchParams(location.search).get('hujan');
  if (v == null) return null;
  if (v === 'petir') return { hujan: 1, petir: true };
  if (v === 'deras') return { hujan: 0.9, petir: false };
  if (v === 'gerimis') return { hujan: 0.25, petir: false };
  const n = parseFloat(v);
  return Number.isFinite(n) ? { hujan: Math.max(0, Math.min(1, n)), petir: n >= 1 } : null;
})();

// Kode cuaca WMO -> intensitas hujan 0..1. Salju digambar sebagai hujan halus
// saja; kanvas ini tidak punya kosakata salju dan pemandangannya Jakarta.
function tafsirKodeWMO(kode) {
  if (kode == null || !Number.isFinite(+kode)) return null;
  const k = +kode;
  if ([95, 96, 99].includes(k)) return { hujan: 1, petir: true };
  if ([65, 67, 82].includes(k)) return { hujan: 0.9, petir: false };
  if ([63, 81].includes(k)) return { hujan: 0.6, petir: false };
  if ([61, 66, 80].includes(k)) return { hujan: 0.45, petir: false };
  if ([51, 53, 55, 56, 57].includes(k)) return { hujan: 0.25, petir: false };
  if ([71, 73, 75, 77, 85, 86].includes(k)) return { hujan: 0.3, petir: false };
  return { hujan: 0, petir: false };
}

// Tanpa data: tiap jam dilempar dadu deterministik (hash jam epoch), kira-kira
// 1 dari 5 jam turun hujan ringan-sedang. Deterministik supaya dua penonton
// yang membuka halaman bersamaan melihat langit yang sama.
function hujanSesekali() {
  const blok = Math.floor(Date.now() / 3600000);
  const u = Math.abs(Math.sin(blok * 12.9898) * 43758.5453) % 1;
  if (u < 0.08) return { hujan: 0.6, petir: false };
  if (u < 0.2) return { hujan: 0.3, petir: false };
  return { hujan: 0, petir: false };
}

function pasangCuaca(c, sumber) {
  const tadi = CUACA.hujan > 0.01;
  CUACA.hujan = c.hujan;
  CUACA.petir = c.petir;
  CUACA.sumber = sumber;
  const kini = CUACA.hujan > 0.01;
  if (kini !== tadi) {
    pushLog({ ts: Date.now() }, '', kini
      ? [CUACA.petir ? 'hujan petir' : 'hujan turun', 'di luar jendela']
      : ['hujan reda', 'langit terang lagi']);
  }
}

async function muatCuaca() {
  if (HUJAN_PAKSA) { pasangCuaca(HUJAN_PAKSA, 'paksa'); return; }
  let mati = false;
  try {
    const r = await fetch('/cuaca');
    const c = await r.json();
    mati = !!(c && c.mati);
    const t = tafsirKodeWMO(c && c.kode);
    if (t) { pasangCuaca(t, 'cuaca' + (c.kota ? ' ' + c.kota : '')); return; }
  } catch (_) { /* server lama / offline: jatuh ke dadu di bawah */ }
  // Gagal transien padahal bacaan terakhirnya cuaca nyata? Tahan bacaan itu.
  // Menimpanya dengan dadu bikin badai "reda" palsu tiap server di-restart,
  // lalu "turun" lagi di poll berikutnya — lognya bolak-balik bohong.
  if (!mati && CUACA.sumber.startsWith('cuaca')) return;
  pasangCuaca(hujanSesekali(), 'sesekali');
}
// Panggilan perdananya ada di bagian init paling bawah: pasangCuaca menulis
// ke log lewat helper yang baru didefinisikan belakangan (const `esc`), jadi
// memanggilnya dari sini kena TDZ dan mati senyap di dalam promise.

/* Kilat: hanya saat petir. Satu sambaran = kedip ganda ~250 ms; jeda antar
   sambaran 5-16 detik. Nilainya 0..1, dipakai jendela dan seisi ruangan. */
let kilat = 0;
let kilatSampai = 0, kilatBerikut = 0;
function kilatAktif() {
  if (!CUACA.petir) { kilatBerikut = 0; return 0; }
  if (!kilatBerikut) kilatBerikut = now + 2000 + Math.random() * 6000;
  if (now > kilatBerikut) {
    kilatSampai = now + 180 + Math.random() * 160;
    kilatBerikut = now + 5000 + Math.random() * 11000;
    gemuruh(280 + Math.random() * 900);        // guntur menyusul cahayanya
  }
  if (now < kilatSampai) {
    return Math.sin((kilatSampai - now) / 32) > -0.35 ? 1 : 0.3;
  }
  return 0;
}

/* ---------------------------------------------------------------- dinding */
function drawGaruda(cx, gy) {
  const g = P.gold, gd = sh(P.gold, 0.75);
  r(cx - 10, gy + 1, 2, 4, g);            // ujung sayap terangkat
  r(cx + 8, gy + 1, 2, 4, g);
  r(cx - 8, gy + 2, 16, 3, g);            // sayap terbentang
  r(cx - 6, gy + 5, 12, 2, g);
  r(cx - 4, gy + 7, 8, 1, gd);
  r(cx - 2, gy + 4, 4, 8, g);             // badan
  r(cx - 1, gy + 1, 3, 3, g);             // kepala
  r(cx + 2, gy + 2, 1, 1, gd);            // paruh
  r(cx - 3, gy + 12, 6, 1, gd);           // pangkal ekor
  r(cx - 2, gy + 13, 4, 2, g);            // bulu ekor
  r(cx - 1, gy + 6, 3, 3, '#b03030');     // perisai merah
  r(cx - 1, gy + 9, 3, 1, '#f0ede2');     //   putih
}

function drawPortrait(x, y) {
  r(x, y, 12, 15, '#6d5535');             // bingkai
  r(x + 1, y + 1, 10, 13, P.paper);
  r(x + 4, y + 3, 4, 2, '#1d1712');       // rambut
  r(x + 4, y + 5, 4, 3, '#e0ae80');       // wajah
  r(x + 2, y + 8, 8, 5, '#2c3440');       // jas
  r(x + 5, y + 9, 2, 3, '#f0ede2');       // kemeja
}

function drawClock(cx, cy) {
  ctx.fillStyle = '#f4f4ee';
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = MOD.jamSorot ? '#1c2228' : '#3a3f45';
  ctx.lineWidth = 1.4 + MOD.jamSorot * 0.4;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();
  let hr, mn, sc;
  if (RUANGAN.jamBeku) {
    // baterai habis: sudutnya dibekukan pada nilai yang disimpan event, bukan
    // dari Date() — jam ini benar-benar berhenti, bukan cuma digambar lambat
    ({ hr, mn, sc } = RUANGAN.jamBeku);
    if (MOD.jamGetar) sc += Math.sin(now / 55) * 0.006;   // gemetar sebelum diam
  } else {
    const d = new Date();
    mn = (d.getMinutes() + d.getSeconds() / 60) / 60;
    hr = ((d.getHours() % 12) + mn) / 12;
    // ruangan sepi: jarum detik MELOMPAT tiap detik, bukan meluncur mulus —
    // itu yang bikin satu-satunya benda bergerak di ruangan terasa berdetak
    sc = (d.getSeconds() + (MOD.jamDetak ? 0 : d.getMilliseconds() / 1000)) / 60;
  }
  const hand = (frac, len, col, wid) => {
    const a = frac * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = col; ctx.lineWidth = wid;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
  };
  hand(hr, 3.4, '#2c3440', 1.3);
  hand(mn, 5.2, '#2c3440', 1);
  hand(sc, 5.8, MOD.jamSorot ? '#e8453f' : P.red, MOD.jamDetak ? 1.1 : 0.7);
}

/* Kedip neon dipakai di DUA tempat: tabungnya di drawWall, pendar dan kerucut
   cahayanya di drawAmbien. Rumusnya dulu ditulis dua kali dengan angka yang
   sama persis — aman selama tidak ada yang mengubahnya, tapi begitu ada event
   yang meredupkan lampu, yang satu padam dan yang lain tetap menyala. Satu
   fungsi, dua pemanggil, dan MOD ikut terbaca di keduanya sekaligus. */
const NEON_X = [170, 410];
function kedipNeon(i) {
  const cx = NEON_X[i];
  if (MOD.hening) return MOD.lampu * (1 - MOD.neonMati[i]);   // tidak berkedip
  let fl = 0.8 + 0.2 * Math.sin(now / 95 + cx);
  if (Math.sin(now / 1700 + cx) > 0.965) fl *= 0.5;   // kedip khas neon tua
  return Math.max(0, fl * MOD.lampu * (1 - MOD.neonMati[i]));
}

function drawWall() {
  r(0, 0, W, 70, P.cream);                       // dinding atas krem
  r(0, 70, W, 30, P.mint);                       // wainscot hijau mint
  r(0, 70, W, 2, P.rail);
  r(0, 100, W, 10, P.base);                      // plin bawah
  r(0, 108, W, 2, sh(P.base, 0.7));
  for (let x = 96; x < W; x += 96) {             // garis pilar samar
    r(x, 4, 1, 66, P.creamD);
    r(x, 72, 1, 28, P.mintD);
  }

  // Noda plafon rembes hujan, di atas lemari arsip. Permanen begitu muncul,
  // dan melebar tiap kali hujan deras terjadi lagi — dinding ini memang
  // tidak pernah benar-benar diperbaiki.
  for (const n of RUANGAN.nodaPlafon) {
    ctx.globalAlpha = 0.4;
    r(n.x, 0, n.w, 7, '#a89870');
    ctx.globalAlpha = 0.22;
    r(n.x - 2, 0, n.w + 4, 9, '#8a7a54');
    ctx.globalAlpha = 1;
  }

  // spanduk merah-putih
  r(18, 7, 134, 15, P.red);
  r(18, 7, 134, 2, '#f0ede2');
  r(18, 20, 134, 2, '#f0ede2');
  ctx.fillStyle = '#fdf6ec';
  ctx.font = '7px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('MELAYANI SEPENUH HATI', 24, 15);

  // Cat mengelupas di bidang dinding kosong antara jendela dan meja stempel.
  // Tidak pernah kembali rata sendiri — kantor ini tidak dicat tiap bulan.
  if (RUANGAN.catMengelupas > 0.02) {
    const k = RUANGAN.catMengelupas;
    r(196, 40, Math.round(4 + k * 10), Math.round(3 + k * 6), '#b8b2a4');
    r(197, 41, Math.round(2 + k * 8), Math.round(1 + k * 4), '#a8a294');
    if (k > 0.6) r(194, 46, 3, 2, '#b8b2a4');
  }

  // trio wajib: foto pejabat — Garuda — foto pejabat
  drawPortrait(268, 6);
  drawGaruda(300, 6);
  if (RUANGAN.fotoMiring) {                    // yang kanan kesenggol dan miring
    ctx.save();
    ctx.translate(326, 13);
    ctx.rotate(RUANGAN.fotoMiring);
    drawPortrait(-6, -7);
    ctx.restore();
  } else {
    drawPortrait(320, 6);
  }

  drawClock(168, 38);

  // kalender dinding — kepala warnanya berganti tiap lembar disobek
  const KAL = [P.red, '#3565b0', '#3e6b4f', '#9a6a12'];
  r(158, 54, 16, 20, P.paper);
  r(158, 54, 16, 5, KAL[RUANGAN.kalenderBulan % KAL.length]);
  for (let i = 0; i < 9; i++) r(160 + (i % 3) * 5, 62 + ((i / 3) | 0) * 4, 3, 2, '#b9c0ca');
  r(160 + (RUANGAN.kalenderBulan % 3) * 5, 62 + ((RUANGAN.kalenderBulan % 2)) * 4, 3, 2, P.red);

  // AC split (bocor, netes ke ember)
  r(336, 14, 38, 13, '#f0f2ec');
  r(336, 24, 38, 3, '#d5d9d0');
  r(338, 25, 34, 1, '#b9beb4');
  r(340, 17, 22, 1, '#d5d9d0');
  const led = Math.sin(now / 600) > 0 ? '#57d06a' : '#2c5c38';
  r(368, 17, 2, 2, led);

  // rambu dilarang merokok dekat pintu kadis
  ctx.fillStyle = '#f4f4ee';
  ctx.beginPath(); ctx.arc(430, 44, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = P.red; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(430, 44, 5, 0, Math.PI * 2); ctx.stroke();
  r(427, 43, 6, 1, '#3a3f45');
  ctx.beginPath(); ctx.moveTo(427, 47); ctx.lineTo(433, 41); ctx.stroke();

  // lampu neon TL gantung
  NEON_X.forEach((cx, i) => {
    const fl = kedipNeon(i);
    r(cx - 14, 0, 1, 8, '#8b8f86');
    r(cx + 13, 0, 1, 8, '#8b8f86');
    r(cx - 20, 8, 40, 2, '#b9bcb2');
    ctx.globalAlpha = fl;
    r(cx - 18, 10, 36, 3, '#fbfcf3');
    ctx.globalAlpha = 1;
    glow(cx, 13, 30, '#fdfdf2', 0.1 * fl);
  });
}

/* ----------------------------------------------------------------- lantai */
function drawFloor() {
  const FH = H - FLOOR_TOP;
  r(0, FLOOR_TOP, W, FH, P.tile);
  for (let gy = 0; gy * 24 < FH + 24; gy++) {
    for (let gx = 0; gx * 24 < W; gx++) {
      const y = FLOOR_TOP + gy * 24, x = gx * 24;
      if ((gx * 7 + gy * 13) % 5 === 0) r(x + 1, y + 1, 23, 23, P.tileD);   // ubin belel
      if ((gx * 11 + gy * 3) % 17 === 0) {                                   // ubin retak
        ctx.strokeStyle = P.grout; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 4, y + 18); ctx.lineTo(x + 14, y + 8);
        ctx.lineTo(x + 19, y + 12); ctx.stroke();
      }
    }
  }
  // Retakan tambahan dari event ubin-retak-nambah, gaya sama dengan yang
  // prosedural di atas tapi posisinya tersimpan — jadi permanen dan bisa
  // dihindari, bukan cuma dekorasi yang muncul ulang tiap frame di tempat baru.
  for (const k of RUANGAN.retakExtra) {
    const x = k.gx * 24, y = FLOOR_TOP + k.gy * 24;
    ctx.strokeStyle = P.grout; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 12, y + 12);
    ctx.lineTo(x + 12 + Math.round(k.t * 8) - 8, y + 12 - Math.round(k.t * 6));
    ctx.lineTo(x + 12 + Math.round(k.t * 5), y + 12 + Math.round(k.t * 7));
    ctx.stroke();
  }
  for (let y = FLOOR_TOP; y < H; y += 24) r(0, y, W, 1, P.grout);          // nat
  for (let x = 0; x < W; x += 24) r(x, FLOOR_TOP, 1, H - FLOOR_TOP, P.grout);
  const fg = ctx.createLinearGradient(0, FLOOR_TOP, 0, H);
  fg.addColorStop(0, 'rgba(255,250,230,.16)');
  fg.addColorStop(1, 'rgba(60,70,60,.16)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, FLOOR_TOP, W, FH);

  // karpet merah membingkai meja rapat
  ctx.globalAlpha = 0.94;
  r(152, 176, 188, 76, '#743030');
  r(155, 179, 182, 70, '#8d3a3a');
  r(160, 184, 172, 60, '#743030');
  r(164, 188, 164, 52, '#984545');
  ctx.globalAlpha = 1;
  for (let x = 176; x < 316; x += 24) {           // motif emas
    r(x + 3, 244, 2, 2, P.gold);
    r(x + 1, 246, 6, 2, P.gold);
    r(x + 3, 248, 2, 2, P.gold);
  }
  for (let x = 154; x < 340; x += 5) {            // rumbai
    r(x, 173, 2, 3, '#d9c9a8');
    r(x, 252, 2, 3, '#d9c9a8');
  }

  // Lembaran yang jatuh dan belum dipungut. Digambar di lantai, jadi pegawai
  // yang lewat menutupinya — bukan mengambang di atas semua orang.
  for (const k of RUANGAN.kertasLantai) {
    ctx.globalAlpha = Math.min(1, k.sisa / 1.5);
    r(k.x, k.y, 4, 3, P.paper);
    r(k.x, k.y, 4, 1, '#d9d4c2');
    ctx.globalAlpha = 1;
  }

  // berkas cahaya jendela — warnanya ikut langit di luar
  const A = ambien();
  ctx.globalAlpha = A.sinarA;
  ctx.fillStyle = A.sinar;
  ctx.beginPath();
  ctx.moveTo(190, FLOOR_TOP); ctx.lineTo(240, FLOOR_TOP);
  ctx.lineTo(266, 196); ctx.lineTo(164, 196);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ props */
function drawArsip(active) {
  const x = 26, y = 30, w = 56, h = 88;
  r(x - 2, y - 2, w + 4, h + 4, P.woodD);
  r(x, y, w, h, '#a3805a');
  r(x + 2, y + 2, w - 4, h - 4, '#7a5c3e');
  const ORD = ['#3e6b4f', '#b03030', '#3565b0', '#c9a03a', '#3e6b4f', '#7a4a26'];
  for (let row = 0; row < 4; row++) {
    const by = y + 21 + row * 21;
    r(x + 2, by, w - 4, 3, '#a3805a');                     // papan rak
    if (row % 2 === 0) {
      // ordner berdiri berjajar
      let bx = x + 5;
      for (let i = 0; bx < x + w - 9 && i < 9; i++) {
        r(bx, by - 15, 5, 15, ORD[(i + row) % ORD.length]);
        r(bx + 1, by - 11, 3, 5, P.paper);                 // label punggung
        r(bx + 2, by - 4, 1, 1, '#2c3440');                // lubang ring
        bx += 6;
      }
    } else {
      // tumpukan map + bundel arsip bertali
      for (let s = 0; s < 3; s++) {
        const sx = x + 5 + s * 17;
        for (let l = 0; l < 6; l++) {
          r(sx + (l % 2), by - 3 - l * 2, 13, 2, l % 2 ? '#e4ddc8' : P.paper);
        }
        if (s === 1) {
          r(sx + 1, by - 14, 13, 2, '#c98a5c');            // map merah muda paling atas
          r(sx + 6, by - 15, 2, 14, '#5f4530');            // tali bundel
        }
      }
    }
  }
  // dus arsip di atas lemari
  r(x + 6, y - 14, 18, 12, '#b98d5e');
  r(x + 6, y - 14, 18, 2, '#d9cba8');
  r(x + 10, y - 10, 10, 4, P.paper);
  r(x + 30, y - 9, 14, 7, '#b98d5e');
  if (active) glow(x + w / 2, y + h - 24, 38, P.amber, 0.2);
}

function drawFiling(active) {
  const x = 108, y = 62, w = 48, h = 56;
  r(x - 1, y - 1, w + 2, h + 2, sh(P.metal, 0.7));
  r(x, y, w, h, P.metal);
  // Map laporan yang menumpuk di ATAS kabinet: bekas event yang menyusut
  // pelan-pelan, jadi masih terlihat lama setelah eventnya lewat.
  for (let m = 0; m < RUANGAN.tumpukanFiling; m++) {
    r(x + 8 + (m % 2), y - 4 - m * 3, 14, 3, m % 2 ? '#c9a03a' : '#d9b96a');
  }
  for (let i = 0; i < 3; i++) {
    const dy = y + 4 + i * 17;
    // laciKosong: tiga laci menganga sekaligus, semuanya kosong. Tiga laci
    // terbuka di satu kabinet adalah gambar keputusasaan yang bagus.
    const kosong = i < MOD.laciKosong;
    const open = kosong || ((active || RUANGAN.laciBuka > 0) && i === 0);
    r(x + 3, dy, w - 6, 14, sh(P.metal, 1.12));
    r(x + 3, dy, w - 6, 1, P.metalL);
    r(x + w / 2 - 6, dy + 6, 12, 3, sh(P.metal, 0.8));     // handle
    r(x + w / 2 - 4, dy + 2, 8, 3, P.paper);               // label laci
    if (open) {
      r(x + 1, dy + 12, w - 2, 8, sh(P.metal, 1.2));       // laci ketarik keluar
      r(x + 1, dy + 12, w - 2, 1, P.metalL);
      if (kosong) r(x + 3, dy + 13, w - 6, 6, '#1a1d21');  // rongga gelap, tanpa map
      else for (let f = 0; f < 5; f++) r(x + 5 + f * 8, dy + 13, 6, 2, ['#c9a03a', '#3e6b4f', '#b03030'][f % 3]);
    }
  }
  // bagan STRUKTUR ORGANISASI
  r(104, 20, 56, 38, '#6d5535');
  r(106, 22, 52, 34, P.paper);
  r(108, 24, 48, 4, '#3565b0');
  const bx = (cx, cy) => { r(cx, cy, 9, 5, '#cfe0f2'); r(cx, cy, 9, 1, '#8ba8c8'); };
  bx(127, 31);
  r(131, 36, 1, 3, '#8b98a6');
  r(114, 39, 35, 1, '#8b98a6');
  bx(110, 40); bx(127, 40); bx(144, 40);
  r(114, 45, 1, 3, '#8b98a6'); r(131, 45, 1, 3, '#8b98a6'); r(148, 45, 1, 3, '#8b98a6');
  bx(110, 48); bx(127, 48); bx(144, 48);
  if (active) glow(x + w / 2, y + 20, 40, P.teal, 0.18);
}

function drawWindow(active) {
  // koordinatnya dipakai bersama event yang menggambar di dalam kaca
  // (burung di kusen, layangan, bulan purnama) lewat klipJendela()
  const { x, y, w, h } = JENDELA;
  const A = ambien();
  r(x - 8, y - 8, w + 16, h + 12, P.creamD);               // ceruk gorden
  // langit mengikuti jam penonton: biru siang, jingga senja, gelap malam
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, A.atas);
  sky.addColorStop(1, A.bawah);
  ctx.fillStyle = sky; ctx.fillRect(x, y, w, h);
  // bintang deterministik, tiap butir kelipnya sendiri-sendiri
  if (A.bintang > 0.02) {
    for (let i = 0; i < 14; i++) {
      const sx = x + 2 + (i * 29) % (w - 4);
      const sy = y + 2 + (i * 13) % (h - 20);   // 13 koprima dgn 22: y-nya menyebar
      ctx.globalAlpha = A.bintang * (0.35 + 0.65 * Math.abs(Math.sin(now / (420 + i * 37) + i * 1.7)));
      r(sx, sy, 1, 1, '#e8eef8');
      ctx.globalAlpha = 1;
    }
  }
  if (A.bulan > 0.02) {
    // glow dulu: dia me-reset globalAlpha, jadi alpha bulan dipasang sesudahnya
    glow(x + 40, y + 11, 10, '#cfd8e8', 0.35 * A.bulan);
    ctx.globalAlpha = A.bulan;
    ctx.fillStyle = '#f2ecd0';
    ctx.beginPath(); ctx.arc(x + 40, y + 11, 4, 0, Math.PI * 2); ctx.fill();
    r(x + 38, y + 9, 2, 2, '#d9d2b4');                     // kawah
    r(x + 41, y + 12, 1, 1, '#d9d2b4');
    ctx.globalAlpha = 1;
  }
  // matahari merangkak dari kiri (pagi) ke kanan (sore), tinggi di siang;
  // "pudar" melunakkan setengah jam pertama dan terakhirnya supaya dia
  // memudar di ambang, bukan muncul/lenyap sekaligus
  if (A.luar > 0.05 && A.jam > 5.7 && A.jam < 18.3) {
    const tJ = (A.jam - 5.7) / 12.6;
    const pudar = Math.min(1, Math.min(A.jam - 5.7, 18.3 - A.jam) / 0.5);
    const mx = x + 5 + (w - 10) * tJ;
    const my = y + h - 13 - Math.sin(tJ * Math.PI) * (h - 20);
    const rendah = Math.sin(tJ * Math.PI) < 0.35;          // dekat horizon: jingga
    glow(mx, my, 9, rendah ? '#ff9c4a' : '#fff2b8', 0.5 * A.luar * pudar);
    ctx.globalAlpha = A.luar * pudar;
    r(mx - 1, my - 1, 3, 3, rendah ? '#ffb35a' : '#fff6c8');
    r(mx, my - 2, 1, 1, rendah ? '#ffcf8a' : '#ffffff');
    ctx.globalAlpha = 1;
  }
  if (A.luar > 0.05) {
    // diklip ke kaca: hitungan modulonya bisa negatif ATAU melewati lebar
    // kaca, dan dua-duanya dulu bikin awan tergambar di dinding kantor
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const cl = (now / 700) % (w + 30) - 15;
    ctx.globalAlpha = 0.85 * A.luar;
    r(x + ((cl + 8) % (w + 20)) - 4, y + 7, 12, 3, A.awan);
    r(x + ((cl + 34) % (w + 20)) - 4, y + 14, 9, 3, A.awan);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // siluet kota ikut gelap; malamnya jendela gedung menyala
  const kota = lerpHex('#222c3c', '#9db4c4', A.luar);
  const kotaJauh = lerpHex('#2c3850', '#8aa2b4', A.luar);
  r(x, y + h - 10, w, 10, kota);
  r(x + 4, y + h - 16, 7, 6, kotaJauh);
  r(x + 30, y + h - 15, 9, 5, kotaJauh);
  r(x + 42, y + h - 18, 6, 8, kotaJauh);
  const monas = lerpHex('#4a5468', '#f0ede2', Math.max(A.luar, 0.25));
  r(x + 18, y + h - 26, 3, 16, monas);                     // monas
  r(x + 17, y + h - 27, 5, 2, monas);
  r(x + 19, y + h - 29, 1, 3, P.gold);                     // lidah api emas
  if (A.luar < 0.5) glow(x + 19, y + h - 28, 5, '#ffd88a', 0.5 - A.luar);
  if (A.luar < 0.6) {
    ctx.globalAlpha = Math.min(1, (0.6 - A.luar) / 0.5);
    for (const [dx, dy] of [[5, 14], [9, 13], [31, 13], [35, 12], [43, 16], [45, 13],
                            [3, 7], [8, 5], [14, 8], [21, 6], [26, 8], [34, 5], [39, 7], [49, 6]]) {
      r(x + dx, y + h - dy, 1, 1, '#ffd27a');
    }
    ctx.globalAlpha = 1;
  }
  // hujan: goresan miring jatuh di balik kaca, jumlah dan panjangnya ikut deras
  if (CUACA.hujan > 0.01) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const n = Math.round(8 + CUACA.hujan * 26);
    const len = 3 + CUACA.hujan * 3;
    ctx.globalAlpha = 0.3 + 0.3 * CUACA.hujan;
    ctx.strokeStyle = A.luar > 0.35 ? '#c8d4e2' : '#8ea6c0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const laju = 85 + (i % 5) * 17;                      // px per detik
      const rx = (i * 37) % (w + 10) - 5;
      const ry = ((now / 1000) * laju + i * 23) % (h + 8) - 4;
      ctx.moveTo(x + rx, y + ry);
      ctx.lineTo(x + rx - 1, y + ry + len);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // kilat menerangi seluruh langit sekejap
  if (kilat > 0) {
    ctx.globalAlpha = 0.55 * kilat;
    r(x, y, w, h, '#e8f0ff');
    ctx.globalAlpha = 1;
  }
  // Kaca berkabut — digambar terakhir di dalam bingkai, jadi menutupi langit,
  // kota, dan Monas sekaligus, persis seperti kaca yang memang belum dilap.
  if (MOD.kacaBuram > 0.01) {
    ctx.globalAlpha = 0.16 * MOD.kacaBuram;
    r(x, y, w, h, '#c8ccd2');
    ctx.globalAlpha = 1;
  }
  // kusen aluminium
  r(x - 2, y - 2, w + 4, 2, '#9aa1a6'); r(x - 2, y + h, w + 4, 2, '#9aa1a6');
  r(x - 2, y, 2, h, '#9aa1a6'); r(x + w, y, 2, h, '#9aa1a6');
  r(x + w / 2 - 1, y, 2, h, '#9aa1a6');
  r(x, y + h / 2 - 1, w, 2, '#9aa1a6');
  // gorden hijau + emas khas aula dinas
  r(x - 8, y - 8, w + 16, 6, '#3e6b4f');
  for (let i = 0; i < 9; i++) r(x - 8 + i * 8, y - 3, 4, 3, '#3e6b4f');
  r(x - 8, y - 3, w + 16, 1, P.gold);
  for (const gx of [x - 8, x + w + 2]) {
    r(gx, y - 2, 6, h + 6, '#3e6b4f');
    r(gx + 1, y - 2, 1, h + 6, '#5f9068');
    r(gx + 4, y - 2, 1, h + 6, '#2c4e38');
    r(gx, y + 26, 6, 3, P.gold);                           // ikat gorden
  }
  // meja kecil + printer
  r(198, 96, 30, 4, P.wood);
  r(200, 100, 3, 16, P.woodD);
  r(223, 100, 3, 16, P.woodD);
  r(202, 84, 22, 12 - (MOD.printerMacet ? 3 : 0), '#ddd6c1');
  if (MOD.printerMacet) r(202, 78, 22, 3, '#ddd6c1');      // penutup terangkat
  r(204, 82, 16, 3, P.paper);
  r(204, 92, 18, 2, '#c4bda8');
  if (MOD.printerMacet) {                                  // kertas tersangkut miring
    const g = Math.sin(now / 55) > 0 ? 1 : 0;
    r(206 + g, 93, 10, 4, '#f4f2ea');
    r(206 + g, 93, 10, 1, '#d9d4c2');
  }
  r(219, 87, 2, 2, MOD.printerMacet
    ? (Math.sin(now / 140) > 0 ? '#e8453f' : '#5c2222')      // macet: kedip cepat
    : MOD.internetMati ? '#c22b2b'                            // putus: merah tetap
    : (Math.sin(now / 500) > 0 ? '#57d06a' : '#2c5c38'));
  if (active) glow(x + w / 2, y + h / 2, 44, P.blueL, 0.2);
}

function drawStempel(active) {
  const x = 254, y = 72, w = 64, h = 46;   // digeser kiri, memberi ruang deret komputer
  r(x + 2, y + 30, 6, 16, P.woodD);
  r(x + w - 8, y + 30, 6, 16, P.woodD);
  r(x + 8, y + 36, w - 16, 4, sh(P.woodD, 0.8));
  r(x - 2, y + 22, w + 4, 8, P.wood);
  r(x - 2, y + 22, w + 4, 2, sh(P.wood, 1.25));
  r(x - 2, y + 30, w + 4, 1, sh(P.woodD, 0.7));
  // tumpukan berkas menjulang
  for (let l = 0; l < 9; l++) {
    r(x + 2 + (l % 3), y + 20 - l * 2, 13, 2, l % 2 ? '#e4ddc8' : P.paper);
  }
  r(x + 3, y + 1, 13, 2, '#e8a0a8');                       // map disposisi pink
  // Surat masuk yang diantar caraka menumpuk di sini sampai ada yang memakai
  // meja stempel — itu satu-satunya cara tumpukan ini menyusut.
  for (let m = 0; m < RUANGAN.mapDisposisi; m++) {
    r(x + 2 + (m % 2), y - 1 - m * 3, 13, 3, m % 2 ? '#e8a0a8' : '#f0b8bf');
    r(x + 3 + (m % 2), y - 1 - m * 3, 5, 1, '#c88b93');
  }
  // goresan pulpen macet di sudut kertas — makin ke tiga makin pekat
  for (let c = 0; c < RUANGAN.coretKertas; c++) {
    r(x + 4, y + 4 + c * 2, 3, 1, ['#c9c2ae', '#9a927c', '#3a4658'][c]);
  }
  // cap basah yang sedang mengering, dan noda tinta yang tidak pernah hilang
  for (const b of RUANGAN.bekasStempel) {
    r(x + 7, y - 16 + b.dy, 5, 3, lerpHex('#e05050', '#c03030', 1 - b.sisa / 2.5));
    if (b.sisa > 1.7) {
      ctx.globalAlpha = 0.8;
      r(x + 8, y - 16 + b.dy, b.sisa > 2.1 ? 2 : 1, 1, '#ffffff');
      ctx.globalAlpha = 1;
      glow(x + 9, y - 15 + b.dy, 4, '#ff8a8a', 0.12);
    }
  }
  for (const n of RUANGAN.nodaMeja) r(x + n.x, y + n.y, 2, 2, '#8f2626');
  // bak stempel + stempel kayu
  r(x + 24, y + 18, 10, 4, P.ink);
  r(x + 25, y + 19, 8, 2, RUANGAN.bantalanKering ? '#d9908f' : '#c03030');
  r(x + 38, y + 12, 2, 5, '#8a5a3a');
  r(x + 36, y + 17, 6, 3, '#33261c');
  r(x + 46, y + 13, 2, 4, '#8a5a3a');
  r(x + 44, y + 17, 6, 3, '#33261c');
  // rak surat dua susun
  r(x + 52, y + 10, 14, 2, '#c9b178');
  r(x + 52, y + 16, 14, 2, '#c9b178');
  r(x + 52, y + 18, 1, 4, '#c9b178'); r(x + 65, y + 18, 1, 4, '#c9b178');
  r(x + 54, y + 13, 10, 2, P.paper);
  r(x + 54, y + 7, 10, 2, P.paper);
  if (active) glow(x + 32, y + 18, 34, P.amber, 0.24);
}

/* Rak PC server. Deret laptop yang dulu berdiri di sini sudah tidak perlu:
   tiap meja kerja punya laptopnya sendiri, jadi yang tersisa di dinding kanan
   satu mesin bersama — ke sinilah pegawai berdiri tiap ada urusan git.
   Letaknya sengaja di KANAN tetesan AC (jatuh di x=347, ditadah ember 341..355);
   rak dan air jangan pernah berbagi kolom. */
function drawServer(active) {
  const x = 364, y = 34, w = 52, h = 84;      // dasar rak 118, sebaris lemari arsip
  // Badai broadcast: semua LED berhenti berkedip sendiri-sendiri dan mulai
  // berdenyut SEREMPAK — itu yang bikin orang jaringan langsung tahu ada yang
  // salah, bukan sekadar lampunya lebih cepat.
  const kedip = (i) => MOD.switchBadai > 0
    ? Math.sin(now / 55) > -0.2
    : active && Math.sin(now / (90 + i * 31) + i * 1.7) > -0.25;
  const led = (lx, ly, i, warna) => r(lx, ly, 1, 1, kedip(i) ? warna : sh(warna, 0.3));

  ctx.globalAlpha = 0.16;                                  // bayangan di lantai
  r(x - 4, y + h - 2, w + 10, 4, '#20301f');
  ctx.globalAlpha = 1;

  r(x - 2, y - 3, w + 4, h + 5, '#22262c');                // rangka luar
  r(x - 2, y - 3, w + 4, 2, '#454b53');                    // tutup atas kena cahaya
  r(x, y, w, h, '#3a3f45');
  r(x, y, 1, h, '#565d66');
  r(x + w - 1, y, 1, h, '#262a30');

  // Papan nama rak. Fontnya 7px, bukan 5px seperti papan nama pintu kadis:
  // "PC SERVER" sembilan huruf, dan di 5px huruf-hurufnya lumer jadi noda.
  r(x + 3, y + 3, w - 6, 10, '#1c4e8a');
  r(x + 3, y + 3, w - 6, 1, '#4a7fc0');
  ctx.fillStyle = '#e8eef7';
  ctx.font = '7px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('PC SERVER', x + 5, y + 8);

  r(x + 2, y + 14, w - 4, h - 29, '#191c21');              // rongga dalam

  // Lima susun: patch panel, dua server, storage, switch. Yang membedakan rak
  // yang lagi dipakai dan yang diam cuma lampunya — mesinnya tidak ke mana-mana.
  for (let u = 0; u < 5; u++) {
    const uy = y + 15 + u * 11;
    r(x + 4, uy, w - 8, 10, '#2c3038');
    r(x + 4, uy, w - 8, 1, '#454b53');
    r(x + 4, uy + 9, w - 8, 1, '#15181c');
    if (u === 0) {                                         // patch panel, port RJ45
      for (let i = 0; i < 10; i++) {
        r(x + 6 + i * 4, uy + 3, 3, 4, '#20242c');
        led(x + 7 + i * 4, uy + 2, i, '#7ee787');
        // label yang akhirnya ditempel; menetap sampai halaman dimuat ulang
        if (i < RUANGAN.labelPatch) r(x + 6 + i * 4, uy + 7, 3, 2, '#e8e4d4');
      }
    } else if (u === 3) {                                  // storage, empat bay disk
      for (let i = 0; i < 4; i++) {
        r(x + 5 + i * 11, uy + 2, 10, 6, '#20242c');
        r(x + 6 + i * 11, uy + 3, 2, 4, '#3a3f45');
        led(x + 13 + i * 11, uy + 4, i + 2, '#7ee787');
      }
    } else if (u === 4) {                                  // switch, lampu port
      for (let i = 0; i < 12; i++) {
        r(x + 6 + i * 3.5, uy + 4, 2, 3, '#20242c');
        led(x + 6 + i * 3.5, uy + 2, i + 5, i % 3 ? '#7ee787' : P.amber);
      }
    } else {                                               // server, kisi angin
      for (let v = 0; v < 3; v++) r(x + 6, uy + 2 + v * 2, 24, 1, '#20242c');
      r(x + 32, uy + 3, 9, 4, '#565d66');                  // handle tarik
      r(x + 33, uy + 4, 7, 1, '#7c838a');
      led(x + 44, uy + 3, u, '#7ee787');
      led(x + 44, uy + 6, u + 8, P.blueL);
    }
  }

  // UPS di dasar rak; kantor yang pernah kena mati lampu pasti punya
  r(x + 3, y + h - 15, w - 6, 13, '#dfe2e6');
  r(x + 3, y + h - 15, w - 6, 1, '#f2f4f6');
  r(x + 6, y + h - 12, 15, 7, '#20242c');
  r(x + 7, y + h - 11, 13, 2, MOD.upsSiaga
    ? (Math.sin(now / 275) > 0 ? '#e05a52' : '#5c2222')   // baterai, bukan listrik
    : (active ? '#7ee787' : '#2c5c38'));
  r(x + 7, y + h - 8, 8, 1, '#4a5058');
  r(x + w - 16, y + h - 7, 11, 3, '#b9beb4');
  led(x + w - 9, y + h - 11, 3, P.red);

  // Kabel UTP menjuntai keluar rak. Belum pernah ada rak dinas yang rapi —
  // sampai ada yang benar-benar merapikannya, dan itu bertahan.
  const kabel = (kx, ky, panjang, amp, warna) => {
    const a2 = RUANGAN.kabelRapi ? 0 : amp;
    for (let i = 0; i < panjang; i++) {
      r(kx + Math.round(Math.sin(i / 3.2) * a2), ky + i, 1, 1, warna);
    }
  };
  kabel(x + w + 1, y + 16, RUANGAN.kabelRapi ? 14 : 24, 2, '#3d7a4c');
  kabel(x + w + 3, y + 19, RUANGAN.kabelRapi ? 12 : 20, 2, '#3565b0');
  kabel(x + w + 2, y + 22, RUANGAN.kabelRapi ? 10 : 16, 3, '#c9a03a');
  if (RUANGAN.kabelRapi) r(x + w + 1, y + 15, 5, 2, '#4a5058');   // klem pengikat

  // APAR merah menempel di dinding kiri rak — ruang server tanpa ini tidak
  // pernah lolos audit, sekalian mengisi bekas tempat meja komputer.
  const ay = -RUANGAN.aparAngkat;                          // diangkat saat diperiksa
  if (ay) { ctx.globalAlpha = 0.2; r(329, 118, 12, 2, '#20301f'); ctx.globalAlpha = 1; }
  r(330, 100 + ay, 10, 18, '#b02a2a');
  r(330, 100 + ay, 10, 2, '#d24545');
  r(330, 106 + ay, 10, 4, '#f0ede2');
  r(332, 107 + ay, 6, 1, '#8b1f1f');
  r(333, 96 + ay, 4, 4, '#7c838a');
  r(332, 94 + ay, 6, 2, '#9aa1a6');
  r(338, 95 + ay, 4, 1, '#3a3f45');
  if (!ay) r(329, 118, 12, 2, '#2c3038');
  if (RUANGAN.kartuAPAR) {                                 // kartu inspeksi, permanen
    r(341, 97 + ay, 1, 4, '#8b98a6');
    r(339, 101 + ay, 6, 8, '#e8cf6a');
    r(340, 103 + ay, 4, 1, '#8a6a1a');
    r(340, 105 + ay, 4, 1, '#8a6a1a');
    r(337, 104 + ay, 2, 2, '#3e6b4f');                     // manometer hijau
  }

  if (active) glow(x + w / 2, y + h / 2, 52, '#7ee787', 0.13);
}

function drawKadis(active) {
  active = active || MOD.pintuKadis;      // event bisa membuka pintunya sendiri
  const x = 440, y = 28, w = 34, h = 82;
  // papan nama biru
  r(x + 2, y - 20, 30, 14, '#1c4e8a');
  r(x + 2, y - 20, 30, 1, '#4a7fc0');
  ctx.fillStyle = '#f4f6fa';
  ctx.font = '5px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('KEPALA', x + 7, y - 15);
  ctx.fillText('DINAS', x + 9, y - 9);
  // kusen + daun pintu
  r(x, y, w, h, '#4a3626');
  r(x + 3, y + 4, w - 6, h - 4, '#7a5638');
  if (active) {
    r(x + 3, y + 4, 12, h - 4, '#241a10');                 // pintu terbuka: gelap di dalam
    ctx.globalAlpha = 0.25;
    r(x + 15, y + 4, 4, h - 4, '#ffd88a');                 // cahaya dari dalam
    ctx.globalAlpha = 1;
    r(x + 15, y + 4, 10, h - 4, '#6b4a30');                // daun pintu menyamping
    r(x + 16, y + 40, 2, 3, P.gold);
  } else {
    r(x + 7, y + 12, 20, 26, '#6b4a30');
    r(x + 7, y + 44, 20, 30, '#6b4a30');
    r(x + 8, y + 13, 18, 1, '#4a3626');
    r(x + 8, y + 45, 18, 1, '#4a3626');
    r(x + 24, y + 46, 3, 3, P.gold);                       // gagang
  }
  r(x + 3, y + h - 6, w - 6, 4, '#9aa1a6');                // plat tendang
  if (active) glow(x + w / 2, y + 50, 36, '#ffd88a', 0.2);
}

function drawEmber() {
  r(341, 122, 14, 2, '#4a7fd0');
  if (RUANGAN.emberDiangkat) {
    // diangkat mengikuti pegawai yang membawanya: alasnya kosong sebentar
    r(342, 130, 12, 2, sh(P.blue, 0.55));
    return;
  }
  // permukaan naik dari isi 0..90, dan makin keruh mendekati penuh
  const tinggi = Math.round((RUANGAN.emberIsi / 90) * 7);
  const keruh = lerpHex(P.blue, '#4a7a90', RUANGAN.emberIsi / 90);
  r(342, 124, 12, 8, sh(P.blue, 0.85));
  r(342, 131 - tinggi, 12, tinggi + 1, keruh);
  if (tinggi > 1) r(345, 131 - tinggi, 4, 1, '#9fd0ee');
  if (RUANGAN.emberIsi >= 90) {                             // genangan di lantai
    ctx.globalAlpha = 0.5;
    r(340, 133, 16, 2, '#3a5a70');
    ctx.globalAlpha = 1;
  }
}

/* Kabel gulung yang melintang di lantai — bekas kantor yang belum sempat
   dirapikan, bukan bekas event. Ada sejak halaman dibuka; RUANGAN.lakban cuma
   menentukan sudah berapa banyak yang ditempeli lakban. Persis memotong
   LANE_DOWN (y=252) di x322..352, jadi kesandungnya beralasan. */
function drawKabelLantai() {
  ctx.strokeStyle = '#3a3f45'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(322, 250);
  ctx.quadraticCurveTo(337, 258, 352, 254);
  ctx.stroke();
  const n = RUANGAN.lakban;
  for (let i = 0; i < n; i++) {
    const t = i / 7, x = 322 + t * 30, y = 250 + Math.sin(t * Math.PI) * 6;
    r(x - 3, y - 1, 6, 3, i % 2 ? '#e8c33a' : '#20242c');
  }
}

function drawTunggu(active) {
  // (bx, by) = titik acuan sudut tunggu; seluruh perabotnya relatif ke situ,
  // jadi kalau mau digeser lagi cukup ubah dua angka. Deret kursinya sengaja
  // tidak ada: di baris depan dia bertabrakan dengan meja kerja, jadi yang
  // menganggur berdiri saja di dekat dispenser.
  const bx = 244, by = 284;
  // dispenser + galon biru
  r(bx + 82, by - 18, 18, 34, '#eef0ea');
  r(bx + 82, by - 18, 18, 1, '#ffffff');
  r(bx + 98, by - 18, 2, 34, '#c9cdd1');
  r(bx + 85, by - 6, 3, 3, '#c03030');
  r(bx + 91, by - 6, 3, 3, P.blue);
  r(bx + 84, by - 1, 11, 2, '#c9cdd1');
  r(bx + 82, by + 4, 18, 1, '#c9cdd1');
  r(bx + 89, by + 8, 4, 1, '#c9cdd1');
  r(bx + 84, by - 30, 14, 12, '#7db8e8');
  r(bx + 86, by - 28, 2, 7, '#b8dcf4');
  r(bx + 89, by - 34, 4, 4, '#5f9fd4');
  // menara gelas kertas di samping dispenser; makin tipis makin sering diambil
  for (let g = 0; g < Math.min(6, RUANGAN.gelasDispenser); g++) {
    r(bx + 78, by - 4 - g * 2, 4, 3, g % 2 ? '#f2f0e6' : '#e4e0d2');
  }
  // tong sampah hijau
  r(bx + 106, by + 6, 9, 10, '#2c5c38');
  r(bx + 105, by + 4, 11, 2, '#3e6b4f');
  if (RUANGAN.tongPenuh > 0.05) {                          // isinya menyembul
    const n = Math.ceil(RUANGAN.tongPenuh * 5);
    for (let i = 0; i < n; i++) {
      r(bx + 105 + (i * 3) % 9, by + 1 - (i % 2) * 2, 3, 3,
        ['#f2f0e6', '#d9b96a', '#c9cdd1'][i % 3]);
    }
  }
  if (active) glow(bx + 91, by - 12, 20, '#ffffff', 0.08);
}

function drawMejaKerja() {
  // tiap meja menyala sendiri-sendiri: laptop hanya hidup di meja yang ditempati
  const terpakai = new Set();
  for (const a of penghuni()) {
    if (a.station === 'think' && !a.path.length) terpakai.add(a.slotIdx);
  }
  MEJA_KERJA_X.forEach((cx0, i) => {
    // meja yang kakinya belum diganjal bergoyang 1 px, tapi HANYA selagi
    // penghuninya mengetik — meja tidak goyang sendiri
    const goyang = MOD.mejaGetar === i && terpakai.has(i) && Math.sin(now / 70) > 0 ? 1 : 0;
    const cx = cx0;
    const x = cx - 32, y = 306 + goyang, w = 64;
    const nyala = terpakai.has(i) && MOD.mejaPadam !== i;

    r(x, y + 8, w, 6, P.wood);                            // papan meja
    r(x, y + 8, w, 2, sh(P.wood, 1.25));
    r(x + 2, y + 14, 5, 28, P.woodD);                     // kaki
    r(x + w - 7, y + 14, 5, 28, P.woodD);
    r(x + 8, y + 34, w - 16, 4, '#3f2f21');               // palang bawah

    // Laptop ditaruh di sisi kanan meja, bukan di tengah: kalau di tengah, dia
    // menutupi dada pegawai yang duduk dan orangnya jadi tidak terbaca.
    const lx = cx + 21, ly = y - 6;
    r(lx - 8, ly, 16, 14, '#9aa1a6');                     // punggung tutup layar
    r(lx - 8, ly, 16, 1, '#c2c8cd');
    // MOD.layarPucat menidurkan layar, MOD.layar melambatkan barisnya,
    // MOD.layarPutih memutihkannya sekejap (kedip serempak / restart)
    const napas = MOD.layarPucat ? 0.45 + 0.25 * Math.sin(now / 900 + i) : 1;
    r(lx - 7, ly + 1, 14, 11, nyala ? lerpHex('#173a96', '#121a2c', MOD.layarPucat) : '#20242c');
    if (nyala && MOD.layarPucat < 0.95) {
      ctx.globalAlpha = napas;
      for (let k = 0; k < 3; k++) {
        const lw = 2 + ((k * 5 + ((now * MOD.layar / 150) | 0) + i * 3) % 10);
        r(lx - 6, ly + 2 + k * 3, lw, 1, k === 0 ? '#ffffff' : '#bcd0ff');
      }
      ctx.globalAlpha = 0.13 * napas; ctx.fillStyle = '#9fc3ff';
      ctx.fillRect(lx - 12, ly + 12, 24, 4);              // pantulan di meja
      ctx.globalAlpha = 1;
    }
    if (nyala && MOD.layarPutih > 0.01) {
      ctx.globalAlpha = MOD.layarPutih;
      r(lx - 7, ly + 1, 14, 11, '#ffffff');
      ctx.globalAlpha = 1;
    }
    r(lx - 9, y + 7, 18, 2, '#b6bcc1');                   // badan keyboard
    r(lx - 10, y + 9, 20, 2, '#9aa1a6');

    // sisi kiri meja: berkas, dibedakan biar tidak terlihat salin-tempel
    if (i % 2 === 0) {
      r(x + 6, y + 3, 15, 5, '#1d1712');                  // papan nama
      r(x + 7, y + 4, 13, 1, P.gold);
      for (let l = 0; l < 3; l++) {
        r(x + 8 + (l % 2), y + 1 - l * 2, 12, 2,
          ['#c9a03a', '#3e6b4f', '#b03030'][l]);
      }
    } else {
      for (let l = 0; l < 5; l++) {                       // tumpukan berkas
        r(x + 6 + (l % 2), y + 7 - l * 2, 14, 2, l % 2 ? '#e4ddc8' : P.paper);
      }
      r(x + 24, y + 4, 5, 5, '#dfe7ef');                  // gelas
    }
  });
}

// Meja rapat persegi panjang dengan perspektif ringan (tepi belakang lebih
// sempit). Bentuk oval + kain hijau di tengah tadinya kebaca meja judi.
const RAPAT = { cx: 246, xBL: 180, xBR: 312, xFL: 170, xFR: 322, yB: 186, yF: 226 };
const KURSI_N = 7;

// Dua kursi sisi dekat baru dipakai setelah tujuh kursi sisi jauh penuh.
// Punggungnya menghadap kamera, jadi titik berdirinya tidak ikut pola slot:
// y-nya dipilih supaya yang menyembul di atas sandaran cuma kepala dan bahu,
// persis seperti orang yang duduk membelakangi kita.
const KURSI_DEKAT = [{ x: 214, y: 242 }, { x: 278, y: 242 }];
// Urutan gambarnya harus jatuh di antara meja rapat (sortY 249) dan sandaran
// kursi sisi dekat (sortY 260): sesudah meja supaya kepalanya menyembul di atas
// bibir meja, sebelum sandaran supaya badannya tenggelam di balik kursi.
const SORT_KURSI_DEKAT = 255;
const KURSI_TOTAL = KURSI_N + KURSI_DEKAT.length;

// Urutan slot berjajar: 0, +step, -step, +2step, -2step, ...
const slotKe = (k, step) => {
  const s = step || 19;
  return k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * s;
};

// Trapesium digambar baris demi baris supaya tepinya tetap tajam.
function trapRows(fn) {
  const R = RAPAT;
  for (let y = R.yB; y <= R.yF; y++) {
    const t = (y - R.yB) / (R.yF - R.yB);
    const l = Math.round(R.xBL + (R.xFL - R.xBL) * t);
    const rr = Math.round(R.xBR + (R.xFR - R.xBR) * t);
    fn(l, y, rr - l, t);
  }
}

function drawRapat(active) {
  const R = RAPAT;

  ctx.globalAlpha = 0.13;                                  // bayangan di lantai
  r(R.xFL + 4, R.yF + 18, R.xFR - R.xFL - 8, 4, '#20301f');
  ctx.globalAlpha = 1;

  // taplak putih menutupi seluruh permukaan
  trapRows((l, y, w, t) => {
    r(l, y, w, 1, t < 0.10 ? '#f6f3e9' : t > 0.88 ? '#d9d4c3' : '#e9e5d6');
  });
  ctx.globalAlpha = 0.35;                                  // lipatan kain memanjang
  for (const k of [0.28, 0.55, 0.78]) {
    trapRows((l, y, w, t) => { if (Math.abs(t - k) < 0.02) r(l + 3, y, w - 6, 1, '#c9c3b0'); });
  }
  ctx.globalAlpha = 1;

  // pita emas lalu rimpel hijau yang menjuntai ke depan
  r(R.xFL, R.yF, R.xFR - R.xFL, 2, P.gold);
  const H = 14;
  r(R.xFL, R.yF + 2, R.xFR - R.xFL, H, '#2c5c38');
  r(R.xFL, R.yF + 2, R.xFR - R.xFL, 2, '#3d7a4c');
  for (let x = R.xFL; x < R.xFR - 3; x += 8) {
    r(x, R.yF + 4, 1, H - 2, '#204a29');                   // garis lipatan
    r(x + 2, R.yF + 2 + H, 5, 3, '#2c5c38');               // gelombang bawah
    r(x + 2, R.yF + 4 + H, 5, 1, '#204a29');
  }

  // papan nama meja di depan tiap kursi
  for (let k = 0; k < KURSI_N; k++) {
    const nx = R.cx + slotKe(k);
    r(nx - 7, R.yB + 6, 14, 5, '#fbf9f2');
    r(nx - 7, R.yB + 6, 14, 1, '#ffffff');
    r(nx - 7, R.yB + 11, 14, 1, '#b9b3a2');
    r(nx - 5, R.yB + 8, 10, 1, '#5a6068');
  }

  const mic = (mx, my) => {
    r(mx - 2, my + 2, 5, 2, '#3a3f45');
    r(mx, my - 4, 1, 6, '#5a6068');
    r(mx - 1, my - 7, 3, 3, '#2c3038');
    if (active && Math.sin(now / 240 + mx) > 0.3) r(mx, my - 8, 1, 1, P.red);
  };
  const gelas = (gx, gy) => {
    r(gx, gy - 5, 5, 5, '#eef2f6');
    r(gx, gy - 6, 5, 1, '#c8d2dc');
    r(gx + 1, gy - 4, 3, 3, '#c9a05a');
  };
  const botol = (bx, by) => {
    r(bx, by - 8, 3, 8, '#bcd8e8');
    r(bx, by - 10, 3, 2, '#3565b0');
    r(bx, by - 5, 3, 2, '#e8f0f6');
  };
  mic(208, 206); mic(246, 204); mic(284, 206);
  gelas(190, 214); gelas(226, 210); gelas(266, 210); gelas(302, 214);
  botol(198, 212); botol(292, 212);
  r(214, 216, 15, 5, '#c9a03a');                     // map rapat
  r(215, 217, 13, 1, P.paper);
  r(258, 218, 15, 5, '#3e6b4f');
  r(259, 219, 13, 1, P.paper);
  r(238, 221, 13, 4, P.paper);                       // notulen
  r(239, 222, 11, 1, '#9aa7b4');

  if (active) glow(R.cx, R.yB + 14, 66, '#ffe9b0', 0.1);
}

// sandaran kursi sisi jauh — digambar sebelum pegawai, jadi mereka tampak duduk
function drawKursiJauh() {
  for (let k = 0; k < KURSI_N; k++) {
    const kx = RAPAT.cx + slotKe(k);
    // tepi belakang meja lurus, jadi semua kursi sejajar
    const ky = 169;
    r(kx - 8, ky, 16, 17, '#2a4f8a');       // rangka
    r(kx - 7, ky + 1, 14, 13, '#3f74c4');   // jok
    r(kx - 7, ky + 1, 14, 2, '#5b8ad4');
    r(kx - 7, ky + 9, 14, 1, '#2f5a9c');    // garis jahitan sandaran
    r(kx - 2, ky + 17, 4, 6, '#9aa1a6');    // tiang, ujungnya ketutup meja
  }
}

// dua kursi sisi dekat, punggung menghadap kamera
function drawKursiDekat() {
  for (const kx of [214, 278]) {
    r(kx - 8, 250, 2, 9, '#9aa1a6');                  // kaki krom
    r(kx + 6, 250, 2, 9, '#9aa1a6');
    r(kx - 9, 257, 18, 2, '#7c838a');
    r(kx - 11, 243, 22, 7, '#2f5a9c');                // dudukan
    r(kx - 11, 243, 22, 1, '#5b8ad4');
    r(kx - 10, 229, 20, 13, '#3f74c4');               // sandaran dari belakang
    r(kx - 10, 229, 20, 2, '#5b8ad4');
    r(kx - 10, 240, 20, 2, '#2f5a9c');
  }
}

function drawBendera() {
  const x = 132;
  r(x - 5, 270, 12, 4, '#7c838a');                         // alas
  r(x - 3, 268, 8, 2, '#9aa1a6');
  r(x, 216, 2, 54, '#c9ced4');                             // tiang
  r(x - 1, 213, 4, 3, P.gold);                             // kepala tiang
  for (let i = 0; i < 16; i++) {                           // merah putih berkibar
    const dy = Math.round(Math.sin(now / 300 + i * 0.55) * 1.4);
    r(x + 2 + i, 218 + dy, 1, 6, P.red);
    r(x + 2 + i, 224 + dy, 1, 6, '#f4f2ec');
  }
}

function drawDus() {
  const x = 440, y = 208;
  r(x, y + 18, 32, 24, '#a37b4e');
  r(x + 2, y + 20, 28, 20, '#b98d5e');
  r(x + 2, y + 28, 28, 3, '#a37b4e');
  r(x + 14, y + 20, 4, 20, '#d9cba8');                     // lakban
  r(x + 5, y + 32, 12, 5, P.paper);                        // label ARSIP
  r(x + 7, y + 34, 8, 1, '#8b98a6');
  r(x + 5, y - 2, 24, 20, '#a37b4e');
  r(x + 7, y, 20, 16, '#b98d5e');
  r(x + 7, y + 6, 20, 3, '#a37b4e');
  r(x + 15, y, 4, 16, '#d9cba8');
  r(x + 10, y + 9, 10, 4, P.paper);
}

/* Sudut baling kipas diakumulasi, bukan dihitung dari `now` langsung: kalau
   dari now, mengubah kecepatan bikin sudutnya meloncat — kipas yang melambat
   malah terlihat tersentak balik. */
let putarKipas = 0;

// kipas angin berdiri, baling-balingnya ikut berputar
function drawKipas() {
  // oleng = seluruh kepala berayun cepat (gangguan); getar = motor macet;
  // sapu = kipas benar-benar MENOLEH, periode lambat 7 detik, amplitudo lebar
  const sapu = MOD.kipasSapu ? Math.sin(now / 1114) * MOD.kipasSapu : 0;
  const cx = 400 + sapu
    + Math.round(Math.sin(now / 64) * MOD.kipasGoyang)
    + (MOD.kipasGetar ? (Math.sin(now / 42) > 0 ? 1 : -1) * MOD.kipasGetar : 0);
  const base = 292;
  r(cx - 10, base, 20, 3, '#7c838a');
  r(cx - 6, base - 2, 12, 2, '#9aa1a6');
  r(cx - 1, base - 30, 2, 30, '#c9ced4');
  // grill menyusut di ujung sapuan: itu yang bikin perputaran kepalanya
  // terbaca sebagai menoleh, bukan cuma bergeser mendatar
  const rx = 11 - Math.abs(sapu) * 0.5;
  ctx.fillStyle = '#dde1e4';
  ctx.beginPath(); ctx.ellipse(cx, base - 38, rx, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#aeb4ba';
  ctx.beginPath(); ctx.ellipse(cx, base - 38, rx - 2, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#eef0f2'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    // MOD.kipas: 0 = berhenti (macet), <1 = melambat (tegangan turun)
    const a = putarKipas + i * 2.094;
    ctx.beginPath();
    ctx.moveTo(cx, base - 38);
    ctx.lineTo(cx + Math.cos(a) * 8, base - 38 + Math.sin(a) * 8);
    ctx.stroke();
  }
  r(cx - 1, base - 39, 2, 2, '#7c838a');
}

function leafP(x, y, dx, dy, col) {
  for (let i = 0; i < 7; i++) {
    const t = i / 7;
    const w = Math.max(1, Math.round(4 * (1 - t)));
    r(x + dx * t, y + dy * t, w, w, col);
  }
}
function drawPlant() {
  const x = 20, y = 258;
  r(x + 3, y + 22, 20, 14, '#7a4a30');
  r(x + 1, y + 19, 24, 4, '#8d5738');
  r(x + 1, y + 19, 24, 1, '#a56a46');
  // layu = hijaunya luntur ke cokelat dan daunnya menunduk beberapa piksel
  const L = RUANGAN.tanamanLayu;
  const hijau = (c) => (L > 0.01 ? lerpHex(c, '#8a7a3a', L) : c);
  const t = Math.round(L * 4);
  leafP(x + 12, y + 18, -11, -18 + t, hijau('#3f6b45'));
  leafP(x + 12, y + 18, 11, -16 + t, hijau('#4f8a56'));
  leafP(x + 12, y + 18, -3, -24 + t * 2, hijau('#4f8a56'));
  leafP(x + 12, y + 18, 6, -22 + t, hijau('#3f6b45'));
  leafP(x + 12, y + 18, -16, -9 + t, hijau('#356038'));
}

// X-banner berdiri "ZONA INTEGRITAS"
function drawXBanner() {
  const x = 16, y = 188;   // di bawah LANE_UP, supaya tidak menelan pejalan
  ctx.strokeStyle = '#7c838a'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 52); ctx.lineTo(x + 26, y);
  ctx.moveTo(x + 26, y + 52); ctx.lineTo(x, y);
  ctx.stroke();
  r(x + 1, y + 2, 24, 46, '#f0ede2');
  r(x + 1, y + 2, 24, 8, '#1c4e8a');
  r(x + 5, y + 14, 16, 12, P.gold);                        // logo bundar-ish
  r(x + 9, y + 17, 8, 6, '#f0ede2');
  for (let i = 0; i < 3; i++) r(x + 5, y + 30 + i * 5, 16 - i * 4, 2, '#8b98a6');
}

// props diurut belakang -> depan; sortY = garis kaki untuk depth sort
const PROPS = [
  { sortY: 118, station: 'read',   draw: drawArsip },
  { sortY: 118, station: 'search', draw: drawFiling },
  { sortY: 116, station: 'web',    draw: drawWindow },
  { sortY: 118, station: 'edit',   draw: drawStempel },
  { sortY: 118, station: 'server', draw: drawServer },
  { sortY: 115, station: 'agent',  draw: drawKadis },
  { sortY: 119, station: null,     draw: drawEmber },
  { sortY: 168, station: null,     draw: drawKursiJauh },
  { sortY: 242, station: null,     draw: drawXBanner },
  { sortY: 249, station: 'rapat',  draw: drawRapat },
  { sortY: 250, station: null,     draw: drawDus },
  { sortY: 260, station: null,     draw: drawKursiDekat },
  { sortY: 300, station: 'idle',   draw: drawTunggu },
  { sortY: 274, station: null,     draw: drawBendera },
  { sortY: 294, station: null,     draw: drawPlant },
  { sortY: 295, station: null,     draw: drawKipas },
  { sortY: 348, station: 'think',  draw: drawMejaKerja },
  { sortY: 112, station: null,     draw: drawKabelLantai },
];

/* --------------------------------------------------- persona / jabatan ---
   Peran yang dipakai di software house, tapi dinamai memakai jabatan yang
   benar-benar ada di instansi pemerintahan: struktural (kepala dinas sampai
   kepala seksi) dan fungsional (pranata komputer, sandiman, arsiparis,
   statistisi). "padanan" ikut disimpan supaya yang terbiasa dengan nama peran
   di timnya tetap bisa mencocokkan.

   Satu jabatan = satu seragam. Yang batik (punya "pattern") tidak memakai
   lidah bahu, jadi siluetnya beda dari yang PDH walau warnanya berdekatan. */
const JABATAN = [
  { id: 'kadis', nama: 'Kepala Dinas', singkat: 'Kadis',
    padanan: 'CTO / Kepala Teknologi',
    tugas: 'menentukan arah kerja, menandatangani disposisi, memutuskan yang tidak selesai di bawah',
    pal: { main: '#6b3f21', pants: '#33302a', skin: '#d9a273', hair: '#1b1410', head: 'peci', kumis: true, pattern: '#d9ab5e' } },
  { id: 'sekdis', nama: 'Sekretaris Dinas', singkat: 'Sekdis',
    padanan: 'Engineering Manager',
    tugas: 'mengatur orang, jadwal, dan anggaran supaya tiap bidang bisa jalan',
    pal: { main: '#c9b178', pants: '#6d6547', skin: '#e8b98b', hair: '#1d1712', head: 'peci' } },
  { id: 'kabid', nama: 'Kepala Bidang', singkat: 'Kabid',
    padanan: 'Manajer Proyek',
    tugas: 'memegang satu program dari perencanaan sampai laporan akhir',
    pal: { main: '#2f4470', pants: '#22293a', skin: '#c98f63', hair: '#14100d', head: 'peci', pattern: '#8fa8d8' } },
  { id: 'kasi', nama: 'Kepala Seksi', singkat: 'Kasi',
    padanan: 'Ketua Tim / Tech Lead',
    tugas: 'membagi pekerjaan harian ke stafnya dan ikut turun tangan sendiri',
    pal: { main: '#c9b178', pants: '#6d6547', skin: '#f0c79c', hair: '#332417', head: 'hair' } },
  { id: 'analis_sistem', nama: 'Analis Sistem Informasi', singkat: 'Analis Sistem',
    padanan: 'Arsitek Sistem',
    tugas: 'merancang bentuk sistem sebelum ada yang mulai mengetik',
    pal: { main: '#3f6285', pants: '#2a3646', skin: '#e0ae80', hair: '#241a12', head: 'hair' } },
  { id: 'pranata_madya', nama: 'Pranata Komputer Ahli Madya', singkat: 'Pranata Madya',
    padanan: 'Senior Engineer',
    tugas: 'menggarap bagian yang paling sulit dan membenahi warisan lama',
    pal: { main: '#b9a26a', pants: '#5f5940', skin: '#d9a273', hair: '#2b2119', head: 'hair', kumis: true } },
  { id: 'pranata_muda', nama: 'Pranata Komputer Ahli Muda', singkat: 'Pranata Muda',
    padanan: 'Backend Engineer',
    tugas: 'membangun layanan dan basis data yang dipakai aplikasi lain',
    pal: { main: '#3c6b4e', pants: '#2c3a30', skin: '#e8b98b', hair: '#1d1712', head: 'hair' } },
  { id: 'pranata_pertama', nama: 'Pranata Komputer Ahli Pertama', singkat: 'Pranata Pertama',
    padanan: 'Frontend Engineer',
    tugas: 'menggarap tampilan yang dipakai langsung oleh pemohon layanan',
    pal: { main: '#6f97a8', pants: '#33454c', skin: '#f0c79c', hair: '#241a12', head: 'hair' } },
  { id: 'sandiman', nama: 'Sandiman', singkat: 'Sandiman',
    padanan: 'Security Engineer',
    tugas: 'menjaga kerahasiaan data dan memeriksa celah keamanan',
    pal: { main: '#2b3138', pants: '#1d2128', skin: '#d9a273', hair: '#14100d', head: 'peci' } },
  { id: 'auditor', nama: 'Auditor Internal', singkat: 'Auditor',
    padanan: 'QA Engineer',
    tugas: 'menguji hasil kerja dan mencatat temuan sebelum dikirim keluar',
    pal: { main: '#4c5570', pants: '#2f3444', skin: '#eec39a', head: 'jilbab', jilbab: '#2b3145' } },
  { id: 'statistisi', nama: 'Statistisi', singkat: 'Statistisi',
    padanan: 'Data Analyst',
    tugas: 'mengolah angka jadi tabel dan grafik yang bisa dibaca pimpinan',
    pal: { main: '#5b4d86', pants: '#332c4d', skin: '#d9a273', hair: '#1d1712', head: 'hair' } },
  { id: 'arsiparis', nama: 'Arsiparis', singkat: 'Arsiparis',
    padanan: 'Technical Writer',
    tugas: 'menata dokumentasi supaya orang berikutnya tidak mulai dari nol',
    pal: { main: '#9c8a5e', pants: '#5d5540', skin: '#eec39a', head: 'jilbab', jilbab: '#6a5c3a' } },
  { id: 'humas', nama: 'Pranata Humas', singkat: 'Humas',
    padanan: 'Developer Relations',
    tugas: 'menyiapkan pengumuman dan menjawab pertanyaan dari luar',
    pal: { main: '#8c3a48', pants: '#3c2a2e', skin: '#eec39a', head: 'jilbab', jilbab: '#6e2f3c', pattern: '#e5a3ad' } },
  { id: 'analis_kebijakan', nama: 'Analis Kebijakan', singkat: 'Analis Kebijakan',
    padanan: 'Product Manager',
    tugas: 'menerjemahkan kebutuhan jadi rumusan kerja yang bisa dieksekusi',
    pal: { main: '#4f6b3c', pants: '#2e3a28', skin: '#e0ae80', hair: '#241a12', head: 'hair', pattern: '#a8c98a' } },
  { id: 'teknisi', nama: 'Teknisi Jaringan', singkat: 'Teknisi',
    padanan: 'DevOps / SRE',
    tugas: 'menjaga server, jaringan, dan penyaluran hasil kerja ke produksi',
    pal: { main: '#c07a2a', pants: '#4a3a26', skin: '#d9a273', hair: '#1d1712', head: 'hair' } },
  { id: 'magang', nama: 'Tenaga Magang', singkat: 'Magang',
    padanan: 'Intern',
    tugas: 'membantu pekerjaan ringan sambil belajar alur kantor',
    pal: { main: '#dfe4ea', pants: '#2e3440', skin: '#f0c79c', hair: '#241a12', head: 'hair' } },
];

const JABATAN_ID = new Map(JABATAN.map((j) => [j.id, j]));
const jabatanDari = (id) => JABATAN_ID.get(id) || JABATAN_ID.get('pranata_muda');

// Urutan jabatan bawaan untuk sesi yang datang tanpa persona. Dimulai dari
// yang mengerjakan, bukan yang memimpin: satu sesi sendirian lebih masuk akal
// digambarkan sebagai staf yang bekerja daripada kepala dinas yang menganggur.
const PERAN_BAWAAN = [
  'pranata_muda', 'kasi', 'analis_sistem', 'pranata_pertama', 'sandiman',
  'statistisi', 'pranata_madya', 'kabid', 'auditor', 'teknisi',
  'analis_kebijakan', 'humas', 'arsiparis', 'sekdis', 'magang', 'kadis',
];
const PERAN_STANDBY = ['magang', 'arsiparis', 'statistisi', 'teknisi'];
const PERAN_PESERTA = ['analis_kebijakan', 'auditor', 'analis_sistem', 'statistisi', 'humas'];
const peranBawaan = (i) => PERAN_BAWAAN[i % PERAN_BAWAAN.length];

/* -------------------------------------------------------------- model ----
   Pilihan model untuk sesi yang dilahirkan dari halaman ini. Id-nya dikirim
   apa adanya ke `claude --model`; yang kosong berarti flag itu tidak dikirim
   sama sekali, jadi setelan Claude Code sendiri yang berlaku. */
const MODEL = [
  { id: '', nama: 'model bawaan', catatan: 'ikut setelan Claude Code' },
  { id: 'claude-opus-5', nama: 'Opus 5', catatan: 'paling kuat' },
  { id: 'claude-sonnet-5', nama: 'Sonnet 5', catatan: 'seimbang' },
  { id: 'claude-haiku-4-5-20251001', nama: 'Haiku 4.5', catatan: 'paling cepat' },
  { id: 'claude-fable-5', nama: 'Fable 5', catatan: 'varian Claude 5' },
];
const MODEL_ID = new Map(MODEL.map((m) => [m.id, m]));
// Sesi terminal tidak lahir dari halaman ini, jadi id-nya bisa apa saja —
// yang tidak dikenal ditampilkan apa adanya, bukan diaku-aku "bawaan".
const namaModel = (id) => (MODEL_ID.get(id) || {}).nama || id || '';

/* ------------------------------------------------- pegawai voxel 3D ----- */

function drawHead(a, x, yFoot) {
  const p = a.pal;
  const back = a.face === 'up';
  if (p.head === 'jilbab') {
    box3(x - 5, yFoot, 10, 8, 5, p.jilbab);
    if (!back) {
      r(x - 2, yFoot - 6, 5, 4, p.skin);
      drawEyes(a, x, yFoot - 5, 0);
    }
    return;
  }
  box3(x - 4, yFoot, 8, 6, 4, back ? p.hair : p.skin);
  // peci yang melorot sedikit; dirapikan sendiri beberapa detik kemudian
  if (p.head === 'peci') box3(x - 3 + (a.peciMiring || 0), yFoot - 6, 6, 2, 3, '#17171c');
  else box3(x - 4, yFoot - 6, 8, 2, 4, p.hair);
  if (!back) {
    if (p.head !== 'peci') r(x - 4, yFoot - 5, 2, 2, p.hair);   // poni samping
    drawEyes(a, x, yFoot - 4, 0);
    if (p.kumis) r(x - 1, yFoot - 2, 3, 1, '#2b2118');
    if (a.mulut) r(x - 1, yFoot - 2, 2, 2, '#3a2a24');          // menguap
  }
}

function drawEyes(a, x, ey) {
  const blink = Math.sin(a.phase * 0.9 + a.slot) > 0.985;
  if (blink) { r(x - 2, ey + 1, 5, 1, P.ink); return; }
  let off = 0;
  if (a.face === 'left') off = -1;
  if (a.face === 'right') off = 1;
  r(x - 2 + off, ey, 1, 2, P.ink);
  r(x + 1 + off, ey, 1, 2, P.ink);
}

function drawPerson(a) {
  // Standby digambar pudar: dari ruangan pun harus kelihatan mana yang cuma
  // penambal dan mana yang sesi sungguhan. Alpha dasarnya disimpan karena
  // blok bayangan kaki di bawah memasang alpha-nya sendiri — reset ke 1 di
  // situ dulu bikin efek pudarnya tidak pernah sampai ke badan.
  // a.alpha dipakai event: yang masuk ruang kadis memudar di ambang pintu,
  // bukan hilang mendadak. Dikalikan, bukan menimpa, supaya standby yang jadi
  // pemeran event tetap terbaca sebagai standby.
  const alphaDasar = (a.standby ? 0.55 : 1) * (a.alpha == null ? 1 : a.alpha);
  if (alphaDasar <= 0.01) return;
  ctx.globalAlpha = alphaDasar;
  // a.miring: sempoyongan sesaat (tersandung kabel) — offset badan, kaki tetap
  // di titik asli supaya terbaca "hampir jatuh", bukan "berjalan miring"
  const x = Math.round(a.x) + (a.miring ? 4 : 0), y = Math.round(a.y);
  const xKaki = Math.round(a.x);
  const p = a.pal;
  const t = a.phase;
  const back = a.face === 'up';

  let bob = 0, liftL = 0, liftR = 0, armL = 0, armR = 0;
  if (a.state === 'walk') {
    const s = Math.sin(t * 10);
    bob = Math.abs(s) > 0.72 ? -1 : 0;
    liftL = Math.max(0, Math.round(s * 2));
    liftR = Math.max(0, Math.round(-s * 2));
    armL = -Math.round(s * 1.6);
    armR = Math.round(s * 1.6);
  } else if (a.state === 'work') {
    bob = Math.sin(t * 4) > 0.85 ? -1 : 0;
  } else {
    bob = Math.sin(t * 1.7) > 0.6 ? -1 : 0;
  }

  ctx.globalAlpha = 0.18 * alphaDasar;
  ctx.fillStyle = '#20301f';
  ctx.beginPath();
  ctx.ellipse(xKaki + 1, y + 1, 9, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alphaDasar;

  const yb = y + bob;

  // kaki + sepatu pantofel — atau sandal jepit, kalau sudah lewat jam setengah tiga
  const alas = a.sandal ? '#8a6844' : '#26221c';
  box3(xKaki - 5, y - liftL, 3, 5, 2, p.pants);
  box3(xKaki + 1, y - liftR, 3, 5, 2, p.pants);
  r(xKaki - 5, y - 1 - liftL, 3, 1, alas);
  r(xKaki + 1, y - 1 - liftR, 3, 1, alas);
  if (a.sandal) { r(xKaki - 4, y - 2 - liftL, 1, 1, '#d9b96a'); r(xKaki + 2, y - 2 - liftR, 1, 1, '#d9b96a'); }

  // badan seragam
  box3(x - 5, yb - 5, 10, 8, 4, p.main);
  r(x - 5, yb - 6, 10, 1, sh(p.pants, 0.8));               // ikat pinggang
  r(x - 1, yb - 6, 2, 1, P.gold);
  if (!back) {
    r(x - 4, yb - 11, 3, 1, sh(p.main, 0.72));             // saku dada
    r(x + 2, yb - 11, 3, 1, sh(p.main, 0.72));
    r(x, yb - 12, 1, 6, sh(p.main, 0.78));                 // kancing
    if (p.pattern) {
      for (let i = 0; i < 8; i++) {                        // motif batik
        r(x - 4 + ((i * 3) % 9), yb - 12 + ((i * 5) % 6), 1, 1, p.pattern);
      }
    }
  }
  if (!p.pattern) {                                        // lidah bahu PNS
    r(x - 4, yb - 14, 2, 1, sh(p.main, 0.6));
    r(x + 3, yb - 14, 2, 1, sh(p.main, 0.6));
  }

  // lengan (kolom gelap di pangkal biar tidak menyatu dengan sisi badan)
  // a.pose menang atas keduanya: itu jalur event, dan event tahu persis pose
  // apa yang sedang diperlukan — mengangkat, menunjuk, menguap, bertepuk.
  // Menunggu keputusan kamu menang atas semuanya: dua tangan mengangkat map.
  const pose = a.butuh ? { l: -6, r: -6 }
    : a.pose ? posEvent(a)
    : (a.state === 'work' ? workArms(a) : { l: armL, r: armR });
  box3(x - 8, yb - 6 + pose.l, 3, 7, 2, p.main);
  box3(x + 6, yb - 6 + pose.r, 3, 7, 2, p.main);
  r(x + 6, yb - 13 + pose.r, 1, 7, sh(p.main, 0.82));
  r(x - 8, yb - 8 + pose.l, 3, 2, p.skin);
  r(x + 6, yb - 8 + pose.r, 3, 2, p.skin);

  // Map disposisi digambar SEBELUM kepala supaya kepalanya menang: yang jadi
  // tanda justru wajah yang menghadap penonton, jadi tidak boleh tertutup map.
  if (a.butuh) {
    // Lebarnya berhenti di pangkal telapak, bukan menutupinya: kalau tangannya
    // ikut tertutup, mapnya terbaca menempel di dada, bukan diangkat.
    r(x - 5, yb - 16, 5, 1, '#e8a0a8');                     // lidah map
    r(x - 5, yb - 15, 11, 8, '#e8a0a8');                    // map disposisi
    r(x - 5, yb - 8, 11, 1, '#c07e86');                     // sisi bawah: tebalnya terbaca
    r(x - 3, yb - 13, 7, 1, P.paper);                       // lembar di dalamnya
    r(x - 3, yb - 11, 5, 1, P.paper);
    r(x + 2, yb - 11, 3, 3, '#c03030');                     // cap merah, belum diteken
  }

  // kepala peserta yang ketiduran turun beberapa piksel, lalu tersentak naik
  drawHead(a, x, yb - 13 + (a.ngantuk || 0));
  // perkakas mejanya disembunyikan selagi menunggu: tangannya sedang penuh
  if (a.state === 'work' && !a.butuh) drawTool(a, x, yb);
  if (a.bawa) drawBawaan(a, x, yb);
  ctx.globalAlpha = 1;
}

/* Pose yang dipakai event. Angkanya offset y lengan kiri/kanan, satuan yang
   sama dengan workArms — makin negatif makin terangkat. */
function posEvent(a) {
  const t = a.phase;
  switch (a.pose) {
    case 'angkat':   return { l: -1, r: -8 };                       // menempel, menyobek
    case 'duaangkat':return { l: -8, r: -8 };                       // menempel kertas lebar
    case 'nunjuk':   return { l: 0, r: -6 };
    case 'salam':    return { l: 0, r: Math.sin(t * 6) > 0 ? -5 : -3 };
    case 'tepuk':    return { l: Math.sin(t * 9) > 0 ? -4 : -2, r: Math.sin(t * 9) > 0 ? -4 : -2 };
    case 'nguap':    return { l: -5, r: -1 };
    case 'usap':     return { l: 0, r: -7 };                        // usap tengkuk
    case 'hp':       return { l: -3, r: -4 };
    case 'kipas':    return { l: 0, r: Math.sin(t * 11) > 0 ? -6 : -3 };
    case 'lap':      return { l: -2, r: Math.sin(t * 8) > 0 ? -6 : -2 };
    case 'jongkok':  return { l: -1, r: -1 };
    case 'ngantuk':  return { l: -1, r: -1 };
    case 'hidung':   return { l: -7, r: 0 };                             // menutup hidung
    case 'silang':   return { l: -6, r: -6 };                            // menyilang lengan
    case 'dudukLantai': return { l: -3, r: -3 };                         // laptop di pangkuan
    default:         return { l: 0, r: 0 };
  }
}

/* Barang bawaan sementara — dipisah dari drawTool karena drawTool terikat
   stasiun ('sedang bekerja di meja apa'), sedangkan ini terikat event. */
function drawBawaan(a, x, yb) {
  const kanan = a.face !== 'left';
  const bx = kanan ? x + 6 : x - 14;
  switch (a.bawa) {
    case 'map':       r(bx, yb - 13, 8, 6, '#d9b96a'); r(bx + 1, yb - 11, 6, 1, '#b3924a'); break;
    case 'map-pink':  r(bx, yb - 13, 8, 6, '#e8a0a8'); r(bx + 1, yb - 11, 6, 1, P.paper); break;
    case 'map-hijau': r(bx, yb - 13, 8, 6, '#4f8a56'); r(bx + 1, yb - 11, 6, 1, '#c8e0cb'); break;
    case 'map-merah': r(bx, yb - 13, 8, 6, '#b03030'); r(bx + 1, yb - 11, 6, 1, '#e8c0c0'); break;
    case 'map-biru':  r(bx, yb - 13, 8, 6, '#3565b0'); r(bx + 1, yb - 11, 6, 1, '#c8d8f0'); break;
    case 'gelas':     r(bx + 2, yb - 12, 4, 5, '#f2f0e6'); r(bx + 2, yb - 12, 4, 1, '#c9b07a'); break;
    case 'teko':      r(bx + 1, yb - 13, 6, 6, '#c9cdd1'); r(bx + 7, yb - 11, 2, 2, '#c9cdd1'); break;
    case 'botol':     r(bx + 2, yb - 14, 4, 7, '#8f2626'); r(bx + 3, yb - 15, 2, 1, '#4a5058'); break;
    case 'kardus':    r(bx, yb - 14, 9, 8, '#b98d5e'); r(bx, yb - 11, 9, 1, '#a37b4e'); break;
    case 'hp':        r(bx + 2, yb - 12, 3, 5, '#20242c'); r(bx + 2, yb - 11, 3, 3, '#7aa5e8'); break;
    case 'kertas':    r(bx + 1, yb - 13, 7, 8, P.paper); r(bx + 2, yb - 11, 5, 1, '#b9c0ca'); break;
    case 'sapu':      r(bx + 3, yb - 18, 1, 14, '#8a6844'); r(bx + 1, yb - 5, 5, 3, '#c9a03a'); break;
    case 'amplop':    r(bx + 1, yb - 12, 8, 5, '#f2f0e6'); r(bx + 1, yb - 12, 8, 1, '#c9b07a'); break;
    case 'laptop':    r(bx, yb - 13, 9, 7, '#9aa1a6'); r(bx + 1, yb - 12, 7, 5, '#20242c'); break;
    case 'toner':     r(bx, yb - 13, 7, 6, '#20242c'); r(bx + 1, yb - 12, 5, 1, '#3a3f45'); break;
    case 'jerigen':   r(bx, yb - 13, 6, 8, '#d8b23a'); r(bx + 1, yb - 14, 4, 1, '#8a6a1a'); break;
  }
}

function workArms(a) {
  const t = a.phase;
  switch (a.station) {
    case 'server': return { l: Math.sin(t * 16) > 0 ? -2 : -3, r: Math.sin(t * 16 + 2) > 0 ? -2 : -3 };
    case 'edit':   return { l: 0, r: Math.sin(t * 7) > 0 ? -6 : -1 };
    case 'read':   return { l: -3, r: -3 };
    case 'search': return { l: 0, r: -4 };
    case 'agent':  return { l: -1, r: Math.sin(t * 9) > 0 ? -7 : -4 };
    case 'web':    return { l: 0, r: -5 };
    // di meja sendiri: tangan kanan mengetik di laptop yang ada di ujung meja
    case 'think':  return { l: 0, r: Math.sin(t * 13) > 0 ? -4 : -5 };
    // di meja rapat: yang genap mencatat notulen, yang ganjil bicara sambil menunjuk
    case 'rapat':  return a.slot % 2
      ? { l: -1, r: Math.sin(t * 5) > 0 ? -5 : -1 }
      : { l: -2, r: -3 };
    default:       return { l: 0, r: 0 };
  }
}

function drawTool(a, x, yb) {
  const t = a.phase;
  switch (a.station) {
    case 'read':                                            // map arsip manila
      r(x - 6, yb - 17, 12, 8, '#d9b96a');
      r(x - 6, yb - 18, 5, 1, '#d9b96a');
      r(x - 4, yb - 15, 8, 1, '#b3924a');
      r(x - 4, yb - 13, 6, 1, '#b3924a');
      r(x + 3, yb - 12, 2, 2, '#c03030');
      break;
    case 'search':
      ctx.strokeStyle = '#e8e8e0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x + 10, yb - 18, 3.2, 0, Math.PI * 2); ctx.stroke();
      r(x + 8, yb - 15, 1, 4, '#8b98a6');
      break;
    case 'edit': {                                          // stempel naik-turun
      const up = Math.sin(t * 7) > 0;
      const sy = yb - (up ? 23 : 15);
      r(x + 9, sy, 2, 4, '#8a5a3a');
      r(x + 7, sy + 4, 6, 3, '#33261c');
      break;
    }
    case 'agent':                                           // map disposisi di tangan kiri
      r(x - 11, yb - 13, 8, 6, '#e8a0a8');
      r(x - 10, yb - 11, 6, 1, P.paper);
      break;
    case 'rapat':
      if (a.face === 'up') break;                           // dari punggung: tak kelihatan
      if (a.slot % 2 === 0) {                               // buku notulen + pulpen
        r(x + 4, yb - 12, 8, 6, P.paper);
        r(x + 5, yb - 10, 6, 1, '#9aa7b4');
        r(x + 5, yb - 8, 4, 1, '#9aa7b4');
        r(x + 11, yb - 14, 1, 3, '#3565b0');
      }
      break;
  }
}

/* Lapisan suasana, digambar paling akhir: selubung warna sesuai jam, lalu
   lampu neon hangat yang menembusnya. Malam bukan sekadar kanvas digelapkan —
   tabung neonnya digambar ulang DI ATAS selubung supaya terbaca sebagai
   sumber cahaya yang menyala, bukan perabot yang ikut redup. */
function drawAmbien() {
  const A = ambien();
  if (A.ambA > 0.005) {
    ctx.globalAlpha = A.ambA;
    ctx.fillStyle = A.amb;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (kilat > 0) {                                         // pantulan kilat di ruangan
    ctx.globalAlpha = 0.09 * kilat;
    ctx.fillStyle = '#dfe8ff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (A.lampu < 0.02) return;
  NEON_X.forEach((cx, i) => {
    const a = A.lampu * kedipNeon(i);
    ctx.globalAlpha = 0.07 * a;                            // kerucut cahaya ke lantai
    ctx.fillStyle = '#ffcf8a';
    ctx.beginPath();
    ctx.moveTo(cx - 17, 13); ctx.lineTo(cx + 17, 13);
    ctx.lineTo(cx + 40, 232); ctx.lineTo(cx - 40, 232);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = Math.min(1, a);
    r(cx - 18, 10, 36, 3, '#ffdfa6');                      // tabungnya jadi hangat
    ctx.globalAlpha = 1;
    glow(cx, 14, 34, '#ffcf8a', 0.3 * a);                  // pendar di plafon
    glow(cx, 190, 160, '#ffbe72', 0.15 * a);               // genangan di lantai
  });
  glow(W / 2, 210, 200, '#ff9e50', 0.06 * A.lampu * MOD.lampu);   // dua genangan disatukan
}

/* ---------------------------------------------------------------- partikel */
const parts = [];
/* `warna` opsional: belasan event minta partikel yang sudah ada dengan warna
   lain (ping merah untuk UPS, talk kuning untuk tawa, ink pucat untuk bantalan
   yang kering). Menimpanya di sini sekali jauh lebih murah daripada menambah
   satu jenis partikel tiap kali warnanya beda. */
function spawn(kind, x, y, warna) {
  const rnd = (n) => (Math.random() - 0.5) * n;
  const sebelum = parts.length;
  switch (kind) {
    case 'ink':   parts.push({ x, y, vx: rnd(70), vy: -14 - Math.random() * 26, g: 150, life: 0.5, c: '#c93030', s: 1 }); break;
    case 'glyph': parts.push({ x: x + rnd(24), y, vx: 0, vy: -18, g: 0, life: 1.1, c: Math.random() > 0.5 ? '#dfe8ff' : '#9fc3ff', s: 1 }); break;
    case 'data':  parts.push({ x: x + rnd(22), y, vx: 0, vy: -22, g: 0, life: 0.9, c: Math.random() > 0.5 ? P.green : P.teal, s: 1 }); break;
    case 'dust':  parts.push({ x: x + rnd(30), y, vx: rnd(6), vy: -7, g: 0, life: 1.8, c: '#cbb897', s: 1 }); break;
    case 'scan':  parts.push({ x: x + rnd(26), y, vx: rnd(10), vy: -14, g: 0, life: 0.9, c: P.teal, s: 1 }); break;
    case 'ping':  parts.push({ x: x + rnd(30), y, vx: rnd(4), vy: -22, g: 0, life: 1.0, c: P.blueL, s: 1 }); break;
    case 'paper': parts.push({ x: x + rnd(20), y, vx: rnd(24), vy: -12, g: 14, life: 1.3, c: '#f4f2ea', s: 2 }); break;
    case 'idea':  parts.push({ x: x + rnd(10), y, vx: rnd(8), vy: -12, g: 0, life: 1.1, c: P.amber, s: 1 }); break;
    case 'talk':  parts.push({ x: x + rnd(16), y, vx: rnd(9), vy: -11, g: 0, life: 1.2, c: '#eef2f6', s: 1 }); break;
    case 'steam': parts.push({ x: x + rnd(3), y, vx: rnd(5), vy: -9, g: 0, life: 1.6, c: '#ffffff', s: 1 }); break;
    case 'step':  parts.push({ x, y, vx: rnd(8), vy: -3, g: 0, life: 0.4, c: '#aab0a6', s: 1 }); break;
    case 'drip':  parts.push({ x, y, vx: 0, vy: 8, g: 240, life: 2, c: '#8fd0ee', s: 1, k: 'drip' }); break;
    case 'splash':parts.push({ x: x + rnd(6), y, vx: rnd(20), vy: -16, g: 140, life: 0.35, c: '#9fd0ee', s: 1 }); break;
    // lembaran kertas jatuh: besar, lambat, dan menetap sebentar di lantai
    case 'lembar': parts.push({ x, y, vx: rnd(30), vy: -6, g: 26, life: 3.4, c: P.paper, s: 3 }); break;
    case 'confetti': parts.push({ x: x + rnd(60), y, vx: rnd(26), vy: rnd(10), g: 60, life: 2.2, s: 1,
      c: ['#c22b2b', '#d1a326', '#7ee787', '#79c0ff', '#d2a8ff'][(Math.random() * 5) | 0] }); break;
    // kantuk: kotak yang naik miring sambil melebar — bukan asap, tapi 'zzz'
    case 'kantuk': parts.push({ x, y, vx: 9, vy: -8, g: 0, life: 2.4, c: '#dfe4ec', s: 2 }); break;
    case 'serbuk': parts.push({ x: x + rnd(6), y, vx: rnd(4), vy: 6, g: 90, life: 0.8, c: '#2c3038', s: 1 }); break;
    // kertas printer yang dibuang setelah dibersihkan/dirobek: melengkung ke tong
    case 'lempar': parts.push({ x, y, vx: rnd(10) + 26, vy: -18, g: 90, life: 1.1, c: P.paper, s: 2 }); break;
  }
  if (warna) for (let i = sebelum; i < parts.length; i++) parts[i].c = warna;
  return parts[parts.length - 1];
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.k === 'drip' && p.y >= 124) {                    // tetes AC kena ember
      parts.splice(i, 1);
      const penuh = RUANGAN.emberIsi >= 90;
      for (let s = 0; s < (penuh ? 6 : 3); s++) spawn('splash', 347, 124);
      if (!RUANGAN.emberDiangkat) RUANGAN.emberIsi = Math.min(90, RUANGAN.emberIsi + 1);
      continue;
    }
    if (p.life <= 0) parts.splice(i, 1);
  }
}
function drawParts() {
  for (const p of parts) {
    // p.a: plafon opsional dari event (kertas pudar karena toner tipis).
    // Dikalikan, bukan ditimpa, supaya peluruhan life tetap terlihat di akhir hidupnya.
    ctx.globalAlpha = Math.min(1, p.life * 1.6) * (p.a == null ? 1 : p.a);
    r(p.x, p.y, p.s, p.s, p.c);
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ agents */
const agents = new Map();
// Undangan rapat: bukan sesi Claude Code, tapi ikut berebut kursi yang sama.
const peserta = [];
const standby = [];
function* penghuni() { yield* agents.values(); yield* peserta; yield* standby; }


let spawnIndex = 0;

/* Rute memutari meja rapat. Kalau tujuan ada di lajur seberang, lewat
   penghubung kiri atau kanan — mana yang totalnya lebih pendek. */
function route(ax, ay, aLane, bx, by, bLane) {
  const pts = [];
  // Sudah berdiri di lajur penghubung? Dari situ tinggal naik/turun. Memaksa
  // balik dulu ke lajur mendatar bikin pegawai mundur sampai 88px sia-sia.
  const diPenghubung = Math.abs(ax - LANE_L) < 3 || Math.abs(ax - LANE_R) < 3;
  let cx = ax;
  if (aLane !== bLane) {
    const side = diPenghubung ? ax
      : (Math.abs(ax - LANE_L) + Math.abs(bx - LANE_L)
      <= Math.abs(ax - LANE_R) + Math.abs(bx - LANE_R) ? LANE_L : LANE_R);
    if (!diPenghubung) {
      if (Math.abs(ay - aLane) > 4) pts.push({ x: ax, y: aLane });
      pts.push({ x: side, y: aLane });
    }
    pts.push({ x: side, y: bLane });
    cx = side;
  } else if (Math.abs(ay - aLane) > 4) {
    pts.push({ x: ax, y: aLane });
  }
  if (Math.abs(bx - cx) > 4) pts.push({ x: bx, y: bLane });
  if (Math.abs(by - bLane) > 4) pts.push({ x: bx, y: by });
  if (!pts.length) pts.push({ x: bx, y: by });   // sudah di tempat: tetap perlu satu titik
  return pts;
}

// Slot bebas pertama di sebuah stasiun, atau -1 kalau penuh — bukan sekadar
// menghitung jumlah rekan. Cara hitung bikin dua pegawai jatuh di piksel yang
// sama begitu ada yang pindah, dan bikin beberapa slot mentok ke tepi kanvas
// yang sama persis. Sebagian stasiun tidak bisa pakai jarak seragam: meja kerja
// harus jatuh tepat di koridor turun yang bebas perabot, jadi titiknya
// didaftar manual lewat slotsX.
function slotBebas(id, diri) {
  const s = STATIONS[id];
  const daftar = s.slotsX;
  const maks = daftar ? daftar.length : (s.slots || (id === 'rapat' ? KURSI_TOTAL : 12));
  const dipakai = new Set();
  for (const other of penghuni()) {
    if (other !== diri && other.station === id) dipakai.add(other.slotIdx);
  }
  for (let k = 0; k < maks; k++) {
    if (dipakai.has(k)) continue;
    const x = s.x + (daftar ? daftar[k] - s.x : slotKe(k, s.step));
    if (x < 16 || x > W - 16) continue;      // slot mentok tepi: lewati, jangan di-clamp
    return k;
  }
  return -1;
}

/* Tempat pulang pegawai yang lagi tidak dapat tugas adalah MEJA KERJANYA,
   bukan sudut tunggu: yang enak dilihat itu ruangan yang orangnya sibuk di
   mejanya masing-masing, bukan yang antre. Sudut tunggu tinggal jadi limpahan,
   dipakai cuma kalau empat meja sudah terisi semua. */
function stasiunPulang(diri) {
  return slotBebas('think', diri) >= 0 ? 'think' : 'idle';
}

class Agent {
  constructor(id) {
    this.id = id;
    this.slot = spawnIndex++;
    this.peran = peranBawaan(this.slot);
    this.pal = jabatanDari(this.peran).pal;
    this.sejak = Date.now();       // bahan kartu detail: sejak kapan dia di kantor
    this.calls = 0;
    this.gagal = 0;
    this.biaya = null;      // { usd, resmi } — cuma ada buat sesi lewat halaman
    this.perStasiun = Object.create(null);
    this.riwayat = [];
    this.x = -14;          // masuk dari luar layar
    this.y = LANE_DOWN;
    this.path = [];
    this.station = 'idle';
    this.state = 'walk';
    this.face = 'right';
    this.phase = Math.random() * 20;
    this.busyUntil = 0;
    this.lastEvent = now;
    this.arrivedAt = now;
    this.adaTugas = false;
    this.slotIdx = 0;
    this.doing = '';
    this.project = '';
    this.model = '';        // diisi server; sesi terminal sering tidak memberitahu
    this.stepT = 0;
    this.stampUp = false;
    this.fx = null;          // efek yang mengikuti pekerjaan, bukan mejanya
    this.betah = false;      // true = duduk terus sampai disuruh bubar
    this.hadap = null;       // arah hadap khusus, kalau stasiunnya punya
    this.alpha = 1;          // dipakai event: memudar di ambang pintu kadis
    this.eventKerja = null;  // event acak yang sedang meminjamnya, kalau ada
    this.doingEvent = '';    // keterangan kartu selama dipinjam event
    this.bawa = null;        // barang bawaan sementara (map, gelas, jerigen)
    this.pose = null;        // pose sesaat: 'angkat', 'nunjuk', 'ngantuk', ...
    this.butuh = null;       // keadaan ketiga: berhenti menunggu keputusan kamu

    this.el = document.createElement('div');
    this.el.className = 'bubble';
    this.el.style.display = 'none';
    overlay.appendChild(this.el);
    this.bubbleUntil = 0;

    // Balon pikiran punya elemen sendiri, bukan menumpang balon ucap: dua-duanya
    // bisa muncul bersamaan (mikir sambil melapor) dan umurnya beda jauh.
    this.elPikir = document.createElement('div');
    this.elPikir.className = 'pikir';
    this.elPikir.style.display = 'none';
    overlay.appendChild(this.elPikir);
    this.pikirBagian = [];
    this.pikirIdx = 0;
    this.pikirGanti = 0;
    this.pikirUntil = 0;

    // Lencana galat: tidak berganti isi, tidak menua sendiri — nyala persis
    // selama this.macet ada isinya, padam sendiri begitu server bilang cukup.
    this.macet = null;
    this.elMacet = document.createElement('div');
    this.elMacet.className = 'macet';
    this.elMacet.style.display = 'none';
    this.elMacet.textContent = '!';
    overlay.appendChild(this.elMacet);

    this.goTo(stasiunPulang(this));
  }

  // Stasiun penuh: slotIdx balik ke 0 dan dia berdiri menumpuk. Itu pilihan
  // sadar — lebih baik dua orang berimpit daripada satu orang keluar kanvas.
  slotOffset(id) {
    const s = STATIONS[id];
    const k = slotBebas(id, this);
    this.slotIdx = k < 0 ? 0 : k;
    return s.slotsX ? s.slotsX[this.slotIdx] - s.x : slotKe(this.slotIdx, s.step);
  }

  goTo(id) {
    const s = STATIONS[id];
    if (!s) return;
    const off = this.slotOffset(id);
    const fromLane = this.y < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN;
    this.station = id;
    const dekat = id === 'rapat' ? KURSI_DEKAT[this.slotIdx - KURSI_N] : null;
    const tx = dekat ? dekat.x : Math.max(14, Math.min(W - 12, s.x + off));
    const ty = dekat ? dekat.y : s.y;
    this.hadap = dekat ? 'up' : s.face;
    this.path = route(this.x, this.y, fromLane, tx, ty, dekat ? LANE_DOWN : s.lane);
    this.state = 'walk';
  }

  /* Jalan ke titik bebas, bukan ke stasiun. Stasiunnya diberi nama 'acara'
     supaya slotBebas() tidak menghitungnya sebagai penghuni meja mana pun —
     pemeran event yang berdiri di tengah ruangan tidak boleh memblokir slot. */
  goToXY(tx, ty, hadap) {
    const fromLane = this.y < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN;
    const bLane = ty < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN;
    this.station = 'acara';
    this.slotIdx = 0;
    this.hadap = hadap || null;
    this.path = route(this.x, this.y, fromLane, Math.max(10, Math.min(W - 10, tx)), ty, bLane);
    this.state = 'walk';
  }

  // sudah sampai tujuan goToXY / goTo terakhir?
  get diam() { return !this.path.length; }

  setPeran(id) {
    const j = JABATAN_ID.get(id);
    if (!j) return false;
    this.peran = id;
    this.pal = j.pal;              // seragamnya ikut ganti, bukan cuma labelnya
    return true;
  }

  /* Berhenti menunggu keputusan manusia. Arah hadapnya dipasang di sini, bukan
     dibaca waktu menggambar: pegawai yang sudah berdiri di mejanya tidak
     memanggil arrive() lagi, jadi kalau tidak dipasang sekarang dia tetap
     membelakangi kamera sampai perjalanan berikutnya. */
  setButuh(b) {
    this.butuh = b || null;
    this.face = this.butuh
      ? 'down'
      : this.hadap || (STATIONS[this.station] || {}).face || 'down';
  }

  /* Berhenti PAKSA karena galat — beda dari setButuh(): itu menunggu KAMU,
     ini menunggu keadaannya sendiri berubah. Tidak memaksa arah hadap:
     lencananya sendiri yang menandakan, bukan posenya, jadi pegawainya tetap
     menghadap ke mana pun dia terakhir berdiri saat giliran itu putus. */
  setMacet(m) {
    this.macet = m || null;
    this.elMacet.style.display = this.macet ? '' : 'none';
  }

  say(text, cls) {
    this.el.className = 'bubble' + (cls ? ' ' + cls : '');
    this.el.innerHTML = text;
    this.el.style.display = '';
    this.bubbleUntil = now + 4200;
  }

  /* Isi kepalanya. Ditampilkan sepenggal-sepenggal, bukan sekaligus: satu blok
     pikiran gampang lebih panjang dari yang muat di atas kepala orang, dan
     membacanya berganti kalimat justru yang bikin dia terbaca sebagai proses,
     bukan sebagai papan pengumuman. */
  berpikir(ev) {
    if (!balonPikir) return;
    const bagian = ev.teks ? penggalPikir(ev.teks).map(esc) : [];
    // Pikiran tersegel: yang jujur cuma "dia memang lagi mikir". Jumlah
    // tokennya ikut supaya jelas ada isinya, cuma tidak dibagi.
    if (!bagian.length) bagian.push(TITIK + (ev.token ? ' <b>' + ev.token + '</b> token' : ''));
    this.pikirBagian = bagian;
    this.pikirIdx = 0;
    this.elPikir.className = 'pikir' + (ev.teks ? '' : ' tersegel');
    this.elPikir.innerHTML = bagian[0];
    this.elPikir.style.display = '';
    this.pikirGanti = now + PIKIR_GANTI;
    this.pikirUntil = now + Math.min(PIKIR_UMUR, PIKIR_GANTI * bagian.length + 1400);
  }

  update(dt) {
    this.phase += dt;
    // barang bawaan berumur: gelas kopi hilang sendiri, tidak menempel selamanya
    if (this.bawaSampai && now > this.bawaSampai) { this.bawa = null; this.bawaSampai = 0; }

    if (this.path.length) {
      const t = this.path[0];
      const dx = t.x - this.x, dy = t.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1.6) {
        this.x = t.x; this.y = t.y;
        this.path.shift();
        if (!this.path.length) this.arrive();
      } else {
        const step = Math.min(dist, SPEED * dt);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        this.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        this.stepT += dt;
        // Zona senyap: waktu ada rapat daring, yang lewat depan meja rapat
        // memelankan langkah. Debunya ikut hilang, bukan cuma suaranya.
        const senyap = this.x >= MOD.senyapDari && this.x <= MOD.senyapSampai;
        if (this.stepT > 0.26) { this.stepT = 0; if (!senyap) spawn('step', this.x, this.y); }
      }
    } else {
      if (this.state === 'work' && now > this.busyUntil) {
        this.state = 'idle';
      }
      // Hitungan menganggur dimulai sejak TIBA, bukan sejak event datang, dan
      // tidak pernah berjalan selagi masih ada tugas. Kalau tidak, trayek yang
      // makan lebih dari IDLE_AFTER bikin pegawai pulang tepat saat sampai.
      const diamSejak = Math.max(this.lastEvent, this.arrivedAt);
      // Yang terlanjur menunggu di sudut tunggu ikut dipanggil balik begitu ada
      // meja yang kosong: sudut tunggu bukan tempat parkir, cuma limpahan.
      const pulang = stasiunPulang(this);
      // Yang menunggu keputusan kamu bukan menganggur: dia berhenti di tempat.
      // Kalau dia balik ke mejanya, tandanya justru hilang dari layar.
      if (!this.betah && !this.butuh && now > this.busyUntil
          && now - diamSejak > IDLE_AFTER && this.station !== pulang) {
        this.doing = '';
        this.adaTugas = false;
        this.fx = null;
        this.goTo(pulang);
      }
    }

    // efek kerja per stasiun
    if (this.state === 'work') {
      if (this.station === 'edit') {
        const up = Math.sin(this.phase * 7) > 0;
        if (this.stampUp && !up) hentakkanStempel(this);    // stempel MENGHANTAM meja
        this.stampUp = up;
      } else {
        const fx = this.fx || (STATIONS[this.station] && STATIONS[this.station].fx);
        // hening: semua berhenti mengeluarkan apa pun (iuran duka cita).
        // lemot: lajunya dikurangi, tidak dihentikan — masih bekerja, cuma
        // menunggu. internetMati: cuma 'ping'/'scan' (web/search) yang mati —
        // orang di rak server atau meja stempel tidak butuh jaringan untuk
        // bekerja. Semuanya kosmetik; tool call-nya sendiri tetap jalan.
        const putusInternet = MOD.internetMati && (fx === 'ping' || fx === 'scan');
        if (fx && !MOD.hening && !putusInternet && Math.random() < 0.3 * (1 - MOD.lemot)) {
          spawn(fx, this.x, this.y - 24);
        }
      }
    } else if (this.station === 'idle' && !this.path.length && Math.random() < 0.02) {
      spawn('steam', this.x + 10, this.y - 14);
    }

    // posisi balon teks
    if (now > this.bubbleUntil) {
      this.el.style.display = 'none';
    } else {
      this.el.style.left = Math.round(offX + this.x * scale) + 'px';
      this.el.style.top = Math.round(offY + (this.y - 30) * scale) + 'px';
    }

    // Balon pikiran menggantung DI ATAS balon ucap, bukan menimpanya. Tingginya
    // tetap dalam piksel CSS (bukan piksel kanvas) karena teksnya juga begitu.
    if (now > this.pikirUntil) {
      if (this.elPikir.style.display !== 'none') this.elPikir.style.display = 'none';
    } else {
      if (this.pikirIdx < this.pikirBagian.length - 1 && now > this.pikirGanti) {
        this.pikirIdx++;
        this.pikirGanti = now + PIKIR_GANTI;
        this.elPikir.innerHTML = this.pikirBagian[this.pikirIdx];
      }
      const naik = now < this.bubbleUntil ? TINGGI_UCAP : 0;
      // separuh lebar balon + sedikit jarak; tanpa ini pegawai di tepi kiri
      // ruangan memikirkan sesuatu yang kalimatnya terpotong bingkai
      const tepi = Math.min(118, panggungW / 2);
      const tengah = offX + this.x * scale;
      const kiri = Math.max(tepi, Math.min(panggungW - tepi, tengah));
      // balon yang digeser masuk bingkai ekornya ikut bergeser balik, supaya
      // gelembungnya tetap menunjuk kepala orangnya
      this.elPikir.style.setProperty('--geser',
        Math.max(-92, Math.min(92, tengah - kiri)) + 'px');
      this.elPikir.style.left = Math.round(kiri) + 'px';
      this.elPikir.style.top = Math.round(offY + (this.y - 31) * scale) - naik + 'px';
    }

    // Lencana galat: kecil, jadi tidak perlu digeser masuk bingkai seperti
    // balon pikiran — yang penting selalu tepat di atas kepala orangnya.
    if (this.macet) {
      this.elMacet.style.left = Math.round(offX + this.x * scale) + 'px';
      this.elMacet.style.top = Math.round(offY + (this.y - 34) * scale) + 'px';
    }
  }

  arrive() {
    this.arrivedAt = now;
    this.face = this.butuh
      ? 'down'
      : this.hadap || (STATIONS[this.station] || {}).face || 'down';
    // Menyeberang ruangan bisa makan sampai 9 detik — lebih lama dari jatah
    // kerja yang dipasang saat event datang. Tanpa jatah minimum setibanya,
    // pegawai sampai di meja lalu langsung balik kanan tanpa sempat bekerja.
    if (this.adaTugas) this.busyUntil = Math.max(this.busyUntil, now + 1800);
    this.state = now < this.busyUntil ? 'work' : 'idle';
  }

  destroy() {
    lepaskanAktor(this);                   // event tidak boleh memegang hantu
    this.el.remove();
    this.elPikir.remove();
    this.elMacet.remove();
    if (terpilih === this) tutupKartu();   // kartunya tidak boleh jadi hantu
  }
}

// Nomor urut khusus sesi nyata. spawnIndex ikut dipakai standby dan peserta,
// jadi kalau dipakai memilih persona, jabatan sesi pertama malah bergantung
// pada berapa standby yang kebetulan sudah lahir duluan.
let agenSeq = 0;
const peranAwal = new Map();     // sesi -> jabatan yang sudah tercatat di server

function agentFor(id) {
  let a = agents.get(id);
  if (!a) {
    a = new Agent(id);
    a.setPeran(peranAwal.get(id) || peranBawaan(agenSeq++));
    agents.set(id, a);
    jagaPopulasi();
  }
  return a;
}

/* ----------------------------------------------------------- peserta rapat */
/* Subagent punya hook sendiri: `SubagentStart` menandai satu agen masuk,
   `SubagentStop` dengan `agent_id` yang sama menandai dia keluar. Itu identitas
   sungguhan, dan itu yang dipakai di sini.

   Fase workflow tetap tidak punya hook sendiri — yang bisa dibaca cuma daftar
   fase di `meta.phases` waktu tool-nya dipanggil. Untuk workflow, daftar itu
   masih jadi undangan rapat seperti dulu.

   Untuk `Task`/`Agent` daftar dari pemanggil dipakai sebagai KURSI SEMENTARA:
   `description`-nya sudah bisa dibaca di `PreToolUse`, sementara `agent_type`
   baru datang beberapa saat kemudian. Begitu `SubagentStart` masuk, kursi itu
   diambil alih — bukan ditambah kursi baru — lalu namanya diganti nama agen
   yang sebenarnya. Kalau `SubagentStart` tidak pernah datang (Claude Code lama,
   atau hook-nya belum dipasang ulang), kursi sementara itu yang bertahan. */
let pesertaSeq = 0;

class Peserta extends Agent {
  constructor(nama, pemilik) {
    super('undangan-' + ++pesertaSeq);
    this.nama = nama;
    this.pemilik = pemilik || '';
    this.setPeran(PERAN_PESERTA[pesertaSeq % PERAN_PESERTA.length]);
    this.betah = true;         // duduk sampai rapat ditutup, bukan sampai bosan
    this.adaTugas = true;
    this.busyUntil = Infinity;
    this.keluar = false;
    this.agenId = '';          // diisi SubagentStart; kursi sementara kosong
  }

  /* Kursi sementara diambil alih oleh agen yang sebenarnya. Namanya diganti
     hanya kalau `agent_type` memang ada — `description` dari pemanggil sering
     lebih deskriptif daripada "general-purpose", jadi jangan ditimpa kosong. */
  jadikan(agenId, agen) {
    this.agenId = agenId;
    if (agen) {
      this.nama = agen;
      this.say('<b>' + esc(agen) + '</b> hadir');
    }
  }

  // dipanggil setelah terdaftar di `peserta`, supaya kursinya tidak bentrok
  // dengan undangan lain dari panggilan tool yang sama
  masuk() {
    this.goTo('rapat');
    this.say('<b>' + esc(this.nama) + '</b> hadir');
  }

  bubar() {
    if (this.keluar) return;
    this.keluar = true;
    this.betah = false;
    this.busyUntil = 0;
    this.station = 'keluar';   // kursinya dilepas sekarang, bukan setelah sampai pintu
    this.hadap = null;
    const lane = this.y < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN;
    this.path = route(this.x, this.y, lane, -20, LANE_DOWN, LANE_DOWN);
    this.state = 'walk';
    this.say('permisi, lanjut di luar');
  }

  arrive() {
    if (this.keluar) { this.destroy(); return; }
    super.arrive();
  }

  destroy() {
    const i = peserta.indexOf(this);
    if (i >= 0) peserta.splice(i, 1);
    super.destroy();
    renderCrew();
  }
}

/* Rapat yang sedang berjalan. Pre dan post dicocokkan lewat `tool_use_id` yang
   dibawa keduanya; kalau payload-nya tidak membawanya (Claude Code lama), jatuh
   ke (sesi, tool) seperti dulu — yang dibuka duluan yang ditutup duluan. */
const rapatAktif = [];

const sedangRapat = (session) => rapatAktif.some((rp) => rp.sesi === session);

// Ruangan dijaga minimal berisi 4 orang supaya tidak terlihat mati saat cuma
// ada satu sesi. Yang menambal itu pegawai standby — dan mereka SENGAJA
// dibedakan di panel maupun di ruangan, supaya tidak ada yang mengira
// jumlah pegawai di layar sama dengan jumlah sesi yang benar-benar jalan.
const MIN_DI_LAYAR = 4;
// Standby lebih sering nongkrong di mejanya sendiri daripada di sudut tunggu —
// itu yang bikin ruangan terbaca sibuk, bukan terbaca antre.
const MAMPIR = ['think', 'think', 'think', 'server', 'read', 'search', 'web', 'rapat', 'idle'];

class Standby extends Agent {
  constructor(n) {
    super('standby-' + n);
    this.standby = true;
    this.setPeran(PERAN_STANDBY[n % PERAN_STANDBY.length]);
    this.nextMove = now + 3000 + Math.random() * 6000;
    this.el.remove();                   // tidak pernah bicara, tidak perlu balon
  }
  update(dt) {
    super.update(dt);
    if (!this.path.length && now > this.nextMove) {
      this.goTo(MAMPIR[(Math.random() * MAMPIR.length) | 0]);
      this.nextMove = now + 11000 + Math.random() * 15000;
    }
  }
  say() {}                              // dibungkam: standby bukan sesi nyata
}

// standby = penambal, jumlahnya selalu (4 - sesi nyata), tidak pernah negatif
function jagaPopulasi() {
  const perlu = Math.max(0, MIN_DI_LAYAR - agents.size);
  while (standby.length > perlu) {
    const keluar = standby.pop();
    keluar.destroy();
  }
  while (standby.length < perlu) standby.push(new Standby(spawnIndex));
}

function kursiKosong() {
  let dipakai = 0;
  for (const o of penghuni()) if (o.station === 'rapat') dipakai++;
  return Math.max(0, KURSI_TOTAL - dipakai);
}

/* Rapat yang pesertanya subagent (`Task`/`Agent`) ditutup `SubagentStop`, bukan
   `PostToolUse`. Alasannya: untuk subagent, `post` tidak pernah bisa dipercaya
   menandai selesai — kalau agennya dikirim ke latar, `post` datang sepersekian
   detik setelah `pre` dan yang ditandainya cuma pengiriman. Dulu bedanya ditebak
   dari jarak pre→post; sekarang tidak perlu ditebak sama sekali, karena
   `SubagentStop` selalu datang setelah agennya benar-benar berhenti — baik yang
   sinkron maupun yang di latar. Rapat workflow tetap ditutup `post`: fasenya
   memang habis waktu panggilan tool-nya habis. */
const TUNGGU_SUBAGENT = /^(Task|Agent)$/;

function bukaRapat(ev) {
  const nama = Array.isArray(ev.peserta) ? ev.peserta.filter(Boolean) : [];
  if (!nama.length) return;
  const muat = Math.min(nama.length, kursiKosong());
  const anggota = [];
  for (const nm of nama.slice(0, muat)) {
    const p = new Peserta(nm, ev.session);
    peserta.push(p);           // daftar dulu, baru cari kursi
    p.masuk();
    anggota.push(p);
  }
  rapatAktif.push({
    tag: ev.session + '|' + ev.tool,
    panggilan: ev.panggilan || '',
    sesi: ev.session,
    anggota,
    sejak: now,
    tunggu: TUNGGU_SUBAGENT.test(ev.tool || ''),
  });
  if (nama.length > 1) {
    const daring = nama.length - muat;
    pushLog(ev, 'mark',
      ['rapat dibuka', nama.join(', ') + (daring ? ' (+' + daring + ' ikut daring)' : '')]);
  }
}

/* SubagentStart: agen yang sebenarnya menempati kursinya. Yang dicari dulu
   kursi sementara yang dipasang `pre` untuk sesi ini — kalau ada, diambil alih
   supaya tidak ada dua kursi untuk satu agen. Kalau tidak ada (agen dilahirkan
   tanpa lewat tool `Task`, atau kursinya sudah ditempati agen lain), barulah
   kursi baru dibuka. */
function pesertaMasuk(ev) {
  const agenId = ev.agenId || '';
  if (agenId && peserta.some((p) => !p.keluar && p.agenId === agenId)) return null;

  for (const rp of rapatAktif) {
    if (rp.sesi !== ev.session || !rp.tunggu) continue;
    const kosong = rp.anggota.find((p) => !p.keluar && !p.agenId);
    if (!kosong) continue;
    kosong.jadikan(agenId, ev.agen);
    return kosong;
  }

  if (!kursiKosong()) return null;              // meja penuh: dicatat, tidak dipaksa
  const p = new Peserta(ev.agen || 'agen', ev.session);
  peserta.push(p);
  p.jadikan(agenId, '');
  p.masuk();
  rapatAktif.push({
    tag: ev.session + '|SubagentStart',
    panggilan: '',
    sesi: ev.session,
    anggota: [p],
    sejak: now,
    tunggu: true,
  });
  return p;
}

/* Rapat yang semua kursinya sudah kosong dicoret saat itu juga, kalau tidak
   entrinya menyangkut sampai sapuan 15 menit dan `sedangRapat()` ikut bohong. */
function sapuRapatKosong() {
  for (let i = rapatAktif.length - 1; i >= 0; i--) {
    if (rapatAktif[i].anggota.every((p) => p.keluar)) rapatAktif.splice(i, 1);
  }
}

/* SubagentStop membubarkan SATU peserta: yang `agent_id`-nya cocok. Tanpa
   `agent_id` (payload lama) jatuh ke tebakan lama — yang paling awal masih
   duduk di salah satu rapat milik sesi ini. */
function pesertaKeluar(ev) {
  const agenId = ev.agenId || '';
  if (agenId) {
    const p = peserta.find((q) => !q.keluar && q.agenId === agenId);
    if (p) { p.bubar(); sapuRapatKosong(); return p; }
  }
  return bubarkanSatu(ev.session);
}

function bubarkanSatu(session) {
  for (const rp of rapatAktif) {
    if (rp.sesi !== session) continue;
    const p = rp.anggota.find((q) => !q.keluar);
    if (!p) continue;
    p.bubar();
    sapuRapatKosong();
    return p;
  }
  return null;
}

function tutupRapat(ev) {
  const i = ev.panggilan
    ? rapatAktif.findIndex((rp) => rp.panggilan === ev.panggilan)
    : rapatAktif.findIndex((rp) => rp.tag === ev.session + '|' + ev.tool);
  if (i < 0) return;
  // Rapat subagent tetap berjalan: yang menutupnya `SubagentStop`.
  if (rapatAktif[i].tunggu) return;
  for (const p of rapatAktif[i].anggota) p.bubar();
  rapatAktif.splice(i, 1);
}

// `paksa` dipakai waktu sesinya benar-benar berakhir. Tanpa itu, rapat yang
// menunggu SubagentStop dibiarkan: giliran main agent boleh selesai duluan
// sementara subagent-nya masih bekerja — persis yang terjadi kalau Task/Agent
// dikirim ke latar.
function tutupSemuaRapat(session, paksa) {
  for (let i = rapatAktif.length - 1; i >= 0; i--) {
    const rp = rapatAktif[i];
    if (rp.sesi !== session) continue;
    if (rp.tunggu && !paksa) continue;
    for (const p of rp.anggota) p.bubar();
    rapatAktif.splice(i, 1);
  }
}

/* ------------------------------------------------------------------- HUD */
const connDot = document.getElementById('connDot');
const connText = document.getElementById('connText');
const nowDoing = document.getElementById('nowDoing');
const statTools = document.getElementById('statTools');
const statAgents = document.getElementById('statAgents');
const statTime = document.getElementById('statTime');
const soundBtn = document.getElementById('soundBtn');

let toolCount = 0;
// Kapan tool call terakhir masuk — dipakai event yang menggambarkan MENUNGGU
// (layar mengantuk, berdiri di depan pintu kadis, detak jam di ruangan sepi).
let toolTerakhir = 0;
const started = Date.now();
let sound = false;
let audio = null;

soundBtn.onclick = () => {
  sound = !sound;
  soundBtn.textContent = sound ? '🔊' : '🔇';
  if (sound && !audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  // derau hujan tidak boleh terus terdengar setelah 🔇 — redam cepat, jangan
  // menunggu tick interval; unmute sebaliknya menyalakan lagi seketika
  if (!sound && hujanAudio) hujanAudio.g.gain.setTargetAtTime(0.0001, audio.currentTime, 0.08);
  if (sound) aturSuaraHujan();
};

function blip(freq, dur) {
  if (!sound || !audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.value = 0.02;
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
  o.connect(g); g.connect(audio.destination);
  o.start(); o.stop(audio.currentTime + dur);
}

/* Suara hujan: derau putih di-loop lewat lowpass, volumenya mengikuti deras.
   Node-nya dibuat sekali saat suara menyala DAN memang hujan; sesudahnya
   volumenya tinggal digeser halus, termasuk turun ke nyaris nol saat reda. */
let hujanAudio = null;
function aturSuaraHujan() {
  const mau = sound && audio && CUACA.hujan > 0.01;
  if (mau && !hujanAudio) {
    const len = audio.sampleRate * 2;
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = audio.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = audio.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 850;
    const g = audio.createGain(); g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(audio.destination);
    src.start();
    hujanAudio = { g };
  }
  if (hujanAudio) {
    const target = mau ? 0.012 + 0.035 * CUACA.hujan : 0.0001;
    hujanAudio.g.gain.setTargetAtTime(target, audio.currentTime, 0.6);
  }
}
setInterval(aturSuaraHujan, 900);

// Guntur menyusul kilatnya; tundaMs dari kilatAktif menirukan jarak petirnya.
function gemuruh(tundaMs) {
  if (!sound || !audio) return;
  setTimeout(() => {
    if (!sound || !audio) return;
    const len = (audio.sampleRate * 1.8) | 0;
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = audio.createBufferSource(); src.buffer = buf;
    const lp = audio.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 200;
    const g = audio.createGain(); g.gain.value = 0.18;
    src.connect(lp); lp.connect(g); g.connect(audio.destination);
    src.start();
  }, tundaMs || 0);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Tiga sebab sesi berhenti menunggu manusia, ditulis dari sudut pandang
   pembacanya: yang ditunggu selalu kamu, bukan sistemnya. */
const TUNGGU_TEKS = {
  izin: 'menunggu izin kamu',
  tolak: 'izin ditolak — menunggu kamu',
  tanya: 'menunggu jawaban kamu',
};

/* Satu tempat buat angka yang bukan hasil hitungan kita sendiri — beda dari
   "tool call" atau "di kantor" yang server hitung sendiri dan pasti benar,
   angka begini datang dari Claude Code sebagai perkiraan. Laporan dinas
   membedakan data tetap dari data sementara; angka begini ikut aturan yang
   sama, dan `resmi:false`-nya harus terbaca, bukan cuma kata "kira-kira" yang
   gampang lewat tanpa dibaca. */
function formatBiaya(b) {
  const usd = '$' + b.usd.toFixed(4).replace('.', ',');
  return b.resmi ? usd : usd + ' (data sementara)';
}

/* Nama yang dipakai baris panel DAN kepala modal kabar: nama panggilan kalau
   sudah diberi, kalau belum nama project + potongan id sesinya. Satu tempat
   saja, supaya orang yang sama tidak muncul dengan dua nama berbeda. */
const namaKru = (a) => namaPanggilan.get(a.id)
  || ((a.project ? a.project.slice(0, 12) + '·' : '') + a.id.slice(0, 4));

function pushLog(ev, kindClass, frasa) {
  const [v, o] = frasa || kegiatan(ev.tool, ev.label);
  const li = document.createElement('li');
  if (kindClass) li.className = kindClass;
  // barisnya dipotong CSS kalau panjang; teks penuhnya tetap bisa dibaca
  // dengan menunjuknya — penting untuk pesan gagal yang justru panjang
  li.title = [v, o].filter(Boolean).join(' ');
  const time = new Date(ev.ts).toLocaleTimeString('id-ID', { hour12: false });
  li.innerHTML =
    '<span class="t">' + time.slice(0, 8) + '</span>' +
    '<span class="k">' + esc(v) + '</span>' +
    '<span class="d">' + esc(o || '') + '</span>';
  logEl.appendChild(li);
  while (logEl.children.length > 60) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
  // Di layar sempit log tidak punya scroll sendiri (lihat style.css), jadi yang
  // digulir wadah panelnya — itu pun cuma kalau pembaca memang lagi di bawah.
  const isi = logEl.parentElement;
  if (isi && logEl.scrollHeight <= logEl.clientHeight + 1) {
    const dasar = isi.scrollHeight - isi.clientHeight - isi.scrollTop;
    if (dasar < 60) isi.scrollTop = isi.scrollHeight;
  }
}

// Satu baris panel = satu orang di ruangan, jadi klik keduanya membuka kartu
// yang sama. Warna chip diambil dari seragam jabatannya supaya baris di panel
// dan orang di ruangan bisa dicocokkan tanpa membaca nama.
function barisKru(a, kelas, who, what) {
  const j = jabatanDari(a.peran);
  const row = document.createElement('div');
  row.className = kelas + (a === terpilih ? ' pilih' : '');
  row.title = j.nama + ' · ' + j.padanan;
  row.innerHTML =
    '<span class="chip" style="background:' + j.pal.main + '"></span>' +
    '<span class="who">' + esc(who) + '</span>' +
    '<span class="jab">' + esc(j.singkat) + '</span>' +
    '<span class="what">' + esc(what) + '</span>';
  row.addEventListener('click', (e) => {
    if (e.target.closest('.aksi')) return;      // tombol nama/stop punya kerja sendiri
    if (a === terpilih) tutupKartu(); else bukaKartu(a);
  });
  return row;
}

function renderCrew() {
  crewEl.innerHTML = '';
  for (const a of agents.values()) {
    const panggilan = namaPanggilan.get(a.id);
    const who = namaKru(a);
    // Yang menunggu keputusan kamu tidak boleh terbaca sedang bekerja — kegiatan
    // terakhirnya memang belum berubah, tapi kegiatan itu justru yang tertahan.
    const apa = a.butuh ? TUNGGU_TEKS[a.butuh.sebab] || TUNGGU_TEKS.izin
      : a.macet ? 'berhenti — ' + (a.macet.label || a.macet.jenis || 'galat')
      : a.doing || (STATIONS[a.station] || {}).name || '';
    const row = barisKru(a, 'crew-row', who, apa);
    if (panggilan) row.classList.add('tugas');
    const bNama = document.createElement('button');
    bNama.className = 'aksi'; bNama.textContent = 'nama'; bNama.title = 'beri nama pegawai ini';
    bNama.onclick = () => beriNama(a.id);
    row.appendChild(bNama);
    if (kendali.izin) {
      const bStop = document.createElement('button');
      bStop.className = 'aksi'; bStop.textContent = 'stop'; bStop.title = 'hentikan tugasnya';
      bStop.onclick = () => hentikanTugas(a.id);
      row.appendChild(bStop);
    }
    crewEl.appendChild(row);
  }
  for (const p of peserta) {
    if (p.keluar) continue;
    crewEl.appendChild(barisKru(p, 'crew-row sub', 'peserta', p.nama));
  }
  for (const b of standby) {
    crewEl.appendChild(barisKru(b, 'crew-row standby', 'standby',
      (STATIONS[b.station] || {}).name || ''));
  }
  // Angka besar = sesi yang BENAR-BENAR jalan. Standby disebut terpisah supaya
  // ruangan yang ramai tidak dibaca sebagai banyak sesi.
  statAgents.textContent = agents.size;
  const ket = document.getElementById('statAgentsKet');
  if (ket) ket.textContent = standby.length ? 'sesi +' + standby.length + ' standby' : 'sesi';
}

setInterval(() => {
  const s = ((Date.now() - started) / 1000) | 0;
  statTime.textContent = ((s / 60) | 0) + ':' + String(s % 60).padStart(2, '0');
  // Sesi yang mati di tengah jalan tidak pernah mengirim penutupnya — workflow
  // tanpa PostToolUse, subagent tanpa SubagentStop. Tanpa sapuan ini kursinya
  // terkunci selamanya.
  for (let i = rapatAktif.length - 1; i >= 0; i--) {
    if (performance.now() - rapatAktif[i].sejak < 900000) continue;
    for (const p of rapatAktif[i].anggota) p.bubar();
    rapatAktif.splice(i, 1);
  }
}, 1000);

/* --------------------------------------------------------- kartu pegawai --
   Klik pegawainya — di ruangan atau di baris panel — untuk membuka kartu
   detail: siapa dia, jabatannya, sedang di mana, sudah berapa panggilan tool,
   dan apa saja yang barusan dikerjakan. Jabatannya juga diganti dari sini.

   Kartunya menempel pada orangnya (posisinya dihitung ulang tiap frame, sama
   seperti balon teks), jadi tidak perlu ditebak kartu ini milik siapa. */
const kartuEl = document.getElementById('kartu');
let terpilih = null;

function durasiSingkat(ms) {
  const d = Math.max(0, ms / 1000 | 0);
  if (d < 60) return d + ' dtk';
  const m = d / 60 | 0;
  if (m < 60) return m + ' mnt';
  return (m / 60 | 0) + ' jam ' + (m % 60) + ' mnt';
}
const jam = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour12: false }).slice(0, 8);

const jenisAgen = (a) => (a.standby ? 'standby' : a instanceof Peserta ? 'peserta' : 'sesi');

function namaTampil(a) {
  if (a instanceof Peserta) return a.nama;
  if (a.standby) return 'pegawai standby';
  return namaPanggilan.get(a.id) || a.id;
}

// Siapa yang berdiri di titik ini. Kotaknya sengaja sedikit lebih lebar dari
// badannya supaya kepala dan lengan yang mengayun tetap kena klik.
function agenDiTitik(cx, cy) {
  let kena = null;
  for (const a of penghuni()) {
    if (Math.abs(cx - a.x) > 10) continue;
    if (cy < a.y - 30 || cy > a.y + 5) continue;
    if (!kena || a.y > kena.y) kena = a;   // yang di depan menang: itu yang terlihat
  }
  return kena;
}

function titikKanvas(e) {
  // dari rect, bukan dari offX/offY: rect ikut benar walau halaman di-scroll
  const rect = canvas.getBoundingClientRect();
  return [(e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale];
}

canvas.addEventListener('click', (e) => {
  const [cx, cy] = titikKanvas(e);
  const a = agenDiTitik(cx, cy);
  if (a) bukaKartu(a); else tutupKartu();
});
canvas.addEventListener('mousemove', (e) => {
  const [cx, cy] = titikKanvas(e);
  canvas.style.cursor = agenDiTitik(cx, cy) ? 'pointer' : '';
});

function bukaKartu(a) {
  terpilih = a;
  kartuEl.hidden = false;
  kartuEl.innerHTML =
    '<div class="kartu-kepala">' +
      '<span class="chip" id="kartuChip"></span>' +
      '<b id="kartuNama"></b>' +
      '<button type="button" class="kartu-tutup" id="kartuTutup" title="tutup">✕</button>' +
    '</div>' +
    '<div class="kartu-jab" id="kartuJab"></div>' +
    '<div class="kartu-tugas" id="kartuTugas"></div>' +
    '<div class="kartu-info" id="kartuInfo"></div>' +
    '<label class="kartu-pilih">jabatan<select id="kartuPeran">' + opsiJabatan() + '</select></label>' +
    '<div class="kartu-aksi" id="kartuAksi"></div>' +
    '<div class="kartu-riwayat"><h3>riwayat</h3><ul id="kartuRiwayat"></ul></div>';

  document.getElementById('kartuTutup').onclick = tutupKartu;
  const sel = document.getElementById('kartuPeran');
  sel.value = a.peran;
  sel.onchange = () => gantiPeran(a, sel.value);

  const aksi = document.getElementById('kartuAksi');
  if (jenisAgen(a) === 'sesi') {
    const bNama = document.createElement('button');
    bNama.type = 'button';
    bNama.textContent = 'beri nama';
    bNama.onclick = () => beriNama(a.id);
    aksi.appendChild(bNama);
    if (kendali.izin) {
      const bStop = document.createElement('button');
      bStop.type = 'button';
      bStop.textContent = 'hentikan tugas';
      bStop.onclick = () => hentikanTugas(a.id);
      aksi.appendChild(bStop);
    }
  }
  perbaruiKartu();
  taruhKartu();
  renderCrew();
}

function tutupKartu() {
  if (!terpilih) return;
  terpilih = null;
  kartuEl.hidden = true;
  kartuEl.innerHTML = '';
  renderCrew();
}

const opsiJabatan = () => JABATAN.map((j) =>
  '<option value="' + j.id + '">' + esc(j.nama) + ' · ' + esc(j.padanan) + '</option>').join('');

const opsiModel = () => MODEL.map((m) =>
  '<option value="' + m.id + '">' + esc(m.nama) +
  (m.catatan ? ' · ' + esc(m.catatan) : '') + '</option>').join('');

function gantiPeran(a, id) {
  if (!a.setPeran(id)) return;
  const j = jabatanDari(id);
  // Standby dan peserta rapat tidak punya sesi di server, jadi jabatannya
  // cuma berlaku selama halaman ini terbuka — tidak perlu dikirim ke mana pun.
  if (jenisAgen(a) === 'sesi') {
    a.say('siap, <b>' + esc(j.singkat) + '</b>');
    simpanPeran(a.id, id);
  }
  perbaruiKartu();
  renderCrew();
}

async function simpanPeran(sesi, peran) {
  peranAwal.set(sesi, peran);
  try {
    await fetch('/peran', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sesi, peran }),
    });
  } catch (_) { /* jabatannya tetap tampil lokal walau server tidak menjawab */ }
}

function perbaruiKartu() {
  const a = terpilih;
  if (!a) return;
  const j = jabatanDari(a.peran);
  const jenis = jenisAgen(a);
  document.getElementById('kartuChip').style.background = j.pal.main;
  document.getElementById('kartuNama').textContent = namaTampil(a);
  document.getElementById('kartuJab').textContent = j.nama + ' · ' + j.padanan;
  document.getElementById('kartuTugas').textContent = j.tugas;

  const baris = [];
  if (jenis === 'standby') {
    baris.push(['jenis', 'pegawai standby — penambal ruangan, bukan sesi']);
  } else if (jenis === 'peserta') {
    baris.push(['jenis', 'peserta rapat (fase workflow / subagent)']);
    if (a.pemilik) baris.push(['undangan', 'sesi ' + a.pemilik]);
  } else {
    baris.push(['sesi', a.id]);
    if (a.project) baris.push(['proyek', a.project]);
  }
  baris.push(['posisi', (STATIONS[a.station] || {}).name || a.station]);
  // Alasan penolakan ditulis apa adanya dari Claude Code — itu satu-satunya
  // keterangan kenapa sesinya tertahan, jadi jangan diringkas jadi "ditolak".
  if (a.butuh) {
    baris.push(['tertahan', TUNGGU_TEKS[a.butuh.sebab] || TUNGGU_TEKS.izin]);
    const ket = a.butuh.alasan || a.butuh.label;
    if (ket) baris.push([a.butuh.sebab === 'tolak' ? 'alasan' : 'perkara', ket]);
  } else if (a.macet) {
    // Beda judul dari yang di atas dengan sengaja: "tertahan" berarti kamu
    // yang ditunggu, "berhenti" berarti bukan kamu — pembacanya harus langsung
    // tahu tidak ada yang perlu dijawab, cuma perlu ditunggu atau diulang.
    baris.push(['berhenti', a.macet.label || a.macet.jenis || 'galat']);
    if (a.macet.galat) baris.push(['detail', a.macet.galat]);
  }
  // Kegiatan event ditulis apa adanya sebagai suasana, tidak dicampur dengan
  // kegiatan tool: yang membaca kartu harus tahu mana laporan, mana ruangan.
  baris.push(['kegiatan', a.doing
    || (a.doingEvent ? a.doingEvent + ' (suasana)' : '')
    || (a.path.length ? 'dalam perjalanan' : 'menunggu arahan')]);
  if (jenis === 'sesi') {
    baris.push(['di kantor', durasiSingkat(Date.now() - a.sejak) + ' (sejak ' + jam(a.sejak) + ')']);
    if (a.model) baris.push(['model', namaModel(a.model)]);
    baris.push(['tool call', a.calls + (a.gagal ? ' · ' + a.gagal + ' gagal' : '')]);
    const sering = Object.entries(a.perStasiun)
      .sort((x, y) => y[1] - x[1]).slice(0, 2)
      .map(([id, n]) => ((STATIONS[id] || {}).name || id) + ' ×' + n).join(', ');
    if (sering) baris.push(['sering di', sering]);
    if (a.biaya) baris.push(['biaya', formatBiaya(a.biaya)]);
  }
  document.getElementById('kartuInfo').innerHTML = baris
    .map(([k, v]) => '<span class="kk">' + esc(k) + '</span><span class="vv">' + esc(v) + '</span>')
    .join('');

  document.getElementById('kartuRiwayat').innerHTML =
    a.riwayat.slice(-6).reverse().map((h) =>
      '<li' + (h.ok === false ? ' class="err"' : '') + '>' +
      '<span class="t">' + jam(h.ts) + '</span>' +
      '<span>' + esc(h.v + (h.o ? ' ' + h.o : '')) + '</span></li>').join('')
    || '<li class="kosong">belum ada kegiatan tercatat</li>';

  // jangan timpa pilihan yang sedang dibuka orangnya
  const sel = document.getElementById('kartuPeran');
  if (sel && document.activeElement !== sel) sel.value = a.peran;
}

// Kartunya mengikuti orangnya. Kalau ruang di kanan tidak cukup, pindah ke
// kiri; kalau tetap tidak muat, ditempel ke tepi panggung.
function taruhKartu() {
  if (!terpilih || kartuEl.hidden) return;
  const w = kartuEl.offsetWidth, h = kartuEl.offsetHeight;
  const px = offX + terpilih.x * scale;
  const py = offY + (terpilih.y - 14) * scale;
  let left = px + 20;
  if (left + w > stageInner.clientWidth - 8) left = px - 20 - w;
  kartuEl.style.left =
    Math.round(Math.max(8, Math.min(left, stageInner.clientWidth - w - 8))) + 'px';
  kartuEl.style.top =
    Math.round(Math.max(8, Math.min(py - h / 2, stageInner.clientHeight - h - 8))) + 'px';
}

// sorotan di lantai: penanda siapa yang kartunya sedang dibuka
function drawSorot(a) {
  const t = (Math.sin(now / 240) + 1) / 2;
  ctx.strokeStyle = P.amber;
  ctx.globalAlpha = 0.35 + t * 0.45;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(Math.round(a.x) + 1, Math.round(a.y) + 2, 10, 3.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// angka "di kantor" jalan sendiri walau tidak ada event yang masuk
setInterval(() => { if (terpilih) perbaruiKartu(); }, 800);

/* ------------------------------------------------------------------ events */
function handle(ev) {
  now = performance.now();

  if (ev.kind === 'session-end') {
    const a = agents.get(ev.session);
    tutupSemuaRapat(ev.session, true);   // sesinya habis: rapat latar pun bubar
    if (a) { a.destroy(); agents.delete(ev.session); jagaPopulasi(); renderCrew(); }
    pushLog(ev, 'mark', ['pulang', ev.cwd || '']);
    return;
  }

  const a = agentFor(ev.session);
  // Tool call selalu menang atas event acak. Kalau pegawainya sedang jadi
  // pemeran, dia dilepas saat itu juga — halaman ini melaporkan pekerjaan
  // sungguhan dulu, baru menghidupkan ruangan.
  lepasDariEvent(a);
  // Keadaan "butuh manusia" beserta pembatalannya dihitung server; halaman
  // cuma mengikuti. `false` berarti tunggunya sudah lewat, `undefined` berarti
  // event ini tidak mengubah apa-apa soal itu.
  if (ev.butuh !== undefined) a.setButuh(ev.butuh);
  if (ev.macet !== undefined) a.setMacet(ev.macet);
  a.lastEvent = now;
  toolTerakhir = now;
  if (ev.cwd) a.project = ev.cwd;
  if (ev.model) a.model = ev.model;
  if (ev.nama) namaPanggilan.set(ev.session, ev.nama);
  // jabatan disimpan server, jadi ikut menempel walau halaman dibuka ulang
  if (ev.peran && ev.peran !== a.peran) {
    peranAwal.set(ev.session, ev.peran);
    a.setPeran(ev.peran);
  }

  switch (ev.kind) {
    case 'pre': {
      const st = stationFor(ev.tool, ev.label, ev.session);
      // di meja kerja, perintah shell memancarkan glyph, bukan lampu ide
      a.fx = st === 'think' ? FX_TOOL[ev.tool] || null : null;
      const [v, o] = kegiatan(ev.tool, ev.label);
      a.busyUntil = now + 60000;
      a.adaTugas = true;
      a.doing = v + (o ? ' ' + o : '');
      a.calls++;
      a.perStasiun[st] = (a.perStasiun[st] || 0) + 1;
      a.riwayat.push({ ts: ev.ts, v, o, ok: true });
      if (a.riwayat.length > 30) a.riwayat.shift();
      // kalau masih di jalan, biarkan jalan dulu — arrive() yang nyalakan mode kerja
      if (a.station !== st) a.goTo(st);
      else if (!a.path.length) a.state = 'work';
      a.say(esc(v) + (o ? ' <b>' + esc(o) + '</b>' : ''));
      // dua tool yang menahan sesinya sampai kamu menjawab membawa isi
      // pertanyaan/rencananya sendiri — itu yang naik ke modal
      if (ev.tanya) kabarMasuk(ev, a, ev.tanya.jenis === 'rencana' ? 'rencana' : 'tanya');
      toolCount++;
      statTools.textContent = toolCount;
      nowDoing.textContent = a.doing;
      pushLog(ev);
      bukaRapat(ev);
      blip(560, 0.05);
      break;
    }
    case 'post': {
      a.busyUntil = now + 900;
      if (ev.peserta) tutupRapat(ev);
      if (ev.ok === false) {
        a.gagal++;
        // yang barusan dicatat itulah yang gagal: ditandai, bukan ditambah baris
        const akhir = a.riwayat[a.riwayat.length - 1];
        if (akhir) akhir.ok = false;
        // objeknya ikut dipakai: 'koordinasi dengan' tanpa objek jadi menggantung
        const [v, o] = kegiatan(ev.tool, '');
        const apa = v + (o ? ' ' + o : '');
        // Ctrl+C bukan alat yang rusak: yang menghentikan kamu sendiri.
        const sebab = ev.interupsi ? 'dihentikan' : 'gagal';
        a.say(sebab + ' <b>' + esc(apa) + '</b>', 'err');
        // Pesan galat dari Claude Code lebih berguna daripada nama kegiatannya —
        // itu satu-satunya keterangan kenapa. Kegiatannya sudah ada di baris atas.
        pushLog(ev, 'err', [sebab, ev.galat || apa]);
        for (let i = 0; i < 12; i++) spawn('ink', a.x, a.y - 16);
        blip(180, 0.12);
      }
      break;
    }
    case 'prompt': {
      a.busyUntil = now + 4000;
      a.adaTugas = true;      // arrive() menjamin jatah minimum walau jalannya lama
      a.doing = 'menerima arahan';
      a.riwayat.push({ ts: ev.ts, v: 'arahan', o: ev.label || '', ok: true });
      if (a.riwayat.length > 30) a.riwayat.shift();
      a.goTo('rapat');
      a.say('<b>arahan:</b> ' + esc(ev.label || ''), 'say');
      nowDoing.textContent = 'menerima arahan di meja rapat';
      pushLog(ev, 'mark', ['arahan dari kamu', ev.label]);
      blip(720, 0.07);
      break;
    }
    // Subagent mulai: kursinya diisi identitas agen yang sebenarnya. Pegawainya
    // sendiri tidak diapa-apakan — yang datang tamu, bukan tugas baru untuknya.
    case 'subagent-start': {
      const pm = pesertaMasuk(ev);
      pushLog(ev, 'mark',
        ['peserta rapat masuk', pm ? pm.nama : (ev.agen || '') + ' (ikut daring)']);
      break;
    }
    // Subagent selesai bukan berarti sesinya selesai: yang bubar cuma satu
    // peserta rapat, pegawainya tetap di mejanya.
    case 'subagent-stop': {
      const pb = pesertaKeluar(ev);
      pushLog(ev, 'mark', ['peserta rapat selesai', pb ? pb.nama : (ev.agen || '')]);
      blip(420, 0.1);
      break;
    }
    case 'stop': {
      a.busyUntil = 0;
      a.adaTugas = false;
      a.doing = 'menunggu arahan';
      tutupSemuaRapat(ev.session);
      a.fx = null;
      a.goTo(stasiunPulang(a));
      a.say('beres, siap disposisi ☕');
      nowDoing.textContent = 'selesai — menunggu arahan';
      pushLog(ev, 'mark', ['selesai, menunggu arahan', '']);
      blip(420, 0.1);
      break;
    }
    /* Isi kepalanya. Cuma balon: tidak masuk log dan tidak menaikkan statistik
       apa pun. Berpikir memang bukan pekerjaan yang bisa dihitung, dan log
       kegiatan akan tenggelam kalau tiap tarikan napas ikut dicatat. */
    case 'pikir': {
      a.berpikir(ev);
      break;
    }
    /* Kalimat yang benar-benar dia tulis untuk kamu. Yang menutup giliran
       (`akhir`) itu jawabannya, jadi dia yang berhak memunculkan modal;
       sisanya kalimat pengantar sebelum tool berikutnya — cukup lewat sebagai
       balon lalu menumpuk di kotak kabar. */
    case 'ucap': {
      a.say(esc(satuBaris(ev.teks, 84)), 'say');
      kabarMasuk(ev, a, ev.akhir ? 'hasil' : 'lapor');
      pushLog(ev, 'mark',
        [ev.akhir ? 'menyampaikan hasil' : 'melapor', satuBaris(ev.teks, 120)]);
      break;
    }
    case 'notify': {
      a.say('<b>!</b> ' + esc(ev.label || ''), 'say');
      pushLog(ev, 'mark', ['butuh perhatian', ev.label]);
      if (ev.butuh) { nowDoing.textContent = 'menunggu jawaban kamu'; kabarMasuk(ev, a, 'tanya'); }
      blip(880, 0.08);
      break;
    }
    /* Minta izin: sesinya berhenti sampai kamu menjawab. Tidak menaikkan
       statistik apa pun — yang terjadi bukan pekerjaan, justru pekerjaan yang
       tertahan. Yang dicatat cuma satu baris log dan pose di ruangan. */
    case 'izin-minta': {
      a.say('minta izin: <b>' + esc(ev.label || ev.tool || '') + '</b>', 'say');
      pushLog(ev, 'mark', ['minta izin', [ev.tool, ev.label].filter(Boolean).join(' ')]);
      kabarMasuk(ev, a, 'izin');
      nowDoing.textContent = 'menunggu izin kamu';
      blip(880, 0.08);
      break;
    }
    case 'izin-tolak': {
      a.say('izin ditolak: <b>' + esc(ev.alasan || ev.tool || '') + '</b>', 'err');
      pushLog(ev, 'err', ['izin ditolak', ev.alasan || [ev.tool, ev.label].filter(Boolean).join(' ')]);
      nowDoing.textContent = 'izin ditolak — cek panel';
      blip(200, 0.1);
      break;
    }
    // Giliran agennya berhenti di tengah jalan, bukan selesai. Bedanya penting:
    // yang selesai tidak perlu diapa-apakan, yang ini biasanya perlu diulang.
    case 'stop-gagal': {
      a.busyUntil = 0;
      a.adaTugas = false;
      a.doing = 'berhenti: ' + (ev.label || 'galat');
      a.fx = null;
      a.say('berhenti — <b>' + esc(ev.label || 'galat') + '</b>', 'err');
      pushLog(ev, 'err', ['giliran berhenti', ev.label || '']);
      kabarMasuk(ev, a, 'galat');
      nowDoing.textContent = 'berhenti: ' + (ev.label || 'galat');
      blip(180, 0.12);
      break;
    }
    case 'compact': {
      a.say('merapikan catatan (<b>' + esc(ev.label || '') + '</b>)', 'say');
      pushLog(ev, 'mark', ['merapikan catatan', ev.label || '']);
      break;
    }
    case 'compact-selesai': {
      pushLog(ev, 'mark', ['catatan sudah rapi', ev.label || '']);
      break;
    }
    case 'session-start': {
      a.say('siap, ndan 🫡');
      pushLog(ev, 'mark', ['masuk kantor', ev.cwd || '']);
      break;
    }
    case 'nama': {
      if (ev.nama) namaPanggilan.set(ev.session, ev.nama);
      else namaPanggilan.delete(ev.session);
      break;
    }
    // jabatannya sudah dipasang di atas switch; case ini cuma menahan supaya
    // tidak jatuh ke default dan menulis baris log "bekerja" yang kosong
    case 'peran': break;
    case 'tugas-mulai': {
      namaPanggilan.set(ev.session, ev.nama || 'tugas');
      pushLog(ev, 'mark', ['tugas baru dikirim', ev.nama || '']);
      break;
    }
    // Prosesnya lahir tapi sesinya tidak pernah mulai: kegagalan paling
    // membingungkan, karena tidak ada error apa pun yang muncul sendiri.
    case 'tugas-bisu': {
      a.say('tugasnya belum jalan', 'err');
      pushLog(ev, 'err', ['tugas belum memberi kabar', ev.label || '']);
      nowDoing.textContent = 'tugas belum memberi kabar — cek log';
      break;
    }
    case 'tugas-selesai': {
      // Disimpan di orangnya, bukan cuma lewat di log: kartu yang dibuka
      // belakangan harus tetap bisa menjawab "sesi ini habis berapa".
      if (ev.biaya) a.biaya = ev.biaya;
      const ket = ev.biaya ? (ev.label || '') + ' · ' + formatBiaya(ev.biaya) : (ev.label || '');
      pushLog(ev, ev.ok ? 'mark' : 'err', [ev.ok ? 'tugas selesai' : 'tugas gagal', ket]);
      if (!ev.ok) nowDoing.textContent = 'tugas gagal — cek panel';
      break;
    }
    default:
      pushLog(ev);
  }
  renderCrew();
  if (terpilih) perbaruiKartu();
}


/* ---------------------------------------------------------- kendali web --- */
/* Halaman boleh menugaskan pekerjaan ke Claude Code, memberi nama pegawainya,
   dan menghentikan tugas. Token diambil sekali lewat GET same-origin; situs
   lain boleh mem-POST tapi tidak boleh MEMBACA balasan lintas-asal, jadi
   tokennya tidak bisa mereka pungut. */
const namaPanggilan = new Map();     // sesi 12-char -> nama yang kamu berikan
let kendali = { izin: false, token: null };

const elKendaliMati = document.getElementById('kendaliMati');
const elForm = document.getElementById('formTugas');
const elNama = document.getElementById('tugasNama');
const elPrompt = document.getElementById('tugasPrompt');
const elCwd = document.getElementById('tugasCwd');
const elPeran = document.getElementById('tugasPeran');
const elModel = document.getElementById('tugasModel');
const elKirim = document.getElementById('tugasKirim');
const elPesan = document.getElementById('tugasPesan');
const elBukaFolder = document.getElementById('bukaFolder');

function pesan(teks, jenis) {
  elPesan.className = 'kendali-pesan' + (jenis ? ' ' + jenis : '');
  elPesan.textContent = teks;
}

async function muatKendali() {
  try {
    const d = await (await fetch('/kendali')).json();
    kendali = d;
    for (const j of d.berjalan || []) {
      namaPanggilan.set(j.sesi, j.nama);
      if (j.peran) peranAwal.set(j.sesi, j.peran);
    }
    if (d.izin && d.siap) {
      elKendaliMati.hidden = true;
      elForm.hidden = false;
      elCwd.value = d.cwdBawaan || '';
      statusKredensial(d);
    } else {
      elKendaliMati.innerHTML = d.izin
        ? 'Kendali web nyala, tapi ' + esc(d.alasan)
        : 'Menugaskan pekerjaan &amp; menelusuri folder butuh kendali web. '
          + 'Hentikan server lalu jalankan ulang dengan:'
          + '<code>node agent-room/server.mjs --izinkan-perintah</code>';
    }
  } catch (_) {
    elKendaliMati.textContent = 'server tidak menjawab';
  }
}

if (elForm) {
  // pilihan jabatannya diisi dari tabel yang sama dengan yang dipakai ruangan
  elPeran.innerHTML = opsiJabatan();
  elPeran.value = 'pranata_muda';
  elModel.innerHTML = opsiModel();
  elModel.value = '';                 // bawaan: jangan memaksakan model apa pun
  elForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = elPrompt.value.trim();
    if (!prompt) { pesan('tugasnya masih kosong', 'err'); return; }
    elKirim.disabled = true;
    pesan('mengirim…');
    try {
      const res = await fetch('/perintah', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: kendali.token, prompt,
          nama: elNama.value.trim(), cwd: elCwd.value.trim(),
          peran: elPeran.value,
          model: elModel.value,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        pesan('pegawai baru dipanggil — tunggu dia masuk ruangan', 'ok');
        elPrompt.value = '';
      } else {
        pesan(d.pesan || 'gagal', 'err');
      }
    } catch (err) {
      pesan('gagal menghubungi server: ' + err.message, 'err');
    }
    elKirim.disabled = false;
  });
}

async function beriNama(sesi) {
  const kini = namaPanggilan.get(sesi) || '';
  const baru = window.prompt('Nama untuk pegawai ' + sesi + ':', kini);
  if (baru === null) return;
  namaPanggilan.set(sesi, baru.trim());
  renderCrew();
  try {
    await fetch('/nama', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sesi, nama: baru.trim() }),
    });
  } catch (_) { /* nama tetap tampil lokal walau server tidak menjawab */ }
}

/* ------------------------------------------------------ token headless ----
   Sesi yang dilahirkan halaman ini butuh kredensial sendiri. Boleh ditempel di
   sini supaya tidak perlu mengatur env di terminal. Yang perlu kamu tahu: nilai
   tokennya cuma berjalan satu arah — halaman mengirim, server menyimpan di
   memori, dan tidak ada endpoint yang bisa membacanya kembali. Yang bisa dibaca
   halaman hanya ADA atau TIDAK. */
const elToken = document.getElementById('tokenNilai');
const elTokenSimpan = document.getElementById('tokenSimpan');
const elTokenHapus = document.getElementById('tokenHapus');
const elTokenStatus = document.getElementById('tokenStatus');
const elTokenIngat = document.getElementById('tokenIngat');

function statusKredensial(d) {
  if (!elTokenStatus) return;
  const punya = Boolean(d && d.punyaKredensial);
  elTokenStatus.className = 'kredensial-status' + (punya ? ' ok' : '');
  const tempat = d && d.kredensialBerkas
    ? 'diingat di berkas' : 'di memori server saja';
  elTokenStatus.textContent = punya
    ? 'tersimpan · ' + tempat + ' · dikirim sebagai ' + (d.kredensialEnv || 'env')
    : 'belum ada — sesi baru memakai kredensial bawaan mesin';
}

async function kirimKredensial(nilai) {
  if (!kendali.token) { statusKredensial(null); return; }
  elTokenStatus.className = 'kredensial-status';
  elTokenStatus.textContent = 'mengirim…';
  try {
    const res = await fetch('/kredensial', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: kendali.token, nilai,
        simpan: elTokenIngat ? elTokenIngat.checked : false,
      }),
    });
    const d = await res.json();
    if (!d.ok) {
      elTokenStatus.className = 'kredensial-status err';
      elTokenStatus.textContent = d.pesan || 'gagal';
      return;
    }
    // Kosongkan kolomnya begitu tersimpan: tidak ada gunanya nilai itu tetap
    // menganggur di DOM setelah server memegangnya.
    elToken.value = '';
    statusKredensial({
      punyaKredensial: d.punya, kredensialEnv: d.envKey, kredensialBerkas: d.berkas,
    });
    // gagal menulis berkas bukan gagal total: tokennya tetap dipakai sesi baru
    if (d.pesan) {
      elTokenStatus.className = 'kredensial-status err';
      elTokenStatus.textContent = d.pesan;
    }
  } catch (err) {
    elTokenStatus.className = 'kredensial-status err';
    elTokenStatus.textContent = 'gagal menghubungi server: ' + err.message;
  }
}

if (elTokenSimpan) {
  elTokenSimpan.onclick = () => {
    const nilai = elToken.value.trim();
    if (!nilai) { elTokenStatus.className = 'kredensial-status err';
                  elTokenStatus.textContent = 'kolomnya masih kosong'; return; }
    kirimKredensial(nilai);
  };
  elTokenHapus.onclick = () => { elToken.value = ''; kirimKredensial(''); };
  elToken.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); elTokenSimpan.click(); }
  });
}

async function hentikanTugas(sesi) {
  if (!kendali.token) return;
  try {
    await fetch('/perintah/hentikan', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: kendali.token, sesi }),
    });
    pesan('perintah berhenti dikirim ke ' + sesi, 'ok');
  } catch (err) {
    pesan('gagal menghentikan: ' + err.message, 'err');
  }
}



/* ------------------------------------------------- pemilih folder (dialog) --
   Browser tidak boleh memberi path absolut lewat <input type="file"> maupun
   showDirectoryPicker(), padahal `claude -p` butuh path absolut untuk cwd.
   Jadi daftarnya diambil dari server, dan tampilannya dibuat sebagai dialog
   penuh — bukan disempilkan di kolom panel yang cuma selebar 290px. */
const dlg = {
  latar: document.getElementById('dlgFolder'),
  remah: document.getElementById('dlgRemah'),
  sisi: document.getElementById('dlgSisi'),
  saring: document.getElementById('dlgSaring'),
  daftar: document.getElementById('dlgDaftar'),
  jalur: document.getElementById('dlgJalur'),
  tutup: document.getElementById('dlgTutup'),
  batal: document.getElementById('dlgBatal'),
  pakai: document.getElementById('dlgPakai'),
};
let dlgIsi = [];        // subfolder pada jalur sekarang
let dlgPilih = -1;      // indeks yang sedang disorot
let dlgInfo = {};       // home, awal, windows, pemisah

function dlgKabar(teks, jenis) {
  dlg.daftar.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'dlg-kabar' + (jenis ? ' ' + jenis : '');
  d.textContent = teks;
  dlg.daftar.appendChild(d);
}

function dlgGambarRemah(jalur) {
  dlg.remah.innerHTML = '';
  const sep = dlgInfo.pemisah || '/';
  const bagian = jalur.split(/[\\/]/).filter(Boolean);
  // Windows: potongan pertama itu "I:" yang perlu diberi pemisah lagi
  let jalan = '';
  bagian.forEach((nama, i) => {
    jalan = i === 0
      ? (/^[a-zA-Z]:$/.test(nama) ? nama + sep : sep + nama)
      : jalan + (jalan.endsWith(sep) ? '' : sep) + nama;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = nama;
    const tuju = jalan;
    b.onclick = () => dlgBuka(tuju);
    if (i) { const s = document.createElement('span'); s.textContent = '›'; dlg.remah.appendChild(s); }
    dlg.remah.appendChild(b);
  });
}

function dlgGambarDaftar() {
  const q = dlg.saring.value.trim().toLowerCase();
  const tampil = q ? dlgIsi.filter((f) => f.nama.toLowerCase().includes(q)) : dlgIsi;
  dlg.daftar.innerHTML = '';
  if (!tampil.length) {
    dlgKabar(q ? 'tidak ada yang cocok' : 'tidak ada subfolder di sini');
    return;
  }
  tampil.forEach((f, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dlg-item' + (i === dlgPilih ? ' pilih' : '');
    b.textContent = f.nama;
    b.title = f.path;
    b.onclick = () => { dlgPilih = i; dlg.jalur.value = f.path; dlgGambarDaftar(); };
    b.ondblclick = () => dlgBuka(f.path);
    dlg.daftar.appendChild(b);
  });
  const aktif = dlg.daftar.querySelector('.pilih');
  if (aktif) aktif.scrollIntoView({ block: 'nearest' });
}

function dlgGambarSisi() {
  dlg.sisi.innerHTML = '';
  const grup = (judul, isi) => {
    const j = document.createElement('div');
    j.className = 'judul'; j.textContent = judul;
    dlg.sisi.appendChild(j);
    for (const [label, tuju] of isi) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.title = tuju;
      b.onclick = () => dlgBuka(tuju);
      dlg.sisi.appendChild(b);
    }
  };
  grup('pintasan', [
    ['🏠 Home', dlgInfo.home || ''],
    ['📌 Folder server', dlgInfo.awal || ''],
  ].filter((x) => x[1]));
  if (dlgInfo.windows && dlgInfo.drives) {
    grup('drive', dlgInfo.drives.map((d) => [d, d]));
  }
}

async function dlgBuka(p) {
  dlgKabar('memuat…');
  try {
    const q = new URLSearchParams({ token: kendali.token || '' });
    if (p) q.set('path', p);
    const d = await (await fetch('/folder?' + q)).json();
    if (!d.ok) { dlgKabar(d.pesan || 'gagal membuka folder', 'err'); return; }
    dlgInfo = Object.assign(dlgInfo, {
      home: d.home, awal: d.awal, windows: d.windows, pemisah: d.pemisah,
    });
    dlgIsi = d.isi;
    dlgPilih = -1;
    dlg.jalur.value = d.path;
    dlgGambarRemah(d.path);
    dlgGambarSisi();
    dlg.saring.value = '';
    dlgGambarDaftar();
    if (d.catatan) {
      const n = document.createElement('div');
      n.className = 'dlg-kabar'; n.textContent = d.catatan;
      dlg.daftar.appendChild(n);
    }
  } catch (err) {
    dlgKabar('gagal menghubungi server: ' + err.message, 'err');
  }
}

async function dlgMuatDrive() {
  try {
    const q = new URLSearchParams({ token: kendali.token || '', drive: '1' });
    const d = await (await fetch('/folder?' + q)).json();
    dlgInfo.drives = d.drives || [];
  } catch (_) { dlgInfo.drives = []; }
}

function dlgTutupDialog() {
  dlg.latar.hidden = true;
  document.removeEventListener('keydown', dlgTombol);
}

function dlgTerapkan() {
  const v = dlg.jalur.value.trim();
  if (v) { elCwd.value = v; pesan('folder kerja: ' + v, 'ok'); }
  dlgTutupDialog();
}

function dlgTombol(e) {
  if (e.key === 'Escape') { e.preventDefault(); dlgTutupDialog(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    // Enter di kolom path = pindah ke sana; di daftar = pakai yang disorot
    if (document.activeElement === dlg.jalur) dlgBuka(dlg.jalur.value.trim());
    else dlgTerapkan();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const q = dlg.saring.value.trim().toLowerCase();
    const n = (q ? dlgIsi.filter((f) => f.nama.toLowerCase().includes(q)) : dlgIsi).length;
    if (!n) return;
    e.preventDefault();
    dlgPilih = e.key === 'ArrowDown'
      ? Math.min(n - 1, dlgPilih + 1)
      : Math.max(0, dlgPilih - 1);
    const q2 = dlg.saring.value.trim().toLowerCase();
    const list = q2 ? dlgIsi.filter((f) => f.nama.toLowerCase().includes(q2)) : dlgIsi;
    dlg.jalur.value = list[dlgPilih].path;
    dlgGambarDaftar();
  }
}

if (elBukaFolder) {
  elBukaFolder.onclick = async () => {
    dlg.latar.hidden = false;
    document.addEventListener('keydown', dlgTombol);
    dlg.saring.focus();
    await dlgMuatDrive();
    dlgBuka(elCwd.value.trim() || undefined);
  };
  dlg.saring.oninput = () => { dlgPilih = -1; dlgGambarDaftar(); };
  dlg.tutup.onclick = dlgTutupDialog;
  dlg.batal.onclick = dlgTutupDialog;
  dlg.pakai.onclick = dlgTerapkan;
  dlg.latar.onclick = (e) => { if (e.target === dlg.latar) dlgTutupDialog(); };
}

muatKendali();

/* ============================================================ pikiran & kabar
   Dua hal yang selama ini tidak pernah kelihatan di ruangan: apa yang sedang
   DIPIKIRKAN agen, dan apa yang sebenarnya DIA KATAKAN. Hook tidak pernah
   membawa keduanya; yang membawanya transkrip sesi (lihat server.mjs).

   Tempatnya sengaja dibedakan:

   - pikiran  -> balon awan di atas kepala. Hilang sendiri, tidak menahan
                 siapa pun, tidak masuk log.
   - kalimat  -> kotak kabar. Yang menutup giliran atau menahan sesi memunculkan
                 modal sendiri; sisanya menumpuk dengan lencana angka di bilah
                 bawah, tinggal dibuka kalau memang mau dibaca.

   Alasannya satu: modal yang muncul tiap agen berdehem bukan alat pantau,
   tapi gangguan. Yang berhak menyela cuma dua — hasil akhir, dan sesi yang
   berhenti menunggu kamu.                                                   */

/* localStorage bisa melempar (mode privat, site data diblokir), dan halaman ini
   tidak boleh mati cuma gara-gara tidak boleh mengingat setelan tombol. */
const ingatan = {
  baca(k, b) { try { const v = localStorage.getItem(k); return v == null ? b : v; } catch { return b; } },
  tulis(k, v) { try { localStorage.setItem(k, v); } catch { /* tidak diingat, ya sudah */ } },
};

const PIKIR_GANTI = 3200;      // ms per penggal kalimat di balon pikiran
const PIKIR_UMUR = 11000;      // ms maksimum satu balon pikiran bertahan
const TINGGI_UCAP = 27;        // tinggi balon ucap dalam px CSS, untuk menumpuk
const TITIK = '<span class="titik"><i></i><i></i><i></i></span>';

let balonPikir = ingatan.baca('balonPikir', '1') !== '0';

const satuBaris = (t, n) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

/* Pikiran dipecah per kalimat, lalu kalimat pendek digabung sampai sepanjang
   satu balon. Yang dipotong paksa cuma kalimat yang memang kepanjangan. */
function penggalPikir(teks) {
  const bersih = String(teks).replace(/\s+/g, ' ').trim();
  const kalimat = bersih.match(/[^.!?…]+[.!?…]*/g) || [bersih];
  const keluar = [];
  let buf = '';
  for (const k of kalimat) {
    const calon = (buf ? buf + ' ' : '') + k.trim();
    if (calon.length > 128 && buf) { keluar.push(buf); buf = k.trim(); }
    else buf = calon;
    while (buf.length > 150) { keluar.push(buf.slice(0, 149) + '…'); buf = buf.slice(149).trim(); }
    if (keluar.length >= 4) break;
  }
  if (buf && keluar.length < 4) keluar.push(buf);
  return keluar.slice(0, 4);
}

/* ---------------------------------------------------------- kotak kabar --- */
const KABAR_MAX = 60;

/* `auto` = boleh menyela. Cuma yang menutup giliran dan yang menahan sesinya
   yang dapat hak itu; catatan di tengah jalan tidak. */
const KABAR_JENIS = {
  hasil:   { tajuk: 'hasil kerja',        cls: 'hasil',  auto: true },
  lapor:   { tajuk: 'catatan',            cls: 'lapor',  auto: false },
  tanya:   { tajuk: 'butuh jawaban',      cls: 'tunggu', auto: true },
  izin:    { tajuk: 'minta izin',         cls: 'tunggu', auto: true },
  rencana: { tajuk: 'mengajukan rencana', cls: 'tunggu', auto: true },
  galat:   { tajuk: 'berhenti',           cls: 'galat',  auto: true },
};

const kabar = [];
let kabarIdx = -1;
let kabarBaru = 0;
let kabarOtomatis = ingatan.baca('kabarOtomatis', '1') !== '0';

const kbr = {
  latar: document.getElementById('dlgKabar'),
  chip: document.getElementById('kabarChip'),
  judul: document.getElementById('kabarJudul'),
  jenis: document.getElementById('kabarJenis'),
  jam: document.getElementById('kabarJam'),
  badan: document.getElementById('kabarBadan'),
  hitung: document.getElementById('kabarHitung'),
  sebelum: document.getElementById('kabarSebelum'),
  lanjut: document.getElementById('kabarLanjut'),
  tutup: document.getElementById('kabarTutup'),
  auto: document.getElementById('kabarAuto'),
  tombol: document.getElementById('kabarBtn'),
  lencana: document.getElementById('kabarLencana'),
  pikirBtn: document.getElementById('pikirBtn'),
};

function kabarMasuk(ev, a, jenis) {
  const def = KABAR_JENIS[jenis] || KABAR_JENIS.lapor;
  const j = jabatanDari(a.peran);
  kabar.push({
    ts: ev.ts || Date.now(),
    sesi: ev.session || '',
    nama: namaKru(a),
    jab: j.singkat,
    warna: j.pal.main,
    jenis, tajuk: def.tajuk, cls: def.cls,
    teks: ev.teks || ev.alasan || ev.label || '',
    tanya: ev.tanya || null,
    tool: ev.tool || '',
  });
  while (kabar.length > KABAR_MAX) { kabar.shift(); if (kabarIdx > 0) kabarIdx--; }
  kabarBaru++;
  kabarLencana();
  /* Yang boleh menyela cuma kabar yang BARU. Waktu halaman dibuka ulang, server
     mengirim ulang 60 event terakhir supaya ruangannya terisi lagi — tanpa
     saringan ini, sekadar menekan F5 memunculkan modal berisi kabar setengah
     jam lalu. Yang lama tetap masuk kotak, cuma tidak menodong. */
  const segar = Date.now() - (ev.ts || 0) < 20000;
  if (def.auto && kabarOtomatis && segar) { kabarBuka(kabar.length - 1); return; }
  if (kbr.latar.hidden) return;
  // yang sedang membaca kabar terakhir ikut dibawa maju; yang lagi menengok ke
  // belakang tidak diseret pergi dari yang sedang dibacanya
  if (kabarIdx >= kabar.length - 2) kabarBuka(kabar.length - 1);
  else kabarGambar();
}

function kabarBuka(i) {
  if (!kabar.length) return;
  kabarIdx = Math.max(0, Math.min(kabar.length - 1, i));
  const pertama = kbr.latar.hidden;
  kbr.latar.hidden = false;
  if (pertama) document.addEventListener('keydown', kabarTombol);
  kabarBaru = 0;
  kabarLencana();
  kabarGambar();
}

function kabarTutupDialog() {
  kbr.latar.hidden = true;
  document.removeEventListener('keydown', kabarTombol);
}

function kabarGambar() {
  const k = kabar[kabarIdx];
  if (!k) return;
  kbr.chip.style.background = k.warna;
  kbr.judul.textContent = k.nama;
  kbr.jenis.textContent = k.tajuk;
  kbr.jenis.className = 'kbr-jenis ' + k.cls;
  kbr.jam.textContent = jam(k.ts);
  kbr.badan.innerHTML = kabarIsi(k);
  kbr.badan.scrollTop = 0;
  kbr.hitung.textContent = (kabarIdx + 1) + ' / ' + kabar.length;
  kbr.sebelum.disabled = kabarIdx <= 0;
  kbr.lanjut.disabled = kabarIdx >= kabar.length - 1;
}

function kabarIsi(k) {
  const b = ['<div class="kbr-asal">' + esc(k.jab)
    + (k.tool ? ' · ' + esc(k.tool) : '')
    + (k.sesi ? ' · sesi <code>' + esc(k.sesi) + '</code>' : '') + '</div>'];
  if (k.tanya && k.tanya.jenis === 'tanya') {
    for (const q of k.tanya.daftar || []) {
      if (q.tanya) b.push('<p class="kbr-tanya">' + esc(q.tanya) + '</p>');
      if (q.opsi && q.opsi.length) {
        b.push('<ul class="kbr-opsi">' + q.opsi.map((o) => '<li>' + esc(o) + '</li>').join('') + '</ul>');
      }
    }
  } else if (k.tanya && k.tanya.jenis === 'rencana') {
    b.push('<div class="kbr-teks">' + esc(k.tanya.teks || k.teks) + '</div>');
  } else {
    b.push('<div class="kbr-teks">' + esc(k.teks) + '</div>');
  }
  // Halaman ini menonton, tidak menjawab. Menyembunyikan itu bikin orang
  // menunggu tombol yang memang tidak akan pernah ada.
  if (k.cls === 'tunggu') {
    b.push('<p class="kbr-nota">Sesinya berhenti di sini sampai dijawab, dan '
      + 'jawabannya di tempat sesi itu jalan — terminal atau aplikasi Claude, '
      + 'bukan di halaman ini.</p>');
  }
  return b.join('');
}

function kabarLencana() {
  kbr.lencana.textContent = kabarBaru > 99 ? '99+' : String(kabarBaru);
  kbr.lencana.hidden = kabarBaru === 0;
  kbr.tombol.classList.toggle('ada', kabarBaru > 0);
}

function kabarTombol(e) {
  if (e.key === 'Escape') { e.preventDefault(); kabarTutupDialog(); return; }
  if (e.key === 'ArrowLeft' && kabarIdx > 0) { e.preventDefault(); kabarBuka(kabarIdx - 1); }
  if (e.key === 'ArrowRight' && kabarIdx < kabar.length - 1) { e.preventDefault(); kabarBuka(kabarIdx + 1); }
}

kbr.tombol.onclick = () => {
  if (!kbr.latar.hidden) { kabarTutupDialog(); return; }
  if (!kabar.length) { kbr.tombol.classList.add('kosong'); setTimeout(() => kbr.tombol.classList.remove('kosong'), 500); return; }
  kabarBuka(kabar.length - 1);
};
kbr.tutup.onclick = kabarTutupDialog;
kbr.sebelum.onclick = () => kabarBuka(kabarIdx - 1);
kbr.lanjut.onclick = () => kabarBuka(kabarIdx + 1);
kbr.latar.onclick = (e) => { if (e.target === kbr.latar) kabarTutupDialog(); };
kbr.auto.checked = kabarOtomatis;
kbr.auto.onchange = () => {
  kabarOtomatis = kbr.auto.checked;
  ingatan.tulis('kabarOtomatis', kabarOtomatis ? '1' : '0');
};

kbr.pikirBtn.classList.toggle('mati', !balonPikir);
kbr.pikirBtn.title = balonPikir ? 'balon pikiran: nyala' : 'balon pikiran: mati';
kbr.pikirBtn.onclick = () => {
  balonPikir = !balonPikir;
  ingatan.tulis('balonPikir', balonPikir ? '1' : '0');
  kbr.pikirBtn.classList.toggle('mati', !balonPikir);
  kbr.pikirBtn.title = balonPikir ? 'balon pikiran: nyala' : 'balon pikiran: mati';
  // yang terlanjur menggantung ikut dipadamkan saat itu juga
  if (!balonPikir) for (const a of penghuni()) { a.pikirUntil = 0; a.elPikir.style.display = 'none'; }
};
kabarLencana();

/* ------------------------------------------------------------------ stream */
const params = new URLSearchParams(location.search);
if (params.get('demo') === '1') {
  connDot.classList.add('on');
  connText.textContent = 'mode demo';
  const TOOLS = ['Read', 'Grep', 'Edit', 'Bash', 'Bash', 'WebFetch', 'Task', 'Write', 'Glob', 'TodoWrite'];
  const LABELS = ['server.mjs', 'room.js', 'style.css', 'package.json', 'TODO', 'anthropic.com'];
  // perintah shell dipisah, separuhnya git, biar rak servernya ikut kepakai
  const PERINTAH = ['npm run build', 'node install.mjs', 'rtk git status',
                    'git commit -m "rak server"', 'git push origin main', 'git pull --rebase'];
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  let n = 0;
  const tick = () => {
    const tool = pick(TOOLS);
    const session = Math.random() < 0.25 ? 'demo-b' : 'demo-a';
    const label = tool === 'Bash' ? pick(PERINTAH) : pick(LABELS);
    handle({ id: ++n, ts: Date.now(), kind: 'pre', session, tool, label, ok: true, cwd: 'proyek-demo' });
    setTimeout(() => handle({ id: ++n, ts: Date.now(), kind: 'post', session, tool, label: '', ok: Math.random() > 0.12 }), 900);
    setTimeout(tick, 1400 + Math.random() * 2200);
  };
  setTimeout(() => handle({ id: 0, ts: Date.now(), kind: 'prompt', session: 'demo-a', label: 'bikin visualisasi agent yang lagi kerja', ok: true }), 400);
  setTimeout(tick, 1800);
  // isi kepala + isi mulut, supaya balon pikiran dan kotak kabar ikut kelihatan
  const PIKIRAN = [
    'Sebelum menyentuh room.js, saya cek dulu bentuk event-nya di server. Kalau kind-nya belum ada di sana, halaman tidak akan pernah menerima apa-apa.',
    'Dua kemungkinan: hook-nya memang tidak terpasang, atau terpasang tapi port-nya beda. Yang kedua lebih gampang dibuktikan — tinggal lihat balasan /riwayat.',
    'Ini kelihatannya cuma soal urutan. Balonnya digambar sebelum posisinya diperbarui, jadi satu frame pertama selalu meleset.',
  ];
  const UCAPAN = [
    'Saya cek dulu isi server.mjs biar tahu event mana yang sudah ada sebelum menambah yang baru.',
    'Ketemu: label-nya kosong karena describe() jatuh ke cabang default. Saya tambahkan case-nya.',
  ];
  let pk = 0;
  const tickPikir = () => {
    handle({ id: 800 + pk, ts: Date.now(), kind: 'pikir', session: Math.random() < 0.3 ? 'demo-b' : 'demo-a',
             teks: PIKIRAN[pk % PIKIRAN.length], ok: true });
    pk++;
    setTimeout(tickPikir, 7000 + Math.random() * 5000);
  };
  setTimeout(tickPikir, 2600);
  setTimeout(() => handle({ id: 880, ts: Date.now(), kind: 'ucap', session: 'demo-a', teks: UCAPAN[0], ok: true }), 9000);
  setTimeout(() => handle({ id: 881, ts: Date.now(), kind: 'ucap', session: 'demo-a', akhir: true, ok: true,
    teks: 'Beres. Tiga hal yang berubah:\n\n1. server.mjs mengikuti berkas transkrip tiap sesi, jadi isi pikiran dan kalimat agen ikut disiarkan.\n2. room.js menggambar balon pikiran di atas kepala pegawainya.\n3. Kalimat yang menutup giliran memunculkan modal ini.\n\nSesi terminal maupun sesi yang dilahirkan halaman ini sama-sama kebaca.' }), 21000);
  setTimeout(() => handle({ id: 882, ts: Date.now(), kind: 'pre', session: 'demo-b', tool: 'AskUserQuestion', ok: true,
    label: 'Port', butuh: { sebab: 'tanya', alasan: '', label: 'Port' },
    tanya: { jenis: 'tanya', daftar: [{ tanya: 'Server ruangannya mau dijalankan di port berapa?',
                                        opsi: ['4517 (bawaan)', '4600', 'ikut AGENT_ROOM_PORT'] }] } }), 33000);
  // satu workflow tiga fase, biar meja rapatnya kelihatan terisi di mode demo
  const wf = { kind: 'pre', session: 'demo-a', tool: 'Workflow', label: 'rancang-ruang',
               peserta: ['Rancang', 'Kritik', 'Padu'], ok: true, cwd: 'proyek-demo' };
  setTimeout(() => handle({ ...wf, id: 900, ts: Date.now() }), 5200);
  setTimeout(() => handle({ ...wf, id: 901, ts: Date.now(), kind: 'post' }), 26000);
} else {
  const es = new EventSource('/stream');
  es.onopen = () => { connDot.classList.add('on'); connText.textContent = 'tersambung'; };
  es.onerror = () => { connDot.classList.remove('on'); connText.textContent = 'putus — mencoba lagi…'; };
  es.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch (_) {} };
}

/* ==================================================================== event
   Kejadian yang muncul SENDIRI — bukan dipicu tool call. Tool call sudah punya
   jalurnya: pegawai berjalan ke stasiun. Yang di bawah mengisi sisanya, yaitu
   apa yang terjadi di ruangan waktu tidak ada yang menyuruh.

   Polanya sebenarnya sudah ada di file ini sejak awal: `dripT` di frame() —
   penghitung waktu, ambang, spawn(). Ini generalisasi dari situ.

   Tiga aturan yang tidak boleh dilanggar, karena halaman ini pertama-tama
   alat pantau sesi Claude Code dan baru kedua sebuah ruangan:

   1. Event TIDAK PERNAH menarik pegawai yang sedang bekerja. Yang boleh
      dipinjam cuma yang benar-benar menganggur, dan begitu tool call datang
      untuk sesi itu, tool call yang menang — pemainnya dilepas saat itu juga.
   2. Event tidak masuk log kegiatan dan tidak menaikkan angka statistik.
      Panel kanan itu laporan sesi, bukan laporan suasana.
   3. Semuanya bisa dimatikan: `?event=0`. Dan `?event=<id>` memaksa satu event
      jalan berulang — tanpa itu event langka mustahil diuji.

   Definisi eventnya sendiri ada di public/event-acak.js, bukan di sini. */

const EVENT_PARAM = new URLSearchParams(location.search).get('event');
const EVENT_MATI = EVENT_PARAM === '0' || EVENT_PARAM === 'mati';
const EVENT_PAKSA = EVENT_PARAM && !EVENT_MATI ? EVENT_PARAM.split(',') : null;

const JEDA_MIN = 18, JEDA_MAX = 45;   // detik antar percobaan menyalakan event

const EVENT_ACAK = [];
const eventById = new Map();

/* Dipanggil dari event-acak.js. Kembar dijaga di sini: dua definisi ber-id
   sama bikin cooldown saling menimpa dan salah satunya tidak pernah jalan. */
function daftarEvent(...defs) {
  for (const d of defs) {
    if (eventById.has(d.id)) { console.warn('[event] id kembar, dilewati:', d.id); continue; }
    eventById.set(d.id, d);
    EVENT_ACAK.push(d);
  }
}

/* Pengali sesaat yang dibaca fungsi gambar yang sudah ada. Dikembalikan ke
   nilai bawaan tiap frame, jadi event cukup memasangnya di tick() dan tidak
   perlu membereskannya sendiri waktu selesai. */
const MOD = {
  lampu: 1,          // pengali intensitas neon
  neonMati: [0, 0],  // 0..1 per tabung (kiri 170, kanan 410); 1 = padam
  kipas: 1,          // pengali kecepatan baling kipas berdiri
  layar: 1,          // pengali kecepatan animasi layar laptop
  layarPucat: 0,     // 0..1, layar laptop menuju mode tidur
  layarPutih: 0,     // 0..1, semua layar diputihkan (kedip serempak)
  upsSiaga: 0,       // 0..1, strip UPS berkedip merah
  switchBadai: 0,    // 0..1, semua LED switch kedip serempak
  drip: 2.6,         // detik antar tetesan AC
  senyapDari: 0,     // rentang x tempat bunyi langkah dimatikan
  senyapSampai: 0,
  pintuKadis: false, // paksa pintu ruang kadis tergambar terbuka
  // suasana — dibaca ambien(), jadi menyentuh SEMUA yang menggambar ruangan
  ambPlus: 0,        // tambahan alpha selubung
  sinar: 1,          // pengali berkas cahaya jendela
  luar: 1,           // pengali terang dunia luar
  lampuMin: 0,       // lantai bawah intensitas neon (mendung siang bolong)
  vignette: 0.3,     // gelap tepi kanvas
  hening: false,     // partikel kerja berhenti, neon tidak berkedip
  lemot: 0,          // 0..1, laju partikel kerja dikurangi
  // prop yang sudah ada
  jamSorot: 0,       // jarum jam disorot
  jamDetak: false,   // jarum detik melompat per detik, bukan meluncur
  printerMacet: false,
  lanPutus: false,
  kacaBuram: 0,      // 0..1 kabut di kaca jendela
  laciKosong: 0,     // berapa laci filing digambar terbuka dan kosong
  kipasGoyang: 0,    // amplitudo oleng, px
  kipasGetar: 0,     // getar motor macet, px
  kipasSapu: 0,      // amplitudo menoleh (7 detik/putaran), px
  mejaGetar: -1,     // indeks meja kerja yang bergoyang
  mejaPadam: -1,     // indeks meja kerja yang laptopnya mati
  // gelombang 2
  getar: 0,          // px, seluruh kanvas digeser naik-turun (genset, gempa kecil)
  acMati: false,
  internetMati: false,
  jamGetar: false,   // baterai sekarat: jarum detik gemetar sebelum diam
  gordenLepas: false,
  wifiLemahSlot: -1, // indeks meja kerja yang sinyalnya hilang
};
const MOD_AWAL = { ...MOD, neonMati: [0, 0] };
function resetMod() {
  Object.assign(MOD, MOD_AWAL);
  MOD.neonMati = [0, 0];
}

/* Bekas yang SENGAJA hidup lebih lama dari eventnya. Ruangan yang menyimpan
   jejak kejadian kemarin terasa dihuni; ruangan yang selalu kembali bersih
   terasa seperti demo. Tidak pernah direset. */
const RUANGAN = {
  mapDisposisi: 0,        // tumpukan map di meja stempel, 0..5
  tumpukanFiling: 0,      // map menumpuk di atas filing kabinet, 0..6
  laciBuka: 0,            // sisa detik laci kabinet tertarik keluar
  bantalanKering: false,
  hentakStempel: 0,
  nodaMeja: [],           // noda tinta permanen di meja stempel
  bekasStempel: [],       // cap basah yang sedang mengering
  coretKertas: 0,         // goresan pulpen macet di sudut kertas, 0..3
  kartuAPAR: false,       // kartu inspeksi tergantung di APAR
  aparAngkat: 0,
  labelPatch: 0,          // label yang sudah tertempel di patch panel, 0..10
  kabelRapi: false,
  catMengelupas: 0,       // 0..1, bercak cat di dinding
  tanamanLayu: 0,         // 0..1
  tongPenuh: 0,           // 0..1
  gelasDispenser: 6,      // sisa gelas kertas
  gelasMenumpuk: 0,       // gelas kopi menumpuk di meja yang paling lama dihuni
  fotoMiring: 0,          // sudut foto pejabat kanan, radian
  kalenderBulan: 0,       // indeks warna kepala kalender
  kertasLantai: [],       // lembaran yang jatuh dan belum dipungut
  bulanKalenderTanggal: new Date().getDate(),
  // gelombang 2
  emberIsi: 0,            // 0..90, dihitung dari tetesan yang mendarat
  emberDiangkat: false,
  nodaPlafon: [],          // {x,y} bercak rembes air, permanen
  lakban: 0,               // 0..8, kabel lantai yang sudah dilakban
  retakExtra: [],          // {gx,gy} retakan tambahan, maks 6, permanen
  toner: 1,                // 0..1, sisa toner printer
  kabinetSlot: -1,         // meja kerja yang laptopnya digotong ke pojok (wifi lemah)
  // Baterai jam habis: sudutnya dibekukan di sini, bukan di MOD, karena harus
  // tetap beku LEWAT durasi eventnya sendiri kalau tidak ada yang membetulkan
  // — MOD kembali ke bawaan tiap frame begitu tidak ada event yang menuliskannya.
  jamBeku: null,           // null = ikut jam nyata, atau {hr,mn,sc} beku
};

/* -------------------------------------------------------------- penjadwal */
const eventHidup = [];
const cooldownSampai = new Map();
let jedaEvent = 8;          // percobaan pertama cepat, biar tidak sepi di awal
let S = null;               // potret ruangan, disegarkan tiap percobaan

/* Yang boleh dipinjam jadi pemain: benar-benar menganggur, bukan peserta rapat
   yang memang harus duduk, bukan yang sedang dipakai event lain. */
function bisaDipinjam(a) {
  return !a.eventKerja && !a.adaTugas && a.state !== 'work'
    && a.station !== 'keluar' && !a.keluar;
}

function potretRuangan() {
  const orang = [...penghuni()];
  const A = ambien();
  const d = new Date();
  return {
    jam: A.jam, lampu: A.lampu, luar: A.luar, malam: A.lampu > 0.5,
    hujan: CUACA.hujan, petir: CUACA.petir,
    hari: d.getDay(), tanggal: d.getDate(),
    kerjaJam: A.jam >= 7 && A.jam < 16,
    orang,
    sesi: agents.size, standby: standby.length, peserta: peserta.length,
    nganggur: orang.filter(bisaDipinjam),
    bekerja: orang.filter((a) => a.state === 'work'),
    stasiunAktif: new Set(orang.filter((a) => a.state === 'work').map((a) => a.station)),
  };
}

/* Pinjam pemain. Yang paling lama diam didahulukan — bukan yang paling dekat:
   memilih yang terdekat bikin orang yang sama terus-menerus jadi pemeran. */
function pinjamAktor(E, jumlah, saring) {
  const calon = S.orang.filter((a) => bisaDipinjam(a) && (!saring || saring(a)));
  calon.sort((a, b) => a.arrivedAt - b.arrivedAt);
  const ambil = calon.slice(0, jumlah);
  for (const a of ambil) {
    a.eventKerja = E;
    a.betahAsli = a.betah;
    a.betah = true;           // dipinjam ulang oleh IDLE_AFTER akan merusak skrip
    E.aktor.push(a);
  }
  return ambil;
}

function lepaskanAktor(a) {
  if (!a.eventKerja) return;
  const E = a.eventKerja;
  const i = E.aktor.indexOf(a);
  if (i >= 0) E.aktor.splice(i, 1);
  a.eventKerja = null;
  a.betah = a.betahAsli || false;
  a.alpha = 1;
  // Gelas kopi sengaja ikut pulang ke meja: yang ditinggal event bukan cuma
  // ingatan, tapi barang. bawaSampai yang menentukan kapan ia hilang.
  if (!a.bawaSampai || now > a.bawaSampai) { a.bawa = null; a.bawaSampai = 0; }
  a.pose = null;
  a.mulut = false;
  a.doingEvent = '';
  if (!a.adaTugas) { a.busyUntil = 0; a.state = 'idle'; }
}

// Dipanggil dari handle(): tool call selalu menang atas event.
function lepasDariEvent(a) {
  if (a.eventKerja) lepaskanAktor(a);
}

function nyalakanEvent(def) {
  const E = {
    def, id: def.id,
    umur: 0, sisa: def.durasi || 10,
    data: {}, aktor: [], tanda: new Set(),
  };
  eventHidup.push(E);
  cooldownSampai.set(def.id, now + (def.cooldown || 120) * 1000);
  // mulai() gagal = eventnya batal, bukan jalan setengah jadi. Tanpa ini
  // tick()-nya ikut meledak tiap frame sampai durasinya habis.
  try {
    def.mulai && def.mulai(E, S);
  } catch (e) {
    console.warn('[event]', def.id, e);
    matikanEvent(E, true);
    return false;
  }
  // Event yang tidak dapat pemain sama sekali padahal butuh: batalkan, jangan
  // biarkan jalan hampa selama durasinya lalu menghabiskan cooldown.
  if (def.perluAktor && !E.aktor.length) { matikanEvent(E, true); return false; }
  return true;
}

function matikanEvent(E, batal) {
  const i = eventHidup.indexOf(E);
  if (i >= 0) eventHidup.splice(i, 1);
  if (!batal) { try { E.def.selesai && E.def.selesai(E, S); } catch (e) { console.warn('[event]', E.id, e); } }
  for (const a of [...E.aktor]) lepaskanAktor(a);
  if (batal) cooldownSampai.set(E.id, now + 20000);
  else if (E.def.lanjutan) {
    for (const L of E.def.lanjutan) {
      if (Math.random() > (L.peluang == null ? 1 : L.peluang)) continue;
      const d = eventById.get(L.id);
      if (d && !sedangJalan(d.id)) { cooldownSampai.delete(d.id); nyalakanEvent(d); }
    }
  }
}

const sedangJalan = (id) => eventHidup.some((E) => E.id === id);

/* Event `panggung` menuntut perhatian dan tidak boleh dua sekaligus; `latar`
   (cicak, debu, awan lewat) boleh menumpuk sesukanya. */
function bentrok(def) {
  if (sedangJalan(def.id)) return true;
  if (def.kelas === 'panggung' && eventHidup.some((E) => E.def.kelas === 'panggung')) return true;
  if (def.bentrokDengan && def.bentrokDengan.some(sedangJalan)) return true;
  return false;
}

function pilihBerbobot(calon) {
  let total = 0;
  for (const d of calon) total += d.bobot || 1;
  let u = Math.random() * total;
  for (const d of calon) {
    u -= d.bobot || 1;
    if (u <= 0) return d;
  }
  return calon[calon.length - 1];
}

/* Satu-satunya tempat stempel menghantam meja. Dulu isinya enam baris `ink`
   langsung di update(); dipisah karena tiga hal menempel tepat di momen ini —
   bantalan yang kering, cap yang masih basah, dan penghitung hentakan yang
   memicu pengisian tinta. */
function hentakkanStempel(a) {
  RUANGAN.hentakStempel++;
  const kering = RUANGAN.bantalanKering;
  for (let i = 0; i < (kering ? 1 : 6); i++) {
    spawn('ink', a.x + 9, a.y - 14, kering ? '#d9908f' : null);
  }
  if (kering) return;
  RUANGAN.bekasStempel.push({ sisa: 2.5, dy: (RUANGAN.bekasStempel.length % 3) * 2 });
  if (RUANGAN.bekasStempel.length > 3) RUANGAN.bekasStempel.shift();
  if (RUANGAN.hentakStempel % 25 === 0) picuEvent('stempel-tinta-kering', true);
}

/* Bekas yang meluruh sendiri. Dipisah dari event supaya cap basah tetap
   mengering walau eventnya sudah lama selesai. */
function tickRuangan(dt) {
  for (let i = RUANGAN.bekasStempel.length - 1; i >= 0; i--) {
    if ((RUANGAN.bekasStempel[i].sisa -= dt) <= 0) RUANGAN.bekasStempel.splice(i, 1);
  }
  for (let i = RUANGAN.kertasLantai.length - 1; i >= 0; i--) {
    if ((RUANGAN.kertasLantai[i].sisa -= dt) <= 0) RUANGAN.kertasLantai.splice(i, 1);
  }
  if (RUANGAN.laciBuka > 0) RUANGAN.laciBuka -= dt;
  // dicatat di sini, bukan di pasangCuaca(): itu cuma jalan saat status
  // berganti, sementara "pernah > 0.6 dalam 15 menit terakhir" perlu jam yang
  // terus berjalan selama hujan derasnya bertahan.
  if (CUACA.hujan > 0.6) CUACA.hujanTinggiSejak = Date.now();
}

function tickEvent(dt) {
  resetMod();
  tickRuangan(dt);
  if (EVENT_MATI) return;

  S = potretRuangan();

  for (let i = eventHidup.length - 1; i >= 0; i--) {
    const E = eventHidup[i];
    E.umur += dt;
    E.sisa -= dt;
    try { E.def.tick && E.def.tick(E, dt, S); } catch (e) { console.warn('[event]', E.id, e); }
    if (E.sisa <= 0 || E.selesaiCepat) matikanEvent(E);
  }

  jedaEvent -= dt;
  if (jedaEvent > 0) return;

  if (EVENT_PAKSA) {
    jedaEvent = 4;
    const calon = EVENT_PAKSA.map((id) => eventById.get(id)).filter((d) => d && !sedangJalan(d.id));
    if (calon.length) nyalakanEvent(calon[(Math.random() * calon.length) | 0]);
    return;
  }

  jedaEvent = JEDA_MIN + Math.random() * (JEDA_MAX - JEDA_MIN);
  const calon = EVENT_ACAK.filter((d) =>
    now > (cooldownSampai.get(d.id) || 0) && !bentrok(d) && (!d.syarat || d.syarat(S)));
  if (calon.length) nyalakanEvent(pilihBerbobot(calon));
}

/* Nyalakan event tertentu dari luar penjadwal — dipakai event yang menempel
   pada kejadian nyata (hentakan stempel, kursi rapat penuh), bukan pada waktu. */
function picuEvent(id, abaikanCooldown) {
  const d = eventById.get(id);
  if (!d || EVENT_MATI || bentrok(d)) return false;
  if (!abaikanCooldown && now <= (cooldownSampai.get(id) || 0)) return false;
  if (!S) S = potretRuangan();
  return nyalakanEvent(d);
}

/* Jalankan fn sekali saja, saat umur event melewati `detik`. Ini yang membuat
   event berfase bisa ditulis lurus dari atas ke bawah, bukan sebagai mesin
   status yang harus dibaca dua kali. */
function pada(E, detik, fn) {
  if (E.umur < detik || E.tanda.has(detik)) return false;
  E.tanda.add(detik);
  fn();
  return true;
}

/* Lapisan gambar. Event menggambar lewat empat kait, masing-masing di tempat
   yang benar dalam urutan gambar ruangan — bukan semuanya di atas segalanya. */
function gambarLapis(nama) {
  for (const E of eventHidup) {
    const fn = E.def[nama];
    if (fn) { try { fn(E, S); } catch (e) { console.warn('[event]', E.id, e); } }
  }
}

// jendela dipakai bersama beberapa event (burung, layangan, bulan, Monas)
const JENDELA = { x: 186, y: 26, w: 52, h: 42 };
function klipJendela(fn) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(JENDELA.x, JENDELA.y, JENDELA.w, JENDELA.h);
  ctx.clip();
  fn();
  ctx.restore();
}

/* -------------------------------------------------------------------- loop */
let last = performance.now();
let dripT = 0;

function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  now = ts;
  kilat = kilatAktif();

  tickEvent(dt);        // sebelum update: MOD dipasang di sini, dibaca di bawah
  putarKipas += dt * 11 * MOD.kipas;

  // disalin dulu: peserta yang sampai di pintu menghapus dirinya saat update
  for (const a of [...agents.values(), ...peserta, ...standby]) a.update(dt);
  dripT += dt;
  if (dripT > MOD.drip) { dripT = 0; spawn('drip', 347, 30); }  // AC-nya memang bocor
  updateParts(dt);

  const busy = [...agents.values(), ...peserta, ...standby].filter((a) => a.state === 'work');
  const activeStations = new Set(busy.map((a) => a.station));

  // Getaran genset/gempa: seluruh kanvas digeser, bukan tiap prop satu-satu.
  // ctx.restore() ada SEBELUM taruhKartu() — kartu itu div DOM yang diposisikan
  // lewat offX/scale, jadi harus tidak ikut bergeser atau akan meleset dari orangnya.
  ctx.save();
  if (MOD.getar) ctx.translate(0, Math.round(Math.sin(now / 40) * MOD.getar));

  drawWall();
  gambarLapis('gambarDinding');
  drawFloor();
  gambarLapis('gambarLantai');

  const layers = [];
  for (const p of PROPS) layers.push({ y: p.sortY, fn: () => p.draw(activeStations.has(p.station)) });
  // Event yang punya benda sendiri ikut depth sort, bukan digambar di atas
  // segalanya — kucing di karpet harus bisa tertutup pegawai yang lewat.
  for (const E of eventHidup) {
    if (E.def.gambarProp) layers.push({ y: E.def.sortY == null ? 118 : E.def.sortY, fn: () => E.def.gambarProp(E, S) });
  }
  // Pegawai di pita lajur bawah melintas DI DEPAN kursi rapat sisi dekat —
  // tanpa ini mereka tertelan perabot, bukan lewat.
  for (const a of [...agents.values(), ...peserta, ...standby]) {
    const diPitaBawah = a.y > 240 && a.y < 266;
    // Yang sudah duduk di kursi rapat sisi dekat justru harus tenggelam DI
    // BELAKANG sandarannya — itu yang bikin dia terbaca duduk, bukan berdiri.
    // Yang menunggu keputusan kamu dikecualikan: dia memang BERDIRI dari
    // kursinya, jadi harus naik ke depan sandaran.
    const dudukDekat = a.station === 'rapat' && a.hadap === 'up'
      && !a.path.length && !a.butuh;
    layers.push({
      y: dudukDekat ? SORT_KURSI_DEKAT : (diPitaBawah ? a.y + 24 : a.y),
      fn: () => { if (a === terpilih) drawSorot(a); drawPerson(a); },
    });
  }
  layers.sort((m, n2) => m.y - n2.y);
  for (const l of layers) l.fn();

  drawParts();
  drawAmbien();
  gambarLapis('gambarAtas');

  const g = ctx.createRadialGradient(W / 2, 165, 70, W / 2, 165, 370);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(30,40,30,' + MOD.vignette.toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  taruhKartu();
  requestAnimationFrame(frame);
}

jagaPopulasi();      // ruangan sudah berisi sejak halaman dibuka
muatCuaca();         // cuaca perdana; diperbarui sendiri tiap 10 menit
setInterval(muatCuaca, 10 * 60 * 1000);
fit();
requestAnimationFrame(frame);
