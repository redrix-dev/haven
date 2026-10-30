import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSupabaseLocalEnv } from "./resolve-supabase-local-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

const mode = process.argv[2] ?? "backend";
// backend mode: optional contract test files to run instead of all of them.
const onlyFiles = process.argv.slice(3);

const BACKEND_TESTS_DIR = "packages/shared/src/lib/backend/__tests__";

/** Every backend contract test, found on disk so a new file can't be skipped. */
function listBackendContractTests() {
  return readdirSync(path.join(repoRoot, BACKEND_TESTS_DIR))
    .filter((name) => name.endsWith(".contract.test.ts"))
    .sort()
    .map((name) => `${BACKEND_TESTS_DIR}/${name}`);
}

const modeArgs = {
  backend: ["packages/shared/src/lib/backend/__tests__"],
  unit: [
    "packages/shared/src/components/__tests__",
    "packages/shared/src/lib/notifications/__tests__",
  ],
};

if (!(mode in modeArgs)) {
  console.error(
    `Unknown mode "${mode}". Supported: ${Object.keys(modeArgs).join(", ")}`,
  );
  process.exit(1);
}

function getNpxInvocation() {
  try {
    execFileSync("npx", ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
      shell: false,
    });
    return { command: "npx", shell: false };
  } catch {
    return {
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      shell: process.platform === "win32",
    };
  }
}

function runPsqlCleanup(postgresUrl) {
  execFileSync(
    "psql",
    [
      postgresUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "select test_support.cleanup_fixture_domain_state();",
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
    },
  );
}

function runVitestWithEnv(npx, localEnv, targets) {
  execFileSync(npx.command, ["vitest", "run", ...targets], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: npx.shell,
    env: {
      ...process.env,
      NODE_ENV: "test",
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
  if (mode === "backend") {
    const backendFiles =
      onlyFiles.length > 0 ? onlyFiles : listBackendContractTests();
    for (const file of backendFiles) {
      console.log(
        `[vitest-local-env] resetting social/dm fixtures before ${file}`,
      );
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
