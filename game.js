/* ==========================================================================
   Texas Jack — game.js
   Blackjack's race to 21 played on a Hold'em board.
   ========================================================================== */

const { Deck, cardFaceSVG, cardBackSVG, handTotal } = window.TJCards;
const { tableGoal, tableGoalComplete, decisionInsight } = window.TJRules;

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
    scoutBtn: $('scoutBtn'),
    scout: $('scoutSlot'),
    scoutCard: $('scoutCard'),
    raiseAmt: $('raiseAmt'),
    scoutAmt: $('scoutAmt'),
    raiseDetail: $('raiseDetail'),
    scoutDetail: $('scoutDetail'),
    challengeBox: $('challengeBox'),
    challengeText: $('challengeText'),
    challengeReward: $('challengeReward'),
    playMoney: $('playMoney'),
    betControls: $('betControls'),
    overlay: $('resultOverlay'),
    resultImage: $('resultImage'),
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
    boardBtn: $('boardBtn'),
    handBtn: $('handBtn'),
    handLeft: $('handLeft'),
    modeSwitch: $('modeSwitch'),
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

const START_BANK = 1000;
const REBUY = 500;
const DEALER_STANDS_ON = 17;
const HOT_STREAK_AT = 3;
const HOT_STREAK_BONUS = 0.25;
const PERFECT_MULTIPLIER = 1.5;   // win on exactly 21 pays 3:2
const PRIVATE_DRAWS = 2;          // "Your Call" mode: cards you may keep to yourself
/* Cost of scouting the shoe, as a share of the ante. Priced from measurement:
   the top card is worth ~19 points of edge in Dealer's Call and ~23 in Your
   Call — vastly more than the dealer's hole card was, because nothing on the
   table implies it. Bought in the spots where it can change a decision that
   works out to break-even at roughly a third of the ante, so buying it every
   hand loses and buying it in the right spots is a small, real gain. */
const SCOUT_RATE = 0.30;
const RAISE_MAX = 0.5;            // most you may add to the wager, as a share of the ante

/* Every rank a face-down card could be, as a hand value. */
const UNKNOWN_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

const PHASE = { BET: 'bet', DEALING: 'dealing', PLAYER: 'player', RESOLVING: 'resolving', OVER: 'over' };

/* ---- State --------------------------------------------------------------- */

const save = {
    read() {
        try { return JSON.parse(localStorage.getItem('tj.save')) || {}; }
        catch { return {}; }
    },
    write(data) {
        try { localStorage.setItem('tj.save', JSON.stringify(data)); } catch { /* private mode */ }
    }
};

const persisted = save.read();

const game = {
    deck: new Deck(),
    player: [],
    dealer: [],
    shared: [],
    dealerBoard: [],
    phase: PHASE.BET,
    bankroll: Number.isFinite(persisted.bankroll) ? persisted.bankroll : START_BANK,
    bet: 0,
    lastBet: persisted.lastBet || 0,
    streak: persisted.streak || 0,
    ante: 0,
    scouted: null,
    moneyUsed: false,
    moneyAction: null,
    raisedAtDraw: null,
    drawsTaken: 0,
    boardBrokeDealer: false,
    challenge: null,
    challengeCompleted: false,
    dealerRevealed: false,
    hands: persisted.hands || 0,
    wins: persisted.wins || 0,
    best: persisted.best || (Number.isFinite(persisted.bankroll) ? persisted.bankroll : START_BANK),
    seen: !!persisted.seen,
    mode: persisted.mode === 'routed' ? 'routed' : 'classic',
    privateLeft: PRIVATE_DRAWS
};

const routed = () => game.mode === 'routed';

