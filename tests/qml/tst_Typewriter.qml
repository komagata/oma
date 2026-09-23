import QtQuick
import QtTest
TestCase {
    id: tests
    name: "Typewriter"
    when: windowShown
    visible: true
    width: 400; height: 150
    function createCaption() {
        const component = Qt.createComponent("../../TypewriterText.qml")
        compare(component.status, Component.Ready, component.errorString())
        return createTemporaryObject(component, tests, {width: 350, height: 70, interval: 25})
    }
    function test_reveals_characters_then_preserves_prefix_on_append() {
        const caption = createCaption()
        caption.text = "Systems online."
        wait(60)
        verify(caption.revealedText.length > 0 && caption.revealedText.length < caption.text.length)
        const prefix = caption.revealedText
        const height = caption.height
        caption.text += " Ready."
        compare(caption.revealedText, prefix)
        wait(700)
        compare(caption.revealedText, caption.text)
        compare(caption.height, height)
    }
    function test_new_reply_resets_and_hidden_caption_pauses() {
        const caption = createCaption()
        caption.text = "Previous reply"
        wait(80)
        caption.active = false
        const paused = caption.revealedText
        wait(80)
        compare(caption.revealedText, paused)
        caption.text = "New reply"
        compare(caption.revealedText, "")
        caption.active = true
        wait(80)
        verify(caption.revealedText.length > 0)
        caption.text = ""
        compare(caption.revealedText, "")
    }
    function test_surrogate_pair_is_never_displayed_halfway() {
        const caption = createCaption()
        caption.active = false
        caption.text = "🤖 ready"
        caption.advance()
        compare(caption.revealedText, "🤖")
    }
    function test_unrevealed_letters_are_not_painted() {
        const caption = createCaption()
        caption.active = false
        caption.text = "SYSTEM ONLINE"
        wait(40)
        function ink() {
            const image = grabImage(caption)
            let pixels = 0
            const background = [image.red(0,0), image.green(0,0), image.blue(0,0)]
            for (let y=0; y<image.height; y++)
                for (let x=0; x<image.width; x++)
                    if (image.red(x,y)!==background[0] || image.green(x,y)!==background[1] || image.blue(x,y)!==background[2]) pixels++
            return pixels
        }
        compare(ink(), 0, "Future text must be invisible, not merely counted as hidden")
        caption.advance()
        wait(40)
        const firstLetter = ink()
        verify(firstLetter > 0)
        while (caption.typing) caption.advance()
        wait(40)
        verify(ink() > firstLetter * 3)
    }
    function test_long_text_scrolls_only_by_complete_lines() {
        const caption = createCaption()
        verify(caption.lineHeight > 0, "Caption needs a measured line grid")
        caption.animated = false
        caption.height = caption.lineHeight * 3 + 8
        caption.text = "Line one\nLine two\nLine three\nLine four\nLine five\nLine six"
        wait(50)
        compare(caption.revealedText, caption.text)
        compare(caption.visibleLines, 3)
        fuzzyCompare(caption.scrollOffset, caption.lineHeight * 3, .5)
        caption.scrollLines(-2)
        fuzzyCompare(caption.scrollOffset, caption.lineHeight, .5)
        caption.text += "\nLine seven"
        wait(50)
        fuzzyCompare(caption.scrollOffset, caption.lineHeight, .5)
        caption.text = "New reply"
        wait(50)
        compare(caption.scrollOffset, 0)
    }
}
