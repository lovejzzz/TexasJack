/* ==========================================================================
   Texas Jack — game.js
   Blackjack's race to 21 played on a Hold'em board.
   ========================================================================== */

const { Deck, cardFaceSVG, cardBackSVG, handTotal } = window.TJCards;

/* ---- DOM ----------------------------------------------------------------- */

const $ = id => document.getElementById(id);

const el = {
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
    hitBtn: $('hitBtn'),
    standBtn: $('standBtn'),
    doubleBtn: $('doubleBtn'),
    overlay: $('resultOverlay'),
    resultImage: $('resultImage'),
    resultPayout: $('resultPayout'),
    rulesModal: $('rulesModal'),
    rulesBtn: $('rulesBtn'),
    rulesClose: $('rulesClose'),
    rulesGo: $('rulesGo'),
    soundBtn: $('soundBtn'),
    soundIcon: $('soundIcon'),
    fx: $('fx'),
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
    phase: PHASE.BET,
    bankroll: Number.isFinite(persisted.bankroll) ? persisted.bankroll : START_BANK,
    bet: 0,
    lastBet: persisted.lastBet || 0,
    streak: persisted.streak || 0,
    doubled: false,
    actedOnce: false,
    dealerRevealed: false,
    hands: persisted.hands || 0,
    wins: persisted.wins || 0,
    best: persisted.best || (Number.isFinite(persisted.bankroll) ? persisted.bankroll : START_BANK),
    seen: !!persisted.seen
};