function persist() {
    save.write({
        bankroll: game.bankroll,
        lastBet: game.lastBet,
        streak: game.streak,
        hands: game.hands,
        wins: game.wins,
        best: game.best,
        seen: game.seen,
        mode: game.mode
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

    const totals = [];
    const walk = (depth, cards) => {
        if (depth === hidden) {
            // Only the board cards the dealer actually took, not the whole row.
            totals.push(handTotal(cards, game.dealerBoard).total);
            return;
        }
        for (const rank of UNKNOWN_RANKS) walk(depth + 1, cards.concat({ rank }));
    };
    walk(0, []);

    // A live hand means the dealer hasn't busted — every card that lands on the
    // board is checked against them — so totals over 21 are ruled out.
    const live = game.phase !== PHASE.OVER ? totals.filter(t => t <= 21) : [];
    const feasible = live.length ? live : totals;
    return { min: Math.min(...feasible), max: Math.max(...feasible) };
}

/** What the range implies the dealer will do, phrased for the active variant. */
function dealerTell(range) {
    if (!range) return { text: 'stands on 17', tone: '' };
    if (range.min > 21) return { text: 'busted', tone: 'tell-pat' };

    const mustHit = range.max < DEALER_STANDS_ON;
    const mustStand = range.min >= DEALER_STANDS_ON;

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

    const tell = dealerTell(inPlay && !game.dealerRevealed ? dealerRange() : null);
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
    el.pot.textContent = money(game.bet);
    el.streak.textContent = game.streak;
    el.streakBox.classList.toggle('hot', game.streak >= HOT_STREAK_AT);
    if (bump) {
        el.bankroll.classList.remove('bump');
        void el.bankroll.offsetWidth;
        el.bankroll.classList.add('bump');
    }
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

    el.chips.querySelectorAll('.chip').forEach(chip => {
        chip.disabled = !betting || Number(chip.dataset.value) > game.bankroll;
    });
    el.clearBet.disabled = !betting || game.bet === 0;
    el.maxBet.disabled = !betting || game.bankroll === 0;
    el.rebet.disabled = !betting || game.lastBet === 0 || game.lastBet > game.bankroll + game.bet;

    const broke = game.bankroll === 0 && game.bet === 0;
    el.dealBtn.disabled = !betting || (game.bet === 0 && !broke);
    el.standBtn.disabled = !playing;

    el.hitBtn.hidden = routed();
    el.boardBtn.hidden = !routed();
    el.handBtn.hidden = !routed();
    el.hitBtn.disabled = !playing;
    el.boardBtn.disabled = !playing;
    el.handBtn.disabled = !playing || game.privateLeft <= 0;
    el.handLeft.textContent = game.privateLeft;

    // The money row swaps between placing a bet and acting on one.
    const inHand = !betting && game.phase !== PHASE.OVER;
    el.betControls.hidden = inHand;
    el.playMoney.hidden = !inHand;

    const cap = raiseCap();
    el.raiseBtn.disabled = !playing || cap <= 0;
    el.raiseAmt.textContent = cap > 0 ? '+' + money(cap) : '—';
    el.raiseBtn.classList.toggle('attention', playing && cap > 0 && game.drawsTaken === 0);
    if (game.moneyAction === 'raise') {
        el.raiseDetail.textContent = `Committed at ${money(game.bet)}`;
    } else if (game.moneyUsed) {
        el.raiseDetail.textContent = 'One money move already used';
    } else if (cap > 0) {
        el.raiseDetail.textContent = `Total wager ${money(game.bet + cap)} · ${game.drawsTaken ? 'window narrowed' : 'best price now'}`;
    } else {
        el.raiseDetail.textContent = 'No raise available';
    }
    const cost = scoutCost();
    el.scoutBtn.disabled = !playing || game.moneyUsed || cost > game.bankroll;
    el.scoutAmt.textContent = game.moneyUsed ? '—' : money(cost);
    el.scoutDetail.textContent = game.moneyAction === 'scout'
        ? 'Information bought this hand'
        : game.moneyUsed ? 'One money move already used' : 'Reveal the next card';

    if (game.challenge) {
        el.challengeText.textContent = game.challenge.text;
        el.challengeReward.textContent = `+${money(game.challenge.reward)}`;
        el.challengeBox.classList.toggle('cleared', game.challengeCompleted);
    }

    el.modeSwitch.querySelectorAll('button').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.pick === game.mode));
        b.disabled = !betting;
    });
    document.querySelectorAll('[data-variant]').forEach(node => {
        node.hidden = node.dataset.variant !== game.mode;
    });

    el.dealLabel.textContent = betting && broke ? 'Rebuy' : 'Deal';
}

/* ---- Betting ------------------------------------------------------------- */

