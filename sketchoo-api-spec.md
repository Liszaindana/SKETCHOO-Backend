# SKETCHOO API Specification

Dokumen ini merupakan spesifikasi API untuk **SKETCHOO**, platform
edukasi anak usia dini yang menggabungkan aktivitas menggambar,
eksplorasi edukatif, Computer Vision, dan pembuatan fabel interaktif.

> **Status:** Draft untuk perencanaan MVP. Endpoint dalam dokumen ini
> adalah rancangan kontrak API dan belum tentu sudah diimplementasikan
> di backend.

------------------------------------------------------------------------

## 1. Gambaran Project

### Nama Project

**SKETCHOO API**

### Tujuan

Menyediakan REST API untuk aplikasi SKETCHOO yang ditujukan bagi anak
usia 4--6 tahun, orang tua, guru, dan pengelola sekolah.

### Teknologi yang direncanakan

-   Node.js dan NestJS
-   REST API dengan JSON
-   Supabase Auth untuk autentikasi
-   PostgreSQL/Supabase untuk penyimpanan data
-   Supabase Storage untuk file sketsa
-   Gemini API untuk pembuatan cerita melalui backend
-   Computer Vision service untuk analisis sketsa (opsional pada MVP)
-   Vitest untuk unit test dan end-to-end test

### Base URL

``` text
/api/v1
```

Contoh lokal:

``` text
http://localhost:3000/api/v1
```

### Modul Utama

-   Authentication dan Profile
-   School, Membership, dan Class Management
-   Student Management
-   Jelajah Cilik
-   Sketch Challenge
-   Sketch-to-Story
-   Learning Progress

------------------------------------------------------------------------

## 2. Konsep API

API menggunakan JSON untuk request dan response, kecuali endpoint upload
file yang dapat menggunakan signed upload URL atau
`multipart/form-data`.

### Success Response

``` json
{
  "success": true,
  "message": "Request completed successfully",
  "data": {}
}
```

### Error Response

``` json
{
  "success": false,
  "message": "Request validation failed",
  "error": "Bad Request",
  "statusCode": 400
}
```

### HTTP Status Code

  Status Code   Keterangan
  ------------- ------------------------------------------------------
  `200`         Request berhasil
  `201`         Data berhasil dibuat
  `204`         Berhasil tanpa response body
  `400`         Request tidak valid
  `401`         Belum login atau token tidak valid
  `403`         Tidak memiliki permission
  `404`         Data tidak ditemukan atau tidak dapat diakses
  `409`         Terjadi konflik data
  `413`         File terlalu besar
  `422`         Data valid secara format tetapi tidak dapat diproses
  `429`         Batas request terlampaui
  `500`         Kesalahan internal server
  `503`         Layanan eksternal sementara tidak tersedia

### Pagination

Endpoint daftar data dapat menggunakan parameter `page` dan `limit`.

Contoh:

``` http
GET /api/v1/activities?page=1&limit=10
```

Contoh metadata:

``` json
{
  "page": 1,
  "limit": 10,
  "total": 25,
  "totalPages": 3
}
```

------------------------------------------------------------------------

## 3. Authentication dan Authorization

Autentikasi direncanakan menggunakan Supabase Auth. NestJS memverifikasi
access token Supabase untuk endpoint yang memerlukan autentikasi.

Header:

``` http
Authorization: Bearer <accessToken>
```

Jangan menaruh Supabase service-role key atau Gemini API key di aplikasi
Flutter/Web. Secret hanya boleh digunakan di backend.

### Role yang direncanakan

-   `superadmin`: mengelola platform dan sekolah.
-   `school_admin`: mengelola anggota, kelas, dan siswa pada sekolahnya.
-   `teacher`: mengelola kelas yang ditugaskan dan melihat progres siswa
    yang berwenang.
-   `user`: pengguna umum SKETCHOO. User dapat memakai fitur edukasi dan mengakses profil/progres anak yang sudah ditautkan serta diverifikasi. Parent dan child bukan role terpisah; keduanya berada dalam konteks role `user`.

