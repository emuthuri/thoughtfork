# Security

Do not post vulnerabilities containing sensitive details or personal research in public issues. Use the repository's GitHub **Security → Report a vulnerability** option when available. If private reporting is unavailable, open an issue requesting a private reporting channel without exploit details or data, and wait for a maintainer's response.

Provide the affected revision, synthetic reproduction, impact and environment. Never send your real ledger, backups, credentials or browser drafts.

thoughtFork is a local Node/browser application. Keep it bound to loopback; do not expose the server to a network or treat it as a multi-user service. Local files and browser storage are not encrypted. Keep independent backups. Security fixes target the current main branch; no response-time or older-version support guarantee is offered.
