import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "check-text.mjs");
// Assembled so that this file does not name the internal folder itself.
const INTERNAL = ["docs", "inside"].join("/");
const repos = [];

after(() => {
  for (const dir of repos) rmSync(dir, { recursive: true, force: true });
});

// A throwaway repository with one commit holding `files`.
function repo(files, message = "chore(stoa): start") {
  const dir = mkdtempSync(join(tmpdir(), "check-text-"));
  repos.push(dir);
  const git = (...a) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...a], { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git("add", "-A");
  git("commit", "-q", "--allow-empty", "-m", message);
  return { dir, git };
}

function check(dir, args = [], env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, PR_BODY: "", ...env } });
  return { status: r.status, out: r.stdout };
}

test("plain text passes", () => {
  const { dir } = repo({ "README.md": "# Stoa\n\nA design system.\n" });
  assert.deepEqual(check(dir), { status: 0, out: "text ok\n" });
});

test("an emoji in a tracked file fails", () => {
  const { dir } = repo({ "README.md": "Done \u{2705}\n" });
  const r = check(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /README\.md:1: emoji/);
});

test("an internal path in a public file fails, in a file not yet tracked too", () => {
  const { dir } = repo({ "docs/notes.md": `See ${INTERNAL}/plans for the order.\n` });
  writeFileSync(join(dir, "draft.md"), `From ${INTERNAL.replace("/", "\\")}.\n`);
  const r = check(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /docs\/notes\.md:1: internal path/);
  assert.match(r.out, /draft\.md:1: internal path/);
});

test("the ignore file may name the internal folder, and ignored files are not read", () => {
  const { dir } = repo({ ".gitignore": `/${INTERNAL}/\n`, "README.md": "Public.\n" });
  mkdirSync(join(dir, INTERNAL), { recursive: true });
  writeFileSync(join(dir, INTERNAL, "plan.md"), `Internal, under ${INTERNAL}.\n`);
  assert.deepEqual(check(dir), { status: 0, out: "text ok\n" });
});

test("an internal path in a pull request description fails", () => {
  const { dir } = repo({ "README.md": "Public.\n" });
  const r = check(dir, [], { PR_BODY: `Follows ${INTERNAL}/plans/next.md.` });
  assert.equal(r.status, 1);
  assert.match(r.out, /pull request description: internal path/);
});

test("an internal path in a commit message after the base fails", () => {
  const { dir, git } = repo({ "README.md": "Public.\n" });
  git("commit", "-q", "--allow-empty", "-m", `docs(stoa): follow ${INTERNAL}`);
  const r = check(dir, ["HEAD~1"]);
  assert.equal(r.status, 1);
  assert.match(r.out, /commit [0-9a-f]{7}: internal path in message/);
  assert.equal(check(dir, ["HEAD"]).status, 0);
});

test("an attribution trailer in a commit message fails", () => {
  const { dir, git } = repo({ "README.md": "Public.\n" });
  git("commit", "-q", "--allow-empty", "-m", "fix(react): focus\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
  const r = check(dir, ["HEAD~1"]);
  assert.equal(r.status, 1);
  assert.match(r.out, /AI attribution line/);
});

test("a base that does not exist yet checks every commit instead of crashing", () => {
  const { dir } = repo({ "README.md": "# Stoa\n" }, `docs(stoa): follow ${INTERNAL}`);
  const r = check(dir, ["origin/main"]);
  assert.equal(r.status, 1);
  assert.match(r.out, /internal path in message/);
});
