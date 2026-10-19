# Texas Jack

**[Play it here →](https://lovejzzz.github.io/TexasJack/)**

**[Enter the four-seat table →](https://lovejzzz.github.io/TexasJack/table.html)**

Blackjack's race to 21, played on a Texas Hold'em board. You and the dealer each
hold a private hand, but a row of **community cards** in the middle counts toward
*both* totals — so the card you ask for might be the card that saves the dealer.

## Reading the dealer

The dealer's card is face down — but the community row is public, and their
total is just *hidden card + board*. That pins them to a range, and the game
shows it: **`Dealer 10–19 · may share your card`**. When the board runs high
you know for certain they'll stand; when it runs low you know for certain
they'll draw. The murky middle is where the hand is actually played.

## The dealer fights back

At showdown the dealer plays against your final score rather than mindlessly
stopping on 17. From behind they build toward your number; ahead they protect
the lead. Pressing builds visible **Pressure** and unlocks one **Counter**:
Pressure 1 lets the dealer chase a one- or two-point gap, Pressure 2 widens that
range to four, and Pressure 3 can chase any gap or attack a low tie with close
public odds. Once Counter is spent, it is gone for that hand.

The dealer never peeks at the next card. Its decision uses only the revealed
scores, soft-hand state, Pressure, and public full-shoe rank odds, so the
opponent feels responsive without cheating. If you beat a spent Counter,
Pressure 1 pays a 30%-of-ante bounty, Pressure 2 pays 60% and Pressure 3 pays 100%. This gives a
selective strong read a real climax while making indiscriminate pressing wake a
more dangerous opponent.

## The Saloon Ladder

Quick Duel is a climb past three house dealers. Each one plays from a **purse**:
every chip you win comes out of it, every chip you lose goes in. Break the purse
(below the table minimum) to collect that dealer's bounty and move up a rung.
Lose your stake and you're run out of town — one rung down, with a fresh $500.

| Rung | Dealer | House rule | Purse | Table min | Bounty |
| --- | --- | --- | --- | --- | --- |
| 1 | Mara · The Rock | Never counters — press freely | $150 | $25 | $100 |
| 2 | Vex · The Shark | Counters one level hotter than you pressed | $300 | $50 | $200 |
| 3 | Sol · The Spark | Takes board cards and draws until 18 | $600 | $100 | $400 |

Each rule bends one thing, so each rung asks for a different skill: Mara teaches
pressing, Vex punishes sitting back, and Sol turns the board into a weapon that
cuts both ways. Clear all three and the ladder resets with your stake intact.

The first visit opens on Mara's wanted poster, then plays a short guided hand
that shows the twist in one move.

## Four-seat table

Four-Seat is a separate, faster table mode: you face three readable AI rivals
while a neutral shoe deals the cards. All four seats ante into one pot, start
with one private card, and share the centre board.

The shared path is capped at three cards: the automatic **Opening Board**, the
**Turn**, and the **Final Board**. On your turn you can call the next Board,
take one of two private **Hand** draws, or **Lock** your current total. Before
another seat reveals a Board card, every active player chooses **Ride** or
**Lock** without seeing the card. The caller rides automatically. Locking
freezes the number, so later Board cards leave that seat untouched.

Once per board state, any seat can apply **Pressure** for half the ante. Every
remaining player must Call or Fold. A new Board card reopens the betting window.
The highest live total at or below 21 wins the pot; ties split it.

The rivals use public state and their own private cards but never peek at the
shoe or another hand:

| Rival | Personality |
| --- | --- |
| Mara · The Rock | Locks made value and prefers private risk |
| Vex · The Shark | Presses thin edges and occasionally bluffs |
| Sol · The Spark | Feeds the shared board and hunts multi-bust chaos |

### Board or Hand — you route the card

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

Stand, and the dealer plays against your total. While the hand is live, every
new card state opens one chance to back the read with **Press**, which adds to
your live wager — up to half the ante across the hand.

Press starts at 20% of the ante, narrows to 10% after the first draw, and falls
to 5% in late windows. An unused window expires when another card is drawn.
That is the point: commit early against a wide range for more leverage, or wait
for a sharper read and accept a smaller bet.

At settlement, a short decision note explains the line that shaped the hand.
The **Again** button repeats the previous ante and deals immediately.

## Payouts

| Result | Pays |
| --- | --- |
| Win | 1 : 1 |
| Win on exactly 21 | 3 : 2 |
| Push | Bet returned |
| Break a dealer's purse | Their bounty |
| Beat a Counter at Pressure 1 | +30% of ante |
| Beat a Counter at Pressure 2 | +60% of ante |
| Beat a Counter at Pressure 3 | +100% of ante |

Bust over 21 and you lose, even if the same community card breaks the dealer
too — you went over first. Pushes happen when both hands finish level.

## Controls

`↵` deal · `B` board · `H` hand · `S` stand · `R` press · `1`–`4` place chips ·
`M` mute · `?` rules · `Esc` dismiss

## Running it

It's a static site with no build step and no dependencies — open `index.html`,
or serve the folder:

```bash
npx http-server .
```

Run the zero-dependency card, shoe, table-goal, and decision-feedback tests with:

```bash
npm test
```

Run the reproducible, paired-deck dealer balance harness (50,000 hands by
default) with:

```bash
npm run simulate:ai
```

Every strategy receives the same shuffled shoe for each hand, so the report can
attribute changed outcomes to Press, Pressure, and Counter rather than shuffle
luck. It compares no Press, opening Press, selective 18+ reads, and pressing at
every window, including wager, Counter frequency, busts, bounty, and profit per
ante.

Run the four-seat personality, pacing, Pressure, fold, and multi-bust harness
with:

```bash
npm run simulate:table
```

## How it's built

| File | What's in it |
| --- | --- |
| `index.html` | Table layout, rules dialog, result splash |
| `table.html` | Compact four-seat ring, table controls, and rival guide |
| `styles.css` | Felt, cards, chips, animations, responsive layout |
| `cards.js` | The deck, and every card face drawn as inline SVG |
| `audio.js` | All sound effects, synthesised with the Web Audio API |
| `asset/ui-icons.svg` | Custom brass-table icons for tools, decisions, and actions |
| `rules.js` | Pure table-goal, Press, dealer-AI, and decision-feedback rules |
| `game.js` | Game state machine, dealing, betting, settlement |
| `table-game.js` | Four-seat turn engine, AI betting, Lock, pot, and showdown |
| `scripts/simulate-ai.cjs` | Seeded batch harness comparing fixed-17 and adaptive dealers |
| `scripts/simulate-table.cjs` | Seeded four-seat pacing and strategy harness |

Nothing is fetched at runtime. Card faces are generated as vectors rather than
loaded as images, so they stay sharp at any size and the game plays offline.
The shuffle is Fisher–Yates seeded from `crypto.getRandomValues`. Bankroll,
streak and session stats persist in `localStorage`.
