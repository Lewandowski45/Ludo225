#!/bin/bash
# Construit et signe l'APK : ./build.sh <version>   (ex. ./build.sh v2)
set -e; cd "$(dirname "$0")"
SDK=${ANDROID_SDK:-/home/claude/android-sdk}; BT=$SDK/build-tools/35.0.0; JAR=$SDK/platforms/android-34/android.jar
V=${1:-dev}; rm -rf build; mkdir -p build/res build/gen build/classes out
$BT/aapt2 compile --dir res -o build/res/res.zip
$BT/aapt2 link -o build/base.apk -I $JAR --manifest AndroidManifest.xml --java build/gen build/res/res.zip --auto-add-overlay
javac -source 11 -target 11 -nowarn -classpath $JAR -d build/classes $(find src build/gen -name '*.java')
$BT/d8 --release --min-api 24 --lib $JAR --output build $(find build/classes -name '*.class')
cp build/base.apk build/unsigned.apk; (cd build && zip -qj unsigned.apk classes.dex)
$BT/zipalign -f -p 4 build/unsigned.apk build/aligned.apk
$BT/apksigner sign --ks keys/ludoclash225.jks --ks-key-alias ludoclash225 --ks-pass "pass:$(cat keys/password.txt)" --out out/LudoClash225-$V.apk build/aligned.apk
$BT/apksigner verify out/LudoClash225-$V.apk && echo "OK -> out/LudoClash225-$V.apk"