function persist() {
    save.write({
        bankroll: game.bankroll,
        lastBet: game.lastBet,
        streak: game.streak,
        hands: game.hands,
        wins: game.wins,
        best: game.best,
        seen: game.seen
    });
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

/* ---- Rendering ----------------------------------------------------------- */

function makeCardEl(card, faceDown) {
    const node = document.createElement('div');
    node.className = 'card' + (faceDown ? ' face-down' : '');
    node.dataset.cid = card.id;
    node.innerHTML =
        `<div class="card-inner">
             <div class="card-face front">${cardFaceSVG(card)}</div>
             <div class="card-face back">${cardBackSVG()}</div>
         </div>`;
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
    const node = makeCardEl(card, true);
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

/** Long hands fan into each other rather than running off the felt. */
function reflow(container) {
    const n = container.children.length;
    container.style.setProperty('--overlap', n > 6 ? Math.min(0.5, (n - 6) * 0.11) : 0);
}

function clearTable() {
    el.dealerCards.innerHTML = '';
    el.sharedCards.innerHTML = '';
    el.playerCards.innerHTML = '';
}

function revealDealer() {
    game.dealerRevealed = true;
    const hidden = el.dealerCards.querySelectorAll('.card.face-down');
    hidden.forEach((node, i) => setTimeout(() => {
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

function updateTotals() {
    const inPlay = game.player.length > 0;

    const p = handTotal(game.player, game.shared);
    setPill(el.playerTotal,
        inPlay ? (p.soft && p.total !== 21 ? `${p.total} soft` : p.total) : '—',
        pillState(p.total, inPlay));

    const d = handTotal(game.dealer, game.shared);
    const dealerOpen = game.dealerRevealed;
    setPill(el.dealerTotal,
        !inPlay ? '—' : dealerOpen ? d.total : '?',
        pillState(d.total, inPlay && dealerOpen));
}

function updateShoe() {
    el.shoeCount.textContent = game.deck.remaining;
}

function money(n) { return '$' + n.toLocaleString('en-US'); }

function updateMoney(bump = false) {
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
    el.hitBtn.disabled = !playing;
    el.standBtn.disabled = !playing;
    el.doubleBtn.disabled = !playing || game.actedOnce || game.bankroll < game.bet;

    el.dealBtn.textContent = betting && broke ? 'Rebuy' : 'Deal';
    if (!el.dealBtn.querySelector('kbd')) {
        const k = document.createElement('kbd');
        k.textContent = '↵';
        el.dealBtn.appendChild(k);
    }
}

/* ---- Betting ------------------------------------------------------------- */

function addToBet(amount) {
    if (game.phase !== PHASE.BET) return;
    const wager = Math.min(amount, game.bankroll);
    if (wager <= 0) return;
    game.bankroll -= wager;
    game.bet += wager;
    SFX.chip();
    updateMoney();
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
    game.doubled = false;
    game.actedOnce = false;
    game.dealerRevealed = false;
    game.deck.reset();

    clearTable();
    hideOverlay();
    syncControls();
    updateShoe();
    setStatus('Dealing…');

    await dealTo(game.player, el.playerCards, game.deck.draw());
    await dealTo(game.dealer, el.dealerCards, game.deck.draw(), { faceDown: true });
    await dealTo(game.shared, el.sharedCards, game.deck.draw());

    game.phase = PHASE.PLAYER;
    updateTotals();
    syncControls();
    highlightLane('player');

    const p = handTotal(game.player, game.shared);
    if (p.total === 21) {
        setStatus('Twenty-one off the deal. Stand and take it?');
    } else {
        setStatus('Your move — <b>Hit</b>, <b>Stand</b>, or <b>Double</b>.');
    }
}

async function playerHit({ fromDouble = false } = {}) {
    if (game.phase !== PHASE.PLAYER) return;

    game.phase = PHASE.RESOLVING;
    game.actedOnce = true;
    syncControls();
    highlightLane(null);

    const card = game.deck.draw();
    const dealerBefore = handTotal(game.dealer, game.shared).total;
    const dealerHitsToo = dealerBefore < DEALER_STANDS_ON;

    setStatus('You call for a card — the dealer weighs it', { thinking: true });
    await sleep(760);

    if (dealerHitsToo) {
        setStatus('Dealer takes one too — <b>this card is shared</b>.');
        SFX.button();
        await sleep(520);
        highlightLane('shared');
        const node = await dealTo(game.shared, el.sharedCards, card);
        node.classList.add('shared-jump');
    } else {
        setStatus(`Dealer stands on ${dealerBefore}+ — <b>the card is yours alone</b>.`);
        SFX.button();
        await sleep(520);
        highlightLane('player');
        await dealTo(game.player, el.playerCards, card);
    }

    await sleep(260);
    highlightLane(null);

    const p = handTotal(game.player, game.shared).total;
    const d = handTotal(game.dealer, game.shared).total;

    if (p > 21 && d > 21) return finish('push', 'That card broke you both — push.');
    if (p > 21) {
        markBust(el.playerCards);
        return finish('lose', `You bust with ${p}.`, { bust: true });
    }
    if (d > 21) {
        await revealDealer();
        markBust(el.dealerCards);
        return finish('win', `The shared card busted the dealer at ${d}!`);
    }

    if (fromDouble) {
        setStatus('Doubled — standing pat.');
        await sleep(600);
        return dealerPlay();
    }

    if (p === 21) {
        setStatus('Twenty-one! Stand and lock it in?');
    } else {
        setStatus('Your move.');
    }
    game.phase = PHASE.PLAYER;
    highlightLane('player');
    syncControls();
}

async function playerDouble() {
    if (game.phase !== PHASE.PLAYER || game.actedOnce || game.bankroll < game.bet) return;
    game.bankroll -= game.bet;
    game.bet *= 2;
    game.doubled = true;
    SFX.chip();
    updateMoney(true);
    setStatus(`Doubled to <b>${money(game.bet)}</b> — one card only.`);
    await sleep(420);
    await playerHit({ fromDouble: true });
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

    let d = handTotal(game.dealer, game.shared).total;
    const p = handTotal(game.player, game.shared).total;

    while (d < DEALER_STANDS_ON) {
        setStatus(`Dealer shows ${d} and draws`, { thinking: true });
        await sleep(620);
        await dealTo(game.dealer, el.dealerCards, game.deck.draw());
        updateTotals();
        d = handTotal(game.dealer, game.shared).total;
    }

    highlightLane(null);
    await sleep(420);

    if (d > 21) {
        markBust(el.dealerCards);
        return finish('win', `Dealer busts with ${d}. The hand is yours.`);
    }
    if (p > 21) {
        markBust(el.playerCards);
        return finish('lose', `You're over at ${p}.`, { bust: true });
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
    let payout = 0;
    let detail = '';

    if (outcome === 'win') {
        const perfect = playerTotal === 21;
        const hot = game.streak >= HOT_STREAK_AT;
        let profit = wager * (perfect ? PERFECT_MULTIPLIER : 1);
        if (hot) profit *= 1 + HOT_STREAK_BONUS;
        profit = Math.round(profit);
        payout = wager + profit;
        game.streak += 1;
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

    game.bankroll += payout;
    game.bet = 0;
    game.hands += 1;
    game.best = Math.max(game.best, game.bankroll);
    persist();
    updateMoney(payout > 0);

    if (payout > wager) flyMoney(`+${money(payout - wager)}`);
    else if (outcome === 'lose') flyMoney(`−${money(wager)}`, true);

    const splash = outcome === 'win' ? 'win' : bust ? 'bust' : outcome === 'push' ? 'tie' : 'lose';
    showSplash(splash, detail);

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
                ? `${game.streak} in a row — next win carries a 25% bonus.`
                : 'Place your bet for the next hand.');
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

function showSplash(kind, detail) {
    const src = { win: 'Win.png', lose: 'Lose.png', tie: 'Tie.png', bust: 'Bust.png' }[kind];
    el.resultImage.src = `asset/${src}`;
    el.resultImage.alt = kind;
    el.resultPayout.textContent = detail || '';
    el.resultPayout.classList.toggle('negative', kind === 'lose' || kind === 'bust');
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

function openRules() { updateStats(); el.rulesModal.classList.remove('hidden'); }
function closeRules() { el.rulesModal.classList.add('hidden'); }

function syncSoundIcon() {
    el.soundIcon.textContent = SFX.muted ? '🔇' : '🔊';
    el.soundBtn.setAttribute('aria-pressed', String(!SFX.muted));
}

el.chips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip && !chip.disabled) addToBet(Number(chip.dataset.value));
});
el.clearBet.addEventListener('click', clearBet);
el.maxBet.addEventListener('click', () => addToBet(game.bankroll));
el.rebet.addEventListener('click', () => {
    clearBet();
    addToBet(game.lastBet);
});

el.dealBtn.addEventListener('click', startRound);
el.hitBtn.addEventListener('click', () => playerHit());
el.standBtn.addEventListener('click', playerStand);
el.doubleBtn.addEventListener('click', playerDouble);

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
    if (!el.rulesModal.classList.contains('hidden')) return;

    if (key === 'h') { if (!el.hitBtn.disabled) playerHit(); }
    else if (key === 's') { if (!el.standBtn.disabled) playerStand(); }
    else if (key === 'd') { if (!el.doubleBtn.disabled) playerDouble(); }
    else if (key === 'enter' || key === ' ') {
        e.preventDefault();
        if (!el.dealBtn.disabled) startRound();
        else if (game.phase === PHASE.BET && game.bankroll === 0) rebuy();
    }
    else if (key === 'm') { SFX.toggleMute(); syncSoundIcon(); }
    else if (key === 'r') { openRules(); }
    else if (key >= '1' && key <= '4') {
        const chip = el.chips.querySelectorAll('.chip')[Number(key) - 1];
        if (chip && !chip.disabled) addToBet(Number(chip.dataset.value));
    }
});

['pointerdown', 'keydown'].forEach(evt =>
    window.addEventListener(evt, () => SFX.unlock(), { once: true }));

window.addEventListener('resize', sizeCanvas);

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
