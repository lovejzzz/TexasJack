const assert = require('node:assert/strict');
const test = require('node:test');
const rules = require('../rules.js');

test('table goals rotate by mode and pay ten percent with a five-dollar floor', () => {
    assert.deepEqual(rules.tableGoal('classic', 0, 100), {
        id: 'early_raise', text: 'Raise before drawing, then win', reward: 10
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
        ...base, moneyAction: 'raise', raisedAtDraw: 0
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

test('round insight explains the decision that shaped the hand', () => {
    assert.match(rules.decisionInsight({
        outcome: 'win', challengeWon: true, challengeText: 'Finish on exactly 21'
    }), /Table goal cleared/);
    assert.match(rules.decisionInsight({
        outcome: 'win', challengeWon: false, boardBrokeDealer: true
    }), /shared card broke/);
    assert.match(rules.decisionInsight({
        outcome: 'win', challengeWon: false, boardBrokeDealer: false,
        moneyAction: 'raise', raisedAtDraw: 0
    }), /best price/);
    assert.match(rules.decisionInsight({
        outcome: 'lose', challengeWon: false, boardBrokeDealer: false,
        moneyAction: null, bust: true
    }), /breaks you first/);
});
