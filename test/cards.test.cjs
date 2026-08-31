const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function loadCards() {
    const context = { crypto: webcrypto };
    context.window = context;
    context.self = context;
    const source = fs.readFileSync(path.join(__dirname, '..', 'cards.js'), 'utf8');
    vm.runInNewContext(source, context);
    return context.TJCards;
}

const cards = loadCards();
const card = rank => ({ rank, suit: 'S' });

test('handTotal handles aces and busts', () => {
    const cases = [
        [['A', 'K'], 21],
        [['A', 'A', '9'], 21],
        [['A', 'A', '9', 'K'], 21],
        [['A', '6'], 17],
        [['K', 'Q', '2'], 22]
    ];

    for (const [ranks, expected] of cases) {
        assert.equal(cards.handTotal(ranks.map(card)).total, expected, ranks.join('+'));
    }
});

test('a fresh deck contains every card exactly once', () => {
    const deck = new cards.Deck();
    const drawn = Array.from({ length: 52 }, () => deck.draw());
    const unique = new Set(drawn.map(item => item.rank + item.suit));

    assert.equal(unique.size, 52);
    assert.equal(deck.remaining, 0);
});

test('drawing from an empty deck automatically starts a fresh shoe', () => {
    const deck = new cards.Deck();
    Array.from({ length: 52 }, () => deck.draw());

    const next = deck.draw();
    assert.ok(next.rank && next.suit);
    assert.equal(deck.remaining, 51);
});
