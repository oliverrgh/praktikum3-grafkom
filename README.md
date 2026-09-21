# Interactive Transformation Playground — Pertemuan 3

**Mata Kuliah:** EF234504 — Grafika Komputer  
**Topik:** Interactive Transformation & Coordinate System dengan WebGL2

## Identitas Anggota

| Nama | NRP |
|---|---|
| Mario Napitupulu | 5025241085 |
| Nathanael Oliver Amadhika Yuswana | 5025241109 |

## Deskripsi Aplikasi

Project ini merupakan aplikasi **Interactive Transformation Playground** berbasis **WebGL2** yang mendemonstrasikan konsep sistem koordinat dan transformasi objek menggunakan **Model Matrix**.

Aplikasi menggunakan alur koordinat:

`Local Coordinate → Model Matrix → World Space → View Matrix → NDC`

Transformasi yang dapat dilakukan secara interaktif meliputi translasi, rotasi, uniform scaling, non-uniform scaling, serta komposisi beberapa transformasi. Aplikasi juga mendemonstrasikan homogeneous coordinate dengan `w = 1`, penggunaan `mat3`, transform order, pivot transformation, dan parent-child hierarchy.

Input keyboard diproses menggunakan pendekatan **state-based**. `keydown` dan `keyup` menyimpan status tombol, kemudian perubahan posisi, rotasi, dan skala dihitung pada setiap frame menggunakan `deltaTime`, sehingga pergerakan tetap konsisten terhadap FPS.

Selain Object A yang dapat dikontrol secara interaktif, terdapat Object B yang dapat dianimasikan otomatis, Object C untuk membandingkan transform order, serta Child Object untuk mendemonstrasikan hubungan parent-child.

## Kontrol Keyboard

| Input | Fungsi |
|---|---|
| `W` / `A` / `S` / `D` | Menggerakkan Object A pada sumbu Y/X |
| `Arrow Up/Down/Left/Right` | Menggerakkan Object A pada sumbu Y/X |
| `Q` | Rotasi Object A berlawanan arah jarum jam |
| `E` | Rotasi Object A searah jarum jam |
| `+` | Uniform scaling bertambah |
| `-` | Uniform scaling berkurang |
| `Z` | Mengurangi scale sumbu X |
| `X` | Menambah scale sumbu X |
| `C` | Mengurangi scale sumbu Y |
| `V` | Menambah scale sumbu Y |
| `1` / `2` / `3` | Menggunakan transform preset |
| `T` | Toggle transform order: `T × R × S` ↔ `T × R` |
| `O` | Toggle Orbit Mode |
| `Y` | Toggle Pivot Demo |
| `H` | Toggle Parent-Child |
| `F` | Toggle kecepatan translasi |
| `P` / `Space` | Pause / Resume animasi |
| `R` | Reset transform Object A |
| **Mouse Click** | Memindahkan Object A ke posisi pointer pada canvas |

Selain keyboard, aplikasi juga menyediakan kontrol UI untuk rotation speed, scale speed, Auto Object B, coordinate axes, pivot marker, parent-child, pause, reset, transform order, orbit, dan pivot demo.

## Transformasi yang Digunakan

### 1. Translation

Translation digunakan untuk memindahkan objek pada sumbu X dan Y. Model matrix translation dibuat menggunakan:

`T = Translation(x, y)`

Object A dapat dipindahkan menggunakan keyboard maupun klik mouse. Posisi klik mouse dikonversi dari pixel canvas ke NDC, kemudian disesuaikan kembali dengan aspect ratio.

### 2. Rotation

Rotation digunakan untuk mengubah orientasi objek. Nilai rotasi disimpan dalam derajat dan dikonversi menjadi radian sebelum digunakan pada matriks rotasi.

### 3. Scaling

Terdapat dua jenis scaling:

- **Uniform Scaling:** scale X dan Y berubah secara bersamaan menggunakan `+` dan `-`.
- **Non-Uniform Scaling:** scale X dan Y dapat diubah secara terpisah menggunakan `Z/X` dan `C/V`.

Nilai scale dibatasi agar tetap berada pada rentang `0.2` sampai `2.5`.

### 4. Homogeneous Coordinate

Vertex 2D diubah menjadi koordinat homogeneous dengan menambahkan `w = 1`:

`vec3(a_position, 1.0)`

Vertex kemudian diproses melalui:

