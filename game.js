/* ==========================================================================
   Texas Jack — game.js
   Blackjack's race to 21 on a Hold'em board, played as a heads-up duel with
   real betting against the three dealers of the Saloon Ladder.
   ========================================================================== */

const { Deck, cardFaceSVG, cardBackSVG, handTotal } = window.TJCards;
const {
    dealerMove,
    ladderRivals,
    ladderRival,
    ladderFall,
    LADDER_STAKE,
    DUEL_ROUNDS,
    duelAnte,
    duelBetSize,
    duelStrength,
    duelDealerAction
} = window.TJRules;

/* ---- DOM ----------------------------------------------------------------- */

const $ = id => document.getElementById(id);

const el = {
    table: document.querySelector('.table'),
    felt: $('felt'),
    dealerCards: $('dealerCards'),
    sharedCards: $('sharedCards'),
    playerCards: $('playerCards'),
    dealerTotal: $('dealerTotal'),
    playerTotal: $('playerTotal'),
    bankroll: $('bankroll'),
    pot: $('potValue'),
    streak: $('streak'),
    streakBox: $('streakBox'),
    status: $('status'),
    shoeCount: $('shoeCount'),
    shoe: $('shoe'),
    actionsRow: document.querySelector('.actions'),
    dealBtn: $('dealBtn'),
    dealLabel: $('dealLabel'),
    checkBtn: $('checkBtn'),
    betBtn: $('betBtn'),
    betLabel: $('betLabel'),
    callBtn: $('callBtn'),
    callLabel: $('callLabel'),
    raiseBtn: $('raiseBtn'),
    raiseLabel: $('raiseLabel'),
    foldBtn: $('foldBtn'),
    boardBtn: $('boardBtn'),
    handBtn: $('handBtn'),
    handLeft: $('handLeft'),
    standBtn: $('standBtn'),
    dealerName: $('dealerName'),
    rivalAvatar: $('rivalAvatar'),
    rivalSay: $('rivalSay'),
    houseRule: $('houseRule'),
    purseValue: $('purseValue'),
    purseBar: $('purseBar'),
    matchInfo: $('matchInfo'),
    roundInfo: $('roundInfo'),
    poster: $('poster'),
    posterCard: $('posterCard'),
    coach: $('coach'),
    coachText: $('coachText'),
    overlay: $('resultOverlay'),
    resultStamp: $('resultStamp'),
    resultWord: $('resultWord'),
    resultPayout: $('resultPayout'),
    resultInsight: $('resultInsight'),
    rulesModal: $('rulesModal'),
    rulesBtn: $('rulesBtn'),
    rulesClose: $('rulesClose'),
    rulesGo: $('rulesGo'),
    soundBtn: $('soundBtn'),
    soundLabel: $('soundLabel'),
    fx: $('fx'),
    dealerRead: $('dealerRead'),
    statHands: $('statHands'),
    statWins: $('statWins'),
    statRate: $('statRate'),
    statBest: $('statBest')
};

const laneOf = {
    player: el.playerCards.closest('.lane'),
    dealer: el.dealerCards.closest('.lane'),
    shared: el.sharedCards.closest('.lane')
};

/* ---- Constants ----------------------------------------------------------- */

const PRIVATE_DRAWS = 2;          // cards you may keep to yourself each hand

/* Every rank a face-down card could be, as a hand value. */
const UNKNOWN_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

const PHASE = {
    BET: 'bet',             // between hands
    DEALING: 'dealing',
    BETTING: 'betting',     // your turn in a betting round
    PLAYER: 'player',       // your turn to draw or stand
    RESOLVING: 'resolving',
    OVER: 'over'
};

/* ---- State --------------------------------------------------------------- */

const save = {
    read() {
        try { return JSON.parse(localStorage.getItem('tj.duel')) || {}; }
        catch { return {}; }
    },
    write(data) {
        try { localStorage.setItem('tj.duel', JSON.stringify(data)); } catch { /* private mode */ }
    }
};

const persisted = save.read();

