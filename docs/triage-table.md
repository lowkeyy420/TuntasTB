<!-- Dihasilkan otomatis dari rules/triage-table.json dan rules/lexicon.id.json oleh web/scripts/generate-docs.ts. Jangan diedit; ubah file JSON lalu jalankan: cd web; npm run docs:generate -->

# Tabel triase untuk ditinjau klinisi

Dokumen ini adalah tampilan yang mudah dibaca dari aturan yang dipakai aplikasi. Aturan yang menentukan level, bukan model bahasa.
Level hanya boleh naik: gejala yang tidak dikenal menjadi KUNING, dan kata tanda bahaya (walau ragu) menjadi MERAH.

- Versi tabel: `0.1.0-draft`
- Versi kamus kata: `0.1.0-draft`
- Status tinjauan: **draft, belum ditinjau klinisi**

## Gejala dan level

| Kode | Level | Gejala (teks untuk keluarga) | Catatan |
| --- | --- | --- | --- |
| urine_orange | HIJAU | Kencing berwarna merah atau oranye |  |
| nausea_mild | HIJAU | Mual ringan setelah minum obat |  |
| joint_ache_mild | HIJAU | Nyeri sendi ringan |  |
| appetite_loss | HIJAU | Kurang nafsu makan |  |
| tingling_feet | KUNING | Kesemutan atau rasa terbakar di kaki |  |
| itching_no_rash | KUNING | Gatal tanpa ruam |  |
| jaundice | MERAH | Mata atau kulit kuning |  |
| vision_change | MERAH | Penglihatan kabur atau warna berubah |  |
| skin_rash | MERAH | Ruam kulit |  |
| vomiting_repeated | MERAH | Muntah berulang |  |
| confusion | MERAH | Bingung atau linglung |  |

## Aturan lama keluhan

| Gejala | Lama keluhan | Level |
| --- | --- | --- |
| nausea_mild, appetite_loss | 7 hari atau lebih | KUNING |

## Gejala tidak dikenal

Teks yang tidak cocok dengan gejala mana pun, atau kode gejala yang tidak dikenal, mendapat level **KUNING**.

## Tanda bahaya (selalu MERAH)

Kata kunci berikut memaksa level MERAH tanpa melihat hal lain. Tidak ada penanganan kata "tidak": "matanya tidak kuning" tetap MERAH, karena satu salah baca ke arah aman lebih berbahaya daripada satu telepon yang tidak perlu.

| Kode | Kata kunci |
| --- | --- |
| jaundice | sakit kuning, ikterus, jaundice; (mata / mta / kulit / badan / muka / wajah / putih mata / bola mata / telapak / tangan) + (kuning / menguning / kekuningan / kuningg / kunig / kunning / kunin / kunyit) |
| vision_change | buram, burem, kabur, kabor, rabun, buta warna, penglihatan, pandangan kabur, pandangan buram, pandangan gelap, pandangan samar, pandangan berkunang, berkunang, mata kabur, mata buram, mata sakit, sakit mata, nyeri mata, mata nyeri, warna berubah, salah warna, warna pudar, tidak bisa melihat, susah melihat, sulit melihat, tidak jelas melihat, melihat ganda, berbayang, blur, ngeblur; (warna) + (dibedain / dibedakan / membedakan / bedain / bedakan / membedain) |
| skin_rash | ruam, bentol, bentol bentol, bercak, bintik, bercak merah, bintik merah, kulit melepuh, melepuh, lepuh, kulit mengelupas, mengelupas, biduran, kulit merah, kulit kemerahan, bibir melepuh, bibir bengkak, muka bengkak, wajah bengkak, alergi, reaksi alergi |
| vomiting_repeated | muntah terus, muntah muntah, muntah2, muntah berkali, muntah berkali kali, muntah terus menerus, muntah melulu, muntah mulu, muntah banyak, muntah lagi, muntah sering, muntah berulang, berkali kali muntah, terus muntah, sering muntah, muntah hebat, muntah darah, muntah trus; (muntah / memuntahkan) + (terus / trus / trs / tros / berkali / mulu / melulu / banyak / sering / berulang / lagi / kali / tiap / setiap / hebat / darah / dari pagi / sepanjang / seharian) |
| confusion | linglung, ling lung, bingung, bingug, kebingungan, ngelantur, melantur, tidak nyambung, gak nyambung, ga nyambung, nggak nyambung, ngawur, mengigau, igau, tidak sadar, setengah sadar, pingsan, kejang, tidak merespons, tidak bisa diajak bicara, disorientasi, salah orang, sulit dibangunkan, susah dibangunkan, tidak bisa dibangunkan, susah dibangunin, gak bisa dibangunin, nggak bisa dibangunin |