Empat role aplikasi adalah `superadmin`, `school_admin`, `teacher`, dan `user`. Role sekolah (`school_admin` dan `teacher`) harus diverifikasi berdasarkan membership pada sekolah terkait. Backend tidak boleh mempercayai role yang dikirim bebas oleh client.

------------------------------------------------------------------------

## 4. Authentication API

Endpoint autentikasi berikut adalah rancangan integrasi dengan Supabase
Auth. Implementasi dapat memanggil Supabase Auth dari backend atau
client sesuai arsitektur yang dipilih, tetapi authorization data tetap
diverifikasi oleh backend.

  -------------------------------------------------------------------------------
  Method            Endpoint                  Authentication    Keterangan
  ----------------- ------------------------- ----------------- -----------------
  `POST`            `/auth/register`          No                Registrasi akun
                                                                parent/pengguna
                                                                umum

  `POST`            `/auth/login`             No                Login

  `POST`            `/auth/logout`            Yes               Logout sesi

  `POST`            `/auth/refresh`           Session-based     Refresh token
                                                                jika dikelola
                                                                backend

  `POST`            `/auth/forgot-password`   No                Meminta reset
                                                                password

  `GET`             `/auth/me`                Yes               Mendapatkan
                                                                profil pengguna
                                                                aktif
  -------------------------------------------------------------------------------

### 4.1 Register

`POST /api/v1/auth/register`

Request:

``` json
{
  "fullName": "Orang Tua Contoh",
  "email": "parent@example.com",
  "password": "ExamplePassword123"
}
```

Validasi yang disarankan: - `fullName`: wajib, string, 2--100
karakter. - `email`: wajib, format email valid. - `password`: wajib,
memenuhi kebijakan password. - Registrasi publik tidak boleh mengizinkan
pengguna menetapkan role `superadmin`, `school_admin`, atau `teacher`
secara mandiri.

Response konseptual `201 Created`:

``` json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "uuid",
      "fullName": "Orang Tua Contoh",
      "email": "parent@example.com"
    }
  }
}
```

### 4.2 Login

`POST /api/v1/auth/login`

Request:

``` json
{
  "email": "parent@example.com",
  "password": "ExamplePassword123"
}
```

Response mengikuti hasil autentikasi Supabase yang disaring agar hanya
informasi yang diperlukan yang dikirim ke client. Jangan pernah
mengembalikan password.

### 4.3 Current User

`GET /api/v1/auth/me`

Response:

``` json
{
  "success": true,
  "message": "Current user retrieved successfully",
  "data": {
    "id": "user-uuid",
    "fullName": "Orang Tua Contoh",
    "email": "parent@example.com",
    "memberships": [
      {
        "schoolId": "school-uuid",
        "role": "teacher"
      }
    ]
  }
}
```

`memberships` dapat kosong untuk akun yang belum menjadi anggota
sekolah.

------------------------------------------------------------------------

## 5. Profile API

  -----------------------------------------------------------------------
  Method            Endpoint          Authentication    Keterangan
  ----------------- ----------------- ----------------- -----------------
  `GET`             `/profiles/me`    Yes               Mendapatkan
                                                        profil sendiri

  `PATCH`           `/profiles/me`    Yes               Memperbarui field
                                                        profil yang
                                                        diizinkan
  -----------------------------------------------------------------------

### Update Profile

`PATCH /api/v1/profiles/me`

Request:

``` json
{
  "fullName": "Nama Baru"
}
```

Validasi: - `fullName` opsional saat update. - Jika dikirim, harus
berupa string dan panjangnya 2--100 karakter. - User tidak dapat
mengubah ID atau menaikkan role sendiri melalui endpoint ini.

------------------------------------------------------------------------

## 6. School Management API

Endpoint ini digunakan untuk pengelolaan multi-sekolah.

  ----------------------------------------------------------------------------
  Method            Endpoint               Authentication    Permission
  ----------------- ---------------------- ----------------- -----------------
  `POST`            `/schools`             Yes               `superadmin`

  `GET`             `/schools`             Yes               `superadmin`

  `GET`             `/schools/:schoolId`   Yes               Superadmin atau
                                                             anggota sekolah

  `PATCH`           `/schools/:schoolId`   Yes               Superadmin atau
                                                             `school_admin`
                                                             sekolah tersebut

  `DELETE`          `/schools/:schoolId`   Yes               `superadmin`
  ----------------------------------------------------------------------------