function savedCount(value, fallback = 0) {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

const savedRung = Math.min(ladderRivals.length - 1, savedCount(persisted.rung));
const savedHands = savedCount(persisted.hands);

const game = {
    deck: new Deck(),
    player: [],
    dealer: [],
    shared: [],
    dealerBoard: [],
    phase: PHASE.BET,
    bankroll: savedCount(persisted.stake, LADDER_STAKE),
    rung: savedRung,
    purse: savedCount(persisted.purse, ladderRival(savedRung).purse),
    matchHand: savedCount(persisted.matchHand),
    cleared: savedCount(persisted.cleared),
    tutorialDone: !!persisted.tutorialDone,
    tutorialStep: null,
    ladderEvent: null,
    ante: 0,
    playerIn: 0,
    dealerIn: 0,
    round: 0,
    raises: 0,
    facing: false,
    betResolve: null,
    aggression: 0,
    boardBoost: false,
    drawsTaken: 0,
    boardBrokeDealer: false,
    dealerRevealed: false,
    dealerIntent: null,
    lastDealerBet: null,
    handStartStake: 0,
    practice: false,
    settled: true,
    hands: savedHands,
    wins: Math.min(savedHands, savedCount(persisted.wins)),
    best: Math.max(LADDER_STAKE, savedCount(persisted.best, LADDER_STAKE)),
    seen: !!persisted.seen,
    privateLeft: PRIVATE_DRAWS
};

/** The house dealer on the current rung of the ladder. */
const rival = () => ladderRival(game.rung);
/** The total this dealer stands on — and takes board cards below. */
const standsOn = () => rival().standsOn;
/** This hand's ante, or the next hand's between hands. */
const currentAnte = () => duelAnte(rival(), game.matchHand);
const pot = () => game.playerIn + game.dealerIn;

// A save that cannot sit down any more (or an old build's) starts fresh at
// the right table: a broke stake falls a rung, an empty purse refills.
if (game.purse > rival().purse || game.purse < currentAnte()) {
    game.purse = rival().purse;
    game.matchHand = 0;
}
if (game.bankroll < currentAnte()) {
    const fall = ladderFall(game.rung);
    game.rung = fall.rung;
    game.bankroll = fall.stake;
    game.purse = rival().purse;
    game.matchHand = 0;
}

function persist() {
    // Chips in a live pot are committed: a reload forfeits the hand to the
    // dealer instead of refunding it.
    const live = game.phase !== PHASE.BET && game.phase !== PHASE.OVER;
    save.write({
        stake: game.bankroll,
        rung: game.rung,
        purse: game.purse + (live ? pot() : 0),
        matchHand: game.matchHand + (live && !game.practice ? 1 : 0),
        cleared: game.cleared,
        tutorialDone: game.tutorialDone,
        hands: game.hands,
        wins: game.wins,
        best: game.best,
        seen: game.seen
    });
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

/** Your total counts the whole board. */
const playerTotal = () => handTotal(game.player, game.shared);
/**
 * The dealer's total counts only the board cards they took while still under
 * their stand number. A pat dealer cannot be forced to break by a card the
 * player shoves onto the board.
 */
const dealerTotal = () => handTotal(game.dealer, game.dealerBoard);

/* ---- Rendering ----------------------------------------------------------- */

function accessibleCardName(card) {
    const suit = window.TJCards.SUITS.find(s => s.key === card.suit);
    return `${card.rank} of ${suit ? suit.name : card.suit}`;
}

function setCardAccessibility(node, card, concealed) {
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', concealed ? 'Face-down card' : accessibleCardName(card));
    node.querySelectorAll('svg').forEach(svg => svg.setAttribute('aria-hidden', 'true'));
}

function makeCardEl(card, concealed) {
    const node = document.createElement('div');
    // Every card arrives face-down for the flip animation. Accessibility tracks
    // whether the card is actually secret, independently of that animation.
    node.className = 'card face-down';
    node.dataset.cid = card.id;
    node.innerHTML =
        `<div class="card-inner">
             <div class="card-face front">${cardFaceSVG(card)}</div>
             <div class="card-face back">${cardBackSVG()}</div>
         </div>`;
    setCardAccessibility(node, card, concealed);
    return node;
}

/** Slides a freshly appended card in from the shoe. */
function flyFromShoe(node) {
    const shoe = el.shoe.getBoundingClientRect();
    const here = node.getBoundingClientRect();
    if (!here.width) return;
    const dx = shoe.left - here.left;
    const dy = shoe.top - here.top;
    node.animate(
        [
            { transform: `translate(${dx}px, ${dy}px) rotate(-14deg) scale(.86)`, opacity: 0 },
            { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 }
        ],
        { duration: 400, easing: 'cubic-bezier(.18,.85,.28,1)' }
    );
}

/**
 * Deals one card into a hand and paints it.
 * @returns the created element so callers can add extra flourish.
 */
async function dealTo(hand, container, card, { faceDown = false, flipAfter = true, quiet = false } = {}) {
    hand.push(card);
    const node = makeCardEl(card, faceDown);
    container.appendChild(node);
    reflow(container);
    flyFromShoe(node);
    if (!quiet) SFX.deal();
    updateShoe();

    await sleep(240);
    if (!faceDown && flipAfter) {
        node.classList.remove('face-down');
        if (!quiet) SFX.flip();
        node.classList.add('fresh');
        await sleep(260);
    }
    updateTotals();
    return node;
}

/** Fan only as much as the current card zone needs, at every viewport size. */
function reflow(container) {
    const n = container.children.length;
    const card = container.querySelector('.card');
    if (n < 2 || !card) {
        container.style.setProperty('--overlap-px', '0px');
        return;
    }

    const cardWidth = card.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(container).columnGap) || 0;
    const available = Math.max(0, container.clientWidth - 8);
    const natural = cardWidth * n + gap * (n - 1);
    const overlap = cardWidth > 0
        ? Math.min(cardWidth * 0.94, Math.max(0, (natural - available) / (n - 1)))
        : 0;
    container.style.setProperty('--overlap-px', `${overlap}px`);
}

function reflowAll() {
    [el.dealerCards, el.sharedCards, el.playerCards].forEach(reflow);
}

function clearTable() {
    el.dealerCards.innerHTML = '';
    el.sharedCards.innerHTML = '';
    el.playerCards.innerHTML = '';
    Object.values(laneOf).forEach(lane => lane.classList.remove('winner', 'perfect-win'));
    laneOf.dealer.classList.remove('countering');
}

function revealDealer() {
    game.dealerRevealed = true;
    const hidden = el.dealerCards.querySelectorAll('.card.face-down');
    hidden.forEach((node, i) => setTimeout(() => {
        const card = game.dealer.find(item => String(item.id) === node.dataset.cid);
        if (card) setCardAccessibility(node, card, false);
        node.classList.remove('face-down');
        SFX.flip();
    }, i * 130));
    return sleep(hidden.length * 130 + 420);
}

function pillState(total, revealed) {
    if (!revealed) return 'idle';
    if (total > 21) return 'bust';
    if (total === 21) return 'perfect';
    if (total >= 17) return 'warm';
    return 'safe';
}

function setPill(node, text, state) {
    if (node.textContent !== String(text)) {
        node.classList.add('tick');
        setTimeout(() => node.classList.remove('tick'), 220);
    }
    node.textContent = text;
    node.dataset.state = state;
}

/**
 * The dealer's cards are face down, but the community row is public — which
 * pins their total to a range. Enumerating what the hidden cards could be
 * turns "?" into information the player can actually act on.
 * @returns {{min: number, max: number}|null}
 */
function dealerRange() {
    const hidden = game.dealer.length;
    if (hidden === 0 || hidden > 3) return null;   // 3 is already 1000 combinations

    // Each board card is public evidence: the dealer took it only while under
    // 17. A hidden card that would have taken a card the dealer passed on (or
    // the reverse) is ruled out, so a "yours" tag sharpens the read.
    const consistent = cards => {
        const taken = [];
        for (const card of game.shared) {
            const took = handTotal(cards, taken).total < standsOn();
            if (took !== game.dealerBoard.includes(card)) return false;
            if (took) taken.push(card);
        }
        return true;
    };

    const totals = [];
    const walk = (depth, cards) => {
        if (depth === hidden) {
            if (!game.dealerRevealed && !consistent(cards)) return;
            // Only the board cards the dealer actually took, not the whole row.
            totals.push(handTotal(cards, game.dealerBoard).total);
            return;
        }
        for (const rank of UNKNOWN_RANKS) walk(depth + 1, cards.concat({ rank }));
    };
    walk(0, []);

    // A live hand means the dealer hasn't busted — every card that lands on the
    // board is checked against them — so totals over 21 are ruled out.
    if (!totals.length) return null;
    const live = game.phase !== PHASE.OVER ? totals.filter(t => t <= 21) : [];
    const feasible = live.length ? live : totals;
    return { min: Math.min(...feasible), max: Math.max(...feasible) };
}

/** What the range implies the dealer will do, phrased for the active variant. */
function dealerTell(range) {
    if (!range) return { text: `stands on ${standsOn()}`, tone: '' };
    if (range.min > 21) return { text: 'busted', tone: 'tell-pat' };

    const mustHit = range.max < standsOn();
    const mustStand = range.min >= standsOn();

    // Kept short so the read still fits beside the pill on a phone.
    if (mustHit) return { text: 'will take board cards', tone: 'tell-hit' };
    if (mustStand) return { text: 'pat — done drawing', tone: 'tell-pat' };
    return { text: 'may take board cards', tone: 'tell-maybe' };
}

function updateTotals() {
    const inPlay = game.player.length > 0;

    const p = handTotal(game.player, game.shared);
    setPill(el.playerTotal,
        inPlay ? (p.soft && p.total !== 21 ? `${p.total} soft` : p.total) : '—',
        pillState(p.total, inPlay));

    const d = handTotal(game.dealer, game.dealerBoard);
    if (!inPlay) {
        setPill(el.dealerTotal, '—', 'idle');
    } else if (game.dealerRevealed) {
        setPill(el.dealerTotal, d.total, pillState(d.total, true));
    } else {
        const range = dealerRange();
        if (!range) setPill(el.dealerTotal, '?', 'idle');
        else if (range.min === range.max) setPill(el.dealerTotal, range.min, pillState(range.min, true));
        else setPill(el.dealerTotal, `${range.min}–${range.max}`, 'range');
    }

    const tell = game.dealerRevealed && game.dealerIntent
        ? game.dealerIntent
        : dealerTell(inPlay && !game.dealerRevealed ? dealerRange() : null);
    el.dealerRead.textContent = tell.text;
    el.dealerRead.className = 'lane-hint' + (tell.tone ? ' ' + tell.tone : '');
}

function updateShoe() {
    el.shoeCount.textContent = game.deck.remaining;
}

function money(n) { return '$' + n.toLocaleString('en-US'); }

function updateMoney(bump = false) {
    // Any direct state render supersedes a counter animation already in flight.
    [el.bankroll, el.pot].forEach(node => { node._moneyAnimation = (node._moneyAnimation || 0) + 1; });
    el.bankroll.textContent = money(game.bankroll);
    el.pot.textContent = money(pot());
    el.streak.textContent = `${game.rung + 1} / ${ladderRivals.length}`;
    renderRival();
    if (bump) {
        el.bankroll.classList.remove('bump');
        void el.bankroll.offsetWidth;
        el.bankroll.classList.add('bump');
    }
}

/** The dealer lane carries the current rival: portrait, house rule, purse, match clock. */
function renderRival() {
    const r = rival();
    el.dealerName.textContent = r.name;
    el.rivalAvatar.className = `portrait portrait-${r.id}`;
    el.houseRule.textContent = r.rule;
    el.purseValue.textContent = money(game.purse);
    el.purseBar.style.transform = `scaleX(${Math.max(0, Math.min(1, game.purse / r.purse))})`;
    const handNo = Math.max(1, game.phase === PHASE.OVER && !game.practice ? game.matchHand : game.matchHand + 1);
    const ante = duelAnte(r, handNo - 1);
    const untilRise = 2 - ((handNo - 1) % 2);
    el.matchInfo.textContent = `Hand ${handNo} · ante ${money(ante)} · ${untilRise === 1 ? 'rises next hand' : `rises in ${untilRise}`}`;
    el.roundInfo.textContent = game.round && game.phase !== PHASE.BET && game.phase !== PHASE.OVER
        ? `Betting round ${Math.min(game.round, DUEL_ROUNDS)} of ${DUEL_ROUNDS}`
        : '';
    laneOf.dealer.dataset.rival = r.id;
}

function setStatus(text, { thinking = false } = {}) {
    el.status.innerHTML = text + (thinking ? '<span class="dots"></span>' : '');
    el.status.classList.remove('flash');
    void el.status.offsetWidth;
    el.status.classList.add('flash');
}

function highlightLane(which) {
    Object.values(laneOf).forEach(l => l.classList.remove('active'));
    if (which) laneOf[which].classList.add('active');
}

/* ---- Rival voice --------------------------------------------------------- */

const LINES = {
    rock: {
        bet: ['I’ll put a little on it.', 'Worth the lamp oil.'],
        raise: ['I’m raising. Think hard.', 'No. More.'],
        call: ['I’ll see it.', 'Fine. Show me.'],
        check: ['Check.', 'Go on.'],
        fold: ['Not worth it.', 'Take it. I’ll wait.'],
        win: ['Steady wins.', 'Patience pays.'],
        lose: ['Hm. Well played.', 'That one’s yours.'],
        half: ['Mara straightens her hat.'],
        rise: ['The lamp’s burning low.']
    },
    shark: {
        bet: ['Let’s see if you scare.', 'A little something.'],
        raise: ['Raise. Your move, friend.', 'Again.'],
        call: ['Call. I don’t believe you.', 'Sure, I’ll look.'],
        check: ['Your turn to be brave.', 'Check.'],
        fold: ['Keep it. I’ll take the next.', 'Lucky.'],
        win: ['Never trust a smile.', 'Too easy.'],
        lose: ['Enjoy it while it lasts.', 'Hm.'],
        half: ['Vex stops smiling.'],
        rise: ['Stakes go up. Keep up.']
    },
    spark: {
        bet: ['Let’s ride!', 'Bet. Why not?'],
        raise: ['Ha! Raise!', 'More!'],
        call: ['Call! I gotta see it.', 'Always calling.'],
        check: ['Check, check.', 'Go ahead.'],
        fold: ['Ugh, fine.', 'Even I know when to quit.'],
        win: ['The Spark strikes!', 'Told you.'],
        lose: ['Ah, that stings!', 'Next one’s mine.'],
        half: ['Sol loosens his bandana.'],
        rise: ['Higher stakes, more fun!']
    }
};

/** A short line in the rival's speech bubble. */
function say(kind) {
    const lines = LINES[rival().id][kind];
    if (!lines) return;
    el.rivalSay.textContent = lines[Math.floor(Math.random() * lines.length)];
    el.rivalSay.hidden = false;
    el.rivalSay.classList.remove('pop');
    void el.rivalSay.offsetWidth;
    el.rivalSay.classList.add('pop');
    clearTimeout(say.timer);
    say.timer = setTimeout(() => { el.rivalSay.hidden = true; }, 2400);
}

/* ---- Controls ------------------------------------------------------------ */

/** What your next bet or raise would cost, given what each side can still put in. */
function betAmounts() {
    const unit = duelBetSize(game.ante, Math.max(1, game.round));
    const toCall = Math.max(0, game.dealerIn - game.playerIn);
    const call = Math.min(toCall, game.bankroll);
    const raiseTo = Math.min(game.bankroll, toCall + unit, toCall + game.purse);
    return { unit, toCall, call, raise: raiseTo };
}

function show(btn, visible, enabled = visible) {
    btn.hidden = !visible;
    btn.disabled = !enabled;
}

function syncControls() {
    const betting = game.phase === PHASE.BET;
    const deciding = game.phase === PHASE.BETTING;
    const drawing = game.phase === PHASE.PLAYER;
    const r = rival();
    const step = game.tutorialStep;

    show(el.dealBtn, betting, betting && game.bankroll >= currentAnte());
    el.dealLabel.textContent = `Deal · ante ${money(currentAnte())}`;

    const { unit, call, raise, toCall } = betAmounts();
    const canRaise = deciding && game.facing && game.raises < r.maxRaises
        && game.purse > 0 && game.bankroll > toCall;
    show(el.checkBtn, deciding && !game.facing);
    show(el.betBtn, deciding && !game.facing, deciding && !game.facing && game.bankroll > 0 && game.purse > 0);
    show(el.foldBtn, deciding && game.facing);
    show(el.callBtn, deciding && game.facing);
    show(el.raiseBtn, deciding && game.facing, canRaise);
    el.betLabel.textContent = `Bet ${money(Math.min(unit, game.bankroll, game.purse))}`;
    el.callLabel.textContent = call < toCall ? `All in ${money(call)}` : `Call ${money(call)}`;
    el.raiseLabel.textContent = `Raise ${money(Math.max(0, raise - toCall))}`;

    // On 21 another card can only hurt you, so Stand is the one move left.
    const drawable = drawing && playerTotal().total < 21;
    show(el.boardBtn, drawing, drawable);
    show(el.handBtn, drawing, drawable && game.privateLeft > 0);
    show(el.standBtn, drawing);
    el.handLeft.textContent = game.privateLeft;

    // The guided hands allow exactly the move they teach.
    if (step === 'h1-check') { el.betBtn.disabled = true; }
    if (step === 'h1-board') { el.handBtn.disabled = true; el.standBtn.disabled = true; }
    if (step === 'h2-bet') { el.checkBtn.disabled = true; }

    // Mid-hand, keep the row from collapsing while the dealer thinks.
    el.actionsRow.dataset.waiting = String(!betting && !deciding && !drawing);
}

/* ---- Chips --------------------------------------------------------------- */

/** Moves chips from a side into the pot, capped by what that side holds. */
function commit(who, amount) {
    const paid = Math.max(0, Math.min(amount, who === 'player' ? game.bankroll : game.purse));
    if (paid <= 0) return 0;
    const potBefore = pot();
    if (who === 'player') {
        const before = game.bankroll;
        game.bankroll -= paid;
        game.playerIn += paid;
        animateMoneyValue(el.bankroll, before, game.bankroll, 280);
        animateBetTransfer(el.bankroll.closest('.readout'), potBefore, pot());
    } else {
        game.purse -= paid;
        game.dealerIn += paid;
        animateBetTransfer(el.rivalAvatar, potBefore, pot());
    }
    SFX.chip();
    renderRival();
    return paid;
}

/* ---- Round flow ---------------------------------------------------------- */

async function startHand() {
    if (game.phase !== PHASE.BET) return;
    const r = rival();
    const ante = currentAnte();
    if (game.bankroll < ante) return;

    game.phase = PHASE.DEALING;
    coach(null);
    game.player = [];
    game.dealer = [];
    game.shared = [];
    game.dealerBoard = [];
    game.ante = ante;
    game.playerIn = 0;
    game.dealerIn = 0;
    game.round = 0;
    game.raises = 0;
    game.aggression = 0;
    game.boardBoost = false;
    game.drawsTaken = 0;
    game.boardBrokeDealer = false;
    game.dealerRevealed = false;
    game.dealerIntent = null;
    game.lastDealerBet = null;
    game.privateLeft = PRIVATE_DRAWS;
    game.handStartStake = game.bankroll;
    // The guided hands are practice: they don't move the match clock.
    game.practice = game.tutorialStep === 'h1-deal' || game.tutorialStep === 'h2-deal';
    game.deck.reset();

    if (game.tutorialStep === 'h1-deal') {
        // Guided hand one: you sit on 9, the dealer on 14, and the next card is
        // a ten. On the board it lands in both hands — 19 for you, 24 for her.
        rigDeck([['4', 'C'], ['9', 'S'], ['5', 'D'], ['K', 'H']]);
        game.tutorialStep = 'h1-check';
    } else if (game.tutorialStep === 'h2-deal') {
        // Guided hand two: you hold 20 and the dealer can only show a range.
        rigDeck([['10', 'S'], ['6', 'H'], ['Q', 'D']]);
        game.tutorialStep = 'h2-bet';
    }

    clearTable();
    hideOverlay();
    syncControls();
    updateShoe();
    setStatus(`Antes in — ${money(ante)} each.`);
    commit('player', ante);
    commit('dealer', ante);
    persist();

    await dealTo(game.player, el.playerCards, drawCard());
    await dealTo(game.dealer, el.dealerCards, drawCard(), { faceDown: true });
    await layOnBoard(drawCard());
    highlightLane(null);
    updateTotals();

    const folded = await bettingRound();
    if (folded) return foldWin(folded);
    toDrawing();
}

/** After a betting round, the hand goes back to you: draw or stand. */
function toDrawing() {
    game.phase = PHASE.PLAYER;
    highlightLane('player');
    if (game.tutorialStep === 'h1-board') {
        coach(el.boardBtn, `${rival().name} is under 17, so every <b>Board</b> card lands in her hand too. You're on 9 and can't bust — send one.`);
    }
    syncControls();
    const p = playerTotal().total;
    const left = DUEL_ROUNDS - game.round;
    if (p === 21) setStatus('Twenty-one — <b>Stand</b> and collect.');
    else setStatus(`Your move — <b>Board</b>, <b>Hand</b> or <b>Stand</b>.${left > 0 ? ` ${left} betting round${left > 1 ? 's' : ''} left.` : ''}`);
}

/**
 * Puts a drawn card on the board. The dealer only picks it up if they were
 * still under their stand number when it landed — a pat dealer stands aside,
 * and the card belongs to the player alone.
 */
async function layOnBoard(card) {
    const before = dealerTotal().total;
    const dealerTakes = before < standsOn();
    if (dealerTakes) game.dealerBoard.push(card);
    game.boardBoost = dealerTakes && dealerTotal().total > before && dealerTotal().total <= 21;

    highlightLane('shared');
    const node = await dealTo(game.shared, el.sharedCards, card);
    node.classList.add('shared-jump');
    if (!dealerTakes) {
        node.classList.add('solo');
        node.setAttribute('aria-label', `${accessibleCardName(card)}, yours only`);
        node.insertAdjacentHTML('beforeend', '<span class="card-tag">yours</span>');
    }
    updateTotals();
    return node;
}

/** You route the card: the board feeds both hands, your hand only you. */
async function playerDraw(target) {
    if (game.phase !== PHASE.PLAYER) return;
    if (target === 'hand' && game.privateLeft <= 0) return;
    if (game.tutorialStep === 'h1-board') {
        if (target !== 'board') return;
        game.tutorialStep = 'h1-played';
        coach(null);
    }

    game.phase = PHASE.RESOLVING;
    game.drawsTaken += 1;
    if (target === 'hand') game.privateLeft -= 1;
    syncControls();
    highlightLane(null);
    SFX.button();

    const card = drawCard();
    if (target === 'board') {
        setStatus('Onto the board — <b>this card counts for both</b>.');
        await sleep(360);
        await layOnBoard(card);
    } else {
        game.boardBoost = false;
        setStatus('Into your hand — <b>yours alone</b>.');
        await sleep(360);
        highlightLane('player');
        await dealTo(game.player, el.playerCards, card);
    }
    await sleep(220);
    highlightLane(null);

    const p = playerTotal().total;
    const d = dealerTotal().total;
    // The player busts first, so a card that breaks them both is still a loss.
    if (p > 21) {
        markBust(el.playerCards);
        return finish('lose', d > 21
            ? `${p} — that card broke you both, but you went over first.`
            : `You bust with ${p}.`, { bust: true });
    }
    if (d > 21) {
        game.boardBrokeDealer = true;
        await revealDealer();
        markBust(el.dealerCards);
        return finish('win', `The board broke ${rival().name} at ${d}!`);
    }

    if (game.round < DUEL_ROUNDS) {
        const folded = await bettingRound();
        if (folded) return foldWin(folded);
    }
    toDrawing();
}

/* ---- Betting ------------------------------------------------------------- */

/**
 * One fixed-limit betting round. You act first; the dealer answers. Each
 * round allows the rival's raise cap (one, or two at Vex's table).
 * @returns the side that folded, or null when the round closes.
 */
async function bettingRound() {
    // Nothing to bet with on one side: the hand plays out on the cards.
    if (game.bankroll <= 0 || game.purse <= 0) return null;
    game.round += 1;
    game.raises = 0;
    let actor = 'player';
    let facing = false;

    for (let guard = 0; guard < 12; guard++) {
        let act;
        if (actor === 'player') {
            act = await playerTurn(facing);
        } else {
            act = await dealerTurn(facing);
        }
        const other = actor === 'player' ? 'dealer' : 'player';
        const mine = actor === 'player' ? game.playerIn : game.dealerIn;
        const theirs = actor === 'player' ? game.dealerIn : game.playerIn;
        const unit = duelBetSize(game.ante, game.round);

        if (act === 'fold') return actor;
        if (act === 'check') {
            if (actor === 'dealer') return null;
            actor = other;
            continue;
        }
        if (act === 'call') {
            commit(actor, theirs - mine);
            return null;
        }
        // bet or raise: match what is owed, then add one unit — never more
        // than the other side can still answer.
        const otherCan = actor === 'player' ? game.purse : game.bankroll;
        const owed = theirs - mine;
        commit(actor, owed + Math.min(unit, otherCan));
        if (act === 'raise') game.raises += 1;
        if (actor === 'player') game.aggression += 1;
        facing = true;
        actor = other;
        // The other side is all in: nothing left to raise, they only answer.
        if ((actor === 'player' ? game.bankroll : game.purse) <= 0) {
            commit(actor, 0);
            return null;
        }
    }
    return null;
}

/** Waits for your betting decision. */
function playerTurn(facing) {
    game.facing = facing;
    game.phase = PHASE.BETTING;
    highlightLane('player');
    const { call } = betAmounts();
    if (game.tutorialStep === 'h1-check' && !facing) {
        coach(el.checkBtn, 'Before any draw there\'s a betting round. You\'re only on 9 — <b>Check</b> and see what she does.');
    } else if (game.tutorialStep === 'h2-bet' && !facing) {
        coach(el.betBtn, `You're on 20 and ${rival().name} can only show a range. <b>Bet</b> — she stays in only with a real hand.`);
    }
    syncControls();
    setStatus(facing
        ? `${rival().name} bets — <b>call ${money(call)}</b>, raise, or fold.`
        : `Betting round ${game.round} — <b>check</b> or <b>bet</b>.`);
    return new Promise(resolve => { game.betResolve = resolve; });
}

/** Your button press in a betting round. */
function playerBet(act) {
    if (game.phase !== PHASE.BETTING || !game.betResolve) return;
    const button = { check: el.checkBtn, bet: el.betBtn, call: el.callBtn, raise: el.raiseBtn, fold: el.foldBtn }[act];
    if (!button || button.hidden || button.disabled) return;
    if (game.tutorialStep === 'h1-check' && act === 'check') game.tutorialStep = 'h1-mara';
    if (game.tutorialStep === 'h2-bet' && act === 'bet') game.tutorialStep = 'h2-mara';
    coach(null);
    const resolve = game.betResolve;
    game.betResolve = null;
    game.phase = PHASE.RESOLVING;
    SFX.button();
    syncControls();
    const { call } = betAmounts();
    setStatus({
        check: 'You check.',
        bet: 'You bet.',
        call: `You call ${money(call)}.`,
        raise: 'You raise.',
        fold: 'You fold.'
    }[act]);
    resolve(act);
}

/** The dealer reads what it can see and answers in character. */
async function dealerTurn(facing) {
    const r = rival();
    highlightLane('dealer');
    setStatus(`${r.name} weighs it`, { thinking: true });
    await sleep(reducedMotion() ? 60 : 680);

    let act;
    if (game.tutorialStep === 'h1-mara') {
        act = 'check';
        game.tutorialStep = 'h1-board';
    } else if (game.tutorialStep === 'h2-mara') {
        act = 'fold';
        game.tutorialStep = 'h2-done';
    } else {
        const strength = duelStrength({
            dealerCards: game.dealer,
            dealerBoard: game.dealerBoard,
            shared: game.shared,
            playerPrivateCount: game.player.length,
            privateLeft: game.privateLeft,
            standsOn: standsOn(),
            aggression: game.aggression,
            belief: r.belief
        });
        act = duelDealerAction({
            strength,
            facing,
            toCall: game.playerIn - game.dealerIn,
            pot: pot(),
            rival: r,
            raisesLeft: r.maxRaises - game.raises,
            boardBoost: game.boardBoost,
            roll: Math.random(),
            jitter: (Math.random() - 0.5) * 0.06
        });
        // Nothing to raise into: an all-in player can only be called.
        if (act === 'raise' && game.bankroll <= 0) act = 'call';
        if (act === 'bet' && game.bankroll <= 0) act = 'check';
    }

    say(act);
    if (act === 'bet' || act === 'raise') {
        laneOf.dealer.classList.remove('dealer-bets');
        void laneOf.dealer.offsetWidth;
        laneOf.dealer.classList.add('dealer-bets');
    }
    setStatus({
        check: `${r.name} checks.`,
        bet: `${r.name} bets.`,
        call: `${r.name} calls.`,
        raise: `${r.name} raises!`,
        fold: `${r.name} folds.`
    }[act]);
    if (act !== 'fold' && act !== 'check') await sleep(reducedMotion() ? 40 : 360);
    return act;
}

/* ---- Cards out of the shoe ----------------------------------------------- */

/** Every card leaves the shoe through here. */
function drawCard() {
    return game.deck.draw();
}

/**
 * Moves the named cards to the top of the shoe, first-named drawn first.
 * Used only to stack the guided hands.
 */
function rigDeck(order) {
    const picked = order.map(([rank, suit]) => {
        const index = game.deck.cards.findIndex(c => c.rank === rank && c.suit === suit);
        return game.deck.cards.splice(index, 1)[0];
    });
    game.deck.cards.push(...picked.reverse());
}

async function playerStand() {
    if (game.phase !== PHASE.PLAYER) return;
    game.phase = PHASE.RESOLVING;
    syncControls();
    setStatus(`You stand. ${rival().name} turns over`, { thinking: true });
    await sleep(520);
    await dealerPlay();
}

/** Showdown: the dealer reveals and plays against your final total. */
async function dealerPlay() {
    game.phase = PHASE.RESOLVING;
    highlightLane('dealer');
    await revealDealer();
    updateTotals();

    const p = playerTotal().total;
    const name = rival().name;
    while (true) {
        const dealerState = dealerTotal();
        const d = dealerState.total;
        const move = dealerMove({ dealerTotal: d, playerTotal: p, soft: dealerState.soft, pressureAvailable: false, standsOn: standsOn() });
        if (!move.draw) {
            if (move.intent === 'protect') game.dealerIntent = { text: `protects ${d} over ${p}`, tone: 'tell-pat' };
            else if (move.intent === 'hold-push') game.dealerIntent = { text: `holds the ${d} push`, tone: 'tell-maybe' };
            else if (move.intent === 'concede') game.dealerIntent = { text: `stands on ${d}`, tone: 'tell-hit' };
            else game.dealerIntent = { text: d === 21 ? 'locks 21' : `holds ${d}`, tone: 'tell-pat' };
            updateTotals();
            break;
        }
        game.dealerIntent = { text: `building from ${d}`, tone: 'tell-maybe' };
        setStatus(`${name} trails <b>${d}–${p}</b> and draws.`, { thinking: true });
        updateTotals();
        await sleep(560);
        await dealTo(game.dealer, el.dealerCards, drawCard());
        updateTotals();
        if (dealerTotal().total > 21) break;
    }

    highlightLane(null);
    await sleep(380);
    const d = dealerTotal().total;
    if (d > 21) {
        markBust(el.dealerCards);
        return finish('win', `${name} busts with ${d}. The pot is yours.`);
    }
    if (p > d) return finish('win', `${p} beats ${d}.`);
    if (d > p) return finish('lose', `${name}'s ${d} tops your ${p}.`);
    return finish('push', `Both on ${p} — the pot splits.`);
}

function markBust(container) {
    container.querySelectorAll('.card').forEach(c => c.classList.add('doomed'));
    SFX.bust();
}

/** A fold ends the hand: the other side takes the pot, no cards shown. */
function foldWin(folder) {
    return folder === 'dealer'
        ? finish('win', `${rival().name} folds — the pot is yours.`, { fold: true })
        : finish('lose', `You fold — ${rival().name} takes the pot.`, { fold: true });
}

/* ---- Settlement ---------------------------------------------------------- */

function handInsight(outcome, { bust, fold }) {
    const name = rival().name;
    if (fold && outcome === 'win') {
        return game.aggression > 0 && playerTotal().total < 17
            ? `${name} folded to a bet on ${playerTotal().total} — the bluff worked.`
            : `${name} folded — betting your strong hands makes her pay or quit.`;
    }
    if (fold) return 'Folding saves chips when the read turns against you.';
    if (bust) return 'The board breaks you first — keep a Hand draw for the risky cards.';
    if (outcome === 'win' && game.boardBrokeDealer) return 'Board read paid off — your shared card broke the dealer.';
    if (outcome === 'win' && pot() >= game.ante * 6) return 'A big pot — you bet the strong hand and got paid.';
    if (outcome === 'lose' && game.aggression > 0) return `${name} called you down and had it.`;
    if (outcome === 'push') return 'Dead level — the pot splits.';
    return outcome === 'win'
        ? 'Good read — carry that line into the next hand.'
        : 'The line missed — use the dealer range to sharpen the next decision.';
}

async function finish(outcome, message, { bust = false, fold = false } = {}) {
    game.phase = PHASE.OVER;
    game.settled = false;
    game.betResolve = null;
    highlightLane(null);
    coach(null);
    syncControls();

    // A folded hand stays hidden; any other ending shows the dealer's cards.
    if (!fold && el.dealerCards.querySelector('.card.face-down')) {
        await revealDealer();
    }
    updateTotals();

    // An all-in call for less than the bet: the uncalled part goes back.
    if (game.dealerIn > game.playerIn) {
        game.purse += game.dealerIn - game.playerIn;
        game.dealerIn = game.playerIn;
    } else if (game.playerIn > game.dealerIn) {
        game.bankroll += game.playerIn - game.dealerIn;
        game.playerIn = game.dealerIn;
    }

    const r = rival();
    const potBefore = pot();
    const myIn = game.playerIn;
    const bankrollBefore = game.bankroll;
    const purseBefore = game.purse;
    const perfect = outcome === 'win' && !fold && playerTotal().total === 21;
    let bonus = 0;

    if (outcome === 'win') {
        game.bankroll += potBefore;
        if (perfect) {
            bonus = Math.min(game.ante, game.purse);
            game.purse -= bonus;
            game.bankroll += bonus;
        }
        game.wins += 1;
    } else if (outcome === 'push') {
        game.bankroll += game.playerIn;
        game.purse += game.dealerIn;
    } else {
        game.purse += potBefore;
    }
    const net = game.bankroll - game.handStartStake;
    let detail = net > 0 ? `+${money(net)}` : net < 0 ? `−${money(-net)}` : 'Even';
    if (perfect && bonus) detail += ` · 21 bonus +${money(bonus)}`;
    const insight = handInsight(outcome, { bust, fold });

    game.playerIn = 0;
    game.dealerIn = 0;
    game.hands += 1;
    if (!game.practice) game.matchHand += 1;
    const newPeak = game.bankroll > game.best;
    game.best = Math.max(game.best, game.bankroll);

    // Climb or fall: whoever cannot post the next ante loses the match.
    const nextAnte = duelAnte(r, game.matchHand);
    game.ladderEvent = null;
    if (game.purse < nextAnte) {
        game.bankroll += r.bounty;
        const last = game.rung === ladderRivals.length - 1;
        game.ladderEvent = { kind: last ? 'champion' : 'beaten', rival: r };
        if (last) game.cleared += 1;
        game.rung = last ? 0 : game.rung + 1;
        game.purse = rival().purse;
        game.matchHand = 0;
    } else if (game.bankroll < nextAnte) {
        const fall = ladderFall(game.rung);
        game.ladderEvent = { kind: 'fall', rival: r };
        game.rung = fall.rung;
        game.bankroll = fall.stake;
        game.purse = rival().purse;
        game.matchHand = 0;
    }
    if (game.tutorialStep === 'h1-played') game.tutorialStep = 'h2-intro';
    if (game.tutorialStep === 'h2-done') {
        game.tutorialStep = 'wrap';
        game.tutorialDone = true;
    }
    persist();

    if (outcome === 'win') {
        laneOf.player.classList.add('winner');
        if (perfect) laneOf.player.classList.add('perfect-win');
        if (game.boardBrokeDealer) laneOf.shared.classList.add('winner');
        animatePayoutTransfer({
            bankrollBefore,
            bankrollAfter: game.ladderEvent ? bankrollBefore + potBefore + bonus : game.bankroll,
            potBefore,
            payout: potBefore + bonus,
            outcome,
            perfect,
            hot: false,
            challengeWon: false,
            newPeak
        });
    } else if (outcome === 'push') {
        animatePayoutTransfer({ bankrollBefore, bankrollAfter: bankrollBefore + myIn, potBefore, payout: myIn, outcome, perfect: false, hot: false, challengeWon: false, newPeak: false });
    } else {
        animateLossDrain(potBefore);
    }
    renderRival();

    const splash = fold
        ? (outcome === 'win' ? 'fold-win' : 'fold-lose')
        : outcome === 'win' ? 'win' : bust ? 'bust' : outcome === 'push' ? 'tie' : 'lose';
    showSplash(splash, detail, insight);
    if (outcome === 'win') {
        confetti(perfect ? 160 : 80);
        perfect ? SFX.jackpot() : SFX.win();
        if (!fold) say('lose');
    } else if (outcome === 'push') {
        SFX.push();
    } else {
        if (!bust) SFX.lose();
        say('win');
    }
    if (!game.ladderEvent && purseBefore >= r.purse / 2 && game.purse < r.purse / 2) {
        setTimeout(() => say('half'), 1300);
    }

    setStatus(message);
    game.settled = true;
    clearTimeout(openBetting.timer);
    openBetting.timer = setTimeout(openBetting, 2100);
}

/** Back between hands — on a timer, or straight away if the splash is dismissed. */
function openBetting() {
    // Only once the hand is fully settled, however the splash was dismissed.
    if (game.phase !== PHASE.OVER || !game.settled) return;
    clearTimeout(openBetting.timer);
    game.phase = PHASE.BET;
    hideOverlay();
    updateMoney();
    syncControls();
    if (game.ladderEvent) {
        const event = game.ladderEvent;
        game.ladderEvent = null;
        // A new dealer sits down to a clean felt.
        game.player = [];
        game.dealer = [];
        game.shared = [];
        game.dealerBoard = [];
        game.dealerIntent = null;
        clearTable();
        updateTotals();
        showPoster(event.kind, event.rival);
        return;
    }
    if (game.tutorialStep === 'h2-intro') {
        game.tutorialStep = 'h2-deal';
        setStatus('One more guided hand.');
        coach(el.dealBtn, 'Now the other half of the game: <b>betting</b>. Deal.');
        return;
    }
    if (game.tutorialStep === 'wrap') {
        tutorialWrap();
        return;
    }
    const risesNow = game.matchHand > 0 && game.matchHand % 2 === 0;
    if (risesNow) say('rise');
    setStatus(risesNow
        ? `The ante rises to <b>${money(currentAnte())}</b>.`
        : `Deal when ready — ante <b>${money(currentAnte())}</b>.`);
}

/* ---- Flourishes ---------------------------------------------------------- */

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function centerOf(node) {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Count a money readout to its new value without ever changing game state. */
function animateMoneyValue(node, from, to, duration = 700) {
    const ticket = (node._moneyAnimation || 0) + 1;
    node._moneyAnimation = ticket;
    if (reducedMotion() || from === to) {
        node.textContent = money(to);
        return;
    }

    const started = performance.now();
    node.textContent = money(from);
    const step = now => {
        if (node._moneyAnimation !== ticket) return;
        const t = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        node.textContent = money(Math.round(from + (to - from) * eased));
        if (t < 1) requestAnimationFrame(step);
        else node.textContent = money(to);
    };
    requestAnimationFrame(step);
}

function pulseReadout(node, className = 'money-catch') {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), 1200);
}

