param([Parameter(Mandatory=$true)][string]$NodePath,[switch]$NoOpen,[ValidateSet('zh-Hant','en')][string]$Language='en')
$ErrorActionPreference='Stop'
try {
  $version=& $NodePath -p 'Number(process.versions.node.split(String.fromCharCode(46))[0])'
  if([int]$version -lt 22) { throw 'Node.js 22 or newer is required.' }
  $arguments='"'+(Join-Path $PSScriptRoot 'server.mjs')+'"'
  $arguments+=' --language '+$Language
  if($NoOpen){$arguments+=' --no-open'}
  $diagnostics=Join-Path $PSScriptRoot '.runtime'
  New-Item -ItemType Directory -Path $diagnostics -Force | Out-Null
  $instance=[Guid]::NewGuid().ToString('N')
  $outFile=Join-Path $diagnostics ($instance+'.out.log')
  $errFile=Join-Path $diagnostics ($instance+'.err.log')
  $launched=Start-Process -FilePath $NodePath -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
  if($launched.WaitForExit(1500)) {
    $message=Get-Content -LiteralPath $errFile -Raw -ErrorAction SilentlyContinue
    throw ('Spacekeeper could not start. '+$message)
  }
  Write-Output ('Spacekeeper PID: '+$launched.Id)
  Write-Output ('Startup log: '+$outFile)
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
