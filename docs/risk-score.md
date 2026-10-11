<!-- Dihasilkan otomatis dari rules/risk-points.json oleh web/scripts/generate-docs.ts. Jangan diedit; ubah file JSON lalu jalankan: cd web; npm run docs:generate -->

# Skor risiko putus berobat

Skor adalah jumlah poin yang terdokumentasi. Skor hanya mengurutkan daftar perawat dan tidak pernah mengubah level triase. Tidak ada model bahasa di dalamnya.

- Versi tabel poin: `0.1.0`

## Tabel poin

| Faktor | Poin | Batas / ambang | Alasan yang ditampilkan |
| --- | --- | --- | --- |
| missed_dose_today | +2 |  | Tidak minum obat hari ini |
| consecutive_missed_day | +2 | maksimal 10 poin | Tidak minum obat {n} hari berturut-turut sebelumnya |
| partial_dose | +1 |  | Obat hari ini hanya diminum sebagian |
| stop_intent | +4 |  | Mengatakan ingin berhenti atau merasa sudah sembuh |
| stigma | +2 |  | Menyebut rasa malu atau takut diketahui orang |
| unresolved_side_effect | +3 | mulai 7 hari | Keluhan yang sama sudah {n} hari |
| yellow_today | +1 |  | Keluhan hari ini perlu dihubungi perawat |
| red_today | +5 |  | Ada tanda bahaya hari ini |
| missed_pickup | +4 |  | Jadwal ambil obat terlewat |
| no_pmo | +2 |  | Tidak ada pendamping minum obat |
| no_checkin | +3 | mulai 3 hari | Tidak ada laporan selama {n} hari |

## Pita risiko

| Pita | Skor |
| --- | --- |
| Rendah | 0 sampai 3 |
| Sedang | 4 sampai 7 |
| Tinggi | 8 atau lebih |

## Cara membaca daftar poin

- "Tidak minum obat hari ini" (+2) dan "hari berturut-turut sebelumnya" (+2 per hari, batas 10 poin) adalah dua faktor terpisah. Tidak minum hari ini dan dua hari sebelumnya = 2 + 4 = 6.
- Obat diminum sebagian tidak menyambung dan tidak memutus rangkaian hari tidak minum. Hanya status "belum" yang dihitung tidak minum.
- Hari tanpa laporan memutus rangkaian. Diam sudah dinilai oleh faktor "tidak ada laporan", jadi tidak dihitung dua kali.
- Level KUNING dan MERAH hari ini saling meniadakan dan memakai level akhir (setelah aturan lokal dan alur digabung).
- Keluhan yang belum membaik diberi poin satu kali saja, berapa pun jumlah gejalanya.
- "Tidak ada laporan" dihitung dalam hari kalender Jakarta sejak laporan terakhir; bila belum pernah lapor, sejak pasien didaftarkan.

## Contoh

### Contoh demo: hari ke-41

Mual sudah seminggu, keluarga bilang pasien merasa sudah sembuh dan mau berhenti. Level KUNING hari ini.

| Alasan | Poin |
| --- | --- |
| Mengatakan ingin berhenti atau merasa sudah sembuh | +4 |
| Keluhan yang sama sudah 7 hari | +3 |
| Keluhan hari ini perlu dihubungi perawat | +1 |

Skor **8**, pita **Tinggi**.

### Contoh: diam tiga hari tanpa pendamping

Tidak ada laporan selama 3 hari dan tidak ada pendamping minum obat.

| Alasan | Poin |
| --- | --- |
| Tidak ada pendamping minum obat | +2 |
| Tidak ada laporan selama 3 hari | +3 |

Skor **5**, pita **Sedang**.

### Contoh: tanda bahaya

Satu laporan MERAH. Skor hanya mengurutkan daftar; level MERAH tetap diputuskan oleh aturan triase.

| Alasan | Poin |
| --- | --- |
| Ada tanda bahaya hari ini | +5 |

Skor **5**, pita **Sedang**.
