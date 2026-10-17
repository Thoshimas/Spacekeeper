param([Parameter(Mandatory=$true)][string]$Installer,[ValidateSet('en','zh-Hant')][string]$SetupLanguage='en')
$ErrorActionPreference='Stop'
function Assert([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
$appRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspace=[IO.Path]::GetFullPath((Join-Path $appRoot '..\..'))
$testRoot=Join-Path $workspace ('.spacekeeper-installer-test-'+[Guid]::NewGuid().ToString('N'))
$installDir=Join-Path $testRoot 'Spacekeeper 空間'
$normalized=$installDir.TrimEnd('\').ToLowerInvariant()
$sha=[Security.Cryptography.SHA256]::Create()
try{$id=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalized))).Replace('-','').ToLowerInvariant().Substring(0,20)}finally{$sha.Dispose()}
$dataDir=Join-Path $env:LOCALAPPDATA ('Spacekeeper\Installs\'+$id)
$reg='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Spacekeeper_'+$id
Assert (-not(Test-Path -LiteralPath $dataDir)) 'Unexpected pre-existing test data'
Assert (-not(Test-Path -LiteralPath $reg)) 'Unexpected pre-existing test registration'
New-Item -ItemType Directory -Path $testRoot | Out-Null
$exe=Join-Path $installDir 'Spacekeeper.exe'
$session=$null
function Invoke-App([string]$Arguments){
  $start=[Diagnostics.ProcessStartInfo]::new($exe,$Arguments)
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $p=[Diagnostics.Process]::Start($start)
  $output=$p.StandardOutput.ReadLineAsync();$errorOutput=$p.StandardError.ReadToEndAsync()
  # Wait for the launcher itself, rather than its persistent Node descendant.
  Assert ($p.WaitForExit(60000)) 'Launcher did not exit within 60 seconds'
  # Child processes may inherit an extra stdout handle. Read the launcher's
  # complete JSON line, not EOF, which would wait for the background service.
  if($Arguments -like '--no-open*'){Assert ($output.Wait(3000)) 'Launcher response missing'}
  $out=if($output.IsCompleted){$output.Result}else{''}
  $err=if($errorOutput.IsCompleted){$errorOutput.Result}else{''}
  return [pscustomobject]@{Exit=$p.ExitCode;Output=$out;Error=$err}
}
function Api([string]$Route,[hashtable]$Body=@{}){
  Invoke-RestMethod -Uri ($session.GetLeftPart([UriPartial]::Authority)+'/api/'+$Route) -Method Post -Headers @{'X-Space-Token'=$session.Fragment.Substring(1);'X-Space-Language'='en'} -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Compress)
}
$result=[ordered]@{}
try{
  $languageArg=if($SetupLanguage -eq 'zh-Hant'){' /LANG=zh-Hant'}else{''}
  $p=Start-Process -FilePath ([IO.Path]::GetFullPath($Installer)) -ArgumentList ('/S'+$languageArg+' /NO_SHORTCUTS /D='+$installDir) -WindowStyle Hidden -Wait -PassThru
  Assert ($p.ExitCode -eq 0) ('Installer exit '+$p.ExitCode)
  Assert (Test-Path -LiteralPath $exe) 'Launcher missing'
  Assert (Test-Path -LiteralPath (Join-Path $installDir 'native\FastScanner.exe')) 'Prebuilt scanner missing'
  Assert (Test-Path -LiteralPath $reg) 'Uninstall registration missing'
  Assert ((Get-ItemProperty -LiteralPath $reg).DisplayVersion -eq '1.0.0') 'Wrong installed registration version'
  Assert ((Get-Item -LiteralPath $exe).VersionInfo.FileVersion -eq '1.0.0.0') 'Wrong EXE file version'
  $result.customUnicodePath=$true;$result.registered=$true
  $sourceReport=Get-Content -LiteralPath (Join-Path $appRoot '.runtime\latest-installer-build.json') -Raw | ConvertFrom-Json
  $manifest=Get-Content -LiteralPath (Join-Path $sourceReport.buildRoot 'manifest.json') -Raw | ConvertFrom-Json
  foreach($f in $manifest){$installed=Join-Path $installDir $f.path;Assert ((Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash.ToLowerInvariant() -eq $f.sha256) ('Payload mismatch '+$f.path)}
  $result.payloadFilesVerified=$manifest.Count
  $a=Invoke-App '--no-open';Assert ($a.Exit -eq 0) ('Launcher failed '+$a.Error)
  $info=Get-Content -LiteralPath (Join-Path $dataDir '.runtime\service.json') -Raw | ConvertFrom-Json
  $session=[Uri]$info.url
  Assert ($session.Query -eq ('?lang='+$SetupLanguage)) 'Installer language not applied'
  $status=Api 'status';Assert ($status.version -eq '1.0.0') 'Wrong installed version'
  $result.setupLanguage=$SetupLanguage;$result.setupLanguageApplied=$true;$result.firstPid=$info.pid
  $fixture=Join-Path $testRoot 'scan-fixture';New-Item -ItemType Directory -Path (Join-Path $fixture 'Cache') -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $fixture 'Cache\test-only.txt'),'test-data',[Text.UTF8Encoding]::new($false))
  Api 'scan' @{path=$fixture} | Out-Null
  $until=[DateTime]::UtcNow.AddSeconds(20)
  do{$status=Api 'status';if($status.scan.state -ne 'scanning'){break};Start-Sleep -Milliseconds 100}while([DateTime]::UtcNow -lt $until)
  Assert ($status.scan.state -eq 'done') 'Installed scan did not finish';Assert ($status.scan.engine -eq 'native') 'Installed scanner not native';Assert ($status.scan.bytes -eq 9) 'Wrong installed scan total'
  $scanId=$status.scan.id
  $again=Invoke-App '--no-open';Assert ($again.Exit -eq 0) 'Repeat launch failed';Assert (($again.Output | ConvertFrom-Json).reused) 'Repeat launch did not reuse service'
  $after=Api 'status';Assert ($after.scan.id -eq $scanId) 'Repeat launch lost the scan';Assert ($info.pid -eq (Get-Content -LiteralPath (Join-Path $dataDir '.runtime\service.json') -Raw | ConvertFrom-Json).pid) 'Repeat launch created another service'
  $result.existingScanReused=$true;$result.nativeScanBytes=9
  Api 'language' @{language='zh-Hant'} | Out-Null
  Assert ((Get-Content -LiteralPath (Join-Path $dataDir 'preferences.json') -Raw | ConvertFrom-Json).language -eq 'zh-Hant') 'Language preference not saved'
  Assert (-not(Test-Path -LiteralPath (Join-Path $installDir '.runtime'))) 'Runtime wrote to installed program folder'
  Assert (-not(Test-Path -LiteralPath (Join-Path $installDir 'activity.jsonl'))) 'Audit wrote to installed program folder'
  $result.perUserWritableData=$true;$result.languageSaved=$true
  $stop=Invoke-App '--shutdown';Assert ($stop.Exit -eq 0) ('Shutdown failed '+$stop.Error)
  $start=Invoke-App '--no-open';Assert ($start.Exit -eq 0) 'Restart failed'
  $info=Get-Content -LiteralPath (Join-Path $dataDir '.runtime\service.json') -Raw | ConvertFrom-Json;$session=[Uri]$info.url
  Assert ($session.Query -eq '?lang=zh-Hant') 'Expected saved Traditional Chinese after restart'
  $result.languageSurvivesRestart=$true
  $keep=Join-Path $installDir 'keep-user-file.txt';[IO.File]::WriteAllText($keep,'must remain')
  $uninstaller=Join-Path $installDir 'Uninstall.exe'
  $un=Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
  $until=[DateTime]::UtcNow.AddSeconds(15)
  while((Test-Path -LiteralPath $exe)-and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100}
  Assert (-not(Test-Path -LiteralPath $exe)) 'Program files not removed'
  Assert (-not(Test-Path -LiteralPath $reg)) 'Uninstall registration remained'
  Assert ([IO.File]::ReadAllText($keep) -eq 'must remain') 'Uninstall removed unrelated user data'
  $result.uninstallPreservesOtherFiles=$true;$result.unregistered=$true
  Assert (Test-Path -LiteralPath (Join-Path $dataDir 'preferences.json')) 'Uninstall should retain preferences'
  $result.uninstallKeepsPreferences=$true
  [IO.File]::WriteAllText((Join-Path $appRoot ('.runtime\installer-verification-'+$SetupLanguage+'.json')),($result | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  [pscustomobject]$result | ConvertTo-Json
}finally{
  if(Test-Path -LiteralPath $exe){Invoke-App '--shutdown' | Out-Null}
  Assert ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($testRoot)) -eq $workspace) 'Unsafe fixture cleanup'
  Assert ([IO.Path]::GetFileName($testRoot).StartsWith('.spacekeeper-installer-test-')) 'Wrong fixture prefix'
  if(Test-Path -LiteralPath $testRoot){Remove-Item -LiteralPath $testRoot -Recurse -Force}
  $dataParent=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Spacekeeper\Installs'))
  Assert ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($dataDir)) -eq $dataParent) 'Unsafe test settings cleanup'
  Assert ([IO.Path]::GetFileName($dataDir) -match '^[a-f0-9]{20}$') 'Wrong test settings id'
  if(Test-Path -LiteralPath $dataDir){Remove-Item -LiteralPath $dataDir -Recurse -Force}
  if(Test-Path -LiteralPath $reg){Remove-Item -LiteralPath $reg -Force}
}
