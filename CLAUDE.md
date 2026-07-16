# CLAUDE.md — D&D Initiative Roller

Multi-device D&D 5e initiative tracker with real-time Firebase sync. Used by a DM
running live combat across tablets, TVs, and phones simultaneously.

## Tech stack & architecture

Pure static site — **no npm, no build step, no framework**. Do not introduce any.

- `index.html` — all markup and modals; also contains the **Firebase config and SDK
  initialization** (bottom `<script type="module">` block, exposes `window.firebase*`
  globals). Note: README says the config is in app.js — it is actually here.
- `app.js` — all application logic (~2,100 lines), loaded as a classic (non-module)
  script. Top-level `function` declarations are intentionally global because inline
  `onclick=""` handlers in generated HTML call them.
- `styles.css` — all styling: dark theme (default) + light theme
  (`body[data-theme="light"]`), colorblind mode (`body[data-vision="colorblind"]`),
  responsive breakpoints, dynamic-scaling CSS variables (`--item-gap`, `--name-size`, …).
- `firebase.json` — Firebase Hosting config.
- `FIREBASE_RULES.txt` — Realtime Database security rules reference.
- `check_firebase_data.py` / `cleanup_firebase_database.py` — one-off maintenance
  scripts that talk to the Realtime DB via REST.
- Historical `backup_*/` snapshot folders were removed from the repo (2026-07-15);
  they remain available in git history if ever needed.

## Running & verifying

No tests exist. Verification is manual, in a browser:

```
python -m http.server 8000    # from repo root, then open http://localhost:8000
```

Password gate: `APP_PASSWORD` in `app.js` (currently `[REDACTED]`). The app needs the
real Firebase backend (anonymous auth + Realtime DB) to get past login — there is no
offline/mock mode. Deploy with `firebase deploy` (Firebase Hosting).

## Core domain model

Combatant object (created in `addCombatant()` / `savePartyMember()` /
`duplicateCombatant()`, defaulted on load in `loadFromFirebase()`):

```javascript
{
    id: number,                  // Date.now() at creation
    name: string,
    dex: number,                 // dexterity portion of the initiative bonus
    modifier: number,            // misc modifier portion
    type: 'party' | 'enemy' | 'friendly',   // NOTE: 'friendly' (UI label "Ally") — never 'ally'
    advantage: 'normal' | 'advantage' | 'disadvantage',
    initiative: number,          // baseRoll + dex + modifier
    baseRoll: number,            // the d20 result actually used
    rolls: number[],             // all dice shown (2 entries for adv/dis or a Lucky reroll)
    lucky: 'halfling' | 'feat' | null,   // halfling = auto-reroll nat 1s; feat = manual button
    luckyReroll: number | null,  // original 1 when a Lucky reroll happened (drives the indicator)
    luckyUsed: boolean,          // Lucky Feat spent this round
    initiativeBonus: number,     // dex + modifier, stored for display
    manualOrder: number | null,  // set by drag-and-drop; overrides initiative sort
    wasMoved: boolean,           // drag-moved away from rolled position
    moveDirection: 'up' | 'down' | null,
    originalIndex: number | null // position right after the roll, before manual moves
}
```

Firebase layout: `campaigns/{campaignId}/meta` (`name`, `lastUpdated`) and
`campaigns/{campaignId}/data` (`combatants`, `currentRound`, `initiativeHistory`,
`lastUpdated`). Campaign IDs are slugs derived from the name in `createCampaign()`.

## Key mechanics (D&D 5e)

- Initiative = d20 + dex + modifier. Advantage/disadvantage rolls 2d20 keep
  highest/lowest. Dice logic is centralized: `rollInitiativeDice(advantage)`,
  `rerollNatOneDie(advantage, rolls)`, `rollSingleInitiative(combatant)`.
- Halfling Lucky: automatic reroll of a natural 1 inside `rollSingleInitiative()`.
  Lucky Feat: `rerollLuckyFeat(id)` — a button rendered only when
  `lucky === 'feat' && baseRoll === 1 && !luckyUsed`; once per round. Both reroll
  ONLY the die that showed 1 (RAW): under advantage/disadvantage the other die is
  kept and max/min re-applied.
- All ordering (live display, history modal, drag-drop position math) uses the one
  `initiativeComparator()`: manualOrder → initiative → higher dex →
  party < friendly < enemy.
- `rollAllInitiative()` (Re-roll / Next Round / Reset buttons only) rerolls everyone,
  clears manual ordering, sets `originalIndex`, snapshots to history (max 20), renders.
