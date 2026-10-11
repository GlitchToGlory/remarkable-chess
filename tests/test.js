// Run with: node tests/test.js
// Loads src/qml/chess.js the same way the web demo does and checks the rules engine.
var fs = require("fs");
var path = require("path");

var src = fs.readFileSync(path.join(__dirname, "..", "src", "qml", "chess.js"), "utf8");
var C = new Function(src.replace(/^\.pragma library.*$/m, "") +
    "; return { parseFEN, toFEN, perft, legalMoves, san, newGame, tap, promote, aiMove, undo," +
    " bestMove, sqIndex, sqName, isAiTurn, statusText, movesText, captured, insufficientMaterial, START_FEN };")();

var failed = 0, passed = 0;
function eq(name, got, want) {
    if (got === want) { passed++; }
    else { failed++; console.log("FAIL " + name + ": got " + JSON.stringify(got) + ", want " + JSON.stringify(want)); }
}

// ---- perft: counts every legal move sequence; standard reference values ----
var deep = process.argv.indexOf("--deep") >= 0;
var PERFT = [
    [C.START_FEN, [20, 400, 8902, 197281]],
    // "Kiwipete": castling, en passant, promotions, pins
    ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", [48, 2039, 97862]],
    ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812, 43238]],
    ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", [6, 264, 9467]],
    ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486, 62379]],
    ["r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", [46, 2079, 89890]]
];
PERFT.forEach(function (t, idx) {
    var depths = deep ? t[1].length : Math.min(3, t[1].length);
    for (var d = 1; d <= depths; d++) {
        eq("perft #" + idx + " depth " + d, C.perft(C.parseFEN(t[0]), d), t[1][d - 1]);
    }
});

// ---- FEN round trip ----
eq("fen roundtrip", C.toFEN(C.parseFEN(PERFT[1][0])), PERFT[1][0]);

// ---- playing moves through the UI layer ----
function play(g, from, to, promo) {
    g = C.tap(g, C.sqIndex(from));
    g = C.tap(g, C.sqIndex(to));
    if (promo) g = C.promote(g, promo);
    return g;
}

// Fool's mate in two-player mode
var g = C.newGame({ mode: "2p" });
g = play(g, "f2", "f3"); g = play(g, "e7", "e5"); g = play(g, "g2", "g4"); g = play(g, "d8", "h4");
eq("fool's mate over", g.over, true);
eq("fool's mate result", g.result, "Checkmate. Black wins.");
eq("fool's mate SAN", g.sans.join(" "), "f3 e5 g4 Qh4#");
eq("moves text", C.movesText(g), "1. f3 e5  2. g4 Qh4#");

// Illegal tap does nothing
g = C.newGame({ mode: "2p" });
var g2 = play(g, "e2", "e5");
eq("illegal move ignored", g2.sans.length, 0);

// Can't move opponent's pieces
g2 = play(g, "e7", "e5");
eq("wrong side ignored", g2.sans.length, 0);

// Undo in two-player mode undoes one ply
g = play(C.newGame({ mode: "2p" }), "e2", "e4");
g = C.undo(g);
eq("undo 2p", g.sans.length, 0);
eq("undo 2p turn", g.pos.turn, "w");

