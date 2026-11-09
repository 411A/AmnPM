# Security policy

## Supported versions

The latest release and the `main` branch are supported. Older commits and
unmerged branches are not supported.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Use GitHub private vulnerability reporting:

https://github.com/411A/AmnPM/security/advisories/new

Include:

- the affected commit or release;
- a clear reproduction (commands, updates, or a minimal script);
- the impact (message content, link isolation, sender anonymity, key handling,
  data deletion, authorization, or availability);
- whether it requires the bot token, the database, the deployment keys, or only
  a Telegram account;
- any suggested fix.

Do not test against links, bots, chats, or accounts you do not own. Use your own
deployment or a test bot. Do not access, modify, or delete another user's data.

We aim to acknowledge a report within 7 days and provide a remediation plan
within 30 days, best effort. There is no bug bounty.

## Scope

In scope:

- the code in `tgcloud/`;
- key handling, encryption, token formats, and split action capabilities;
- link, owner, sender, topic, reply, and block isolation;
- data deletion and retention behavior;
- callback authorization and replay protection;
- rate limits and abuse controls;
- dependency and deployment configuration in this repository.

Out of scope:

- Telegram's platform, clients, servers, or Bot API behavior;
- spam, bulk messaging, or denial of service through Telegram rate limits;
- social engineering;
- physical access to a device or account;
- issues in third-party clients, forks, or modified deployments.

## Safe harbor

Good-faith research that follows this policy is authorized. We will not pursue
legal action for accidental, minimal-impact testing performed on your own
deployment, and we will work with you on a coordinated disclosure. Stop testing
and report immediately if you encounter real user data.

## Disclosure

We will coordinate a fix and a disclosure date with the reporter. Credit is
given if requested. Security advisories are published from the repository's
Security tab when a fix is ready.

## Operational hardening

Repository security settings, CodeQL, Dependabot, secret scanning, and branch
protection are documented in [docs/github-security.md](docs/github-security.md).
