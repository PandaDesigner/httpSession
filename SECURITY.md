# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| main branch | yes |
| older 0.x | best effort |

## Reporting a vulnerability

**Please do not file a public issue.** Use one of these private channels:

- GitHub Security Advisories: open a draft advisory at `https://github.com/PandaDesigner/httpSession/security/advisories/new`.
- Email: `security@http-session.example` (placeholder — replace with a real monitored address before publishing).

We will acknowledge within **48 hours** and aim to ship a fix within **7 days** for high-severity issues.

## Scope

This package is a thin HTTP client over the platform `fetch`. The attack surface is:

- URL parsing and validation.
- Request body serialization.
- TLS / certificate handling — delegated to the platform.
- Zod parsing of untrusted responses.

If you find a vulnerability in any of these areas, please report it.