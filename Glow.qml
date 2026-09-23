import QtQuick

Canvas {
    id: root
    property color accentColor: "#cacccc"
    onAccentColorChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()
    onPaint: {
        const ctx = getContext("2d")
        ctx.clearRect(0, 0, width, height)
        ctx.save()
        ctx.scale(1, height / width)
        const glow = ctx.createRadialGradient(width/2, width/2, 0, width/2, width/2, width/2)
        glow.addColorStop(0, Qt.rgba(accentColor.r*.59, accentColor.g*.59, accentColor.b*.59, .32))
        glow.addColorStop(.35, Qt.rgba(accentColor.r*.49, accentColor.g*.49, accentColor.b*.49, .21))
        glow.addColorStop(.65, Qt.rgba(accentColor.r*.31, accentColor.g*.31, accentColor.b*.31, .06))
        glow.addColorStop(1, Qt.rgba(accentColor.r, accentColor.g, accentColor.b, 0))
        ctx.fillStyle = glow
        ctx.fillRect(0, 0, width, width)
        ctx.restore()
    }
}
