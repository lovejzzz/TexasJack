/* ========================================================================== 
   Texas Jack — Four-Seat Table
   A neutral shoe, one shared board, three readable rivals, and one live pot.
   ========================================================================== */

const { Deck, cardFaceSVG, cardBackSVG, handTotal } = window.TJCards;
const {
    tableProfiles,
    tablePressureCost,
    tableAiMove,
    tableCallDecision,
    tableShowdown
} = window.TJRules;

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const money = value => '$' + Math.max(0, Math.round(value || 0)).toLocaleString('en-US');
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const el = {
    shell: document.querySelector('.table-arena'),
    felt: $('felt'),
    bankroll: $('bankroll'),
    pot: $('potValue'),
    centerPot: $('centerPot'),
    tablePot: $('tablePot'),
    wins: $('streak'),
    status: $('status'),
    shoe: $('shoe'),
    shoeCount: $('shoeCount'),
    sharedCards: $('sharedCards'),
    playerCards: $('playerCards'),
    playerTotal: $('playerTotal'),
    privateCount: $('privateCount'),
    antePanel: $('antePanel'),
    anteChips: $('anteChips'),
    anteLabel: $('anteLabel'),
    dealBtn: $('dealBtn'),
    dealLabel: $('dealLabel'),
    turnPanel: $('turnPanel'),
    boardBtn: $('boardBtn'),
    handBtn: $('handBtn'),
    handLeft: $('handLeft'),
    lockBtn: $('lockBtn'),
    pressureBtn: $('pressureBtn'),
    pressureCost: $('pressureCost'),
    pressureNote: $('pressureNote'),
    responsePanel: $('responsePanel'),
    responseKicker: $('responseKicker'),
    responseText: $('responseText'),
    callBtn: $('callBtn'),
    callAmount: $('callAmount'),
    foldBtn: $('foldBtn'),
    rulesModal: $('rulesModal'),
    rulesBtn: $('rulesBtn'),
    rulesClose: $('rulesClose'),
    rulesGo: $('rulesGo'),
    soundBtn: $('soundBtn'),
    soundLabel: $('soundLabel'),
    result: $('tableResult'),
    resultEyebrow: $('resultEyebrow'),
    resultTitle: $('resultTitle'),
    resultPot: $('resultPot'),
    resultDetail: $('resultDetail'),
    againBtn: $('againBtn'),
    fx: $('fx')
};

const PHASE = {
    BET: 'bet', DEALING: 'dealing', PLAYER: 'player', AI: 'ai',
    RESOLVING: 'resolving', RESPOND: 'respond', OVER: 'over'
};
const START_BANK = 1000;
const REBUY = 500;
const MIN_ANTE = 25;
const ANTE_OPTIONS = [25, 50, 100, 250];
const PRIVATE_DRAWS = 2;
const UNKNOWN_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

function readJson(key, fallback = {}) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
}

function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { /* Private browsing can reject storage. The hand still works. */ }
}

const mainSave = readJson('tj.save');
const tableSave = readJson('tj.table');

