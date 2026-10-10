// The rules every workflow in .github/workflows keeps, checked on the
// files as they are written: a token with no permission unless a job asks
// for one, the jobs that may write named here, actions pinned to a commit,
// no credentials left in a checkout that does not push, nothing from an
// event pasted into a shell script, and a concurrency group.
//
// The files are read as text, by indentation, which is enough for the
// plain YAML the workflows are written in; no YAML parser is installed
// for it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows");

// The only jobs that may write to the repository, each to one orphan
// branch. A new one is added here on purpose or not at all.
const WRITERS = {
  "ci.yml": ["publish-badges"],
  "cbr-data.yml": ["publish"],
};

const indentOf = (line) => line.length - line.trimStart().length;
const isContent = (line) => line.trim() !== "" && !line.trim().startsWith("#");

/** The lines under the key at `start`: everything indented deeper than it. */
function blockAfter(lines, start) {
  const indent = indentOf(lines[start]);
  const block = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (isContent(lines[i]) && indentOf(lines[i]) <= indent) break;
    block.push(lines[i]);
  }
  return block;
}

/** The line index of `key:` at exactly `indent` spaces, or -1. */
const findKey = (lines, key, indent) => lines.findIndex((line) => indentOf(line) === indent && new RegExp(`^${key}:(\\s|$)`).test(line.trim()));

/** A `permissions:` key at `indent`: its entries ("contents: read"), an
 * empty list for `{}`, or null when the key is absent. */
function permissionsAt(lines, indent) {
  const at = findKey(lines, "permissions", indent);
  if (at < 0) return null;
  const inline = lines[at].trim().slice("permissions:".length).trim();
  if (inline !== "") return inline === "{}" ? [] : [inline];
  return blockAfter(lines, at).filter(isContent).map((line) => line.trim());
}

/** A workflow file as its jobs and their steps. */
function read(file) {
  const text = readFileSync(join(DIR, file), "utf8");
  const lines = text.split("\n");
  const jobsAt = findKey(lines, "jobs", 0);
  assert.ok(jobsAt >= 0, `${file}: no jobs`);
  const jobLines = blockAfter(lines, jobsAt);
  const jobs = [];
  jobLines.forEach((line, i) => {
    const name = /^ {2}([\w-]+):\s*$/.exec(line)?.[1];
    if (!name) return;
    const body = blockAfter(jobLines, i);
    const stepsAt = findKey(body, "steps", 4);
    const stepLines = stepsAt < 0 ? [] : blockAfter(body, stepsAt);
    const steps = [];
    for (const stepLine of stepLines) {
      if (/^ {6}- /.test(stepLine)) steps.push([stepLine]);
      else if (steps.length > 0) steps[steps.length - 1].push(stepLine);
    }
    jobs.push({ name, body, steps: steps.map((step) => step.filter(isContent)) });
  });
  return { file, text, lines, jobs };
}

/** The shell text of a step: a one-line `run:` or the block under it. */
function runText(step) {
  const at = step.findIndex((line) => /^\s*(- )?run:/.test(line));
  if (at < 0) return "";
  const first = step[at].replace(/^\s*(- )?run:\s*/, "");
  if (!/^[|>][+-]?$/.test(first)) return first;
  const indent = indentOf(step[at].replace("- ", "  "));
  const block = [];
  for (const line of step.slice(at + 1)) {
    if (indentOf(line) <= indent) break;
    block.push(line);
  }
  return block.join("\n");
}

const workflows = readdirSync(DIR)
  .filter((file) => /\.ya?ml$/.test(file))
  .sort()
  .map(read);

test("there are workflows to check, each with jobs and steps", () => {
  assert.ok(workflows.length > 0);
  for (const { file, jobs } of workflows) {
    assert.ok(jobs.length > 0, `${file}: no job was read`);
    for (const job of jobs) assert.ok(job.steps.length > 0, `${file}: ${job.name} has no step`);
  }
});

test("the token has no permission by default, and each job states its own", () => {
  for (const { file, lines, jobs } of workflows) {
    assert.deepEqual(permissionsAt(lines, 0), [], `${file}: the top level must say permissions: {}`);
    const writers = WRITERS[file] ?? [];
    for (const job of jobs) {
      const permissions = permissionsAt(job.body, 4);
      assert.notEqual(permissions, null, `${file}: ${job.name} states no permissions`);
      const expected = writers.includes(job.name) ? ["contents: write"] : ["contents: read"];
      assert.deepEqual(permissions, expected, `${file}: ${job.name}`);
    }
    for (const name of writers) assert.ok(jobs.some((job) => job.name === name), `${file}: the writing job ${name} is gone; take it out of WRITERS`);
  }
  for (const file of Object.keys(WRITERS)) assert.ok(workflows.some((workflow) => workflow.file === file), `${file} is gone; take it out of WRITERS`);
});

test("no workflow runs on pull_request_target or workflow_run", () => {
  for (const { file, lines } of workflows) {
    const on = findKey(lines, "on", 0);
    assert.ok(on >= 0, `${file}: no on`);
    const triggers = [lines[on], ...blockAfter(lines, on)].filter(isContent).join("\n");
    assert.doesNotMatch(triggers, /pull_request_target|workflow_run/, file);
  }
});

test("every action is pinned to a full commit, with its version beside it", () => {
  let seen = 0;
  for (const { file, lines } of workflows) {
    for (const line of lines.filter(isContent)) {
      const uses = /^\s*(?:- )?uses:\s*(.*)$/.exec(line)?.[1];
      if (uses === undefined) continue;
      seen++;
      assert.match(uses, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/, `${file}: ${uses}`);
    }
  }
  assert.ok(seen > 0);
});

test("a checkout keeps its credentials only in a job that pushes", () => {
  let seen = 0;
  for (const { file, jobs } of workflows) {
    const writers = WRITERS[file] ?? [];
    for (const job of jobs) {
      for (const step of job.steps) {
        if (!step.some((line) => /uses:\s*actions\/checkout@/.test(line))) continue;
        seen++;
        const dropped = step.some((line) => /^\s*persist-credentials:\s*false\s*$/.test(line));
        if (writers.includes(job.name)) assert.equal(dropped, false, `${file}: ${job.name} pushes, so its checkout keeps the credentials`);
        else assert.equal(dropped, true, `${file}: ${job.name} checks out without persist-credentials: false`);
      }
    }
  }
  assert.ok(seen > 0);
});

// A value from the event (a branch name, a pull request's text) reaches
// a script through `env`, where the shell reads it as data. Written into
// the script with ${{ }}, it would be read as code.
test("no expression is written into a shell script", () => {
  let seen = 0;
  for (const { file, jobs } of workflows) {
    for (const job of jobs) {
      for (const step of job.steps) {
        const script = runText(step);
        if (script === "") continue;
        seen++;
        assert.doesNotMatch(script, /\$\{\{/, `${file}: ${job.name}: ${script.split("\n")[0]}`);
      }
    }
  }
  assert.ok(seen > 0);
});

test("every workflow has a concurrency group", () => {
  for (const { file, lines } of workflows) {
    const at = findKey(lines, "concurrency", 0);
    assert.ok(at >= 0, `${file}: no concurrency at the top level`);
    assert.ok(blockAfter(lines, at).some((line) => /^\s*group:\s*\S/.test(line)), `${file}: concurrency names no group`);
  }
});
