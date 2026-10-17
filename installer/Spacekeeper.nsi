; -*- coding: utf-8 -*-
Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!include "WinVer.nsh"

Name "Spacekeeper"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Spacekeeper"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32
BrandingText "Spacekeeper ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Spacekeeper Setup"
VIAddVersionKey /LANG=1033 "FileDescription" "Spacekeeper Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Spacekeeper"
!define MUI_ICON "${ASSETS}\spacekeeper.ico"
!define MUI_UNICON "${ASSETS}\spacekeeper.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${ASSETS}\installer-sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${ASSETS}\installer-sidebar.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "${ASSETS}\installer-header.bmp"
!define MUI_BGCOLOR "FDFBF6"
!define MUI_ABORTWARNING
!define MUI_LANGDLL_ALLLANGUAGES
!define MUI_LANGDLL_WINDOWTITLE "Spacekeeper"
!define MUI_LANGDLL_INFO "Choose setup and app language / 選擇安裝與程式語言"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Spacekeeper.exe"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
Var Scope
Var ScopeMe
Var ScopeAll
Var DesktopCheck
Var MenuCheck
Var DesktopWanted
Var MenuWanted
Var SelectedLanguage
Var Params
Var Id
Var Admin
Var NoShortcuts
Var PreviousScope

!define MUI_WELCOMEPAGE_TEXT "$(WelcomeText)"
!insertmacro MUI_PAGE_WELCOME
Page custom ScopePage ScopeLeave
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE CheckDirectory
!insertmacro MUI_PAGE_DIRECTORY
Page custom OptionsPage OptionsLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "TradChinese"

LangString WelcomeText ${LANG_ENGLISH} "A little room to breathe.$\r$\n$\r$\nExplore disk space, review cleanup suggestions and manage your folders.$\r$\n$\r$\nChoose your installation folder, language and shortcuts. Your disk data stays on this computer.$\r$\n$\r$\nClick Next to continue."
LangString WelcomeText ${LANG_TRADCHINESE} "看清空間，留出餘裕。$\r$\n$\r$\n瀏覽磁碟占用、檢查清理建議，並管理資料夾。$\r$\n$\r$\n接下來可選擇安裝位置與捷徑；程式使用剛才選擇的語言，磁碟資料保留在本機。$\r$\n$\r$\n按「下一步」繼續。"
LangString ScopeTitle ${LANG_ENGLISH} "Who should have access?"
LangString ScopeTitle ${LANG_TRADCHINESE} "選擇安裝對象"
LangString ScopeSub ${LANG_ENGLISH} "Choose who can use Spacekeeper."
LangString ScopeSub ${LANG_TRADCHINESE} "選擇哪些使用者可以開啟 Spacekeeper。"
LangString ScopeInfo ${LANG_ENGLISH} "Installing for yourself normally needs no administrator permission. Installing for everyone requests Windows permission."
LangString ScopeInfo ${LANG_TRADCHINESE} "只為自己安裝通常不需要管理員權限；為所有使用者安裝時，Windows 會詢問授權。"
LangString OnlyMe ${LANG_ENGLISH} "Only for me (recommended)"
LangString OnlyMe ${LANG_TRADCHINESE} "只為我安裝（建議）"
LangString Everyone ${LANG_ENGLISH} "For everyone on this computer (administrator required)"
LangString Everyone ${LANG_TRADCHINESE} "為這部電腦的所有使用者安裝（需要管理員）"
LangString PermissionCanceled ${LANG_ENGLISH} "Administrator permission was not granted. Choose Only for me, or try again."
LangString PermissionCanceled ${LANG_TRADCHINESE} "尚未取得管理員授權。可選擇只為我安裝，或重新申請。"
LangString InvalidDirectory ${LANG_ENGLISH} "Choose an empty folder or an existing Spacekeeper installation. Drive roots, Windows folders, links and folders containing unrelated files are not allowed."
LangString InvalidDirectory ${LANG_TRADCHINESE} "請選擇空白資料夾，或既有的 Spacekeeper 安裝資料夾；不可選磁碟根目錄、Windows 目錄、連結，或含其他檔案的資料夾。"
LangString CloseApp ${LANG_ENGLISH} "Spacekeeper is running in this location. Quit it from the app before updating or removing it."
LangString CloseApp ${LANG_TRADCHINESE} "這個位置的 Spacekeeper 仍在執行。請先從程式內結束，再更新或移除。"
LangString OptionsTitle ${LANG_ENGLISH} "Choose your shortcuts"
LangString OptionsTitle ${LANG_TRADCHINESE} "選擇捷徑位置"
LangString OptionsSub ${LANG_ENGLISH} "Open Spacekeeper with its EXE or a shortcut."
LangString OptionsSub ${LANG_TRADCHINESE} "之後可直接點 EXE 或捷徑開啟。"
LangString DesktopText ${LANG_ENGLISH} "Create a desktop shortcut"
LangString DesktopText ${LANG_TRADCHINESE} "在桌面建立捷徑"
LangString MenuText ${LANG_ENGLISH} "Add to the Start menu"
LangString MenuText ${LANG_TRADCHINESE} "加入開始功能表"
LangString ReadyInfo ${LANG_ENGLISH} "The app uses the language selected at the beginning of setup. You can switch English / Traditional Chinese in the app."
LangString ReadyInfo ${LANG_TRADCHINESE} "程式預設使用剛才選擇的安裝語言；進入程式後仍可切換英文／繁體中文。"
LangString NeedWindows ${LANG_ENGLISH} "Spacekeeper requires 64-bit Windows 10 or later."
LangString NeedWindows ${LANG_TRADCHINESE} "Spacekeeper 需要 64 位元 Windows 10 或更新版本。"
LangString InstallFailed ${LANG_ENGLISH} "Some files could not be installed. Check permissions and free space, then run setup again."
LangString InstallFailed ${LANG_TRADCHINESE} "部分檔案無法安裝。請確認目的位置權限與可用空間，再重新執行安裝程式。"
LangString CannotStop ${LANG_ENGLISH} "Spacekeeper could not close safely. Finish the file operation and quit the app before uninstalling."
LangString CannotStop ${LANG_TRADCHINESE} "Spacekeeper 尚無法安全結束。請完成檔案操作，從程式內結束後再移除。"