### 6.1 Create School

`POST /api/v1/schools`

Request:

``` json
{
  "name": "TK Pelangi",
  "address": "Bandung, Indonesia"
}
```

Validasi: - `name`: wajib, string, 2--150 karakter. - `address`:
opsional, string, maksimal 255 karakter. - Membership admin sekolah
dibuat melalui proses administratif yang terotorisasi, bukan dari role
bebas di request publik.

Response konseptual `201 Created`:

``` json
{
  "success": true,
  "message": "School created successfully",
  "data": {
    "id": "school-uuid",
    "name": "TK Pelangi",
    "address": "Bandung, Indonesia"
  }
}
```

------------------------------------------------------------------------

## 7. School Membership API

Membership menyimpan peran pengguna pada sekolah tertentu.

  ----------------------------------------------------------------------------------------------
  Method            Endpoint                                 Authentication    Permission
  ----------------- ---------------------------------------- ----------------- -----------------
  `GET`             `/schools/:schoolId/members`             Yes               Superadmin atau
                                                                               school admin

  `POST`            `/schools/:schoolId/invitations`         Yes               Superadmin atau
                                                                               school admin

  `PATCH`           `/schools/:schoolId/members/:memberId`   Yes               Superadmin atau
                                                                               school admin

  `DELETE`          `/schools/:schoolId/members/:memberId`   Yes               Superadmin atau
                                                                               school admin
  ----------------------------------------------------------------------------------------------

Role membership yang diizinkan untuk pengelolaan sekolah: `school_admin`
dan `teacher`. Penetapan `superadmin` hanya melalui proses administratif
khusus.

Contoh undangan:

``` json
{
  "email": "teacher@example.com",
  "role": "teacher"
}
```

Validasi bisnis: - Sekolah harus ada dan aktif. - Pemanggil harus
memiliki permission untuk sekolah tersebut. - Email harus valid. -
Pengguna tidak boleh memperoleh akses ke sekolah lain hanya dengan
mengganti `schoolId`.

------------------------------------------------------------------------

## 8. Class Management API

  -----------------------------------------------------------------------------------------------
  Method            Endpoint                                  Authentication    Permission
  ----------------- ----------------------------------------- ----------------- -----------------
  `POST`            `/schools/:schoolId/classes`              Yes               School admin

  `GET`             `/schools/:schoolId/classes`              Yes               Anggota sekolah
                                                                                berwenang

  `GET`             `/classes/:classId`                       Yes               Anggota sekolah
                                                                                berwenang

  `PATCH`           `/classes/:classId`                       Yes               School admin

  `DELETE`          `/classes/:classId`                       Yes               School admin

  `POST`            `/classes/:classId/teachers`              Yes               School admin

  `DELETE`          `/classes/:classId/teachers/:teacherId`   Yes               School admin
  -----------------------------------------------------------------------------------------------

### Create Class

`POST /api/v1/schools/:schoolId/classes`

Request:

``` json
{
  "name": "Kelas A",
  "academicYear": "2026/2027"
}
```

Validasi: - `name`: wajib, string, 1--100 karakter. - `academicYear`:
wajib, string, maksimal 20 karakter. - `schoolId` harus merujuk ke
sekolah yang ada. - School admin hanya dapat membuat kelas pada sekolah
tempat ia menjadi admin.

------------------------------------------------------------------------

## 9. Student Management API

  -----------------------------------------------------------------------------------------------
  Method            Endpoint                                  Authentication    Permission
  ----------------- ----------------------------------------- ----------------- -----------------
  `POST`            `/schools/:schoolId/students`             Yes               School admin

  `GET`             `/schools/:schoolId/students`             Yes               School admin atau
                                                                                guru berwenang

  `GET`             `/students/:studentId`                    Yes               Staf sekolah
                                                                                berwenang atau
                                                                                user yang terhubung ke profil anak

  `PATCH`           `/students/:studentId`                    Yes               School admin

  `DELETE`          `/students/:studentId`                    Yes               School admin

  `POST`            `/classes/:classId/students`              Yes               School admin atau
                                                                                staf berwenang

  `DELETE`          `/classes/:classId/students/:studentId`   Yes               School admin

  `POST`            `/students/:studentId/parents`            Yes               User/staf
                                                                                melalui proses
                                                                                verifikasi

  `GET`             `/students/:studentId/parents`            Yes               User yang terhubung ke profil anak
                                                                                atau staf
                                                                                berwenang
  -----------------------------------------------------------------------------------------------

