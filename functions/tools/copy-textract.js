const fs = require('fs');
const path = require('path');

// Source and destination paths for v3 file
const srcPathV3 = path.join(__dirname, '..', 'src', 'textract-ocr-v3.js');
const destPathV3 = path.join(__dirname, '..', 'lib', 'textract-ocr-v3.js');

// Check if v3 source file exists
if (fs.existsSync(srcPathV3)) {
  // Create lib directory if it doesn't exist
  const libDir = path.dirname(destPathV3);
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }
  
  // Copy the v3 file
  fs.copyFileSync(srcPathV3, destPathV3);
  console.log('✓ Copied textract-ocr-v3.js to lib directory');
} else {
  console.log('⚠ textract-ocr-v3.js not found in src directory');
}
