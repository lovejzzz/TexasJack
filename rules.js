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

    function decisionInsight(state) {
        if (state.challengeWon) return `Table goal cleared — ${state.challengeText}.`;
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

    const api = { tableGoal, tableGoalComplete, pressOffer, decisionInsight };
    if (typeof window !== 'undefined') window.TJRules = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}());
