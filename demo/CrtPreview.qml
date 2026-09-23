import QtQuick
import QtQuick.Window
import ".." as Oma
Window {
 id: preview
 width: 1050; height: 350; visible: true; color: "#030a03"
 Row {
  anchors.centerIn: parent; spacing: 65
  Repeater {
   model: [.10,.32,.60,1]
   Column {
    required property real modelData
    spacing: 20
    Oma.Face { id: portrait; width: 187; height: 240; active: false
     Timer { interval: 100; running: true; onTriggered: portrait.bootProgress = portrait.parent.modelData }
    }
    Text { anchors.horizontalCenter: parent.horizontalCenter; color: "#98a592"; text: Math.round(parent.modelData*1230)+" ms" }
   }
  }
 }
 Timer { interval: 1000; running: true; onTriggered: preview.contentItem.grabToImage(function(r){r.saveToFile(Qt.resolvedUrl('../artifacts/crt-startup.png').toString().replace('file://',''));Qt.quit()}) }
}
