; Windows installer for the Master Edit Suite After Effects panel.
; Built by scripts/build-installer.mjs (needs NSIS 3: makensis), which passes
; VERSION, SRC (the built dist/cep folder) and OUTFILE.
;
; Per-user install: no administrator rights. It copies the panel into the user's
; CEP extensions folder, enables PlayerDebugMode so After Effects loads this
; unsigned extension, and registers an uninstaller in Installed apps.

Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifndef VERSION
  !error "Pass -DVERSION=x.y.z"
!endif
!ifndef SRC
  !error "Pass -DSRC=path/to/dist/cep"
!endif
!ifndef OUTFILE
  !define OUTFILE "MasterEditSuite-Setup-${VERSION}.exe"
!endif

!define APP_NAME "Master Edit Suite"
!define EXT_ID "com.mastereditsuite.panel"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MasterEditSuite"

Name "${APP_NAME} ${VERSION}"
OutFile "${OUTFILE}"
InstallDir "$APPDATA\Adobe\CEP\extensions\${EXT_ID}"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${APP_NAME} panel for Adobe After Effects"
VIAddVersionKey "LegalCopyright" "Internal build"

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install ${APP_NAME} ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "This installs the ${APP_NAME} panel for Adobe After Effects 2024 or later.$\r$\n$\r$\nClose After Effects before you continue.$\r$\n$\r$\nNo administrator rights are needed: the panel is installed for your Windows user only."
!define MUI_FINISHPAGE_TITLE "${APP_NAME} is installed"
!define MUI_FINISHPAGE_TEXT "Start After Effects and open Window > Extensions > ${APP_NAME}.$\r$\n$\r$\nRender and convert needs ffmpeg: set its path in the panel's Settings, put ffmpeg.exe in the panel's bin folder, or have it on your PATH."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ; After Effects keeps the old panel files open; ask the user to close it first.
  retry:
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq AfterFX.exe" /NH | find /I "AfterFX.exe"'
  Pop $0
  ${If} $0 == 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "After Effects is running. Close it, then click Retry." IDRETRY retry
    Abort
  ${EndIf}
FunctionEnd

Section "Panel" SecPanel
  SectionIn RO

  ; Replace an earlier version, keeping a user-supplied bin\ffmpeg.exe.
  RMDir /r "$INSTDIR\assets"
  RMDir /r "$INSTDIR\jsx"
  RMDir /r "$INSTDIR\CSXS"
  Delete "$INSTDIR\index.html"
  Delete "$INSTDIR\.debug"

  SetOutPath "$INSTDIR"
  File /r /x "*.map" "${SRC}\*.*"

  ; After Effects 2024 uses CSXS 11, 2025 and later CSXS 12.
  WriteRegStr HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode" "1"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME} (After Effects panel)"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  ; Settings and logs in %APPDATA%\MasterEditSuite are kept, and PlayerDebugMode
  ; stays on because other unsigned extensions may rely on it.
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
SectionEnd
