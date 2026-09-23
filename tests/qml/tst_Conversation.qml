import QtQuick
import QtTest
import "../.." as Oma
TestCase {
    id: tests
    name: "ConversationOpening"
    when: windowShown
    visible: true
    width: 712; height: 762
    QtObject {
        id: fixture
        property string state: "idle"
        property string userText: ""
        property string assistantText: ""
        property string error: ""
        property string taskStatus: ""
        property real level: 0
        property real lipRound: 0
        property real lipWide: 0
        property var approval: null
        property var question: null
    }
    Oma.Conversation { id: conversation; width: 600; height: 650; service: fixture }
    function test_user_transcript_visible_when_service_exists() {
        const header=findChild(conversation,"userTranscript")
        verify(header!==null,"Transcript section must exist")
        compare(header.visible,true)
        fixture.state="listening"
        compare(header.visible,true)
        fixture.userText="Hello, O.M.A."
        compare(header.visible,true)
        fixture.userText=""
        compare(header.visible,true)
    }

    function test_five_user_lines_are_visible() {
        fixture.userText = "１行目：今日は画面表示を確認しています。\n２行目：発言の冒頭も残したいです。\n３行目：途中の文章も表示します。\n４行目：この行も切れずに見えます。\n５行目：最後の行まで同時に表示します。"
        const caption = findChild(conversation, "userCaption")
        wait(100)
        compare(caption.visibleLines, 5)
        compare(caption.scrollOffset, 0)
        compare(caption.revealedText, fixture.userText)
        grabImage(conversation).save("/tmp/oma-five-line-preview.png")
    }
}
