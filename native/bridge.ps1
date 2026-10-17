param([string]$Action,[string]$Payload)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
try {
  $data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
  $result=@{ok=$true}
  switch($Action) {
    'compileScan' {
      Add-Type -Path (Join-Path $PSScriptRoot 'FastScanner.cs') -OutputAssembly $data.output -OutputType ConsoleApplication -ReferencedAssemblies 'System.dll','System.Core.dll'
    }
    'info' {
      $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
      $principal=New-Object Security.Principal.WindowsPrincipal($identity)
      $result.admin=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
      $result.drives=@([IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady -and $_.DriveType -ne 'Network' -and $_.DriveType -ne 'CDRom' } | ForEach-Object { @{path=$_.Name; label=$_.VolumeLabel; total=$_.TotalSize; free=$_.AvailableFreeSpace; type=$_.DriveType.ToString()} })
      $result.installs=@(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | ForEach-Object {
        try {
          $location=[Environment]::ExpandEnvironmentVariables(([string]$_.InstallLocation).Trim().Trim('"'))
          if($location -match '^[a-zA-Z]:[\\/]' -and [IO.Directory]::Exists($location)) { [IO.Path]::GetFullPath($location) }
        } catch { }
      } | Select-Object -Unique)
    }
    'pick' {
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $dialog=New-Object System.Windows.Forms.FolderBrowserDialog
      $owner=New-Object System.Windows.Forms.Form
      try {
        # The helper has no visible app window. Give the modal picker a live,
        # topmost owner so it opens above the browser, including hidden launches.
        $owner.Text='Spacekeeper'
        $owner.ShowInTaskbar=$false
        $owner.FormBorderStyle=[Windows.Forms.FormBorderStyle]::None
        $owner.StartPosition=[Windows.Forms.FormStartPosition]::CenterScreen
        $owner.Size=New-Object Drawing.Size(1,1)
        $owner.Opacity=0
        $owner.TopMost=$true
        $owner.Show()
        $owner.Activate()
        $dialog.Description=if($data.language -eq 'zh-Hant'){'Spacekeeper - 選擇資料夾'}else{'Spacekeeper - Select folder'}
        $dialog.ShowNewFolderButton=$false
        if($data.path -and [IO.Directory]::Exists($data.path)) { $dialog.SelectedPath=$data.path }
        $result.path=if($dialog.ShowDialog($owner) -eq [Windows.Forms.DialogResult]::OK){$dialog.SelectedPath}else{$null}
      } finally {
        $dialog.Dispose()
        $owner.Dispose()
      }
    }
    'inspect' {
      Add-Type -Path (Join-Path $PSScriptRoot 'ShellOperations.cs')
      [Spacekeeper.ShellOperations]::CheckTree($data.path)
    }
    'operate' {
      Add-Type -Path (Join-Path $PSScriptRoot 'ShellOperations.cs')
      [Spacekeeper.ShellOperations]::Run($data.action,$data.path,$data.destination,$data.name)
    }
    'elevate' {
      # Each argument is quoted as a Windows argv value, never evaluated as code.
      $nodeArgs='"'+$data.script+'"'
      if($data.language -eq 'en'){$nodeArgs+=' --language en'}
      if($data.root) {
        $rootArg=$data.root.TrimEnd('\')
        if($rootArg -match '^[A-Za-z]:$') { $rootArg+='\\' }
        $nodeArgs+=' --root "'+$rootArg+'"'
      }
      Start-Process -FilePath $data.node -ArgumentList $nodeArgs -Verb RunAs -WindowStyle Hidden | Out-Null
    }
    'open' { Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList ('"'+$data.path+'"') | Out-Null }
    'recyclebin' { Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList 'shell:RecycleBinFolder' | Out-Null }
    'settings' { Start-Process 'ms-settings:storagesense' | Out-Null }
    'browser' { Start-Process $data.url | Out-Null }
    default { throw 'Unknown bridge action' }
  }
  $result | ConvertTo-Json -Depth 8 -Compress
} catch {
  @{ok=$false; error=$_.Exception.Message; code=$_.Exception.HResult} | ConvertTo-Json -Compress
}
