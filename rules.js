/* Pure decision-loop rules shared by the browser game and automated tests. */
(function exposeTexasJackRules() {
    const goals = {
        early_raise: {
            id: 'early_raise',
            text: 'Press before drawing, then win'
        },
        board_break: {
            id: 'board_break',
            text: 'Break the dealer with a shared card'
        },
        private_reserve: {
            id: 'private_reserve',
            text: 'Win with a private draw still in reserve'
        },
        exact21: {
            id: 'exact21',
            text: 'Finish on exactly 21'
        }
    };

    const goalOrder = {
        classic: ['early_raise', 'board_break', 'exact21'],
        routed: ['early_raise', 'board_break', 'private_reserve', 'exact21']
    };

    function tableGoal(mode, completedHands, ante) {
        const order = goalOrder[mode] || goalOrder.classic;
        const index = Math.max(0, Number(completedHands) || 0) % order.length;
        return {
            ...goals[order[index]],
            reward: Math.max(5, Math.round((Number(ante) || 0) * 0.10))
        };
    }

    function tableGoalComplete(goal, state) {
        if (!goal || state.outcome !== 'win') return false;
        if (goal.id === 'early_raise') {
            return state.raisedAtDraw === 0;
        }
        if (goal.id === 'board_break') return !!state.boardBrokeDealer;
        if (goal.id === 'private_reserve') {
            return state.mode === 'routed' && state.privateLeft >= 1;
        }
        if (goal.id === 'exact21') return state.playerTotal === 21;
        return false;
    }

    /**
     * Price the next conviction press. A read may be backed once at each new
     * card state, up to half the original ante across the whole hand. Early
     * windows carry more leverage; unused windows expire when another card is
     * drawn. A scouted card freezes the current window until it is consumed.
     */
    function pressOffer({ ante, bankroll, drawsTaken, pressedTotal, pressedAtDraw, scoutLocked }) {
        const base = Math.max(0, Number(ante) || 0);
        const cash = Math.max(0, Number(bankroll) || 0);
        const draws = Math.max(0, Number(drawsTaken) || 0);
        const committed = Math.max(0, Number(pressedTotal) || 0);
        const limit = Math.max(0, Math.round(base * 0.50));
        const remaining = Math.max(0, limit - committed);
        const rate = draws === 0 ? 0.20 : draws <= 2 ? 0.10 : 0.05;
        const stageAmount = base > 0 ? Math.max(1, Math.round(base * rate)) : 0;
        const usedThisWindow = pressedAtDraw !== null
            && pressedAtDraw !== undefined
            && Number(pressedAtDraw) === draws;
        const amount = scoutLocked || usedThisWindow
            ? 0
            : Math.min(stageAmount, remaining, cash);

        return {
            amount,
            limit,
            remaining,
            rate,
            usedThisWindow,
            locked: !!scoutLocked,
            maxed: remaining === 0
        };
    }

    function pressureGain({ drawsTaken, scoutUsed }) {
        return scoutUsed || Number(drawsTaken) >= 2 ? 2 : 1;
    }

    function counterBounty({ ante, pressure, counterUsed, outcome }) {
        if (!counterUsed || outcome !== 'win') return 0;
        const level = Math.max(0, Math.min(3, Number(pressure) || 0));
        // Counter is the table's visible retaliation. Beating it needs a
        // memorable upside large enough to reward selective conviction, while
        // level-one probing and hands where Counter never fires earn nothing.
        const rate = level >= 3 ? 1 : level >= 2 ? 0.50 : 0;
        return Math.round((Number(ante) || 0) * rate);
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

    function tablePressureCost(ante) {
        return Math.max(5, Math.round((Number(ante) || 0) * 0.50));
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

    const rankWeights = [
        ['A', 4], ['2', 4], ['3', 4], ['4', 4], ['5', 4], ['6', 4],
        ['7', 4], ['8', 4], ['9', 4], ['10', 16]
    ];

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
     * A transparent showdown opponent. It never sees the next card: it only
     * compares the revealed scores and uses the public, full-shoe rank odds.
     * Behind means chase, ahead means protect, and maximum Pressure only risks
     * a low tie when the public full-shoe odds are favorable or near-even.
     */
    function dealerMove({ dealerTotal, playerTotal, soft = false, pressureAvailable = true, pressure = 0 }) {
        const dealer = Number(dealerTotal) || 0;
        const player = Number(playerTotal) || 0;
        const heat = Math.max(0, Math.min(3, Number(pressure) || 0));
        if (dealer > 21 || player > 21 || dealer === 21) {
            return { draw: false, intent: 'hold', edge: -1, usesCounter: false };
        }
        if (dealer < player) {
            if (dealer < 17) return { draw: true, intent: 'build', edge: 1, usesCounter: false };
            const gap = player - dealer;
            const counterRange = [0, 2, 4, 21][heat];
            return pressureAvailable && gap <= counterRange
                ? { draw: true, intent: 'counter', edge: 1, usesCounter: true }
                : { draw: false, intent: 'concede', edge: -1, usesCounter: false };
        }
        if (dealer > player) {
            return { draw: false, intent: 'protect', edge: 1, usesCounter: false };
        }

        let wins = 0;
        let losses = 0;
        for (const [rank, weight] of rankWeights) {
            const next = totalAfterRank(dealer, soft, rank).total;
            if (next > 21) losses += weight;
            else if (next > player) wins += weight;
        }
        const edge = (wins - losses) / 52;
        return heat >= 3 && edge > -0.08 && pressureAvailable
            ? { draw: true, intent: 'attack-tie', edge, usesCounter: true }
            : { draw: false, intent: 'hold-push', edge, usesCounter: false };
    }

    function decisionInsight(state) {
        if (state.challengeWon) return `Table goal cleared — ${state.challengeText}.`;
        if (state.outcome === 'win' && state.counterUsed) {
            return state.pressure >= 2
                ? 'Your pressure woke the Counter — then made its failed chase pay a bounty.'
                : 'The dealer countered your read, and you held the stronger line.';
        }
        if (state.outcome === 'win' && state.boardBrokeDealer) {
            return 'Board read paid off — your shared card broke the dealer.';
        }
        if (state.outcome === 'win' && state.pressTotal > 0 && state.scoutUsed) {
            return 'You bought the read, then backed the next open press window.';
        }
        if (state.outcome === 'win' && state.pressTotal > 0) {
            return state.raisedAtDraw === 0
                ? 'Strong commitment — you backed the read at the best price.'
                : 'You waited for a sharper read, but the press price had narrowed.';
        }
        if (state.scoutUsed) {
            return 'Scout bought certainty — use it when it changes your route.';
        }
        if (state.outcome === 'win' && state.mode === 'routed' && state.privateLeft > 0) {
            return 'Efficient hand — you won with a private draw still in reserve.';
        }
        if (state.outcome === 'win' && state.drawsTaken === 0) {
            return 'Clean read — you won without taking another card.';
        }
        if (state.bust) {
            return 'The shared board breaks you first — route the risk before the next draw.';
        }
        if (state.outcome === 'push') {
            return 'The range read was close — the hand finished level.';
        }
        return state.outcome === 'win'
            ? 'Good read — carry that line into the next hand.'
            : 'The line missed — use the dealer range to sharpen the next decision.';
    }

    const api = {
        tableGoal,
        tableGoalComplete,
        pressOffer,
        pressureGain,
        counterBounty,
        tableProfiles,
        tablePressureCost,
        tableAiMove,
        tableCallDecision,
        tableBoardDecision,
        tableShowdown,
        dealerMove,
        decisionInsight
    };
    if (typeof window !== 'undefined') window.TJRules = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}());
