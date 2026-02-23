import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const mode = process.argv[2] ?? 'full';

const commandSets = {
  full: [
    { id: 'lint', label: 'ESLint', command: 'npm', args: ['run', 'lint'] },
    { id: 'typecheck', label: 'TypeScript', command: 'npx', args: ['tsc', '--noEmit', '--project', 'tsconfig.json'] },
    { id: 'unit', label: 'Unit / Component Tests', command: 'npm', args: ['run', 'test:unit'] },
    { id: 'db', label: 'DB / RLS Suite', command: 'npm', args: ['run', 'test:db'] },
    { id: 'backend', label: 'Backend Contract Tests', command: 'npm', args: ['run', 'test:backend'] },
  ],
  ci: [
    { id: 'ci', label: 'CI Aggregate', command: 'npm', args: ['run', 'test:ci'] },
  ],
  db: [
    { id: 'db', label: 'DB / RLS Suite', command: 'npm', args: ['run', 'test:db'] },
    { id: 'backend', label: 'Backend Contract Tests', command: 'npm', args: ['run', 'test:backend'] },
  ],
};

if (!(mode in commandSets)) {
  console.error(`Unknown mode "${mode}". Supported modes: ${Object.keys(commandSets).join(', ')}`);
  process.exit(1);
}

const explainedScenarioCatalog = {
  sqlSuites: {
    '01_core_permissions_rls.sql': {
      title: 'Core Community / Channel / Message Permissions (RLS)',
      scenarios: [
        {
          actor: 'non_member',
          action: 'Attempts to read a channel row and insert a message in a community they do not belong to.',
          expected: 'Channel row is hidden by RLS and message insert is rejected by row-level security.',
        },
        {
          actor: 'member_a',
          action: 'Reads regular channel vs a moderator-only channel.',
          expected: 'General channel is visible, moderator-only channel is hidden due to overwrite rules.',
        },
        {
          actor: 'server_mod',
          action: "Views a mod-only channel and deletes another user's message.",
          expected: 'Moderator can view the mod channel and delete the target message because manage-messages is granted.',
        },
        {
          actor: 'member_a',
          action: 'Deletes their own message without moderator permissions.',
          expected: 'Self-delete succeeds while manage-messages remains denied.',
        },
      ],
    },
    '02_notifications_rls.sql': {
      title: 'Notification Foundation RLS + RPCs',
      scenarios: [
        {
          actor: 'member_a',
          action: "Lists notification recipients/events and tries to mark another user's notification read.",
          expected: 'Only own inbox rows/events are visible; cross-user mark-read is ignored/denied.',
        },
        {
          actor: 'member_a',
          action: 'Marks own notification seen and checks unread/unseen counts.',
          expected: 'Seen mutation succeeds and counts update correctly.',
        },
        {
          actor: 'member_a',
          action: 'Paginates notification inbox via cursor parameters.',
          expected: 'Page 1 returns a single row and page 2 returns remaining rows in stable order.',
        },
        {
          actor: 'member_a / member_b',
          action: 'Updates member_a notification preferences, then member_b attempts to mutate member_a preferences.',
          expected: 'Self-update persists; cross-user update has no effect due to RLS.',
        },
      ],
    },
    '03_social_graph_rls_and_rpcs.sql': {
      title: 'Social Graph (Friends / Requests / Blocks) RLS + RPCs',
      scenarios: [
        {
          actor: 'member_a',
          action: 'Attempts invalid friend request actions (self-request, duplicate paths, blocked paths).',
          expected: 'RPCs reject invalid states with explicit errors.',
        },
        {
          actor: 'member_a -> member_b',
          action: 'Sends friend request via RPC.',
          expected: 'Pending request is created and friend-request notification side effect is emitted.',
        },
        {
          actor: 'member_b',
          action: 'Accepts incoming friend request and checks friend state.',
          expected: 'Friendship row is created and request transitions out of pending.',
        },
        {
          actor: 'member_a / member_b',
          action: 'Exercises block/remove behavior around existing social relationships.',
          expected: 'Friendship/request state is cleaned up and blocked paths reject new requests.',
        },
      ],
    },
    '04_dm_rls_and_rpcs.sql': {
      title: 'Direct Messages RLS + RPCs',
      scenarios: [
        {
          actor: 'member_a + member_b',
          action: 'Become friends, create/load a direct conversation, and send a DM.',
          expected: 'Conversation creation is canonical and message send succeeds with returned message payload.',
        },
        {
          actor: 'recipient user',
          action: 'Reads DM messages and marks the conversation read.',
          expected: 'Only conversation members can list messages and read-state RPC updates succeed.',
        },
        {
          actor: 'system side-effect check',
          action: 'Verifies DM send emits notification rows when allowed and suppresses them when muted/blocked.',
          expected: 'Notification recipients are created only when delivery rules permit them.',
        },
        {
          actor: 'non_member / blocked pair',
          action: 'Attempts DM access or sends after block.',
          expected: 'RPCs reject access/send paths for non-members and blocked relationships.',
        },
      ],
    },
    '05_dm_moderation_review_rls_and_rpcs.sql': {
      title: 'DM Moderation Review (Staff RPCs + RLS)',
      scenarios: [
        {
          actor: 'member users',
          action: 'Create a DM and submit a DM report as the reporter.',
          expected: 'Report is created for accessible DM content only.',
        },
        {
          actor: 'platform_staff_active',
          action: 'Lists reports, loads detail/context, assigns, and updates status with audit trail.',
          expected: 'Staff review RPCs succeed and action history is recorded.',
        },
        {
          actor: 'platform_staff_inactive / non-staff',
          action: 'Attempts to access moderation review RPCs.',
          expected: 'Access is rejected with Haven-staff authorization errors.',
        },
        {
          actor: 'staff workflow',
          action: 'Attempts invalid report status transitions before valid triage/in-review/resolution path.',
          expected: 'Invalid transitions fail; valid transitions succeed and are auditable.',
        },
      ],
    },
    '06_channel_mentions_trigger_notifications.sql': {
      title: 'Channel Mention Trigger Notifications',
      scenarios: [
        {
          actor: 'member_a',
          action: 'Sends a channel message mentioning member_b.',
          expected: 'DB trigger emits a channel_mention notification for member_b.',
        },
        {
          actor: 'mention target / policy checks',
          action: 'Exercises suppression cases (self-mention, blocked relationships, non-member targets).',
          expected: 'No notification is emitted for suppressed targets.',
        },
        {
          actor: 'member_b',
          action: 'Toggles mention notification preferences and re-tests mention delivery.',
          expected: 'Delivery rows reflect global mention preference settings.',
        },
        {
          actor: 'parser/guardrails',
          action: 'Sends messages containing multiple mentions / duplicates.',
          expected: 'Trigger dedupes recipients and respects mention fan-out caps.',
        },
      ],
    },
  },
  backendFiles: {
    'src/lib/backend/__tests__/notificationBackend.contract.test.ts': {
      title: 'NotificationBackend Contract',
      scenarios: [
        {
          actor: 'member_a',
          action: 'Reads and updates global notification preferences through the backend seam.',
          expected: 'Backend DTO mapping works and persisted preferences reload correctly.',
        },
        {
          actor: 'member_a',
          action: 'Lists inbox notifications and calls read/dismiss mutations.',
          expected: 'Backend seam can round-trip inbox rows and notification state changes.',
        },
      ],
    },
    'src/lib/backend/__tests__/socialBackend.contract.test.ts': {
      title: 'SocialBackend Contract',
      scenarios: [
        {
          actor: 'member_a',
          action: 'Searches by exact username and sends a friend request to member_b.',
          expected: 'Search returns the target user and sendFriendRequest creates or reuses expected pending state.',
        },
        {
          actor: 'member_b',
          action: "Lists incoming requests and accepts member_a's request.",
          expected: 'Friendship is visible through listFriends and notification side effects are reachable.',
        },
      ],
    },
    'src/lib/backend/__tests__/directMessageBackend.contract.test.ts': {
      title: 'DirectMessageBackend Contract',
      scenarios: [
        {
          actor: 'member_a + member_b',
          action: 'Create or load a 1:1 DM, send a message, read it, mute the conversation, and file a report.',
          expected: 'All DM seam methods succeed and return correctly shaped DTOs.',
        },
        {
          actor: 'non_member',
          action: 'Attempts to read a conversation they do not belong to.',
          expected: 'Backend seam surfaces an access error from the underlying RPC/RLS checks.',
        },
      ],
    },
    'src/lib/backend/__tests__/moderationBackend.contract.test.ts': {
      title: 'ModerationBackend Contract',
      scenarios: [
        {
          actor: 'platform_staff_active',
          action: 'Lists DM reports, fetches detail/context, assigns report, and performs valid status transitions.',
          expected: 'Staff moderation backend flows succeed and audit actions are created.',
        },
        {
          actor: 'platform_staff_inactive / member_a',
          action: 'Calls staff-only moderation endpoints.',
          expected: 'Backend seam rejects access with Haven staff authorization errors.',
        },
      ],
    },
    'src/lib/backend/__tests__/communityDataBackend.mentions.contract.test.ts': {
      title: 'CommunityDataBackend Mention Integration Contract',
      scenarios: [
        {
          actor: 'member_a -> member_b',
          action: 'Sends a channel message via CommunityDataBackend that mentions member_b.',
          expected: 'The DB trigger produces a channel_mention notification visible to member_b.',
        },
      ],
    },
  },
};

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function resolveCommandInvocation(command) {
  if (process.platform !== 'win32') {
    return { command, shell: false };
  }

  if (command === 'npm' || command === 'npx') {
    return { command: `${command}.cmd`, shell: true };
  }

  return { command, shell: false };
}

