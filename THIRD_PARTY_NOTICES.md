# Third-party notices

Spacekeeper's own source code and original artwork are licensed under the
[MIT License](LICENSE). That license does not replace the licenses of the
following third-party components.

- **Node.js v26.2.0, Windows x64:** bundled inside the Windows installer.
  Node.js and its dependencies retain their original notices in
  [licenses/NODE-LICENSE.txt](licenses/NODE-LICENSE.txt), also supplied with the
  bundled runtime. Node binaries are excluded from the source repository.
- **NSIS 3.13:** used to generate the installer and uninstaller. Its notices are
  in [licenses/NSIS-LICENSE.txt](licenses/NSIS-LICENSE.txt). The compiler is a
  build dependency and is excluded from the source repository.
- **Windows, Windows PowerShell, .NET Framework and the user's browser:**
  provided separately by the operating system or their respective vendors;
  they are not distributed as part of Spacekeeper's source.

No external npm dependencies, remote fonts, analytics scripts or third-party
icon packages are included. The folder, space-map and leaf artwork is original
to this project.

When changing the bundled Node version, include the LICENSE from that exact
official distribution and update these notices.
