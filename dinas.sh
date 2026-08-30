#!/usr/bin/env sh
# dinas.sh :: pelaksana harian Kantor Dinas (pembungkus POSIX)
exec node "$(dirname "$0")/dinas.mjs" "$@"
