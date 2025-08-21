/*
  Postbuild copy to ensure textract-ocr.js (JS source) is available in lib/
  This is necessary because tsconfig does not enable allowJs, so tsc will not emit JS.
*/
const fs = require('fs');
const path = require('path');

function copyTextract() {
  const src = path.resolve(__dirname, '..', 'src', 'textract-ocr-v3.js');
  const dest = path.resolve(__dirname, '..', 'lib', 'textract-ocr-v3.js');

  try {
    if (!fs.existsSync(src)) {
      console.warn(`[copy-textract] Source not found: ${src}`);
      process.exitCode = 0; // do not fail build hard; log warning
      return;
    }

    // Ensure destination directory exists
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.copyFileSync(src, dest);

    // Verify
    if (!fs.existsSync(dest)) {
      console.error('[copy-textract] Copy failed: destination missing after copy');
      process.exit(1);
    }

    const srcStat = fs.statSync(src);
    const destStat = fs.statSync(dest);
    console.log(`[copy-textract] Copied textract-ocr.js to lib (size: ${destStat.size} bytes)`);

    // Basic sanity: sizes should match
    if (srcStat.size !== destStat.size) {
      console.warn('[copy-textract] Warning: source and destination sizes differ');
    }
  } catch (err) {
    console.error('[copy-textract] Error during copy:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

copyTextract();
