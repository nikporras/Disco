/**
 * Verifies that public product names, bundle identifiers, binary names, and
 * required brand assets remain consistent across the frontend, Tauri, and CLI
 * entry points.
 *
 * Run with `pnpm check:identity`. The command throws with the mismatched field
 * or missing asset when a product identity regression is detected.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(projectRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function assertContains(content, expected, label) {
  if (!content.includes(expected)) {
    throw new Error(`${label} must contain ${JSON.stringify(expected)}.`);
  }
}

function assertNotContains(content, unexpected, label) {
  if (content.includes(unexpected)) {
    throw new Error(`${label} must not contain ${JSON.stringify(unexpected)}.`);
  }
}

function assertMissing(relativePath) {
  if (existsSync(join(projectRoot, relativePath))) {
    throw new Error(`Retired product asset must be removed: ${relativePath}.`);
  }
}

function assertExists(relativePath) {
  if (!existsSync(join(projectRoot, relativePath))) {
    throw new Error(`Required product asset is missing: ${relativePath}.`);
  }
}

const packageJson = readJson('package.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');
const tauriManifest = readText('src-tauri/Cargo.toml');
const cliManifest = readText('src-tauri/crates/mangodisk-cli/Cargo.toml');
const readme = readText('README.md');
const indexHtml = readText('index.html');
const tauriLibrary = readText('src-tauri/src/lib.rs');
const coreLibrary = readText('src-tauri/crates/mangodisk-core/src/lib.rs');
const tauriMain = readText('src-tauri/src/main.rs');
const macosChangeTracking = readText('src-tauri/crates/mangodisk-platform/src/macos/change_tracking.rs');
const applicationShell = readText('src/lib/models/application-shell.ts');
const feedbackService = readText('src-tauri/src/services/feedback.rs');
const officialAi = readText('src-tauri/crates/mangodisk-core/src/ai/official.rs');

const APPLICATION_IDENTIFIER = 'io.github.nikporras.disco';
const REPOSITORY = 'https://github.com/nikporras/Disco';

assertEqual(packageJson.name, 'disco', 'npm package name');
assertEqual(packageJson.homepage, REPOSITORY, 'npm homepage');
assertEqual(tauriConfig.productName, 'Disco', 'Tauri product name');
assertEqual(tauriConfig.identifier, APPLICATION_IDENTIFIER, 'Tauri bundle identifier');
assertContains(
  coreLibrary,
  `pub const APPLICATION_IDENTIFIER: &str = "${APPLICATION_IDENTIFIER}";`,
  'Core application identifier'
);
assertEqual(tauriConfig.mainBinaryName, 'Disco', 'Tauri binary name');
assertEqual(tauriConfig.app?.windows?.[0]?.title, 'Disco', 'main window title');
assertEqual(tauriConfig.bundle?.publisher, 'Disco', 'installer publisher');
assertEqual(tauriConfig.bundle?.homepage, REPOSITORY, 'installer homepage');
for (const platform of ['windows', 'macos', 'linux']) {
  const platformConfig = readJson(`src-tauri/tauri.${platform}.conf.json`);
  assertEqual(platformConfig.app?.windows?.[0]?.title, 'Disco', `${platform} main window title`);
}

// Internal crate names stay `mangodisk-*` until the level 2 rename; the CLI command is `disco`.
assertContains(tauriManifest, 'name = "mangodisk"', 'Tauri package manifest');
assertContains(tauriManifest, 'name = "mangodisk_lib"', 'Tauri library manifest');
assertContains(cliManifest, 'name = "mangodisk-cli"', 'CLI package manifest');
assertContains(cliManifest, '[[bin]]\nname = "disco"', 'CLI binary manifest');

assertExists('public/disco.png');
assertExists('public/disco.svg');
assertExists('src/components/icons/md-icon-disco.vue');
assertExists('NOTICE');
for (const retired of ['public/mangodisk.png', 'public/mangodisk.svg', 'src/components/icons/md-icon-mangodisk.vue']) {
  assertMissing(retired);
}

assertContains(readme, 'disco clean', 'README CLI usage');
assertContains(indexHtml, '<title>Disco</title>', 'HTML application shell');
assertContains(applicationShell, "APP_NAME = 'Disco'", 'frontend application name');
assertContains(applicationShell, `repository: '${REPOSITORY}'`, 'frontend repository link');
assertContains(tauriLibrary, 'Disco failed to start', 'Tauri library');
assertContains(tauriMain, 'mangodisk_lib', 'Tauri entry point');
assertContains(macosChangeTracking, `${APPLICATION_IDENTIFIER}.cache-dirty-monitor`, 'macOS cache monitor identity');

// S2: Disco never updates to MangoDisk nor calls mangodisk.app services.
assertEqual(tauriConfig.plugins?.updater?.pubkey, '', 'updater public key');
assertEqual(JSON.stringify(tauriConfig.plugins?.updater?.endpoints), '[]', 'updater endpoints');
assertNotContains(JSON.stringify(tauriConfig), 'mangodisk.app', 'Tauri configuration');
assertNotContains(applicationShell, 'mangodisk.app', 'frontend project links');
assertContains(feedbackService, 'const PRODUCTION_FEEDBACK_URL: Option<&str> = None;', 'feedback service endpoint');
assertContains(officialAi, 'const RELEASE_ORIGIN: Option<&str> = None;', 'official AI origin');

console.log('Product identity is consistent.');
