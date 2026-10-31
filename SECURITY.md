# Security policy

## Supported versions

| Version | Support |
| --- | --- |
| 0.1.x | Security fixes |

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/x-mesh/notforme/security/advisories/new) for a suspected vulnerability.

Do not include API keys, credentials, or private article data in a public issue.

Include the affected version, the affected file or feature, reproduction steps, and the possible impact.

If private reporting is unavailable, open a public issue without secret data and request a private contact method.

## Security boundaries

The extension accepts HTTPS API endpoints and stores the API key in Chrome local storage.

Chrome content scripts cannot access the API key storage area.

The optional relay binds to 127.0.0.1 and reads its API key from the process environment.

The relay rejects browser origins outside the extension origin format.

These controls do not protect a device that already has local access to the browser profile or relay process.
