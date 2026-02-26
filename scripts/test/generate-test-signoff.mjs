import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const commandSets = {
  release: [
    { id: 'lint', label: 'ESLint', command: 'npm', args: ['run', 'lint'] },
    { id: 'typecheck', label: 'TypeScript', command: 'npx', args: ['tsc', '--noEmit', '--project', 'tsconfig.json'] },
    { id: 'unit', label: 'Unit / Component Tests', command: 'npm', args: ['run', 'test:unit'] },
    { id: 'db', label: 'DB / RLS Suite', command: 'npm', args: ['run', 'test:db'] },
    { id: 'backend', label: 'Backend Contract Tests', command: 'npm', args: ['run', 'test:backend'] },
    { id: 'build_web', label: 'Web Build', command: 'npm', args: ['run', 'build:web'] },
    {
      id: 'notif_smoke',
      label: 'Notification Dispatch Smoke',
      command: 'npm',
      args: ['run', 'test:notifications:smoke', '--', '--skip-worker', '--json'],
    },
    {
      id: 'route_sim',
      label: 'Notification Route Policy Matrix',
      command: 'npm',
      args: ['run', 'test:notifications:route-sim', '--', '--assert-matrix'],
    },
  ],
  quick: [
    { id: 'lint', label: 'ESLint', command: 'npm', args: ['run', 'lint'] },
    { id: 'typecheck', label: 'TypeScript', command: 'npx', args: ['tsc', '--noEmit', '--project', 'tsconfig.json'] },
    { id: 'unit', label: 'Unit / Component Tests', command: 'npm', args: ['run', 'test:unit'] },
    {
      id: 'route_sim',
      label: 'Notification Route Policy Matrix',
      command: 'npm',
      args: ['run', 'test:notifications:route-sim', '--', '--assert-matrix'],
    },
  ],
  'web-pwa': [
    { id: 'lint', label: 'ESLint', command: 'npm', args: ['run', 'lint'] },
    { id: 'typecheck', label: 'TypeScript', command: 'npx', args: ['tsc', '--noEmit', '--project', 'tsconfig.json'] },
    { id: 'build_web', label: 'Web Build', command: 'npm', args: ['run', 'build:web'] },
    {
      id: 'notif_smoke',
      label: 'Notification Dispatch Smoke',
      command: 'npm',
      args: ['run', 'test:notifications:smoke', '--', '--skip-worker', '--json'],
    },
    {
      id: 'route_sim',
      label: 'Notification Route Policy Matrix',
      command: 'npm',
      args: ['run', 'test:notifications:route-sim', '--', '--assert-matrix'],
    },
  ],
};

const usage = `Usage: node scripts/test/generate-test-signoff.mjs [options]

Creates a release/candidate signoff artifact with explicit signatures and command results.

Required:
  --release-label <label>     e.g. v1.4.0-rc1 or staging-2026-02-26
  --environment <name>        e.g. local, staging, prod
  --test-author <name>        person who authored/owns the test plan
  --run-by <name>             person who executed the run

Optional:
  --mode <release|quick|web-pwa>   default: release
  --candidate-commit <sha>
  --notes <text>
  --json                          print summary JSON to stdout
  --help

Examples:
  npm run test:signoff -- --release-label staging-2026-02-26 --environment staging --test-author "Churro" --run-by "Churro"
  npm run test:signoff -- --release-label v1.4.0-rc1 --environment staging --test-author "Churro" --run-by "Churro" --mode web-pwa --json
`;

function parseArgs(argv) {
  const out = {
    releaseLabel: null,
    environment: null,
    testAuthor: null,
    runBy: null,
    mode: 'release',
    candidateCommit: null,
    notes: null,
    json: false,
    help: false,
  };

  const takeValue = (i, key, raw) => {
    if (raw.includes('=')) {
      return { value: raw.slice(raw.indexOf('=') + 1), nextIndex: i };
    }
    const value = argv[i + 1];
    if (typeof value !== 'string' || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`);
    }
    return { value, nextIndex: i + 1 };
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    if (arg.startsWith('--release-label')) {
      const { value, nextIndex } = takeValue(i, '--release-label', arg);
      out.releaseLabel = value.trim() || null;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--environment')) {
      const { value, nextIndex } = takeValue(i, '--environment', arg);
      out.environment = value.trim() || null;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--test-author')) {
      const { value, nextIndex } = takeValue(i, '--test-author', arg);
      out.testAuthor = value.trim() || null;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--run-by')) {
      const { value, nextIndex } = takeValue(i, '--run-by', arg);
      out.runBy = value.trim() || null;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--mode')) {
      const { value, nextIndex } = takeValue(i, '--mode', arg);
      out.mode = value.trim() || out.mode;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--candidate-commit')) {
      const { value, nextIndex } = takeValue(i, '--candidate-commit', arg);
      out.candidateCommit = value.trim() || null;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--notes')) {
      const { value, nextIndex } = takeValue(i, '--notes', arg);
      out.notes = value.trim() || null;
      i = nextIndex;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return out;
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remSeconds}s`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    return { ok: false, text: result.error.message };
  }
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return { ok: result.status === 0, text: text || '' };
}

function runCapture(command, args) {
  const startedAt = new Date();
  const startedMs = Date.now();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const endedAt = new Date();
  const durationMs = Date.now() - startedMs;
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    signal: result.signal ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    errorMessage: result.error ? String(result.error.message || result.error) : null,
    startedAt,
    endedAt,
    durationMs,
  };
}

function sanitizeFileSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function writeStepLogs(runDir, index, step, result) {
  const stepPrefix = `${String(index).padStart(2, '0')}-${sanitizeFileSegment(step.id)}`;
  const stdoutPath = path.join(runDir, `${stepPrefix}.stdout.log`);
  const stderrPath = path.join(runDir, `${stepPrefix}.stderr.log`);
  const combinedPath = path.join(runDir, `${stepPrefix}.combined.log`);
  fs.writeFileSync(stdoutPath, result.stdout || '', 'utf8');
  fs.writeFileSync(stderrPath, result.stderr || '', 'utf8');
  fs.writeFileSync(combinedPath, [result.stdout, result.stderr].filter(Boolean).join('\n'), 'utf8');
  return {
    stdout: path.relative(repoRoot, stdoutPath).replace(/\\/g, '/'),
    stderr: path.relative(repoRoot, stderrPath).replace(/\\/g, '/'),
    combined: path.relative(repoRoot, combinedPath).replace(/\\/g, '/'),
  };
}

function buildMarkdownSignoff(data) {
  const lines = [];
  lines.push(`# Test Signoff (${data.status})`);
  lines.push('');
  lines.push('## Release Metadata');
  lines.push('');
  lines.push(`- Release label: \`${data.release.label}\``);
  lines.push(`- Environment: \`${data.environment}\``);
  if (data.release.candidateCommit) {
    lines.push(`- Candidate commit (declared): \`${data.release.candidateCommit}\``);
  }
  lines.push(`- Mode: \`${data.mode}\``);
  lines.push(`- Started: ${data.startedAt}`);
  lines.push(`- Finished: ${data.endedAt}`);
  lines.push(`- Duration: ${formatDuration(data.durationMs)}`);
  lines.push(`- Summary: ${data.summary.passed} passed / ${data.summary.failed} failed`);
  lines.push('');

  lines.push('## Git Snapshot');
  lines.push('');
  lines.push(`- Branch: \`${data.git.branch || 'unknown'}\``);
  lines.push(`- Commit: \`${data.git.commit || 'unknown'}\``);
  lines.push('');

  lines.push('## Tooling Snapshot');
  lines.push('');
  lines.push(`- Node: \`${data.system.node || 'unknown'}\``);
  lines.push(`- npm: \`${data.system.npm || 'unknown'}\``);
  lines.push(`- Supabase CLI: \`${data.system.supabase || 'unknown'}\``);
  lines.push(`- psql: \`${data.system.psql || 'unknown'}\``);
  lines.push('');

  lines.push('## Command Results');
  lines.push('');
  lines.push('| Step | Result | Duration | Command | Logs |');
  lines.push('|---|---|---:|---|---|');
  for (const result of data.results) {
    const outcome = result.ok ? 'PASS' : `FAIL (${result.status})`;
    lines.push(
      `| ${result.label} | ${outcome} | ${formatDuration(result.durationMs)} | \`${result.command}\` | \`${result.logs.combined}\` |`
    );
  }
  lines.push('');

  lines.push('## Signature');
  lines.push('');
  lines.push(`- Test Author: ${data.signatures.testAuthor}`);
  lines.push(`- Run By: ${data.signatures.runBy}`);
  lines.push(`- Run Timestamp: ${data.endedAt}`);
  lines.push(`- Run ID: \`${data.runId}\``);
  lines.push('');

  if (data.notes) {
    lines.push('## Notes / Known Issues');
    lines.push('');
    lines.push(data.notes);
    lines.push('');
  }

  lines.push('## Artifacts');
  lines.push('');
  lines.push(`- JSON summary: \`${data.artifacts.json}\``);
  lines.push(`- Markdown summary: \`${data.artifacts.markdown}\``);
  lines.push(`- Raw step logs: \`${data.artifacts.logsDir}\``);
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[test-signoff] ${error instanceof Error ? error.message : String(error)}`);
    console.error('');
    console.error(usage);
    process.exit(1);
  }

  if (args.help) {
    console.log(usage);
    return;
  }

  if (!commandSets[args.mode]) {
    console.error(`[test-signoff] Unknown mode "${args.mode}". Supported: ${Object.keys(commandSets).join(', ')}`);
    process.exit(1);
  }

  const missing = [];
  if (!args.releaseLabel) missing.push('--release-label');
  if (!args.environment) missing.push('--environment');
  if (!args.testAuthor) missing.push('--test-author');
  if (!args.runBy) missing.push('--run-by');
  if (missing.length > 0) {
    console.error(`[test-signoff] Missing required option(s): ${missing.join(', ')}`);
    console.error('');
    console.error(usage);
    process.exit(1);
  }

  const startedAt = new Date();
  const runId = timestampForPath(startedAt);
  const runDir = path.join(repoRoot, 'test-reports', `${runId}.local`);
  ensureDir(runDir);

  const gitBranch = safeCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const gitCommit = safeCapture('git', ['rev-parse', 'HEAD']);
  const nodeVersion = safeCapture('node', ['-v']);
  const npmVersion = safeCapture('npm', ['-v']);
  const supabaseVersion = safeCapture('npx', ['supabase', '--version']);
  const psqlVersion = safeCapture('psql', ['--version']);

  const results = [];
  let failed = false;

  for (const [index, step] of commandSets[args.mode].entries()) {
    console.log(`[test-signoff] Running: ${step.command} ${step.args.join(' ')}`);
    const result = runCapture(step.command, step.args);
    const logs = writeStepLogs(runDir, index + 1, step, result);
    results.push({
      id: step.id,
      label: step.label,
      command: `${step.command} ${step.args.join(' ')}`,
      ok: result.ok,
      status: result.status,
      signal: result.signal,
      durationMs: result.durationMs,
      startedAt: result.startedAt.toISOString(),
      endedAt: result.endedAt.toISOString(),
      errorMessage: result.errorMessage,
      logs,
    });

    if (!result.ok) {
      failed = true;
      break;
    }
  }

  const endedAt = new Date();
  const durationMs = endedAt.getTime() - startedAt.getTime();
  const passed = results.filter((r) => r.ok).length;
  const failedCount = results.length - passed;
  const status = failed ? 'FAIL' : 'PASS';

  const jsonSummary = {
    schemaVersion: 1,
    runId,
    status,
    mode: args.mode,
    release: {
      label: args.releaseLabel,
      candidateCommit: args.candidateCommit,
    },
    environment: args.environment,
    signatures: {
      testAuthor: args.testAuthor,
      runBy: args.runBy,
    },
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs,
    summary: {
      total: results.length,
      passed,
      failed: failedCount,
    },
    git: {
      branch: gitBranch.ok ? gitBranch.text : null,
      commit: gitCommit.ok ? gitCommit.text : null,
    },
    system: {
      node: nodeVersion.ok ? nodeVersion.text : null,
      npm: npmVersion.ok ? npmVersion.text : null,
      supabase: supabaseVersion.ok ? supabaseVersion.text : null,
      psql: psqlVersion.ok ? psqlVersion.text : null,
      platform: process.platform,
    },
    results,
    notes: args.notes ?? null,
    artifacts: {
      logsDir: path.relative(repoRoot, runDir).replace(/\\/g, '/'),
      json: null,
      markdown: null,
    },
  };

  const jsonPath = path.join(runDir, 'signoff.local.json');
  const mdPath = path.join(runDir, 'signoff.local.md');
  jsonSummary.artifacts.json = path.relative(repoRoot, jsonPath).replace(/\\/g, '/');
  jsonSummary.artifacts.markdown = path.relative(repoRoot, mdPath).replace(/\\/g, '/');

  fs.writeFileSync(jsonPath, `${JSON.stringify(jsonSummary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, buildMarkdownSignoff(jsonSummary), 'utf8');

  console.log(`[test-signoff] JSON summary: ${jsonSummary.artifacts.json}`);
  console.log(`[test-signoff] Markdown summary: ${jsonSummary.artifacts.markdown}`);
  console.log(`[test-signoff] Raw logs dir: ${jsonSummary.artifacts.logsDir}`);

  if (args.json) {
    console.log(JSON.stringify(jsonSummary, null, 2));
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main();