function runCapture(command, args, options = {}) {
  const invocation = resolveCommandInvocation(command);
  const startedAt = new Date();
  const startedMs = Date.now();

  try {
    const stdout = execFileSync(invocation.command, args, {
      cwd: repoRoot,
      shell: invocation.shell,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...options.env,
      },
      maxBuffer: 20 * 1024 * 1024,
    });

    return {
      ok: true,
      status: 0,
      stdout: stdout ?? '',
      stderr: '',
      startedAt,
      endedAt: new Date(),
      durationMs: Date.now() - startedMs,
      command,
      args,
      shell: invocation.shell,
    };
  } catch (error) {
    return {
      ok: false,
      status: typeof error.status === 'number' ? error.status : 1,
      stdout: typeof error.stdout === 'string' ? error.stdout : (error.stdout?.toString?.() ?? ''),
      stderr: typeof error.stderr === 'string' ? error.stderr : (error.stderr?.toString?.() ?? ''),
      startedAt,
      endedAt: new Date(),
      durationMs: Date.now() - startedMs,
      command,
      args,
      shell: invocation.shell,
      errorMessage: error?.message ?? String(error),
    };
  }
}

function safeCapture(command, args) {
  const result = runCapture(command, args);
  if (!result.ok) {
    return {
      ok: false,
      text: [result.stdout, result.stderr, result.errorMessage ?? ''].filter(Boolean).join('\n').trim(),
    };
  }
  return { ok: true, text: [result.stdout, result.stderr].filter(Boolean).join('\n').trim() };
}