function savedCount(value, fallback = 0) {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function seat(id, profile, stack) {
    const info = profile ? tableProfiles[profile] : { name: 'You', title: 'Player' };
    return {
        id,
        profile,
        name: info.name,
        title: info.title,
        stack,
        hand: [],
        status: 'waiting',
        lockedAt: null,
        privateLeft: PRIVATE_DRAWS,
        contribution: 0,
        lastAction: profile ? info.tell : 'Choose an ante',
        revealed: false
    };
}

const startingBank = savedCount(mainSave.bankroll, START_BANK);
const savedStacks = tableSave.stacks || {};
const game = {
    deck: new Deck(),
    seats: [
        seat('you', null, startingBank),
        seat('rock', 'rock', savedCount(savedStacks.rock, START_BANK)),
        seat('shark', 'shark', savedCount(savedStacks.shark, START_BANK)),
        seat('spark', 'spark', savedCount(savedStacks.spark, START_BANK))
    ],
    shared: [],
    phase: PHASE.BET,
    ante: ANTE_OPTIONS.includes(tableSave.ante) ? tableSave.ante : 50,
    pot: 0,
    turn: 0,
    boardVersion: 0,
    pressureUsedAt: null,
    pendingResponse: null,
    responseResolve: null,
    roundToken: 0,
    handNumber: savedCount(tableSave.hands),
    wins: Math.min(savedCount(tableSave.hands), savedCount(tableSave.wins)),
    revealAll: false,
    resultReady: false
};

const you = () => game.seats[0];
const eligible = seatState => !['folded', 'bust', 'waiting'].includes(seatState.status);
const active = seatState => seatState.status === 'active';

function persist() {
    const sharedSave = readJson('tj.save');
    sharedSave.bankroll = you().stack;
    sharedSave.best = Math.max(Number(sharedSave.best) || START_BANK, you().stack);
    writeJson('tj.save', sharedSave);
    writeJson('tj.table', {
        seen: true,
        ante: game.ante,
        hands: game.handNumber,
        wins: game.wins,
        stacks: Object.fromEntries(game.seats.slice(1).map(item => [item.id, item.stack]))
    });
}

function countedBoard(seatState) {
    const count = seatState.lockedAt === null ? game.shared.length : seatState.lockedAt;
    return game.shared.slice(0, count);
}

function totalOf(seatState) {
    return handTotal(seatState.hand, countedBoard(seatState));
}

function totalState(total, live = true) {
    if (!live) return 'idle';
    if (total > 21) return 'bust';
    if (total === 21) return 'perfect';
    if (total >= 18) return 'warm';
    return 'safe';
}

function accessibleCardName(card) {
    const suit = window.TJCards.SUITS.find(item => item.key === card.suit);
    return `${card.rank} of ${suit ? suit.name : card.suit}`;
}

function cardNode(card, concealed = false, className = '') {
    const node = document.createElement('div');
    node.className = `ring-card ${className}`.trim();
    node.dataset.cid = card.id;
    node.dataset.side = concealed ? 'back' : 'face';
    node.innerHTML = concealed ? cardBackSVG() : cardFaceSVG(card);
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', concealed ? 'Face-down private card' : accessibleCardName(card));
    node.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    return node;
}

function hiddenRange(seatState) {
    if (!seatState.hand.length) return null;
    const board = countedBoard(seatState);
    const totals = [];
    const walk = (depth, cards) => {
        if (depth === seatState.hand.length) {
            totals.push(handTotal(cards, board).total);
            return;
        }
        for (const rank of UNKNOWN_RANKS) walk(depth + 1, cards.concat({ rank }));
    };
    walk(0, []);
    const live = totals.filter(value => value <= 21);
    const values = live.length ? live : totals;
    return { min: Math.min(...values), max: Math.max(...values) };
}

function renderCards(container, cards, concealed, compact = false) {
    const existing = new Map(
        [...container.children].map(node => [node.dataset.cid, node])
    );
    const wanted = new Set(cards.map(card => String(card.id)));

    cards.forEach((card, index) => {
        const key = String(card.id);
        let node = existing.get(key);
        const isNew = !node;

        if (!node) node = cardNode(card, concealed, compact ? 'compact-card' : '');

        const side = concealed ? 'back' : 'face';
        if (node.dataset.side !== side) {
            node.dataset.side = side;
            node.innerHTML = concealed ? cardBackSVG() : cardFaceSVG(card);
            node.setAttribute('aria-label', concealed ? 'Face-down private card' : accessibleCardName(card));
            node.querySelector('svg')?.setAttribute('aria-hidden', 'true');
        }
        node.classList.toggle('compact-card', compact);

        const currentAtIndex = container.children[index];
        if (currentAtIndex !== node) container.insertBefore(node, currentAtIndex || null);

        if (isNew) {
            node.classList.add('latest-card');
            node.addEventListener('animationend', () => node.classList.remove('latest-card'), { once: true });
        }
    });

    [...container.children].forEach(node => {
        if (!wanted.has(node.dataset.cid)) node.remove();
    });
}

function renderSeat(seatState) {
    if (seatState.id === 'you') {
        $('seat-you').dataset.state = seatState.status;
        const total = seatState.hand.length ? totalOf(seatState) : { total: 0, soft: false };
        el.playerTotal.textContent = seatState.hand.length
            ? total.soft && total.total !== 21 ? `${total.total} soft` : total.total
            : '—';
        el.playerTotal.dataset.state = totalState(total.total, !!seatState.hand.length);
        el.privateCount.textContent = `${seatState.privateLeft} private draw${seatState.privateLeft === 1 ? '' : 's'}`;
        $('status-you').textContent = seatState.lastAction;
        renderCards(el.playerCards, seatState.hand, false);
    } else {
        const root = $(`seat-${seatState.id}`);
        const rangeNode = $(`range-${seatState.id}`);
        const statusNode = $(`status-${seatState.id}`);
        const cardsNode = $(`cards-${seatState.id}`);
        $(`stack-${seatState.id}`).textContent = money(seatState.stack);
        root.dataset.state = seatState.status;

        if (game.revealAll || seatState.revealed) {
            const value = totalOf(seatState).total;
            rangeNode.textContent = value > 21 ? `${value} bust` : value;
            renderCards(cardsNode, seatState.hand, false, true);
        } else if (seatState.status === 'bust') {
            rangeNode.textContent = 'BUST';
            renderCards(cardsNode, seatState.hand, true, true);
        } else if (seatState.status === 'folded') {
            rangeNode.textContent = 'FOLD';
            renderCards(cardsNode, seatState.hand, true, true);
        } else {
            const range = hiddenRange(seatState);
            rangeNode.textContent = !range ? '—' : range.min === range.max ? String(range.min) : `${range.min}–${range.max}`;
            renderCards(cardsNode, seatState.hand, true, true);
        }
        statusNode.textContent = seatState.lastAction;
    }
}

function pressureAvailable() {
    const cost = tablePressureCost(game.ante);
    return game.phase === PHASE.PLAYER
        && game.pressureUsedAt !== game.boardVersion
        && you().stack >= cost
        && game.seats.filter(eligible).length > 1;
}

function renderControls() {
    const betting = game.phase === PHASE.BET;
    const needsRebuy = you().stack < MIN_ANTE;
    const availableStack = needsRebuy ? REBUY : you().stack;
    if (betting && !needsRebuy && game.ante > availableStack) {
        const affordable = ANTE_OPTIONS.filter(amount => amount <= availableStack);
        game.ante = affordable[affordable.length - 1] || MIN_ANTE;
    }
    el.antePanel.hidden = !betting;
    el.turnPanel.hidden = betting || game.phase === PHASE.RESPOND || game.phase === PHASE.OVER;
    el.responsePanel.hidden = game.phase !== PHASE.RESPOND;

    el.anteChips.querySelectorAll('.chip').forEach(chip => {
        const amount = Number(chip.dataset.value);
        chip.classList.toggle('selected', amount === game.ante);
        chip.disabled = !betting || amount > availableStack;
    });
    el.anteLabel.textContent = needsRebuy
        ? 'The rail will stake a $500 rebuy'
        : `${money(game.ante)} each · ${money(game.ante * 4)} opening pot`;
    el.dealLabel.textContent = needsRebuy ? 'Rebuy & sit' : 'Take a seat';
    el.dealBtn.disabled = !betting || game.ante > availableStack;

    const yourTurn = game.phase === PHASE.PLAYER;
    el.boardBtn.disabled = !yourTurn;
    el.handBtn.disabled = !yourTurn || you().privateLeft <= 0;
    el.lockBtn.disabled = !yourTurn;
    el.handLeft.textContent = you().privateLeft;
    const cost = tablePressureCost(game.ante);
    el.pressureCost.textContent = money(cost);
    el.pressureBtn.disabled = !pressureAvailable();
    if (game.pressureUsedAt === game.boardVersion) {
        el.pressureNote.textContent = 'Pressure spent · next Board reopens';
    } else if (you().stack < cost) {
        el.pressureNote.textContent = 'Not enough chips to raise';
    } else {
        el.pressureNote.textContent = 'One bet per board';
    }

    if (game.phase === PHASE.RESPOND && game.pendingResponse) {
        const { aggressor, cost: responseCost } = game.pendingResponse;
        el.responseKicker.textContent = `${aggressor.name} applies Pressure`;
        el.responseText.textContent = `Call ${money(responseCost)} to stay in?`;
        el.callAmount.textContent = money(responseCost);
        el.callBtn.disabled = you().stack < responseCost;
    }
}

function renderMoney() {
    el.bankroll.textContent = money(you().stack);
    el.pot.textContent = money(game.pot);
    el.centerPot.textContent = money(game.pot);
    el.tablePot.dataset.live = String(game.pot > 0);
    el.wins.textContent = game.wins;
}

function render() {
    renderMoney();
    game.seats.forEach(renderSeat);
    renderCards(el.sharedCards, game.shared, false);
    el.felt.classList.toggle('is-idle-table', game.phase === PHASE.BET);
    el.felt.classList.toggle('has-board-cards', game.shared.length > 0);
    el.shoeCount.textContent = game.deck.remaining;
    const current = game.seats[game.turn];
    const showTurn = current && [PHASE.PLAYER, PHASE.AI, PHASE.RESOLVING].includes(game.phase);
    el.felt.querySelectorAll('.ring-seat').forEach(node => {
        node.classList.toggle('is-turn', Boolean(showTurn && node.id === `seat-${current.id}`));
    });
    renderControls();
}

function setStatus(message, thinking = false) {
    el.status.innerHTML = message + (thinking ? '<span class="dots"></span>' : '');
    el.status.classList.remove('flash');
    void el.status.offsetWidth;
    el.status.classList.add('flash');
}

function flashSeat(seatState, className) {
    const node = $(`seat-${seatState.id}`);
    if (!node) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), 1100);
}