/** One physical token following an arced path between two UI readouts. */
function transferToken(from, to, { delay = 0, duration = 620, color = '#e7bd62', index = 0, onArrive } = {}) {
    if (reducedMotion()) {
        if (onArrive) setTimeout(onArrive, 0);
        return;
    }

    const node = document.createElement('span');
    node.className = 'transfer-token';
    node.setAttribute('aria-hidden', 'true');
    node.style.left = `${from.x - 10}px`;
    node.style.top = `${from.y - 10}px`;
    node.style.setProperty('--token-color', color);
    document.body.appendChild(node);

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const arc = 34 + (index % 3) * 11;
    const drift = (index % 2 ? 1 : -1) * (4 + index % 4);
    const animation = node.animate([
        { transform: 'translate(0, 0) scale(.35) rotate(0deg)', opacity: 0 },
        { transform: `translate(${drift}px, -8px) scale(1) rotate(80deg)`, opacity: 1, offset: .16 },
        { transform: `translate(${dx * .52 + drift}px, ${dy * .46 - arc}px) scale(1.12) rotate(240deg)`, opacity: 1, offset: .58 },
        { transform: `translate(${dx}px, ${dy}px) scale(.3) rotate(520deg)`, opacity: .15 }
    ], { duration, delay, easing: 'cubic-bezier(.2,.72,.25,1)', fill: 'forwards' });

    animation.onfinish = () => {
        node.remove();
        if (onArrive) onArrive();
    };
}

