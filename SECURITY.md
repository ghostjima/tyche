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

## What the published page enforces

The app is one static page with no server of its own. GitHub Pages sets
no security headers for it and offers no way to add any, so the two
policies below are meta elements in the built `index.html`.

### Content Security Policy

`apps/terminal/csp.ts` writes the policy into the page during
`vite build`, right after the charset declaration and before every
script and stylesheet:

```
default-src 'self';
script-src 'self' 'sha256-(the first-paint script)' 'wasm-unsafe-eval';
style-src 'self' 'sha256-(React Aria, usePress)' 'sha256-(React Aria, usePreventScroll)';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
worker-src 'self';
base-uri 'self';
form-action 'none';
object-src 'none'
```

- `script-src`: the page's own files and one inline script, the one that
  sets the language, the direction and the theme before the first paint.
  It is allowed by the SHA-256 of its text, which the build computes
  from the page it is about to write, so an edited script ships with the
  hash of the edit. No `'unsafe-inline'` and no `'unsafe-eval'`:
  `'wasm-unsafe-eval'` lets the page compile the bond engine's
  WebAssembly and does not allow `eval` or `new Function`.
- `style-src`: the page's own stylesheet, and the two style elements
  React Aria adds to the head at run time, each by the hash of its text.
  No `'unsafe-inline'`: an injected style element or style attribute is
  refused.
- `img-src`: the page's own files, and `data:` for the empty icon
  declared in `index.html`.
- `font-src`: the IBM Plex files, which are part of the build.
- `connect-src`: the page requests nothing but its own files (the
  engines' WebAssembly). The links to cbr.ru are navigation, not
  requests the page makes.
- `worker-src`: only a file of the build can become a worker; the
  market engine runs in one.
- `base-uri 'self'`, `form-action 'none'`, `object-src 'none'`: no base
  element can redirect the page's relative URLs, no form can be posted
  anywhere, no plugin content is loaded.

`apps/terminal/e2e/csp.spec.ts` checks it in Chromium against
`vite preview` of the build: the hash in the page is the hash of the
inline script as the browser reads it; both languages and both themes
pass through the main states, with both engines loaded, on the
WebAssembly fallback and with the market engine failed, without one
violation; and an injected inline script, an inline handler, `eval`, an
injected style, a base element, a posted form and a script, stylesheet,
image or request to another origin are each refused.

The dev server's page carries no policy: Vite's hot reload needs inline
scripts and `eval`.

### Referrer policy

`<meta name="referrer" content="no-referrer">`: the page's address,
which holds the viewer's filters, holdings and amounts, is not sent to
the sites the page links to, and not with the page's own requests.

### Limits

- A policy in a meta element cannot carry `frame-ancestors`, `sandbox`
  or a report endpoint, and Pages sends no `X-Frame-Options`: another
  site can show the page in a frame. Nothing in the page acts on an
  account, so there is no action a frame could trick a viewer into, but
  it is not prevented.
- `'self'` is the whole origin. On Pages that is `ghostjima.github.io`,
  which every site of the account shares, so the policy does not tell
  this app's files from another project's, and neither does the
  browser's storage.
- A worker takes its policy from the headers of its own script, and
  Pages sends none, so the market worker runs without one. `worker-src`
  only limits which script can become a worker.
- Requests made from the stylesheet (the fonts) and from the worker
  follow those files' own referrer policy, the browser's default, not
  the page's; they are requests to the page's own origin and name only
  the file.
- Transport security (HTTPS, HSTS) and every response header are
  GitHub Pages' and are not set here.
- The policy is tested in Chromium only.

### Out of scope

The app has no accounts, no server and no personal data: the market is
synthetic, and the demo orders and requests a viewer records stay in
that browser's `localStorage`. Reports about the Bank of Russia's site,
GitHub Pages itself, or a browser extension changing the page are not
vulnerabilities of this repository.
