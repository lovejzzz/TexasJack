/* Pure decision-loop rules shared by the browser game and automated tests. */
(function exposeTexasJackRules() {
    /* ---- Saloon Ladder: the heads-up duel ----------------------------------
       Quick Duel is a climb past three house dealers, each a short match with
       real betting: fixed-limit bets, up to three betting rounds a hand, and an
       ante that rises every two hands. Each rival's personality lives in how
       they bet. All tuning numbers are checked by scripts/simulate-duel.cjs. */
    const ladderRivals = [
        {
            id: 'rock', name: 'Mara', title: 'The Rock',
            rule: 'Never bluffs',
            ruleDetail: 'Tight and honest. Mara folds what she can’t win and never bluffs — when she raises, believe her.',
            standsOn: 17, maxRaises: 1,
            valueLine: 0.75, boostLine: 0.75, leadLine: 0.75, callAdj: 0.05, bluff: 0, belief: 1,
            purse: 250, ante: 10, bounty: 100
        },
        {
            id: 'shark', name: 'Vex', title: 'The Shark',
            rule: 'Two raises a round',
            ruleDetail: 'Loose and aggressive. Vex bluffs about one bet in five and may raise twice in a round. Don’t get pushed off a fair hand.',
            standsOn: 17, maxRaises: 2,
            valueLine: 0.6, boostLine: 0.6, leadLine: 0.5, callAdj: 0.02, bluff: 0.2, belief: 0.5,
            purse: 500, ante: 15, bounty: 200
        },
        {
            id: 'spark', name: 'Sol', title: 'The Spark',
            rule: 'Draws to 18',
            ruleDetail: 'Calls almost anything, takes board cards and draws until 18. Don’t bluff Sol — bet your good hands and let him pay.',
            standsOn: 18, maxRaises: 1,
            valueLine: 0.6, boostLine: 0.48, leadLine: 0.5, callAdj: -0.12, bluff: 0.1, belief: 0.1,
            purse: 800, ante: 25, bounty: 400
        }
    ];
    const LADDER_STAKE = 500;
    const DUEL_ROUNDS = 3;
    const ANTE_STEP_HANDS = 2;

    function ladderRival(rung) {
        const index = Math.max(0, Math.min(ladderRivals.length - 1, Number(rung) || 0));
        return ladderRivals[index];
    }

    /** Where a run lands after the player's stake is gone: one rung down, fresh stake. */
    function ladderFall(rung) {
        return { rung: Math.max(0, (Number(rung) || 0) - 1), stake: LADDER_STAKE };
    }

    /** The ante for a hand in a match: it steps up every three hands. */
    function duelAnte(rival, handIndex) {
        return rival.ante * (1 + Math.floor(Math.max(0, Number(handIndex) || 0) / ANTE_STEP_HANDS));
    }

    /** Fixed-limit bet size: one ante in the first round, two after that. */
    function duelBetSize(ante, round) {
        return (Number(round) || 1) <= 1 ? ante : ante * 2;
    }

    function cardsTotal(cards) {
        let total = 0;
        let soft = false;
        for (const card of cards) {
            const next = totalAfterRank(total, soft, card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' ? '10' : card.rank);
            total = next.total;
            soft = next.soft;
        }
        return { total, soft };
    }

    const FULL_DECK = (() => {
        const deck = [];
        for (const suit of ['S', 'H', 'D', 'C']) {
            for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) deck.push({ rank, suit });
        }
        return deck;
    })();

    /**
     * The dealer's estimated chance to win at showdown, from what it can see:
     * its own cards, the board, how many private cards you hold, how many
     * private draws you have left and how hard you have bet. It never sees the
     * next card or your private cards; it samples them from the unseen deck.
     * Your aggression tilts the samples toward stronger hands, by how much the
     * rival believes a bet (belief 0..1).
     */
    function duelStrength({
        dealerCards, dealerBoard, shared, playerPrivateCount = 1, privateLeft = 0,
        standsOn = 17, aggression = 0, belief = 0, samples = 320, rng = Math.random
    }) {
        const seen = new Set([...dealerCards, ...shared].map(c => c.rank + c.suit));
        const unseen = FULL_DECK.filter(c => !seen.has(c.rank + c.suit));
        let weightSum = 0;
        let scoreSum = 0;
        for (let s = 0; s < samples; s++) {
            const pile = unseen.slice();
            const take = () => pile.splice(Math.floor(rng() * pile.length), 1)[0];
            const player = [];
            for (let i = 0; i < playerPrivateCount; i++) player.push(take());
            const board = shared.slice();
            const now = cardsTotal([...player, ...board]).total;
            if (now > 21) continue;   // you would already have busted
            const tilt = Math.max(-1, Math.min(1, (now - 14) / 7));
            const weight = Math.max(0.1, 1 + belief * aggression * tilt);

            const dealer = dealerCards.slice();
            const dBoard = dealerBoard.slice();
            let left = privateLeft;
            let score = null;
            while (cardsTotal([...player, ...board]).total < 17) {
                const card = take();
                const p = cardsTotal([...player, ...board]).total;
                if (left > 0 && p >= 12) {
                    player.push(card);
                    left -= 1;
                } else {
                    board.push(card);
                    if (cardsTotal([...dealer, ...dBoard]).total < standsOn) dBoard.push(card);
                }
                if (cardsTotal([...player, ...board]).total > 21) { score = 1; break; }
                if (cardsTotal([...dealer, ...dBoard]).total > 21) { score = 0; break; }
            }
            if (score === null) {
                const p = cardsTotal([...player, ...board]).total;
                for (;;) {
                    const d = cardsTotal([...dealer, ...dBoard]);
                    const move = dealerMove({ dealerTotal: d.total, playerTotal: p, soft: d.soft, standsOn });
                    if (!move.draw) break;
                    dealer.push(take());
                    if (cardsTotal([...dealer, ...dBoard]).total > 21) break;
                }
                const d = cardsTotal([...dealer, ...dBoard]).total;
                score = d > 21 ? 0 : d > p ? 1 : d === p ? 0.5 : 0;
            }
            weightSum += weight;
            scoreSum += weight * score;
        }
        return weightSum ? scoreSum / weightSum : 0.5;
    }

    /**
     * Turns a strength estimate into a betting action, by personality.
     * Not facing a bet: 'check' or 'bet'. Facing one: 'fold', 'call' or 'raise'.
     * A small jitter keeps the thresholds from being solved exactly.
     */
    /**
     * What a rival has learned about you this match. Folding to your bets
     * again and again makes them call lighter; seeing you bet a weak hand at
     * showdown makes them trust your bets less. Returns the belief to use and
     * a shift to their calling line.
     */
    function duelMemory(rival, { foldsToYou = 0, bluffsSeen = 0 } = {}) {
        const belief = rival.belief * Math.max(0.2, 1 - 0.3 * bluffsSeen);
        const callShift = -Math.min(0.15, 0.04 * Math.max(0, foldsToYou - 2) + 0.05 * bluffsSeen);
        return { belief, callShift };
    }

    function duelDealerAction({ strength, facing, toCall = 0, pot = 0, rival, raisesLeft = 0, boardBoost = false, roll = Math.random(), jitter = 0, callShift = 0 }) {
        const value = (boardBoost ? rival.boostLine : rival.valueLine) + jitter;
        if (!facing) {
            if (strength >= Math.min(rival.leadLine, value) + jitter) return 'bet';
            return roll < rival.bluff ? 'bet' : 'check';
        }
        if (raisesLeft > 0 && strength >= value) return 'raise';
        const callLine = toCall / Math.max(1, pot + toCall) + rival.callAdj + callShift + jitter;
        if (strength >= callLine) return 'call';
        if (raisesLeft > 0 && roll < rival.bluff) return 'raise';
        return 'fold';
    }

    const tableProfiles = {
        rock: {
            name: 'Mara', title: 'The Rock', glyph: '◆', tell: 'Locks value early'
        },
        shark: {
            name: 'Vex', title: 'The Shark', glyph: '▲', tell: 'Presses thin edges'
        },
        spark: {
            name: 'Sol', title: 'The Spark', glyph: '✦', tell: 'Attacks the board'
        }
    };

    /**
     * Four-seat bets use the same fixed limits as the duel: one ante while
     * only the Opening board is out, two once the Turn has landed. One bet
     * per board; the rest of the table calls or folds.
     */
    function tableBetSize(ante, boardCount = 1) {
        const base = Math.max(5, Math.round(Number(ante) || 0));
        return (Number(boardCount) || 1) <= 1 ? base : base * 2;
    }

    /**
     * Personality-led table action. The roll is supplied by the caller so the
     * rule stays reproducible in tests and simulations. No action sees the next
     * card or another seat's private cards.
     */
    function tableAiMove({
        total, soft = false, privateLeft = 0, profile = 'rock',
        pressureOpen = false, roll = 0.5
    }) {
        const score = Number(total) || 0;
        const hidden = Math.max(0, Number(privateLeft) || 0);
        const chance = Math.max(0, Math.min(0.9999, Number(roll) || 0));
        let action = 'lock';
        let reason = 'protects the number';

        if (score >= 21) {
            action = 'lock';
            reason = score === 21 ? 'snaps the lock on 21' : 'has no live line';
        } else if (profile === 'rock') {
            if (score >= 18) {
                action = 'lock';
                reason = 'banks a made hand';
            } else if (score <= 11 && chance < 0.62) {
                action = 'board';
                reason = 'opens a low-risk board';
            } else if (hidden > 0) {
                action = 'hand';
                reason = 'keeps the risk private';
            } else {
                action = score <= 15 ? 'board' : 'lock';
                reason = action === 'board' ? 'needs the table' : 'refuses the thin draw';
            }
        } else if (profile === 'shark') {
            if (score >= 19) {
                action = 'lock';
                reason = 'protects a premium line';
            } else if (score <= 10) {
                action = 'board';
                reason = 'makes everyone sweat';
            } else if (hidden > 0 && score <= 17) {
                action = 'hand';
                reason = 'sharpens the private edge';
            } else {
                action = score <= 16 ? 'board' : 'lock';
                reason = action === 'board' ? 'forces one more decision' : 'takes the showdown';
            }
        } else {
            if (score >= 20) {
                action = 'lock';
                reason = 'finally cools the table';
            } else if (score <= 14 || hidden === 0) {
                action = 'board';
                reason = 'fires into the shared board';
            } else if (chance < 0.58) {
                action = 'board';
                reason = 'chooses maximum table damage';
            } else {
                action = 'hand';
                reason = 'takes a rare private route';
            }
        }

        const pressure = !!pressureOpen && (
            (profile === 'rock' && score >= 20)
            || (profile === 'shark' && (score >= 18 || chance < 0.12))
            || (profile === 'spark' && score >= 19 && chance < 0.72)
        );

        return { action, pressure, reason, soft: !!soft };
    }

    /** Decide whether an AI pays a table Pressure bet or folds its whole hand. */
    function tableCallDecision({
        total, soft = false, locked = false, profile = 'rock',
        cost = 0, pot = 0, ante = 1, roll = 0.5
    }) {
        const score = Number(total) || 0;
        if (score > 21) return { call: false, reason: 'already broken' };
        const ratio = Math.max(0, Number(cost) || 0) / Math.max(1, Number(pot) || 0);
        const expensive = ratio > 0.22 ? 1 : 0;
        const base = profile === 'rock' ? 18 : profile === 'shark' ? 16 : 17;
        const threshold = base + expensive - (locked ? 1 : 0);
        const made = score + (soft ? 0.35 : 0) >= threshold;
        const bluffCatch = profile === 'shark' && Number(roll) < 0.16
            && Number(cost) <= Math.max(Number(ante) || 0, 1);
        return {
            call: made || bluffCatch,
            reason: made ? 'calls with a live number' : bluffCatch ? 'sniffs out the pressure' : 'lets the hand go'
        };
    }

    /**
     * Decide whether a rival rides an announced shared card or locks before it
     * is revealed. The decision only uses the visible total and board stage;
     * callers never get to inspect the next card first.
     */
    function tableBoardDecision({
        total, soft = false, profile = 'rock', stage = 2, roll = 0.5
    }) {
        const score = Number(total) || 0;
        const finalBoard = Number(stage) >= 3;
        const chance = Math.max(0, Math.min(0.9999, Number(roll) || 0));
        let lockChance = 0;

        if (score >= 21) lockChance = 1;
        else if (score <= 15) lockChance = 0;
        else if (profile === 'rock') {
            lockChance = score >= 19 ? .96 : score === 18 ? .84 : finalBoard ? .66 : .54;
        } else if (profile === 'shark') {
            lockChance = score >= 20 ? .95 : score === 19 ? .78 : score === 18
                ? (finalBoard ? .62 : .48) : finalBoard ? .32 : .20;
        } else {
            lockChance = score >= 20 ? .92 : score === 19 ? (finalBoard ? .68 : .52)
                : score === 18 ? (finalBoard ? .42 : .28) : .10;
        }

        // A usable ace makes one more shared card materially safer.
        if (soft && score < 21) lockChance = Math.max(0, lockChance - .18);
        const lock = chance < lockChance;
        return {
            action: lock ? 'lock' : 'ride',
            ride: !lock,
            reason: lock ? 'protects the visible number' : finalBoard
                ? 'rides the final reveal' : 'accepts one shared risk'
        };
    }

    function tableShowdown(seats) {
        const live = (seats || []).filter(seat =>
            seat && seat.status !== 'folded' && seat.status !== 'bust' && Number(seat.total) <= 21
        );
        if (!live.length) return { winningTotal: null, winnerIds: [] };
        const winningTotal = Math.max(...live.map(seat => Number(seat.total) || 0));
        return {
            winningTotal,
            winnerIds: live.filter(seat => Number(seat.total) === winningTotal).map(seat => seat.id)
        };
    }

    function totalAfterRank(total, soft, rank) {
        const isAce = rank === 'A';
        const value = isAce ? 11 : rank === '10' ? 10 : Number(rank);
        let next = total + value;
        let softAces = (soft ? 1 : 0) + (isAce ? 1 : 0);
        while (next > 21 && softAces > 0) {
            next -= 10;
            softAces -= 1;
        }
        return { total: next, soft: softAces > 0 };
    }

    /**
     * The dealer's showdown draw, after you stand. Behind and under its stand
     * number it draws; behind at or above it, ahead, or level, it holds. It
     * only compares the revealed totals — it never sees the next card.
     */
    function dealerMove({ dealerTotal, playerTotal, standsOn = 17 }) {
        const dealer = Number(dealerTotal) || 0;
        const player = Number(playerTotal) || 0;
        if (dealer > 21 || player > 21 || dealer === 21) return { draw: false, intent: 'hold' };
        if (dealer < player) {
            return dealer < standsOn ? { draw: true, intent: 'build' } : { draw: false, intent: 'concede' };
        }
        return { draw: false, intent: dealer > player ? 'protect' : 'hold-push' };
    }

    const api = {
        tableProfiles,
        tableBetSize,
        tableAiMove,
        tableCallDecision,
        tableBoardDecision,
        tableShowdown,
        dealerMove,
        ladderRivals,
        ladderRival,
        ladderFall,
        LADDER_STAKE,
        DUEL_ROUNDS,
        duelAnte,
        duelBetSize,
        duelStrength,
        duelDealerAction,
        duelMemory,
        cardsTotal
    };
    if (typeof window !== 'undefined') window.TJRules = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}());
