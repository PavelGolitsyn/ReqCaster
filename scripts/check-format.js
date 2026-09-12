import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean)
  .filter((file) => /\.(?:js|json|md|feature|yml)$/.test(file))
  .filter((file) => !file.includes("/raw/"));
const failures = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  if (!content.endsWith("\n")) failures.push(`${file}: missing terminal newline`);
  if (content.split("\n").some((line) => /[ \t]+$/.test(line))) failures.push(`${file}: trailing whitespace`);
  if (file.endsWith(".json")) {
    try { JSON.parse(content); } catch (error) { failures.push(`${file}: ${error.message}`); }
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log(`Formatting checks passed for ${files.length} files`);
