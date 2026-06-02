#!/bin/bash

echo "Building Extension Packages..."

DIST_DIR="dist"
SRC_DIR="."

EXCLUDE="*/.git/* */dist/* */competitor_temp/* */.gemini/* */build.sh */build_safari.sh */manifest_firefox.json */test_write.txt */*.zip"

mkdir -p "$DIST_DIR"

echo "Packaging for Chrome and Edge..."
zip -r "$DIST_DIR/chrome_edge_extension.zip" $SRC_DIR -x $EXCLUDE > /dev/null

echo "Packaging for Firefox..."
mkdir -p temp_firefox_build
cp -r content.js injected.js injector.js manifest_firefox.json popup.css popup.html popup_usage.js temp_firefox_build/
cp temp_firefox_build/manifest_firefox.json temp_firefox_build/manifest.json
rm temp_firefox_build/manifest_firefox.json

cd temp_firefox_build
zip -r "../$DIST_DIR/firefox_extension.zip" . > /dev/null
cd ..
rm -rf temp_firefox_build

echo "Done! The extension packages are in the '$DIST_DIR' folder."
