import QtQuick 2.15
import "chess.js" as Chess

// Chess for reMarkable (AppLoad). High contrast, no animations: e-ink friendly.
Rectangle {
    id: root
    color: "white"

    // Required by AppLoad on the root item
    signal close
    function unloading() { aiTimer.stop() }

    property var game: Chess.newGame({ mode: "ai", human: "w", level: 2 })

    // New-game dialog choices
    property bool showSetup: true
    property string optMode: "ai"
    property string optHuman: "w"
    property int optLevel: 2

    // Move list on/off. When off, the board grows to fill the screen width.
    property bool showMoves: false

    readonly property real pad: width * 0.04
    readonly property real gap: width * 0.02
    readonly property real border: Math.max(2, width * 0.003)
    readonly property real btnH: Math.max(48, height * 0.045)
    // Layout: roomy when the move list is shown, tight margins when the board fills the width.
    readonly property real edge: showMoves ? pad : Math.max(8, width * 0.012)
    readonly property real vgap: showMoves ? gap : Math.max(6, height * 0.005)
    readonly property real statusH: showMoves ? btnH * 1.1 : btnH * 0.85
    readonly property real capFactor: showMoves ? 0.42 : 0.36
    // Largest board that still leaves room for the header, captured pieces and buttons.
    readonly property real boardMaxH: (height - 2 * edge - 2 * btnH - statusH - 6 * vgap - 2 * border) / (1 + capFactor / 4)
    readonly property real boardSize: showMoves
        ? Math.min(width - 2 * pad, height * 0.57)
        : Math.min(width - 2 * edge - 2 * border, boardMaxH)
    readonly property real sq: boardSize / 8
    readonly property string topColor: game.flipped ? "w" : "b"
    readonly property string bottomColor: game.flipped ? "b" : "w"

    function setGame(g) {
        game = g
        // Let the screen show "thinking" before the computer starts searching.
        if (Chess.isAiTurn(g)) aiTimer.restart()
    }

    // E-ink refresh: flash the whole screen black briefly so the display does a
    // full update and clears ghosting. The game itself is untouched.
    property bool flashing: false
    function refreshScreen() {
        flashing = true
        flashTimer.restart()
    }
    Timer {
        id: flashTimer
        interval: 200
        repeat: false
        onTriggered: root.flashing = false
    }

    function startGame() {
        var human = optHuman === "r" ? (Math.random() < 0.5 ? "w" : "b") : optHuman
        showSetup = false
        setGame(Chess.newGame({ mode: optMode, human: human, level: optLevel }))
    }

    Timer {
        id: aiTimer
        interval: 250
        repeat: false
        onTriggered: root.setGame(Chess.aiMove(root.game))
    }

    // ---- reusable button --------------------------------------------------
    component Btn: Rectangle {
        id: btn
        property string label: ""
        property bool selected: false
        property bool active: true
        property real bw: 3
        signal clicked
        readonly property bool inverted: selected !== btnMa.pressed
        height: 60
        radius: 10
        color: inverted ? "black" : "white"
        border { color: active ? "black" : "#999"; width: btn.bw }
        Text {
            anchors.centerIn: parent
            text: btn.label
            font.pixelSize: btn.height * 0.42
            color: btn.inverted ? "white" : (btn.active ? "black" : "#999")
        }
        MouseArea {
            id: btnMa
            anchors.fill: parent
            enabled: btn.active
            onClicked: btn.clicked()
        }
    }

    // A row of captured pieces plus the material lead, for one player.
    component CapturedRow: Row {
        id: capRow
        property string side: "w"     // the player who captured these pieces
        property var game: null
        property var pieces: game ? Chess.captured(game, side === "w" ? "b" : "w") : []
        property int lead: game ? (side === "w" ? 1 : -1) * Chess.materialDiff(game) : 0
        spacing: -height * 0.25
        Repeater {
            model: capRow.pieces
            delegate: Image {
                width: capRow.height; height: capRow.height
                source: Chess.pieceImage(modelData)
                smooth: true
            }
        }
        Text {
            leftPadding: capRow.height * 0.4
            height: capRow.height
            verticalAlignment: Text.AlignVCenter
            text: capRow.lead > 0 ? "+" + capRow.lead : ""
            font.pixelSize: capRow.height * 0.6
            color: "black"
        }
    }

    // ---- header -----------------------------------------------------------
    Text {
        id: title
        anchors { left: parent.left; top: parent.top; leftMargin: root.edge; topMargin: root.edge }
        height: root.btnH
        verticalAlignment: Text.AlignVCenter
        text: "Chess"
        font.pixelSize: height * 0.7
        font.bold: true
        color: "black"
    }

    // Refresh button (top right)
    Rectangle {
        id: refreshBtn
        anchors { top: parent.top; right: parent.right; margins: root.edge }
        width: root.btnH; height: root.btnH
        radius: width / 2
        color: refreshMa.pressed ? "#b4b4b4" : "white"
        Image {
            anchors.fill: parent
            anchors.margins: parent.width * 0.06
            source: "icons/refresh.png"
            smooth: true
            fillMode: Image.PreserveAspectFit
        }
        MouseArea {
            id: refreshMa
            anchors.fill: parent
            anchors.margins: -root.gap      // a slightly bigger tap target
            onClicked: root.refreshScreen()
        }
    }

    Text {
        id: statusLine
        x: root.edge
        y: title.y + title.height + root.vgap
        width: root.width - 2 * root.edge
        height: root.statusH
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        text: Chess.statusText(root.game)
        font.pixelSize: height * 0.6
        font.bold: root.game.over || root.game.check
        fontSizeMode: Text.Fit
        minimumPixelSize: 16
        color: "black"
    }

    // ---- board ------------------------------------------------------------
    CapturedRow {
        id: topCaptured
        x: board.x
        y: statusLine.y + statusLine.height + root.vgap
        side: root.topColor
        game: root.game
        height: root.sq * root.capFactor
    }

    Rectangle {
        id: board
        width: root.boardSize + 2 * root.border
        height: width
        x: (root.width - width) / 2
        y: topCaptured.y + topCaptured.height + root.vgap
        color: "black"

        Grid {
            x: root.border; y: root.border
            columns: 8
            Repeater {
                model: 64
                delegate: Rectangle {
                    id: cell
                    readonly property int s: Chess.squareAt(root.game, index)
                    readonly property string piece: root.game.pos.b[s]
                    readonly property bool dark: Chess.isDark(s)
                    readonly property bool isTarget: root.game.hints && root.game.targets.indexOf(s) >= 0
                    readonly property bool isLast: root.game.last !== null && (root.game.last.f === s || root.game.last.t === s)
                    readonly property bool isCheckKing: root.game.check && root.game.pos.kings[root.game.pos.turn] === s
                    width: root.sq; height: root.sq
                    color: dark ? "#b4b4b4" : "white"

                    // last move: thin frame
                    Rectangle {
                        anchors.fill: parent
                        visible: cell.isLast && root.game.sel !== cell.s
                        color: "transparent"
                        border { color: "black"; width: root.sq * 0.04 }
                    }
                    // king in check: ring behind the piece
                    Rectangle {
                        anchors.centerIn: parent
                        width: parent.width * 0.94; height: width; radius: width / 2
                        visible: cell.isCheckKing
                        color: "transparent"
                        border { color: "black"; width: root.sq * 0.07 }
                    }
                    // selected square: thick frame
                    Rectangle {
                        anchors.fill: parent
                        visible: root.game.sel === cell.s
                        color: "transparent"
                        border { color: "black"; width: root.sq * 0.1 }
                    }
                    Image {
                        anchors.fill: parent
                        source: Chess.pieceImage(cell.piece)
                        visible: cell.piece !== ""
                        smooth: true
                        fillMode: Image.PreserveAspectFit
                    }
                    // legal destination: dot on empty squares, ring on captures
                    Rectangle {
                        anchors.centerIn: parent
                        visible: cell.isTarget
                        width: cell.piece === "" ? parent.width * 0.3 : parent.width * 0.96
                        height: width; radius: width / 2
                        color: cell.piece === "" ? "black" : "transparent"
                        border { color: "black"; width: cell.piece === "" ? 0 : root.sq * 0.06 }
                    }
                    // coordinates along the left and bottom edges
                    Text {
                        visible: index % 8 === 0
                        anchors { left: parent.left; top: parent.top; margins: root.sq * 0.05 }
                        text: "" + (8 - (cell.s >> 3))
                        font.pixelSize: root.sq * 0.2
                        color: cell.dark ? "white" : "#666"
                    }
                    Text {
                        visible: index >= 56
                        anchors { right: parent.right; bottom: parent.bottom; margins: root.sq * 0.05 }
                        text: Chess.FILES.charAt(cell.s & 7)
                        font.pixelSize: root.sq * 0.2
                        color: cell.dark ? "white" : "#666"
                    }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: root.setGame(Chess.tap(root.game, cell.s))
                    }
                }
            }
        }
    }

    CapturedRow {
        id: bottomCaptured
        x: board.x
        y: board.y + board.height + root.vgap
        side: root.bottomColor
        game: root.game
        height: root.sq * root.capFactor
    }

    // ---- move list & controls --------------------------------------------
    Text {
        id: moves
        visible: root.showMoves
        x: root.pad
        y: bottomCaptured.y + bottomCaptured.height + root.gap
        width: root.width - 2 * root.pad
        height: controls.y - y - root.gap
        text: root.game.sans.length ? Chess.movesText(root.game, 24) : "Moves will appear here."
        wrapMode: Text.WordWrap
        verticalAlignment: Text.AlignTop
        font.pixelSize: Math.max(16, root.btnH * 0.4)
        lineHeight: 1.15
        clip: true
        color: root.game.sans.length ? "black" : "#777"
    }

    Row {
        id: controls
        x: root.edge
        y: root.height - root.edge - root.btnH
        spacing: root.gap
        readonly property real w: (root.width - 2 * root.edge - 3 * root.gap) / 4
        Btn { height: root.btnH; bw: root.border; width: controls.w; label: "Menu"; onClicked: root.showSetup = true }
        Btn { height: root.btnH; bw: root.border
            width: controls.w; label: "Undo"
            active: Chess.canUndo(root.game) && !Chess.isAiTurn(root.game)
            onClicked: root.setGame(Chess.undo(root.game))
        }
        Btn { height: root.btnH; bw: root.border; width: controls.w; label: "Flip board"; onClicked: root.game = Chess.flip(root.game) }
        Btn {
            height: root.btnH; bw: root.border; width: controls.w
            label: root.showMoves ? "Moves: On" : "Moves: Off"
            onClicked: root.showMoves = !root.showMoves
        }
    }

    // ---- promotion picker -------------------------------------------------
    Rectangle {
        visible: root.game.promo !== null
        anchors.centerIn: board
        width: root.sq * 4 + 5 * root.gap
        height: root.sq * 1.8 + root.btnH
        color: "white"
        border { color: "black"; width: root.border * 2 }
        radius: 12
        MouseArea { anchors.fill: parent }    // swallow taps
        Text {
            id: promoTitle
            anchors { top: parent.top; horizontalCenter: parent.horizontalCenter; topMargin: root.gap }
            text: "Promote pawn to"
            font.pixelSize: root.sq * 0.25
            color: "black"
        }
        Row {
            anchors { top: promoTitle.bottom; horizontalCenter: parent.horizontalCenter; topMargin: root.gap }
            spacing: root.gap
            Repeater {
                model: ["q", "r", "b", "n"]
                delegate: Rectangle {
                    width: root.sq; height: root.sq
                    color: pMa.pressed ? "#b4b4b4" : "white"
                    border { color: "black"; width: root.border }
                    radius: 8
                    Image {
                        anchors.fill: parent
                        source: Chess.pieceImage(root.game.pos.turn === "w" ? modelData.toUpperCase() : modelData)
                        smooth: true
                    }
                    MouseArea { id: pMa; anchors.fill: parent; onClicked: root.setGame(Chess.promote(root.game, modelData)) }
                }
            }
        }
        Text {
            anchors { bottom: parent.bottom; horizontalCenter: parent.horizontalCenter; bottomMargin: root.gap * 0.6 }
            text: "Cancel"
            font.pixelSize: root.sq * 0.22
            font.underline: true
            color: "black"
            MouseArea { anchors.fill: parent; anchors.margins: -root.gap; onClicked: root.game = Chess.promote(root.game, "") }
        }
    }

    // ---- new game dialog --------------------------------------------------
    Rectangle {
        anchors.fill: parent
        visible: root.showSetup
        color: "white"
        MouseArea { anchors.fill: parent }    // swallow taps

        Column {
            id: setup
            anchors.centerIn: parent
            width: root.width - 4 * root.pad
            spacing: root.gap * 1.5
            readonly property real labelH: root.btnH * 0.8
            readonly property real w3: (setup.width - 2 * root.gap) / 3

            Text {
                width: setup.width
                horizontalAlignment: Text.AlignHCenter
                text: "Menu"
                font.pixelSize: root.btnH * 0.9
                font.bold: true
                color: "black"
            }

            Text { height: setup.labelH; verticalAlignment: Text.AlignBottom; text: "Opponent"; font.pixelSize: height * 0.6; color: "black" }
            Row {
                spacing: root.gap
                Btn { height: root.btnH; bw: root.border; width: (setup.width - root.gap) / 2; label: "Computer"; selected: root.optMode === "ai"; onClicked: root.optMode = "ai" }
                Btn { height: root.btnH; bw: root.border; width: (setup.width - root.gap) / 2; label: "Two players"; selected: root.optMode === "2p"; onClicked: root.optMode = "2p" }
            }

            Text {
                visible: root.optMode === "ai"
                height: setup.labelH; verticalAlignment: Text.AlignBottom; text: "Play as"; font.pixelSize: height * 0.6; color: "black"
            }
            Row {
                visible: root.optMode === "ai"
                spacing: root.gap
                Btn { height: root.btnH; bw: root.border; width: setup.w3; label: "White"; selected: root.optHuman === "w"; onClicked: root.optHuman = "w" }
                Btn { height: root.btnH; bw: root.border; width: setup.w3; label: "Black"; selected: root.optHuman === "b"; onClicked: root.optHuman = "b" }
                Btn { height: root.btnH; bw: root.border; width: setup.w3; label: "Random"; selected: root.optHuman === "r"; onClicked: root.optHuman = "r" }
            }

            Text {
                visible: root.optMode === "ai"
                height: setup.labelH; verticalAlignment: Text.AlignBottom; text: "Difficulty"; font.pixelSize: height * 0.6; color: "black"
            }
            Row {
                visible: root.optMode === "ai"
                spacing: root.gap
                Repeater {
                    model: Chess.LEVELS
                    delegate: Btn {
                        height: root.btnH; bw: root.border
                        width: setup.w3
                        label: modelData
                        selected: root.optLevel === index + 1
                        onClicked: root.optLevel = index + 1
                    }
                }
            }

            Item { width: 1; height: root.gap * 2 }

            Btn { width: setup.width; height: root.btnH * 1.3; bw: root.border; label: "Start new game"; selected: true; onClicked: root.startGame() }
            Btn { height: root.btnH; bw: root.border
                width: setup.width
                label: "Back to current game"
                visible: root.game.sans.length > 0 && !root.game.over
                onClicked: root.showSetup = false
            }

            Item { width: 1; height: root.gap * 2 }

            // Closing lives here, away from the board, so it can't be hit by accident.
            Btn {
                height: root.btnH; bw: root.border
                width: setup.width
                label: "Close Chess"
                onClicked: root.close()
            }
        }
    }

    // Full-screen black flash used by the refresh button (kept last so it sits on top)
    Rectangle {
        anchors.fill: parent
        visible: root.flashing
        color: "black"
        MouseArea { anchors.fill: parent }    // ignore taps during the flash
    }
}