### Create Student

`POST /api/v1/schools/:schoolId/students`

Request:

``` json
{
  "fullName": "Anak Contoh",
  "birthDate": "2021-05-10",
  "classId": "class-uuid"
}
```

Validasi: - `fullName`: wajib, string, 2--100 karakter. - `birthDate`:
tanggal valid dengan format `YYYY-MM-DD`. - `classId`: UUID valid jika
menggunakan UUID pada database. - Kelas harus berada di sekolah yang
sama dengan `schoolId`. - Data anak hanya boleh diakses oleh orang tua
yang terverifikasi atau staf yang berwenang.

------------------------------------------------------------------------

## 10. Jelajah Cilik --- Educational Activities

  ------------------------------------------------------------------------------------------
  Method            Endpoint                             Authentication    Permission
  ----------------- ------------------------------------ ----------------- -----------------
  `GET`             `/activities`                        Optional/Yes      Aktivitas yang
                                                                           dipublikasikan

  `GET`             `/activities/:activityId`            Optional/Yes      Detail aktivitas
                                                                           yang tersedia

  `POST`            `/activities`                        Yes               Admin konten
                                                                           berwenang

  `PATCH`           `/activities/:activityId`            Yes               Admin konten
                                                                           berwenang

  `DELETE`          `/activities/:activityId`            Yes               Admin konten
                                                                           berwenang

  `POST`            `/activities/:activityId/attempts`   Yes               Sesi anak yang
                                                                           berwenang

  `GET`             `/students/:studentId/activities`    Yes               User yang terhubung ke profil anak
                                                                           atau staf
                                                                           berwenang
  ------------------------------------------------------------------------------------------

### Activity List

`GET /api/v1/activities?page=1&limit=10`

Query: \| Parameter \| Type \| Required \| Keterangan \|
\|---\|---\|---\|---\| \| `page` \| integer \| No \| Nomor halaman,
minimal 1 \| \| `limit` \| integer \| No \| Jumlah item per halaman \|
\| `search` \| string \| No \| Cari judul aktivitas \| \| `category` \|
string \| No \| Filter kategori \|

Response konseptual:

