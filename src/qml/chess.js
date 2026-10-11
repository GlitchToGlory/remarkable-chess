.pragma library
// Chess rules + computer opponent, shared by the reMarkable QML app and the web demo.
// Plain ES5 so it runs unchanged in QML's JS engine, browsers and Node.
//
// Board: array of 64 strings, index 0 = a8 ... 63 = h1. "" = empty square,
// "PNBRQK" = white pieces, "pnbrqk" = black pieces.

var FILES = "abcdefgh";
var START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
var LEVELS = ["Easy", "Medium", "Hard"];

// ---- basics ---------------------------------------------------------------

function sqName(s) { return FILES.charAt(s & 7) + (8 - (s >> 3)); }
function sqIndex(n) { return (8 - parseInt(n.charAt(1), 10)) * 8 + FILES.indexOf(n.charAt(0)); }
function colorOf(p) { return p === "" ? "" : (p === p.toUpperCase() ? "w" : "b"); }
function other(c) { return c === "w" ? "b" : "w"; }

// Castling rights bitmask: 1 = K, 2 = Q, 4 = k, 8 = q.
// CR[sq] is ANDed into the rights whenever a move starts or ends on sq.
var CR = [];
(function () {
    for (var i = 0; i < 64; i++) CR.push(15);
    CR[56] = 13; CR[63] = 14; CR[60] = 12;   // a1, h1, e1
    CR[0] = 7;   CR[7] = 11;  CR[4] = 3;     // a8, h8, e8
})();

function parseFEN(fen) {
    var parts = String(fen).replace(/^\s+|\s+$/g, "").split(/\s+/);
    var rows = parts[0].split("/");
    if (rows.length !== 8) throw new Error("Bad FEN");
    var b = [];
    for (var r = 0; r < 8; r++) {
        for (var i = 0; i < rows[r].length; i++) {
            var ch = rows[r].charAt(i);
            if (ch >= "1" && ch <= "8") { for (var k = 0; k < +ch; k++) b.push(""); }
            else if ("pnbrqkPNBRQK".indexOf(ch) >= 0) b.push(ch);
            else throw new Error("Bad FEN");
        }
        if (b.length !== (r + 1) * 8) throw new Error("Bad FEN");
    }
    var castle = 0, cs = parts[2] || "-";
    if (cs.indexOf("K") >= 0) castle |= 1;
    if (cs.indexOf("Q") >= 0) castle |= 2;
    if (cs.indexOf("k") >= 0) castle |= 4;
    if (cs.indexOf("q") >= 0) castle |= 8;
    var pos = {
        b: b,
        turn: parts[1] === "b" ? "b" : "w",
        castle: castle,
        ep: (!parts[3] || parts[3] === "-") ? -1 : sqIndex(parts[3]),
        half: parts[4] ? parseInt(parts[4], 10) : 0,
        full: parts[5] ? parseInt(parts[5], 10) : 1,
        kings: { w: b.indexOf("K"), b: b.indexOf("k") }
    };
    if (pos.kings.w < 0 || pos.kings.b < 0) throw new Error("Bad FEN: missing king");
    return pos;
}

function toFEN(pos) {
    var rows = [];
    for (var r = 0; r < 8; r++) {
        var s = "", e = 0;
        for (var c = 0; c < 8; c++) {
            var p = pos.b[r * 8 + c];
            if (p === "") { e++; } else { if (e) { s += e; e = 0; } s += p; }
        }
        if (e) s += e;
        rows.push(s);
    }
    var cs = (pos.castle & 1 ? "K" : "") + (pos.castle & 2 ? "Q" : "") +
             (pos.castle & 4 ? "k" : "") + (pos.castle & 8 ? "q" : "");
    return rows.join("/") + " " + pos.turn + " " + (cs || "-") + " " +
           (pos.ep >= 0 ? sqName(pos.ep) : "-") + " " + pos.half + " " + pos.full;
}

function clonePos(pos) {
    return { b: pos.b.slice(), turn: pos.turn, castle: pos.castle, ep: pos.ep,
             half: pos.half, full: pos.full, kings: { w: pos.kings.w, b: pos.kings.b } };
}

