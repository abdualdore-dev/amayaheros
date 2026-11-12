Unicode true
!include "MUI2.nsh"
!define APP "Amaya Heroes"
!define VER "1.0.0"
Name "${APP}"
OutFile "dist/AmayaHeroes-Setup-${VER}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "${APP} ${VER}"
VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "${APP} Setup"
VIAddVersionKey "CompanyName" "Amaya"
VIAddVersionKey "FileVersion" "${VER}"
VIAddVersionKey "ProductVersion" "${VER}"
VIAddVersionKey "LegalCopyright" "Amaya"
!define MUI_ICON "build/icon.ico"
!define MUI_UNICON "build/icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP}.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open ${APP}"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section "Install"
  nsExec::Exec 'taskkill /F /IM "${APP}.exe"'
  Sleep 600
  SetOutPath "$INSTDIR"
  File /r "dist/win-unpacked/*.*"
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\${APP}.exe"
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortcut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\${APP}.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AmayaHeroes" "DisplayName" "${APP}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AmayaHeroes" "DisplayVersion" "${VER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AmayaHeroes" "Publisher" "Amaya"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AmayaHeroes" "DisplayIcon" "$INSTDIR\${APP}.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AmayaHeroes" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AmayaHeroes" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AmayaHeroes" "NoRepair" 1
SectionEnd
Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${APP}.exe"'
  Sleep 600
  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AmayaHeroes"
SectionEnd
