import { execFileSync } from 'node:child_process';

function getSupabaseCliInvocation() {
  try {
    execFileSync('supabase', ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return { command: 'supabase', baseArgs: [], shell: false };
  } catch {
    return {
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      baseArgs: ['supabase'],
      shell: process.platform === 'win32',
    };
  }
}

export function parseEnvLines(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

export function resolveSupabaseLocalEnv() {
  const cli = getSupabaseCliInvocation();
  let output;
  try {
    output = execFileSync(cli.command, [...cli.baseArgs, 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: cli.shell ?? false,
    });
  } catch (error) {
    throw new Error(
      `Unable to resolve Supabase local env. Ensure Docker Desktop is running and Supabase local is started (try \`npx supabase start\`). Original error: ${error.message}`
    );
  }
  const raw = parseEnvLines(output);

  const apiUrl = raw.API_URL ?? raw.SUPABASE_URL;
  const anonKey = raw.ANON_KEY ?? raw.SUPABASE_ANON_KEY;
  const serviceRoleKey = raw.SERVICE_ROLE_KEY ?? raw.SUPABASE_SERVICE_ROLE_KEY;
  const postgresUrl = raw.POSTGRES_URL ?? raw.DB_URL;

  if (!apiUrl || !anonKey || !serviceRoleKey || !postgresUrl) {
    throw new Error(
      `Could not resolve required Supabase local env values. Received keys: ${Object.keys(raw).join(', ')}`
    );
  }

  return {
    ...raw,
    API_URL: apiUrl,
    ANON_KEY: anonKey,
    SERVICE_ROLE_KEY: serviceRoleKey,
    POSTGRES_URL: postgresUrl,
  };
}

export function getSupabaseCliCommand() {
  return getSupabaseCliInvocation();
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const mode = process.argv.includes('--shell') ? 'shell' : 'json';
  const env = resolveSupabaseLocalEnv();
  if (mode === 'shell') {
    for (const [key, value] of Object.entries(env)) {
      process.stdout.write(`${key}=${value}\n`);
    }
  } else {
    process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
  }
}
