import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Helper to parse PNG dimensions directly from IHDR chunk (without third-party dependencies)
function getPngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  // PNG signature is 8 bytes: 89 50 4E 47 0D 0A 1A 0A
  const signature = buf.subarray(0, 8);
  const expectedSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(
    signature.equals(expectedSig),
    `File ${path.basename(filePath)} does not have valid PNG signature`
  );

  // IHDR chunk starts at byte 12 (length 4 bytes, chunk type 'IHDR' 4 bytes)
  const chunkType = buf.subarray(12, 16).toString('ascii');
  assert.equal(chunkType, 'IHDR', `File ${path.basename(filePath)} missing IHDR chunk`);

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

describe('PWA Web App Manifest, Icon Assets & Baseline Installability', () => {
  test('manifest() returns valid W3C metadata matching Ledger Minimal specification', async () => {
    // Dynamic import to test Next.js metadata route function
    const { default: manifest } = await import('../src/app/manifest.js');
    const m = manifest();

    assert.equal(m.name, 'Arth — Personal Finance Tracker');
    assert.equal(m.short_name, 'Arth');
    assert.equal(m.start_url, '/');
    assert.equal(m.scope, '/');
    assert.equal(m.id, '/');
    assert.equal(m.display, 'standalone');
    assert.equal(m.background_color, '#FBFBF9');
    assert.equal(m.theme_color, '#1C1917');
    assert.equal(m.lang, 'en-IN');
    assert.equal(m.dir, 'ltr');
    assert.equal(m.prefer_related_applications, false);

    assert.ok(Array.isArray(m.icons), 'Icons must be an array');
    assert.ok(m.icons.length >= 4, 'Must provide at least 4 icon specifications');

    type ManifestIcon = { sizes?: string; src?: string; type?: string; purpose?: string };

    // Verify 192x192
    const icon192 = (m.icons as ManifestIcon[]).find((i) => i.sizes === '192x192');
    assert.ok(icon192, 'Missing 192x192 icon');
    assert.equal(icon192.src, '/icons/icon-192x192.png');
    assert.equal(icon192.type, 'image/png');

    // Verify 512x512 standard
    const icon512 = (m.icons as ManifestIcon[]).find(
      (i) => i.sizes === '512x512' && (!i.purpose || i.purpose === 'any')
    );
    assert.ok(icon512, 'Missing 512x512 standard icon');
    assert.equal(icon512.src, '/icons/icon-512x512.png');
    assert.equal(icon512.type, 'image/png');

    // Verify 512x512 maskable
    const iconMaskable = (m.icons as ManifestIcon[]).find(
      (i) => i.sizes === '512x512' && i.purpose === 'maskable'
    );
    assert.ok(iconMaskable, 'Missing 512x512 maskable icon');
    assert.equal(iconMaskable.src, '/icons/icon-512x512-maskable.png');
    assert.equal(iconMaskable.type, 'image/png');

    // Verify 180x180 apple touch icon
    const iconApple = (m.icons as ManifestIcon[]).find((i) => i.sizes === '180x180');
    assert.ok(iconApple, 'Missing 180x180 apple icon');
    assert.equal(iconApple.src, '/icons/apple-touch-icon.png');
    assert.equal(iconApple.type, 'image/png');
  });

  test('all required icon assets exist on disk with exact dimensions and valid PNG signatures', () => {
    const iconsDir = path.join(projectRoot, 'public', 'icons');
    assert.ok(fs.existsSync(iconsDir), 'public/icons directory must exist');

    const expectedIcons = [
      { filename: 'icon-192x192.png', width: 192, height: 192 },
      { filename: 'icon-512x512.png', width: 512, height: 512 },
      { filename: 'icon-512x512-maskable.png', width: 512, height: 512 },
      { filename: 'apple-touch-icon.png', width: 180, height: 180 },
    ];

    for (const exp of expectedIcons) {
      const fullPath = path.join(iconsDir, exp.filename);
      assert.ok(fs.existsSync(fullPath), `Icon file ${exp.filename} must exist`);
      const { width, height } = getPngDimensions(fullPath);
      assert.equal(width, exp.width, `${exp.filename} width must be ${exp.width}`);
      assert.equal(height, exp.height, `${exp.filename} height must be ${exp.height}`);
      const stats = fs.statSync(fullPath);
      assert.ok(stats.size > 500, `${exp.filename} must be a non-trivial graphic (>500 bytes)`);
    }

    const faviconPath = path.join(projectRoot, 'public', 'favicon.ico');
    assert.ok(fs.existsSync(faviconPath), 'public/favicon.ico must exist');
    assert.ok(fs.statSync(faviconPath).size > 100, 'favicon.ico must be non-empty');
  });

  test('no service worker registration or offline caching frameworks are present in Phase 01N', () => {
    // Phase 01N strictly proscribes service workers and offline transactions
    const srcDir = path.join(projectRoot, 'src');
    const publicDir = path.join(projectRoot, 'public');

    // 1. Check no service-worker files exist in public/
    const publicFiles = fs.readdirSync(publicDir);
    const swFiles = publicFiles.filter((f) => /service-worker|sw\.js|worker\.js/i.test(f));
    assert.deepEqual(swFiles, [], 'Service worker script must not exist in public/');

    // 2. Scan all files in src/ for serviceWorker.register
    function scanDir(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(scanDir(fullPath));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const sourceFiles = scanDir(srcDir);
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        !content.includes('serviceWorker.register'),
        `Service worker registration detected in ${path.relative(projectRoot, filePath)}`
      );
      assert.ok(
        !content.includes('dexie') && !content.includes('idb-keyval'),
        `IndexedDB wrapper library detected in ${path.relative(projectRoot, filePath)}`
      );
    }
  });

  test('root layout defines viewport theme colors and Apple web app metadata', () => {
    const layoutPath = path.join(projectRoot, 'src', 'app', 'layout.tsx');
    assert.ok(fs.existsSync(layoutPath), 'src/app/layout.tsx must exist');

    const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

    // Verify viewport export with themeColor
    assert.ok(
      layoutContent.includes('export const viewport: Viewport'),
      'layout.tsx must export typed viewport'
    );
    assert.ok(
      layoutContent.includes('#FBFBF9'),
      'viewport must define #FBFBF9 for light mode'
    );
    assert.ok(
      layoutContent.includes('#0C0A09'),
      'viewport must define #0C0A09 for dark mode'
    );
    assert.ok(
      layoutContent.includes('viewportFit: "cover"'),
      'viewport must configure viewportFit cover for edge-to-edge mobile screens'
    );

    // Verify metadata export with appleWebApp and icons
    assert.ok(
      layoutContent.includes('export const metadata: Metadata'),
      'layout.tsx must export typed metadata'
    );
    assert.ok(
      layoutContent.includes('appleWebApp:'),
      'metadata must include appleWebApp configuration'
    );
    assert.ok(
      layoutContent.includes('capable: true'),
      'appleWebApp must set capable: true'
    );
    assert.ok(
      layoutContent.includes("statusBarStyle: 'default'") ||
        layoutContent.includes('statusBarStyle: "default"'),
      'appleWebApp must set statusBarStyle'
    );
    assert.ok(
      layoutContent.includes('/icons/apple-touch-icon.png'),
      'metadata must reference apple-touch-icon.png'
    );
    assert.ok(
      layoutContent.includes('/icons/icon-192x192.png'),
      'metadata must reference icon-192x192.png'
    );
    assert.ok(
      layoutContent.includes('/icons/icon-512x512.png'),
      'metadata must reference icon-512x512.png'
    );
  });
});