function redactEnvOutput(text) {
  return text
    .replace(/(ANON_KEY|SERVICE_ROLE_KEY)=.+/g, '$1=[redacted]')
    .replace(/(SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=.+/g, '$1=[redacted]');
}

function summarizeOutput(text, maxLines = 40) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '_No output captured._';
  const lines = trimmed.split(/\r?\n/);
  if (lines.length <= maxLines) return `\`\`\`\n${trimmed}\n\`\`\``;

  const headCount = Math.max(10, Math.floor(maxLines / 2));
  const tailCount = Math.max(10, maxLines - headCount);
  const head = lines.slice(0, headCount).join('\n');
  const tail = lines.slice(-tailCount).join('\n');
  return `\`\`\`\n${head}\n... (${lines.length - headCount - tailCount} lines omitted) ...\n${tail}\n\`\`\``;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function writeLogFiles(runDir, index, step, result) {
  const baseName = `${String(index).padStart(2, '0')}-${step.id}`;
  const combinedPath = path.join(runDir, `${baseName}.log`);
  const stdoutPath = path.join(runDir, `${baseName}.stdout.log`);
  const stderrPath = path.join(runDir, `${baseName}.stderr.log`);

  const combined = [
    `$ ${step.command} ${step.args.join(' ')}`,
    '',
    result.stdout?.trim() ? '--- stdout ---' : '',
    result.stdout?.trim() ?? '',
    result.stderr?.trim() ? '--- stderr ---' : '',
    result.stderr?.trim() ?? '',
    result.errorMessage ? `--- error ---\n${result.errorMessage}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  fs.writeFileSync(combinedPath, `${combined}\n`, 'utf8');
  fs.writeFileSync(stdoutPath, `${result.stdout ?? ''}`, 'utf8');
  fs.writeFileSync(stderrPath, `${result.stderr ?? ''}`, 'utf8');

  return {
    combined: path.relative(repoRoot, combinedPath).replace(/\\/g, '/'),
    stdout: path.relative(repoRoot, stdoutPath).replace(/\\/g, '/'),
    stderr: path.relative(repoRoot, stderrPath).replace(/\\/g, '/'),
  };
}

function extractSqlSuiteBasenames(text) {
  const matches = [];
  const regex = /\[sql-suite\]\s+Running\s+.+?[\\/]tests[\\/]sql[\\/](\d{2}_[^\\/\r\n]+\.sql)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    matches.push(m[1]);
  }
  return Array.from(new Set(matches));
}

function extractBackendContractFiles(text) {
  const matches = [];
  const resetRegex = /\[vitest-local-env\]\s+resetting[^\r\n]*\sbefore\s+(src\/lib\/backend\/__tests__\/[^\r\n]+)/g;
  let m;
  while ((m = resetRegex.exec(text)) !== null) {
    matches.push(m[1].trim());
  }
  if (matches.length > 0) return Array.from(new Set(matches));

  const vitestRegex = /src\/lib\/backend\/__tests__\/[^\s)]+\.test\.ts/g;
  const fallback = text.match(vitestRegex) ?? [];
  return Array.from(new Set(fallback));
}

function pushScenarioBlock(lines, scenario, index) {
  lines.push(`${index}. Actor: \`${scenario.actor}\``);
  lines.push(`   Action: ${scenario.action}`);
  lines.push(`   Expected: ${scenario.expected}`);
}

function buildExplainedBreakdown(results) {
  const lines = [];
  lines.push('## Explained Breakdown (Learning View)');
  lines.push('');
  lines.push(
    'This section translates the executed suites into human-readable scenarios. It is generated from the files that actually ran plus a maintained scenario catalog.'
  );
  lines.push('');

  let added = false;

  for (const { step, result } of results) {
    const combinedText = [result.stdout, result.stderr].filter(Boolean).join('\n');

    if (step.id === 'db' || step.id === 'ci') {
      const sqlSuites = extractSqlSuiteBasenames(combinedText);
      if (sqlSuites.length > 0) {
        added = true;
        lines.push(`### ${step.label}: SQL / RLS Scenarios`);
        lines.push('');
        for (const suiteFile of sqlSuites) {
          const entry = explainedScenarioCatalog.sqlSuites[suiteFile];
          lines.push(`- Suite File: \`${suiteFile}\``);
          if (!entry) {
            lines.push('  - No catalog entry yet (suite ran, but no learning summary is defined yet).');
            continue;
          }
          lines.push(`  - Focus: ${entry.title}`);
          lines.push('  - Scenarios:');
          entry.scenarios.forEach((scenario, index) => {
            lines.push(`    ${index + 1}. Actor: \`${scenario.actor}\``);
            lines.push(`       Action: ${scenario.action}`);
            lines.push(`       Expected: ${scenario.expected}`);
          });
        }
        lines.push('');
      }
    }

    if (step.id === 'backend' || step.id === 'ci') {
      const backendFiles = extractBackendContractFiles(combinedText);
      if (backendFiles.length > 0) {
        added = true;
        lines.push(`### ${step.label}: Backend Contract Scenarios`);
        lines.push('');
        for (const file of backendFiles) {
          const entry = explainedScenarioCatalog.backendFiles[file];
          lines.push(`- Test File: \`${file}\``);
          if (!entry) {
            lines.push('  - No catalog entry yet (file ran, but no learning summary is defined yet).');
            continue;
          }
          lines.push(`  - Focus: ${entry.title}`);
          lines.push('  - Scenarios:');
          entry.scenarios.forEach((scenario, index) => {
            lines.push(`    ${index + 1}. Actor: \`${scenario.actor}\``);
            lines.push(`       Action: ${scenario.action}`);
            lines.push(`       Expected: ${scenario.expected}`);
          });
        }
        lines.push('');
      }
    }
  }

  if (!added) {
    lines.push('_No explained scenarios were detected for the steps that ran in this report._');
    lines.push('');
  }

  return lines.join('\n');
}

function buildReport({ runId, modeName, startedAt, endedAt, envInfo, gitInfo, nodeInfo, results }) {
  const totalMs = endedAt.getTime() - startedAt.getTime();
  const passed = results.filter((r) => r.result.ok).length;
  const failed = results.length - passed;
  const status = failed === 0 ? 'PASS' : 'FAIL';

  const lines = [];
  lines.push(`# Local Test Suite Report (${status})`);
  lines.push('');
  lines.push(`- Run ID: \`${runId}\``);
  lines.push(`- Mode: \`${modeName}\``);
  lines.push(`- Started: ${startedAt.toISOString()}`);
  lines.push(`- Finished: ${endedAt.toISOString()}`);
  lines.push(`- Duration: ${formatDuration(totalMs)}`);
  lines.push(`- Summary: ${passed} passed / ${failed} failed`);
  lines.push('');
  lines.push('## Environment Snapshot');
  lines.push('');
  lines.push(`- Git branch: \`${gitInfo.branch || 'unknown'}\``);
  lines.push(`- Git commit: \`${gitInfo.commit || 'unknown'}\``);
  lines.push(`- Node: \`${nodeInfo.node || 'unknown'}\``);
  lines.push(`- npm: \`${nodeInfo.npm || 'unknown'}\``);
  lines.push(`- Supabase CLI: \`${nodeInfo.supabase || 'unknown'}\``);
  lines.push(`- psql: \`${nodeInfo.psql || 'unknown'}\``);
  lines.push('');
  if (envInfo.statusText) {
    lines.push('### Local Supabase Status (`supabase status -o env`)');
    lines.push('');
    lines.push(`\`\`\`\n${redactEnvOutput(envInfo.statusText)}\n\`\`\``);
    lines.push('');
  }

  lines.push('## Command Results');
  lines.push('');
  lines.push('| Step | Result | Duration | Command | Logs |');
  lines.push('|---|---|---:|---|---|');
  for (const { step, result, logs } of results) {
    const outcome = result.ok ? 'PASS' : `FAIL (${result.status})`;
    lines.push(
      `| ${step.label} | ${outcome} | ${formatDuration(result.durationMs)} | \`${step.command} ${step.args.join(' ')}\` | \`${logs.combined}\` |`
    );
  }

  for (const { step, result, logs } of results) {
    const combinedText = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    lines.push('');
    lines.push(`## ${step.label}`);
    lines.push('');
    lines.push(`- Result: ${result.ok ? 'PASS' : `FAIL (${result.status})`}`);
    lines.push(`- Duration: ${formatDuration(result.durationMs)}`);
    lines.push(`- Started: ${result.startedAt.toISOString()}`);
    lines.push(`- Finished: ${result.endedAt.toISOString()}`);
    lines.push(`- Logs: \`${logs.combined}\`, \`${logs.stdout}\`, \`${logs.stderr}\``);
    if (!result.ok && result.errorMessage) {
      lines.push(`- Error: \`${result.errorMessage.replace(/\r?\n/g, ' ')}\``);
    }
    lines.push('');
    lines.push('### Output Excerpt');
    lines.push('');
    lines.push(summarizeOutput(combinedText));
  }

  lines.push('');
  lines.push(buildExplainedBreakdown(results));

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This report is generated locally and written under `test-reports/` (git-ignored).');
  lines.push('- Raw per-step logs are saved alongside this report for troubleshooting.');
  lines.push('- `DEP0190` warnings on Windows are currently expected from `npx.cmd` shell fallback in test runners.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
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
  const supabaseStatus = safeCapture('npx', ['supabase', 'status', '-o', 'env']);

  const steps = commandSets[mode];
  const results = [];
  let failed = false;

  for (const [index, step] of steps.entries()) {
    console.log(`[test-report] Running: ${step.command} ${step.args.join(' ')}`);
    const result = runCapture(step.command, step.args);
    const logs = writeLogFiles(runDir, index + 1, step, result);
    results.push({ step, result, logs });
    if (!result.ok) {
      failed = true;
      // Continue collecting a report for completed steps only; stop after first failure for determinism.
      break;
    }
  }

  const endedAt = new Date();
  const report = buildReport({
    runId,
    modeName: mode,
    startedAt,
    endedAt,
    envInfo: {
      statusText: supabaseStatus.ok ? supabaseStatus.text : `Unavailable: ${supabaseStatus.text}`,
    },
    gitInfo: {
      branch: gitBranch.ok ? gitBranch.text : null,
      commit: gitCommit.ok ? gitCommit.text : null,
    },
    nodeInfo: {
      node: nodeVersion.ok ? nodeVersion.text : null,
      npm: npmVersion.ok ? npmVersion.text : null,
      supabase: supabaseVersion.ok ? supabaseVersion.text : null,
      psql: psqlVersion.ok ? psqlVersion.text : null,
    },
    results,
  });

  const reportPath = path.join(runDir, 'report.local.md');
  fs.writeFileSync(reportPath, report, 'utf8');

  console.log(`[test-report] Report written: ${path.relative(repoRoot, reportPath).replace(/\\/g, '/')}`);
  console.log(`[test-report] Raw logs dir: ${path.relative(repoRoot, runDir).replace(/\\/g, '/')}`);

  if (failed) {
    process.exitCode = 1;
  }
}

main();
