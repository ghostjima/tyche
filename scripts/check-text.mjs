// House-style gate for tracked text, commit messages and pull request text:
// no emoji, no AI attribution trailers, no paths to internal material.
// Usage: node scripts/check-text.mjs [base-ref]
// With a base ref, commit messages in base..HEAD are checked too.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 26 });
// Paths below are repository-relative, whatever directory this runs from.
process.chdir(git("rev-parse", "--show-toplevel").trim());
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|gz|tycz|wasm|pdf)$/i;
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u;
const TRAILER = /^(co-authored-by:.*(claude|anthropic)|.*generated (with|by) \[?claude code|.*claude\.ai\/code\/session)/im;
// The internal folder is ignored by git and never named in public text. The
// pattern is assembled so that this file does not name the folder itself.
const INTERNAL = new RegExp(`\\bdocs[\\\\/]${"in" + "side"}\\b`, "i");
// The ignore file has to name the folder to keep it out.
const MAY_NAME_INTERNAL = new Set([".gitignore"]);

const problems = [];
for (const file of git("ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter((f) => f && !BINARY.test(f))) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  text.split("\n").forEach((line, i) => {
    if (EMOJI.test(line)) problems.push(`${file}:${i + 1}: emoji`);
    if (INTERNAL.test(line) && !MAY_NAME_INTERNAL.has(file)) problems.push(`${file}:${i + 1}: internal path`);
  });
}

const base = process.argv[2];
// Before the first push the base does not exist yet; then every commit is new.
const resolves = (ref) => { try { git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`); return true; } catch { return false; } };
if (base) {
  const range = resolves(base) ? `${base}..HEAD` : "HEAD";
  for (const sha of git("rev-list", range).split("\n").filter(Boolean)) {
    const msg = git("log", "-1", "--format=%B", sha);
    if (EMOJI.test(msg)) problems.push(`commit ${sha.slice(0, 7)}: emoji in message`);
    if (TRAILER.test(msg)) problems.push(`commit ${sha.slice(0, 7)}: AI attribution line`);
    if (INTERNAL.test(msg)) problems.push(`commit ${sha.slice(0, 7)}: internal path in message`);
    const who = git("log", "-1", "--format=%an <%ae>|%cn <%ce>", sha).trim();
    if (/anthropic\.com|^claude </i.test(who.split("|")[0])) problems.push(`commit ${sha.slice(0, 7)}: authored as ${who.split("|")[0]}`);
  }
}

// Pull request text, when CI passes it in PR_BODY.
const body = process.env.PR_BODY ?? "";
if (EMOJI.test(body)) problems.push("pull request description: emoji");
if (TRAILER.test(body)) problems.push("pull request description: AI attribution line or session link");
if (INTERNAL.test(body)) problems.push("pull request description: internal path");

for (const p of problems) console.log(p);
console.log(problems.length ? `${problems.length} problem(s)` : "text ok");
process.exit(problems.length ? 1 : 0);