``` json
{
  "success": true,
  "message": "Activities retrieved successfully",
  "data": [
    {
      "id": "activity-uuid",
      "title": "Mengenal Hewan",
      "description": "Kenali nama dan suara hewan",
      "category": "animals",
      "status": "published"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

### Submit Activity Attempt

`POST /api/v1/activities/:activityId/attempts`

Request:

``` json
{
  "studentId": "student-uuid",
  "answers": [
    {
      "questionId": "question-uuid",
      "answer": "A"
    }
  ]
}
```

Validasi bisnis: - Aktivitas harus tersedia dan dipublikasikan. -
Pengguna harus memiliki akses ke profil anak. - Jawaban harus sesuai
dengan pertanyaan yang ada. - Skor dihitung backend, bukan dipercaya
dari client.

------------------------------------------------------------------------

## 11. Sketch Challenge API

  ---------------------------------------------------------------------------------------
  Method            Endpoint                          Authentication    Keterangan
  ----------------- --------------------------------- ----------------- -----------------
  `GET`             `/challenges`                     Optional/Yes      Daftar challenge
                                                                        yang aktif

  `GET`             `/challenges/:challengeId`        Optional/Yes      Detail challenge

  `POST`            `/challenges`                     Yes               Membuat challenge
                                                                        oleh pengelola
                                                                        berwenang

  `PATCH`           `/challenges/:challengeId`        Yes               Memperbarui
                                                                        challenge

  `POST`            `/sketches/upload-url`            Yes               Meminta URL
                                                                        upload yang aman

  `POST`            `/sketches`                       Yes               Mendaftarkan
                                                                        metadata sketsa

  `GET`             `/sketches/:sketchId`             Yes               Melihat status
                                                                        dan metadata
                                                                        sketsa

  `POST`            `/sketches/:sketchId/analyze`     Yes               Meminta analisis
                                                                        Computer Vision

  `GET`             `/students/:studentId/sketches`   Yes               Riwayat sketsa
                                                                        anak
  ---------------------------------------------------------------------------------------

### 11.1 Get Challenges

`GET /api/v1/challenges`

Response konseptual:

``` json
{
  "success": true,
  "message": "Challenges retrieved successfully",
  "data": [
    {
      "id": "challenge-uuid",
      "title": "Gambar Hewan Favoritmu",
      "description": "Gambarlah hewan yang kamu sukai",
      "difficulty": "easy",
      "status": "published"
    }
  ]
}
```

### 11.2 Request Upload URL

`POST /api/v1/sketches/upload-url`

Request:

``` json
{
  "studentId": "student-uuid",
  "fileName": "drawing.png",
  "contentType": "image/png"
}
```

Validasi: - `studentId` harus dapat diakses oleh pemanggil. - `fileName`
wajib dan panjangnya dibatasi. - `contentType` hanya boleh menggunakan
format gambar yang diizinkan, misalnya PNG atau JPEG. - Ukuran file
maksimum harus dikonfigurasi di backend. - URL upload harus memiliki
masa berlaku terbatas.

Response konseptual:

``` json
{
  "success": true,
  "message": "Upload URL created successfully",
  "data": {
    "sketchId": "sketch-uuid",
    "uploadUrl": "https://storage.example/signed-upload-url",
    "storagePath": "private-sketches/sketch-uuid.png",
    "expiresIn": 300
  }
}
```

URL di atas hanyalah contoh format, bukan URL layanan aktif.

### 11.3 Register Sketch

`POST /api/v1/sketches`

Request:

``` json
{
  "studentId": "student-uuid",
  "challengeId": "challenge-uuid",
  "storagePath": "private-sketches/sketch-uuid.png"
}
```

Response konseptual:

``` json
{
  "success": true,
  "message": "Sketch registered successfully",
  "data": {
    "id": "sketch-uuid",
    "studentId": "student-uuid",
    "challengeId": "challenge-uuid",
    "status": "uploaded"
  }
}
```

### 11.4 Analyze Sketch

`POST /api/v1/sketches/:sketchId/analyze`

Response ketika pemrosesan asinkron:

``` json
{
  "success": true,
  "message": "Sketch analysis queued",
  "data": {
    "sketchId": "sketch-uuid",
    "status": "processing"
  }
}
```

Status analisis yang disarankan: - `uploaded` - `processing` -
`completed` - `failed`

Hasil analisis aktual bergantung pada Computer Vision service yang
dipilih dan diimplementasikan. Jangan mengembalikan confidence atau
label buatan jika model belum menghasilkan data tersebut.

------------------------------------------------------------------------

## 12. Sketch-to-Story API

Fitur ini mengubah sketsa atau hasil analisis sketsa menjadi fabel
interaktif yang sesuai untuk anak usia dini. Permintaan ke Gemini harus
dilakukan oleh backend.

  ----------------------------------------------------------------------------------------------
  Method            Endpoint                         Authentication    Keterangan
  ----------------- -------------------------------- ----------------- -------------------------
  `POST`            `/stories/generate`              Yes               Membuat cerita dari
                                                                       sketsa

  `GET`             `/stories/:storyId`              Yes               Mengambil detail cerita

  `GET`             `/students/:studentId/stories`   Yes               Riwayat cerita anak

  `POST`            `/stories/:storyId/choices`      Yes               Mengirim pilihan anak

  `DELETE`          `/stories/:storyId`              Yes               Menghapus/menonaktifkan
                                                                       cerita sesuai kebijakan
  ----------------------------------------------------------------------------------------------

### 12.1 Generate Story

`POST /api/v1/stories/generate`

Request:

``` json
{
  "studentId": "student-uuid",
  "sketchId": "sketch-uuid",
  "language": "id"
}
```

Validasi: - `studentId` dan `sketchId` wajib. - Pengguna harus berwenang
atas profil anak. - Sketsa harus milik anak tersebut. - Jika analisis
sketsa diwajibkan oleh implementasi, status analisis harus
`completed`. - Bahasa harus berasal dari daftar bahasa yang didukung. -
Batas penggunaan dan timeout AI harus diterapkan.

Response konseptual:

``` json
{
  "success": true,
  "message": "Story generated successfully",
  "data": {
    "id": "story-uuid",
    "studentId": "student-uuid",
    "sketchId": "sketch-uuid",
    "title": "Petualangan di Hutan Pelangi",
    "language": "id",
    "content": [
      {
        "type": "narration",
        "text": "Suatu pagi, seekor kelinci menemukan hutan penuh warna."
      },
      {
        "type": "choice",
        "prompt": "Ke mana kelinci akan pergi?",
        "options": [
          { "id": "a", "text": "Ke sungai" },
          { "id": "b", "text": "Ke taman bunga" }
        ]
      }
    ],
    "status": "completed"
  }
}
```

Konten di atas adalah contoh ilustratif, bukan hasil model yang telah
dijalankan.

### 12.2 Submit Story Choice

`POST /api/v1/stories/:storyId/choices`

Request:

``` json
{
  "studentId": "student-uuid",
  "choiceId": "a"
}
```

Backend harus memvalidasi bahwa cerita dan pilihan tersebut ada, cerita
dapat diakses oleh anak, dan pilihan sesuai dengan state cerita saat
ini.

### AI Safety

-   API key Gemini disimpan di environment backend.
-   Jangan mengirim data pribadi anak yang tidak diperlukan ke model.
-   Output harus dibatasi untuk konten yang sesuai usia.
-   Terapkan timeout, rate limit, dan penanganan kegagalan provider.
-   Jangan menganggap output AI selalu benar atau aman tanpa pemeriksaan
    yang sesuai.

------------------------------------------------------------------------

## 13. Learning Progress API

  --------------------------------------------------------------------------------------------------
  Method            Endpoint                                     Authentication    Permission
  ----------------- -------------------------------------------- ----------------- -----------------
  `GET`             `/students/:studentId/progress`              Yes               User yang terhubung ke profil anak
                                                                                   atau staf
                                                                                   berwenang

  `GET`             `/students/:studentId/progress/activities`   Yes               User yang terhubung ke profil anak
                                                                                   atau staf
                                                                                   berwenang

  `GET`             `/students/:studentId/progress/sketches`     Yes               User yang terhubung ke profil anak
                                                                                   atau staf
                                                                                   berwenang

  `GET`             `/students/:studentId/progress/stories`      Yes               User yang terhubung ke profil anak
                                                                                   atau staf
                                                                                   berwenang

  `GET`             `/classes/:classId/progress`                 Yes               Guru yang
                                                                                   ditugaskan atau
                                                                                   school admin
  --------------------------------------------------------------------------------------------------

### Student Progress

`GET /api/v1/students/:studentId/progress`

Response konseptual:

``` json
{
  "success": true,
  "message": "Student progress retrieved successfully",
  "data": {
    "studentId": "student-uuid",
    "completedActivities": 8,
    "submittedSketches": 5,
    "generatedStories": 4,
    "lastActivityAt": "2026-10-20T10:00:00Z"
  }
}
```

Angka progres harus dihitung dari data yang tersimpan di database, bukan
dari angka yang dikirim oleh client.

------------------------------------------------------------------------

## 14. Health Check API

`GET /api/v1/health`

Endpoint ini digunakan untuk memeriksa apakah aplikasi API aktif.

Response:

``` json
{
  "success": true,
  "message": "SKETCHOO API is running",
  "data": {
    "status": "ok"
  }
}
```

Health check dasar tidak perlu mengungkap credential, stack trace, atau
detail infrastruktur.

------------------------------------------------------------------------

## 15. DTO dan Validation

Gunakan DTO NestJS untuk mendefinisikan kontrak request. Implementasi
dapat menggunakan `class-validator`, `class-transformer`, dan global
`ValidationPipe`.

Contoh DTO konseptual:

``` typescript
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
```

Konfigurasi `ValidationPipe` yang disarankan:

``` typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

