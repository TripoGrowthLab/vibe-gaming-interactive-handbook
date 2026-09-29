// Bridge for the tutorial page that embeds the game in an iframe (window.postMessage, version 1).
//   page → game: { v: 1, type: 'set-mode', mode: 'grey' | 'real' }
//   game → page: { v: 1, type: 'ready', mode, modes }   once both looks can be shown
//                { v: 1, type: 'mode-changed', mode }  after a look is on screen (also for in-game switches)
//                { v: 1, type: 'error', message }
// Messages are accepted only from the parent window on a trusted origin, and replies go only to that origin.
// Outside an iframe this does nothing.

const TRUSTED = [
  /^https:\/\/www\.tripo3d\.ai$/,
  /^https:\/\/tripo3d\.ai$/,
  /^http:\/\/localhost(:\d{1,5})?$/,
  /^http:\/\/127\.0\.0\.1(:\d{1,5})?$/,
];
export const isTrustedOrigin = (o) => typeof o === 'string' && TRUSTED.some((re) => re.test(o));

const TO_GAME = { grey: 'greybox', real: 'model' };
const TO_PAGE = { greybox: 'grey', model: 'real' };

// look: { get() → 'greybox'|'model', set(m) → mode actually applied, canSwitch() → bool }
export function setupEmbed(look) {
  const state = { embedded: false, parentOrigin: null, ready: false, pending: null, sent: [] };
  let embedded = false;
  try { embedded = window.parent !== window; } catch { embedded = true; }
  if (!embedded) return { state, notifyReady() {}, notifyChanged() {} };
  state.embedded = true;

  // Where to reply before the page has written to us: the parent's origin as the browser reports it.
  const guess = window.location.ancestorOrigins?.[0] ?? (() => { try { return new URL(document.referrer).origin; } catch { return null; } })();
  if (isTrustedOrigin(guess)) state.parentOrigin = guess;

  const send = (msg) => {
    if (!state.parentOrigin) return; // never '*': wait until we know a trusted parent origin
    window.parent.postMessage({ v: 1, ...msg }, state.parentOrigin);
    state.sent.push({ ...msg });
  };
  // Report a look only once a frame showing it has been drawn.
  const afterFrame = (fn) => {
    let done = false;
    const run = () => { if (!done) { done = true; fn(); } };
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 250); // hidden/throttled iframes may not animate
  };
  const pageMode = () => TO_PAGE[look.get()];
  const readyMsg = () => ({ type: 'ready', mode: pageMode(), modes: look.canSwitch() ? ['grey', 'real'] : ['grey'] });

  function apply(mode) {
    if (!(mode in TO_GAME)) return send({ type: 'error', message: `unknown mode "${String(mode)}" (expected "grey" or "real")` });
    if (mode === 'real' && !look.canSwitch()) return send({ type: 'error', message: 'switch failed: the 3D models are not loaded' });
    const applied = look.set(TO_GAME[mode]);
    if (applied !== TO_GAME[mode]) return send({ type: 'error', message: `switch failed: the game is showing "${TO_PAGE[applied]}"` });
    afterFrame(() => send({ type: 'mode-changed', mode: pageMode() }));
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !isTrustedOrigin(e.origin)) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.v !== 1) return; // not for us
    const firstContact = !state.parentOrigin;
    state.parentOrigin = e.origin;
    if (firstContact && state.ready) send(readyMsg());
    if (d.type !== 'set-mode') return send({ type: 'error', message: `unknown message type "${String(d.type)}"` });
    if (!state.ready) { state.pending = d.mode; return; } // applied right after "ready"
    apply(d.mode);
  });

  return {
    state,
    // Call once the looks can be switched (models loaded), or once loading has finished without them.
    notifyReady() {
      if (state.ready) return;
      afterFrame(() => {
        state.ready = true;
        send(readyMsg());
        if (state.pending !== null) { const m = state.pending; state.pending = null; apply(m); }
      });
    },
    // Call after the player switched the look inside the game.
    notifyChanged() {
      if (state.ready) afterFrame(() => send({ type: 'mode-changed', mode: pageMode() }));
    },
  };
}
