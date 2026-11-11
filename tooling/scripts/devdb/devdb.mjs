// The shared dev backend: a full Supabase stack that is not production.
// Runbook and design: docs/DEV_BACKEND.md.
//
//   npm run devdb -- up | down | status | env
//   npm run devdb -- reset [--no-seed] [pack ...]
//   npm run devdb -- seed [pack ...]
//   npm run devdb -- run -- <command ...>
//
// DEVDB_HOST         ssh alias of the machine running the stack (default: flex),
//                    or "local" for this machine's own stack.
// DEVDB_PUBLIC_HOST  the name clients put in URLs (default: flex5-linux).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSupabaseCliCommand,
  parseEnvLines,
} from "../test/resolve-supabase-local-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

const HOST = process.env.DEVDB_HOST?.trim() || "flex";
const IS_LOCAL = HOST === "local";
const PUBLIC_HOST =
  process.env.DEVDB_PUBLIC_HOST?.trim() ||
  (IS_LOCAL ? "127.0.0.1" : "flex5-linux");
const ENV_FILE = path.join(repoRoot, ".env.devdb");
const HOST_SCRIPT = "haven-devdb/host.sh";
const DB_CONTAINER = "supabase_db_haven";
const SEED_DIR = path.join(repoRoot, "supabase/seeds/dev");

const log = (message) => console.log(`[devdb] ${message}`);

function fail(message) {
  console.error(`[devdb] ${message}`);
  process.exit(1);
}

// --- running things -------------------------------------------------------

function exec(command, args, { input, capture = false, shell = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    input,
    shell,
    stdio: [
      input === undefined ? "ignore" : "pipe",
      capture ? "pipe" : "inherit",
      "inherit",
    ],
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: capture ? result.stdout.toString("utf8") : "",
  };
}

function must(result, what) {
  if (result.status !== 0) fail(`${what} failed (exit ${result.status})`);
  return result;
}

/** Runs one host.sh subcommand on the remote host. Arguments are plain words. */
function host(args, options) {
  return exec("ssh", [HOST, "bash", HOST_SCRIPT, ...args], options);
}

function localCli(args, options = {}) {
  const cli = getSupabaseCliCommand();
  return exec(cli.command, [...cli.baseArgs, ...args], {
    ...options,
    shell: cli.shell,
  });
}

function pushHostScript() {
  const script = readFileSync(path.join(__dirname, "host.sh"), "utf8").replace(
    /\r\n/g,
    "\n",
  );
  must(
    exec("ssh", [HOST, `mkdir -p haven-devdb && cat > ${HOST_SCRIPT}`], {
      input: script,
    }),
    `copying host.sh to ${HOST}`,
  );
}

function cliVersion() {
  const pkg = JSON.parse(
    readFileSync(
      path.join(repoRoot, "node_modules/supabase/package.json"),
      "utf8",
    ),
  );
  return pkg.version;
}

// --- host operations ------------------------------------------------------

function prepare() {
  if (IS_LOCAL) return;
  pushHostScript();
  must(host(["prepare", cliVersion()]), "host prepare");
}

/** Sends this working tree's supabase/ to the host, unmerged migrations included. */
function sync() {
  if (IS_LOCAL) return;
  // A tar is binary: keep stdout as a Buffer, never decode it.
  const tar = spawnSync(
    "tar",
    [
      "-cf",
      "-",
      "--exclude=supabase/.temp",
      "--exclude=supabase/functions/.env",
      "--exclude=supabase/tests/.generated",
      // Studio's scratch folder; on the host its container owns it.
      "--exclude=supabase/snippets",
      "supabase",
    ],
    { cwd: repoRoot, maxBuffer: 512 * 1024 * 1024 },
  );
  if (tar.status !== 0) fail(`tar supabase/ failed: ${tar.stderr}`);
  must(host(["sync"], { input: tar.stdout }), "sync to host");
}

function up() {
  prepare();
  sync();
  if (IS_LOCAL) must(localCli(["start"]), "supabase start");
  else must(host(["up"]), "supabase start on host");
  writeEnvFile();
}

function down() {
  if (IS_LOCAL) must(localCli(["stop"]), "supabase stop");
  else must(host(["down"]), "supabase stop on host");
}

