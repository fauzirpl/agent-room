#!/usr/bin/env node
/* telaah.mjs :: lembar telaah staf — menilai NIAT sebuah tindakan, bukan hasilnya.
 *
 * Hari ini kantor bisa membedakan tool yang GAGAL dari yang berhasil
 * (`isError()` di server.mjs membaca is_error/exit_code), tapi tidak ada satu
 * baris pun yang membedakan `ls` dari `rm -rf`. Kartu paraf cuma menempelkan
 * `tool · ringkasan` 300 karakter apa adanya, jadi orang yang diminta memaraf
 * harus membaca perintahnya sendiri dan menilainya sendiri, tiap kali, cepat-
 * cepat. Itu cara paling gampang membuat paraf jadi stempel.
 *
 * Modul ini menyediakan bahan telaahnya. Tiga sifat yang menentukan bentuknya:
 *
 *   1. MURNI. Tidak ada I/O, tidak ada state, tidak ada efek samping. Satu
 *      fungsi, masuk-keluar. Itu yang membuatnya bisa dipakai dari DUA proses
 *      berbeda — `server.mjs` dan `mcp-izin.mjs` — tanpa menyalin aturan.
 *   2. TIDAK PERNAH MEMUTUSKAN. Ia melapor; yang memaraf tetap manusia. Tidak
 *      ada di sini yang menahan pegawai, menunda antrean, atau menolak tool.
 *      NOTA BUKAN REM berlaku penuh.
 *   3. `tanda` BERISI NAMA POLA, BUKAN POTONGAN PERINTAH. Ini yang membuat
 *      hasil telaah aman ikut ke buku agenda dan nota dinas keluar: yang
 *      dibawa "hapus-rekursif-paksa", bukan `rm -rf /home/…`. Isi perintahnya
 *      tidak pernah keluar dari sini.
 *
 * Yang SENGAJA tidak dibaca: badan berkas (`content`, `new_string`). Menilai
 * isi tulisan akan menandai dokumen yang KEBETULAN menyebut `rm -rf` — seperti
 * berkas ini sendiri — dan itu kebisingan yang menghancurkan kepercayaan orang
 * pada pitanya. Yang dinilai cuma perintah dan jalur berkas.
 *
 * Pakai:
 *   import { telaahRisiko } from './telaah.mjs';
 *   telaahRisiko('Bash', { command: 'rm -rf build' })
 *   // -> { tingkat: 'tinggi', tanda: ['hapus-rekursif-paksa'] }
 *
 * Dijalankan langsung, ia menelaah argumennya — enak buat mencoba pola:
 *   node telaah.mjs Bash "git push --force origin main"
 */

import { pathToFileURL } from 'node:url';

/* Medan `tool_input` yang dibaca. Ditulis eksplisit, bukan "semua string yang
   ketemu": menyapu seluruh objek akan ikut menelan badan berkas lewat pintu
   belakang begitu ada tool baru yang menamai medannya lain. */
export const MEDAN_DIBACA = [
  'command',        // Bash
  'file_path',      // Read/Edit/Write
  'notebook_path',  // NotebookEdit
  'path',           // beberapa tool MCP
  'url',            // WebFetch
  'query',          // tool basis data
  'sql',            // tool basis data
];

const T = { tinggi: 3, sedang: 2, rendah: 1 };

/* Tabel pola. Terbuka dan sengaja bisa dibaca orang: yang menilai tetap
   manusia, jadi daftarnya harus bisa diperiksa manusia juga.

   Aturan menulis pola di sini:
   - Selalu pakai batas kata (`\b`). Tanpa itu `sudo` cocok di dalam
     "sudoku" — dan `rm` di dalam "charm" — sehingga pitanya jadi bohong.
   - Pola git dikurung `\bgit\b[^|;\n]*` supaya `--force` milik `npm install`
     tidak dibaca sebagai `git push --force`. Kelas `[^|;\n]` menjaga agar
     satu segmen perintah tidak bocor ke segmen berikutnya.
   - Kuantifier selalu berbatas (`{0,200}`), tidak pernah `.*` bersarang —
     regex yang bisa meledak waktunya adalah bug keamanan, bukan cuma lambat. */