- Add/duplicate/edit/toggle-advantage call `rollNewCombatant(c)` — only that
  combatant rolls; other rolls and the DM's manual ordering are untouched.
  `repositionCombatant(c)` slots a changed card into the spot its new initiative
  deserves even when everyone is pinned by `manualOrder` (drag active) — Lucky feat
  rerolls use it too, so a 1 → 14 reroll physically moves the card. Remove/clear
  never reroll.
- History: `saveToHistory()` pushes a snapshot on full rolls;
  `updateHistoryForCurrentRound()` amends the current round's entry (drag reorders,
  Lucky feat) so history stays one entry per roll event, not per interaction.

## State & sync rules

Global state in `app.js`: `combatants`, `currentRound`, `initiativeHistory`,
`currentCampaignId`, `campaigns`, plus flags (`isUpdatingFromFirebase`,
`isAuthenticated`, `isFirebaseReady`).

- After any state mutation: re-render (`renderCombatantLists()` and/or
  `renderInitiativeOrder()`), then `saveToFirebase()`.
- `isUpdatingFromFirebase` guards against echo-loops while the `onValue` listener in
  `loadFromFirebase()` applies remote data. Check it before writing.
- `saveToFirebase()` deep-cleans `undefined` → `null` before writing (Firebase rejects
  `undefined`; it silently drops keys set to `null`, which is why `loadFromFirebase()`
  re-defaults every field with `??`).
- **Any new combatant field needs a backward-compat default in the
  `loadFromFirebase()` mapping**, or old campaigns break.
- Theme (`dndTheme`) and vision mode (`dndVisionMode`) are per-device localStorage,
  never synced. Last campaign is `lastCampaignId` in localStorage.
- `loadFromFirebase()` stores its `onValue` unsubscribe in `campaignDataUnsubscribe`
  and detaches it before attaching a new campaign listener — keep this invariant if
  you add listeners.

## Quality checklist (from .copilot-checklist.md — still the contract)

Before completing any change, verify:

1. **Both themes** — every new element styled for dark (default) AND
   `body[data-theme="light"]`; also `body[data-vision="colorblind"]` where colors
   convey meaning.
2. **Initiative/History mirror** — styles for `.initiative-item` must be mirrored to
   `.history-item` (backgrounds, text colors, borders, indicators).
3. **All three combatant types** — party, enemy, `friendly` all handled.
4. **Firebase sync** — `saveToFirebase()` called after mutations; verify sync across
   two browser tabs.
5. **Renders** — appropriate render function(s) called after data changes.
6. **Globals** — any function referenced from generated `onclick=""` HTML must be a
   top-level `function` declaration (globals), not inside a closure.
7. **Backward compat** — new fields defaulted in `loadFromFirebase()`.
8. **Manual test in browser** — no console errors, mobile hamburger menu still works,
   drag-and-drop reorder still works, history modal still renders.
9. **README.md updated** for user-facing features — plain text, **no emojis in README**.
10. Focus/hover states for new interactive elements; forms reset after submit;
    modals close via X and outside-click where applicable.

## Constraints

- DO NOT add npm dependencies, bundlers, or frameworks — static files only.
- DO NOT change the Firebase data layout without a migration story for existing
  campaigns (real campaign data is live in production).
- DO NOT sacrifice D&D 5e rules accuracy for convenience.
- Escape/sanitize anything interpolated into `innerHTML` (combatant and campaign
  names are user input rendered on every synced device).
- The client-side `APP_PASSWORD` is a deliberate simplicity trade-off, not real
  security — Firebase rules (`auth != null`) are the actual boundary.

## Known issues / debt

All issues found in the 2026-07-15 audit were fixed the same day (listener leak,
name escaping, password logging, Lucky RAW accuracy, dead code, repo hygiene —
see git history). Conventions those fixes introduced, to preserve:

- Always pass user text through `escapeHtml()` before `innerHTML` interpolation.
- Generate combatant IDs with `newId()`, never raw `Date.now()`.
- Inline `onclick` handlers may interpolate only numeric IDs or campaign slugs —
  never names or other user text; look names up inside the handler instead.
- Remember-me tokens are `btoa(APP_PASSWORD)` and are validated in `checkAuth()`,
  so changing the password invalidates existing sessions.
- The client-side password remains security-theater by design; Firebase rules are
  the real boundary.

## History of this file

Synthesized from `.github/agents/dnd-initiative-dev.agent.md` (GitHub Copilot agent)
and `.copilot-checklist.md` when the project moved to Claude Code. Corrections made
against the actual code: Firebase config lives in `index.html` (not app.js); there is
no `off()` before `on()` on listeners despite the old agent doc's claim; vision modes
were simplified to Normal/Colorblind (the old doc and README still mention
Protanopia/Deuteranopia/Tritanopia).
