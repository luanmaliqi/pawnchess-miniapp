"use strict";

var PawnScenario = null;

function setPawnScenario(s) {
    console.log("setPawnScenario", s);

    console.log("scenarioDisplay", scenarioDisplay);

    var lst = scenarioDisplay[s];
    console.log("scenarioDisplay", lst);
    load_pawnchess_list();

    display_or_not.forEach(function (d) {
        console.log(d);
        let element = document.getElementById(d);
        if (element) {
            if (lst.indexOf(d) < 0) {
                element.style.display = 'none';
            } else {
                element.style.display = null;
            }
        } else {
            console.warn(`Element with ID '${d}' not found.`);
        }
    });

    PawnScenario = s;

    if (s == 'pawnchess-list') {
        document.getElementById("tremolaTitle").style.display = 'none';
        var c = document.getElementById("conversationTitle");
        c.style.display = null;
        c.innerHTML = "<font size=+1><strong>Pawn Chess</strong><br>Pick or create a new game</font>";
        load_pawnchess_list();
    }

    if (s == 'pawnchess-board') {
        document.getElementById("tremolaTitle").style.display = 'none';
        var c = document.getElementById("conversationTitle");
        c.style.display = null;
        let peer = tremola.pawnchess.active[tremola.pawnchess.current].peer;
        c.innerHTML = `<font size=+1><strong>Pawn Chess with ${fid2display(peer)}</strong></font>`;
    }
}
