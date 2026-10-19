const rules = require('../rules.js');

const ANTE = 100;
const MAX_BOARD_CARDS = 3;
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
        } else value += rank === '10' ? 10 : Number(rank);
    }
    while (value > 21 && aces > 0) {
        value -= 10;
        aces -= 1;
    }
    return { total: value, soft: aces > 0 && value <= 21 };
}

function counted(seat, shared) {
    return shared.slice(0, seat.lockedAt === null ? shared.length : seat.lockedAt);
}

function score(seat, shared) {
    return total([...seat.hand, ...counted(seat, shared)]);
}

function humanMove(policy, value, privateLeft, boardOpen) {
    const lockAt = policy === 'cautious' ? 18 : policy === 'board-attack' ? 19 : 17;
    if (value >= lockAt) return 'lock';
    if (!boardOpen) return privateLeft > 0 ? 'hand' : 'lock';
    if (policy === 'board-attack') return value <= 14 || privateLeft === 0 ? 'board' : 'hand';
    if (value <= 11) return 'board';
    return privateLeft > 0 ? 'hand' : value <= 15 ? 'board' : 'lock';
}

function humanRides(policy, value, stage) {
    const lockAt = policy === 'cautious' ? 18 : policy === 'board-attack' ? 20 : 19;
    const finalAdjustment = stage >= 3 && policy !== 'board-attack' ? -1 : 0;
    return value < lockAt + finalAdjustment;
}

function humanCalls(policy, value) {
    const threshold = policy === 'cautious' ? 18 : policy === 'board-attack' ? 16 : 17;
    return value >= threshold;
}

function play(sourceDeck, random, policy, selectivePressure, firstSeat = 0) {
    const deck = [...sourceDeck];
    const draw = () => deck.pop();
    const seats = [
        { id: 'you', profile: null },
        { id: 'rock', profile: 'rock' },
        { id: 'shark', profile: 'shark' },
        { id: 'spark', profile: 'spark' }
    ].map(seat => ({ ...seat, hand: [draw()], status: 'active', lockedAt: null, privateLeft: 2 }));
    const shared = [draw()];
    let pot = ANTE * 4;
    let userProfit = -ANTE;
    // The first seat to act rotates each hand, like a dealer button.
    let turn = firstSeat;
    let boardVersion = 0;
    let pressureUsedAt = null;
    let pressures = 0;
    let folds = 0;
    let busts = 0;
    let multiBusts = 0;
    let boardLocks = 0;
    let rides = 0;
    let turns = 0;

    const eligible = seat => !['folded', 'bust'].includes(seat.status);
    const active = seat => seat.status === 'active';

    while (turns < 80) {
        const contenders = seats.filter(eligible);
        if (contenders.length <= 1 || !seats.some(active)) break;
        const seat = seats[turn];
        if (!active(seat)) {
            turn = (turn + 1) % seats.length;
            continue;
        }

        const state = score(seat, shared);
        const move = seat.id === 'you'
            ? { action: humanMove(policy, state.total, seat.privateLeft, shared.length < MAX_BOARD_CARDS), pressure: selectivePressure && state.total >= 18 }
            : rules.tableAiMove({
                total: state.total,
                soft: state.soft,
                privateLeft: seat.privateLeft,
                profile: seat.profile,
                pressureOpen: pressureUsedAt !== boardVersion,
                roll: random()
            });

        if (move.pressure && pressureUsedAt !== boardVersion && seats.filter(eligible).length > 1) {
            const PRESSURE = rules.tableBetSize(ANTE, shared.length);
            pressureUsedAt = boardVersion;
            pressures += 1;
            pot += PRESSURE;
            if (seat.id === 'you') userProfit -= PRESSURE;
            for (const target of seats) {
                if (target === seat || !eligible(target)) continue;
                const targetScore = score(target, shared);
                const call = target.id === 'you'
                    ? humanCalls(policy, targetScore.total)
                    : rules.tableCallDecision({
                        total: targetScore.total,
                        soft: targetScore.soft,
                        locked: target.status === 'locked',
                        profile: target.profile,
                        cost: PRESSURE,
                        pot,
                        ante: ANTE,
                        roll: random()
                    }).call;
                if (call) {
                    pot += PRESSURE;
                    if (target.id === 'you') userProfit -= PRESSURE;
                } else {
                    target.status = 'folded';
                    target.lockedAt = shared.length;
                    folds += 1;
                }
            }
            if (seats.filter(eligible).length <= 1) break;
            if (!active(seat)) {
                turn = (turn + 1) % seats.length;
                continue;
            }
        }

        if (move.action === 'board' && shared.length >= MAX_BOARD_CARDS) {
            move.action = seat.privateLeft > 0 ? 'hand' : 'lock';
        }

        if (move.action === 'lock') {
            seat.status = 'locked';
            seat.lockedAt = shared.length;
        } else if (move.action === 'hand') {
            seat.privateLeft -= 1;
            seat.hand.push(draw());
            if (score(seat, shared).total > 21) {
                seat.status = 'bust';
                seat.lockedAt = shared.length;
                busts += 1;
            }
        } else {
            const stage = shared.length + 1;
            for (const target of seats) {
                if (target === seat || !active(target)) continue;
                const targetScore = score(target, shared);
                const ride = target.id === 'you'
                    ? humanRides(policy, targetScore.total, stage)
                    : rules.tableBoardDecision({
                        total: targetScore.total,
                        soft: targetScore.soft,
                        profile: target.profile,
                        stage,
                        roll: random()
                    }).ride;
                if (ride) rides += 1;
                else {
                    target.status = 'locked';
                    target.lockedAt = shared.length;
                    boardLocks += 1;
                }
            }
            shared.push(draw());
            boardVersion += 1;
            pressureUsedAt = null;
            let boardBusts = 0;
            for (const target of seats.filter(active)) {
                if (score(target, shared).total > 21) {
                    target.status = 'bust';
                    target.lockedAt = shared.length;
                    boardBusts += 1;
                    busts += 1;
                }
            }
            if (boardBusts >= 2) multiBusts += 1;
        }
        turns += 1;
        turn = (turn + 1) % seats.length;
    }

    const showdown = rules.tableShowdown(seats.map(seat => ({
        id: seat.id,
        total: score(seat, shared).total,
        status: seat.status
    })));
    const userWon = showdown.winnerIds.includes('you');
    const share = userWon && showdown.winnerIds.length ? Math.floor(pot / showdown.winnerIds.length) : 0;
    userProfit += share;
    return {
        userWon,
        split: userWon && showdown.winnerIds.length > 1,
        profit: userProfit,
        turns,
        boardCards: shared.length,
        pressures,
        folds,
        busts,
        multiBusts,
        boardLocks,
        rides,
        timedOut: turns >= 80
    };
}

