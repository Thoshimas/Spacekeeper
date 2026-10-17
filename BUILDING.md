# Build and publish

Run these steps from the source folder on 64-bit Windows 10/11. No external npm
dependencies are required. Windows PowerShell 5.1 and the .NET Framework C#
compiler supplied with Windows are used for native components.

## Run from source

Install Node.js 22 or newer, then run:

```powershell
node server.mjs
```

The browser opens in English by default. Use `node server.mjs --language zh-Hant`
to start in Traditional Chinese. `Start.cmd` is an optional source launcher.

## Build native components and test

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File Build-Native.ps1
node --test tests/*.test.mjs
```

This generates Spacekeeper.exe, native/FastScanner.exe, its source/binary hash
manifest, and the icon assets. Generated executables and runtime caches are
ignored by Git. The EXE launcher additionally needs the bundled Node runtime
described below; running `node server.mjs` uses the Node installation on PATH.

Tests create dedicated fixtures. Windows integration tests actually rename,
move and recycle only those fixtures; small test items may remain in the
Recycle Bin. Tests never empty it. Run as a normal desktop user.

## Build the Windows installer

1. Get NSIS 3.13 from its [official download page](https://nsis.sourceforge.io/Download).
2. For this release, get the Windows x64 Node.js **v26.2.0** distribution from
   [the official release directory](https://nodejs.org/download/release/v26.2.0/).
   Copy node.exe into a new `runtime/` folder. Copy that distribution's LICENSE
   to `runtime/NODE-LICENSE.txt`. Do not substitute a license from another Node
   version.
3. Check node.exe against the official
   [SHA256 list](https://nodejs.org/download/release/v26.2.0/SHASUMS256.txt):

   ```text
   96f768b95e8e9d443f5eead1cb2d199744923320bb8240d2c3129362e7ae2a5d
   ```

4. Build with the actual path to makensis.exe:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File Build-Installer.ps1 -NsisPath "C:\Program Files (x86)\NSIS\makensis.exe"
   ```

The default output is **Spacekeeper-Setup-1.0.0-x64.exe** in the parent folder.
Pass `-Output` to choose another path. Existing outputs are never overwritten.
Builds include Node, the precompiled native scanner, MIT and third-party notices.
The NSIS compiler and bundled Node binaries do not belong in the source repo.

Verify both installation languages in disposable test folders:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/installer-smoke.ps1 -Installer ../Spacekeeper-Setup-1.0.0-x64.exe
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/installer-smoke.ps1 -Installer ../Spacekeeper-Setup-1.0.0-x64.exe -SetupLanguage zh-Hant
```

These tests install and uninstall only newly created copies, create no desktop
shortcuts, and do not accept UAC. They compare every installed payload hash,
check language persistence and scan reuse, and preserve unrelated test files
during uninstall.

## Put it on GitHub

- Use this source folder as the repository root, with README.md and LICENSE at
  the top level. Keep the supplied .gitignore.
- Create a release tagged **v1.0.0** and attach the single latest installer plus
  its .sha256 file. RELEASE_NOTES.md contains ready-to-use release notes.
- Do not upload local scan/activity logs, preferences, .runtime/, bundled
  executables or test fixtures. The installer already contains its runtime.
- `Package.ps1` creates a source-only ZIP using an explicit file list. It is
  optional; GitHub also provides source archives from repository tags.

This folder is prepared for publication. No GitHub repository is created and
no files are uploaded by these scripts.