Aturan DTO final harus konsisten dengan implementasi dan kebijakan
keamanan. Jangan menyalin contoh DTO sebelum dependency
`class-validator` dan konfigurasi terkait benar-benar dipasang.

------------------------------------------------------------------------

## 16. Business Validation

### School

-   School harus ada dan aktif.
-   School admin hanya dapat mengelola sekolahnya sendiri.
-   Penghapusan sekolah sebaiknya menggunakan soft delete/deactivation
    jika data historis harus dipertahankan.

### Student

-   Kelas harus berada dalam sekolah yang sesuai.
-   User hanya dapat mengakses profil anak yang sudah ditautkan dan relasinya diverifikasi.
-   Guru hanya dapat mengakses siswa dari kelas yang ditugaskan.

### Sketch

-   File harus bertipe dan berukuran yang diizinkan.
-   Storage path harus divalidasi dan tidak boleh digunakan untuk
    mengakses file milik pengguna lain.
-   Analisis hanya berjalan untuk sketsa yang dapat diakses pemanggil.

### Story

-   Cerita harus merujuk pada sketsa yang sah.
-   Pilihan harus sesuai dengan cerita dan state saat ini.
-   Kegagalan provider AI harus ditangani tanpa membocorkan secret.

### General

-   UUID dan foreign key harus valid jika skema menggunakan UUID.
-   Unknown properties harus ditolak sesuai konfigurasi validation.
-   Terapkan rate limit pada endpoint upload, analisis, dan generasi
    cerita.

