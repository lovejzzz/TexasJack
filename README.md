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
Pressure 2 pays a 50%-of-ante bounty and Pressure 3 pays 100%. This gives a
selective strong read a real climax while making indiscriminate pressing wake a
more dangerous opponent.

## Two variants

Pick either one from the rules dialog (`?`). Your choice is remembered.

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
hand is live, every new card state opens one chance to back the read:

| | What it does | Cost |
| --- | --- | --- |
| **Press** | Adds to your live wager once per new card state | Up to half the ante across the hand |
| **Scout** | Turns the top card of the shoe face up | A third of the ante |

Press starts at 20% of the ante, narrows to 10% after the first draw, and falls
to 5% in late windows. An unused window expires when another card is drawn.
That is the point: commit early against a wide range for more leverage, or wait
for a sharper read and accept a smaller bet. Total added exposure is capped at
half the original ante.

The live decision panel keeps Press visible through the hand, shows the current
price and remaining leverage, and reopens it after each new card.

Scout is deliberately expensive, because it's the one thing the table can't
tell you. The board already pins the dealer to a range — the next card is pure
unknown. Measured, knowing it is worth about **19 points of edge**, so a third
of your ante is roughly what it's worth. Buy it on 14 against a hand that might
break you and it pays; buy it every hand and you lose 16 points.

Scout can be bought once per hand. While its known card is waiting on top of the
shoe, the current Press window is frozen; once that card is drawn and the paid
certainty is consumed, the next Press window opens normally. This keeps the
information useful without letting the player see the answer and then bet it at
the old price.

## Table goals and replay loop

Each hand gets one optional **table goal**, such as raising before the first
draw, breaking the dealer with a shared card, or finishing on exactly 21.
Clearing it adds **10% of the ante** (with a $5 floor). Goals rotate by mode and
reward different tactics without making them mandatory.

At settlement, a short decision note explains the line that shaped the hand.
The **Again** button then repeats the previous ante and deals immediately, so a
new attempt is one deliberate click away.

The money also stays spatially legible: chips travel from the selected stake to
**In Play**, then return to **Bankroll** at settlement while both totals count in
sync. Wins, exact 21s, hot streaks, table goals, new session peaks, pushes, and
losses each use a distinct but brief layer of motion and sound. The effects are
automatically reduced when the operating system requests less motion.

## Payouts

| Result | Pays |
| --- | --- |
| Win | 1 : 1 |
| Win on exactly 21 | 3 : 2 |
| Push | Bet returned |
| Hot streak (3+ wins running) | +25% bonus on the win |
| Table goal | +10% of ante ($5 minimum) |
| Beat a Counter at Pressure 2 | +50% of ante |
| Beat a Counter at Pressure 3 | +100% of ante |

Bust over 21 and you lose, even if the same community card breaks the dealer
too — you went over first. Pushes happen when both hands finish level.

## Controls

`↵` deal · `S` stand · `R` press · `P` scout · `1`–`4` place chips ·
`M` mute · `?` rules · `Esc` dismiss

`H` hit (Dealer's Call) · `B` board / `H` hand / `R` ride prompt (Your Call)

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
