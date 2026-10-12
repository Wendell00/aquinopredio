---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
  local-modification: "Rules vendored from vercel-labs/web-interface-guidelines@434b7f9 (command.md) instead of fetched live from main at each run."
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the rules in `references/web-interface-guidelines.md` (local, pinned copy; do not fetch remote rules)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in that file
4. Output findings in the terse `file:line` format defined there

If no files specified, ask the user which files to review.
