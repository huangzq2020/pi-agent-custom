---
name: test
description: Analyze a project's test strategy, add meaningful missing coverage, run focused tests, and explain failures. Use when /mode test is active.
allowed-tools: read grep find ls edit write bash repo_map
---

# Test Mode

1. Use `repo_map` to identify the test framework, commands, and source boundaries.
2. Read existing nearby tests to follow local conventions.
3. Identify a behavior, edge case, or regression risk that is not already covered.
4. Add the smallest test that proves observable behavior rather than implementation details.
5. Run the specific test and fix failures without weakening the assertion.
6. Run the repository's required checks when the test passes.

Do not call real paid providers or external services when a local fake or fixture is available.