// Castling, en passant and promotion SAN
g = C.newGame({ mode: "2p", fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1" });
g = play(g, "e1", "g1");
eq("castle short", g.sans[0], "O-O");
eq("rook moved", g.pos.b[C.sqIndex("f1")], "R");
g = play(g, "e8", "c8");
eq("castle long", g.sans[1], "O-O-O");
eq("black rook moved", g.pos.b[C.sqIndex("d8")], "r");

g = C.newGame({ mode: "2p", fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1" });
g = play(g, "e5", "d6");
eq("en passant SAN", g.sans[0], "exd6");
eq("en passant removes pawn", g.pos.b[C.sqIndex("d5")], "");

g = C.newGame({ mode: "2p", fen: "4k3/1P6/8/8/8/8/8/4K3 w - - 0 1" });
g = play(g, "b7", "b8");
eq("promotion pending", !!g.promo, true);
g = C.promote(g, "n");
eq("underpromotion", g.pos.b[C.sqIndex("b8")], "N");
eq("promotion SAN", g.sans[0], "b8=N");

// Disambiguation
g = C.newGame({ mode: "2p", fen: "4k3/8/8/8/8/8/4K3/R6R w - - 0 1" });
g = play(g, "a1", "d1");
eq("rook disambiguation", g.sans[0], "Rad1");

// ---- draws ----
g = C.newGame({ mode: "2p", fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1" });
eq("stalemate", g.result, "Stalemate. It's a draw.");
eq("insufficient K+B v K", C.insufficientMaterial(C.parseFEN("8/8/4k3/8/8/2B5/8/4K3 w - - 0 1")), true);
eq("sufficient K+R v K", C.insufficientMaterial(C.parseFEN("8/8/4k3/8/8/2R5/8/4K3 w - - 0 1")), false);
g = C.newGame({ mode: "2p" });
["g1 f3", "g8 f6", "f3 g1", "f6 g8", "g1 f3", "g8 f6", "f3 g1", "f6 g8"].forEach(function (m) {
    var p = m.split(" "); g = play(g, p[0], p[1]);
});
eq("threefold repetition", g.result, "Draw by threefold repetition.");

// ---- computer opponent ----
function aiFinds(name, fen, want, level) {
    for (var lv = 1; lv <= 3; lv++) {
        if (level && lv !== level) continue;
        var m = C.bestMove(C.parseFEN(fen), lv);
        eq(name + " (level " + lv + ")", m ? C.sqName(m.f) + C.sqName(m.t) : null, want);
    }
}
aiFinds("mate in one", "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", "a1a8");
aiFinds("grab free queen", "4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1", "d1d5");
aiFinds("back-rank mate", "k7/8/1K6/8/8/8/8/7R w - - 0 1", "h1h8");
aiFinds("avoid hanging queen", "4k3/8/8/8/3r4/8/3Q4/4K3 w - - 0 1", "d2d4", 3);

// AI plays as black after the human's move, and undo returns to the human's turn
g = C.newGame({ mode: "ai", human: "w", level: 1 });
g = play(g, "e2", "e4");
eq("ai turn", C.isAiTurn(g), true);
eq("status thinking", C.statusText(g), "Computer is thinking…");
g = C.aiMove(g);
eq("ai replied", g.sans.length, 2);
eq("human turn again", C.isAiTurn(g), false);
g = C.undo(g);
eq("undo vs ai", g.sans.length, 0);

// Human as black: computer moves first
g = C.newGame({ mode: "ai", human: "b", level: 2 });
eq("flipped for black", g.flipped, true);
eq("hints on medium", g.hints, true);
eq("no hints on hard", C.newGame({ mode: "ai", level: 3 }).hints, false);
eq("hints in two-player", C.newGame({ mode: "2p", level: 3 }).hints, true);
eq("ai opens", C.isAiTurn(g), true);

// Hard level game against itself finishes without errors and in reasonable time
var t0 = Date.now(), gw = C.newGame({ mode: "2p" }), plies = 0;
while (!gw.over && plies < 40) {
    var m = C.bestMove(gw.pos, 3, gw.keys);
    gw = C.tap(gw, m.f); gw = C.tap(gw, m.t); if (m.pr) gw = C.promote(gw, m.pr);
    plies++;
}
eq("self-play advanced", gw.sans.length, plies);
var ms = (Date.now() - t0) / plies;
console.log("hard level: " + Math.round(ms) + " ms per move on this machine");

// Time limit: with a tiny limit the computer still returns a legal move quickly
var tStart = Date.now();
var quick = C.bestMove(C.parseFEN(PERFT[1][0]), 3, null, 5);
eq("time-limited move found", !!quick, true);
eq("time limit respected", Date.now() - tStart < 500, true);

// Captured pieces
g = C.newGame({ mode: "2p", fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1" });
eq("all captured", C.captured(g, "b").join(""), "qrrbbnnpppppppp");

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
