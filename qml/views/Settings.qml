pragma ComponentBehavior: Bound
import QtQuick
import "../components"
import QtQuick.Controls
import qs.Ui as Ui
Item {
    id: root
    property var service: null
    property color accentColor: service && service.accentColor !== undefined ? service.accentColor : "#cacccc"
    property bool opened: false
    property bool started: false
    property bool needsSetup: service && service.setupRequired === true
    property bool modelReady: service && service.modelReady === true
    property bool speechReady: service && service.speechReady === true
    property bool ready: !needsSetup && modelReady && speechReady
    property bool busy: service && (service.setupBusy === true || service.keySaving === true || service.connectionTesting === true)
    property string step: !started && !ready ? "welcome" : needsSetup ? "device" : !modelReady || !speechReady ? "voice" : "ready"
    readonly property color primaryText: ink.mix("#ececec", ink.accent, .08)
    readonly property color secondaryText: ink.mix("#949494", ink.accent, .06)
    signal dismiss()
    signal back()
    onOpenedChanged: {
        keyInput.clear()
        if (opened) Qt.callLater(() => viewport.contentY = 0)
        if (opened && service) {
            if (service.checkSetup) service.checkSetup()
            if (service.refreshMicrophones) service.refreshMicrophones()
        }
    }
    Keys.onEscapePressed: dismiss()
    OmaPalette { id: ink; accent: root.accentColor }
    PanelBackdrop { tint: ink.surface; anchors.fill: parent }
    component Action: Ui.Button {
        focusable: true; bordered: true
        foreground: root.primaryText; accent: ink.accent
        opacity: enabled ? 1 : .35
    }
    component Copy: Text {
        width: parent.width; color: root.secondaryText; font.pixelSize: 13
        wrapMode: Text.Wrap; textFormat: Text.PlainText; lineHeight: 1.25
    }
    component Section: Column {
        property string title: ""
        width: parent.width; spacing: 12
        Text { text: parent.title; textFormat: Text.PlainText; color: root.primaryText; font.pixelSize: 14; font.weight: Font.Medium }
    }
    component Rule: Rectangle { width: parent.width; height: 1; color: ink.border; opacity: .4 }
    Flickable {
        id: viewport
        anchors.fill: parent; anchors.margins: root.width < 500 ? 12 : 28
        clip: true; contentHeight: content.height + 20
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
        Column {
            id: content
            width: Math.min(560, viewport.width - 8); anchors.horizontalCenter: parent.horizontalCenter
            spacing: 24
            Text { objectName: "setupHeading"; text: "Settings"; textFormat: Text.PlainText; color: root.primaryText; font.pixelSize: 26; font.weight: Font.DemiBold }
            Column {
                width: parent.width; spacing: 12; visible: !root.ready
                Copy { font.pixelSize: 16; color: root.primaryText; text: root.step === "welcome" ? "Get connected" : root.step === "device" ? "Prepare this computer" : "Connect to GPT-Live" }
                Copy { text: root.step === "welcome" ? "Add an API key to start talking." : root.step === "device" ? "Install the required components." : "Enter your OpenAI API key below." }
                Action { objectName: "beginSetupButton"; visible: root.step === "welcome"; text: "Get started"; onClicked: { root.started = true; if (root.service) root.service.checkSetup() } }
                Copy { visible: root.step === "device"; text: root.service ? root.service.setupMessage : "" }
                Action { objectName: "setupButton"; visible: root.step === "device"; text: root.busy ? "Opening setup…" : "Set up this computer"; enabled: !root.busy; onClicked: if (root.service) root.service.setup() }
            }
            Section {
                title: "OpenAI API key"
                visible: root.step === "voice" || root.ready
                Ui.TextField {
                    id: keyInput; objectName: "apiKeyInput"; width: parent.width; height: 44
                    enabled: !root.needsSetup && !root.busy
                    password: true; placeholderText: root.service && root.service.keyConfigured ? "*********" : "Paste your OpenAI API key"
                    foreground: root.primaryText; accent: ink.accent; selectByMouse: true
                    inputMethodHints: Qt.ImhHiddenText | Qt.ImhSensitiveData | Qt.ImhNoPredictiveText
                }
                Row {
                    spacing: 10
                    Action { objectName: "saveApiKeyButton"; text: root.service && root.service.keySaving ? "Saving…" : root.service && root.service.keyConfigured ? "Update key" : "Save key"; enabled: keyInput.enabled && keyInput.text.trim().length > 0; onClicked: { root.service.saveKey(keyInput.text); keyInput.clear() } }
                    Action { text: "Get a key ↗"; bordered: false; foreground: root.secondaryText; onClicked: Qt.openUrlExternally("https://platform.openai.com/api-keys") }
                }
            }
            Rule { visible: root.step === "voice" || root.ready }
            Section {
                title: "Audio"
                visible: root.step !== "welcome" && !root.needsSetup
                Ui.Dropdown {
                    id: microphoneSelect; objectName: "microphoneSelect"
                    width: parent.width; label: "Microphone"
                    foreground: root.primaryText; accent: ink.accent; background: ink.field
                    options: root.service ? root.service.microphones : []
                    value: root.service ? root.service.microphoneTarget : ""
                    enabled: !root.busy && !!root.service && !root.service.microphoneBusy && options.length > 0
                    onChanged: value => {
                        root.service.setMicrophone(value)
                        microphoneSelect.value = Qt.binding(() => root.service ? root.service.microphoneTarget : "")
                    }
                }
                Ui.Dropdown {
                    id: languageSelect; objectName: "languageSelect"
                    width: parent.width; label: "Spoken language"
                    foreground: root.primaryText; accent: ink.accent; background: ink.field
                    options: root.service ? root.service.responseLanguages : []
                    value: root.service ? root.service.responseLanguage : ""
                    enabled: !root.busy && !!root.service && options.length > 0
                    onChanged: value => {
                        root.service.setResponseLanguage(value)
                        languageSelect.value = Qt.binding(() => root.service ? root.service.responseLanguage : "")
                    }
                }
                Ui.Toggle { objectName: "voiceEffectsToggle"; width: parent.width; label: "Voice effects"; foreground: root.primaryText; accent: ink.accent; checked: !root.service || root.service.voiceEffectsEnabled !== false; enabled: !root.busy && !!root.service; onClicked: if (root.service) root.service.setVoiceEffects(!checked) }
                Copy { visible: text.length > 0; text: root.service ? root.service.languageError : ""; color: ink.accent }
                Row {
                    spacing: 10
                    Action { objectName: "testConnectionButton"; visible: root.ready; text: root.service && root.service.connectionTesting ? "Playing…" : "Test voice"; enabled: !root.busy; onClicked: if (root.service) root.service.testConnection() }
                    Action { text: "Refresh devices"; bordered: false; foreground: root.secondaryText; enabled: !root.busy && !!root.service && !root.service.microphoneBusy; onClicked: root.service.refreshMicrophones() }
                }
                Copy { visible: root.service && root.service.connectionTestPassed; text: "Voice test passed."; font.pixelSize: 12 }
                Copy { visible: text.length > 0; text: root.service ? root.service.microphoneError : ""; color: ink.accent }
            }
            Rule { visible: root.ready }
            Section {
                title: "Task agent"; visible: root.ready
                Ui.Dropdown {
                    id: agentSelect; objectName: "agentSelect"
                    width: parent.width; label: "Agent"
                    foreground: root.primaryText; accent: ink.accent; background: ink.field
                    options: root.service && root.service.agentOptions ? root.service.agentOptions : []
                    value: root.service ? root.service.agentBackend : "codex"
                    enabled: !root.busy && !!root.service && !root.service.taskBusy && options.length > 0
                    onChanged: value => {
                        root.service.setAgentBackend(value)
                        agentSelect.value = Qt.binding(() => root.service ? root.service.agentBackend : "codex")
                    }
                }
                Copy { text: "GPT-Live provides the voice. The selected agent handles your requests. Switching restarts the conversation session." }
                Copy {
                    objectName: "agentPermissions"; visible: !!root.service
                    text: root.service && ["codex", "claude"].includes(root.service.agentBackend)
                        ? (root.service.agentBackend === "codex" ? "Codex's built-in tools use a read-only sandbox by default. It does not constrain OMA MCP tools. " : "Claude's built-in tools use its own permissions. ")
                          + "OMA MCP can write files, run commands and control the desktop with O.M.A.'s OS permissions. Buttons answer explicit confirm_action requests; instructions require confirmation for consequential actions, but do not automatically gate every tool call."
                        : "CLI agents use their own permissions. O.M.A. approval buttons cannot approve their tool calls."
                }
                Copy { objectName: "agentNote"; text: { const options = root.service && root.service.agentOptions ? root.service.agentOptions : []; const selected = options.find(option => option.value === (root.service ? root.service.agentBackend : "codex")); return selected ? selected.note : "" } }
                Copy { objectName: "agentError"; visible: text.length > 0; text: root.service ? root.service.agentError : ""; color: ink.accent }
            }
            Rule { visible: root.ready }
            Section {
                title: "Preferences"; visible: root.ready
                Ui.Toggle { objectName: "wakeToggle"; width: parent.width; label: "Wake on ‘Hey O.M.A.’"; foreground: root.primaryText; accent: ink.accent; checked: !!(root.service && root.service.wakeEnabled); enabled: root.ready; onClicked: if (root.service) root.service.setWake(!checked) }
            }
            Copy { visible: text.length > 0; color: ink.accent; text: root.service ? (root.service.setupLaunchError || root.service.keyError || root.service.connectionTestError || "") : "" }
            Row {
                spacing: 10
                Action { objectName: "startConversationButton"; visible: root.ready && root.service && root.service.connectionTestPassed === true; text: "Start talking"; onClicked: root.back() }
                Action { visible: root.ready; text: "Done"; bordered: false; onClicked: root.back() }
            }

        }
    }
}
