/* ==========================================================================
   Texas Jack — audio.js
   Every sound is synthesised on the fly with the Web Audio API, so the game
   ships zero audio files and still has a full soundtrack of feedback.
   ========================================================================== */

const SFX = (() => {
    let ctx = null;
    let master = null;
    let muted = false;

    try { muted = localStorage.getItem('tj.muted') === '1'; }
    catch { /* Storage can be blocked while audio still remains available. */ }

    function ensure() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            try {
                ctx = new AC();
                master = ctx.createGain();
                master.gain.value = 0.5;
                master.connect(ctx.destination);
            } catch {
                ctx = null;
                master = null;
                return null;
            }
        }
        if (ctx.state === 'suspended') {
            const resumed = ctx.resume();
            if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
        }
        return ctx;
    }

    function noiseBuffer(seconds) {
        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        return buf;
    }

    /** Short filtered noise burst — paper, chips, thuds. */
    function burst({ dur = 0.14, type = 'bandpass', freq = 1800, q = 1.2, gain = 0.35, sweep = 0, delay = 0 }) {
        if (!ensure() || muted) return;
        const t0 = ctx.currentTime + delay;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(dur);
        const filt = ctx.createBiquadFilter();
        filt.type = type;
        filt.frequency.setValueAtTime(freq, t0);
        if (sweep) filt.frequency.exponentialRampToValueAtTime(Math.max(80, freq + sweep), t0 + dur);
        filt.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(filt).connect(g).connect(master);
        src.start(t0);
        src.stop(t0 + dur);
    }

    /** Pitched blip — melodies, stingers. */
    function tone({ freq = 440, dur = 0.18, type = 'triangle', gain = 0.22, delay = 0, glide = 0 }) {
        if (!ensure() || muted) return;
        const t0 = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, glide), t0 + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g).connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    const api = {
        get muted() { return muted; },
        toggleMute() {
            muted = !muted;
            try { localStorage.setItem('tj.muted', muted ? '1' : '0'); }
            catch { /* Keep the in-memory preference for this session. */ }
            if (!muted) api.chip();
            return muted;
        },
        unlock() { ensure(); },

        deal()  { burst({ dur: 0.13, freq: 2600, q: 0.8, gain: 0.28, sweep: -1800 }); },
        flip()  { burst({ dur: 0.10, freq: 3400, q: 1.4, gain: 0.20, sweep: -2200 }); },
        chip()  {
            burst({ dur: 0.05, freq: 5200, q: 3, gain: 0.16 });
            tone({ freq: 1180, dur: 0.06, type: 'square', gain: 0.05, delay: 0.01 });
        },
        button() { tone({ freq: 520, dur: 0.07, type: 'sine', gain: 0.10 }); },
        counter() {
            tone({ freq: 196, dur: 0.22, type: 'sawtooth', gain: 0.10 });
            tone({ freq: 293.66, dur: 0.28, type: 'triangle', gain: 0.16, delay: 0.12 });
            burst({ dur: 0.16, freq: 1800, q: 2.2, gain: 0.16, sweep: -900 });
        },

        /* Betting: a knuckle rap for check, a short chip stack for call, a
           heavier double stack for bet or raise, a soft card slide for fold. */
        check() {
            burst({ dur: 0.07, type: 'lowpass', freq: 420, q: 0.9, gain: 0.34 });
            burst({ dur: 0.06, type: 'lowpass', freq: 380, q: 0.9, gain: 0.26, delay: 0.09 });
        },
        call() {
            [0, 0.05, 0.1].forEach(d => burst({ dur: 0.045, freq: 5000 - d * 4000, q: 3, gain: 0.14, delay: d }));
        },
        bet() {
            [0, 0.04, 0.08, 0.14, 0.18].forEach(d => burst({ dur: 0.05, freq: 4600 - d * 3000, q: 3, gain: 0.17, delay: d }));
            tone({ freq: 220, dur: 0.12, type: 'triangle', gain: 0.08, delay: 0.2 });
        },
        fold() {
            burst({ dur: 0.22, type: 'bandpass', freq: 1400, q: 0.7, gain: 0.18, sweep: -900 });
        },

        win() {
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
                tone({ freq: f, dur: 0.34, type: 'triangle', gain: 0.20, delay: i * 0.085 }));
            tone({ freq: 1567.98, dur: 0.5, type: 'sine', gain: 0.12, delay: 0.36 });
        },
        lose() {
            [392, 349.23, 293.66].forEach((f, i) =>
                tone({ freq: f, dur: 0.3, type: 'sawtooth', gain: 0.11, delay: i * 0.11 }));
        },
        push() {
            tone({ freq: 440, dur: 0.2, type: 'triangle', gain: 0.14 });
            tone({ freq: 440, dur: 0.26, type: 'triangle', gain: 0.12, delay: 0.16 });
        },
        bust() {
            tone({ freq: 200, dur: 0.42, type: 'sawtooth', gain: 0.16, glide: 62 });
            burst({ dur: 0.3, type: 'lowpass', freq: 700, gain: 0.24, sweep: -500 });
        },
        jackpot() {
            [659.25, 830.61, 987.77, 1318.5, 1661.2].forEach((f, i) =>
                tone({ freq: f, dur: 0.3, type: 'square', gain: 0.10, delay: i * 0.06 }));
        }
    };

    return api;
})();

window.SFX = SFX;
