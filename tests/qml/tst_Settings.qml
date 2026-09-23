import QtQuick
import QtQuick.Controls
import QtTest
import "../.."
TestCase {
    name: "ApiKeySetup"; when: windowShown; width: 800; height: 900
    QtObject {
        id: fake
        property bool wakeEnabled: false; property string wakeStatus: "Voice wake is off"; function setWake(enabled) {}
        property bool keyConfigured: false
        property bool keySaving: false
        property bool keySaved: false
        property string keyError: ""
        function saveKey(key) {}
    }
    Settings { id: settings; anchors.fill: parent; service: fake; opened: true }
    function test_key_is_masked_and_cleared_when_closed() {
        const input = findChild(settings, "apiKeyInput")
        compare(input.echoMode, TextInput.Password)
        input.text = "sk-fictional-test-key"
        settings.opened = false
        compare(input.text, "")
        settings.opened = true
    }
}