export const RISIKO_POLA = [
  // ————————————————————————————————————————————————— tinggi
  { id: 'hapus-rekursif-paksa', tingkat: 'tinggi', pola: [
    /\brm\s+(?:-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i,
    /\brm\s+(?:--recursive\s+--force|--force\s+--recursive)\b/i,
    /\brmdir\s+\/s\b/i,
    /\bRemove-Item\b[^|;\n]{0,120}-Recurse\b[^|;\n]{0,120}-Force\b/i,
    /\bRemove-Item\b[^|;\n]{0,120}-Force\b[^|;\n]{0,120}-Recurse\b/i,
  ] },
  { id: 'git-push-paksa', tingkat: 'tinggi', pola: [
    /\bgit\b[^|;\n]{0,200}\bpush\b[^|;\n]{0,200}(?:--force(?!-with-lease)|\s-f)\b/i,
  ] },
  { id: 'git-reset-keras', tingkat: 'tinggi', pola: [
    /\bgit\b[^|;\n]{0,200}\breset\b[^|;\n]{0,200}--hard\b/i,
  ] },
  { id: 'git-clean-paksa', tingkat: 'tinggi', pola: [
    /\bgit\b[^|;\n]{0,200}\bclean\b[^|;\n]{0,200}-[a-z]{0,4}f/i,
  ] },
  { id: 'git-hapus-cabang', tingkat: 'tinggi', pola: [
    /\bgit\b[^|;\n]{0,200}\bbranch\b[^|;\n]{0,200}(?:-D|--delete\s+--force)\b/,
  ] },
  { id: 'unduh-lalu-jalankan', tingkat: 'tinggi', pola: [
    /\b(?:curl|wget|iwr|Invoke-WebRequest)\b[^|\n]{0,200}\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|python[0-9.]*|node|perl|ruby)\b/i,
  ] },
  { id: 'jalan-sebagai-root', tingkat: 'tinggi', pola: [
    /\bsudo\b/i,
    /\bdoas\b/i,
  ] },
  { id: 'izin-berkas-terbuka', tingkat: 'tinggi', pola: [
    /\bchmod\s+(?:-[a-z]+\s+)*777\b/i,
  ] },
  { id: 'sql-hancurkan', tingkat: 'tinggi', pola: [
    /\bdrop\s+(?:table|database|schema)\b/i,
    /\btruncate\s+table\b/i,
  ] },
  { id: 'sql-hapus-tanpa-syarat', tingkat: 'tinggi', pola: [
    /\bdelete\s+from\b(?![^;]{0,400}\bwhere\b)/i,
  ] },
  { id: 'tulis-perangkat-mentah', tingkat: 'tinggi', pola: [
    /\bmkfs(?:\.[a-z0-9]+)?\b/i,
    /\bdiskpart\b/i,
    /\bdd\b[^|;\n]{0,120}\bof=\/dev\//i,
  ] },
  { id: 'lewati-pemeriksaan', tingkat: 'tinggi', pola: [
    /--no-verify\b/,
    /--no-gpg-sign\b/,
  ] },
  { id: 'terbitkan-paket', tingkat: 'tinggi', pola: [
    /\bnpm\s+publish\b/i,
    /\bcargo\s+publish\b/i,
  ] },
  { id: 'tulis-ulang-riwayat', tingkat: 'tinggi', pola: [
    /\bgit\b[^|;\n]{0,200}\bfilter-branch\b/i,
    /\bgit\b[^|;\n]{0,200}\bpush\b[^|;\n]{0,200}\s:\s*[a-z0-9._\/-]+/i,   // push origin :cabang = hapus cabang jauh
  ] },

  // ————————————————————————————————————————————————— sedang
  { id: 'berkas-rahasia', tingkat: 'sedang', pola: [
    /(?:^|[\s"'=\/\\])\.env(?:\.[a-z0-9]+)?\b/i,
    /\bid_rsa\b|\bid_ed25519\b/i,
    /\.pem\b|\.p12\b|\.pfx\b/i,
    /\bcredentials(?:\.json)?\b/i,
    /\bsecrets?\.(?:json|ya?ml|toml|env)\b/i,
    /\.npmrc\b|\.pypirc\b/i,
  ] },
  { id: 'git-push', tingkat: 'sedang', pola: [
    /\bgit\b[^|;\n]{0,200}\bpush\b/i,
  ] },
  { id: 'git-push-hati-hati', tingkat: 'sedang', pola: [
    /--force-with-lease\b/i,
  ] },
  { id: 'pasang-global', tingkat: 'sedang', pola: [
    /\bnpm\s+(?:i|install|add)\b[^|;\n]{0,120}(?:\s-g\b|--global\b)/i,
    /\b(?:pnpm|yarn|bun)\s+(?:add|install)\b[^|;\n]{0,120}(?:\s-g\b|--global\b)/i,
    /\bpip[0-9.]*\s+install\b[^|;\n]{0,120}--break-system-packages\b/i,
  ] },
  { id: 'docker-buang', tingkat: 'sedang', pola: [
    /\bdocker\b[^|;\n]{0,120}\b(?:rm|rmi|prune)\b/i,
  ] },
  { id: 'kubectl-ubah', tingkat: 'sedang', pola: [
    /\bkubectl\b[^|;\n]{0,120}\b(?:delete|apply|replace|scale|drain)\b/i,
  ] },
  { id: 'terraform-ubah', tingkat: 'sedang', pola: [
    /\bterraform\b[^|;\n]{0,120}\b(?:apply|destroy)\b/i,
  ] },
  { id: 'matikan-proses', tingkat: 'sedang', pola: [
    /\bkill\s+-9\b/i,
    /\bpkill\b|\bkillall\b/i,
    /\bStop-Process\b[^|;\n]{0,120}-Force\b/i,
  ] },
];

/* Tool MCP dinilai dari NAMANYA, bukan dari argumennya: yang tahu sebuah tool
   mengubah keadaan cuma penyedianya, dan satu-satunya petunjuk yang kita punya
   adalah kata kerja di namanya. Sengaja tidak memuat `write`/`update`/`create`
   — terlalu umum, dan pita yang menyala terus sama tidak bergunanya dengan
   pita yang tidak pernah menyala. */
export const MCP_KATA_UBAH = [
  'delete', 'remove', 'drop', 'deploy', 'execute_sql', 'apply_migration',
  'merge', 'pause', 'reset', 'restore', 'revoke',
];

const MAKS_TANDA = 4;

/* Pola umum yang TERTELAN pola yang lebih tajam. `git push --force` sudah pasti
   juga cocok dengan pola `git push` biasa, dan menampilkan keduanya cuma
   memakan jatah empat tanda tanpa memberi tahu apa pun yang baru. Kuncinya
   yang ditelan, nilainya yang menelan. */
const TERTELAN = {
  'git-push': ['git-push-paksa', 'git-push-hati-hati', 'tulis-ulang-riwayat'],
};

/* Merangkai medan yang dibaca jadi satu teks. Objek bersarang diikuti satu
   tingkat saja (mis. `{ edits: [{ file_path }] }`), dan seluruhnya dibatasi
   supaya payload raksasa tidak membuat telaah jadi mahal. */
const BATAS_TEKS = 20000;

function petikTeks(input) {
  if (input == null) return '';
  if (typeof input === 'string') return input.slice(0, BATAS_TEKS);
  if (typeof input === 'number' || typeof input === 'boolean') return String(input);
  if (Array.isArray(input)) {
    return input.slice(0, 32).map((x) => petikTeks(x)).join('\n').slice(0, BATAS_TEKS);
  }
  if (typeof input !== 'object') return '';
  const bagian = [];
  for (const k of MEDAN_DIBACA) {
    const v = input[k];
    if (typeof v === 'string') bagian.push(v);
    else if (typeof v === 'number') bagian.push(String(v));
  }
  /* Satu tingkat ke dalam untuk bentuk seperti MultiEdit `{ edits: [...] }`.
     Nilai yang bukan larik/objek dilewati — badan berkas tidak pernah ikut
     karena namanya memang tidak ada di MEDAN_DIBACA. */
  for (const v of Object.values(input)) {
    if (Array.isArray(v)) {
      for (const e of v.slice(0, 32)) {
        if (e && typeof e === 'object' && !Array.isArray(e)) {
          for (const k of MEDAN_DIBACA) if (typeof e[k] === 'string') bagian.push(e[k]);
        }
      }
    }
  }
  return bagian.join('\n').slice(0, BATAS_TEKS);
}

/**
 * Menelaah satu tindakan.
 *
 * @param {string} tool  nama tool, mis. 'Bash' atau 'mcp__supabase__execute_sql'
 * @param {object|string} input  `tool_input` apa adanya, atau teks perintah
 * @returns {{tingkat: 'tinggi'|'sedang'|'rendah', tanda: string[]}}
 *   `tanda` berisi NAMA POLA (maks 4), tidak pernah potongan perintah.
 */
export function telaahRisiko(tool, input) {
  const nama = typeof tool === 'string' ? tool : '';
  const teks = petikTeks(input);

  const kena = [];
  if (teks) {
    for (const p of RISIKO_POLA) {
      for (const re of p.pola) {
        if (re.test(teks)) { kena.push(p); break; }
      }
    }
  }

  /* Tool MCP yang namanya menyiratkan perubahan keadaan. Dinilai walau
     argumennya kosong — yang berbahaya panggilannya, bukan bentuk argumennya. */
  if (/^mcp__/i.test(nama)) {
    const n = nama.toLowerCase();
    if (MCP_KATA_UBAH.some((k) => n.includes(k))) {
      kena.push({ id: 'mcp-mengubah-keadaan', tingkat: 'sedang' });
    }
  }

  if (!kena.length) return { tingkat: 'rendah', tanda: [] };

  /* Urutan deterministik: tinggi dulu, lalu urutan tabel. Uji dan pita di
     halaman sama-sama bergantung pada ini — daftar yang berubah urutan tiap
     panggilan membuat golden mustahil dan mata orang lelah. */
  const urut = new Map(RISIKO_POLA.map((p, i) => [p.id, i]));
  kena.sort((a, b) => (T[b.tingkat] - T[a.tingkat])
    || ((urut.has(a.id) ? urut.get(a.id) : 999) - (urut.has(b.id) ? urut.get(b.id) : 999)));

  const semuaId = new Set(kena.map((p) => p.id));
  const tingkat = kena[0].tingkat;
  const tanda = [];
  for (const p of kena) {
    if (tanda.length >= MAKS_TANDA) break;
    const penelan = TERTELAN[p.id];
    if (penelan && penelan.some((x) => semuaId.has(x))) continue;
    if (!tanda.includes(p.id)) tanda.push(p.id);
  }
  return { tingkat, tanda };
}

/** Tingkat tertinggi dari beberapa telaah. Dipakai waktu satu permintaan izin
 *  dinilai dua kali — dari isi utuh di proses MCP dan dari ringkasannya di
 *  server — dan yang berlaku harus yang paling waspada. */
export function maksTingkat(...tingkat) {
  let menang = 'rendah';
  for (const t of tingkat) if (T[t] && T[t] > T[menang]) menang = t;
  return menang;
}

/* Dijalankan langsung: alat coba-coba, bukan bagian dari pustakanya.
 *
 * Perbandingannya URL penuh, bukan `endsWith('telaah.mjs')`. Bentuk yang
 * gampang itu keliru dan langsung ketahuan: `uji-telaah.mjs` juga berakhiran
 * `telaah.mjs`, jadi mengimpor modul ini dari sana ikut mencetak petunjuk
 * pemakaian ke stdout. Modul pustaka tidak boleh menulis apa pun waktu
 * diimpor — dan `mcp-izin.mjs` yang mengimpornya adalah proses yang stdout-nya
 * KANAL PROTOKOL. Dijaga `uji-telaah.mjs` kasus 8. */
const dijalankanLangsung = (() => {
  try {
    return Boolean(process.argv[1])
      && pathToFileURL(process.argv[1]).href === import.meta.url;
  } catch { return false; }
})();

if (dijalankanLangsung) {
  const [, , tool, ...sisa] = process.argv;
  if (!tool) {
    console.log('pakai: node telaah.mjs <tool> "<perintah atau jalur>"');
    console.log('contoh: node telaah.mjs Bash "rm -rf build && git push --force"');
  } else {
    const hasil = telaahRisiko(tool, sisa.join(' '));
    console.log(hasil.tingkat.toUpperCase() + (hasil.tanda.length ? ' — ' + hasil.tanda.join(', ') : ''));
  }
}
