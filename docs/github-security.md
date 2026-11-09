# GitHub security operations

This page covers the repository-side security setup. It is separate from
`security-model.md`, which describes what the bot protects.

## Already enabled

The repository is public. Secret scanning and push protection are enabled.
CodeQL, Dependabot, dependency review, and private vulnerability reporting are
configured here or in `.github/`.

## Files in this repository

| File | Purpose |
| --- | --- |
| `SECURITY.md` | Supported versions, private reporting link, scope, safe harbor, disclosure. |
| `.github/dependabot.yml` | Weekly npm and GitHub Actions version updates; minor/patch grouped. |
| `.github/workflows/codeql.yml` | CodeQL JavaScript/TypeScript analysis on push, pull request, and weekly schedule. |
| `.github/workflows/dependency-review.yml` | Fails pull requests that introduce high-severity vulnerable dependencies. |

`SECURITY.md` and `.github/dependabot.yml` are read from the **default branch**.
They take effect for the repository only after they reach `main`.

## Enable the repository settings

These settings are not files. Run them once as a repository admin, or use the
matching UI path.

```bash
# Dependabot vulnerability alerts
gh api -X PUT repos/411A/AmnPM/vulnerability-alerts

# Dependabot security updates
gh api -X PUT repos/411A/AmnPM/automated-security-fixes

# Private vulnerability reporting
gh api -X PUT repos/411A/AmnPM/private-vulnerability-reporting
```

UI equivalents:

- **Settings → Code security → Dependabot alerts** → Enable.
- **Settings → Code security → Dependabot security updates** → Enable.
- **Settings → Code security → Private vulnerability reporting** → Enable.

Verify:

```bash
gh api repos/411A/AmnPM --jq '.security_and_analysis'
gh api repos/411A/AmnPM/private-vulnerability-reporting
gh api repos/411A/AmnPM/vulnerability-alerts
```

Secret scanning and push protection are already on. Keep them on.

## Code scanning

`.github/workflows/codeql.yml` uses the CodeQL workflow, not default setup. Do
not enable default setup at the same time; choose one.

- Same-repository pull requests are analyzed and upload SARIF.
- Fork pull requests skip the job because their token cannot upload SARIF.
- Results appear under **Security → Code scanning**.
- Query alerts with `gh api repos/411A/AmnPM/code-scanning/alerts`.

## Dependabot

`.github/dependabot.yml` covers:

- npm in `/` (the project has no runtime dependencies, but this future-proofs
  tooling);
- GitHub Actions, so the workflow actions stay current.

Dependabot security updates handle vulnerable dependencies separately from
version updates. There is no bug bounty and no automatic merge; review each PR.

Query alerts with `gh api repos/411A/AmnPM/dependabot/alerts`.

## Private reporting and advisories

`SECURITY.md` tells reporters to use:

https://github.com/411A/AmnPM/security/advisories/new

Enable private vulnerability reporting (above) so that link works. When a fix
is ready:

1. Open a draft advisory from **Security → Advisories → New draft security
   advisory**.
2. Add affected versions, severity, and credits.
3. Request a CVE from the advisory if the issue affects released users.
4. Publish the advisory with the fixed release.

List advisories with `gh api repos/411A/AmnPM/security-advisories`.

## Branch protection

For `main`, use **Settings → Branches → Add branch protection rule**:

- Require a pull request before merging.
- Require status checks to pass:
  - `🧪 Test suite`
  - `Analyze JavaScript`
  - `Dependency review`
- Require branches to be up to date before merging.
- Block force pushes.
- Require conversation resolution.
- Keep administrator bypass only if you need an emergency path.

For a solo maintainer, requiring an approving review can block work. Require
the checks and the pull request instead.

## What GitHub does not provide for a personal repository

Organization audit logs, audit log streaming, and organization-level security
overview are not available for a repository owned by a personal account. The
repo-level equivalents are:

- **Security → Code scanning / Dependabot / Secret scanning**;
- the REST APIs listed above;
- git history and the CI logs.

If you need a real audit log, transfer the repository to a GitHub organization
and enable audit log streaming there.

## Dependency and artifact checks

The bot has no runtime dependencies. Still run:

```bash
npm audit --omit=dev
npm outdated
```

Export the dependency graph SBOM with:

```bash
gh api repos/411A/AmnPM/dependency-graph/sbom > sbom.json
```

For release integrity, the bundle hash and manifest checks are documented in
`security-hardening.md`. GitHub build provenance/attestations are optional and
would need a separate release workflow.

## Actions hardening

Current settings allow all actions. For a stricter repository:

- allow only GitHub-authored or verified actions;
- require actions to be pinned to a full commit SHA;
- keep workflow `permissions:` minimal (the existing workflows already use
  read-only defaults except CodeQL's `security-events: write`);
- never use `pull_request_target` with untrusted code.

Do not enable SHA pinning until every `uses:` line is pinned; the current
workflows use version tags.
