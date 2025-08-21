"use strict";

const globalWindow = window.top || window;
if (!globalWindow.miniApps) globalWindow.miniApps = {};

if (!localStorage.pawnStats) {
    localStorage.pawnStats = JSON.stringify({ wins: 0, losses: 0, draws: 0 });
}

const myColorByGame = {};

// Does not update properly
function updateStatistics(reason, myColor) {
    let stats = JSON.parse(localStorage.pawnStats);
    const reasonLower = reason.toLowerCase();

    if (reasonLower.includes("draw")) {
        stats.draws++;
    } else if (reasonLower.includes("white") || reasonLower.includes("black")) {
        // Nur werten, wenn myColor überhaupt gesetzt ist
        if (myColor === 'white' && reasonLower.includes("white")) stats.wins++;
        else if (myColor === 'black' && reasonLower.includes("black")) stats.wins++;
        else stats.losses++;
    } else if (reasonLower.includes("peer gave up")) {
        stats.wins++;
    } else if (reasonLower.includes("i gave up")) {
        stats.losses++;
    }

    localStorage.pawnStats = JSON.stringify(stats);
}



// Not used
function showPawnStats() {
    const stats = JSON.parse(localStorage.pawnStats || '{"wins":0,"losses":0,"draws":0}');
    const html = `
    <strong>My Pawn Chess Statistics</strong><br><br>
    🏆 Wins: ${stats.wins}<br>
    💀 Losses: ${stats.losses}<br>
    🤝 Draws: ${stats.draws}<br>
  `;
    document.getElementById("pawnchess_stats_text").innerHTML = html;
    document.getElementById("pawnchess_stats_overlay").style.display = "block";
}
// Not used
function closePawnStats() {
    document.getElementById("pawnchess_stats_overlay").style.display = "none";
}

globalWindow.miniApps["pawnchess"] = {
    handleRequest: function(command, args) {
        console.log("Pawn Chess handling request:", command);
        switch (command) {
            case "onBackPressed":
                if (PawnScenario == 'pawnchess-board') {
                    setPawnScenario('pawnchess-list');
                } else if (PawnScenario == 'pawnchess-list') {
                    quitApp();
                }
                break;
            case "plus_button":
                pawn_new_game();
                break;
            case "members_confirmed":
                pawn_new_game_confirmed();
                break;
            case "b2f_initialize":
            case "b2f_new_event":
                load_pawnchess_list();
                break;
            case "incoming_notification":
                console.log("Pawn Chess incoming_notification:", JSON.stringify(args, null, 2));
                pawn_on_rx(args.args);
                break;
        }
        return "Response from Pawn Chess";
    }
};

console.log("Pawn Chess loaded");

function pawn_new_game() {
    launchContactsMenu('Pawn Chess', 'Choose a contact to play with');
    readLogEntries(10);
}

function pawn_new_game_confirmed() {
    for (let m in tremola.contacts) {
        if (m != myId && document.getElementById(m).checked) {
            let nm = myId + "_" + m + "_" + Math.floor(Math.random() * 1000000);
            let json = { type: 'N', from: myId, to: m, nm: nm };
            writeLogEntry(JSON.stringify(json));
            break;
        }
    }
    if (curr_scenario == 'members') setPawnScenario('pawnchess-list');
}

