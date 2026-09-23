import QtQuick
import QtQuick.Effects
import "assets/FaceMesh.js" as Geometry

Canvas {
    id: root
    property color accentColor: "#cacccc"
    layer.enabled: true
    layer.effect: MultiEffect { colorization: 1; colorizationColor: root.accentColor }
    readonly property url textureUrl: Qt.resolvedUrl("assets/reference-face.png")
    Component.onCompleted: { loadImage(textureUrl); if (active) powerOn() }
    onImageLoaded: requestPaint()
    property real mouthOpen: 0
    property real lipRound: 0
    property real lipWide: 0
    property bool active: true
    property string status: "idle"
    property real elapsed: 0
    property int startupSerial: 0
    property bool shuttingDown: false
    onShuttingDownChanged: { if (shuttingDown) { boot.stop(); shutdown.restart() } else shutdown.stop() }
    property real bootProgress: 1
    function powerOn() { shutdown.stop(); boot.restart() }
    onStartupSerialChanged: { if (active) powerOn() }
    onActiveChanged: { if (!active) { boot.stop(); shutdown.stop(); bootProgress = 1 } }
    onBootProgressChanged: requestPaint()
    NumberAnimation { id: shutdown; target: root; property: "bootProgress"; from: 1; to: 0; duration: 1230; easing.type: Easing.Linear }
    NumberAnimation { id: boot; target: root; property: "bootProgress"; from: 0; to: 1; duration: 1230; easing.type: Easing.Linear }
    property real motionStrength: status === "speaking" ? 1 : status === "listening" ? .70 : .65
    property real turn: (Math.sin(elapsed*.91)*.075 + Math.sin(elapsed*1.37)*.022) * motionStrength
    property real nod: (Math.sin(elapsed*1.73+.6)*.030 + Math.sin(elapsed*.67)*.014) * motionStrength
    property real tilt: Math.sin(elapsed*.73+.3)*.039 * motionStrength
    property real hover: Math.sin(elapsed * .85) * 1.4
    onHoverChanged: requestPaint()
    FrameAnimation { running: root.active && root.visible; onTriggered: root.elapsed += Math.min(frameTime, .05) }
    Behavior on motionStrength { NumberAnimation { duration: 600; easing.type: Easing.InOutSine } }
    antialiasing: true
    renderStrategy: Canvas.Cooperative
    onMouthOpenChanged: requestPaint()
    onLipRoundChanged: requestPaint()
    onLipWideChanged: requestPaint()
    onTurnChanged: requestPaint()
    onNodChanged: requestPaint()
    onTiltChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()
    onPaint: {
        const ctx = getContext("2d")
        ctx.clearRect(0, 0, width, height)
        const mesh = Geometry.mesh
        const scale = Math.min(width / 1.65, height / 2.16)
        const progress = root.bootProgress
        const instability = Math.pow(1 - progress, 2)
        // Vertical scan expands from a compressed band; damping settles the image.
        const expansion = Math.min(1, progress / .30)
        const scanHeight = .10 + .90 * expansion * expansion * (3 - 2 * expansion)
        const amounts = [Math.min(.85, Math.max(0, root.mouthOpen)), root.lipRound, root.lipWide]
        const shapes = [mesh.shapes.jawOpen, mesh.shapes.lipRound, mesh.shapes.lipWide]
        const points = mesh.vertices.map(function(v, i) {
            let x = v[0], y = v[1], z = v[2]
            for (let k = 0; k < shapes.length; k++) {
                x += shapes[k][i][0] * amounts[k]
                y += shapes[k][i][1] * amounts[k]
                z += shapes[k][i][2] * amounts[k]
            }
            const xx = x * Math.cos(root.turn) + z * Math.sin(root.turn)
            const zz = z * Math.cos(root.turn) - x * Math.sin(root.turn)
            const yy = y * Math.cos(root.nod) - zz * Math.sin(root.nod)
            // Orthographic projection preserves the proportions of the approved portrait.
            const rx = xx * Math.cos(root.tilt) - yy * Math.sin(root.tilt)
            const ry = xx * Math.sin(root.tilt) + yy * Math.cos(root.tilt)
            const band = ry * 5.4
            const horizontal = instability * scale * (.16 * Math.sin(band + progress * 47)
                + .065 * Math.sin(band * 2.3 - progress * 73))
            const vertical = instability * scale * .027 * Math.sin(progress * 39)
            const stretch = 1 + instability * .13 * Math.sin(progress * 35)
            return [width / 2 + rx * scale * stretch + horizontal,
                    height / 2 - ry * scale * scanHeight + root.hover + vertical, zz]
        })
        function path(ids) {
            ctx.beginPath(); ctx.moveTo(points[ids[0]][0], points[ids[0]][1])
            for (let j = 1; j < ids.length; j++) ctx.lineTo(points[ids[j]][0], points[ids[j]][1])
            ctx.closePath()
        }
        function paintTexture(t) {
            const a = mesh.uv[t[0]], b = mesh.uv[t[1]], c = mesh.uv[t[2]]
            const p = points[t[0]], q = points[t[1]], r = points[t[2]]
            const du1=b[0]-a[0], dv1=b[1]-a[1], du2=c[0]-a[0], dv2=c[1]-a[1]
            const determinant=du1*dv2-du2*dv1
            if (Math.abs(determinant)<.001) return
            const ax=((q[0]-p[0])*dv2-(r[0]-p[0])*dv1)/determinant
            const ay=((q[1]-p[1])*dv2-(r[1]-p[1])*dv1)/determinant
            const bx=((r[0]-p[0])*du1-(q[0]-p[0])*du2)/determinant
            const by=((r[1]-p[1])*du1-(q[1]-p[1])*du2)/determinant
            ctx.save(); path(t.slice(0,3)); ctx.clip()
            ctx.transform(ax,ay,bx,by,p[0]-ax*a[0]-bx*a[1],p[1]-ay*a[0]-by*a[1])
            ctx.drawImage(root.textureUrl,0,0); ctx.restore()
        }
        const front = new Set(mesh.triangles.slice(0,mesh.frontCount))
        const triangles = mesh.triangles.slice().sort((a,b) => (points[a[0]][2]+points[a[1]][2]+points[a[2]][2])-(points[b[0]][2]+points[b[1]][2]+points[b[2]][2]))
        for (let i = 0; i < triangles.length; i++) {
            const t = triangles[i], green = Math.min(255, t[3])
            path(t.slice(0,3))
            const p = points[t[0]], q = points[t[1]]
            const shade = ctx.createLinearGradient(p[0], p[1], q[0]+.01, q[1]+.01)
            shade.addColorStop(0, Qt.rgba(green*.075/255, green/255, green*.025/255, 1))
            shade.addColorStop(1, Qt.rgba(green*.065/255, green*.91/255, green*.022/255, 1))
            ctx.fillStyle = shade; ctx.fill()
            ctx.strokeStyle = Qt.rgba(green*.075/255, green*.96/255, green*.025/255, 1)
            ctx.lineWidth = .4; ctx.stroke()
            if (front.has(t) && isImageLoaded(root.textureUrl)) paintTexture(t)
        }
        // Cover rear cranium through the opening; this unlit cavity has no teeth.
        path(mesh.mouth); ctx.fillStyle = "#010101"; ctx.fill()

    }
    // PCM playback supplies a fresh pose every 20 ms. Interpolating each update
    // would continually restart the animation and smear short syllables.
}
