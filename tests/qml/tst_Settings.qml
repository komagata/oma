import QtQuick
import QtQuick.Controls
import QtTest
import "../.."
TestCase {
    name: "ApiKeySetup"; when: windowShown; width: 800; height: 900
    QtObject {
        id: fake
        property bool setupRequired: false
        property string setupMessage: "Missing: Node.js 24+"
        property int setupCalls: 0
        function setup() { setupCalls++ }
        function checkSetup() {}
        property bool wakeEnabled: false; property string wakeStatus: "Voice wake is off"; function setWake(enabled) {}
        property bool keyConfigured: false
        property bool keySaving: false
        property bool keySaved: false
        property string keyError: ""
        function saveKey(key) {}
    }
    Settings { id: settings; anchors.fill: parent; service: fake; opened: true }
    SignalSpy { id: dismissSpy; target: settings; signalName: "dismiss" }
    function test_missing_runtime_guides_setup_before_key() {
        fake.setupRequired = true
        compare(findChild(settings, "apiKeyInput").enabled, false)
        const button = findChild(settings, "setupButton")
        button.clicked()
        compare(fake.setupCalls, 1)
        compare(dismissSpy.count, 1)
        fake.setupRequired = false
        compare(findChild(settings, "apiKeyInput").enabled, true)
    }
    function test_key_is_masked_and_cleared_when_closed() {
        const input = findChild(settings, "apiKeyInput")
        compare(input.echoMode, TextInput.Password)
        input.text = "sk-fictional-test-key"
        settings.opened = false
        compare(input.text, "")
        settings.opened = true
    }
}
