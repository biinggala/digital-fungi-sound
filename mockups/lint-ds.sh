#!/bin/sh
# 디자인 시스템 검사: 화면 파일에는 색 값이 없어야 하고, px는 1 또는 4의 배수만.
# 색과 크기는 ds.css의 토큰으로만 쓴다. ds.css 자체는 토큰 정의 파일이라 검사하지 않는다.
cd "$(dirname "$0")"
fail=0
for f in "$@"; do
  c=$(grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' "$f" | grep -vE 'href=|&#' )
  [ -n "$c" ] && { echo "$f: raw color"; echo "$c"; fail=1; }
  p=$(perl -ne 'while (/(?<![\d.])(\d+)px/g) { print "line $.: $1px\n" if $1 != 1 && $1 % 4 }' "$f")
  [ -n "$p" ] && { echo "$f: px not on 4-grid (line:value)"; echo "$p"; fail=1; }
done
[ $fail = 0 ] && echo "ds lint ok: $*"
exit $fail
