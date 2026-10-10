# Security policy

## Reporting a vulnerability

Please report a vulnerability privately through GitHub's private
vulnerability reporting: on the repository's Security tab, choose
"Report a vulnerability". Do not open a public issue or pull request for
it.

Include what is affected (the app, a crate, the twin or a script, and
the commit), how to reproduce it, and what an attacker could do with it.
You will get an answer in the advisory thread; a confirmed issue is fixed
on `main` and credited in the advisory unless you ask otherwise.

## Dependencies

- `pnpm-lock.yaml` and `Cargo.lock` are committed. CI installs with
  `pnpm install --frozen-lockfile` and runs cargo's lints, tests and
  checks with `--locked`. pnpm is pinned in `packageManager` and the Rust
  toolchain in `rust-toolchain.toml`. A dependency's install script runs
  only if `pnpm-workspace.yaml` allows that package by name.
- The `Audit` workflow (`.github/workflows/audit.yml`) runs on every pull
  request, on every push to `main` and every Monday:
  - `pnpm audit --prod --audit-level=low`: an advisory of any severity
    against a package that ships to the browser fails.
  - `pnpm audit --audit-level=high`: a high or critical advisory against
    any package, build and test tools included, fails. Lower ones against
    the tools are printed and do not fail: those tools run on a
    developer's machine and in CI, never in the published page.
  - `cargo deny check` with `deny.toml`: a RustSec advisory (a
    vulnerability, an unsound or an unmaintained crate) or a yanked
    version fails; so does a crate under a licence other than MIT,
    Apache-2.0 or Unicode-3.0, two versions of one crate, and a crate
    from anywhere but crates.io. cargo-deny is a prebuilt binary at a
    pinned version, checked against a SHA-256 sum by the pinned action
    that installs it.
- The app builds against Stoa's packages, linked from the
  [Stoa](https://github.com/ghostjima/stoa) repository; their
  dependencies are audited there.
- Dependabot proposes updates weekly for npm, Cargo and the GitHub
  Actions, and every action is pinned to a commit.

An audit knows only published advisories: it says nothing about a
vulnerability nobody has reported or a package that turned malicious
yesterday.

## Supported versions

Tyche's crates and packages are not published to a registry. Only the
current `main` is supported.
