import { execSync } from "child_process";

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

const before = execSync("git rev-parse HEAD:package-lock.json", {
  encoding: "utf8",
}).trim();

run("git fetch");
run("git pull");

const after = execSync("git rev-parse HEAD:package-lock.json", {
  encoding: "utf8",
}).trim();

if (before !== after) {
  console.log("package-lock.json changed — running npm ci");
  run("npm ci");
} else {
  console.log("package-lock.json unchanged — running npm install");
  run("npm install");
}

run("npm run typecheck");
run("npm run lint");
