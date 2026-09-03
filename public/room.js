/* agent-room :: renderer — edisi kantor dinas
   Kantor pemerintahan Indonesia dalam pixel-art. Satu pegawai (sprite
   pixel-art bergaris tepi) per sesi Claude Code; tiap tool call dia jalan
   ke meja/stasiun yang sesuai lalu kerja di sana. */

const W = 480, H = 356;   // baris meja kerja menempati strip baru di bawah
const FLOOR_TOP = 110;
const IDLE_AFTER = 7000;   // ms tanpa event -> balik ke meja kerja sendiri
const SPEED = 52;          // px per detik

/* Stamina pegawai (0..1, mulai 1). Turun dari jumlah call, kegagalan (lebih
   berat), lama di kantor, dan waktu menunggu kamu; naik saat menganggur dan
   selagi di pantry. Efeknya KOSMETIK saja — langkah 0,85× (tidak lebih
   lambat: kedatangan ke stasiun tetap cepat, Aturan 1), bahu turun 1 px,
   dan wajah 'lelah' sebagai ekspresi prioritas terendah. Tidak masuk log,
   tidak masuk statistik; kartu pegawai cuma menulis satu baris "kondisi". */
const STAMINA_CALL = 0.012;    // turun per tool call
const STAMINA_GAGAL = 0.04;    // turun per tool call yang gagal
const STAMINA_JAM = 0.10;      // turun per jam di kantor
const STAMINA_TUNGGU = 0.06;   // turun per menit menunggu kamu
const STAMINA_PULIH = 0.03;    // naik per menit menganggur
const STAMINA_PANTRY = 0.15;   // naik per menit dipinjam event pantry
const STAMINA_LELAH = 0.3;     // di bawah ini: 'lelah'
const STAMINA_SEGAR = 0.7;     // di atas ini: 'segar'
const LAJU_LELAH = 0.85;

/* Antrean stasiun: kalau slotnya habis (PC server 4, meja rapat 9, ...),
   pegawai berikutnya berdiri mengantre di lajur di belakang stasiun —
   berjarak 10 px, paling banyak 3 yang kelihatan (sisanya berimpit di
   posisi ketiga) — dan maju sendiri begitu ada slot kosong. */
const ANTRE_JARAK = 10;
const ANTRE_TAMPAK = 3;
let antreSeq = 0;              // nomor giliran global: yang lebih kecil lebih dulu maju

/* Transisi duduk/berdiri di kursi rapat: 3 frame × 2 px, ±150 ms — bukan
   teleport. Jeda antisipasi 150 ms setibanya di stasiun sebelum pose kerja. */
const DUDUK_PX = 2, DUDUK_FRAME = 3, DUDUK_MS = 150;
const TIBA_JEDA_MS = 150;

/* Ritual pulang (session-end): salaman ke rekan seproyek yang menganggur
   (1 s), tempel jari di mesin absen (0,6 s), keluar lewat pintu. Batas total
   6 s — lewat itu dia hilang di tempat. */
const PULANG_BATAS_MS = 6000, PULANG_ABSEN_MS = 600, PULANG_SALAM_MS = 1000;
const ABSEN_X = 424, ABSEN_Y = 152;      // titik berdiri di depan mesin absen (drawAbsensi)
// Pintu keluar sesudah absen: tepi KANAN lajur atas, di sebelah mesin absen.
// Bukan tepi kiri seperti peserta rapat — dari mesin absen ke tepi kiri
// ±530 px (≈10 s), tidak pernah muat di jatah 6 s; ke tepi kanan cuma ±60 px.
const PINTU_X = W + 20;

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

/* Dua rupa halaman dari URL, dibaca SEBELUM fit() karena fit() ikut berubah:
   ?kadis=1   — tampilan HP buat kepala dinas: kanvas disembunyikan, panel jadi
                satu kolom daftar besar (lihat kadisGambar()).
   ?overlay=1 — layar kedua / OBS: cuma kanvas, latar tembus; ?overlay=chroma
                latar hijau #00ff00 buat chroma key. Kelas dipasang ke <html>
                dan <body> di sini supaya CSS-nya menang sebelum gambar pertama. */
const MODE_URL = new URLSearchParams(location.search);
const MODE_KADIS = MODE_URL.get('kadis') === '1';
const MODE_OVERLAY = MODE_URL.get('overlay') === 'chroma' ? 'chroma' : MODE_URL.get('overlay') === '1' ? 'tembus' : '';
for (const el of [document.documentElement, document.body]) {
  if (MODE_KADIS) el.classList.add('mode-kadis');
  if (MODE_OVERLAY) el.classList.add('mode-overlay', 'mode-' + MODE_OVERLAY);
}

/* PERINGATAN NAMA — jebakan yang pasti memakan korban berikutnya:
   `?kadis=1` (MODE_KADIS di atas) adalah MODE HP berupa daftar teks lewat
   kadisGambar(); kanvasnya justru disembunyikan CSS. Itu BUKAN ruangan.
   RUANG KADIS sebagai tempat sungguhan ada di blok "ruang kadis" tepat
   sesudah drawKadis() — konstanta SISIP/SISIP_DALAM/RUANG_KADIS — dan
   parameter URL-nya `?ruang=kadis`, bukan `?kadis=`. Jangan pernah
   mencampur keduanya, dan jangan memberi nama baru berawalan MODE_.
   `?ruang=mati` memaksa bukaannya tidak pernah terbuka (layar kedua yang
   memang cuma mau melihat ruang utama).
   ?ulang=/&laju= dibaca di sini juga (bukan di blok EventSource di bawah)
   karena penjaga putar ulang cepat dipakai jauh sebelum stream tersambung. */
const RUANG_URL = MODE_URL.get('ruang') || '';
const ULANG_URL = MODE_URL.get('ulang') || '';
const ULANG_LAJU = Number(MODE_URL.get('laju')) || 0;

function fit() {
  // overlay: stageInner full-bleed (padding 0), jadi tepi 36 px yang biasa
  // disisakan buat bayangan kanvas justru menyusutkan kanvasnya
  const tepi = MODE_OVERLAY ? 0 : 36;
  const availW = stageInner.clientWidth - tepi;
  const availH = stageInner.clientHeight - tepi;
  let s = Math.min(availW / W, availH / H);
  // overlay dikunci ke kelipatan piksel bulat: OBS menyusun ulang tiap frame,
  // skala pecahan bikin garis tepi sprite belang di layar penonton
  scale = MODE_OVERLAY ? Math.max(1, Math.floor(s)) : s >= 2 ? Math.floor(s) : Math.max(0.6, s);
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

// `k` opsional: konteks lain (kanvas offscreen cache neon di mode ringan)
function glow(x, y, radius, color, alpha, k = ctx) {
  const g = k.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  k.globalAlpha = alpha;
  k.fillStyle = g;
  k.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  k.globalAlpha = 1;
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
// Meja kerja di baris paling depan — tempat pegawai duduk saat berpikir.
// Titik x-nya BUKAN dipilih supaya rapi, tapi diambil dari koridor turun yang
// benar-benar bebas perabot (54..118, 159..194, 369..381, 419..471, lalu
// 225..267 dan 289..322 — dua celah sempit di antara kursi rapat sisi dekat
// dan dispenser yang baru ketahuan longgar). Jarak yang rapi akan memaksa
// pegawai menembus ruang tunggu atau kipas menuju mejanya.
// 242 & 308 SENGAJA mepet (papan meja lebar 64px, jarak keduanya cuma 66px):
// itu memang batas paling longgar yang muat di antara meja-176 dan meja-374
// tanpa papannya tumpang tindih — sudah dicek piksel demi piksel di browser.
// Dua entri ini SENGAJA ditaruh di ujung array, bukan disisipkan di tengah:
// wifi-sudut-lemah (event-acak.js) mengunci slotIdx===3 sebagai meja pojok
// (444) — menyisipkan di tengah akan menggeser indeks itu ke meja yang salah.
const MEJA_KERJA_X = [176, 374, 86, 444, 242, 308];   // urut prioritas pemakaian
// Dulu 316 (di tengah kaki meja, jadi tertutup papan & kaki meja -> kebaca
// "duduk"). Sekarang 350: sedikit LEBIH BESAR dari sortY meja (348, garis kaki
// meja itu sendiri) supaya pegawai kalah-urut belakangan dan digambar DI ATAS
// meja saat depth-sort -> badannya utuh, berdiri persis di depan mejanya.
const MEJA_KERJA_Y = 350;                   // garis kaki pegawai yang berdiri di depan mejanya

const STATIONS = {
  read:   { x: 54,  y: 138, lane: LANE_UP,   face: 'up',   name: 'lemari arsip',   fx: 'dust'  },
  search: { x: 132, y: 138, lane: LANE_UP,   face: 'up',   name: 'filing kabinet', fx: 'scan'  },
  web:    { x: 212, y: 138, lane: LANE_UP,   face: 'up',   name: 'meja printer',   fx: 'ping'  },
  edit:   { x: 286, y: 140, lane: LANE_UP,   face: 'up',   name: 'meja stempel',   fx: 'ink'   },
  // Rak PC server, satu-satunya mesin berdiri di ruangan ini. Slotnya dibatasi
  // empat: yang kelima jatuh tepat di atas ember penadah tetesan AC.
  server: { x: 390, y: 141, lane: LANE_UP,   step: 20, slots: 4,
            face: 'up', name: 'PC server',      fx: 'data'  },
  /* (452,140) itu AMBANG PINTU, bukan ruangannya: ruang kadisnya ada di balik
     bukaan SISIP (blok "ruang kadis" sesudah drawKadis).
     slots+step MENAMBAL CACAT YANG SUDAH ADA, bukan bagian dari bukaan itu:
     tanpa `slots`, slotBebas() memakai bawaan 12 dengan langkah 19 px, jadi
     tamu berikutnya berbaris ke kiri sampai x=357 — berdiri menempel di rak
     PC server dan meja stempel, jauh dari pintu yang katanya dia tuju.
     slots:3 + step:12 memberi tepat tiga titik (440, 452, 464) yang semuanya
     di depan daun pintu dan lolos saringan tepi slotBebas (16..464), dan
     tamu keempat memakai mekanisme antre yang sudah ada (ANTRE_JARAK 10). */
  agent:  { x: 452, y: 140, lane: LANE_UP,   step: 12, slots: 3,
            face: 'up',   name: 'ruang kadis',    fx: 'paper' },
  rapat:  { x: 246, y: 192, lane: LANE_UP,   face: 'down', name: 'meja rapat',     fx: 'talk'  },
  // meja kerja; slotsX dipakai karena jaraknya tidak seragam.
  // face 'up': berdiri membelakangi penonton, menghadap laptop di mejanya —
  // bukan menghadap kamera seperti stasiun lain yang orangnya mengobrol.
  think:  { x: 176, y: MEJA_KERJA_Y, lane: LANE_DOWN, slotsX: MEJA_KERJA_X,
            face: 'up',   name: 'meja kerja',     fx: 'idea'  },
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
    // nama tool-nya ikut: "Claude Browser · navigate", bukan cuma servernya
    const alat = tool.split('__').slice(2).join('__');
    return ['berkoordinasi dengan', alat ? srv + ' · ' + alat : srv];
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

/* Mode panggung: layar kedua/live-stream aman ditonton orang lain — isi
   balon pikiran & kotak kabar (kalimat/pikiran sungguhan agen, bisa memuat
   kode/rahasia proyek) disamarkan jadi label generik, tapi animasi/cuaca/
   siklus siang-malam/event ambient tetap tampil apa adanya. Lihat
   panggungSensor() dekat handle(). */
const PANGGUNG = new URLSearchParams(location.search).get('panggung') === '1';

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

/* Jam desimal 0..24 di mesin penonton, dengan ?jam= sudah diperhitungkan.
   Dipisah dari hitungAmbien() supaya yang cuma butuh jamnya (kurva kekusutan
   harian) tidak ikut kena cache per-detik ambien() — cache itu dikunci ke
   `now` (stempel rAF), yang di harness uji tidak selalu berjalan. */
function jamKini(d) {
  if (Number.isFinite(JAM_PAKSA)) return ((JAM_PAKSA % 24) + 24) % 24;
  d = d || new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

function hitungAmbien() {
  const jam = jamKini();
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
    if (MOD.jamOffset) { mn = (mn + MOD.jamOffset) % 1; hr = (hr + MOD.jamOffset / 12) % 1; }
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

  // papan nama dinas, biru navy — pelat resmi, bukan spanduk kain
  r(18, 7, 134, 15, '#1c4e8a');
  r(18, 7, 134, 2, '#4a7fc0');
  r(18, 20, 134, 2, sh('#1c4e8a', 0.7));
  ctx.fillStyle = '#fdf6ec';
  ctx.font = '7px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  // Huruf yang lepas (huruf-spanduk-lepas) dihapus permanen, satu per satu,
  // dan ditempel ulang 1px lebih tinggi & tetap miring — spanduknya menua.
  const teksSpanduk = 'DINAS AI KLOD';
  if (!RUANGAN.spanduk) {
    ctx.fillText(teksSpanduk, 24, 15);
  } else {
    const lebar = ctx.measureText('M').width;
    for (let i = 0; i < teksSpanduk.length; i++) {
      if (i === RUANGAN.spanduk.hilang) continue;
      const naik = i === RUANGAN.spanduk.tempel ? 1 : 0;
      ctx.fillText(teksSpanduk[i], 24 + i * lebar, 15 - naik);
    }
  }

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

  // CCTV kubah pojok kiri-atas, sebelum spanduk mulai — LED merah tetap
  // berkedip pelan di luar event, kerucut sapuannya cuma muncul saat event
  r(4, 4, 10, 8, '#7c838a');
  r(4, 4, 10, 2, '#9aa1a6');
  r(7, 10, 4, 2, '#5a6068');
  r(8, 11, 2, 1, Math.sin(now / 1000) > 0 ? P.red : '#5c2222');

  // Piagam Zona Integritas — muncul sekali (penghargaan-zona-integritas),
  // menetap permanen di celah dinding antara AC dan rambu larangan merokok
  if (RUANGAN.piagamDinding) {
    glow(423, 12, 20, P.gold, 0.06 + 0.03 * Math.sin(now / 500));
    r(418, 8, 11, 8, '#8a6844');
    r(419, 9, 9, 6, '#f0ede2');
    r(420, 10, 7, 1, P.gold);
    r(420, 13, 5, 1, '#9aa1a6');
  }

  gambarTemaDinding();      // dekor tema kalender (agustusan, korpri, ...) — di bawah neon

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

  // Karpet merah membingkai meja rapat. RUANGAN.karpetCerah dipasang
  // karpet-rapat-digulung-dijemur: sesudah dijemur warnanya naik satu tingkat
  // dan TIDAK turun lagi — bekas yang hidup lebih lama dari eventnya, sama
  // seperti plang baru dan noda plafon.
  const kc = RUANGAN.karpetCerah ? 1.14 : 1;
  ctx.globalAlpha = 0.94;
  r(152, 176, 188, 76, sh('#743030', kc));
  r(155, 179, 182, 70, sh('#8d3a3a', kc));
  r(160, 184, 172, 60, sh('#743030', kc));
  r(164, 188, 164, 52, sh('#984545', kc));
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

  gambarKusutLantai();      // ceceran yang menumpuk sepanjang hari

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

/* Lembaran & gumpalan kertas yang tercecer sepanjang hari. BUKAN
   RUANGAN.kertasLantai — itu punya event dan meluruh sendiri dalam hitungan
   detik. Yang ini murni turunan kurva kusut, TANPA state: muncul sendiri
   waktu ruangan makin kusut, hilang sendiri waktu dibereskan. Jadi tidak ada
   array yang bisa bocor kalau tabnya dibiarkan terbuka semalam, dan
   bereskanKusut() otomatis menyapunya tanpa perlu tahu apa-apa soal titiknya.

   Titiknya TABEL TETAP, bukan acak: lantai yang titik sampahnya berpindah
   tiap frame kebaca sebagai kedipan, bukan sebagai kotor. `a` = ambang kusut
   tempat tiap titik mulai muncul, diurutkan supaya cecerannya menyebar
   pelan-pelan dari tengah ruangan ke pinggir, bukan muncul serempak.
   Digambar di drawFloor (sebelum semua prop & pegawai), jadi yang lewat
   menutupinya — bukan mengambang di atas orang. */
const KUSUT_LANTAI = [
  { x: 126, y: 296, a: 0.24, gumpal: false },
  { x: 246, y: 302, a: 0.31, gumpal: false },
  { x: 356, y: 292, a: 0.38, gumpal: true  },
  { x: 424, y: 300, a: 0.44, gumpal: false },   // sebelah tong sampah pantry
  { x: 232, y: 128, a: 0.50, gumpal: false },   // celah antara meja printer & meja stempel
  { x: 74,  y: 308, a: 0.55, gumpal: true  },
  { x: 300, y: 314, a: 0.60, gumpal: false },
  { x: 104, y: 156, a: 0.65, gumpal: true  },   // depan filing kabinet
  { x: 190, y: 318, a: 0.70, gumpal: true  },
  { x: 452, y: 286, a: 0.75, gumpal: false },
  { x: 340, y: 158, a: 0.80, gumpal: false },   // lajur atas, sebelum rak server
  { x: 112, y: 322, a: 0.85, gumpal: false },
  { x: 268, y: 288, a: 0.90, gumpal: true  },
  { x: 402, y: 322, a: 0.95, gumpal: false },
];

function gambarKusutLantai() {
  const k = kusutKini();
  for (const c of KUSUT_LANTAI) {
    if (k <= c.a) continue;
    // memudar masuk sepanjang 0.05 kusut (±20 menit jam kantor) supaya tidak
    // ada lembaran yang muncul mendadak di lantai kosong
    const alpha = Math.min(1, (k - c.a) / 0.05);
    ctx.globalAlpha = alpha * 0.3;                        // bayangan kontak: menempel di lantai, bukan decal
    r(c.x + 1, c.y + 3, c.gumpal ? 3 : 5, 1, '#2f3a2c');
    ctx.globalAlpha = alpha;
    if (c.gumpal) {                                       // kertas dikepal, buangannya meleset dari tong
      r(c.x + 1, c.y, 2, 1, '#f6f3e9');
      r(c.x, c.y + 1, 4, 2, '#e4ddc8');
      r(c.x, c.y + 2, 4, 1, '#c9c2ac');
    } else {                                              // selembar rebah, sudutnya terangkat
      r(c.x, c.y + 1, 6, 2, P.paper);
      r(c.x, c.y + 1, 6, 1, '#f6f3e9');
      r(c.x + 5, c.y, 1, 2, '#d9d4c2');
      r(c.x + 1, c.y + 2, 3, 1, '#d9d4c2');
    }
    ctx.globalAlpha = 1;
  }
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
      // tumpukan map + bundel arsip bertali. boksHilang: satu bundel dipinjam
      // bidang lain, hilang dari rak sampai dikembalikan.
      for (let s = 0; s < 3; s++) {
        const boksKe = row === 1 ? s : s + 3;
        if (boksKe === RUANGAN.boksHilang) continue;
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
  // Kliping mingguan (map arsip kliping mingguan — RUANGAN.arsipKlipingLembar,
  // diisi dari GET /kliping-mingguan): tumpuk di celah antara dus arsip &
  // piala, warna merah bata beda spesies dari ordner/map biasa di rak yang
  // sama. Idiom render sama seperti tumpukanFiling (drawFiling) — lapis
  // bergantian warna, tampilan dibatasi 10 walau datanya tidak dipotong.
  for (let k = 0; k < Math.min(10, RUANGAN.arsipKlipingLembar); k++) {
    r(x + 28, y - 3 - k * 2, 15, 2, k % 2 ? '#8a3a2e' : '#a34536');
  }
  // Piala voli antar-OPD — muncul sekali (piala-voli-dipajang), permanen
  if (RUANGAN.piala) {
    glow(x + 49, y - 17, 7, '#d1a326', 0.2 + 0.06 * Math.sin(now / 420));
    r(x + 47, y - 20, 4, 2, P.gold);
    r(x + 46, y - 18, 6, 4, P.gold);
    r(x + 48, y - 14, 2, 3, '#9a7a1a');
    r(x + 46, y - 11, 6, 2, '#5f4530');
  }
  // Kepenuhan: rak ini terbuka (bukan lemari berpintu), jadi "tidak muat"
  // digambar sebagai map yang menyembul miring dari tepi rak, bukan celah
  // pintu yang tidak pernah ada.
  if (RUANGAN.arsipPenuh) {
    r(x + w - 6, y + 60, 3, 12, '#c98a5c');
    r(x + w - 5, y + 58, 3, 12, '#e4ddc8');
    for (let d = 0; d < RUANGAN.dusTambahanArsip; d++) {
      const dx = x - 4 - d * 22, dy = y + h - 16;
      r(dx, dy, 20, 16, '#a37b4e');
      r(dx + 2, dy + 2, 16, 12, '#b98d5e');
      r(dx + 8, dy + 2, 4, 12, '#d9cba8');
    }
    if (Math.random() < 0.04) spawn('dust', x + w - 6, y + 30);
  }
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
    const open = kosong || ((active || RUANGAN.laciBuka > 0) && i === 0) || i === RUANGAN.laciTerbuka;
    r(x + 3, dy, w - 6, 14, sh(P.metal, 1.12));
    r(x + 3, dy, w - 6, 1, P.metalL);
    r(x + w / 2 - 6, dy + 6, 12, 3, sh(P.metal, 0.8));     // handle
    r(x + w / 2 - 4, dy + 2, 8, 3, P.paper);               // label laci
    if (open) {
      r(x + 1, dy + 12, w - 2, 8, sh(P.metal, 1.2));       // laci ketarik keluar
      r(x + 1, dy + 12, w - 2, 1, P.metalL);
      if (kosong) r(x + 3, dy + 13, w - 6, 6, '#1a1d21');  // rongga gelap, tanpa map
      else for (let f = 0; f < 5; f++) r(x + 5 + f * 8, dy + 13, 6, 2, ['#c9a03a', '#3e6b4f', '#b03030'][f % 3]);
    } else if (i === 0 && RUANGAN.laciCelah > 0) {
      // macet: tidak bisa tertutup rapat, celahnya menetap sampai event berikutnya
      r(x + 1, dy + 12, w - 2, RUANGAN.laciCelah, sh(P.metal, 1.2));
    }
  }
  // bagan STRUKTUR ORGANISASI — bingkai+kertas ditinggikan 4px di dasar
  // (bukan di atas: atasnya sudah nempel papan nama) supaya kotak tambahan
  // RUANGAN.baganKotak muat penuh, sekalian memberi ruang judul di header.
  r(104, 20, 56, 42, '#6d5535');
  r(106, 22, 52, 38, P.paper);
  r(108, 24, 48, 7, '#3565b0');
  ctx.fillStyle = '#eaf1fb';
  ctx.font = '5px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('STRUKTUR ORG.', 110, 28);
  const bx = (cx, cy) => { r(cx, cy, 9, 5, '#cfe0f2'); r(cx, cy, 9, 1, '#8ba8c8'); };
  bx(127, 31);
  r(131, 36, 1, 3, '#8b98a6');
  r(114, 39, 35, 1, '#8b98a6');
  bx(110, 40); bx(127, 40); bx(144, 40);
  r(114, 45, 1, 3, '#8b98a6'); r(131, 45, 1, 3, '#8b98a6'); r(148, 45, 1, 3, '#8b98a6');
  bx(110, 48); bx(127, 48); bx(144, 48);
  // Bagan diperbarui: satu kotak tambahan di baris paling bawah, jabatan baru
  if (RUANGAN.baganKotak > 0) {
    bx(118.5, 55); if (RUANGAN.baganKotak > 1) bx(135.5, 55);
    r(114, 45, 1, 8, '#8b98a6');
  }
  if (active) glow(x + w / 2, y + 20, 40, P.teal, 0.18);
}

// Monitor CRT tua di celah dinding antara filing dan jendela — dekorasi
// permanen, biasanya diam; bar guling cuma jalan selama monitor-crt-bergaris.
function drawCRT() {
  const x = 160, y = 46, w = 16, h = 14;
  r(x - 1, y - 1, w + 2, h + 2, '#3a3f45');
  r(x, y, w, h, '#1d3a2a');
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  for (let i = 0; i < 7; i++) { ctx.globalAlpha = 0.12; r(x, y + i * 2, w, 1, '#0c1a12'); }
  ctx.globalAlpha = 1;
  if (MOD.crtAktif) {
    const bar = (now / 8) % (h + 4) - 4;
    ctx.globalAlpha = 0.18;
    r(x, y + bar, w, 4, '#5fdc9a');
    ctx.globalAlpha = 1;
    if (Math.sin(now / 3000) > 0.92) ctx.translate(1, 0);   // lompat 1px tiap ~3s
  }
  ctx.restore();
  r(x + w / 2 - 2, y + h, 4, 2, '#3a3f45');                // leher
  r(x + w / 2 - 5, y + h + 2, 10, 2, '#2b2f34');           // dudukan
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
  // gorden kanan bisa ditarik lebih lebar (silau sore, matahari kena rak
  // server) — lebarnya persisten di RUANGAN, kiri selalu 6
  for (const [gx, lebar] of [[x - 8, 6], [x + w + 2, RUANGAN.gordenKanan]]) {
    r(gx, y - 2, lebar, h + 6, '#3e6b4f');
    r(gx + 1, y - 2, 1, h + 6, '#5f9068');
    r(gx + lebar - 2, y - 2, 1, h + 6, '#2c4e38');
    r(gx, y + 26, lebar, 3, P.gold);                       // ikat gorden
  }
  // meja kecil + printer
  r(198, 96, 30, 4, P.wood);
  r(200, 100, 3, 16, P.woodD);
  r(223, 100, 3, 16, P.woodD);
  // stapler kosong — prop kecil permanen di ujung kiri meja printer
  r(199, 91, 5, 3, '#3a3f45');
  r(200, 90, 3, 1, '#5a6068');
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
  // tumpukan berkas menjulang — dijadikan data (bukan 9 tetap) supaya event
  // "roboh" tinggal mengubah jumlahnya, dan pembalikannya langsung terbaca
  // sebagai "dibereskan" tanpa gambar prop baru
  for (let l = 0; l < RUANGAN.tumpukanStempel; l++) {
    // rapi = tepinya lurus (offset 0); berantakan = zig-zag l%3 seperti biasa
    r(x + 2 + (RUANGAN.stempelRapi ? 0 : l % 3), y + 20 - l * 2, 13, 2, l % 2 ? '#e4ddc8' : P.paper);
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
  // rakPanas MEM-BYPASS gerbang active: kalau tidak ada siapa pun di rak,
  // semua LED sudah gelap dan "berganti oranye" tidak akan pernah terlihat
  const led = (lx, ly, i, warna) => {
    if (MOD.rakPanas) {
      r(lx, ly, 1, 1, Math.sin(now / 140 + i) > 0 ? '#ff8a4a' : '#c94a2a');
      return;
    }
    r(lx, ly, 1, 1, kedip(i) ? warna : sh(warna, 0.3));
  };

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
  // Diangkat penuh (ups-ngebul): tidak digambar di dinding sama sekali,
  // dipegang si pegawai lewat drawBawaan(bawa:'apar') — bukan dobel.
  if (!RUANGAN.aparDiangkat) {
    const ay = -RUANGAN.aparAngkat;                          // diperiksa: terangkat sebagian
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
  }

  if (MOD.rakPanas) glow(x + w / 2, y + h / 2, 52, '#ff8a4a', 0.2);
  else if (active) glow(x + w / 2, y + h / 2, 52, '#7ee787', 0.13);
}

function drawKadis(active) {
  active = active || MOD.pintuKadis;      // event bisa membuka pintunya sendiri
  const x = 440, y = 28, w = 34, h = 82;
  if (RUANGAN.plangBaru) {
    // plang kayu baru, lis emas — dan yang lama tersandar di dinding sebelah
    // SELAMANYA, khas kantor yang tidak tega membuang barang lama
    r(x + 1, y - 21, 32, 16, '#5f4530');
    r(x + 1, y - 21, 32, 1, '#8a6844');
    r(x + 3, y - 19, 28, 12, '#e9e2cb');
    r(x + 1, y - 21, 32, 2, P.gold); r(x + 1, y - 6, 32, 1, P.gold);
    r(x + 5, y - 16, 22, 1, '#3a3f45'); r(x + 5, y - 11, 16, 1, '#3a3f45');
    r(x - 6, y + 8, 4, 14, '#1c4e8a');            // papan lama tersandar
    r(x - 6, y + 8, 4, 1, '#4a7fc0');
  } else {
    // papan nama biru
    r(x + 2, y - 20, 30, 14, '#1c4e8a');
    r(x + 2, y - 20, 30, 1, '#4a7fc0');
    ctx.fillStyle = '#f4f6fa';
    ctx.font = '5px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('KEPALA', x + 7, y - 15);
    ctx.fillText('DINAS', x + 9, y - 9);
  }
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
  // keset baru — muncul sekali (keset-baru-dipasang), lalu menetap sepanjang
  // sesi persis di ambang pintu, di atas plat tendang
  if (RUANGAN.kesetAda) {
    r(x - 3, y + h, w + 6, 7, '#3f4a3a');
    r(x - 3, y + h, w + 6, 1, '#5a6a4a');
    r(x - 3, y + h, 1, 7, '#7a2020'); r(x + w + 2, y + h, 1, 7, '#7a2020');
    for (let i = 0; i < 6; i++) r(x - 1 + i * 6, y + h + 3, 4, 1, sh('#3f4a3a', 0.85));
  }
  if (active) glow(x + w / 2, y + 50, 36, '#ffd88a', 0.2);
  // Titik kuningan kecil di plat tendang: berapa orang sedang MENGHADAP di
  // dalam. Satu-satunya hal yang membuat pintu tertutup terbaca "ada isinya"
  // sekaligus mengundang klik ke bukaan di sebelahnya (lihat blok ruang kadis).
  const tamuDalam = Math.min(3, tamuKadis());
  for (let i = 0; i < tamuDalam; i++) r(x + 9 + i * 6, y + h - 5, 2, 2, P.gold);
}

/* ========================================================== ruang kadis ===
   Ruang kepala dinas sebagai BUKAAN BERBINGKAI di dinding, DI DALAM dunia
   480x356 yang sama. Bukan panggung kedua, bukan dunia yang diperlebar,
   bukan lantai dua: kotak SISIP ADALAH wilayah dunia biasa. Pegawai yang
   menghadap kadis benar-benar dipindah ke koordinat dunia di dalam bukaan
   itu, jadi kamera, keLayar/dariLayar, kameraTampak, agenDiTitik,
   taruhKartu, drawSorot, dan balon DOM semuanya sudah benar tanpa satu
   baris pun diubah di sana.

   JANGAN TERTUKAR DENGAN MODE_KADIS. `?kadis=1` (const MODE_KADIS, dekat
   bagian atas berkas) adalah MODE HP berupa daftar teks lewat kadisGambar()
   — sama sekali BUKAN ruangan. Parameter URL bukaan ini `?ruang=kadis`, dan
   semua nama baru di sini berawalan SISIP_/RUANG_KADIS/masukKadis/
   keluarKadis, tidak pernah MODE_*.

   LETAK & UKURAN — kenapa 72x46 di x290..362, bukan 154x94 di x284..438.
   Rancangan menyebut kotak 284,22,154,94; dinding itu TIDAK KOSONG. Sapuan
   piksel atas seluruh perabot lama (27 entri PROPS + drawWall/drawFloor + 99
   gambarProp + 67 hook lapis event + keempat dekor tema dinding) menghitung
   kotak rancangan menimpa 9.165 piksel milik 17 perabot berbeda:
   drawServer 4.985 px (rak PC server, rangka luar mulai x=362 — bukan 364),
   drawPlakatNilai 1.080, drawStempel 680, garis pilar drawWall 442,
   token-listrik-hampir-habis 400, wifi-megap-megap 320, stabilizer 216,
   telepon-kantor 196, drawFloor 157, drawAbsensi 117, titip-absen 117,
   wifi-sudut 80, matahari-silau 80, layar-server-idle 72,
   kucing-tidur-di-rak 65, halal-bihalal (ketupat) 29, kabel-lan-lepas 12.
   Jadi kotak rancangan MUSTAHIL: yang paling besar, rak PC server, adalah
   stasiun 'server' yang dipakai tiap hari.
   Sapuan yang sama atas kotak 320,28,44,72 yang sempat dibangun: 191 piksel
   hilang — 170 milik drawServer (kepala APAR ketimpa ambang bawah, dan tiang
   kanan kusen menimpa 2 kolom tepi rak) dan 21 milik ketupat halal-bihalal.
   Atas kotak yang dipakai sekarang: NOL.
   Yang bisa dilakukan: mencari PERSEGI KOSONG TERBESAR di pita dinding itu.
   Jawabannya x289..362 y33..79 = 73x46 = 3.358 px, nol piksel prop lama.

   SATU KOLOM DIKEMBALIKAN: x=290, BUKAN 289. Persegi kosong terbesar memang
   mulai di 289, tapi "kosong" itu diukur dengan mencuplik umur event di
   0/5/12 detik — dan ada satu event yang cuma lewat sekejap. Ekor cicak
   'cicak-jatuh-ke-berkas' (gambarProp: r(x+5, y-1, 2, 2), x = 262 +
   round(umur*7)) berdiri di kolom 288..289 selama umur 2,93..3,00 detik —
   ±70 ms, 2 dari 14 piksel cicaknya, tiap kali event itu jalan. Kolom 289
   dikembalikan kepadanya: bukaan jadi 290..361 = 72x46 = 3.312 px, kusen
   kiri tetap 1 px dari garis pilar drawWall di x=288, tepi kanan tidak
   bergerak sama sekali, dan SISIP_DALAM tidak ikut bergeser (kolom 292
   sekarang berada di bawah tiang kiri — dinding dalamnya memang tidak
   pernah terlihat di situ, jadi foto pejabat digeser 1 px supaya tidak
   terpotong kusen).
   Sapuannya sekarang mencuplik umur 0..14 detik tiap 0,02 detik (uji-sisip
   bagian 1a), jadi klaim NOL di atas dijaga uji, bukan diasumsikan.
   Batas-batasnya, satu per satu: kiri x=288 garis pilar samar drawWall
   (drawWall menaruh garis tiap 96 px: 96, 192, 288, 384); kanan x=362 rangka
   luar rak PC server; atas y=33 karena y14..27 AC split 336..374, y20..30
   wifi-sudut-lemah 300..309, dan y26..32 ketupat halal-bihalal (gantungan
   kedua di cx=322); bawah y=79 karena telepon-kantor-berdering 299..317
   mulai y79 dan kepala APAR (drawServer: leher 332..342 y94..100, naik ke
   y87 saat RUANGAN.aparAngkat=7) menempel di bawahnya. Melebar 1 px ke mana
   pun berarti menimpa salah satunya.

   PENYIMPANGAN YANG DICATAT, BUKAN DISEMBUNYIKAN. Rancangan menyebut
   "jendela kaca SAMPING PINTU". Pintu kadis ada di x440..474; dinding di
   antara rak server dan pintu itu sudah penuh (plakat nilai 376..424,
   rambu larangan merokok 425..435, mesin absen 424..433, kabel LAN 417).
   Celah bebas terlebar di sana cuma 16x8 px di x418..439 y43..50 — tidak
   muat bukaan apa pun. Jadi bukaan ini adalah JENDELA KACA DI DINDING SAYAP
   TIMUR, 78 px di kiri pintu kadis, dan yang menyambungkannya ke pintu itu
   bukan "leher" kusen (mustahil: rak server berdiri persis di antaranya)
   melainkan isinya — daun pintu dalam di tepi kanan ruangan plus titik
   kuningan di plat tendang pintu kadis (drawKadis).
   AC split tergantung tepat di atas ujung kanan bukaan: tetesan yang
   di-spawn di (347,30) jatuh DI DEPAN kaca menuju ember di y=124 — gag ember
   bocor selamat.

   BATAS KERAS (diuji di uji-sisip.mjs, dengan sapuan piksel sungguhan):
   SISIP.x >= 290, SISIP.x + SISIP.w <= 362, SISIP.y >= 33,
   SISIP.y + SISIP.h <= 79. */
const SISIP = { x: 290, y: 33, w: 72, h: 46 };          // bukaan luar termasuk bingkai
const SISIP_DALAM = { x: 292, y: 39, w: 67, h: 36 };    // isi ruangan, di dalam clip
const SISIP_BUKA_MS = 220, SISIP_TUTUP_MS = 180, SISIP_PUDAR_MS = 180;
/* 6000, bukan 2500: `tool.startsWith('mcp__') ? 'agent'` memetakan SETIAP
   tool MCP ke stasiun ini, ditambah Skill dan SendMessage. Stasiun ini
   RAMAI, dan tahan 2,5 detik bikin gordennya berkedip sepanjang sesi.
   Karena itu ONGKOSNYA DITULIS APA ADANYA — bukaan ini jauh lebih sering
   terbuka daripada kesannya.

   CARA MENGHITUNGNYA IKUT DITULIS, karena angkanya berbeda jauh tergantung
   apa yang disebut "panggilan gambar". Diukur di halaman sungguhan (rAF
   distub, frame() dipanggil manual +16,7 ms, ruangan kosong): pembungkusnya
   mencatat total per frame DAN bagian yang terjadi di dalam
   gambarSisipKadis() sendiri, jadi tidak ada derau antar-frame — sepuluh
   frame berturut-turut memberi angka bukaan yang persis sama.
     yang dihitung          tertutup (t=0)      terbuka (ruang kosong)
     8 metode yang MELUKIS  42 dari 1.669       169 dari 1.805
     (fillRect/strokeRect/clearRect/fillText/strokeText/fill/stroke/drawImage)
     46 metode ctx 2D       42 dari 1.826       176 dari 1.969
     (seluruh fungsi di CanvasRenderingContext2D.prototype peramban ini,
      termasuk save/restore/clip/translate)
   Dibanding sisa frame-nya: +2,6 % saat tertutup, +10 % saat terbuka.
   Perhatikan baris tertutup: angkanya SAMA di kedua hitungan — saat t=0
   fungsinya pulang sebelum klipSisip(), jadi nol save/restore/clip. Selisih
   dua hitungan cuma muncul saat terbuka, dan cuma 7 panggilan.
   Tamu yang berdiri di dalam tidak ditambahkan ke tabel ini: mereka toh
   digambar ke mana pun mereka berdiri, jadi bukan ongkos bukaan. */
const SISIP_TAHAN_MS = 6000;
const SISIP_ZOOM = 4;      // klik bukaan: bidikan 120x89 px; bukaan 72x46 muat lega
const SISIP_LANTAI = 58;   // garis lantai DI DALAM bukaan
const RUANG_KADIS = { t: 0, buka: false, kosongSejak: 0, zoom: false, paksaSampai: 0 };

/* Setelan (index.html #setSisipKadis): 'auto' membuka saat ada tamu,
   'selalu' membiarkannya terbuka, 'mati' membuat perilakunya PERSIS seperti
   sebelum fitur ini ada (pegawai berhenti di ambang pintu, tidak ada yang
   dipindah). Diisi malas karena `ingatan` baru dideklarasikan jauh di bawah
   berkas ini — memanggilnya di top-level sini kena TDZ.

   SEJAUH MANA "PERSIS" ITU BENAR, DIUKUR: dengan 'mati', gambarSisipKadis()
   pulang di baris pertama (`if (!sisipBoleh()) return;`), jadi DINDINGNYA
   nol piksel berbeda dari ruangan sebelum fitur ini ada — seluruh kanvas,
   diukur di tiga jam berbeda. Sembilan titik sentuh lain juga diam:
   tamuKadis() 0, tidak ada p.sisip, a.diKadis tidak pernah true, prolog
   keluarKadis() langsung return, RUANG_KADIS.zoom false, klikSisip() false.
   SATU yang TIDAK ikut mati, dan disebut supaya tidak ada yang mengira
   'mati' berarti nol jejak: STATIONS.agent.slots=3/step=12 berlaku di
   ketiga setelan, jadi tempat berdiri antrean di depan pintu kadis memang
   berubah (dulu menyebar ke kiri sampai x=357, sekarang 440/452/464).
   Itu tambalan cacat lama yang berdiri sendiri — alasannya ditulis di
   tabel STATIONS — bukan bagian dari bukaan, dan sengaja tidak digerbangi
   setelan ini. */
let sisipMode = null;
function sisipSetelan() {
  if (sisipMode == null) {
    const dariUrl = RUANG_URL === 'kadis' ? 'selalu' : RUANG_URL === 'mati' ? 'mati' : '';
    const v = dariUrl || ingatan.baca('sisipKadis', 'auto');
    sisipMode = v === 'selalu' || v === 'mati' ? v : 'auto';
  }
  return sisipMode;
}
function sisipSetel(v) {
  sisipMode = v === 'selalu' || v === 'mati' ? v : 'auto';
  if (sisipMode !== 'mati') return;
  RUANG_KADIS.paksaSampai = 0;
  /* Yang sedang di dalam TIDAK CUKUP dikeluarkan: keluarKadis() menaruhnya di
     (452, LANE_UP) dengan path kosong, dan handle() cuma memanggil goTo saat
     STASIUNNYA berganti (`if (a.station !== st) a.goTo(st)`), jadi tool call
     mcp__ berikutnya tidak akan memindahkannya — dia mematung di lajur sampai
     ada tool call stasiun lain. Suruh dia berbaris lagi di ambang pintu. */
  for (const a of penghuni()) {
    if (!a.diKadis && !a.sisipFase) continue;
    const st = a.station;
    keluarKadis(a);
    if (st === 'agent') a.goTo('agent');
  }
}
/* Putar ulang cepat (?ulang=YYYY-MM-DD&laju=8): pembukaan otomatis dimatikan
   dan tidak ada yang dipindah ke dalam — tanpa ini bukaannya berkedip
   puluhan kali per detik. Klik untuk zoom tetap bekerja. */
const sisipUlangCepat = () => !!ULANG_URL && ULANG_LAJU > 2;
function sisipBoleh() {
  return !MODE_KADIS && sisipSetelan() !== 'mati' && !sisipUlangCepat();
}

function tamuKadis() {
  let n = 0;
  for (const a of penghuni()) if (a.diKadis) n++;
  return n;
}
/* Orang yang BERHENTI di ambang pintu kadis (452,140). Termasuk pemeran
   event ambient yang memakai goToXY(452,152,'up') dengan doingEvent
   'melapor ke kadis' / 'menghadap kadis'. Fungsi ini TIDAK MEMINDAHKAN
   siapa pun — dia cuma menyibak gordennya, jadi berkas event yang sudah ada
   dapat pembayaran visualnya tanpa satu byte pun diubah di public/event/. */
function pintuSibuk() {
  let n = 0;
  for (const a of penghuni()) {
    if (a.diKadis || a.path.length) continue;
    if (Math.abs(a.x - 452) <= 14 && Math.abs(a.y - 140) <= 14) n++;
  }
  return n;
}
function sisipHidup() {
  if (!sisipBoleh()) return false;
  if (sisipSetelan() === 'selalu') return true;
  // diklik saat tertutup: sibakkan gordennya sebentar. Tanpa ini klik pada
  // bukaan yang sedang tertutup tidak memberi umpan balik apa pun — zoomnya
  // menyala lalu dilepas lagi oleh tickSisip di ketukan yang sama.
  if (now < RUANG_KADIS.paksaSampai) return true;
  return tamuKadis() > 0 || pintuSibuk() > 0;
}

function tickSisip(dt) {
  const R = RUANG_KADIS;
  if (!kadisNpc) buatKadis();
  tickSisipOrang();
  const mau = sisipHidup();
  if (mau) R.kosongSejak = 0;
  else if (!R.kosongSejak) R.kosongSejak = now;
  // Tahan SISIP_TAHAN_MS sesudah ruangan kosong — TAPI cuma selama bukaannya
  // memang masih boleh hidup: memilih setelan 'mati' (atau membuka ?kadis=1,
  // atau putar ulang cepat) harus menutupnya SEKARANG, bukan enam detik lagi.
  R.buka = !!(mau || (sisipBoleh() && R.t > 0 && R.kosongSejak
    && now - R.kosongSejak < SISIP_TAHAN_MS));
  // prefers-reduced-motion & kunci kroma: POTONGAN, bukan animasi. Gorden
  // yang beranimasi di atas kunci kroma muncul sebagai kilatan di OBS.
  const potong = geraKurang.matches || MODE_OVERLAY === 'chroma';
  const ms = R.buka ? SISIP_BUKA_MS : SISIP_TUTUP_MS;
  const langkah = potong ? 1 : Math.max(0, dt) * 1000 / ms;
  R.t = Math.max(0, Math.min(1, R.t + (R.buka ? langkah : -langkah)));
  if (!R.buka && R.t === 0) R.zoom = false;      // bukaan tertutup: lepas zoom
}

/* Klip ke bukaan yang SEDANG tersibak: gorden vitrase ditarik ke dua sisi,
   jadi yang terbuka adalah pita di tengah yang melebar. Dipakai isi ruangan
   DAN partikel bercap p.sisip. */
function klipSisip(fn) {
  const D = SISIP_DALAM, t = RUANG_KADIS.t;
  if (t <= 0) return;
  const lebar = Math.max(1, Math.round(D.w * t));
  const kiri = Math.round(D.x + (D.w - lebar) / 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(kiri, D.y, lebar, D.h);
  ctx.clip();
  fn();
  ctx.restore();
}

/* Titik berdiri tamu, koordinat DUNIA sungguhan (bukan koordinat lokal
   bukaan). Semua y <= 100: agenDiTitik() memakai kotak klik cy dalam
   [a.y-30, a.y+5], sedangkan pegawai di stasiun dinding ruang utama berdiri
   di y=138..141 (kotak 108..146). y=73 memberi kotak 43..78 yang tidak
   pernah beririsan — dan itu berlaku juga untuk pegawai stasiun 'edit' yang
   slot ke-4/ke-6-nya kebetulan mendarat di x=324 dan x=343.
   Bukaannya mendatar (67x36 di dalam), jadi tamunya BERJAJAR, tidak
   bertumpuk: drawPerson memakan 16 px lebar, jarak antar slot 16..24 px.
   Slot ketiga berdiri semeter lebih ke belakang supaya barisannya tetap
   punya kedalaman, bukan tiga sosok sejajar.

   YANG DIURUS BELAKANGAN: tamu saling tidak menutupi, tapi slot kedua dulu
   berdiri di x=322 sementara kadis berdiri di x=325 — selisih 3 px pada
   sprite selebar 16 px, jadi tamu itu sendiri menutup separuh badan
   kadisnya. Diukur di halaman sungguhan (diff piksel di dalam SISIP_DALAM:
   kadis digambar sendirian, lalu tiga tamu ditumpuk di atasnya):
     kadis 325 · tamu 302/322/342   355 px badan, 171 tertutup  (48 %)
     kadis 329 · tamu 302/318/342   355 px badan,  55 tertutup  (15 %)
   Slot kedua turun ke 318 dan kadis bergeser ke 329; kursi masing-masing
   ikut pindah (drawKursiTamu 317->313, drawKursiKadis 319->323) supaya tidak
   ada yang berdiri di sebelah kursinya sendiri. Sisa 15 % itu bahu yang
   memang bersinggungan — barisan empat orang di ruangan selebar 67 px. */
const KADIS_TITIK = [
  { x: 302, y: 73, hadap: 'up' },
  { x: 318, y: 73, hadap: 'up' },
  { x: 342, y: 69, hadap: 'up' },
];
// ambang dalam: tepi kanan bukaan, sisi yang menghadap pintu kadis sungguhan
const SISIP_AMBANG = { x: 350, y: 71 };

/* Tabel sort SENDIRI. Sengaja TIDAK memakai PROPS, TIDAK memakai aturan pita
   lajur bawah 230..266, dan TIDAK memakai SORT_KURSI_DEKAT — ruangan ini
   punya denahnya sendiri. Memisahkan tabelnya juga yang membuat golden
   uji-zorder.mjs tidak bergeser satu baris pun.
   Urutan: kursi kadis 56 < kadis 65 < meja jati 68 < tamu (a.y mentah,
   69..73) < kursi tamu 74 (sandarannya di depan tamu yang duduk). */
const PROPS_KADIS = [
  { sortY: 56, draw: drawKursiKadis },
  { sortY: 68, draw: drawMejaKadis },
  { sortY: 74, draw: drawKursiTamu },
];

/* ---------------------------------------------------- kadis NPC permanen ---
   JANGAN masukkan ke penghuni() — kalau masuk, dia bocor ke S.orang,
   bisaDipinjam(), daftar kru, hitungan kamera 'ikut', dan bisa diseret event
   acak ke pantry; itu melanggar Aturan 2 lewat pintu belakang. Dia bukan
   sesi, bukan peserta, bukan standby: cuma satu objek berbentuk pegawai yang
   dibaca drawPerson(). Tidak masuk log, tidak menaikkan statistik apa pun.
   Dibuat MALAS (dari tickSisip) karena jabatanDari() dideklarasikan sesudah
   blok ini di berkas — memanggilnya di top-level sini kena TDZ. */
let kadisNpc = null;
function buatKadis() {
  kadisNpc = {
    id: 'kadis-npc',
    peran: 'kadis',
    // pal DIAMBIL LANGSUNG dari tabel jabatan (bukan disalin) supaya dia ikut
    // terapkanSeragamHarian(): Rabu putih, Jumat batik, sama seperti seluruh
    // warga kantor ini. Pimpinan yang tidak ikut aturan seragam bikin
    // ruangannya langsung terbaca sebagai set panggung.
    pal: jabatanDari('kadis').pal,
    // 329, bukan 325: kursinya ikut pindah ke 323..334 supaya badannya
    // (324..333) bebas dari tamu slot kedua di 318 — lihat KADIS_TITIK.
    x: 329, y: 65,           // berdiri di balik meja jati (sortY 68 menutup kakinya)
    slot: 0, slotIdx: 0,
    station: 'kadis-meja',        // BUKAN kunci STATIONS mana pun: slotBebas() tidak pernah menghitungnya
    state: 'idle',
    face: 'down', hadap: 'down',
    path: [], phase: 3.1,
    busyUntil: 0, arrivedAt: 0, lastEvent: 0,
    adaTugas: false, betah: true, standby: false, keluar: false,
    eventKerja: null, doing: '', doingEvent: '',
    alpha: 1, miring: 0, mulut: false, sandal: false,
    bawa: null, bawaSampai: 0, pose: null, laju: 1, bekuSampai: 0,
    butuh: null, macet: null, fx: null, stampUp: false,
    stamina: 1, antre: 0, tibaSampai: 0, dudukSejak: 0, bangunSejak: 0,
    tolehSampai: 0, tolehRekan: null, tolehBalik: null, legaSampai: 0, gagalBerturut: 0,
    tungguSejak: 0, tungguTotal: 0, calls: 0, gagal: 0,
    pulang: '', diKadis: false, sisipFase: '', sisipT: 0, sisipKeluar: 0,
    say() {}, goTo() {}, goToXY() {},
  };
  Object.defineProperty(kadisNpc, 'diam', { get() { return !kadisNpc.path.length; } });
  return kadisNpc;
}

/* --------------------------------------------------- masuk & keluar ruang ---
   ATURAN 1 UTUH. Kontrak stasiun 'agent' tidak berubah: titik tujuannya
   tetap (452,140), route()/goTo()/slotBebas() tidak disentuh, arrive() tetap
   terjadi DI DEPAN PINTU dan di situlah state jadi 'work'. Semua yang
   sesudah arrive() murni kosmetik: station, doing, busyUntil, calls, token,
   log, dan statistik apa pun TIDAK DISENTUH (Aturan 2). Keluarnya nol
   milidetik — alpha dipulihkan SAMBIL route() sudah berjalan. */
function masukKadis(a) {
  if (a.diKadis || a.sisipFase || !sisipBoleh()) return;
  a.sisipFase = 'pudar';        // memudar DI AMBANG dulu, baru muncul di dalam
  a.sisipT = now;
}
/* SATU penolong, dipanggil dari SEMUA jalur mutasi posisi (goTo, goToXY,
   pulangKantor, setelan 'mati'). Jangan menaburkan logika pembersihan: satu
   jalur yang lolos berarti pegawai yang tidak pernah digambar lagi padahal
   tetap hidup, tetap di-update, dan tetap masuk statistik. */
function keluarKadis(a) {
  if (!a || (!a.diKadis && !a.sisipFase)) return;
  if (a.diKadis) {
    a.diKadis = false;
    a.x = 452;
    a.y = LANE_UP;
    a.path = [];
    a.alpha = 0.4;              // dipulihkan tickSisipOrang() SAMBIL route() sudah jalan
    a.sisipKeluar = now;
  } else {
    a.alpha = 1;                // batal memudar di ambang: kembali utuh seketika
    a.sisipKeluar = 0;
  }
  a.sisipFase = '';
  a.sisipT = 0;
}
/* Satu tempat untuk seluruh peralihan alpha masuk/keluar, dipanggil
   tickSisip() dari frame() SEBELUM loop update — jadi ritual pulang
   (tickPulang) yang juga menulis a.alpha tetap menang di frame yang sama. */
function tickSisipOrang() {
  for (const a of penghuni()) {
    if (a.sisipFase === 'pudar') {
      // ada yang menyuruhnya jalan di tengah memudar (event menulis a.path
      // langsung): batalkan, jangan menyeretnya masuk dari tengah ruangan
      if (a.path.length) { a.sisipFase = ''; a.sisipT = 0; a.alpha = 1; continue; }
      const k = Math.min(1, (now - a.sisipT) / SISIP_PUDAR_MS);
      a.alpha = 1 - k * 0.85;
      if (k >= 1) {
        const titik = KADIS_TITIK[Math.min(a.slotIdx || 0, KADIS_TITIK.length - 1)];
        a.diKadis = true;
        a.x = SISIP_AMBANG.x;
        a.y = SISIP_AMBANG.y;
        a.hadap = titik.hadap;
        a.face = 'left';
        // jalan lurus di dalam ruangan; JANGAN route() — route() memutari
        // meja rapat ruang utama dan akan menyeretnya keluar bukaan
        a.path = [{ x: titik.x, y: titik.y }];
        a.sisipFase = 'terang';
        a.sisipT = now;
      }
    } else if (a.sisipFase === 'terang') {
      const k = Math.min(1, (now - a.sisipT) / SISIP_PUDAR_MS);
      a.alpha = 0.15 + 0.85 * k;
      if (k >= 1) { a.alpha = 1; a.sisipFase = ''; a.sisipT = 0; }
    } else if (a.sisipKeluar) {
      const k = Math.min(1, (now - a.sisipKeluar) / 160);
      a.alpha = 0.4 + 0.6 * k;
      if (k >= 1) { a.alpha = 1; a.sisipKeluar = 0; }
    }
  }
}

/* Bidikan kamera ke bukaan (klik). Dipanggil dari gerbang paling awal
   kameraBidik() — satu-satunya sentuhan blok kamera dari fitur ini. */
function sisipBidik() {
  KAMERA.targetX = SISIP.x + SISIP.w / 2;
  KAMERA.targetY = SISIP.y + SISIP.h / 2;
  KAMERA.targetZoom = SISIP_ZOOM;
}
/* Klik di dalam kotak bukaan yang TIDAK mengenai pegawai (pegawai menang
   dulu, aturan yang sudah ada di canvas click) menyalakan / mematikan zoom. */
function klikSisip(cx, cy) {
  if (!sisipBoleh()) return false;      // setelan 'mati' / ?kadis=1: tidak ada bukaan untuk diklik
  if (cx < SISIP.x || cx > SISIP.x + SISIP.w || cy < SISIP.y || cy > SISIP.y + SISIP.h) return false;
  RUANG_KADIS.zoom = !RUANG_KADIS.zoom;
  // Menyalakan zoom sekaligus MENYIBAK gordennya selama SISIP_TAHAN_MS,
  // walau ruangannya sedang kosong: zoom ke gorden tertutup itu umpan balik
  // yang mati. Mematikan zoom melepas paksaan itu — bukaannya kembali
  // menutup sendiri lewat tahan biasa.
  RUANG_KADIS.paksaSampai = RUANG_KADIS.zoom ? now + SISIP_TAHAN_MS : 0;
  return true;
}

/* Jendela BACA untuk harness uji (uji-sisip.mjs). Deklarasi FUNGSI, bukan
   const: di classic script cuma function declaration yang otomatis jadi
   properti objek global, jadi harness bisa mengambil konstanta blok ini
   tanpa menyentuh __jembatan__ milik uji-event.mjs (berkas orang lain).
   Tidak ada jalur MUTASI khusus uji di sini: yang dikembalikan objek
   aslinya, dan yang mengubah keadaan tetap sisipSetel()/klikSisip()/
   tickSisip() yang dipakai halaman sungguhan. */
function sisipRujukan() {
  return {
    SISIP, SISIP_DALAM, SISIP_AMBANG, SISIP_ZOOM, SISIP_TAHAN_MS, SISIP_PUDAR_MS,
    SISIP_LANTAI, KADIS_TITIK, PROPS_KADIS, RUANG_KADIS, kadisNpc,
    KAMERA, LANE_UP, LANE_DOWN, parts,
  };
}

/* ------------------------------------------------------------- gambar isi --- */
function gambarSisipKadis() {
  const D = SISIP_DALAM;
  /* Setelan 'mati' (dan ?kadis=1, dan putar ulang cepat) berarti BENAR-BENAR
     TIDAK ADA JEJAK VISUAL: bukan bukaan tertutup, melainkan dinding polos
     seperti sebelum fitur ini ada. Tanpa gerbang ini bingkai + gorden tetap
     terlukis permanen dan "mati" bohong. */
  if (!sisipBoleh()) return;
  // tertutup: bingkai + gorden saja, nol pemanggilan drawPerson
  if (RUANG_KADIS.t <= 0) { drawKusenSisip(); drawGordenSisip(); return; }
  klipSisip(() => {
    drawDindingKadis();
    drawKarpetKadis();
    const lapis = [];
    for (const p of PROPS_KADIS) lapis.push({ y: p.sortY, fn: p.draw });
    if (kadisNpc) lapis.push({ y: kadisNpc.y, fn: () => drawPerson(kadisNpc) });
    for (const a of penghuni()) {
      if (!a.diKadis) continue;
      lapis.push({ y: a.y, fn: () => { if (a === terpilih) drawSorot(a); drawPerson(a); } });
    }
    lapis.sort((m, n2) => m.y - n2.y);
    for (const l of lapis) l.fn();
    // Selubung dalam: ruangan di balik dinding sedikit lebih redup daripada
    // ruang utama — itu yang bikin bukaan terbaca sebagai LUBANG, bukan
    // poster yang ditempel.
    ctx.globalAlpha = 0.16;
    r(D.x, D.y, D.w, D.h, '#1c2a20');
    ctx.globalAlpha = 1;
  });
  drawKusenSisip();
  drawGordenSisip();
}

/* Kusen: dua tiang jati 3 px + 'reveal' (sisi dalam tembok) yang lebih gelap
   di tepi dalam. Reveal itulah yang mengubah bingkai datar jadi bukaan
   bertebal — beda antara "gambar tergantung" dan "lubang tembus". */
function drawKusenSisip() {
  const S1 = SISIP;
  const x2 = S1.x + S1.w, y2 = S1.y + S1.h;
  r(S1.x, S1.y, S1.w, 6, P.woodD);                       // ambang atas
  r(S1.x, S1.y, S1.w, 1, sh(P.wood, 1.15));
  r(S1.x, S1.y, 3, S1.h, P.woodD);                       // tiang kiri
  r(x2 - 3, S1.y, 3, S1.h, P.woodD);                     // tiang kanan
  r(S1.x + 1, S1.y + 6, 1, S1.h - 10, sh(P.wood, 1.1));  // sorot di tiang kiri
  r(S1.x, y2 - 4, S1.w, 4, P.wood);                      // ambang bawah
  r(S1.x, y2 - 4, S1.w, 1, sh(P.wood, 1.25));
  r(S1.x, y2 - 1, S1.w, 1, sh(P.woodD, 0.75));
  // reveal: tepi dalam yang lebih gelap, memberi tebal tembok
  ctx.globalAlpha = 0.42;
  r(S1.x + 3, S1.y + 6, 2, S1.h - 10, '#1a140d');
  r(x2 - 5, S1.y + 6, 2, S1.h - 10, '#1a140d');
  r(S1.x + 3, S1.y + 6, S1.w - 6, 2, '#1a140d');
  ctx.globalAlpha = 1;
  // Plang kuningan di ambang atas. Bukti "tidak ada lantai dua" lewat
  // tipografi, bukan lewat komentar kode — gaya papan denah evakuasi kantor
  // dinas. Courier 5px memakan ~3 px per huruf: 16 huruf = 48 px, muat di
  // pelat 58 px yang disediakan lebar 72 px.
  r(S1.x + 7, S1.y + 1, S1.w - 14, 4, sh(P.gold, 0.82));
  ctx.fillStyle = '#3a2c05';
  ctx.font = '5px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('SAYAP TIMUR LT 1', S1.x + 9, S1.y + 3.5);
  /* TIDAK ADA "leher" yang menjulur ke kusen pintu kadis seperti rancangan
     awal, dan itu bukan kemalasan: pintunya 78 px di sebelah kanan, dan rak
     PC server (rangka luar 362..420, y31..120) berdiri PERSIS di antaranya —
     apa pun yang menjulur ke sana mendarat di rak. Yang menyambungkan bukaan
     ini ke pintu itu bukan garis, melainkan isinya: daun pintu dalam di tepi
     kanan ruangan (drawPintuDalam) plus titik kuningan di plat tendang pintu
     kadis (drawKadis). Diukur: seluruh gambar fungsi ini berada di dalam
     kotak SISIP, nol piksel keluar — DAN kotak SISIP sendiri tidak menimpa
     satu piksel pun milik prop lama (lihat uji-sisip.mjs "sapuan prop lama"). */
}

/* Gorden vitrase yang DISIBAK ke dua sisi (bukan digulung): lebarnya
   menyusut dari setengah bukaan ke 2 px saat t naik. */
function drawGordenSisip() {
  const D = SISIP_DALAM, t = RUANG_KADIS.t;
  const penuh = Math.ceil(D.w / 2);
  const lebar = Math.max(2, Math.round(penuh - (penuh - 2) * t));
  for (const kiri of [true, false]) {
    const gx = kiri ? D.x : D.x + D.w - lebar;
    r(gx, D.y, lebar, D.h, '#c9d3c0');
    r(gx, D.y, lebar, 1, '#e2e8dc');
    for (let i = 1; i < lebar; i += 3) r(gx + i, D.y + 1, 1, D.h - 1, sh('#c9d3c0', 0.88));
    r(kiri ? gx + lebar - 1 : gx, D.y, 1, D.h, sh('#c9d3c0', 0.72));   // lipatan tepi dalam
  }
  r(D.x, D.y, D.w, 1, sh(P.woodD, 1.1));                 // rel gorden
}

/* Dinding belakang ruang kadis. Pita warnanya SAMA dengan ruang utama
   (krem — wainscot mint — plin) supaya terbaca sebagai lantai yang sama;
   garis lantainya diangkat ke SISIP_LANTAI karena yang kita lihat cuma
   sepotong ruangan lewat lubang 67x36. Bukaannya MENDATAR — persis seperti
   jendela kaca kantor sungguhan yang lebar dan pendek — jadi denahnya juga
   mendatar: dekor dinding berjajar, bukan bertumpuk. */
function drawDindingKadis() {
  const D = SISIP_DALAM;
  r(D.x, D.y, D.w, SISIP_LANTAI - D.y, sh(P.cream, 0.93));
  r(D.x, 50, D.w, SISIP_LANTAI - 50, sh(P.mint, 0.9));   // wainscot
  r(D.x, 50, D.w, 1, sh(P.rail, 0.9));
  r(D.x, SISIP_LANTAI - 2, D.w, 2, sh(P.base, 0.9));     // plin
  drawFotoPejabat();
  drawLemariPiala();
  drawPintuDalam();
}

/* Foto Presiden dan Wakil Presiden mengapit Garuda — formasi wajib tiap
   ruang pejabat. 7x9 per bingkai, trio-nya berjajar di 293..318 (sepertiga
   kiri dinding); yang penting formasinya, bukan detail wajahnya. */
function drawFotoPejabat() {
  const bingkai = (x, y) => {
    r(x, y, 7, 9, '#6d5535');
    r(x + 1, y + 1, 5, 7, P.paper);
    r(x + 2, y + 2, 3, 2, '#1d1712');
    r(x + 2, y + 4, 3, 2, '#e0ae80');
    r(x + 1, y + 6, 5, 2, '#2c3440');
  };
  // Digeser 1 px ke kanan bersama-sama waktu SISIP.x pindah 289 -> 290:
  // kolom 292 sekarang ada di bawah tiang kiri kusen, dan bingkai foto yang
  // mulai persis di situ akan kehilangan garis tepi kirinya.
  bingkai(293, 40);
  bingkai(312, 40);
  const g = P.gold, gd = sh(P.gold, 0.75);
  const cx = 306, gy = 40;
  r(cx - 5, gy + 1, 10, 2, g);                           // sayap terbentang
  r(cx - 3, gy + 3, 6, 1, g);
  r(cx - 1, gy + 2, 2, 5, g);                            // badan
  r(cx - 1, gy, 2, 2, g);                                // kepala
  r(cx - 2, gy + 7, 4, 1, gd);                           // pita semboyan
}

/* Lemari piala kaca dua rak — penanda ruang pejabat yang paling murah dan
   paling terbaca. Menempel di dinding antara kepala kadis dan daun pintu
   dalam, tidak ikut depth sort. */
function drawLemariPiala() {
  const x = 336, y = 44, w = 9, h = 14;
  r(x - 1, y - 1, w + 2, h + 2, P.woodD);
  r(x, y, w, h, '#2f3a34');
  for (let i = 0; i < 2; i++) {
    const ry = y + 1 + i * 6;
    r(x, ry + 4, w, 1, P.woodD);                         // papan rak
    r(x + 1 + i, ry, 2, 4, i === 1 ? '#cfcfd6' : P.gold);   // piala
    if (i !== 1) r(x + 5, ry + 1, 3, 3, '#e8d873');      // piagam kecil
  }
  ctx.globalAlpha = 0.18;
  r(x, y, w, h, '#dff0ff');                              // pantulan kaca
  ctx.globalAlpha = 1;
}

/* Sisi DALAM pintu kadis, di tepi kanan bukaan — daun pintu cermin dengan
   ENGSEL DI SISI BERLAWANAN dari daun luar (drawKadis menaruh gagangnya di
   kanan, jadi engsel luar di kiri; dilihat dari dalam engselnya jadi di
   kanan). Prop kecil ini yang menanggung seluruh beban ilusi "ini ruangan
   di balik pintu itu" — dan sekaligus alasan kenapa tamu MUNCUL di tepi
   kanan bukaan (SISIP_AMBANG) lalu berjalan ke kiri. */
function drawPintuDalam() {
  const x = 346, y = 41, w = 12, h = 17;
  r(x, y, w, h, '#4a3626');
  r(x + 1, y + 1, w - 2, h - 1, '#6b4a30');
  r(x + 2, y + 3, w - 4, 5, sh('#6b4a30', 0.86));        // panel atas
  r(x + 2, y + 10, w - 4, 5, sh('#6b4a30', 0.86));       // panel bawah
  r(x + 2, y + 11, 2, 2, P.gold);                        // gagang: sisi KIRI, cermin dari daun luar
  r(x + w - 1, y, 1, h, sh('#4a3626', 1.3));             // engsel di kanan
}

/* Karpet merah tua khas ruang pejabat, di atas ubin yang sama dengan ruang
   utama. Digambar di lapisan lantai, tidak ikut depth sort. */
function drawKarpetKadis() {
  const D = SISIP_DALAM;
  const bawah = D.y + D.h;
  r(D.x, SISIP_LANTAI, D.w, bawah - SISIP_LANTAI, P.tile);
  for (let y = SISIP_LANTAI + 5; y < bawah; y += 9) r(D.x, y, D.w, 1, P.grout);
  r(D.x + 3, 62, D.w - 6, bawah - 62, '#743030');        // karpet merah tua
  r(D.x + 5, 64, D.w - 10, bawah - 64, '#8d3a3a');
  r(D.x + 5, 64, D.w - 10, 1, '#a04747');
}

function drawMejaKadis() {
  const x = 306, y = 62, w = 36, h = 8;
  r(x, y, w, h, P.woodD);                                // papan meja jati
  r(x, y, w, 2, sh(P.wood, 1.05));
  r(x, y + h - 1, w, 1, sh(P.woodD, 0.7));
  r(x + 2, y + h, 2, 4, sh(P.woodD, 0.8));               // kaki
  r(x + w - 4, y + h, 2, 4, sh(P.woodD, 0.8));
  r(x, y + 1, w, 1, P.gold);                             // lis kuningan
  r(x + 3, y + 3, 8, 3, P.paper);                        // tumpukan map disposisi
  r(x + 3, y + 3, 8, 1, '#c9a03a');
  r(x + 27, y + 3, 6, 2, '#2c3440');                     // telepon kabel
  r(x + 32, y + 1, 1, 3, '#2c3440');
  drawBenderaMeja(x + 16, y);
}

/* Sepasang bendera meja: merah putih + panji dinas, di ujung meja. */
function drawBenderaMeja(x, y) {
  r(x, y - 7, 1, 8, '#9aa1a6');
  r(x + 1, y - 7, 3, 2, P.red);
  r(x + 1, y - 5, 3, 2, '#f4f2ec');
  r(x + 5, y - 6, 1, 7, '#9aa1a6');
  r(x + 6, y - 6, 3, 2, '#c9a03a');
  r(x + 6, y - 4, 3, 2, '#1c4e8a');
}

/* Kursi kadis sandaran tinggi, di belakang mejanya. sortY 56: digambar
   SEBELUM kadis (y=65), jadi badan kadisnya menutupi dudukan — dia berdiri
   di depan kursinya, bukan menempel di sandaran. */
function drawKursiKadis() {
  // 323, bukan 319: kursi ikut kadisnya waktu dia bergeser ke x=329, jadi
  // dia tetap berdiri PERSIS di depan kursinya. 323..334 masih berhenti
  // sebelum lemari piala (335..345).
  const x = 323, y = 45, w = 12;
  r(x, y, w, 9, '#3a3f45');                              // sandaran
  r(x, y, w, 1, '#5a6068');
  r(x + 1, y + 2, w - 2, 5, sh('#3a3f45', 1.25));
  r(x + 1, y + 9, w - 2, 3, '#2c3038');                  // dudukan
  r(x + 5, y + 12, 2, 5, '#5a6068');                     // tiang
}

/* Dua kursi tamu kayu. sortY 74: sandarannya digambar DI DEPAN tamu di
   y=69..73, idiom yang sama dengan SORT_KURSI_DEKAT di meja rapat — itu yang
   bikin tamunya terbaca duduk menghadap kadis. Sandarannya sengaja rendah
   supaya kepala dan bahu tetap kelihatan, dan kakinya memang terpotong
   ambang bawah bukaan: itu memang yang terlihat dari sebuah jendela. */
function drawKursiTamu() {
  const kursi = (x) => {
    r(x, 67, 10, 5, P.wood);                             // sandaran rendah
    r(x, 67, 10, 1, sh(P.wood, 1.2));
    r(x, 72, 10, 2, P.woodD);                            // dudukan
    r(x + 1, 74, 1, 1, sh(P.woodD, 0.8));
    r(x + 8, 74, 1, 1, sh(P.woodD, 0.8));
  };
  // Tengah kursi menempel ke titik berdiri tamunya: 296..305 untuk slot 302,
  // 313..322 untuk slot 318 (dulu 317, ikut turun bersama slot keduanya).
  kursi(296);
  kursi(313);
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

/* Mesin absen sidik jari — fixture permanen di dinding kanan dekat pintu
   kadis, dipakai dua event berbeda (absensi-ngambek, absen-fingerprint) yang
   TIDAK BOLEH masing-masing menggambar mesinnya sendiri: perangkat ini cuma
   ada satu di kantor mana pun. y=100 (bukan 76 dari catatan aslinya) supaya
   terjangkau dari LANE_UP tempat kepala pegawai berada (~y140). */
function drawAbsensi() {
  const x = 424, y = 100;
  r(x, y, 9, 13, '#dfe2e6');
  r(x, y, 9, 1, '#f2f4f6');
  r(x + 2, y + 3, 5, 3, '#141a20');
  const merah = RUANGAN.absensiMerah;
  const hijau = Math.sin(now / 500) > 0 ? '#57d06a' : '#3e9450';   // berkedip pelan, menganggur
  r(x + 3, y + 4, 3, 1, merah ? '#e8453f' : hijau);
  r(x + 2, y + 7, 5, 4, merah ? '#e8a0a0' : '#5fb56a');    // bantalan jempol
}

/* Surat edaran ditempel — dinding kiri jauh, di atas lemari arsip, area yang
   genuinely kosong (arsip sendiri baru mulai y30). Menetap sampai edaran
   berikutnya menggantinya; permanen, jadi harus jadi prop sungguhan bukan
   milik satu event. */
function drawEdaran() {
  RUANGAN.edaran.forEach((e, i) => {
    const x = 4 + i * 3, y = 10;
    ctx.globalAlpha = e.kusam ? 0.6 : 1;
    r(x + (e.miring ? 1 : 0), y, 9, 11, P.paper);
    r(x + (e.miring ? 1 : 0), y, 9, 2, P.red);
    for (let l = 0; l < 3; l++) r(x + 2 + (e.miring ? 1 : 0), y + 4 + l * 2, 5, 1, '#b9c0ca');
    ctx.globalAlpha = 1;
  });
}

/* Papan nomor antrean loket — dinding di atas ruang tunggu, cukup jauh dari
   APAR (330,94..118) dan dispenser (bx=244). */
function drawNomorAntre() {
  const x = 210, y = 30;
  r(x, y, 16, 10, '#3a3f45');
  r(x + 1, y + 1, 14, 8, '#141a20');
  const digit = (dx, n) => {
    // digit dari rect 1 px, bukan fillText — huruf 5px lumer jadi noda
    const pola = {
      0: [1, 1, 1, 1, 0, 1, 1, 1, 1], 1: [0, 1, 0, 0, 1, 0, 0, 1, 0],
      2: [1, 1, 1, 0, 1, 1, 1, 0, 1], 3: [1, 1, 1, 0, 1, 1, 1, 1, 1],
      4: [1, 0, 1, 1, 1, 1, 0, 0, 1], 5: [1, 1, 1, 1, 1, 0, 1, 1, 1],
      6: [1, 1, 1, 1, 1, 0, 1, 1, 1], 7: [1, 1, 1, 0, 0, 1, 0, 0, 1],
      8: [1, 1, 1, 1, 1, 1, 1, 1, 1], 9: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    }[n] || [0, 0, 0, 0, 0, 0, 0, 0, 0];
    pola.forEach((on, i) => { if (on) r(dx + (i % 3), y + 2 + ((i / 3) | 0) * 2, 1, 1, '#e8453f'); });
  };
  const s = String(Math.max(0, Math.min(99, RUANGAN.antre))).padStart(2, '0');
  digit(x + 3, +s[0]); digit(x + 9, +s[1]);
}

/* Benda kecil yang menetap di lantai sampai ada yang memungutnya — map yang
   ditolak kadis, map yang dititipkan menunggu paraf. Satu array generik,
   bukan satu field per event, supaya event baru tidak perlu prop baru. */
function drawPropLantai() {
  for (const p of RUANGAN.propLantai) {
    if (p.jenis === 'map-merah') {
      r(p.x, p.y, 12, 5, '#c9a03a');
      ctx.save(); ctx.translate(p.x + 9, p.y + 1); ctx.rotate(0.14);
      r(-3, -1.5, 6, 3, '#c22b2b'); ctx.restore();
    } else if (p.jenis === 'map-menunggu') {
      r(p.x, p.y, 12, 5, '#e8a0a8');
    } else if (p.jenis === 'daun') {
      r(p.x, p.y, 2, 2, '#4f8a56');
    } else if (p.jenis === 'kertas-bekas') {
      r(p.x, p.y, 4, 3, '#e4ddc8');
    }
  }
}

// Stiker inventaris — satu titik per perabot, digambar dari SATU fungsi
// supaya tujuh fungsi gambar perabot yang sudah ada tidak perlu disentuh.
const STIKER_TITIK = {
  arsip: [30, 114], filing: [110, 114], stempel: [258, 114],
  server: [368, 114], kipas: [392, 288], tunggu: [246, 296], dus: [442, 226],
};
function drawStiker() {
  for (const nama of RUANGAN.stikerTertempel) {
    const t = STIKER_TITIK[nama];
    if (!t) continue;
    r(t[0], t[1], 4, 3, '#e8d873');
    r(t[0], t[1] + 1, 3, 1, '#2c3038'); r(t[0], t[1] + 2, 2, 1, '#2c3038');
  }
}


/* Ruangan pantry: sekat kayu (dinding atas + kiri) di bekas tempat kardus
   arsip -- kanan rak server, bawah pintu kadis. Muat di x414..478 (canvas
   berhenti di 480) supaya tidak mepet kipas (dasarnya cx 400, lihat
   drawKipas) dan tidak menutup jalur ke meja kerja pojok (444, lihat
   MEJA_KERJA_X). Sekatnya cuma dua sisi -- atas & kiri -- sengaja tidak
   ditutup penuh: orang yang lewat ke meja 444 tetap jalan lurus, bukan
   muter cari pintu yang tidak ada. */
function drawPantry() {
  const px = 414, py = 196, pw = 64, ph = 92;

  // sekat: panel kayu rendah, dua sisi
  r(px, py, pw, 7, P.wood);
  r(px, py, pw, 1, sh(P.wood, 1.3));
  r(px, py, 6, ph, P.wood);
  r(px, py, 1, ph, sh(P.wood, 1.3));

  // papan nama gantung, tulisan tangan -- gaya sama dengan plang/spanduk lain
  r(px + 14, py - 9, 26, 9, P.paper);
  r(px + 14, py - 9, 26, 1, '#ffffff');
  ctx.fillStyle = '#2c3440';
  ctx.font = '6px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('PANTRI', px + 17, py - 4);

  // counter nempel sekat atas: wastafel + oven kecil berjajar
  const cy = py + 7;
  r(px + 8, cy, 52, 15, '#c9cdd1');
  r(px + 8, cy, 52, 2, '#e4e7ea');

  r(px + 11, cy + 1, 17, 11, '#4a5560');             // wastafel, kontur -- biar lepas dari counter
  r(px + 12, cy + 2, 15, 9, '#f4f6f8');              // bibir, putih terang
  r(px + 14, cy + 4, 11, 6, '#20242c');              // cekungan, gelap pekat
  r(px + 18, py - 2, 2, 9, '#565d66');               // pipa naik
  r(px + 15, py, 8, 2, '#565d66');                   // kepala keran
  r(px + 16, py, 2, 1, '#a8b1ba');                   // kilau logam
  if (Math.sin(now / 260) > 0.85) r(px + 18, cy + 6, 1, 3, '#7ec8f0');  // tetes sesekali

  r(px + 32, cy + 1, 16, 15, '#33383e');             // oven, badan
  r(px + 34, cy + 4, 12, 9, '#191c21');              // jendela
  r(px + 35, cy + 5, 10, 7, '#2a4f8a');
  r(px + 35, cy - 1, 2, 2, '#c9cdd1'); r(px + 44, cy - 1, 2, 2, '#c9cdd1'); // dial
  r(px + 33, cy + 16, 14, 1, '#7c838a');             // pegangan pintu

  // rak piring digantung di sekat atas, sisi kanan
  r(px + 52, py + 1, 11, 2, P.woodD);
  for (let i = 0; i < 3; i++) {
    r(px + 53 + i * 3, py - 2 - i * 2, 3, 7, '#eef0ea');
    r(px + 53 + i * 3, py - 2 - i * 2, 3, 1, P.blue);
  }

  // kardus arsip pindahan, ditumpuk di sudut sekat -- bekas yang dulu di
  // depan pintu kadis, sekarang jadi stok pantry
  r(px + 8, py + 34, 11, 11, '#a37b4e');
  r(px + 9, py + 35, 9, 4, '#b98d5e');
  r(px + 10, py + 26, 9, 9, '#b98d5e');
  r(px + 11, py + 27, 7, 3, '#a37b4e');
  r(px + 14, py + 27, 2, 8, '#d9cba8');

  // meja makan kecil, satu kaki tengah -- meja kafe, beda siluet dari
  // meja rapat/meja kerja yang semuanya berkaki empat
  const tx = px + 28, ty = py + 56;
  r(tx - 10, ty, 20, 3, P.wood);
  r(tx - 10, ty, 20, 1, sh(P.wood, 1.3));
  r(tx - 2, ty + 3, 4, 9, P.woodD);
  r(tx - 5, ty + 11, 10, 2, P.woodD);
  r(tx - 18, ty + 4, 7, 6, P.woodD);                 // stul kiri
  r(tx + 13, ty + 4, 7, 6, P.woodD);                 // stul kanan
}

/* Dispenser pindah ke sini dari ruang tunggu -- pojok kanan pantry, x462..480
   (stul kanan drawPantry berhenti di 462, kanvas berhenti di 480, jadi pas-pasan
   tanpa nabrak). Desain badannya sama seperti dulu, cuma titik acuan baru
   (dx,dy) menggantikan (bx,by) lama; formula konversi buat siapa pun yang
   nyesuaikan koordinat lama di event-acak.js: x baru = x lama + 136,
   y baru = y lama - 12. Menara gelas numpuk ke ATAS tutup galon, bukan di
   samping seperti dulu -- di kiri sudah kepakai stul kafe. */
function drawDispenserPantry() {
  const dx = 462, dy = 272;
  r(dx, dy - 18, 18, 34, '#eef0ea');
  r(dx, dy - 18, 18, 1, '#ffffff');
  r(dx + 16, dy - 18, 2, 34, '#c9cdd1');
  r(dx + 3, dy - 6, 3, 3, '#c03030');
  r(dx + 9, dy - 6, 3, 3, P.blue);
  r(dx + 2, dy - 1, 11, 2, '#c9cdd1');
  r(dx, dy + 4, 18, 1, '#c9cdd1');
  r(dx + 7, dy + 8, 4, 1, '#c9cdd1');
  // galon: dicabut tukang galon (MOD.galonLepas) — kepala dispenser kosong,
  // dan itu justru bagian yang bikin penggantiannya terasa
  if (!MOD.galonLepas) {
    r(dx + 2, dy - 30, 14, 12, '#7db8e8');
    r(dx + 4, dy - 28, 2, 7, '#b8dcf4');
    r(dx + 7, dy - 34, 4, 4, '#5f9fd4');
  } else {
    r(dx + 5, dy - 20, 8, 2, '#9aa1a6');       // dudukan galon telanjang
  }
  for (let g = 0; g < Math.min(6, RUANGAN.gelasDispenser); g++) {
    r(dx + 7, dy - 40 - g * 2, 4, 3, g % 2 ? '#f2f0e6' : '#e4e0d2');
  }
}

/* Tong sampah menyusul ke pantry juga -- disusupkan di bawah meja kafe
   (kaki mejanya di tx-2..+2 = 440..444, kardus arsip di atasnya berhenti
   di y241), formula konversi dari titik lama: x baru = x lama + 87,
   y baru = y lama - 12. */
function drawTongSampah() {
  const tx = 437, ty = 278;
  r(tx, ty, 9, 10, '#2a4f8a');
  r(tx - 1, ty - 2, 11, 2, '#3f74c4');
  r(tx + 3, ty + 3, 1, 2, '#eef2f6');
  r(tx + 4, ty + 2, 2, 1, '#eef2f6');
  r(tx + 2, ty + 6, 3, 1, '#eef2f6');
  if (RUANGAN.tongPenuh > 0.05) {                          // isinya menyembul
    const n = Math.ceil(RUANGAN.tongPenuh * 5);
    for (let i = 0; i < n; i++) {
      r(tx - 1 + (i * 3) % 9, ty - 5 - (i % 2) * 2, 3, 3,
        ['#f2f0e6', '#d9b96a', '#c9cdd1'][i % 3]);
    }
  }
}

/* Meja buku tamu di pojok kiri bawah — satu-satunya bekas permanen yang
   dibuat oleh TAMU, bukan pegawai. Diletakkan di x52..66 dan bukan di
   x185..199 seperti rancangan awal: slotKe(k,23) dari STATIONS.idle.x=282
   menghasilkan 282,305,259,328,236,351,213,374,190,... — slot ke-8 jatuh
   tepat di x=190, jadi meja di sana akan berdiri di atas kepala pegawai
   ke-9 yang menganggur. Di x52..66 tidak ada slot mana pun (rentang slot
   yang wajar 167..420), tanaman berhenti di x=44, dan papan meja kerja
   slot cx=86 baru mulai di y=322 — sementara meja ini berakhir di y=296. */
function drawBukuTamu() {
  const x = 52, y = 296;                       // y = garis kaki meja
  r(x, y - 8, 14, 3, '#8d5738');               // papan
  r(x, y - 8, 14, 1, '#a56a46');
  r(x + 1, y - 5, 2, 5, '#6b4126');            // dua kaki
  r(x + 11, y - 5, 2, 5, '#6b4126');
  // buku terbuka: dua halaman 5px, punggung 1px di tengah
  r(x + 2, y - 11, 5, 3, '#f2f0e6');
  r(x + 8, y - 11, 5, 3, '#f2f0e6');
  r(x + 7, y - 11, 1, 3, '#cfc9b4');
  // Baris tinta yang MENUMPUK sepanjang sesi. Lima baris pertama mengisi
  // halaman kiri sampai penuh, sisanya pindah ke halaman kanan — jadi
  // halaman kiri memang terlihat lebih padat, persis buku tamu sungguhan.
  const n = Math.min(10, RUANGAN.bukuTamu | 0);
  for (let i = 0; i < n; i++) {
    const kiri = i < 5;
    r(kiri ? x + 3 : x + 9, y - 11 + (kiri ? i : i - 5) % 3, 3, 1, '#3a4a86');
  }
  if (n > 0) r(x + 13, y - 12, 1, 4, '#2f3640');   // bolpoin bertali
}

function drawMejaKerja() {
  // tiap meja menyala sendiri-sendiri: laptop hanya hidup di meja yang ditempati
  const terpakai = new Set();
  for (const a of penghuni()) {
    if (a.station === 'think' && !a.path.length && !a.antre) terpakai.add(a.slotIdx);
  }
  MEJA_KERJA_X.forEach((cx0, i) => {
    // meja yang kakinya belum diganjal bergoyang 1 px, tapi HANYA selagi
    // penghuninya mengetik — meja tidak goyang sendiri
    const goyang = MOD.mejaGetar === i && terpakai.has(i) && Math.sin(now / 70) > 0 ? 1 : 0;
    const cx = cx0;
    // Dulu y dasarnya 306 dengan kaki 28px — meja jadi lebih tinggi dari
    // pegawainya sendiri (tinggi pegawai ~19px kaki-ke-kepala), jadi tangan
    // yang mengetik tidak pernah sampai ke keyboard. Digeser turun 16px dan
    // kakinya dipendekkan supaya papan mejanya jatuh sejajar tangan.
    const x = cx - 32, y = 322 + goyang, w = 64;
    const nyala = (terpakai.has(i) || MOD.mejaHantu === i) && MOD.mejaPadam !== i;
    const terkunci = MOD.slotTerkunci === i;

    r(x, y + 8, w, 6, P.wood);                            // papan meja
    r(x, y + 8, w, 2, sh(P.wood, 1.25));
    r(x + 2, y + 14, 5, 12, P.woodD);                     // kaki
    r(x + w - 7, y + 14, 5, 12, P.woodD);
    r(x + 8, y + 22, w - 16, 3, '#3f2f21');               // palang bawah

    // Kursi kerja pribadi, kompak — punggung menghadap kamera karena
    // pegawainya menghadap meja (sama seperti kursi rapat sisi dekat).
    // Sengaja selalu digambar, bukan cuma waktu meja kosong: waktu ditempati
    // pegawainya digambar SESUDAH ini (sortY meja < sortY pegawai) jadi
    // badannya menutupi kursi persis seperti orang yang benar-benar duduk.
    // Makin kusut, kursi yang mejanya sedang kosong ditinggal serong — tidak
    // ada yang mendorongnya balik ke kolong. Cuma yang KOSONG: kursi yang
    // sedang diduduki tertutup badan pegawainya, jadi menggesernya cuma
    // membuat kakinya menyembul di sisi yang salah. Offsetnya dari tabel
    // (turunan slotIdx), bukan Math.random(), supaya tidak bergeser sendiri
    // tiap frame.
    const serong = kusutKini() > 0.42 && !terpakai.has(i) ? (KUSUT_KURSI[i] || 0) : 0;
    const kx = cx + serong;
    r(kx - 4, 347, 8, 2, '#7c838a');                      // kaki roda
    r(kx - 1, 341, 2, 6, '#9aa1a6');                      // tiang
    r(kx - 6, 337, 12, 4, '#2a4f8a');                     // dudukan
    r(kx - 6, 337, 12, 1, '#3f74c4');
    r(kx - 5, 329, 10, 8, '#2a4f8a');                     // sandaran dari belakang
    r(kx - 5, 329, 10, 2, '#3f74c4');

    // Laptop ditaruh di sisi kanan meja, bukan di tengah: kalau di tengah, dia
    // menutupi dada pegawai yang duduk dan orangnya jadi tidak terbaca.
    const lx = cx + 21, ly = y - 6;
    r(lx - 8, ly, 16, 14, '#9aa1a6');                     // punggung tutup layar
    r(lx - 8, ly, 16, 1, '#c2c8cd');
    // MOD.layarPucat menidurkan layar, MOD.layar melambatkan barisnya,
    // MOD.layarPutih memutihkannya sekejap (kedip serempak / restart),
    // MOD.sidak memaksa terang penuh (kadis lewat: semua kelihatan rajin)
    const napas = MOD.sidak ? 1 : (MOD.layarPucat ? 0.45 + 0.25 * Math.sin(now / 900 + i) : 1);
    r(lx - 7, ly + 1, 14, 11, terkunci ? '#141a20' : (nyala ? lerpHex('#173a96', '#121a2c', MOD.sidak ? 0 : MOD.layarPucat) : '#20242c'));
    if (terkunci) {
      // layar terkunci: empat titik, bukan baris teks — kelihatan langsung beda
      for (const [dx, dy] of [[3, 4], [8, 4], [3, 8], [8, 8]]) r(lx - 6 + dx, ly + dy, 2, 2, '#5a6068');
    } else if (nyala && (MOD.sidak || MOD.layarPucat < 0.95)) {
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

    // lampu meja kecil, sudut kiri (x+0..x+4 — di luar nameplate/tumpukan
    // berkas yang mulai x+6). Menyala kalau mejanya lagi dipakai, pakai
    // ulang state `nyala` yang sudah dihitung di atas untuk layar laptop.
    r(x, y - 7, 5, 3, '#2c3440');                         // kap
    r(x + 2, y - 4, 1, 10, '#1d1712');                    // lengan
    r(x + 1, y + 6, 4, 2, '#1d1712');                     // dudukan
    if (nyala) { r(x + 1, y - 6, 3, 1, '#ffe9a0'); glow(x + 2, y - 6, 8, '#ffe9a0', 0.15); }

    // pot mini di celah kosong tengah meja (antara berkas dan laptop) — bagian
    // dari renovasi: dulu kosong melompong, sekarang mejanya kelihatan dirawat.
    r(x + 33, y + 3, 4, 4, '#8a5a3a');
    r(x + 33, y + 3, 4, 1, '#a8734a');
    r(x + 34, y - 2, 1, 5, '#3e6b4f');
    r(x + 36, y - 1, 1, 4, '#4f8a56');
    r(x + 35, y - 3, 1, 3, '#3e6b4f');

    // sisi kiri meja: dulu cuma gantian nama-plakat/tumpukan-berkas (i%2),
    // sekarang tiap slotIdx punya "kepribadian" sendiri lewat drawMejaTema —
    // requested biar keenam meja tidak terasa kopi-tempel satu sama lain.
    drawMejaTema(i, x, y);
    gambarKusutMeja(i, x, y);                             // tumpukan dokumen yang menumpuk sepanjang hari
    gambarTemaMeja(x, y);                                 // bendera kecil agustusan (tema kalender)
  });
}

/* Tumpukan dokumen yang menumpuk sepanjang hari (RUANGAN.kusut, lihat blok
   "kekusutan harian"). Ditumpuk DI ATAS pernak-pernik tema meja, bukan di
   sebelahnya: zona identitas x+6..+29 sudah terisi penuh di keenam tema, dan
   begitulah meja kantor sungguhan jadi penuh — berkas baru ditaruh di atas
   yang sudah ada, bukan dicarikan tempat kosong. Naik 2 px per lapis seperti
   tumpukanStempel di drawStempel; paling tinggi (4 lapis + lembar teratas)
   mentok y-13, masih di bawah baris gelas event gelas-kopi-menumpuk-senior
   (y=300 = y-22 di meja yang sama) dan tetap di dalam zona bebas x+6..+29.

   Tiap meja dapat urutan warna & zigzag sendiri dari slotIdx supaya keenamnya
   tidak menumpuk seragam — turunan i, bukan Math.random(), jadi tumpukannya
   tidak berkedip tiap frame. */
const KUSUT_MAP = ['#c9a03a', '#e4ddc8', '#b03030', '#3e6b4f', '#8a6844', '#dcd3b8'];
// Berapa lapis MAKSIMUM yang boleh menumpuk di tiap meja — sekaligus lajunya:
// yang kapasitasnya kecil baru mulai menumpuk sesudah tengah hari, yang besar
// sudah menumpuk sejak pagi. Angkanya mengikuti kepribadian meja di
// drawMejaTema, jadi tumpukannya memperkuat karakter yang sudah ada, bukan
// menyeragamkannya: 0 meja rapi (paling tahan), 1 meja berantakan (paling
// cepat menyerah), 5 meja PNS klasik (termos & toples, mejanya memang ramai).
const KUSUT_MEJA_MAKS = [2, 4, 3, 3, 2, 4];
// Offset serong kursi per slotIdx, px. Ada yang ke kiri ada yang ke kanan,
// besarnya beda-beda — kalau seragam kebaca "semua kursi digeser", bukan
// "tidak ada yang membereskannya".
const KUSUT_KURSI = [-3, 2, 3, -2, 2, -3];

function gambarKusutMeja(i, x, y) {
  const k = kusutKini();
  const maks = KUSUT_MEJA_MAKS[i] || 3;
  // +0.45 = pembulatan ke lapis terdekat. Efeknya lapis pertama jatuh di
  // k≈0.14 untuk meja berkapasitas 4 (menjelang jam 10) tapi baru di k≈0.28
  // untuk yang berkapasitas 2 (sesudah tengah hari) -- meja yang pemiliknya
  // rajin memang lebih lama bertahan rapi.
  const lapis = Math.min(maks, Math.floor(k * maks + 0.45));
  if (lapis <= 0) return;

  ctx.globalAlpha = 0.14;                                 // bayangan yang dijatuhkan tumpukan ke barang di bawahnya
  r(x + 7, y - 2, 19, 1, '#3a2f22');
  ctx.globalAlpha = 1;
  // Basisnya y-5, sengaja MENINDIH 1-2 px benda tertinggi tiap tema (bohlam
  // lightstick & daun tanaman mentok y-4, map meja rapi y-3): yang bersentuhan
  // kebaca bertumpu, yang bersih jaraknya kebaca melayang.
  for (let l = 0; l < lapis; l++) {
    const warna = KUSUT_MAP[(i + l * 2) % KUSUT_MAP.length];
    const geser = (i + l) % 3;                            // zigzag: tepinya tidak rata
    const lebar = 20 - l * 2;                             // meruncing ke atas -> tumpukan, bukan balok
    r(x + 6 + geser, y - 5 - l * 2, lebar, 2, warna);
    r(x + 6 + geser, y - 5 - l * 2, lebar, 1, sh(warna, 1.18));
  }
  const atas = y - 5 - (lapis - 1) * 2;                   // baris atas lapis teratas

  // Map yang tidak kebagian tempat disandarkan miring di sisi kanan tumpukan,
  // tangga 2 px ke atas — bersandar, bukan melayang. Ambang & warnanya
  // digilir per meja: enam map merah yang muncul serempak di jam yang sama
  // kebaca sebagai satu efek yang ditempel, bukan enam meja yang kebetulan
  // sama-sama kewalahan.
  if (k > 0.62 + (i % 3) * 0.06) {
    const mw = ['#b03030', '#2f5f8a', '#3e6b4f'][i % 3];
    r(x + 22, atas + 4, 4, 3, mw);
    r(x + 23, atas + 2, 3, 3, mw);
    r(x + 24, atas, 2, 2, sh(mw, 0.82));
  }
  // Lembar teratas nyeruak keluar dari bundelnya, sudutnya terlipat.
  if (k > 0.82) {
    r(x + 8, atas - 2, 12, 2, P.paper);
    r(x + 8, atas - 2, 12, 1, '#f6f3e9');
    r(x + 18, atas - 2, 2, 1, '#c9c2ac');
  }

  // Yang tidak kebagian tempat di atas meja turun ke KOLONG, bertumpu di
  // palang bawah (y+22): dus arsip di kolong meja, pemandangan wajib kantor
  // dinas. x+9..+24 sengaja berhenti sebelum tiang kursi (x+26..+38) dan kaki
  // pegawai yang berdiri di depan mejanya.
  if (k > 0.55) {
    const dus = Math.min(3, Math.floor((k - 0.55) * 6) + 1);
    for (let l = 0; l < dus; l++) {
      const w = 14 - l * 2;
      const dx = x + 9 + (l % 2), dy = y + 20 - l * 2;
      r(dx, dy, w, 2, l % 2 ? '#c2b393' : '#a8977a');
      r(dx, dy, w, 1, l % 2 ? '#d4c5a5' : '#bcab8c');
      r(dx, dy + 1, w, 1, '#6f6350');                     // garis sela: kebaca dus bertumpuk, bukan satu balok
    }
  }
}

// Zona bebas untuk pernak-pernik identitas: x+6..+29 dan y-4..+8 (relatif
// papan meja). Batas itu bukan sembarangan — di kanan ada pot mini (x+33),
// di kiri lampu meja (x+0..+5), dan sandaran kursi (cx±5 = x+27..+37, absolut
// y=329..337) numpuk kalau melebar terlalu jauh ke kanan.
// Tumpukan berkas & gelas versi lama sudah mepet batas ini (sampai x+29) jadi
// dipakai sebagai patokan aman, bukan diperketat lagi.
// Urutan tema di sini SENGAJA cuma ikut urutan slotIdx (indeks di
// MEJA_KERJA_X), tidak ada kaitan dengan mekanik meja pojok (slotIdx===3
// dikunci wifi-sudut-lemah di event-acak.js) — itu soal posisi x, ini cuma
// soal dekorasi, aman dipetakan bebas.
function drawMejaTema(i, x, y) {
  switch (i) {
    case 0:                                                // meja rapi
      r(x + 6, y + 3, 15, 5, '#1d1712');                  // papan nama
      r(x + 7, y + 4, 13, 1, P.gold);
      for (let l = 0; l < 3; l++) {                       // map rata sempurna, tanpa zigzag
        r(x + 8, y + 1 - l * 2, 12, 2, ['#c9a03a', '#3e6b4f', '#b03030'][l]);
      }
      r(x + 21, y + 2, 3, 6, '#e4ddc8');                  // wadah pulpen
      r(x + 21, y, 1, 3, '#c23b3b'); r(x + 22, y - 1, 1, 4, '#3565b0'); r(x + 23, y, 1, 3, '#2c3440');
      break;
    case 1:                                                // meja berantakan
      r(x + 6, y + 7, 12, 2, P.paper);                    // alas
      r(x + 9, y + 3, 16, 2, '#e4ddc8');                  // lapis tengah nongol lebih lebar -> mau longsor
      r(x + 7, y + 0, 10, 2, P.paper);
      r(x + 19, y - 2, 6, 2, '#b03030');                  // map merah nyelip miring paling atas
      r(x + 23, y + 5, 4, 3, '#e4ddc8'); r(x + 24, y + 4, 2, 1, '#c9c2ac');   // kertas kusut
      ctx.globalAlpha = 0.3; ctx.fillStyle = '#6b4a2e';   // noda kopi bekas gelas tumpah
      ctx.beginPath(); ctx.ellipse(x + 27, y + 8.5, 3, 1.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 2:                                                // meja otaku
      r(x + 7, y + 6, 7, 2, '#2c3440');                   // alas pajangan figure
      r(x + 9, y + 2, 3, 3, '#f0c79c');                   // kepala chibi
      r(x + 8, y + 5, 5, 3, P.blue);                      // badan
      r(x + 8, y + 5, 1, 2, '#f0c79c'); r(x + 12, y + 5, 1, 2, '#f0c79c');    // tangan kecil
      for (let l = 0; l < 4; l++) {                       // punggung manga berjajar tegak
        r(x + 16 + l * 3, y + 1, 2, 7, ['#c23b3b', '#d1a326', '#3e6b4f', P.mag][l]);
      }
      break;
    case 3:                                                // meja kpoper
      r(x + 8, y, 2, 8, '#e4ddc8');                       // gagang lightstick
      r(x + 6, y - 4, 5, 4, P.mag);                       // bohlam
      glow(x + 8, y - 2, 6, P.mag, 0.22);
      r(x + 15, y + 1, 5, 7, P.paper); r(x + 16, y + 2, 3, 5, P.blueL);       // photocard 1
      r(x + 20, y + 2, 5, 7, P.paper); r(x + 21, y + 3, 3, 5, '#e8a0a8');     // photocard 2, nyempil lebih rendah
      break;
    case 4:                                                // meja tanaman
      r(x + 7, y + 3, 5, 5, '#8a5a3a'); r(x + 7, y + 3, 5, 1, '#a8734a');     // pot kecil
      r(x + 8, y - 2, 1, 6, '#3e6b4f'); r(x + 10, y - 1, 1, 5, '#4f8a56'); r(x + 9, y - 4, 1, 3, '#3e6b4f');
      r(x + 15, y + 1, 6, 7, '#8a5a3a'); r(x + 15, y + 1, 6, 1, '#a8734a');   // pot sedang
      r(x + 16, y - 4, 1, 6, '#3e6b4f'); r(x + 18, y - 3, 1, 5, '#4f8a56'); r(x + 20, y - 2, 1, 4, '#3e6b4f');
      break;
    default:                                               // meja PNS klasik: termos, toples, foto keluarga
      r(x + 7, y - 1, 5, 9, '#4a7fd0');                   // termos
      r(x + 7, y - 1, 5, 1, '#79b0e8');
      r(x + 8, y - 3, 3, 2, '#2c3440');                   // tutup termos
      r(x + 14, y + 2, 6, 6, '#e8e4d4');                  // toples kaca
      r(x + 15, y + 3, 4, 3, '#d9b96a');                  // isi kue kering
      r(x + 14, y + 1, 6, 1, '#8a6844');                  // tutup toples
      r(x + 22, y - 2, 6, 6, '#8a5a3a');                  // bingkai foto
      r(x + 23, y - 1, 4, 4, '#f0ede2');                  // foto
      break;
  }
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
// Titik berdiri antrean ke-n (1..) di lajur stasiun: garis dari sumbu stasiun
// menjauhi tepi kanvas terdekat, ANTRE_JARAK per orang; lewat ANTRE_TAMPAK
// berimpit di posisi terakhir supaya tidak ada yang berdiri di luar kanvas.
const titikAntre = (s, n) => {
  const arah = s.x > W / 2 ? -1 : 1;
  return Math.max(14, Math.min(W - 12, s.x + arah * ANTRE_JARAK * (Math.min(n, ANTRE_TAMPAK) - 1)));
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

  // Layar mini di tepi belakang meja — dulu papan nama kosong, sekarang
  // meniru baris monitor konsol data di gambar acuan. Footprint sama seperti
  // papan nama lama; mic/gelas/botol/map di bawahnya tidak disentuh.
  for (let k = 0; k < KURSI_N; k++) {
    const nx = R.cx + slotKe(k);
    r(nx - 7, R.yB + 5, 14, 8, '#20242c');
    r(nx - 7, R.yB + 5, 14, 1, '#3a3f45');
    r(nx - 6, R.yB + 6, 12, 6, active ? '#173a96' : '#141a20');
    if (active) {
      for (let p = 0; p < 3; p++) {
        const hgt = 1 + Math.round(Math.abs(Math.sin(k * 1.7 + p * 1.3 + now / 900)) * 3);
        r(nx - 5 + p * 4, R.yB + 12 - hgt, 2, hgt, ['#7ee787', '#4ec9b0', '#ffb454'][p]);
      }
    }
    r(nx - 2, R.yB + 13, 4, 1, '#3a3f45');
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
  const gelasTitik = [[190, 214], [226, 210], [266, 210], [302, 214]];
  for (const [gx, gy] of gelasTitik) {
    // gelas yang tergulingkan (tumpahan-kopi-rapat) digambar rebah, bukan berdiri
    if (RUANGAN.gelasGuling === gx) { r(gx, gy - 4, 5, 4, '#eef2f6'); r(gx, gy - 4, 5, 1, '#c8d2dc'); }
    else gelas(gx, gy);
  }
  botol(198, 212); botol(292, 212);
  r(214, 216, 15, 5, '#c9a03a');                     // map rapat
  r(215, 217, 13, 1, P.paper);
  r(258, 218, 15, 5, '#3e6b4f');
  r(259, 219, 13, 1, P.paper);
  r(238, 221, 13, 4, P.paper);                       // notulen
  r(239, 222, 11, 1, '#9aa7b4');
  // Notulen sisa rapat (RUANGAN.notulen): tiap peserta yang permisi
  // meninggalkan selembar, ditumpuk di sudut kiri depan taplak — celah antara
  // tepi kiri meja (x≈175 di baris ini) dan gelas 190, jauh dari kursi 214.
  // 2 px per lapis, maks 10 lapis (NOTULEN_MAKS), tiap lapis ketiga digeser
  // 1 px supaya terbaca tumpukan sembarang, bukan bundel rapi. Digambar di
  // dalam drawRapat sendiri, jadi ikut sortY meja — tidak ada urutan baru.
  for (let k = 0; k < Math.min(NOTULEN_MAKS, RUANGAN.notulen); k++) {
    const ny = 223 - k * 2;
    r(177 + (k % 3 === 1 ? 1 : 0), ny, 8, 2, k % 2 ? '#d9d4c3' : P.paper);
    if (k === Math.min(NOTULEN_MAKS, RUANGAN.notulen) - 1) r(179, ny, 4, 1, '#9aa7b4');   // coretan di lembar teratas
  }

  // Bekas kopi tumpah — permanen sampai ada event lain yang membersihkannya.
  // Digambar sesudah taplak, sebelum props di atasnya, jadi taplaknya
  // sungguh-sungguh terlihat ternoda, bukan cuma tempelan di atas segalanya.
  for (const n of RUANGAN.nodaKopi) {
    ctx.globalAlpha = 0.5;
    r(n.x, n.y, n.lebar, 2, '#6b4a2a');
    ctx.globalAlpha = 1;
  }

  if (active) glow(R.cx, R.yB + 14, 66, '#ffe9b0', 0.1);
}

// sandaran kursi sisi jauh — digambar sebelum pegawai, jadi mereka tampak duduk
function drawKursiJauh() {
  for (let k = 0; k < KURSI_N; k++) {
    const kx = RAPAT.cx + slotKe(k);
    // tepi belakang meja lurus, jadi semua kursi sejajar — kecuali yang
    // baru digeser berdecit (permanen sampai diluruskan lagi)
    const ky = 169 - (RUANGAN.geserKursi[k] || 0);
    // Kursi rusak: kosmetik saja — slotnya TETAP bisa diduduki. Membuatnya
    // benar-benar dilarang berarti mengubah slotBebas(), yang dipakai bersama
    // peserta rapat sungguhan; risikonya (orang berdiri di udara) tidak
    // sepadan dengan lelucon kursi patah.
    if (RUANGAN.kursiRusak.has(k)) {
      r(kx - 8, ky + 3, 16, 14, '#8b8f86');     // rangka plastik polos, beda dari yang biru
      r(kx - 7, ky + 4, 14, 10, '#c9ced4');
      r(kx - 2, ky + 17, 4, 6, '#9aa1a6');
      continue;
    }
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

// 0 = bendera di puncak tiang (biasa), 1 = di kaki tiang. Digeser pelan oleh
// apel pagi (tickApel) saat bendera dinaikkan; di luar apel selalu 0.
let apelBendera = 0;

function drawBendera() {
  const x = 132;
  r(x - 5, 270, 12, 4, '#7c838a');                         // alas
  r(x - 3, 268, 8, 2, '#9aa1a6');
  r(x, 216, 2, 54, '#c9ced4');                             // tiang
  r(x - 1, 213, 4, 3, P.gold);                             // kepala tiang
  const turun = Math.round(apelBendera * 38);              // 38 = tiang 54 - bendera 12 - alas
  for (let i = 0; i < 16; i++) {                           // merah putih berkibar
    const dy = Math.round(Math.sin(now / 300 + i * 0.55) * 1.4) + turun;
    r(x + 2 + i, 218 + dy, 1, 6, P.red);
    r(x + 2 + i, 224 + dy, 1, 6, '#f4f2ec');
  }
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
  // rak-server-kepanasan mendorong kipas ke arah rak (base bergeser dari 400);
  // dikunci di sana sampai ada yang mengembalikannya, sapuan menoleh dimatikan
  const dasarCx = MOD.kipasCx || 400;
  // arah: -1/0/1 direbut lewat kipas-direbut-arah dan bertahan sampai
  // direbut lagi — kalah dari kipasCx (rak kepanasan menang mutlak)
  const arah = MOD.kipasCx ? 0 : RUANGAN.kipasArah * 6;
  const cx = dasarCx + (MOD.kipasCx ? 0 : sapu) + arah
    + Math.round(Math.sin(now / 64) * MOD.kipasGoyang)
    + (MOD.kipasGetar ? (Math.sin(now / 42) > 0 ? 1 : -1) * MOD.kipasGetar : 0);
  const base = 292;
  if (arah) {                                    // garis angin ke arah yang direbut
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 3; i++) r(cx - arah * 3, base - 44 + i * 6, -arah * 20, 1, '#eef0f2');
    ctx.globalAlpha = 1;
  }
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

// X-banner berdiri "ZONA INTEGRITAS" — miring bertahap lalu rebah, tanpa
// rotasi canvas: cukup interpolasi lebar/tinggi kotak dan posisi kain,
// tapi rangka silang di belakangnya tetap dua garis stroke sungguhan
// (sudutnya dihitung, bukan kotak yang diputar).
function drawXBanner() {
  const x = 16, y = 188;   // di bawah LANE_UP, supaya tidak menelan pejalan
  const s = RUANGAN.xbanner.sudut;                          // 0 tegak .. 1 rebah
  if (s < 0.02) {
    ctx.strokeStyle = '#7c838a'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 52); ctx.lineTo(x + 26, y);
    ctx.moveTo(x + 26, y + 52); ctx.lineTo(x, y);
    ctx.stroke();
    r(x + 1, y + 2, 24, 46, '#f0ede2');
    r(x + 1, y + 2, 24, 8, '#1c4e8a');
    r(x + 5, y + 14, 16, 12, P.gold);                      // logo bundar-ish
    r(x + 9, y + 17, 8, 6, '#f0ede2');
    for (let i = 0; i < 3; i++) r(x + 5, y + 30 + i * 5, 16 - i * 4, 2, '#8b98a6');
    if (RUANGAN.xbanner.lipat) r(x + 1, y + 24, 24, 1, '#c9c2ae');  // lipatan permanen
    return;
  }
  // makin miring: makin pendek dan makin lebar, dasarnya tetap di tempat
  const tinggi = Math.round(52 * (1 - s * 0.6));
  const lebar = Math.round(24 + s * 22);
  const by = y + 52 - tinggi;
  ctx.strokeStyle = '#7c838a'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 52); ctx.lineTo(x + lebar, by);
  ctx.moveTo(x + lebar, y + 52); ctx.lineTo(x, by);
  ctx.stroke();
  r(x + 1, by, lebar, tinggi - 4, '#f0ede2');
  r(x + 1, by, lebar, Math.round(8 * (1 - s * 0.5)), '#1c4e8a');
}

// Plakat nilai kerja — statis, tidak ada hook event. Diselipkan di celah
// dinding kosong antara AC (berakhir ~x374) dan piagam/rambu larangan
// merokok (mulai ~x418), jadi tidak butuh koordinat baru yang bentrok.
// y=16, bukan sejajar atap: lampu neon kanan (NEON_X[1]=410) kabel+rumah
// lampunya turun sampai y=13 di rentang x390..430, tumpang tindih dengan
// lebar plakat (376..416) — digeser ke bawah situ, bukan disempitkan,
// supaya "INOVASI/KOLABORASI/INTEGRITAS" tetap terbaca penuh tiga baris.
function drawPlakatNilai() {
  const x = 376, y = 16, w = 40, h = 30;
  r(x, y, w, h, '#6d5535');
  r(x + 2, y + 2, w - 4, h - 4, P.paper);
  ctx.fillStyle = '#2c3440';
  ctx.font = '5px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ['INOVASI', 'KOLABORASI', 'INTEGRITAS'].forEach((t, i) => {
    r(x + 3, y + 10 + i * 7 - 1, 2, 2, P.gold);
    ctx.fillText(t, x + 6, y + 11 + i * 7);
  });
}

// Standee "VISI" — berdiri di celah lantai antara lemari arsip (berakhir
// tepat x82) dan bagan/filing kabinet (mulai x104), gaya kaki-silang sama
// seperti drawXBanner tapi statis (tidak ikut event zona-integritas itu).
function drawVisi() {
  const x = 84, y = 64, w = 22, h = 48;
  ctx.strokeStyle = '#7c838a'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + h); ctx.lineTo(x + w, y);
  ctx.moveTo(x + w, y + h); ctx.lineTo(x, y);
  ctx.stroke();
  r(x + 1, y, w - 2, h, '#f0ede2');
  r(x + 1, y, w - 2, 9, '#c9a03a');
  ctx.fillStyle = '#3a2c05';
  ctx.font = '6px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('VISI', x + 3, y + 5);
  glow(x + w / 2, y + 17, 7, '#ffe9a0', 0.22);
  r(x + w / 2 - 2, y + 15, 4, 4, '#e8d873');       // bohlam
  r(x + w / 2 - 1, y + 19, 2, 2, '#8b98a6');        // dudukan bohlam
  for (let l = 0; l < 4; l++) r(x + 3, y + 27 + l * 5, w - 6, 2, '#b9c0ca');   // baris teks abstrak
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
  { sortY: 260, station: null,     draw: drawKursiDekat },
  { sortY: 270, station: null,     draw: drawPantry },
  { sortY: 288, station: null,     draw: drawDispenserPantry },
  { sortY: 288, station: null,     draw: drawTongSampah },
  { sortY: 296, station: null,     draw: drawBukuTamu },
  { sortY: 274, station: null,     draw: drawBendera },
  { sortY: 294, station: null,     draw: drawPlant },
  { sortY: 295, station: null,     draw: drawKipas },
  { sortY: 348, station: 'think',  draw: drawMejaKerja },
  { sortY: 152, station: null,     draw: drawAbsensi },
  { sortY: 8,   station: null,     draw: drawEdaran },
  { sortY: 45,  station: null,     draw: drawNomorAntre },
  { sortY: 119, station: null,     draw: drawPropLantai },
  { sortY: 120, station: null,     draw: drawStiker },
  { sortY: 60,  station: null,     draw: drawCRT },
  { sortY: 20,  station: null,     draw: drawPlakatNilai },
  { sortY: 112, station: null,     draw: drawVisi },
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
    pal: { main: '#3f6285', pants: '#2a3646', skin: '#e0ae80', hair: '#241a12', head: 'hair', kacamata: true } },
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
    pal: { main: '#4c5570', pants: '#2f3444', skin: '#eec39a', head: 'jilbab', jilbab: '#2b3145', kacamata: true } },
  { id: 'statistisi', nama: 'Statistisi', singkat: 'Statistisi',
    padanan: 'Data Analyst',
    tugas: 'mengolah angka jadi tabel dan grafik yang bisa dibaca pimpinan',
    pal: { main: '#5b4d86', pants: '#332c4d', skin: '#d9a273', hair: '#1d1712', head: 'hair', kacamata: true } },
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
    pal: { main: '#4f6b3c', pants: '#2e3a28', skin: '#e0ae80', hair: '#241a12', head: 'hair', pattern: '#a8c98a', kacamata: true } },
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

/* --------------------------------------------------------- seragam harian ---
   Bukan bagian dari katalog event acak (event-acak.js) -- ini aturan tetap,
   dicek dari hari asli (new Date().getDay()), bukan waktu simulasi. Menimpa
   main/pants/pattern di OBJEK pal milik tiap JABATAN, bukan mengganti
   objeknya: a.pal, kartu detail, dan chip di panel kru semuanya menunjuk ke
   objek yang sama (this.pal = j.pal di constructor Agent dan di setPeran),
   jadi sekali ditimpa di sini langsung ikut ke mana-mana tanpa perlu
   melacak tiap sesi yang sedang hidup. Aksesori kepala (peci/jilbab/rambut)
   sengaja tidak disentuh -- itu bukan "baju", dan tetap jadi pembeda wajah
   antar jabatan biar kartu detail tidak kelihatan seperti kloningan.
   Senin/Selasa/Kamis putih polos, Rabu batik biru serentak, Jumat batik
   bebas -- warna atasannya diundi PER JABATAN (bukan satu warna buat
   seluruh kantor) karena justru itu yang membedakan "bebas" dari hari
   seragam wajib. Bawahan Jumat juga diundi sendiri, TERPISAH dari
   atasannya dan sengaja tidak pernah jatuh ke navy -- kalau ikut navy
   bawaan, "bebas"-nya cuma di atas, padahal yang diminta bebas dua-duanya.
   Sabtu/Minggu tidak diminta user; dipulangkan ke putih polos juga supaya
   tidak ada hari yang jatuh ke pal bawaan lama (sudah tidak valid karena
   main/pants/pattern-nya ditimpa permanen oleh fungsi ini). */
const SERAGAM_PUTIH = { main: '#f0ede2', pants: '#22293a', pattern: null };
const SERAGAM_BATIK_RABU = { main: '#2f4470', pants: '#22293a', pattern: '#8fa8d8' };
const SERAGAM_BATIK_JUMAT = [
  { main: '#6b4a2a', pattern: '#d9ab5e' },   // coklat klasik
  { main: '#2c4468', pattern: '#8fa8d8' },   // biru
  { main: '#5b2430', pattern: '#e5a3ad' },   // marun
  { main: '#3c5c3a', pattern: '#a8c98a' },   // hijau
  { main: '#4a3d70', pattern: '#c9b8e8' },   // ungu
];
// Bukan navy, dan diundi lepas dari daftar atasan di atas -- lihat catatan
// "bawahan Jumat" pada komentar blok ini.
const CELANA_JUMAT = ['#3a2f22', '#39352f', '#2b2420', '#3a3226', '#302a3d'];

// Hari (0-6) yang terakhir diterapkan -- dicek ulang tiap poll (bukan cuma
// sekali muat) supaya tab yang dibiarkan terbuka lewat tengah malam ikut
// pindah seragam sendiri, seperti cekJadwalRaya di bawah.
let seragamHariTerpasang = null;

function terapkanSeragamHarian() {
  const hari = new Date().getDay();
  if (hari === seragamHariTerpasang) return;
  seragamHariTerpasang = hari;
  for (const j of JABATAN) {
    const seragam = hari === 3 ? SERAGAM_BATIK_RABU
      : hari === 5 ? SERAGAM_BATIK_JUMAT[(Math.random() * SERAGAM_BATIK_JUMAT.length) | 0]
      : SERAGAM_PUTIH;
    j.pal.main = seragam.main;
    j.pal.pants = hari === 5 ? CELANA_JUMAT[(Math.random() * CELANA_JUMAT.length) | 0] : seragam.pants;
    j.pal.pattern = seragam.pattern || null;
  }
}
terapkanSeragamHarian();
setInterval(terapkanSeragamHarian, 30000);

/* ------------------------------------------------------ seragam kantor cabang
   Pegawai yang sesinya datang dari MESIN LAIN (a.mesin terisi; server
   mengosongkannya kalau nama mesin pengirim sama dengan hostname server)
   memakai ROMPI DINAS di atas seragam hariannya, plus tanda pangkat terang
   di kedua bahu.

   KEPUTUSAN INTI -- kenapa rompi, bukan ganti warna baju. terapkanSeragamHarian()
   di atas menimpa main/pants/pattern di OBJEK j.pal yang DIPAKAI BERSAMA semua
   pegawai berjabatan sama (this.pal = j.pal di constructor Agent dan di
   setPeran; kontraknya ditulis eksplisit di komentar blok seragam harian).
   Kalau seragam cabang ikut main di kanal yang sama, cuma ada dua jalan dan
   dua-duanya rugi: menyalin pal per-agent (memutus kontrak "sekali ditimpa
   langsung ikut ke mana-mana"), atau menimpa pal jabatan (merusak makna Rabu
   -- "batik biru SERENTAK" jadi tidak serentak). Jadi rompi dijadikan KANAL
   KETIGA yang tidak pernah dipakai hari mana pun: hari tetap menang untuk
   BAJU, mesin cuma menambah ROMPI di atasnya, persis seperti petugas dinas
   dari kantor lain yang sedang bertugas di kantor tuan rumah. Blok ini TIDAK
   PERNAH menulis ke a.pal / j.pal -- kalau suatu saat terpaksa, baca dulu
   paragraf ini.

   Warnanya bukan hasil undian: FNV-1a atas nama mesin (huruf besar/kecil
   diabaikan). Mesin yang sama = rompi yang sama tiap hari, tiap tab, tiap
   reload, dan sama juga di putar ulang agenda (server ikut mencatat ev.mesin).

   Warna dipilih supaya jarak RGB-nya >= 60 terhadap SELURUH warna baju harian
   (putih, batik Rabu, kelima batik Jumat) dan >= 60 antar sesama rompi --
   dijaga uji-seragam.mjs, jangan diubah dengan mata saja. Usul awal rancangan
   (#41603c hijau, #4f545c kelabu, #7a4f2e cokelat) semuanya JATUH di uji itu:
   masing-masing cuma berjarak 7 / 41 / 16 dari batik hijau Jumat, navy Rabu,
   dan batik cokelat Jumat -- rompi yang warnanya setara bajunya tidak menandai
   apa pun. Yang dipakai sekarang sengaja lebih terang dari semua baju gelap
   dan tetap lebih gelap dari kemeja putih. Tidak ada cokelat: setiap cokelat
   yang cukup jauh dari batik cokelat sudah menjadi khaki. */
const SERAGAM_CABANG = [
  { id: 'khaki',  nama: 'khaki',         rompi: '#b09a63', pangkat: '#f2d675' },
  { id: 'kelabu', nama: 'kelabu dinas',  rompi: '#9aa0a6', pangkat: '#b9c9dc' },
  { id: 'hijau',  nama: 'hijau lapangan', rompi: '#6f9463', pangkat: '#cfe89a' },
  { id: 'biru',   nama: 'biru dinas',    rompi: '#5f7fa8', pangkat: '#a9cdf0' },
];

// FNV-1a 32-bit, ditulis tangan (nol dependency). Math.imul supaya perkalian
// 32-bit tidak bocor ke double, >>> 0 supaya hasilnya tak pernah negatif.
function kodeMesin(nama) {
  const s = String(nama == null ? '' : nama).toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// Deklarasi `function`, bukan `const` arrow: cuma deklarasi fungsi yang
// otomatis jadi properti context vm, jadi uji-seragam.mjs bisa memanggil
// ctx.seragamCabang(...) tanpa menambah jembatan di uji-event.mjs.
const SERAGAM_CABANG_MEMO = new Map();
function seragamCabang(mesin) {
  const nama = String(mesin == null ? '' : mesin).trim().toLowerCase();
  if (!nama) return null;                       // pegawai lokal tidak pernah berompi
  let s = SERAGAM_CABANG_MEMO.get(nama);
  if (!s) {
    s = SERAGAM_CABANG[kodeMesin(nama) % SERAGAM_CABANG.length];
    SERAGAM_CABANG_MEMO.set(nama, s);
  }
  return s;
}

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

/* ------------------------------------------------- sprite pegawai -------
   Sosok pixel-art bergaris tepi, bukan lagi balok voxel bertumpuk: kepala
   bulat, leher, bahu melandai, lengan lepas dari badan, dua kaki bersepatu,
   dan tampak samping yang sungguh samping (satu mata, hidung, satu lengan
   di depan badan). Semua koordinat relatif ke (x, y) = tengah garis kaki;
   tingginya 28 px (29 dengan peci). Yang membaca ukuran ini dari luar --
   balon di y-30, kotak klik y-30..y+5, lencana galat y-34, perkakas di
   drawTool/drawBawaan yang dipegang setinggi yb-13 -- tidak perlu diubah.
   Garis tepinya warna dasar tiap bagian yang digelapkan, bukan hitam:
   cukup tegas buat memisahkan seragam putih dari lantai terang, tapi tidak
   sekeras stiker. Cahaya dari kiri-atas seperti box3 perabot, jadi kolom
   paling kanan tiap bagian sedikit teduh. */

const garisTepi = (c) => sh(c, 0.55);
const PECI = { isi: '#17171c', tepi: '#0a0a0e', kilap: '#34343e', pita: '#202028' };
const SEPATU = '#26221c', SANDAL = '#8a6844', TALI_SANDAL = '#d9b96a';
const KUMIS = '#2b2118', MASKER = '#e8ece8', MASKER_LIPAT = '#cfd5d0', MULUT_NGUAP = '#3a2a24';
const PULPEN_TELINGA = '#1c4e8a';
// Kacamata: atribut jabatan (pal.kacamata), bukan aksesori acak — auditor,
// statistisi, dan kedua analis memakainya, jadi siluetnya ikut membedakan
// peran dari kejauhan. Rimnya digambar DI ATAS baris mata, bukan menimpanya:
// wajah cuma 8 px, kalau lensanya diisi penuh matanya hilang dan orangnya
// jadi tidak terbaca sedang kedip/fokus/lelah.
const KACAMATA = '#2f3640', KACAMATA_KILAP = '#8f9aa6';

/* Gumpalan bersudut bulat bergaris tepi: isi w×h dari pojok kiri-atas
   (xL, yT), keempat sudut isinya dipangkas satu piksel, garis tepi satu
   piksel mengelilinginya tanpa mengisi pojok luar -- itu yang bikin bulat,
   bukan kotak. */
function gumpal(xL, yT, w, h, c, ct) {
  const t = ct || garisTepi(c);
  r(xL + 1, yT - 1, w - 2, 1, t);
  r(xL + 1, yT + h, w - 2, 1, t);
  r(xL - 1, yT + 1, 1, h - 2, t);
  r(xL + w, yT + 1, 1, h - 2, t);
  r(xL, yT, 1, 1, t); r(xL + w - 1, yT, 1, 1, t);
  r(xL, yT + h - 1, 1, 1, t); r(xL + w - 1, yT + h - 1, 1, 1, t);
  r(xL + 1, yT, w - 2, h, c);
  r(xL, yT + 1, 1, h - 2, c); r(xL + w - 1, yT + 1, 1, h - 2, c);
}

/* Arah hadap sebagai angka: 0 depan/belakang, 1 kanan, -1 kiri. */
const arahDari = (face) => (face === 'left' ? -1 : face === 'right' ? 1 : 0);
/* Kolom awal persegi selebar w yang mulai k piksel di kanan bx pada sosok
   hadap kanan. Hadap kiri dicerminkan pada sumbu di antara bx-1 dan bx,
   supaya sosok selebar genap (x-4..x+3) tetap simetris. */
const cermin = (arah, bx, k, w) => (arah < 0 ? bx - k - w : bx + k);

/* Kepala, dari garis dagu (yDagu) ke atas: isi 8 baris di yDagu-8..yDagu-1,
   garis tepi atas di yDagu-9, peci menambah 2 baris lagi di atasnya. */
function drawHead(a, x, yDagu) {
  const p = a.pal;
  const back = a.face === 'up';
  const arah = arahDari(a.face);
  const rm = (k, yy, w, h, c) => r(cermin(arah, x, k, w), yy, w, h, c);
  const kulit = p.skin, tk = garisTepi(kulit);
  const yT = yDagu - 8;
  const jilbab = p.head === 'jilbab';

  gumpal(x - 4, yT, 8, 8, jilbab ? p.jilbab : kulit);
  r(x + 3, yT + 1, 1, 6, sh(jilbab ? p.jilbab : kulit, 0.9));       // pipi kanan teduh

  if (jilbab) {
    r(x - 3, yT + 1, 3, 1, lerpHex(p.jilbab, '#ffffff', 0.18));      // kilap ubun-ubun kerudung
    if (!back) {                                                      // jendela wajah, bersudut bulat
      if (arah) { rm(0, yT + 2, 3, 1, kulit); rm(-1, yT + 3, 5, 4, kulit); rm(0, yT + 7, 3, 1, kulit); }
      else { r(x - 2, yT + 2, 4, 1, kulit); r(x - 3, yT + 3, 6, 4, kulit); r(x - 2, yT + 7, 4, 1, kulit); }
    }
  } else if (p.head === 'peci') {
    // songkok: lebih tinggi dari tudung rambut, kilap di kiri-atas, pita di
    // tepi bawah. Melorot sedikit (peciMiring) lalu dirapikan lagi oleh event.
    const px = x + (a.peciMiring || 0);
    r(px - 3, yT - 2, 6, 1, PECI.tepi);
    r(px - 4, yT - 1, 1, 1, PECI.tepi); r(px + 3, yT - 1, 1, 1, PECI.tepi);
    r(px - 3, yT - 1, 6, 1, PECI.isi);
    r(px - 5, yT, 1, 3, PECI.tepi); r(px + 4, yT, 1, 3, PECI.tepi);
    r(px - 4, yT, 8, 3, PECI.isi);
    r(px - 3, yT - 1, 3, 1, PECI.kilap);
    r(px - 4, yT + 2, 8, 1, PECI.pita);
    if (arah) rm(-4, yT + 3, 1, 2, p.hair);                          // cambang, cuma sisi belakang
    else { r(x - 4, yT + 3, 1, 2, p.hair); r(x + 3, yT + 3, 1, 2, p.hair); }
  } else {
    const th = garisTepi(p.hair);
    r(x - 3, yT - 1, 6, 1, th);
    r(x - 4, yT, 1, 1, th); r(x + 3, yT, 1, 1, th);
    r(x - 3, yT, 6, 1, p.hair);
    r(x - 5, yT + 1, 1, 2, th); r(x + 4, yT + 1, 1, 2, th);
    r(x - 4, yT + 1, 8, 2, p.hair);
    r(x - 3, yT + 1, 3, 1, lerpHex(p.hair, '#ffffff', 0.22));         // kilap
    if (back) {                                                       // tengkuk tertutup rambut
      r(x - 5, yT + 3, 1, 3, th); r(x + 4, yT + 3, 1, 3, th);
      r(x - 4, yT + 3, 8, 3, p.hair);
    } else if (arah) {                                                // samping: belakang kepala tertutup
      rm(-5, yT + 3, 1, 3, th);
      rm(-4, yT + 3, 4, 3, p.hair);
      rm(0, yT + 3, 2, 1, p.hair);                                    // poni menyapu ke dahi
    } else {
      r(x - 4, yT + 3, 3, 1, p.hair);                                 // poni samping
      r(x + 3, yT + 3, 1, 1, p.hair);
      r(x - 4, yT + 4, 1, 1, p.hair); r(x + 3, yT + 4, 1, 1, p.hair); // cambang
    }
  }

  if (!jilbab) {                                                      // telinga
    if (arah) rm(-1, yT + 4, 1, 2, sh(kulit, 0.78));
    else {
      r(x - 6, yT + 4, 1, 2, tk); r(x - 5, yT + 4, 1, 2, kulit);
      r(x + 5, yT + 4, 1, 2, tk); r(x + 4, yT + 4, 1, 2, kulit);
    }
  }

  if (!back) {
    drawEyes(a, x, yT + 4, arah);
    // dilepas sebentar waktu dilap (lap-kacamata-di-ujung-baju)
    if (p.kacamata && !a.kacamataLepas) {
      if (arah) {
        rm(1, yT + 3, 4, 1, KACAMATA);            // rim, dari samping cuma satu
        rm(1, yT + 3, 1, 1, KACAMATA_KILAP);
        rm(-1, yT + 3, 1, 1, KACAMATA);           // gagang ke telinga
      } else {
        r(x - 4, yT + 3, 3, 1, KACAMATA);         // rim kiri
        r(x + 2, yT + 3, 3, 1, KACAMATA);         // rim kanan
        r(x - 1, yT + 3, 2, 1, KACAMATA);         // jembatan
        r(x - 4, yT + 3, 1, 1, KACAMATA_KILAP);   // kilau di lensa kiri
        r(x - 5, yT + 3, 1, 2, KACAMATA);         // gagang kiri
        r(x + 4, yT + 3, 1, 2, KACAMATA);         // gagang kanan
      }
    }
    if (arah) { rm(4, yT + 5, 1, 1, kulit); rm(5, yT + 5, 1, 1, tk); }   // hidung
    if (a.masker || MOD.masker) {                                      // masker kabut asap
      if (arah) { rm(0, yT + 6, 5, 3, MASKER); rm(0, yT + 7, 5, 1, MASKER_LIPAT); }
      else { r(x - 3, yT + 6, 6, 3, MASKER); r(x - 3, yT + 7, 6, 1, MASKER_LIPAT); }
    } else {
      if (a.mulut) { if (arah) rm(1, yT + 6, 2, 2, MULUT_NGUAP); else r(x - 1, yT + 6, 2, 2, MULUT_NGUAP); }   // menguap
      else if (!p.kumis) { if (arah) rm(2, yT + 7, 1, 1, sh(kulit, 0.72)); else r(x - 1, yT + 7, 2, 1, sh(kulit, 0.72)); }
      if (p.kumis) { if (arah) rm(1, yT + 6, 3, 1, KUMIS); else r(x - 2, yT + 6, 4, 1, KUMIS); }
    }
  }
  if (a.pulpenDiTelinga) {                                            // bolpoin diselipkan di telinga
    if (arah) rm(-1, yT + 3, 1, 2, PULPEN_TELINGA); else r(x + 5, yT + 3, 1, 2, PULPEN_TELINGA);
  }
}

/* Kedip. Waktu dibagi sel 4 detik; di tiap sel ada tepat satu kedip yang
   letaknya (detik ke-1..3 dalam sel) ditentukan hash murah dari indeks sel +
   slot orangnya — jadi jarak antar-kedip 2–6 detik, deterministik per orang
   (bisa direproduksi lewat frame()), dan tidak pernah serempak satu ruangan.
   Lama kedip 120 ms: cukup terbaca pada 60 fps, terlalu singkat buat
   mengganggu. Tidak dimatikan oleh mode apa pun — ini kedip, bukan animasi. */
const KEDIP_SEL = 4, KEDIP_LAMA = 0.12;
function sedangKedip(a) {
  const t = (a.phase || 0) + (a.slot || 0) * 1.618;
  const sel = Math.floor(t / KEDIP_SEL);
  const h = Math.sin(sel * 12.9898 + (a.slot || 0) * 78.233) * 43758.5453;
  const mulai = sel * KEDIP_SEL + 1 + (h - Math.floor(h)) * 2;
  return t >= mulai && t < mulai + KEDIP_LAMA;
}

/* Ekspresi, diurutkan dari yang paling mendesak. 'tegang' = berhenti
   menunggu kamu atau macet karena galat; 'lega' = ±2 detik sesudah
   menyerahkan hasil / selesai giliran; 'fokus' = sedang bekerja; 'lelah' =
   staminanya di bawah STAMINA_LELAH (prioritas terendah). Semuanya
   1–2 piksel di dalam 8 baris kepala, tinggi sprite tidak berubah. */
function ekspresi(a) {
  if (a.butuh || a.macet) return 'tegang';
  if (a.legaSampai && now < a.legaSampai) return 'lega';
  if (a.state === 'work') return 'fokus';
  // 'lelah' paling belakang: kelopak turun, staminanya habis (lihat STAMINA_*)
  if (a.stamina != null && a.stamina < STAMINA_LELAH) return 'lelah';
  return '';
}

const KERINGAT = '#8fd3f4';
function drawEyes(a, x, ey, arah) {
  const wajah = ekspresi(a);
  const blink = wajah !== 'lega' && sedangKedip(a);
  // fokus = menyipit: kelopak turun sepiksel (kulit lebih gelap), yang tersisa
  // cuma baris bawah mata. Dipilih ini, bukan alis, karena baris di atas mata
  // (yT+3) sebelah kiri tertutup poni — alis di situ cuma kelihatan sebelah.
  const kelopak = wajah === 'fokus' ? sh(a.pal.skin, 0.62) : null;
  // lelah = kelopak turun LEBAR (2 px, lebih gelap dari yang fokus) menutup
  // baris atas mata; yang tersisa satu titik pupil di baris bawah
  const lelah = wajah === 'lelah' ? sh(a.pal.skin, 0.5) : null;
  if (arah) {                                                         // samping: satu mata, dekat dahi
    const rm = (k, yy, w, h, c) => r(cermin(arah, x, k, w), yy, w, h, c);
    if (blink) rm(1, ey + 1, 2, 1, P.ink);
    else if (wajah === 'lega') { rm(2, ey, 1, 1, P.ink); rm(3, ey + 1, 1, 1, P.ink); }   // mata menyipit tersenyum
    else if (wajah === 'tegang') rm(1, ey, 2, 2, P.ink);              // melotot
    else if (kelopak) { rm(2, ey, 1, 1, kelopak); rm(2, ey + 1, 1, 1, P.ink); }
    else if (lelah) { rm(1, ey, 2, 1, lelah); rm(2, ey + 1, 1, 1, P.ink); }
    else rm(2, ey, 1, 2, P.ink);
    return;
  }
  if (blink) { r(x - 3, ey + 1, 2, 1, P.ink); r(x + 1, ey + 1, 2, 1, P.ink); return; }
  if (lelah) {
    r(x - 3, ey, 2, 1, lelah); r(x - 2, ey + 1, 1, 1, P.ink);
    r(x + 1, ey, 2, 1, lelah); r(x + 1, ey + 1, 1, 1, P.ink);
    return;
  }
  if (kelopak) {
    r(x - 2, ey, 1, 1, kelopak); r(x - 2, ey + 1, 1, 1, P.ink);
    r(x + 1, ey, 1, 1, kelopak); r(x + 1, ey + 1, 1, 1, P.ink);
    return;
  }
  if (wajah === 'lega') {                                             // ^ ^ : mata melengkung
    r(x - 3, ey + 1, 1, 1, P.ink); r(x - 2, ey, 1, 1, P.ink);
    r(x + 1, ey, 1, 1, P.ink); r(x + 2, ey + 1, 1, 1, P.ink);
    return;
  }
  if (wajah === 'tegang') {                                           // melotot + tetes keringat di pipi
    r(x - 3, ey, 2, 2, P.ink); r(x + 1, ey, 2, 2, P.ink);
    r(x + 3, ey + 2, 1, 1, KERINGAT);
    return;
  }
  r(x - 2, ey, 1, 2, P.ink);
  r(x + 1, ey, 1, 2, P.ink);
}

/* Pose kerja yang TAMPAK. `state === 'work'` tetap jadi patokan logika (kartu,
   statistik, activeStations); yang ditunda cuma gambarnya: 150 ms jeda
   antisipasi setibanya di stasiun (TIBA_JEDA_MS) — dilewati kalau sedang beku
   atau event mengatur pose — dan selama mengantre di belakang stasiun penuh. */
const poseKerja = (a) => a.state === 'work' && !a.antre
  && (now >= (a.tibaSampai || 0) || now < a.bekuSampai || !!a.pose);

/* Berapa piksel badan turun ke kursi rapat: 0 berdiri, DUDUK_PX×DUDUK_FRAME
   duduk penuh, bertahap 2 px per ±50 ms di antaranya (dudukSejak/bangunSejak
   dipasang arrive()/bangkit()). Beku, pose event, atau menunggu kamu
   (berdiri dari kursi) melompat langsung ke keadaan akhirnya. */
function turunDuduk(a) {
  if (!a.dudukSejak && !a.bangunSejak) return 0;
  const penuh = DUDUK_PX * DUDUK_FRAME;
  if (a.butuh) return 0;
  const lompat = now < a.bekuSampai || !!a.pose;
  // dijepit ≥0: stempel waktunya dipasang handle() (performance.now()) dan
  // dibaca frame() (ts rAF) — dua jam sebasis yang bisa selisih belasan ms
  const langkah = Math.max(0, Math.ceil((now - (a.dudukSejak || a.bangunSejak)) / (DUDUK_MS / DUDUK_FRAME))) * DUDUK_PX;
  if (a.dudukSejak) return lompat ? penuh : Math.min(penuh, langkah);
  return lompat ? 0 : Math.max(0, penuh - langkah);
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
  // rompi kantor cabang: kanal terpisah dari p.main/p.pattern, tidak pernah
  // menulis balik ke pal (lihat blok "seragam kantor cabang")
  const rc = a.mesin ? seragamCabang(a.mesin) : null;
  const t = a.phase;
  const back = a.face === 'up';
  const arah = arahDari(a.face);
  const rm = (k, yy, w, h, c) => r(cermin(arah, x, k, w), yy, w, h, c);

  // kerja: pose kerja yang TAMPAK — 'work' logis tetap 'work' (kartu,
  // statistik), cuma gambarnya yang ditunda 150 ms setibanya (jeda antisipasi)
  // dan ditahan selagi mengantre di belakang stasiun yang penuh.
  const kerja = poseKerja(a);
  let bob = 0, liftL = 0, liftR = 0, armL = 0, armR = 0, langkah = 0;
  if (a.state === 'walk') {
    const s = Math.sin(t * 10);
    bob = Math.abs(s) > 0.72 ? -1 : 0;
    liftL = Math.max(0, Math.round(s * 2));
    liftR = Math.max(0, Math.round(-s * 2));
    armL = -Math.round(s * 1.6);
    armR = Math.round(s * 1.6);
    langkah = Math.round(s * 2);            // tampak samping: kaki depan maju-mundur
  } else if (kerja) {
    bob = Math.sin(t * 4) > 0.85 ? -1 : 0;
  } else {
    bob = Math.sin(t * 1.7) > 0.6 ? -1 : 0;
  }
  // lelah: bahu & kepala turun 1 px — kakinya tetap, tinggi kotak sprite tetap
  if (a.stamina != null && a.stamina < STAMINA_LELAH) bob += 1;
  // duduk di kursi rapat: badan turun bertahap (kaki memendek dari atas),
  // 0 selagi berdiri/berjalan — lihat turunDuduk()
  const duduk = turunDuduk(a);
  bob += duduk;

  // Bayangan kaki. MOD.bayangPanjang (senja, matahari rendah di balik jendela)
  // menggantinya dengan jajaran genjang yang menjulur MENJAUHI jendela: arahnya
  // dihitung dari posisi orangnya terhadap sumbu kaca, jadi yang di kiri
  // ruangan berbayang ke kiri dan yang di kanan ke kanan — bukan satu arah
  // seragam yang malah terbaca seperti salah gambar.
  ctx.fillStyle = '#20301f';
  const bp = MOD.bayangPanjang;
  if (bp > 0.01) {
    const arahB = xKaki < JENDELA.x + JENDELA.w / 2 ? -1 : 1;
    const baris = Math.round(12 * bp);
    for (let i = 0; i < baris; i++) {
      const t = i / Math.max(1, baris);
      ctx.globalAlpha = (0.18 - 0.14 * t) * alphaDasar;
      r(xKaki - 4 + arahB * i * 2, y + 1 + Math.round(i * 0.4), Math.max(2, 10 - i * 0.5), 1, '#20301f');
    }
  }
  ctx.globalAlpha = 0.18 * alphaDasar;
  ctx.beginPath();
  ctx.ellipse(xKaki + 1, y + 1, 9, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alphaDasar;

  const yb = y + bob;
  const kulit = p.skin, tk = garisTepi(kulit);
  const main = p.main, tm = garisTepi(main), mainG = sh(main, 0.85);
  const celana = p.pants, celanaG = sh(celana, 0.8);
  const sabuk = sh(celana, 0.7);
  const alas = a.sandal ? SANDAL : SEPATU;   // pantofel — atau sandal jepit lewat jam setengah tiga

  // ---- kaki. Celananya naik sampai pinggang di balik sabuk supaya badan
  // yang bob-nya naik satu piksel tidak membuka celah. Kaki yang terangkat
  // memendek dari bawah: telapaknya yang naik, bukan seluruh kaki melayang.
  const kaki = (px, sx, lift, w, gelap) => {
    r(px, y - 8 + duduk, 3, Math.max(0, 7 - lift - duduk), gelap ? celanaG : celana);
    if (!gelap) r(px + 2, y - 8 + duduk, 1, Math.max(0, 7 - lift - duduk), celanaG);
    r(sx, y - 1 - lift, w, 2, alas);
    if (a.sandal) r(px + 1, y - 2 - lift, 1, 1, TALI_SANDAL);
  };
  if (arah) {
    // samping: kaki belakang teduh dan digambar dulu, sepatu memanjang ke
    // arah hadap; waktu jalan keduanya melangkah maju-mundur, yang sedang di
    // depan sekaligus terangkat.
    const geser = arah < 0 ? 1 : 0;
    const sB = cermin(arah, xKaki, -3 - langkah, 4), sD = cermin(arah, xKaki, langkah, 4);
    kaki(sB + geser, sB, Math.max(0, -langkah), 4, true);
    kaki(sD + geser, sD, Math.max(0, langkah), 4, false);
  } else {
    kaki(xKaki - 4, xKaki - 4, liftL, 3, false);
    kaki(xKaki + 1, xKaki + 1, liftR, 3, false);
  }

  // a.pose menang atas keduanya: itu jalur event, dan event tahu persis pose
  // apa yang sedang diperlukan — mengangkat, menunjuk, menguap, bertepuk.
  // Menunggu keputusan kamu menang atas semuanya: dua tangan mengangkat map.
  const pose = a.butuh ? { l: -6, r: -6 }
    : a.pose ? posEvent(a)
    : (kerja ? workArms(a) : { l: armL, r: armR });

  // ---- badan: bahu membulat, pinggang lurus ke sabuk berkepala emas
  // Baris tanda pangkat rompi cabang: normalnya di bahu (yb-15), tapi kerudung
  // digambar SESUDAH badan dan gumpal()-nya memakan yb-16 sampai yb-12 (isi 4
  // baris plus garis tepi bawahnya), jadi di bahu pangkatnya terkubur habis.
  // Untuk yang berjilbab dia turun ke yb-11, baris pertama yang masih
  // kelihatan di bawah juntaian — tetap ada penandanya, cuma jadi pita terang
  // di dada, bukan di pundak.
  const yPangkat = p.head === 'jilbab' ? yb - 11 : yb - 15;
  const badan = () => {
    if (arah) {
      r(x - 2, yb - 16, 4, 1, tm);
      r(x - 3, yb - 15, 1, 1, tm); r(x + 2, yb - 15, 1, 1, tm);
      r(x - 2, yb - 15, 4, 1, main);
      r(x - 4, yb - 14, 1, 6, tm); r(x + 3, yb - 14, 1, 6, tm);
      r(x - 3, yb - 14, 6, 6, main);
      r(x + 2, yb - 14, 1, 6, mainG);
      if (p.pattern) for (let i = 0; i < 5; i++) r(x - 3 + ((i * 3) % 6), yb - 14 + ((i * 5) % 6), 1, 1, p.pattern);
      else r(x - 1, yb - 15, 2, 1, sh(main, 0.62));
      if (rc) {
        // Samping: badannya cuma 6 px (x-3..x+2) dan LENGAN DEKAT digambar
        // sesudah badan(), menutup 4 px tengahnya (x-2..x+1). Yang tersisa
        // untuk rompi persis dua kolom tepi torso — pita di tengah badan
        // akan lenyap seluruhnya di balik lengan, jadi sengaja tidak digambar
        // di situ. Koordinat absolut, bukan rm(): kolom kanan tetap yang
        // teduh dari arah hadap mana pun, sama seperti mainG di atas.
        r(x - 3, yb - 14, 1, 6, rc.rompi);
        r(x + 2, yb - 14, 1, 6, sh(rc.rompi, 0.85));
        r(x - 4, yb - 14, 1, 6, garisTepi(rc.rompi));
        r(x + 3, yb - 14, 1, 6, garisTepi(rc.rompi));
        // Tanda pangkat ikut ke dua kolom itu: petak bahu lainnya (x-2..x+1
        // di yb-15) juga tertutup lengan dekat.
        r(x - 3, yPangkat, 1, 1, rc.pangkat); r(x + 2, yPangkat, 1, 1, rc.pangkat);
      }
      r(x - 4, yb - 8, 8, 1, sabuk); rm(1, yb - 8, 1, 1, P.gold);
      return;
    }
    r(x - 3, yb - 16, 6, 1, tm);
    r(x - 4, yb - 15, 1, 1, tm); r(x + 3, yb - 15, 1, 1, tm);
    r(x - 3, yb - 15, 6, 1, main);
    r(x - 5, yb - 14, 1, 6, tm); r(x + 4, yb - 14, 1, 6, tm);
    r(x - 4, yb - 14, 8, 6, main);
    r(x + 3, yb - 14, 1, 6, mainG);
    if (!back) {
      r(x - 1, yb - 15, 2, 1, sh(main, 0.8));                          // kerah
      for (let yy = yb - 13; yy <= yb - 9; yy += 2) r(x, yy, 1, 1, tm);  // kancing
      r(x - 3, yb - 13, 2, 1, sh(main, 0.72));                         // saku dada
      r(x + 1, yb - 13, 2, 1, sh(main, 0.72));
    }
    if (p.pattern) {                                                   // motif batik
      for (let i = 0; i < 8; i++) r(x - 4 + ((i * 3) % 8), yb - 14 + ((i * 5) % 6), 1, 1, p.pattern);
    } else {                                                           // lidah bahu PNS
      r(x - 4, yb - 15, 2, 1, sh(main, 0.62)); r(x + 2, yb - 15, 2, 1, sh(main, 0.62));
    }
    if (rc) {
      // Rompi tampak depan/belakang: dua pita vertikal 2 px di kolom TERLUAR
      // badan (x-4..x-3 dan x+2..x+3), garis tepi badan ikut jadi tepi rompi.
      // 4 px tengah (x-2..x+1) sengaja DISISAKAN tetap baju supaya kerah,
      // kancing, dan motif batik masih terbaca di 28 px — yang hilang cuma
      // separuh saku dada kiri, dan pita 1 px tidak terbaca sama sekali.
      // Kasus utamanya justru punggung: di meja kerja STATIONS.think face 'up'.
      r(x - 4, yb - 14, 2, 6, rc.rompi); r(x + 2, yb - 14, 2, 6, rc.rompi);
      r(x + 3, yb - 14, 1, 6, sh(rc.rompi, 0.85));                     // cahaya kiri-atas
      r(x - 5, yb - 14, 1, 6, garisTepi(rc.rompi));
      r(x + 4, yb - 14, 1, 6, garisTepi(rc.rompi));
      // Tanda pangkat: tanpa syarat p.pattern, jadi hari batik pun tetap ada
      // penandanya (di hari putih dia menggantikan lidah bahu PNS di petak
      // yang sama persis).
      r(x - 4, yPangkat, 2, 1, rc.pangkat); r(x + 2, yPangkat, 2, 1, rc.pangkat);
    }
    r(x - 5, yb - 8, 10, 1, sabuk); r(x - 1, yb - 8, 2, 1, P.gold);
  };

  // ---- lengan. Depan/belakang: dua lengan lepas di sisi badan, garis tepi
  // di sisi luarnya saja. Samping: yang lebih terangkat jadi lengan dekat di
  // depan badan (isyarat event harus tetap terbaca dari samping), satunya di
  // balik badan dan cuma nongol kalau ikut terangkat. Angka pose = offset y,
  // makin negatif makin terangkat; dari samping yang terangkat juga terjulur.
  const lengan = (ax, luar, lift) => {
    const yA = yb - 15 + lift;
    r(ax, yA - 1, 2, 1, tm);
    r(luar, yA, 1, 8, tm);
    r(ax, yA, 2, 6, main);
    r(ax + 1, yA, 1, 6, mainG);
    r(ax, yA + 6, 2, 2, kulit);
    r(ax, yA + 8, 2, 1, tk);
  };
  const lenganSamping = (k, lift, warna) => {
    const yA = yb - 15 + lift;
    rm(k, yA - 1, 2, 1, tm);
    rm(k - 1, yA, 1, 8, tm); rm(k + 2, yA, 1, 8, tm);
    rm(k, yA, 2, 6, warna);
    rm(k, yA + 6, 2, 2, kulit);
    rm(k, yA + 8, 2, 1, tk);
  };
  if (arah) {
    const dekat = Math.min(pose.l, pose.r), jauh = Math.max(pose.l, pose.r);
    const ayun = a.state === 'walk' ? -langkah : 0;
    const maju = (lift) => (lift < -2 ? Math.round(-lift / 3) : 0);
    if (jauh < -1) lenganSamping(-1 - ayun + maju(jauh), jauh, mainG);
    badan();
    lenganSamping(-1 + ayun + maju(dekat), dekat, main);
  } else {
    badan();
    lengan(x - 7, x - 8, pose.l);
    lengan(x + 5, x + 7, pose.r);
  }

  // Rim light: 1 px tepi badan di sisi yang menghadap sumber cahaya dominan
  // (lihat sumberCahaya). Lewat jalur warna tepi yang sama — lerpHex dari
  // warna baju ke warna cahaya — bukan lapisan alpha di atas sprite, supaya
  // tetap satu piksel tegas seperti tepi lainnya. Yang memegang map
  // disposisi dilewati: mapnya menutupi separuh badan.
  const rim = a.butuh ? null : rimPegawai(a);
  if (rim) {
    const campur = 0.35 + 0.4 * rim.kuat;
    // Tepi badan pegawai cabang adalah tepi ROMPI, bukan tepi baju: rim jatuh
    // persis di kolom garis tepi rompi (x-5/x+4 depan, x-4/x+3 samping), jadi
    // kalau dasarnya tetap `main` tepi rompinya berkedip tiap matahari/neon
    // bergeser. Lengan tidak pernah berompi, jadi tepi luarnya tetap dari baju.
    const wr = lerpHex(rc ? rc.rompi : main, rim.warna, campur);
    const wl = rc ? lerpHex(main, rim.warna, campur) : wr;
    if (arah) r(rim.arah < 0 ? x - 4 : x + 3, yb - 14, 1, 6, wr);
    else {
      r(rim.arah < 0 ? x - 5 : x + 4, yb - 14, 1, 6, wr);                      // tepi badan
      const lift = rim.arah < 0 ? pose.l : pose.r;
      r(rim.arah < 0 ? x - 8 : x + 7, yb - 15 + lift + 1, 1, 6, wl);          // tepi luar lengan
    }
  }

  if (p.head === 'jilbab') {                 // kerudung menjuntai menutup bahu, jarum emas di depan
    if (arah) gumpal(x - 4, yb - 16, 8, 4, p.jilbab); else gumpal(x - 5, yb - 16, 10, 4, p.jilbab);
    if (!back) rm(arah ? 1 : 0, yb - 14, 1, 1, P.gold);
  }

  // Map disposisi digambar SEBELUM kepala supaya kepalanya menang: yang jadi
  // tanda justru wajah yang menghadap penonton, jadi tidak boleh tertutup map.
  if (a.butuh) {
    // Lebarnya berhenti di pangkal telapak, bukan menutupinya: kalau tangannya
    // ikut tertutup, mapnya terbaca menempel di dada, bukan diangkat.
    r(x - 5, yb - 16, 5, 1, '#e8a0a8');                     // lidah map
    r(x - 5, yb - 15, 10, 8, '#e8a0a8');                    // map disposisi
    r(x - 5, yb - 8, 10, 1, '#c07e86');                     // sisi bawah: tebalnya terbaca
    r(x - 3, yb - 13, 6, 1, P.paper);                       // lembar di dalamnya
    r(x - 3, yb - 11, 4, 1, P.paper);
    r(x + 1, yb - 11, 3, 3, '#c03030');                     // cap merah, belum diteken
    /* TANDA PANGKAT DIKEMBALIKAN DI ATAS MAP. Kotak map (x-5..x+4, yb-15..
       yb-8) menutup PERSIS seluruh petak rompi, jadi tanpa dua petak ini
       pegawai cabang kehilangan seluruh penanda kantornya — 0 px rompi, 0 px
       pangkat — tepat di pose yang paling perlu dikenali: menunggu keputusan
       kamu, dan kamu harus tahu itu sesi mesin yang mana. Rompinya sendiri
       memang mengalah ke map (map dipegang di depan dada; itu memang yang
       terjadi), tapi pangkatnya naik ke tepi atas map: baris yb-15 dan
       kolom yang sama persis dengan pose lain (x-4..x-3 / x+2..x+3), jadi
       matanya tidak perlu belajar tempat baru. Dari samping pun kotak mapnya
       tetap 10 px, jadi koordinat yang sama tetap jatuh di atas map. */
    if (rc) { r(x - 4, yb - 15, 2, 1, rc.pangkat); r(x + 2, yb - 15, 2, 1, rc.pangkat); }
  }

  // kepala peserta yang ketiduran turun beberapa piksel, lalu tersentak naik
  const yDagu = yb - 17 + Math.round(a.ngantuk || 0);
  drawHead(a, x, yDagu);
  // leher memutus garis dagu di tengah: kepala terbaca menyambung ke badan,
  // bukan menempel di atasnya. Yang tertunduk dagunya sudah tenggelam di bahu.
  if (p.head !== 'jilbab' && yDagu === yb - 17) r(x - 1, yDagu, 2, 1, sh(kulit, 0.75));
  // perkakas mejanya disembunyikan selagi menunggu: tangannya sedang penuh
  if (kerja && !a.butuh) drawTool(a, x, yb);
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
    case 'diam':     return { l: 0, r: 0 };                              // tangan lepas, tetap 'work'
    case 'hormat':   return { l: 0, r: -9 };                             // hormat bendera
    case 'mengipas': return { l: -1, r: Math.sin(t * 6) > 0 ? -7 : -4 }; // map dikibas ke wajah
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
    case 'apar':      r(bx, yb - 15, 5, 9, '#b02a2a'); r(bx, yb - 15, 5, 1, '#d24545'); r(bx + 1, yb - 17, 2, 2, '#7c838a'); break;
    case 'ember':     r(bx, yb - 10, 7, 6, '#4a7fd0'); r(bx, yb - 10, 7, 1, '#79b0e8'); break;
    case 'lap':       r(bx, yb - 10, 6, 4, '#e8e4d4'); break;
    case 'papan':     r(bx, yb - 14, 6, 8, '#8a6844'); r(bx + 1, yb - 13, 4, RUANGAN.papanJalan * 2, P.paper); break;
    case 'boks':      r(bx, yb - 12, 8, 6, '#b98d5e'); r(bx, yb - 12, 8, 1, '#d9cba8'); break;
    case 'map-kuning':r(bx, yb - 13, 8, 6, '#c9a03a'); r(bx + 1, yb - 11, 6, 1, P.paper); break;
    case 'amplop-coklat': r(bx, yb - 12, 7, 5, '#a37b4e'); r(bx, yb - 12, 7, 1, '#c9a97a'); break;
    case 'koper':     r(bx, yb - 12, 6, 5, '#4a3626'); r(bx + 1, yb - 13, 4, 1, '#6b4a2e'); break;
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
  const ringan = ringanAktif();
  NEON_X.forEach((cx, i) => {
    const a = A.lampu * kedipNeon(i);
    if (ringan) {                                          // dari cache, cuma alphanya yang hidup
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(neonLapis(i), 0, 0);
      ctx.globalAlpha = 1;
      return;
    }
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
  if (ringan) {
    ctx.globalAlpha = Math.min(1, 0.06 * A.lampu * MOD.lampu);
    ctx.drawImage(neonLapis(NEON_X.length), 0, 0);
    ctx.globalAlpha = 1;
    return;
  }
  glow(W / 2, 210, 200, '#ff9e50', 0.06 * A.lampu * MOD.lampu);   // dua genangan disatukan
}

/* Mode ringan: pendar neon dari cache. Geometrinya tetap (NEON_X konstan)
   dan tiap alphanya linear terhadap intensitas, jadi satu neon cukup digambar
   SEKALI ke kanvas offscreen pada intensitas 1 — kerucut, tabung, dua
   pendar — lalu tiap frame cuma drawImage dengan globalAlpha = intensitas
   saat itu. Kedipnya tetap hidup (alphanya yang berkedip), tapi tujuh
   createRadialGradient per frame jadi nol. Indeks NEON_X.length = genangan
   gabungan di tengah lantai. Kanvasnya seukuran ruangan supaya ikut transform
   kamera apa adanya; pada zoom 2 gradasinya jadi blok 2×2, tak terlihat. */
const neonCache = [];
function neonLapis(i) {
  let c = neonCache[i];
  if (c) return c;
  c = document.createElement('canvas'); c.width = W; c.height = H;
  const k = c.getContext('2d');
  if (i < NEON_X.length) {
    const cx = NEON_X[i];
    k.globalAlpha = 0.07; k.fillStyle = '#ffcf8a';
    k.beginPath();
    k.moveTo(cx - 17, 13); k.lineTo(cx + 17, 13);
    k.lineTo(cx + 40, 232); k.lineTo(cx - 40, 232);
    k.closePath(); k.fill();
    k.globalAlpha = 1; k.fillStyle = '#ffdfa6'; k.fillRect(cx - 18, 10, 36, 3);
    glow(cx, 14, 34, '#ffcf8a', 0.3, k);
    glow(cx, 190, 160, '#ffbe72', 0.15, k);
  } else {
    glow(W / 2, 210, 200, '#ff9e50', 1, k);
  }
  neonCache[i] = c;
  return c;
}

/* Debu di berkas cahaya (II.8). Bukan bagian `parts`: umurnya panjang, tidak
   kena gravitasi, dan hanya boleh hidup DI DALAM berkas — kerucut neon waktu
   malam, berkas jendela di lantai waktu siang. Yang keluar dari berkasnya
   dibunuh, bukan dibiarkan melayang di gelap (debu memang ada di mana-mana,
   tapi hanya kelihatan waktu ditembus cahaya). Maksimal 40, 1 px, alpha
   rendah, pelan sekali; mati di mode ringan. */
const DEBU_MAKS = 40;
const debu = [];
// setengah lebar kerucut neon i pada ketinggian y (trapesium 13→232)
const kerucutSetengah = (y) => 17 + 23 * (y - 13) / 219;
// setengah lebar berkas jendela pada y (trapesium FLOOR_TOP→196, pusat 215)
const berkasSetengah = (y) => 25 + 26 * (y - FLOOR_TOP) / (196 - FLOOR_TOP);
function debuSumber(A) {
  const s = [];
  if (A.lampu > 0.3) NEON_X.forEach((cx, i) => {
    const kuat = A.lampu * kedipNeon(i);
    if (kuat > 0.2) s.push({ jenis: 'neon', i, kuat });
  });
  if (A.sinarA > 0.04 && A.luar > 0.35) s.push({ jenis: 'jendela', kuat: Math.min(1, A.luar) });
  return s;
}
function updateDebu(dt) {
  if (ringanAktif()) { debu.length = 0; return; }
  const A = ambien();
  const sumber = debuSumber(A);
  // lahir pelan-pelan: ~6 butir/detik sampai penuh, bukan 40 sekaligus
  if (sumber.length && debu.length < DEBU_MAKS && Math.random() < dt * 6) {
    const s = sumber[(Math.random() * sumber.length) | 0];
    let x, y;
    if (s.jenis === 'neon') {
      y = 30 + Math.random() * 200;
      x = NEON_X[s.i] + (Math.random() * 2 - 1) * kerucutSetengah(y);
    } else {
      y = FLOOR_TOP + Math.random() * (196 - FLOOR_TOP);
      x = 215 + (Math.random() * 2 - 1) * berkasSetengah(y);
    }
    debu.push({ x, y, jenis: s.jenis, i: s.i, vx: (Math.random() - 0.5) * 2.4, vy: 0.6 + Math.random() * 1.8,
      fase: Math.random() * 6.28, umur: 0, life: 5 + Math.random() * 6 });
  }
  for (let i = debu.length - 1; i >= 0; i--) {
    const d = debu[i];
    d.umur += dt;
    d.x += (d.vx + Math.sin(now / 900 + d.fase) * 1.2) * dt;
    d.y += d.vy * dt;
    let mati = d.umur >= d.life;
    if (d.jenis === 'neon') mati = mati || d.y > 232 || Math.abs(d.x - NEON_X[d.i]) > kerucutSetengah(d.y);
    else mati = mati || d.y > 196 || Math.abs(d.x - 215) > berkasSetengah(d.y);
    if (mati) debu.splice(i, 1);
  }
}
function drawDebu() {
  if (!debu.length) return;
  const A = ambien();
  for (const d of debu) {
    const kuat = d.jenis === 'neon' ? A.lampu * kedipNeon(d.i) : Math.min(1, A.luar);
    // muncul & lenyap pelan, plus kelap-kelip halus ala debu yang berputar
    const pudar = Math.min(1, d.umur * 0.8, (d.life - d.umur) * 0.8);
    const kelip = 0.7 + 0.3 * Math.sin(now / 350 + d.fase * 3);
    ctx.globalAlpha = 0.22 * kuat * pudar * kelip;
    r(d.x, d.y, 1, 1, d.jenis === 'neon' ? '#fff0c8' : '#fffbe8');
  }
  ctx.globalAlpha = 1;
}

/* Rim light (II.8): satu sumber cahaya dominan per frame — neon terdekat
   waktu malam, jendela waktu siang; senja memilih yang lebih kuat. Sengaja
   SATU: dua sumber berarti dua sisi terang dan sprite 10 px lebar berhenti
   terbaca sebagai badan bertepi. Dipakai drawPerson buat mewarnai 1 px tepi
   di sisi yang menghadap cahaya. Dihitung sekali per frame (memo `now`). */
let cahayaKini = null, cahayaFrame = -1;
function sumberCahaya() {
  if (cahayaFrame === now) return cahayaKini;
  cahayaFrame = now;
  if (ringanAktif()) return (cahayaKini = null);
  const A = ambien();
  const neon = A.lampu * MOD.lampu;
  const siang = Math.min(1, A.sinarA * 7) * Math.min(1, A.luar);
  if (neon < 0.2 && siang < 0.25) return (cahayaKini = null);
  cahayaKini = neon >= siang
    ? { jenis: 'neon', kuat: Math.min(1, neon), warna: '#ffcf8a' }
    : { jenis: 'jendela', x: 215, y: FLOOR_TOP, kuat: siang, warna: A.sinar };
  return cahayaKini;
}
// arah (-1 kiri / +1 kanan / 0 tidak ada) & kekuatan rim buat pegawai a
function rimPegawai(a) {
  const c = sumberCahaya();
  if (!c) return null;
  let sx, kuat = c.kuat;
  if (c.jenis === 'neon') {
    let dekat = 0;
    for (let i = 1; i < NEON_X.length; i++) if (Math.abs(NEON_X[i] - a.x) < Math.abs(NEON_X[dekat] - a.x)) dekat = i;
    sx = NEON_X[dekat];
    kuat *= kedipNeon(dekat) * Math.max(0, 1 - Math.abs(sx - a.x) / 170);
  } else {
    sx = c.x;
    kuat *= Math.max(0, 1 - Math.hypot(sx - a.x, c.y - a.y) / 300);
  }
  if (kuat < 0.08 || Math.abs(sx - a.x) < 6) return null;   // tepat di bawah lampu: tidak ada sisi
  return { arah: sx < a.x ? -1 : 1, kuat, warna: c.warna };
}

/* ---------------------------------------------------------------- partikel */
const parts = [];
/* `warna` opsional: belasan event minta partikel yang sudah ada dengan warna
   lain (ping merah untuk UPS, talk kuning untuk tawa, ink pucat untuk bantalan
   yang kering). Menimpanya di sini sekali jauh lebih murah daripada menambah
   satu jenis partikel tiap kali warnanya beda. */
// Mode ringan: jatah partikel separuh. Yang tertua digusur, bukan yang baru
// ditolak — pemanggil boleh memegang partikel yang dikembalikan (p.dasar dsb.).
const PARTIKEL_MAKS_RINGAN = 120;
function spawn(kind, x, y, warna) {
  const rnd = (n) => (Math.random() - 0.5) * n;
  if (parts.length >= PARTIKEL_MAKS_RINGAN && ringanAktif()) parts.shift();
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
    // pulpen jatuh: memantul lalu menggelinding — vx meluruh saat kena
    // lantai, ditangani cabang khusus di updateParts (belum ada kind lain
    // yang perlu berhenti pelan-pelan alih-alih langsung berhenti/memantul)
    case 'pulpen': parts.push({ x, y, vx: rnd(6) + 10, vy: -6, g: 200, life: 3.5, c: '#1c4e8a', s: 1, k: 'gelinding' }); break;
    case 'asap':   parts.push({ x: x + rnd(16), y, vx: rnd(6), vy: -12, g: 0, life: 2.6, c: '#8b8f86', s: 2 }); break;
    case 'hati':   parts.push({ x: x + rnd(6), y, vx: rnd(4), vy: -8, g: 0, life: 1.2, c: '#ff9aa8', s: 2 }); break;
    // laron: mengorbit titik (x,y) alih-alih jatuh — dipakai kutu-lampu-neon.
    // g dipakai belakangan sebagai penanda "gugur": >0 artinya sedang jatuh.
    case 'laron':  parts.push({ x, y, vx: 0, vy: 0, g: 0, life: 2 + Math.random() * 2, c: '#e6d8a8', s: 1,
      k: 'laron', cx: x, cy: y, ang: Math.random() * Math.PI * 2, rad: 4 + Math.random() * 10,
      spin: (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random()) }); break;
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
    if (p.k === 'drip') {
      // p.dasar: penadah lain (bocor arsip, bocor meja rapat) mendarat di
      // ketinggiannya sendiri, bukan dipaksa ke y=124 milik ember AC utama.
      // Tanpa ini tetesan dari plafon lain "mendarat" duluan di udara.
      const dasar = p.dasar == null ? 124 : p.dasar;
      if (p.y >= dasar) {
        parts.splice(i, 1);
        if (p.dasar == null) {                             // tetes AC ke ember utama
          const penuh = RUANGAN.emberIsi >= 90;
          for (let s = 0; s < (penuh ? 6 : 3); s++) spawn('splash', 347, 124);
          if (!RUANGAN.emberDiangkat) RUANGAN.emberIsi = Math.min(90, RUANGAN.emberIsi + 1);
        } else {
          for (let s = 0; s < 3; s++) spawn('splash', p.x, dasar);
          if (p.onDrip) p.onDrip();
        }
        continue;
      }
    }
    // Laron: mengorbit sampai "digugurkan" (p.g dipaksa >0 dari luar), abaikan
    // integrasi lurus tadi selama masih g:0 — habis hujan mereka baru jatuh.
    if (p.k === 'laron' && p.g === 0) {
      p.ang += p.spin * dt;
      p.x = p.cx + Math.cos(p.ang) * p.rad + Math.sin(now / 300 + p.ang) * 1.5;
      p.y = p.cy + Math.sin(p.ang) * p.rad * 0.6;
    }
    // Pulpen jatuh: satu pantulan kecil, lalu vx-nya meluruh sampai berhenti
    // di lantai — bukan langsung diam seperti partikel lain. p.dasar dipasang
    // pemanggilnya (lantai tempat dia jatuh); tanpa itu dia jatuh selamanya.
    if (p.k === 'gelinding' && p.dasar != null && p.y >= p.dasar) {
      p.y = p.dasar;
      if (!p.pantul) { p.pantul = 1; p.vy = -40; }
      else {
        p.vy = 0; p.g = 0;
        p.vx *= Math.max(0, 1 - dt * 3);
        if (Math.abs(p.vx) < 1) p.vx = 0;
      }
    }
    if (p.life <= 0) parts.splice(i, 1);
  }
}
function drawParts() {
  // p.a: plafon opsional dari event (kertas pudar karena toner tipis).
  // Dikalikan, bukan ditimpa, supaya peluruhan life tetap terlihat di akhir hidupnya.
  const satu = (p) => {
    ctx.globalAlpha = Math.min(1, p.life * 1.6) * (p.a == null ? 1 : p.a);
    r(p.x, p.y, p.s, p.s, p.c);
  };
  /* Dua lintasan atas larik `parts` YANG SAMA. p.sisip dicap per partikel di
     pemanggil spawn() (Agent.update), bukan lewat variabel modul: spawn()
     dipanggil dari puluhan tempat termasuk tick event di frame yang sama,
     jadi "pasang lalu kembalikan" pasti salah cap suatu saat, dan gagalnya
     senyap total.
     YANG DIGERBANGI HANYA PENGGAMBARAN, TIDAK PERNAH PEMBARUAN — jangan
     pernah menaruh if seperti ini di updateParts() atau di update(). */
  for (const p of parts) if (!p.sisip) satu(p);
  ctx.globalAlpha = 1;
  // milik orang di dalam bukaan: di dalam klip, supaya kertas fx 'paper'
  // yang melayang ±10 px tidak bocor keluar bingkai
  if (parts.some((p) => p.sisip)) {
    klipSisip(() => { for (const p of parts) if (p.sisip) satu(p); });
    ctx.globalAlpha = 1;
  }
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
    // yang mengantre (antre) berdiri di lajur, bukan di slot — jangan dihitung
    if (other !== diri && other.station === id && !other.antre) dipakai.add(other.slotIdx);
  }
  for (let k = 0; k < maks; k++) {
    if (dipakai.has(k)) continue;
    const x = s.x + (daftar ? daftar[k] - s.x : slotKe(k, s.step));
    if (x < 16 || x > W - 16) continue;      // slot mentok tepi: lewati, jangan di-clamp
    return k;
  }
  return -1;
}

/* ------------------------------------------------------------- sisi meja ---
   Pegawai lokal digiring ke sisi KIRI ruangan, pegawai kantor cabang ke sisi
   KANAN, supaya satu kantor bisa menampung dua mesin tanpa penontonnya harus
   membaca chip di panel. MEJA_KERJA_X = [176, 374, 86, 444, 242, 308], jadi
   urutan lama sudah selang-seling kiri-kanan — itu sebabnya "dua sisi" tidak
   pernah terbentuk kalau urutannya dibiarkan.

   Keduanya PERMUTASI dari indeks 0..5 yang sama: kantor penuh tetap memakai
   keenam meja, tidak ada meja mubazir, dan jawaban "ada meja kosong?" persis
   sama dengan slotBebas('think') — itu sebabnya stasiunPulang() di bawah tidak
   perlu ikut diubah.

   PERUBAHAN PERILAKU YANG TERLIHAT TANPA MESIN KEDUA: sesi pertama sekarang
   duduk di x=86 (meja paling kiri), bukan x=176 seperti dulu. Disengaja, dan
   disebut terang-terangan di sini karena semua orang akan melihatnya walaupun
   tidak pernah punya kantor cabang. Efek samping kedua: slotIdx 3 (x=444) —
   meja pojok yang dikunci event wifi-sudut-lemah — jadi PILIHAN PERTAMA
   pegawai cabang, jadi event itu akan lebih sering kena mereka. Identitas
   slotIdx-nya sendiri tidak berpindah; yang berubah cuma urutan pencarian.

   ARAH SEBALIKNYA, DAN INI YANG MAHAL: di kantor MURNI LOKAL (satu mesin —
   bawaan hampir semua orang) meja pojok itu justru jadi jauh lebih sepi.
   Diukur dengan mengisi meja satu per satu:
     sekarang  x 86 · 176 · 242 · 308 · 374 · 444   <- 444 baru terisi sesi ke-6
     dulu      x 176 · 374 · 86 · 444 · 242 · 308   <- 444 sudah terisi sesi ke-4
   Jadi wifi-sudut-lemah (syaratnya station 'think' + slotIdx 3) butuh SEMUA
   enam meja terisi, dulu cukup empat: 1,5x lebih sulit terpicu di kantor
   satu mesin. Itu harga yang tidak bisa ditawar, bukan kelalaian — sapuan
   kiri→kanan yang rapi mensyaratkan x terbesar (444) ada di urutan terakhir,
   jadi TIDAK ADA permutasi yang sekaligus menyapu kiri→kanan dan menaruh
   444 di urutan keempat. Yang mengembalikan frekuensinya cuma menyerah pada
   sapuannya (mis. [2, 0, 4, 3, 5, 1]) — dan dua sisi yang rapi lebih sering
   dilihat orang daripada satu event langka. Dicatat di sini supaya yang
   membaca berikutnya tidak mengira efeknya cuma satu arah. */
const URUT_MEJA_LOKAL = [2, 0, 4, 5, 1, 3];    // x 86, 176, 242, 308, 374, 444
const URUT_MEJA_CABANG = [3, 1, 5, 4, 0, 2];   // x 444, 374, 308, 242, 176, 86
function slotMeja(diri) {
  const s = STATIONS.think;
  const dipakai = new Set();
  for (const other of penghuni()) {
    // sama persis dengan slotBebas: yang mengantre berdiri di lajur, bukan di slot
    if (other !== diri && other.station === 'think' && !other.antre) dipakai.add(other.slotIdx);
  }
  for (const k of (diri && diri.mesin ? URUT_MEJA_CABANG : URUT_MEJA_LOKAL)) {
    if (dipakai.has(k)) continue;
    const x = s.slotsX[k];
    if (x < 16 || x > W - 16) continue;        // penjaga tepi, dibawa dari slotBebas
    return k;
  }
  return -1;
}

/* Tempat pulang pegawai yang lagi tidak dapat tugas adalah MEJA KERJANYA,
   bukan sudut tunggu: yang enak dilihat itu ruangan yang orangnya sibuk di
   mejanya masing-masing, bukan yang antre. Sudut tunggu tinggal jadi limpahan,
   dipakai cuma kalau semua meja sudah terisi.
   Tetap lewat slotBebas('think'): di sini yang ditanya cuma "ada meja kosong?",
   dan jawabannya identik dengan slotMeja karena URUT_MEJA_* cuma permutasi
   dari enam slot yang sama. */
function stasiunPulang(diri) {
  return slotBebas('think', diri) >= 0 ? 'think' : 'idle';
}

/* ---------------------------------------------------------- kongsi seproyek
   Dua sesi nyata yang mengerjakan proyek (cwd) yang sama — cabangnya boleh
   beda — duduk bersebelahan: waktu salah satunya dapat meja kerja, yang
   dipilih bukan urutan prioritas MEJA_KERJA_X, melainkan meja kosong yang
   PALING DEKAT (sumbu x) ke meja rekannya. Keputusannya cuma diambil saat
   penugasan slot; meja yang sudah ditempati tidak pernah digeser, jadi
   kursinya stabil. Tanpa rekan seproyek, perilaku lama. Beda proyek tetap
   asing: tidak ada interaksi apa pun. */
const KONGSI_SAPA = ['gimana branch-mu?', 'udah di-push?', 'itu error kemarin beres?', 'nanti tolong review ya'];
const KONGSI_JEDA_MIN = 20000, KONGSI_JEDA_MAX = 40000;
const KONGSI_TOLEH_MS = 1200;
const jedaKongsi = () => (typeof window !== 'undefined' && window.KONGSI_UJI_MS)
  || KONGSI_JEDA_MIN + Math.random() * (KONGSI_JEDA_MAX - KONGSI_JEDA_MIN);
const sesiNyata = (a) => agents.get(a.id) === a;     // bukan standby, bukan peserta
// menganggur di meja kerjanya: bukan sedang kerja, bukan sedang jadi pemeran event
const kongsiDiam = (a) => a.station === 'think' && !a.path.length && a.state !== 'work'
  && !a.eventKerja && !a.butuh && !a.antre && sesiNyata(a);
function rekanSeproyek(diri, harusDiam) {
  if (!diri.project) return null;
  let rekan = null;
  for (const o of agents.values()) {
    if (o === diri || o.project !== diri.project || o.station !== 'think') continue;
    if (harusDiam && !kongsiDiam(o)) continue;
    if (!rekan || o.sejak < rekan.sejak) rekan = o;   // yang paling lama di kantor jadi acuan
  }
  return rekan;
}
function slotKongsi(diri) {
  const rekan = sesiNyata(diri) ? rekanSeproyek(diri, false) : null;
  // Tanpa rekan seproyek, aturan sisi meja yang berlaku (slotMeja). Dengan
  // rekan, kongsi seproyek menang MUTLAK: dua sesi yang menggarap folder yang
  // sama tetap bersebelahan walaupun mesinnya beda — justru kasus itu yang
  // paling menarik dari kantor cabang, jadi cabang `if (rekan)` di bawah
  // sengaja tidak tahu-menahu soal a.mesin.
  if (!rekan) return slotMeja(diri);
  const dipakai = new Set();
  for (const o of penghuni()) if (o !== diri && o.station === 'think' && !o.antre) dipakai.add(o.slotIdx);
  const xr = MEJA_KERJA_X[rekan.slotIdx];
  // Number.POSITIVE_INFINITY, bukan `Infinity` polos: di sandbox vm harness uji
  // (uji-event.mjs) global bawaan yang tidak didaftarkan sandbox jatuh ke objek
  // stub, jadi `d < Infinity` selalu false dan seluruh pencarian meja terdekat
  // diam-diam mengembalikan -1 — kongsi seproyek jadi tak bisa diuji sama sekali.
  // Di peramban keduanya nilai yang sama persis; perilakunya nol berubah.
  let k = -1, jarak = Number.POSITIVE_INFINITY;
  MEJA_KERJA_X.forEach((x, i) => {
    if (dipakai.has(i)) return;
    const d = Math.abs(x - xr);
    if (d < jarak) { jarak = d; k = i; }
  });
  return k;
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
    this.token = null;      // { input, output, cacheTulis, cacheBaca } — sejak transkripnya dipantau
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
    this.cabang = '';       // cabang git di cwd-nya (dikirim server); kosong kalau bukan repo
    this.model = '';        // diisi server; sesi terminal sering tidak memberitahu
    this.stepT = 0;
    this.stampUp = false;
    this.fx = null;          // efek yang mengikuti pekerjaan, bukan mejanya
    this.betah = false;      // true = duduk terus sampai disuruh bubar
    this.hadap = null;       // arah hadap khusus, kalau stasiunnya punya
    this.alpha = 1;          // dipakai event: memudar di ambang pintu kadis
    this.diKadis = false;    // sedang di dalam bukaan ruang kadis (blok "ruang kadis")
    this.sisipFase = '';     // '' | 'pudar' (di ambang) | 'terang' (baru muncul di dalam)
    this.sisipT = 0;         // now-timestamp mulai fase di atas
    this.sisipKeluar = 0;    // now-timestamp mulai pulih alpha sesudah keluar bukaan
    this.eventKerja = null;  // event acak yang sedang meminjamnya, kalau ada
    this.doingEvent = '';    // keterangan kartu selama dipinjam event
    this.bawa = null;        // barang bawaan sementara (map, gelas, jerigen)
    this.pose = null;        // pose sesaat: 'angkat', 'nunjuk', 'ngantuk', ...
    this.laju = 1;           // pengali kecepatan jalan sementara (event)
    this.bekuSampai = 0;     // now-timestamp: jalan & efek kerja beku sampai lewat ini
    this.butuh = null;       // keadaan ketiga: berhenti menunggu keputusan kamu
    this.tungguSejak = 0;    // Date.now() saat mulai menunggu, 0 kalau tidak sedang menunggu
    this.tungguTotal = 0;    // ms akumulasi menunggu kamu sepanjang sesi ini
    this.pengingatTimer = null; // id setTimeout pengingat terkatung (lihat pantauTerkatung)
    this.terkatungJenis = '';   // 'butuh' | 'macet' | '' — keadaan terkatung yang terakhir dipantau
    this.legaSampai = 0;     // now-timestamp: wajah 'lega' sesudah menyerahkan hasil / selesai giliran
    this.gagalBerturut = 0;  // tool call gagal berturut-turut yang SEDANG berlangsung; nol begitu ada yang berhasil
    this.kongsiCek = 0;      // now-timestamp: kapan berikutnya melirik rekan seproyek (0 = belum dijadwalkan)
    this.tolehSampai = 0;    // now-timestamp: sedang menoleh sampai lewat ini
    this.tolehRekan = null;  // rekan yang sedang ditoleh (null = tolehan dari event)
    this.tolehBalik = null;  // face sebelum ditoleh, dikembalikan waktu tolehnya habis
    this.stamina = 1;        // 0..1, lihat STAMINA_*; reset per sesi karena satu Agent = satu sesi
    this.antre = 0;          // 0 = punya slot; n = urutan ke-n di antrean stasiun penuh (tickAntre)
    this.antreUrut = 0;      // nomor giliran global (antreSeq) — yang kecil maju duluan
    this.tibaSampai = 0;     // now-timestamp: jeda antisipasi setibanya, pose kerja tampak sesudahnya
    this.dudukSejak = 0;     // now-timestamp mulai duduk di kursi rapat (turunDuduk); 0 = tidak duduk
    this.bangunSejak = 0;    // now-timestamp mulai berdiri dari kursi rapat
    this.pulang = '';        // ritual pulang: '' | 'salam' | 'salam-diam' | 'absen' | 'absen-diam' | 'pintu'
    this.pulangBatas = 0;    // now-timestamp jatah ritual habis (PULANG_BATAS_MS)
    this.pulangTahap = 0;    // now-timestamp berhenti (salaman / tempel jari) selesai
    this.pulangRekan = null; // rekan seproyek yang disinggahi

    this.el = document.createElement('div');
    this.el.className = 'bubble';
    this.el.style.display = 'none';
    overlay.appendChild(this.el);
    this.bubbleUntil = 0;
    this.tinggiUcap = TINGGI_UCAP;   // diukur ulang tiap say(): balonnya 1–3 baris
    this.lebarUcap = 0;              // idem — dipakai menjaga balon di dalam bingkai

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

  // Stasiun penuh: dulu slotIdx balik ke 0 dan dia berdiri menumpuk; sekarang
  // dia MENGANTRE di lajur di belakang stasiun (antre = urutan, lihat
  // tickAntre). Yang datang belakangan tidak menyalip antrean yang sudah ada.
  slotOffset(id) {
    const s = STATIONS[id];
    // meja kerja: rekan seproyek jadi tetangga (slotKongsi), selebihnya urut prioritas
    let k = id === 'think' ? slotKongsi(this) : slotBebas(id, this);
    let depan = 0;
    for (const o of penghuni()) {
      if (o !== this && o.station === id && o.antre && (!this.antre || o.antreUrut < this.antreUrut)) depan++;
    }
    if (depan) k = -1;
    if (k < 0) { if (!this.antre) this.antreUrut = ++antreSeq; this.antre = depan + 1; }
    else this.antre = 0;
    this.slotIdx = k < 0 ? 0 : k;
    return s.slotsX ? s.slotsX[this.slotIdx] - s.x : slotKe(this.slotIdx, s.step);
  }

  goTo(id) {
    const s = STATIONS[id];
    if (!s) return;
    /* Bukaan ruang kadis. Yang sudah DI DALAM lalu disuruh ke 'agent' lagi
       (Task/mcp beruntun) tidak boleh berkedip keluar-masuk pintu: dia sudah
       di tempat. Selain itu keluar dulu SEBELUM route() dihitung — titik
       berangkatnya wajib ambang pintu (452, LANE_UP), bukan koordinat di
       dalam bukaan, dan alpha-nya pulih SAMBIL route() sudah berjalan
       sehingga penundaannya nol milidetik (Aturan 1). */
    if (id === 'agent' && this.diKadis) { this.antre = 0; return; }
    keluarKadis(this);
    if (id !== this.station) this.antre = 0;   // antrean lama tidak dibawa ke stasiun lain
    this.bangkit();
    const off = this.slotOffset(id);
    const fromLane = this.y < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN;
    this.station = id;
    if (this.antre) {
      // penuh: berdiri di lajur menghadap stasiun, pose berdiri biasa
      this.hadap = s.y > s.lane ? 'down' : 'up';
      this.path = route(this.x, this.y, fromLane, titikAntre(s, this.antre), s.lane, s.lane);
      this.state = 'walk';
      return;
    }
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
    keluarKadis(this);        // lihat catatan di goTo(): keluar sebelum route() dihitung
    const fromLane = this.y < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN;
    const bLane = ty < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN;
    this.bangkit();
    this.station = 'acara';
    this.slotIdx = 0;
    this.antre = 0;
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
    // Akumulasi waktu tunggu: mulai jam saat transisi ke truthy, ditambahkan
    // ke total saat transisi balik ke null — dua-duanya cuma boleh terjadi
    // sekali per transisi, bukan tiap kali setButuh dipanggil dengan nilai sama.
    if (b && !this.butuh) this.tungguSejak = Date.now();
    else if (!b && this.butuh && this.tungguSejak) {
      this.tungguTotal += Date.now() - this.tungguSejak;
      this.tungguSejak = 0;
    }
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
    // Balonnya bisa satu sampai tiga baris dan selebar apa pun sampai batas
    // CSS, jadi ukurannya diukur sekali di sini — bukan konstanta. Tingginya
    // dipakai menumpuk balon pikiran (+4 jatah ekor), lebarnya dipakai
    // menggeser balon masuk bingkai persis seperlunya. Sekali per say(),
    // bukan tiap frame: kalimatnya tidak berubah selama balonnya hidup.
    this.tinggiUcap = (this.el.offsetHeight || 23) + 4;
    this.lebarUcap = this.el.offsetWidth || 0;
    // Kalimat panjang butuh waktu baca lebih lama daripada 'siap, ndan'.
    if (this.tinggiUcap > TINGGI_UCAP) this.bubbleUntil = now + 6400;
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
    this.tickStamina(dt);
    if (this.pulang && this.tickPulang()) return;   // true = sudah dihapus, jangan sentuh DOM-nya
    // berdiri dari kursi rapat lewat jalur apa pun (event yang menulis path sendiri)
    if (this.dudukSejak && this.path.length) this.bangkit();
    if (this.bangunSejak && now - this.bangunSejak > DUDUK_MS) this.bangunSejak = 0;
    this.tickKongsi();

    if (this.path.length && now >= this.bekuSampai) {
      const t = this.path[0];
      const dx = t.x - this.x, dy = t.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1.6) {
        this.x = t.x; this.y = t.y;
        this.path.shift();
        if (!this.path.length) this.arrive();
      } else {
        // lelah: 0,85× saja — tidak lebih lambat, kedatangan ke stasiun tetap cepat
        const lelah = this.stamina < STAMINA_LELAH ? LAJU_LELAH : 1;
        const step = Math.min(dist, SPEED * this.laju * lelah * (MOD.lajuGlobal || 1) * dt);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        this.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        this.stepT += dt;
        // Zona senyap: waktu ada rapat daring, yang lewat depan meja rapat
        // memelankan langkah. Debunya ikut hilang, bukan cuma suaranya.
        const senyap = this.x >= MOD.senyapDari && this.x <= MOD.senyapSampai;
        if (this.stepT > 0.26) {
          this.stepT = 0;
          // cap per partikel, bukan variabel modul — lihat catatan di drawParts()
          if (!senyap) { const p = spawn('step', this.x, this.y); if (p && this.diKadis) p.sisip = true; }
        }
      }
    } else {
      if (this.antre) this.tickAntre();          // stasiun penuh: maju begitu ada slot
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

    // efek kerja per stasiun — beku (kucing di keyboard, dsb) mematikannya juga;
    // poseKerja: belum selama jeda tiba 150 ms, dan tidak selagi mengantre
    if (poseKerja(this) && now >= this.bekuSampai) {
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
          const p = spawn(fx, this.x, this.y - 24);
          if (p && this.diKadis) p.sisip = true;      // lihat catatan di drawParts()
        }
      }
    } else if (this.station === 'idle' && !this.path.length && Math.random() < 0.02) {
      spawn('steam', this.x + 10, this.y - 14);
    }

    // Posisi balon teks. Sejak balonnya boleh melebar sampai tiga baris,
    // dia ikut dijaga di dalam bingkai seperti balon pikiran: pegawai di meja
    // paling kiri/kanan tidak boleh bicara separuh keluar layar.
    // Semua titik DOM di bawah lewat keLayar(): ikut kamera (zoom/pan), bukan
    // offX/scale mentah. Yang di luar bidikan kamera disembunyikan — kalau
    // tidak, jagaBingkai() menariknya ke tepi dan jadi balon tanpa orang.
    // Titik cekik tunggal, sudah diverifikasi: kameraTampak() cuma punya SATU
    // pemanggil di seluruh berkas — baris ini — dan variabel `tampak` inilah
    // yang menggerbangi balon ucap, balon pikir, DAN lencana macet sekaligus.
    // Kalau suatu hari ketiganya perlu digerbangi syarat baru (misalnya
    // menyembunyikan balon penghuni bukaan ruang kadis saat gordennya
    // tertutup), cukup satu baris di sini, nol riak ke pemanggil lain.
    const tampak = kameraTampak(this.x, this.y);
    if (now > this.bubbleUntil || !tampak) {
      if (this.el.style.display !== 'none') this.el.style.display = 'none';
    } else {
      if (this.el.style.display === 'none') this.el.style.display = '';
      // Digeser sebatas lebar balonnya sendiri: balon pendek ("siap, ndan")
      // nyaris tidak bergeser, yang tiga baris bergeser banyak. Ekornya
      // dibatasi separuh lebar balon supaya tidak pernah copot dari badannya.
      const sisi = this.lebarUcap / 2;
      const [tengah, atas] = keLayar(this.x, this.y - 30);
      const kiri = jagaBingkai(tengah, sisi + 8);
      const bebas = Math.max(0, sisi - 9);
      this.el.style.setProperty('--geser',
        Math.max(-bebas, Math.min(bebas, tengah - kiri)) + 'px');
      this.el.style.left = Math.round(kiri) + 'px';
      this.el.style.top = Math.round(atas) + 'px';
    }

    // Balon pikiran menggantung DI ATAS balon ucap, bukan menimpanya. Tingginya
    // tetap dalam piksel CSS (bukan piksel kanvas) karena teksnya juga begitu.
    if (now > this.pikirUntil || !tampak) {
      if (this.elPikir.style.display !== 'none') this.elPikir.style.display = 'none';
    } else {
      if (this.elPikir.style.display === 'none') this.elPikir.style.display = '';
      if (this.pikirIdx < this.pikirBagian.length - 1 && now > this.pikirGanti) {
        this.pikirIdx++;
        this.pikirGanti = now + PIKIR_GANTI;
        this.elPikir.innerHTML = this.pikirBagian[this.pikirIdx];
      }
      const naik = now < this.bubbleUntil ? this.tinggiUcap : 0;
      // separuh lebar balon + sedikit jarak; tanpa ini pegawai di tepi kiri
      // ruangan memikirkan sesuatu yang kalimatnya terpotong bingkai
      const [tengah, atas] = keLayar(this.x, this.y - 31);
      const kiri = jagaBingkai(tengah, 118);
      // balon yang digeser masuk bingkai ekornya ikut bergeser balik, supaya
      // gelembungnya tetap menunjuk kepala orangnya
      this.elPikir.style.setProperty('--geser',
        Math.max(-92, Math.min(92, tengah - kiri)) + 'px');
      this.elPikir.style.left = Math.round(kiri) + 'px';
      this.elPikir.style.top = Math.round(atas) - naik + 'px';
    }

    // Lencana galat: kecil, jadi tidak perlu digeser masuk bingkai seperti
    // balon pikiran — yang penting selalu tepat di atas kepala orangnya.
    if (this.macet) {
      const [lx, ly] = keLayar(this.x, this.y - 34);
      this.elMacet.style.visibility = tampak ? '' : 'hidden';
      this.elMacet.style.left = Math.round(lx) + 'px';
      this.elMacet.style.top = Math.round(ly) + 'px';
    }
  }

  /* Kongsi seproyek: dua rekan yang sama-sama menganggur di mejanya sesekali
     saling menoleh (±20–40 detik sekali, ±1,2 detik), tanpa berpindah — cuma
     `face`, bukan `hadap`, jadi arah hadap stasiunnya tidak berubah. Bukan
     event acak: tidak masuk log, tidak menaikkan statistik, dan tidak pernah
     menahan langkah — begitu state/path berubah (tool call datang), tolehnya
     batal saat itu juga. Standby & peserta rapat tidak ikut (sesiNyata). */
  tickKongsi() {
    const diam = kongsiDiam(this);
    if (this.tolehSampai) {
      const r = this.tolehRekan;
      /* Dua macam tolehan lewat jalur yang sama.
         - Rekan seproyek (r terisi): syaratnya dua-duanya menganggur di meja.
         - Tolehan dari event acak (r null, dipasang menoleh() di
           00-dasar.js): penontonnya boleh di mana saja — duduk di kursi
           rapat, berdiri di pantry — jadi kongsiDiam() TIDAK dituntut.
           Dulu menoleh() menulis a.hadap, yang LENGKET dan tidak pernah
           dikembalikan siapa pun: pegawai yang sudah di stasiunnya tidak
           pernah dapat goTo() baru (handle() cuma memanggilnya kalau
           stasiunnya BEDA, dan stasiunPulang selalu 'think'/'idle'), jadi
           dia berdiri menyamping di depan laptopnya tanpa batas waktu.
           Sekarang menoleh() cuma menulis face dan menitipkan face lamanya
           di tolehBalik — dikembalikan di sini. */
      const habis = r
        ? (!diam || now > this.tolehSampai || !kongsiDiam(r))
        : (now > this.tolehSampai || this.path.length || this.state === 'work');
      if (habis) {
        this.tolehSampai = 0;
        this.tolehRekan = null;
        const balik = this.tolehBalik;
        this.tolehBalik = null;
        // balik menghadap laptop — kecuali sudah berjalan (face diatur langkah)
        // atau sedang menunggu kamu (setButuh sudah memasang 'down')
        if (!this.path.length && !this.butuh) {
          this.face = r
            ? (this.hadap || STATIONS.think.face)
            : (balik || this.hadap || (STATIONS[this.station] || {}).face || 'down');
        }
      }
      return;
    }
    if (!diam) { this.kongsiCek = 0; return; }
    if (!this.kongsiCek) { this.kongsiCek = now + jedaKongsi(); return; }
    if (now < this.kongsiCek) return;
    this.kongsiCek = now + jedaKongsi();
    const r = rekanSeproyek(this, true);
    if (!r) return;
    this.face = r.x > this.x ? 'right' : 'left';
    this.tolehSampai = now + KONGSI_TOLEH_MS;
    this.tolehRekan = r;
    if (Math.random() < 0.2) this.say(esc(KONGSI_SAPA[(Math.random() * KONGSI_SAPA.length) | 0]));
  }

  arrive() {
    if (this.pulang) { this.tibaPulang(); return; }
    /* Tiba di kursi tamu DI DALAM bukaan ruang kadis. Perjalanan itu murni
       kosmetik: yang boleh dipulihkan cuma arah hadap dan state gambar.
       arrivedAt (jam menganggur), busyUntil (jatah minimum 1,8 detik), dan
       tibaSampai TIDAK boleh disentuh — kalau disentuh, jalan-jalan hias di
       dalam ruangan ikut memperpanjang waktu kerja yang dicatat. */
    if (this.diKadis) {
      this.face = this.hadap || 'up';
      this.state = now < this.busyUntil ? 'work' : 'idle';
      return;
    }
    this.arrivedAt = now;
    this.face = this.butuh
      ? 'down'
      : this.hadap || (STATIONS[this.station] || {}).face || 'down';
    // Menyeberang ruangan bisa makan sampai 9 detik — lebih lama dari jatah
    // kerja yang dipasang saat event datang. Tanpa jatah minimum setibanya,
    // pegawai sampai di meja lalu langsung balik kanan tanpa sempat bekerja.
    if (this.adaTugas) this.busyUntil = Math.max(this.busyUntil, now + 1800);
    this.state = now < this.busyUntil ? 'work' : 'idle';
    // jeda antisipasi: pose kerjanya baru TAMPAK 150 ms lagi (poseKerja);
    // state-nya sudah 'work' sekarang supaya kartu/statistik tidak bergeser
    this.tibaSampai = now + TIBA_JEDA_MS;
    // duduk ke kursi rapat: 3 frame turun (turunDuduk); yang mengantre berdiri
    if (this.station === 'rapat' && !this.antre) { this.dudukSejak = now; this.bangunSejak = 0; }
    /* Bukaan ruang kadis, PALING AKHIR supaya state/busyUntil/statistik di
       atas sudah final: yang tiba di ambang pintu kadis dipindah ke dalam
       ruangan. Gerbang !eventKerja WAJIB — event disposisi/ember/tong
       sampah/rapat memakai a.alpha dan a.path yang sama dan akan berebut. */
    if (this.station === 'agent' && !this.diKadis && !this.antre && !this.eventKerja && sisipBoleh()) {
      masukKadis(this);
    }
  }

  // Meninggalkan kursi rapat: berdiri 3 frame (turunDuduk), dipanggil dari
  // tiap jalur yang memasang path baru. Tanpa efek kalau tidak sedang duduk.
  bangkit() {
    if (this.dudukSejak) { this.bangunSejak = now; this.dudukSejak = 0; }
  }

  /* Antrean stasiun (I.8). Stasiunnya penuh waktu goTo(): dia berdiri di lajur
     di belakang stasiun (antre = urutan 1..n), pose berdiri biasa menghadap
     stasiun — bukan pose butuh manusia. `state` tetap 'work' secara logika:
     tool call-nya memang sedang jalan, kartu & statistik tidak berubah; cuma
     posisinya yang antre. Yang paling depan mengecek slot kosong tiap frame
     lalu maju lewat goTo(); yang di belakangnya merapat mengisi celah. */
  tickAntre() {
    const id = this.station, s = STATIONS[id];
    if (!s) { this.antre = 0; return; }
    let depan = 0;
    for (const o of penghuni()) if (o !== this && o.station === id && o.antre && o.antreUrut < this.antreUrut) depan++;
    if (!depan && (id === 'think' ? slotKongsi(this) : slotBebas(id, this)) >= 0) { this.goTo(id); return; }
    if (depan + 1 !== this.antre) {
      this.antre = depan + 1;
      this.path = [{ x: titikAntre(s, this.antre), y: s.lane }];
      this.state = 'walk';
    }
  }

  /* Stamina (I.2): waktu di kantor dan menunggu kamu menguras, menganggur dan
     pantry memulihkan; call & kegagalan dipotong di handle() lewat lelahkan().
     Semuanya kosmetik — tidak ada yang membacanya selain gambar dan kartu. */
  tickStamina(dt) {
    let d = -STAMINA_JAM * dt / 3600;
    if (this.butuh) d -= STAMINA_TUNGGU * dt / 60;
    else if (this.eventKerja && /pantry/.test(this.eventKerja.id || '')) d += STAMINA_PANTRY * dt / 60;
    else if (this.state !== 'work' && !this.adaTugas) d += STAMINA_PULIH * dt / 60;
    this.stamina = Math.max(0, Math.min(1, this.stamina + d));
  }
  lelahkan(n) { this.stamina = Math.max(0, this.stamina - n); }
  // suasana hati = turunan sederhana stamina, cuma buat baris "kondisi" di kartu
  get suasana() {
    return this.stamina < STAMINA_LELAH ? 'lelah' : this.stamina > STAMINA_SEGAR ? 'segar' : 'biasa';
  }

  /* Ritual pulang (I.6) — dipanggil session-end untuk sesi yang tuntas (sudah
     `stop`). Slot mejanya dilepas SEKARANG: station 'keluar' tidak dihitung
     slotBebas, dan laptopnya padam sendiri karena drawMejaKerja cuma menyalakan
     meja yang ditempati. Urutan: singgah salaman ke rekan seproyek yang
     menganggur (1 s, saling hadap) kalau ada → mesin absen (0,6 s tempel jari)
     → pintu → hilang. Jatah total PULANG_BATAS_MS, dan ritualnya DIUKUR dulu:
     yang tidak muat dibuang dari belakang — salaman dulu, lalu absennya; kalau
     absen pun tidak terkejar (meja kiri jauh: ±10 s ke mesin absen), dia
     langsung keluar lewat tepi terdekat. Lewat jatah, memudar di tempat. */
  pulangKantor() {
    if (this.pulang) return;
    lepasDariEvent(this);
    keluarKadis(this);        // ritual pulang berangkat dari ambang pintu, bukan dari dalam bukaan
    this.setButuh(null); this.setMacet(null);
    this.betah = false; this.adaTugas = false; this.busyUntil = 0;
    this.fx = null; this.doing = 'pulang'; this.antre = 0;
    this.pulangBatas = now + PULANG_BATAS_MS;
    this.station = 'keluar'; this.slotIdx = 0;
    const laju = SPEED * (this.stamina < STAMINA_LELAH ? LAJU_LELAH : 1);
    const lane = (y) => (y < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN);
    const jarak = (x, y, tx, ty) => {
      let d = 0;
      for (const p of route(x, y, lane(y), tx, ty, lane(ty))) { d += Math.hypot(p.x - x, p.y - y); x = p.x; y = p.y; }
      return d;
    };
    const jatah = PULANG_BATAS_MS / 1000;
    const keAbsenLaluPintu = (x, y) => (jarak(x, y, ABSEN_X, ABSEN_Y) + jarak(ABSEN_X, ABSEN_Y, PINTU_X, LANE_UP)) / laju
      + PULANG_ABSEN_MS / 1000;
    const r = rekanSeproyek(this, true);
    if (r) {
      const dariKiri = this.x <= r.x;         // singgah di sisi yang dia datangi
      const sx = r.x + (dariKiri ? -14 : 14);
      if (jarak(this.x, this.y, sx, r.y) / laju + PULANG_SALAM_MS / 1000 + keAbsenLaluPintu(sx, r.y) <= jatah) {
        this.pulangRekan = r;
        this.pulangKe(sx, r.y, dariKiri ? 'right' : 'left', 'salam');
        return;
      }
    }
    if (keAbsenLaluPintu(this.x, this.y) <= jatah) this.pulangKe(ABSEN_X, ABSEN_Y, 'up', 'absen');
    else if (this.x < W / 2) this.pulangKe(-20, LANE_DOWN, 'left', 'pintu');   // tepi kiri, seperti peserta rapat
    else this.pulangKe(PINTU_X, LANE_UP, 'right', 'pintu');
  }
  pulangKe(tx, ty, hadap, tahap) {
    const fromLane = this.y < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN;
    const bLane = ty < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN;
    this.bangkit();
    this.pulang = tahap;
    this.hadap = hadap;
    this.path = route(this.x, this.y, fromLane, tx, ty, bLane);
    this.state = 'walk';
  }
  tibaPulang() {
    this.face = this.hadap || this.face;
    this.state = 'idle';
    if (this.pulang === 'salam') {
      const r = this.pulangRekan;
      if (r && !r.path.length && !r.butuh) r.face = r.x > this.x ? 'left' : 'right';   // salaman: saling hadap
      this.pose = 'salam';
      this.pulangTahap = now + PULANG_SALAM_MS;
      this.pulang = 'salam-diam';
    } else if (this.pulang === 'absen') {
      this.pose = 'angkat';                    // tempel jari ke mesin absen
      this.pulangTahap = now + PULANG_ABSEN_MS;
      this.pulang = 'absen-diam';
    } else hapusPegawai(this);                 // sampai pintu: hilang
  }
  // true = dihapus di sini (jatah habis); pemanggil harus berhenti menyentuhnya
  tickPulang() {
    if (now > this.pulangBatas) { hapusPegawai(this); return true; }
    this.alpha = Math.min(1, (this.pulangBatas - now) / 300);   // jatah hampir habis: memudar, bukan lenyap mendadak
    if (this.path.length) return false;
    if (this.pulang === 'salam-diam' && now > this.pulangTahap) {
      const r = this.pulangRekan; this.pulangRekan = null;
      if (r && !r.path.length && !r.butuh && !r.tolehSampai) r.face = r.hadap || STATIONS.think.face;
      this.pose = null;
      this.pulangKe(ABSEN_X, ABSEN_Y, 'up', 'absen');
    } else if (this.pulang === 'absen-diam' && now > this.pulangTahap) {
      this.pose = null;
      this.pulangKe(PINTU_X, LANE_UP, 'left', 'pintu');
    }
    return false;
  }

  destroy() {
    lepaskanAktor(this);                   // event tidak boleh memegang hantu
    batalkanPengingat(this);               // lonceng tidak boleh berbunyi untuk hantu
    // judul tab dihitung dari `agents`; pemanggil baru menghapusnya SESUDAH
    // destroy() kembali, jadi hitung ulangnya ditunda satu putaran
    setTimeout(perbaruiJudul, 0);
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

// Jembatan ke event lapor-diri-pegawai-baru: mulai()-nya tidak bisa menerima
// parameter, jadi agen yang baru lahir dititipkan di sini dulu.
const antrianLaporDiri = [];

function agentFor(id) {
  let a = agents.get(id);
  // Yang sedang ritual pulang tidak bisa disuruh balik: sesinya sudah bilang
  // habis. Dia dihapus langsung, dan event ini melahirkan pegawai baru.
  if (a && a.pulang) { hapusPegawai(a); a = null; }
  if (!a) {
    a = new Agent(id);
    a.setPeran(peranAwal.get(id) || peranBawaan(agenSeq++));
    const sudahAdaSebelumnya = agents.size >= 1;
    agents.set(id, a);
    jagaPopulasi();
    if (sudahAdaSebelumnya && typeof picuEvent === 'function') {
      antrianLaporDiri.push(a);
      picuEvent('lapor-diri-pegawai-baru', false);
    }
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

/* Siapa yang pernah bubar dari rapat: kunci "<sesi induk>|<agent_type>".
   Dibatasi 200 entri (yang paling lama dibuang) supaya halaman yang terbuka
   berhari-hari tidak menimbun; Map dipakai karena urut sisipannya terjaga. */
const pernahHadir = new Map();
const PERNAH_HADIR_MAKS = 200;
function catatPernahHadir(kunci) {
  pernahHadir.delete(kunci);
  pernahHadir.set(kunci, Date.now());
  while (pernahHadir.size > PERNAH_HADIR_MAKS) pernahHadir.delete(pernahHadir.keys().next().value);
}
// Tumpukan notulen sisa rapat di sudut meja rapat (RUANGAN.notulen): tampilan
// maupun datanya dibatasi 10 lapis — bekas ruangan tidak pernah direset, jadi
// batasnya harus ada di data, bukan cuma di gambar.
const NOTULEN_MAKS = 10;

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
    this.jenis = '';           // agent_type — kunci "hadir lagi" bersama sesi induknya
  }

  /* Kursi sementara diambil alih oleh agen yang sebenarnya. Namanya diganti
     hanya kalau `agent_type` memang ada — `description` dari pemanggil sering
     lebih deskriptif daripada "general-purpose", jadi jangan ditimpa kosong. */
  jadikan(agenId, agen) {
    this.agenId = agenId;
    if (agen) {
      this.nama = agen;
      this.jenis = agen;
      this.sapa();
    }
  }

  /* Salam waktu tiba. Peserta yang `agent_type`-nya pernah bubar dari rapat
     sesi induk yang sama dikenali sebagai orang lama — kalimatnya "hadir lagi",
     bukan perkenalan ulang. Sekali per kedatangan: dipanggil dari masuk()
     dan jadikan(), keduanya cuma sekali seumur peserta. */
  sapa() {
    if (this.jenis && pernahHadir.has(this.pemilik + '|' + this.jenis)) {
      this.say('<b>' + esc(this.nama) + '</b> ' + (Math.random() < 0.5 ? 'hadir lagi' : 'izin, lanjut yang tadi'));
    } else {
      this.say('<b>' + esc(this.nama) + '</b> hadir');
    }
  }

  // dipanggil setelah terdaftar di `peserta`, supaya kursinya tidak bentrok
  // dengan undangan lain dari panggilan tool yang sama
  masuk() {
    this.goTo('rapat');
    this.sapa();
  }

  bubar() {
    if (this.keluar) return;
    // Notulen sisa rapat: tiap peserta yang sempat duduk meninggalkan
    // selembar catatan di sudut meja (RUANGAN.notulen, dibatasi NOTULEN_MAKS).
    // Sekalian dicatat siapa yang pernah hadir, buat salam "hadir lagi".
    if (this.station === 'rapat') {
      RUANGAN.notulen = Math.min(NOTULEN_MAKS, RUANGAN.notulen + 1);
      if (this.jenis) catatPernahHadir(this.pemilik + '|' + this.jenis);
    }
    this.keluar = true;
    this.betah = false;
    this.busyUntil = 0;
    this.bangkit();            // berdiri dari kursi (3 frame) sambil melangkah
    this.station = 'keluar';   // kursinya dilepas sekarang, bukan setelah sampai pintu
    this.antre = 0;
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
// hari-kejepit-nasional menekan ini ke 1 sementara; null = pakai bawaan.
// Variabel terpisah, bukan mengubah MIN_DI_LAYAR langsung, supaya nilai
// aslinya tidak pernah hilang kalau event dibatalkan di tengah jalan.
let minDiLayarTimpa = null;
// Standby yang dihapus manual dari panel (tombol "hapus") tidak boleh langsung
// digantikan pengganti oleh jagaPopulasi — tiap penghapusan menurunkan syarat
// minimalnya satu, seumur halaman ini terbuka. Reset otomatis kalau dimuat ulang.
let standbyDihapus = 0;
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
    if (this.tugasNotulen) { this.tickNotulen(); return; }
    if (RUANGAN.notulen >= NOTULEN_MIN_BERES && !petugasNotulen) {
      if (!notulenBerikut) notulenBerikut = now + jedaNotulen();   // jam mulai berjalan begitu ada yang bisa diberesi
      else if (now > notulenBerikut && calonPetugasNotulen() === this) {
        notulenBerikut = now + jedaNotulen();
        petugasNotulen = this;
        this.tugasNotulen = 'pergi';
        this.adaTugas = true;           // event tidak boleh meminjamnya di tengah jalan (bisaDipinjam)
        this.doingEvent = 'membereskan notulen rapat';
        this.goToXY(NOTULEN_X + 4, 238, 'up');   // y 238: pita bawah, digambar DI DEPAN meja & kursi dekat
        return;
      }
    }
    // eventKerja: sedang dipinjam event acak / apel pagi — jangan mondar-mandir
    // di tengah adegan; lepaskanAktor() mengosongkannya lagi begitu selesai.
    if (!this.eventKerja && !this.path.length && now > this.nextMove) {
      this.goTo(MAMPIR[(Math.random() * MAMPIR.length) | 0]);
      this.nextMove = now + 11000 + Math.random() * 15000;
    }
  }
  /* Membereskan notulen: sampai di sudut meja, berhenti ±2 detik (arrive()
     memberi 1,8 detik pose kerja karena adaTugas), tumpukannya lenyap — dibawa
     sebagai kertas ke lemari arsip, lalu kembali mondar-mandir seperti biasa. */
  tickNotulen() {
    if (this.tugasNotulen === 'pergi') {
      if (!this.path.length) { this.tugasNotulen = 'tunggu'; this.tungguNotulen = now + 2000; }
    } else if (this.tugasNotulen === 'tunggu' && now > this.tungguNotulen) {
      RUANGAN.notulen = 0;
      this.bawa = 'kertas';
      this.bawaSampai = now + 9000;
      this.tugasNotulen = '';
      this.adaTugas = false;
      this.busyUntil = 0;
      this.state = 'idle';
      this.doingEvent = '';
      petugasNotulen = null;
      this.goTo('read');
      this.nextMove = now + 11000 + Math.random() * 15000;
    }
  }
  destroy() {
    if (petugasNotulen === this) petugasNotulen = null;   // penambal yang pamit tidak boleh mengunci tugas
    super.destroy();
  }
  say() {}                              // dibungkam: standby bukan sesi nyata
}

/* Notulen sisa rapat dibereskan pegawai standby — arsiparis kalau ada, standby
   mana pun kalau tidak — tiap ±10 menit selama tumpukannya ≥3 lembar. Ini
   bukan event acak (tidak lewat penjadwal, tidak masuk log), cuma rutinitas
   kecil di class Standby. Standby yang sedang jadi pemeran event tidak dipilih
   (bisaDipinjam), dan petugas yang kebetulan dihapus jagaPopulasi melepas
   tugasnya lewat destroy(). window.NOTULEN_UJI_MS mempercepat jedanya (uji). */
const NOTULEN_MIN_BERES = 3;
const NOTULEN_X = 177;                  // sudut kiri depan taplak, sama seperti di drawRapat
const NOTULEN_JEDA_MS = 600000;
let notulenBerikut = 0;                 // now-timestamp percobaan beres berikutnya; 0 = jam belum jalan
let petugasNotulen = null;              // standby yang sedang membawa tumpukan
const jedaNotulen = () => (typeof window !== 'undefined' && window.NOTULEN_UJI_MS) || NOTULEN_JEDA_MS;
function calonPetugasNotulen() {
  // arsiparis boleh dipanggil walau sedang mondar-mandir (jalan santai MAMPIR
  // bukan pekerjaan); standby lain diambil kalau tidak ada arsiparis, yang
  // sedang berdiri diam didahulukan supaya tidak memotong langkah orang.
  const bisa = standby.filter((b) => bisaDipinjam(b));
  return bisa.find((b) => b.peran === 'arsiparis') || bisa.find((b) => !b.path.length) || bisa[0] || null;
}

// standby = penambal, jumlahnya selalu (4 - sesi nyata - yang sudah dihapus
// manual), tidak pernah negatif
function jagaPopulasi() {
  const dasar = minDiLayarTimpa == null ? MIN_DI_LAYAR : minDiLayarTimpa;
  const perlu = Math.max(0, dasar - standbyDihapus - agents.size);
  while (standby.length > perlu) {
    const keluar = standby.pop();
    keluar.destroy();
  }
  while (standby.length < perlu) standby.push(new Standby(spawnIndex));
}

/* ------------------------------------------------------- hapus dari daftar --
   Beda dari "stop": ini tidak menyentuh proses apa pun, cuma melupakan
   tampilannya di halaman ini. Dipakai untuk pegawai standby (penambal yang
   memang bukan sesi nyata) dan sesi nyata yang lagi idle — misalnya sesi
   terminal yang jadi diam tanpa pernah mengirim penutup ('session-end'), jadi
   kursinya tidak terkunci selamanya. Kalau sesi nyata yang dihapus ternyata
   masih hidup dan mengirim event lagi, dia lapor diri lagi sebagai pegawai
   baru — bukan bug, itu memang bagaimana halaman ini mengenali sesi. */
function hapusPegawai(a) {
  a.destroy();
  if (a.standby) {
    const i = standby.indexOf(a);
    if (i !== -1) { standby.splice(i, 1); standbyDihapus++; }
  } else {
    agents.delete(a.id);
  }
  jagaPopulasi();
  renderCrew();
}

function kursiKosong() {
  let dipakai = 0;
  for (const o of penghuni()) if (o.station === 'rapat' && !o.antre) dipakai++;
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
  p.jenis = ev.agen || '';       // namanya sudah dari agent_type; salamnya di masuk()
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
const statsBtn = document.getElementById('statsBtn');
const klipingBtn = document.getElementById('klipingBtn');

let toolCount = 0;
/* Total token sejak HALAMAN INI dibuka, dijumlah dari tiap event `token`
   yang isinya angka kumulatif PER SESI (bukan delta) — jadi yang ditambahkan
   ke total cuma selisihnya dari nilai terakhir sesi itu, supaya sesi yang
   sudah pulang tidak lenyap dari totalnya. tokenPerSesi menyimpan nilai
   terakhir itu; kuncinya sesi 12-karakter, sama seperti server. */
const tokenPerSesi = new Map();
const tokenTotal = { input: 0, output: 0, cacheTulis: 0, cacheBaca: 0 };
function tambahTokenTotal(sesi, t) {
  const lama = tokenPerSesi.get(sesi) || { input: 0, output: 0, cacheTulis: 0, cacheBaca: 0 };
  tokenTotal.input += (t.input || 0) - lama.input;
  tokenTotal.output += (t.output || 0) - lama.output;
  tokenTotal.cacheTulis += (t.cacheTulis || 0) - lama.cacheTulis;
  tokenTotal.cacheBaca += (t.cacheBaca || 0) - lama.cacheBaca;
  tokenPerSesi.set(sesi, t);
  if (!dlgStats.hidden) statsGambar();
}
/* Beda cakupan dari token: biaya cuma ada buat sesi headless yang dilahirkan
   halaman ini (lihat catatan di server.mjs soal `total_cost_usd`), dan
   datang SEKALI waktu sesinya selesai — bukan angka yang jalan terus. */
let biayaTotal = 0;
let biayaCount = 0;
function tambahBiayaTotal(b) {
  biayaTotal += b.usd;
  biayaCount++;
  if (!dlgStats.hidden) statsGambar();
}
// Kapan tool call terakhir masuk — dipakai event yang menggambarkan MENUNGGU
// (layar mengantuk, berdiri di depan pintu kadis, detak jam di ruangan sepi).
let toolTerakhir = 0;
const started = Date.now();
let sound = false;
let audio = null;
let busEfek = null, busNotif = null, busMusik = null;
/* Level mixer per komponen (0..1) — BEDA dari nyala/mati (`sound`/`notifOn`/
   `musikNyala` di bawah) yang sengaja tidak diingat browser: angka ini cuma
   pengali relatif, jadi aman diingat lewat localStorage. Dibaca ulang dari
   `ingatan` di blok "pengaturan" jauh di bawah (sesudah `ingatan` ada);
   nilai bawaan 1 di sini cuma jaga-jaga kalau bus sempat dibuat sebelum
   pembacaan itu sempat jalan. */
const VOL = { efek: 1, notif: 1, musik: 1 };

// Satu AudioContext dipakai semua suara di halaman ini; tiga "bus" gain di
// baliknya (efek/notifikasi/musik) supaya volume tiap komponen bisa digeser
// sendiri-sendiri tanpa mengubah campuran/attack tiap bunyi satu per satu.
// Semua tempat yang dulu `if (!audio) audio = new AudioContext()` sekarang
// panggil ini saja.
function pastikanAudio() {
  if (audio) return audio;
  audio = new (window.AudioContext || window.webkitAudioContext)();
  busEfek = audio.createGain();  busEfek.gain.value = VOL.efek;  busEfek.connect(audio.destination);
  busNotif = audio.createGain(); busNotif.gain.value = VOL.notif; busNotif.connect(audio.destination);
  busMusik = audio.createGain(); busMusik.gain.value = VOL.musik; busMusik.connect(audio.destination);
  return audio;
}

/* Notifikasi "tugas selesai" — setelan terpisah dari efek suara di atas,
   sengaja: orang bisa mau dikabari begitu sesi kelar tanpa mau dengar blip
   tiap tool call. Nyala/mati tidak diingat browser, sama seperti `sound` —
   dua-duanya sama-sama butuh AudioContext yang baru boleh jalan sesudah klik
   pengguna. Keduanya dan `musikNyala` disambungkan ke checkbox di panel
   Pengaturan lebih bawah (lihat blok "pengaturan"), bukan di sini — supaya
   pemasangannya sejajar dengan `audio`/`musikGain`/dkk yang baru didefinisikan
   sesudah titik ini. */
let notifOn = false;

/* Lonceng sinus 3 nada naik — beda timbre dan bentuk dari blip persegi biasa,
   supaya "sesi ini kelar" (atau "butuh arahan kamu") kedengaran lain dari
   sekadar tool call berikutnya. Disusul suara ngomong beneran kalau
   browsernya punya Web Speech API: itu realisasi "Izin.." yang diminta —
   bukan efek bunyi, tapi benar disuarakan. */
function bunyiLonceng() {
  if (!audio) return;
  const t0 = audio.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, i) => {   // C5 E5 G5
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    const mulai = t0 + i * 0.1;
    g.gain.setValueAtTime(0.0001, mulai);
    g.gain.exponentialRampToValueAtTime(0.1, mulai + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, mulai + 0.55);
    o.connect(g); g.connect(busNotif);
    o.start(mulai); o.stop(mulai + 0.6);
  });
}

function notifSelesai(nama) {
  bunyiLonceng();
  ucapSuara('Izin, ' + (nama ? nama + ' ' : 'tugasnya ') + 'selesai');
}

// Dipicu saat sesi minta izin atau bertanya dan menunggu jawabanmu — beda
// dari notifSelesai (pekerjaan kelar), ini pekerjaan yang tertahan.
function notifKonfirmasi() {
  bunyiLonceng();
  ucapSuara('Izin mohon arahan');
}

/* ---------- pengingat sesi terkatung ----------
   Lonceng pertama (notifKonfirmasi/stop-gagal) cuma berbunyi sekali, saat
   kejadian. Kalau kamu sedang di jendela lain, kejadian itu lewat begitu saja
   dan sesinya terkatung berjam-jam. Pengingat ini event-driven, bukan sapuan
   berkala: timernya dipasang tepat saat pegawai masuk keadaan butuh/macet
   (pantauTerkatung dari handle()) dan dicabut tepat saat keadaan itu padam
   atau pegawainya dihapus (destroy). Tidak ada interval yang mengecek semua
   pegawai tiap detik. */

// Dua nada TURUN dan pendek — kebalikan lonceng selesai yang tiga nada naik:
// yang ini bukan kabar baik, cuma "masih ada yang menunggu kamu".
function bunyiLoncengPengingat() {
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  const t0 = audio.currentTime;
  [783.99, 659.25].forEach((freq, i) => {   // G5 E5
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    const mulai = t0 + i * 0.14;
    g.gain.setValueAtTime(0.0001, mulai);
    g.gain.exponentialRampToValueAtTime(0.09, mulai + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, mulai + 0.3);
    o.connect(g); g.connect(busNotif);
    o.start(mulai); o.stop(mulai + 0.35);
  });
}

// Judul tab: awalan "(n) menunggu paraf · " selama ada pegawai terkatung,
// supaya tab yang tertimbun pun memberi tahu. Satu-satunya tempat yang menulis
// document.title di halaman ini; JUDUL_ASLI diambil sekali dari <title>.
const JUDUL_ASLI = document.title;
function perbaruiJudul() {
  let butuh = 0, macet = 0;
  for (const a of agents.values()) { if (a.butuh) butuh++; else if (a.macet) macet++; }
  const n = butuh + macet;
  const judul = (!n ? '' : butuh ? '(' + n + ') menunggu paraf · ' : '(' + n + ') berhenti · ') + JUDUL_ASLI;
  if (document.title !== judul) document.title = judul;
}

// Dipanggil handle() tiap event yang membawa butuh/macet. Timer cuma dipasang
// atau dicabut pada TRANSISI jenis (bukan tiap event bernilai sama), supaya
// pertanyaan yang sama tidak mengulang hitungan 2 menitnya dari nol.
function pantauTerkatung(a) {
  const jenis = a.butuh ? 'butuh' : a.macet ? 'macet' : '';
  if (jenis !== a.terkatungJenis) {
    a.terkatungJenis = jenis;
    if (jenis) jadwalkanPengingat(a); else batalkanPengingat(a);
  }
  perbaruiJudul();
}

// `jenjang` opsional (array ms) untuk uji; `window.PENGINGAT_UJI_MS` memendekkan
// jenjang pertama dari konsol tanpa menyentuh kode (jenjang kedua = 5×-nya).
function jadwalkanPengingat(a, jenjang) {
  batalkanPengingat(a);
  if (!pengingatOn) return;
  const ms = jenjang || (window.PENGINGAT_UJI_MS
    ? [window.PENGINGAT_UJI_MS, window.PENGINGAT_UJI_MS * 5] : TERKATUNG_JENJANG_MS);
  a.pengingatTimer = ms.map((t, i) => setTimeout(() => {
    if (a.pengingatTimer) a.pengingatTimer[i] = 0;
    bunyikanPengingat(a, i);
  }, t));
}
function batalkanPengingat(a) {
  if (!a.pengingatTimer) return;
  for (const id of a.pengingatTimer) if (id) clearTimeout(id);
  a.pengingatTimer = null;
}

function bunyikanPengingat(a, jenjang) {
  // jaga-jaga: keadaannya sudah padam atau orangnya sudah dihapus tapi timer
  // sempat lolos — lebih baik diam daripada mengingatkan hal yang tidak ada
  if (!a.butuh && !a.macet) return;
  if (agents.get(a.id) !== a) return;
  bunyiLoncengPengingat();
  notifPeramban(a, jenjang);
}

// Notification peramban cuma kalau izinnya SUDAH diberikan lewat tombol di
// panel ⚙️ — tidak pernah diminta dari sini. `tag` per pegawai supaya jenjang
// kedua mengganti kartu jenjang pertama, bukan menumpuk.
function notifPeramban(a, jenjang) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const nama = namaTampil(a) + (a.project ? ' (' + a.project + ')' : '');
  const judul = a.butuh ? 'Menunggu paraf: ' + nama : 'Berhenti karena galat: ' + nama;
  const ket = a.butuh ? a.butuh.alasan || a.butuh.label : '';
  const perkara = a.butuh
    ? (TUNGGU_TEKS[a.butuh.sebab] || TUNGGU_TEKS.izin) + (ket ? ' — ' + ket : '')
    : a.macet.label || a.macet.jenis || 'galat';
  const sejak = a.tungguSejak ? ' · sudah ' + durasiSingkat(Date.now() - a.tungguSejak) : '';
  try {
    const n = new Notification(judul, {
      body: satuBaris(perkara, 120) + sejak + (jenjang ? ' (pengingat kedua)' : ''),
      tag: 'terkatung-' + a.id, renotify: true,
      silent: true,   // loncengnya sudah dari kita; jangan bunyi dua kali
    });
    n.onclick = () => {
      try { window.focus(); } catch { /* peramban boleh menolak */ }
      if (agents.get(a.id) === a) bukaKartu(a);
      n.close();
    };
  } catch { /* konstruktor Notification bisa melempar di beberapa peramban seluler */ }
}

function ucapSuara(teks) {
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(teks);
    u.lang = 'id-ID';
    u.rate = 1.05;
    u.volume = 0.85 * VOL.notif;
    // suara id-ID kalau browsernya punya; kalau tidak, ya suara default —
    // getVoices() sering kosong di panggilan pertama, itu bukan galat
    const suara = speechSynthesis.getVoices().find((v) => v.lang.startsWith('id'));
    if (suara) u.voice = suara;
    speechSynthesis.speak(u);
  } catch { /* Web Speech API kadang absen atau ditolak browser headless */ }
}

/* ---------- musik lofi kantor ---------- */
/* Sama sekali tanpa file audio, sama seperti derau hujan/guntur di atas: chord
   jazzy pelan-pelan, beat lembut, dan desis vinyl, semua disintesis langsung.
   `musikGain` cuma jadi fader on/off supaya nyala/mati halus, bukan patah —
   volume tiap instrumen diatur sendiri-sendiri di bawah. */
const LOFI_KORD = [
  [174.61, 220.00, 261.63, 329.63],   // Fmaj7  (F3 A3 C4 E4)
  [164.81, 196.00, 246.94, 293.66],   // Em7    (E3 G3 B3 D4)
  [146.83, 174.61, 220.00, 261.63],   // Dm7    (D3 F3 A3 C4)
  [130.81, 164.81, 196.00, 246.94],   // Cmaj7  (C3 E3 G3 B3)
];
const LOFI_LANGKAH_DUR = 60 / 76 / 4;   // 76 BPM, 16 langkah per birama

let musikNyala = false;
let musikGain = null;
let musikKresek = null;
let musikTimer = null;
let musikLangkah = 0;
let musikBirama = 0;
let musikBerikut = 0;

function musikKick(t) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g); g.connect(musikGain);
  o.start(t); o.stop(t + 0.24);
}

function musikSnare(t) {
  const len = (audio.sampleRate * 0.15) | 0;
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.7);
  const src = audio.createBufferSource(); src.buffer = buf;
  const bp = audio.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.6;
  const g = audio.createGain(); g.gain.value = 0.1;
  src.connect(bp); bp.connect(g); g.connect(musikGain);
  src.start(t);
}

function musikHat(t, aksen) {
  const len = (audio.sampleRate * 0.045) | 0;
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = audio.createBufferSource(); src.buffer = buf;
  const hp = audio.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
  const g = audio.createGain(); g.gain.value = aksen ? 0.07 : 0.035;
  src.connect(hp); hp.connect(g); g.connect(musikGain);
  src.start(t);
}

// Pad chord: triangle sedikit sumbang (detune acak) + lowpass, khas kualitas
// rekaman lofi yang tidak steril. Durasinya melewati satu birama supaya
// chord berikutnya masuk sebelum yang lama benar-benar habis (menyatu).
function musikPad(t, freqs, durasi) {
  freqs.forEach((f) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    o.detune.value = Math.random() * 12 - 6;
    const lp = audio.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 950;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + durasi * 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + durasi);
    o.connect(lp); lp.connect(g); g.connect(musikGain);
    o.start(t); o.stop(t + durasi + 0.05);
  });
}

function musikMulaiKresek() {
  const len = audio.sampleRate * 2;
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = Math.random() < 0.0015 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.12;
  }
  const src = audio.createBufferSource();
  src.buffer = buf; src.loop = true;
  const hp = audio.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
  const g = audio.createGain(); g.gain.value = 0.02;
  src.connect(hp); hp.connect(g); g.connect(musikGain);
  src.start();
  musikKresek = src;
}

function musikLangkahBunyi(birama, langkah, t) {
  if (langkah === 0) musikPad(t, LOFI_KORD[birama], LOFI_LANGKAH_DUR * 16 * 1.15);
  if (langkah === 0 || langkah === 10) musikKick(t);
  if (langkah === 4 || langkah === 12) musikSnare(t);
  if (langkah % 2 === 0) musikHat(t, langkah % 4 === 0);
}

// Scheduler look-ahead standar: dicek tiap 30ms, tapi jadwal ditulis lewat
// audio.currentTime supaya waktunya presisi walau tick timer-nya meleset.
function musikJadwal() {
  while (musikBerikut < audio.currentTime + 0.12) {
    musikLangkahBunyi(musikBirama, musikLangkah, musikBerikut);
    const ganjil = musikLangkah % 2 === 1;
    musikLangkah++;
    if (musikLangkah >= 16) { musikLangkah = 0; musikBirama = (musikBirama + 1) % LOFI_KORD.length; }
    musikBerikut += LOFI_LANGKAH_DUR * (ganjil ? 0.85 : 1.15);   // ayunan halus
  }
  musikTimer = setTimeout(musikJadwal, 30);
}

function musikNyalakan() {
  pastikanAudio();
  if (!musikGain) {
    musikGain = audio.createGain();
    musikGain.gain.value = 0;
    musikGain.connect(busMusik);
  }
  musikGain.gain.setTargetAtTime(1, audio.currentTime, 0.5);
  if (!musikKresek) musikMulaiKresek();
  musikLangkah = 0; musikBirama = 0; musikBerikut = audio.currentTime + 0.1;
  musikJadwal();
}
function musikMatikan() {
  if (musikGain) musikGain.gain.setTargetAtTime(0.0001, audio.currentTime, 0.15);
  clearTimeout(musikTimer);
  if (musikKresek) { musikKresek.stop(); musikKresek = null; }
}

/* ---------- Indonesia Raya (lofi, terjadwal Selasa & Kamis jam 10) -------
   Reff yang paling dihafal semua orang saja, ditranskrip dari ingatan (bukan
   dari partitur resmi) sebagai tribute lofi — bukan rekaman acuan. Kalau ada
   nada yang kedengaran meleset, tinggal ubah RAYA_MELODI di bawah.
   Sengaja tanpa beat/drum seperti musik lofi kantor di atas: lagu kebangsaan
   dibiarkan cuma pad + melodi + desis vinyl, biar tidak terdengar main-main. */
const RAYA_SEMITON = [0, 2, 4, 5, 7, 9, 11];   // do re mi fa sol la ti (tangga mayor)

// deg 1..7 = satu oktaf; 8..14 = oktaf berikutnya (do' seperti notasi angka); 0 = diam
function rayaFreq(deg) {
  if (!deg) return 0;
  const oktaf = Math.floor((deg - 1) / 7);
  const semiton = RAYA_SEMITON[(deg - 1) % 7] + oktaf * 12;
  return 392.00 * Math.pow(2, semiton / 12);   // do = G4
}
function rayaAkor(root, dasarHz) {
  const f0 = dasarHz * Math.pow(2, RAYA_SEMITON[(root - 1) % 7] / 12);
  return [f0, f0 * Math.pow(2, 4 / 12), f0 * Math.pow(2, 7 / 12)];   // triad mayor
}
const RAYA_G = rayaAkor(1, 196.00), RAYA_C = rayaAkor(4, 196.00), RAYA_D = rayaAkor(5, 196.00);

// [derajat, durasi dalam ketuk] -- "Indonesia Raya, merdeka merdeka, tanahku
// negeriku yang kucinta, Indonesia Raya merdeka merdeka, hiduplah Indonesia Raya"
const RAYA_MELODI = [
  [5, 1], [5, 0.5], [5, 0.5], [8, 1], [0, 0.5], [7, 0.5], [6, 1],
  [5, 1], [5, 1], [6, 0.5], [5, 0.5], [3, 2],
  [3, 0.5], [3, 0.5], [4, 0.5], [5, 1.5], [3, 0.5], [1, 0.5],
  [2, 0.5], [3, 0.5], [4, 0.5], [5, 2],
  [5, 1], [5, 0.5], [5, 0.5], [8, 1], [0, 0.5], [7, 0.5], [6, 1],
  [5, 1], [5, 1], [6, 0.5], [5, 0.5], [3, 2],
  [4, 0.5], [5, 0.5], [6, 1], [5, 0.5], [4, 0.5], [3, 1], [2, 1], [1, 3],
];

function rayaPad(t, freqs, durasi, tujuan) {
  freqs.forEach((f) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    o.detune.value = Math.random() * 8 - 4;
    const lp = audio.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + durasi * 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + durasi);
    o.connect(lp); lp.connect(g); g.connect(tujuan);
    o.start(t); o.stop(t + durasi + 0.05);
  });
}

// Vibrato kecil + serangan/luruh lembut supaya kedengaran "dinyanyikan",
// bukan sekadar nada sintesis lurus.
function rayaLead(t, freq, durasi, tujuan) {
  if (!freq) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  const vib = audio.createOscillator(), vibGain = audio.createGain();
  vib.frequency.value = 5; vibGain.gain.value = freq * 0.006;
  vib.connect(vibGain); vibGain.connect(o.frequency);
  vib.start(t); vib.stop(t + durasi + 0.05);
  const lp = audio.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
  const susut = Math.min(0.08, durasi * 0.25);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.11, t + 0.04);
  g.gain.setValueAtTime(0.11, t + Math.max(0.04, durasi - susut));
  g.gain.linearRampToValueAtTime(0.0001, t + durasi);
  o.connect(lp); lp.connect(g); g.connect(tujuan);
  o.start(t); o.stop(t + durasi + 0.05);
}

function rayaKresek(durasi, tujuan) {
  const len = Math.ceil(audio.sampleRate * durasi);
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = Math.random() < 0.0015 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.1;
  }
  const src = audio.createBufferSource(); src.buffer = buf;
  const hp = audio.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
  const g = audio.createGain(); g.gain.value = 0.018;
  src.connect(hp); hp.connect(g); g.connect(tujuan);
  src.start();
}

let rayaSedangMain = false;

// Dipanggil dari jadwal Selasa/Kamis di bawah, atau lewat konsol (`mainkanIndonesiaRaya()`)
// untuk uji coba. Sama seperti tombol musik/notifikasi: butuh AudioContext yang
// sudah pernah dibuka lewat klik pengguna sesi ini, kalau tidak browser membisukannya.
function mainkanIndonesiaRaya() {
  if (rayaSedangMain) return;
  pastikanAudio();
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  rayaSedangMain = true;

  const gain = audio.createGain();
  gain.gain.value = 0;
  gain.connect(busMusik);

  const BEAT = 60 / 76;   // tempo sama seperti musik lofi kantor, biar senada
  const t0 = audio.currentTime + 0.15;
  const totalBeat = RAYA_MELODI.reduce((s, [, d]) => s + d, 0);
  const totalDur = totalBeat * BEAT;

  gain.gain.linearRampToValueAtTime(0.55, t0 + 0.8);
  gain.gain.setValueAtTime(0.55, t0 + totalDur - 0.8);
  gain.gain.linearRampToValueAtTime(0.0001, t0 + totalDur + 1.2);

  const akor = [RAYA_G, RAYA_C, RAYA_D, RAYA_G];
  const perAkor = totalDur / akor.length;
  akor.forEach((k, i) => rayaPad(t0 + i * perAkor, k, perAkor * 1.1, gain));

  rayaKresek(totalDur + 1, gain);

  let t = t0;
  for (const [deg, dur] of RAYA_MELODI) {
    const durSec = dur * BEAT;
    rayaLead(t, rayaFreq(deg), durSec * 0.92, gain);
    t += durSec;
  }

  setTimeout(() => { rayaSedangMain = false; }, (totalDur + 2.5) * 1000);
}
window.mainkanIndonesiaRaya = mainkanIndonesiaRaya;   // buat dites dari console

// Dicek tiap 20 detik, bukan `ingatan` langsung waktu didefinisikan -- `ingatan`
// baru didefinisikan lebih jauh di bawah, dan tanggal terakhir diputar dititip
// di localStorage supaya tahan reload dan tidak diulang-ulang sepanjang jam 10.
function cekJadwalRaya() {
  const d = new Date();
  const hari = d.getDay();   // 2 = Selasa, 4 = Kamis
  if ((hari !== 2 && hari !== 4) || d.getHours() !== 10) return;
  const tgl = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  if (ingatan.baca('rayaTerakhir', '') === tgl) return;
  ingatan.tulis('rayaTerakhir', tgl);
  mainkanIndonesiaRaya();
}
setTimeout(cekJadwalRaya, 0);
setInterval(cekJadwalRaya, 20000);

function blip(freq, dur) {
  if (!sound || !audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.value = 0.02;
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
  o.connect(g); g.connect(busEfek);
  o.start(); o.stop(audio.currentTime + dur);
}

/* ---------- foley per stasiun ----------
   blip() di atas memberi bunyi yang sama untuk semua tool call, jadi telinga
   tidak bisa membedakan pegawai yang membaca arsip dari yang mengetuk stempel
   — padahal matanya bisa, karena tiap tool punya mejanya sendiri (Peta
   stasiun). Kamus di bawah memberi tiap meja bunyi kerjanya: bunyi yang
   dikeluarkan BENDA di meja itu, bukan nada abstrak. Semua disintesis dari
   oscillator + satu buffer derau putih yang dibuat sekali, pendek (≤250 ms),
   dan pelan — ini latar, bukan lonceng. Lonceng notifikasi (notifSelesai,
   bunyiLoncengPengingat) sengaja tidak lewat sini: itu kabar untuk kamu,
   bukan suara ruangan.

   Tiga rem supaya sesi yang deras (Read beruntun, 20 tool call/detik) tidak
   berubah jadi derau: jeda minimum per nama bunyi, pagu total per detik untuk
   seluruh ruangan (yang lebih dibuang, bukan diantrekan — bunyi yang telat
   sudah tidak lagi menceritakan apa-apa), dan ducking: selama foley berbunyi,
   musik lofi turun ke 60% sebentar lalu naik lagi, supaya bunyi pelan ini
   tidak tenggelam di bawah beat tanpa harus dibikin keras.

   Panning stereo mengikuti posisi x pegawainya (dibatasi ±0,7 supaya tidak
   pernah sepenuhnya satu telinga): lemari arsip di kiri kedengaran di kiri,
   rak server di kanan kedengaran di kanan — telinga jadi ikut tahu siapa yang
   lagi bekerja di mana tanpa melirik kanvas. */
const FOLEY_JEDA_STASIUN = 220;   // ms minimum antar bunyi bernama sama
const FOLEY_MAKS_PER_DETIK = 6;   // pagu seluruh ruangan
const FOLEY_PAN_MAKS = 0.7;
const foleyTerakhir = {};         // nama -> performance.now() bunyi terakhir
let foleyDetik = -1, foleyHitung = 0;

// Satu detik derau putih, dibuat sekali; tiap bunyi cuma bikin BufferSource
// baru yang membaca buffer yang sama (murah), lalu diwarnai lewat filter.
let foleyDerauBuf = null;
function foleyDerau() {
  if (!foleyDerauBuf) {
    const len = audio.sampleRate | 0;
    foleyDerauBuf = audio.createBuffer(1, len, audio.sampleRate);
    const d = foleyDerauBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = audio.createBufferSource();
  src.buffer = foleyDerauBuf;
  return src;
}

// Simpul keluaran untuk satu bunyi: panner mengikuti x pegawai, atau langsung
// ke busEfek kalau browsernya tidak punya StereoPannerNode / tidak ada pegawai.
function foleyKeluaran(a) {
  if (!a || typeof audio.createStereoPanner !== 'function') return busEfek;
  const p = audio.createStereoPanner();
  const pan = (a.x / W) * 2 - 1;
  p.pan.value = Math.max(-FOLEY_PAN_MAKS, Math.min(FOLEY_PAN_MAKS, pan || 0));
  p.connect(busEfek);
  return p;
}

// Dua bahan dasar kamus: nada (oscillator, frekuensi boleh meluncur f0->f1)
// dan derau berwarna (buffer derau lewat filter) — keduanya dengan envelope
// naik cepat lalu luruh eksponensial, mulai di waktu-audio t.
function foleyNada(keluar, t, tipe, f0, f1, puncak, dur) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = tipe;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(puncak, t + Math.min(0.005, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(keluar);
  o.start(t); o.stop(t + dur + 0.01);
}
function foleyDerauNada(keluar, t, tipe, freq, q, puncak, dur, naik) {
  const src = foleyDerau();
  const f = audio.createBiquadFilter();
  f.type = tipe; f.frequency.value = freq;
  if (q) f.Q.value = q;
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(puncak, t + dur * (naik || 0.1));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(keluar);
  src.start(t); src.stop(t + dur + 0.01);
}

/* Kamus bunyi. Kuncinya nama BENDA/gerak, bukan nama tool — tool dipetakan ke
   sini lewat foleyUntuk() di bawah. (keluar = simpul keluaran, t = waktu
   audio mulai.) */
const FOLEY = {
  // stempel dinas: thud karet ke meja, disusul klik pegas gagangnya balik
  stempel(k, t) {
    foleyNada(k, t, 'sine', 90, 60, 0.12, 0.08);
    foleyDerauNada(k, t + 0.09, 'bandpass', 3000, 6, 0.05, 0.025, 0.2);
  },
  // lemari arsip: laci logam digeser (derau rendah naik-turun), "tok" mentok
  arsip(k, t) {
    foleyDerauNada(k, t, 'lowpass', 600, 0, 0.04, 0.18, 0.5);
    foleyNada(k, t + 0.17, 'sine', 220, 180, 0.05, 0.03);
  },
  // rak server: desis kipas sekilas, sangat pelan, plus bip HDD
  server(k, t) {
    foleyDerauNada(k, t, 'bandpass', 250, 2, 0.02, 0.2, 0.3);
    foleyNada(k, t + 0.05, 'sine', 1000, 1000, 0.03, 0.02);
  },
  // kursi digeser di lantai: derau rendah pendek
  kursi(k, t) {
    foleyDerauNada(k, t, 'lowpass', 300, 0, 0.05, 0.12, 0.4);
  },
  // ketukan pena dua kali di meja rapat
  pena(k, t) {
    foleyNada(k, t, 'triangle', 1800, 1200, 0.04, 0.02);
    foleyNada(k, t + 0.09, 'triangle', 1800, 1200, 0.03, 0.02);
  },
  // meja rapat: kadang kursi, kadang pena — biar tidak monoton
  rapat(k, t) { (Math.random() < 0.5 ? FOLEY.kursi : FOLEY.pena)(k, t); },
  // berpikir: satu "tik" nyaris tak terdengar
  pikir(k, t) {
    foleyNada(k, t, 'sine', 4000, 4000, 0.015, 0.01);
  },
  // laptop/browser: dua klik tuts, jarak keduanya acak supaya tidak mekanis
  ketik(k, t) {
    foleyDerauNada(k, t, 'highpass', 2000, 0, 0.04, 0.012, 0.15);
    foleyDerauNada(k, t + 0.06 + Math.random() * 0.06, 'highpass', 2000, 0, 0.035, 0.012, 0.15);
  },
  // gagal: "deng" persegi pendek yang turun — beda dari lonceng galat
  // (bunyiLonceng sinus tiga nada) yang jauh lebih panjang dan naik
  gagal(k, t) {
    foleyNada(k, t, 'square', 300, 200, 0.03, 0.12);
  },
  // butuh perhatian kamu (izin/tanya): dua ping sinus pendek — cuma isyarat
  // di kanal efek, loncengnya sendiri urusan notifKonfirmasi kalau 🔔 nyala
  panggil(k, t) {
    foleyNada(k, t, 'sine', 880, 880, 0.03, 0.04);
    foleyNada(k, t + 0.08, 'sine', 880, 880, 0.025, 0.04);
  },
};

// stasiun -> nama bunyi. Perintah shell non-git jatuh ke 'think' (dikerjakan
// di laptop meja kerjanya, lihat stationFor), tapi menjalankan perintah itu
// mengetik, bukan berpikir — jadi dibedakan di sini.
const FOLEY_STASIUN = {
  edit: 'stempel', read: 'arsip', search: 'arsip', server: 'server',
  rapat: 'rapat', think: 'pikir', web: 'ketik', agent: 'ketik',
};
function foleyUntuk(tool, st) {
  if (tool && SHELL_TOOL.test(tool)) return st === 'server' ? 'server' : 'ketik';
  return FOLEY_STASIUN[st] || 'ketik';
}

// Musik lofi menyingkir 300 ms tiap foley berbunyi. Cuma kalau musiknya
// memang nyala — kalau mati, busMusik dibiarkan (jangan-jangan slidernya
// sedang digeser).
function foleyDucking(t) {
  if (!musikNyala || !busMusik) return;
  const g = busMusik.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(VOL.musik * 0.6, t + 0.03);
  g.linearRampToValueAtTime(VOL.musik, t + 0.3);
}

// Pintu masuknya: nama dari kamus di atas, a = pegawai (untuk panning; boleh
// kosong). Menghormati centang 🔊 dan tidak berbunyi sebelum AudioContext
// dibuka klik pengguna, sama seperti blip().
function foley(nama, a) {
  if (!sound || !audio) return false;
  const buat = FOLEY[nama];
  if (!buat) return false;
  const kini = performance.now();
  if (kini - (foleyTerakhir[nama] || -1e9) < FOLEY_JEDA_STASIUN) return false;
  const detik = Math.floor(kini / 1000);
  if (detik !== foleyDetik) { foleyDetik = detik; foleyHitung = 0; }
  if (foleyHitung >= FOLEY_MAKS_PER_DETIK) return false;
  foleyHitung++;
  foleyTerakhir[nama] = kini;
  const t = audio.currentTime;
  buat(foleyKeluaran(a), t);
  foleyDucking(t);
  return true;
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
    src.connect(lp); lp.connect(g); g.connect(busEfek);
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
    src.connect(lp); lp.connect(g); g.connect(busEfek);
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

const angkaID = (n) => Math.round(n).toLocaleString('id-ID');

/* Beda perlakuan dari formatBiaya() dengan sengaja: token ini angka RESMI —
   langsung dari respons API, dijumlahkan, tanpa tabel harga yang bisa basi —
   jadi tidak diberi keterangan "data sementara". Yang perlu jujur di sini
   soal cakupannya, bukan soal keakuratannya: dihitung sejak transkripnya
   MULAI dipantau, bukan sejak sesinya lahir. */
function formatToken(t, ket) {
  const cache = t.cacheTulis || t.cacheBaca
    ? ' · cache ' + angkaID(t.cacheTulis) + ' tulis / ' + angkaID(t.cacheBaca) + ' baca' : '';
  // ket=undefined -> keterangan bawaan (angka per-sesi); ket='' -> tanpa keterangan
  // (dipakai angka riwayat lintas sesi, yang cakupannya sudah dijelaskan terpisah).
  const label = ket === undefined ? ' (sejak dipantau)' : (ket ? ' (' + ket + ')' : '');
  return angkaID(t.input) + ' masuk · ' + angkaID(t.output) + ' keluar'
    + cache + label;
}

/* Nama yang dipakai baris panel DAN kepala modal kabar: nama panggilan kalau
   sudah diberi, kalau belum nama project + potongan id sesinya. Satu tempat
   saja, supaya orang yang sama tidak muncul dengan dua nama berbeda.

   PENGIRIM STUB TIDAK PUNYA ID. Nota milik FOLDER (SK kenaikan pangkat,
   nota pagu) meminjam pegawai seproyek sebagai pengirim; kalau ruangan sudah
   kosong, yang dipakai stub { id: '', project, peran }. Tanpa cabang `a.id`
   di bawah, stub itu terbaca "proyek-hantu·" — pemisah menggantung tanpa apa
   pun di belakangnya. Diperbaiki di SINI, sekali untuk semua stub, supaya
   kartu SK dan kartu pagu tidak berbeda gaya. */
const namaKru = (a) => (a.id && namaPanggilan.get(a.id))
  || (a.id ? (a.project ? a.project.slice(0, 12) + '·' : '') + a.id.slice(0, 4)
           : (a.project ? a.project.slice(0, 12) : '-'));

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
  // lencana golongan dari buku induk: satu karakter, hanya ≥ Penata Muda,
  // menumpang di sebelah nama supaya lebar panel tidak bertambah
  const induk = rekamInduk(a);
  const lencana = induk ? LENCANA_GOLONGAN[induk.golongan] : '';
  // Chip mesin memakai warna rompi pegawainya supaya panel dan ruangan cocok
  // tanpa penontonnya perlu membaca nama mesin. .crew-row .mesin sudah
  // `border: 1px dashed`, jadi cukup menimpa border-color — public/style.css
  // nol baris disentuh. Warnanya dari tabel SERAGAM_CABANG, bukan dari data
  // masuk, jadi tidak ada yang perlu di-esc di situ.
  //
  // SYARAT CHIPNYA TETAP `a.mesin`, BUKAN `rc`. seragamCabang() menolak nama
  // yang kosong sesudah trim (mis. '   '), dan kalau chipnya digerbangi rc
  // nama seperti itu kehilangan chipnya sama sekali — bukan cuma warnanya.
  // Server hari ini memang sudah menyaring nama mesin, tapi chip "ada atau
  // tidak" tidak boleh bergantung pada apakah tabel warna kebetulan punya
  // jawaban. Jadi: chip dari a.mesin, warna dari rc kalau ada.
  const rc = a.mesin ? seragamCabang(a.mesin) : null;
  row.innerHTML =
    '<span class="chip" style="background:' + j.pal.main + '"></span>' +
    '<span class="who">' + esc(who) + '</span>' +
    (lencana ? '<span class="lencana" title="golongan ' + esc(induk.golongan) + ' (buku induk, sejak dipantau)">' + lencana + '</span>' : '') +
    (a.cabang ? '<span class="cabang" title="cabang git: ' + esc(a.cabang) + '">⎇ ' + esc(a.cabang) + '</span>' : '') +
    (a.mesin ? '<span class="mesin"' + (rc ? ' style="border-color:' + rc.rompi + '"' : '')
      + ' title="kantor cabang: ' + esc(a.mesin) + (rc ? ' (' + esc(rc.nama) + ')' : '') + '">⌂ '
      + esc(a.mesin) + '</span>' : '') +
    '<span class="jab">' + esc(j.singkat) + '</span>' +
    '<span class="what">' + esc(what) + '</span>';
  row.addEventListener('click', (e) => {
    if (e.target.closest('.aksi')) return;      // tombol nama/stop punya kerja sendiri
    if (a === terpilih) tutupKartu(); else bukaKartu(a);
  });
  return row;
}

/* Kelompok per proyek & pin di daftar pegawai. Sesi nyata dikelompokkan per
   `a.project` dengan kepala seksi yang bisa dilipat (diingat peramban) —
   cuma kalau memang ada ≥2 proyek berbeda; satu proyek tidak butuh kepala.
   📌 menaikkan sesi ke atas daftar, di luar seksi mana pun; pinnya sengaja
   TIDAK diingat: dia hilang begitu pegawainya pulang (id sesi tidak pernah
   kembali). Peserta rapat tetap menumpang di bawah pemanggilnya, standby
   tetap paling bawah. statAgents tidak disentuh: angka besar tetap agents.size. */
const kruPin = new Set();
// dibaca malas: `ingatan` baru didefinisikan lebih bawah, dan renderCrew()
// pertama toh baru jalan sesudah seluruh skrip dimuat
let kruLipat = null;
function kruLipatSet() {
  if (!kruLipat) {
    let v = [];
    try { v = JSON.parse(ingatan.baca('kruLipat', '[]')); } catch { /* rusak: anggap kosong */ }
    kruLipat = new Set(Array.isArray(v) ? v : []);
  }
  return kruLipat;
}
function kruSusun() {
  for (const id of kruPin) if (!agents.has(id)) kruPin.delete(id);   // pulang = pin hilang
  const semua = [...agents.values()];
  const kelompok = new Set(semua.map((a) => a.project || '')).size >= 2;
  const disemat = semua.filter((a) => kruPin.has(a.id));
  const sisa = semua.filter((a) => !kruPin.has(a.id));
  const seksi = new Map();
  if (kelompok) {
    // sort stabil: urutan kedatangan dipertahankan di dalam seksi; tanpa proyek paling bawah
    const kunci = (a) => (a.project ? '0' + a.project : '1');
    sisa.sort((x, y) => (kunci(x) < kunci(y) ? -1 : kunci(x) > kunci(y) ? 1 : 0));
    for (const a of sisa) {
      const p = a.project || '';
      if (!seksi.has(p)) seksi.set(p, { proyek: p, judul: p || 'tanpa proyek', jumlah: 0 });
      seksi.get(p).jumlah++;
    }
  }
  return {
    urut: [...disemat, ...sisa],
    seksiDari: (a) => (kelompok && !kruPin.has(a.id) ? seksi.get(a.project || '') : null),
  };
}
function kruKepalaSeksi(s) {
  const el = document.createElement('div');
  const lipat = kruLipatSet().has(s.proyek);
  el.className = 'crew-seksi' + (lipat ? ' lipat' : '');
  el.title = (lipat ? 'buka' : 'lipat') + ' seksi ' + s.judul;
  el.innerHTML = '<span class="panah">' + (lipat ? '▸' : '▾') + '</span>'
    + '<span class="nama">' + esc(s.judul) + '</span><span class="jumlah">' + s.jumlah + '</span>';
  el.onclick = () => {
    const lp = kruLipatSet();
    if (lp.has(s.proyek)) lp.delete(s.proyek); else lp.add(s.proyek);
    ingatan.tulis('kruLipat', JSON.stringify([...lp]));
    renderCrew();
  };
  return el;
}
function kruPinToggle(id) {
  if (kruPin.has(id)) kruPin.delete(id); else kruPin.add(id);
  renderCrew();
}

function renderCrew() {
  crewEl.innerHTML = '';
  const susunan = kruSusun();
  let seksiKini = null;
  for (const a of susunan.urut) {
    const seksi = susunan.seksiDari(a);
    if (seksi !== seksiKini) { seksiKini = seksi; if (seksi) crewEl.appendChild(kruKepalaSeksi(seksi)); }
    if (seksi && kruLipatSet().has(seksi.proyek)) continue;   // seksi terlipat: baris & pesertanya disembunyikan
    const who = namaKru(a);
    // Yang menunggu keputusan kamu tidak boleh terbaca sedang bekerja — kegiatan
    // terakhirnya memang belum berubah, tapi kegiatan itu justru yang tertahan.
    const apa = a.butuh ? TUNGGU_TEKS[a.butuh.sebab] || TUNGGU_TEKS.izin
      : a.macet ? 'berhenti — ' + (a.macet.label || a.macet.jenis || 'galat')
      : a.doing || (STATIONS[a.station] || {}).name || '';
    const row = barisKru(a, 'crew-row', who, apa);
    /* Sorot emas = sesi yang DILAHIRKAN halaman ini (formulir tugas / loket
       disposisi), bukan sekadar sesi yang punya nama panggilan. Dulu syaratnya
       memang ada-tidaknya nama, dan itu benar selama cuma tugas halaman yang
       diberi nama. Sejak formasi pegawai tetap memberi nama ke hampir SEMUA
       sesi terminal, syarat lama menyorot seluruh daftar sekaligus — penanda
       yang menyala untuk semua orang tidak menandai apa-apa. sesiHalaman
       adalah sumber yang sama yang dipakai blok paraf di kartu. */
    if (sesiHalaman.has(a.id)) row.classList.add('tugas');
    const bNama = document.createElement('button');
    bNama.className = 'aksi'; bNama.textContent = 'nama'; bNama.title = 'beri nama pegawai ini';
    bNama.onclick = () => beriNama(a.id);
    row.appendChild(bNama);
    const bPin = document.createElement('button');
    bPin.className = 'aksi pin' + (kruPin.has(a.id) ? ' aktif' : '');
    bPin.textContent = '📌';
    bPin.title = kruPin.has(a.id) ? 'lepas dari atas daftar' : 'sematkan ke atas daftar (hilang saat pegawainya pulang)';
    bPin.onclick = () => kruPinToggle(a.id);
    row.appendChild(bPin);
    if (kendali.izin) {
      const bStop = document.createElement('button');
      bStop.className = 'aksi'; bStop.textContent = 'stop'; bStop.title = 'hentikan tugasnya';
      bStop.onclick = () => hentikanTugas(a.id);
      row.appendChild(bStop);
    }
    // Cuma masuk akal dihapus kalau lagi tidak dikerjakan dan tidak sedang
    // menunggu keputusanmu — satu klik tidak boleh menghilangkan pekerjaan
    // yang sebetulnya masih berjalan atau pertanyaan yang belum kamu jawab.
    // Tidak menunggu kendali.izin: ini cuma melupakan tampilan, bukan perintah
    // ke server, jadi berlaku juga untuk sesi terminal yang halaman ini tidak
    // punya kendali untuk mematikannya.
    if (a.state !== 'work' && !a.butuh) {
      const bHapus = document.createElement('button');
      bHapus.className = 'aksi'; bHapus.textContent = 'hapus';
      bHapus.title = 'hapus dari daftar (cuma tampilan di halaman ini, bukan mematikan sesi)';
      bHapus.onclick = () => hapusPegawai(a);
      row.appendChild(bHapus);
    }
    crewEl.appendChild(row);
    // peserta rapatnya menumpang persis di bawah pemanggilnya
    for (const p of peserta) {
      if (!p.keluar && p.pemilik === a.id) crewEl.appendChild(barisKru(p, 'crew-row sub', 'peserta', p.nama));
    }
  }
  for (const p of peserta) {
    if (p.keluar || agents.has(p.pemilik)) continue;   // yang punya pemanggil sudah ikut di atas
    crewEl.appendChild(barisKru(p, 'crew-row sub', 'peserta', p.nama));
  }
  for (const b of standby) {
    const row = barisKru(b, 'crew-row standby', 'standby',
      (STATIONS[b.station] || {}).name || '');
    const bHapus = document.createElement('button');
    bHapus.className = 'aksi'; bHapus.textContent = 'hapus'; bHapus.title = 'hapus dari daftar';
    bHapus.onclick = () => hapusPegawai(b);
    row.appendChild(bHapus);
    crewEl.appendChild(row);
  }
  renderAntrean();       // loket disposisi: yang menunggu slot, di bawah standby
  // Angka besar = sesi yang BENAR-BENAR jalan. Standby disebut terpisah supaya
  // ruangan yang ramai tidak dibaca sebagai banyak sesi.
  statAgents.textContent = agents.size;
  const ket = document.getElementById('statAgentsKet');
  if (ket) ket.textContent = standby.length ? 'sesi +' + standby.length + ' standby' : 'sesi';
  if (MODE_KADIS) kadisGambar();   // ringkasan HP kepala dinas ikut tiap daftar digambar ulang
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
  // lalu kebalikan kamera: yang diklik itu piksel layar, yang dicari orang di dunia
  return dariLayar((e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
}

canvas.addEventListener('click', (e) => {
  const [cx, cy] = titikKanvas(e);
  const a = agenDiTitik(cx, cy);
  // pegawai menang dulu (aturan yang sudah ada); klik kosong di dalam kotak
  // bukaan ruang kadis baru menyalakan/mematikan zoom ke bukaan itu
  if (a) { bukaKartu(a); return; }
  tutupKartu();
  klikSisip(cx, cy);
});
canvas.addEventListener('mousemove', (e) => {
  const [cx, cy] = titikKanvas(e);
  const diSisip = RUANG_KADIS.t > 0 && cx >= SISIP.x && cx <= SISIP.x + SISIP.w
    && cy >= SISIP.y && cy <= SISIP.y + SISIP.h;
  canvas.style.cursor = agenDiTitik(cx, cy) || diSisip ? 'pointer' : '';
});
// Esc melepas zoom bukaan. Dialog lain punya handler Escape-nya sendiri dan
// tidak terganggu: gerbang RUANG_KADIS.zoom bikin handler ini diam kalau
// zoomnya memang tidak menyala.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && RUANG_KADIS.zoom) RUANG_KADIS.zoom = false;
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
    '<div class="kartu-paraf" id="kartuParaf" hidden></div>' +
    '<label class="kartu-pilih">jabatan<select id="kartuPeran">' + opsiJabatan() + '</select></label>' +
    '<div class="kartu-aksi" id="kartuAksi"></div>' +
    '<div class="kartu-riwayat"><h3>riwayat</h3><ul id="kartuRiwayat"></ul></div>';

  document.getElementById('kartuTutup').onclick = tutupKartu;
  muatBukuInduk(false);                       // blok "buku induk" di kartu; cache 30 detik
  const sel = document.getElementById('kartuPeran');
  sel.value = a.peran;
  sel.onchange = () => gantiPeran(a, sel.value);

  const aksi = document.getElementById('kartuAksi');
  const jenis = jenisAgen(a);
  if (jenis === 'sesi') {
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
  // Sama seperti di panel: standby selalu boleh dihapus, sesi nyata cuma
  // kalau sedang idle dan tidak menunggu keputusanmu.
  if (jenis === 'standby' || (jenis === 'sesi' && a.state !== 'work' && !a.butuh)) {
    const bHapus = document.createElement('button');
    bHapus.type = 'button';
    bHapus.textContent = 'hapus dari daftar';
    bHapus.title = jenis === 'sesi' ? 'cuma tampilan di halaman ini, bukan mematikan sesi' : '';
    bHapus.onclick = () => hapusPegawai(a);
    aksi.appendChild(bHapus);
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
  // "usul: Kepala Bidang" dari buku induk cuma USUL di label — jabatan
  // sesungguhnya (dropdown, seragam, meja) tidak disentuh dari data.
  const usul = usulInduk(a);
  document.getElementById('kartuJab').textContent = j.nama + ' · ' + j.padanan
    + (usul && j.id !== usul.jabatanId ? ' · usul: ' + usul.jabatan : '');
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
    if (a.cabang) baris.push(['cabang', a.cabang]);
    if (a.mesin) baris.push(['mesin', a.mesin]);
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
    /* Kursi formasi menempel pada PROYEK, bukan pada sesi ini: "sejak" di bawah
       bisa jauh lebih tua dari "di kantor" berikutnya, dan itu memang maksudnya
       — orangnya yang tetap, gilirannya yang berganti. Sesi tanpa kursi (tugas
       dari halaman, atau ruangan yang formasinya penuh) tidak menambah baris.

       FOLDER KURSINYA, BUKAN FOLDER YANG SEDANG DIKERJAKAN. Server melantik
       sekali lalu tidak pernah melantik ulang walau cwd sesinya pindah
       (server.mjs: `if (slotSesi.has(ev.session)) return null;`), jadi
       `a.project` bisa sudah bergerak ke folder lain sementara kursi #N tetap
       milik folder pelantikan. Yang benar dibaca dari kursinya sendiri;
       `a.project` cuma cadangan untuk kursi lama yang belum menyimpannya. */
    const kursi = pegawaiTetap.get(a.id);
    if (kursi) {
      baris.push(['formasi', namaKru(a) + ' · staf #' + kursi.slot
        + ' di ' + (kursi.proyek || a.project || '-') + ' · sejak ' + tanggalID(kursi.sejak)]);
    }
    baris.push(['di kantor', durasiSingkat(Date.now() - a.sejak) + ' (sejak ' + jam(a.sejak) + ')']);
    baris.push(['kondisi', a.suasana]);      // suasana hati dari stamina — kosmetik, bukan statistik
    if (a.model) baris.push(['model', namaModel(a.model)]);
    baris.push(['tool call', a.calls + (a.gagal ? ' · ' + a.gagal + ' gagal' : '')]);
    const sering = Object.entries(a.perStasiun)
      .sort((x, y) => y[1] - x[1]).slice(0, 2)
      .map(([id, n]) => ((STATIONS[id] || {}).name || id) + ' ×' + n).join(', ');
    if (sering) baris.push(['sering di', sering]);
    if (a.tungguTotal || a.tungguSejak) {
      const totalTunggu = a.tungguTotal + (a.tungguSejak ? Date.now() - a.tungguSejak : 0);
      baris.push(['nunggu kamu', durasiSingkat(totalTunggu) + ' dari ' + durasiSingkat(Date.now() - a.sejak)]);
    }
    if (a.token) baris.push(['token', formatToken(a.token)]);
    if (a.biaya) baris.push(['biaya', formatBiaya(a.biaya)]);
  }
  // Buku induk: karier FOLDER-nya, bukan sesi ini — sengaja baris terpisah
  // dengan label "sejak dipantau", supaya tidak tertukar dengan tool call di atas.
  const induk = rekamInduk(a);
  if (induk) {
    const lencana = LENCANA_GOLONGAN[induk.golongan] || '';
    baris.push(['buku induk', 'masa dinas ' + jamDinasTeks(induk.jamDinas) + ' · ' + induk.sesi + ' sesi · '
      + (lencana ? lencana + ' ' : '') + induk.golongan + ' (sejak dipantau)']);
  }
  document.getElementById('kartuInfo').innerHTML = baris
    .map(([k, v]) => '<span class="kk">' + esc(k) + '</span><span class="vv">' + esc(v) + '</span>')
    .join('');
  if (jenis === 'sesi') perbaruiParaf(a);

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

/* Blok paraf di kartu. Tiga keadaan yang harus TERLIHAT BEDA, karena
   pose di ruangannya sama persis:
   - sesi halaman + izin bertanda paraf  -> tombol Paraf / Tolak yang sungguhan
   - sesi halaman tanpa izin paraf       -> catatan (mis. pertanyaan AskUserQuestion:
                                            tidak ada jalur menjawabnya dari sini)
   - sesi terminal                        -> "jawab di terminal": halaman ini
                                            tidak punya pegangan ke proses itu.
   Dibangun ulang HANYA kalau keadaannya berubah — perbaruiKartu() jalan tiap
   800 ms, dan input pesan yang sedang diketik tidak boleh ikut dikosongkan. */
function perbaruiParaf(a) {
  const el = document.getElementById('kartuParaf');
  if (!el) return;
  const z = izinTunggu.get(a.id);
  const halaman = sesiHalaman.has(a.id);
  const keadaan = !a.butuh ? ''
    : z ? 'paraf:' + z.id
    : halaman ? 'halaman:' + a.butuh.sebab
    : 'terminal:' + a.butuh.sebab;
  if (el.dataset.keadaan === keadaan) return;
  el.dataset.keadaan = keadaan;
  el.innerHTML = '';
  el.hidden = !keadaan;
  if (!keadaan) return;

  const catat = (teks, cls) => {
    const p = document.createElement('div');
    p.className = 'paraf-nota' + (cls ? ' ' + cls : '');
    p.textContent = teks;
    el.appendChild(p);
  };
  if (!z) {
    catat(halaman
      ? 'sesi halaman · ' + (a.butuh.sebab === 'tanya'
          ? 'pertanyaannya tidak bisa dijawab dari sini'
          : 'izinnya tidak lewat loket paraf')
      : 'sesi terminal · jawab di terminal tempat sesinya jalan');
    return;
  }
  catat('sesi halaman · bisa diparaf di sini', 'bisa');
  const rinci = document.createElement('div');
  rinci.className = 'paraf-rinci';
  rinci.textContent = (z.tool ? z.tool + ' · ' : '') + (z.ringkasan || '');
  el.appendChild(rinci);
  const pesan = document.createElement('input');
  pesan.type = 'text'; pesan.maxLength = 200; pesan.className = 'paraf-pesan';
  pesan.placeholder = 'catatan kalau ditolak (opsional)';
  const tombol = document.createElement('div');
  tombol.className = 'paraf-tombol';
  const bParaf = document.createElement('button');
  bParaf.type = 'button'; bParaf.className = 'paraf-ya'; bParaf.textContent = 'Paraf';
  bParaf.title = 'izinkan tool ini jalan';
  const bTolak = document.createElement('button');
  bTolak.type = 'button'; bTolak.className = 'paraf-tidak'; bTolak.textContent = 'Tolak';
  bTolak.title = 'tolak; catatannya diteruskan ke agennya';
  const kunci = (mati) => { bParaf.disabled = bTolak.disabled = mati; };
  bParaf.onclick = () => { kunci(true); jawabParaf(z.id, 'paraf', '').finally(() => kunci(false)); };
  bTolak.onclick = () => { kunci(true); jawabParaf(z.id, 'tolak', pesan.value.trim()).finally(() => kunci(false)); };
  tombol.append(bParaf, bTolak);
  el.append(pesan, tombol);
}

/* Jawaban ke loket paraf. Gerbangnya sama dengan /perintah: token halaman.
   Server yang menyiarkan izin-jawab — di sini tidak ada yang diubah lokal,
   supaya dua halaman yang sama-sama terbuka melihat keadaan yang sama. */
async function jawabParaf(id, keputusan, catatan) {
  if (!kendali.token) { pesan('token halaman tidak ada — muat ulang', 'err'); return; }
  try {
    const res = await fetch('/izin/jawab', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: kendali.token, id, keputusan, pesan: catatan || '' }),
    });
    const d = await res.json().catch(() => ({}));
    if (!d.ok) pesan('paraf gagal: ' + (d.pesan || res.status), 'err');
    else pesan(keputusan === 'paraf' ? 'diparaf' : 'ditolak', 'ok');
  } catch (err) {
    pesan('gagal mengirim paraf: ' + err.message, 'err');
  }
}

// Kartunya mengikuti orangnya. Kalau ruang di kanan tidak cukup, pindah ke
// kiri; kalau tetap tidak muat, ditempel ke tepi panggung.
function taruhKartu() {
  if (!terpilih || kartuEl.hidden) return;
  const w = kartuEl.offsetWidth, h = kartuEl.offsetHeight;
  const [px, py] = keLayar(terpilih.x, terpilih.y - 14);   // ikut kamera, bukan offX/scale mentah
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

/* Cuma kind yang membawa isi bebas (bukan nama tool/status) yang disamarkan:
   'pikir' dan 'ucap' (kalimat sungguhan agen), plus ev.tanya (pertanyaan
   AskUserQuestion / rencana ExitPlanMode, yang juga membocorkan cuplikannya
   lewat ev.label saat kind:'pre'). Yang TIDAK disentuh: label aktivitas tool
   biasa (itu lapisan dasar ruangan ini, ada sejak sebelum balon pikiran/kabar
   ada), dan izin-minta/notify/stop-gagal — isinya sudah kalimat generik dari
   kamus tetap sisi server (GALAT_STOP dkk.), bukan teks bebas yang ditulis agen. */
function panggungSensor(ev) {
  if (!PANGGUNG) return ev;
  const e = { ...ev };
  if (e.kind === 'pikir') {
    e.teks = '';                    // berpikir() sudah otomatis render "tersegel" kalau teks kosong
  } else if (e.kind === 'ucap') {
    e.teks = e.akhir ? 'menyampaikan hasil kerja' : 'menulis catatan';
  }
  if (e.tanya) {
    e.label = e.tanya.jenis === 'rencana' ? 'mengajukan rencana kerja' : 'mengajukan pertanyaan';
    e.tanya = { ...e.tanya, teks: '', daftar: [] };
  }
  return e;
}

function handle(ev) {
  ev = panggungSensor(ev);
  now = performance.now();

  if (ev.kind === 'session-end') {
    const a = agents.get(ev.session);
    tutupSemuaRapat(ev.session, true);   // sesinya habis: rapat latar pun bubar
    // Sesi yang tuntas (sudah `stop`, tidak menunggu siapa pun) pulang lewat
    // ritual: absen, pintu, hilang. Yang mati mendadak di tengah tugas —
    // session-end tanpa stop, atau masih menunggu kamu — dihapus langsung.
    const tuntas = a && !a.adaTugas && a.state !== 'work' && !a.butuh && !a.macet;
    if (tuntas) { a.pulangKantor(); renderCrew(); }
    else if (a) { a.destroy(); agents.delete(ev.session); jagaPopulasi(); renderCrew(); }
    pushLog(ev, 'mark', ['pulang', ev.cwd || '']);
    return;
  }

  // Loket disposisi: bukan kejadian milik satu pegawai (session kosong), jadi
  // jangan sampai melahirkan pegawai hantu lewat agentFor(). Daftarnya
  // diganti utuh dari potret yang dibawa event — tidak ada polling /kendali.
  if (ev.kind === 'antre') {
    // Potret hanya diganti kalau event-nya memang membawa potret: event yang
    // diputar ulang dari buku agenda bisa datang tanpa `antrean`/`aksi`, dan
    // itu tidak boleh mengosongkan loket yang baru saja dimuat dari /kendali.
    if (Array.isArray(ev.antrean)) antrean = ev.antrean;
    const judul = ev.aksi === 'masuk' ? 'antre disposisi'
      : ev.aksi === 'lahir' ? 'giliran antrean tiba'
      : ev.aksi === 'batal' ? 'antrean ditarik'
      : ev.aksi === 'gagal' ? 'antrean gagal lahir'
      : 'loket disposisi';
    pushLog(ev, ev.aksi === 'gagal' ? 'err' : 'mark', [judul, ev.label || '']);
    renderCrew();
    return;
  }

  // SK kenaikan pangkat dari buku induk: milik satu FOLDER, bukan satu sesi
  // (session kosong) — jangan sampai agentFor() melahirkan pegawai hantu.
  if (ev.kind === 'promosi') { terimaPromosi(ev); return; }

  /* Nota pagu anggaran token: sama seperti promosi, kejadiannya milik satu
     FOLDER dan `session`-nya SENGAJA kosong (lihat paguPeriksa() di
     server.mjs). Cabang ini WAJIB tetap di atas agentFor() — di bawahnya,
     setiap nota anggaran melahirkan pegawai hantu bernama sesi kosong yang
     tidak pernah pulang. */
  if (ev.kind === 'pagu') { terimaPagu(ev); return; }

  const a = agentFor(ev.session);
  // Tool call selalu menang atas event acak. Kalau pegawainya sedang jadi
  // pemeran, dia dilepas saat itu juga — halaman ini melaporkan pekerjaan
  // sungguhan dulu, baru menghidupkan ruangan.
  lepasDariEvent(a);
  // Keadaan "butuh manusia" beserta pembatalannya dihitung server; halaman
  // cuma mengikuti. `false` berarti tunggunya sudah lewat, `undefined` berarti
  // event ini tidak mengubah apa-apa soal itu.
  if (ev.butuh !== undefined) a.setButuh(ev.butuh);
  // tunggunya lewat berarti permintaan parafnya pun sudah tidak ada
  if (ev.butuh === false) izinTunggu.delete(ev.session);
  if (ev.macet !== undefined) a.setMacet(ev.macet);
  if (ev.butuh !== undefined || ev.macet !== undefined) pantauTerkatung(a);
  a.lastEvent = now;
  toolTerakhir = now;
  // kamera mode ikut: cuma tool call yang membidik, bukan pikiran/ucapan
  if (ev.kind === 'pre' || ev.kind === 'post') KAMERA.aktif.set(a.id, now);
  if (ev.cwd) a.project = ev.cwd;
  // cabang git ikut cwd: server yang membacanya, halaman cuma menyimpan.
  // undefined = event ini tidak bicara soal cabang; '' = bukan repo git.
  if (ev.cabang !== undefined) a.cabang = ev.cabang || '';
  // mesin pengirim: hanya ada kalau sesinya datang dari kantor cabang
  if (ev.mesin) a.mesin = ev.mesin;
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
      a.lelahkan(STAMINA_CALL);            // tiap call menguras sedikit (kosmetik)
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
      foley(foleyUntuk(ev.tool, st), a);
      break;
    }
    case 'post': {
      a.busyUntil = now + 900;
      if (ev.peserta) tutupRapat(ev);
      // beruntun = gagal berturut-turut TANPA diselingi yang berhasil; dibaca potretRuangan()
      if (ev.ok !== false) a.gagalBerturut = 0;
      if (ev.ok === false) {
        a.gagal++;
        a.lelahkan(STAMINA_GAGAL);         // kegagalan lebih menguras daripada call biasa
        a.gagalBerturut = (a.gagalBerturut || 0) + 1;
        // dipakai inspektorat-mendadak: pemicunya data nyata, bukan dadu.
        // Disimpan sebagai timestamp Date.now(), BUKAN `now` (performance.now()) —
        // dua jam yang berbeda basis, mencampurnya bikin selisihnya tidak berarti.
        RUANGAN.gagalBeruntun.push(Date.now());
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
        foley('gagal', a);
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
      foley('kursi', a);   // menarik kursi ke meja rapat
      break;
    }
    // Subagent mulai: kursinya diisi identitas agen yang sebenarnya. Pegawainya
    // sendiri tidak diapa-apakan — yang datang tamu, bukan tugas baru untuknya.
    case 'subagent-start': {
      const pm = pesertaMasuk(ev);
      pushLog(ev, 'mark',
        ['peserta rapat masuk', pm ? pm.nama : (ev.agen || '') + ' (ikut daring)']);
      foley('kursi', a);
      break;
    }
    // Subagent selesai bukan berarti sesinya selesai: yang bubar cuma satu
    // peserta rapat, pegawainya tetap di mejanya.
    case 'subagent-stop': {
      const pb = pesertaKeluar(ev);
      pushLog(ev, 'mark', ['peserta rapat selesai', pb ? pb.nama : (ev.agen || '')]);
      foley('kursi', a);
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
      a.legaSampai = now + 2000;          // wajah lega sebentar: gilirannya tuntas
      nowDoing.textContent = 'selesai — menunggu arahan';
      pushLog(ev, 'mark', ['selesai, menunggu arahan', '']);
      foley('kursi', a);   // bangkit dari meja, pulang ke meja kerjanya
      if (notifOn) notifSelesai(namaPanggilan.get(a.id));
      break;
    }
    /* Isi kepalanya. Cuma balon: tidak masuk log dan tidak menaikkan statistik
       apa pun. Berpikir memang bukan pekerjaan yang bisa dihitung, dan log
       kegiatan akan tenggelam kalau tiap tarikan napas ikut dicatat. */
    case 'pikir': {
      a.berpikir(ev);
      break;
    }
    /* Bukan pekerjaan, jadi bukan log — sama seperti pikir. Cuma pembaruan
       diam yang disimpan di orangnya; kartu yang membacanya kalau dibuka. */
    case 'token': {
      a.token = ev.token;
      tambahTokenTotal(ev.session, ev.token);
      break;
    }
    /* Kalimat yang benar-benar dia tulis untuk kamu. Yang menutup giliran
       (`akhir`) itu jawabannya, jadi dia yang berhak memunculkan modal;
       sisanya kalimat pengantar sebelum tool berikutnya — cukup lewat sebagai
       balon lalu menumpuk di kotak kabar. */
    case 'ucap': {
      a.say(esc(satuBaris(ev.teks, UCAP_MAX)), 'say');
      kabarMasuk(ev, a, ev.akhir ? 'hasil' : 'lapor');
      if (ev.akhir) a.legaSampai = now + 2000;   // hasil sudah di tangan kamu: wajahnya lega
      pushLog(ev, 'mark',
        [ev.akhir ? 'menyampaikan hasil' : 'melapor', satuBaris(ev.teks, 120)]);
      break;
    }
    case 'notify': {
      a.say('<b>!</b> ' + esc(ev.label || ''), 'say');
      pushLog(ev, 'mark', ['butuh perhatian', ev.label]);
      if (ev.butuh) {
        nowDoing.textContent = 'menunggu jawaban kamu';
        kabarMasuk(ev, a, 'tanya');
        if (notifOn) notifKonfirmasi();
      }
      foley('panggil', a);
      break;
    }
    /* Minta izin: sesinya berhenti sampai kamu menjawab. Tidak menaikkan
       statistik apa pun — yang terjadi bukan pekerjaan, justru pekerjaan yang
       tertahan. Yang dicatat cuma satu baris log dan pose di ruangan. */
    case 'izin-minta': {
      // `paraf` cuma dibawa sesi lahiran halaman yang lahir dengan paraf:true —
      // berarti tombol Paraf/Tolak di kartunya benar-benar bisa menjawab.
      if (ev.paraf && ev.paraf.id) {
        izinTunggu.set(ev.session, { id: ev.paraf.id, tool: ev.paraf.tool || ev.tool || '', ringkasan: ev.label || '' });
        sesiHalaman.add(ev.session);
      }
      a.say('minta izin: <b>' + esc(ev.label || ev.tool || '') + '</b>', 'say');
      pushLog(ev, 'mark', [ev.paraf ? 'minta paraf' : 'minta izin', [ev.tool, ev.label].filter(Boolean).join(' ')]);
      kabarMasuk(ev, a, 'izin');
      nowDoing.textContent = ev.paraf ? 'menunggu paraf kamu — buka kartunya' : 'menunggu izin kamu';
      foley('panggil', a);
      if (notifOn) notifKonfirmasi();
      break;
    }
    // Jawaban paraf dari ruangan (halaman ini, halaman lain, atau waktu habis).
    // Kalau diparaf, PostToolUse-nya menyusul sendiri; kalau ditolak, tool-nya
    // tidak pernah jalan — makanya server ikut mengirim butuh:false di sini.
    case 'izin-jawab': {
      izinTunggu.delete(ev.session);
      const ok = ev.keputusan === 'paraf';
      a.say((ok ? 'diparaf' : 'ditolak') + ': <b>' + esc(ev.tool || '') + '</b>', ok ? 'say' : 'err');
      pushLog(ev, ok ? 'mark' : 'err', [ok ? 'izin diparaf' : 'izin ditolak', ev.label || '']);
      nowDoing.textContent = ok ? 'izin diparaf — lanjut' : 'izin ditolak dari ruangan';
      foley(ok ? 'panggil' : 'gagal', a);
      break;
    }
    case 'izin-tolak': {
      a.say('izin ditolak: <b>' + esc(ev.alasan || ev.tool || '') + '</b>', 'err');
      pushLog(ev, 'err', ['izin ditolak', ev.alasan || [ev.tool, ev.label].filter(Boolean).join(' ')]);
      nowDoing.textContent = 'izin ditolak — cek panel';
      foley('gagal', a);
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
      foley('gagal', a);
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
      /* Cuma PELANTIKAN kursi formasi yang membawa `tetap` (server:
         pegawaiTetapPasang). Ganti nama lewat kartu pegawai datang tanpa
         field itu, dan memang tidak pantas menerbitkan nota lapor masuk. */
      if (ev.tetap) {
        /* Sapuan malas, bukan timer: sesi yang orangnya sudah tidak ada di
           ruangan dibuang di sini juga, supaya peta ini tidak menumpuk satu
           entri permanen per sesi yang pernah lewat seharian. */
        for (const s of pegawaiTetap.keys()) if (!agents.has(s)) pegawaiTetap.delete(s);
        pegawaiTetap.set(ev.session, {
          slot: Number(ev.tetap.slot) || 0,
          sejak: Number(ev.tetap.sejak) || (ev.ts || Date.now()),
          baru: ev.tetap.baru === true,
          // Folder PEMILIK kursi, dibekukan di detik pelantikan. Sesi yang
          // pindah cwd nanti menggeser a.project, tapi kursinya tidak ikut
          // pindah — kartu pegawai membaca field ini, bukan a.project.
          proyek: ev.cwd || '',
        });
        terimaPerkenalan(ev);
      }
      break;
    }
    // jabatannya sudah dipasang di atas switch; case ini cuma menahan supaya
    // tidak jatuh ke default dan menulis baris log "bekerja" yang kosong
    case 'peran': break;
    case 'tugas-mulai': {
      sesiHalaman.add(ev.session);
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
      izinTunggu.delete(ev.session);       // prosesnya tidak ada lagi: tidak ada yang bisa diparaf
      // Disimpan di orangnya, bukan cuma lewat di log: kartu yang dibuka
      // belakangan harus tetap bisa menjawab "sesi ini habis berapa".
      if (ev.biaya) { a.biaya = ev.biaya; tambahBiayaTotal(ev.biaya); }
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
/* Kursi formasi yang SERVER lantikkan untuk sesi ini — datang menumpang event
   kind:'nama' yang membawa `tetap` (lihat pegawaiTetapPasang di server.mjs).
   Isinya keterangan tampilan saja: nomor staf, kapan kursinya dilantik,
   folder pemilik kursinya, dan apakah kursinya baru dibuka. Bukan identitas
   — namanya tetap tinggal di namaPanggilan — dan tidak pernah ditulis ke
   mana pun. */
const pegawaiTetap = new Map();      // sesi 12-char -> { slot, sejak, baru, proyek }
let kendali = { izin: false, token: null };
let antrean = [];                    // loket disposisi: [{ id, nama, cwd, sejak, sifat, posisi }]
/* Paraf dari ruangan. `sesiHalaman` = sesi yang dilahirkan halaman ini (dari
   /kendali.berjalan dan event tugas-mulai) — cuma mereka yang izinnya bisa
   dijawab dari sini. `izinTunggu` = permintaan izin yang sedang menunggu
   paraf, per sesi; hanya diisi oleh izin-minta yang membawa `paraf`, jadi
   sesi terminal tidak pernah masuk walau sama-sama berpose butuh manusia. */
const sesiHalaman = new Set();       // sesi 12-char
const izinTunggu = new Map();        // sesi 12-char -> { id, tool, ringkasan }

const elKendaliMati = document.getElementById('kendaliMati');
const elForm = document.getElementById('formTugas');
const elKredensial = document.getElementById('kredensialPanel');
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
      sesiHalaman.add(j.sesi);
    }
    // izin yang sudah menunggu paraf sebelum halaman ini dibuka
    for (const z of d.izinTunggu || []) {
      if (z && z.sesi && z.id) izinTunggu.set(z.sesi, { id: z.id, tool: z.tool || '', ringkasan: z.ringkasan || '' });
    }
    // potret awal loket; selanjutnya diikuti lewat event `antre` di stream
    antrean = Array.isArray(d.antrean) ? d.antrean : [];
    renderCrew();
    // Fitur input tugas/prompt lewat web dimatikan — form maupun pesan
    // statusnya sengaja tidak pernah ditampilkan, apa pun jawaban server.
    elKendaliMati.hidden = true;
    elForm.hidden = true;
    // Panel token headless tetap independen: /kredensial hanya menyala kalau
    // kendali web (izin) nyala, jadi itu satu-satunya syarat kelihatan di sini.
    if (elKredensial) {
      elKredensial.hidden = !d.izin;
      if (d.izin) statusKredensial(d);
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

/* ------------------------------------------------------ loket disposisi ----
   Tugas yang dikirim waktu keempat slot penuh tidak ditolak, tapi menunggu di
   loket dan dilahirkan server sendiri begitu ada yang selesai. Barisnya
   ditaruh di daftar kru, di bawah standby: dia belum jadi pegawai, cuma map
   yang menunggu paraf. Tombol batal menariknya kembali dari loket. */
function renderAntrean() {
  for (const t of antrean) {
    const segera = t.sifat === 'SEGERA';
    const row = document.createElement('div');
    row.className = 'crew-row antre' + (segera ? ' segera' : '');
    const sejak = t.sejak ? new Date(t.sejak).toLocaleTimeString('id-ID', { hour12: false }).slice(0, 8) : '';
    row.title = 'menunggu slot kosong' + (sejak ? ' sejak ' + sejak : '')
      + (segera ? ' · sifat SEGERA: didahulukan' : ' · sifat biasa');
    row.innerHTML =
      '<span class="chip"></span>' +
      '<span class="who">antre #' + Number(t.posisi || 0) + '</span>' +
      '<span class="nama">' + esc(t.nama || 'tugas') + '</span>' +
      '<span class="what">' + esc(t.cwd || '') + ' · ' + (segera ? 'SEGERA' : 'biasa') + '</span>';
    if (kendali.izin) {
      const bBatal = document.createElement('button');
      bBatal.className = 'aksi'; bBatal.textContent = 'batal';
      bBatal.title = 'tarik dari loket disposisi (belum jalan, jadi tidak ada yang dihentikan)';
      bBatal.onclick = () => batalAntre(t.id);
      row.appendChild(bBatal);
    }
    crewEl.appendChild(row);
  }
}

async function batalAntre(id) {
  if (!kendali.token) return;
  try {
    const res = await fetch('/perintah/batal', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: kendali.token, id }),
    });
    const d = await res.json();
    if (d.ok) pesan('antrean ' + (d.nama || id) + ' ditarik dari loket', 'ok');
    else pesan(d.pesan || 'gagal membatalkan antrean', 'err');
  } catch (err) {
    pesan('gagal membatalkan antrean: ' + err.message, 'err');
  }
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
const TINGGI_UCAP = 27;        // tinggi balon ucap sebaris (px CSS), untuk menumpuk
const UCAP_MAX = 150;          // jatah huruf balon ucap; sisa lebihnya dipotong
                               // line-clamp CSS, jadi angka ini boleh longgar
const TITIK = '<span class="titik"><i></i><i></i><i></i></span>';

let balonPikir = ingatan.baca('balonPikir', '1') !== '0';

/* Pengingat sesi terkatung (pegawai berhenti menunggu paraf/galat) — dua
   jenjang: 2 menit menangkap yang sekadar lupa (tab tertimbun jendela lain),
   10 menit menangkap yang sudah meninggalkan meja; satu jenjang saja pasti
   terlalu cepat untuk yang satu atau terlalu lambat untuk yang lain.
   BISU_MS 25 detik di server cuma menjaga kelahiran tugas, bukan ini. */
const TERKATUNG_JENJANG_MS = [2 * 60 * 1000, 10 * 60 * 1000];
let pengingatOn = ingatan.baca('pengingatTerkatung', '1') !== '0';

const satuBaris = (t, n) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

/* Titik tengah balon, digeser secukupnya supaya separuh lebarnya (`tepi`)
   tetap di dalam panggung. Dipakai balon ucap dan balon pikiran sama-sama;
   yang memanggil bertanggung jawab menggeser balik ekor/gelembungnya. */
const jagaBingkai = (tengah, tepi) => {
  const t = Math.min(tepi, panggungW / 2);
  return Math.max(t, Math.min(panggungW - t, tengah));
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
   yang dapat hak itu; catatan di tengah jalan tidak.
   `emoji` + `perihal` jadi baris tebal pembuka tiap balon — kebiasaan grup WA
   kantor: pesan selalu diawali "Izin melaporkan," / "Mohon arahan," sebelum
   isinya. `tajuk` tinggal dipakai tooltip balon. */
const KABAR_JENIS = {
  hasil:   { tajuk: 'hasil kerja',        cls: 'hasil',  auto: true,  emoji: '✅',
             perihal: 'Izin melaporkan hasil pekerjaan' },
  lapor:   { tajuk: 'catatan',            cls: 'lapor',  auto: false, emoji: '📝',
             perihal: 'Sekadar info' },
  tanya:   { tajuk: 'butuh jawaban',      cls: 'tunggu', auto: true,  emoji: '🙏',
             perihal: 'Mohon arahan Bapak/Ibu' },
  izin:    { tajuk: 'minta izin',         cls: 'tunggu', auto: true,  emoji: '🙏',
             perihal: 'Mohon izin' },
  rencana: { tajuk: 'mengajukan rencana', cls: 'tunggu', auto: true,  emoji: '📋',
             perihal: 'Mengajukan rencana kerja, mohon persetujuan' },
  galat:   { tajuk: 'berhenti',           cls: 'galat',  auto: true,  emoji: '⚠️',
             perihal: 'Mohon maaf, ada kendala' },
  // SK kenaikan pangkat dari buku induk (lihat terimaPromosi): langka — paling
  // sering sekali per proyek per beberapa hari — jadi boleh menyela seperti hasil.
  sk:      { tajuk: 'SK kenaikan pangkat', cls: 'hasil',  auto: true,  emoji: '📜',
             perihal: 'Petikan SK Kenaikan Pangkat' },
  /* Nota anggaran token (lihat terimaPagu). Kelasnya sengaja memakai warna yang
     SUDAH ada — 'tunggu' kuning, 'galat' merah — jadi fitur ini tidak menambah
     satu baris pun ke style.css. Peringatan 80% menumpuk diam di kotak kabar
     (auto:false): ia tidak menutup giliran siapa pun dan tidak menahan sesi,
     jadi tidak berhak menodong. Yang TERLAMPAUI boleh menyela sekali — itu pun
     tetap cuma nota, bukan rem: tidak ada pegawai yang berhenti karenanya. */
  pagu:    { tajuk: 'peringatan pagu',    cls: 'tunggu', auto: false, emoji: '🧾',
             perihal: 'Peringatan serapan pagu token' },
  'pagu-lewat': { tajuk: 'pagu terlampaui', cls: 'galat', auto: true, emoji: '📛',
             perihal: 'Pemberitahuan pagu token terlampaui' },
  /* Lapor masuk pegawai tetap yang baru dilantik ke kursi formasi. auto:false
     WAJIB: satu sesi baru sudah cukup sering, dan modal yang terbuka sendiri
     tepat waktu orangnya harus berangkat ke stasiun melanggar Aturan 1. */
  perkenalan: { tajuk: 'lapor masuk',     cls: 'lapor',  auto: false, emoji: '🙋',
             perihal: 'Izin melapor masuk kerja' },
};

const tanggalID = (ts) => new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
// Pil pemisah hari di tengah utas, label persis WhatsApp.
function labelHari(ts) {
  const d = new Date(ts), acuan = new Date();
  if (d.toDateString() === acuan.toDateString()) return 'HARI INI';
  acuan.setDate(acuan.getDate() - 1);
  if (d.toDateString() === acuan.toDateString()) return 'KEMARIN';
  return tanggalID(ts).toUpperCase();
}
// WA cuma menulis jam.menit, dengan titik seperti locale id-ID.
const jamWA = (ts) => jam(ts).slice(0, 5).replace(':', '.');

// Inisial 1-2 huruf buat avatar bulat di samping balon -- nama panggilan bisa
// "Budi Santoso" (dua suku kata) atau "agent-room·72db" (fallback proyek·id).
function inisialNama(nama) {
  const kata = String(nama).split(/[\s·]+/).filter(Boolean);
  return kata.length > 1 ? (kata[0][0] + kata[1][0]).toUpperCase() : nama.slice(0, 2).toUpperCase();
}
// Warna seragam (pal.main) ada yang khaki terang; buat NAMA pengirim di atas
// balon putih digelapkan dulu supaya masih kebaca, avatarnya tetap warna asli.
function warnaNama(hex) {
  const n = parseInt(hex.slice(1), 16);
  const g = (x) => Math.round(x * 0.62).toString(16).padStart(2, '0');
  return '#' + g(n >> 16 & 255) + g(n >> 8 & 255) + g(n & 255);
}

const kabar = [];
let kabarIdx = -1;
let kabarBaru = 0;
let kabarSeq = 0;
// Pil "N PESAN BELUM DIBACA": indeks kabar pertama yang belum dibaca waktu
// modal dibuka + jumlahnya saat itu. Dibekukan selama modal terbuka (WA juga
// begitu), dibuang lagi waktu ditutup.
let kabarBatasBaru = -1;
let kabarBatasN = 0;
let kabarOtomatis = ingatan.baca('kabarOtomatis', '1') !== '0';

const kbr = {
  latar: document.getElementById('dlgKabar'),
  anggota: document.getElementById('kabarAnggota'),
  badan: document.getElementById('kabarBadan'),
  hitung: document.getElementById('kabarHitung'),
  sebelum: document.getElementById('kabarSebelum'),
  lanjut: document.getElementById('kabarLanjut'),
  tutup: document.getElementById('kabarTutup'),
  auto: document.getElementById('kabarAuto'),
  tombol: document.getElementById('kabarBtn'),
  lencana: document.getElementById('kabarLencana'),
};

function kabarMasuk(ev, a, jenis) {
  const def = KABAR_JENIS[jenis] || KABAR_JENIS.lapor;
  const j = jabatanDari(a.peran);
  kabar.push({
    no: ++kabarSeq,
    ts: ev.ts || Date.now(),
    sesi: ev.session || '',
    nama: namaKru(a),
    jab: j.singkat,
    warna: j.pal.main,
    jenis, tajuk: def.tajuk, cls: def.cls, emoji: def.emoji, perihal: def.perihal,
    teks: ev.teks || ev.alasan || ev.label || '',
    tanya: ev.tanya || null,
    tool: ev.tool || '',
  });
  while (kabar.length > KABAR_MAX) {
    // yang disematkan di meja disposisi (📌, lihat kabarTersemat) tidak ikut
    // dipangkas: yang dibuang kabar tak tersemat paling tua
    const i = kabar.findIndex((k) => !kabarTersemat(k));
    if (i < 0) break;
    kabar.splice(i, 1);
    if (kabarIdx > i) kabarIdx--;
    if (kabarBatasBaru > i) kabarBatasBaru--;
  }
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
  if (kbr.latar.hidden) {
    kbr.latar.hidden = false;
    document.addEventListener('keydown', kabarTombol);
    kabarBatasBaru = kabarBaru > 0 ? kabar.length - kabarBaru : -1;
    kabarBatasN = kabarBaru;
  }
  kabarBaru = 0;
  kabarLencana();
  kabarGambar(true);
}

function kabarTutupDialog() {
  kbr.latar.hidden = true;
  kabarBatasBaru = -1;
  document.removeEventListener('keydown', kabarTombol);
}

/* Seluruh kotak dirender sebagai SATU utas grup, bukan satu kabar per
   halaman. `lompat` = gulir ke balon yang sedang dituju (buka / ← →); tanpa
   itu posisi gulir dipertahankan, supaya orang yang lagi membaca kabar lama
   tidak diseret waktu kabar baru masuk dan utasnya digambar ulang. */
function kabarGambar(lompat) {
  const k = kabar[kabarIdx];
  if (!k) return;
  // Subjudul grup WA = daftar anggota. Isinya siapa saja yang pernah menulis
  // di kotak ini, ditutup "Anda" seperti aslinya.
  const anggota = [...new Set(kabar.map((x) => x.nama))];
  kbr.anggota.textContent = anggota.slice(0, 4).join(', ')
    + (anggota.length > 4 ? ', +' + (anggota.length - 4) + ' lainnya' : '') + ', Anda';
  const posisi = kbr.badan.scrollTop;
  kbr.badan.innerHTML = kabarUtas();
  if (!lompat) kbr.badan.scrollTop = posisi;
  else if (kabarIdx === kabar.length - 1) kbr.badan.scrollTop = kbr.badan.scrollHeight;
  else {
    const el = kbr.badan.querySelector('.wa-pesan.aktif');
    if (el) kbr.badan.scrollTop = el.offsetTop - (kbr.badan.clientHeight - el.offsetHeight) / 2;
  }
  kbr.hitung.textContent = 'kabar ' + (kabarIdx + 1) + ' / ' + kabar.length + ' — balas lewat terminal';
  kbr.sebelum.disabled = kabarIdx <= 0;
  kbr.lanjut.disabled = kabarIdx >= kabar.length - 1;
}

function kabarUtas() {
  const out = [];
  let hariLalu = '';
  kabar.forEach((k, i) => {
    const hari = new Date(k.ts).toDateString();
    if (hari !== hariLalu) { out.push('<div class="wa-pil">' + labelHari(k.ts) + '</div>'); hariLalu = hari; }
    if (i === kabarBatasBaru) out.push('<div class="wa-pil wa-baru">' + kabarBatasN + ' PESAN BELUM DIBACA</div>');
    out.push(kabarPesan(k, i === kabarIdx));
    // Halaman ini menonton, tidak menjawab. Dibilang terang-terangan sebagai
    // "pesan sistem" 🔒 di bawah balonnya -- menyembunyikannya cuma bikin
    // orang menunggu kotak balas yang memang tidak akan pernah ada.
    // Kecuali izin sesi halaman yang lewat loket paraf: itu memang bisa
    // dijawab di sini — dari kartu pegawainya, bukan dari kotak ini.
    if (k.cls === 'tunggu') {
      out.push(izinTunggu.has(k.sesi)
        ? '<div class="wa-pil wa-sistem">✍️ Sesi halaman: bisa diparaf di sini — buka kartu pegawainya, tombol Paraf / Tolak.</div>'
        : '<div class="wa-pil wa-sistem">🔒 Sesi ini berhenti sampai dijawab. Jawabannya di tempat sesi itu jalan — terminal atau aplikasi Claude, bukan di halaman ini.</div>');
    }
  });
  return out.join('');
}

// Satu kabar = satu balon masuk ala grup WA: avatar kecil di kiri, nama
// pengirim berwarna + jabatan (posisi "~ nama" buat nomor yang tidak
// tersimpan), baris tebal pembuka, isi, lalu jam kecil di sudut kanan bawah.
// AskUserQuestion yang punya pilihan digambar sebagai JAJAK PENDAPAT (polling
// WA) -- pertanyaan berpilihan memang itu bentuknya di grup kantor.
function kabarPesan(k, aktif) {
  const isi = ['<p class="wa-perihal">' + k.emoji + ' <b>' + esc(k.perihal) + '</b></p>'];
  if (k.tanya && k.tanya.jenis === 'tanya') {
    for (const q of k.tanya.daftar || []) {
      if (q.opsi && q.opsi.length) isi.push(kabarPolling(q));
      else if (q.tanya) isi.push('<div class="wa-teks">' + esc(q.tanya) + '</div>');
    }
  } else if (k.tanya && k.tanya.jenis === 'rencana') {
    isi.push('<div class="wa-teks">' + esc(k.tanya.teks || k.teks) + '</div>');
  } else if (k.teks) {
    isi.push('<div class="wa-teks">' + esc(k.teks) + '</div>');
  }
  // Metadata teknis (tool, id sesi) ikut di kaki balon, sekecil jamnya.
  const meta = [];
  if (k.tool) meta.push('via ' + esc(k.tool));
  if (k.sesi) meta.push('sesi ' + esc(k.sesi));

  return '<div class="wa-pesan ' + k.cls + (aktif ? ' aktif' : '') + '" title="' + esc(k.tajuk) + '">'
    + '<span class="wa-avatar" style="background:' + k.warna + '">' + esc(inisialNama(k.nama)) + '</span>'
    + '<div class="wa-balon">'
      + '<div class="wa-pengirim"><b style="color:' + warnaNama(k.warna) + '">' + esc(k.nama) + '</b>'
        + '<span>~ ' + esc(k.jab) + '</span></div>'
      + isi.join('')
      + '<div class="wa-kaki">'
        + (meta.length ? '<span class="wa-meta">' + meta.join(' · ') + '</span>' : '')
        + '<span class="wa-jam">' + jamWA(k.ts) + '</span>'
      + '</div>'
    + '</div>'
  + '</div>';
}

function kabarPolling(q) {
  return '<div class="wa-poll">'
    + '<div class="wa-poll-judul">' + esc(q.tanya || 'Pilih salah satu') + '</div>'
    + '<div class="wa-poll-ket">JAJAK PENDAPAT · Pilih satu</div>'
    + '<ul>' + q.opsi.map((o) => '<li><i></i><span>' + esc(o) + '</span><em>0</em><b></b></li>').join('') + '</ul>'
  + '</div>';
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
kbr.auto.onchange = () => kabarOtomatisSet(kbr.auto.checked);
// Checkbox kembarnya (panel Pengaturan, tombol ⚙️) dan balon pikiran
// disambungkan di blok "pengaturan" lebih bawah, sesudah dlgStats — di situ
// juga tempat elemen #setKabarOtomatis dan #setBalonPikir dibaca.
kabarLencana();

/* -------------------------------------------------------- statistik token */
const dlgStats = document.getElementById('dlgStats');
const statsBadan = document.getElementById('statsBadan');

/* tokenTotal (di atas) cuma hidup selama HALAMAN INI terbuka. Ini beda: snapshot
   dari /token-riwayat, yang SERVER tulis ke disk lintas sesi dan lintas restart
   (lihat riwayatCatat() di server.mjs) — jawaban buat "riwayatnya kemana kalau
   halaman ditutup". Diambil ulang tiap modal ini dibuka supaya tidak basi. */
let riwayatToken = null;
async function muatRiwayatToken() {
  try {
    const r = await fetch('/token-riwayat');
    riwayatToken = await r.json();
  } catch { /* server lokal lagi restart — modal berikutnya coba lagi */ }
  if (!dlgStats.hidden) statsGambar();
}
muatRiwayatToken();

/* ------------------------------------------------------ buku induk pegawai ---
   Karier per FOLDER proyek, lintas sesi & restart, dihitung server dari hook
   nyata (lihat bukuIndukCatat() di server.mjs). Angkanya "sejak dipantau" —
   labelnya wajib ikut tampil. Terpisah dari statistik sesi di kartu: a.calls
   dkk. tetap milik sesi ini saja. Di-cache 30 detik: kartu dibuka-tutup
   berkali-kali tidak boleh jadi hujan fetch. */
let bukuInduk = null;
let bukuIndukTs = 0;
const LENCANA_GOLONGAN = { 'Penata Muda': '▲', Penata: '◆', Pembina: '★' };   // < Penata Muda: tanpa lencana
async function muatBukuInduk(paksa) {
  if (!paksa && bukuInduk && Date.now() - bukuIndukTs < 30000) return;
  bukuIndukTs = Date.now();
  try {
    const r = await fetch('/buku-induk');
    bukuInduk = await r.json();
  } catch { bukuIndukTs = 0; return; }        // server lokal lagi restart — coba lagi nanti
  renderCrew();
  if (terpilih) perbaruiKartu();
}
const rekamInduk = (a) => (jenisAgen(a) === 'sesi' && a.project && bukuInduk?.proyek?.[a.project]) || null;
const usulInduk = (a) => (a.project && bukuInduk?.usulPromosi?.proyek === a.project) ? bukuInduk.usulPromosi : null;
const jamDinasTeks = (ms) => {
  const jam = ms / 3600000;
  return (jam >= 10 ? Math.round(jam) : Math.round(jam * 10) / 10) + ' jam';
};

/* SK kenaikan pangkat: server sudah memutuskan (satu event per kenaikan).
   Halaman cuma seremoninya: satu nota di kotak kabar, pegawai seproyek
   bersyukur, dan cache buku induk disegarkan. Jabatan TIDAK berubah, meja
   TIDAK pindah — pangkat tidak boleh menyandera pekerjaan. */
function terimaPromosi(ev) {
  const rekan = [...agents.values()].filter((a) => a.project === ev.cwd);
  const g = ev.golongan || '';
  // kabarMasuk butuh "pengirim": pegawai seproyek kalau ada; kalau semuanya
  // sudah pulang, Sekretaris Dinas yang membacakan petikannya
  const pengirim = rekan[0] || { id: '', project: ev.cwd || '', peran: 'sekdis' };
  kabarMasuk({ ...ev, session: rekan[0] ? rekan[0].id : '',
               teks: 'Terhitung mulai hari ini, pegawai pada proyek ' + (ev.cwd || '-')
                 + ' dinaikkan pangkatnya' + (ev.sebelumnya ? ' dari ' + ev.sebelumnya : '')
                 + ' menjadi ' + g + ' (jam dinas sejak dipantau). Selamat, semoga amanah.' },
             pengirim, 'sk');
  for (const a of rekan) a.say('alhamdulillah naik pangkat 🙏 <b>' + esc(g) + '</b>');
  pushLog(ev, 'mark', ['SK kenaikan pangkat', (ev.cwd || '') + (g ? ' → ' + g : '')]);
  muatBukuInduk(true);
}

/* Nota pagu anggaran token. Polanya PERSIS terimaPromosi(): kejadian milik
   satu FOLDER, `session` kosong, jadi "pengirim" notanya dipinjam dari pegawai
   seproyek yang kebetulan ada di ruangan; kalau semuanya sudah pulang, Auditor
   yang membacakannya.

   NOTA, BUKAN REM. Fungsi ini tidak menyentuh a.calls, a.token, toolCount,
   maupun statistik apa pun (Aturan 2), dan tidak mengubah state, station, atau
   busyUntil siapa pun — serapan lewat pagu bukan alasan berhenti bekerja,
   cuma alasan memberi tahu.

   PAGU ITU ANGKA TOKEN. Tidak ada satu pun satuan uang di sini, dan tidak
   akan pernah ada: harga berubah, angka token dari API tidak (Aturan 4).

   ANGKANYA BISA TIDAK ADA. Event yang diputar ulang dari buku agenda lama
   datang tanpa `pakai`/`pagu`/`persen` — yang tersisa cuma `label`. Kalimatnya
   turun ke label itu apa adanya, bukan menulis "NaN dari NaN token". */
// `minggu` dari server berupa tanggal Senin ('YYYY-MM-DD', lihat mingguLokal);
// yang dibaca orang tanggal Indonesia, bukan kode.
const paguMingguTeks = (m) => (m ? tanggalID(new Date(m + 'T00:00:00').getTime()) : 'ini');

/* Kalimat penutup blok pagu di modal Statistik. DUA HIMPUNAN YANG BERBEDA,
   dan modal ini dulu memakai yang salah:
     `berpagu` = KONFIGURASI — berapa folder yang dituliskan pagunya di
       pagu.json. Tidak bergerak tiap Senin.
     `bawaan`  = pagu untuk folder yang TIDAK disebut namanya. Kalau terisi,
       "berapa yang berpagu" sebenarnya "semua yang bekerja".
     `jumlah`  = himpunan LAPORAN minggu berjalan; Senin pagi angkanya 0
       walau pagunya jelas-jelas aktif — persis salah-baca yang bikin server
       mulai mengirim dua field di atas.
   Server lama (atau putar ulang agenda) belum membawa `berpagu`; kalau
   begitu kalimatnya turun ke `jumlah` seperti dulu, bukan menulis 0. */
function paguKetTeks(pg) {
  const aktif = Number(pg.jumlah) || 0;
  const bawaan = Number(pg.bawaan) || 0;
  if (!Number.isFinite(Number(pg.berpagu))) return aktif + ' proyek berpagu';
  const berpagu = Number(pg.berpagu);
  return berpagu + ' proyek berpagu'
    + (bawaan ? ' (+ bawaan ' + angkaID(bawaan) + ' token untuk yang lain)' : '')
    + ' · ' + aktif + ' menyerap minggu ini';
}

function terimaPagu(ev) {
  const rekan = [...agents.values()].filter((a) => a.project === ev.cwd);
  const pengirim = rekan[0] || { id: '', project: ev.cwd || '', peran: 'auditor' };
  const ambang = Number.isFinite(Number(ev.ambang)) ? Number(ev.ambang) : null;
  const lewat = ambang !== null && ambang >= 100;
  const proyek = ev.cwd || '-';
  const adaAngka = Number.isFinite(ev.pakai) && Number.isFinite(ev.pagu);
  const rincian = adaAngka
    ? angkaID(ev.pakai) + ' dari ' + angkaID(ev.pagu) + ' token'
    : (ev.label || '');
  /* PERSENNYA BISA TIDAK ADA, DAN `ambang` BUKAN GANTINYA. Baris agenda lama
     yang cuma membawa `label` tidak punya `persen`; menuliskannya sebagai 0
     menghasilkan nota yang membantah dirinya sendiri di satu kalimat
     ("telah mencapai 0% (serapan pagu 92% …)"). Memakai `ambang` sebagai
     ganti juga membantah: ambang itu GARIS YANG DILEWATI, bukan serapannya,
     jadi nota TERLAMPAUI berbunyi "serapan pagu 140% … (100%)". Jadi: dua
     angka yang berbeda, dan masing-masing disebut dengan namanya sendiri —
     persen kalau ada, kalau tidak cukup sebut ambangnya sebagai ambang. */
  const persen = Number.isFinite(ev.persen) ? ev.persen : null;
  const minggu = paguMingguTeks(ev.minggu);
  const teks = lewat
    ? 'Diberitahukan bahwa pagu token proyek ' + proyek + ' minggu ini TERLAMPAUI: '
      + (rincian || 'serapan sudah melewati pagu')
      + (persen === null ? '' : ' (' + persen + '%)') + '.'
      + ' Kegiatan tetap berjalan — nota ini pemberitahuan, bukan penghentian.'
    : 'Dengan hormat, sampai hari ini serapan pagu token proyek ' + proyek
      + ' pada minggu ' + minggu
      + (persen !== null ? ' telah mencapai ' + persen + '%'
        : ambang !== null ? ' sudah melewati ambang ' + ambang + '%'
        : ' sudah menyentuh ambang pemantauan')
      + (rincian ? ' (' + rincian + ')' : '') + '. Mohon menjadi perhatian.';
  kabarMasuk({ ...ev, session: rekan[0] ? rekan[0].id : '', teks },
             pengirim, lewat ? 'pagu-lewat' : 'pagu');
  for (const a of rekan) {
    a.say(lewat ? 'pagu token minggu ini <b>terlampaui</b> 📛'
      : (persen === null ? 'serapan pagu <b>menyentuh ambang</b> 🧾'
                         : 'serapan pagu <b>' + persen + '%</b> 🧾'));
  }
  pushLog(ev, lewat ? 'err' : 'mark',
          [lewat ? 'pagu token terlampaui' : 'peringatan serapan pagu',
           proyek + (persen === null ? '' : ' · ' + persen + '%')]);
}

/* Lapor masuk pegawai tetap. Kursinya sudah dilantik server (satu event
   kind:'nama' ber-`tetap` per penempatan), halaman cuma seremoninya: satu nota
   yang menumpuk diam di kotak kabar, satu balon ucapan, satu baris log.
   Tidak menyentuh statistik apa pun, dan TIDAK menahan orangnya sedetik pun —
   notanya auto:false justru supaya modal tidak terbuka tepat waktu dia harus
   berangkat ke stasiun (Aturan 1). */
function terimaPerkenalan(ev) {
  const a = agents.get(ev.session);
  const tetap = pegawaiTetap.get(ev.session);
  if (!a || !tetap) return;
  const nama = ev.nama || namaPanggilan.get(ev.session) || 'pegawai';
  const proyek = ev.cwd || a.project || '-';
  const teks = tetap.baru
    ? 'Izin melapor, saya ' + nama + ', pegawai baru pada ' + proyek + ', mulai bertugas hari ini.'
    : 'Assalamualaikum, saya ' + nama + ', kembali bertugas di ' + proyek + ' hari ini.';
  kabarMasuk({ ...ev, teks }, a, 'perkenalan');
  a.say('assalamualaikum, saya <b>' + esc(nama) + '</b>');
  pushLog(ev, 'mark', ['lapor masuk', nama + ' · staf #' + tetap.slot + ' di ' + proyek]);
}
muatBukuInduk(true);

const tanggalLokal = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  + '-' + String(d.getDate()).padStart(2, '0');
const labelTanggal = (tgl) => new Date(tgl + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

// 14 hari kalender terakhir TERMASUK yang tanpa aktivitas — barisnya harus
// kontinu supaya "sepi 3 hari lalu" ikut terbaca di grafik, bukan cuma yang ada datanya.
function riwayatBelakangan(harian, n) {
  const peta = new Map((harian || []).map((h) => [h.tanggal, h]));
  const keluar = [];
  const acuan = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(acuan);
    d.setDate(d.getDate() - i);
    const tgl = tanggalLokal(d);
    const h = peta.get(tgl);
    keluar.push({ tanggal: tgl, input: h?.input || 0, output: h?.output || 0 });
  }
  return keluar;
}

function statsGambar() {
  const blok = [];
  const r = riwayatToken;

  if (r && (r.total.input || r.total.output)) {
    const sejak = r.sejak
      ? new Date(r.sejak).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    blok.push('<div class="kartu-info stat-total">'
      + '<span class="kk">sepanjang waktu</span><span class="vv">' + esc(formatToken(r.total, '')) + '</span>'
      + (sejak ? '<span class="kk">tercatat sejak</span><span class="vv">' + esc(sejak) + '</span>' : '')
      + '</div>');

    // Efisiensi cache: dari token masukan yang dibaca, berapa persen datang dari
    // cache (murah, cepat) alih-alih diproses ulang. Metrik yang tidak kelihatan
    // dari angka mentah, tapi paling langsung menjawab "sudah efisien belum".
    const dibaca = r.total.cacheBaca || 0;
    const basis = (r.total.input || 0) + dibaca;
    if (basis > 0) {
      const pct = Math.round((dibaca / basis) * 100);
      blok.push('<div class="stat-cache"><span class="kk">efisiensi cache</span>'
        + '<div class="stat-bar"><div class="stat-bar-isi" style="width:' + pct + '%"></div></div>'
        + '<span class="stat-cache-pct">' + pct + '%</span></div>'
        + '<p class="stat-ket">dari token masukan yang dibaca, ' + pct + '% diambil dari cache — bukan diproses ulang</p>');
    }

    const belakangan = riwayatBelakangan(r.harian, 14);
    const hariIni = belakangan[belakangan.length - 1];
    const totalBelakangan = belakangan.reduce((s, h) => s + h.input + h.output, 0);
    const rata = Math.round(totalBelakangan / belakangan.length);
    const puncak = Math.max(1, ...belakangan.map((h) => h.input + h.output));
    blok.push('<div class="stat-ringkas">'
      + '<div><b>' + angkaID(hariIni.input + hariIni.output) + '</b><span>hari ini</span></div>'
      + '<div><b>' + angkaID(rata) + '</b><span>rata² / hari (14 hari)</span></div>'
      + '</div>');
    blok.push('<div class="stat-blok"><h3>14 hari terakhir</h3><div class="stat-grafik">'
      + belakangan.map((h) => {
          const total = h.input + h.output;
          const tinggi = total ? Math.max(3, Math.round((total / puncak) * 48)) : 1;
          const kelas = h.tanggal === hariIni.tanggal ? ' hari-ini' : '';
          return '<div class="stat-batang' + kelas + '" title="' + labelTanggal(h.tanggal) + ': '
            + angkaID(total) + ' token"><div class="stat-batang-isi" style="height:' + tinggi + 'px"></div></div>';
        }).join('')
      + '</div><div class="stat-grafik-sumbu"><span>' + esc(labelTanggal(belakangan[0].tanggal))
      + '</span><span>hari ini</span></div></div>');

    if (r.proyek && r.proyek.length) {
      blok.push('<div class="stat-blok"><h3>proyek teratas</h3><ul>'
        + r.proyek.slice(0, 5).map((p) => '<li><span class="t">' + esc(p.nama) + '</span>'
            + '<span>' + esc(formatToken(p, '')) + '</span></li>').join('')
        + '</ul></div>');
    }
  } else {
    blok.push('<p class="stat-ket">belum ada riwayat token yang tersimpan — mulai tercatat begitu'
      + ' ada giliran asisten yang membawa usage.</p>');
  }

  /* Serapan pagu token minggu ini — OPSIONAL. `r.pagu` null berarti server
     memang tidak punya pagu.json, dan yang tidak memakai fiturnya tidak perlu
     melihat judul kosong yang selamanya nol. Batangnya memakai .stat-bar yang
     sudah dipakai efisiensi cache: nol baris CSS baru.
     Angka di sini TOKEN, dan cuma token. */
  const pg = r && r.pagu;
  if (pg && Array.isArray(pg.proyek) && pg.proyek.length) {
    const rinci = pg.proyek.slice(0, 5).map((p) => {
      const persen = Number(p.persen) || 0;
      const lebar = Math.max(0, Math.min(100, persen));   // yang lewat 100% tetap penuh, tidak meluber
      return '<div class="stat-cache" title="' + esc(p.nama) + ': ' + esc(angkaID(p.pakai))
        + ' dari ' + esc(angkaID(p.pagu)) + ' token"><span class="kk">' + esc(p.nama) + '</span>'
        + '<div class="stat-bar"><div class="stat-bar-isi" style="width:' + lebar + '%"></div></div>'
        + '<span class="stat-cache-pct">' + persen + '%</span></div>';
    }).join('');
    blok.push('<div class="stat-blok"><h3>pagu token · minggu ' + esc(paguMingguTeks(pg.minggu)) + '</h3>'
      + rinci
      // TANPA <b>: di dalam modal ini `.stat b` dipaksa display:block oleh
      // style.css, jadi satu kata tebal memutus kalimatnya jadi tiga baris.
      + '<p class="stat-ket">' + paguKetTeks(pg)
      + (pg.lewat ? ' · ' + Number(pg.lewat) + ' MELEWATI PAGU' : ' · belum ada yang melewati pagu')
      + ' — nota pagu memberi tahu, tidak pernah menghentikan pekerjaan.</p></div>');
  }

  if (biayaCount) {
    blok.push('<div class="kartu-info"><span class="kk">biaya</span><span class="vv">'
      + esc(formatBiaya({ usd: biayaTotal, resmi: false }))
      + ' · ' + biayaCount + ' sesi headless (sejak halaman ini dibuka)</span></div>');
  }

  // Cuma sesi yang benar-benar sedang di ruangan yang dirinci — yang sudah
  // pulang tetap ikut totalnya (lihat tambahTokenTotal), tapi barisnya tidak
  // ada lagi orangnya untuk ditunjuk.
  const aktif = [...agents.values()]
    .filter((a) => a.token)
    .sort((x, y) => (y.token.input + y.token.output) - (x.token.input + x.token.output));
  const baris = aktif.length
    ? aktif.map((a) => '<li><span class="t">' + esc(namaKru(a)) + '</span>'
        + '<span>' + esc(formatToken(a.token))
        + (a.biaya ? ' · ' + esc(formatBiaya(a.biaya)) : '') + '</span></li>').join('')
    : '<li class="kosong">belum ada sesi aktif yang terpantau tokennya</li>';
  blok.push('<div class="stat-per"><h3>sesi aktif (sejak halaman ini dibuka)</h3><ul>' + baris + '</ul></div>');

  statsBadan.innerHTML = blok.join('');
}

function statsTutupDialog() {
  dlgStats.hidden = true;
  document.removeEventListener('keydown', statsTombol);
}
function statsTombol(e) { if (e.key === 'Escape') { e.preventDefault(); statsTutupDialog(); } }

statsBtn.onclick = () => {
  if (!dlgStats.hidden) { statsTutupDialog(); return; }
  statsGambar();
  muatRiwayatToken();
  dlgStats.hidden = false;
  document.addEventListener('keydown', statsTombol);
};
document.getElementById('statsTutup').onclick = statsTutupDialog;
dlgStats.onclick = (e) => { if (e.target === dlgStats) statsTutupDialog(); };

/* ------------------------------------------------------------ papan SKP ---
   Tab kedua di modal 📊: kinerja per PROYEK dan per SESI dalam rentang
   7/14/30 hari, dari GET /skp — server yang menjumlahkan buku agenda, riwayat
   token, dan buku induk (lihat skpHitung() di server.mjs), halaman cuma
   menggambar. Angkanya "sejak dipantau" dan labelnya wajib tampil; token
   berhenti di token, tidak ke dolar. Tab Token di atas tidak disentuh:
   statsGambar() tetap menulis ke statsBadan-nya sendiri, tab ini ke
   skpBadan. Modalnya dilebarkan hanya saat tab ini aktif (.skp-lebar). */
const skpBadan = document.getElementById('skpBadan');
const statsTab = document.getElementById('statsTab');
const SKP_HARI = [7, 14, 30];
let skpData = null;
let skpHari = 7;
let skpMemuat = false;
let skpUrut = 0;
let statsTabAktif = 'token';

function skpRentang(hari) {
  const sampai = new Date();
  const dari = new Date(sampai);
  dari.setDate(dari.getDate() - (hari - 1));
  return { dari: tanggalLokal(dari), sampai: tanggalLokal(sampai) };
}

async function muatSkp(hari) {
  if (SKP_HARI.includes(hari)) skpHari = hari;
  const r = skpRentang(skpHari);
  const urut = ++skpUrut;                  // jawaban rentang lama yang telat datang tidak boleh menimpa
  skpMemuat = true;
  if (statsTabAktif === 'skp') skpGambar();
  try {
    const res = await fetch('/skp?dari=' + r.dari + '&sampai=' + r.sampai);
    const d = await res.json();
    if (urut !== skpUrut) return skpData;
    if (d && !d.galat) skpData = d;
  } catch { /* server lokal lagi restart — coba lagi waktu tab dibuka */ }
  if (urut !== skpUrut) return skpData;
  skpMemuat = false;
  if (statsTabAktif === 'skp') skpGambar();
  return skpData;
}

const skpDurasi = (ms) => ms == null ? '–'
  : ms < 1000 ? Math.round(ms) + ' ms'
  : ms < 60000 ? (Math.round(ms / 100) / 10).toLocaleString('id-ID') + ' dtk'
  : durasiSingkat(ms);
const skpTanggal = (tgl) => tanggalID(new Date(tgl + 'T00:00:00').getTime());
const skpJamTgl = (ts) => new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + jam(ts).slice(0, 5);

/* Ringkasan yang dipakai tab DAN nota: satu hitungan, dua tampilan. */
function skpRingkas(d) {
  const r = { sesi: d.sesi.length, toolCall: 0, gagal: 0, tertahan: 0,
              token: { input: 0, output: 0, cacheBaca: 0, cacheTulis: 0 },
              proyekTeratas: d.proyek[0] ? d.proyek[0].nama : '', toolTeratas: null };
  const tool = {};
  for (const p of d.proyek) {
    r.toolCall += p.toolCall; r.gagal += p.gagal;
    for (const k of ['input', 'output', 'cacheBaca', 'cacheTulis']) r.token[k] += p.token[k] || 0;
    for (const [nama, n] of Object.entries(p.campuranTool || {})) tool[nama] = (tool[nama] || 0) + n;
  }
  for (const s of d.sesi) r.tertahan += s.tertahan || 0;
  const t = Object.entries(tool).sort((a, b) => b[1] - a[1])[0];
  if (t) r.toolTeratas = { nama: t[0], jumlah: t[1] };
  return r;
}

function skpBarisProyek(p, i) {
  const gagalKelas = p.rasioGagal >= 20 ? ' gagal-tinggi' : '';
  return '<tr>' + (i != null ? '<td class="angka">' + (i + 1) + '</td>' : '')
    + '<td class="nama" title="' + esc(p.nama) + '">' + esc(p.nama) + '</td>'
    + '<td class="angka">' + p.sesi + '</td>'
    + '<td class="angka">' + angkaID(p.toolCall) + '</td>'
    + '<td class="angka' + gagalKelas + '">' + p.gagal + (p.toolCall ? ' (' + p.rasioGagal.toLocaleString('id-ID') + '%)' : '') + '</td>'
    + '<td class="angka">' + skpDurasi(p.durasiRata) + '</td>'
    + '<td class="angka">' + angkaID(p.token.input) + ' / ' + angkaID(p.token.output) + '</td>'
    + '<td class="angka">' + jamDinasTeks(p.jamDinasRentang || 0) + '</td>'
    + '<td class="angka">' + jamDinasTeks(p.jamDinas || 0) + '</td>'
    + '<td>' + esc(p.golongan || '') + '</td></tr>';
}
const SKP_KEPALA_PROYEK = '<th>proyek</th><th class="angka">sesi</th><th class="angka">tool call</th>'
  + '<th class="angka">gagal</th><th class="angka">durasi rata</th><th class="angka">token masuk / keluar</th>'
  + '<th class="angka">jam dinas (rentang)</th><th class="angka">jam dinas (karier)</th><th>golongan</th>';

function skpBarisSesi(s, i) {
  return '<tr>' + (i != null ? '<td class="angka">' + (i + 1) + '</td>' : '')
    + '<td class="nama">' + esc(s.sesi) + '</td>'
    + '<td>' + esc(s.proyek) + (s.cabang ? '@' + esc(s.cabang) : '') + '</td>'
    + '<td>' + esc(skpJamTgl(s.mulai)) + ' – ' + esc(skpJamTgl(s.selesai)) + '</td>'
    + '<td class="angka">' + angkaID(s.toolCall) + '</td>'
    + '<td class="angka' + (s.gagal ? ' gagal-tinggi' : '') + '">' + s.gagal + '</td>'
    + '<td class="angka">' + s.tertahan + '</td>'
    + '<td>' + (s.toolTeratas ? esc(s.toolTeratas.nama) + ' ×' + s.toolTeratas.jumlah : '–') + '</td></tr>';
}
const SKP_KEPALA_SESI = '<th>sesi</th><th>proyek@cabang</th><th>mulai – selesai</th><th class="angka">tool call</th>'
  + '<th class="angka">gagal</th><th class="angka">tertahan</th><th>tool teratas</th>';

function skpGambar() {
  const d = skpData;
  const r = skpRentang(skpHari);
  const blok = ['<div class="skp-kepala"><span class="skp-rentang">'
    + SKP_HARI.map((h) => '<button type="button" data-hari="' + h + '"'
        + (h === skpHari ? ' class="aktif"' : '') + '>' + h + ' hari</button>').join('')
    + '</span><span class="isi">' + esc(labelTanggal(r.dari)) + ' – ' + esc(labelTanggal(r.sampai))
    + ' · <b>angka sejak dipantau</b>' + (skpMemuat ? ' · memuat…' : '') + '</span>'
    + '<button type="button" class="skp-cetak" id="skpCetak" title="buka nota dinas laporan mingguan di tab baru, lalu Ctrl+P">'
    + '🖨️ Cetak nota mingguan</button></div>'];
  if (!d) {
    blok.push('<p class="stat-ket">' + (skpMemuat ? 'memuat papan SKP…' : 'papan SKP belum bisa dimuat — server lokal mungkin sedang restart.') + '</p>');
    skpBadan.innerHTML = blok.join('');
    return;
  }
  const g = skpRingkas(d);
  blok.push('<div class="stat-ringkas">'
    + '<div><b>' + g.sesi + '</b><span>sesi</span></div>'
    + '<div><b>' + angkaID(g.toolCall) + '</b><span>tool call</span></div>'
    + '<div><b>' + angkaID(g.token.input + g.token.output) + '</b><span>token masuk+keluar</span></div>'
    + '<div><b>' + g.tertahan + '</b><span>kali tertahan</span></div>'
    + '</div>');
  blok.push('<div class="stat-blok"><h3>per proyek (' + d.proyek.length + ')</h3><div class="skp-gulir">'
    + '<table class="skp-tabel"><thead><tr>' + SKP_KEPALA_PROYEK + '</tr></thead><tbody>'
    + (d.proyek.length ? d.proyek.map((p) => skpBarisProyek(p)).join('')
      : '<tr class="kosong"><td colspan="9">belum ada yang tercatat di rentang ini</td></tr>')
    + '</tbody></table></div></div>');
  blok.push('<div class="stat-blok"><h3>per sesi (' + d.sesi.length + ')</h3><div class="skp-gulir">'
    + '<table class="skp-tabel"><thead><tr>' + SKP_KEPALA_SESI + '</tr></thead><tbody>'
    + (d.sesi.length ? d.sesi.slice(0, 60).map((s) => skpBarisSesi(s)).join('')
      : '<tr class="kosong"><td colspan="7">belum ada sesi di rentang ini</td></tr>')
    + '</tbody></table></div>'
    + (d.sesi.length > 60 ? '<p class="stat-ket">' + (d.sesi.length - 60) + ' sesi lain tidak ditampilkan — ada di nota cetak (maks 30) dan /skp.</p>' : '')
    + '</div>');
  blok.push('<p class="stat-ket">angka <b>sejak dipantau</b> — dijumlah dari buku agenda (tool call, gagal, durasi, tertahan),'
    + ' riwayat token, dan buku induk. Jam dinas (karier) dan golongan milik seluruh karier proyek, bukan cuma rentang ini.'
    + ' Token bukan biaya: tidak ada tabel harga di sini.'
    + (d.cache ? ' Dihitung ' + jam(d.dihitung).slice(0, 5) + ', cache 30 detik.' : '') + '</p>');
  skpBadan.innerHTML = blok.join('');
}

function statsTabPilih(nama) {
  statsTabAktif = nama === 'skp' ? 'skp' : 'token';
  for (const b of statsTab.querySelectorAll('button[data-tab]')) b.classList.toggle('aktif', b.dataset.tab === statsTabAktif);
  statsBadan.hidden = statsTabAktif !== 'token';
  skpBadan.hidden = statsTabAktif !== 'skp';
  dlgStats.querySelector('.dlg').classList.toggle('skp-lebar', statsTabAktif === 'skp');
  if (statsTabAktif === 'skp') { skpGambar(); muatSkp(); }
}
statsTab.onclick = (e) => {
  const b = e.target && e.target.closest ? e.target.closest('button[data-tab]') : null;
  if (b) statsTabPilih(b.dataset.tab);
};
skpBadan.onclick = (e) => {
  const b = e.target && e.target.closest ? e.target.closest('button') : null;
  if (!b) return;
  if (b.dataset.hari) muatSkp(Number(b.dataset.hari));
  else if (b.id === 'skpCetak') bukaNotaMingguan();
};
// Modal dibuka lagi saat tab SKP yang terakhir aktif: segarkan datanya juga,
// seperti muatRiwayatToken() untuk tab Token. Pembuka aslinya tidak diubah.
const statsBukaAsli = statsBtn.onclick;
statsBtn.onclick = () => {
  statsBukaAsli();
  if (!dlgStats.hidden && statsTabAktif === 'skp') muatSkp();
};

/* --------------------------------------------- nota dinas laporan mingguan ---
   Satu halaman HTML mandiri (inline CSS, @media print, tanpa pustaka) yang
   dibuka di tab baru dari tombol 🖨️ — PDF-nya lewat Ctrl+P / "Simpan sebagai
   PDF" bawaan browser, bukan pustaka PDF. Datanya /skp yang sama dengan tab.
   `?cetak=mingguan` di URL halaman utama membuka lembar yang sama sebagai
   lapisan iframe di atas ruangan dan memanggil print() begitu datanya ada —
   supaya bisa dijadwalkan (mis. chrome --kiosk-printing). */
const BULAN_ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
/* Nomor ala tata naskah dinas: kode/urut/unit/bulan romawi/tahun. Urutnya
   penghitung per browser (localStorage): nomor terbit saat nota dicetak,
   bukan saat tabelnya dilihat — dua kali cetak, dua nomor. */
function nomorNota(kode = 'ND') {
  const d = new Date();
  let urut = 1;
  try {
    urut = (Number(localStorage.getItem('agentRoomNotaUrut')) || 0) + 1;
    localStorage.setItem('agentRoomNotaUrut', String(urut));
  } catch { urut = d.getDate() * 100 + d.getHours(); }
  return kode + '/' + String(urut).padStart(3, '0') + '/AR/' + BULAN_ROMAWI[d.getMonth()] + '/' + d.getFullYear();
}

const NOTA_SESI_MAX = 30;
function notaMingguanHTML(d, nomor) {
  const g = skpRingkas(d);
  const rt = d.rentang;
  const kosong = !d.proyek.length && !d.sesi.length;
  const tok = (t) => angkaID(t.input) + ' masuk / ' + angkaID(t.output) + ' keluar'
    + (t.cacheBaca || t.cacheTulis ? ' (cache ' + angkaID(t.cacheBaca) + ' baca / ' + angkaID(t.cacheTulis) + ' tulis)' : '');
  const meta = [
    ['Nomor', nomor], ['Sifat', 'BIASA'], ['Lampiran', '–'], ['Perihal', 'Laporan kinerja mingguan'],
  ].map(([k, v]) => '<tr><td>' + k + '</td><td>:</td><td>' + esc(v) + '</td></tr>').join('');
  const ringkas = [
    ['Sesi aktif', String(g.sesi)],
    ['Tool call', angkaID(g.toolCall) + (g.gagal ? ' (' + g.gagal + ' gagal)' : '')],
    ['Token', tok(g.token)],
    ['Proyek teratas', g.proyekTeratas || '–'],
    ['Tool teratas', g.toolTeratas ? g.toolTeratas.nama + ' ×' + g.toolTeratas.jumlah : '–'],
    ['Sesi tertahan', g.tertahan + ' kali (minta izin / berhenti karena galat)'],
  ].map(([k, v]) => '<tr><td>' + k + '</td><td>:</td><td>' + esc(v) + '</td></tr>').join('');
  const sesiCetak = d.sesi.slice(0, NOTA_SESI_MAX);
  return '<!doctype html><html lang="id"><head><meta charset="utf-8">'
    + '<title>Nota Dinas ' + esc(nomor) + ' — Laporan kinerja mingguan</title>'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<style>'
    + 'body{margin:0;background:#6f6a60;color:#111;font:12px/1.45 "Times New Roman",Georgia,"Iowan Old Style",serif}'
    + '.bilah{position:sticky;top:0;z-index:2;background:#2b2416;color:#f3edda;padding:6px 12px;font:12px system-ui,sans-serif;display:flex;gap:8px;align-items:center}'
    + '.bilah span{flex:1}.bilah button{font:inherit;padding:3px 10px;cursor:pointer;background:#f3edda;color:#2b2416;border:1px solid #a89a70;border-radius:3px}'
    + '.kertas{background:#fff;max-width:210mm;box-sizing:border-box;margin:16px auto;padding:18mm 20mm;box-shadow:0 2px 14px rgba(0,0,0,.45)}'
    + '.kop{text-align:center;border-bottom:3px double #111;padding-bottom:6px;margin-bottom:14px}'
    + '.kop small{display:block;font-size:11px;letter-spacing:.1em}.kop b{display:block;font-size:18px;letter-spacing:.12em}'
    + '.kop i{display:block;font-size:10px;color:#444;font-style:normal}'
    + 'h1{text-align:center;font-size:15px;letter-spacing:.16em;margin:0 0 10px;text-decoration:underline}'
    + 'table.meta{border-collapse:collapse;margin-bottom:10px}table.meta td{padding:1px 6px 1px 0;vertical-align:top}'
    + 'table.meta td:first-child{width:92px}'
    + 'h2{font-size:12px;margin:14px 0 4px;letter-spacing:.06em;text-transform:uppercase}'
    + 'p{margin:6px 0;text-align:justify}'
    + 'table.data{border-collapse:collapse;width:100%;margin:4px 0 8px;font-size:10.5px}'
    + 'table.data th,table.data td{border:1px solid #333;padding:3px 5px;vertical-align:top}'
    + 'table.data th{background:#eee;font-weight:700;text-align:left}'
    + 'table.data td.angka,table.data th.angka{text-align:right;font-variant-numeric:tabular-nums}'
    + 'table.data td.nama{word-break:break-all}table.data tr.kosong td{text-align:center;font-style:italic;color:#555}'
    + '.catatan{font-size:10.5px;color:#333;border-top:1px solid #999;padding-top:6px;margin-top:10px}'
    + '.ttd{margin-top:26px;display:flex;justify-content:flex-end;page-break-inside:avoid}'
    + '.ttd div{text-align:center;min-width:210px}.ttd .ruang{height:52px}.ttd b{display:block;text-decoration:underline}'
    + '@media print{body{background:#fff}.bilah{display:none}.kertas{box-shadow:none;margin:0;padding:0;max-width:none}'
    + '@page{size:A4;margin:18mm 20mm}table.data{page-break-inside:auto}tr{page-break-inside:avoid}}'
    + '</style></head><body>'
    + '<div class="bilah"><span>Nota dinas ' + esc(nomor) + ' — Ctrl+P atau tombol di kanan untuk mencetak / menyimpan PDF</span>'
    + '<button type="button" onclick="window.print()">🖨️ Cetak</button></div>'
    + '<div class="kertas">'
    + '<div class="kop"><small>PEMERINTAH KANTOR DINAS</small><b>AGENT ROOM</b>'
    + '<i>Sekretariat Notulis · ' + esc(location.host || 'localhost') + '</i></div>'
    + '<h1>NOTA DINAS</h1>'
    + '<table class="meta">' + meta + '</table>'
    + '<table class="meta"><tr><td>Yth.</td><td>:</td><td>Kepala Dinas</td></tr>'
    + '<tr><td>Dari</td><td>:</td><td>Notulis Agent Room</td></tr>'
    + '<tr><td>Tanggal</td><td>:</td><td>' + esc(tanggalID(Date.now())) + '</td></tr>'
    + '<tr><td>Rentang</td><td>:</td><td>' + esc(skpTanggal(rt.dari)) + ' s.d. ' + esc(skpTanggal(rt.sampai))
    + ' (' + rt.hari + ' hari)</td></tr></table>'
    + '<p>Dengan hormat, bersama ini disampaikan laporan kinerja pegawai (sesi Claude Code) yang tercatat di ruangan'
    + ' selama rentang tersebut, dihimpun dari buku agenda, riwayat token, dan buku induk pegawai.'
    + (kosong ? ' <b>Selama rentang ini tidak ada sesi maupun tool call yang tercatat</b> — laporan nihil, disampaikan apa adanya.' : '')
    + '</p>'
    + '<h2>I. Ringkasan</h2><table class="meta">' + ringkas + '</table>'
    + '<h2>II. Kinerja per proyek</h2>'
    + '<table class="data"><thead><tr><th class="angka">No</th>' + SKP_KEPALA_PROYEK + '</tr></thead><tbody>'
    + (d.proyek.length ? d.proyek.map((p, i) => skpBarisProyek(p, i)).join('')
      : '<tr class="kosong"><td colspan="10">nihil</td></tr>')
    + '</tbody></table>'
    + '<h2>III. Kinerja per sesi' + (d.sesi.length > NOTA_SESI_MAX ? ' (' + NOTA_SESI_MAX + ' dari ' + d.sesi.length + ')' : '') + '</h2>'
    + '<table class="data"><thead><tr><th class="angka">No</th>' + SKP_KEPALA_SESI + '</tr></thead><tbody>'
    + (sesiCetak.length ? sesiCetak.map((s, i) => skpBarisSesi(s, i)).join('')
      : '<tr class="kosong"><td colspan="8">nihil</td></tr>')
    + '</tbody></table>'
    + (d.sesi.length > NOTA_SESI_MAX ? '<p><i>' + (d.sesi.length - NOTA_SESI_MAX) + ' sesi lainnya tidak dicetak; lengkapnya di /skp.</i></p>' : '')
    + '<h2>IV. Catatan</h2>'
    + '<p class="catatan">Seluruh angka dihitung <b>sejak dipantau</b> — sesi yang berjalan sebelum ruangan dibuka tidak punya'
    + ' catatan dari jam itu. Token adalah jumlah token resmi dari respons API, <b>bukan biaya</b>: tidak ada tabel harga di'
    + ' laporan ini. Jam dinas (karier) dan golongan milik seluruh karier proyek di buku induk, bukan cuma rentang laporan.'
    + ' Demikian disampaikan, atas perhatiannya diucapkan terima kasih.</p>'
    + '<div class="ttd"><div>' + esc(tanggalID(Date.now())) + '<br>Notulis,<div class="ruang"></div><b>Agent Room</b>'
    + '<span>Sekretariat Notulis</span></div></div>'
    + '</div></body></html>';
}

/* Tab baru dibuka DULU (masih di dalam klik, supaya tidak diblokir), datanya
   menyusul: kalau /skp belum ada di memori, ditunggu, baru notanya ditulis. */
async function bukaNotaMingguan() {
  let w = null;
  try { w = window.open('', '_blank'); } catch { w = null; }
  if (!w) {
    // pop-up diblokir: notanya tetap bisa dibaca & dicetak lewat lapisan iframe
    // di atas ruangan (tanpa print() otomatis — yang minta cetak tetap orangnya)
    const d = skpData || await muatSkp();
    if (d) notaCetakLapis(notaMingguanHTML(d, nomorNota()), false);
    else console.warn('[nota] /skp belum bisa dimuat — server lokal mungkin sedang restart.');
    return null;
  }
  try {
    w.document.write('<!doctype html><title>Nota dinas mingguan</title>'
      + '<p style="font:14px Georgia,serif;padding:24px">menyusun nota dinas…</p>');
  } catch { /* dokumen sementara gagal — nota tetap ditulis di bawah */ }
  const d = skpData || await muatSkp();
  if (!d) {
    try { w.document.body.innerHTML = '<p style="font:14px Georgia,serif;padding:24px">/skp belum bisa dimuat — server lokal mungkin sedang restart.</p>'; } catch {}
    return w;
  }
  const html = notaMingguanHTML(d, nomorNota());
  w.document.open(); w.document.write(html); w.document.close();
  return w;
}

let notaCetakJumlah = 0;                 // berapa kali print() dipanggil dari ?cetak=mingguan (dibaca uji)
function notaCetakPanggil(win) {
  notaCetakJumlah++;
  try { win.focus(); win.print(); } catch (err) { console.warn('[nota] print() gagal: ' + err.message); }
}
function notaCetakLapis(html, cetakOtomatis = true) {
  const lapis = document.createElement('div');
  lapis.className = 'nota-cetak-lapis';
  lapis.innerHTML = '<div class="bilah"><b>Nota dinas laporan mingguan</b><span style="flex:1">'
    + (cetakOtomatis ? 'dibuka lewat ?cetak=mingguan — dialog cetak dipanggil otomatis'
      : 'tab baru diblokir browser, notanya dibuka di sini — cetak lewat tombol di kanan')
    + '</span><button type="button" id="notaCetakUlang">🖨️ Cetak</button>'
    + '<button type="button" id="notaCetakTutup">✕ tutup</button></div><iframe title="nota dinas laporan mingguan"></iframe>';
  const frame = lapis.querySelector('iframe');
  document.body.appendChild(lapis);
  if (cetakOtomatis) frame.onload = () => notaCetakPanggil(frame.contentWindow);
  frame.srcdoc = html;
  lapis.querySelector('#notaCetakUlang').onclick = () => notaCetakPanggil(frame.contentWindow);
  lapis.querySelector('#notaCetakTutup').onclick = () => lapis.remove();
  return lapis;
}
{
  const q = new URLSearchParams(location.search);
  if (q.get('cetak') === 'mingguan') {
    muatSkp(Number(q.get('hari'))).then((d) => {
      if (!d) { console.warn('[nota] ?cetak=mingguan: /skp tidak terjangkau, nota tidak dibuka'); return; }
      document.title = 'Nota dinas mingguan — Kantor Agent';
      notaCetakLapis(notaMingguanHTML(d, nomorNota()));
    });
  }
}

/* ---------------------------------------------------- kliping mingguan --- *
 * Map arsip yang makin tebal tiap minggu (RUANGAN.arsipKlipingLembar,
 * digambar di drawArsip() — lihat komentarnya di sana). Mirror 1:1 blok
 * statistik token di atas: sama-sama modal + tombol toolbar + fetch ulang
 * tiap dibuka. */
const dlgKliping = document.getElementById('dlgKliping');
const klipingBadan = document.getElementById('klipingBadan');

let arsipKliping = null;
async function muatArsipKliping() {
  try {
    const r = await fetch('/kliping-mingguan');
    arsipKliping = await r.json();
    // prop di ruangan ikut data server sejak halaman dimuat, bukan cuma
    // begitu modalnya dibuka
    RUANGAN.arsipKlipingLembar = arsipKliping.lembar || 0;
  } catch { /* server lokal lagi restart — modal berikutnya coba lagi */ }
  if (!dlgKliping.hidden) klipingGambar();
}
muatArsipKliping();

function labelMinggu(senin) {
  const awal = new Date(senin + 'T00:00:00');
  const akhir = new Date(awal);
  akhir.setDate(akhir.getDate() + 6);
  const opt = { day: 'numeric', month: 'short' };
  return awal.toLocaleDateString('id-ID', opt) + '–' + akhir.toLocaleDateString('id-ID', opt);
}

function klipingKartu(m, aktif) {
  if (!m) return '';
  const baris = ['<span class="kk">sesi aktif</span><span class="vv">' + m.sesi + '</span>'];
  if (m.toolTeratas) {
    baris.push('<span class="kk">tool</span><span class="vv">'
      + esc(m.toolTeratas.nama) + ' ×' + m.toolTeratas.jumlah + '</span>');
  }
  if (m.proyekTeratas) {
    baris.push('<span class="kk">proyek</span><span class="vv">'
      + esc(m.proyekTeratas.nama) + ' ×' + m.proyekTeratas.jumlah + '</span>');
  }
  // "Laporan nihil" apa adanya kalau memang tidak ada — ambient event murni
  // simulasi client-side, jadi kalau tidak ada tab yang terbuka minggu itu,
  // memang tidak ada yang tercatat. Itu bukan cacat yang perlu ditutupi.
  baris.push('<span class="kk">terjarang</span><span class="vv">'
    + (m.ambienTerjarang
      ? esc(m.ambienTerjarang.id) + ' ×' + m.ambienTerjarang.jumlah
      : 'tidak ada kejadian langka tercatat minggu ini')
    + '</span>');
  return '<div class="kartu-info kliping-kartu">'
    + '<h3>' + esc(labelMinggu(m.minggu)) + (aktif ? ' <span class="kliping-tag">belum dijilid</span>' : '') + '</h3>'
    + baris.join('') + '</div>';
}

function klipingGambar() {
  const k = arsipKliping;
  if (!k) { klipingBadan.innerHTML = '<p class="stat-ket">memuat…</p>'; return; }
  const blok = [klipingKartu(k.berjalan, true)];
  if (k.arsip && k.arsip.length) {
    blok.push('<div class="stat-blok"><h3>arsip</h3>'
      + [...k.arsip].reverse().map((m) => klipingKartu(m, false)).join('') + '</div>');
  } else {
    blok.push('<p class="stat-ket">belum ada minggu yang dijilid — kembali lagi minggu depan.</p>');
  }
  klipingBadan.innerHTML = blok.join('');
}

function klipingTutupDialog() {
  dlgKliping.hidden = true;
  document.removeEventListener('keydown', klipingTombol);
}
function klipingTombol(e) { if (e.key === 'Escape') { e.preventDefault(); klipingTutupDialog(); } }

klipingBtn.onclick = () => {
  if (!dlgKliping.hidden) { klipingTutupDialog(); return; }
  klipingGambar();
  muatArsipKliping();
  dlgKliping.hidden = false;
  document.addEventListener('keydown', klipingTombol);
};
document.getElementById('klipingTutup').onclick = klipingTutupDialog;
dlgKliping.onclick = (e) => { if (e.target === dlgKliping) klipingTutupDialog(); };

/* ------------------------------------------------------------------ kamera */
/* Kamera hidup, sengaja dipisah dari fit(). fit() cuma mengurus skala integer
   kanvas→CSS (itu urusan piksel layar); kamera bekerja di koordinat dunia
   480×356 dan dipasang di frame() lewat setTransform SEBELUM segala gambar,
   jadi lantai/dinding/props/pegawai/partikel tidak perlu tahu ada kamera.

   Zoom bidikannya cuma 1 atau 2 — bulat — supaya satu piksel dunia tetap
   jadi kotak piksel layar yang utuh (imageSmoothingEnabled=false tidak bisa
   menolong kalau zoomnya 1,37). Nilai pecahan hanya lewat sebentar selagi
   easing (~600 ms), lalu dijepret ke bulat. Geserannya (tx/ty) juga dibulatkan
   ke piksel kanvas dengan alasan yang sama.

   Segala yang menempel ke kanvas dari DOM — balon ucap, balon pikiran, lencana
   galat, kartu pegawai — dan hit-test klik memakai SATU pasang fungsi,
   keLayar()/dariLayar(). Dulu semuanya menghitung `offX + x * scale` sendiri-
   sendiri; begitu ada kamera, satu saja yang lupa dan kartunya meleset dari
   orangnya. Satu fungsi = satu tempat yang harus benar.

   Mode (setelan ⚙️, diingat localStorage; ?kamera=ikut|sinematik|mati di URL
   mengalahkannya). Bawaannya MATI: halaman ini alat pantau dulu, baru
   tontonan — kamera yang bergerak sendiri mengejutkan orang yang cuma mau
   melirik siapa yang sedang macet. */
const KAMERA = {
  x: W / 2, y: H / 2, zoom: 1,                       // yang sedang tampil (di-ease)
  targetX: W / 2, targetY: H / 2, targetZoom: 1,     // bidikan
  tx: 0, ty: 0,                                      // geseran kanvas (px bulat), dihitung tickKamera
  mode: 'mati',                                      // mati | ikut | sinematik
  aktif: new Map(),                                  // session → `now` tool call terakhir (mode ikut)
  sinematikIdx: -1, sinematikSejak: 0,
  mulai: performance.now(),                          // jam mulai hitung "60 s tanpa event"
};
const KAMERA_IKUT_TAHAN_MS = 4000;          // tahan bidikan sejak tool call terakhir
const KAMERA_SINEMATIK_DIAM_MS = 60000;     // tanpa event selama ini → berkeliling
const KAMERA_SINEMATIK_PINDAH_MS = 8000;    // lama singgah per stasiun
const KAMERA_LAJU = 5;                      // lerp/detik: ~600 ms sampai 95% jalan
// urutan keliling tetap: searah jarum jam dari lemari arsip, berakhir di ruang tunggu
const KAMERA_RUTE = ['read', 'search', 'web', 'edit', 'server', 'agent', 'rapat', 'think', 'idle'];
const geraKurang = matchMedia('(prefers-reduced-motion: reduce)');
const kameraSinematikBoleh = () => !geraKurang.matches;

// titik dunia → px CSS relatif stageInner (yang dipakai DOM di overlay)
function keLayar(x, y) {
  return [offX + (x * KAMERA.zoom + KAMERA.tx) * scale,
          offY + (y * KAMERA.zoom + KAMERA.ty) * scale];
}
// px kanvas (sudah dibagi scale) → titik dunia; kebalikan setTransform di frame()
function dariLayar(cx, cy) {
  return [(cx - KAMERA.tx) / KAMERA.zoom, (cy - KAMERA.ty) / KAMERA.zoom];
}
// masih di dalam bidikan (plus sedikit tepi)? Balon pegawai yang di luar
// bidikan disembunyikan — jagaBingkai() akan menariknya ke tepi panggung
// dan dia jadi balon tanpa orang.
function kameraTampak(x, y) {
  if (KAMERA.zoom === 1) return true;
  const hw = W / (2 * KAMERA.zoom) + 6, hh = H / (2 * KAMERA.zoom) + 6;
  return Math.abs(x - KAMERA.x) <= hw && Math.abs(y - KAMERA.y) <= hh;
}

function kameraBidikPenuh() {
  KAMERA.targetX = W / 2; KAMERA.targetY = H / 2; KAMERA.targetZoom = 1;
}
// pusat bidikan = pegawai + sedikit ke arah stasiunnya: yang menghadap meja
// (up) dibidik agak ke atas supaya mejanya ikut masuk, yang menghadap
// penonton (down: kursi rapat sisi jauh, ruang tunggu) agak ke bawah
function kameraKe(a) {
  KAMERA.targetX = a.x;
  KAMERA.targetY = a.y + (a.hadap === 'down' ? 6 : -14);
  KAMERA.targetZoom = 2;
}
function kameraBidik() {
  const K = KAMERA;
  /* SATU-SATUNYA sentuhan blok kamera dari bukaan ruang kadis. Gerbangnya
     harus paling awal: kameraBidik() dipanggil tiap frame dari tickKamera()
     dan akan menimpa bidikan klik kalau ditaruh di bawah. Penjepitan
     tickKamera tetap sahih — pusat bukaan (342,69) dengan zoom 4 memberi
     setengah bidikan 60x44,5 yang tidak menabrak batas mana pun. */
  if (RUANG_KADIS.zoom) { sisipBidik(); return; }
  if (K.mode === 'ikut') {
    // satu pegawai aktif → ikuti; dua atau lebih → tampak penuh, jangan
    // bolak-balik antar orang tiap tool call datang
    const batas = now - KAMERA_IKUT_TAHAN_MS;
    let satu = null, n = 0;
    for (const [id, t] of K.aktif) {
      const a = agents.get(id);
      if (t < batas || !a) { K.aktif.delete(id); continue; }
      n++; satu = a;
    }
    if (n === 1) kameraKe(satu); else kameraBidikPenuh();
    return;
  }
  if (K.mode === 'sinematik' && kameraSinematikBoleh()) {
    // window.KAMERA_UJI_MS: memendekkan 60 detiknya waktu diuji
    const diam = window.KAMERA_UJI_MS || KAMERA_SINEMATIK_DIAM_MS;
    const pindah = window.KAMERA_UJI_PINDAH_MS || KAMERA_SINEMATIK_PINDAH_MS;
    if (now - Math.max(toolTerakhir, K.mulai) < diam) {
      K.sinematikIdx = -1;               // ada kegiatan: mundur, keliling ulang dari awal nanti
      kameraBidikPenuh();
      return;
    }
    if (K.sinematikIdx < 0 || now - K.sinematikSejak > pindah) {
      K.sinematikIdx = (K.sinematikIdx + 1) % KAMERA_RUTE.length;
      K.sinematikSejak = now;
    }
    const s = STATIONS[KAMERA_RUTE[K.sinematikIdx]];
    K.targetX = s.x; K.targetY = s.y - 12; K.targetZoom = 2;
    return;
  }
  kameraBidikPenuh();
}
function tickKamera(dt) {
  const K = KAMERA;
  kameraBidik();
  // prefers-reduced-motion: tanpa easing, langsung ke bidikan
  const k = geraKurang.matches ? 1 : Math.min(1, Math.max(0, dt) * KAMERA_LAJU);
  K.zoom += (K.targetZoom - K.zoom) * k;
  K.x += (K.targetX - K.x) * k;
  K.y += (K.targetY - K.y) * k;
  if (Math.abs(K.targetZoom - K.zoom) < 0.01) K.zoom = K.targetZoom;   // jepret ke bulat
  if (Math.abs(K.targetX - K.x) < 0.05) K.x = K.targetX;
  if (Math.abs(K.targetY - K.y) < 0.05) K.y = K.targetY;
  // dijepit: bidikan tidak boleh melihat di luar ruangan. Pada zoom 1 ini
  // memaksa pusatnya ke tengah, jadi pan & zoom selalu bertemu di tampak penuh.
  const hw = W / (2 * K.zoom), hh = H / (2 * K.zoom);
  K.x = Math.max(hw, Math.min(W - hw, K.x));
  K.y = Math.max(hh, Math.min(H - hh, K.y));
  K.tx = Math.round(W / 2 - K.x * K.zoom);
  K.ty = Math.round(H / 2 - K.y * K.zoom);
}
function kameraSet(mode) {
  KAMERA.mode = mode === 'ikut' || mode === 'sinematik' ? mode : 'mati';
  KAMERA.sinematikIdx = -1;
  KAMERA.mulai = performance.now();
}
{
  const dariUrl = new URLSearchParams(location.search).get('kamera');
  kameraSet(dariUrl || ingatan.baca('kamera', 'mati'));
}

/* ------------------------------------------------------------ mode ringan ---
   Halaman ini biasanya dibiarkan hidup berjam-jam di layar kedua atau laptop;
   60 fps dengan tujuh gradasi radial per frame itu boros buat ruangan yang
   isinya cuma berubah pelan. Mode ringan (setelan ⚙️, diingat) mengunci
   30 fps, 15 fps saat tab tersembunyi, mengambil pendar neon & vignette dari
   cache, memangkas jatah partikel separuh, dan mematikan debu. Menyala
   sendiri kalau baterai <30 % tanpa dicas (Battery API — opsional, aman
   kalau tidak ada), ?ringan=1 di URL, atau prefers-reduced-motion. Kedip neon
   TIDAK dimatikan: itu identitas ruangan, bukan hiasan. */
const RINGAN = {
  pilih: ingatan.baca('ringan', '0') === '1',                          // centang ⚙️
  url: new URLSearchParams(location.search).get('ringan') === '1',    // sesi ini saja
  baterai: false,                                                     // tidak dicas & <30 %
};
const ringanAktif = () => RINGAN.pilih || RINGAN.url || RINGAN.baterai || geraKurang.matches;
const ringanSebab = () => RINGAN.pilih ? 'setelan' : RINGAN.url ? '?ringan=1'
  : RINGAN.baterai ? 'baterai lemah' : geraKurang.matches ? 'gerak dikurangi' : '';
// Battery API opsional; di peramban tanpa itu (dan di VM uji-event.mjs yang
// navigator-nya stub) harus lewat tanpa suara
try {
  const janji = typeof navigator.getBattery === 'function' ? navigator.getBattery() : null;
  if (janji && typeof janji.then === 'function') {
    janji.then((b) => {
      const cek = () => { RINGAN.baterai = !b.charging && b.level < 0.3; };
      cek();
      b.addEventListener('chargingchange', cek);
      b.addEventListener('levelchange', cek);
    }).catch(() => {});
  }
} catch { /* tidak ada baterai untuk dipantau */ }
// fps sebenarnya (frame yang benar-benar digambar), cuma dihitung; ditulis
// ke panel ⚙️ hanya waktu panelnya terbuka
let fpsHitung = 0, fpsSejak = performance.now(), fpsNilai = 0;
function catatFps(ts) {
  fpsHitung++;
  if (ts - fpsSejak < 1000) return;
  fpsNilai = Math.round(fpsHitung * 1000 / (ts - fpsSejak));
  fpsHitung = 0; fpsSejak = ts;
  if (typeof tulisFps === 'function') tulisFps();
}

/* ------------------------------------------------------------- pengaturan ---
   Satu tombol ⚙️ menggantikan tombol-tombol toggle yang dulu berjejer di
   bilah panggung (💭🔊🔔🎧) plus centang "buka sendiri" yang tadinya cuma
   ada di kaki modal kabar — satu tempat, bukan disebar. Bagian "status
   server" cuma ditampilkan, tidak bisa diubah dari sini: port/host/cuaca/isi
   transkrip ditentukan sekali waktu server dinyalakan (lihat DESIGN.md §
   Konfigurasi), jadi panel ini murni membaca `kendali` (dari /kendali) dan
   `CUACA` yang sudah dimuat di tempat lain. */
const dlgSetting = document.getElementById('dlgSetting');
const settingBtn = document.getElementById('settingBtn');
const settingInfo = document.getElementById('settingInfo');
const setBalonPikir = document.getElementById('setBalonPikir');
const setKabarOtomatis = document.getElementById('setKabarOtomatis');
const setSuara = document.getElementById('setSuara');
const setNotif = document.getElementById('setNotif');
const setMusik = document.getElementById('setMusik');

function balonPikirSet(v) {
  balonPikir = v;
  ingatan.tulis('balonPikir', balonPikir ? '1' : '0');
  setBalonPikir.checked = balonPikir;
  // yang terlanjur menggantung ikut dipadamkan saat itu juga
  if (!balonPikir) for (const a of penghuni()) { a.pikirUntil = 0; a.elPikir.style.display = 'none'; }
}
function kabarOtomatisSet(v) {
  kabarOtomatis = v;
  ingatan.tulis('kabarOtomatis', kabarOtomatis ? '1' : '0');
  kbr.auto.checked = kabarOtomatis;
  setKabarOtomatis.checked = kabarOtomatis;
}
setBalonPikir.checked = balonPikir;
setBalonPikir.onchange = () => balonPikirSet(setBalonPikir.checked);
setKabarOtomatis.checked = kabarOtomatis;
setKabarOtomatis.onchange = () => kabarOtomatisSet(setKabarOtomatis.checked);

/* Kamera: pilihannya diingat; ?kamera= di URL cuma mengalahkan tampilan
   sesi ini, tidak menulis ulang setelan. Sinematik dimatikan kalau penonton
   minta gerak dikurangi — kamera yang berkeliling sendiri persis yang tidak
   diinginkan orang itu. */
const setKamera = document.getElementById('setKamera');
setKamera.value = KAMERA.mode;
if (!kameraSinematikBoleh()) {
  const o = setKamera.querySelector('option[value="sinematik"]');
  if (o) { o.disabled = true; o.textContent += ' (gerak dikurangi)'; }
}
setKamera.onchange = () => { kameraSet(setKamera.value); ingatan.tulis('kamera', KAMERA.mode); };

/* Bukaan ruang kadis (blok "ruang kadis" sesudah drawKadis). 'mati' membuat
   perilakunya persis seperti sebelum fitur ini ada — sakelar, bukan revert.
   ?ruang=kadis / ?ruang=mati mengalahkan tampilan sesi ini tanpa menulis
   ulang setelan, sama polanya dengan ?kamera=. */
const setSisipKadis = document.getElementById('setSisipKadis');
setSisipKadis.value = sisipSetelan();
// ?ruang= mengunci setelannya lewat URL; ?kadis=1 (MODE HP daftar teks)
// membuat sisipBoleh() selalu false, jadi select-nya tidak bisa berpengaruh
// apa pun — biarkan mati, jangan pura-pura bisa dipilih.
if (RUANG_URL || MODE_KADIS) setSisipKadis.disabled = true;
setSisipKadis.onchange = () => { sisipSetel(setSisipKadis.value); ingatan.tulis('sisipKadis', sisipSetelan()); };

// Mode ringan: centangnya = pilihan manual; sebab otomatis (baterai/URL/
// gerak dikurangi) cuma ditulis di keterangan, tidak memaksa centangnya.
const setRingan = document.getElementById('setRingan');
const setFps = document.getElementById('setFps');
setRingan.checked = RINGAN.pilih;
setRingan.onchange = () => { RINGAN.pilih = setRingan.checked; ingatan.tulis('ringan', RINGAN.pilih ? '1' : '0'); tulisFps(); };
function tulisFps() {
  if (dlgSetting.hidden) return;
  const sebab = ringanSebab();
  setFps.textContent = fpsNilai + ' fps' + (sebab && sebab !== 'setelan' ? ' · ringan otomatis: ' + sebab : '');
}

// Tiga di bawah sengaja TIDAK diinisialisasi dari ingatan (localStorage) —
// AudioContext baru boleh jalan sesudah klik pengguna, jadi menyalakan
// otomatis dari setelan lama toh tidak akan kedengaran sampai ada klik lagi.
setSuara.onchange = () => {
  sound = setSuara.checked;
  if (sound) pastikanAudio();
  // derau hujan tidak boleh terus terdengar setelah dimatikan — redam cepat,
  // jangan menunggu tick interval; unmute sebaliknya menyalakan lagi seketika
  if (!sound && hujanAudio) hujanAudio.g.gain.setTargetAtTime(0.0001, audio.currentTime, 0.08);
  if (sound) aturSuaraHujan();
};
setNotif.onchange = () => {
  notifOn = setNotif.checked;
  if (notifOn) pastikanAudio();
};
setMusik.onchange = () => {
  musikNyala = setMusik.checked;
  if (musikNyala) musikNyalakan(); else musikMatikan();
};

/* Pengingat sesi terkatung — boleh diingat browser (bukan bunyi yang menyala
   sendiri, cuma izin untuk menjadwalkan; loncengnya toh tetap menunggu
   AudioContext yang dibuka lewat klik). Izin Notification peramban TIDAK
   diminta waktu halaman dibuka: cuma dari tombol di bawah, sesudah gestur. */
const setPengingat = document.getElementById('setPengingat');
const setNotifPeramban = document.getElementById('setNotifPeramban');
const setNotifPerambanKet = document.getElementById('setNotifPerambanKet');
function pengingatSet(v) {
  pengingatOn = v;
  ingatan.tulis('pengingatTerkatung', v ? '1' : '0');
  setPengingat.checked = v;
  // yang sudah terjadwal ikut dicabut; yang sedang terkatung dijadwalkan dari
  // nol lagi saat dinyalakan — hitungannya mulai dari saat kamu menyalakan
  for (const a of agents.values()) {
    if (!a.terkatungJenis) continue;
    if (v) jadwalkanPengingat(a); else batalkanPengingat(a);
  }
}
function notifPerambanGambar() {
  const izin = 'Notification' in window ? Notification.permission : 'tidak-ada';
  setNotifPerambanKet.textContent =
    izin === 'granted' ? 'diizinkan' :
    izin === 'denied' ? 'ditolak di peramban — ubah lewat ikon gembok' :
    izin === 'default' ? 'belum diminta' : 'peramban ini tidak mendukung';
  setNotifPeramban.disabled = izin !== 'default';
}
setPengingat.checked = pengingatOn;
setPengingat.onchange = () => pengingatSet(setPengingat.checked);
setNotifPeramban.onclick = async () => {
  try { await Notification.requestPermission(); } catch { /* peramban lama pakai callback; abaikan */ }
  notifPerambanGambar();
};
notifPerambanGambar();

/* Volume mixer per komponen — beda dari tiga checkbox di atas: angka 0..1 ini
   BOLEH diingat lewat localStorage, karena cuma pengali relatif dan tidak
   memaksa AudioContext menyala sendiri waktu halaman dibuka lagi (itu tetap
   menunggu klik kamu di salah satu checkbox). Satu fungsi dipakai tiga kali
   supaya baca-dari-ingatan/tulis-ke-ingatan/label persen-nya tidak bisa lupa
   disamakan antar komponen. */
function volumeBaris(komponen, kunci, elInput, elNilai, dapatBus) {
  const terapkan = (v) => {
    VOL[komponen] = v = Math.max(0, Math.min(1, v || 0));
    const bus = dapatBus();
    if (bus) bus.gain.setTargetAtTime(v, audio.currentTime, 0.05);
    elInput.value = v;
    elNilai.textContent = Math.round(v * 100) + '%';
  };
  terapkan(parseFloat(ingatan.baca(kunci, '1')));
  elInput.oninput = () => { terapkan(parseFloat(elInput.value)); ingatan.tulis(kunci, String(VOL[komponen])); };
}
volumeBaris('efek', 'volEfek', document.getElementById('volEfek'),
  document.getElementById('volEfekNilai'), () => busEfek);
volumeBaris('notif', 'volNotif', document.getElementById('volNotif'),
  document.getElementById('volNotifNilai'), () => busNotif);
volumeBaris('musik', 'volMusik', document.getElementById('volMusik'),
  document.getElementById('volMusikNilai'), () => busMusik);

function settingGambarInfo() {
  const baris = [
    '<span class="kk">kendali web</span><span class="vv">'
      + (kendali.izin ? (kendali.siap ? 'nyala' : 'nyala, biner claude belum ketemu') : 'mati')
      + '</span>',
    '<span class="kk">cuaca</span><span class="vv">' + esc(
      CUACA.sumber.startsWith('cuaca') ? 'nyata' + (CUACA.sumber.length > 5 ? ' (' + CUACA.sumber.slice(6) + ')' : '')
      : CUACA.sumber === 'paksa' ? 'dipaksa lewat URL'
      : CUACA.sumber === 'sesekali' ? 'tebakan (cek cuaca gagal/mati)'
      : 'menunggu') + '</span>',
  ];
  if ('isiAktif' in kendali) {
    baris.push('<span class="kk">isi transkrip</span><span class="vv">'
      + (kendali.isiAktif ? 'nyala' : 'mati (AGENT_ROOM_ISI=off)') + '</span>');
  }
  if (kendali.host && kendali.port) {
    baris.push('<span class="kk">alamat</span><span class="vv"><code>'
      + esc(kendali.host) + ':' + esc(String(kendali.port)) + '</code></span>');
  }
  if (PANGGUNG) {
    baris.push('<span class="kk">mode panggung</span><span class="vv">aktif — isi balon/kabar disamarkan</span>');
  }
  settingInfo.innerHTML = baris.join('');
}

function settingTutupDialog() {
  dlgSetting.hidden = true;
  document.removeEventListener('keydown', settingTombol);
}
function settingTombol(e) { if (e.key === 'Escape') { e.preventDefault(); settingTutupDialog(); } }

settingBtn.onclick = () => {
  if (!dlgSetting.hidden) { settingTutupDialog(); return; }
  settingGambarInfo();
  dlgSetting.hidden = false;
  document.addEventListener('keydown', settingTombol);
};
document.getElementById('settingTutup').onclick = settingTutupDialog;
dlgSetting.onclick = (e) => { if (e.target === dlgSetting) settingTutupDialog(); };

/* ------------------------------------------------- meja disposisi ---------
   Kotak kabar (💬) itu utas grup: dibaca berurutan. Meja disposisi (📚) itu
   tumpukan berkas di meja kadis: dicari, disaring per jenis & pegawai,
   disematkan, disalin. Cuma MEMBACA larik `kabar` — modal kabar dan
   kabarUtas() tidak disentuh; klik satu kartu memanggil kabarBuka(idx) yang
   sudah ada. Yang disematkan disalin utuh ke ingatan peramban (bukan cuma
   id-nya: `no` hidup sebatas sesi halaman, dan server cuma memutar ulang
   ring 60 event), jadi tetap ada sesudah muat ulang dan tidak ikut dipangkas
   KABAR_MAX (lihat pengecualian di kabarMasuk). Kuncinya sesi|ts|jenis —
   ts datang dari server, jadi kabar yang sama sesudah muat ulang dikenali
   sebagai berkas yang sama, bukan duplikat. */
const MEJA_SEMAT_MAX = 40;
const mejaKunci = (k) => (k.sesi || '') + '|' + k.ts + '|' + k.jenis;
const kabarSemat = new Map((() => {
  try {
    const v = JSON.parse(ingatan.baca('mejaSemat', '[]'));
    return (Array.isArray(v) ? v : []).filter((k) => k && k.ts && k.jenis).map((k) => [mejaKunci(k), k]);
  } catch { return []; }
})());
function kabarTersemat(k) { return kabarSemat.has(mejaKunci(k)); }
function mejaSimpanSemat() {
  ingatan.tulis('mejaSemat', JSON.stringify([...kabarSemat.values()].slice(-MEJA_SEMAT_MAX)));
}
function mejaSematToggle(k) {
  const kunci = mejaKunci(k);
  if (kabarSemat.has(kunci)) kabarSemat.delete(kunci);
  else {
    const salinan = { ...k };
    delete salinan.no;                 // nomor urut milik sesi halaman ini, bukan berkasnya
    kabarSemat.set(kunci, salinan);
    while (kabarSemat.size > MEJA_SEMAT_MAX) kabarSemat.delete(kabarSemat.keys().next().value);
  }
  mejaSimpanSemat();
  mejaGambar();
}

const mj = {
  latar: document.getElementById('dlgMeja'),
  badan: document.getElementById('mejaBadan'),
  cari: document.getElementById('mejaCari'),
  sesi: document.getElementById('mejaSesi'),
  tab: document.getElementById('mejaTab'),
  agenda: document.getElementById('mejaAgenda'),
  ket: document.getElementById('mejaKet'),
  tutup: document.getElementById('mejaTutup'),
  tombol: document.getElementById('mejaBtn'),
};
const MEJA_TAB = [
  ['semua', 'semua', () => true],
  ['hasil', 'hasil', (k) => k.jenis === 'hasil' || k.jenis === 'sk'],
  ['tanya-izin', 'tanya · izin', (k) => k.cls === 'tunggu'],
  ['galat', 'galat', (k) => k.cls === 'galat'],
  ['lainnya', 'lainnya', (k) => k.cls !== 'tunggu' && k.cls !== 'galat' && k.jenis !== 'hasil' && k.jenis !== 'sk'],
];
let mejaTabKini = 'semua';
let mejaAgendaHasil = null;      // null = belum dicari; { q, baris, jumlah } | { q, galat }
let mejaTimer = 0;               // selama terbuka: kabar baru masuk lewat kabarMasuk() yang tidak tahu modal ini
let mejaJumlahLalu = -1;
let mejaKetTimer = 0;
// AGENT_ROOM_ISI=off di server: kabar datang tanpa kalimat agen, agenda tanpa
// label — mencari isi cuma menghasilkan kosong yang membingungkan
const mejaIsiMati = () => !!kendali && kendali.isiAktif === false;

// Teks yang dicari & disalin dihitung di satu tempat, supaya yang ketemu
// lewat kotak cari itu juga yang keluar dari tombol salin.
function mejaTeksTanya(k) {
  if (!k.tanya) return '';
  if (k.tanya.jenis === 'rencana') return k.tanya.teks || '';
  return (k.tanya.daftar || [])
    .map((q) => (q.tanya || '') + (q.opsi && q.opsi.length ? ' [' + q.opsi.join(' / ') + ']' : ''))
    .join('\n');
}
function mejaTeksPolos(k) {
  const baris = ['[' + tanggalID(k.ts) + ' ' + jam(k.ts).slice(0, 5) + '] ' + k.nama + ' (' + k.jab + ') — ' + k.emoji + ' ' + k.perihal];
  const tanya = mejaTeksTanya(k);
  if (tanya) baris.push(tanya);
  if (k.teks && !(k.tanya && k.tanya.teks === k.teks)) baris.push(k.teks);
  const meta = [];
  if (k.tool) meta.push('via ' + k.tool);
  if (k.sesi) meta.push('sesi ' + k.sesi);
  if (meta.length) baris.push(meta.join(' · '));
  return baris.join('\n');
}
async function mejaSalin(k) {
  const teks = mejaTeksPolos(k);
  let ok = false;
  try { await navigator.clipboard.writeText(teks); ok = true; } catch { /* butuh konteks aman/izin; jatuh ke textarea */ }
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = teks; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  mejaKet(ok ? 'disalin sebagai teks polos' : 'gagal menyalin — peramban menolak akses papan klip', !ok);
}
function mejaKet(teks, galat) {
  mj.ket.textContent = teks;
  mj.ket.classList.toggle('galat', !!galat);
  clearTimeout(mejaKetTimer);
  mejaKetTimer = setTimeout(() => { mj.ket.textContent = ''; }, 3000);
}

// Tumpukan = kabar hidup + sematan yang sudah tidak ada di larik (terpangkas,
// atau dari sesi halaman sebelumnya). `idx` cuma ada untuk yang hidup: itu
// yang bisa dibuka di modal kabar; sematan lama dibaca di tempat.
function mejaDaftar() {
  const hidup = new Set();
  const semua = kabar.map((k, idx) => { const kunci = mejaKunci(k); hidup.add(kunci); return { k, idx, kunci }; });
  for (const [kunci, k] of kabarSemat) if (!hidup.has(kunci)) semua.push({ k, idx: -1, kunci });
  semua.sort((a, b) => b.k.ts - a.k.ts);        // terbaru di atas, seperti tumpukan berkas
  return semua;
}
function mejaCocok(k, q) {
  if (!q) return true;
  return [k.perihal, k.tajuk, k.teks, k.nama, k.jab, k.tool, k.sesi, mejaTeksTanya(k)]
    .some((v) => v && String(v).toLowerCase().includes(q));
}

function mejaGambar() {
  const semua = mejaDaftar();
  const isiMati = mejaIsiMati();
  const q = isiMati ? '' : mj.cari.value.trim().toLowerCase();
  // pilihan pegawai dari sesi yang memang ada di tumpukan; pilihan yang sedang
  // dipakai dipertahankan selama sesinya masih ada
  const sesiLama = mj.sesi.value;
  const perSesi = new Map();
  for (const { k } of semua) if (k.sesi && !perSesi.has(k.sesi)) perSesi.set(k.sesi, k.nama);
  mj.sesi.innerHTML = '<option value="">semua pegawai</option>'
    + [...perSesi].map(([s, n]) => '<option value="' + esc(s) + '">' + esc(n) + ' · ' + esc(s) + '</option>').join('');
  mj.sesi.value = perSesi.has(sesiLama) ? sesiLama : '';
  const dasar = semua.filter(({ k }) => (!mj.sesi.value || k.sesi === mj.sesi.value) && mejaCocok(k, q));
  mj.tab.innerHTML = MEJA_TAB.map(([id, label, uji]) =>
    '<button type="button" data-tab="' + id + '" class="' + (id === mejaTabKini ? 'aktif' : '') + '">'
    + esc(label) + '<i>' + dasar.filter(({ k }) => uji(k)).length + '</i></button>').join('');
  const uji = (MEJA_TAB.find(([id]) => id === mejaTabKini) || MEJA_TAB[0])[2];
  const tampil = dasar.filter(({ k }) => uji(k));

  const out = [];
  if (isiMati) {
    out.push('<p class="meja-nota">Isi transkrip dimatikan di server (<code>AGENT_ROOM_ISI=off</code>): '
      + 'kabar tidak membawa kalimat agen, jadi pencarian isi dan pencarian agenda dimatikan. '
      + 'Saringan jenis dan pegawai tetap jalan.</p>');
  }
  if (!tampil.length) {
    out.push('<p class="meja-kosong">' + (semua.length ? 'tidak ada berkas yang cocok'
      : 'meja masih kosong — kabar dari pegawai menumpuk di sini') + '</p>');
  }
  for (const { k, idx, kunci } of tampil) {
    const semat = kabarSemat.has(kunci);
    const cuplik = satuBaris(k.teks || mejaTeksTanya(k), 110);
    out.push('<div class="meja-kartu ' + k.cls + (semat ? ' semat' : '') + (idx < 0 ? ' arsip' : '')
      + '" data-kunci="' + esc(kunci) + '" data-idx="' + idx + '" title="'
      + (idx < 0 ? 'sematan lama, sudah tidak ada di kotak kabar: klik untuk membaca di sini' : 'buka di kotak kabar') + '">'
      + '<span class="meja-stempel">' + k.emoji + ' ' + esc(k.tajuk) + '</span>'
      + '<b class="meja-perihal">' + esc(k.perihal) + '</b>'
      + '<span class="meja-jam">' + esc(labelHari(k.ts).toLowerCase()) + ' ' + jamWA(k.ts) + '</span>'
      + '<span class="meja-nama" style="border-color:' + esc(k.warna) + '">' + esc(k.nama)
        + (k.tool ? ' <i>· ' + esc(k.tool) + '</i>' : '') + '</span>'
      + (cuplik ? '<span class="meja-cuplik">' + esc(cuplik) + '</span>' : '')
      + '<pre class="meja-penuh">' + esc(mejaTeksPolos(k)) + '</pre>'
      + '<span class="meja-aksi">'
        + '<button type="button" data-aksi="semat" class="' + (semat ? 'aktif' : '') + '" title="'
          + (semat ? 'lepas sematan' : 'sematkan: tidak dipangkas, tetap ada sesudah muat ulang') + '">📌</button>'
        + '<button type="button" data-aksi="salin" title="salin sebagai teks polos">⎘</button>'
      + '</span></div>');
  }
  if (mejaAgendaHasil) out.push(mejaAgendaHtml());
  const posisi = mj.badan.scrollTop;
  mj.badan.innerHTML = out.join('');
  mj.badan.scrollTop = posisi;
  mejaJumlahLalu = kabar.length;
  mj.agenda.disabled = isiMati;
  mj.cari.disabled = isiMati;
  mj.cari.placeholder = isiMati ? 'pencarian isi mati (AGENT_ROOM_ISI=off)' : 'cari perihal, isi, nama, tool…';
}

const tanggalPendek = (ts) => new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
function mejaAgendaHtml() {
  const h = mejaAgendaHasil;
  const kepala = '<h3 class="meja-seksi">buku agenda, 7 hari terakhir' + (h.q ? ' · “' + esc(h.q) + '”' : '') + '</h3>';
  if (h.galat) return kepala + '<p class="meja-kosong">agenda tidak bisa dibaca: ' + esc(h.galat) + '</p>';
  if (!h.baris.length) return kepala + '<p class="meja-kosong">tidak ada catatan yang cocok</p>';
  return kepala + '<ul class="meja-agenda">' + h.baris.map((b) =>
    '<li><span class="t">' + esc(tanggalPendek(b.ts)) + ' ' + esc(jam(b.ts).slice(0, 5)) + '</span>'
    + '<span class="s" title="sesi ' + esc(b.session || '') + '">' + esc((b.nama || b.session || '').slice(0, 14)) + '</span>'
    + '<span class="k">' + esc(b.tool || b.kind || '') + '</span>'
    + '<span class="l">' + esc(b.label || b.alasan || b.galat || '') + '</span></li>').join('')
    + '</ul>' + (h.jumlah >= 100 ? '<p class="meja-nota">100 teratas saja — persempit kata kuncinya</p>' : '');
}

// Kata kunci yang sama ke buku agenda server: hari ini + 6 hari sebelumnya.
async function mejaCariAgenda() {
  if (mejaIsiMati()) return;
  const q = mj.cari.value.trim();
  const sampai = new Date();
  const dari = new Date(sampai);
  dari.setDate(dari.getDate() - 6);
  const u = '/agenda?q=' + encodeURIComponent(q) + '&dari=' + tanggalLokal(dari) + '&sampai=' + tanggalLokal(sampai)
    + '&limit=100' + (mj.sesi.value ? '&sesi=' + encodeURIComponent(mj.sesi.value) : '');
  mj.agenda.disabled = true;
  try {
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    mejaAgendaHasil = { q, baris: Array.isArray(d.baris) ? d.baris : [], jumlah: d.jumlah || 0 };
  } catch (err) {
    mejaAgendaHasil = { q, galat: err.message || 'gagal' };
  }
  mj.agenda.disabled = false;
  mejaGambar();
  const el = mj.badan.querySelector('.meja-seksi');
  if (el) el.scrollIntoView({ block: 'start' });
}

function mejaBuka() {
  mejaAgendaHasil = null;
  mejaGambar();
  mj.latar.hidden = false;
  document.addEventListener('keydown', mejaTombol);
  mejaTimer = setInterval(() => { if (kabar.length !== mejaJumlahLalu) mejaGambar(); }, 2000);
  if (!mejaIsiMati()) mj.cari.focus();
}
function mejaTutupDialog() {
  mj.latar.hidden = true;
  document.removeEventListener('keydown', mejaTombol);
  clearInterval(mejaTimer);
}
function mejaTombol(e) { if (e.key === 'Escape') { e.preventDefault(); mejaTutupDialog(); } }

mj.tombol.onclick = () => { if (mj.latar.hidden) mejaBuka(); else mejaTutupDialog(); };
mj.tutup.onclick = mejaTutupDialog;
mj.latar.onclick = (e) => { if (e.target === mj.latar) mejaTutupDialog(); };
mj.cari.oninput = mejaGambar;
mj.cari.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); mejaCariAgenda(); } };
mj.sesi.onchange = mejaGambar;
mj.agenda.onclick = mejaCariAgenda;
mj.tab.onclick = (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  mejaTabKini = b.dataset.tab;
  mejaGambar();
};
mj.badan.onclick = (e) => {
  const kartu = e.target.closest('.meja-kartu');
  if (!kartu) return;
  const kunci = kartu.dataset.kunci;
  const idx = Number(kartu.dataset.idx);
  const hidup = idx >= 0 && kabar[idx] && mejaKunci(kabar[idx]) === kunci ? kabar[idx] : null;
  const k = hidup || kabarSemat.get(kunci);
  if (!k) return;
  const aksi = e.target.closest('button[data-aksi]');
  if (aksi) {
    if (aksi.dataset.aksi === 'semat') mejaSematToggle(k);
    else mejaSalin(k);
    return;
  }
  if (hidup) { mejaTutupDialog(); kabarBuka(idx); }   // pembuka yang sudah ada
  else kartu.classList.toggle('buka');                // sematan lama: dibaca di tempat
};

/* --------------------------------------------------- mode kadis (HP) -----
   ?kadis=1: yang dilihat kepala dinas dari HP bukan diorama, tapi daftar —
   siapa menunggu parafnya, siapa berhenti, siapa sedang apa, berapa yang
   antre, token hari ini. Kanvas & bilah panggung disembunyikan CSS
   (body.mode-kadis); simulasinya tetap jalan supaya keadaan pegawainya
   benar. Server tetap bind 127.0.0.1: mode ini cuma berguna lewat tunnel
   (lihat DESIGN.md, "Rupa halaman"). */
const kadisEl = document.getElementById('kadisRingkas');
function kadisGambar() {
  if (!MODE_KADIS || !kadisEl) return;
  const sesi = [...agents.values()];
  const tunggu = sesi.filter((a) => a.butuh);
  const macet = sesi.filter((a) => !a.butuh && a.macet);
  const kerja = sesi.filter((a) => !a.butuh && !a.macet && a.state === 'work');
  const santai = sesi.filter((a) => !a.butuh && !a.macet && a.state !== 'work');
  const baris = (a, apa) => '<li><b>' + esc(namaKru(a)) + '</b><span>' + esc(apa) + '</span></li>';
  const blok = (judul, kelas, isi, kosong) => '<section class="kadis-blok ' + kelas + '"><h3>' + judul
    + ' <i>' + isi.length + '</i></h3>' + (isi.length ? '<ul>' + isi.join('') + '</ul>'
    : '<p class="kadis-kosong">' + kosong + '</p>') + '</section>';
  const out = [
    blok('menunggu paraf / izin', 'tunggu', tunggu.map((a) => baris(a,
      (TUNGGU_TEKS[a.butuh.sebab] || TUNGGU_TEKS.izin) + (a.butuh.label ? ' — ' + a.butuh.label : ''))), 'tidak ada yang menunggu kamu'),
    blok('berhenti karena galat', 'galat', macet.map((a) => baris(a, a.macet.label || a.macet.jenis || 'galat')), 'tidak ada yang berhenti'),
    blok('sedang bekerja', 'kerja', kerja.map((a) => baris(a, a.doing || (STATIONS[a.station] || {}).name || '')), 'kantor sepi'),
  ];
  if (santai.length) out.push(blok('di meja, tidak sedang tool call', 'santai', santai.map((a) => baris(a, a.doing || 'menunggu giliran')), ''));
  out.push(blok('antrean disposisi', 'antre', antrean.map((t) => '<li><b>' + esc(t.nama || 'tugas') + '</b><span>#'
    + Number(t.posisi || 0) + ' · ' + esc(t.cwd || '') + (t.sifat === 'SEGERA' ? ' · SEGERA' : '') + '</span></li>'), 'loket kosong'));
  // token hari ini dari /token-riwayat (ditulis server, lintas sesi) — angka
  // token saja, tanpa dolar: biaya di halaman ini toh "data sementara"
  let tokenHariIni = 'belum termuat';
  if (riwayatToken && Array.isArray(riwayatToken.harian)) {
    const h = riwayatToken.harian.find((x) => x.tanggal === tanggalLokal(new Date()));
    tokenHariIni = angkaID(h ? (h.input || 0) + (h.output || 0) : 0) + ' token';
  }
  out.push('<section class="kadis-blok token"><h3>token hari ini</h3><p class="kadis-token">' + esc(tokenHariIni) + '</p></section>');
  /* Serapan pagu — OPSIONAL, persis seperti di modal statistik: tanpa pagu.json
     di server, `riwayatToken.pagu` null dan blok ini tidak digambar sama sekali.
     Kelas bloknya yang sudah ada: .tunggu (kuning) selama semua masih di bawah
     pagu, .galat (merah) begitu ada yang melewatinya. Yang naik ke HP cuma
     yang paling mendesak — lima teratas sudah diurutkan server. */
  const pgKadis = riwayatToken && riwayatToken.pagu;
  if (pgKadis && Array.isArray(pgKadis.proyek) && pgKadis.proyek.length) {
    const isi = pgKadis.proyek.slice(0, 5).map((p) => '<li><b>' + esc(p.nama) + '</b><span>'
      + (Number(p.persen) || 0) + '% · ' + esc(angkaID(p.pakai)) + ' dari ' + esc(angkaID(p.pagu))
      + ' token</span></li>');
    out.push(blok('serapan pagu · minggu ' + esc(paguMingguTeks(pgKadis.minggu)),
                  pgKadis.lewat ? 'galat' : 'tunggu', isi, 'belum ada serapan'));
  }
  out.push('<button type="button" class="kadis-muat">⟳ muat ulang</button>');
  kadisEl.innerHTML = out.join('');
  kadisEl.querySelector('.kadis-muat').onclick = () => location.reload();
}
if (MODE_KADIS) {
  kadisEl.hidden = false;
  kadisGambar();
  // kegiatan berganti tanpa renderCrew() (tool call biasa cuma menyentuh
  // baris orangnya), dan token hari ini datang dari server: segarkan sendiri
  setInterval(kadisGambar, 4000);
  setInterval(() => muatRiwayatToken().then(kadisGambar), 60000);
}

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
  // ?ulang=YYYY-MM-DD[&laju=60]: putar ulang buku agenda hari itu, bukan live
  const ulang = /^\d{4}-\d{2}-\d{2}$/.test(params.get('ulang') || '') ? params.get('ulang') : '';
  const laju = Math.min(600, Math.max(1, Number(params.get('laju')) || 60));
  const es = new EventSource(ulang ? `/stream?ulang=${ulang}&laju=${laju}` : '/stream');
  const labelUlang = ulang ? `putar ulang ${ulang} · ${laju}×` : 'tersambung';
  es.onopen = () => { connDot.classList.add('on'); connText.textContent = labelUlang; };
  es.onerror = () => { connDot.classList.remove('on'); connText.textContent = 'putus — mencoba lagi…'; };
  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      if (ev.kind === 'ulang-selesai' || ev.kind === 'ulang-kosong') {
        es.close();                       // server sudah menutup; jangan sambung ulang dari awal
        connText.textContent = ev.kind === 'ulang-selesai' ? 'putar ulang selesai'
          : `putar ulang ${ulang}: tidak ada catatan`;
        return;
      }
      handle(ev);
    } catch (_) {}
  };
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
  kipasCx: 0,        // >0 = kipas dikunci menghadap titik x ini (rak kepanasan)
  rakPanas: false,
  // gelombang 2 — birokrasi
  // 0..1 = pecahan jam ditambahkan ke jarum jam/menit (jam yang berbohong).
  // Snap-back di akhir event terjadi GRATIS: MOD kembali 0 di frame berikutnya
  // begitu tidak ada event yang menuliskannya lagi — tidak perlu animasi balik.
  jamOffset: 0,
  slotTerkunci: -1,   // indeks meja kerja yang layarnya "terkunci" (sandiman)
  sidak: false,        // kadis sidak: laptop menyala penuh, badan tegak
  mejaGetar: -1,     // indeks meja kerja yang bergoyang
  mejaPadam: -1,     // indeks meja kerja yang laptopnya mati
  // gelombang 2
  getar: 0,          // px, seluruh kanvas digeser naik-turun (genset, gempa kecil)
  acMati: false,
  internetMati: false,
  jamGetar: false,   // baterai sekarat: jarum detik gemetar sebelum diam
  gordenLepas: false,
  wifiLemahSlot: -1, // indeks meja kerja yang sinyalnya hilang
  // gelombang 2 lanjutan
  lajuGlobal: 1,     // pengali kecepatan jalan SEMUA penghuni (ramadan, lembur malam, senyap magrib)
  masker: false,     // semua wajah digambar pakai masker (kabut asap)
  crtAktif: false,   // layar CRT di atas filing menampilkan bar guling (bukan idle diam)
  mejaHantu: -1,     // indeks meja kerja yang laptopnya "nyala" tanpa penghuni nyata
  // gelombang 3
  galonLepas: false, // galon dicabut dari dispenser pantry: kepalanya kosong
  karpetGulung: 0,   // 0..1, karpet meja rapat sedang digulung/dijemur (hilang dari lantai)
  bayangPanjang: 0,  // 0..1, bayangan kaki jadi jajaran genjang menjauhi jendela (senja)
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
  bukuTamu: 0,            // baris tanda tangan di buku tamu, 0..10 (menetap)
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
  retakExtra: [],          // {gx,gy} retakan tambahan, maks 6, permanen
  toner: 1,                // 0..1, sisa toner printer
  kabinetSlot: -1,         // meja kerja yang laptopnya digotong ke pojok (wifi lemah)
  // Baterai jam habis: sudutnya dibekukan di sini, bukan di MOD, karena harus
  // tetap beku LEWAT durasi eventnya sendiri kalau tidak ada yang membetulkan
  // — MOD kembali ke bawaan tiap frame begitu tidak ada event yang menuliskannya.
  jamBeku: null,           // null = ikut jam nyata, atau {hr,mn,sc} beku
  // gelombang 2 — insiden
  tumpukanStempel: 9,      // lapis berkas di meja stempel; 9 = penuh normal
  laciCelah: 0,            // 0..2 px, laci filing yang macet tidak bisa tertutup rapat
  benderaBelit: false,
  kursiRusak: new Set(),   // indeks slot kursi rapat yang digambar rusak (kosmetik)
  aparDiangkat: false,     // APAR sedang dibawa keliling, tidak di dinding
  nodaKopi: [],            // {x, y, lebar} bekas kopi tumpah di meja rapat, permanen
  gelasGuling: null,       // x salah satu titik gelas di drawRapat, atau null
  xbanner: { sudut: 0, lipat: false },
  // gelombang 2 — birokrasi
  boksHilang: -1,          // indeks boks arsip yang sedang dipinjam, atau -1
  arsipPenuh: false,       // lemari arsip kepenuhan (celah pintu tidak menutup)
  dusTambahanArsip: 0,     // 0..2 dus ekstra di depan lemari saat arsipPenuh
  stikerTertempel: new Set(),  // nama stasiun yang sudah ditempeli stiker inventaris
  antre: 10,               // nomor antrean loket saat ini
  edaran: [],              // {miring, kusam} surat edaran yang ditempel, maks 4
  plangBaru: false,        // plang nama ruang kadis sudah diganti
  kertasPrinter: 20,       // stok kertas; 0 = habis
  propLantai: [],          // {x, y, jenis, sampai} benda kecil menetap di lantai
  gagalBeruntun: [],       // timestamp Date.now() tool call gagal 60 detik terakhir
  inspeksiLog: [],         // timestamp Date.now() inspektorat-mendadak pernah jalan
  stempelRapi: false,      // tumpukan berkas di meja stempel diketuk rata
  papanJalan: 0,           // 0-3 baris catatan di papan jalan auditor
  baganKotak: 0,           // 0-2 kotak tambahan di bagan struktur (drawFiling)
  // gelombang 2 lanjutan
  kipasArah: 0,            // -1/0/1, arah kepala kipas berdiri; bertahan sampai direbut lagi
  gordenKanan: 6,          // lebar gorden kanan jendela, px; direset tiap pagi di tickRuangan
  sampahLantai: [],        // {x,y,jenis} daun/kertas kecil menetap di lantai, dipungut siapa saja
  kesetAda: false,         // keset baru terpasang di depan pintu kadis, permanen sekali sesi
  spanduk: null,           // {huruf} indeks huruf yang lepas dari papan nama DINAS AI KLOD, permanen
  geserKursi: [],          // offset px per slot kursi rapat (0..6), berdecit lalu diluruskan
  kursiBerderit: 0,        // penanda "sudah ada satu decitan" 20 detik terakhir (Date.now())
  kucingAda: false,        // entitas kucing kantor sedang di ruangan (event kucing-kantor)
  piala: false,            // piala voli terpajang di atas lemari arsip, permanen
  piagamDinding: false,    // piagam zona integritas tergantung di dinding, permanen
  laciTerbuka: -1,         // laci filing yang sedang dibuka (arsiparis mengajari magang)
  tumpukanMap: [],         // {x,y,sisa} tumpukan map sementara (rangkap tiga dkk)
  // Berapa "sheet" kliping mingguan yang sudah dijilid (GET /kliping-mingguan,
  // field `lembar`) — diisi langsung dari hasil fetch, bukan dihitung sendiri
  // di client. Tampilan dibatasi maks 10 lapis di drawArsip(), datanya sendiri
  // tidak pernah dipotong.
  arsipKlipingLembar: 0,
  // Lembar notulen yang ditinggal peserta rapat di sudut meja rapat, 0..10
  // (NOTULEN_MAKS). Naik tiap Peserta bubar; dibawa arsiparis standby ke
  // lemari arsip tiap ±10 menit kalau ≥3 (lihat class Standby).
  notulen: 0,
  // Tema kalender (registri TEMA di bawah): id dekor musiman yang sedang
  // menempel di ruangan, atau null. Dievaluasi saat muat & tiap ganti hari.
  tema: null,
  temaTahun: 0,            // tahun saat tema dievaluasi — buat "ke-N" di spanduk
  // Dibaca drawAbsensi(). Dulu cuma dideklarasikan di MOD padahal semua yang
  // menulis/membacanya memakai RUANGAN — jadi field MOD-nya mati dan yang ini
  // hidup tanpa deklarasi. Rumahnya memang di sini: event yang menyalakannya
  // (absen-fingerprint, absensi-ngambek) mematikannya sendiri di selesai().
  absensiMerah: false,     // mesin absen sidik jari berkedip merah
  // Sesudah dijemur, karpet meja rapat tetap satu tingkat lebih cerah — bekas
  // yang sengaja hidup lebih lama dari eventnya (lihat drawFloor).
  karpetCerah: false,
  // Kekusutan harian, 0..1 — satu-satunya field RUANGAN yang berjalan
  // sendiri mengikuti jam, bukan bekas sebuah kejadian. Lihat blok
  // "kekusutan harian" di bawah. null = belum pernah di-tick; tick pertama
  // menyetelnya langsung ke sasaran, jadi halaman yang dibuka jam 15.00
  // tidak pernah tampil bersih dulu.
  kusut: null,
};

/* -------------------------------------------------------------- penjadwal */
const eventHidup = [];
const cooldownSampai = new Map();
let jedaEvent = 8;          // percobaan pertama cepat, biar tidak sepi di awal
let S = null;               // potret ruangan, disegarkan tiap percobaan

/* Yang boleh dipinjam jadi pemain: benar-benar menganggur, bukan peserta rapat
   yang memang harus duduk, bukan yang sedang dipakai event lain. */
function bisaDipinjam(a) {
  // !a.diKadis: event ambient TIDAK BOLEH PERNAH menyeret orang keluar dari
  // dalam bukaan ruang kadis — goToXY() akan menjepit tujuannya ke dalam
  // kanvas dan dia berjalan menembus dinding. Ada kasus ujinya sendiri di
  // uji-sisip.mjs supaya konsumen penghuni() berikutnya langsung merah.
  return !a.eventKerja && !a.adaTugas && a.state !== 'work'
    && a.station !== 'keluar' && !a.keluar && !a.diKadis;
}

/* Laju token: contoh (t, jumlah) diambil tiap ±1 detik dari tokenTotal, jendela
   5 menit. Dihitung dari selisih total, bukan dari stempel waktu per sesi —
   server tidak mengirim token per waktu, dan selisih sudah cukup buat
   "sedang boros atau tidak". Jumlahnya SEMUA jenis (input, output, cache
   tulis, cache baca): cache baca memang murah, tapi itu yang menumpuk. */
const contohToken = [];      // [{ t: Date.now(), n }] terurut waktu
const LAJU_JENDELA = 300000, LAJU_JEDA = 1000;
function lajuTokenMenit() {
  const n = tokenTotal.input + tokenTotal.output + tokenTotal.cacheTulis + tokenTotal.cacheBaca;
  const t = Date.now();
  const akhir = contohToken[contohToken.length - 1];
  if (!akhir || t - akhir.t >= LAJU_JEDA) contohToken.push({ t, n });
  while (contohToken.length > 1 && contohToken[0].t < t - LAJU_JENDELA) contohToken.shift();
  const awal = contohToken[0];
  const menit = (t - awal.t) / 60000;
  return menit < 0.05 ? 0 : Math.round((n - awal.n) / menit);
}

/* ------------------------------------------------------- babak hari kerja ---
   Satu mesin status jam kantor, dibaca event lewat S.babak. S.jam dan
   S.kerjaJam TETAP ada — definisi event lama tidak boleh pecah; babak cuma
   menambah "kapan sebuah kejadian lebih masuk akal" lewat pengali bobot
   (field opsional `babak` di definisi event, lihat bobotBabak di penjadwal),
   bukan mengganti syarat.
     apel       07:00-07:45 hari kerja (apel pagi, lihat di bawah)
     kerja      06:00-16:00 selebihnya
     istirahat  12:00-13:00; Jumat 11:30-13:00
     pulang     16:00-17:00
     lembur     17:00-22:00
     malam      22:00-06:00
     libur      Sabtu/Minggu, hari kejepit (HARI_KEJEPIT, event-acak.js), dan
                libur nasional di LIBUR_NASIONAL — sepanjang hari */
const LIBUR_NASIONAL = new Set(['1-1', '1-5', '17-8', '25-12']);   // "tanggal-bulan"
function hariLibur(d) {
  const hari = d.getDay();
  if (hari === 0 || hari === 6) return true;
  const kunci = d.getDate() + '-' + (d.getMonth() + 1);
  if (LIBUR_NASIONAL.has(kunci)) return true;
  // HARI_KEJEPIT ada di event-acak.js yang dimuat SESUDAH berkas ini; dibaca
  // saat dipanggil (bukan saat muat), jadi typeof-nya aman.
  return typeof HARI_KEJEPIT !== 'undefined' && HARI_KEJEPIT.has(kunci);
}
function babakHari(jam, d) {
  d = d || new Date();
  if (hariLibur(d)) return 'libur';
  if (jam >= 22 || jam < 6) return 'malam';
  if (jam >= 17) return 'lembur';
  if (jam >= 16) return 'pulang';
  if (jam >= (d.getDay() === 5 ? 11.5 : 12) && jam < 13) return 'istirahat';
  if (jam >= 7 && jam < 7.75) return 'apel';
  return 'kerja';
}

/* ---------------------------------------------------- kekusutan harian ---
   Kantor yang pagi-pagi rapi lalu makin kusut menjelang sore. Satu angka
   0..1 di `RUANGAN.kusut`, dibaca fungsi gambar yang sudah ada -- BUKAN
   belasan field terpisah: berkas yang menumpuk di meja, dus di kolong,
   kursi yang tidak didorong balik, dan lembaran yang tercecer di lantai
   semuanya tumbuh dari kurva yang sama, jadi ruangan mengusut serempak.
   Kalau tiap benda punya jamnya sendiri, yang kebaca cuma "ada yang
   berubah", bukan "sudah sore".

   Kurvanya patokan per jam, idiom sama seperti FASE_HARI. Dua hal yang
   membedakannya:

   * Dia BUKAN fungsi murni dari jam. Nilainya disimpan dan diseret pelan ke
     sasaran, jadi event yang membereskan ruangan (lihat bereskanKusut)
     menyisakan jejak "sempat bersih" beberapa menit sebelum tumpukannya
     kembali -- bukan terhapus di frame berikutnya oleh kurva.
   * Tick pertama menyetel langsung tanpa diseret. Membuka halaman jam 15.00
     harus dapat kantor yang SUDAH kusut, bukan kantor bersih yang baru mulai
     berantakan di depan mata penonton.

   Uji cepat tanpa menunggu jamnya tiba: `?kusut=0.9` (boleh digabung dengan
   `?jam=`; `?kusut=` menang, jam cuma mengatur cahayanya). */
const KUSUT_PAKSA = parseFloat(new URLSearchParams(location.search).get('kusut'));
const KUSUT_JAM = [
  [0,    0.06],   // sisa lembur semalam, belum ada yang menyapu
  [5.2,  0.02],   // petugas kebersihan lewat sebelum apel
  [7,    0.04],   // apel pagi: meja masih rapi
  [8.3,  0.12],   // berkas pertama keluar dari lemari
  [10,   0.32],
  [11.5, 0.48],
  [13,   0.56],   // balik dari istirahat, tumpukan siang menumpuk lagi
  [14.5, 0.76],
  [16,   0.95],
  [16.8, 1],      // jam pulang: paling kusut
  [17.6, 0.82],   // yang pulang membereskan mejanya sendiri, sebagian saja
  [19,   0.38],
  [21,   0.14],
  [24,   0.06],
];
// Naik lambat (tumpukan butuh waktu), turun cepat (membereskan itu sengaja
// dan kelihatan). Satuannya per detik, jadi 0.004 = 0..1 dalam ~4 menit --
// jauh lebih cepat dari geser kurvanya sendiri (0.95 dalam 10 jam), jadi di
// hari biasa nilainya praktis selalu menempel di sasaran; lajunya baru
// terasa sesudah bereskanKusut menariknya turun.
const KUSUT_NAIK = 0.004, KUSUT_TURUN = 0.03;

function kusutSasaran() {
  if (Number.isFinite(KUSUT_PAKSA)) return Math.max(0, Math.min(1, KUSUT_PAKSA));
  const jam = jamKini();
  let a = KUSUT_JAM[0], b = KUSUT_JAM[KUSUT_JAM.length - 1];
  for (let i = 0; i < KUSUT_JAM.length - 1; i++) {
    if (jam >= KUSUT_JAM[i][0] && jam < KUSUT_JAM[i + 1][0]) { a = KUSUT_JAM[i]; b = KUSUT_JAM[i + 1]; break; }
  }
  let k = b[0] === a[0] ? a[1] : a[1] + (b[1] - a[1]) * ((jam - a[0]) / (b[0] - a[0]));
  // Hari libur tidak ada yang mengusutkan ruangan -- yang tersisa cuma
  // tumpukan hari Jumat yang belum disapu.
  if (hariLibur(new Date())) k = Math.min(k, 0.1);
  // Sesi ramai mengusutkan lebih cepat. Pengalinya berhenti di 0.7, bukan 0:
  // kantor tanpa sesi nyata TETAP dihuni pegawai standby yang mondar-mandir,
  // jadi sore tetap sore -- cuma tumpukannya berhenti satu-dua lapis lebih
  // rendah dan ceceran yang ambangnya tinggi tidak pernah muncul. Jenuh di
  // tiga sesi, bukan empat: itu sudah "ruangan sibuk" untuk enam meja.
  const ramai = Math.min(1, agents.size / 3);
  return Math.max(0, Math.min(1, k * (0.7 + 0.3 * ramai)));
}

let kusutCache = 0, kusutCacheDetik = -1;
function tickKusut(dt) {
  // Sasarannya dihitung sekali per detik, idiom sama seperti ambBasis di
  // ambien(): kurvanya bergeser 0.95 dalam sepuluh jam, jadi menghitungnya
  // 60x per detik cuma memboroskan dua alokasi Date tiap frame.
  const detik = (now / 1000) | 0;
  if (detik !== kusutCacheDetik) { kusutCacheDetik = detik; kusutCache = kusutSasaran(); }
  const sasaran = kusutCache;
  if (RUANGAN.kusut == null) { RUANGAN.kusut = sasaran; return; }
  const laju = (sasaran > RUANGAN.kusut ? KUSUT_NAIK : KUSUT_TURUN) * dt;
  RUANGAN.kusut += Math.max(-laju, Math.min(laju, sasaran - RUANGAN.kusut));
}

/* Dipakai event yang membereskan ruangan (jumat bersih, petugas kebersihan,
   apel pagi): menurunkan kekusutan tanpa MENGUNCI-nya. Kurvanya menyeret
   naik lagi pelan-pelan sesudah itu, jadi "sudah dibereskan" jadi keadaan
   yang sungguh terasa hilang lagi menjelang sore, bukan tombol permanen. */
function bereskanKusut(sisa) {
  const s = Math.max(0, Math.min(1, sisa || 0));
  RUANGAN.kusut = RUANGAN.kusut == null ? s : Math.min(RUANGAN.kusut, s);
}

// Dipakai fungsi gambar. null (belum pernah di-tick, mis. hook gambar
// dipanggil harness sebelum frame pertama) dibaca 0 = ruangan bersih.
const kusutKini = () => RUANGAN.kusut || 0;

/* Potret ruangan: apa yang dilihat penjadwal event tiap percobaan. Bagian
   pertama suasana (jam, lampu, cuaca, siapa yang menganggur); bagian kedua
   FAKTA SESI, dihitung dari agen nyata saja (agents, bukan peserta rapat /
   standby) supaya event bisa bereaksi pada yang sungguh terjadi. Dibaca
   saja, tidak menulis apa pun ke log/statistik — aturan 2 event acak utuh.
     gagalBeruntun  maks tool call gagal berturut-turut yang sedang berlangsung di satu agen
     lajuToken      token per menit, semua jenis, jendela 5 menit terakhir
     rasioEdit      porsi tool call Edit/Write/… (stasiun 'edit') dari seluruh call, 0..1
     proyekDominan  { nama, agen } proyek dengan agen terbanyak; null kalau tak ada
     proyekBerbeda  jumlah proyek (cwd) unik
     modelCampur    true kalau lebih dari satu model terlihat
     tungguTotal    jumlah agen yang sedang menunggu kamu (butuh) atau macet karena galat
     sibukRatio     agen state 'work' / seluruh agen nyata, 0..1 (0 kalau belum ada agen) */
function potretRuangan() {
  const orang = [...penghuni()];
  const A = ambien();
  const d = new Date();
  const nyata = [...agents.values()];
  let calls = 0, edit = 0, gagalBeruntun = 0, tunggu = 0, sibuk = 0;
  const proyek = new Map(), model = new Set();
  for (const a of nyata) {
    calls += a.calls || 0;
    edit += (a.perStasiun && a.perStasiun.edit) || 0;
    gagalBeruntun = Math.max(gagalBeruntun, a.gagalBerturut || 0);
    if (a.butuh || a.macet) tunggu++;
    if (a.state === 'work') sibuk++;
    if (a.project) proyek.set(a.project, (proyek.get(a.project) || 0) + 1);
    if (a.model) model.add(a.model);
  }
  let proyekDominan = null;
  for (const [nama, agen] of proyek) if (!proyekDominan || agen > proyekDominan.agen) proyekDominan = { nama, agen };
  return {
    jam: A.jam, lampu: A.lampu, luar: A.luar, malam: A.lampu > 0.5,
    hujan: CUACA.hujan, petir: CUACA.petir,
    hari: d.getDay(), tanggal: d.getDate(),
    kerjaJam: A.jam >= 7 && A.jam < 16,
    babak: babakHari(A.jam, d),          // 'apel'|'kerja'|'istirahat'|'pulang'|'lembur'|'malam'|'libur'
    kusut: kusutKini(),                  // kekusutan harian 0..1 (pagi rapi → sore penuh tumpukan)
    tema: RUANGAN.tema,                  // id tema kalender yang menempel, atau null
    orang,
    sesi: agents.size, standby: standby.length, peserta: peserta.length,
    nganggur: orang.filter(bisaDipinjam),
    bekerja: orang.filter((a) => a.state === 'work'),
    stasiunAktif: new Set(orang.filter((a) => a.state === 'work').map((a) => a.station)),
    // fakta sesi (lihat komentar blok di atas)
    gagalBeruntun,
    lajuToken: lajuTokenMenit(),
    rasioEdit: calls ? edit / calls : 0,
    proyekDominan,
    proyekBerbeda: proyek.size,
    modelCampur: model.size > 1,
    tungguTotal: tunggu,
    sibukRatio: nyata.length ? sibuk / nyata.length : 0,
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
  a.laju = 1;
  a.bekuSampai = 0;
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
    laporGalatEvent(def.id, e);
    matikanEvent(E, true);
    return false;
  }
  // Event yang tidak dapat pemain sama sekali padahal butuh: batalkan, jangan
  // biarkan jalan hampa selama durasinya lalu menghabiskan cooldown.
  if (def.perluAktor && !E.aktor.length) { matikanEvent(E, true); return false; }
  // Lapor ke arsip kliping mingguan — cuma event kelas 'panggung' (saling
  // eksklusif, jadi volumenya kecil) dan bukan yang dipaksa manual lewat
  // ?event= buat testing (EVENT_PAKSA tidak boleh ikut mengotori arsip
  // sungguhan). Fire-and-forget, gagal = diam — ruangan tidak boleh terganggu
  // gara-gara pelaporan suasana.
  if (def.kelas === 'panggung' && !EVENT_PAKSA) laporAmbien(def.id);
  return true;
}

function laporAmbien(id) {
  fetch('/ambien', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  }).catch(() => {});
}

/* ------------------------------------------------------ telemetri galat ---
   Galat halaman dikirim ke POST /galat supaya terbaca dari konsol server dan
   GET /galat tanpa membuka devtools — halaman ini sering hidup di layar
   kedua yang tidak ada yang memelototi. Yang dikirim: pesan (200 huruf),
   nama berkas:baris (basename saja, tanpa path penuh), id event acak yang
   sedang jalan (tersangka pertama), nama peramban pendek. Tidak pernah
   stack, tidak pernah isi apa pun. Batas 5 per menit dan pesan yang sama
   tidak dikirim dua kali: event yang tick()-nya meledak dilaporkan sekali,
   bukan 60 kali sedetik. Pelapornya sendiri tidak boleh melempar. */
const GALAT_BATAS_MENIT = 5;
const galatKirim = [];              // ts kiriman 60 detik terakhir
const galatSudah = new Set();       // pesan yang sudah pernah dilaporkan
const namaPeramban = () => {
  const m = (navigator.userAgent || '').match(/(Edg|OPR|Firefox|Chrome|Safari)\/(\d+)/);
  if (!m) return 'lain';
  return (m[1] === 'Edg' ? 'Edge' : m[1] === 'OPR' ? 'Opera' : m[1]) + ' ' + m[2];
};
const sumberSingkat = (berkas, baris) => {
  const b = String(berkas || '').split(/[?#]/)[0].split(/[\\/]/).pop() || '';
  return b ? (baris ? b + ':' + baris : b) : '';
};
const galatPesan = (e) => (e && e.message ? String(e.message) : String(e == null ? 'galat tanpa pesan' : e));
function laporGalat(pesan, sumber, eventId) {
  try {
    const teks = String(pesan || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!teks || galatSudah.has(teks)) return;
    const t = Date.now();
    while (galatKirim.length && t - galatKirim[0] > 60000) galatKirim.shift();
    if (galatKirim.length >= GALAT_BATAS_MENIT) return;
    galatKirim.push(t);
    if (galatSudah.size > 200) galatSudah.clear();
    galatSudah.add(teks);
    let ev = eventId || '';
    if (!ev) { try { ev = eventHidup.length ? eventHidup[eventHidup.length - 1].id : ''; } catch { ev = ''; } }
    fetch('/galat', {
      method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ ts: t, pesan: teks, sumber: sumber || '', event: ev, ua: namaPeramban() }),
    }).catch(() => {});
  } catch { /* pelapor tidak boleh ikut melempar */ }
}
// jalur event acak: tetap console.warn di pemanggilnya, ditambah laporan
// berisi id event + pesan saja (stack-nya memuat path, tidak dikirim)
const laporGalatEvent = (id, e) => laporGalat('event ' + id + ': ' + galatPesan(e), 'event-acak.js', id);
window.addEventListener('error', (ev) => {
  laporGalat(ev.message || galatPesan(ev.error), sumberSingkat(ev.filename, ev.lineno));
});
window.addEventListener('unhandledrejection', (ev) => {
  const s = ev.reason && ev.reason.stack ? String(ev.reason.stack).match(/([^\/\\\s():]+\.m?js):(\d+)/) : null;
  laporGalat('janji ditolak: ' + galatPesan(ev.reason), s ? s[1] + ':' + s[2] : '');
});

function matikanEvent(E, batal) {
  const i = eventHidup.indexOf(E);
  if (i >= 0) eventHidup.splice(i, 1);
  if (!batal) { try { E.def.selesai && E.def.selesai(E, S); } catch (e) { console.warn('[event]', E.id, e); laporGalatEvent(E.id, e); } }
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
  // ...dan sebaliknya. Dulu daftar ini cuma dibaca dari sisi KANDIDAT, jadi
  // "A bentrokDengan B" menahan A selama B hidup tapi tidak menahan B selama A
  // hidup — separuh perlindungan, dan setiap penulis event mengira dua arah.
  // Contoh yang benar-benar rusak karenanya: kadis-sekdis-rapat-tertutup
  // bergantung pada pintu kadis yang TETAP tertutup, tapi event lain yang
  // memaksa MOD.pintuKadis tetap boleh menyala di tengah adegannya.
  if (eventHidup.some((E) => E.def.bentrokDengan && E.def.bentrokDengan.includes(def.id))) return true;
  return false;
}

/* Bobot efektif = bobot × pengali babak. Field opsional `babak` di definisi
   event: { istirahat: 2, lembur: .3 } — babak yang tidak disebut = 1, nol
   berarti tidak ikut undian sama sekali di babak itu. Aman kalau S.babak
   tidak ada (harness uji-event.mjs merakit S sendiri): pengalinya 1. */
function bobotBabak(d) {
  const b = d.bobot || 1;
  const m = d.babak && S && S.babak ? d.babak[S.babak] : undefined;
  return m == null ? b : b * m;
}

function pilihBerbobot(calon) {
  const bisa = calon.filter((d) => bobotBabak(d) > 0);
  let total = 0;
  for (const d of bisa) total += bobotBabak(d);
  if (!total) return null;
  let u = Math.random() * total;
  for (const d of bisa) {
    u -= bobotBabak(d);
    if (u <= 0) return d;
  }
  return bisa[bisa.length - 1];
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
  tickKusut(dt);        // kurva kekusutan harian — jalan walau ?event=0
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
  // Gorden yang ditarik menahan silau sore harus lepas sendiri esok pagi —
  // tidak ada event yang "berjalan sepanjang malam" untuk membalikkannya.
  if (RUANGAN.gordenKanan > 6 && ambien().jam < 8) RUANGAN.gordenKanan = 6;
  // jendela bergulir 60 detik — dibuang dari depan karena array-nya selalu
  // terurut waktu (push di ujung), jadi cukup potong prefiks yang basi
  if (RUANGAN.gagalBeruntun.length) {
    const batas = Date.now() - 60000;
    let potong = 0;
    while (potong < RUANGAN.gagalBeruntun.length && RUANGAN.gagalBeruntun[potong] < batas) potong++;
    if (potong) RUANGAN.gagalBeruntun.splice(0, potong);
  }
}

function tickEvent(dt) {
  resetMod();
  tickRuangan(dt);
  tickApel(dt);         // apel pagi: bukan event acak — jalan walau ?event=0
  if (EVENT_MATI) return;

  S = potretRuangan();

  for (let i = eventHidup.length - 1; i >= 0; i--) {
    const E = eventHidup[i];
    E.umur += dt;
    E.sisa -= dt;
    try { E.def.tick && E.def.tick(E, dt, S); } catch (e) { console.warn('[event]', E.id, e); laporGalatEvent(E.id, e); }
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
  const pilihan = calon.length ? pilihBerbobot(calon) : null;   // null: semua bobot 0 di babak ini
  if (pilihan) nyalakanEvent(pilihan);
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
    if (fn) { try { fn(E, S); } catch (e) { console.warn('[event]', E.id, e); laporGalatEvent(E.id, e); } }
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

/* -------------------------------------------------------------- apel pagi ---
   Sekali sehari, saat babak 'apel' (07:00-07:45 hari kerja) dan halaman
   terbuka: yang menganggur + standby berbaris dua saf di bawah tiang bendera
   menghadap ke atas, bendera naik pelan (apelBendera → drawBendera),
   Indonesia Raya kalau audio sudah dibuka pengguna, pembina apel memberi
   amanat — ringkasan buku agenda kemarin (GET /agenda) kalau ada, kalimat
   generik kalau tidak. Senin lebih formal: 40 detik + pembacaan Panca
   Prasetya Korpri; hari lain 20 detik. Penanda tanggalnya di localStorage
   (apelTerakhir) supaya tab yang dimuat ulang tidak apel dua kali.

   BUKAN event acak: tidak lewat penjadwal (jalan walau ?event=0), tidak
   menaikkan statistik, tidak dilaporkan ke /ambien. Aturan 1 tetap mutlak:
   pesertanya dipegang lewat eventKerja yang sama dengan event acak, jadi
   handle() melepasnya persis seperti biasa begitu tool call datang, dan
   destroy() ikut melepasnya — apel tidak pernah menahan siapa pun; barisan
   yang bolong dibiarkan bolong. Uji: ?apel=1 (sekarang), ?apel=senin. */
const APEL_PAKSA = new URLSearchParams(location.search).get('apel');
const APEL_TIANG_X = 132;                    // tiang bendera, sama dengan drawBendera
const APEL_SAF_Y = [290, 306];               // dua saf di lantai bawah tiang, di atas baris meja kerja
const APEL_SAF_X0 = 96, APEL_JARAK = 18, APEL_PER_SAF = 8;
const APEL_PESAN = [
  'Hari ini fokus, jaga kesehatan, dan tutup tugas sebelum jam pulang.',
  'Yang masih menunggu paraf, tolong dikejar sebelum siang.',
  'Rapikan meja dan arsip, jangan sampai auditor yang menemukan duluan.',
  'Kalau macet, bilang — jangan diam sendirian di meja.',
];
const APEL_PEMBUKA = 'Selamat pagi. Kemarin belum ada catatan di buku agenda.';
const PANCA_PRASETYA = [
  'Panca Prasetya Korpri. Satu: setia dan taat kepada Pancasila, UUD 1945, negara, dan pemerintah.',
  'Dua: menjunjung tinggi kehormatan bangsa dan negara, serta memegang teguh rahasia jabatan.',
  'Tiga: mengutamakan kepentingan negara dan masyarakat di atas kepentingan pribadi dan golongan.',
  'Empat: memelihara persatuan dan kesatuan bangsa serta kesetiakawanan Korpri.',
  'Lima: menegakkan kejujuran, keadilan, disiplin, serta meningkatkan kesejahteraan dan profesionalisme.',
];
let apel = null;                             // { E, senin, durasi, pembina, amanat, umur, naikMulai, naikLama }
let apelPaksaSudah = false;
let apelCekBerikut = now + 2500;             // beri waktu sesi & standby lahir dulu

const pangkat = (a) => { const i = JABATAN.findIndex((j) => j.id === a.peran); return i < 0 ? JABATAN.length : i; };
// peserta apel: yang benar-benar menganggur (bisaDipinjam) dan bukan peserta rapat — mereka memang harus duduk
const calonApel = () => [...penghuni()].filter((a) => bisaDipinjam(a) && !(a instanceof Peserta));
// pembina: kadis kalau ada personanya; kalau tidak, standby berjabatan tertinggi; lalu siapa pun tertinggi
function pilihPembina(orang) {
  const kadis = orang.find((a) => a.peran === 'kadis');
  if (kadis) return kadis;
  const tertinggi = (arr) => arr.slice().sort((p, q) => pangkat(p) - pangkat(q))[0] || null;
  return tertinggi(orang.filter((a) => a.standby)) || tertinggi(orang);
}

function mulaiApel(senin, paksa) {
  const orang = calonApel();
  if (!orang.length) return false;           // semua sibuk: dicoba lagi, penanda tidak ditulis
  const E = { def: { id: 'apel-pagi' }, id: 'apel-pagi', umur: 0, sisa: 0, data: {}, aktor: [], tanda: new Set() };
  for (const a of orang) {
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    a.doingEvent = 'apel pagi';
  }
  const pembina = pilihPembina(orang);
  apel = { E, senin, durasi: senin ? 40 : 20, pembina, amanat: null, umur: 0, naikMulai: 3, naikLama: 8 };
  if (pembina) pembina.goToXY(APEL_TIANG_X + 18, 280, 'down');   // di samping tiang, menghadap barisan
  E.aktor.filter((a) => a !== pembina).forEach((a, i) => {
    const saf = ((i / APEL_PER_SAF) | 0) % 2, k = i % APEL_PER_SAF;
    a.goToXY(APEL_SAF_X0 + k * APEL_JARAK + saf * 9, APEL_SAF_Y[saf], 'up');
  });
  apelBendera = 1;                            // bendera menunggu di kaki tiang
  muatAmanat();
  if (!paksa) ingatan.tulis('apelTerakhir', tanggalLokal(new Date()));
  return true;
}

/* Amanat dirakit di klien dari buku agenda kemarin (route /agenda tahap 2):
   "Kemarin N tool call dari M sesi, terbanyak <tool>." Gagal/404/kosong =
   kalimat generik; tidak ada route baru. */
function muatAmanat() {
  const tgl = tanggalLokal(new Date(Date.now() - 86400000));
  fetch('/agenda?dari=' + tgl + '&sampai=' + tgl + '&limit=2000')
    .then((res) => (res.ok ? res.json() : null))
    .then((j) => {
      if (!apel || !j || !Array.isArray(j.baris)) return;
      const call = j.baris.filter((b) => b.kind === 'pre' && b.tool);
      if (!call.length) return;
      const sesi = new Set(call.map((b) => b.session)).size;
      const hitung = new Map();
      for (const b of call) hitung.set(b.tool, (hitung.get(b.tool) || 0) + 1);
      let top = '';
      for (const [t, n] of hitung) if (!top || n > hitung.get(top)) top = t;
      apel.amanat = 'Kemarin ' + call.length + ' tool call dari ' + sesi + ' sesi, terbanyak ' + top + '.';
    })
    .catch(() => {});
}

// Pembina yang sudah keluar barisan (tool call) diganti yang tertinggi di
// sisa barisan — dari tempatnya berdiri, tidak dipindah. Standby dibungkam
// Standby.say(), jadi dipanggil langsung Agent.prototype.say dengan balon
// yang dipasang ulang ke overlay selama apel (dicopot lagi di bubarApel).
function ucapPembina(teks) {
  const A = apel;
  if (!A) return;
  if (!A.pembina || !A.E.aktor.includes(A.pembina)) A.pembina = pilihPembina(A.E.aktor);
  const p = A.pembina;
  if (!p) return;
  if (p.standby && !p.el.isConnected) overlay.appendChild(p.el);
  spawn('talk', p.x, p.y - 24);
  Agent.prototype.say.call(p, esc(teks));
}

function tickApel(dt) {
  if (!apel) {
    if (now > apelCekBerikut) { apelCekBerikut = now + 1000; cekApel(); }
    return;
  }
  const A = apel, E = A.E;
  A.umur += dt;
  E.umur = A.umur;                            // pada() membaca E.umur
  // bendera naik pelan; yang sudah sampai di barisan hormat selama itu
  const t = (A.umur - A.naikMulai) / A.naikLama;
  apelBendera = t <= 0 ? 1 : t >= 1 ? 0 : 1 - t;
  if (t >= 0 && t < 1) for (const a of E.aktor) if (a.diam) a.pose = 'hormat';
  pada(E, A.naikMulai, () => { if (audio && audio.state === 'running') mainkanIndonesiaRaya(); });
  pada(E, A.naikMulai + A.naikLama, () => { for (const a of E.aktor) a.pose = null; });
  const tAmanat = A.naikMulai + A.naikLama + 1;              // 12
  pada(E, tAmanat, () => ucapPembina(A.amanat || APEL_PEMBUKA));
  pada(E, tAmanat + 5, () => ucapPembina(APEL_PESAN[(Math.random() * APEL_PESAN.length) | 0]));
  if (A.senin) {
    PANCA_PRASETYA.forEach((baris, i) => pada(E, tAmanat + 9 + i * 3.6, () => ucapPembina(baris)));
  }
  if (A.umur >= A.durasi || !E.aktor.length) bubarApel();
}

function bubarApel() {
  const A = apel;
  apel = null;
  apelBendera = 0;
  for (const a of [...A.E.aktor]) {
    lepaskanAktor(a);
    if (a.standby) {
      if (a.el.isConnected) a.el.remove();
      a.nextMove = now + 1000 + Math.random() * 3000;
    } else {
      a.goTo(stasiunPulang(a));
    }
  }
}

function cekApel() {
  if (APEL_PAKSA && !apelPaksaSudah) {
    apelPaksaSudah = true;
    mulaiApel(APEL_PAKSA === 'senin', true);   // paksa: abaikan babak & penanda, penanda tidak ditulis
    return;
  }
  const d = new Date();
  if (babakHari(ambien().jam, d) !== 'apel') return;
  if (document.hidden) return;                 // "halaman terbuka" — rAF-nya pun berhenti kalau tersembunyi
  if (ingatan.baca('apelTerakhir', '') === tanggalLokal(d)) return;
  mulaiApel(d.getDay() === 1, false);
}

/* ---------------------------------------------------------- tema kalender ---
   Registri dekor musiman: satu tabel TEMA (id, syarat tanggal), dekornya
   menempel di RUANGAN.tema, dievaluasi saat muat dan tiap ganti hari, lalu
   digambar oleh gambarTemaDinding() (sisipan satu baris di drawWall, di
   bawah neon) dan gambarTemaMeja() (sisipan satu baris di drawMejaKerja).
   Bukan event: tidak ada durasi, tidak ada aktor, tidak ada cooldown —
   dekor ini ada sepanjang tanggalnya berlaku, seperti kantor sungguhan.
   Event acak bertema sama (hormat-bendera, ramadan-siang-sunyi, hari-korpri,
   tahun-anggaran-baru) tetap jalan: dekor mereka tidak ada yang dobel dengan
   ini (sajadah ramadan di lantai vs jadwal di dinding, seragam korpri vs
   spanduk), jadi tidak perlu saling kunci. S.tema tersedia kalau suatu hari
   perlu. Uji: ?tema=agustusan|ramadan|korpri|tahun-anggaran.
   Dipoll sendiri (30 detik, sama dengan seragam harian), bukan dari
   terapkanSeragamHarian(): fungsi itu sudah dipanggil saat muat, jauh sebelum
   RUANGAN didefinisikan. */
const TEMA_PAKSA = new URLSearchParams(location.search).get('tema');
const TEMA = [
  { id: 'agustusan',      syarat: (d) => d.getMonth() === 7 && d.getDate() <= 17 },
  // taksirHijri ada di event-acak.js (dimuat sesudah berkas ini) — evaluasi
  // pertama ditunda setTimeout(0) supaya dia sudah ada
  { id: 'ramadan',        syarat: (d) => typeof taksirHijri === 'function' && taksirHijri(d).bulan === 9 },
  { id: 'korpri',         syarat: (d) => d.getMonth() === 10 && d.getDate() === 29 },
  { id: 'tahun-anggaran', syarat: (d) => d.getMonth() === 0 && d.getDate() <= 7 },
];
const TEMA_ID = new Set(TEMA.map((t) => t.id));
let temaHariTerpasang = null;
function terapkanTema() {
  const d = new Date();
  const kunci = tanggalLokal(d);
  if (kunci === temaHariTerpasang) return;
  temaHariTerpasang = kunci;
  const paksa = TEMA_PAKSA && TEMA_ID.has(TEMA_PAKSA) ? TEMA_PAKSA : null;
  RUANGAN.tema = paksa || (TEMA.find((t) => t.syarat(d)) || { id: null }).id;
  RUANGAN.temaTahun = d.getFullYear();
}
setTimeout(terapkanTema, 0);
setInterval(terapkanTema, 30000);

// Taksiran jam imsak/berbuka per bulan (kira-kira Jakarta) — cukup buat papan
// pengumuman kantor, bukan buat ibadah; "sebut jam saja".
const RAMADAN_IMSAK = ['04.20', '04.30', '04.35', '04.30', '04.30', '04.35', '04.40', '04.40', '04.30', '04.15', '04.05', '04.05'];
const RAMADAN_BUKA  = ['18.15', '18.15', '18.05', '17.55', '17.45', '17.45', '17.50', '17.55', '17.50', '17.45', '17.50', '18.05'];

function gambarSpanduk(teks, warna) {
  const x = 192, y = 4, w = 74, h = 12;       // di atas ceruk jendela, di kanan neon kiri, sebelum foto pejabat
  r(x - 2, y + 2, 2, 8, '#8b8f86');           // ikatan ke paku
  r(x + w, y + 2, 2, 8, '#8b8f86');
  r(x, y, w, h, warna);
  r(x, y, w, 1, sh(warna, 1.3));
  r(x, y + h - 1, w, 1, sh(warna, 0.7));
  ctx.font = '6px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fdf6ec';
  ctx.fillText(teks, Math.round(x + (w - ctx.measureText(teks).width) / 2), y + h / 2 + 0.5);
}

function gambarUmbulUmbul() {
  r(0, 24, W, 1, '#b9bcb2');                  // tali sepanjang dinding
  for (let x = 2; x < W; x += 8) {
    const c = ((x / 8) | 0) % 2 === 0 ? P.red : '#f4f2ec';
    const goyang = Math.sin(now / 500 + x * 0.3) > 0 ? 1 : 0;
    r(x, 25, 6, 2, c); r(x + 1, 27, 4, 2, c); r(x + 2, 29, 2, 1 + goyang, c);
  }
}

function gambarPapanRamadan() {
  const x = 418, y = 54, w = 20, h = 30;      // celah dinding antara rak server dan pintu kadis, di bawah rambu
  r(x - 1, y - 1, w + 2, h + 2, '#6d5535');
  r(x, y, w, h, P.paper);
  r(x, y, w, 6, '#3e6b4f');                   // kepala hijau + bulan sabit
  ctx.fillStyle = '#f5d76e'; ctx.beginPath(); ctx.arc(x + 5, y + 3, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3e6b4f'; ctx.beginPath(); ctx.arc(x + 6, y + 2.6, 1.6, 0, Math.PI * 2); ctx.fill();
  r(x + 9, y + 2, 8, 2, '#f5d76e');
  const b = new Date().getMonth();
  ctx.font = '5px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2b2118';
  ctx.fillText('IMSAK', x + 2, y + 10);
  ctx.fillText(RAMADAN_IMSAK[b], x + 2, y + 15);
  ctx.fillText('BUKA', x + 2, y + 21);
  ctx.fillText(RAMADAN_BUKA[b], x + 2, y + 26);
}

function gambarTemaDinding() {
  const t = RUANGAN.tema;
  if (!t) return;
  const th = RUANGAN.temaTahun || new Date().getFullYear();
  if (t === 'agustusan') { gambarUmbulUmbul(); gambarSpanduk('DIRGAHAYU RI KE-' + (th - 1945), P.red); }
  else if (t === 'korpri') gambarSpanduk('HUT KORPRI KE-' + (th - 1971), '#28406b');
  else if (t === 'tahun-anggaran') gambarSpanduk('TAHUN ANGGARAN ' + th, '#3e6b4f');
  else if (t === 'ramadan') gambarPapanRamadan();
}

// Bendera kecil bertiang lidi di tiap meja kerja, di sebelah pot mini (x+33..37);
// laptop mulai x+45, jadi x+38..44 memang celah yang tersisa.
function gambarTemaMeja(x, y) {
  if (RUANGAN.tema !== 'agustusan') return;
  r(x + 38, y - 10, 1, 17, '#c9ced4');
  r(x + 39, y - 10, 5, 2, P.red);
  r(x + 39, y - 8, 5, 2, '#f4f2ec');
}

/* -------------------------------------------------------------------- loop */
let last = performance.now();
let dripT = 0;
let frameGambarTs = -1e9;   // ts frame terakhir yang benar-benar digambar (jatah 30 fps)

/* Penjadwal frame. rAF dijeda peramban saat tab tersembunyi; di mode ringan
   simulasinya tetap dijalankan 15 fps lewat setTimeout supaya pegawai tidak
   melompat waktu tab dibuka lagi — dan jam ruangan tetap terasa jalan. Di mode
   biasa tetap rAF murni (dijeda saat tersembunyi), persis seperti dulu. */
function jadwalFrame() {
  if (ringanAktif() && document.hidden) {
    // Timer halaman di tab tersembunyi di-throttle Chrome ke ~1 Hz; timer di
    // Worker tidak (diukur: 30 ketukan/2 s vs 3). Worker-nya dibuat saat
    // dibutuhkan dan dimatikan sendiri begitu ketukannya tidak ditunggu lagi
    // (tab tampak → rantai kembali ke rAF). Gagal bikin Worker → setTimeout.
    if (!tickerSembunyi) tickerSembunyi = buatTickerSembunyi();
    if (tickerSembunyi) { tickerSembunyi.tunggu = true; return; }
    setTimeout(() => frame(performance.now()), 1000 / 15);
    return;
  }
  requestAnimationFrame(frame);
}
let tickerSembunyi = null;
function buatTickerSembunyi() {
  try {
    const src = 'setInterval(function(){postMessage(0)},' + Math.round(1000 / 15) + ')';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.tunggu = false;
    w.onmessage = () => {
      if (!w.tunggu) { w.terminate(); if (tickerSembunyi === w) tickerSembunyi = null; return; }
      w.tunggu = false;
      frame(performance.now());
    };
    return w;
  } catch { return null; }
}

function frame(ts) {
  const ringan = ringanAktif();
  // Mode ringan: 30 fps. Frame yang terlalu cepat dilewati TANPA menyentuh
  // `last`, jadi dt frame berikutnya menampung dua interval — simulasinya
  // tetap tepat waktu, cuma digambar separuh sesering. Toleransi 1,5 ms
  // supaya 60 Hz tepat terbagi dua (16,7 → skip, 33,3 → gambar).
  if (ringan && !document.hidden && ts - frameGambarTs < 1000 / 30 - 1.5) { requestAnimationFrame(frame); return; }
  frameGambarTs = ts;
  catatFps(ts);
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  now = ts;
  kilat = kilatAktif();

  tickEvent(dt);        // sebelum update: MOD dipasang di sini, dibaca di bawah
  tickKamera(dt);       // sebelum update pegawai: balon DOM-nya dihitung lewat keLayar()
  tickSisip(dt);        // bukaan ruang kadis: gorden + peralihan alpha masuk/keluar
  // prefers-reduced-motion: kipas plafon dibekukan (animasi non-esensial);
  // kedip neon & langkah pegawai tetap — itu isi ruangannya, bukan hiasan
  if (!geraKurang.matches) putarKipas += dt * 11 * MOD.kipas;

  // disalin dulu: peserta yang sampai di pintu menghapus dirinya saat update
  for (const a of [...agents.values(), ...peserta, ...standby]) a.update(dt);
  dripT += dt;
  if (dripT > MOD.drip) { dripT = 0; spawn('drip', 347, 30); }  // AC-nya memang bocor
  updateParts(dt);
  updateDebu(dt);

  const busy = [...agents.values(), ...peserta, ...standby].filter((a) => a.state === 'work');
  const activeStations = new Set(busy.map((a) => a.station));

  // Getaran genset/gempa: seluruh kanvas digeser, bukan tiap prop satu-satu.
  // ctx.restore() ada SEBELUM taruhKartu() — kartu itu div DOM yang diposisikan
  // lewat offX/scale, jadi harus tidak ikut bergeser atau akan meleset dari orangnya.
  ctx.save();
  // Kamera: sesudah skala integer fit() (yang itu CSS, bukan ctx), sebelum
  // segala gambar. tx/ty sudah bulat, zoom bulat di luar masa easing.
  ctx.setTransform(KAMERA.zoom, 0, 0, KAMERA.zoom, KAMERA.tx, KAMERA.ty);
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
  // tanpa ini mereka tertelan perabot, bukan lewat. Batas bawahnya 230, bukan
  // 240: event yang memarkir orang berdiri DIAM di depan meja (gorengan-di-
  // meja-rapat, oleh-oleh-dinas-luar di y=240; hari-korpri di y=234) jatuh
  // tepat di bawah 240 lama — sandaran kursi jauh ke depan/atas dan menelan
  // separuh badannya, cuma kaki yang tersisa kelihatan.
  for (const a of [...agents.values(), ...peserta, ...standby]) {
    // Yang sedang di dalam bukaan ruang kadis digambar oleh gambarSisipKadis()
    // dengan tabel sortnya sendiri, di dalam klip bukaan.
    // YANG DIGERBANGI HANYA PENGGAMBARAN, TIDAK PERNAH PEMBARUAN — jangan
    // pernah menaruh if seperti ini di loop update() di atas.
    if (a.diKadis) continue;
    const diPitaBawah = a.y >= 230 && a.y < 266;
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

  /* Bukaan ruang kadis. SESUDAH layers: bukaan menang atas apa pun yang
     ditumpanginya — dan justru karena itu kotak SISIP (x290..362, y33..79)
     dipilih dari sapuan piksel seluruh perabot lama: NOL prop lama yang
     tertimpa — termasuk keempat dekor tema dinding (agustusan, ramadan,
     korpri, tahun-anggaran) dan ekor cicak yang cuma lewat 70 ms di kolom
     289 — dijaga kasus "sapuan prop lama" di uji-sisip.mjs, yang sekarang
     mencuplik umur event tiap 0,02 detik. SEBELUM drawParts: tetesan AC yang
     di-spawn di (347,30) jatuh DI DEPAN kaca menuju ember di y=124 — benar
     secara fisik dan gag ember bocor selamat. drawAmbien()/drawDebu()/vignette
     tetap sesudahnya, jadi bukaannya ikut tergelapkan malam dan ikut berdebu:
     itu yang bikin dia terbaca menempel di dinding, bukan HUD. */
  gambarSisipKadis();

  drawParts();
  drawAmbien();
  drawDebu();           // sesudah selubung suasana: debu harus ditembus cahaya, bukan ikut digelapkan
  gambarLapis('gambarAtas');

  // vignette milik layar, bukan ruangan: waktu kamera membidik pojok, yang
  // gelap tetap tepi bidikan — bukan pojok ruangan yang sedang dilihat
  if (KAMERA.zoom !== 1) ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (ringan) ctx.drawImage(vignetteLapis(MOD.vignette), 0, 0);   // dari cache; digambar ulang cuma saat alphanya berubah
  else {
    const g = ctx.createRadialGradient(W / 2, 165, 70, W / 2, 165, 370);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(30,40,30,' + MOD.vignette.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();

  taruhKartu();
  jadwalFrame();
}

// Vignette mode ringan: milik layar (bukan ruangan), jadi kameranya tidak
// pernah mengubahnya — kuncinya cuma alpha MOD.vignette. Event yang
// meng-lerp alphanya tiap frame membuatnya digambar ulang tiap frame juga,
// sama dengan sebelumnya; tidak pernah lebih buruk.
let vignetteCache = null, vignetteKunci = '';
function vignetteLapis(alpha) {
  const kunci = alpha.toFixed(3);
  if (vignetteCache && vignetteKunci === kunci) return vignetteCache;
  if (!vignetteCache) { vignetteCache = document.createElement('canvas'); vignetteCache.width = W; vignetteCache.height = H; }
  const k = vignetteCache.getContext('2d');
  k.clearRect(0, 0, W, H);
  const g = k.createRadialGradient(W / 2, 165, 70, W / 2, 165, 370);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(30,40,30,' + kunci + ')');
  k.fillStyle = g;
  k.fillRect(0, 0, W, H);
  vignetteKunci = kunci;
  return vignetteCache;
}

jagaPopulasi();      // ruangan sudah berisi sejak halaman dibuka
muatCuaca();         // cuaca perdana; diperbarui sendiri tiap 10 menit
setInterval(muatCuaca, 10 * 60 * 1000);
fit();
requestAnimationFrame(frame);