function addToBet(amount, origin = null) {
    if (game.phase !== PHASE.BET) return;
    const before = game.bet;
    const bankBefore = game.bankroll;
    const wager = Math.min(amount, game.bankroll);
    if (wager <= 0) return;
    game.bankroll -= wager;
    game.bet += wager;
    SFX.chip();
    updateMoney();
    animateMoneyValue(el.bankroll, bankBefore, game.bankroll, 280);
    animateBetTransfer(origin, before, game.bet);
    syncControls();
    setStatus(`Wager: <b>${money(game.bet)}</b> — press Deal when you're ready.`);
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

    if (game.bankroll === 0 && game.bet === 0) { rebuy(); return; }
    if (game.bet === 0) { setStatus('Put some chips down first.'); return; }

    game.lastBet = game.bet;
    game.phase = PHASE.DEALING;
    game.player = [];
    game.dealer = [];
    game.shared = [];
    game.dealerBoard = [];
    game.ante = game.bet;
    game.scouted = null;
    game.moneyUsed = false;
    game.moneyAction = null;
    game.raisedAtDraw = null;
    game.drawsTaken = 0;
    game.boardBrokeDealer = false;
    game.challengeCompleted = false;
    game.dealerRevealed = false;
    game.privateLeft = PRIVATE_DRAWS;
    game.challenge = tableGoal(game.mode, game.hands, game.ante);
    game.deck.reset();

    clearTable();
    renderScout();
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
    if (p.total === 21) {
        setStatus('Twenty-one off the deal. Stand and take it?');
    } else if (routed()) {
        setStatus('Your move — card to the <b>Board</b> or to your <b>Hand</b>.');
    } else {
        setStatus('Your move — <b>Hit</b>, <b>Stand</b>, or <b>Raise</b>.');
    }
}

/**
 * Puts a drawn card on the board. The dealer only picks it up if they were
 * still under 17 when it landed — a pat dealer stands aside, and the card
 * belongs to the player alone.
 */
async function layOnBoard(card) {
    const dealerTakes = dealerTotal().total < DEALER_STANDS_ON;
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

    const capBefore = raiseCap();
    game.phase = PHASE.RESOLVING;
    game.drawsTaken += 1;
    syncControls();
    highlightLane(null);

    const card = drawCard();
    const dealerBefore = handTotal(game.dealer, game.dealerBoard).total;
    const dealerHitsToo = dealerBefore < DEALER_STANDS_ON;

    setStatus('You call for a card — the dealer weighs it', { thinking: true });
    await sleep(760);
    SFX.button();

    if (dealerHitsToo) {
        setStatus('Dealer takes one too — <b>this card is shared</b>.');
        await sleep(520);
        await layOnBoard(card);
    } else {
        setStatus(`Dealer stands on ${dealerBefore}+ — <b>the card is yours alone</b>.`);
        await sleep(520);
        highlightLane('player');
        await dealTo(game.player, el.playerCards, card);
    }

    return afterDraw({ capBefore });
}

/**
 * "Your Call": you route the card yourself. The board is the aggressive line —
 * it can break a dealer sitting on 16, but it lifts your total too. Keeping a
 * card to yourself is safe, and deliberately scarce.
 */
async function playerDraw(target, { free = false } = {}) {
    if (game.phase !== PHASE.PLAYER) return;
    if (target === 'hand' && !free && game.privateLeft <= 0) return;

    const capBefore = raiseCap();
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

    return afterDraw({ capBefore });
}

/** Shared settlement for both variants once a card has landed. */
async function afterDraw({ capBefore = 0 } = {}) {
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
    const capAfter = raiseCap();
    if (p === 21) {
        setStatus('Twenty-one! Stand and lock it in?');
    } else if (capBefore > capAfter && capAfter > 0 && !game.moneyUsed) {
        setStatus(`Raise window narrowed: <b>${money(capBefore)} → ${money(capAfter)}</b>. Your move.`);
    } else {
        setStatus('Your move.');
    }
}

/* ---- Money actions ------------------------------------------------------- */

/**
 * How much you may still add to the wager. It shrinks with every card you take,
 * so leverage and information pull against each other: commit early on a wide
 * read for the most money, or wait for a sharper read and bet less on it.
 */
function raiseCap() {
    if (game.moneyUsed || game.phase !== PHASE.PLAYER) return 0;
    // Half the ante at most. At a full ante, a player who waits for a provably
    // winning spot converts the read into a +3.7% edge — the raise has to be
    // worth taking without being big enough to break the game.
    const scale = Math.max(0.25, 1 - 0.25 * game.drawsTaken);
    return Math.min(game.bankroll, Math.round(game.ante * RAISE_MAX * scale));
}

function playerRaise() {
    const amount = raiseCap();
    if (amount <= 0) return;
    game.bankroll -= amount;
    game.bet += amount;
    game.moneyUsed = true;
    game.moneyAction = 'raise';
    game.raisedAtDraw = game.drawsTaken;
    SFX.chip();
    updateMoney(true);
    flyMoney(`−${money(amount)}`, true);
    setStatus(`Read backed — <b>${money(game.bet)}</b> is now in play.`);
    syncControls();
}

