import QtQuick
QtObject {
    property color accent: "#cacccc"
    function mix(a, b, weight) { return Qt.tint(a, Qt.rgba(b.r, b.g, b.b, weight)) }
    readonly property color text: mix("#a0a0a0", accent, .45)
    readonly property color secondary: mix("#808080", accent, .38)
    readonly property color muted: mix("#656565", accent, .30)
    readonly property color surface: mix("#080808", accent, .025)
    readonly property color field: mix("#101010", accent, .035)
    readonly property color selected: mix("#181818", accent, .06)
    readonly property color border: mix("#303030", accent, .15)
}
