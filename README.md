# UT/UAT Scenario Studio — GitHub Pages edition

Versi browser-only. Seluruh tampilan, editor, proyek lokal, checklist, import/export XLSX dan backup JSON berjalan di browser. Tidak memerlukan Python, server aplikasi, database, npm, CDN atau build. Mode AI menghubungi penyedia API langsung dari browser dengan API key pribadi masing-masing pengguna.

## Publikasi di GitHub Pages

1. Ekstrak paket dan upload **isi** folder ini (bukan folder pembungkus) ke repository `liklike216/utuattestinggenerator` pada branch `main`.
2. Pastikan `index.html`, `app.js`, `core.mjs`, `excel.mjs`, `demo.json`, `style.css`, `icon.png`, dan `.nojekyll` berada di root repository.
3. Buka **Settings → Pages → Build and deployment → Deploy from a branch**. Pilih **main** dan **/(root)**, lalu Save.
4. Tunggu deployment GitHub selesai. Alamat yang dituju: `https://liklike216.github.io/utuattestinggenerator/`.

Alamat ini merupakan target publikasi; paket lokal tidak membuktikan situs sudah live. Semua URL asset memakai path relatif sehingga dapat berjalan pada subfolder repository.

Jangan upload `.env`, file `.bak`, `data/`, `.runtime/`, API key, atau seluruh folder aplikasi Python lama. Paket ini sudah dipisahkan dari file tersebut.

Panduan resmi: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

## Memakai aplikasi

- **Contoh MIRO** memuat requirement contoh. Generate pada mode Demo menghasilkan skenario kurasi, bukan hasil AI.
- **Checklist lokal** membuat kerangka skenario untuk requirement sendiri tanpa API. Lengkapi test data, steps dan expected result. Ini bukan analisis semantik atau jaminan coverage lengkap.
- **AI · API key pribadi** memakai endpoint yang dikonfigurasi pada Pengaturan AI. Generate mengganti draft setelah konfirmasi. Review menampilkan kandidat tambahan tanpa menghapus skenario lama.
- Klik skenario untuk mengedit dan menghubungkan requirement.
- **Simpan proyek** menyimpan pada localStorage browser, bukan di GitHub. Tidak ada sinkronisasi otomatis antar-user atau perangkat. Hapus data situs/incognito dapat menghilangkan proyek.
- **Proyek tersimpan → Backup JSON** mengunduh proyek tersimpan beserta workspace saat ini. **Import JSON** dapat membaca backup ini maupun satu file proyek `.json` dari folder `data` aplikasi Python lama.
- Draft yang belum lengkap mungkin belum dapat dibackup sampai field wajib diisi. Simpan atau backup sebelum berpindah perangkat.

## API key pribadi dan kompatibilitas

1. Buka Pengaturan AI.
2. Isi base URL HTTPS tanpa endpoint akhir, misalnya `https://api.openai.com/v1`.
3. Pilih Responses API atau Chat Completions untuk gateway yang kompatibel.
4. Masukkan nama model yang tersedia di akun dan mendukung JSON Schema.
5. Masukkan key pribadi, baca tujuan pengiriman data, centang persetujuan lalu simpan untuk sesi tab ini.
6. Pilih mode AI dan Generate/Review.

Key disimpan dalam variabel memori tab saja. Tidak disimpan di localStorage, sessionStorage, JSON, Excel, log, GitHub, atau source code. Key dihapus dari field sesudah konfigurasi dan hilang saat reload/menutup tab. Tidak ada key bawaan atau key perusahaan bersama. Semua pengguna membayar pemakaian akun API mereka sendiri.

Browser tetap memiliki akses ke key selama tab aktif. Gunakan perangkat pribadi dan hindari ekstensi yang tidak dipercaya. Ini tidak memberi perlindungan secret setara backend. UI mewajibkan persetujuan tujuan penyedia sebelum menyimpan key sesi.

Penyedia harus mengizinkan CORS untuk origin `https://liklike216.github.io`, termasuk header Authorization/Content-Type. Jika penyedia memblokir akses browser, mode AI langsung tidak dapat berjalan hanya dengan GitHub Pages; tidak ada proxy publik/bypass otomatis. Error jaringan/CORS ditampilkan tanpa membocorkan key. Mode demo/checklist, editor dan Excel tetap dapat digunakan.

Responses memakai `text.format` JSON Schema dan `store: false`. Chat Completions memakai `response_format` JSON Schema. Respons divalidasi sebelum mengganti hasil. Tidak ada retry otomatis yang diam-diam menambah biaya. Tombol Batalkan menghentikan fetch lokal; provider mungkin sudah memproses permintaan.

Referensi: https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses

## Excel

Import menerima sheet pertama dengan enam header persis:

`ID`, `Scenario`, `Type`, `Preconditions / Test Data`, `Expected Result*`, `Actual / Status`.

Import maksimal 5 MB / 300 skenario, mendukung XLSX ZIP store/deflate dan shared strings/inline strings. Formula dan workbook terenkripsi ditolak. Gunakan Chrome/Edge terbaru yang mendukung `DecompressionStream('deflate-raw')` untuk membaca XLSX terkompresi. ID bentrok diberi suffix agar tidak menimpa skenario lama.

Export menghasilkan tiga sheet: UT UAT (template asli), Detail (level, langkah, mapping, status), dan Requirement (konteks/klarifikasi). Semua isi disimpan sebagai string, bukan formula. Import Excel membaca enam kolom utama; gunakan backup JSON untuk mempertahankan seluruh workspace.

## Data dan batas penggunaan

Seluruh kode dan contoh demo yang diupload ke Pages bersifat publik. Proyek pribadi tidak diupload oleh aplikasi. Mode AI hanya mengirim data ketika pengguna menekan Generate/Review dan mengikuti biaya/retensi penyedia. Aplikasi tidak menjalankan transaksi di SAP.

Status review dikembalikan ke Draft ketika konteks berubah. Mapping dihapus ketika requirement diedit agar referensi lama tidak dianggap valid. Status Passed hanya diisi setelah testing oleh pengguna.

Untuk preview pengembangan saja, jalankan static HTTP server pada folder ini. Server tersebut tidak dibutuhkan setelah situs dipublikasikan di GitHub Pages.