function sparkBurst(node, color = '#ffe19a', count = 8) {
    if (reducedMotion()) return;
    const point = centerOf(node);
    for (let i = 0; i < count; i += 1) {
        const spark = document.createElement('i');
        const angle = (Math.PI * 2 * i) / count;
        const distance = 22 + (i % 3) * 7;
        spark.className = 'micro-spark';
        spark.setAttribute('aria-hidden', 'true');
        spark.style.left = `${point.x}px`;
        spark.style.top = `${point.y}px`;
        spark.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
        spark.style.setProperty('--spark-y', `${Math.sin(angle) * distance}px`);
        spark.style.setProperty('--spark-color', color);
        spark.style.animationDelay = `${i * 16}ms`;
        document.body.appendChild(spark);
        setTimeout(() => spark.remove(), 900);
    }
}

function payoutLabel(node, text, peak = false, delay = 0) {
    if (reducedMotion()) return;
    const point = centerOf(node);
    const tag = document.createElement('div');
    tag.className = 'payout-arrival' + (peak ? ' peak' : '');
    tag.textContent = peak ? `${text} · new peak` : text;
    tag.setAttribute('aria-hidden', 'true');
    tag.style.left = `${point.x}px`;
    tag.style.top = `${point.y + 24}px`;
    tag.style.animationDelay = `${delay}ms`;
    document.body.appendChild(tag);
    setTimeout(() => tag.remove(), delay + 1450);
}

