pragma ComponentBehavior: Bound
import QtQuick
import QtQml.Models
import "views"
import "components"
import QtQuick.Window
import QtQuick.Controls
import Quickshell
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
    readonly property bool docked: !!service && service.docked
    property var floatingSize: null
    property bool floatingWasMini: false
    property var pendingOpen: null
    property var pendingCompanionOpens: []
    onDockedChanged: {
        if (docked) {
            floatingSize = Qt.size(window.width, window.height)
            floatingWasMini = miniMode
        } else {
            if (!closing) restoreFloatingSize()
            if (pendingOpen !== null) {
                const payload = pendingOpen
                Qt.callLater(function() {
                    if (root.pendingOpen !== payload) return
                    root.pendingOpen = null
                    root.open(payload)
                })
            }
        }
    }
    function restoreFloatingSize() {
        if (!floatingSize) return
        // FloatingWindow retains its backing QQuickWindow across hide/show.
        // Unchanged implicit dimensions do not undo a compositor configure.
        const size = miniMode ? Qt.size(160, 200) : floatingWasMini ? Qt.size(window.implicitWidth, window.implicitHeight) : floatingSize
        const nativeWindow = window.contentItem.Window.window
        if (nativeWindow) { nativeWindow.width = size.width; nativeWindow.height = size.height }
    }
    readonly property bool miniMode: !settingsMode && !!service && service.miniMode
    property bool settingsMode: false
    property bool pendingGreeting: false
    function greetOnOpen() {
        if (opened && !settingsMode && pendingGreeting && service && service.keyConfigured) {
            pendingGreeting = false
            // Prefer one-shot restart restoration greeting when context exists.
            service.restoreWelcome()
        }
    }
    onOpenedChanged: { syncPresentation(); refreshDesktop() }
    onSettingsModeChanged: { if (settingsMode) pendingGreeting = false; syncPresentation() }
    function syncAutoCompanion() {
        if (!service) return
        service.companionPanel(opened, closing)
        service.companionVisibility(opened && !closing && window.visible)
        if (!opened || closing) pendingCompanionOpens = []
        else if (window.visible && pendingCompanionOpens.length) {
            const pending = pendingCompanionOpens
            pendingCompanionOpens = []
            for (const address of pending) service.companionOpened(address)
        }
    }
    function syncPresentation() { syncAutoCompanion(); if (service) { service.panelOpened = opened && !closing; service.presentation(opened && !settingsMode && !closing) } }
    function resolveService() {
        service = shell ? shell.serviceFor("io.github.komagata.oma") : null
        if (service && !service.keyConfigured) { settingsMode = true }
        if (opened) {
            syncPresentation()
            greetOnOpen()
        }
    }
    function open(payloadJson) {
        // Wait for hidden restoration before mapping another tiled surface.
        if (!opened && docked) { pendingOpen = payloadJson || "{}"; return }
        const wasOpen = opened && !closing
        closeDelay.stop()
        closing = false
        let payload = ({})
        try { payload = JSON.parse(String(payloadJson || "{}").slice(0,16384)) || ({}) } catch (e) {}
        pendingGreeting = !wasOpen && payload.greet === true && payload.settings !== true
        settingsMode = payload.settings === true
        resolveService()
        const monitor = Hyprland.focusedMonitor
        targetScreen = Quickshell.screens.find(s => monitor && s.name === monitor.name) || Quickshell.screens[0]
        if (!wasOpen && service) { service.userText = ""; service.assistantText = "" }
        if (!wasOpen) startupSerial++
        opened = true
        if (!wasOpen && service && payload.silent !== true) service.opening()
        syncPresentation()
        greetOnOpen()
        Qt.callLater(function() { keyboardRoot.forceActiveFocus() })
    }
    function close() {
        pendingOpen = null
        if (!opened || closing) return
        pendingGreeting = false
        closing = true
        syncPresentation()
        if (service) { service.stop(); if (!settingsMode) service.closingCue() }
        if (settingsMode || !window.visible) finishClose()
        else closeDelay.restart()
    }
    function finishClose() {
        opened = false
        if (docked) restoreFloatingSize()
        closing = false
        syncAutoCompanion()
    }
    Timer { id: closeDelay; interval: 1230; onTriggered: root.finishClose() }
    Connections {
        target: root.service
        function onDismissRequested() { root.close() }
        function onKeyConfiguredChanged() {
            if (root.opened && !root.service.keyConfigured) { root.settingsMode = true }
        }
    }
    Timer { interval: 500; repeat: true; running: root.opened && !root.service; onTriggered: root.resolveService() }
    OmaPalette { id: ink; accent: root.service ? root.service.accentColor : "#cacccc" }
    // Desktop context for the holographic map: normalized geometry of the
    // windows on O.M.A.'s monitor workspace, including O.M.A. itself.
    readonly property var contextMonitor: targetScreen ? Hyprland.monitorFor(targetScreen) : Hyprland.focusedMonitor
    property var desktopWindows: []
    property string desktopWorkspace: ""
    property real desktopAspect: 16 / 9
    function rebuildDesktop() {
        const monitor = contextMonitor, workspace = monitor ? monitor.activeWorkspace : null
        if (!monitor || !workspace || !monitor.width || !monitor.height) { desktopWindows = []; desktopWorkspace = ""; return }
        const scale = monitor.scale || 1, width = monitor.width / scale, height = monitor.height / scale
        const clamp = value => Math.max(0, Math.min(1, value))
        const windows = []
        for (const toplevel of workspace.toplevels.values) {
            const info = toplevel.lastIpcObject || {}
            const at = info.at, size = info.size
            if (!at || !size || info.hidden || info.mapped === false) continue
            const app = String(info.class || info.initialClass || "")
            // Identify self by title; other Quickshell applications remain ordinary windows.
            const isOma = /^O\.M\.A\.( Mini)?$/.test(toplevel.title)
            const x = clamp((at[0] - monitor.x) / width), y = clamp((at[1] - monitor.y) / height)
            windows.push({x: x, y: y, w: clamp((at[0] - monitor.x + size[0]) / width) - x, h: clamp((at[1] - monitor.y + size[1]) / height) - y,
                title: String(toplevel.title || app).slice(0, 80), app: isOma ? "O.M.A." : app.toLowerCase().slice(0, 40), isOma: isOma,
                history: Number(info.focusHistoryID), focused: false})
        }
        // O.M.A. usually holds focus itself, so mark the most recently focused other window.
        let recent = null
        for (const window of windows) if (!window.isOma && window.history >= 0 && (!recent || window.history < recent.history)) recent = window
        if (recent) recent.focused = true
        desktopWindows = windows
        desktopWorkspace = String(workspace.name || workspace.id)
        desktopAspect = width / height
    }
    function refreshDesktop() { if (!opened) return; Hyprland.refreshToplevels(); desktopSettle.restart() }
    // Refresh after a newly mapped toplevel joins the workspace. Metadata can
    // arrive after the settle timer, so also rebuild when its IPC object changes.
    Instantiator {
        model: root.contextMonitor && root.contextMonitor.activeWorkspace ? root.contextMonitor.activeWorkspace.toplevels : null
        delegate: Connections {
            required property var modelData
            target: modelData
            function onLastIpcObjectChanged() { if (root.opened) desktopSettle.restart() }
        }
        onObjectAdded: root.refreshDesktop()
        onObjectRemoved: root.refreshDesktop()
    }
    Timer { id: desktopSettle; interval: 150; onTriggered: root.rebuildDesktop() }
    Connections {
        target: Hyprland
        function onRawEvent(event) {
            root.companionEvent(event)
            if (["openwindow", "closewindow", "movewindow", "movewindowv2", "windowtitle", "windowtitlev2", "activewindowv2",
                 "workspace", "workspacev2", "changefloatingmode", "fullscreen", "resizewindow"].indexOf(event.name) >= 0) root.refreshDesktop()
        }
    }
    function companionEvent(event) {
        // Raw event titles/classes are never executable input. Only forward
        // the strict compositor address; eligibility is checked in runtime.
        if (event.name === "openwindow" || event.name === "closewindow") {
            const raw = String(event.data || "").split(",")[0]
            const address = raw.startsWith("0x") ? raw : "0x" + raw
            if (/^0x[0-9a-f]+$/i.test(address) && root.service) {
                if (event.name === "closewindow") {
                    pendingCompanionOpens = pendingCompanionOpens.filter(value => value !== address)
                    root.service.companionClosed(address)
                } else if (root.opened && !root.closing) {
                    if (window.visible) root.service.companionOpened(address)
                    else if (pendingCompanionOpens.indexOf(address) < 0 && pendingCompanionOpens.length < 16)
                        pendingCompanionOpens = pendingCompanionOpens.concat([address])
                }
            }
        }
    }
    onTargetScreenChanged: refreshDesktop()
    FloatingWindow {
        id: window
        screen: root.targetScreen
        visible: root.opened && !(root.service && root.service.computerUsing && !root.docked)
        title: root.miniMode ? "O.M.A. Mini" : "O.M.A."
        maximumSize: root.miniMode && !root.docked ? Qt.size(160, 200) : Qt.size(16777215, 16777215)
        minimumSize: root.docked ? Qt.size(root.miniMode ? 160 : 320, root.miniMode ? 200 : 540) : root.miniMode ? Qt.size(160, 200) : Qt.size(Math.min(600, screen ? screen.width - 48 : 600), Math.min(600, screen ? screen.height - 64 : 600))
        onVisibleChanged: { root.syncAutoCompanion(); if (visible) root.refreshDesktop(); if (!visible && root.opened && !(root.service && root.service.computerUsing)) root.close() }
        // A regular application window, managed by the compositor.
        implicitWidth: root.miniMode ? 160 : Math.min(640, screen ? screen.width - 48 : 640)
        implicitHeight: root.miniMode ? 200 : Math.min(760, screen ? screen.height - 64 : 760)
        // The surface format is fixed at creation, before a later switch to mini.
        // Reserve alpha even when the initial normal-mode background is opaque.
        surfaceFormat.opaque: false
        color: root.miniMode ? "transparent" : ink.surface
        Item {
            id: keyboardRoot
            Keys.onEscapePressed: root.close()
            anchors.fill: parent
            anchors.margins: root.miniMode ? 8 : 0
            Conversation {
                anchors.fill: parent; visible: !root.settingsMode
                service: root.service; opened: root.opened && visible
                startupSerial: root.startupSerial
                shuttingDown: root.closing
                desktopWindows: root.desktopWindows
                desktopWorkspace: root.desktopWorkspace
                desktopAspect: root.desktopAspect
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
