import QtQuick

Canvas {
    id: root
    property color tint: "#080808"
    onTintChanged: requestPaint()
    property real feather: 100
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()
    onFeatherChanged: requestPaint()
    onPaint: {
        if (width <= 0 || height <= 0) return
        const ctx = getContext("2d")
        ctx.clearRect(0, 0, width, height)
        ctx.globalCompositeOperation = "source-over"
        ctx.fillStyle = root.tint
        ctx.fillRect(0, 0, width, height)
        // Independent straight edge fades keep a rectangular silhouette.
        // Only the outer band fades: bright wallpaper stays hidden behind text.
        function mask(horizontal) {
            const size = horizontal ? width : height
            const edge = Math.min(root.feather / size, .49)
            const gradient = ctx.createLinearGradient(0, 0, horizontal ? width : 0, horizontal ? 0 : height)
            // Smooth first and second derivatives at both ends avoid a visible
            // start/end to the fade, with enough stops to hide linear segments.
            const stops = []
            for (let i = 0; i <= 32; i++) {
                const t = i / 32
                stops.push([t, t*t*t*(t*(t*6-15)+10)])
            }
            for (let i = 0; i < stops.length; i++)
                gradient.addColorStop(stops[i][0] * edge, "rgba(0,0,0," + stops[i][1] + ")")
            for (let i = stops.length - 1; i >= 0; i--)
                gradient.addColorStop(1 - stops[i][0] * edge, "rgba(0,0,0," + stops[i][1] + ")")
            ctx.globalCompositeOperation = "destination-in"
            ctx.fillStyle = gradient
            ctx.fillRect(0, 0, width, height)
        }
        mask(true)
        mask(false)
        ctx.globalCompositeOperation = "source-over"
    }
}
