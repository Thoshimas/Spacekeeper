param([string]$Output)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourceRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$version=(Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json).version
if(-not $Output){$Output=Join-Path (Split-Path -Parent $sourceRoot) ('Spacekeeper-source-v'+$version+'.zip')}
$Output=[IO.Path]::GetFullPath($Output)
if(Test-Path -LiteralPath $Output){throw 'Output already exists. Choose another output name.'}
$allowed=@('.gitignore','assets','branding','installer','Build-Native.ps1','Build-Installer.ps1','Start.cmd','Start-English.cmd','Launch.ps1','Package.ps1','README.md','README.zh-Hant.md','BUILDING.md','LICENSE','THIRD_PARTY_NOTICES.md','licenses','RELEASE_NOTES.md','VERIFICATION.md','package.json','server.mjs','lib','native\FastScanner.cs','native\ShellOperations.cs','native\bridge.ps1','public','tests')
$stream=[IO.File]::Open($Output,[IO.FileMode]::CreateNew)
$archive=New-Object IO.Compression.ZipArchive($stream,[IO.Compression.ZipArchiveMode]::Create)
try {
  foreach($relative in $allowed){
    $item=Get-Item -LiteralPath (Join-Path $sourceRoot $relative)
    $files=if($item.PSIsContainer){@(Get-ChildItem -LiteralPath $item.FullName -File -Recurse)}else{@($item)}
    foreach($file in $files){
      $resolved=[IO.Path]::GetFullPath($file.FullName)
      if(-not $resolved.StartsWith($sourceRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Package path escaped source root.'}
      if(($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Reparse points are not packaged.'}
      $entry='Spacekeeper/'+$resolved.Substring($sourceRoot.Length+1).Replace('\','/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$resolved,$entry,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  }
} finally {$archive.Dispose();$stream.Dispose()}
Get-Item -LiteralPath $Output | Select-Object FullName,Length
