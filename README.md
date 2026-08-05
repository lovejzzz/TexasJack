# Texas Jack

**[Play it here →](https://lovejzzz.github.io/TexasJack/)**

Blackjack's race to 21, played on a Texas Hold'em board. You and the dealer each
hold a private hand, but a row of **community cards** in the middle counts toward
*both* totals — so the card you ask for might be the card that saves the dealer.

## Reading the dealer

The dealer's card is face down — but the community row is public, and their
total is just *hidden card + board*. That pins them to a range, and the game
shows it: **`Dealer 10–19 · may share your card`**. When the board runs high
you know for certain they'll stand; when it runs low you know for certain
they'll draw. The murky middle is where the hand is actually played.

## Two variants

Pick either one from the rules dialog (`R`). Your choice is remembered.

### Dealer's Call — the original

When you hit, the dealer reacts in the same beat:

| Dealer's total | What happens to your card |
| --- | --- |
| Under 17 — dealer hits too | The card lands in the **community row** and feeds both hands |
| 17 or more — dealer stands | The card is **yours alone** |

So every hit is a read on the dealer, not just a draw. Ask for a card while
they're sitting on 12 and you may hand them the 9 they needed.

### Your Call — you route the card

You decide where every card lands:

| Action | Where it goes | Cost |
| --- | --- | --- |
| **Board** | The community row — counts for both hands | Free, unlimited |
| **Hand** | Your hand alone | Two per hand |

The board is the aggressive line. Sitting on 8 while the dealer shows 16?
Fire at the board — a ten breaks them and you can absorb it. Sitting on 15
yourself? Spend one of your two private draws instead. Once the budget's
gone, every card you take feeds the dealer too.

### A pat dealer stands aside

Community cards only count for the dealer **while they're under 17**. Once
they're pat, anything that lands on the board is marked `yours` and counts for
you alone. You can break a dealer who's still drawing; you can't shove a
standing dealer over the edge.

## Money on the table

Stand, and the dealer draws privately until they reach 17 or bust. While the
hand is live you have two ways to back your read:

**One money move per hand — raise or peek, never both.**

| | What it does | Cost |
| --- | --- | --- |
| **Raise** | Adds to your wager | Up to half the ante, shrinking 25% per card you've taken |
| **Scout** | Turns the top card of the shoe face up | A third of the ante |

The raise cap decaying is the point: commit early against a wide range for the
most leverage, or wait for a sharper read and bet less on it.

Scout is deliberately expensive, because it's the one thing the table can't
tell you. The board already pins the dealer to a range — the next card is pure
unknown. Measured, knowing it is worth about **19 points of edge**, so a third
of your ante is roughly what it's worth. Buy it on 14 against a hand that might
break you and it pays; buy it every hand and you lose 16 points.

They're mutually exclusive — one money move per hand. Together they're broken:
buying information cheaply and *then* betting on the resulting near-certainty
measured at +5.5% to the player.

## Payouts

| Result | Pays |
| --- | --- |
| Win | 1 : 1 |
| Win on exactly 21 | 3 : 2 |
| Push | Bet returned |
| Hot streak (3+ wins running) | +25% bonus on the win |

Bust over 21 and you lose, even if the same community card breaks the dealer
too — you went over first. Pushes happen when both hands finish level.

## Controls

`↵` deal · `S` stand · `R` raise · `P` scout · `1`–`4` place chips ·
`M` mute · `?` rules · `Esc` dismiss

`H` hit (Dealer's Call) · `B` board / `H` hand (Your Call)

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
