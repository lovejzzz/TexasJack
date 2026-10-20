/* Heads-up duel simulator for the Saloon Ladder: the real dealer betting AI
   from rules.js against fixed player policies, hand by hand and as matches.
   Usage: node scripts/simulate-duel.cjs [handsPerPolicy] */
const rules = require('../rules.js');

const HANDS = Number(process.argv[2] || 20000);
let seed = 20261019;
const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const total = cards => rules.cardsTotal(cards).total;

function shuffled() {
    const deck = [];
    for (const suit of ['S', 'H', 'D', 'C']) {
        for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) deck.push({ rank, suit });
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

/* Player policies see what a player sees: their own total and the dealer's
   public board total. ctx = { p, dealerBoardTotal, toCall, pot, canRaise }. */
/* The thinking player: estimates their own chance the same way the dealer
   does, sampling the dealer's hidden card from what is unseen, then bets by
   strength and pot odds. This is the benchmark for 'plays well'. */
function playerStrength(player, dealerBoard, board, standsOn, privateLeft) {
    const seen = new Set([...player, ...board].map(c => c.rank + c.suit));
    const unseen = [];
    for (const suit of ['S', 'H', 'D', 'C']) {
        for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) {
            if (!seen.has(rank + suit)) unseen.push({ rank, suit });
        }
    }
    let score = 0, n = 0;
    for (let s = 0; s < 100; s++) {
        const pile = unseen.slice();
        const take = () => pile.splice(Math.floor(rng() * pile.length), 1)[0];
        const dealer = [take()];
        if (total([...dealer, ...dealerBoard]) > 21) continue;
        const me = player.slice(), b = board.slice(), db = dealerBoard.slice();
        let left = privateLeft, result = null;
        while (total([...me, ...b]) < 17) {
            const c = take();
            if (left > 0 && total([...me, ...b]) >= 12) { me.push(c); left -= 1; }
            else { b.push(c); if (total([...dealer, ...db]) < standsOn) db.push(c); }
            if (total([...me, ...b]) > 21) { result = 0; break; }
            if (total([...dealer, ...db]) > 21) { result = 1; break; }
        }
        if (result === null) {
            const p = total([...me, ...b]);
            for (;;) {
                const d = rules.cardsTotal([...dealer, ...db]);
                if (!rules.dealerMove({ dealerTotal: d.total, playerTotal: p, soft: d.soft, standsOn }).draw) break;
                dealer.push(take());
                if (total([...dealer, ...db]) > 21) break;
            }
            const d = total([...dealer, ...db]);
            result = d > 21 || p > d ? 1 : p === d ? 0.5 : 0;
        }
        score += result; n += 1;
    }
    return n ? score / n : 0.5;
}

const POLICIES = {
    thinking: {
        open: c => (c.s >= 0.6 || (c.s < 0.25 && c.roll < 0.12) ? 'bet' : 'check'),
        face: c => (c.canRaise && c.s >= 0.72 ? 'raise' : c.s >= c.toCall / (c.pot + c.toCall) ? 'call' : 'fold')
    },
    reasonable: {
        open: c => (c.p >= 18 || (c.p >= 15 && c.dealerBoardTotal >= 14) ? 'bet' : 'check'),
        face: c => (c.canRaise && c.p >= 20 ? 'raise'
            : c.p >= 16 || c.toCall / (c.pot + c.toCall) <= 0.2 ? 'call' : 'fold')
    },
    bluffer: { open: () => 'bet', face: c => (c.canRaise ? 'raise' : 'call') },
    station: { open: () => 'check', face: () => 'call' },
    passive: { open: () => 'check', face: c => (c.p >= 17 ? 'call' : 'fold') }
};

