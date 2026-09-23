import QtQuick
import QtQuick.Window
import ".." as Oma

Window {
    id: preview
    width: 1200; height: 1000; visible: true
    title: "O.M.A. — fictional UI preview"
    property int frame: 0
    property bool capturing: false
    Item {
        id: scene
        anchors.fill: parent
        Rectangle { anchors.fill: parent; color: "#080d09" }
        // A fictional desktop makes transparency visible without capturing private apps.
        Rectangle { x: 36; y: 80; width: 290; height: 620; color: "#101911"; border.color: "#1d2a20"; radius: 8
            Text { x: 20; y: 20; text: "WORKSPACE"; color: "#47634d"; font.pixelSize: 12; font.letterSpacing: 2 }
            Repeater { model: 12; Rectangle { required property int index; x: 20; y: 68+index*35; width: 130+(index%3)*35; height: 5; color: "#1a2a1d"; radius: 2 } }
        }
        Rectangle { x: 780; y: 155; width: 280; height: 480; color: "#101911"; border.color: "#1d2a20"; radius: 8 }
        // Deliberately bright wallpaper motif tests local contrast protection.
        Rectangle {
            anchors.centerIn: parent; width: 340; height: 340
            color: "transparent"; border.width: 22; border.color: "#baff91"
        }
        QtObject {
            id: fixture
            property color accentColor: "#91ff70"
            property bool listeningReady: true
            property real inputLevel: 0
            property bool cameraActive: false
            property string state: "speaking"
            property string userText: Qt.application.arguments.indexOf("--welcome")>=0 ? "" : "What can you help me with?"
            property string assistantText: Qt.application.arguments.indexOf("--long")>=0 ? "I can help you search for information, open websites, and work on files.\nYour conversation stays available between sessions.\nOlder exchanges are summarized to keep the context manageable.\nExact links are stored separately so they remain usable.\nPress F8 to open the assistant.\nSpeak to interrupt a reply automatically.\nI will stop speaking and listen to your next request.\nThis final line should remain completely visible." : Qt.application.arguments.indexOf("--welcome")>=0 ? "Awaiting your command." : "I can answer questions, find information,\nand help you with your work."
            property string error: ""
            property string taskStatus: ""
            property var approval: null
            property var question: null
            property real tick: 0
            property real level: Math.max(0, Math.sin(tick*8)*.4+.15)
            property real lipRound: Math.max(0, Math.sin(tick*2))*.5
            property real lipWide: Math.max(0, Math.cos(tick*3))*.25
        }
        Timer { interval: 40; repeat: true; running: true; onTriggered: fixture.tick += .04 }
        Oma.Conversation { width: 720; height: 800; anchors.centerIn: parent; service: fixture; onDismiss: Qt.quit() }
    }
    // --capture produces a deterministic, fictional still without an API call.
    Timer {
        interval: Qt.application.arguments.indexOf("--long")>=0 ? 18000 : 3500; running: Qt.application.arguments.indexOf("--capture")>=0
        onTriggered: scene.grabToImage(function(r) { r.saveToFile(Qt.resolvedUrl("../artifacts/panel-preview.png").toString().replace("file://", "")); Qt.quit() })
    }
    Timer {
        interval: 40; repeat: true; running: Qt.application.arguments.indexOf("--record")>=0
        onTriggered: {
            if (preview.capturing) return
            preview.capturing = true
            scene.grabToImage(function(r) {
                r.saveToFile(Qt.resolvedUrl("../artifacts/frames/" + String(preview.frame).padStart(4,"0") + ".png").toString().replace("file://", ""))
                preview.capturing = false
                if (++preview.frame >= 150) Qt.quit()
            })
        }
    }
}