function animateBetTransfer(origin, before, after) {
    animateMoneyValue(el.pot, before, after, 360);
    const target = el.pot.closest('.readout');
    if (!origin || reducedMotion()) {
        pulseReadout(target);
        return;
    }

    const chipColor = getComputedStyle(origin).getPropertyValue('--chip').trim() || '#d6ae58';
    transferToken(centerOf(origin), centerOf(target), {
        duration: 470,
        color: chipColor,
        onArrive: () => {
            pulseReadout(target);
            sparkBurst(target, chipColor, 5);
        }
    });
}

function animatePayoutTransfer({ bankrollBefore, bankrollAfter, potBefore, payout, outcome, perfect, hot, challengeWon, newPeak }) {
    const source = el.pot.closest('.readout');
    const target = el.bankroll.closest('.readout');
    animateMoneyValue(el.pot, potBefore, 0, 520);

    if (reducedMotion()) {
        el.bankroll.textContent = money(bankrollAfter);
        return;
    }

    el.bankroll.textContent = money(bankrollBefore);
    const count = outcome === 'push'
        ? 4
        : Math.min(12, 6 + (perfect ? 2 : 0) + (hot ? 2 : 0) + (challengeWon ? 1 : 0));
    const color = outcome === 'push' ? '#d9d5c8' : perfect ? '#fff0a8' : '#e7bd62';
    const lastDelay = (count - 1) * 62;

    const arrivalAt = 700 + lastDelay;
    animateMoneyValue(el.bankroll, bankrollBefore, bankrollAfter, arrivalAt);
    for (let i = 0; i < count; i += 1) {
        transferToken(centerOf(source), centerOf(target), {
            delay: i * 62,
            duration: 610 + (i % 3) * 45,
            color,
            index: i
        });
    }
    payoutLabel(target, `Payout +${money(payout)}`, newPeak, arrivalAt);
    setTimeout(() => {
        pulseReadout(target, 'payout-catch');
        sparkBurst(target, color, perfect ? 12 : 9);
        if (newPeak) {
            target.classList.add('new-peak');
            setTimeout(() => target.classList.remove('new-peak'), 1700);
        }
        SFX.chip();
    }, arrivalAt);

}

