# Change Log

All notable changes to the "emotion-check" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [2.0.0] - 2026-06-03

### Added
- Workspace-wide scanning for unused Emotion CSS variables.
- Integration with the native VS Code Problems panel via Diagnostics.
- Manual scanning command: `Emotion Check: Scan Workspace`.
- Core AST-based unused variable checking logic with React and TypeScript support.
- Fully automated test suite with edge case coverage.

### Fixed
- Ignored exported variables to prevent false positives from cross-file imports.
- Fixed an issue where the scanning status bar and progress indicator did not clear after a scan finished.