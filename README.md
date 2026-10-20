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

## A real betting duel

Both sides ante, then bet in fixed limits: a betting round before the draw and
one after each card you take, up to three per hand. You act first — **check** or
**bet**; facing a bet, **call**, **raise** or **fold**. Bets are one ante in the
first round and two after that, so no single hand can shove a whole purse.

The dealer bets from what it can actually see: its own cards, the board, how
many private cards you hold and how hard you've bet. It estimates its chance to
win by sampling the cards it can't see, then acts in character. It never sees
your private cards or the next card off the shoe. A fold ends the hand without
showing either hand, so a bluff stays a mystery.

At showdown the dealer plays against your final total: behind and under its
stand number it draws, ahead it holds.

## The Saloon Ladder

Quick Duel is a climb past three house dealers. Each is a short match: both
sides start with chips (your stake against the dealer's purse), the ante rises
every two hands, and whoever can't post the next ante loses. Break a purse to
collect the bounty and move up; lose your stake and you drop a rung with a fresh
$500. Clear all three and the ladder resets with your stake intact.

| Rung | Dealer | Style | House rule | Purse | Opening ante | Bounty |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Mara · The Rock | Tight and honest; her raise means a real hand | Never bluffs | $250 | $10 | $100 |
| 2 | Vex · The Shark | Loose and aggressive, bluffs about one bet in five | Two raises a round | $500 | $15 | $200 |
| 3 | Sol · The Spark | Calls almost anything | Draws to 18 | $800 | $25 | $400 |

Each dealer teaches one skill: bluff Mara, catch Vex, value-bet Sol. The tuning
is measured with `npm run simulate:duel`, which plays the real dealer AI against
a thinking player and against pure bluffing, calling and passive policies.
A thinking player wins about 69% / 60% / 60% of matches (roughly 14 hands each);
betting every hand loses money against all three.

The first visit opens on Mara's wanted poster, then two guided hands: one shows
a board card breaking the dealer, the other a bet that makes her fold. After
that, one-time tips appear the first time you face a bet or can keep a card.

Rivals remember you for the length of a match: fold to your bets too often and
they start calling lighter; see you bet a weak hand at showdown and they trust
your bets less. Every clear of the ladder raises all purses, antes and bounties
by half again for the next climb (★ marks your clears). The **hand log** (`L`)
keeps the last eight hands move by move.

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

Once per board, any seat can **Bet** — one ante while only the Opening board is
out, two after the Turn — and everyone else calls or folds, the same fixed
limits as Quick Duel. The highest live total at or below 21 wins the pot; ties
split it. The first seat to act rotates every hand, like a dealer button.

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

## Payouts

| Result | Pays |
| --- | --- |
| Win the hand | The pot |
| Win on exactly 21 | +1 ante from the dealer's purse |
| Push | The pot splits |
| Opponent folds | The pot |
| Break a dealer's purse | Their bounty |

Bust over 21 and you lose, even if the same community card breaks the dealer
too — you went over first.

## Controls

`↵` deal · `X` check · `R` bet / raise · `C` call · `F` fold · `B` board ·
`H` hand · `S` stand · `L` hand log · `M` mute · `?` rules · `Esc` dismiss

## Running it

It's a static site with no build step and no dependencies — open `index.html`,
or serve the folder:

```bash
npx http-server .
```

Run the zero-dependency card, shoe, ladder and duel-betting tests with:

```bash
npm test
```

Tune the duel — the real dealer betting AI against thinking, bluffing, calling
and passive players, per hand and as whole matches — with:

```bash
npm run simulate:duel
```

Run the four-seat personality, pacing, betting, fold, and multi-bust harness
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
| `rules.js` | Pure rules: ladder rivals, duel betting and dealer strength, four-seat AI |
| `game.js` | Duel state machine: dealing, betting rounds, settlement, the ladder |
| `western.css` | Western Noir art direction layered over `styles.css` |
| `fonts.css`, `asset/fonts/` | Self-hosted Playfair Display, IM Fell English SC and Inter (SIL OFL) |
| `table-game.js` | Four-seat turn engine, AI betting, Lock, pot, and showdown |
| `scripts/simulate-duel.cjs` | Seeded duel harness: dealer betting AI vs player policies |
| `scripts/simulate-table.cjs` | Seeded four-seat pacing and strategy harness |

Nothing is fetched at runtime — even the fonts ship with the game. Card faces are generated as vectors rather than
loaded as images, so they stay sharp at any size and the game plays offline.
The shuffle is Fisher–Yates seeded from `crypto.getRandomValues`. Bankroll,
streak and session stats persist in `localStorage`.
