import QtQuick
import qs.Commons
import qs.Ui as Ui

Ui.BarWidget {
    id: root
    moduleName: "io.github.komagata.oma"
    readonly property var shell: root.bar ? root.bar.shell : null
    property var service: null
    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight
    Timer { interval: 1000; running: true; repeat: true; triggeredOnStart: true; onTriggered: root.service = root.shell ? root.shell.serviceFor(root.moduleName) : null }
    Ui.WidgetButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: "󰧑"
        tooltipText: root.service && !root.service.keyConfigured ? "O.M.A. · Add your OpenAI API key to begin" : "O.M.A. · F8 to open · Right-click for Settings"
        onPressed: function(mouseButton) { if (mouseButton === Qt.RightButton && root.service) root.service.settings(); else if (mouseButton === Qt.LeftButton && root.shell) root.shell.toggle(root.moduleName, JSON.stringify({greet: true})) }
    }
}
