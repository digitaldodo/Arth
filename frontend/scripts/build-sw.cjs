/**
 * Injects deterministic version identifiers into sw.js and writes version.json
 * executed after every Next.js production build so it can include the shell chunks.
 */
const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..');
const templatePath = path.join(frontendDir, 'src/sw/sw.template.js');
const targetSwPath = path.join(frontendDir, 'public/sw.js');
const targetVersionPath = path.join(frontendDir, 'public/version.json');
const staticDir = path.join(frontendDir, '.next/static');

function collectShellAssets(directory, relative = '') {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    const nextRelative = path.join(relative, entry.name).split(path.sep).join('/');
    if (entry.isDirectory()) return collectShellAssets(absolute, nextRelative);
    return /\.(?:js|css|woff2?|ttf|otf)$/i.test(entry.name) ? [`/_next/static/${nextRelative}`] : [];
  });
}

// Precache the static chunks needed to bootstrap and use the app offline. The list
// is limited to build output (never API responses or personalized HTML).
const precacheAssets = [
  '/offline',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-512x512-maskable.png',
  '/icons/apple-touch-icon.png',
  ...collectShellAssets(staticDir),
];

// Derive version from Vercel commit SHA or local timestamp
const gitCommitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  '';

const shortSha = gitCommitSha ? gitCommitSha.substring(0, 7) : 'v1';
const timestamp = Math.floor(Date.now() / 1000).toString(36);
const swVersion = `${shortSha}-${timestamp}`;
const builtAt = new Date().toISOString();

// 1. Generate public/sw.js from template
if (!fs.existsSync(templatePath)) {
  throw new Error(`[build-sw] Required service-worker template not found at ${templatePath}`);
}
let template = fs.readFileSync(templatePath, 'utf8');
template = template.replace(/__SW_VERSION__/g, swVersion);
template = template.replace('__PRECACHE_ASSETS__', JSON.stringify([...new Set(precacheAssets)]));
if (template.includes('__SW_VERSION__')) {
  throw new Error('[build-sw] Service-worker version placeholder was not fully replaced');
}
if (template.includes('__PRECACHE_ASSETS__')) {
  throw new Error('[build-sw] Service-worker precache placeholder was not replaced');
}
fs.writeFileSync(targetSwPath, template, 'utf8');
console.log(`[build-sw] Generated public/sw.js with version: ${swVersion}`);

// 2. Generate public/version.json for client update polling
const versionInfo = {
  version: '0.1.0',
  buildId: swVersion,
  commitSha: gitCommitSha || null,
  builtAt,
};

fs.writeFileSync(
  targetVersionPath,
  JSON.stringify(versionInfo, null, 2),
  'utf8'
);
console.log(`[build-sw] Generated public/version.json with buildId: ${swVersion}`);
