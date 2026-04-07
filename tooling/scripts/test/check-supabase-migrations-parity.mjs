/**
 * Ensures repo-root `supabase/migrations` (legacy mirror) stays identical to
 * canonical `services/supabase/migrations` when both exist.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const canonicalDir = path.join(repoRoot, 'services/supabase/migrations');
const mirrorDir = path.join(repoRoot, 'supabase/migrations');

function listSqlFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function main() {
  if (!existsSync(canonicalDir)) {
    throw new Error(`[migrations-parity] Missing canonical dir: ${canonicalDir}`);
  }
  if (!existsSync(mirrorDir)) {
    console.log(
      '[migrations-parity] No repo-root supabase/migrations mirror; skipping parity check.',
    );
    return;
  }

  const canonical = listSqlFiles(canonicalDir);
  const mirror = listSqlFiles(mirrorDir);

  const canonicalSet = new Set(canonical);
  const mirrorSet = new Set(mirror);

  const onlyCanonical = canonical.filter((f) => !mirrorSet.has(f));
  const onlyMirror = mirror.filter((f) => !canonicalSet.has(f));

  if (onlyCanonical.length > 0 || onlyMirror.length > 0) {
    const msg = [
      '[migrations-parity] Migration filename sets differ.',
      onlyCanonical.length ? `Only in services/supabase/migrations: ${onlyCanonical.join(', ')}` : '',
      onlyMirror.length ? `Only in supabase/migrations: ${onlyMirror.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    throw new Error(msg);
  }

  const mismatches = [];
  for (const name of canonical) {
    const a = readFileSync(path.join(canonicalDir, name), 'utf8');
    const b = readFileSync(path.join(mirrorDir, name), 'utf8');
    if (sha256(a) !== sha256(b)) {
      mismatches.push(name);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `[migrations-parity] Content differs for: ${mismatches.join(', ')}. ` +
        'Edit services/supabase/migrations only, then sync the root mirror or remove it.',
    );
  }

  console.log(
    `[migrations-parity] OK — ${canonical.length} SQL files match between services/supabase/migrations and supabase/migrations.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
