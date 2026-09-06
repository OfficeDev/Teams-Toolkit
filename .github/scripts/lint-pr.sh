#!/bin/bash

set -euo pipefail

if [ "${1:-}" = "--working-tree" ]; then
    mapfile -d '' files < <(git diff --diff-filter=MARC --name-only --relative -z -- . | grep -zE '\.(js|ts|jsx|tsx)$' || true)
else
    mapfile -d '' files < <(git diff --diff-filter=MARC "${1:?base ref is required}"...HEAD --name-only --relative -z -- . | grep -zE '\.(js|ts|jsx|tsx)$' || true)
fi

if [ "${#files[@]}" -eq 0 ]; then
    exit 0
fi

printf '%s\n' "${files[@]}"
npx prettier --check -- "${files[@]}"
npx eslint --quiet -- "${files[@]}"