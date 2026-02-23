import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSupabaseLocalEnv } from './resolve-supabase-local-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function readRunOrder() {
  const runOrderPath = path.join(repoRoot, 'supabase/tests/run_order.txt');
  const lines = readFileSync(runOrderPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  return lines.map((relativePath) => path.join(repoRoot, relativePath));
}

function pickFiles(allFiles, { fixturesOnly, skipFixtures }) {
  return allFiles.filter((filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    const isHelper = normalized.includes('/supabase/tests/_helpers/');
    const isFixture = normalized.includes('/supabase/tests/fixtures/');
    const isSqlSuite = normalized.includes('/supabase/tests/sql/');
    if (fixturesOnly) return isHelper || isFixture;
    if (skipFixtures) return isHelper || isSqlSuite;
    return isHelper || isFixture || isSqlSuite;
  });
}

function main() {
  const fixturesOnly = process.argv.includes('--fixtures-only');
  const skipFixtures = process.argv.includes('--skip-fixtures');
  if (fixturesOnly && skipFixtures) {
    throw new Error('Use only one of --fixtures-only or --skip-fixtures');
  }

  const env = resolveSupabaseLocalEnv();
  const allFiles = readRunOrder();
  const files = pickFiles(allFiles, { fixturesOnly, skipFixtures });

  if (files.length === 0) {
    throw new Error('No SQL suite files selected. Check supabase/tests/run_order.txt.');
  }

  for (const filePath of files) {
    console.log(`\n[sql-suite] Running ${path.relative(repoRoot, filePath)}`);
    try {
      execFileSync(
        'psql',
        [
          env.POSTGRES_URL,
          '-v',
          'ON_ERROR_STOP=1',
          '-f',
          filePath,
        ],
        {
          stdio: 'inherit',
          cwd: repoRoot,
        }
      );
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(
          'psql is required for the SQL RLS suite but was not found on PATH. Install PostgreSQL client tools (psql) and rerun `npm run test:db` or `npm run test:db:rls`.'
        );
      }
      throw error;
    }
  }
}

try {
  main();
} catch (error) {
  console.error('[sql-suite] Failed:', error);
  process.exitCode = 1;
}