function run(hands, seed) {
    const random = rng(seed);
    const scenarios = {
        balancedNoPressure: { policy: 'balanced', pressure: false },
        balancedSelective: { policy: 'balanced', pressure: true },
        cautiousSelective: { policy: 'cautious', pressure: true },
        boardAttack: { policy: 'board-attack', pressure: true }
    };
    const stats = Object.fromEntries(Object.keys(scenarios).map(key => [key, {
        hands, wins: 0, splits: 0, profit: 0, turns: 0, boardCards: 0,
        pressures: 0, folds: 0, busts: 0, multiBusts: 0, boardLocks: 0, rides: 0, timedOut: 0
    }]));

    for (let i = 0; i < hands; i += 1) {
        const deck = deckFor(random);
        for (const [name, scenario] of Object.entries(scenarios)) {
            const hand = play(deck, random, scenario.policy, scenario.pressure, i % 4);
            const target = stats[name];
            target.wins += Number(hand.userWon);
            target.splits += Number(hand.split);
            for (const key of ['profit', 'turns', 'boardCards', 'pressures', 'folds', 'busts', 'multiBusts', 'boardLocks', 'rides']) target[key] += hand[key];
            target.timedOut += Number(hand.timedOut);
        }
    }

    return Object.fromEntries(Object.entries(stats).map(([name, value]) => [name, {
        hands,
        userPotShare: `${(value.wins / hands * 100).toFixed(2)}%`,
        splitRate: `${(value.splits / hands * 100).toFixed(2)}%`,
        avgTurns: Number((value.turns / hands).toFixed(2)),
        avgBoardCards: Number((value.boardCards / hands).toFixed(2)),
        pressurePerHand: Number((value.pressures / hands).toFixed(2)),
        foldsPerHand: Number((value.folds / hands).toFixed(2)),
        bustsPerHand: Number((value.busts / hands).toFixed(2)),
        multiBustRate: `${(value.multiBusts / hands * 100).toFixed(2)}%`,
        boardLocksPerHand: Number((value.boardLocks / hands).toFixed(2)),
        ridesPerHand: Number((value.rides / hands).toFixed(2)),
        stalledHands: value.timedOut,
        profitPerAnte: Number((value.profit / hands / ANTE).toFixed(4))
    }]));
}

const hands = Math.max(100, Number(process.argv[2]) || 50000);
console.table(run(hands, 0x4ea7));