function flyChip(seatState) {
    if (reducedMotion()) return;
    const fromNode = $(`seat-${seatState.id}`);
    const toNode = el.tablePot;
    if (!fromNode || !toNode) return;
    const from = fromNode.getBoundingClientRect();
    const to = toNode.getBoundingClientRect();
    const token = document.createElement('span');
    token.className = 'table-chip-flight';
    token.style.left = `${from.left + from.width / 2 - 8}px`;
    token.style.top = `${from.top + from.height / 2 - 8}px`;
    document.body.appendChild(token);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const animation = token.animate([
        { transform: 'translate(0,0) scale(.5)', opacity: 0 },
        { transform: `translate(${dx * .5}px,${dy * .4 - 24}px) scale(1.15)`, opacity: 1, offset: .55 },
        { transform: `translate(${dx}px,${dy}px) scale(.3) rotate(360deg)`, opacity: .2 }
    ], { duration: 520, easing: 'cubic-bezier(.2,.8,.3,1)' });
    animation.onfinish = () => token.remove();
}

function flyPotAward(winners) {
    if (reducedMotion() || !winners.length) return;
    const from = el.tablePot.getBoundingClientRect();
    winners.forEach((winner, winnerIndex) => {
        const target = $(`seat-${winner.id}`)?.getBoundingClientRect();
        if (!target) return;
        for (let index = 0; index < 6; index += 1) {
            const token = document.createElement('span');
            token.className = 'table-chip-flight award-flight';
            token.style.left = `${from.left + from.width / 2 - 8}px`;
            token.style.top = `${from.top + from.height / 2 - 8}px`;
            document.body.appendChild(token);
            const dx = target.left + target.width / 2 - (from.left + from.width / 2);
            const dy = target.top + target.height / 2 - (from.top + from.height / 2);
            const drift = (index - 2.5) * 7;
            const animation = token.animate([
                { transform: 'translate(0,0) scale(.3)', opacity: 0 },
                { transform: `translate(${drift}px,-18px) scale(1.1)`, opacity: 1, offset: .25 },
                { transform: `translate(${dx + drift}px,${dy}px) scale(.25) rotate(${420 + index * 35}deg)`, opacity: .15 }
            ], {
                duration: 650,
                delay: winnerIndex * 100 + index * 65,
                easing: 'cubic-bezier(.2,.76,.25,1)',
                fill: 'forwards'
            });
            animation.onfinish = () => token.remove();
        }
        flashSeat(winner, 'seat-paid');
    });
    if (winners.some(winner => winner.id === 'you')) {
        const readout = el.bankroll.closest('.readout');
        setTimeout(() => {
            readout.classList.remove('payout-catch');
            void readout.offsetWidth;
            readout.classList.add('payout-catch');
            setTimeout(() => readout.classList.remove('payout-catch'), 900);
        }, 560);
    }
}