------------------------------------------------------------------------

## 17. Security dan Data Isolation

-   Verifikasi access token pada semua endpoint terlindungi.
-   Terapkan authorization di backend, bukan hanya menyembunyikan tombol
    di frontend.
-   Terapkan Supabase Row Level Security (RLS) pada tabel yang relevan.
-   Pisahkan role global dan role membership sekolah.
-   Cegah akses lintas sekolah melalui manipulasi `schoolId`, `classId`,
    atau `studentId`.
-   Simpan bucket sketsa sebagai private storage jika sketsa tidak
    dimaksudkan untuk publik.
-   Gunakan signed URL berumur pendek untuk upload atau akses file.
-   Jangan log password, token, signed URL penuh, atau secret API.
-   Terapkan kebijakan retensi dan penghapusan data anak yang sesuai.

------------------------------------------------------------------------

## 18. Struktur Module NestJS yang Disarankan

Struktur berikut merupakan usulan modular untuk pengembangan bertahap,
bukan klaim bahwa semua module sudah dibuat.

``` text
src/
├── auth/
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.module.ts
│   ├── dto/
│   └── guards/
├── profiles/
├── schools/
├── school-members/
├── classes/
├── students/
├── activities/
├── challenges/
├── sketches/
├── stories/
├── progress/
├── health/
├── common/
│   ├── guards/
│   ├── filters/
│   ├── interceptors/
│   ├── decorators/
│   └── pipes/
├── app.module.ts
└── main.ts
```

Setiap module dapat berisi controller, service, DTO, dan test sesuai
kebutuhan. Mulai dari module yang diperlukan untuk MVP dan jangan
membuat semua file kosong sekaligus.

------------------------------------------------------------------------

## 19. Swagger / OpenAPI

Dokumentasi Swagger dapat ditambahkan menggunakan `@nestjs/swagger`.

Instalasi jika belum ada:

``` bash
npm install @nestjs/swagger
```

Konfigurasi konseptual di `main.ts`:

``` typescript
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('SKETCHOO API')
  .setDescription('REST API for the SKETCHOO educational platform')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('docs', app, document);
```

Setelah dikonfigurasi, dokumentasi dapat diakses melalui:

``` text
http://localhost:3000/docs
```

Endpoint aktual dan skema request/response di Swagger harus sesuai
dengan controller dan DTO yang sudah diimplementasikan.

------------------------------------------------------------------------

## 20. Testing API

Testing direncanakan menggunakan Vitest. Nama dan cakupan test harus
mengikuti endpoint yang benar-benar diimplementasikan.

### Unit Test

