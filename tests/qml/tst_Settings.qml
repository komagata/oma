import QtQuick
import QtQuick.Controls
import QtTest
import "../../qml/views"
TestCase {
 visible: true; name: "Onboarding"; when: windowShown; width: 800; height: 900
 QtObject {
  id: fake
  property bool setupRequired: false; property string setupMessage: "Required components are missing"
  property int setupCalls: 0; function setup(){setupCalls++} function checkSetup(){}
  property bool modelReady: false; property bool speechReady: false; property bool keyConfigured: false
  property bool keySaving: false; property string keyError: ""; property string setupLaunchError: ""; property bool setupBusy: false
  property bool connectionTesting: false; property bool connectionTestPassed: false; property string connectionTestError: ""
  property bool voiceEffectsEnabled: true; function setVoiceEffects(enabled){voiceEffectsEnabled=enabled}
  property bool wakeEnabled: false; function setWake(enabled){wakeEnabled=enabled}
  property string agentBackend: "codex"
  property var agentOptions: [{value:"codex",label:"Codex CLI",note:"CLI found"},{value:"claude",label:"Claude Code",note:"CLI found; authenticate separately"},{value:"hermes",label:"Hermes Agent",note:"Not found on PATH"},{value:"openclaw",label:"OpenClaw",note:"CLI found"}]
  property string agentError: ""
  property bool taskBusy: false
  function setAgentBackend(value){agentBackend=value}
  property string modelProvider: "fixture"; property string modelName: "model"
  property var responseLanguages: [{value:"",label:"System default (Japanese)"},{value:"en",label:"English"},{value:"ja",label:"Japanese"}]
  property string responseLanguage: ""
  property string languageError: ""
  function setResponseLanguage(value){responseLanguage=value}
  property var microphones: [{value:"",label:"System default"},{value:"camera",label:"Web camera"},{value:"yamaha",label:"Yamaha AG03MK2"}]
  property string microphoneTarget: ""
  property bool microphoneBusy: false
  property string microphoneError: ""
  function refreshMicrophones(){}
  function setMicrophone(value){microphoneTarget=value}
  property string savedKey: ""; function saveKey(key){savedKey=key} function testConnection(){}
 }
 Settings { id: settings; anchors.fill: parent; service: fake; opened: true }
 SignalSpy { id: dismissSpy; target: settings; signalName: "dismiss" }
 function init(){settings.started=false;fake.setupRequired=false;fake.modelReady=false;fake.speechReady=false;fake.connectionTestPassed=false;fake.setupBusy=false;fake.keyConfigured=false;fake.savedKey="";findChild(settings,"apiKeyInput").clear()}
 function test_welcome_then_only_missing_connection(){
  compare(settings.step,"welcome");verify(!findChild(settings,"setupButton").visible)
  findChild(settings,"beginSetupButton").clicked();compare(settings.step,"voice")
  fake.modelReady=true;compare(settings.step,"voice");verify(findChild(settings,"apiKeyInput").visible)
  fake.speechReady=true;compare(settings.step,"ready");verify(!findChild(settings,"startConversationButton").visible)
  fake.connectionTestPassed=true;verify(findChild(settings,"startConversationButton").visible)
 }
 function test_machine_setup_is_only_offered_when_missing(){settings.started=true;fake.setupRequired=true;compare(settings.step,"device");findChild(settings,"setupButton").clicked();compare(fake.setupCalls,1);compare(dismissSpy.count,0);fake.setupRequired=false;verify(!findChild(settings,"setupButton").visible)}
 function test_secret_cleared_on_close(){settings.started=true;fake.modelReady=true;const input=findChild(settings,"apiKeyInput");compare(input.echoMode,TextInput.Password);input.text="fictional";settings.opened=false;compare(input.text,"");settings.opened=true}
 function test_live_needs_only_one_connection(){settings.started=true;compare(settings.step,"voice");verify(findChild(settings,"apiKeyInput").visible);compare(findChild(settings,"modelSetupButton"),null)}
 function test_only_live_controls_are_available(){
  settings.started=true
  compare(findChild(settings,"providerSelect"),null)
  compare(findChild(settings,"localSetupButton"),null)
  compare(findChild(settings,"modelSetupButton"),null)
  verify(findChild(settings,"apiKeyInput").visible)
 }
 function test_voice_effects_toggle_defaults_on_and_preserves_backend_binding(){
  settings.started=true;fake.modelReady=true;fake.speechReady=true;fake.voiceEffectsEnabled=true
  const toggle=findChild(settings,"voiceEffectsToggle");verify(toggle!==null);compare(toggle.label,"Voice effects");compare(toggle.checked,true)
  toggle.clicked();compare(fake.voiceEffectsEnabled,false);compare(toggle.checked,false)
  fake.voiceEffectsEnabled=true;compare(toggle.checked,true)
  fake.connectionTesting=true;compare(toggle.enabled,false);fake.connectionTesting=false
 }
 function test_voice_effects_screenshots(){
  settings.started=true;fake.modelReady=true;fake.speechReady=true;fake.keyConfigured=true
  width=800;height=900;fake.voiceEffectsEnabled=true;wait(100);grabImage(settings).save("/tmp/oma-settings-effects-on.png")
  fake.voiceEffectsEnabled=false;wait(100);grabImage(settings).save("/tmp/oma-settings-effects-off.png")
  width=420;height=700;wait(100);grabImage(settings).save("/tmp/oma-settings-effects-off-narrow.png");width=800;height=900
 }
 function test_wake_toggle_updates_service_and_preserves_binding(){
  settings.started=true;fake.modelReady=true;fake.speechReady=true;fake.wakeEnabled=false
  const toggle=findChild(settings,"wakeToggle");verify(toggle!==null);compare(toggle.checked,false)
  toggle.clicked();compare(fake.wakeEnabled,true);compare(toggle.checked,true)
  fake.wakeEnabled=false;compare(toggle.checked,false)
 }
 function test_microphone_selection_is_saved_and_external_updates_keep_binding(){
  settings.started=true;fake.modelReady=true;fake.speechReady=true
  const picker=findChild(settings,"microphoneSelect");verify(picker!==null)
  compare(picker.options.length,3);compare(picker.value,"")
  picker.value="yamaha";picker.changed("yamaha");compare(fake.microphoneTarget,"yamaha");compare(picker.value,"yamaha")
  fake.microphoneTarget="camera";compare(picker.value,"camera")
  fake.microphoneBusy=true;compare(picker.enabled,false);fake.microphoneBusy=false
 }
 function test_saved_api_key_can_be_updated_from_ready_settings(){
  settings.started=true;fake.modelReady=true;fake.speechReady=true;fake.keyConfigured=true
  const input=findChild(settings,"apiKeyInput"),save=findChild(settings,"saveApiKeyButton")
  verify(input.visible);verify(save!==null);compare(input.echoMode,TextInput.Password)
  compare(input.placeholderText,"*********");compare(input.text,"");compare(save.enabled,false)
  input.text="fictional-key";compare(save.enabled,true);save.clicked();compare(fake.savedKey,"fictional-key");compare(input.text,"")
  compare(input.placeholderText,"*********");compare(save.enabled,false)
  fake.keyConfigured=false;compare(input.placeholderText,"Paste your OpenAI API key");compare(input.text,"");compare(save.enabled,false)
 }
 function test_agent_selection_preserves_binding_and_displays_errors(){
  settings.started=true;fake.modelReady=true;fake.speechReady=true;fake.agentBackend="codex"
  const picker=findChild(settings,"agentSelect");verify(picker!==null);verify(picker.visible)
  compare(picker.value,"codex");compare(picker.options.length,4)
  const permissions=findChild(settings,"agentPermissions")
  verify(permissions.text.indexOf("built-in tools use a read-only sandbox")>=0);verify(permissions.text.indexOf("does not constrain OMA MCP")>=0)
  verify(permissions.text.indexOf("write files, run commands and control the desktop")>=0);verify(permissions.text.indexOf("O.M.A.'s OS permissions")>=0)
  verify(permissions.text.indexOf("explicit confirm_action")>=0);verify(permissions.text.indexOf("do not automatically gate")>=0)
  picker.value="claude";picker.changed("claude");compare(fake.agentBackend,"claude")
  compare(picker.value,"claude");verify(permissions.text.indexOf("Claude's built-in tools use its own permissions")>=0);verify(permissions.text.indexOf("explicit confirm_action")>=0);verify(permissions.text.indexOf("read-only")<0);verify(findChild(settings,"agentNote").text.indexOf("authenticate separately")>=0)
  fake.agentBackend="hermes";compare(picker.value,"hermes");verify(findChild(settings,"agentNote").text.indexOf("Not found")>=0)
  fake.taskBusy=true;compare(picker.enabled,false);fake.taskBusy=false
  fake.agentError="CLI failed";compare(findChild(settings,"agentError").text,"CLI failed");fake.agentError=""
 }
 function test_agent_default_without_service(){
  settings.service=null;compare(findChild(settings,"agentSelect").value,"codex");settings.service=fake
 }
 function test_language_selection_preserves_binding(){
  settings.started=true;fake.modelReady=true;fake.speechReady=true
  const picker=findChild(settings,"languageSelect");verify(picker!==null);verify(picker.visible)
  compare(picker.value,"");picker.value="en";picker.changed("en");compare(fake.responseLanguage,"en")
  fake.responseLanguage="";compare(picker.value,"")
 }
 function test_layout(){settings.started=true;fake.modelReady=true;fake.speechReady=true;fake.keyConfigured=true;wait(100);grabImage(settings).save("/tmp/oma-onboarding-wide.png");width=420;height=700;wait(100);grabImage(settings).save("/tmp/oma-onboarding-narrow.png");width=800;height=900}
}