Function .onInit
  StrCpy $LANGUAGE ${LANG_ENGLISH}
  StrCpy $Scope "CurrentUser"
  StrCpy $PreviousScope "CurrentUser"
  StrCpy $DesktopWanted ${BST_CHECKED}
  StrCpy $MenuWanted ${BST_CHECKED}
  StrCpy $NoShortcuts "0"
  ${GetParameters} $Params
  ClearErrors
  ${GetOptions} $Params "/LANG=" $0
  ${IfNot} ${Errors}
    ${If} $0 == "en"
      StrCpy $LANGUAGE ${LANG_ENGLISH}
    ${ElseIf} $0 == "zh-Hant"
      StrCpy $LANGUAGE ${LANG_TRADCHINESE}
    ${EndIf}
  ${Else}
    ; NSIS resolves its language table when .onInit returns. A wizard page
    ; is too late to change native captions. LangDLL preselects $LANGUAGE.
    ${IfNot} ${Silent}
      !insertmacro MUI_LANGDLL_DISPLAY
    ${EndIf}
  ${EndIf}
  ${If} $LANGUAGE == ${LANG_ENGLISH}
    StrCpy $SelectedLanguage "en"
  ${Else}
    StrCpy $SelectedLanguage "zh-Hant"
  ${EndIf}
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "$(NeedWindows)"
    Quit
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "$(NeedWindows)"
    Quit
  ${EndIf}
  System::Call 'shell32::IsUserAnAdmin() i.r0'
  StrCpy $Admin $0
  ClearErrors
  ${GetOptions} $Params "/ALLUSERS" $0
  ${IfNot} ${Errors}
    StrCpy $Scope "AllUsers"
    ${If} $Admin == 0
      ClearErrors
      ExecShell "runas" "$EXEPATH" "/ALLUSERS /LANG=$SelectedLanguage"
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONINFORMATION "$(PermissionCanceled)"
      ${EndIf}
      Quit
    ${EndIf}
    ${If} $INSTDIR == "$LOCALAPPDATA\Programs\Spacekeeper"
      StrCpy $INSTDIR "$PROGRAMFILES64\Spacekeeper"
    ${EndIf}
  ${EndIf}
  ClearErrors
  ${GetOptions} $Params "/NO_SHORTCUTS" $0
  ${IfNot} ${Errors}
    StrCpy $NoShortcuts "1"
    StrCpy $DesktopWanted ${BST_UNCHECKED}
    StrCpy $MenuWanted ${BST_UNCHECKED}
  ${EndIf}
  InitPluginsDir
  File /oname=$PLUGINSDIR\Guard.exe "${PAYLOAD}\Spacekeeper.exe"
