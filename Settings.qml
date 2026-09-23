pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
Item {
    id: root
    property var service: null
    property color accentColor: service && service.accentColor !== undefined ? service.accentColor : "#cacccc"
    OmaPalette { id: ink; accent: root.accentColor }
    property bool opened: false
    signal dismiss()
    signal back()
    onOpenedChanged: { keyInput.clear(); if (opened) keyInput.forceActiveFocus() }
    Keys.onEscapePressed: dismiss()
    PanelBackdrop { tint: ink.surface; anchors.fill: parent; anchors.margins: -56 }
    Column {
        anchors.centerIn: parent; width: Math.min(520, parent.width - 64); spacing: 24
        Text { text: root.service && root.service.keyConfigured ? "O.M.A. / SETTINGS" : "WELCOME TO O.M.A."; color: ink.accent; font.pixelSize: 20; font.letterSpacing: 3 }
        Text { text: root.service && root.service.keyConfigured ? "OPENAI API KEY" : "ADD YOUR API KEY TO BEGIN"; color: ink.text; font.pixelSize: 13; font.letterSpacing: 2 }
        Text { width: parent.width; text: root.service && root.service.keyConfigured ? "A key is configured. Enter a new key to replace it for O.M.A." : "O.M.A. needs your OpenAI API key before it can speak or operate your PC. Paste your key below to get started."; textFormat: Text.PlainText; color: ink.text; wrapMode: Text.Wrap; font.pixelSize: 16 }
        TextField {
            id: keyInput; objectName: "apiKeyInput"; width: parent.width; height: 48
            echoMode: TextInput.Password; placeholderText: "sk-…"
            selectByMouse: true; color: ink.text; font.pixelSize: 16
            inputMethodHints: Qt.ImhHiddenText | Qt.ImhSensitiveData | Qt.ImhNoPredictiveText
            enabled: !root.service || !root.service.keySaving
            background: Rectangle { color: ink.field; border.color: keyInput.activeFocus ? ink.muted : ink.border }
        }
        Text { width: parent.width; text: "Your key is stored securely in gopass. OpenAI API usage is billed to your OpenAI account."; color: ink.secondary; wrapMode: Text.Wrap; font.pixelSize: 13 }
        Text {
            text: "GET AN OPENAI API KEY ↗"; color: ink.accent; font.pixelSize: 14
            MouseArea { anchors.fill: parent; anchors.margins: -8; onClicked: Qt.openUrlExternally("https://platform.openai.com/api-keys") }
        }
        Text { width: parent.width; visible: text.length > 0; text: root.service ? root.service.keyError || (root.service.keySaved ? "Key saved. O.M.A. is ready." : "") : ""; textFormat: Text.PlainText; color: ink.text; wrapMode: Text.Wrap; font.pixelSize: 14 }
        CheckBox {
            id: wakeSwitch; visible: root.service && root.service.keyConfigured; height: 32; text: "VOICE WAKE · HEY O.M.A."
            checked: root.service ? root.service.wakeEnabled : false
            onClicked: if (root.service) root.service.setWake(checked)
            indicator: Rectangle {
                width: 22; height: 22; y: (parent.height - height) / 2
                color: ink.field; border.color: ink.muted
                Rectangle { anchors.centerIn: parent; width: 12; height: 12; color: ink.accent; visible: wakeSwitch.checked }
            }
            contentItem: Text { text: wakeSwitch.text; color: ink.text; font.pixelSize: 14; leftPadding: 30; verticalAlignment: Text.AlignVCenter }
        }
        Text { width: parent.width; visible: wakeSwitch.visible; text: root.service ? root.service.wakeStatus : ""; textFormat: Text.PlainText; color: ink.secondary; font.pixelSize: 13; wrapMode: Text.Wrap }
        Text { width: parent.width; visible: wakeSwitch.visible; text: "Wake detection stays on this PC. Pauses while other apps use the microphone, during speech, when muted, or when locked."; color: ink.secondary; font.pixelSize: 13; wrapMode: Text.Wrap }
        Row {
            spacing: 24
            Button {
                id: saveButton
                text: root.service && root.service.keySaving ? "SAVING…" : "SAVE KEY"
                enabled: root.service && !root.service.keySaving && keyInput.text.trim().length > 0
                onClicked: { root.service.saveKey(keyInput.text); keyInput.clear() }
                background: Rectangle { color: ink.selected; border.color: ink.muted }
                contentItem: Text { text: saveButton.text; color: ink.text; font.pixelSize: 14; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
            }
            Button {
                id: backButton
                text: root.service && root.service.keySaved ? "START O.M.A." : "BACK"; visible: root.service && root.service.keyConfigured; onClicked: { keyInput.clear(); root.back() }
                background: Rectangle { color: ink.field; border.color: ink.border }
                contentItem: Text { text: backButton.text; color: ink.secondary; font.pixelSize: 14; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
            }
        }
    }
}
