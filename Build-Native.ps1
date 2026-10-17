$ErrorActionPreference='Stop'
$appRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$version=(Get-Content -LiteralPath (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json).version
$compiler=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not(Test-Path -LiteralPath $compiler)){throw '.NET Framework C# compiler not found. Build on 64-bit Windows.'}
$buildRoot=Join-Path $appRoot ('.runtime\native-build\'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$assets=Join-Path $appRoot 'assets'
$iconBuilder=Join-Path $buildRoot 'IconBuilder.exe'
& $compiler /nologo /target:exe "/out:$iconBuilder" /reference:System.Drawing.dll (Join-Path $appRoot 'installer\IconBuilder.cs')
if($LASTEXITCODE){throw 'Icon compilation failed.'}
& $iconBuilder $assets
if($LASTEXITCODE){throw 'Icon generation failed.'}
$versionSource=Join-Path $buildRoot 'VersionInfo.cs'
$versionText=@"
using System.Reflection;
[assembly: AssemblyTitle("Spacekeeper")]
[assembly: AssemblyProduct("Spacekeeper")]
[assembly: AssemblyCompany("Spacekeeper")]
[assembly: AssemblyDescription("Local disk space manager")]
[assembly: AssemblyVersion("$version.0")]
[assembly: AssemblyFileVersion("$version.0")]
"@
[IO.File]::WriteAllText($versionSource,$versionText,[Text.UTF8Encoding]::new($false))
$exe=Join-Path $appRoot 'Spacekeeper.exe'
& $compiler /nologo /codepage:65001 /target:winexe /platform:anycpu "/out:$exe" "/win32icon:$(Join-Path $assets 'spacekeeper.ico')" "/win32manifest:$(Join-Path $appRoot 'installer\launcher.manifest')" /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll (Join-Path $appRoot 'installer\Launcher.cs') $versionSource
if($LASTEXITCODE){throw 'Launcher compilation failed.'}
$scanExe=Join-Path $appRoot 'native\FastScanner.exe'
& $compiler /nologo /target:exe /platform:anycpu /reference:System.Core.dll "/out:$scanExe" (Join-Path $appRoot 'native\FastScanner.cs')
if($LASTEXITCODE){throw 'Scanner compilation failed.'}
$manifest=[ordered]@{sourceSha256=(Get-FileHash -LiteralPath (Join-Path $appRoot 'native\FastScanner.cs') -Algorithm SHA256).Hash.ToLowerInvariant();binarySha256=(Get-FileHash -LiteralPath $scanExe -Algorithm SHA256).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $appRoot 'native\scanner-manifest.json'),($manifest | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $assets 'spacekeeper.svg') -Destination (Join-Path $appRoot 'public\favicon.svg') -Force
Write-Output "Native components built for Spacekeeper $version."
