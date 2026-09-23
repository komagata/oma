import QtQuick
import QtQuick.Controls
ApplicationWindow {
    width: 600; height: 400; minimumWidth: 600; maximumWidth: 600; minimumHeight: 400; maximumHeight: 400; visible: true
    title: "O.M.A. computer test"
    color: "#102018"
    Component.onCompleted: console.warn("FIXTURE_READY")
    onActiveChanged: console.warn("FIXTURE_ACTIVE=" + active)
    Column {
        anchors.centerIn: parent; spacing: 24
        Text { text: "O.M.A. COMPUTER TEST"; color: "#88cc88"; font.pixelSize: 24 }
        TextField { id: entry; onActiveFocusChanged: console.warn("FIELD_FOCUS=" + activeFocus); width: 420; placeholderText: "Type here"; onTextChanged: console.warn("FIXTURE_TEXT=" + text) }
        Button { text: "VERIFY"; onClicked: { result.text = "VERIFIED: " + entry.text; console.warn("FIXTURE_RESULT=" + entry.text) } }
        Text { id: result; text: "Waiting"; color: "#88cc88"; font.pixelSize: 20 }
    }
}
