pragma ComponentBehavior: Bound
import QtQuick

// Schematic of the workspace O.M.A. is aware of, projected behind the face.
// Windows use normalized monitor geometry; the most recent other app becomes the
// highlighted target while a task is running.
Item {
    id: root
    property var windows: []
    property string workspace: ""
    property real aspect: 16 / 9
    property bool targeting: false
    property color accentColor: "#cacccc"
    property color labelColor: "#808080"
    readonly property var focusedWindow: {
        for (const window of windows) if (!window.isOma && window.focused) return window
        return null
    }
    readonly property real headerHeight: 16
    readonly property real mapWidth: Math.min(width, (height - headerHeight) * aspect)
    readonly property real mapHeight: mapWidth / aspect
    readonly property real mapX: (width - mapWidth) / 2
    readonly property real mapY: headerHeight
    // Bottom-centre of the focused window, for the task link.
    readonly property point targetPoint: focusedWindow
        ? Qt.point(mapX + (focusedWindow.x + focusedWindow.w / 2) * mapWidth, mapY + (focusedWindow.y + focusedWindow.h) * mapHeight)
        : Qt.point(-1, -1)

    Text {
        objectName: "desktopContextLabel"
        x: root.mapX; y: 0
        width: root.mapWidth * .62; elide: Text.ElideRight
        text: root.windows.length
            ? "DESKTOP CONTEXT · WS " + (root.workspace || "?") + " · " + root.windows.length + (root.windows.length === 1 ? " WINDOW" : " WINDOWS")
            : "DESKTOP CONTEXT · " + (root.workspace ? "WS " + root.workspace + " · EMPTY" : "UNAVAILABLE")
        textFormat: Text.PlainText
        color: root.labelColor; font.pixelSize: 8; font.letterSpacing: 2
    }
    Text {
        objectName: "desktopTargetLabel"
        visible: !!root.focusedWindow
        anchors.right: parent.right; anchors.rightMargin: root.mapX; y: 0
        width: root.mapWidth * .36; elide: Text.ElideLeft
        horizontalAlignment: Text.AlignRight
        text: (root.targeting ? "TARGET ▸ " : "FOCUS ▸ ") + (root.focusedWindow ? root.focusedWindow.app : "")
        textFormat: Text.PlainText
        color: root.targeting ? root.accentColor : root.labelColor
        font.pixelSize: 8; font.letterSpacing: 2
    }
    Rectangle {
        x: root.mapX; y: root.mapY; width: root.mapWidth; height: root.mapHeight
        color: "transparent"; radius: 5
        border.color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, .16)
    }
    Repeater {
        model: root.windows
        Item {
            id: windowBox
            required property var modelData
            readonly property bool ownWindow: !!modelData.isOma
            readonly property bool highlighted: !ownWindow && modelData.focused
            readonly property color tint: root.accentColor
            x: root.mapX + modelData.x * root.mapWidth + 3
            y: root.mapY + modelData.y * root.mapHeight + 3
            width: Math.max(8, modelData.w * root.mapWidth - 6)
            height: Math.max(8, modelData.h * root.mapHeight - 6)
            opacity: ownWindow || highlighted ? 1 : .7
            Rectangle {
                anchors.fill: parent; radius: 3
                color: Qt.rgba(windowBox.tint.r, windowBox.tint.g, windowBox.tint.b, windowBox.highlighted ? .07 : .02)
                border.width: windowBox.highlighted ? 1.5 : 1
                border.color: Qt.rgba(windowBox.tint.r, windowBox.tint.g, windowBox.tint.b, windowBox.ownWindow ? .72 : windowBox.highlighted ? .75 : .24)
            }
            Rectangle {
                y: 14; width: parent.width; height: 1
                color: Qt.rgba(windowBox.tint.r, windowBox.tint.g, windowBox.tint.b, windowBox.highlighted ? .5 : .14)
            }
            Text {
                x: 6; y: 3; width: parent.width - (windowBox.ownWindow ? 12 : appLabel.implicitWidth + 16)
                text: windowBox.ownWindow ? "O.M.A. · SELF" : windowBox.modelData.title
                textFormat: Text.PlainText; elide: Text.ElideRight
                color: windowBox.tint; opacity: windowBox.highlighted ? .95 : .5
                font.pixelSize: 7; font.letterSpacing: 1
            }
            Text {
                id: appLabel
                anchors.right: parent.right; anchors.rightMargin: 6; y: 3
                visible: !windowBox.ownWindow && parent.width > 70
                text: windowBox.modelData.app; textFormat: Text.PlainText
                color: windowBox.tint; opacity: windowBox.highlighted ? .8 : .3
                font.pixelSize: 7; font.letterSpacing: 1
            }
            // Placeholder rows; window contents are never captured.
            Repeater {
                model: windowBox.ownWindow ? 0 : Math.max(0, Math.floor((windowBox.height - 26) / 12))
                Rectangle {
                    required property int index
                    x: 8; y: 24 + index * 12; height: 2; radius: 1
                    width: (windowBox.width - 20) * (.35 + .6 * ((index * 37) % 10) / 10)
                    color: windowBox.tint; opacity: windowBox.highlighted ? .12 : .05
                }
            }
            Repeater {
                model: windowBox.highlighted && !windowBox.ownWindow ? 4 : 0
                Item {
                    id: corner
                    required property int index
                    readonly property bool atRight: index % 2 === 1
                    readonly property bool atBottom: index > 1
                    x: atRight ? windowBox.width - 5 : -5; y: atBottom ? windowBox.height - 5 : -5
                    width: 10; height: 10
                    Rectangle { x: corner.atRight ? 8.5 : 0; width: 1.5; height: 10; color: windowBox.tint }
                    Rectangle { y: corner.atBottom ? 8.5 : 0; width: 10; height: 1.5; color: windowBox.tint }
                }
            }
        }
    }
}