function animateLossDrain(potBefore) {
    const source = el.pot.closest('.readout');
    animateMoneyValue(el.pot, potBefore, 0, 620);
    pulseReadout(source, 'loss-drain');
    if (reducedMotion()) return;

    const point = centerOf(source);
    for (let i = 0; i < 4; i += 1) {
        const end = { x: point.x + (i - 1.5) * 16, y: point.y + 90 };
        transferToken(point, end, { delay: i * 55, duration: 520, color: '#bd5555', index: i });
    }
}

function flyMoney(text, negative = false) {
    const rect = el.bankroll.getBoundingClientRect();
    const node = document.createElement('div');
    node.className = 'money-fly' + (negative ? ' negative' : '');
    node.textContent = text;
    node.style.left = `${rect.left + rect.width / 2}px`;
    node.style.top = `${rect.bottom + 4}px`;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 1200);
}

function showSplash(kind, detail, insight = '') {
    const word = { win: 'Winner', lose: 'Beaten', tie: 'Push', bust: 'Busted', 'fold-win': 'Folded', 'fold-lose': 'Folded' }[kind];
    el.resultWord.textContent = word;
    el.resultStamp.dataset.kind = kind;
    el.resultStamp.querySelector('small').textContent = kind === 'fold-win' ? `${rival().name} quits` : kind === 'fold-lose' ? 'You lay it down' : 'Showdown';
    el.resultPayout.textContent = detail || '';
    el.resultPayout.classList.toggle('negative', /^−/.test(detail));
    el.resultInsight.textContent = insight;
    el.overlay.setAttribute('aria-hidden', 'false');
    el.overlay.classList.remove('hidden');
    // restart the stamp animation
    el.resultStamp.style.animation = 'none';
    void el.resultStamp.offsetWidth;
    el.resultStamp.style.animation = '';
    clearTimeout(showSplash.timer);
    showSplash.timer = setTimeout(hideOverlay, 1900);
}

