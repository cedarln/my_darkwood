#!/usr/bin/env bash
# 构建签名 release 包并算出 sha256（发布页要核对）。
# 用法：./scripts/build-release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-/Users/linan/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home}"

if [[ ! -f keystore.properties ]]; then
  echo "缺少 keystore.properties（密钥库在工程外，见 app/build.gradle 注释），拒绝构建未签名包" >&2
  exit 1
fi

./gradlew --no-daemon testDebugUnitTest assembleRelease

VER=$(grep -Eo 'versionName "[^"]+"' app/build.gradle | head -1 | sed 's/.*"\(.*\)".*/\1/')
APK="app/build/outputs/apk/release/暗林-v${VER}-release.apk"
[[ -f "$APK" ]] || { echo "找不到产物 $APK" >&2; exit 1; }

mkdir -p dist
cp "$APK" "dist/"
cd dist
shasum -a 256 "暗林-v${VER}-release.apk" | tee "SHA256SUMS-v${VER}.txt"
echo
echo "产物：dist/暗林-v${VER}-release.apk（$(du -h "暗林-v${VER}-release.apk" | cut -f1)）"
echo "发布：gh release create v${VER} \"暗林-v${VER}-release.apk\" --title \"v${VER}\" --notes-file ../docs/release-notes-v${VER}.md"
