const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '..');
const publicOcr = path.join(frontendRoot, 'public', 'ocr');
const tesseractEntry = require.resolve('tesseract.js');
const tesseractPackage = path.resolve(path.dirname(tesseractEntry), '..');
const corePackage = path.resolve(path.dirname(tesseractEntry), '../../tesseract.js-core');
const englishPackage = path.dirname(require.resolve('@tesseract.js-data/eng'));
const hindiPackage = path.dirname(require.resolve('@tesseract.js-data/hin'));

const assets = [
  [path.join(tesseractPackage, 'dist', 'worker.min.js'), 'worker.min.js'],
  [path.join(corePackage, 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [path.join(corePackage, 'tesseract-core-lstm.wasm'), 'tesseract-core-lstm.wasm'],
  [path.join(englishPackage, '4.0.0_best_int', 'eng.traineddata.gz'), 'eng.traineddata.gz'],
  [path.join(hindiPackage, '4.0.0_best_int', 'hin.traineddata.gz'), 'hin.traineddata.gz'],
];

fs.mkdirSync(publicOcr, { recursive: true });
for (const [source, filename] of assets) {
  if (!fs.existsSync(source)) throw new Error(`Missing local OCR runtime asset: ${source}`);
  fs.copyFileSync(source, path.join(publicOcr, filename));
}
console.log('Prepared local OCR worker, WASM core, and English/Hindi language data.');
