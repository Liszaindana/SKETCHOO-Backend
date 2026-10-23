# Backend SKETCHOO

REST API berbasis NestJS untuk aplikasi SKETCHOO. NestJS menangani autentikasi, otorisasi, data aplikasi, dan orkestrasi. Layanan FastAPI yang terpisah dikhususkan untuk kebutuhan machine learning.

## Persiapan lokal

1. Pasang dependensi dengan `npm install`.
2. Salin `.env.example` menjadi `.env`, lalu isi nilai konfigurasi proyek Supabase.
3. Terapkan SQL di `supabase/migrations/` ke proyek Supabase.
4. Jalankan API dengan `npm run start:dev`.

Prefix API berversi secara default adalah `/api/v1`. Endpoint kesehatan adalah `GET /health` dan tidak memerlukan autentikasi. Telemetri Observe dinonaktifkan kecuali `OBSERVE_APP_KEY` dan `OBSERVE_APP_SECRET` sudah dikonfigurasi.

## Autentikasi

NestJS menyerahkan pengelolaan kata sandi dan sesi kepada Supabase Auth. Rute yang sudah tersedia:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/verify-reset-code`
- `POST /api/v1/auth/reset-password`
- `GET` dan `PATCH /api/v1/users/me`

Reset kata sandi menggunakan OTP pemulihan dari Supabase, lalu token reset acak yang sudah di-hash dan hanya dapat digunakan sekali. Token disimpan di `password_reset_tokens`. Atur `SUPABASE_SECRET_KEY` atau `SUPABASE_SERVICE_ROLE_KEY` di berkas `.env` backend dan konfigurasi templat email pemulihan Supabase agar mengirim token enam digit. Simpan key dengan hak akses tinggi ini hanya di server; jangan pernah memasukkannya ke Flutter. Pembatas laju autentikasi saat ini menggunakan penyimpanan di dalam proses, jadi deployment produksi dengan beberapa instance memerlukan penyimpanan pembatas laju bersama.

## Fondasi Sekolah dan Smartboard

Terapkan migration sesuai urutan nama berkas. Migration tersebut membuat tabel token reset kata sandi sekali pakai, data sekolah dan keanggotaan, kelas, profil siswa, sesi dan peserta Smartboard, catatan aktivitas dan audit, serta fondasi data belajar untuk misi/progres, template dan kiriman sketsa, soal dan jawaban Explore, serta cerita. Kiriman belajar mendukung akun mandiri dan profil siswa dalam sesi Smartboard. RLS diaktifkan dan tidak ada kebijakan akses langsung untuk klien; key Supabase khusus server memperoleh hak akses tabel dan tidak pernah dikirim ke Flutter.

Rute sekolah/admin yang sudah tersedia:

- `GET /api/v1/admin/dashboard`
- `GET|POST /api/v1/admin/classrooms`; `PATCH /api/v1/admin/classrooms/:classroom_id`
- `GET|POST /api/v1/admin/students`; `GET|PATCH /api/v1/admin/students/:student_id`
- `GET /api/v1/admin/students/:student_id/progress`
- `GET /api/v1/admin/students/:student_id/history`
- `GET|POST /api/v1/admin/sessions`; `GET /api/v1/admin/sessions/:session_id`
- `POST /api/v1/admin/sessions/:session_id/participants`
- `POST /api/v1/admin/sessions/:session_id/complete`

Rute superadmin yang sudah tersedia:

- `GET /api/v1/superadmin/dashboard`
- `GET|POST /api/v1/superadmin/schools`; `GET|PATCH /api/v1/superadmin/schools/:school_id`
- `GET|POST /api/v1/superadmin/admins`; `PATCH /api/v1/superadmin/admins/:admin_id`
- `GET /api/v1/superadmin/audit-logs`

Profil siswa terpisah dari akun Supabase Auth, sesuai alur Smartboard terpandu dalam spesifikasi. Admin harus memiliki `app_metadata.role = "admin"` dan satu baris aktif di `school_memberships`; API menentukan cakupan sekolah dari keanggotaan tersebut. Akses superadmin menggunakan `app_metadata.role = "superadmin"`. Pendaftaran publik tidak dapat menetapkan peran-peran ini. Pembuatan admin mengaitkan akun Supabase Auth yang sudah ada dan menetapkan perannya; proses ini tidak mengirim email undangan selama SMTP belum dikonfigurasi.

Untuk superadmin pertama, gunakan sesi administrasi Supabase tepercaya untuk menetapkan peran pada pengguna Auth yang dimaksud. Jangan sediakan endpoint publik untuk menaikkan hak akses akun. Perubahan sekolah, perubahan kelas/siswa/sesi, penetapan admin, dan perubahan peran dicatat di `audit_logs`. Migration fondasi data belajar menyiapkan skema untuk API dashboard, misi, sketsa, Explore, dan cerita; endpoint serta alur fitur tersebut masih tahap implementasi berikutnya.

Contoh penyiapan awal untuk akun Auth yang sudah ada (ganti UUID, lalu jalankan satu kali di SQL Editor Supabase):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"superadmin"}'::jsonb
where id = 'AUTH_USER_UUID';
```

Akun tersebut harus masuk kembali agar memperoleh token dengan peran barunya. `POST /api/v1/superadmin/admins` mengaitkan akun Auth yang sudah ada berdasarkan email. Karena SMTP sengaja belum diaktifkan, endpoint ini tidak mengirim undangan. Endpoint ini menetapkan `app_metadata.role` tepercaya pada akun dan membuat keanggotaan sekolahnya.

## API belajar

Endpoint berikut memerlukan Bearer token untuk akun pembelajar:

- `GET /api/v1/dashboard`
- `GET /api/v1/missions`
- `GET /api/v1/sketch/templates` dan `GET /api/v1/sketch/submissions`
- `GET /api/v1/explore/activities`, `GET /api/v1/explore/questions`, dan `POST /api/v1/explore/attempts`
- `GET /api/v1/stories` dan `GET /api/v1/stories/:story_id`
- `GET /api/v1/history` dan `GET /api/v1/progress/summary`

Data misi, template, soal, kiriman, dan cerita dibaca dari tabel Supabase; daftar akan kosong jika datanya belum dimasukkan. Jawaban benar soal Explore tidak disertakan saat mengambil soal dan poin dihitung server saat jawaban dikirim. Upload gambar untuk Sketch Challenge dan pembuatan cerita dengan AI belum tersedia karena integrasi Storage dan layanan AI belum dibuat.

## Konvensi API

- DTO request menggunakan validation pipe global: field yang tidak dikenal akan ditolak dan nilai diubah sesuai tipe yang dideklarasikan.
- Format error menggunakan `{ "error": { "code", "message", "details", "request_id" } }`.
- Setiap respons menyertakan header `x-request-id` untuk menghubungkan log dan kebutuhan dukungan.
- Jangan commit `.env` atau menaruh Supabase service-role key di konfigurasi API publik/klien.

## Perintah yang sering digunakan

- `npm run start:dev` — menjalankan server pengembangan dengan reload otomatis
- `npm run build` — mengompilasi aplikasi
- `npm run lint` — memeriksa lint pada source dan tes
