import QtQuick
import QtQuick.Controls
import ".."
ApplicationWindow {
    id: win
    width: 900; height: 950; visible: true; color: "#030803"
    title: "O.M.A. setup preview"
    QtObject { id: fake; property bool wakeEnabled: false; property string wakeStatus: "Voice wake is off"; function setWake(enabled) {}
        property bool keyConfigured: false; property bool keySaving: false; property bool keySaved: false; property string keyError: ""; function saveKey(key) { keyError = "Preview only — no key was saved." } }
    Settings { id: settings; anchors.fill: parent; anchors.margins: 70; service: fake; opened: true }
    Timer { interval: 800; running: true; onTriggered: settings.grabToImage(function(result) { result.saveToFile(Qt.resolvedUrl("../artifacts/settings-preview.png").toString().replace("file://", "")); Qt.quit() }) }
}
