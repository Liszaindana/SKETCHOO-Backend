# SKETCHOO Backend

Backend REST API SKETCHOO menggunakan NestJS. API menggunakan prefix `/api/v1` dan dokumentasi Swagger tersedia di `/docs`.

## Menjalankan lokal

1. Salin `.env.example` menjadi `.env` jika file lokal belum dibuat.
2. Isi `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` dari **Supabase Dashboard → Project Settings → API Keys**. Legacy `anon` key juga didukung.
3. Jalankan `npm install`, lalu `npm run start:dev`.

Jangan gunakan `secret` atau `service_role` key untuk auth ini. Jangan commit `.env`, dan jangan kirim key ke aplikasi frontend. `SUPABASE_RESET_REDIRECT_URL` opsional; jika diisi, URL tersebut juga harus diizinkan pada pengaturan redirect Supabase Auth.

## Authentication

Semua endpoint berada di bawah `/api/v1`:

| Method | Endpoint | Auth |
|---|---|---|
| POST | `/auth/register` | Tidak |
| POST | `/auth/login` | Tidak |
| POST | `/auth/logout` | Bearer access token |
| POST | `/auth/refresh` | Refresh token pada body |
| POST | `/auth/forgot-password` | Tidak |
| GET | `/auth/me` | Bearer access token |

Register menerima `fullName`, `email`, `password`. Login menerima `email`, `password`. Refresh menerima `refreshToken`; forgot-password menerima `email`. Protected requests memakai `Authorization: Bearer <accessToken>`.

Token dikeluarkan dan diverifikasi oleh Supabase Auth. Response API tidak pernah mengembalikan password. Registrasi memakai nama di metadata akun Supabase; konfigurasi email confirmation ditentukan di Supabase Auth.

`/auth/me` sementara mengirim `memberships: []` karena skema tabel profile dan school membership belum tersedia di repo maupun terdefinisi secara konkret di spesifikasi. Setelah skema Supabase diputuskan, endpoint ini perlu membaca membership dari tabel tersebut.

## Scripts

- `npm run start:dev` — jalankan server dalam mode pengembangan
- `npm run build` — kompilasi aplikasi
- `npm run test` — unit test
- `npm run test:e2e` — end-to-end test