function hideOverlay() {
    el.overlay.classList.add('hidden');
    el.overlay.setAttribute('aria-hidden', 'true');
}

/* confetti ------------------------------------------------------------------ */

const fxCtx = el.fx.getContext('2d');
let confettiPieces = [];
let fxRunning = false;

function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.fx.width = window.innerWidth * dpr;
    el.fx.height = window.innerHeight * dpr;
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function confetti(count) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#c9a063', '#ecd29b', '#efe4cf', '#8a6a3a', '#b8432f'];
    const w = window.innerWidth;
    for (let i = 0; i < count; i++) {
        confettiPieces.push({
            x: w / 2 + (Math.random() - .5) * w * .6,
            y: window.innerHeight * .42 + (Math.random() - .5) * 120,
            vx: (Math.random() - .5) * 9,
            vy: -6 - Math.random() * 9,
            size: 5 + Math.random() * 7,
            spin: (Math.random() - .5) * .4,
            angle: Math.random() * Math.PI,
            color: colors[(Math.random() * colors.length) | 0],
            life: 1
        });
    }
    if (!fxRunning) { fxRunning = true; requestAnimationFrame(stepConfetti); }
}

function stepConfetti() {
    fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    confettiPieces = confettiPieces.filter(p => p.life > 0 && p.y < window.innerHeight + 60);
    for (const p of confettiPieces) {
        p.vy += 0.34;
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        p.life -= 0.004;
        fxCtx.save();
        fxCtx.translate(p.x, p.y);
        fxCtx.rotate(p.angle);
        fxCtx.globalAlpha = Math.max(0, Math.min(1, p.life));
        fxCtx.fillStyle = p.color;
        fxCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        fxCtx.restore();
    }
    if (confettiPieces.length) requestAnimationFrame(stepConfetti);
    else { fxRunning = false; fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight); }
}

/* ---- Saloon Ladder: posters and the guided hands ------------------------- */

const POSTER_COPY = {
    intro: r => ({
        eyebrow: `Rung ${ladderRivals.indexOf(r) + 1} of ${ladderRivals.length}`,
        title: `${r.name}, ${r.title}`,
        body: r.ruleDetail,
        stats: [['House rule', r.rule], ['Purse', money(r.purse)], ['Opening ante', money(r.ante)], ['Bounty', money(r.bounty)]],
        cta: 'Take a seat',
        stamp: 'Wanted'
    }),
    beaten: r => ({
        eyebrow: 'Purse broken',
        title: `${r.name} is cleaned out`,
        body: `You collect the ${money(r.bounty)} bounty and walk your stake up to the next table.`,
        stats: [['Your stake', money(game.bankroll)]],
        cta: `Meet ${rival().name}`,
        stamp: 'Paid',
        next: 'intro'
    }),
    champion: r => ({
        eyebrow: 'All three purses broken',
        title: 'Legend of the saloon',
        body: `${r.name} was the last of them. The tables reset and your stake rides with you — every purse is full again.`,
        stats: [['Your stake', money(game.bankroll)], ['Ladders cleared', String(game.cleared)]],
        cta: `Start again with ${rival().name}`,
        stamp: 'Legend',
        next: 'intro'
    }),
    fall: r => ({
        eyebrow: 'Run out of town',
        title: `${r.name} took your stake`,
        body: game.rung === ladderRivals.indexOf(r)
            ? `You buy back in with a fresh ${money(LADDER_STAKE)} at the same table.`
            : `You drop back to ${rival().name}'s table with a fresh ${money(LADDER_STAKE)}.`,
        stats: [['New stake', money(game.bankroll)]],
        cta: `Sit with ${rival().name}`,
        stamp: 'Busted',
        next: 'intro'
    })
};

let posterNext = null;

