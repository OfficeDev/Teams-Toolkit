#!/usr/bin/env bash
# validate-derived.sh — Validate a regenerated derived file
# Usage: validate-derived.sh <file_path>
# Exit 0 = valid, Exit 1 = invalid (issues printed to stderr)
set -euo pipefail

FILE="$1"
if [ ! -f "$FILE" ]; then
  echo "ERROR: File not found: $FILE" >&2
  exit 1
fi

FILE_DIR=$(dirname "$FILE")
ISSUES=()

# --- Check 1: Extract and validate all markdown relative links ---
# Matches [text](relative/path) but skips URLs (http://, https://, #anchors)
while IFS= read -r link; do
  [ -z "$link" ] && continue

  # Skip anchor-only links
  [[ "$link" == \#* ]] && continue

  # Strip anchor from link (e.g., path/file.md#section -> path/file.md)
  link_path="${link%%#*}"
  [ -z "$link_path" ] && continue

  # Resolve relative to file's directory
  resolved="$FILE_DIR/$link_path"

  if [ ! -e "$resolved" ]; then
    ISSUES+=("Broken reference: [$link_path] (resolved: $resolved)")
  fi
done < <(grep -oP '\[.*?\]\(\K[^)]+(?=\))' "$FILE" | grep -v '^https\?://')

# --- Check 2: Required sections (frontmatter for SKILL.md files) ---
basename_file=$(basename "$FILE")
if [[ "$basename_file" == "SKILL.md" ]]; then
  # Check for frontmatter
  if ! head -1 "$FILE" | grep -q '^---$'; then
    ISSUES+=("Missing frontmatter: SKILL.md should start with ---")
  fi

  # Check for key sections
  for section in "## procedure\|## Procedure\|## When to Use\|## Sub-Skills\|## Expert Domains"; do
    if ! grep -qiP '## (procedure|when to use|sub-skills|expert domains)' "$FILE"; then
      ISSUES+=("Missing expected section in SKILL.md (procedure/when to use/sub-skills/expert domains)")
      break
    fi
  done
fi

if [[ "$basename_file" == "index.md" ]]; then
  # Router index files should have purpose and routing
  if ! grep -qi '## purpose\|## routing' "$FILE"; then
    ISSUES+=("Missing expected section in index.md (purpose or routing)")
  fi
fi

# --- Report results ---
if [ ${#ISSUES[@]} -eq 0 ]; then
  echo "VALID: All checks passed for $FILE"
  exit 0
else
  echo "INVALID: ${#ISSUES[@]} issue(s) found in $FILE" >&2
  for issue in "${ISSUES[@]}"; do
    echo "  - $issue" >&2
  done
  exit 1
fi
