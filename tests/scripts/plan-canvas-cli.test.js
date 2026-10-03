/**
 * Tests for the Plan Canvas CLI (scripts/plan-canvas.js) run as its own
 * process, the way agents call it. The server tests in plan-canvas.test.js
 * start the server in-process, so they never exercise the CLI starting the
 * detached server by itself.
 *
 * Run with: node tests/scripts/plan-canvas-cli.test.js
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, '..', '..', 'scripts', 'plan-canvas.js');
const CLI_TIMEOUT_MS = 20000;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.stack || err.message}`);
    return false;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Runs the CLI and returns its JSON output, also when it exits with an error.
function runCli(args, env) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
      timeout: CLI_TIMEOUT_MS
    });
    return JSON.parse(stdout.trim());
  } catch (err) {
    const stdout = String(err.stdout || '').trim();
    if (!stdout) throw err;
    return JSON.parse(stdout);
  }
}

async function main() {
  console.log('\n=== Testing plan-canvas CLI ===\n');

  let passed = 0;
  let failed = 0;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-canvas-cli-'));
  const artifact = path.join(tmp, 'feature.plan.md');
  fs.writeFileSync(artifact, '# Feature plan\n\n## Phase 1\n\nShip it.\n');
  const env = {
    ECC_PLAN_CANVAS_PORT: String(await freePort()),
    ECC_PLAN_CANVAS_STATE_DIR: path.join(tmp, 'state')
  };

  try {
    if (await test('open starts the canvas server itself when none is running', async () => {
      const result = runCli(['open', artifact, '--no-open'], env);
      assert.strictEqual(result.error, undefined, `open failed: ${result.error}`);
      assert.strictEqual(result.status, 'open');
      assert.ok(result.url.startsWith(`http://127.0.0.1:${env.ECC_PLAN_CANVAS_PORT}/`));
    })) passed++; else failed++;
  } finally {
    try {
      runCli(['stop'], env);
    } catch {
      // Nothing to stop when open never started a server.
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('\n' + '='.repeat(40));
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('='.repeat(40));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  console.log('Passed: 0');
  console.log('Failed: 1');
  process.exit(1);
});