function showPoster(kind, r = rival()) {
    const copy = POSTER_COPY[kind](r);
    posterNext = copy.next || null;
    el.posterCard.dataset.kind = kind;
    el.posterCard.innerHTML = `
        <span class="poster-stamp">${copy.stamp}</span>
        <span class="portrait portrait-lg portrait-${r.id}" aria-hidden="true"></span>
        <small class="poster-eyebrow">${copy.eyebrow}</small>
        <h2 id="posterTitle">${copy.title}</h2>
        <p>${copy.body}</p>
        <dl>${copy.stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <button type="button" class="btn btn-deal poster-cta" id="posterGo"><span class="btn-label">${copy.cta}</span></button>`;
    el.poster.classList.remove('hidden');
    el.table.setAttribute('inert', '');
    el.posterCard.querySelector('#posterGo').addEventListener('click', closePoster);
    kind === 'fall' ? SFX.lose() : kind === 'intro' ? SFX.button() : SFX.jackpot();
    requestAnimationFrame(() => el.posterCard.querySelector('#posterGo').focus());
}

function closePoster() {
    if (el.poster.classList.contains('hidden')) return;
    if (posterNext) {
        const next = posterNext;
        posterNext = null;
        showPoster(next);
        return;
    }
    el.poster.classList.add('hidden');
    el.table.removeAttribute('inert');
    updateMoney();
    syncControls();
    if (!game.tutorialDone && game.tutorialStep === null) {
        game.tutorialStep = 'h1-deal';
        setStatus(`Your first hand against <b>${rival().name}</b>.`);
        coach(el.dealBtn, 'Each hand starts with an ante from both of you. <b>Deal</b>.');
    } else {
        setStatus(`Deal when ready — ante <b>${money(currentAnte())}</b>.`);
    }
}

/** A brass callout pinned above one control. Pass null to dismiss. */
function coach(target, html) {
    document.querySelectorAll('.coach-target').forEach(node => node.classList.remove('coach-target'));
    if (!target) {
        el.coach.hidden = true;
        return;
    }
    el.coachText.innerHTML = html;
    el.coach.hidden = false;
    target.classList.add('coach-target');
    const place = () => {
        if (el.coach.hidden) return;
        const box = target.getBoundingClientRect();
        const card = el.coach.getBoundingClientRect();
        const left = Math.max(12, Math.min(window.innerWidth - card.width - 12, box.left + box.width / 2 - card.width / 2));
        el.coach.style.left = `${left}px`;
        el.coach.style.top = `${Math.max(12, box.top - card.height - 14)}px`;
        el.coach.style.setProperty('--arrow-x', `${box.left + box.width / 2 - left}px`);
    };
    requestAnimationFrame(place);
    coach.place = place;
}
window.addEventListener('resize', () => coach.place && coach.place());

function tutorialWrap() {
    game.tutorialStep = null;
    persist();
    setStatus(`That's the game. Break <b>${rival().name}'s</b> purse to climb.`);
    coach(el.dealBtn, `Read the board, route your cards, bet your strong hands. ${rival().name} never bluffs — if she raises, believe her. Tap to close.`);
    const dismiss = () => { coach(null); document.removeEventListener('pointerdown', dismiss, true); };
    document.addEventListener('pointerdown', dismiss, true);
}

/* ---- Wiring -------------------------------------------------------------- */

function updateStats() {
    el.statHands.textContent = game.hands;
    el.statWins.textContent = game.wins;
    el.statRate.textContent = game.hands ? Math.round((game.wins / game.hands) * 100) + '%' : '—';
    el.statBest.textContent = money(game.best);
}

let rulesReturnFocus = null;

function rulesFocusables() {
    return [...el.rulesModal.querySelectorAll('button:not(:disabled), summary, [href], [tabindex]:not([tabindex="-1"])')]
        .filter(node => !node.hidden);
}

function openRules() {
    if (!el.rulesModal.classList.contains('hidden')) return;
    updateStats();
    rulesReturnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    el.rulesModal.querySelector('.modal-card').scrollTop = 0;
    el.rulesModal.classList.remove('hidden');
    el.table.setAttribute('inert', '');
    el.overlay.setAttribute('inert', '');
    requestAnimationFrame(() => el.rulesClose.focus());
}

function closeRules() {
    if (el.rulesModal.classList.contains('hidden')) return;
    el.rulesModal.classList.add('hidden');
    el.table.removeAttribute('inert');
    el.overlay.removeAttribute('inert');
    const target = rulesReturnFocus && document.contains(rulesReturnFocus) ? rulesReturnFocus : el.rulesBtn;
    rulesReturnFocus = null;
    requestAnimationFrame(() => target.focus());
}

function syncSoundIcon() {
    el.soundBtn.classList.toggle('is-muted', SFX.muted);
    el.soundLabel.textContent = SFX.muted ? 'Sound off' : 'Sound on';
    el.soundBtn.title = SFX.muted ? 'Sound off (M)' : 'Sound on (M)';
    el.soundBtn.setAttribute('aria-pressed', String(!SFX.muted));
}

el.dealBtn.addEventListener('click', startHand);
el.checkBtn.addEventListener('click', () => playerBet('check'));
el.betBtn.addEventListener('click', () => playerBet('bet'));
el.callBtn.addEventListener('click', () => playerBet('call'));
el.raiseBtn.addEventListener('click', () => playerBet('raise'));
el.foldBtn.addEventListener('click', () => playerBet('fold'));
el.boardBtn.addEventListener('click', () => playerDraw('board'));
el.handBtn.addEventListener('click', () => playerDraw('hand'));
el.standBtn.addEventListener('click', playerStand);

el.rulesBtn.addEventListener('click', openRules);
el.rulesClose.addEventListener('click', closeRules);
el.rulesGo.addEventListener('click', closeRules);
el.rulesModal.addEventListener('click', e => { if (e.target === el.rulesModal) closeRules(); });

el.soundBtn.addEventListener('click', () => { SFX.toggleMute(); syncSoundIcon(); });
el.overlay.addEventListener('click', () => { hideOverlay(); openBetting(); });

document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'escape') { closeRules(); hideOverlay(); return; }
    // A poster owns the screen until it is answered; its button takes Enter.
    if (!el.poster.classList.contains('hidden')) return;
    if (!el.rulesModal.classList.contains('hidden')) {
        if (key === 'tab') {
            const focusables = rulesFocusables();
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (!el.rulesModal.contains(document.activeElement)) {
                e.preventDefault();
                (e.shiftKey ? last : first).focus();
            } else if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
        return;
    }

    const interactiveTarget = e.target instanceof Element &&
        e.target.closest('button, a, input, select, textarea, [contenteditable="true"], [role="button"]');

    if (key === 'b') playerDraw('board');
    else if (key === 'h') playerDraw('hand');
    else if (key === 's') playerStand();
    else if (key === 'x') playerBet('check');
    else if (key === 'c') playerBet('call');
    else if (key === 'f') playerBet('fold');
    else if (key === 'r') playerBet(game.facing ? 'raise' : 'bet');
    else if (key === 'enter' && !interactiveTarget) {
        e.preventDefault();
        if (!el.dealBtn.hidden && !el.dealBtn.disabled) startHand();
    }
    else if (key === 'm') { SFX.toggleMute(); syncSoundIcon(); }
    else if (key === '?' || key === '/') { openRules(); }
});

['pointerdown', 'keydown'].forEach(evt =>
    window.addEventListener(evt, () => SFX.unlock(), { once: true }));

window.addEventListener('resize', () => {
    sizeCanvas();
    requestAnimationFrame(reflowAll);
});

/* ---- Boot ---------------------------------------------------------------- */

sizeCanvas();
syncSoundIcon();
updateStats();
updateMoney();
updateShoe();
updateTotals();
syncControls();

if (!persisted.seen) {
    // First visit: meet the first rival, then play the two guided hands.
    game.seen = true;
    persist();
    showPoster('intro');
} else {
    if (!game.tutorialDone) game.tutorialDone = true;
    setStatus(`Deal when ready — ${rival().name}, ante <b>${money(currentAnte())}</b>.`);
}