FunctionEnd

Function ScopePage
  !insertmacro MUI_HEADER_TEXT "$(ScopeTitle)" "$(ScopeSub)"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 40u "$(ScopeInfo)"
  Pop $0
  ${NSD_CreateRadioButton} 0 58u 100% 18u "$(OnlyMe)"
  Pop $ScopeMe
  ${NSD_CreateRadioButton} 0 88u 100% 28u "$(Everyone)"
  Pop $ScopeAll
  ${If} $Scope == "AllUsers"
    ${NSD_Check} $ScopeAll
  ${Else}
    ${NSD_Check} $ScopeMe
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function ScopeLeave
  ${NSD_GetState} $ScopeAll $0
  ${If} $0 == ${BST_CHECKED}
    ${If} $Admin == 0
      ClearErrors
      ExecShell "runas" "$EXEPATH" "/ALLUSERS /LANG=$SelectedLanguage"
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONINFORMATION "$(PermissionCanceled)"
        Abort
      ${EndIf}
      Quit
    ${EndIf}
    StrCpy $Scope "AllUsers"
    ${If} $INSTDIR == "$LOCALAPPDATA\Programs\Spacekeeper"
      StrCpy $INSTDIR "$PROGRAMFILES64\Spacekeeper"
    ${EndIf}
  ${Else}
    StrCpy $Scope "CurrentUser"
    ${If} $INSTDIR == "$PROGRAMFILES64\Spacekeeper"
      StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Spacekeeper"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function CheckDirectory
  nsExec::ExecToStack '"$PLUGINSDIR\Guard.exe" --validate-install-dir "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "$(InvalidDirectory)" /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  IfFileExists "$INSTDIR\Spacekeeper.exe" 0 done
  nsExec::ExecToStack '"$INSTDIR\Spacekeeper.exe" --check-running'
  Pop $0
  Pop $1
  ${If} $0 == 0
    MessageBox MB_OK|MB_ICONINFORMATION "$(CloseApp)" /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  done:
  SetErrorLevel 0
FunctionEnd

Function OptionsPage
  !insertmacro MUI_HEADER_TEXT "$(OptionsTitle)" "$(OptionsSub)"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateCheckBox} 0 12u 100% 20u "$(DesktopText)"
  Pop $DesktopCheck
  ${NSD_SetState} $DesktopCheck $DesktopWanted
  ${NSD_CreateCheckBox} 0 46u 100% 20u "$(MenuText)"
  Pop $MenuCheck
  ${NSD_SetState} $MenuCheck $MenuWanted
  ${NSD_CreateLabel} 0 94u 100% 45u "$(ReadyInfo)"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function OptionsLeave
  ${NSD_GetState} $DesktopCheck $DesktopWanted
  ${NSD_GetState} $MenuCheck $MenuWanted
FunctionEnd