function pawn_on_rx(args) {
    console.log("pawn_on_rx called with:", args);

    if (typeof tremola.pawnchess == "undefined")
        tremola.pawnchess = { active: {}, closed: {} };
    let ta = tremola.pawnchess.active;
    const msg = args[0];
    const nm = msg.nm;

    if (msg.type == 'N') {
        if (msg.from != myId && msg.to != myId) return;
        const amWhite = (msg.from === myId);

        myColorByGame[nm] = amWhite ? 'white' : 'black';

        ta[nm] = {
            peer: msg.to == myId ? msg.from : msg.to,
            state: msg.to == myId ? 'invited' : 'inviting',
            close_reason: '',
            board: pawn_init_board(!amWhite),
            color: amWhite ? 'white' : 'black',
            cnt: 0,
            history: []
        };

        persist();
        if (PawnScenario == 'pawnchess-list') load_pawnchess_list();
        return;
    }

    let g = ta[nm];
    if (!g) return;

    if (msg.type == 'A') {
        if (g.state == 'inviting' || g.state == 'invited') {
            g.state = 'open';
            persist();
            load_pawnchess_list();
        }
        return;
    }

    if (msg.type == 'E') {
        g.state = 'closed';
        g.close_reason = 'by ' + (msg.from == myId ? 'myself' : 'peer');
    }

    if (msg.type == 'G') {
        g.state = 'closed';
        g.close_reason = msg.reason || (msg.from === myId ? 'I gave up 🏳️' : 'peer gave up 🏳️');

        if (PawnScenario === 'pawnchess-board' && tremola.pawnchess.current === nm)
            load_pawnchess_board(nm);

        persist();
        if (PawnScenario === 'pawnchess-list')
            load_pawnchess_list();
        return;

    }

    if (msg.type == 'M') {
        const { fromX, fromY, toX, toY } = msg;
        let b = g.board;

        if (b[fromY][fromX] !== 0) {
            g.lastMove = { fromX, fromY, toX, toY };

            // Move history
            if (!g.history) g.history = [];
            g.history.push({ fromX, fromY, toX, toY, from: msg.from });

            // En-Passant
            if (Math.abs(toX - fromX) === 1 && b[toY][toX] === 0) {
                let capturedY = fromY;
                b[capturedY][toX] = 0;
            }

            b[toY][toX] = b[fromY][fromX];
            b[fromY][fromX] = 0;
            g.cnt++;

            checkPawnWin(g, nm);

            
            while (true) {
                const nextColor = (g.cnt % 2 === 0) ? 'white' : 'black';
                const oppColor = nextColor === 'white' ? 'black' : 'white';

                if (!hasLegalMoves(g.board, nextColor)) {
                    if (!hasLegalMoves(g.board, oppColor)) {
                        endGame(g, nm, 'Draw: both players blocked 🤝');
                        break;
                    } else {
                        console.log(`${capitalize(nextColor)} has no legal moves --> skipping`);
                        g.cnt++;
                        continue;
                    }
                }
                break;
            }
        }

        if (PawnScenario === 'pawnchess-board' && tremola.pawnchess.current == nm)
            load_pawnchess_board(nm);
    }

    persist();
    if (PawnScenario == 'pawnchess-list') load_pawnchess_list();
}


function checkPawnWin(g, nm) {
    const b = g.board;

    let whiteExists = false, blackExists = false;
    let whiteCanMove = false, blackCanMove = false;

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const val = b[y][x];

            if (val === 1) {
                whiteExists = true;
                if (y === 0) return endGame(g, nm, 'white reached end 🏆');
                if (y > 0 && b[y - 1][x] === 0) whiteCanMove = true;
                if (x > 0 && y > 0 && b[y - 1][x - 1] === -1) whiteCanMove = true;
                if (x < 7 && y > 0 && b[y - 1][x + 1] === -1) whiteCanMove = true;
            }

            if (val === -1) {
                blackExists = true;
                if (y === 7) return endGame(g, nm, 'black reached end 🏆');
                if (y < 7 && b[y + 1][x] === 0) blackCanMove = true;
                if (x > 0 && y < 7 && b[y + 1][x - 1] === 1) blackCanMove = true;
                if (x < 7 && y < 7 && b[y + 1][x + 1] === 1) blackCanMove = true;
            }
        }
    }

    if (!blackExists) return endGame(g, nm, 'white captured all 💀');
    if (!whiteExists) return endGame(g, nm, 'black captured all 💀');

    // stalemate: both players blocked
    if (!whiteCanMove && !blackCanMove)
        return endGame(g, nm, 'Draw: both sides blocked 🤝');
}

function endGame(g, nm, reason) {
    g.state = 'closed';
    g.close_reason = reason;
    writeLogEntry(JSON.stringify({ type: 'G', nm, from: myId, to: g.peer, reason }), g.peer);

    updateStatistics(reason, myColorByGame[nm]);

}

