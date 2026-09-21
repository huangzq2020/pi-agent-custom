---
name: refactor
description: Improve code structure while preserving observable behavior through a tested sequence of small changes. Use when /mode refactor is active.
allowed-tools: read grep find ls edit write bash repo_map
---

# Refactor Mode

1. Use `repo_map` and targeted reads to define the behavior and dependency boundary.
2. Establish a focused test baseline before editing.
3. State the structural problem and the invariant that must remain true.
4. Refactor in small, reviewable steps without adding unrelated features.
5. Run focused tests after each material step.
6. Run the repository's required checks and inspect the final diff.

Preserve public behavior unless the user explicitly requests a behavior change. Avoid compatibility layers that are not required.
