# Release verification: Spacekeeper 1.0.0

Verified on 64-bit Windows using a normal desktop account. All file-management
tests operate on newly created fixtures, not existing user files.

- Full regression suite: **48 passed, 0 failed, 0 skipped** (about 99 seconds).
  Covers authentication, origin/static-file restrictions, protection rules,
  native and compatible scans, cancellation, incremental rename/move/recycle,
  language defaults/persistence, bounded classification and connection retries.
- Native scanner: 1 / 4 / 8 workers agree with compatible results on dedicated
  fixtures. Links and junctions are skipped. Source/binary hashes are checked.
- Native launcher: directory guard rejects roots, Windows paths, unrelated
  nonempty folders and reparse points. Reopening reuses the active service and
  scan; successful operations reuse indexed subtree totals.
- Installer: both default English and explicit Traditional Chinese were
  installed and uninstalled in separate Unicode-path fixtures. Every payload
  file was checked against the build manifest. Version, language, native scan,
  service reuse and language persistence were checked.
- Uninstall: removes known program files and registration, retains unrelated
  fixture files and per-user preferences, and refuses to interrupt file work.
- UI: the English default and Chinese welcome/scope text and native buttons
  were inspected. Language selection occurs in .onInit, before NSIS resolves
  the wizard language. The user also confirmed the folder picker foreground fix.
- Current source and installer include MIT and separate Node/NSIS notices.
  Source packaging uses an explicit allowlist and excludes runtime binaries,
  generated executables, activity/session data, tokens and historical builds.

Real UAC acceptance, all-user installation, a read-only Program Files install,
multiple Windows accounts, Windows 10 hardware, cross-drive moves and removable
media still require their corresponding environments. These are not claimed as
fully tested. The installer is unsigned.

Reproduce builds and checks using [BUILDING.md](BUILDING.md). Integration tests
may leave tiny disposable items in the Recycle Bin; they never empty it.