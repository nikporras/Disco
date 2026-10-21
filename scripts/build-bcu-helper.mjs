/**
 * Builds Disco's read-only BCU helper (helpers/disco-bcu-helper) on Windows.
 *
 * 1. Verifies a pristine BCU checkout at the commit pinned in helpers/bcu/bcu.lock.json.
 *    Source: DISCO_BCU_SOURCE, else third_party/bcu, else a sibling ../BCU checkout.
 * 2. Copies it to target/bcu-build/src and applies helpers/bcu/patches.mjs there.
 *    The pristine checkout is never modified.
 * 3. Builds the helper and BCU's read-only query helpers with Visual Studio MSBuild
 *    (UninstallTools has a COM reference that `dotnet build` cannot resolve).
 * 4. Copies the output, BCU's license and NOTICE to src-tauri/resources/bcu.
 *
 * Run with `pnpm bcu:build`.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BCU_PATCHES, MODIFIED_NOTICE } from '../helpers/bcu/patches.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'helpers/bcu/bcu.lock.json'), 'utf8'));
const buildRoot = join(root, 'target/bcu-build');
const sourceCopy = join(buildRoot, 'src');
const output = join(buildRoot, 'out');
const resources = join(root, 'src-tauri/resources/bcu');
// Read-only query helpers that UninstallTools launches when present. WinUpdateHelper
// is omitted because Windows Update scanning is disabled in the helper.
const QUERY_HELPERS = ['SteamHelper', 'StoreAppHelper', 'OculusHelper', 'ScriptHelper'];

if (process.platform !== 'win32') {
  console.log('Skipping BCU helper: it is Windows-only.');
  process.exit(0);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}

function fail(message) {
  console.error(`BCU helper build failed: ${message}`);
  process.exit(1);
}

function resolveSource() {
  const candidates = [process.env.DISCO_BCU_SOURCE, join(root, 'third_party/bcu'), resolve(root, '..', 'BCU')];
  const source = candidates.find(candidate => candidate && existsSync(join(candidate, 'source/UninstallTools')));
  if (!source) fail('BCU sources not found. Set DISCO_BCU_SOURCE to a Bulk Crap Uninstaller checkout.');
  return source;
}

function verifyPristine(source) {
  const head = run('git', ['-C', source, 'rev-parse', 'HEAD']).stdout.trim();
  if (head !== lock.commit) fail(`${source} is at ${head || 'unknown'}, expected pinned commit ${lock.commit}.`);
  const status = run('git', ['-C', source, 'status', '--porcelain']).stdout.trim();
  if (status) fail(`${source} has local changes; the build only uses a pristine checkout.`);
}

function copySource(source) {
  rmSync(buildRoot, { recursive: true, force: true });
  mkdirSync(sourceCopy, { recursive: true });
  cpSync(join(source, 'source'), join(sourceCopy, 'source'), {
    recursive: true,
    filter: path => !/[\\/](bin|obj|\.vs)([\\/]|$)/u.test(path.slice(source.length)),
  });
  for (const file of ['Licence.txt', 'NOTICE']) cpSync(join(source, file), join(sourceCopy, file));
}

function applyPatches() {
  for (const patch of BCU_PATCHES) {
    const path = join(sourceCopy, patch.file);
    let text = readFileSync(path, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const native = value => value.replace(/\r\n/gu, '\n').replace(/\n/gu, eol);
    for (const [find, replace] of patch.replacements) {
      const needle = native(find);
      const first = text.indexOf(needle);
      if (first < 0 || text.indexOf(needle, first + 1) >= 0) {
        fail(`patch "${patch.reason}" does not match exactly once in ${patch.file}.`);
      }
      text = text.slice(0, first) + native(replace) + text.slice(first + needle.length);
    }
    if (patch.header) {
      // Keep BCU's license header first and mark the file as modified right after it.
      const end = text.indexOf('*/');
      if (end < 0) fail(`no license header in ${patch.file}.`);
      text = `${text.slice(0, end + 2)}${eol}// ${MODIFIED_NOTICE}: ${patch.reason}.${text.slice(end + 2)}`;
    }
    writeFileSync(path, text);
    console.log(`Patched ${patch.file}: ${patch.reason}`);
  }
}

function findMsBuild() {
  const vswhere = join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft Visual Studio/Installer/vswhere.exe'
  );
  if (!existsSync(vswhere)) fail('vswhere.exe not found; install Visual Studio or Build Tools with MSBuild.');
  const found = run(vswhere, [
    '-latest',
    '-products',
    '*',
    '-requires',
    'Microsoft.Component.MSBuild',
    '-find',
    'MSBuild\\**\\Bin\\MSBuild.exe',
  ])
    .stdout.split(/\r?\n/u)
    .map(line => line.trim())
    .find(Boolean);
  if (!found) fail('MSBuild.exe not found through vswhere.');
  return found;
}

function msbuild(msbuildPath, project, extra = []) {
  const args = [
    project,
    '-restore',
    '-nologo',
    '-verbosity:minimal',
    '-p:Configuration=Release',
    '-p:Platform=x64',
    `-p:OutputPath=${output}\\`,
    ...extra,
  ];
  const result = run(msbuildPath, args, { stdio: 'inherit' });
  if (result.status !== 0) fail(`MSBuild failed for ${project}.`);
}

const source = resolveSource();
verifyPristine(source);
console.log(`Using BCU ${lock.commit} from ${source}`);
copySource(source);
applyPatches();

const msbuildPath = findMsBuild();
msbuild(msbuildPath, join(root, 'helpers/disco-bcu-helper/DiscoBcuHelper.csproj'), [`-p:BcuSourceRoot=${sourceCopy}`]);
for (const helper of QUERY_HELPERS) {
  msbuild(msbuildPath, join(sourceCopy, `source/${helper}/${helper}.csproj`));
}

rmSync(resources, { recursive: true, force: true });
mkdirSync(resources, { recursive: true });
cpSync(output, resources, { recursive: true, filter: path => !path.endsWith('.pdb') });
cpSync(join(sourceCopy, 'Licence.txt'), join(resources, 'BCU-LICENSE.txt'));
cpSync(join(sourceCopy, 'NOTICE'), join(resources, 'BCU-NOTICE.txt'));
writeFileSync(
  join(resources, 'bcu-build.json'),
  `${JSON.stringify(
    {
      repository: lock.repository,
      commit: lock.commit,
      patches: BCU_PATCHES.map(patch => ({ file: patch.file, reason: patch.reason })),
    },
    null,
    2
  )}\n`
);
console.log(`BCU helper ready in ${resources}`);
