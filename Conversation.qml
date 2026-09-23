pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls

Item {
    id: root
    property var service: null
    property color accentColor: service && service.accentColor !== undefined ? service.accentColor : "#cacccc"
    OmaPalette { id: ink; accent: root.accentColor }
    property bool opened: true
    property int startupSerial: 0
    property bool shuttingDown: false
    property real phase: 0
    property var questionValues: ({})
    readonly property string status: service ? service.state : "starting"
    signal dismiss()
    signal settingsRequested()
    function close() { dismiss() }
    focus: opened
    Keys.onEscapePressed: close()
    Timer { interval: 40; repeat: true; running: root.opened; onTriggered: root.phase += .025 }
    property int statusDotStep: 0
    readonly property var statusDotFrames: ["", ".", "..", "..."]
    // Debug flags for status layout verification (disabled by default).
    property bool debugStatusLayout: false
    property int forceStatusDotStep: -1
    readonly property bool statusBusy: root.status === "working" || root.status === "thinking" || root.status === "speaking" || (root.service && root.service.listeningReady && root.status === "idle")
    readonly property string statusBaseText: root.service && root.service.cameraActive ? "CAMERA" : root.service && root.service.listeningReady && root.status === "idle" ? "LISTENING" : root.status.toUpperCase()
    readonly property int activeStatusDotStep: forceStatusDotStep >= 0 ? Math.min(forceStatusDotStep, statusDotFrames.length - 1) : statusDotStep
    readonly property string statusDots: statusBusy ? statusDotFrames[activeStatusDotStep] : ""
    // Low-cost text animation: only ticks while active status is shown.
    Timer {
        interval: 450
        repeat: true
        running: root.opened && root.statusBusy && root.forceStatusDotStep < 0
        onTriggered: root.statusDotStep = (root.statusDotStep + 1) % root.statusDotFrames.length
    }
    onStatusBusyChanged: if (!statusBusy) statusDotStep = 0
    Text {
        anchors.right: parent.right; anchors.rightMargin: 28; anchors.bottom: parent.bottom; anchors.bottomMargin: 24
        z: 2; text: "SETTINGS"; color: ink.secondary; font.pixelSize: 11
        MouseArea { anchors.fill: parent; anchors.margins: -10; onClicked: root.settingsRequested() }
    }
    PanelBackdrop { tint: ink.surface; anchors.fill: parent; anchors.margins: -56 }
            Item {
                id: bodyArea
                anchors.fill: parent
                anchors.bottomMargin: footer.height + 18
                clip: true

                Column {
                id: content
                width: parent.width - 96
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.leftMargin: 48
                anchors.rightMargin: 48
                anchors.verticalCenter: parent.verticalCenter
                anchors.verticalCenterOffset: -8
                spacing: root.height < 720 ? 10 : 14
                clip: true
                Item {
                    width: parent.width
                    id: userBlock
                    height: userTranscriptColumn.implicitHeight
                    Column {
                        id: userTranscriptColumn
                        objectName: "userTranscript"
                        width: parent.width
                        spacing: 8
                        // Keep the user block visible while listening/recording, even before text is finalized.
                        visible: root.service !== null
                        Text {
                            width: parent.width; text: "YOU"; textFormat: Text.PlainText
                            color: ink.muted; font.pixelSize: 11; font.letterSpacing: 3
                            horizontalAlignment: Text.AlignHCenter
                        }
                        TypewriterText {
                    cursorColor: root.accentColor
                    id: userCaption
                            objectName: "userCaption"
                            color: ink.secondary
                            width: parent.width; height: lineHeight * 5
                            text: root.service ? root.service.userText : ""
                            font.pixelSize: 14
                            animated: false
                            active: root.opened
                        }

                        // Keep user area order aligned with assistant area: label -> text -> waveform.
                        Item {
                            width: parent.width
                            height: 24
                            Row {
                                anchors.horizontalCenter: parent.horizontalCenter
                                spacing: 4
                                Repeater {
                                    model: 33
                                    Rectangle {
                                        required property int index
                                        width: 2
                                        anchors.verticalCenter: parent.verticalCenter
                                        color: ink.accent
                                        readonly property real meterLevel: root.service ? root.service.inputLevel : 0
                                        readonly property real scaledLevel: Math.min(1, meterLevel * 1.35 + 0.05)
                                        readonly property real pulse: 5 + 18 * Math.abs(Math.sin(index * 2.1 + root.phase * 12))
                                        height: 2 + scaledLevel * pulse
                                    }
                                }
                            }
                        }
                    }
                }
                Item {
                    width: parent.width; height: Math.max(80, Math.min(240, bodyArea.height - userBlock.height - assistantCaption.height - 210))
                    Glow { accentColor: root.accentColor; anchors.centerIn: parent; width: parent.height*2.1; height: parent.height*1.6 }
                    Face {
                        accentColor: root.accentColor
                        anchors.centerIn: parent; width: height*.78; height: parent.height
                        mouthOpen: root.service ? root.service.level : 0
                        lipRound: root.service ? root.service.lipRound : 0
                        lipWide: root.service ? root.service.lipWide : 0
                        startupSerial: root.startupSerial
                        shuttingDown: root.shuttingDown
                        status: root.status
                        active: root.opened
                    }
                }
                Item { width: 1; height: 8 }
                Text { width: parent.width; text: "O.M.A."; textFormat: Text.PlainText; color: ink.accent; font.pixelSize: 16; font.letterSpacing: 6; horizontalAlignment: Text.AlignHCenter }
                TypewriterText {
                    id: assistantCaption
                    font.pixelSize: 14
                    cursorColor: root.accentColor
                    color: ink.text
                    width: parent.width
                    height: lineHeight * 5
                    text: root.service ? root.service.assistantText : ""
                    active: root.opened
                }
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter; spacing: 4; height: 24
                    Text { width: parent.width; visible: root.service && root.service.approval !== null; text: root.service && root.service.approvalListening ? "LISTENING — say yes or no" : "You can answer by voice or use the buttons."; color: ink.text; font.pixelSize: 13; wrapMode: Text.Wrap }
                    Repeater { model: 33; Rectangle { required property int index; width: 2; anchors.verticalCenter: parent.verticalCenter; height: 2 + (root.service ? root.service.level : 0) * (5+18*Math.abs(Math.sin(index*2.1+root.phase*12))); color: ink.accent } }
                }
                Item {
                    width: parent.width
                    height: 18
                    // Keep base status text centered; draw dots in a separate slot after it.
                    Item {
                        id: statusFrame
                        anchors.horizontalCenter: parent.horizontalCenter
                        anchors.verticalCenter: parent.verticalCenter
                        width: 184
                        height: parent.height
                        readonly property int dotSlotWidth: 18
                        readonly property int baseDotGap: 2
                        Text {
                            id: statusBaseLabel
                            anchors.horizontalCenter: statusFrame.horizontalCenter
                            anchors.verticalCenter: parent.verticalCenter
                            text: root.statusBaseText
                            textFormat: Text.PlainText
                            color: ink.muted
                            font.pixelSize: 11
                            font.letterSpacing: 3
                            horizontalAlignment: Text.AlignHCenter
                        }
                        Text {
                            id: statusDotLabel
                            anchors.left: statusBaseLabel.right
                            anchors.leftMargin: statusFrame.baseDotGap
                            anchors.verticalCenter: statusBaseLabel.verticalCenter
                            width: statusFrame.dotSlotWidth
                            horizontalAlignment: Text.AlignLeft
                            text: root.statusDots
                            textFormat: Text.PlainText
                            color: ink.muted
                            font.pixelSize: 11
                            font.letterSpacing: 3
                        }
                    }
                    // Optional development overlay/log for checking fixed layout at dot 0 and 3.
                    Text {
                        visible: root.debugStatusLayout
                        anchors.top: statusFrame.bottom
                        anchors.topMargin: 2
                        anchors.horizontalCenter: statusFrame.horizontalCenter
                        text: "frameW=" + statusFrame.width
                              + " base(" + Math.round(statusBaseLabel.x) + "," + Math.round(statusBaseLabel.y) + ")"
                              + " dot(" + Math.round(statusDotLabel.x) + "," + Math.round(statusDotLabel.y) + ")"
                              + " step=" + root.activeStatusDotStep
                        textFormat: Text.PlainText
                        color: ink.muted
                        font.pixelSize: 9
                    }
                    Component.onCompleted: {
                        if (!root.debugStatusLayout) return;
                        console.log("[status-layout] frameW=" + statusFrame.width
                            + " base(" + statusBaseLabel.x + "," + statusBaseLabel.y + ")"
                            + " dot(" + statusDotLabel.x + "," + statusDotLabel.y + ")"
                            + " step=" + root.activeStatusDotStep);
                    }
                }
                Text {
                    id: statusText
                    width: parent.width
                    visible: text.length > 0
                    text: root.service ? root.service.error || (root.status === "working" ? root.service.taskStatus : "") : ""
                    textFormat: Text.PlainText
                    color: ink.text
                    font.pixelSize: 13
                    wrapMode: Text.Wrap
                    maximumLineCount: 2
                    elide: Text.ElideRight
                    horizontalAlignment: Text.AlignLeft
                }
                Button { visible: ["error","offline","unauthenticated"].indexOf(root.status)>=0; anchors.horizontalCenter: parent.horizontalCenter; text: "Retry"; onClicked: if(root.service)root.service.retry() }
                }
            }
            Rectangle {
                visible: root.service && (root.service.approval !== null || root.service.question !== null)
                anchors.centerIn: parent; width: Math.min(parent.width-60,700); height: requestColumn.implicitHeight+40; color: ink.surface; border.color: ink.muted
                MouseArea { anchors.fill: parent; onClicked: {} }
                Column {
                    id: requestColumn; anchors.centerIn: parent; width: parent.width-40; spacing: 16
                    Text { text: "O.M.A. NEEDS YOUR INPUT"; textFormat: Text.PlainText; color: ink.accent; font.pixelSize: 17 }
                    Text { width: parent.width; text: root.service ? (root.service.approval ? root.service.approval.description : root.service.question ? "Please answer the following questions." : "") : ""; textFormat: Text.PlainText; color: ink.text; wrapMode: Text.Wrap; maximumLineCount: 12; elide: Text.ElideRight }
                    Row { spacing: 15; visible: root.service && root.service.approval !== null
                        Button { text: "Allow once"; onClicked: root.service.approve(true) }
                        Button { text: "Deny"; onClicked: root.service.approve(false) }
                        Button { text: "Speak answer"; onClicked: root.service.press() }
                    }
                    Repeater {
                        model: root.service && root.service.question ? root.service.question.questions : []
                        delegate: Column {
                            id: questionRow
                            required property var modelData
                            width: requestColumn.width; spacing: 8
                            Text { width: parent.width; text: questionRow.modelData.question; textFormat: Text.PlainText; color: ink.text; wrapMode: Text.Wrap }
                            TextField {
                                width: parent.width; placeholderText: "Your answer"
                                onTextChanged: { const values = root.questionValues; values[parent.modelData.id] = text; root.questionValues = values }
                            }
                        }
                    }
                    Button { visible: root.service && root.service.question !== null; text: "Submit answers"; onClicked: { root.service.answer(root.questionValues); root.questionValues = ({}) } }
                }
            }
            Item {
                id: footer
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                height: 56
                z: 10
                clip: true
                Text {
                    anchors.bottom: parent.bottom
                    anchors.bottomMargin: 40
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: (root.service && root.service.listeningReady ? "SPEAK ANYTIME" : "F8 TO OPEN") + "    ·    ESC TO CLOSE"
                    textFormat: Text.PlainText
                    font.pixelSize: 10
                    font.letterSpacing: 1.5
                    color: ink.muted
                }
            }
        }
