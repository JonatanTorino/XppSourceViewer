# Changelog

This format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
versioning is [semantic](https://semver.org/).

## [0.1.0] - 2026-09-16

First release.

### Added

- Reconstruction of X++ from D365FO metadata XML, with a recursive walk that
  recovers methods at every nesting level: the artifact, its data sources, the
  fields of each data source, and the controls.
- Read-only virtual view holding an artifact's X++, regenerated when the source
  XML is saved. Nothing is written to disk unless you ask for it.
- Export to `.xpp` of a single file or of an entire module tree.
- Control over when the view opens: `never` / `ask` / `onOpen` modes, filters by
  artifact type and by path glob, and skipping of artifacts with no source.
- Control over where it appears: `viewColumn` and `preserveFocus`.
- Status bar indicator that pauses and resumes automatic opening for the
  session, and `Ctrl+Alt+X` to toggle between the XML and its view.
- Emission options: strip `///` comments and prepend a header with the origin of
  the source.
- TextMate grammar and language configuration for X++.
- 47 tests over structural invariants, runnable without VS Code.