/** What it costs right now to buy a look at the next card off the shoe. */
function scoutCost() {
    return Math.max(1, Math.round(game.ante * SCOUT_RATE));
}

/**
 * Buys the top card of the shoe. Unlike the dealer's hole card — which the
 * public board already pins to a nine-point range — nothing on the table
 * implies what comes next, so this is information you cannot otherwise get.
 */
function playerScout() {
    if (game.phase !== PHASE.PLAYER || game.moneyUsed) return;
    const cost = scoutCost();
    if (cost > game.bankroll) return;

    game.bankroll -= cost;
    game.moneyUsed = true;
    game.moneyAction = 'scout';
    game.scouted = game.deck.peek();
    SFX.chip();
    updateMoney();
    flyMoney(`−${money(cost)}`, true);
    renderScout();
    syncControls();
    setStatus(`Top of the shoe: <b>${cardName(game.scouted)}</b>.`);
}

function cardName(card) {
    if (!card) return '';
    const suit = window.TJCards.SUITS.find(s => s.key === card.suit);
    return `${card.rank}${suit ? suit.glyph : ''}`;
}

function renderScout() {
    const card = game.scouted;
    el.scout.hidden = !card;
    if (!card) {
        el.scoutCard.innerHTML = '';
        el.scoutCard.removeAttribute('role');
        el.scoutCard.removeAttribute('aria-label');
        return;
    }
    el.scoutCard.innerHTML = cardFaceSVG(card);
    el.scoutCard.setAttribute('role', 'img');
    el.scoutCard.setAttribute('aria-label', `Next card: ${accessibleCardName(card)}`);
    el.scoutCard.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    el.scout.classList.remove('pop');
    void el.scout.offsetWidth;
    el.scout.classList.add('pop');
}

/** The scouted card is spent the moment anything is drawn. */
function clearScout() {
    if (!game.scouted) return;
    game.scouted = null;
    renderScout();
}

/**
 * Every card leaves the shoe through here, so a scouted card is cleared no
 * matter who takes it — including the dealer drawing after you stand.
 */
function drawCard() {
    const card = game.deck.draw();
    clearScout();
    return card;
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

    let d = handTotal(game.dealer, game.dealerBoard).total;
    const p = handTotal(game.player, game.shared).total;

    while (d < DEALER_STANDS_ON) {
        setStatus(`Dealer shows ${d} and draws`, { thinking: true });
        await sleep(620);
        await dealTo(game.dealer, el.dealerCards, drawCard());
        updateTotals();
        d = handTotal(game.dealer, game.dealerBoard).total;
    }

    highlightLane(null);
    await sleep(420);

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
    let payout = 0;
    let detail = '';
    let perfect = false;
    let hot = false;

    if (outcome === 'win') {
        const nextStreak = game.streak + 1;
        perfect = playerTotal === 21;
        hot = nextStreak >= HOT_STREAK_AT;
        let profit = wager * (perfect ? PERFECT_MULTIPLIER : 1);
        if (hot) profit *= 1 + HOT_STREAK_BONUS;
        profit = Math.round(profit);
        payout = wager + profit;
        game.streak = nextStreak;
        game.wins += 1;
        detail = `+${money(profit)}`;
        if (perfect) detail += ' · 21 pays 3:2';
        if (hot) detail += ' · hot streak +25%';
    } else if (outcome === 'push') {
        payout = wager;
        detail = 'Bet returned';
    } else {
        game.streak = 0;
        detail = `−${money(wager)}`;
    }

    const challengeState = {
        outcome,
        mode: game.mode,
        playerTotal,
        moneyAction: game.moneyAction,
        raisedAtDraw: game.raisedAtDraw,
        boardBrokeDealer: game.boardBrokeDealer,
        privateLeft: game.privateLeft
    };
    const challengeWon = tableGoalComplete(game.challenge, challengeState);
    game.challengeCompleted = challengeWon;
    if (challengeWon) {
        payout += game.challenge.reward;
        detail += ` · table goal +${money(game.challenge.reward)}`;
    }
    const insight = decisionInsight({
        ...challengeState,
        challengeWon,
        challengeText: game.challenge ? game.challenge.text : '',
        drawsTaken: game.drawsTaken,
        bust
    });

    game.bankroll += payout;
    game.bet = 0;
    clearScout();
    game.hands += 1;
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
            hot,
            challengeWon,
            newPeak
        });
    } else {
        animateLossDrain(wager);
    }

    const splash = outcome === 'win' ? 'win' : bust ? 'bust' : outcome === 'push' ? 'tie' : 'lose';
    showSplash(splash, detail, insight, challengeWon);

    if (outcome === 'win') {
        confetti(playerTotal === 21 ? 160 : 90);
        playerTotal === 21 ? SFX.jackpot() : SFX.win();
    } else if (outcome === 'push') {
        SFX.push();
    } else if (!bust) {
        SFX.lose();
    }

    setStatus(message);

    setTimeout(() => {
        if (game.phase !== PHASE.OVER) return;
        game.phase = PHASE.BET;
        syncControls();
        if (game.bankroll === 0) {
            setStatus("You're tapped out. Take a rebuy and get back in.");
        } else {
            setStatus(game.streak >= HOT_STREAK_AT
                ? `${game.streak} in a row — the hot streak bonus is active.`
                : 'Place your bet — or tap Again.');
        }
    }, 2100);
}

