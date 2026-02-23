import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSupabaseLocalEnv } from './resolve-supabase-local-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const mode = process.argv[2] ?? 'backend';

const modeArgs = {
  backend: ['src/lib/backend/__tests__'],
  unit: ['src/components/__tests__', 'src/lib/notifications/__tests__'],
};

if (!(mode in modeArgs)) {
  console.error(`Unknown mode "${mode}". Supported: ${Object.keys(modeArgs).join(', ')}`);
  process.exit(1);
}

function getNpxInvocation() {
  try {
    execFileSync('npx', ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      shell: false,
    });
    return { command: 'npx', shell: false };
  } catch {
    return {
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      shell: process.platform === 'win32',
    };
  }
}

function runPsqlCleanup(postgresUrl) {
  execFileSync('psql', [postgresUrl, '-v', 'ON_ERROR_STOP=1', '-c', 'select test_support.cleanup_fixture_domain_state();'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  });
}

function runVitestWithEnv(npx, localEnv, targets) {
  execFileSync(npx.command, ['vitest', 'run', ...targets], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: npx.shell,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      SUPABASE_URL: localEnv.API_URL,
      SUPABASE_ANON_KEY: localEnv.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: localEnv.SERVICE_ROLE_KEY,
      POSTGRES_URL: localEnv.POSTGRES_URL,
    },
  });
}

try {
  const localEnv = resolveSupabaseLocalEnv();
  const npx = getNpxInvocation();
  if (mode === 'backend') {
    const backendFiles = [
      'src/lib/backend/__tests__/notificationBackend.contract.test.ts',
      'src/lib/backend/__tests__/socialBackend.contract.test.ts',
      'src/lib/backend/__tests__/directMessageBackend.contract.test.ts',
      'src/lib/backend/__tests__/moderationBackend.contract.test.ts',
      'src/lib/backend/__tests__/communityDataBackend.mentions.contract.test.ts',
    ];
    for (const file of backendFiles) {
      console.log(`[vitest-local-env] resetting social/dm fixtures before ${file}`);
      runPsqlCleanup(localEnv.POSTGRES_URL);
      runVitestWithEnv(npx, localEnv, [file]);
    }
  } else {
    runVitestWithEnv(npx, localEnv, modeArgs[mode]);
  }
} catch (error) {
  console.error(`[vitest-local-env] Failed (${mode}):`, error);
  process.exitCode = 1;
}

