const assert = require('node:assert/strict');
const test = require('node:test');
const rules = require('../rules.js');

test('the showdown dealer chases from behind and holds ahead or level', () => {
    assert.equal(rules.dealerMove({ dealerTotal: 16, playerTotal: 19 }).intent, 'build');
    assert.equal(rules.dealerMove({ dealerTotal: 18, playerTotal: 20 }).intent, 'concede');
    assert.equal(rules.dealerMove({ dealerTotal: 18, playerTotal: 17 }).intent, 'protect');
    assert.equal(rules.dealerMove({ dealerTotal: 17, playerTotal: 17 }).intent, 'hold-push');
    assert.equal(rules.dealerMove({ dealerTotal: 21, playerTotal: 21 }).draw, false);
});
test('four-seat personalities make distinct decisions without seeing the next card', () => {
    assert.equal(rules.tableAiMove({ total: 18, privateLeft: 2, profile: 'rock' }).action, 'lock');
    assert.equal(rules.tableAiMove({ total: 12, privateLeft: 2, profile: 'rock', roll: 0.9 }).action, 'hand');
    assert.equal(rules.tableAiMove({ total: 15, privateLeft: 2, profile: 'shark' }).action, 'hand');
    assert.equal(rules.tableAiMove({ total: 13, privateLeft: 2, profile: 'spark', roll: 0.9 }).action, 'board');
    assert.equal(rules.tableAiMove({ total: 20, profile: 'rock', pressureOpen: true }).pressure, true);
    assert.equal(rules.tableAiMove({ total: 13, profile: 'shark', pressureOpen: true, roll: 0.1 }).pressure, true);
});

test('table bets follow the fixed limits and AI calls have readable ranges', () => {
    assert.equal(rules.tableBetSize(100, 1), 100);
    assert.equal(rules.tableBetSize(100, 2), 200);
    assert.equal(rules.tableBetSize(2, 1), 5);
    assert.equal(rules.tableCallDecision({ total: 19, profile: 'rock', cost: 50, pot: 400, ante: 100 }).call, true);
    assert.equal(rules.tableCallDecision({ total: 16, profile: 'rock', cost: 50, pot: 400, ante: 100 }).call, false);
    assert.equal(rules.tableCallDecision({ total: 16, profile: 'shark', cost: 50, pot: 400, ante: 100 }).call, true);
    assert.equal(rules.tableCallDecision({ total: 22, profile: 'spark', cost: 50, pot: 400, ante: 100 }).call, false);
});

test('Board response personalities choose fairly from visible information', () => {
    assert.equal(rules.tableBoardDecision({ total: 15, profile: 'rock', stage: 3, roll: 0 }).action, 'ride');
    assert.equal(rules.tableBoardDecision({ total: 21, profile: 'spark', stage: 2, roll: 0.99 }).action, 'lock');
    assert.equal(rules.tableBoardDecision({ total: 18, profile: 'rock', stage: 2, roll: 0.5 }).action, 'lock');
    assert.equal(rules.tableBoardDecision({ total: 17, profile: 'shark', stage: 2, roll: 0.5 }).action, 'ride');
    assert.equal(rules.tableBoardDecision({ total: 18, profile: 'spark', stage: 3, roll: 0.2 }).action, 'lock');
    assert.equal(rules.tableBoardDecision({ total: 18, soft: true, profile: 'spark', stage: 3, roll: 0.3 }).action, 'ride');
});

test('four-seat showdown excludes folded and busted seats and splits ties', () => {
    assert.deepEqual(rules.tableShowdown([
        { id: 'you', total: 20, status: 'locked' },
        { id: 'rock', total: 22, status: 'bust' },
        { id: 'shark', total: 20, status: 'locked' },
        { id: 'spark', total: 21, status: 'folded' }
    ]), { winningTotal: 20, winnerIds: ['you', 'shark'] });
    assert.deepEqual(rules.tableShowdown([
        { id: 'you', total: 24, status: 'bust' },
        { id: 'rock', total: 23, status: 'bust' }
    ]), { winningTotal: null, winnerIds: [] });
});

test('ladder rivals climb in difficulty and bet with distinct personalities', () => {
    assert.equal(rules.ladderRivals.length, 3);
    const [rock, shark, spark] = rules.ladderRivals;
    assert.equal(rock.bluff, 0);
    assert.equal(shark.maxRaises, 2);
    assert.equal(spark.standsOn, 18);
    assert.ok(rock.purse < shark.purse && shark.purse < spark.purse);
    assert.equal(rules.ladderRival(99).id, 'spark');
    assert.deepEqual(rules.ladderFall(0), { rung: 0, stake: rules.LADDER_STAKE });
    assert.deepEqual(rules.ladderFall(2), { rung: 1, stake: rules.LADDER_STAKE });
    // A dealer that draws to 18 keeps building from 17 when behind.
    assert.equal(rules.dealerMove({ dealerTotal: 17, playerTotal: 19, standsOn: 18, pressureAvailable: false }).draw, true);
    assert.equal(rules.dealerMove({ dealerTotal: 17, playerTotal: 19, pressureAvailable: false }).draw, false);
});

test('duel antes rise every two hands and bets double after the first round', () => {
    const rock = rules.ladderRival(0);
    assert.deepEqual([0, 1, 2, 3, 4, 6].map(i => rules.duelAnte(rock, i)), [10, 10, 20, 20, 30, 40]);
    assert.equal(rules.duelBetSize(10, 1), 10);
    assert.equal(rules.duelBetSize(10, 2), 20);
    assert.equal(rules.duelBetSize(10, 3), 20);
});

test('the dealer bets its strength by personality and never bluffs as Mara', () => {
    const [rock, shark] = rules.ladderRivals;
    const act = (rival, strength, extra = {}) => rules.duelDealerAction({ rival, strength, facing: true, toCall: 10, pot: 30, raisesLeft: 1, roll: 0, ...extra });
    assert.equal(act(rock, 0.9), 'raise');
    assert.equal(act(rock, 0.5), 'call');
    assert.equal(act(rock, 0.1), 'fold');
    assert.equal(act(shark, 0.1), 'raise');          // roll 0 < bluff rate
    assert.equal(act(shark, 0.1, { roll: 0.9 }), 'fold');
    assert.equal(rules.duelDealerAction({ rival: rock, strength: 0.2, facing: false, roll: 0 }), 'check');
    assert.equal(rules.duelDealerAction({ rival: rock, strength: 0.8, facing: false }), 'bet');
});

test('dealer strength reads a made hand above a weak one without seeing your cards', () => {
    let seed = 3;
    const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const base = { playerPrivateCount: 1, privateLeft: 2, standsOn: 17, samples: 600, rng };
    const strong = rules.duelStrength({ ...base, dealerCards: [{ rank: '10', suit: 'S' }], dealerBoard: [{ rank: '10', suit: 'D' }], shared: [{ rank: '10', suit: 'D' }] });
    const weak = rules.duelStrength({ ...base, dealerCards: [{ rank: '6', suit: 'S' }], dealerBoard: [{ rank: '10', suit: 'D' }], shared: [{ rank: '10', suit: 'D' }] });
    assert.ok(strong > weak + 0.15, `${strong} vs ${weak}`);
});
