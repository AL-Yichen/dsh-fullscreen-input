# dsh-fullscreen-input

[![English](https://img.shields.io/badge/lang-English-4176e6)](README.en.md) [![简体中文](https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-9aa0a6)](README.md)

[![npm](https://img.shields.io/npm/v/dsh-fullscreen-input?color=4176e6)](https://www.npmjs.com/package/dsh-fullscreen-input) [![License](https://img.shields.io/github/license/AL-Yichen/dsh-fullscreen-input?color=4176e6)](./LICENSE) [![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.0--rc.1%20%3C0.3.0--0-4176e6)](https://github.com/AL-Yichen/dsh-fullscreen-input#compatibility) [![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/AL-Yichen/dsh-fullscreen-input/pulls)

A **full-screen input panel** for the DSH composer: write multi-line text across the whole screen, then click to send.

## The problem it solves

DSH decides whether `Shift+Enter` inserts a newline or sends by looking at a very short grace window — a keydown within **10 ms** of a composition ending still counts as "composing":

```js
const onCompositionEnd = () => {
    composing = false;
    composingUntil = Date.now() + 10;   // ← these 10ms
};
const recentlyComposing = () => composing || Date.now() < composingUntil;
```

A Chinese IME uses Shift and Enter constantly (to switch languages and to confirm candidates), so `Shift+Enter` lands inside that window easily and gets read as "send". Writing multi-line text becomes a chore.

This panel **sidesteps the whole decision**: there is **no "Enter sends" path in it at all**.

## Install

### From the plugin market (recommended)

Open DSH's **Settings → Plugin Market**, search for `dsh-fullscreen-input`, and install.

### Command line

```sh
dsh plugin --profile web add dsh-fullscreen-input
```

Restart `dsh web` and refresh the page afterwards.

### From a local directory (for development)

```sh
git clone <this repository> dsh-fullscreen-input
dsh plugin --profile web add link:<absolute path to the clone>
```

Windows example: `link:D:/example/dsh-fullscreen-input`

Because it is a `link:` install, rebuild once after editing the source with `node build-client.mjs` and **refresh the page** — no reinstall needed.

## Using it

A new icon appears in the composer's tool row (the line with the "+" button); hovering it says "Full-screen input". Clicking it opens the panel.

### Keys

| Key | Behaviour |
|---|---|
| `Enter` | newline |
| `Shift+Enter` | newline (same as `Enter`; Shift only ever means newline here) |
| `Ctrl+Enter` / `Cmd+Enter` | send |
| `Esc` | close the panel (if a settings dialog is open, that closes first and the panel stays) |
| `Enter` / `Ctrl+Enter` while an IME is composing | newline — **never** sends |
| Click outside the panel | close the panel (same as `Esc`) |

`Ctrl+Enter` was chosen over a more obscure chord because it is the common "send" convention in chat apps and editors, every 75%-layout keyboard has Ctrl in the bottom-left corner, and it does not overlap the Shift/Enter habits a Chinese IME trains.

**Closing the panel loses nothing.** The panel and the composer read and write **one draft** — not two copies kept in sync, but the same value. So text typed in the panel and text typed in the composer are the same text.

### What else the panel does

| Capability | How |
|---|---|
| **See references** | `@` references in the draft appear as labelled entries; hover for the full path |
| **See attachments** | images show as thumbnails — **click to enlarge**; files show a type icon and name |
| **Remove an attachment** | hover it; an "×" appears in the corner |
| **Add files** | the "+" at the bottom left, which drives DSH's own file picker |
| **Paste** | `Ctrl+V` inside the panel; images and files both work |
| **Drag and drop** | drop files straight onto the panel |
| **Move the panel** | drag the title row (free movement, no bounds); **double-click the title to recentre**. It is centred again the next time it opens |
| **Resize** | drag any border or corner (eight directions; the cursor changes to the matching resize arrow, and there are no visible grips). Minimum 360×240, never larger than the viewport. **The size is remembered**; double-clicking the title restores size and position together |
| **Scroll behind it** | with the pointer **outside** the panel, the wheel scrolls the conversation behind it — no need to close the panel to consult the model's output while writing. Wheels inside the panel stay inside the panel |
| **Summon hotkey** | `F2` by default: tap to open, tap again to close. Rebindable to any function key (F1–F12); `Esc` always closes |
| **Intro dialog** | shown once, the first time you open the panel, explaining that the title row resets it and where the settings are. Tick "don't show again" to suppress it for good; there is a "show tips" button at the bottom of settings to bring it back |
| **Turn the mask off** | the "enable mask" switch removes the mask entirely, after which the pointer can click and scroll the page behind. The cost is that click-outside-to-close no longer applies — use `Esc` or the hotkey |
| **Pane background** | want an opaque pane, turn on "solid pane"; want frosted glass, turn on "frosted glass" (the two are mutually exclusive); with both off the pane is fully transparent |

### Appearance settings

The **sun icon** in the panel header (an eight-toothed shape, which reads as a sun rather than a gear at this size) opens "Full-screen input settings":

**Mask**
- **Mask opacity**: fully transparent by default (0%)
- **Mask fog**: no fog by default (0%)

**Pane background**
- **Frosted glass**: off by default
- **Solid pane**: off by default, and **mutually exclusive** with frosted glass — it lays down colour without blur. Turning it on pushes "panel opacity" to 100%, so you get an opaque pane straight away
- **Pane fog** (default 40%), **panel opacity** (default 25%), **panel colour**: "follow theme", six fixed colours, and a **system colour picker** in the last cell — click it to pick anything
- The background therefore has three states: **both switches off = fully transparent**; solid only = colour without blur; frosted only = colour plus blur

**Panel behaviour**
- **Remember panel size** (on by default) and **remember panel position** (off by default): independent, and with both off every open returns to the default size and centre
- **Summon hotkey** (`F2` by default): click the button, then press a function key to rebind
- **Intro dialog**: "show tips" displays the first-run dialog again

Settings persist across refreshes and restarts.

> ⚠️ One behaviour worth knowing: raising **mask fog** blurs the **entire screen behind the panel** (including what is directly behind the pane), because the mask itself covers the viewport. That is how the current implementation behaves — not a fault.

## Compatibility

- **DSH `>=0.2.0-rc.1 <0.3.0-0`** (the 0.2.x release line). The panel leans on host internals — slot props, `inputActions`, and the revision-CAS semantics of `insertReference` — which are exactly what a minor bump moves, so the upper bound is deliberately tight. The previous `>= 0.2.0-rc.1` silently claimed compatibility with every future `0.3.0+`.
- **Node >= 20** (only needed to build from source)
- Browser-side only: the host half is an empty implementation, it makes **no network requests**, and it does not read or write session data

## Permissions

This plugin needs **no** permission preset, approval relaxation, or sandbox change to work. Its capability surface is deliberately minimal:

| Capability | Why |
|---|---|
| `ctx.effect` | registers cleanup for the stylesheet and the locale dictionaries (fully rolled back on unload, nothing left behind) |
| `ctx.inject(['slots','locale','sessions','conversation'])` | waits for and obtains those four services; every use is either a read or a drive of the host's own input actions |
| `slots.inject` + `slots.register` | contributes one toolbar button into the `conversation.input.left` slot |

**Not used**: `ctx.fs`, `ctx.network`, `ctx.shell`, `ctx.resources`. It registers no agent tools, so it does not widen the model's tool surface.

Its only local persistence is one `localStorage` key (panel appearance preferences). Its only path to a file is driving the host's **own** hidden file input, and asking for a file dialog has to happen inside your click or paste gesture. See [SECURITY.md](./SECURITY.md) for the full surface and how to report a problem.

## Working on the source

```sh
node build-client.mjs      # wraps src/client.js into lib/client.js
npm run check              # syntax check (three files)
```

| File | Purpose |
|---|---|
| `src/client.js` | the only hand-written implementation (browser side: all UI and logic) |
| `lib/client.js` | **the build artifact — this is what actually loads at runtime** |
| `lib/index.js` | host side, an empty implementation |
| `build-client.mjs` | build script: plain text wrapping, no dependencies |
| `cordis.patch.yml` | bundle patch, mounting row id `fullscreen-input` |

**Always rebuild after editing `src/`**, or a page refresh will still run the old code.

## License

MIT
