/**
 * Verifies the built BCU helper (src-tauri/resources/bcu) against protocol v1:
 * stdout carries only JSON lines, exit codes are stable, the inventory is
 * complete, and Windows Features are listed (the .NET 10 WMI patch).
 *
 * Read-only: `inventory` only queries the system. Run with `pnpm bcu:test`
 * after `pnpm bcu:build`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helper = join(root, 'src-tauri/resources/bcu/disco-bcu-helper.exe');
const SCHEMA_VERSION = 1;
const INVENTORY_TIMEOUT_MS = 10 * 60 * 1000;

if (process.platform !== 'win32') {
  console.log('Skipping BCU helper tests: the helper is Windows-only.');
  process.exit(0);
}
if (!existsSync(helper)) {
  console.error('BCU helper is not built. Run `pnpm bcu:build` first.');
  process.exit(1);
}

let failures = 0;
function check(condition, message) {
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${message}`);
}

function invoke(args, timeout = 60_000) {
  const result = spawnSync(helper, args, { encoding: 'utf8', timeout, windowsHide: true });
  if (result.error) throw result.error;
  const lines = result.stdout.split(/\r?\n/u).filter(Boolean);
  const messages = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      check(false, `${args.join(' ')}: stdout line ${index + 1} is not JSON: ${line.slice(0, 120)}`);
      return {};
    }
  });
  for (const message of messages) {
    check(message.schemaVersion === SCHEMA_VERSION, `${args.join(' ')}: schemaVersion must be ${SCHEMA_VERSION}`);
    check(typeof message.type === 'string', `${args.join(' ')}: every message needs a type`);
  }
  return { status: result.status, messages };
}

const version = invoke(['version']);
check(version.status === 0, 'version exits with 0');
check(version.messages.length === 1 && version.messages[0].type === 'version', 'version prints one version message');

for (const args of [[], ['bogus'], ['inventory', 'extra']]) {
  const usage = invoke(args);
  check(usage.status === 2, `"${args.join(' ')}" exits with 2`);
  check(
    usage.messages.at(-1)?.type === 'error' && usage.messages.at(-1)?.code === 'usage',
    `"${args.join(' ')}" reports a usage error`
  );
}

const started = Date.now();
const inventory = invoke(['inventory'], INVENTORY_TIMEOUT_MS);
const elapsedSeconds = Math.round((Date.now() - started) / 1000);
check(inventory.status === 0, 'inventory exits with 0');
check(!inventory.messages.some(message => message.type === 'error'), 'inventory reports no errors');
const result = inventory.messages.at(-1);
check(result?.type === 'inventory', 'inventory ends with one inventory message');
check(inventory.messages.filter(message => message.type === 'inventory').length === 1, 'exactly one inventory message');
check(
  inventory.messages.slice(0, -1).every(message => ['progress', 'warning'].includes(message.type)),
  'only progress and warning messages precede the inventory'
);
const applications = Array.isArray(result?.applications) ? result.applications : [];
check(applications.length > 0, 'inventory lists applications');
for (const application of applications) {
  const valid =
    typeof application.displayName === 'string' &&
    typeof application.kind === 'string' &&
    typeof application.architecture === 'string' &&
    ['isRegistered', 'isOrphaned', 'isProtected', 'isUpdate', 'isSystemComponent', 'isValid'].every(
      field => typeof application[field] === 'boolean'
    );
  check(valid, `application fields are typed: ${JSON.stringify(application).slice(0, 160)}`);
  if (!valid) break;
}
const kinds = Object.groupBy(applications, application => application.kind);
check((kinds.WindowsFeature?.length ?? 0) > 0, 'Windows Features are listed (WMI rewindable patch for .NET 10)');

const summary = Object.entries(kinds)
  .map(([kind, items]) => `${kind}=${items.length}`)
  .join(' ');
console.log(`Inventory: ${applications.length} applications in ${elapsedSeconds}s (${summary})`);
if (failures) {
  console.error(`${failures} BCU helper check(s) failed.`);
  process.exit(1);
}
console.log('BCU helper protocol checks passed.');
