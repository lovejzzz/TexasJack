/* ==========================================================================
   Texas Jack — game.js
   Blackjack's race to 21 played on a Hold'em board.
   ========================================================================== */

const { Deck, cardFaceSVG, cardBackSVG, handTotal } = window.TJCards;
const {
    pressOffer,
    pressureGain,
    counterBounty,
    dealerMove,
    decisionInsight,
    ladderRivals,
    ladderRival,
    ladderFall,
    LADDER_STAKE
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
    chips: $('chips'),
    clearBet: $('clearBet'),
    maxBet: $('maxBet'),
    rebet: $('rebet'),
    dealBtn: $('dealBtn'),
    dealLabel: $('dealLabel'),
    hitBtn: $('hitBtn'),
    standBtn: $('standBtn'),
    raiseBtn: $('raiseBtn'),
    raiseAmt: $('raiseAmt'),
    raiseDetail: $('raiseDetail'),
    playMoney: $('playMoney'),
    dealerName: $('dealerName'),
    rivalAvatar: $('rivalAvatar'),
    houseRule: $('houseRule'),
    purseValue: $('purseValue'),
    purseBar: $('purseBar'),
    tableMin: $('tableMin'),
    poster: $('poster'),
    posterCard: $('posterCard'),
    coach: $('coach'),
    coachText: $('coachText'),
    actionsRow: document.querySelector('.actions'),
    betControls: $('betControls'),
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
    dealerCounter: $('dealerCounter'),
    dealerPressure: $('dealerPressure'),
    boardBtn: $('boardBtn'),
    handBtn: $('handBtn'),
    handLeft: $('handLeft'),
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

const PERFECT_MULTIPLIER = 1.5;   // win on exactly 21 pays 3:2
const PRIVATE_DRAWS = 2;          // "Your Call" mode: cards you may keep to yourself
/* Every rank a face-down card could be, as a hand value. */
const UNKNOWN_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

const PHASE = { BET: 'bet', DEALING: 'dealing', PLAYER: 'player', RESOLVING: 'resolving', OVER: 'over' };

/* ---- State --------------------------------------------------------------- */

const save = {
    read() {
        try { return JSON.parse(localStorage.getItem('tj.ladder')) || {}; }
        catch { return {}; }
    },
    write(data) {
        try { localStorage.setItem('tj.ladder', JSON.stringify(data)); } catch { /* private mode */ }
    }
};

const persisted = save.read();

function savedCount(value, fallback = 0) {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

const savedRung = Math.min(ladderRivals.length - 1, savedCount(persisted.rung));
const savedStake = savedCount(persisted.stake, LADDER_STAKE);
const savedPurse = savedCount(persisted.purse, ladderRival(savedRung).purse);
const savedHands = savedCount(persisted.hands);
const savedWins = Math.min(savedHands, savedCount(persisted.wins));

const game = {
    deck: new Deck(),
    player: [],
    dealer: [],
    shared: [],
    dealerBoard: [],
    phase: PHASE.BET,
    bankroll: savedStake,
    rung: savedRung,
    purse: Math.min(savedPurse, ladderRival(savedRung).purse) || ladderRival(savedRung).purse,
    cleared: savedCount(persisted.cleared),
    tutorialDone: !!persisted.tutorialDone,
    tutorialStep: null,
    ladderEvent: null,
    bet: 0,
    lastBet: savedCount(persisted.lastBet),
    ante: 0,
    moneyAction: null,
    raisedAtDraw: null,
    pressedAtDraw: null,
    pressTotal: 0,
    drawsTaken: 0,
    boardBrokeDealer: false,
    dealerRevealed: false,
    dealerCounter: 1,
    counterUsed: false,
    pressure: 0,
    dealerIntent: null,
    hands: savedHands,
    wins: savedWins,
    best: Math.max(savedStake, savedCount(persisted.best, savedStake)),
    seen: !!persisted.seen,
    // Your Call is the game: you route every card. Dealer's Call survives only
    // in the shared rules for the simulator and tests.
    mode: 'routed',
    privateLeft: PRIVATE_DRAWS
};

const routed = () => true;
/** The house dealer on the current rung of the ladder. */
const rival = () => ladderRival(game.rung);
/** The total this dealer stands on — and takes board cards below. */
const standsOn = () => rival().standsOn;
/** The rival can only cover what is left in their purse. */
const maxBet = () => Math.max(0, Math.min(game.bankroll + game.bet, game.purse));

// A save from before a fall (or an old build) can leave too little to sit
// down with; that run is over, so start the player one rung lower.
if (game.bankroll < rival().minBet) {
    const fall = ladderFall(game.rung);
    game.rung = fall.rung;
    game.bankroll = fall.stake;
    game.purse = rival().purse;
}

function persist() {
    // Chips on the betting line are still yours; chips in a live hand are
    // committed, so a reload forfeits that hand rather than refunding it.
    const betting = game.phase === PHASE.BET;
    save.write({
        stake: game.bankroll + (betting ? game.bet : 0),
        rung: game.rung,
        purse: game.purse,
        cleared: game.cleared,
        tutorialDone: game.tutorialDone,
        lastBet: game.lastBet,
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
 * 17. A dealer who is already pat cannot be forced to break by a card the
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
    if (!range) return { text: 'stands on 17', tone: '' };
    if (range.min > 21) return { text: 'busted', tone: 'tell-pat' };

    const mustHit = range.max < standsOn();
    const mustStand = range.min >= standsOn();

    // Kept short so the read still fits beside the pill on a phone.
    if (routed()) {
        if (mustHit) return { text: 'will draw', tone: 'tell-hit' };
        if (mustStand) return { text: 'pat — done drawing', tone: 'tell-pat' };
        return { text: 'may draw', tone: 'tell-maybe' };
    }
    if (mustHit) return { text: 'will share your card', tone: 'tell-hit' };
    if (mustStand) return { text: 'card stays yours', tone: 'tell-pat' };
    return { text: 'may share your card', tone: 'tell-maybe' };
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
    el.dealerCounter.classList.toggle('spent', game.dealerCounter <= 0);
    el.dealerCounter.classList.toggle('locked', game.pressure <= 0 || !rival().counters);
    el.dealerCounter.textContent = game.pressure <= 0
        ? 'Counter locked'
        : game.dealerCounter > 0 ? 'Counter 1' : 'Counter 0';
    el.dealerCounter.setAttribute('aria-label', game.pressure <= 0
        ? 'Dealer counter locked until the player presses'
        : game.dealerCounter > 0 ? 'Dealer counter available' : 'Dealer counter spent');
    el.dealerPressure.textContent = `Pressure ${game.pressure}`;
    el.dealerPressure.dataset.level = game.pressure;
}

function updateShoe() {
    el.shoeCount.textContent = game.deck.remaining;
}

function money(n) { return '$' + n.toLocaleString('en-US'); }

function updateMoney(bump = false) {
    // Any direct state render supersedes a counter animation already in flight.
    [el.bankroll, el.pot].forEach(node => { node._moneyAnimation = (node._moneyAnimation || 0) + 1; });
    el.bankroll.textContent = money(game.bankroll);
    el.pot.textContent = money(game.bet);
    el.streak.textContent = `${game.rung + 1} / ${ladderRivals.length}`;
    renderRival();
    if (bump) {
        el.bankroll.classList.remove('bump');
        void el.bankroll.offsetWidth;
        el.bankroll.classList.add('bump');
    }
}

/** The dealer lane carries the current rival: portrait, house rule, purse. */
function renderRival() {
    const r = rival();
    el.dealerName.textContent = r.name;
    el.rivalAvatar.className = `portrait portrait-${r.id}`;
    el.houseRule.textContent = r.rule;
    el.purseValue.textContent = money(game.purse);
    el.purseBar.style.transform = `scaleX(${Math.max(0, Math.min(1, game.purse / r.purse))})`;
    el.tableMin.textContent = `Table min ${money(r.minBet)}`;
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

/* ---- Controls ------------------------------------------------------------ */

function syncControls() {
    const betting = game.phase === PHASE.BET;
    const playing = game.phase === PHASE.PLAYER;

    const room = maxBet() - game.bet;
    el.chips.querySelectorAll('.chip').forEach(chip => {
        chip.disabled = !betting || room <= 0 || game.bankroll <= 0;
    });
    el.clearBet.disabled = !betting || game.bet === 0;
    el.maxBet.disabled = !betting || room <= 0 || game.bankroll === 0;
    el.rebet.disabled = !betting || game.lastBet < rival().minBet || game.lastBet > maxBet();

    el.dealBtn.disabled = !betting || game.bet < rival().minBet;
    el.standBtn.disabled = !playing;

    el.hitBtn.hidden = routed();
    el.boardBtn.hidden = !routed();
    el.handBtn.hidden = !routed();
    // On 21 another card can only hurt you, so Stand is the one move left.
    const drawable = playing && playerTotal().total < 21;
    el.hitBtn.disabled = !drawable;
    el.boardBtn.disabled = !drawable;
    el.handBtn.disabled = !drawable || game.privateLeft <= 0;
    el.handLeft.textContent = game.privateLeft;

    // The guided first hand allows exactly the move it is teaching.
    if (game.tutorialStep === 'board') {
        el.handBtn.disabled = true;
        el.standBtn.disabled = true;
    }

    // The money row swaps between placing a bet and acting on one.
    const inHand = !betting && game.phase !== PHASE.OVER;
    el.betControls.hidden = inHand;
    el.playMoney.hidden = !inHand;

    const offer = currentPressOffer();
    el.raiseBtn.disabled = !playing || offer.amount <= 0 || game.tutorialStep === 'board';
    el.raiseAmt.textContent = offer.amount > 0 ? '+' + money(offer.amount) : '—';
    el.raiseBtn.classList.toggle('attention', playing && offer.amount > 0);
    el.raiseBtn.classList.toggle('committed', game.pressTotal > 0);
    if (offer.locked) {
        el.raiseDetail.textContent = 'Known card locked · draw it to reopen';
    } else if (offer.usedThisWindow) {
        el.raiseDetail.textContent = `Read backed · ${money(offer.remaining)} leverage remains`;
    } else if (offer.maxed) {
        el.raiseDetail.textContent = `Fully committed · +${money(game.pressTotal)} this hand`;
    } else if (offer.amount > 0) {
        const timing = game.drawsTaken === 0 ? 'opening price' : game.drawsTaken < 3 ? 'window narrowed' : 'final price';
        el.raiseDetail.textContent = `${money(offer.remaining)} leverage left · ${timing}`;
    } else {
        el.raiseDetail.textContent = game.bankroll <= 0 ? 'No bankroll available' : 'Next card reopens the window';
    }
    el.dealLabel.textContent = 'Deal';
    // Betting shows Deal alone; a live hand shows only the moves.
    el.actionsRow.dataset.phase = betting ? 'bet' : 'hand';
}

/* ---- Betting ------------------------------------------------------------- */

function addToBet(amount, origin = null) {
    if (game.phase !== PHASE.BET) return;
    const before = game.bet;
    const bankBefore = game.bankroll;
    const wager = Math.min(amount, game.bankroll, maxBet() - game.bet);
    if (wager <= 0) {
        setStatus(`${rival().name}'s purse only covers <b>${money(maxBet())}</b>.`);
        return;
    }
    game.bankroll -= wager;
    game.bet += wager;
    SFX.chip();
    updateMoney();
    animateMoneyValue(el.bankroll, bankBefore, game.bankroll, 280);
    animateBetTransfer(origin, before, game.bet);
    syncControls();
    const short = rival().minBet - game.bet;
    setStatus(short > 0
        ? `Wager: <b>${money(game.bet)}</b> — the table minimum is ${money(rival().minBet)}.`
        : `Wager: <b>${money(game.bet)}</b> — press Deal when you're ready.`);
    if (game.tutorialStep === 'bet' && short <= 0) coach(el.dealBtn, 'Now <b>Deal</b>.');
}

function clearBet() {
    if (game.phase !== PHASE.BET || game.bet === 0) return;
    game.bankroll += game.bet;
    game.bet = 0;
    SFX.chip();
    updateMoney();
    syncControls();
    setStatus('Bet cleared. Place your bet to begin.');
}

/* ---- Round flow ---------------------------------------------------------- */

async function startRound() {
    if (game.phase !== PHASE.BET) return;

    if (game.bet < rival().minBet) {
        setStatus(`${rival().name} won't deal for less than <b>${money(rival().minBet)}</b>.`);
        return;
    }

    game.lastBet = game.bet;
    game.phase = PHASE.DEALING;
    game.player = [];
    game.dealer = [];
    game.shared = [];
    game.dealerBoard = [];
    game.ante = game.bet;
    game.moneyAction = null;
    game.raisedAtDraw = null;
    game.pressedAtDraw = null;
    game.pressTotal = 0;
    game.drawsTaken = 0;
    game.boardBrokeDealer = false;
    game.dealerRevealed = false;
    game.dealerCounter = 1;
    game.counterUsed = false;
    game.pressure = 0;
    game.dealerIntent = null;
    game.privateLeft = PRIVATE_DRAWS;
    game.deck.reset();
    const guided = game.tutorialStep === 'bet';
    if (guided) {
        // The first hand is stacked to show the twist in one move: you sit on
        // 9, the dealer on 14, and the next card is a ten. On the board it
        // lands in both hands — 19 for you, 24 for the dealer.
        rigDeck([['4', 'C'], ['9', 'S'], ['5', 'D'], ['K', 'H']]);
        coach(null);
    }
    persist();

    clearTable();
    hideOverlay();
    syncControls();
    updateShoe();
    setStatus('Dealing…');

    await dealTo(game.player, el.playerCards, drawCard());
    await dealTo(game.dealer, el.dealerCards, drawCard(), { faceDown: true });
    // Routed through layOnBoard so the opening community card obeys the same
    // "dealer takes it only while under 17" rule as every later one.
    await layOnBoard(drawCard());
    highlightLane(null);

    game.phase = PHASE.PLAYER;
    updateTotals();
    syncControls();
    highlightLane('player');

    const p = handTotal(game.player, game.shared);
    if (guided) {
        game.tutorialStep = 'board';
        syncControls();
        setStatus('The middle card counts for <b>both</b> of you.');
        coach(el.boardBtn, `You're on 9 and can't bust. ${rival().name} is under 17, so every <b>Board</b> card lands in her hand too. Send one.`);
    } else if (p.total === 21) {
        setStatus('Twenty-one off the deal — <b>Stand</b> and collect.');
    } else if (routed()) {
        setStatus('Your move — card to the <b>Board</b> or to your <b>Hand</b>.');
    } else {
        setStatus('Your move — <b>Hit</b>, <b>Stand</b>, or <b>Press</b>.');
    }
}

/**
 * Puts a drawn card on the board. The dealer only picks it up if they were
 * still under 17 when it landed — a pat dealer stands aside, and the card
 * belongs to the player alone.
 */
async function layOnBoard(card) {
    const dealerTakes = dealerTotal().total < standsOn();
    if (dealerTakes) game.dealerBoard.push(card);

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

/** "Dealer's Call": the dealer's own total decides where your card lands. */
async function playerHit() {
    if (game.phase !== PHASE.PLAYER) return;

    const pressBefore = currentPressOffer().amount;
    game.phase = PHASE.RESOLVING;
    game.drawsTaken += 1;
    syncControls();
    highlightLane(null);

    const card = drawCard();
    const dealerBefore = handTotal(game.dealer, game.dealerBoard).total;
    const dealerHitsToo = dealerBefore < standsOn();

    setStatus('You call for a card — the dealer weighs it', { thinking: true });
    await sleep(440);
    SFX.button();

    if (dealerHitsToo) {
        setStatus('Dealer takes one too — <b>this card is shared</b>.');
        await sleep(320);
        await layOnBoard(card);
    } else {
        setStatus('Dealer is pat — <b>the card is yours alone</b>.');
        await sleep(320);
        highlightLane('player');
        await dealTo(game.player, el.playerCards, card);
    }

    return afterDraw({ pressBefore });
}

/**
 * "Your Call": you route the card yourself. The board is the aggressive line —
 * it can break a dealer sitting on 16, but it lifts your total too. Keeping a
 * card to yourself is safe, and deliberately scarce.
 */
async function playerDraw(target, { free = false } = {}) {
    if (game.phase !== PHASE.PLAYER) return;
    if (target === 'hand' && !free && game.privateLeft <= 0) return;

    const pressBefore = currentPressOffer().amount;
    if (game.tutorialStep === 'board') {
        game.tutorialStep = 'played';
        coach(null);
    }
    game.phase = PHASE.RESOLVING;
    game.drawsTaken += 1;
    if (target === 'hand' && !free) game.privateLeft -= 1;
    syncControls();
    highlightLane(null);
    SFX.button();

    const card = drawCard();

    if (target === 'board') {
        setStatus('Onto the board — <b>this card counts for both</b>.');
        await sleep(420);
        await layOnBoard(card);
    } else {
        setStatus('Into your hand — <b>yours alone</b>.');
        await sleep(420);
        highlightLane('player');
        await dealTo(game.player, el.playerCards, card);
    }

    return afterDraw({ pressBefore });
}

/** Shared settlement for both variants once a card has landed. */
async function afterDraw({ pressBefore = 0 } = {}) {
    await sleep(260);
    highlightLane(null);

    const p = handTotal(game.player, game.shared).total;
    const d = handTotal(game.dealer, game.dealerBoard).total;

    // The player busts first, so a card that breaks them both is still a loss.
    // Treating it as a push made reckless drawing free and handed the player a
    // large edge — a quarter of all hands were ending in a no-risk refund.
    if (p > 21) {
        markBust(el.playerCards);
        return finish('lose',
            d > 21 ? `${p} — that card broke you both, but you went over first.`
                   : `You bust with ${p}.`,
            { bust: true });
    }
    if (d > 21) {
        game.boardBrokeDealer = true;
        await revealDealer();
        markBust(el.dealerCards);
        return finish('win', `The board broke the dealer at ${d}!`);
    }

    game.phase = PHASE.PLAYER;
    highlightLane('player');
    syncControls();
    const pressAfter = currentPressOffer().amount;
    if (p === 21) {
        setStatus('Twenty-one! Stand and lock it in?');
    } else if (pressAfter > 0) {
        const shift = pressBefore > pressAfter ? `${money(pressBefore)} → ${money(pressAfter)}` : `+${money(pressAfter)}`;
        setStatus(`New press window: <b>${shift}</b>. Back the read or play on.`);
    } else {
        setStatus('Your move.');
    }
}

/* ---- Money actions ------------------------------------------------------- */

/** Price the one conviction press available at the current card state. */
function currentPressOffer() {
    return pressOffer({
        ante: game.ante,
        bankroll: game.bankroll,
        drawsTaken: game.drawsTaken,
        pressedTotal: game.pressTotal,
        pressedAtDraw: game.pressedAtDraw,
        scoutLocked: false
    });
}

function playerRaise() {
    if (game.phase !== PHASE.PLAYER) return;
    const offer = currentPressOffer();
    const amount = offer.amount;
    if (amount <= 0) return;
    const bankBefore = game.bankroll;
    const betBefore = game.bet;
    game.bankroll -= amount;
    game.bet += amount;
    game.pressTotal += amount;
    persist();
    game.pressedAtDraw = game.drawsTaken;
    const pressureBefore = game.pressure;
    game.pressure = Math.min(3, game.pressure + pressureGain({
        drawsTaken: game.drawsTaken,
        scoutUsed: false
    }));
    game.moneyAction = 'raise';
    if (game.raisedAtDraw === null) game.raisedAtDraw = game.drawsTaken;
    SFX.chip();
    updateMoney();
    animateMoneyValue(el.bankroll, bankBefore, game.bankroll, 280);
    animateBetTransfer(el.raiseBtn, betBefore, game.bet);
    updateTotals();
    if (game.pressure > pressureBefore) {
        laneOf.dealer.classList.remove('pressure-rise');
        void laneOf.dealer.offsetWidth;
        laneOf.dealer.classList.add('pressure-rise');
        setTimeout(() => laneOf.dealer.classList.remove('pressure-rise'), 900);
    }
    setStatus(`Read backed — <b>${money(game.bet)}</b> in play. Dealer pressure <b>${game.pressure}/3</b>.`);
    syncControls();
}

/** Every card leaves the shoe through here. */
function drawCard() {
    return game.deck.draw();
}

/**
 * Moves the named cards to the top of the shoe, first-named drawn first.
 * Used only to stack the guided first hand.
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
    setStatus('You stand. Dealer turns over', { thinking: true });
    await sleep(560);
    await dealerPlay();
}

async function dealerPlay() {
    game.phase = PHASE.RESOLVING;
    highlightLane('dealer');
    await revealDealer();
    updateTotals();

    const p = handTotal(game.player, game.shared).total;

    while (true) {
        const dealerState = handTotal(game.dealer, game.dealerBoard);
        const d = dealerState.total;
        const move = dealerMove({
            dealerTotal: d,
            playerTotal: p,
            soft: dealerState.soft,
            pressureAvailable: game.dealerCounter > 0 && rival().counters,
            pressure: Math.min(3, game.pressure + rival().heatBonus),
            standsOn: standsOn()
        });

        if (!move.draw) {
            if (move.intent === 'protect') {
                game.dealerIntent = { text: `protects ${d} over ${p}`, tone: 'tell-pat' };
                setStatus(`Dealer protects the lead: <b>${d}–${p}</b>.`);
            } else if (move.intent === 'hold-push') {
                game.dealerIntent = { text: `holds the ${d} push`, tone: 'tell-maybe' };
                setStatus(`Dealer takes the push at <b>${d}</b>.`);
            } else if (move.intent === 'concede') {
                const reason = game.counterUsed ? 'counter spent' : 'out of reach';
                game.dealerIntent = { text: `${reason} · trails ${p}`, tone: 'tell-hit' };
                setStatus(game.counterUsed
                    ? `Counter spent — dealer cannot catch your <b>${p}</b>.`
                    : `Dealer can't chase your <b>${p}</b> and stands.`);
            } else if (move.intent === 'hold') {
                game.dealerIntent = { text: d === 21 ? 'locks 21' : `holds ${d}`, tone: 'tell-pat' };
                setStatus(d === 21 ? 'Dealer locks in <b>21</b>.' : `Dealer holds at <b>${d}</b>.`);
            }
            updateTotals();
            break;
        }

        if (move.usesCounter) {
            game.dealerCounter = 0;
            game.counterUsed = true;
            laneOf.dealer.classList.add('countering');
            setTimeout(() => laneOf.dealer.classList.remove('countering'), 1500);
            SFX.counter();
        }

        if (move.intent === 'attack-tie') {
            game.dealerIntent = { text: `attacks the ${d} tie`, tone: 'tell-hit' };
            setStatus(`Dealer spends its <b>Counter</b> to attack the ${d} tie.`, { thinking: true });
        } else if (move.intent === 'counter') {
            game.dealerIntent = { text: `counters your ${p}`, tone: 'tell-hit' };
            setStatus(`Dealer counters from <b>${d}</b> — chasing your <b>${p}</b>.`, { thinking: true });
        } else {
            game.dealerIntent = { text: `building from ${d}`, tone: 'tell-maybe' };
            setStatus(`Dealer trails <b>${d}–${p}</b> and draws.`, { thinking: true });
        }
        updateTotals();
        await sleep(620);
        await dealTo(game.dealer, el.dealerCards, drawCard());
        updateTotals();
        if (handTotal(game.dealer, game.dealerBoard).total > 21) break;
    }

    highlightLane(null);
    await sleep(420);

    const d = handTotal(game.dealer, game.dealerBoard).total;

    // Player first, to stay consistent with the bust rule above.
    if (p > 21) {
        markBust(el.playerCards);
        return finish('lose', `You're over at ${p}.`, { bust: true });
    }
    if (d > 21) {
        markBust(el.dealerCards);
        return finish('win', `Dealer busts with ${d}. The hand is yours.`);
    }
    if (p > d) return finish('win', `${p} beats ${d}.`);
    if (d > p) return finish('lose', `Dealer's ${d} tops your ${p}.`);
    return finish('push', `Both on ${p} — push.`);
}

function markBust(container) {
    container.querySelectorAll('.card').forEach(c => c.classList.add('doomed'));
    SFX.bust();
}

/* ---- Settlement ---------------------------------------------------------- */

async function finish(outcome, message, { bust = false } = {}) {
    game.phase = PHASE.OVER;
    highlightLane(null);
    syncControls();

    // However the hand ended, the player gets to see what the dealer held.
    if (el.dealerCards.querySelector('.card.face-down')) {
        setStatus('Dealer shows their hand…');
        await revealDealer();
    }
    updateTotals();

    const wager = game.bet;
    const playerTotal = handTotal(game.player, game.shared).total;
    const bankrollBefore = game.bankroll;
    const previousBest = game.best;
    const r = rival();
    let payout = 0;
    let detail = '';
    let perfect = false;

    // Every chip you win comes out of the rival's purse, and every chip you
    // lose goes into it. The purse can only pay what it holds.
    if (outcome === 'win') {
        perfect = playerTotal === 21;
        const bounty = counterBounty({
            ante: game.ante,
            pressure: game.pressure,
            counterUsed: game.counterUsed,
            outcome
        });
        const owed = Math.round(wager * (perfect ? PERFECT_MULTIPLIER : 1)) + bounty;
        const paid = Math.min(owed, game.purse);
        game.purse -= paid;
        payout = wager + paid;
        game.wins += 1;
        detail = `+${money(paid)}`;
        if (perfect) detail += ' · 21 pays 3:2';
        if (bounty > 0) detail += ` · Counter bounty +${money(bounty)}`;
        if (paid < owed) detail += ' · purse emptied';
    } else if (outcome === 'push') {
        payout = wager;
        detail = 'Bet returned';
    } else {
        game.purse += wager;
        detail = `−${money(wager)}`;
    }

    const insight = decisionInsight({
        outcome,
        mode: game.mode,
        playerTotal,
        moneyAction: game.moneyAction,
        pressTotal: game.pressTotal,
        scoutUsed: false,
        pressure: game.pressure,
        counterUsed: game.counterUsed,
        raisedAtDraw: game.raisedAtDraw,
        boardBrokeDealer: game.boardBrokeDealer,
        privateLeft: game.privateLeft,
        challengeWon: false,
        drawsTaken: game.drawsTaken,
        bust
    });

    game.bankroll += payout;
    game.bet = 0;
    game.hands += 1;

    // Climb or fall. A purse below the table minimum is broken; a stake
    // below it means you've been run out of town.
    game.ladderEvent = null;
    if (game.purse < r.minBet) {
        game.bankroll += r.bounty;
        const last = game.rung === ladderRivals.length - 1;
        game.ladderEvent = { kind: last ? 'champion' : 'beaten', rival: r };
        if (last) game.cleared += 1;
        game.rung = last ? 0 : game.rung + 1;
        game.purse = rival().purse;
    } else if (game.bankroll < r.minBet) {
        const fall = ladderFall(game.rung);
        game.ladderEvent = { kind: 'fall', rival: r };
        game.rung = fall.rung;
        game.bankroll = fall.stake;
        game.purse = rival().purse;
    }
    if (game.tutorialStep === 'played') {
        game.tutorialStep = 'wrap';
        game.tutorialDone = true;
    }
    const newPeak = game.bankroll > previousBest;
    game.best = Math.max(game.best, game.bankroll);
    persist();
    updateMoney(false);

    if (outcome === 'win') {
        laneOf.player.classList.add('winner');
        if (perfect) laneOf.player.classList.add('perfect-win');
        if (game.boardBrokeDealer) laneOf.shared.classList.add('winner');
    }

    if (payout > 0) {
        animatePayoutTransfer({
            bankrollBefore,
            bankrollAfter: game.bankroll,
            potBefore: wager,
            payout,
            outcome,
            perfect,
            hot: false,
            challengeWon: false,
            newPeak
        });
    } else {
        animateLossDrain(wager);
    }

    const splash = outcome === 'win' ? 'win' : bust ? 'bust' : outcome === 'push' ? 'tie' : 'lose';
    showSplash(splash, detail, insight, false);

    if (outcome === 'win') {
        confetti(playerTotal === 21 ? 160 : 90);
        playerTotal === 21 ? SFX.jackpot() : SFX.win();
    } else if (outcome === 'push') {
        SFX.push();
    } else if (!bust) {
        SFX.lose();
    }

    setStatus(message);

    clearTimeout(openBetting.timer);
    openBetting.timer = setTimeout(openBetting, 2100);
}

/** Back to the betting rail — on a timer, or straight away if the splash is dismissed. */
function openBetting() {
    clearTimeout(openBetting.timer);
    if (game.phase !== PHASE.OVER) return;
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
    } else if (game.tutorialStep === 'wrap') {
        tutorialWrap();
    } else {
        setStatus(`Place your bet against <b>${rival().name}</b> — or tap Again.`);
    }
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

function showSplash(kind, detail, insight = '', challengeWon = false) {
    const word = { win: 'Winner', lose: 'Beaten', tie: 'Push', bust: 'Busted' }[kind];
    el.resultWord.textContent = word;
    el.resultStamp.dataset.kind = kind;
    el.resultPayout.textContent = detail || '';
    el.resultPayout.classList.toggle('negative', kind === 'lose' || kind === 'bust');
    el.resultInsight.textContent = insight;
    el.resultInsight.classList.toggle('goal-cleared', challengeWon);
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

/* ---- Saloon Ladder: posters and the guided hand ------------------------- */

const POSTER_COPY = {
    intro: r => ({
        eyebrow: `Rung ${ladderRivals.indexOf(r) + 1} of ${ladderRivals.length}`,
        title: `${r.name}, ${r.title}`,
        body: r.ruleDetail,
        stats: [['House rule', r.rule], ['Purse', money(r.purse)], ['Table min', money(r.minBet)], ['Bounty', money(r.bounty)]],
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
        game.tutorialStep = 'bet';
        setStatus(`Your first hand against <b>${rival().name}</b>.`);
        coach(el.chips, `Tap a chip to bet at least ${money(rival().minBet)}.`);
    } else {
        setStatus(`Place your bet against <b>${rival().name}</b>.`);
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
    setStatus(`That's the twist. Now break <b>${rival().name}'s</b> purse.`);
    coach(el.actionsRow, 'Two more tools: <b>Hand</b> keeps a card to yourself (twice a hand), and <b>Press</b> backs a strong read. Tap to close.');
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

el.chips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip && !chip.disabled) addToBet(Number(chip.dataset.value), chip);
});
el.clearBet.addEventListener('click', clearBet);
el.maxBet.addEventListener('click', () => addToBet(game.bankroll, el.maxBet));
el.rebet.addEventListener('click', () => {
    clearBet();
    addToBet(game.lastBet, el.rebet);
    startRound();
});

el.dealBtn.addEventListener('click', startRound);
el.hitBtn.addEventListener('click', () => playerHit());
el.boardBtn.addEventListener('click', () => playerDraw('board'));
el.handBtn.addEventListener('click', () => playerDraw('hand'));
el.standBtn.addEventListener('click', playerStand);
el.raiseBtn.addEventListener('click', playerRaise);

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

    if (key === 'h') {
        if (routed()) { if (!el.handBtn.disabled) playerDraw('hand'); }
        else if (!el.hitBtn.disabled) playerHit();
    }
    else if (key === 'b') { if (routed() && !el.boardBtn.disabled) playerDraw('board'); }
    else if (key === 's') { if (!el.standBtn.disabled) playerStand(); }
    else if (key === 'r') { if (!el.raiseBtn.disabled) playerRaise(); }
    else if (key === 'enter' && interactiveTarget && interactiveTarget.closest('#betControls')) {
        // Enter means Deal, even right after clicking a chip with the mouse.
        e.preventDefault();
        if (!el.dealBtn.disabled) startRound();
    }
    else if (key === 'enter' && !interactiveTarget) {
        e.preventDefault();
        if (!el.dealBtn.disabled) startRound();
    }
    else if (key === 'm') { SFX.toggleMute(); syncSoundIcon(); }
    else if (key === '?' || key === '/') { openRules(); }
    else if (key >= '1' && key <= '4') {
        const chip = el.chips.querySelectorAll('.chip')[Number(key) - 1];
        if (chip && !chip.disabled) addToBet(Number(chip.dataset.value));
    }
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

renderRival();
if (!persisted.seen) {
    // First visit: meet the first rival, then play the guided hand.
    game.seen = true;
    persist();
    showPoster('intro');
} else {
    setStatus(`Place your bet against <b>${rival().name}</b> — ${rival().rule.toLowerCase()}.`);
}
