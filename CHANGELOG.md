# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0.0] - 2026-04-02

### Added
- Per-category CV skill extraction: splits analysis into 18 parallel Claude calls (one per category, ~7-9 skills each) for consistent, deterministic results
- temperature:0 and system/user message separation for extraction prompts
- Reasoning field in tool schema: Claude justifies each rating, logged for debugging
- 18 domain-specific worked examples anchoring skill levels to concrete CV evidence
- Promise.allSettled with failedCategories tracking: partial extraction succeeds even if some categories fail
- Full 6-level descriptors (L0-L5) sent to Claude instead of only L0/L2/L4
- DOCX CV text extraction via mammoth (alongside existing PDF support)
- Integration test framework: 3 synthetic CVs with expected outputs, tolerance-based assertions, self-consistency verification
- 15 unit tests covering per-category architecture, partial failure, validation, and reasoning extraction

### Changed
- extractSkillsFromCv return type: now returns `{ ratings, failedCategories }` instead of raw ratings map
- Candidates route updated to handle new extraction result structure
