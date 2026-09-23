import QtQuick
import QtTest
import "../.." as Oma
TestCase {
 name: "CrtStartup"
 when: windowShown
 width: 240; height: 280
 Oma.Face { id: face; width: 187; height: 240; active: false }
 function test_shutdown_collapses_and_reopening_cancels_it() {
  face.active = true
  face.bootProgress = 1
  face.shuttingDown = true
  wait(150)
  verify(face.bootProgress < 1)
  tryCompare(face, "bootProgress", 0, 2000)
  face.shuttingDown = false
  face.startupSerial++
  tryCompare(face, "bootProgress", 1, 2000)
  face.active = false
 }
 function test_open_settles_and_settings_return_does_not_restart() {
  face.active = true
  face.startupSerial++
  wait(100)
  verify(face.bootProgress < .5)
  tryCompare(face, "bootProgress", 1, 2000)
  face.active = false
  face.active = true
  wait(100)
  compare(face.bootProgress, 1)
  face.startupSerial++
  wait(100)
  verify(face.bootProgress < .5)
  face.active = false
  compare(face.bootProgress, 1)
 }
}
