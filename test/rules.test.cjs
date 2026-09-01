const assert = require('node:assert/strict');
const test = require('node:test');
const rules = require('../rules.js');

test('table goals rotate by mode and pay ten percent with a five-dollar floor', () => {
    assert.deepEqual(rules.tableGoal('classic', 0, 100), {
        id: 'early_raise', text: 'Press before drawing, then win', reward: 10
    });
    assert.equal(rules.tableGoal('classic', 1, 25).id, 'board_break');
    assert.equal(rules.tableGoal('classic', 2, 25).id, 'exact21');
    assert.equal(rules.tableGoal('routed', 2, 500).id, 'private_reserve');
    assert.equal(rules.tableGoal('routed', 2, 25).reward, 5);
});

test('goals only clear on a winning hand that satisfies their condition', () => {
    const base = {
        outcome: 'win', mode: 'classic', playerTotal: 20, moneyAction: null,
        raisedAtDraw: null, boardBrokeDealer: false, privateLeft: 0
    };
    assert.equal(rules.tableGoalComplete({ id: 'early_raise' }, {
        ...base, raisedAtDraw: 0
    }), true);
    assert.equal(rules.tableGoalComplete({ id: 'early_raise' }, {
        ...base, moneyAction: 'raise', raisedAtDraw: 1
    }), false);
    assert.equal(rules.tableGoalComplete({ id: 'board_break' }, {
        ...base, boardBrokeDealer: true
    }), true);
    assert.equal(rules.tableGoalComplete({ id: 'private_reserve' }, {
        ...base, mode: 'routed', privateLeft: 1
    }), true);
    assert.equal(rules.tableGoalComplete({ id: 'exact21' }, {
        ...base, playerTotal: 21
    }), true);
    assert.equal(rules.tableGoalComplete({ id: 'exact21' }, {
        ...base, outcome: 'lose', playerTotal: 21
    }), false);
});

test('press windows reopen after a card while leverage and total exposure stay bounded', () => {
    assert.deepEqual(rules.pressOffer({
        ante: 100, bankroll: 1000, drawsTaken: 0, pressedTotal: 0,
        pressedAtDraw: null, scoutLocked: false
    }), {
        amount: 20, limit: 50, remaining: 50, rate: 0.20,
        usedThisWindow: false, locked: false, maxed: false
    });

    assert.equal(rules.pressOffer({
        ante: 100, bankroll: 1000, drawsTaken: 0, pressedTotal: 20,
        pressedAtDraw: 0, scoutLocked: false
    }).amount, 0);
    assert.equal(rules.pressOffer({
        ante: 100, bankroll: 1000, drawsTaken: 1, pressedTotal: 20,
        pressedAtDraw: 0, scoutLocked: false
    }).amount, 10);
    assert.equal(rules.pressOffer({
        ante: 100, bankroll: 1000, drawsTaken: 3, pressedTotal: 40,
        pressedAtDraw: 2, scoutLocked: false
    }).amount, 5);
    assert.equal(rules.pressOffer({
        ante: 100, bankroll: 1000, drawsTaken: 4, pressedTotal: 50,
        pressedAtDraw: 3, scoutLocked: false
    }).maxed, true);
});

test('a known scouted card freezes only its current press window', () => {
    const locked = rules.pressOffer({
        ante: 100, bankroll: 1000, drawsTaken: 1, pressedTotal: 20,
        pressedAtDraw: 0, scoutLocked: true
    });
    assert.equal(locked.amount, 0);
    assert.equal(locked.locked, true);

    const reopened = rules.pressOffer({
        ante: 100, bankroll: 1000, drawsTaken: 2, pressedTotal: 20,
        pressedAtDraw: 0, scoutLocked: false
    });
    assert.equal(reopened.amount, 10);
});

test('dealer AI chases from behind, protects a lead, and values a push', () => {
    assert.equal(rules.dealerMove({ dealerTotal: 16, playerTotal: 19 }).intent, 'build');
    assert.equal(rules.dealerMove({ dealerTotal: 18, playerTotal: 20, pressure: 0 }).intent, 'concede');
    assert.equal(rules.dealerMove({ dealerTotal: 18, playerTotal: 20, pressure: 1 }).intent, 'counter');
    assert.equal(rules.dealerMove({ dealerTotal: 17, playerTotal: 21, pressure: 1 }).intent, 'concede');
    assert.equal(rules.dealerMove({ dealerTotal: 17, playerTotal: 21, pressure: 2 }).intent, 'counter');
    assert.equal(rules.dealerMove({ dealerTotal: 17, playerTotal: 21, pressure: 3 }).intent, 'counter');
    assert.equal(rules.dealerMove({ dealerTotal: 18, playerTotal: 20, pressure: 3, pressureAvailable: false }).intent, 'concede');
    assert.equal(rules.dealerMove({ dealerTotal: 18, playerTotal: 17 }).intent, 'protect');
    assert.equal(rules.dealerMove({ dealerTotal: 12, playerTotal: 12, pressure: 2 }).intent, 'hold-push');
    assert.equal(rules.dealerMove({ dealerTotal: 12, playerTotal: 12, pressure: 3 }).intent, 'attack-tie');
    assert.equal(rules.dealerMove({ dealerTotal: 17, playerTotal: 17 }).intent, 'hold-push');
    assert.equal(rules.dealerMove({ dealerTotal: 21, playerTotal: 21 }).draw, false);
});

test('late conviction creates more pressure and Counter wins pay a bounty', () => {
    assert.equal(rules.pressureGain({ drawsTaken: 0, scoutUsed: false }), 1);
    assert.equal(rules.pressureGain({ drawsTaken: 1, scoutUsed: false }), 1);
    assert.equal(rules.pressureGain({ drawsTaken: 2, scoutUsed: false }), 2);
    assert.equal(rules.pressureGain({ drawsTaken: 1, scoutUsed: true }), 2);
    assert.equal(rules.counterBounty({ ante: 100, pressure: 1, counterUsed: true, outcome: 'win' }), 0);
    assert.equal(rules.counterBounty({ ante: 100, pressure: 2, counterUsed: true, outcome: 'win' }), 50);
    assert.equal(rules.counterBounty({ ante: 100, pressure: 3, counterUsed: true, outcome: 'win' }), 100);
    assert.equal(rules.counterBounty({ ante: 100, pressure: 3, counterUsed: true, outcome: 'lose' }), 0);
    assert.equal(rules.counterBounty({ ante: 100, pressure: 3, counterUsed: false, outcome: 'win' }), 0);
});

test('round insight explains the decision that shaped the hand', () => {
    assert.match(rules.decisionInsight({
        outcome: 'win', challengeWon: true, challengeText: 'Finish on exactly 21'
    }), /Table goal cleared/);
    assert.match(rules.decisionInsight({
        outcome: 'win', challengeWon: false, boardBrokeDealer: true
    }), /shared card broke/);
    assert.match(rules.decisionInsight({
        outcome: 'win', challengeWon: false, boardBrokeDealer: false,
        pressTotal: 20, scoutUsed: false, raisedAtDraw: 0
    }), /best price/);
    assert.match(rules.decisionInsight({
        outcome: 'lose', challengeWon: false, boardBrokeDealer: false,
        moneyAction: null, bust: true
    }), /breaks you first/);
});
