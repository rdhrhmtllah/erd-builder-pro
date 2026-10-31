import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  desktopDataDir,
  desktopMcpCandidates,
  desktopMcpRuntimeCandidates,
  resolveDesktopMcpRuntime,
  resolveDesktopMcpTarget,
} from '../src/desktop-mcp.mjs';

test('resolves an explicit Desktop MCP target before platform defaults', () => {
  const target = '/tmp/Creatool';
  assert.deepEqual(desktopMcpCandidates({ env: { ERDBPRO_DESKTOP_MCP_TARGET: target } }), [target]);
  assert.equal(resolveDesktopMcpTarget({
    env: { ERDBPRO_DESKTOP_MCP_TARGET: target },
    exists: candidate => candidate === target,
  }), target);
});

test('checks Linux package, local, and AppImage locations', () => {
  assert.deepEqual(desktopMcpCandidates({ platform: 'linux', env: {}, home: '/home/user' }), [
    '/usr/bin/Creatool',
    '/usr/local/bin/Creatool',
    '/home/user/.local/bin/Creatool',
    '/opt/Creatool/Creatool',
    '/home/user/Applications/Creatool.AppImage',
  ]);
});

test('runs the packaged macOS MCP backend without launching the app binary', () => {
  const executable = '/Applications/Creatool.app/Contents/MacOS/Creatool';
  const [runtime] = desktopMcpRuntimeCandidates(executable, 'darwin');
  assert.deepEqual(runtime, {
    node: '/Applications/Creatool.app/Contents/Resources/dist-server/node-bin/node',
    script: '/Applications/Creatool.app/Contents/Resources/dist-server/mcp.js',
  });
  assert.deepEqual(resolveDesktopMcpRuntime(executable, {
    platform: 'darwin',
    exists: candidate => candidate === runtime.node || candidate === runtime.script,
  }), runtime);
  assert.equal(desktopDataDir({ platform: 'darwin', home: '/Users/tester' }), '/Users/tester/Library/Application Support/com.erdbuilderpro.app');
});

test('exposes the Desktop MCP flag on the CLI command', () => {
  const result = spawnSync(process.execPath, ['cli/bin/erdbpro.js', 'mcp', '--help'], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--desktop/);
});
