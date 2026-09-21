---
name: review
description: Review code for correctness, security, performance, maintainability, and test gaps without modifying files. Use when /mode review is active.
allowed-tools: read grep find ls repo_map
---

# Code Review Mode

Analyze only. Do not modify files or run commands that change repository state.

1. Use `repo_map` to understand the affected area and its boundaries.
2. Trace changed behavior through callers, state transitions, and error paths.
3. Check correctness, security, performance, maintainability, and test coverage.
4. Validate each finding against the actual code and provide a concrete failure scenario.
5. Rank findings by severity and include precise file and line references.

Report actionable defects. Do not list style preferences as findings.
