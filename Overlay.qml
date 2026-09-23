pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland

Item {
    id: root
    property var shell: null
    property var manifest: null
    property bool opened: false
    property bool closing: false
    property int startupSerial: 0
    property var service: null
    property var targetScreen: null
    property bool settingsMode: false
    property bool pendingGreeting: false
    function greetOnOpen() {
        if (opened && !settingsMode && pendingGreeting && service && service.keyConfigured) {
            pendingGreeting = false
            // Prefer one-shot restart restoration greeting when context exists.
            service.restoreWelcome()
        }
    }
    onOpenedChanged: syncPresentation()
    onSettingsModeChanged: { if (settingsMode) pendingGreeting = false; syncPresentation() }
    function syncPresentation() { if (service) { service.panelOpened = opened && !closing; service.presentation(opened && !settingsMode && !closing) } }
    function resolveService() {
        service = shell ? shell.serviceFor("io.github.komagata.oma") : null
        if (service && !service.keyConfigured) { settingsMode = true }
        if (opened) {
            syncPresentation()
            greetOnOpen()
        }
    }
    function open(payloadJson) {
        const wasOpen = opened && !closing
        if (closing) { fadeOut.stop(); closing = false; keyboardRoot.opacity = 1 }
        let payload = ({})
        try { payload = JSON.parse(String(payloadJson || "{}").slice(0,16384)) || ({}) } catch (e) {}
        pendingGreeting = !wasOpen && payload.greet === true && payload.settings !== true
        settingsMode = payload.settings === true
        resolveService()
        const monitor = Hyprland.focusedMonitor
        targetScreen = Quickshell.screens.find(s => monitor && s.name === monitor.name) || Quickshell.screens[0]
        opened = true
        if (!wasOpen) startupSerial++
        if (!wasOpen && service && payload.silent !== true) service.opening()
        syncPresentation()
        greetOnOpen()
        Qt.callLater(function() { keyboardRoot.forceActiveFocus() })
    }
    function close() {
        if (!opened || closing) return
        pendingGreeting = false
        closing = true
        syncPresentation()
        if (service) { service.stop(); if (!settingsMode) service.closingCue() }
        fadeIn.stop()
        fadeOut.restart()
    }
    Connections {
        target: root.service
        function onDismissRequested() { root.close() }
        function onKeyConfiguredChanged() {
            if (root.opened && !root.service.keyConfigured) { root.settingsMode = true }
        }
    }
    Timer { interval: 500; repeat: true; running: root.opened && !root.service; onTriggered: root.resolveService() }
    PanelWindow {
        id: window
        screen: root.targetScreen
        visible: root.opened && !(root.service && root.service.computerUsing)
        onVisibleChanged: { if (visible) fadeIn.restart(); else { fadeIn.stop(); keyboardRoot.opacity = 0 } }
        // Bounded floating surface; no fullscreen scrim or desktop input grab.
        implicitWidth: Math.min(832, screen ? screen.width - 48 : 832)
        implicitHeight: Math.min(912, screen ? screen.height - 64 : 912)
        color: "transparent"
        WlrLayershell.namespace: "io-github-komagata-oma"
        WlrLayershell.layer: WlrLayer.Top
        WlrLayershell.keyboardFocus: window.visible && !root.closing ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.None
        exclusionMode: ExclusionMode.Ignore
        Item {
            id: keyboardRoot
            Keys.onEscapePressed: root.close()
            anchors.fill: parent
            anchors.margins: 56
            opacity: 0
            NumberAnimation on opacity { id: fadeIn; from: 0; to: 1; duration: 420; easing.type: Easing.InOutQuad; running: false }
            NumberAnimation {
                id: fadeOut
                target: keyboardRoot
                property: "opacity"
                to: 0
                duration: 1230
                easing.type: Easing.InOutQuad
                onFinished: { root.opened = false; root.closing = false }
            }
            Conversation {
                anchors.fill: parent; visible: !root.settingsMode
                service: root.service; opened: root.opened && visible
                startupSerial: root.startupSerial
                shuttingDown: root.closing
                onDismiss: root.close()
                onSettingsRequested: root.settingsMode = true
            }
            Settings {
                anchors.fill: parent; visible: root.settingsMode
                service: root.service; opened: root.opened && visible
                onDismiss: root.close()
                onBack: root.settingsMode = false
            }
        }
    }
}
