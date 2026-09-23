import QtQuick
import QtQuick.Window
import ".." as Oma
Window {
 width: 640; height: 400; visible: true; color: "#030a03"
 Row {
  anchors.centerIn: parent; spacing: 100
  Oma.Face { width: 187; height: 240; active: false; status: "idle"; elapsed: 0 }
  Oma.Face { width: 187; height: 240; active: false; status: "idle"; elapsed: 3 }
 }
 Timer { interval: 1000; running: true; onTriggered: contentItem.grabToImage(function(r){r.saveToFile(Qt.resolvedUrl('../artifacts/idle-poses.png').toString().replace('file://',''));Qt.quit()}) }
}