Section "Spacekeeper" Main
  Call CheckDirectory
  ${If} $Scope == "AllUsers"
    SetShellVarContext all
  ${Else}
    SetShellVarContext current
  ${EndIf}
  nsExec::ExecToStack '"$PLUGINSDIR\Guard.exe" --install-id "$INSTDIR"'
  Pop $0
  Pop $Id
  ${If} $0 != 0
    Abort
  ${EndIf}
  SetOutPath "$INSTDIR"
  SetOverwrite on
  ClearErrors
  !include "${INSTALL_FILES}"
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "$(InstallFailed)" /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  WriteINIStr "$INSTDIR\installation.ini" "Install" "Product" "Spacekeeper"
  WriteINIStr "$INSTDIR\installation.ini" "Install" "Version" "${VERSION}"
  WriteINIStr "$INSTDIR\installation.ini" "Install" "Language" "$SelectedLanguage"
  WriteINIStr "$INSTDIR\installation.ini" "Install" "Scope" "$Scope"
  WriteINIStr "$INSTDIR\installation.ini" "Install" "Id" "$Id"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spacekeeper_$Id" "DisplayName" "Spacekeeper"
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spacekeeper_$Id" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spacekeeper_$Id" "Publisher" "Spacekeeper"
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spacekeeper_$Id" "InstallLocation" "$INSTDIR"
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spacekeeper_$Id" "DisplayIcon" "$INSTDIR\Spacekeeper.exe,0"
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spacekeeper_$Id" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spacekeeper_$Id" "NoModify" 1
  WriteRegDWORD SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spacekeeper_$Id" "NoRepair" 1
  ${If} $DesktopWanted == ${BST_CHECKED}
    CreateShortcut "$DESKTOP\Spacekeeper.lnk" "$INSTDIR\Spacekeeper.exe" "" "$INSTDIR\Spacekeeper.exe" 0
  ${EndIf}
  ${If} $MenuWanted == ${BST_CHECKED}
    CreateDirectory "$SMPROGRAMS\Spacekeeper"
    CreateShortcut "$SMPROGRAMS\Spacekeeper\Spacekeeper.lnk" "$INSTDIR\Spacekeeper.exe" "" "$INSTDIR\Spacekeeper.exe" 0
    CreateShortcut "$SMPROGRAMS\Spacekeeper\Uninstall.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Spacekeeper.exe" 0
  ${EndIf}
SectionEnd

Function un.onInit
  ReadINIStr $Scope "$INSTDIR\installation.ini" "Install" "Scope"
  ReadINIStr $0 "$INSTDIR\installation.ini" "Install" "Product"
  ${If} $0 != "Spacekeeper"
    Abort
  ${EndIf}
  ReadINIStr $0 "$INSTDIR\installation.ini" "Install" "Language"
  ${If} $0 == "en"
    StrCpy $LANGUAGE ${LANG_ENGLISH}
  ${Else}
    StrCpy $LANGUAGE ${LANG_TRADCHINESE}
  ${EndIf}
  ${If} $Scope == "AllUsers"
    System::Call 'shell32::IsUserAnAdmin() i.r0'
    ${If} $0 == 0
      ClearErrors
      IfSilent silent_uninstall interactive_uninstall
      silent_uninstall:
        ExecShell "runas" "$INSTDIR\Uninstall.exe" "/S"
        Goto done_uninstall_elevate
      interactive_uninstall:
        ExecShell "runas" "$INSTDIR\Uninstall.exe"
      done_uninstall_elevate:
      Quit
    ${EndIf}
    SetShellVarContext all
  ${Else}
    SetShellVarContext current
  ${EndIf}
FunctionEnd

Section "Uninstall"
  nsExec::ExecToStack '"$INSTDIR\Spacekeeper.exe" --shutdown'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONINFORMATION "$(CannotStop)" /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  nsExec::ExecToStack '"$INSTDIR\Spacekeeper.exe" --install-id "$INSTDIR"'
  Pop $0
  Pop $Id
  ${If} $0 != 0
    Abort
  ${EndIf}
  nsExec::ExecToStack '"$INSTDIR\Spacekeeper.exe" --remove-shortcut "$DESKTOP\Spacekeeper.lnk"'
  Pop $0
  Pop $1
  nsExec::ExecToStack '"$INSTDIR\Spacekeeper.exe" --remove-shortcut "$SMPROGRAMS\Spacekeeper\Spacekeeper.lnk"'
  Pop $0
  Pop $1
  ; Only remove shortcuts if their target belongs to this installation.
  nsExec::ExecToStack '"$INSTDIR\Spacekeeper.exe" --remove-shortcut "$SMPROGRAMS\Spacekeeper\Uninstall.lnk"'
  Pop $0
  Pop $1
  RMDir "$SMPROGRAMS\Spacekeeper"
  !include "${UNINSTALL_FILES}"
  Delete "$INSTDIR\installation.ini"
  Delete "$INSTDIR\Uninstall.exe"
  DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spacekeeper_$Id"
  ; Non-recursive: any unrelated user files remain in place.
  RMDir "$INSTDIR"
SectionEnd
