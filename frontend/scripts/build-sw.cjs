/**
 * Injects deterministic version identifiers into sw.js and writes version.json
 * executed before every Next.js production build.
 */
const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..');
const templatePath = path.join(frontendDir, 'src/sw/sw.template.js');
const targetSwPath = path.join(frontendDir, 'public/sw.js');
const targetVersionPath = path.join(frontendDir, 'public/version.json');

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
if (fs.existsSync(templatePath)) {
  let template = fs.readFileSync(templatePath, 'utf8');
  template = template.replace(/__SW_VERSION__/g, swVersion);
  fs.writeFileSync(targetSwPath, template, 'utf8');
  console.log(`[build-sw] Generated public/sw.js with version: ${swVersion}`);
} else {
  console.warn(`[build-sw] Template not found at ${templatePath}`);
}

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