// Identity of a position for repetition detection.
function posKey(pos) {
    var s = "";
    for (var i = 0; i < 64; i++) s += pos.b[i] || ".";
    return s + pos.turn + pos.castle + pos.ep;
}

// ---- attacks & move generation -------------------------------------------

var KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
var KING   = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
var DIAG   = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
var ORTH   = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Is square sq attacked by side `by`?
function attacked(b, sq, by) {
    var r = sq >> 3, c = sq & 7, i, rr, cc, p;
    var w = by === "w";
    var pr = w ? r + 1 : r - 1, pawn = w ? "P" : "p";
    if (pr >= 0 && pr < 8) {
        if (c > 0 && b[pr * 8 + c - 1] === pawn) return true;
        if (c < 7 && b[pr * 8 + c + 1] === pawn) return true;
    }
    var kn = w ? "N" : "n", kg = w ? "K" : "k", bi = w ? "B" : "b", rk = w ? "R" : "r", qn = w ? "Q" : "q";
    for (i = 0; i < 8; i++) {
        rr = r + KNIGHT[i][0]; cc = c + KNIGHT[i][1];
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === kn) return true;
        rr = r + KING[i][0]; cc = c + KING[i][1];
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === kg) return true;
    }
    for (i = 0; i < 4; i++) {
        rr = r + DIAG[i][0]; cc = c + DIAG[i][1];
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
            p = b[rr * 8 + cc];
            if (p !== "") { if (p === bi || p === qn) return true; break; }
            rr += DIAG[i][0]; cc += DIAG[i][1];
        }
        rr = r + ORTH[i][0]; cc = c + ORTH[i][1];
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
            p = b[rr * 8 + cc];
            if (p !== "") { if (p === rk || p === qn) return true; break; }
            rr += ORTH[i][0]; cc += ORTH[i][1];
        }
    }
    return false;
}

function inCheck(pos) { return attacked(pos.b, pos.kings[pos.turn], other(pos.turn)); }

// Move: { f: from, t: to, p: piece, x: captured piece ("" if none),
//         pr: promotion type ("q","r","b","n") or "", k: "n" normal | "d" double push | "e" en passant | "c" castle }
function mv(f, t, p, x, pr, k) { return { f: f, t: t, p: p, x: x, pr: pr, k: k }; }

function addPawn(list, f, t, p, x, k) {
    var tr = t >> 3;
    if (tr === 0 || tr === 7) {
        list.push(mv(f, t, p, x, "q", k)); list.push(mv(f, t, p, x, "r", k));
        list.push(mv(f, t, p, x, "b", k)); list.push(mv(f, t, p, x, "n", k));
    } else {
        list.push(mv(f, t, p, x, "", k));
    }
}

