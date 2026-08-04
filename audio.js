/* ==========================================================================
   Texas Jack — audio.js
   Every sound is synthesised on the fly with the Web Audio API, so the game
   ships zero audio files and still has a full soundtrack of feedback.
   ========================================================================== */

const SFX = (() => {
    let ctx = null;
    let master = null;
    let muted = localStorage.getItem('tj.muted') === '1';

    function ensure() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = 0.5;
            master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
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
    function burst({ dur = 0.14, type = 'bandpass', freq = 1800, q = 1.2, gain = 0.35, sweep = 0 }) {
        if (!ensure() || muted) return;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(dur);
        const filt = ctx.createBiquadFilter();
        filt.type = type;
        filt.frequency.setValueAtTime(freq, ctx.currentTime);
        if (sweep) filt.frequency.exponentialRampToValueAtTime(Math.max(80, freq + sweep), ctx.currentTime + dur);
        filt.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
        src.connect(filt).connect(g).connect(master);
        src.start();
        src.stop(ctx.currentTime + dur);
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
            localStorage.setItem('tj.muted', muted ? '1' : '0');
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