`u_view × u_model × vec3(a_position, 1.0)`

Hasil akhirnya digunakan untuk menentukan posisi vertex pada WebGL.

### 5. View Matrix dan Aspect Ratio

Canvas berukuran `1100 × 650`, sehingga aspect ratio tidak sama dengan 1. View matrix digunakan untuk mengoreksi perbedaan skala sumbu X dan Y:

`View = Scale(1 / aspect, 1)`

Hal ini membuat rotasi dan bentuk objek tidak terlihat gepeng akibat perbedaan aspect ratio canvas.

### 6. Pivot Transformation

Pivot demo menggunakan komposisi:

`T(position) × T(pivot) × R × S × T(-pivot)`

Dengan demikian, rotasi dan scaling dapat dilakukan terhadap titik pivot tertentu, seperti demonstrasi engsel pintu.

### 7. Parent-Child Hierarchy

Pada mode parent-child, transformasi Child digabungkan dengan transformasi Parent:

`ChildWorld = ParentWorld × ChildLocal`

Dengan cara ini, perubahan transformasi Object A sebagai parent akan ikut memengaruhi posisi dan orientasi child.

### 8. Orbit Transformation

Object C dapat digunakan dalam mode orbit. Transformasi orbit menggunakan pusat Object A, rotasi orbit, radius orbit, rotasi dirinya sendiri, dan scaling:

`T(center) × R(orbit) × T(radius, 0) × R(self) × S`

## Transform Order yang Dibandingkan

Aplikasi membandingkan dua transform order:

### `T × R × S`

Urutan komposisi:

`Model = Translation × Rotation × Scaling`

Karena transformasi matrix dibaca dari kanan ke kiri, scaling diterapkan terlebih dahulu pada koordinat lokal, kemudian rotation, dan terakhir translation.

Mode ini mempertahankan efek scale pada objek.

### `T × R`

Urutan komposisi:

`Model = Translation × Rotation`

Pada mode ini scaling tidak dimasukkan ke dalam Model Matrix. Parameter scale Object A tetap dapat berubah pada state, tetapi perubahan tersebut tidak terlihat pada objek selama mode `T × R` aktif.

Transform order dapat diganti menggunakan tombol `T` atau tombol **Toggle order** pada UI.

## Challenge yang Dikerjakan

### Challenge A — Reset Transform

Tombol `R` mengembalikan Object A ke kondisi awal:

- Position: `(-0.35, 0.00)`
- Rotation: `0°`
- Scale: `(1.00, 1.00)`
- Transform order: `T × R × S`

### Challenge B — Transform Preset

Tersedia tiga preset transform:

| Preset | Position | Rotation | Scale |
|---|---|---:|---|
| `1` | `(-0.40, 0.20)` | `0°` | `(1.0, 1.0)` |
| `2` | `(0.00, 0.00)` | `45°` | `(1.5, 1.5)` |
| `3` | `(0.30, -0.20)` | `90°` | `(1.8, 0.6)` |

### Challenge D — Mouse Translation

Klik pada canvas digunakan untuk memindahkan Object A.

Koordinat pixel mouse dikonversi menjadi NDC:

- X: `-1` sampai `1`
- Y: `-1` sampai `1`

Karena View Matrix melakukan scaling pada sumbu X untuk aspect ratio, posisi X kemudian dikembalikan ke world space dengan mengalikan `ASPECT`.

### Challenge E — Parent-Child Hierarchy

Object A digunakan sebagai parent. Child memiliki transformasi lokal sendiri dan world transform child dihitung menggunakan:

`ChildWorld = ParentWorld × ChildLocal`

Child juga memiliki rotasi otomatis sehingga hubungan parent-child dapat diamati secara langsung.

### Challenge F — Orbit Mode

Object C dapat diubah menjadi objek yang mengorbit posisi world Object A.

Orbit menggunakan:

- posisi Object A sebagai pusat orbit,
- radius orbit `0.55`,
- kecepatan orbit `55°/s`,
- rotasi diri Object C `140°/s`,
- scaling Object C sebesar `0.6`.

Aplikasi juga menampilkan lingkaran sebagai panduan orbit ketika mode ini aktif.

## Cara Menjalankan Project

### Struktur File

Pastikan file berikut berada dalam satu folder:

```text
praktikum-transform-03/
├── praktikum3.html
├── main.js
├── matrix3.js
├── style.css
└── README.md
```

