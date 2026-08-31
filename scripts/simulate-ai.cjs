const rules = require('../rules.js');

const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10', '10', '10'];

function rng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function deckFor(random) {
    const deck = [];
    for (let suit = 0; suit < 4; suit += 1) deck.push(...ranks);
    for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function total(cards) {
    let value = 0;
    let aces = 0;
    for (const rank of cards) {
        if (rank === 'A') {
            value += 11;
            aces += 1;
        } else {
            value += rank === '10' ? 10 : Number(rank);
        }
    }
    while (value > 21 && aces > 0) {
        value -= 10;
        aces -= 1;
    }
    return { total: value, soft: aces > 0 && value <= 21 };
}

function playHand(random, adaptive) {
    const deck = deckFor(random);
    const draw = () => deck.pop();
    const player = [draw()];
    const dealer = [draw()];
    const shared = [draw()];
    const dealerBoard = [...shared];
    let dealerDraws = 0;
    let chases = 0;
    let tieAttacks = 0;
    let protectsBelow17 = 0;
    let pressureAvailable = true;

    // A deliberately plain player policy gives both dealer versions the same
    // opponent: draw below 17, otherwise stand. Dealer's Call routing remains
    // unchanged so this isolates the showdown AI.
    while (total([...player, ...shared]).total < 17) {
        const card = draw();
        if (total([...dealer, ...dealerBoard]).total < 17) {
            shared.push(card);
            dealerBoard.push(card);
        } else {
            player.push(card);
        }
        const p = total([...player, ...shared]).total;
        const d = total([...dealer, ...dealerBoard]).total;
        if (p > 21) return { result: 'lose', dealerDraws, chases, tieAttacks, protectsBelow17 };
        if (d > 21) return { result: 'win', dealerDraws, chases, tieAttacks, protectsBelow17 };
    }

    const p = total([...player, ...shared]).total;
    while (true) {
        const dState = total([...dealer, ...dealerBoard]);
        const move = adaptive
            ? rules.dealerMove({
                dealerTotal: dState.total,
                playerTotal: p,
                soft: dState.soft,
                pressureAvailable
            })
            : { draw: dState.total < 17, intent: 'house-rule' };
        if (!move.draw) {
            if (adaptive && move.intent === 'protect' && dState.total < 17) protectsBelow17 += 1;
            break;
        }
        if (move.usesCounter) {
            pressureAvailable = false;
            chases += 1;
        }
        if (move.intent === 'attack-tie') tieAttacks += 1;
        dealer.push(draw());
        dealerDraws += 1;
        if (total([...dealer, ...dealerBoard]).total > 21) break;
    }

    const d = total([...dealer, ...dealerBoard]).total;
    const result = d > 21 || p > d ? 'win' : d > p ? 'lose' : 'push';
    return { result, dealerDraws, chases, tieAttacks, protectsBelow17 };
}

function batch(hands, adaptive, seed) {
    const random = rng(seed);
    const stats = { hands, win: 0, lose: 0, push: 0, dealerDraws: 0, chases: 0, tieAttacks: 0, protectsBelow17: 0 };
    for (let i = 0; i < hands; i += 1) {
        const hand = playHand(random, adaptive);
        stats[hand.result] += 1;
        stats.dealerDraws += hand.dealerDraws;
        stats.chases += hand.chases;
        stats.tieAttacks += hand.tieAttacks;
        stats.protectsBelow17 += hand.protectsBelow17;
    }
    return {
        hands,
        playerWin: `${(stats.win / hands * 100).toFixed(2)}%`,
        dealerWin: `${(stats.lose / hands * 100).toFixed(2)}%`,
        push: `${(stats.push / hands * 100).toFixed(2)}%`,
        dealerDrawsPerHand: Number((stats.dealerDraws / hands).toFixed(3)),
        chaseMoments: stats.chases,
        tieAttacks: stats.tieAttacks,
        protectedLeadsBelow17: stats.protectsBelow17
    };
}

const hands = Math.max(50, Number(process.argv[2]) || 50000);
console.table({
    fixed17: batch(hands, false, 0x715ac),
    adaptive: batch(hands, true, 0x715ac)
});