## Kata kunci gejala

| Kode | Level | Kata kunci |
| --- | --- | --- |
| urine_orange | HIJAU | kencing merah, kencing oranye, kencing orange, pipis merah, pipis oranye, air seni merah, air seni oranye, air kencing merah, air kencing oranye, urin merah, urin oranye, urine merah, bak merah, kencing kemerahan; (kencing / pipis / air seni / air kencing / bak / urin / urine / kemih) + (merah / merah2 / oranye / orange / oren / orens / jingga / kemerahan) |
| nausea_mild | HIJAU | mual, muall, eneg, enek, mual mual, perut mual, mau muntah, ingin muntah, pengen muntah, pingin muntah, rasa mual |
| joint_ache_mild | HIJAU | nyeri sendi, sakit sendi, pegal sendi, linu sendi, ngilu sendi, sendi nyeri, sendi sakit, sendi pegal, sendi linu, linu, ngilu, asam urat; (sendi / persendian / lutut / pergelangan / siku / bahu) + (nyeri / sakit / linu / ngilu / pegal) |
| appetite_loss | HIJAU | nafsu makan, napsu makan, kurang nafsu makan, tidak nafsu makan, gak nafsu makan, malas makan, males makan, tidak mau makan, gak mau makan, ga mau makan, nggak mau makan, enggan makan, selera makan, susah makan, sulit makan, tidak doyan, gak doyan, ga doyan, tidak selera, kurang makan |
| tingling_feet | KUNING | kesemutan, kesemutn, kesemuten, semutan, kebas, baal, mati rasa, kaki panas, kaki terbakar, rasa terbakar, terbakar, tebal tebal; (kaki / telapak / tangan / jari) + (panas / terbakar / kebas / baal / tebal / kesemutan / semutan / mati rasa) |
| itching_no_rash | KUNING | gatal, gatel, gatal gatal, gatel gatel, kulit gatal, badan gatal, rasa gatal, gatal sekali, gatal banget |

Kata pemantau (menunjuk gejala yang belum ada di tabel, tidak pernah HIJAU): kuning, menguning, kekuningan, kunyit, muntah, demam, sesak, pingsan, kejang, darah, berdarah, mimisan, diare, mencret, pusing, lemas, bengkak, berdenging, tuli.

## Teks untuk keluarga per level

### HIJAU

- Penjelasan: Keluhan ini umum terjadi dan biasanya berkurang dalam 2 sampai 4 minggu.
- Tindakan: Tetap minum obat sesuai jadwal.

### KUNING

- Penjelasan: Keluhan ini perlu diperiksa oleh perawat.
- Tindakan: Tetap minum obat sesuai jadwal. Perawat akan menghubungi Anda dalam 1 hari kerja.

### MERAH

- Penjelasan: Keluhan ini perlu diperiksa petugas kesehatan hari ini. Perawat sudah diberi tahu.
- Tindakan: Berhenti dulu dan segera ke Puskesmas atau IGD hari ini.

### Peringatan tetap (dipakai bila alur bahasa tidak tersedia)

> Kalau ada mata/kulit kuning, ruam, atau gangguan penglihatan, segera ke Puskesmas.

## Yang diminta dari peninjau

1. Apakah level setiap gejala di atas sesuai pedoman nasional yang berlaku?
2. Apakah teks tindakan MERAH ("Berhenti dulu dan segera ke Puskesmas atau IGD hari ini") sudah tepat?
3. Apakah ambang lama keluhan sudah sesuai? Ambang diset ke 7 hari atau lebih, ke arah yang lebih aman.
4. Kata kunci apa yang kurang? Tambahkan sebagai kalimat nyata dari pasien atau keluarga.