function commit(seatState, amount) {
    const paid = Math.min(seatState.stack, amount);
    seatState.stack -= paid;
    seatState.contribution += paid;
    game.pot += paid;
    SFX.chip();
    flyChip(seatState);
    renderMoney();
    // A live hand is transactional. Persisting each ante/call without also
    // restoring the round made a refresh permanently lose chips. Settlement
    // commits the complete hand atomically; a mid-hand reload returns to the
    // last finished table state.
    return paid;
}

function resetSeat(seatState) {
    seatState.hand = [];
    seatState.status = 'active';
    seatState.lockedAt = null;
    seatState.privateLeft = PRIVATE_DRAWS;
    seatState.contribution = 0;
    seatState.revealed = false;
    seatState.lastAction = seatState.profile ? tableProfiles[seatState.profile].tell : 'Your move';
}

async function startHand() {
    if (game.phase !== PHASE.BET) return;
    if (you().stack < MIN_ANTE) {
        you().stack = REBUY;
        persist();
        flashSeat(you(), 'seat-paid');
    }
    if (game.ante > you().stack) {
        setStatus(`Choose an ante no larger than your ${money(you().stack)} bankroll.`);
        return;
    }

    game.roundToken += 1;
    const token = game.roundToken;
    game.phase = PHASE.DEALING;
    game.shared = [];
    game.pot = 0;
    game.boardVersion = 0;
    game.pressureUsedAt = null;
    game.pendingResponse = null;
    game.revealAll = false;
    game.resultReady = false;
    game.deck = new Deck();
    el.result.classList.add('hidden');
    el.result.setAttribute('aria-hidden', 'true');

    game.seats.forEach(seatState => {
        if (seatState.id !== 'you' && seatState.stack < game.ante) seatState.stack = START_BANK;
        resetSeat(seatState);
        commit(seatState, game.ante);
    });
    render();
    setStatus(`Four antes hit the felt — <b>${money(game.pot)}</b> is live.`, true);

    for (const seatState of game.seats) {
        if (token !== game.roundToken) return;
        seatState.hand.push(game.deck.draw());
        SFX.deal();
        render();
        await sleep(reducedMotion() ? 10 : 150);
    }
    game.shared.push(game.deck.draw());
    SFX.flip();
    render();
    await sleep(reducedMotion() ? 10 : 360);

    game.turn = 0;
    game.phase = PHASE.PLAYER;
    you().lastAction = 'Your move';
    render();
    setStatus('Your move — attack the <b>Board</b>, draw to your <b>Hand</b>, or <b>Lock</b>.');
}

