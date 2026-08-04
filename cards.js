/* ==========================================================================
   Texas Jack — cards.js
   A self-contained deck: no network, no image requests. Every card face is
   drawn as inline SVG so it stays razor sharp at any size and works offline.
   ========================================================================== */

(() => {
'use strict';

    const SUITS = [
        { key: 'S', name: 'Spades',   glyph: '♠', red: false },
        { key: 'H', name: 'Hearts',   glyph: '♥', red: true  },
        { key: 'D', name: 'Diamonds', glyph: '♦', red: true  },
        { key: 'C', name: 'Clubs',    glyph: '♣', red: false }
    ];

    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    /* ---- Suit geometry, authored in a 100x100 box ---------------------------- */

    const SHAPE = {
        H: '<path d="M50 90 C50 90 10 62 10 37 C10 22 21 12 34 12 C42 12 47 16 50 23 C53 16 58 12 66 12 C79 12 90 22 90 37 C90 62 50 90 50 90 Z"/>',
        D: '<path d="M50 6 C58 27 71 41 90 50 C71 59 58 73 50 94 C42 73 29 59 10 50 C29 41 42 27 50 6 Z"/>',
        S: '<path d="M50 8 C50 8 12 37 12 57 C12 69 21 77 32 77 C40 77 46 73 50 67 C54 73 60 77 68 77 C79 77 88 69 88 57 C88 37 50 8 50 8 Z"/>' +
           '<path d="M50 62 C50 78 45 89 35 96 L65 96 C55 89 50 78 50 62 Z"/>',
        C: '<circle cx="50" cy="26" r="19"/><circle cx="26" cy="60" r="19"/><circle cx="74" cy="60" r="19"/>' +
           '<path d="M50 55 C50 74 45 89 35 96 L65 96 C55 89 50 74 50 55 Z"/>'
    };

    /** Suit mark placed with its top-left corner at (x, y), sized `size` px. */
    function suitMark(suitKey, x, y, size, attrs = '') {
        const s = size / 100;
        return `<g transform="translate(${r(x)},${r(y)}) scale(${r(s, 4)})" ${attrs}>${SHAPE[suitKey]}</g>`;
    }

    /** Suit mark centred on (cx, cy). */
    function suitAt(suitKey, cx, cy, size, rotated = false) {
        const half = size / 2;
        const spin = rotated ? `transform="rotate(180 ${r(cx)} ${r(cy)})"` : '';
        return `<g ${spin}>${suitMark(suitKey, cx - half, cy - half, size)}</g>`;
    }

    const r = (n, p = 2) => Number(n.toFixed(p));

    /* ---- Classic pip layouts -------------------------------------------------
       x: 0 = left column, 1 = right column, 0.5 = centre column
       y: 0 = top of the pip field … 1 = bottom.  Pips below the midline are
       rotated 180°, exactly like a real deck.                                    */

    const PIPS = {
        '2':  [[.5, 0], [.5, 1]],
        '3':  [[.5, 0], [.5, .5], [.5, 1]],
        '4':  [[0, 0], [1, 0], [0, 1], [1, 1]],
        '5':  [[0, 0], [1, 0], [.5, .5], [0, 1], [1, 1]],
        '6':  [[0, 0], [1, 0], [0, .5], [1, .5], [0, 1], [1, 1]],
        '7':  [[0, 0], [1, 0], [.5, .25], [0, .5], [1, .5], [0, 1], [1, 1]],
        '8':  [[0, 0], [1, 0], [.5, .25], [0, .5], [1, .5], [.5, .75], [0, 1], [1, 1]],
        '9':  [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [.5, .5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
        '10': [[0, 0], [1, 0], [.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [.5, 5 / 6], [0, 1], [1, 1]]
    };

    const CARD_W = 240;
    const CARD_H = 336;

    /* ---- Card face ----------------------------------------------------------- */

    function cardFaceSVG(card) {
        const suit = SUITS.find(s => s.key === card.suit);
        const ink = suit.red ? '#c8102e' : '#1b1b1f';
        const rank = card.rank;
        let body = '';

        if (rank === 'A') {
            body = `
          <circle cx="120" cy="168" r="72" fill="none" stroke="#b98f3e" stroke-width="2" opacity=".55"/>
          <circle cx="120" cy="168" r="62" fill="none" stroke="#b98f3e" stroke-width="1" opacity=".35"/>
          ${suitAt(card.suit, 120, 168, 96)}`;
        } else if (rank === 'J' || rank === 'Q' || rank === 'K') {
            body = courtPanel(rank, card.suit);
        } else {
            // Denser ranks get smaller pips so nine and ten never crowd.
            const n = parseInt(rank, 10);
            const size = n <= 5 ? 50 : n <= 8 ? 44 : 38;
            const x0 = 74, x1 = 166, xc = 120;
            const y0 = 80, y1 = 256;
            body = PIPS[rank].map(([px, py]) => {
                const cx = px === 0 ? x0 : px === 1 ? x1 : xc;
                const cy = y0 + (y1 - y0) * py;
                return suitAt(card.suit, cx, cy, size, py > .5);
            }).join('');
        }

        return `
    <svg class="card-svg" viewBox="0 0 ${CARD_W} ${CARD_H}" xmlns="http://www.w3.org/2000/svg" role="img"
         aria-label="${rank} of ${suit.name}">
      <defs>
        <linearGradient id="cf-${card.id}" x1="0" y1="0" x2=".6" y2="1">
          <stop offset="0%" stop-color="#fffefb"/><stop offset="55%" stop-color="#fdfaf3"/><stop offset="100%" stop-color="#f2ece0"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${CARD_W}" height="${CARD_H}" rx="18" fill="url(#cf-${card.id})"/>
      <rect x="5" y="5" width="${CARD_W - 10}" height="${CARD_H - 10}" rx="14"
            fill="none" stroke="rgba(20,16,10,.10)" stroke-width="1.5"/>
      <g fill="${ink}">
        <g class="corner">
          <text x="26" y="52" font-size="44" font-weight="700" text-anchor="middle"
                font-family="Georgia, 'Times New Roman', serif" letter-spacing="-1">${rank}</text>
          ${suitMark(card.suit, 14, 62, 25)}
        </g>
        <g class="corner" transform="rotate(180 120 168)">
          <text x="26" y="52" font-size="44" font-weight="700" text-anchor="middle"
                font-family="Georgia, 'Times New Roman', serif" letter-spacing="-1">${rank}</text>
          ${suitMark(card.suit, 14, 62, 25)}
        </g>
        ${body}
      </g>
    </svg>`;
    }

    /**
     * Ornate centre panel for J / Q / K. The motif is repeated rotated 180°
     * so the card reads the same either way up, like a real court card.
     */
    function courtPanel(rank, suitKey) {
        // Each crest is authored around (120, 96) and mirrored to (120, 240).
        const crest = {
            K: '<path d="M92 106 L98 82 L110 98 L120 76 L130 98 L142 82 L148 106 Z"/>' +
               '<rect x="92" y="108" width="56" height="9" rx="2"/>' +
               '<circle cx="98" cy="78" r="4"/><circle cx="120" cy="72" r="4"/><circle cx="142" cy="78" r="4"/>',
            Q: '<path d="M94 108 C94 86 105 76 120 76 C135 76 146 86 146 108 Z"/>' +
               '<rect x="94" y="110" width="52" height="8" rx="2"/>' +
               '<circle cx="120" cy="69" r="5"/>',
            J: '<path d="M120 72 C132 86 138 94 138 104 C138 111 132 116 126 113 L120 108 L114 113 ' +
               'C108 116 102 111 102 104 C102 94 108 86 120 72 Z"/>' +
               '<rect x="102" y="112" width="36" height="7" rx="2"/>'
        }[rank];

        return `
        <rect x="34" y="58" width="172" height="220" rx="12" fill="rgba(255,255,255,.5)"
              stroke="#b98f3e" stroke-width="2"/>
        <rect x="41" y="65" width="158" height="206" rx="8" fill="none"
              stroke="#b98f3e" stroke-width="1" opacity=".45"/>
        <g opacity=".07">${suitAt(suitKey, 120, 168, 150)}</g>
        <g fill="#b98f3e">${crest}</g>
        <g fill="#b98f3e" transform="rotate(180 120 168)">${crest}</g>
        <text x="120" y="200" font-size="96" font-weight="700" text-anchor="middle"
              font-family="Georgia, 'Times New Roman', serif">${rank}</text>
        ${suitAt(suitKey, 64, 168, 34)}
        ${suitAt(suitKey, 176, 168, 34, true)}`;
    }

    /* ---- Card back ----------------------------------------------------------- */

    function cardBackSVG() {
        return `
    <svg class="card-svg" viewBox="0 0 ${CARD_W} ${CARD_H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="cb-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#8f1524"/><stop offset="50%" stop-color="#6d0f1b"/><stop offset="100%" stop-color="#4a0912"/>
        </linearGradient>
        <pattern id="cb-lattice" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M12 0 V24 M0 12 H24" stroke="rgba(255,215,140,.22)" stroke-width="1.4"/>
          <circle cx="12" cy="12" r="2.6" fill="rgba(255,215,140,.28)"/>
        </pattern>
      </defs>
      <rect width="${CARD_W}" height="${CARD_H}" rx="18" fill="#fdfaf3"/>
      <rect x="7" y="7" width="${CARD_W - 14}" height="${CARD_H - 14}" rx="13" fill="url(#cb-grad)"/>
      <rect x="7" y="7" width="${CARD_W - 14}" height="${CARD_H - 14}" rx="13" fill="url(#cb-lattice)"/>
      <rect x="18" y="18" width="${CARD_W - 36}" height="${CARD_H - 36}" rx="9"
            fill="none" stroke="rgba(255,215,140,.55)" stroke-width="2"/>
      <g transform="translate(120 168)">
        <circle r="52" fill="rgba(20,4,8,.45)" stroke="rgba(255,215,140,.7)" stroke-width="2"/>
        <circle r="43" fill="none" stroke="rgba(255,215,140,.35)" stroke-width="1"/>
        <text y="14" font-size="42" font-weight="700" text-anchor="middle"
              font-family="Georgia, 'Times New Roman', serif" fill="rgba(255,215,140,.92)" letter-spacing="1">TJ</text>
      </g>
    </svg>`;
    }

    /* ---- Deck ---------------------------------------------------------------- */

    let CARD_SEQ = 0;

    class Deck {
        constructor(deckCount = 1) {
            this.deckCount = deckCount;
            this.cards = [];
            this.reset();
        }

        reset() {
            this.cards = [];
            for (let d = 0; d < this.deckCount; d++) {
                for (const suit of SUITS) {
                    for (const rank of RANKS) {
                        this.cards.push({ rank, suit: suit.key, red: suit.red, id: ++CARD_SEQ });
                    }
                }
            }
            this.shuffle();
        }

        /** Fisher–Yates with crypto-grade randomness so the shuffle is genuinely fair. */
        shuffle() {
            const n = this.cards.length;
            const rnd = new Uint32Array(n);
            (self.crypto || self.msCrypto).getRandomValues(rnd);
            for (let i = n - 1; i > 0; i--) {
                const j = rnd[i] % (i + 1);
                [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
            }
        }

        draw() {
            if (this.cards.length === 0) this.reset();
            return this.cards.pop();
        }

        get remaining() { return this.cards.length; }
    }

    /* ---- Hand values --------------------------------------------------------- */

    function cardValue(card) {
        if (card.rank === 'A') return 11;
        if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') return 10;
        return parseInt(card.rank, 10);
    }

    /**
     * Best total for a set of cards, plus whether an ace is still counting as 11
     * (a "soft" hand) — useful for the HUD.
     */
    function handTotal(...groups) {
        let total = 0, aces = 0;
        for (const group of groups) {
            for (const card of group) {
                if (!card) continue;
                total += cardValue(card);
                if (card.rank === 'A') aces++;
            }
        }
        while (total > 21 && aces > 0) { total -= 10; aces--; }
        return { total, soft: aces > 0 && total <= 21 };
    }

    window.TJCards = { SUITS, RANKS, Deck, cardFaceSVG, cardBackSVG, cardValue, handTotal };
})();