function readStackEnv() {
  const result = IS_LOCAL
    ? localCli(["status", "-o", "env"], { capture: true })
    : host(["env"], { capture: true });
  must(result, "reading stack status (is it up? try: npm run devdb -- up)");
  const raw = parseEnvLines(result.stdout);
  const apiUrl = raw.API_URL ?? raw.SUPABASE_URL;
  const anonKey = raw.ANON_KEY ?? raw.SUPABASE_ANON_KEY;
  const serviceRoleKey = raw.SERVICE_ROLE_KEY ?? raw.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiUrl || !anonKey || !serviceRoleKey) {
    fail(`stack status is missing keys. Got: ${Object.keys(raw).join(", ")}`);
  }
  const url = new URL(apiUrl);
  url.hostname = PUBLIC_HOST;
  return {
    DEVDB_API_URL: url.toString().replace(/\/$/, ""),
    DEVDB_ANON_KEY: anonKey,
    DEVDB_SERVICE_ROLE_KEY: serviceRoleKey,
  };
}

function writeEnvFile() {
  const env = readStackEnv();
  assertNotProduction(env.DEVDB_API_URL);
  const lines = [
    "# Written by `npm run devdb -- env`. Gitignored. Dev backend only:",
    "# these are the Supabase CLI's publicly known demo keys, never production's.",
    ...Object.entries(env).map(([key, value]) => `${key}=${value}`),
    "",
  ];
  writeFileSync(ENV_FILE, lines.join("\n"), "utf8");
  log(`wrote ${path.relative(repoRoot, ENV_FILE)} -> ${env.DEVDB_API_URL}`);
  return env;
}

function loadEnvFile() {
  if (!existsSync(ENV_FILE)) return writeEnvFile();
  const env = parseEnvLines(readFileSync(ENV_FILE, "utf8"));
  if (!env.DEVDB_API_URL || !env.DEVDB_ANON_KEY) return writeEnvFile();
  // The file is a cache for one host. After switching DEVDB_HOST it is stale.
  if (new URL(env.DEVDB_API_URL).hostname !== PUBLIC_HOST)
    return writeEnvFile();
  assertNotProduction(env.DEVDB_API_URL);
  return env;
}

/** The one rule that must never break: devdb does not touch hosted Supabase. */
function assertNotProduction(apiUrl) {
  const hostname = new URL(apiUrl).hostname;
  if (hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.in")) {
    fail(`refusing to use ${hostname}: that is a hosted Supabase project.`);
  }
}

// --- SQL ------------------------------------------------------------------

function localCronSecret() {
  const file = path.join(repoRoot, "supabase/functions/.env");
  if (!existsSync(file)) return "";
  return (
    parseEnvLines(readFileSync(file, "utf8")).HAVEN_WORKER_CRON_SECRET ?? ""
  );
}

/** Runs SQL inside the stack's own database container. It cannot reach prod. */
function psql(sql, { capture = false } = {}) {
  if (!IS_LOCAL) return host(["psql"], { input: sql, capture });
  return exec(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `haven_cron_secret=${localCronSecret()}`,
      "-q",
      "-f",
      "-",
    ],
    { input: sql, capture },
  );
}

function runSqlFile(filePath) {
  log(`sql ${path.relative(repoRoot, filePath).replace(/\\/g, "/")}`);
  must(psql(readFileSync(filePath, "utf8")), path.basename(filePath));
}

// --- seeding --------------------------------------------------------------

/** Helpers and fixtures the SQL and backend suites already rely on. */
function baselineSqlFiles() {
  return readFileSync(
    path.join(repoRoot, "supabase/tests/run_order.txt"),
    "utf8",
  )
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .filter(
      (line) =>
        line.includes("/tests/_helpers/") || line.includes("/tests/fixtures/"),
    )
    .map((line) => path.join(repoRoot, line));
}

/** `10_community.sql` is the pack named `community`. */
function devPacks() {
  if (!existsSync(SEED_DIR)) return [];
  return readdirSync(SEED_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name: name.replace(/^\d+_/, "").replace(/\.sql$/, ""),
      file: path.join(SEED_DIR, name),
    }));
}

