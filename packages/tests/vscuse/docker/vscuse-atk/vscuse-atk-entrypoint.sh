#!/usr/bin/env bash
set -euo pipefail

node /usr/local/lib/vscuse-atk/sync-vscode-feature-flags.cjs
exec /usr/local/bin/entrypoint.sh "$@"