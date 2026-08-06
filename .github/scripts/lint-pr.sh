#!/bin/bash
VAR=$(git diff --diff-filter=MARC $1...HEAD --name-only --relative -- .| grep -E '.js$|.ts$|.jsx$|.tsx$' | xargs)
echo $VAR
if [ ! -z "$VAR" ]
then 
    # Format check: Prettier rewrites the changed files; the workflow's follow-up
    # "Check if there are changes" step fails the job if any file was not already
    # formatted (git diff is non-empty).
    npx prettier --write $VAR
    # Quality gate: ESLint checks code quality. --quiet ignores warnings so this
    # fails the job only on ESLint errors (e.g. import cycles). No --fix: quality
    # issues must be fixed by the author, not silently auto-applied. Runs full
    # (type-aware) since ESLINT_FAST is not set in CI.
    npx eslint --quiet $VAR
fi