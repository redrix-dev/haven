import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSupabaseLocalEnv } from './resolve-supabase-local-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const mode = process.argv[2] ?? 'backend';

const modeArgs = {
  backend: ['run', 'src/lib/backend/__tests__'],
  unit: ['run', 'src/components/__tests__', 'src/lib/notifications/__tests__'],
};

if (!(mode in modeArgs)) {
  console.error(`Unknown mode "${mode}". Supported: ${Object.keys(modeArgs).join(', ')}`);
  process.exit(1);
}

try {
  const localEnv = resolveSupabaseLocalEnv();
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vitest', ...modeArgs[mode]],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SUPABASE_URL: localEnv.API_URL,
        SUPABASE_ANON_KEY: localEnv.ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: localEnv.SERVICE_ROLE_KEY,
      },
    }
  );

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.error) throw result.error;
} catch (error) {
  console.error(`[vitest-local-env] Failed (${mode}):`, error);
  process.exitCode = 1;
}

