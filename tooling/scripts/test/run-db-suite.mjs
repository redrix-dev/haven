import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseCliCommand, resolveSupabaseLocalEnv } from './resolve-supabase-local-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function run(command, args, options = {}) {
  console.log(`[db-suite] ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: options.shell ?? false,
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ensureSupabaseRunning(cli) {
  try {
    resolveSupabaseLocalEnv();
  } catch {
    run(cli.command, [...cli.baseArgs, 'start'], { shell: cli.shell });
  }
}

function isResetSchemaReady() {
  const env = resolveSupabaseLocalEnv();
  const probe = execFileSync(
    'psql',
    [
      env.POSTGRES_URL,
      '-t',
      '-A',
      '-c',
      "select case when to_regclass('public.communities') is not null and to_regclass('public.notification_dispatch_wakeups') is not null then 1 else 0 end",
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );
  return probe.trim() === '1';
}

function isRetryableStartupError(error) {
  const status = typeof error?.status === 'number' ? error.status : null;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes('retryable') ||
    message.includes('upstream') ||
    message.includes('bad gateway') ||
    message.includes('fetch failed') ||
    message.includes('econnrefused')
  );
}

async function waitForAuthAdminReady(timeoutMs = 60000) {
  const env = resolveSupabaseLocalEnv();
  const adminClient = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const { error } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });
      if (!error) {
        return;
      }
      lastError = error;
      if (!isRetryableStartupError(error)) {
        throw error;
      }
    } catch (error) {
      lastError = error;
      if (!isRetryableStartupError(error)) {
        throw error;
      }
    }
    await sleep(1000);
  }

  throw new Error(
    `[db-suite] Supabase Auth admin API did not become ready within ${Math.round(timeoutMs / 1000)}s after reset/start. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function main() {
  const cli = getSupabaseCliCommand();
  ensureSupabaseRunning(cli);
  let resetHadNonZero = false;
  try {
    run(cli.command, [...cli.baseArgs, 'db', 'reset', '--local'], { shell: cli.shell });
  } catch (error) {
    if (isResetSchemaReady()) {
      resetHadNonZero = true;
    } else {
      throw error;
    }
  }

  await waitForAuthAdminReady();
  if (resetHadNonZero) {
    console.warn(
      '[db-suite] db reset returned non-zero, but the migrated schema exists and Auth admin is now healthy. Continuing with bootstrap/sql suite.'
    );
  }
  run('node', ['tooling/scripts/test/bootstrap-local-auth-users.mjs']);
  run('node', ['tooling/scripts/test/run-supabase-sql-suite.mjs']);
}

main().catch((error) => {
  console.error('[db-suite] Failed:', error);
  process.exitCode = 1;
});
