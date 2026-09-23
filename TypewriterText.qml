pragma ComponentBehavior: Bound
import QtQuick

Item {
    id: root
    property string text: ""
    property bool active: true
    property bool animated: true
    property bool followTail: true
    property int interval: 28
    property int visibleCharacters: 0
    property string previousText: ""
    property color color: "#a0a0a0"
    property color cursorColor: "#cacccc"
    property font font: Qt.font({pixelSize: 16})
    readonly property string revealedText: text.slice(0, visibleCharacters)
    readonly property bool typing: visibleCharacters < text.length
    property bool cursorOn: true
    property rect revealPosition: Qt.rect(0,0,0,0)
    readonly property real lineHeight: Math.max(1, Math.ceil(measure.implicitHeight / Math.max(1, measure.lineCount)))
    readonly property int visibleLines: Math.max(1, Math.floor(height / lineHeight))
    readonly property real scrollOffset: viewport.contentY
    readonly property real maximumScroll: Math.max(0, (Math.round(revealPosition.y / lineHeight) - visibleLines + 1) * lineHeight)
    implicitHeight: measure.implicitHeight
    clip: true

    onTextChanged: {
        if (!text.startsWith(previousText)) { visibleCharacters = 0; followTail = true }
        if (!animated) visibleCharacters = text.length
        previousText = text
        Qt.callLater(updateVisibility)
    }
    onAnimatedChanged: { if (!animated) visibleCharacters = text.length }
    onLineHeightChanged: Qt.callLater(updateVisibility)
    onWidthChanged: Qt.callLater(updateVisibility)
    onHeightChanged: Qt.callLater(updateVisibility)
    onVisibleCharactersChanged: Qt.callLater(updateVisibility)
    function advance() {
        if (!typing) return
        const code = text.codePointAt(visibleCharacters)
        visibleCharacters += code > 0xffff ? 2 : 1
    }
    function updateVisibility() {
        revealPosition = measure.positionToRectangle(visibleCharacters)
        viewport.contentY = followTail ? maximumScroll : Math.min(viewport.contentY, maximumScroll)
    }
    function scrollLines(count) {
        followTail = false
        viewport.contentY = Math.max(0, Math.min(maximumScroll, viewport.contentY + count * lineHeight))
    }
    Timer {
        interval: root.interval; repeat: true
        running: root.animated && root.active && root.visible && root.typing
        onTriggered: root.advance()
    }
    Timer {
        interval: 360; repeat: true
        running: root.animated && root.active && root.visible && root.typing
        onTriggered: root.cursorOn = !root.cursorOn
        onRunningChanged: root.cursorOn = true
    }
    component Caption: TextEdit {
        width: viewport.width
        height: implicitHeight
        text: root.text
        textFormat: TextEdit.PlainText
        wrapMode: TextEdit.Wrap
        horizontalAlignment: TextEdit.AlignLeft
        readOnly: true
        activeFocusOnPress: false
        selectByMouse: false
        cursorVisible: false
        color: root.color
        font: root.font
    }
    Flickable {
        id: viewport
        anchors.top: parent.top
        width: parent.width
        height: root.visibleLines * root.lineHeight
        contentWidth: width
        contentHeight: measure.height
        interactive: false
        clip: true
        WheelHandler {
            target: null
            acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
            onWheel: event => {
                const delta = event.angleDelta.y || event.pixelDelta.y
                if (delta !== 0) root.scrollLines(delta > 0 ? -3 : 3)
                event.accepted = true
            }
        }
        Caption {
            id: measure
            visible: false
            onTextChanged: Qt.callLater(root.updateVisibility)
            onImplicitHeightChanged: Qt.callLater(root.updateVisibility)
        }
        // Reveal the already-laid-out text through two clips: completed lines
        // and the current line up to the next character. No markup or reflow.
        Item {
            width: viewport.width
            height: root.revealPosition.y
            clip: true
            Caption {}
        }
        Item {
            y: root.revealPosition.y
            width: root.typing ? root.revealPosition.x : viewport.width
            height: root.revealPosition.height
            clip: true
            Caption { y: -root.revealPosition.y }
        }
    }
    Rectangle {
        x: root.revealPosition.x
        y: root.revealPosition.y - viewport.contentY
        width: 7
        height: root.revealPosition.height
        color: root.cursorColor
        opacity: .7
        visible: root.animated && root.active && root.typing && root.cursorOn && y >= 0 && y + height <= viewport.height
    }
}
