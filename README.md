# Texas Jack

**[Play it here →](https://lovejzzz.github.io/TexasJack/)**

Blackjack's race to 21, played on a Texas Hold'em board. You and the dealer each
hold a private hand, but a row of **community cards** in the middle counts toward
*both* totals — so the card you ask for might be the card that saves the dealer.

## The twist

When you hit, the dealer reacts in the same beat:

| Dealer's total | What happens to your card |
| --- | --- |
| Under 17 — dealer hits too | The card lands in the **community row** and feeds both hands |
| 17 or more — dealer stands | The card is **yours alone** |

So every hit is a read on the dealer, not just a draw. Ask for a card while
they're sitting on 12 and you may hand them the 9 they needed.

Stand, and the dealer draws privately until they reach 17 or bust.
**Double** is on the table for your first action: double the wager, take one
card, then stand automatically.

## Payouts

| Result | Pays |
| --- | --- |
| Win | 1 : 1 |
| Win on exactly 21 | 3 : 2 |
| Push | Bet returned |
| Hot streak (3+ wins running) | +25% bonus on the win |

If a community card busts you *and* the dealer, the hand is a push.

## Controls

`↵` deal · `H` hit · `S` stand · `D` double · `1`–`4` place chips ·
`M` mute · `R` rules · `Esc` dismiss

## Running it

It's a static site with no build step and no dependencies — open `index.html`,
or serve the folder:

```bash
npx http-server .
```

## How it's built

| File | What's in it |
| --- | --- |
| `index.html` | Table layout, rules dialog, result splash |
| `styles.css` | Felt, cards, chips, animations, responsive layout |
| `cards.js` | The deck, and every card face drawn as inline SVG |
| `audio.js` | All sound effects, synthesised with the Web Audio API |
| `game.js` | Game state machine, dealing, betting, settlement |

Nothing is fetched at runtime. Card faces are generated as vectors rather than
loaded as images, so they stay sharp at any size and the game plays offline.
The shuffle is Fisher–Yates seeded from `crypto.getRandomValues`. Bankroll,
streak and session stats persist in `localStorage`.
