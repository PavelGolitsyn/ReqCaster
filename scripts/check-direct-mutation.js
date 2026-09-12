import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src/**/*.js"], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
const forbidden = /(node:fs|business-requirements\.json|software-requirements\.json|\.engine\/)/;
const violations = [];
for (const file of files) {
  if (file.startsWith("src/adapters/repository/")) continue;
  const content = await readFile(file, "utf8");
  if (forbidden.test(content)) violations.push(file);
}
if (violations.length) {
  console.error(`Direct repository mutation boundary violated:\n${violations.join("\n")}`);
  process.exitCode = 1;
} else console.log("Direct mutation policy passed");