function rebuy() {
    game.bankroll += REBUY;
    game.streak = 0;
    persist();
    updateMoney(true);
    flyMoney(`+${money(REBUY)}`);
    SFX.chip();
    syncControls();
    setStatus(`The house stakes you ${money(REBUY)}. Make it count.`);
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

    if (outcome === 'win') {
        setTimeout(() => {
            pulseReadout(el.streakBox, hot ? 'streak-hotter' : 'streak-earned');
            if (hot) sparkBurst(el.streakBox, '#ff9b50', 9);
        }, 420);
    }
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
    const src = { win: 'Win.png', lose: 'Lose.png', tie: 'Tie.png', bust: 'Bust.png' }[kind];
    const alt = { win: 'You win', lose: 'You lose', tie: 'Push', bust: 'You bust' }[kind];
    el.resultImage.src = `asset/${src}`;
    el.resultImage.alt = alt;
    el.resultPayout.textContent = detail || '';
    el.resultPayout.classList.toggle('negative', kind === 'lose' || kind === 'bust');
    el.resultInsight.textContent = insight;
    el.resultInsight.classList.toggle('goal-cleared', challengeWon);
    el.overlay.setAttribute('aria-hidden', 'false');
    el.overlay.classList.remove('hidden');
    // restart the CSS animation
    el.resultImage.style.animation = 'none';
    void el.resultImage.offsetWidth;
    el.resultImage.style.animation = '';
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
    const colors = ['#f2c76a', '#ffe6a8', '#46e08b', '#ff5a5a', '#8b5bd6', '#ffffff'];
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

/* ---- Wiring -------------------------------------------------------------- */

function updateStats() {
    el.statHands.textContent = game.hands;
    el.statWins.textContent = game.wins;
    el.statRate.textContent = game.hands ? Math.round((game.wins / game.hands) * 100) + '%' : '—';
    el.statBest.textContent = money(game.best);
}

let rulesReturnFocus = null;

function rulesFocusables() {
    return [...el.rulesModal.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
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
el.scoutBtn.addEventListener('click', playerScout);

el.modeSwitch.addEventListener('click', e => {
    const pick = e.target.closest('button[data-pick]');
    if (!pick || pick.disabled || pick.dataset.pick === game.mode) return;
    game.mode = pick.dataset.pick;
    persist();
    SFX.button();
    syncControls();
    updateTotals();
    setStatus(routed()
        ? "<b>Your Call</b> — you choose where every card lands."
        : "<b>Dealer's Call</b> — the dealer decides where your card lands.");
});

el.rulesBtn.addEventListener('click', openRules);
el.rulesClose.addEventListener('click', closeRules);
el.rulesGo.addEventListener('click', closeRules);
el.rulesModal.addEventListener('click', e => { if (e.target === el.rulesModal) closeRules(); });

el.soundBtn.addEventListener('click', () => { SFX.toggleMute(); syncSoundIcon(); });
el.overlay.addEventListener('click', hideOverlay);

document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'escape') { closeRules(); hideOverlay(); return; }
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
    else if (key === 'p') { if (!el.scoutBtn.disabled) playerScout(); }
    else if (key === 'enter' && !interactiveTarget) {
        e.preventDefault();
        if (!el.dealBtn.disabled) startRound();
        else if (game.phase === PHASE.BET && game.bankroll === 0) rebuy();
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

if (!persisted.seen) {
    openRules();
    game.seen = true;
    persist();
} else if (game.bankroll === 0) {
    setStatus('Out of chips — hit Rebuy to get back to the table.');
}
