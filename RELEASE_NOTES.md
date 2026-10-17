# Spacekeeper 1.0.0

A local disk-space manager for 64-bit Windows 10/11, with a warm beige interface.

- Explore proportional space maps, folder sizes and cleanup priorities.
- Rename, move and recycle eligible items with protection checks and explicit
  name confirmation. Successful operations update the existing scan and sorting.
- Browse protected AppData folders and inspect individual cache candidates.
- Folder details keep a fixed height; selection does not shift the file list.
- Folder selection opens in the foreground and stays above other windows.
- English is the default. Choose Traditional Chinese before the setup wizard
  opens; the wizard's text and buttons follow the selected language.
- Select an installation folder and optional desktop / Start menu shortcuts.
- Open the installed Spacekeeper.exe directly, without a command window.
- MIT-licensed source code; Node and NSIS notices are included separately.

Download **Spacekeeper-Setup-1.0.0-x64.exe** and follow the setup wizard. Quit an
existing Spacekeeper session before updating its installation folder.

Folder sizes are logical bytes, not guaranteed reclaimable space. Recycling
does not normally increase free space until the user empties the Recycle Bin.
Protection is conservative and cannot identify every important personal file.
The release is unsigned; real UAC elevation and all-user installation still
require testing in their corresponding environments.