// Pseudo-legal moves (may leave own king in check). capturesOnly: captures and promotions.
function pseudoMoves(pos, capturesOnly) {
    var b = pos.b, side = pos.turn, list = [], sq, p, r, c, i, rr, cc, t, q, dirs;
    for (sq = 0; sq < 64; sq++) {
        p = b[sq];
        if (p === "" || colorOf(p) !== side) continue;
        r = sq >> 3; c = sq & 7;
        var type = p.toLowerCase();
        if (type === "p") {
            var dir = side === "w" ? -1 : 1, start = side === "w" ? 6 : 1;
            rr = r + dir;
            if (rr < 0 || rr > 7) continue;
            t = rr * 8 + c;
            if (b[t] === "") {
                if (!capturesOnly || rr === 0 || rr === 7) addPawn(list, sq, t, p, "", "n");
                if (!capturesOnly && r === start && b[t + dir * 8] === "") list.push(mv(sq, t + dir * 8, p, "", "", "d"));
            }
            for (i = -1; i <= 1; i += 2) {
                cc = c + i;
                if (cc < 0 || cc > 7) continue;
                t = rr * 8 + cc;
                if (b[t] !== "" && colorOf(b[t]) !== side) addPawn(list, sq, t, p, b[t], "n");
                else if (t === pos.ep && b[t] === "") list.push(mv(sq, t, p, side === "w" ? "p" : "P", "", "e"));
            }
        } else if (type === "n" || type === "k") {
            var steps = type === "n" ? KNIGHT : KING;
            for (i = 0; i < 8; i++) {
                rr = r + steps[i][0]; cc = c + steps[i][1];
                if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
                t = rr * 8 + cc; q = b[t];
                if (q === "") { if (!capturesOnly) list.push(mv(sq, t, p, "", "", "n")); }
                else if (colorOf(q) !== side) list.push(mv(sq, t, p, q, "", "n"));
            }
            if (type === "k" && !capturesOnly) addCastles(pos, list, side);
        } else {
            dirs = type === "b" ? DIAG : type === "r" ? ORTH : DIAG.concat(ORTH);
            for (i = 0; i < dirs.length; i++) {
                rr = r + dirs[i][0]; cc = c + dirs[i][1];
                while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
                    t = rr * 8 + cc; q = b[t];
                    if (q === "") { if (!capturesOnly) list.push(mv(sq, t, p, "", "", "n")); }
                    else { if (colorOf(q) !== side) list.push(mv(sq, t, p, q, "", "n")); break; }
                    rr += dirs[i][0]; cc += dirs[i][1];
                }
            }
        }
    }
    return list;
}

function addCastles(pos, list, side) {
    var b = pos.b, opp = other(side);
    if (side === "w") {
        if (b[60] !== "K" || attacked(b, 60, opp)) return;
        if ((pos.castle & 1) && b[63] === "R" && b[61] === "" && b[62] === "" &&
            !attacked(b, 61, opp) && !attacked(b, 62, opp)) list.push(mv(60, 62, "K", "", "", "c"));
        if ((pos.castle & 2) && b[56] === "R" && b[59] === "" && b[58] === "" && b[57] === "" &&
            !attacked(b, 59, opp) && !attacked(b, 58, opp)) list.push(mv(60, 58, "K", "", "", "c"));
    } else {
        if (b[4] !== "k" || attacked(b, 4, opp)) return;
        if ((pos.castle & 4) && b[7] === "r" && b[5] === "" && b[6] === "" &&
            !attacked(b, 5, opp) && !attacked(b, 6, opp)) list.push(mv(4, 6, "k", "", "", "c"));
        if ((pos.castle & 8) && b[0] === "r" && b[3] === "" && b[2] === "" && b[1] === "" &&
            !attacked(b, 3, opp) && !attacked(b, 2, opp)) list.push(mv(4, 2, "k", "", "", "c"));
    }
}

// Plays m on pos in place. Returns the info unmakeMove needs.
function makeMove(pos, m) {
    var b = pos.b, side = pos.turn;
    var u = { castle: pos.castle, ep: pos.ep, half: pos.half };
    b[m.t] = m.pr ? (side === "w" ? m.pr.toUpperCase() : m.pr) : m.p;
    b[m.f] = "";
    if (m.k === "e") b[m.t + (side === "w" ? 8 : -8)] = "";
    else if (m.k === "c") {
        if (m.t === 62) { b[61] = "R"; b[63] = ""; }
        else if (m.t === 58) { b[59] = "R"; b[56] = ""; }
        else if (m.t === 6) { b[5] = "r"; b[7] = ""; }
        else if (m.t === 2) { b[3] = "r"; b[0] = ""; }
    }
    if (m.p === "K") pos.kings.w = m.t;
    else if (m.p === "k") pos.kings.b = m.t;
    pos.castle &= CR[m.f] & CR[m.t];
    pos.ep = m.k === "d" ? (m.f + m.t) / 2 : -1;
    pos.half = (m.p === "P" || m.p === "p" || m.x !== "") ? 0 : pos.half + 1;
    if (side === "b") pos.full++;
    pos.turn = other(side);
    return u;
}

