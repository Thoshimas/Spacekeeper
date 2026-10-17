# Spacekeeper v1.0.0

A local disk-space manager for Windows 10/11. Explore folder sizes, review cleanup suggestions and manage individual files or folders in a warm beige workspace. Disk data stays on your computer.

## Install and launch

1. Open **Spacekeeper-Setup-1.0.0-x64.exe**. The initial language dialog preselects **English**. Choose **Traditional Chinese** instead if preferred, then press **OK**; the entire installation wizard uses that language. This also sets the initial app language. A fresh copy without settings defaults to English.
2. Choose **Only for me** (normally no administrator permission), or **For everyone** (Windows requests administrator permission).
3. Choose an installation drive/folder and optional desktop / Start menu shortcuts. Choose an empty folder or an existing Spacekeeper installation.
4. Open **Spacekeeper.exe** or a shortcut. No CMD file or console window is needed. The launcher uses an Edge app window, with your default browser as a fallback.
5. Use **Quit Spacekeeper** when finished. Closing the window alone leaves the local service running. Reopening the same installation reuses its service and current scan.

The folder selection dialog opens in the foreground and stays above other windows until you select a folder or cancel. The main app does not remain always on top.

Requires 64-bit Windows 10/11, Windows PowerShell 5.1, .NET Framework 4.x and a working browser. Node.js and a precompiled native scanner are included. No separate Node installation or npm dependencies are required.

Installed copies save preferences, activity and runtime data under `%LOCALAPPDATA%\Spacekeeper\Installs\<installation-id>`, separately for each installation path. Program Files does not need to be writable. Language changes persist across launches. Portable/source copies keep their data beside the app.

Quit the app before updating its existing location. Uninstall through Windows **Installed apps** or **Uninstall.exe** in the installation folder. Uninstall refuses to interrupt an active file operation. It removes known app files and shortcuts belonging to this installation, while preserving extra user files and per-user preferences/logs.

This build has no publisher code-signing certificate. Windows may display an unknown-publisher warning. The app does not accept UAC prompts or change Windows security settings for you.

## Run from source

Install Node.js 22 or newer on Windows, then run `node server.mjs` from this
folder. No npm install is needed. `Start.cmd` is an optional source launcher.
The source repository excludes compiled executables and the bundled runtime;
the installer includes everything needed for end users.

See [BUILDING.md](BUILDING.md) for native builds, tests, installer packaging and
GitHub release instructions. [繁體中文說明](README.zh-Hant.md) is also available.

## Explore and manage

- The space map uses proportional area. Click a tile or the right-hand row button for details; double-click a folder row or map tile to enter it. A folder-name button opens the folder with one click.
- Sort by size, cleanup priority or name. Search by name or path. Global suggestions and protected lists show up to 250 folders and may contain overlapping parent/child sizes; do not add these sizes together.
- Rename, move or send an eligible item to the Recycle Bin. Before changing files, the app checks the target, asks you to type its exact original name, and checks it again. Confirmations expire after two minutes and can be used once.
- Successful operations update the existing snapshot, ancestor totals and sorting. Unaffected subtree sizes are reused; only the affected direct parent folders are listed again. The app does not recursively rescan the drive after each operation.
- Changes made in other apps require a manual **Rescan**. New folders that have not been measured remain marked incomplete. An interrupted operation or failed snapshot update also requires verification and a rescan.
- Folder details have a fixed height. Long paths, explanations and actions scroll inside the panel so selecting an item does not move the list below it.

Sizes are readable files' logical sizes, not allocated disk space or a promise of reclaimable capacity. Hard links can be counted more than once; sparse, compressed and cloud-backed files can differ from physical usage. The scanner skips reparse points, including junctions, symbolic links and some cloud placeholders, to avoid double counting or following other locations.

Recycling normally **does not free drive space immediately**. Review the Windows Recycle Bin yourself before deciding whether to empty it. Spacekeeper does not empty it or fall back to permanent deletion. Cross-drive moves use Windows Shell and may copy then remove the source. If interrupted, inspect both locations; the app does not promise automatic rollback or overwrite existing items.

## Protection and administrator access

Windows, boot, recovery, paging files, program locations, registered installs, essential AppData settings, profile roots and Spacekeeper itself are protected. Protected folders remain browsable. Recognized Local caches and individual Temp items can be reviewed separately; account data, settings, databases and installed binaries stay protected.

Content signatures can also lock a folder or its ancestors. Links, junctions and native System attributes are rejected during the operation check. An inspection that fails or exceeds the 300,000-item limit refuses the action. These conservative rules cannot identify every app dependency or important personal file. An available action is not a guarantee that an item is safe to remove.

Click **Run as administrator** when higher read permissions are needed. During a scan, the app can stop it before requesting permission. You must respond to Windows UAC yourself. A new window opens with the same interface language and the previous scan location; rescan in that new process. The original window keeps its old permissions.

Administrator mode follows the same protection rules. Spacekeeper does not bypass UAC, take ownership, change ACLs or disable Windows protections. Some files may still deny access.

## Connection issues

Read-only requests can retry twice after transient network failures. File operations, pre-action checks, scanning and elevation are never automatically replayed after an unknown result. If an operation receives no response, inspect Activity and both locations before trying again.

Open **Local connection log** for recent request names, times, retry counts and IDs. Diagnostic events exclude tokens, file paths and file contents. Startup logs under `.runtime` contain the local session URL, so do not share them publicly. They are excluded from release packages.

The service listens only on a random `127.0.0.1` port and requires a fresh session token. It validates Host, Origin and Fetch-Site and serves only an explicit static-file list. It does not upload disk data or use external fonts, analytics or accounts. This is a local utility, not a security boundary against a compromised Windows account.

## Upgrade and verification

For installer updates, quit the old version and select its installation folder. For ZIP releases, extract into a separate folder. Complete one initial scan in the new process. Later successful operations update that scan automatically. The bundled native scanner is checked against source and binary hashes; compilation is only a fallback.

Run `runtime\node.exe --test tests/*.test.mjs` to verify the source. Windows integration tests create dedicated temporary fixtures and actually rename, move and recycle only those test files. Small disposable test items can remain in the Recycle Bin. Tests do not empty it.

The current verification record is in [VERIFICATION.md](VERIFICATION.md), including test coverage, screenshots and untested boundaries. Cross-drive moves, removable devices and accepting a real UAC prompt require their corresponding environments; they are not claimed as fully tested.

Node.js and its bundled third-party license notices are preserved in [licenses/NODE-LICENSE.txt](licenses/NODE-LICENSE.txt). No external npm dependencies are required.

## License

Spacekeeper is licensed under [MIT](LICENSE). Bundled third-party components
retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
The original folder, space-map and leaf icon is in `assets/`.
