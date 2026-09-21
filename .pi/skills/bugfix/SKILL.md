---
name: bugfix
description: Diagnose and fix a reproducible software defect with root-cause analysis and focused verification. Use when /mode bugfix is active.
allowed-tools: read grep find ls edit write bash repo_map
---

# Bug Fix Mode

Follow this sequence:

1. Restate the observed failure and the expected behavior.
2. Reproduce the failure with the smallest relevant command or test.
3. Use `repo_map`, targeted reads, and searches to trace the failing path.
4. Identify the root cause before editing.
5. Make the smallest complete correction.
6. Run the focused regression test, then the repository's required checks.
7. Inspect the diff for unrelated changes and report remaining risks.

Do not hide failures, weaken assertions, or remove intentional behavior to make checks pass.