function breakActiveSeats() {
    const broken = [];
    for (const seatState of game.seats) {
        if (!active(seatState)) continue;
        if (totalOf(seatState).total > 21) {
            seatState.status = 'bust';
            seatState.lockedAt = game.shared.length;
            seatState.lastAction = 'broken by the board';
            broken.push(seatState);
            flashSeat(seatState, 'seat-bust');
        }
    }
    if (broken.length >= 2) {
        el.felt.classList.add('multi-bust');
        setTimeout(() => el.felt.classList.remove('multi-bust'), 1200);
        SFX.bust();
    }
    return broken;
}

async function takeAction(seatState, action, reason = '') {
    const token = game.roundToken;
    game.phase = PHASE.RESOLVING;
    seatState.lastAction = reason || action;
    render();

    if (action === 'board') {
        setStatus(`<b>${seatState.name}</b> opens the shared board…`, true);
        await sleep(reducedMotion() ? 10 : 360);
        if (token !== game.roundToken) return;
        game.shared.push(game.deck.draw());
        game.boardVersion += 1;
        game.pressureUsedAt = null;
        seatState.lastAction = 'sent a card to everyone active';
        SFX.deal();
        const broken = breakActiveSeats();
        render();
        if (broken.length) {
            const names = broken.map(item => item.id === 'you' ? 'You' : item.name).join(' and ');
            setStatus(`${names} ${broken.length === 1 ? 'breaks' : 'break'} on the shared card.`);
            await sleep(reducedMotion() ? 10 : 720);
        }
    } else if (action === 'hand') {
        seatState.privateLeft -= 1;
        seatState.hand.push(game.deck.draw());
        seatState.lastAction = 'took the risk private';
        SFX.deal();
        if (totalOf(seatState).total > 21) {
            seatState.status = 'bust';
            seatState.lockedAt = game.shared.length;
            seatState.lastAction = 'broke on a private draw';
            flashSeat(seatState, 'seat-bust');
            if (seatState.id === 'you') SFX.bust();
        }
        render();
        await sleep(reducedMotion() ? 10 : 420);
    } else {
        seatState.status = 'locked';
        seatState.lockedAt = game.shared.length;
        seatState.lastAction = 'LOCKED · future board cards miss';
        SFX.button();
        flashSeat(seatState, 'seat-locked');
        render();
        await sleep(reducedMotion() ? 10 : 280);
    }

    if (await maybeFinish()) return;
    await advanceFrom(game.seats.indexOf(seatState));
}

async function maybeFinish() {
    const contenders = game.seats.filter(eligible);
    if (contenders.length <= 1 || !game.seats.some(active)) {
        await finishHand();
        return true;
    }
    return false;
}

function nextActiveIndex(after) {
    for (let step = 1; step <= game.seats.length; step += 1) {
        const index = (after + step) % game.seats.length;
        if (active(game.seats[index])) return index;
    }
    return -1;
}

async function advanceFrom(after) {
    const index = nextActiveIndex(after);
    if (index < 0) {
        await finishHand();
        return;
    }
    game.turn = index;
    const seatState = game.seats[index];
    if (seatState.id === 'you') {
        game.phase = PHASE.PLAYER;
        you().lastAction = 'Your move';
        render();
        setStatus('Your move — the table is waiting on your read.');
    } else {
        await runAiTurn(seatState);
    }
}

