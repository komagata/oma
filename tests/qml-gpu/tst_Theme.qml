import QtQuick
import QtTest
import "../.." as Oma
TestCase {
    id: tests
    name: "ThemeTint"
    when: windowShown
    width: 280; height: 360
    visible: true
    Oma.Face { id: face; anchors.fill: parent; active: false; accentColor: "#2080ff" }
    Oma.OmaPalette { id: ink; accent: face.accentColor }
    function test_face_repaints_texture_when_accent_changes() {
        tryVerify(function() { return face.isImageLoaded(face.textureUrl) }, 3000)
        wait(200)
        let blue = grabImage(tests)
        let x = 140, y = 110
        verify(blue.blue(x,y) > blue.red(x,y) * 2)
        face.accentColor = "#ff4020"
        wait(200)
        let red = grabImage(tests)
        verify(red.red(x,y) > red.blue(x,y) * 2)
        verify(ink.text.r > ink.text.b)
    }
}
