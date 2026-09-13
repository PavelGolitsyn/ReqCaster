import { execFileSync } from "node:child_process";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.js"], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
for (const file of files) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
console.log(`Syntax checks passed for ${files.length} JavaScript files`);