### Menggunakan Python HTTP Server

Karena project menggunakan JavaScript module (`import { Mat3 } from "./matrix3.js"`), project sebaiknya dijalankan melalui HTTP server lokal.

1. Buka terminal pada direktori project:

```bash
cd praktikum-transform-03
```

2. Jalankan server:

```bash
python3 -m http.server 8000
```

3. Buka browser dan akses:

```text
http://localhost:8000/praktikum3.html
```

4. Pastikan browser mendukung **WebGL2**.

Jika menggunakan VS Code, project juga dapat dijalankan menggunakan extension/local development server yang menyediakan HTTP server.

## Catatan Debugging

### 1. WebGL2 Tidak Tersedia

Program melakukan pengecekan WebGL2 ketika membuat context. Jika WebGL2 tidak tersedia, aplikasi akan menghasilkan error:

```text
WebGL2 tidak tersedia.
```

Pastikan browser dan perangkat mendukung WebGL2.

### 2. Project Harus Menggunakan HTTP Server

`main.js` mengimpor `Mat3` dari file `matrix3.js` menggunakan ES Module:

```javascript
import { Mat3 } from "./matrix3.js";
```

Karena itu, membuka `praktikum3.html` secara langsung dengan `file://` dapat menyebabkan masalah module/CORS pada browser. Gunakan HTTP server lokal seperti:

```bash
python3 -m http.server 8000
```

### 3. Aspect Ratio Canvas

Canvas menggunakan ukuran `1100 × 650`. Tanpa koreksi aspect ratio, objek dapat terlihat gepeng ketika mengalami rotasi.

Solusinya adalah menggunakan:

```javascript
const ASPECT = canvas.width / canvas.height;
const viewMatrix = Mat3.scaling(1 / ASPECT, 1);
```

### 4. Delta Time

Perubahan transformasi tidak dilakukan berdasarkan jumlah frame, tetapi berdasarkan `deltaTime`. Hal ini membuat kecepatan gerak tidak terlalu bergantung pada FPS.

`deltaTime` juga dibatasi maksimal `0.05` detik untuk mencegah perubahan posisi/rotasi yang terlalu besar ketika tab browser sempat freeze.

### 5. Keyboard Input

`keydown` dan `keyup` digunakan untuk menyimpan status tombol pada object `keys`. Tombol yang membutuhkan aksi satu kali, seperti `R`, `T`, `O`, `Y`, dan `H`, hanya diproses ketika `event.repeat` tidak aktif.

Ketika window kehilangan fokus, seluruh status tombol di-reset agar tidak terjadi kondisi tombol dianggap terus ditekan.

### 6. Mouse Coordinate

Koordinat mouse menggunakan sistem koordinat layar yang memiliki arah Y ke bawah, sedangkan koordinat NDC memiliki arah Y ke atas. Oleh karena itu konversi Y dilakukan dengan:

`y = 1 - py × 2`

Setelah itu posisi X disesuaikan kembali terhadap aspect ratio.

### 7. Transform Order

Jika Object A terlihat tidak berubah ukurannya setelah menekan tombol scaling, periksa HUD **Order**. Pada mode:

`T × R`

scaling memang tidak dimasukkan ke Model Matrix. Tekan `T` untuk kembali ke:

`T × R × S`

### 8. Matrix Multiplication

Implementasi `Mat3` menyediakan operasi:

- `identity()`
- `translation(tx, ty)`
- `rotation(rad)`
- `scaling(sx, sy)`
- `multiply(a, b)`

Komposisi transformasi pada `main.js` menggunakan perkalian matrix secara berurutan dan dibaca dari kanan ke kiri.

## Ringkasan

Project ini mengimplementasikan interactive transformation menggunakan WebGL2 dengan fokus pada:

- Local dan World Coordinate
- Model Matrix
- View Matrix
- Homogeneous Coordinate
- Translation
- Rotation
- Uniform dan Non-Uniform Scaling
- Transform Order
- Pivot Transformation
- Parent-Child Hierarchy
- Orbit Transformation
- Keyboard dan Mouse Interaction
- Delta Time
- Real-time Rendering

Seluruh objek menggunakan geometry yang dibuat dan disimpan sekali pada GPU, kemudian geometry yang sama dapat digunakan kembali dengan Model Matrix yang berbeda untuk menghasilkan posisi, rotasi, dan skala yang berbeda.
