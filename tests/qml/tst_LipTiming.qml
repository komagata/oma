import QtQuick
import QtTest
import "../.." as Oma
TestCase {
    name: "LipTiming"
    when: windowShown
    width: 240; height: 300
    Oma.Face { id: face; width: 200; height: 260; active: false }
    function test_speech_shapes_follow_20ms_playback_updates() {
        face.mouthOpen = 0; face.lipRound = 0; face.lipWide = 0
        wait(160)
        face.mouthOpen = .8; face.lipRound = .6; face.lipWide = .4
        wait(35)
        verify(Math.abs(face.mouthOpen - .8) < .03, "Jaw misses the next speech frame: " + face.mouthOpen)
        verify(Math.abs(face.lipRound - .6) < .03, "Rounded vowel lags: " + face.lipRound)
        verify(Math.abs(face.lipWide - .4) < .03, "Wide vowel lags: " + face.lipWide)
        face.mouthOpen = 0; face.lipRound = 0; face.lipWide = 0
        wait(35)
        verify(face.mouthOpen < .03, "Mouth remains open through a pause: " + face.mouthOpen)
        verify(face.lipRound < .03 && face.lipWide < .03, "Lip shape remains after silence")
    }
}
