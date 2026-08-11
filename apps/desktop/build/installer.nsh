; Custom NSIS installer script for OpenMarch
; Registers the openmarch:// protocol handler on Windows

!macro customInstall
    ; Register openmarch:// protocol handler
    DetailPrint "Registering openmarch:// protocol handler..."

    ; Create the protocol key
    WriteRegStr HKCU "Software\Classes\openmarch" "" "URL:OpenMarch Protocol"
    WriteRegStr HKCU "Software\Classes\openmarch" "URL Protocol" ""

    ; Set the default icon
    WriteRegStr HKCU "Software\Classes\openmarch\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"

    ; Set the command to open the application
    WriteRegStr HKCU "Software\Classes\openmarch\shell" "" "open"
    WriteRegStr HKCU "Software\Classes\openmarch\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

    DetailPrint "Protocol handler registered successfully"
!macroend

!macro customUnInstall
    ; Unregister openmarch:// protocol handler
    DetailPrint "Unregistering openmarch:// protocol handler..."

    DeleteRegKey HKCU "Software\Classes\openmarch"

    DetailPrint "Protocol handler unregistered"
!macroend
