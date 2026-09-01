const rules = require('../rules.js');

const ANTE = 100;
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

function wantsPress(policy, drawsTaken, playerScore) {
    if (policy === 'opening') return drawsTaken === 0;
    if (policy === 'late-strong') return drawsTaken >= 1 && playerScore >= 18;
    if (policy === 'strong-read') return playerScore >= 18;
    return policy === 'every';
}

function tryPress(state, policy, playerScore) {
    if (!wantsPress(policy, state.drawsTaken, playerScore) || state.pressedAtDraw === state.drawsTaken) return;
    const offer = rules.pressOffer({
        ante: ANTE,
        bankroll: 100000,
        drawsTaken: state.drawsTaken,
        pressedTotal: state.pressTotal,
        pressedAtDraw: state.pressedAtDraw,
        scoutLocked: false
    });
    if (offer.amount <= 0) return;
    state.wager += offer.amount;
    state.pressTotal += offer.amount;
    state.pressedAtDraw = state.drawsTaken;
    state.pressure = Math.min(3, state.pressure + rules.pressureGain({
        drawsTaken: state.drawsTaken,
        scoutUsed: false
    }));
}

function settle(state, result, playerScore, dealerScore) {
    const bounty = rules.counterBounty({
        ante: ANTE,
        pressure: state.pressure,
        counterUsed: state.counterUsed,
        outcome: result
    });
    let profit = 0;
    if (result === 'win') profit = state.wager * (playerScore === 21 ? 1.5 : 1) + bounty;
    else if (result === 'lose') profit = -state.wager;
    return {
        result,
        profit,
        bounty,
        wager: state.wager,
        pressure: state.pressure,
        counterUsed: state.counterUsed,
        counterBust: state.counterUsed && dealerScore > 21,
        dealerDraws: state.dealerDraws,
        tieAttack: state.tieAttack
    };
}

function playHand(sourceDeck, { adaptive, pressPolicy }) {
    const deck = [...sourceDeck];
    const draw = () => deck.pop();
    const player = [draw()];
    const dealer = [draw()];
    const shared = [draw()];
    const dealerBoard = [...shared];
    const state = {
        wager: ANTE,
        pressTotal: 0,
        pressure: 0,
        drawsTaken: 0,
        pressedAtDraw: null,
        counterUsed: false,
        dealerDraws: 0,
        tieAttack: false
    };
    let counterAvailable = true;

    tryPress(state, pressPolicy, total([...player, ...shared]).total);

    // The same plain player policy runs in every scenario: draw below 17,
    // otherwise stand. Dealer's Call routing is unchanged so paired decks
    // isolate the causal weight of Press and Pressure.
    while (total([...player, ...shared]).total < 17) {
        const card = draw();
        state.drawsTaken += 1;
        if (total([...dealer, ...dealerBoard]).total < 17) {
            shared.push(card);
            dealerBoard.push(card);
        } else {
            player.push(card);
        }
        const p = total([...player, ...shared]).total;
        const d = total([...dealer, ...dealerBoard]).total;
        if (p > 21) return settle(state, 'lose', p, d);
        if (d > 21) return settle(state, 'win', p, d);
        tryPress(state, pressPolicy, p);
    }

    const p = total([...player, ...shared]).total;
    while (true) {
        const dState = total([...dealer, ...dealerBoard]);
        const move = adaptive
            ? rules.dealerMove({
                dealerTotal: dState.total,
                playerTotal: p,
                soft: dState.soft,
                pressureAvailable: counterAvailable,
                pressure: state.pressure
            })
            : { draw: dState.total < 17, intent: 'fixed-17', usesCounter: false };
        if (!move.draw) break;
        if (move.usesCounter) {
            counterAvailable = false;
            state.counterUsed = true;
        }
        if (move.intent === 'attack-tie') state.tieAttack = true;
        dealer.push(draw());
        state.dealerDraws += 1;
        if (total([...dealer, ...dealerBoard]).total > 21) break;
    }

    const d = total([...dealer, ...dealerBoard]).total;
    const result = d > 21 || p > d ? 'win' : d > p ? 'lose' : 'push';
    return settle(state, result, p, d);
}

function emptyStats(hands) {
    return {
        hands,
        win: 0,
        lose: 0,
        push: 0,
        profit: 0,
        wager: 0,
        pressure: 0,
        counterUses: 0,
        counterBusts: 0,
        bounty: 0,
        dealerDraws: 0,
        tieAttacks: 0,
        changedFromNoPress: 0
    };
}

function record(stats, hand, noPressResult) {
    stats[hand.result] += 1;
    stats.profit += hand.profit;
    stats.wager += hand.wager;
    stats.pressure += hand.pressure;
    stats.counterUses += Number(hand.counterUsed);
    stats.counterBusts += Number(hand.counterBust);
    stats.bounty += hand.bounty;
    stats.dealerDraws += hand.dealerDraws;
    stats.tieAttacks += Number(hand.tieAttack);
    stats.changedFromNoPress += Number(noPressResult && noPressResult !== hand.result);
}

function present(stats) {
    return {
        hands: stats.hands,
        playerWin: `${(stats.win / stats.hands * 100).toFixed(2)}%`,
        dealerWin: `${(stats.lose / stats.hands * 100).toFixed(2)}%`,
        push: `${(stats.push / stats.hands * 100).toFixed(2)}%`,
        avgPressure: Number((stats.pressure / stats.hands).toFixed(2)),
        avgWager: `$${(stats.wager / stats.hands).toFixed(2)}`,
        counterRate: `${(stats.counterUses / stats.hands * 100).toFixed(2)}%`,
        counterBustRate: stats.counterUses
            ? `${(stats.counterBusts / stats.counterUses * 100).toFixed(2)}%`
            : '—',
        resultChanged: `${(stats.changedFromNoPress / stats.hands * 100).toFixed(2)}%`,
        bountyPerHand: `$${(stats.bounty / stats.hands).toFixed(2)}`,
        profitPerAnte: Number((stats.profit / stats.hands / ANTE).toFixed(4))
    };
}

function run(hands, seed) {
    const random = rng(seed);
    const scenarios = {
        fixed17: { adaptive: false, pressPolicy: 'none' },
        smartNoPress: { adaptive: true, pressPolicy: 'none' },
        openingPress: { adaptive: true, pressPolicy: 'opening' },
        lateStrong: { adaptive: true, pressPolicy: 'late-strong' },
        strongRead: { adaptive: true, pressPolicy: 'strong-read' },
        pressEveryWindow: { adaptive: true, pressPolicy: 'every' }
    };
    const stats = Object.fromEntries(Object.keys(scenarios).map(key => [key, emptyStats(hands)]));

    for (let i = 0; i < hands; i += 1) {
        const deck = deckFor(random);
        const noPress = playHand(deck, scenarios.smartNoPress);
        for (const [name, scenario] of Object.entries(scenarios)) {
            const hand = name === 'smartNoPress' ? noPress : playHand(deck, scenario);
            record(stats[name], hand, name === 'smartNoPress' || name === 'fixed17' ? null : noPress.result);
        }
    }
    return Object.fromEntries(Object.entries(stats).map(([name, value]) => [name, present(value)]));
}

const hands = Math.max(50, Number(process.argv[2]) || 50000);
console.table(run(hands, 0x715ac));
