import QtQuick
import QtQuick.Window
import ".." as Oma
Window {
    id: window
    width: 832; height: 760; visible: true; color: "#080d09"
    title: "O.M.A. setup preview — fictional data"
    QtObject {
        id: fixture
        property color accentColor: "#91ff70"
        property bool setupRequired: true
        property string setupMessage: "Missing: Node.js 24+, Codex CLI, PipeWire recording, Keyboard control"
        property bool keyConfigured: false
        property bool keySaving: false
        property bool keySaved: false
        property string keyError: ""
        property bool wakeEnabled: false
        property string wakeStatus: ""
        function setup() {}
        function checkSetup() {}
    }
    Oma.Settings { id: panel; anchors.fill: parent; service: fixture }
    Timer {
        interval: 600; running: Qt.application.arguments.indexOf("--capture") >= 0
        onTriggered: panel.grabToImage(function(result) {
            result.saveToFile(Qt.resolvedUrl("../artifacts/setup-preview.png").toString().replace("file://", ""))
            Qt.quit()
        })
    }
}
