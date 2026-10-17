param([string]$NsisPath,[string]$Output)
$ErrorActionPreference='Stop'
$appRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$version=(Get-Content -LiteralPath (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json).version
if(-not $NsisPath){
  $command=Get-Command makensis.exe -ErrorAction SilentlyContinue
  if($command){$NsisPath=$command.Source}
}
if(-not $NsisPath -or -not (Test-Path -LiteralPath $NsisPath)){throw 'Pass -NsisPath pointing to the official NSIS 3.13 compiler.'}
if(-not $Output){$Output=Join-Path (Split-Path -Parent $appRoot) ('Spacekeeper-Setup-'+$version+'-x64.exe')}
$Output=[IO.Path]::GetFullPath($Output)
if(Test-Path -LiteralPath $Output){throw 'Output already exists. Choose a new output path.'}
$buildRoot=Join-Path $appRoot ('.runtime\installer-build\'+[Guid]::NewGuid().ToString('N'))
$payload=Join-Path $buildRoot 'payload'
New-Item -ItemType Directory -Path $payload -Force | Out-Null
foreach($required in @('runtime\node.exe','runtime\NODE-LICENSE.txt')){
  if(-not(Test-Path -LiteralPath (Join-Path $appRoot $required))){throw "Missing $required. See BUILDING.md for the bundled runtime setup."}
}
& (Join-Path $appRoot 'Build-Native.ps1') | Out-Null
$assets=Join-Path $appRoot 'assets'
$allowed=@('Spacekeeper.exe','server.mjs','package.json','lib','native','public','runtime','assets','README.md','README.zh-Hant.md','LICENSE','THIRD_PARTY_NOTICES.md','licenses','RELEASE_NOTES.md','VERIFICATION.md')
foreach($relative in $allowed){Copy-Item -LiteralPath (Join-Path $appRoot $relative) -Destination $payload -Recurse -Force}
$licenses=Join-Path $payload 'licenses'
New-Item -ItemType Directory -Path $licenses -Force | Out-Null
Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $NsisPath) 'COPYING') -Destination (Join-Path $licenses 'NSIS-LICENSE.txt')
$files=@(Get-ChildItem -LiteralPath $payload -File -Recurse | Sort-Object FullName)
$manifest=@();$install=@();$uninstall=@();$folders=@()
foreach($file in $files){
  $full=[IO.Path]::GetFullPath($file.FullName)
  if(-not $full.StartsWith($payload+'\',[StringComparison]::OrdinalIgnoreCase) -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe payload path.'}
  $relative=$full.Substring($payload.Length+1)
  $folder=Split-Path -Parent $relative
  $target=if($folder){'$INSTDIR\'+$folder}else{'$INSTDIR'}
  $install+='SetOutPath "'+$target+'"'
  $install+='File "'+$full+'"'
  $uninstall+='Delete "$INSTDIR\'+$relative+'"'
  if($folder){$folders+=$folder}
  $manifest+=[ordered]@{path=$relative.Replace('\','/');bytes=$file.Length;sha256=(Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()}
}
foreach($folder in @($folders | Select-Object -Unique | Sort-Object Length -Descending)){$uninstall+='RMDir "$INSTDIR\'+$folder+'"'}
[IO.File]::WriteAllLines((Join-Path $buildRoot 'install.nsh'),$install,[Text.UTF8Encoding]::new($true))
[IO.File]::WriteAllLines((Join-Path $buildRoot 'uninstall.nsh'),$uninstall,[Text.UTF8Encoding]::new($true))
[IO.File]::WriteAllText((Join-Path $buildRoot 'manifest.json'),($manifest | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
$report=[ordered]@{version=$version;payload=$payload;buildRoot=$buildRoot;output=$Output;files=$files.Count;compiler=$NsisPath}
& $NsisPath /V2 "/DVERSION=$version" "/DOUTPUT=$Output" "/DASSETS=$assets" "/DPAYLOAD=$payload" "/DINSTALL_FILES=$(Join-Path $buildRoot 'install.nsh')" "/DUNINSTALL_FILES=$(Join-Path $buildRoot 'uninstall.nsh')" (Join-Path $appRoot 'installer\Spacekeeper.nsi')
if($LASTEXITCODE){throw 'NSIS compilation failed.'}
$report.sha256=(Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $appRoot '.runtime\latest-installer-build.json'),($report | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
[pscustomobject]$report | ConvertTo-Json