-   Validasi DTO.
-   Logika service.
-   Permission dan aturan bisnis.
-   Penanganan error dari Supabase, Computer Vision, atau Gemini.

### End-to-End Test

-   Health check.
-   Request tanpa token ke endpoint terlindungi.
-   Request dengan token valid.
-   Akses lintas sekolah yang seharusnya ditolak.
-   Validasi input tidak valid.
-   Upload sketch dengan file type yang tidak diizinkan.
-   Penanganan kegagalan AI provider.

### Contoh Challenge Validasi

Untuk `POST /api/v1/schools/:schoolId/classes`, uji setidaknya: 1.
Request valid. 2. `name` kosong. 3. `name` terlalu panjang. 4.
`academicYear` tidak diberikan. 5. `schoolId` tidak valid atau tidak
ditemukan. 6. Pengguna tanpa permission mencoba membuat kelas. 7. School
admin mencoba membuat kelas di sekolah lain. 8. Unknown property
dikirim.

------------------------------------------------------------------------

## 21. Rangkuman Endpoint

  ------------------------------------------------------------------------------------
  Modul                   Method                  Endpoint
  ----------------------- ----------------------- ------------------------------------
  Auth                    POST                    `/auth/register`

  Auth                    POST                    `/auth/login`

  Auth                    POST                    `/auth/logout`

  Auth                    GET                     `/auth/me`

  Profile                 GET/PATCH               `/profiles/me`

  Schools                 GET/POST                `/schools`

  Schools                 GET/PATCH/DELETE        `/schools/:schoolId`

  Memberships             GET/POST                `/schools/:schoolId/members` dan
                                                  `/schools/:schoolId/invitations`

  Classes                 GET/POST                `/schools/:schoolId/classes`

  Classes                 GET/PATCH/DELETE        `/classes/:classId`

  Students                GET/POST                `/schools/:schoolId/students`

  Students                GET/PATCH/DELETE        `/students/:studentId`

  Activities              GET                     `/activities`

  Activities              POST                    `/activities/:activityId/attempts`

  Challenges              GET                     `/challenges`

  Sketches                POST                    `/sketches/upload-url`

  Sketches                POST                    `/sketches`

  Sketches                POST                    `/sketches/:sketchId/analyze`

  Stories                 POST                    `/stories/generate`

  Stories                 GET                     `/stories/:storyId`

  Stories                 POST                    `/stories/:storyId/choices`

  Progress                GET                     `/students/:studentId/progress`

  Health                  GET                     `/health`
  ------------------------------------------------------------------------------------

Semua endpoint di tabel menggunakan prefix `/api/v1` pada URL lengkap.

------------------------------------------------------------------------

## 22. Rekomendasi Tahapan Pengerjaan

### Phase 1 --- API Foundation

-   Global prefix `/api/v1`
-   Health check
-   Error response dan validation
-   Vitest configuration dan test dasar

### Phase 2 --- Authentication dan Access Control

-   Integrasi Supabase Auth
-   Profile
-   Guards dan permission checks
-   School membership

### Phase 3 --- Core Education Data

-   Schools dan classes
-   Student profiles
-   Activities dan activity attempts
-   Learning progress

### Phase 4 --- Sketch Challenge

-   Secure image upload
-   Sketch metadata
-   Computer Vision integration jika sudah siap

### Phase 5 --- Sketch-to-Story

-   Story generation melalui backend
-   Validasi konten
-   Interactive story choices
-   Error handling dan usage limits

### Phase 6 --- Documentation dan Quality

-   Swagger/OpenAPI
-   Unit dan E2E testing
-   Security review
-   Verifikasi isolasi data antar sekolah

------------------------------------------------------------------------

## Catatan Akhir

Dokumen ini adalah **rancangan API SKETCHOO** yang mengikuti pola
dokumentasi pembelajaran REST API: gambaran project, format response,
autentikasi, endpoint, validasi, business rules, struktur module,
Swagger, dan testing.

Nama endpoint, DTO, role, dan response harus diselaraskan dengan
implementasi final serta skema database Supabase. Fitur yang masih
berupa rencana tidak boleh dianggap telah tersedia sampai kode backend
dan pengujiannya selesai.
