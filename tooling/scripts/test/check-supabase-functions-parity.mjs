/**
 * Ensures repo-root `supabase/functions` (legacy mirror) stays identical to
 * canonical `services/supabase/functions` when both exist.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const canonicalDir = path.join(repoRoot, 'services/supabase/functions');
const mirrorDir = path.join(repoRoot, 'supabase/functions');

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** @param {string} dir */
function listFilesRecursive(dir, base = dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '.env' || name.startsWith('.env.')) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else if (st.isFile()) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

function main() {
  if (!existsSync(canonicalDir)) {
    throw new Error(`[functions-parity] Missing canonical dir: ${canonicalDir}`);
  }
  if (!existsSync(mirrorDir)) {
    console.log(
      '[functions-parity] No repo-root supabase/functions mirror; skipping parity check.',
    );
    return;
  }

  const canonicalFiles = listFilesRecursive(canonicalDir);
  const mirrorFiles = listFilesRecursive(mirrorDir);

  const canonicalSet = new Set(canonicalFiles);
  const mirrorSet = new Set(mirrorFiles);

  const onlyCanonical = canonicalFiles.filter((f) => !mirrorSet.has(f));
  const onlyMirror = mirrorFiles.filter((f) => !canonicalSet.has(f));

  if (onlyCanonical.length > 0 || onlyMirror.length > 0) {
    const msg = [
      '[functions-parity] Function file sets differ.',
      onlyCanonical.length ? `Only in services/supabase/functions: ${onlyCanonical.join(', ')}` : '',
      onlyMirror.length ? `Only in supabase/functions: ${onlyMirror.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    throw new Error(msg);
  }

  const mismatches = [];
  for (const name of canonicalFiles) {
    const a = readFileSync(path.join(canonicalDir, name), 'utf8');
    const b = readFileSync(path.join(mirrorDir, name), 'utf8');
    if (sha256(a) !== sha256(b)) {
      mismatches.push(name);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `[functions-parity] Content differs for: ${mismatches.join(', ')}`,
    );
  }

  console.log(
    `[functions-parity] OK — ${canonicalFiles.length} files match between services/supabase/functions and supabase/functions.`,
  );
}

main();
