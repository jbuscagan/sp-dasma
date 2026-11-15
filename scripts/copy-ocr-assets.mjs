// Copies the text-reader (OCR) files from node_modules into public/ocr before every build,
// so the site serves them itself (works on office networks that block CDNs; no third party contacted).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = join(process.cwd(), 'public', 'ocr');
const pkg = (name) => dirname(require.resolve(`${name}/package.json`));

const files = [
  [join(pkg('tesseract.js'), 'dist', 'worker.min.js'), join(out, 'worker.min.js')],
  [join(pkg('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'), join(out, 'core', 'tesseract-core-simd-lstm.wasm.js')],
  [join(pkg('tesseract.js-core'), 'tesseract-core-lstm.wasm.js'), join(out, 'core', 'tesseract-core-lstm.wasm.js')],
  [join(pkg('@tesseract.js-data/eng'), '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang', 'eng.traineddata.gz')],
];

for (const [from, to] of files) {
  if (!existsSync(from)) {
    console.warn(`[ocr] missing ${from} — scanning will download it from the internet instead`);
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}
console.log('[ocr] text-reader files copied to public/ocr');
