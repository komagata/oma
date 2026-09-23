import QtQuick
import qs.Commons
import Quickshell
import Quickshell.Io

Item {
    id: root
    property var shell: null
    property var manifest: null
    property color accentColor: Color.accent
    Connections { target: Color; function onAccentChanged() { root.accentColor = Color.accent; borderProbe.running = true } }
    Timer { interval: 500; running: true; repeat: true; triggeredOnStart: true; onTriggered: if (!borderProbe.running) borderProbe.running = true }
    Process {
        id: borderProbe
        command: ["hyprctl", "-j", "getoption", "general:col.active_border"]
        stdout: StdioCollector { onStreamFinished: {
            try {
                const gradient = JSON.parse(text).gradient || ""
                const first = gradient.split(/\s+/)[0]
                if (/^[0-9a-fA-F]{8}$/.test(first)) root.accentColor = "#" + first.slice(2)
            } catch (e) {}
        } }
    }
    property bool setupRequired: true
    property string setupMessage: "Checking runtime dependencies…"
    function setup() { setupTerminal.running = true }
    function checkSetup() { if (!setupProbe.running) setupProbe.running = true }
    Process {
        id: setupTerminal
        command: ["omarchy", "launch", "terminal", "bash", Qt.resolvedUrl("scripts/setup").toString().replace(/^file:\/\//, "")]
    }
    Process {
        id: setupProbe
        command: ["python3", Qt.resolvedUrl("scripts/check-setup.py").toString().replace(/^file:\/\//, "")]
        running: true
        stdout: StdioCollector { onStreamFinished: {
            try {
                const result = JSON.parse(text)
                root.setupRequired = result.setupRequired
                root.setupMessage = result.setupMessage
                if (!root.setupRequired && !worker.running) worker.running = true
            } catch (e) {
                root.setupRequired = true
                root.setupMessage = "Could not check dependencies. Run scripts/setup from the installed plugin folder."
            }
        } }
    }
    property bool alive: true
    property bool panelOpened: false
    state: "starting"
    property string userText: ""
    property string assistantText: ""
    property string error: ""
    property string taskText: ""
    property string taskStatus: ""
    property var approval: null
    property bool listeningReady: false
    property bool approvalListening: false
    property var question: null
    property bool wakeEnabled: false
    property string wakeStatus: "Starting voice wake…"
    property bool keyConfigured: false
    property bool keySaving: false
    property string keyError: ""
    property bool keySaved: false
    property bool cameraActive: false
    property bool computerUsing: false
    property real level: 0
    property real inputLevel: 0
    property real lipRound: 0
    property real lipWide: 0
    property int revision: 0

    function command(data) {
        if (setupRequired) return
        if (worker.running) worker.write(JSON.stringify(data) + "\n")
        else { root.error = "O.M.A. is stopped. Click Retry to start it."; root.state = "error" }
    }
    function show(greeting, silent) { if (shell) shell.summon("io.github.komagata.oma", JSON.stringify({greet: greeting !== false, silent: silent === true})) }
    function setWake(enabled) { command({action: "setWake", enabled: enabled}) }
    function saveKey(value) { keySaved = false; keyError = ""; command({action: "saveApiKey", key: value}) }
    function settings() { if (shell) shell.summon("io.github.komagata.oma", JSON.stringify({settings: true, greet: false})) }
    function closingCue() { command({action: "closing"}) }
    function opening() { command({action: "opening"}) }
    function welcome() { command({action: "greet"}) }
    function restoreWelcome() { command({action: "restoreGreet"}) }
    signal dismissRequested()
    function presentation(active) { command({action: "presentation", active: active}) }
    function press() { if (!keyConfigured) { settings(); return }; show(false); command({action: "press"}) }
    function release() { if (keyConfigured) command({action: "release"}) }
    function stop() { command({action: "stop"}) }
    function approve(allow) { if (approval) command({action: "approve", id: approval.id, allow: allow}) }
    function answer(answers) { if (question) command({action: "answer", id: question.id, answers: answers}) }
    function retry() { if (setupRequired) { checkSetup(); return }; if (!worker.running) worker.running = true; else command({action: "connect"}) }
    function update(line) {
        if (!alive || line.length > 65536) return
        try {
            const d = JSON.parse(line)
            for (const k of ["cameraActive", "listeningReady", "approvalListening", "wakeEnabled", "wakeStatus", "keyConfigured", "keySaving", "keyError", "keySaved", "computerUsing", "state", "userText", "assistantText", "error", "taskText", "taskStatus", "approval", "question", "level", "inputLevel", "lipRound", "lipWide"])
                if (d[k] !== undefined) root[k] = d[k]
            if (d.dismiss === true) dismissRequested()
            if (d.wakeDetected === true) show(false, true)
            root.revision++
            if (d.keySaved === true) { worker.running = false; restartWorker.start() }
        } catch (e) { root.error = "Invalid response from O.M.A." }
    }
    Timer { id: restartWorker; interval: 300; onTriggered: worker.running = true }
    Process {
        id: worker
        command: ["node", Qt.resolvedUrl("runtime/main.mjs").toString().replace(/^file:\/\//, "")]
        stdinEnabled: true
        running: false
        stdout: SplitParser { onRead: data => root.update(data) }
        onExited: { root.keySaving = false; if (root.alive) { root.state = "offline"; root.level = 0; root.inputLevel = 0; root.error = "O.M.A. stopped. Click Retry to reconnect." } }
    }
    Component.onDestruction: { root.alive = false; worker.running = false }
    IpcHandler {
        target: "io.github.komagata.oma"
        function press(): void { root.press() }
        function release(): void { root.release() }
        function stop(): void { root.stop(); if (root.shell) root.shell.hide("io.github.komagata.oma") }
        function open(): void { root.show() }
        function retry(): void { root.retry() }
        function send(text: string): void { root.show(false); root.command({action: "text", text: text}) }
        function settings(): void { root.settings() }
        function demo(): void { root.show(false); root.command({action: "demo"}) }
        function status(): string { return JSON.stringify({panelOpened: root.panelOpened, accentColor: String(root.accentColor), state: root.state, listeningReady: root.listeningReady, error: root.error, level: root.level, inputLevel: root.inputLevel, keyConfigured: root.keyConfigured, wakeEnabled: root.wakeEnabled, wakeStatus: root.wakeStatus, approvalListening: root.approvalListening}) }
    }
}