async function waitForAuth(env, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${env.DEVDB_API_URL}/auth/v1/health`, {
        headers: { apikey: env.DEVDB_ANON_KEY },
      });
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`auth at ${env.DEVDB_API_URL} never became healthy (${last})`);
}

async function seed(requested) {
  const env = loadEnvFile();
  const packs = devPacks();
  const unknown = requested.filter(
    (name) => !packs.some((pack) => pack.name === name),
  );
  if (unknown.length > 0) {
    fail(
      `unknown pack(s): ${unknown.join(", ")}. Available: ${packs.map((pack) => pack.name).join(", ")}`,
    );
  }
  await waitForAuth(env);

  log("accounts: the seven fixture users");
  const bootstrap = spawnSync(
    process.execPath,
    ["tooling/scripts/test/bootstrap-local-auth-users.mjs"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        HAVEN_BOOTSTRAP_API_URL: env.DEVDB_API_URL,
        HAVEN_BOOTSTRAP_SERVICE_ROLE_KEY: env.DEVDB_SERVICE_ROLE_KEY,
      },
    },
  );
  if (bootstrap.status !== 0) fail("bootstrapping auth users failed");

  for (const file of baselineSqlFiles()) runSqlFile(file);
  for (const pack of packs) {
    if (requested.length === 0 || requested.includes(pack.name)) {
      runSqlFile(pack.file);
    }
  }
  log("seeded. Sign in as rls-owner@example.test / HavenTest!Owner1");
}

async function reset(args) {
  const noSeed = args.includes("--no-seed");
  const packs = args.filter((arg) => !arg.startsWith("--"));
  prepare();
  sync();
  const result = IS_LOCAL
    ? localCli(["db", "reset", "--local"])
    : host(["reset"]);
  if (result.status !== 0) {
    // The CLI sometimes exits non-zero while services restart even though the
    // migrations applied. Trust the database, not the exit code.
    const probe = psql(
      "select 'schema_ok' where to_regclass('public.communities') is not null;",
      { capture: true },
    );
    if (!probe.stdout.includes("schema_ok")) fail("db reset failed");
    log(
      "db reset exited non-zero but the migrated schema is present; continuing",
    );
  }
  writeEnvFile();
  if (!noSeed) await seed(packs);
}

// --- status / run ---------------------------------------------------------

async function status() {
  const env = loadEnvFile();
  log(`host: ${HOST}   api: ${env.DEVDB_API_URL}`);
  if (!IS_LOCAL) host(["ports"]);
  for (const [name, route] of [
    ["auth", "/auth/v1/health"],
    ["rest", "/rest/v1/"],
    ["storage", "/storage/v1/status"],
  ]) {
    try {
      const response = await fetch(`${env.DEVDB_API_URL}${route}`, {
        headers: { apikey: env.DEVDB_ANON_KEY },
      });
      log(`${name.padEnd(8)} HTTP ${response.status}`);
    } catch (error) {
      log(
        `${name.padEnd(8)} unreachable (${error.cause?.code ?? error.message})`,
      );
    }
  }
}

/** Runs any command with every app's backend variables pointed at the dev backend. */
function run(args) {
  const command = args[0] === "--" ? args.slice(1) : args;
  if (command.length === 0)
    fail("usage: npm run devdb -- run -- <command ...>");
  const env = loadEnvFile();
  log(`backend for this command: ${env.DEVDB_API_URL}`);
  // Windows needs a shell to start npm/npx (.cmd files), and a shell re-splits
  // arguments on spaces, so quote them there.
  const windows = process.platform === "win32";
  const quote = (arg) =>
    /[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
  const argv = windows ? command.map(quote) : command;
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: windows,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: env.DEVDB_API_URL,
      VITE_SUPABASE_ANON_KEY: env.DEVDB_ANON_KEY,
      EXPO_PUBLIC_SUPABASE_URL: env.DEVDB_API_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: env.DEVDB_ANON_KEY,
      // Mobile reads this in app.config.js: production OTA off, cleartext on.
      HAVEN_DEV_BACKEND: "1",
    },
  });
  process.exit(result.status ?? 1);
}

// --- entry ----------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "up":
    up();
    break;
  case "down":
    down();
    break;
  case "env":
    writeEnvFile();
    break;
  case "status":
    await status();
    break;
  case "seed":
    await seed(rest);
    break;
  case "smoke": {
    const env = loadEnvFile();
    const { smoke } = await import("./smoke.mjs");
    const passed = await smoke({
      apiUrl: env.DEVDB_API_URL,
      anonKey: env.DEVDB_ANON_KEY,
    });
    process.exit(passed ? 0 : 1);
  }
  case "reset":
    await reset(rest);
    break;
  case "run":
    run(rest);
    break;
  default:
    fail(
      "usage: npm run devdb -- <up|down|status|env|smoke|seed [pack...]|reset [--no-seed] [pack...]|run -- <command...>>",
    );
}
