# Agent instructions

## Installing O.M.A.

For “install this repository” requests, follow [docs/INSTALL.md](docs/INSTALL.md)
from environment preflight through verification. Cloning or enabling the plugin
alone is incomplete: run setup against the manifest-resolved payload, install
the CLI, refresh O.M.A.'s setup check and report each readiness checkpoint.
Stop on unsupported desktops or unavailable privileges. API keys belong in the
user's Settings UI; task-agent authentication is a separate user step. Never
retrieve developer credentials, put keys in chat/argv, change providers or start
billable sessions without the user's consent.

## Development

Preserve existing uncommitted changes and user configuration/data. Keep changes
bounded; do not commit, push, publish, or modify production unless requested.
Use isolated HOME/config directories and stub package/desktop commands for
installation tests. Never use real credentials, keyring, microphone or paid APIs
in offline tests. GUI/desktop tests require an isolated desktop environment.

Install dependencies with `npm ci --omit=dev --ignore-scripts --bin-links=false`.
Run focused tests for the change, then `bash tests/run` in an appropriate isolated
environment; see [docs/VERIFICATION.md](docs/VERIFICATION.md) for limitations and
opt-in tests. For install changes, run `node --test --test-isolation=none
tests/setup.test.mjs tests/plugin-install.test.mjs tests/install-*.test.mjs`, shell
syntax checks and Python compilation. Keep the no-argument JSON contract of
`scripts/check-setup.py` compatible with QML. Include shipped scripts/resources
in `scripts/runtime-files.txt`. Dependency readiness is separate from successful
authentication and user-verified voice/hardware readiness.
