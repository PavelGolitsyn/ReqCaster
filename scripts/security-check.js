#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const candidates = tracked.filter((file) => !file.includes("/raw/") && /\.(?:js|json|md|feature|yml)$/u.test(file));
const findings = [];
const signatures = [
  new RegExp(["BEGIN", "(?:RSA|OPENSSH|EC)", "PRIVATE", "KEY"].join("[ -]+"), "u"),
  new RegExp(["ghp", "[A-Za-z0-9]{36}"].join("_"), "u"),
  new RegExp(["sk", "[A-Za-z0-9]{32,}"].join("-"), "u"),
];

for (const file of candidates) {
  const content = await readFile(file, "utf8");
  for (const signature of signatures) if (signature.test(content)) findings.push(`${file}: possible committed secret (${signature.source})`);
}

for (const file of tracked.filter((name) => name.startsWith("src/") && name.endsWith(".js"))) {
  const content = await readFile(file, "utf8");
  if (/\beval\s*\(/u.test(content) || /\bnew\s+Function\s*\(/u.test(content)) findings.push(`${file}: dynamic code execution is forbidden`);
  if (/node:child_process/u.test(content)) findings.push(`${file}: production runtime must not spawn shell commands`);
}

const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const dependencies = Object.keys(lock.packages ?? {}).filter(Boolean);
if (dependencies.length) findings.push(`package-lock.json: unreviewed third-party packages: ${dependencies.join(", ")}`);

if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Security checks passed for ${candidates.length} tracked files; dependency set is empty`);
}
