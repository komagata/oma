import QtQuick
import qs.Commons
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland

Item {
    id: root
    property var shell: null
    property var manifest: null
    property color accentColor: Color.accent
    property bool setupRequired: true
    property string setupMessage: "Checking runtime dependencies…"
    property string setupLaunchError: ""
    property bool setupBusy: setupTerminal.running
    property string agentBackend: "codex"
    property var agentOptions: []
    property string agentError: ""
    function setAgentBackend(value) { command({action: "setAgentBackend", value: value}) }
    property var responseLanguages: []
    property string responseLanguage: ""
    property string languageError: ""
    function setResponseLanguage(value) { command({action: "setResponseLanguage", value: value}) }
    property var microphones: []
    property string microphoneTarget: ""
    property bool microphoneBusy: false
    property string microphoneError: ""
    function refreshMicrophones() { command({action: "refreshMicrophones"}) }
    function setMicrophone(target) { command({action: "setMicrophone", target: target}) }
    property var latency: ({})
    property bool connectionTesting: false
    property bool connectionTestPassed: false
    property string connectionTestError: ""
    function testConnection() { command({action: "testConnection"}) }
    function setup() { setupLaunchError = ""; setupTerminal.running = true }
    function setupExited(exitCode) {
        if (exitCode !== 0) setupLaunchError = "Setup is incomplete. Open setup again to continue."
        checkSetup()
        if (worker.running) command({action: "refreshConnections"})
        settings()
    }
    function checkSetup() { if (!setupProbe.running) setupProbe.running = true }
    Process {
        id: setupTerminal
        onStarted: if (root.shell) root.shell.hide("io.github.komagata.oma")
        onExited: (exitCode, exitStatus) => root.setupExited(exitCode)
        command: ["systemd-run", "--user", "--collect", "--wait", "--service-type=exec", "--property=ExitType=cgroup", "--quiet", "--", "xdg-terminal-exec", "bash", Qt.resolvedUrl("../scripts/setup").toString().replace(/^file:\/\//, "")]
    }
    Timer { interval: 2500; repeat: true; running: root.setupBusy; onTriggered: root.checkSetup() }
    Process {
        id: setupProbe
        command: ["python3", Qt.resolvedUrl("../scripts/check-setup.py").toString().replace(/^file:\/\//, "")]
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
    // O.M.A. is an ordinary floating window. Register its rules at runtime so a
    // fresh install needs no edits to the user's Hyprland config; a config
    // reload drops runtime rules, so they are registered again afterwards.
    readonly property string windowRules: 'hl.window_rule({match={title="^O\\\\.M\\\\.A\\\\.( Mini)?$"},float=true,center=true,opacity="1.0 override 1.0 override"}) ' +
        'hl.window_rule({match={title="^O\\\\.M\\\\.A\\\\. Mini$"},border_size=0,no_blur=true,no_shadow=true})'
    Process { id: windowRuleProcess; command: ["hyprctl", "eval", root.windowRules]; running: true }
    Connections {
        target: Hyprland
        function onRawEvent(event) { if (event.name === "configreloaded") { windowRuleProcess.running = false; windowRuleProcess.running = true } }
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
    property bool voiceEffectsEnabled: true
    property bool wakeEnabled: false
    property string wakeStatus: "Starting voice wake…"
    property var backendStatus: ({})
    property bool taskBusy: false
    property bool docked: false
    property string floatingViewMode: "normal"
    onDockedChanged: { if (docked) floatingViewMode = viewMode; else viewMode = floatingViewMode }
    property string viewMode: "normal"
    readonly property bool miniMode: viewMode === "mini" && !approval && !question && !error
    function setViewMode(mode) { if (mode === "mini" || mode === "normal") viewMode = mode }
    property string voiceProvider: "gpt-live"
    property bool modelReady: false
    property bool speechReady: false
    property bool omarchySkillLoaded: false
    property string modelProvider: ""
    property string modelName: ""
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
    function setVoiceEffects(enabled) { command({action: "setVoiceEffects", enabled: enabled}) }
    function setWake(enabled) { command({action: "setWake", enabled: enabled}) }
    function saveKey(value) { keySaved = false; keyError = ""; command({action: "saveApiKey", key: value}) }
    function settings() { if (shell) shell.summon("io.github.komagata.oma", JSON.stringify({settings: true, greet: false})) }
    function closingCue() { command({action: "closing"}) }
    function opening() { command({action: "opening"}) }
    function welcome() { command({action: "greet"}) }
    function restoreWelcome() { command({action: "restoreGreet"}) }
    signal dismissRequested()
    property bool companionVisible: false
    function companionPanel(active, closing) { command({action: "companionPanel", active: active, closing: closing}) }
    function companionVisibility(active) { companionVisible = active; command({action: "companionVisibility", active: active}) }
    function companionOpened(address) { command({action: "autoAccompanyWindow", address: address}) }
    function companionClosed(address) { command({action: "companionWindowClosed", address: address}) }
    function presentation(active) { command({action: "presentation", active: active}) }
    function press() { if (!keyConfigured) { settings(); return }; show(true); command({action: "press"}) }
    function release() { if (keyConfigured) command({action: "release"}) }
    function stop() { command({action: "stop"}) }
    function approve(allow) { if (approval) command({action: "approve", id: approval.id, allow: allow}) }
    function answer(answers) { if (question) command({action: "answer", id: question.id, answers: answers}) }
    function retry() { if (setupRequired) { checkSetup(); return }; if (!worker.running) worker.running = true; else command({action: "connect"}) }
    function update(line) {
        if (!alive || line.length > 65536) return
        try {
            const d = JSON.parse(line)
            for (const k of ["taskBusy", "backendStatus", "docked", "viewMode"])
                if (d[k] !== undefined) root[k] = d[k]
            for (const k of ["agentBackend", "agentOptions", "agentError", "responseLanguages", "responseLanguage", "languageError", "microphones", "microphoneTarget", "microphoneBusy", "microphoneError", "voiceProvider", "latency", "connectionTesting", "connectionTestPassed", "connectionTestError", "modelReady", "speechReady", "omarchySkillLoaded", "modelProvider", "modelName", "cameraActive", "listeningReady", "approvalListening", "wakeEnabled", "voiceEffectsEnabled", "wakeStatus", "keyConfigured", "keySaving", "keyError", "keySaved", "computerUsing", "state", "userText", "assistantText", "error", "taskText", "taskStatus", "approval", "question", "level", "inputLevel", "lipRound", "lipWide"])
                if (d[k] !== undefined) root[k] = d[k]
            if (d.dismiss === true) dismissRequested()
            if (d.wakeDetected === true) {
                if (d.developmentNotice === true) show(false, true)
                else show(true)
            }
            root.revision++
            if (d.keySaved === true) { worker.running = false; restartWorker.start() }
        } catch (e) { root.error = "Invalid response from O.M.A." }
    }
    Timer { id: restartWorker; interval: 300; onTriggered: worker.running = true }
    Process {
        id: worker
        command: ["node", Qt.resolvedUrl("../runtime/main.mjs").toString().replace(/^file:\/\//, "")]
        onStarted: root.companionVisibility(root.companionVisible)
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
        function send(text: string): void { if (!root.panelOpened) root.show(false); root.command({action: "text", text: text}) }
        function computerUse(active: bool): void { root.computerUsing = active }
        function setup(): void { root.setup() }
        function testConnection(): void { root.testConnection() }
        function settings(): void { root.settings() }
        function demo(): void { root.show(false); root.command({action: "demo"}) }
        function accompany(address: string): void { root.command({action: "accompanyWindow", address: address}) }
        function restoreFloating(): void { root.command({action: "restoreFloating"}) }
        function viewMode(mode: string): void { root.setViewMode(mode) }
        function agentBackend(value: string): void { root.setAgentBackend(value) }
        function responseLanguage(value: string): void { root.setResponseLanguage(value) }
        function voiceEffects(enabled: bool): void { root.setVoiceEffects(enabled) }
        function microphone(value: string): void { root.setMicrophone(value) }
        function status(): string { return JSON.stringify({agentBackend: root.agentBackend, agentOptions: root.agentOptions, agentError: root.agentError, modelProvider: root.modelProvider, modelName: root.modelName, taskStatus: root.taskStatus, taskBusy: root.taskBusy, backendStatus: root.backendStatus, docked: root.docked, viewMode: root.viewMode, responseLanguage: root.responseLanguage, languageError: root.languageError, microphoneTarget: root.microphoneTarget, microphoneBusy: root.microphoneBusy, microphoneError: root.microphoneError, onboardingVersion: 2, voiceProvider: root.voiceProvider, latency: root.latency, setupBusy: root.setupBusy, setupRequired: root.setupRequired, modelReady: root.modelReady, speechReady: root.speechReady, connectionTestPassed: root.connectionTestPassed, panelOpened: root.panelOpened, accentColor: String(root.accentColor), state: root.state, listeningReady: root.listeningReady, error: root.error, level: root.level, inputLevel: root.inputLevel, keyConfigured: root.keyConfigured, wakeEnabled: root.wakeEnabled, voiceEffectsEnabled: root.voiceEffectsEnabled, wakeStatus: root.wakeStatus, approvalListening: root.approvalListening}) }
    }
}