function load_pawnchess_list() {
    let lst = document.getElementById('div:pawnchess-list');
    lst.innerHTML = '';
    if (!tremola.pawnchess) tremola.pawnchess = { active: {}, closed: {} };
    for (let nm in tremola.pawnchess.active) {
        let g = tremola.pawnchess.active[nm];
        if (!g) continue;

        let item = document.createElement('div');
        let row;

        if (g.state === 'invited') {
            row = `<button class="pawnchess_list_button" onclick="pawn_list_action('${nm}', 'accept')">`;
        } else {
            row = `<button class="pawnchess_list_button"`;
            if (g.state !== 'inviting')
                row += ` onclick="load_pawnchess_board('${nm}')"`;
            row += '>';
        }

        row += `Pawn Chess with ${fid2display(g.peer)}<br>`;
        row += g.state;
        if (g.state === 'invited') row += " (click here to accept)";
        if (g.state === 'closed') row += " " + g.close_reason;
        row += `</button>`;

        let action;
        if (g.state === 'invited') action = 'decline';
        else if (g.state === 'closed') action = 'delete';
        else action = 'close';

        row += `<button class="pawnchess_list_button" onclick="pawn_list_action('${nm}', '${action}')">${action}</button>`;
        item.innerHTML = row;
        lst.appendChild(item);
    }
}

function pawn_list_action(nm, action) {
    let g = tremola.pawnchess.active[nm];
    if (action === 'accept') {
        writeLogEntry(JSON.stringify({ type: 'A', nm }));
    } else if (action === 'close' || action === 'decline') {
        writeLogEntry(JSON.stringify({ type: 'E', nm, from: myId }));
    } else if (action === 'delete') {
        delete tremola.pawnchess.active[nm];
        tremola.pawnchess.closed[nm] = g.peer;
        persist();
    }
    load_pawnchess_list();
}

function pawn_init_board(imBottom) {
    let b = [];
    for (let y = 0; y < 8; y++) {
        b[y] = [];
        for (let x = 0; x < 8; x++) {
            if (y == 1) b[y][x] = -1;
            else if (y == 6) b[y][x] = 1;
            else b[y][x] = 0;
        }
    }
    return b;
}

function load_pawnchess_board(nm) {
    console.log("load_pawnchess_board called with:", nm);
    let g = tremola.pawnchess.active[nm];
    if (!g || g.state === 'inviting') return;

    const isMyTurn = (g.color === 'white' && g.cnt % 2 === 0) || (g.color === 'black' && g.cnt % 2 === 1);

    let title = document.getElementById('pawnchess_title');
    title.innerHTML = g.state === 'open'
        ? `<strong>${isMyTurn ? 'your move...' : '...opponent\'s move'}</strong>`
        : `<font color=red><strong>Game closed: ${g.close_reason}</strong></font>`;

    const giveUpBtn = document.getElementById('pawn_give_up_button');
    const showHistoryBtn = document.getElementById('pawn_show_history_button');

    if (giveUpBtn) giveUpBtn.style.display = g.state === 'closed' ? 'none' : '';
    if (showHistoryBtn) showHistoryBtn.style.display = '';

    const table = document.getElementById('pawnchess_table');
    table.innerHTML = '';

    const letters = 'abcdefgh';

    // Adaptation of POV
    let y_iter = [...Array(8).keys()];
    let x_iter = [...Array(8).keys()];
    if (g.color === 'black') {
        y_iter.reverse();
        x_iter.reverse();
    }

    for (let y of y_iter) {
        for (let x of x_iter) {
            const cell = document.createElement('div');
            cell.classList.add('pawnchess_cell');

            const isLight = (x + y) % 2 === 0;
            cell.classList.add(isLight ? 'light' : 'dark');

            cell.dataset.row = y;
            cell.dataset.col = x;
            cell.dataset.rowNumber = 8 - y;
            cell.dataset.colLetter = letters[x];

            const val = g.board[y][x];
            if (val === 1) {
                cell.textContent = '♙';
            } else if (val === -1) {
                cell.textContent = '♟';
            }

            cell.id = `p_${x}_${y}`;
            cell.setAttribute('onclick', `pawn_click_cell(${x},${y})`);

            table.appendChild(cell);
        }
    }

    tremola.pawnchess.current = nm;
    setPawnScenario('pawnchess-board');
}

let pawn_selected = null;