async function runAiTurn(seatState) {
    const token = game.roundToken;
    game.phase = PHASE.AI;
    seatState.lastAction = 'reading the table';
    render();
    setStatus(`<b>${seatState.name}</b> is reading the board`, true);
    await sleep(reducedMotion() ? 10 : 520);
    if (token !== game.roundToken || !active(seatState)) return;

    const current = totalOf(seatState);
    const move = tableAiMove({
        total: current.total,
        soft: current.soft,
        privateLeft: seatState.privateLeft,
        profile: seatState.profile,
        pressureOpen: game.pressureUsedAt !== game.boardVersion && seatState.stack >= tablePressureCost(game.ante),
        roll: Math.random()
    });

    if (move.pressure && game.seats.filter(eligible).length > 1) {
        await resolvePressure(seatState);
        if (token !== game.roundToken || game.phase === PHASE.OVER) return;
        if (await maybeFinish()) return;
    }
    if (!active(seatState)) {
        await advanceFrom(game.seats.indexOf(seatState));
        return;
    }
    await takeAction(seatState, move.action, move.reason);
}

function aiResponds(target, cost) {
    const state = totalOf(target);
    return tableCallDecision({
        total: state.total,
        soft: state.soft,
        locked: target.status === 'locked',
        profile: target.profile,
        cost,
        pot: game.pot,
        ante: game.ante,
        roll: Math.random()
    });
}

async function resolvePressure(aggressor) {
    if (game.pressureUsedAt === game.boardVersion) return;
    const token = game.roundToken;
    const cost = tablePressureCost(game.ante);
    game.pressureUsedAt = game.boardVersion;
    game.phase = PHASE.RESOLVING;
    aggressor.lastAction = `PRESSURE · raised ${money(cost)}`;
    commit(aggressor, cost);
    flashSeat(aggressor, 'seat-pressure');
    SFX.counter();
    render();
    setStatus(`<b>${aggressor.name}</b> raises ${money(cost)} — the whole table must answer.`);
    await sleep(reducedMotion() ? 10 : 500);

    for (const target of game.seats.slice(1)) {
        if (token !== game.roundToken || target === aggressor || !eligible(target)) continue;
        const decision = aiResponds(target, cost);
        if (decision.call && target.stack >= cost) {
            commit(target, cost);
            target.lastAction = `CALL · ${decision.reason}`;
            flashSeat(target, 'seat-called');
        } else {
            target.status = 'folded';
            target.lockedAt = game.shared.length;
            target.lastAction = `FOLD · ${decision.reason}`;
            flashSeat(target, 'seat-folded');
        }
        render();
        await sleep(reducedMotion() ? 10 : 260);
    }

    if (aggressor.id !== 'you' && eligible(you())) {
        game.pendingResponse = { aggressor, cost };
        game.phase = PHASE.RESPOND;
        render();
        const called = await new Promise(resolve => { game.responseResolve = resolve; });
        game.responseResolve = null;
        if (token !== game.roundToken) return;
        if (called && you().stack >= cost) {
            commit(you(), cost);
            you().lastAction = 'CALL · stayed in the fire';
            flashSeat(you(), 'seat-called');
        } else {
            you().status = 'folded';
            you().lockedAt = game.shared.length;
            you().lastAction = 'FOLD · protected the stack';
            flashSeat(you(), 'seat-folded');
        }
        game.pendingResponse = null;
        game.phase = PHASE.RESOLVING;
        render();
        await sleep(reducedMotion() ? 10 : 320);
    }
}

async function playerPressure() {
    if (!pressureAvailable()) return;
    await resolvePressure(you());
    if (game.phase === PHASE.OVER || await maybeFinish()) return;
    game.phase = PHASE.PLAYER;
    you().lastAction = 'Pressure landed · choose your card line';
    render();
    setStatus('The table answered. Now choose where the next risk goes.');
}

function answerPressure(call) {
    if (game.phase !== PHASE.RESPOND || !game.responseResolve) return;
    if (call && you().stack < game.pendingResponse.cost) return;
    const resolve = game.responseResolve;
    game.responseResolve = null;
    resolve(call);
}