function playHand(rival, ante, policy, reads = { foldsToYou: 0, bluffsSeen: 0 }) {
    const memory = rules.duelMemory(rival, reads);
    const deck = shuffled();
    const draw = () => deck.pop();
    const player = [draw()], dealer = [draw()], board = [], dBoard = [];
    const lay = card => {
        board.push(card);
        if (total([...dealer, ...dBoard]) < rival.standsOn) { dBoard.push(card); return true; }
        return false;
    };
    let boost = lay(draw());
    let pIn = ante, dIn = ante, round = 0, privateLeft = 2, aggression = 0;
    const stats = { dealerFolds: 0, dealerFacing: 0, playerFolds: 0 };
    const pNow = () => total([...player, ...board]);

    const bettingRound = () => {
        round += 1;
        const unit = rules.duelBetSize(ante, round);
        let actor = 'player', facing = false, raises = 0, dealerChecked = false;
        for (let guard = 0; guard < 10; guard++) {
            const toCall = actor === 'player' ? dIn - pIn : pIn - dIn;
            const canRaise = raises < rival.maxRaises;
            let act;
            if (actor === 'player') {
                const ctx = { p: pNow(), dealerBoardTotal: total(dBoard), toCall, pot: pIn + dIn, canRaise, roll: rng() };
                if (policy === 'thinking') ctx.s = playerStrength(player, dBoard, board, rival.standsOn, privateLeft);
                act = facing ? POLICIES[policy].face(ctx) : POLICIES[policy].open(ctx);
                if (act === 'raise' && !canRaise) act = 'call';
            } else {
                const strength = rules.duelStrength({
                    dealerCards: dealer, dealerBoard: dBoard, shared: board,
                    playerPrivateCount: player.length, privateLeft, standsOn: rival.standsOn,
                    aggression, belief: memory.belief, samples: 120, rng
                });
                act = rules.duelDealerAction({
                    strength, facing, toCall, pot: pIn + dIn, rival,
                    raisesLeft: rival.maxRaises - raises, boardBoost: boost,
                    roll: rng(), jitter: (rng() - 0.5) * 0.06, callShift: memory.callShift
                });
                if (facing) stats.dealerFacing += 1;
            }
            if (act === 'fold') {
                if (actor === 'dealer') { stats.dealerFolds += 1; if (aggression > 0) reads.foldsToYou += 1; }
                else stats.playerFolds += 1;
                return actor;
            }
            if (act === 'check') {
                if (actor === 'dealer') return null;
                actor = 'dealer';
                continue;
            }
            if (act === 'call') {
                if (actor === 'player') pIn = dIn; else dIn = pIn;
                return null;
            }
            // bet or raise
            if (actor === 'player') { pIn = dIn + unit; aggression += 1; } else dIn = pIn + unit;
            if (act === 'raise') raises += 1;
            facing = true;
            actor = actor === 'player' ? 'dealer' : 'player';
        }
        return null;
    };

    const settle = (net, extra = {}) => ({ net, ...stats, ...extra });
    let folded = bettingRound();
    if (folded) return settle(folded === 'dealer' ? dIn : -pIn);

    while (pNow() < 17) {
        const card = draw();
        if (privateLeft > 0 && pNow() >= 12) { player.push(card); privateLeft -= 1; boost = false; }
        else boost = lay(card);
        if (pNow() > 21) return settle(-pIn);
        if (total([...dealer, ...dBoard]) > 21) return settle(dIn + (pNow() === 21 ? ante : 0));
        if (round < rules.DUEL_ROUNDS) {
            folded = bettingRound();
            if (folded) return settle(folded === 'dealer' ? dIn : -pIn);
        }
    }
    const p = pNow();
    if (aggression > 0 && p < 17) reads.bluffsSeen += 1;
    for (;;) {
        const d = rules.cardsTotal([...dealer, ...dBoard]);
        const move = rules.dealerMove({ dealerTotal: d.total, playerTotal: p, soft: d.soft, standsOn: rival.standsOn });
        if (!move.draw) break;
        dealer.push(draw());
        if (total([...dealer, ...dBoard]) > 21) break;
    }
    const d = total([...dealer, ...dBoard]);
    if (d > 21 || p > d) return settle(dIn + (p === 21 ? ante : 0));
    if (d > p) return settle(-pIn);
    return settle(0);
}

function playMatch(rival, policy, stake) {
    let purse = rival.purse, hands = 0;
    const reads = { foldsToYou: 0, bluffsSeen: 0 };
    for (;;) {
        const ante = rules.duelAnte(rival, hands);
        if (purse < ante) return { won: true, hands, stake: stake + rival.bounty };
        if (stake < ante) return { won: false, hands, stake };
        // Contributions cannot exceed what either side holds.
        const net = Math.max(-stake, Math.min(purse, playHand(rival, ante, policy, reads).net));
        stake += net; purse -= net; hands += 1;
        if (hands > 400) return { won: false, hands, stake };
    }
}

// Typical stake on arrival: $500 at Mara, then her purse and bounty carried up.
const ARRIVAL_STAKE = { rock: 500, shark: 900, spark: 1500 };
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const rows = [];
for (const rival of rules.ladderRivals) {
    for (const policy of Object.keys(POLICIES).filter(name => !ONLY || ONLY.includes(name))) {
        let net = 0, dealerFolds = 0, facing = 0;
        for (let i = 0; i < HANDS; i++) {
            const r = playHand(rival, 10, policy);
            net += r.net; dealerFolds += r.dealerFolds; facing += r.dealerFacing;
        }
        let wins = 0, hands = 0;
        const MATCHES = Math.round(HANDS / 20);
        for (let i = 0; i < MATCHES; i++) {
            const m = playMatch(rival, policy, ARRIVAL_STAKE[rival.id]);
            wins += m.won; hands += m.hands;
        }
        rows.push({
            rival: rival.name, policy,
            evPerAnte: +(net / HANDS / 10).toFixed(3),
            dealerFoldRate: facing ? `${(dealerFolds / facing * 100).toFixed(0)}%` : '—',
            matchWin: `${(wins / MATCHES * 100).toFixed(0)}%`,
            avgHands: +(hands / MATCHES).toFixed(1)
        });
    }
}
console.table(rows);