function pawn_click_cell(x, y) {
    console.log("pawn_click_cell called", x, y);

    let nm = tremola.pawnchess.current;
    let g = tremola.pawnchess.active[nm];
    if (!g || g.state !== 'open') return;

    const isMyTurn = (g.color === 'white' && g.cnt % 2 === 0) ||
        (g.color === 'black' && g.cnt % 2 === 1);
    if (!isMyTurn) return;

    let val = g.board[y][x];

    if (!pawn_selected) {
        if ((g.color === 'white' && val === 1) || (g.color === 'black' && val === -1)) {
            pawn_selected = { x, y };
            document.getElementById(`p_${x}_${y}`).style.outline = '3px solid yellow';
            console.log("selected piece at", x, y);
        }
        return;
    }

    let fromX = pawn_selected.x;
    let fromY = pawn_selected.y;
    const dir = g.color === 'white' ? -1 : 1;


    if (x === fromX && val === 0) {
        // standart step
        if (y === fromY + dir) {
            sendPawnMove(nm, fromX, fromY, x, y);
        }
        // double step
        else if (
            (g.color === 'white' && fromY === 6 && y === 4) ||
            (g.color === 'black' && fromY === 1 && y === 3)
        ) {
            if (g.board[fromY + dir][fromX] === 0) {
                sendPawnMove(nm, fromX, fromY, x, y);
            } else {
                console.log("Intermediate field blocked during double step");
            }
        } else {
            console.log("Not a valid move");
        }
    }

    // diagonal capture
    else if (
        Math.abs(x - fromX) === 1 &&
        y === fromY + dir &&
        ((g.color === 'white' && val === -1) || (g.color === 'black' && val === 1))
    ) {
        sendPawnMove(nm, fromX, fromY, x, y);
    }

    // en Passant
    else if (
        Math.abs(x - fromX) === 1 &&
        y === fromY + dir &&
        val === 0 &&
        g.lastMove &&
        g.lastMove.fromY === fromY + 2 * dir &&
        g.lastMove.toY === fromY &&
        g.lastMove.toX === x &&
        g.board[fromY][x] === (g.color === 'white' ? -1 : 1)
    ) {
        sendPawnMove(nm, fromX, fromY, x, y);
    }
    else {
        console.log("illegal move / blocked target");
    }



    document.getElementById(`p_${fromX}_${fromY}`).style.outline = '';
    pawn_selected = null;
}

function sendPawnMove(nm, fromX, fromY, toX, toY) {
    const move = {
        type: 'M',
        nm,
        from: myId,
        fromX,
        fromY,
        toX,
        toY
    };
    //console.log("sending move", move);
    writeLogEntry(JSON.stringify(move));
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function hasLegalMoves(board, color) {
    const dir = (color === 'white') ? -1 : 1;
    const own = (color === 'white') ? 1 : -1;
    const opp = -own;

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            if (board[y][x] !== own) continue;

            const newY = y + dir;

            if (newY >= 0 && newY < 8 && board[newY][x] === 0)
                return true;

            if (
                (color === 'white' && y === 6 && board[5][x] === 0 && board[4][x] === 0) ||
                (color === 'black' && y === 1 && board[2][x] === 0 && board[3][x] === 0)
            ) return true;

            // capture left
            if (x > 0 && newY >= 0 && newY < 8 && board[newY][x - 1] === opp)
                return true;

            // capture right
            if (x < 7 && newY >= 0 && newY < 8 && board[newY][x + 1] === opp)
                return true;
        }
    }
    return false;
}
function showPawnHistory(nm) {
    const g = tremola.pawnchess.active[nm];
    if (!g || !g.history || g.history.length === 0) {
        document.getElementById("pawnchess_history_text").textContent = "(No move history yet 📖)";
    } else {
        let str = "";
        for (let i = 0; i < g.history.length; i++) {
            const move = g.history[i];
            const from = String.fromCharCode(97 + move.fromX) + (8 - move.fromY);
            const to = String.fromCharCode(97 + move.toX) + (8 - move.toY);
            const who = move.from === myId ? "you" : "opponent";
            str += `${i + 1}. ${who}: ${from} → ${to}\n`;
        }
        document.getElementById("pawnchess_history_text").textContent = str;
    }
    document.getElementById("pawnchess_history_overlay").style.display = "block";
}

function closePawnHistory() {
    document.getElementById("pawnchess_history_overlay").style.display = "none";
}

function pawn_give_up() {
    const nm = tremola.pawnchess.current;
    const g = tremola.pawnchess.active[nm];
    if (!g || g.state !== 'open') return;

    const msg = {
        type: 'G',
        nm: nm,
        from: myId
    };

    writeLogEntry(JSON.stringify(msg), g.peer); // sending to peer
    writeLogEntry(JSON.stringify(msg));         // logging for self

    g.state = 'closed';
    g.close_reason = 'I gave up';

    load_pawnchess_board(nm);
    load_pawnchess_list();
    persist();
}









