@echo off
rem dinas.cmd :: pelaksana harian Kantor Dinas (pembungkus Windows)
rem   dinas            -> buka kantornya
rem   dinas --kendali  -> sekalian izinkan halaman menugaskan pekerjaan
rem   dinas --periksa  -> cuma tampilkan status
chcp 65001 >nul 2>&1
node "%~dp0dinas.mjs" %*
