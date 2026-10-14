pragma ComponentBehavior: Bound
import QtQuick
import "../components"
import QtQuick.Controls
import qs.Ui as Ui

Item {
    id: root
    component Action: Ui.Button {
        focusable: true
        bordered: true
        foreground: ink.text
        accent: ink.accent
    }
    component StatusItem: Row {
        property string icon: ""
        property string label: ""
        property bool on: true
        spacing: 5
        opacity: on ? 1 : .4
        Text { text: parent.icon; textFormat: Text.PlainText; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 11; color: ink.text; anchors.verticalCenter: parent.verticalCenter }
        Text { text: parent.label; textFormat: Text.PlainText; font.pixelSize: 8; font.letterSpacing: 2; color: ink.secondary; anchors.verticalCenter: parent.verticalCenter }
    }
    property var service: null
    property color accentColor: service && service.accentColor !== undefined ? service.accentColor : "#cacccc"
    OmaPalette { id: ink; accent: root.accentColor }
    readonly property bool miniMode: !!service && service.viewMode === "mini" && !service.approval && !service.question && !service.error && !service.agentError
    property bool opened: true
    property int startupSerial: 0
    property bool shuttingDown: false
    property real phase: 0
    property var questionValues: ({})
    // Desktop context supplied by the shell: normalized window geometry of O.M.A.'s workspace.
    property var desktopWindows: []
    property string desktopWorkspace: ""
    property real desktopAspect: 16 / 9
    readonly property string status: service ? service.state : "starting"
    signal dismiss()
    signal settingsRequested()
    function close() { dismiss() }
    focus: opened
    Keys.onEscapePressed: close()
    Timer { interval: 40; repeat: true; running: root.opened; onTriggered: root.phase += .025 }
    readonly property string statusBaseText: root.service && root.service.taskBusy && !root.service.error && !root.service.approval ? "WORKING" : root.service && root.service.cameraActive ? "CAMERA" : root.service && root.service.listeningReady && root.status === "idle" ? "LISTENING" : root.status === "speaking" ? "TALKING" : root.status.toUpperCase()
    readonly property string taskText: service ? service.taskStatus : ""
    property string displayedTask: ""
    onTaskTextChanged: {
        if (taskText) { displayedTask = taskText; taskHold.restart() }
        else if (!taskHold.running) displayedTask = ""
    }
    Timer { id: taskHold; interval: 2000; onTriggered: if (!root.taskText) root.displayedTask = "" }
    property string displayStatus: ""
    Component.onCompleted: displayStatus = statusBaseText
    onStatusBaseTextChanged: {
        if (statusBaseText === "TALKING" || statusBaseText === "WORKING") {
            statusSettle.stop()
            displayStatus = statusBaseText
        } else statusSettle.restart()
    }
    onStartupSerialChanged: { userLabel.hasAppeared = false; taskHold.stop(); displayedTask = "" }
    onOpenedChanged: {
        if (opened) displayStatus = statusBaseText
        else statusSettle.stop()
    }
    Timer {
        id: statusSettle
        interval: 800
        onTriggered: root.displayStatus = root.statusBaseText
    }
    readonly property real captionHeight: 66
    readonly property bool offline: ["offline", "error", "unauthenticated"].indexOf(status) >= 0
    readonly property bool linked: !!service && !offline && (service.listeningReady || ["speaking", "working", "approval"].indexOf(status) >= 0)
    readonly property bool pendingResponse: !!service && !!service.backendStatus && service.backendStatus.pending > 0
    readonly property bool taskBusy: !!service && !!service.taskBusy
    readonly property string microphoneLabel: {
        const list = service && service.microphones ? service.microphones : []
        const target = service && service.microphoneTarget ? service.microphoneTarget : ""
        for (const choice of list) if (choice.value === target) return choice.label
        return target || "System default"
    }

    PanelBackdrop { visible: !root.miniMode; tint: ink.surface; accent: root.accentColor; anchors.fill: parent }

    // Header: live link state and response language.
    Item {
        id: header
        visible: !root.miniMode
        x: 14; width: parent.width - 28; height: 26
        Text {
            anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter
            text: "O.M.A."; textFormat: Text.PlainText
            color: ink.accent; font.pixelSize: 12; font.bold: true; font.letterSpacing: 6
        }
        Row {
            anchors.centerIn: parent
            spacing: 6
            Rectangle {
                id: linkDot
                anchors.verticalCenter: parent.verticalCenter
                width: 6; height: 6; radius: 3
                color: root.offline ? ink.muted : ink.accent
                SequentialAnimation on opacity {
                    running: root.opened && !root.linked && !root.offline
                    loops: Animation.Infinite
                    onStopped: linkDot.opacity = 1
                    NumberAnimation { to: .2; duration: 450 }
                    NumberAnimation { to: 1; duration: 450 }
                }
            }
            Text {
                objectName: "linkStatus"
                text: (root.service && root.service.agentBackend ? String(root.service.agentBackend).toUpperCase() : "CODEX") + " · " + (root.offline ? (root.status === "unauthenticated" ? "NO KEY" : "OFFLINE") : root.linked ? "LINKED" : root.status === "connecting" ? "CONNECTING" : "STANDBY")
                textFormat: Text.PlainText
                color: root.linked ? ink.text : ink.secondary; font.pixelSize: 9; font.letterSpacing: 2
            }
        }
        Text {
            anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
            text: "LANG " + (root.service && root.service.responseLanguage ? String(root.service.responseLanguage).toUpperCase() : "AUTO")
            textFormat: Text.PlainText
            color: ink.secondary; font.pixelSize: 9; font.letterSpacing: 2
        }
        Rectangle {
            anchors.bottom: parent.bottom; width: parent.width; height: 1
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: "transparent" }
                GradientStop { position: .2; color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, .3) }
                GradientStop { position: .8; color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, .3) }
                GradientStop { position: 1; color: "transparent" }
            }
        }
    }

    // Captions: a fixed three-line area each, so replies never move the layout.
    Column {
        id: captions
        visible: !root.miniMode
        x: 16; y: header.height + 10; width: parent.width - 32
        spacing: 8
        Item {
            id: userBlock
            width: parent.width
            height: userColumn.implicitHeight
            visible: root.service !== null
            Rectangle { width: 2; height: parent.height; color: ink.accent; opacity: .25 }
            Column {
                id: userColumn
                x: 14; width: parent.width - 14
                spacing: 4
                // Reserve the label's line even while hidden so the captions never shift.
                Item { width: parent.width; height: userLabel.implicitHeight
                Text {
                    id: userLabel
                    objectName: "userLabel"
                    property bool hasAppeared: false
                    // Mic levels include ambient noise; only a transcript confirms user speech.
                    readonly property bool hasInput: userCaption.text.trim().length > 0
                    onHasInputChanged: if (hasInput) hasAppeared = true
                    Component.onCompleted: if (hasInput) hasAppeared = true
                    visible: hasAppeared
                    text: "▸ YOU"; textFormat: Text.PlainText
                    color: ink.muted; font.pixelSize: 9; font.letterSpacing: 3
                }
                }
                // Fixed to three CJK lines; the caption inside follows its own line height.
                Item { width: parent.width; height: root.captionHeight
                TypewriterText {
                    id: userCaption
                    objectName: "userCaption"
                    cursorColor: root.accentColor
                    color: ink.secondary
                    width: parent.width; height: lineHeight * 3
                    text: root.service ? root.service.userText : ""
                    font.pixelSize: 14
                    animated: false
                    active: root.opened
                }
                }
            }
        }
        Item {
            id: assistantCaptionArea
            width: parent.width
            height: assistantColumn.implicitHeight + 16
            Rectangle {
                anchors.fill: parent
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, .09) }
                    GradientStop { position: .8; color: "transparent" }
                }
            }
            Rectangle { width: 2; height: parent.height; color: ink.accent }
            Column {
                id: assistantColumn
                x: 14; y: 8; width: parent.width - 28
                spacing: 4
                Text { text: "▸ O.M.A."; textFormat: Text.PlainText; color: ink.muted; font.pixelSize: 9; font.letterSpacing: 3 }
                Item { width: parent.width; height: root.captionHeight
                TypewriterText {
                    id: assistantCaption
                    objectName: "assistantCaption"
                    font.pixelSize: 14
                    cursorColor: root.accentColor
                    color: ink.text
                    width: parent.width; height: lineHeight * 3
                    text: root.service ? root.service.assistantText : ""
                    active: root.opened
                }
                }
            }
        }
    }

    // Stage: desktop context, projector floor, beam and face.
    Item {
        id: stage
        objectName: "holoStage"
        visible: !root.miniMode
        x: 0; width: parent.width
        y: captions.y + captions.height + 10
        height: taskBar.y - y - 8
        readonly property real waveHeight: 24
        readonly property real ringY: 22
        readonly property real ringX: Math.min(150, width * .27)
        readonly property real emitterY: height - waveHeight - 8 - ringY - 12
        readonly property real horizonY: emitterY - 58
        readonly property bool showMeters: width >= 420
        // The face grows with taller windows; only a very short docked tile shrinks it below 160.
        readonly property real faceHeight: Math.round(Math.min(220, Math.max(Math.min(160, horizonY + 20), (horizonY - 40) * .62)))
        // The desktop map stands on the horizon, centred behind the face.
        readonly property real mapBottom: horizonY - 12
        readonly property real mapHeight: Math.max(60, Math.min(mapBottom - 4, faceHeight * 1.55 + 16))
        readonly property real faceCenterY: Math.max(faceHeight / 2 + 2, mapBottom - (mapHeight - 16) / 2)
        DesktopMap {
            id: desktopMap
            objectName: "desktopMap"
            x: stage.showMeters ? 64 : 12; y: stage.mapBottom - height
            width: parent.width - x * 2; height: stage.mapHeight
            windows: root.desktopWindows
            workspace: root.desktopWorkspace
            aspect: root.desktopAspect
            targeting: root.taskBusy
            accentColor: root.accentColor
            labelColor: ink.muted
        }
        HoloFloor {
            anchors.fill: parent
            accentColor: root.accentColor
            labelColor: ink.muted
            horizonY: stage.horizonY
            centerY: stage.emitterY
            ringX: stage.ringX; ringY: stage.ringY
            inputLevel: root.service ? root.service.inputLevel : 0
            level: root.service ? root.service.level : 0
            listening: !!root.service && root.service.listeningReady && ["idle", "listening"].indexOf(root.status) >= 0
            thinking: root.pendingResponse && root.status !== "speaking"
            speaking: root.displayStatus === "TALKING" || root.status === "speaking"
            working: root.taskBusy
        }
        // Dashed link from the emitter to the window a running task targets.
        Canvas {
            id: targetLink
            objectName: "targetLink"
            anchors.fill: parent
            visible: root.taskBusy && desktopMap.targetPoint.x >= 0
            readonly property point target: Qt.point(desktopMap.x + desktopMap.targetPoint.x, desktopMap.y + desktopMap.targetPoint.y)
            onTargetChanged: requestPaint()
            onVisibleChanged: requestPaint()
            onPaint: {
                const ctx = getContext("2d"), a = root.accentColor
                ctx.clearRect(0, 0, width, height)
                const sx = width / 2 + 10, sy = stage.emitterY - 10
                ctx.setLineDash([3, 3]); ctx.lineWidth = 1
                ctx.strokeStyle = Qt.rgba(a.r, a.g, a.b, .85)
                ctx.beginPath(); ctx.moveTo(sx, sy)
                ctx.bezierCurveTo(sx + 40, sy - 70, target.x + 40, target.y + 50, target.x, target.y + 4)
                ctx.stroke()
                ctx.setLineDash([])
                ctx.fillStyle = Qt.rgba(a.r, a.g, a.b, 1)
                ctx.beginPath(); ctx.arc(target.x, target.y + 4, 2.5, 0, Math.PI * 2); ctx.fill()
            }
        }
        HoloBeam {
            anchors.fill: parent
            accentColor: root.accentColor
            level: root.service ? root.service.level : 0
            phase: root.phase
            apexY: stage.emitterY
            topY: stage.faceCenterY - stage.faceHeight * .3
            topHalfWidth: Math.min(stage.faceHeight * .72, stage.width * .3)
            baseHalfWidth: stage.ringX * .22
        }
        LevelMeter {
            visible: stage.showMeters
            x: 12; y: stage.faceCenterY - height / 2
            label: "MIC"
            value: root.service ? Math.min(1, root.service.inputLevel * 1.35) : 0
            accentColor: root.accentColor; labelColor: ink.muted
        }
        LevelMeter {
            visible: stage.showMeters
            anchors.right: parent.right; anchors.rightMargin: 12; y: stage.faceCenterY - height / 2
            label: "VOX"
            value: root.service ? Math.min(1, root.service.level * 2.5) : 0
            accentColor: root.accentColor; labelColor: ink.muted
        }
        Item {
            id: waveRow
            anchors.bottom: parent.bottom
            width: parent.width; height: stage.waveHeight
            Text {
                objectName: "stateText"
                visible: stage.showMeters
                x: 16; anchors.verticalCenter: parent.verticalCenter
                text: "◉ " + root.displayStatus; textFormat: Text.PlainText
                color: ink.accent; font.pixelSize: 9; font.letterSpacing: 3
            }
            Row {
                id: assistantWaveform
                objectName: "assistantWaveform"
                visible: (root.displayStatus === "TALKING" || root.status === "speaking") && !root.shuttingDown
                anchors.centerIn: parent
                height: parent.height
                spacing: 3
                Repeater {
                    model: 40
                    Rectangle {
                        required property int index
                        readonly property real energy: Math.min(1, (root.service ? root.service.level : 0) * 2.5)
                        readonly property real envelope: Math.exp(-Math.pow((index - 19.5) / 12, 2))
                        readonly property real ripple: .3 + .7 * Math.abs(Math.sin(index * 2.37 + root.phase * 15))
                        anchors.verticalCenter: parent.verticalCenter
                        width: 2; height: 2 + (waveRow.height - 2) * envelope * energy * ripple
                        color: ink.accent
                    }
                }
            }
        }
        ScanLines { anchors.fill: parent; opacity: .22 }
    }

    // The face sits outside the stage so mini mode can centre it on its own.
    Item {
        id: faceBackground
        objectName: "faceBackground"
        readonly property real centerY: root.miniMode ? root.height / 2 : stage.y + stage.faceCenterY
        width: Math.min(root.width, portrait.height * 1.6); height: portrait.height * 1.4
        x: (root.width - width) / 2
        y: centerY - height / 2
        layer.enabled: root.opened && GraphicsInfo.api !== GraphicsInfo.Software
        layer.smooth: true
        layer.effect: CrtEffect {}
        Glow { visible: !root.miniMode; accentColor: root.accentColor; anchors.centerIn: parent; width: parent.width; height: parent.height }
        Face {
            id: portrait
            objectName: "portrait"
            accentColor: root.accentColor
            anchors.centerIn: parent
            width: height*.78; height: root.miniMode ? 160 : stage.faceHeight
            mouthOpen: root.service ? root.service.level : 0
            lipRound: root.service ? root.service.lipRound : 0
            lipWide: root.service ? root.service.lipWide : 0
            startupSerial: root.startupSerial
            shuttingDown: root.shuttingDown
            status: root.status
            active: root.opened
        }
        MouseArea {
            objectName: "faceModeToggle"
            anchors.fill: portrait
            enabled: !!root.service && !root.service.approval && !root.service.question
            onDoubleClicked: root.service.setViewMode(root.miniMode ? "normal" : "mini")
        }
    }

    // Task bar: running PC work, errors and retry. Space is always reserved.
    Item {
        id: taskBar
        visible: !root.miniMode
        x: 14; width: parent.width - 28; height: 28
        y: footer.y - height - 6
        readonly property bool errorShown: !!root.service && !!(root.service.error || root.service.agentError)
        Rectangle {
            anchors.fill: parent
            visible: statusText.text.length > 0
            color: Qt.rgba(ink.surface.r, ink.surface.g, ink.surface.b, .85)
            border.color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, .3)
        }
        Row {
            anchors.fill: parent; anchors.leftMargin: 12; anchors.rightMargin: 8
            spacing: 12
            visible: statusText.text.length > 0
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: taskBar.errorShown ? "ERROR" : "TASK"; textFormat: Text.PlainText
                color: ink.accent; font.pixelSize: 9; font.bold: true; font.letterSpacing: 2.5
            }
            Text {
                id: statusText
                objectName: "taskStatusText"
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - x - trailing.width - 12
                text: root.service ? root.service.agentError || root.service.error || root.displayedTask : ""
                textFormat: Text.PlainText
                color: ink.text
                font.pixelSize: 12
                elide: Text.ElideRight
            }
            Row {
                id: trailing
                anchors.verticalCenter: parent.verticalCenter
                spacing: 10
                Rectangle {
                    visible: root.taskBusy && !taskBar.errorShown
                    anchors.verticalCenter: parent.verticalCenter
                    width: 70; height: 3; clip: true
                    color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, .15)
                    Rectangle {
                        width: 24; height: 3; color: ink.accent
                        x: (root.phase * 60) % (parent.width + width) - width
                    }
                }
                Text {
                    visible: root.taskBusy && !taskBar.errorShown
                    anchors.verticalCenter: parent.verticalCenter
                    text: "ESC CANCEL"; textFormat: Text.PlainText
                    color: ink.muted; font.pixelSize: 8; font.letterSpacing: 2
                }
                Action {
                    visible: root.offline
                    anchors.verticalCenter: parent.verticalCenter
                    height: 22
                    text: "Retry"; onClicked: if (root.service) root.service.retry()
                }
            }
        }
    }

    // Footer: devices and features; dimmed items are off.
    Item {
        id: footer
        visible: !root.miniMode
        x: 14; width: parent.width - 28; height: 26
        y: parent.height - height - 4
        z: 10
        Row {
            anchors.verticalCenter: parent.verticalCenter
            spacing: 14
            StatusItem { icon: ""; label: root.microphoneLabel }
            StatusItem { icon: ""; label: "CAM"; on: !!root.service && !!root.service.cameraActive }
            StatusItem { icon: ""; label: "WAKE"; on: !!root.service && !!root.service.wakeEnabled }
            StatusItem { visible: root.width >= 420; icon: ""; label: "OMARCHY SKILL"; on: !!root.service && !!root.service.omarchySkillLoaded }
        }
        Item {
            id: settingsButton
            visible: !root.miniMode
            objectName: "settingsButton"
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            width: 32; height: 32
            activeFocusOnTab: true
            Accessible.role: Accessible.Button
            Accessible.name: "Settings"
            Accessible.onPressAction: root.settingsRequested()
            Keys.onReturnPressed: root.settingsRequested()
            Keys.onSpacePressed: root.settingsRequested()
            Text {
                anchors.centerIn: parent
                text: ""
                textFormat: Text.PlainText
                font.family: "JetBrainsMono Nerd Font"
                font.pixelSize: 18
                color: settingsButton.activeFocus || settingsMouse.containsMouse ? ink.text : ink.secondary
            }
            MouseArea {
                id: settingsMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.settingsRequested()
            }
        }
    }

    Rectangle {
        visible: root.service && (root.service.approval !== null || root.service.question !== null)
        z: 30
        anchors.centerIn: parent; width: Math.min(parent.width-60,700); height: requestColumn.implicitHeight+40; color: ink.surface; border.color: ink.muted
        MouseArea { anchors.fill: parent; onClicked: {} }
        Column {
            id: requestColumn; anchors.centerIn: parent; width: parent.width-40; spacing: 16
            Text { text: "O.M.A. NEEDS YOUR INPUT"; textFormat: Text.PlainText; color: ink.accent; font.pixelSize: 17 }
            Text { width: parent.width; text: root.service ? (root.service.approval ? root.service.approval.description : root.service.question ? "Please answer the following questions." : "") : ""; textFormat: Text.PlainText; color: ink.text; wrapMode: Text.Wrap; maximumLineCount: 12; elide: Text.ElideRight }
            Row { spacing: 15; visible: root.service && root.service.approval !== null
                Action { text: "Allow once"; onClicked: root.service.approve(true) }
                Action { text: "Deny"; onClicked: root.service.approve(false) }
            }
            Repeater {
                model: root.service && root.service.question ? root.service.question.questions : []
                delegate: Column {
                    id: questionRow
                    required property var modelData
                    width: requestColumn.width; spacing: 8
                    Text { width: parent.width; text: questionRow.modelData.question; textFormat: Text.PlainText; color: ink.text; wrapMode: Text.Wrap }
                    Ui.TextField {
                        width: parent.width; placeholderText: "Your answer"
                        onTextChanged: { const values = root.questionValues; values[parent.modelData.id] = text; root.questionValues = values }
                    }
                }
            }
            Action { visible: root.service && root.service.question !== null; text: "Submit answers"; onClicked: { root.service.answer(root.questionValues); root.questionValues = ({}) } }
        }
    }
}