function unmakeMove(pos, m, u) {
    var b = pos.b;
    pos.turn = other(pos.turn);
    var side = pos.turn;
    b[m.f] = m.p;
    if (m.k === "e") { b[m.t] = ""; b[m.t + (side === "w" ? 8 : -8)] = m.x; }
    else b[m.t] = m.x;
    if (m.k === "c") {
        if (m.t === 62) { b[63] = "R"; b[61] = ""; }
        else if (m.t === 58) { b[56] = "R"; b[59] = ""; }
        else if (m.t === 6) { b[7] = "r"; b[5] = ""; }
        else if (m.t === 2) { b[0] = "r"; b[3] = ""; }
    }
    if (m.p === "K") pos.kings.w = m.f;
    else if (m.p === "k") pos.kings.b = m.f;
    pos.castle = u.castle; pos.ep = u.ep; pos.half = u.half;
    if (side === "b") pos.full--;
}

function legalMoves(pos, capturesOnly) {
    var list = pseudoMoves(pos, capturesOnly), out = [], side = pos.turn, opp = other(side);
    for (var i = 0; i < list.length; i++) {
        var u = makeMove(pos, list[i]);
        if (!attacked(pos.b, pos.kings[side], opp)) out.push(list[i]);
        unmakeMove(pos, list[i], u);
    }
    return out;
}

function insufficientMaterial(pos) {
    var minors = [], i, p;
    for (i = 0; i < 64; i++) {
        p = pos.b[i];
        if (p === "" || p === "K" || p === "k") continue;
        var t = p.toLowerCase();
        if (t === "p" || t === "r" || t === "q") return false;
        minors.push({ t: t, sq: i });
    }
    if (minors.length <= 1) return true;
    // Only bishops, all on squares of one colour.
    var shade = -1;
    for (i = 0; i < minors.length; i++) {
        if (minors[i].t !== "b") return false;
        var s = ((minors[i].sq >> 3) + (minors[i].sq & 7)) & 1;
        if (shade < 0) shade = s; else if (s !== shade) return false;
    }
    return true;
}

// Standard algebraic notation. `legal` = legal moves of pos (optional).
function san(pos, m, legal) {
    var s;
    if (m.k === "c") s = (m.t & 7) === 6 ? "O-O" : "O-O-O";
    else {
        var type = m.p.toUpperCase();
        if (type === "P") {
            s = m.x !== "" ? FILES.charAt(m.f & 7) + "x" : "";
            s += sqName(m.t);
            if (m.pr) s += "=" + m.pr.toUpperCase();
        } else {
            s = type;
            legal = legal || legalMoves(pos);
            var amb = false, sameFile = false, sameRank = false;
            for (var i = 0; i < legal.length; i++) {
                var o = legal[i];
                if (o.p === m.p && o.t === m.t && o.f !== m.f) {
                    amb = true;
                    if ((o.f & 7) === (m.f & 7)) sameFile = true;
                    if ((o.f >> 3) === (m.f >> 3)) sameRank = true;
                }
            }
            if (amb) {
                if (!sameFile) s += FILES.charAt(m.f & 7);
                else if (!sameRank) s += (8 - (m.f >> 3));
                else s += sqName(m.f);
            }
            if (m.x !== "") s += "x";
            s += sqName(m.t);
        }
    }
    var u = makeMove(pos, m);
    if (inCheck(pos)) s += legalMoves(pos).length === 0 ? "#" : "+";
    unmakeMove(pos, m, u);
    return s;
}

// Number of leaf nodes at a given depth (used by the tests to verify move generation).
function perft(pos, depth) {
    if (depth === 0) return 1;
    var moves = legalMoves(pos), n = 0;
    if (depth === 1) return moves.length;
    for (var i = 0; i < moves.length; i++) {
        var u = makeMove(pos, moves[i]);
        n += perft(pos, depth - 1);
        unmakeMove(pos, moves[i], u);
    }
    return n;
}

// ---- evaluation -----------------------------------------------------------

var VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables (white's view, index 0 = a8). From the "Simplified Evaluation Function".
var PST = {
    p: [ 0,  0,  0,  0,  0,  0,  0,  0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
         5,  5, 10, 25, 25, 10,  5,  5,
         0,  0,  0, 20, 20,  0,  0,  0,
         5, -5,-10,  0,  0,-10, -5,  5,
         5, 10, 10,-20,-20, 10, 10,  5,
         0,  0,  0,  0,  0,  0,  0,  0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -20,-10,-10,-10,-10,-10,-10,-20],
    r: [ 0,  0,  0,  0,  0,  0,  0,  0,
         5, 10, 10, 10, 10, 10, 10,  5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
         0,  0,  0,  5,  5,  0,  0,  0],
    q: [-20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5,  5,  5,  5,  0,-10,
         -5,  0,  5,  5,  5,  5,  0, -5,
          0,  0,  5,  5,  5,  5,  0, -5,
        -10,  5,  5,  5,  5,  5,  0,-10,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20,
        -10,-20,-20,-20,-20,-20,-20,-10,
         20, 20,  0,  0,  0,  0, 20, 20,
         20, 30, 10,  0,  0, 10, 30, 20],
    ke: [-50,-40,-30,-20,-20,-30,-40,-50,
         -30,-20,-10,  0,  0,-10,-20,-30,
         -30,-10, 20, 30, 30, 20,-10,-30,
         -30,-10, 30, 40, 40, 30,-10,-30,
         -30,-10, 30, 40, 40, 30,-10,-30,
         -30,-10, 20, 30, 30, 20,-10,-30,
         -30,-30,  0,  0,  0,  0,-30,-30,
         -50,-30,-30,-30,-30,-30,-30,-50]
};

function centreDist(sq) {
    var r = sq >> 3, c = sq & 7;
    return Math.max(3 - r, r - 4) + Math.max(3 - c, c - 4);
}

// Score in centipawns from the point of view of the side to move.
function evaluate(pos) {
    var b = pos.b, mat = { w: 0, b: 0 }, pst = { w: 0, b: 0 }, pawns = { w: 0, b: 0 }, i, p, col, t;
    for (i = 0; i < 64; i++) {
        p = b[i];
        if (p === "" ) continue;
        col = colorOf(p); t = p.toLowerCase();
        if (t === "k") continue;
        if (t === "p") pawns[col] += 100; else mat[col] += VALUE[t];
        pst[col] += PST[t][col === "w" ? i : (7 - (i >> 3)) * 8 + (i & 7)];
    }
    var endgame = mat.w + mat.b <= 2600;
    var kt = endgame ? PST.ke : PST.k;
    var kw = pos.kings.w, kb = pos.kings.b;
    pst.w += kt[kw];
    pst.b += kt[(7 - (kb >> 3)) * 8 + (kb & 7)];
    var score = (mat.w + pawns.w + pst.w) - (mat.b + pawns.b + pst.b);
    // Mop-up: when clearly winning an endgame, drive the enemy king to the edge
    // and bring our king closer, so the computer can actually deliver mate.
    if (endgame) {
        var diff = (mat.w + pawns.w) - (mat.b + pawns.b);
        if (Math.abs(diff) >= 300) {
            var win = diff > 0 ? "w" : "b";
            var wk = pos.kings[win], lk = pos.kings[other(win)];
            var dist = Math.abs((wk >> 3) - (lk >> 3)) + Math.abs((wk & 7) - (lk & 7));
            var bonus = centreDist(lk) * 10 + (14 - dist) * 4;
            score += win === "w" ? bonus : -bonus;
        }
    }
    return pos.turn === "w" ? score : -score;
}

// ---- search ---------------------------------------------------------------

var MATE = 100000, INF = 1000000;
var MAX_THINK_MS = 20000;   // the computer always moves within 20 seconds

// Level settings: depth, node budget, random noise added to root scores.
var LEVEL_CFG = [
    { depth: 1, budget: 20000, noise: 90 },   // Easy
    { depth: 2, budget: 30000, noise: 20 },   // Medium
    { depth: 4, budget: 45000, noise: 0 }     // Hard
];

function orderScore(m) {
    var s = 0;
    if (m.x !== "") s += 10 * VALUE[m.x.toLowerCase()] - VALUE[m.p.toLowerCase()] + 1000;
    if (m.pr === "q") s += 900;
    return s;
}
function sortMoves(moves, first) {
    for (var i = 0; i < moves.length; i++) {
        moves[i].o = orderScore(moves[i]);
        if (first && moves[i].f === first.f && moves[i].t === first.t && moves[i].pr === first.pr) moves[i].o = 1e9;
    }
    moves.sort(function (a, b) { return b.o - a.o; });
}

// Stop when the node budget or the time limit is used up (clock checked every 256 nodes).
function outOfTime(ctx) {
    ctx.nodes++;
    if (ctx.nodes > ctx.budget || ((ctx.nodes & 255) === 0 && Date.now() > ctx.deadline)) ctx.abort = true;
    return ctx.abort;
}

function quiesce(ctx, pos, alpha, beta, ply) {
    if (outOfTime(ctx)) return 0;
    var stand = evaluate(pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 24) return stand;
    var moves = legalMoves(pos, true);
    sortMoves(moves, null);
    for (var i = 0; i < moves.length; i++) {
        var u = makeMove(pos, moves[i]);
        var s = -quiesce(ctx, pos, -beta, -alpha, ply + 1);
        unmakeMove(pos, moves[i], u);
        if (ctx.abort) return 0;
        if (s >= beta) return s;
        if (s > alpha) alpha = s;
    }
    return alpha;
}

function search(ctx, pos, depth, alpha, beta, ply) {
    if (outOfTime(ctx)) return 0;
    if (pos.half >= 100) return 0;
    var key = posKey(pos);
    if (pos.half >= 4 && ctx.seen[key]) return 0;     // repetition = draw
    var check = inCheck(pos);
    if (check && ply < 10) depth++;                     // check extension
    if (depth <= 0) return quiesce(ctx, pos, alpha, beta, ply);
    var moves = legalMoves(pos);
    if (moves.length === 0) return check ? -MATE + ply : 0;
    sortMoves(moves, null);
    ctx.seen[key] = (ctx.seen[key] || 0) + 1;
    var best = -INF;
    for (var i = 0; i < moves.length; i++) {
        var u = makeMove(pos, moves[i]);
        var s = -search(ctx, pos, depth - 1, -beta, -alpha, ply + 1);
        unmakeMove(pos, moves[i], u);
        if (ctx.abort) break;
        if (s > best) best = s;
        if (s > alpha) alpha = s;
        if (alpha >= beta) break;
    }
    ctx.seen[key]--;
    return best;
}

// Picks a move for the side to move. history = position keys of the game so far.
// maxMs (optional) overrides the 20-second thinking limit.
function bestMove(pos, level, history, maxMs) {
    var cfg = LEVEL_CFG[Math.max(0, Math.min(2, (level || 1) - 1))];
    var p = clonePos(pos);
    var ctx = { nodes: 0, budget: cfg.budget, abort: false, seen: {},
                deadline: Date.now() + (maxMs || MAX_THINK_MS) };
    var hist = history || [];
    for (var h = 0; h < hist.length - 1; h++) ctx.seen[hist[h]] = (ctx.seen[hist[h]] || 0) + 1;
    var rootKey = posKey(p);
    ctx.seen[rootKey] = (ctx.seen[rootKey] || 0) + 1;

    var moves = legalMoves(p);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    var best = moves[0], bestScore = -INF;
    for (var depth = 1; depth <= cfg.depth; depth++) {
        sortMoves(moves, best);
        var alpha = -INF, dBest = null, dScore = -INF;
        for (var i = 0; i < moves.length; i++) {
            var u = makeMove(p, moves[i]);
            // With noise every root move needs an exact score, so use a full window.
            var s = -search(ctx, p, depth - 1, -INF, cfg.noise ? INF : -alpha, 1);
            unmakeMove(p, moves[i], u);
            if (ctx.abort) break;
            if (cfg.noise && Math.abs(s) < MATE / 2) s += Math.floor(Math.random() * cfg.noise);
            if (s > dScore) { dScore = s; dBest = moves[i]; }
            if (s > alpha) alpha = s;
        }
        if (ctx.abort) {
            // Use a partial result if it is all we have, or if it beats the previous depth's choice.
            if (dBest && (depth === 1 || dScore > bestScore)) { best = dBest; }
            break;
        }
        best = dBest; bestScore = dScore;
        if (bestScore >= MATE - 50) break;   // found a forced mate
    }
    return best;
}

// ---- game state (used by the UI) -----------------------------------------
// A game is a plain object; every action returns a new game object so QML bindings update.

function copyGame(g) { var n = {}; for (var k in g) n[k] = g[k]; return n; }

function newGame(opts) {
    opts = opts || {};
    var pos = parseFEN(opts.fen || START_FEN);
    var mode = opts.mode === "2p" ? "2p" : "ai";
    var human = opts.human === "b" ? "b" : "w";
    var g = {
        pos: pos, mode: mode, human: human, level: opts.level || 2,
        flipped: mode === "ai" && human === "b",
        // Legal-move hints are shown except against the Hard computer.
        hints: !(mode === "ai" && (opts.level || 2) >= 3),
        sel: -1, targets: [], last: null, promo: null,
        sans: [], keys: [posKey(pos)], history: [],
        legal: [], check: false, over: false, result: ""
    };
    return refresh(g);
}

function refresh(g) {
    var pos = g.pos;
    g.legal = legalMoves(pos);
    g.check = inCheck(pos);
    g.result = "";
    if (g.legal.length === 0) {
        if (g.check) {
            var winner = other(pos.turn);
            if (g.mode === "ai") g.result = winner === g.human ? "Checkmate. You win!" : "Checkmate. The computer wins.";
            else g.result = "Checkmate. " + (winner === "w" ? "White" : "Black") + " wins.";
        } else g.result = "Stalemate. It's a draw.";
    } else if (pos.half >= 100) g.result = "Draw by the 50-move rule.";
    else if (insufficientMaterial(pos)) g.result = "Draw: not enough material to mate.";
    else {
        var k = g.keys[g.keys.length - 1], n = 0;
        for (var i = 0; i < g.keys.length; i++) if (g.keys[i] === k) n++;
        if (n >= 3) g.result = "Draw by threefold repetition.";
    }
    g.over = g.result !== "";
    return g;
}

function isAiTurn(g) { return g.mode === "ai" && !g.over && g.pos.turn !== g.human; }

function applyMove(g, m) {
    var n = copyGame(g);
    n.history = g.history.concat([{ pos: clonePos(g.pos), last: g.last }]);
    n.sans = g.sans.concat([san(clonePos(g.pos), m, g.legal)]);
    n.pos = clonePos(g.pos);
    makeMove(n.pos, m);
    n.keys = g.keys.concat([posKey(n.pos)]);
    n.last = { f: m.f, t: m.t };
    n.sel = -1; n.targets = []; n.promo = null;
    return refresh(n);
}

// Player taps board square sq.
function tap(g, sq) {
    if (g.over || g.promo || isAiTurn(g)) return g;
    var n, i, p = g.pos.b[sq];
    if (g.sel >= 0 && g.targets.indexOf(sq) >= 0) {
        var ms = [];
        for (i = 0; i < g.legal.length; i++) if (g.legal[i].f === g.sel && g.legal[i].t === sq) ms.push(g.legal[i]);
        if (ms[0].pr) { n = copyGame(g); n.promo = { f: g.sel, t: sq }; return n; }
        return applyMove(g, ms[0]);
    }
    n = copyGame(g);
    if (p !== "" && colorOf(p) === g.pos.turn && sq !== g.sel) {
        n.sel = sq; n.targets = [];
        for (i = 0; i < g.legal.length; i++) if (g.legal[i].f === sq) n.targets.push(g.legal[i].t);
    } else { n.sel = -1; n.targets = []; }
    return n;
}

// Finish a pending promotion with type "q", "r", "b" or "n" ("" cancels).
function promote(g, type) {
    if (!g.promo) return g;
    if (!type) { var n = copyGame(g); n.promo = null; n.sel = -1; n.targets = []; return n; }
    for (var i = 0; i < g.legal.length; i++) {
        var m = g.legal[i];
        if (m.f === g.promo.f && m.t === g.promo.t && m.pr === type) return applyMove(g, m);
    }
    return g;
}

function aiMove(g) {
    if (!isAiTurn(g)) return g;
    var m = bestMove(g.pos, g.level, g.keys);
    return m ? applyMove(g, m) : g;
}

function canUndo(g) { return g.history.length > 0; }

function undo(g) {
    if (!g.history.length) return g;
    var k = 1;
    if (g.mode === "ai") {
        var h = g.history;
        // Go back to the player's turn (normally undoes the computer's reply too).
        if (h[h.length - 1].pos.turn !== g.human && h.length >= 2) k = 2;
    }
    var e = g.history[g.history.length - k];
    var n = copyGame(g);
    n.pos = clonePos(e.pos); n.last = e.last;
    n.history = g.history.slice(0, g.history.length - k);
    n.sans = g.sans.slice(0, g.sans.length - k);
    n.keys = g.keys.slice(0, g.keys.length - k);
    n.sel = -1; n.targets = []; n.promo = null;
    return refresh(n);
}

function flip(g) { var n = copyGame(g); n.flipped = !g.flipped; return n; }

// ---- view helpers ---------------------------------------------------------

// Board square shown at view position vi (0 = top-left of the screen).
function squareAt(g, vi) { return g.flipped ? 63 - vi : vi; }
function isDark(sq) { return (((sq >> 3) + (sq & 7)) & 1) === 1; }
function pieceImage(p) { return p === "" ? "" : "pieces/" + colorOf(p) + p.toUpperCase() + ".png"; }

function statusText(g) {
    if (g.over) return g.result;
    if (g.promo) return "Promote to:";
    if (isAiTurn(g)) return "Computer is thinking…";
    var who = g.mode === "ai" ? "Your move" : (g.pos.turn === "w" ? "White to move" : "Black to move");
    return g.check ? who + ". Check!" : who;
}

// Numbered move list, e.g. "1. e4 e5 2. Nf3". maxPlies limits it to the most recent plies.
function movesText(g, maxPlies) {
    var start = 0;
    if (maxPlies && g.sans.length > maxPlies) { start = g.sans.length - maxPlies; if (start % 2) start++; }
    var parts = [];
    for (var i = start; i < g.sans.length; i += 2) {
        parts.push(((i / 2) + 1) + ". " + g.sans[i] + (i + 1 < g.sans.length ? " " + g.sans[i + 1] : ""));
    }
    return (start > 0 ? "… " : "") + parts.join("  ");
}

// Pieces of `color` that have been captured, most valuable first (handles promotions).
function captured(g, color) {
    var counts = { p: 8, n: 2, b: 2, r: 2, q: 1 }, i, p, t;
    var have = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    for (i = 0; i < 64; i++) {
        p = g.pos.b[i];
        if (p === "" || colorOf(p) !== color) continue;
        t = p.toLowerCase();
        if (t !== "k") have[t]++;
    }
    // A promoted piece above its starting count must have come from a pawn.
    var extra = 0, order = ["q", "r", "b", "n"];
    for (i = 0; i < order.length; i++) if (have[order[i]] > counts[order[i]]) extra += have[order[i]] - counts[order[i]];
    var out = [];
    for (i = 0; i < order.length; i++) {
        t = order[i];
        for (var k = have[t]; k < counts[t]; k++) out.push(color === "w" ? t.toUpperCase() : t);
    }
    for (k = have.p + extra; k < counts.p; k++) out.push(color === "w" ? "P" : "p");
    return out;
}

// Material balance in pawns from white's view (for "+3" next to captured pieces).
function materialDiff(g) {
    var s = 0;
    for (var i = 0; i < 64; i++) {
        var p = g.pos.b[i];
        if (p === "") continue;
        var v = VALUE[p.toLowerCase()];
        s += colorOf(p) === "w" ? v : -v;
    }
    return Math.round(s / 100);
}