async function finishHand() {
    if (game.phase === PHASE.OVER) return;
    const token = game.roundToken;
    game.phase = PHASE.OVER;
    game.resultReady = false;
    el.shell.setAttribute('inert', '');
    game.revealAll = true;
    const outcomes = game.seats.map(seatState => ({
        id: seatState.id,
        total: totalOf(seatState).total,
        status: seatState.status
    }));
    const showdown = tableShowdown(outcomes);
    const winners = showdown.winnerIds.map(id => game.seats.find(seatState => seatState.id === id));
    const fullPot = game.pot;
    let userShare = 0;

    if (winners.length) {
        const baseShare = Math.floor(fullPot / winners.length);
        let remainder = fullPot - baseShare * winners.length;
        winners.forEach(winner => {
            const share = baseShare + (remainder > 0 ? 1 : 0);
            remainder -= remainder > 0 ? 1 : 0;
            winner.stack += share;
            if (winner.id === 'you') userShare = share;
        });
    }

    game.pot = 0;
    game.handNumber += 1;
    const userWon = showdown.winnerIds.includes('you');
    if (userWon) game.wins += 1;
    persist();
    render();
    flyPotAward(winners);

    const winnerNames = winners.map(winner => winner.id === 'you' ? 'You' : winner.name);
    if (!winners.length) {
        el.resultEyebrow.textContent = 'Table break';
        el.resultTitle.textContent = 'Nobody survives the board';
        el.resultPot.textContent = 'Pot burned';
        el.resultDetail.textContent = 'Four broken lines. The rail takes the dead pot.';
        SFX.lose();
    } else if (userWon && winners.length === 1) {
        el.resultEyebrow.textContent = `Showdown · ${showdown.winningTotal}`;
        el.resultTitle.textContent = 'You take the table';
        el.resultPot.textContent = `+${money(userShare)}`;
        el.resultDetail.textContent = 'Three rivals answered. Your number held.';
        SFX.win();
        confetti(120);
    } else if (userWon) {
        el.resultEyebrow.textContent = `Split pot · ${showdown.winningTotal}`;
        el.resultTitle.textContent = `You split with ${winnerNames.filter(name => name !== 'You').join(' & ')}`;
        el.resultPot.textContent = `+${money(userShare)}`;
        el.resultDetail.textContent = `${money(fullPot)} divided across ${winners.length} matching reads.`;
        SFX.push();
    } else {
        const lead = winners[0];
        el.resultEyebrow.textContent = winners.length > 1 ? `Split pot · ${showdown.winningTotal}` : `Showdown · ${showdown.winningTotal}`;
        el.resultTitle.textContent = winners.length > 1 ? `${winnerNames.join(' & ')} split it` : `${lead.name} takes the table`;
        el.resultPot.textContent = money(fullPot);
        el.resultDetail.textContent = lead ? `${lead.title} found the strongest live number.` : 'The shared board won.';
        SFX.lose();
    }

    setStatus(winners.length ? `${winnerNames.join(' & ')} ${winners.length === 1 ? 'wins' : 'win'} the ${money(fullPot)} pot.` : 'Every seat broke.');
    await sleep(reducedMotion() ? 10 : 700);
    if (token !== game.roundToken || game.phase !== PHASE.OVER) return;
    game.resultReady = true;
    el.result.classList.remove('hidden');
    el.result.setAttribute('aria-hidden', 'false');
    // The overlay transitions visibility for 220 ms; focusing before it is
    // actually visible is ignored by browsers. Land focus after that handoff.
    setTimeout(() => el.againBtn.focus(), 260);
}

function readyNextHand() {
    if (game.phase !== PHASE.OVER || !game.resultReady) return;
    game.roundToken += 1;
    game.phase = PHASE.BET;
    game.resultReady = false;
    el.shell.removeAttribute('inert');
    game.seats.forEach(seatState => {
        seatState.status = 'waiting';
        seatState.hand = [];
        seatState.lockedAt = null;
        seatState.lastAction = seatState.profile ? tableProfiles[seatState.profile].tell : 'Choose an ante';
    });
    game.shared = [];
    game.revealAll = false;
    el.result.classList.add('hidden');
    el.result.setAttribute('aria-hidden', 'true');
    render();
    setStatus('Choose the next ante. Everyone buys in at the same price.');
    setTimeout(() => el.dealBtn.focus(), 0);
}

function syncSound() {
    el.soundBtn.classList.toggle('is-muted', SFX.muted);
    el.soundLabel.textContent = SFX.muted ? 'Sound off' : 'Sound on';
    el.soundBtn.setAttribute('aria-pressed', String(!SFX.muted));
}

let rulesReturnFocus = null;
function rulesFocusables() {
    return [...el.rulesModal.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
}

function openRules() {
    // Keep one focus-owning surface at a time. The persistent result dialog
    // already covers the table; stacking the rules modal over it creates an
    // ambiguous focus trap and an unnecessarily expensive double backdrop.
    if (game.phase === PHASE.OVER || !el.rulesModal.classList.contains('hidden')) return;
    rulesReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.rulesModal.classList.remove('hidden');
    el.shell.setAttribute('inert', '');
    setTimeout(() => el.rulesClose.focus(), 0);
}

function closeRules() {
    if (el.rulesModal.classList.contains('hidden')) return;
    el.rulesModal.classList.add('hidden');
    const resultOwnsFocus = game.phase === PHASE.OVER;
    if (!resultOwnsFocus) el.shell.removeAttribute('inert');
    const target = resultOwnsFocus
        ? (game.resultReady ? el.againBtn : null)
        : (rulesReturnFocus && document.contains(rulesReturnFocus) ? rulesReturnFocus : el.rulesBtn);
    rulesReturnFocus = null;
    if (target) setTimeout(() => target.focus(), 0);
}

const fxCtx = el.fx.getContext('2d');
let pieces = [];
let fxRunning = false;
function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.fx.width = window.innerWidth * dpr;
    el.fx.height = window.innerHeight * dpr;
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function confetti(count) {
    if (reducedMotion()) return;
    const colors = ['#f2c76a', '#ffe6a8', '#46e08b', '#ff7a54', '#8b5bd6'];
    for (let i = 0; i < count; i += 1) {
        pieces.push({
            x: window.innerWidth * (.25 + Math.random() * .5),
            y: window.innerHeight * .45,
            vx: (Math.random() - .5) * 9,
            vy: -5 - Math.random() * 9,
            size: 4 + Math.random() * 7,
            color: colors[i % colors.length],
            life: 1
        });
    }
    if (!fxRunning) { fxRunning = true; requestAnimationFrame(stepFx); }
}

function stepFx() {
    fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    pieces = pieces.filter(piece => piece.life > 0 && piece.y < window.innerHeight + 40);
    pieces.forEach(piece => {
        piece.vy += .32;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.life -= .008;
        fxCtx.globalAlpha = Math.max(0, piece.life);
        fxCtx.fillStyle = piece.color;
        fxCtx.fillRect(piece.x, piece.y, piece.size, piece.size * .55);
    });
    fxCtx.globalAlpha = 1;
    if (pieces.length) requestAnimationFrame(stepFx);
    else { fxRunning = false; }
}

el.anteChips.addEventListener('click', event => {
    const chip = event.target.closest('.chip');
    if (!chip || chip.disabled || game.phase !== PHASE.BET) return;
    game.ante = Number(chip.dataset.value);
    persist();
    SFX.chip();
    renderControls();
});
el.dealBtn.addEventListener('click', startHand);
el.boardBtn.addEventListener('click', () => game.phase === PHASE.PLAYER && takeAction(you(), 'board'));
el.handBtn.addEventListener('click', () => game.phase === PHASE.PLAYER && you().privateLeft > 0 && takeAction(you(), 'hand'));
el.lockBtn.addEventListener('click', () => game.phase === PHASE.PLAYER && takeAction(you(), 'lock'));
el.pressureBtn.addEventListener('click', playerPressure);
el.callBtn.addEventListener('click', () => answerPressure(true));
el.foldBtn.addEventListener('click', () => answerPressure(false));
el.againBtn.addEventListener('click', readyNextHand);
el.rulesBtn.addEventListener('click', openRules);
el.rulesClose.addEventListener('click', closeRules);
el.rulesGo.addEventListener('click', closeRules);
el.rulesModal.addEventListener('click', event => { if (event.target === el.rulesModal) closeRules(); });
el.soundBtn.addEventListener('click', () => { SFX.toggleMute(); syncSound(); });

document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') { closeRules(); return; }
    if (!el.rulesModal.classList.contains('hidden')) {
        if (key === 'tab') {
            const focusables = rulesFocusables();
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
        return;
    }
    if (key === 'b' && !el.boardBtn.disabled) takeAction(you(), 'board');
    else if (key === 'h' && !el.handBtn.disabled) takeAction(you(), 'hand');
    else if (key === 'l' && !el.lockBtn.disabled) takeAction(you(), 'lock');
    else if (key === 'r' && !el.pressureBtn.disabled) playerPressure();
    else if (key === 'c' && game.phase === PHASE.RESPOND && !el.callBtn.disabled) answerPressure(true);
    else if (key === 'f' && game.phase === PHASE.RESPOND) answerPressure(false);
    else if (key === 'm') { SFX.toggleMute(); syncSound(); }
    else if (key === '?' || key === '/') openRules();
    else if (key === 'enter') {
        // Prevent the browser from also clicking whichever button receives
        // focus during this state change. Without this, one Enter could both
        // dismiss the result and immediately deal the next hand.
        event.preventDefault();
        if (game.phase === PHASE.BET && !el.dealBtn.disabled) startHand();
        else if (game.phase === PHASE.OVER) readyNextHand();
    }
});

['pointerdown', 'keydown'].forEach(eventName =>
    window.addEventListener(eventName, () => SFX.unlock(), { once: true }));
window.addEventListener('resize', sizeCanvas);

sizeCanvas();
syncSound();
render();
if (!tableSave.seen) {
    tableSave.seen = true;
    writeJson('tj.table', { ...tableSave, seen: true, ante: game.ante, hands: game.handNumber, wins: game.wins, stacks: savedStacks });
    openRules();
}
