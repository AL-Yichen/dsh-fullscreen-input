/**
 * dsh-fullscreen-input — browser half.
 *
 * One contribution: a small button in the composer tool row
 * (`conversation.input.left`, the seat right of the "+" button and the
 * permission/plan controls) that opens a full-screen input panel.
 *
 * Why the panel exists: the shipped composer keymap treats a keydown within
 * 10ms of `compositionend` as still composing (see registerComposerKeymap). A
 * Chinese IME uses Shift and Enter constantly to switch and to confirm
 * candidates, so Shift+Enter lands inside that window and is read as "send".
 * The panel removes the ambiguity entirely: Enter is only ever a newline there,
 * and the one deliberate submit gesture is the round arrow button. Ctrl/Cmd+Enter
 * is also wired as an explicit, documented accelerator -- guarded by the
 * composition check ahead of the modifier test, so an IME-confirming Enter can
 * never reach it.
 *
 * The one load-bearing decision: the panel keeps NO text state of its own. It
 * reads the composer's live draft through the standard `useInput` seat and
 * writes through the standard `inputActions.setDraft` seat — the same pair the
 * shipped `DefaultConversationViews` uses to mirror a session's draft. So the
 * panel and the composer are two views of one value, and closing the panel is a
 * visibility change that cannot touch the text.
 *
 * Submission goes through `inputActions.submit()`, which is the composer's own
 * shell action: the shipped Send button calls
 * `keyboard.submit(resolveSubmitMode(...))` where `keyboard` is
 * `inputHub.shell(sessionId)` and `shell.actions.submit()` is exactly
 * `shell.submit("queue")`. With the shipped default `busyEnter: "queue"`,
 * `resolveSubmitMode` returns "queue" for every state, so this is the identical
 * path — queueing, steering, attachments and reference resolution all intact.
 */

// Source for the browser half. `node build-client.mjs` wraps this file in the
// shell's module-loader call; it is NOT a standalone module and is never served
// as one. The wrapper supplies `require` (the shell's module table, where
// `react` is a baseline entry) and `module`/`exports`, so this file uses both
// and ends by assigning `module.exports`.
const React = require('react')

/**
 * Optional host icon. The toolbar/panel art must not cost a new dependency, so
 * the lookup is guarded: a composition without the primitives package renders
 * this plugin's own equivalent inline SVG instead (same 16px grid, same 1.3px
 * stroke weight the host uses for `Medium` product icons).
 */
const primitives = (() => {
  try {
    return require('@deepseek-ai/dsh-client-ui-primitives')
  } catch (error) {
    return null
  }
})()

/** Locale namespace owned by this plugin. */
const NS = 'dsh-fullscreen-input'

/** Slot cell key inside `conversation.input.left`. */
const DOCK_ID = 'fullscreen-input'

/** Where the cell sits: after the shipped "+"/permission/plan cluster. */
const DOCK_ORDER = 30

/** The cells' dictionaries, registered on the shared locale service. */
const DICT = {
  zh: {
    'button.label': '全屏输入',
    'panel.title': '全屏输入',
    'panel.hint': 'Enter 换行 · Ctrl+Enter 发送 · Esc 关闭',
    'panel.placeholder': '在这里输入内容…',
    'panel.send': '发送',
    'panel.close': '关闭',
    'panel.empty': '还没有内容',
    'panel.locked': '当前会话不可编辑',
    'panel.noComposer': '输入通道尚未就绪',
    // {count} is substituted by the plugin: the locale service hands back the
    // literal template, so the rail does the replacement itself.
    'panel.attachments': '附件 {count}',
    'panel.attachment': '附件',
    'panel.addFile': '添加文件（走宿主的文件选择器）',
    'panel.removeAttachment': '移除 {name}',
    'panel.preview.dialog': '图片预览',
    'panel.preview.close': '关闭预览',
    'panel.refs.title': '这些引用来自草稿里的 @ 引用条目',
    'panel.refs.atRisk': '在此编辑会把引用变成纯文本：宿主未向插件开放还原引用的接口',
    'panel.removeReference': '移除引用 {name}（会删掉草稿里对应的那段文字）',
    'panel.settings': '全屏输入设置',
    'panel.settings.open': '全屏输入设置',
    'panel.settings.close': '关闭设置',
    'settings.glass': '启用毛玻璃效果',
    'settings.glass.desc': '面板改为半透明毛玻璃，模糊身后的桌面',
    'settings.solid': '纯色面板',
    'settings.solid.desc': '铺一层不带模糊的底色，适合不想要透明效果时使用；开启会关掉毛玻璃，毛玻璃开启时也会把它关掉',
    'settings.maskOpacity': '遮罩层不透明度',
    'settings.maskOpacity.desc': '0% 为完全透明，面板外区域不遮挡桌面',
    'settings.maskFog': '遮罩层雾化',
    'settings.maskFog.desc': '模糊面板之外的桌面，营造景深',
    'settings.glassOpacity': '面板不透明度',
    'settings.glassOpacity.desc': '面板底色的浓度：100% 为完全不透明，数值越小则透出的桌面越多',
    'settings.glassColor': '面板颜色',
    'settings.glassColor.desc': '面板底色的颜色，跟随主题或指定颜色',
    'settings.glassFog': '面板雾化',
    'settings.glassFog.desc': '只模糊面板自身覆盖的区域，不影响面板之外',
    'settings.themeColor': '跟随主题',
    'settings.customColor': '自定义颜色',
    'settings.groupBehaviour': '面板行为',
    'settings.rememberSize': '记住面板大小',
    'settings.rememberSize.desc': '关闭面板后再打开时沿用上次调整的大小；关闭此项则每次回到默认大小',
    'settings.rememberPosition': '记住面板位置',
    'settings.rememberPosition.desc': '关闭面板后再打开时回到上次的位置；关闭此项则每次回到居中',
    'settings.hotkey': '唤起快捷键',
    'settings.hotkey.desc': '按一下这个功能键即可打开或关闭面板（限 F1–F12）；Esc 始终可以关闭',
    'settings.hotkey.capturing': '请按一个功能键…',
    'settings.showHint': '使用提示',
    'settings.showHint.desc': '再次显示首次使用时的提示弹窗',
    'settings.showHint.button': '查看提示',
    'hint.title': '全屏输入 · 使用提示',
    'hint.reset': '双击面板顶部的标题栏，可把面板恢复到默认位置与默认大小。',
    'hint.settings': '更多设置（遮罩、面板底色、大小与位置记忆、唤起快捷键）请点击面板右上角的小太阳图标，打开「全屏输入设置」查看。',
    'hint.mute': '不再提示',
    'hint.ok': '关闭',
    'hint.close': '关闭提示',
    'settings.groupMask': '遮罩层',
    'settings.mask': '启用遮罩层',
    'settings.mask.desc': '关闭后不再有遮罩，鼠标可直接点击、滚动背后的页面；此时点击面板之外也不再关闭面板（Esc 与唤起快捷键仍可关闭）',
    'settings.groupGlass': '面板底色',
  },
  en: {
    'button.label': 'Full-screen input',
    'panel.title': 'Full-screen input',
    'panel.hint': 'Enter adds a line · Ctrl+Enter sends · Esc closes',
    'panel.placeholder': 'Type here…',
    'panel.send': 'Send',
    'panel.close': 'Close',
    'panel.empty': 'Nothing to send yet',
    'panel.locked': 'This session is not editable',
    'panel.noComposer': 'The input channel is not ready',
    'panel.attachments': '{count} attachment(s)',
    'panel.attachment': 'attachment',
    'panel.addFile': "Add files (uses the host's own picker)",
    'panel.removeAttachment': 'Remove {name}',
    'panel.preview.dialog': 'Image preview',
    'panel.preview.close': 'Close preview',
    'panel.refs.title': 'These references come from @ entries in the draft',
    'panel.refs.atRisk': 'Editing here turns them into plain text: the host exposes no way for a plugin to restore a reference',
    'panel.removeReference': 'Remove reference {name} (deletes the matching text from the draft)',
    'panel.settings': 'Full-screen input settings',
    'panel.settings.open': 'Full-screen input settings',
    'panel.settings.close': 'Close settings',
    'settings.glass': 'Frosted glass',
    'settings.glass.desc': 'Make the pane translucent and blur the desktop behind it',
    'settings.solid': 'Solid pane',
    'settings.solid.desc': 'Lay down a tint without any blur, for when you want no transparency at all; turning it on switches frosted glass off, and the reverse',
    'settings.maskOpacity': 'Mask opacity',
    'settings.maskOpacity.desc': '0% keeps everything outside the pane fully transparent',
    'settings.maskFog': 'Mask fog',
    'settings.maskFog.desc': 'Blur the desktop outside the pane for depth',
    'settings.glassOpacity': 'Panel opacity',
    'settings.glassOpacity.desc': 'How strong the pane tint is: 100% is fully opaque, lower values let the desktop show through',
    'settings.glassColor': 'Panel colour',
    'settings.glassColor.desc': 'Base colour of the pane: theme or a fixed colour',
    'settings.glassFog': 'Pane fog',
    'settings.glassFog.desc': 'Blurs only what the pane covers, nothing outside it',
    'settings.themeColor': 'Theme',
    'settings.customColor': 'Custom colour',
    'settings.groupBehaviour': 'Panel behaviour',
    'settings.rememberSize': 'Remember panel size',
    'settings.rememberSize.desc': 'Reopen at the size you last dragged it to; turn off to always start at the default size',
    'settings.rememberPosition': 'Remember panel position',
    'settings.rememberPosition.desc': 'Reopen where you last left it; turn off to always start centred',
    'settings.hotkey': 'Summon shortcut',
    'settings.hotkey.desc': 'Tap this function key to open or close the panel (F1–F12); Escape always closes',
    'settings.hotkey.capturing': 'Press a function key…',
    'settings.showHint': 'Getting started',
    'settings.showHint.desc': 'Show the first-run dialog again',
    'settings.showHint.button': 'Show tips',
    'hint.title': 'Full-screen input · Getting started',
    'hint.reset': 'Double-click the panel header to restore its default position and size.',
    'hint.settings': 'For more — mask, pane background, remembering size and position, summon shortcut — open Full-screen input settings from the sun icon at the top right of the panel.',
    'hint.mute': "Don't show again",
    'hint.ok': 'Close',
    'hint.close': 'Close tips',
    'settings.groupMask': 'Mask',
    'settings.mask': 'Show the mask',
    'settings.mask.desc': 'Turn off to drop the mask so the page behind stays clickable and scrollable; clicking outside then no longer closes the panel (Escape and the shortcut still do)',
    'settings.groupGlass': 'Pane background',
  },
}

/**
 * Panel sheet. Every colour is a host theme token so the panel follows the
 * active theme; the fallbacks only keep a token-less composition from going
 * invisible. The submit button mirrors the composer's round arrow: a 32px
 * circle in the brand colour with a white glyph.
 */
const CSS = [
  // --- toolbar button -------------------------------------------------------
  '.dshfs-root{display:contents}',
  '.dshfs-dock{display:inline-flex;align-items:center;justify-content:center;',
  'width:26px;height:26px;padding:0;flex:none;border:0;border-radius:6px;',
  'background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;',
  'transition:background .15s,color .15s}',
  '.dshfs-dock:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));',
  'color:var(--dsw-alias-label-primary,#191919)}',
  '.dshfs-dock:focus-visible{outline:2px solid var(--dshfs-accent,#7aaaff);',
  'outline-offset:1px}',
  '.dshfs-dock[aria-expanded="true"]{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));',
  'color:var(--dshfs-accent,#7aaaff)}',
  '.dshfs-dock[disabled]{opacity:.45;cursor:default}',
  // --- panel ---------------------------------------------------------------
  // `.dshfs-layer` is the positioning and hit-test shell: full viewport, a
  // centred flex box, fully transparent, and the element that catches outside
  // clicks. The mask's *look* lives on `.dshfs-scrim` inside it (see below);
  // `maskOpacity` / `maskFog` are applied there as inline styles, so the sheet
  // only carries the transparent baseline.
  '.dshfs-layer{position:fixed;inset:0;z-index:2147483000;display:flex;',
  'align-items:center;justify-content:center;padding:24px;box-sizing:border-box;',
  'background:transparent}',
  // The mask is a SIBLING of the pane, never its ancestor. `backdrop-filter`
  // makes an element a backdrop root, and a descendant's backdrop is then
  // limited to what is painted inside that root -- so a fogged *ancestor*
  // starves the pane's own blur, leaving it nothing but its translucent fill.
  // As siblings the two never contend.
  // It takes no pointer events, so a press outside the pane falls through to
  // `.dshfs-layer`, which keeps owning the "press outside to close" gesture.
  '.dshfs-scrim{position:absolute;inset:0;pointer-events:none}',
  // Clicks on the mask close the panel, so the mask must look clickable-neutral
  // but still be a real hit target.
  '.dshfs-layer{cursor:default}',
  // With the mask off, the layer stops taking pointer events entirely so clicks and
  // wheels reach the page behind — which is the whole point of turning it off. The
  // pane opts back in, because it still has to be usable. This also makes the wheel
  // forwarding above unnecessary in that mode: with no interception, the browser
  // scrolls whatever is under the pointer by itself.
  '.dshfs-layer-bare{pointer-events:none}',
  '.dshfs-layer-bare .dshfs-panel{pointer-events:auto}',
  // `position`/`z-index` below are load-bearing, not cosmetic. `.dshfs-scrim` is
  // absolutely positioned and positioned boxes paint above static ones, so
  // without them the scrim would be drawn OVER the pane and blur the pane away
  // together with the page -- which is exactly what the e921d83 attempt did.
  // The fill comes from `--dshfs-fill` when the panel published one; the plain
  // token is the fallback, so an unsupported value can never leave the panel
  // without a background at all.
  '.dshfs-panel{--dshfs-accent:#7aaaff;position:relative;z-index:1;display:flex;flex-direction:column;width:min(920px,100%);',
  'height:min(76vh,720px);box-sizing:border-box;overflow:hidden;',
  'border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));border-radius:14px;',
  'background:var(--dshfs-fill,var(--dsw-alias-bg-layer-1,#fff));',
  'box-shadow:0 18px 48px rgba(0,0,0,.28)}',
  // Frosted variant: `backdrop-filter` needs a partially transparent fill to
  // show through, which is exactly what `glassOpacity` supplies.
  '.dshfs-panel.dshfs-glass{box-shadow:0 18px 48px rgba(0,0,0,.34)}',
  // geometry follows the host shell's own top drag strip so the header stays
  // draggable-looking and the close button stays reachable on the desktop app.
  // The header doubles as the panel's drag handle, so it advertises that, keeps
  // its text unselectable while dragging, and stops the browser from turning a
  // touch drag into a scroll.
  '.dshfs-head{display:flex;align-items:center;gap:10px;flex:none;cursor:move;',
  'user-select:none;-webkit-user-select:none;touch-action:none;',
  'padding:10px 12px 10px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}',
  // Resize handles. They sit *inside* the border because the pane clips its
  // overflow for the rounded corners, so a handle straddling the edge would be
  // cut away. Five pixels is enough to grab without stealing clicks from the
  // content underneath, and the corners get a slightly larger square so a
  // diagonal drag is easy to start.
  '.dshfs-resize{position:absolute;z-index:3;touch-action:none}',
  '.dshfs-resize-n{top:0;left:14px;right:14px;height:5px;cursor:ns-resize}',
  '.dshfs-resize-s{bottom:0;left:14px;right:14px;height:5px;cursor:ns-resize}',
  '.dshfs-resize-w{left:0;top:14px;bottom:14px;width:5px;cursor:ew-resize}',
  '.dshfs-resize-e{right:0;top:14px;bottom:14px;width:5px;cursor:ew-resize}',
  '.dshfs-resize-nw{top:0;left:0;width:14px;height:14px;cursor:nwse-resize}',
  '.dshfs-resize-ne{top:0;right:0;width:14px;height:14px;cursor:nesw-resize}',
  '.dshfs-resize-sw{bottom:0;left:0;width:14px;height:14px;cursor:nesw-resize}',
  '.dshfs-resize-se{bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize}',
  '.dshfs-title{flex:1;min-width:0;font-size:14px;line-height:22px;font-weight:500;',
  'color:var(--dsw-alias-label-primary,#191919);overflow:hidden;text-overflow:ellipsis;',
  'white-space:nowrap}',
  '.dshfs-hint{flex:none;font-size:12px;line-height:18px;',
  'color:var(--dsw-alias-label-secondary,#666)}',
  '.dshfs-iconbtn{display:inline-flex;align-items:center;justify-content:center;',
  'width:28px;height:28px;padding:0;flex:none;border:0;border-radius:6px;',
  // Same colour as the hint text beside it, so the header reads as one row
  // rather than a label with two stray buttons.
  'background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;',
  'transition:background .15s,color .15s,transform .2s}',
  '.dshfs-iconbtn:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));',
  'color:var(--dsw-alias-label-primary,#191919)}',
  '.dshfs-iconbtn:focus-visible{outline:2px solid var(--dshfs-accent,#7aaaff);',
  'outline-offset:1px}',
  '.dshfs-iconbtn[aria-pressed="true"]{color:var(--dshfs-accent,#7aaaff)}',
  '.dshfs-iconbtn.dshfs-spin{transform:rotate(60deg)}',
  // The gear sits before Close with the header's own 10px gap plus this margin,
  // so it never crowds the dismiss control (or the hint text beside it).
  '.dshfs-gear{margin-left:4px}',
  // Reference / attachment rail.
  //
  // The panel edits the draft's **clipboard-text projection**, so the chips the
  // host draws in the composer reach this panel as plain "@path" text, and the
  // attachment array is not in that string at all. This row surfaces both for
  // what they are, instead of leaving the user to read paths out of a textarea.
  // The padding also carries the row items' remove control: it is positioned at
  // `-5px` on two sides, so the padding box has to reach past the content by at
  // least that much or `overflow-y:auto` clips the button away and the item
  // looks like it has no remove control at all. The value sits comfortably above
  // that minimum because a 22px text chip rests flush against the content box
  // (the 32px image card has slack of its own) and a real client reported its
  // button as invisible.
  '.dshfs-refs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex:none;',
  'max-height:88px;overflow-y:auto;padding:13px 21px;',
  'border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}',
  '.dshfs-ref{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:100%;',
  'padding:1px 8px;border-radius:6px;font-size:12px;line-height:20px;',
  'background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));',
  'color:var(--dsw-alias-label-secondary,#666)}',
  '.dshfs-ref-glyph{flex:none;opacity:.75}',
  '.dshfs-ref-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dshfs-ref-count{display:inline-flex;align-items:center;gap:5px;flex:none;',
  'padding:1px 8px;border-radius:6px;font-size:12px;line-height:20px;',
  'color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
  '.dshfs-ref-warn{flex:none;cursor:help;font-size:12px;line-height:20px;',
  'color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
  // Image drafts: a small square preview that opens the host lightbox.
  '.dshfs-ref-image{flex:none;width:32px;height:32px;padding:0;border:0;border-radius:6px;',
  'overflow:hidden;background:transparent;cursor:pointer;line-height:0}',
  '.dshfs-ref-image img{display:block;width:100%;height:100%;object-fit:cover}',
  // One attachment: the chip plus its remove control, which appears on hover or
  // keyboard focus and stays put where no hover exists (touch).
  //
  // `min-width`/`max-width` are repeated from the chip inside it. The chip
  // truncates a long name with `max-width:100%`, but that percentage resolves
  // against *this* box -- and this box sizes itself to its content, so without
  // a bound of its own the percentage stops constraining anything and a long
  // path pushes the chip out of the rail. The image card is a fixed 32px, which
  // is why the original wrapper did not need this.
  '.dshfs-att{position:relative;display:inline-flex;flex:none;align-items:center;min-width:0;max-width:100%}',
  '.dshfs-att-remove{position:absolute;top:-5px;right:-5px;width:16px;height:16px;padding:0;',
  'display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:50%;',
  'cursor:pointer;opacity:0;transition:opacity .12s;line-height:0;',
  'background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#666);',
  'box-shadow:0 1px 3px rgba(0,0,0,.28)}',
  '.dshfs-att:hover .dshfs-att-remove,.dshfs-att:focus-within .dshfs-att-remove{opacity:1}',
  '@media (hover:none){.dshfs-att-remove{opacity:1}}',
  '.dshfs-ref-file{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:100%;',
  'padding:1px 8px;border-radius:6px;font-size:12px;line-height:20px;',
  'background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));',
  'color:var(--dsw-alias-label-secondary,#666)}',
  '.dshfs-body{flex:1;min-height:0;display:flex}',
  // The textarea is the whole point of the panel: tabular, monospace-friendly,
  // and it must never be the thing that submits.
  '.dshfs-text{flex:1;min-width:0;box-sizing:border-box;padding:16px 18px;border:0;',
  'outline:none;resize:none;background:transparent;',
  'color:var(--dsw-alias-label-primary,#191919);',
  'font-family:inherit;font-size:14px;line-height:24px;',
  'caret-color:var(--dshfs-accent,#7aaaff);tab-size:4}',
  '.dshfs-text::placeholder{color:var(--dsw-alias-label-secondary,#666);opacity:.7}',
  '.dshfs-text[disabled]{cursor:default;opacity:.6}',
  '.dshfs-foot{display:flex;align-items:center;gap:12px;flex:none;',
  'padding:10px 12px 10px 16px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}',
  '.dshfs-count{flex:1;min-width:0;font-size:12px;line-height:18px;',
  'color:var(--dsw-alias-label-secondary,#666);overflow:hidden;text-overflow:ellipsis;',
  'white-space:nowrap}',
  // 32px circle, brand fill, white 16px glyph — the composer's Send button.
  '.dshfs-send{display:inline-flex;align-items:center;justify-content:center;',
  'width:32px;height:32px;padding:0;flex:none;border:0;border-radius:999px;',
  // Accent, not a theme token: a theme may define brand-primary as white, which
  // would put a white glyph on a white circle.
  'background:var(--dshfs-accent,#7aaaff);color:#fff;cursor:pointer;',
  'transition:opacity .15s,transform .15s}',
  '.dshfs-send:hover:not([disabled]){opacity:.88}',
  '.dshfs-send:active:not([disabled]){transform:scale(.94)}',
  '.dshfs-send:focus-visible{outline:2px solid var(--dshfs-accent,#7aaaff);',
  'outline-offset:2px}',
  '.dshfs-send[disabled]{cursor:default;opacity:.4}',
  '.dshfs-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;',
  'clip:rect(0 0 0 0);white-space:nowrap;border:0}',
  // --- settings dialog ------------------------------------------------------
  '.dshfs-settings-layer{position:absolute;inset:0;z-index:1;display:flex;',
  'align-items:center;justify-content:center;padding:24px;box-sizing:border-box}',
  '.dshfs-settings{--dshfs-accent:#7aaaff;display:flex;flex-direction:column;width:min(460px,100%);',
  // `min-height:0` is load-bearing, not decoration. This is a flex item, and a
  // flex item's default `min-height:auto` refuses to shrink below its content —
  // which silently overrides `max-height` and lets a long settings list grow the
  // dialog past the pane, clipping both ends. The body below needs the same
  // treatment for the same reason.
  'max-height:100%;min-height:0;box-sizing:border-box;overflow:hidden;cursor:default;',
  'border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));border-radius:14px;',
  'background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1,#fff));',
  'box-shadow:0 18px 48px rgba(0,0,0,.34)}',
  '.dshfs-settings-head{display:flex;align-items:center;gap:10px;flex:none;',
  'padding:12px 12px 12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}',
  '.dshfs-settings-title{flex:1;min-width:0;font-size:14px;line-height:22px;font-weight:500;',
  'color:var(--dsw-alias-label-primary,#191919);overflow:hidden;text-overflow:ellipsis;',
  'white-space:nowrap}',
  '.dshfs-settings-body{flex:1;min-height:0;overflow-y:auto;padding:4px 16px 16px}',
  // A row is a BLOCK: label + description own the full width and the control
  // sits on its own line below. An inline row cannot host a full-width slider —
  // the slider wins the width and the description is squeezed into a
  // one-character-per-line vertical ribbon (the bug this replaces).
  '.dshfs-row{display:flex;flex-direction:column;gap:8px;padding:12px 0;',
  'border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.14))}',
  '.dshfs-row:last-child{border-bottom:0}',
  '.dshfs-row-text{flex:none;min-width:0}',
  '.dshfs-row-label{font-size:13px;line-height:20px;',
  'color:var(--dsw-alias-label-primary,#191919)}',
  '.dshfs-row-desc{margin-top:1px;font-size:12px;line-height:18px;',
  'color:var(--dsw-alias-label-secondary,#666);overflow-wrap:break-word;word-break:break-word}',
  // Compact controls (a switch, a swatch strip) keep label and control inline.
  '.dshfs-row.dshfs-row-inline{flex-direction:row;align-items:center;gap:12px}',
  '.dshfs-row.dshfs-row-inline .dshfs-row-text{flex:1}',
  '.dshfs-row-value{flex:none;min-width:52px;text-align:right;font-size:12px;line-height:18px;',
  'color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums}',
  '.dshfs-switch{position:relative;width:40px;height:22px;flex:none;padding:0;margin:0;',
  'border:0;border-radius:999px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.28));',
  'cursor:pointer;transition:background .16s}',
  '.dshfs-switch[aria-checked="true"]{background:var(--dshfs-accent,#7aaaff)}',
  '.dshfs-switch:focus-visible{outline:2px solid var(--dshfs-accent,#7aaaff);',
  'outline-offset:2px}',
  '.dshfs-knob{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;',
  'background:#fff;transition:transform .16s;pointer-events:none}',
  '.dshfs-switch[aria-checked="true"] .dshfs-knob{transform:translateX(18px)}',
  '.dshfs-sliderrow{display:flex;align-items:center;gap:12px;flex:none;width:100%}',
  '.dshfs-slider{-webkit-appearance:none;appearance:none;flex:1;min-width:0;height:4px;',
  'border-radius:999px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.3));',
  'outline:none;cursor:pointer}',
  '.dshfs-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;',
  'width:16px;height:16px;border-radius:50%;',
  'background:var(--dshfs-accent,#7aaaff);border:0;cursor:pointer}',
  '.dshfs-slider:focus-visible{outline:2px solid var(--dshfs-accent,#7aaaff);',
  'outline-offset:3px}',
  '.dshfs-swatches{display:flex;align-items:center;gap:8px;flex:none;flex-wrap:wrap;',
  'justify-content:flex-end}',
  '.dshfs-swatch{width:22px;height:22px;padding:0;flex:none;border-radius:50%;',
  'border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.4));cursor:pointer;',
  'transition:outline-color .12s}',
  '.dshfs-swatch[aria-pressed="true"]{outline:2px solid var(--dshfs-accent,#7aaaff);',
  'outline-offset:2px}',
  '.dshfs-swatch:focus-visible{outline:2px solid var(--dshfs-accent,#7aaaff);',
  'outline-offset:2px}',
  // The custom-colour input, styled to sit in the same strip as the presets.
  // `appearance:none` plus the webkit swatch pseudo-elements are what turn the
  // native control into a plain circle; clicking it still opens the platform
  // picker, which is the point of using the native control at all.
  '.dshfs-swatch-picker{-webkit-appearance:none;appearance:none;border:0;cursor:pointer;',
  'background:transparent;overflow:hidden}',
  '.dshfs-swatch-picker::-webkit-color-swatch-wrapper{padding:0}',
  '.dshfs-swatch-picker::-webkit-color-swatch{border:0;border-radius:50%}',
  '.dshfs-swatch-picker::-moz-color-swatch{border:0;border-radius:50%}',
  '.dshfs-swatch-picker[data-selected="true"]{outline:2px solid var(--dshfs-accent,#7aaaff);',
  'outline-offset:2px}',
  // The first-run dialog. Inside the pane rather than a body portal, so it is
  // clipped by the same rounded corners and travels with the panel.
  '.dshfs-tips-layer{position:absolute;inset:0;z-index:5;display:flex;align-items:center;',
  'justify-content:center;padding:16px;background:rgba(0,0,0,.32)}',
  '.dshfs-tips{width:min(430px,100%);box-sizing:border-box;border-radius:12px;overflow:hidden;',
  'background:var(--dsw-alias-bg-layer-1,#fff);',
  'border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));',
  'box-shadow:0 18px 48px rgba(0,0,0,.3)}',
  '.dshfs-tips-head{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;',
  'border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}',
  '.dshfs-tips-title{flex:1;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#222)}',
  '.dshfs-tips-body{padding:14px 16px;display:flex;flex-direction:column;gap:10px}',
  '.dshfs-tips-text{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#555)}',
  '.dshfs-tips-foot{display:flex;align-items:center;gap:12px;padding:12px 16px;',
  'border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}',
  '.dshfs-tips-check{flex:1;display:inline-flex;align-items:center;gap:7px;font-size:13px;',
  'color:var(--dsw-alias-label-secondary,#555);cursor:pointer}',
  // Shared small button: the intro dialog's close, and the "show tips" row.
  '.dshfs-btn{flex:none;padding:5px 12px;border-radius:7px;cursor:pointer;font-size:13px;',
  'border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));',
  'background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1));',
  'color:var(--dsw-alias-label-primary,#222)}',
  '.dshfs-btn:hover{background:var(--dsw-alias-bg-layer-3,rgba(127,127,127,.18))}',
  '.dshfs-btn-capturing{outline:2px solid var(--dshfs-accent,#7aaaff);outline-offset:1px}',
  // Group heading, so mask settings and glass settings read as two concerns.
  '.dshfs-group{font-size:12px;line-height:18px;font-weight:500;padding:12px 0 2px;',
  'color:var(--dsw-alias-label-secondary,#666)}',
  '.dshfs-group:first-child{padding-top:4px}',
].join('')

/** Marks the one document-level sheet this plugin installs. */
const STYLE_TAG_ID = 'dsh-fullscreen-input-style'

/**
 * Install the sheet.
 *
 * A `<style>` tag injected while the package's factory materializes is claimed
 * by the client module system (`claimStyles` tags every untagged tag with the
 * materializing plugin id, and removes the set with the plugin's effect
 * cleanup). That is the supported route and the reason no style service needs to
 * be reached for. The teardown below is belt-and-braces for the case where HMR
 * re-materializes the factory without running the removal first.
 *
 * @returns a disposer, or null when the sheet is already up.
 */
function installSheet() {
  try {
    if (document.getElementById(STYLE_TAG_ID) !== null) return null
    const tag = document.createElement('style')
    tag.id = STYLE_TAG_ID
    tag.textContent = CSS
    document.head.appendChild(tag)
    return function removeSheet() {
      try {
        if (tag.parentNode !== null && tag.parentNode !== undefined) tag.parentNode.removeChild(tag)
        else if (typeof tag.remove === 'function') tag.remove()
      } catch (error) {
        /* the document is going away */
      }
    }
  } catch (error) {
    console.warn('fullscreen-input: could not install the sheet', error)
    return null
  }
}

/** Plain text of a draft, for the counter and the empty check. */
function draftTextOf(value) {
  return typeof value === 'string' ? value : ''
}

// ---------------------------------------------------------------------------
// Panel settings
//
// Persisted in localStorage: this is a per-user look preference, not session
// state, and a bundle that owns a Host settings namespace would need a Config
// with a `.volatile()` field plus a schemastery dependency — a real failure mode
// for a preference whose whole job is to change how one panel paints.
// ---------------------------------------------------------------------------

/** localStorage key holding the panel's look settings. */
const SETTINGS_KEY = 'dsh-fullscreen-input:settings'

/** Frosted pane's default fill alpha (the 25% the swatch strip shows). */
const DEFAULT_GLASS_OPACITY = 25

/** How hard the mask blurs what is behind it, at 100. */
const MAX_MASK_FOG_PX = 24

/** How hard the frosted panel blurs what is behind it, at 100. */
const MAX_PANEL_FOG_PX = 40

/** Default frosted-panel blur strength, in the same 0-100 units. */
const DEFAULT_GLASS_FOG = 40

/**
 * The accent this plugin paints its own controls with.
 *
 * Deliberately NOT `--dsw-alias-brand-primary`: a wallpaper skin can resolve
 * that token to white, which turned the white send glyph into a white-on-white
 * dot and the switch into a white pill. A plugin that paints its own controls
 * cannot borrow a token the theme is allowed to redefine. This is the DeepSeek
 * blue, legible on both light and dark surfaces.
 */
const PANEL_ACCENT = '#7aaaff'

/** `theme` defers to the host theme token; the rest are literal fills. */
const GLASS_COLORS = ['theme', '#ffffff', '#0b0b0d', '#8fd8ea', '#f2a8bf', '#f5b866', '#ef6f6f']

/**
 * Whether a stored glass colour is a literal `#rrggbb`.
 *
 * The alternative is the `theme` marker, which deliberately has no literal form:
 * the host's token is handed to CSS rather than parsed here (see
 * `panelStyleOf`).
 */
function isGlassLiteral(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

/** Whether the stored colour came from the custom picker rather than a preset. */
function isCustomGlassColor(value) {
  return isGlassLiteral(value) && !GLASS_COLORS.includes(value)
}

/**
 * The eight resize handles: four edges and four corners. A corner drags two
 * edges at once, which is what makes the panel's shape adjustable and not just
 * its size.
 */
const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']

/** The smallest the panel may be dragged to, in CSS pixels. */
const MIN_PANEL_WIDTH = 360
const MIN_PANEL_HEIGHT = 240

/** Upper bound for a *stored* size, so a hand-edited key cannot make it absurd. */
const MAX_PANEL_SIDE = 10000

/** Gap kept between the panel and the viewport edge while resizing. */
const VIEWPORT_MARGIN = 24

const DEFAULT_SETTINGS = {
  glass: false,
  // 纯色面板：铺一层不透明底色、但不加模糊。与「毛玻璃」互斥——两个都关
  // 才是全透明，这正是用户抱怨过的那一态。底色与不透明度沿用毛玻璃那两个
  // 设置项，所以纯色也能调出半透明有色，而不只是死板的实心块。
  solid: false,
  // On by default so the panel behaves exactly as it always has. Turning it off
  // drops the scrim entirely and lets clicks and wheels reach the page behind.
  mask: true,
  maskOpacity: 0,
  maskFog: 0,
  glassOpacity: DEFAULT_GLASS_OPACITY,
  glassColor: 'theme',
  glassFog: DEFAULT_GLASS_FOG,
  // 0 means "no explicit size", so the sheet's responsive default applies. The
  // size is remembered across openings; the panel's *position* deliberately is
  // not, and double-clicking the header clears both.
  panelWidth: 0,
  panelHeight: 0,
  // Remembering is opt-in per axis. The size is remembered by default because it
  // reads as a preference; the position is not, because it reads as incidental.
  rememberSize: true,
  rememberPosition: false,
  panelOffsetX: 0,
  panelOffsetY: 0,
  // F2 rather than F1 on purpose: F1 is the platform's help key and Chrome opens
  // a help page for it, which makes it the one function key that is genuinely
  // taken. Users can rebind this.
  hotkey: 'F2',
  // Set by the intro dialog's "do not show again" box. The flag deciding whether
  // it has been shown *this launch* is in memory only, so an unchecked close
  // brings it back next time the app starts.
  hintMuted: false,
}

/**
 * Whether a key name may be used as the summon hotkey.
 *
 * Only function keys qualify. The listener is on the window, so a bare character
 * key would fire while the user is typing in the composer and swallow ordinary
 * letters — a trap that is much worse than a slightly shorter list of choices.
 */
function isUsableHotkeyName(name) {
  return typeof name === 'string' && /^F([1-9]|1[0-2])$/.test(name)
}

/** Coerce one stored field, so a hand-edited key cannot break the panel. */
function clampNumber(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Read the stored settings, falling back per field. */
function readSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (raw === null) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS }
    return {
      glass: parsed.glass === true,
      solid: parsed.solid === true,
      mask: parsed.mask !== false,
      maskOpacity: clampNumber(parsed.maskOpacity, 0, 100, DEFAULT_SETTINGS.maskOpacity),
      maskFog: clampNumber(parsed.maskFog, 0, 100, DEFAULT_SETTINGS.maskFog),
      glassOpacity: clampNumber(parsed.glassOpacity, 0, 100, DEFAULT_SETTINGS.glassOpacity),
      // Accept any literal colour, not just the presets: the custom picker
      // produces arbitrary `#rrggbb` values, and validating against
      // `GLASS_COLORS` alone would silently discard them on the next read.
      glassColor: parsed.glassColor === 'theme' || isGlassLiteral(parsed.glassColor)
        ? parsed.glassColor
        : DEFAULT_SETTINGS.glassColor,
      glassFog: clampNumber(parsed.glassFog, 0, 100, DEFAULT_SETTINGS.glassFog),
      panelWidth: clampNumber(parsed.panelWidth, 0, MAX_PANEL_SIDE, 0),
      panelHeight: clampNumber(parsed.panelHeight, 0, MAX_PANEL_SIDE, 0),
      rememberSize: parsed.rememberSize !== false,
      rememberPosition: parsed.rememberPosition === true,
      panelOffsetX: clampNumber(parsed.panelOffsetX, -MAX_PANEL_SIDE, MAX_PANEL_SIDE, 0),
      panelOffsetY: clampNumber(parsed.panelOffsetY, -MAX_PANEL_SIDE, MAX_PANEL_SIDE, 0),
      hotkey: isUsableHotkeyName(parsed.hotkey) ? parsed.hotkey : DEFAULT_SETTINGS.hotkey,
      hintMuted: parsed.hintMuted === true,
    }
  } catch (error) {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Current settings, kept as one immutable object so React can compare identity. */
let currentSettings = readSettings()
const settingsListeners = new Set()

function getSettings() {
  return currentSettings
}

/** Subscribe to settings changes; returns the unsubscribe. */
function subscribeSettings(listener) {
  settingsListeners.add(listener)
  return () => {
    settingsListeners.delete(listener)
  }
}

/** Merge a patch, publish it, and persist it (a refused write is non-fatal). */
function writeSettings(patch) {
  currentSettings = { ...currentSettings, ...patch }
  for (const listener of [...settingsListeners]) listener()
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentSettings))
  } catch (error) {
    /* the choice simply does not survive a reload */
  }
}

/** Settings as a React value, re-rendering the panel when they change. */
function useSettings() {
  return React.useSyncExternalStore(subscribeSettings, getSettings, getSettings)
}

/** `#rrggbb` plus an alpha, as a CSS colour. */
function withAlpha(hex, alphaPercent) {
  const head = typeof hex === 'string' && hex.charAt(0) === '#' ? hex : '#808080'
  const r = parseInt(head.slice(1, 3), 16)
  const g = parseInt(head.slice(3, 5), 16)
  const b = parseInt(head.slice(5, 7), 16)
  const alpha = clampNumber(alphaPercent, 0, 100, 100) / 100
  return `rgba(${String(r)},${String(g)},${String(b)},${String(alpha)})`
}

/** The mask's inline style: fully transparent unless the user asked otherwise. */
function maskStyleOf(settings) {
  const style = {
    backgroundColor: `rgba(0,0,0,${String(settings.maskOpacity / 100)})`,
  }
  if (settings.maskFog > 0) {
    const blur = `blur(${String((settings.maskFog / 100) * MAX_MASK_FOG_PX)}px)`
    // The unprefixed property is what every current engine honours; the prefixed
    // one is the Safari spelling and is not valid CSS elsewhere.
    style.backdropFilter = blur
    style.WebkitBackdropFilter = blur
  }
  return style
}

/**
 * The pane's inline style.
 *
 * With glass off the panel keeps the opaque theme surface. With glass on it
 * becomes a translucent fill plus a backdrop blur, which is what actually reads
 * as frosted glass over the wallpaper.
 *
 * `--dshfs-accent` is published here as well as in the sheet because the panel
 * and the settings dialog can be siblings under `body` — the dialog cannot
 * inherit a variable declared on the panel.
 *
 * The fill rides in a **custom property** rather than straight on
 * `background-color`, so that CSS does the parsing (see below).
 */
function panelStyleOf(settings, size) {
  // 纯色与毛玻璃共用同一套底色逻辑，区别只在后面那层模糊：纯色只铺色，不模糊。
  // 两个都关时面板保持全透明——这正是「把两个开关都关掉」预期的那一态。
  const glassy = settings.glass || settings.solid
  const alpha = clampNumber(settings.glassOpacity, 0, 100, DEFAULT_GLASS_OPACITY)
  const style = {
    '--dshfs-accent': PANEL_ACCENT,
    // The theme token must never be resolved in JS.
    //
    // It is reported in whatever format the host wrote it in, and the live client
    // reports `color(srgb 0.109… 0.109… 0.109… / 0.659…)` — which a hand-rolled
    // rgb()/rgba() matcher silently fails on. The old fallback for that failure
    // was `#ffffff`, i.e. *exactly* the "white" preset, so "follow theme" and
    // "white" produced identical panels on a dark theme.
    //
    // `color-mix()` resolves the token in the panel's own scope and applies the
    // opacity in the same step, for any format. If it is unsupported the whole
    // declaration is dropped and the sheet's plain token shows through — so the
    // panel still gets a sane background rather than none.
    // 没有底色时必须是**字面**的 `transparent`：样式表写的是
    // `var(--dshfs-fill, <主题色>)`，带着回退值，不显式覆盖就会被主题色填满，
    // 于是「两个开关都关」看起来仍有底色。回退只救得了取值失败，救不了「不设」。
    '--dshfs-fill': !glassy
      ? 'transparent'
      : settings.glassColor === 'theme'
        ? `color-mix(in srgb,var(--dsw-alias-bg-layer-1,#fff) ${String(alpha)}%,transparent)`
        : withAlpha(settings.glassColor, alpha),
  }
  if (settings.glass) {
    const px = (clampNumber(settings.glassFog, 0, 100, DEFAULT_GLASS_FOG) / 100) * MAX_PANEL_FOG_PX
    const blur = `blur(${String(px)}px) saturate(180%)`
    style.backdropFilter = blur
    style.WebkitBackdropFilter = blur
  }
  // `size` is the only source. It is seeded from storage on mount — but only when
  // remembering is on — so falling back to `settings` here would apply the stored
  // size anyway and quietly undo the switch. This was the third and last place
  // that read the stored size without asking.
  if (size !== null && size !== undefined) {
    style.width = `${String(size.w)}px`
    style.height = `${String(size.h)}px`
  }
  return style
}

/** The stored panel size, or null when the responsive default should apply. */
function storedPanelSize() {
  const stored = currentSettings
  return stored.panelWidth > 0 && stored.panelHeight > 0
    ? { w: stored.panelWidth, h: stored.panelHeight }
    : null
}

/** A wheel "line", per the conventional 16px. */
const WHEEL_LINE_PX = 16

/**
 * The scrollable element under a viewport point, skipping our own overlay.
 *
 * The overlay is `position:fixed` and covers the viewport, so it sits *outside*
 * the host's scroll container: a wheel event landing on it has no scrollable
 * ancestor to act on, and the conversation behind stays frozen — exactly when a
 * reader is trying to consult it while writing. Forwarding the delta by hand
 * means answering "which element should scroll?", and the honest answer is
 * "whatever is under the pointer", so this asks the document for the stack at
 * that point and takes the first scrollable element that is not ours.
 *
 * That also makes the behaviour match what the user sees: scrolling over the
 * message list scrolls the messages, not the sidebar.
 */
function scrollableUnder(x, y, own) {
  try {
    const stack = document.elementsFromPoint(x, y)
    for (const node of stack) {
      if (own !== null && own !== undefined && own.contains(node)) continue
      let current = node
      while (current !== null && current !== undefined && current !== document.body) {
        const { overflowY } = getComputedStyle(current)
        const scrolls = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
        if (scrolls && current.scrollHeight > current.clientHeight) return current
        current = current.parentElement
      }
    }
  } catch (error) {
    // No forwarding is better than a broken panel.
  }
  return null
}

/** Wheel deltas arrive in pixels, lines or pages depending on the device. */
function wheelPixels(event, axis, viewport) {
  const delta = axis === 'y' ? event.deltaY : event.deltaX
  if (event.deltaMode === 1) return delta * WHEEL_LINE_PX
  if (event.deltaMode === 2) return delta * viewport
  return delta
}

/** The host close glyph, matching the shell's own dismiss control. */
function CloseGlyph() {
  return React.createElement(
    'svg',
    { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
    React.createElement('path', {
      d: 'M3.6 2.5 8 6.9l4.4-4.4 1.1 1.1L9.1 8l4.4 4.4-1.1 1.1L8 9.1l-4.4 4.4-1.1-1.1L6.9 8 2.5 3.6z',
      fill: 'currentColor',
    }),
  )
}

/**
 * The toolbar button's art: the host's product icon when the primitives package
 * is reachable, otherwise an inline equivalent drawn on the same 16px grid with
 * the same 1.3px product stroke.
 */
function FullscreenGlyph() {
  if (primitives !== null && typeof primitives.IconFullscreenOutlineMedium === 'function') {
    return React.createElement(primitives.IconFullscreenOutlineMedium, { size: 16 })
  }
  if (primitives !== null && typeof primitives.IconFullscreenOutlineRegular === 'function') {
    return React.createElement(primitives.IconFullscreenOutlineRegular, { size: 16 })
  }
  return React.createElement(
    'svg',
    {
      viewBox: '0 0 16 16',
      width: 16,
      height: 16,
      'aria-hidden': true,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('path', { d: 'M2.4 6V3.6c0-.66.54-1.2 1.2-1.2H6' }),
    React.createElement('path', { d: 'M10 2.4h2.4c.66 0 1.2.54 1.2 1.2V6' }),
    React.createElement('path', { d: 'M13.6 10v2.4c0 .66-.54 1.2-1.2 1.2H10' }),
    React.createElement('path', { d: 'M6 13.6H3.6c-.66 0-1.2-.54-1.2-1.2V10' }),
  )
}

/** The send button's art: the composer's own arrow-up glyph on the 16px grid. */
function SendGlyph() {
  return React.createElement(
    'svg',
    { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
    React.createElement('path', {
      d: 'M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z',
      fill: 'currentColor',
    }),
  )
}

/**
 * The settings gear, drawn as the eight-tooth cog the shell's own gear uses —
 * same 16px grid, same 1.3px product stroke weight as the Medium product icons.
 *
 * Note for future edits: at this size eight teeth read as a **sun**, not a cog.
 * That is what users see and what the copy says ("小太阳" / "sun icon"), so a
 * change to a more literal gear shape has to update the strings and the README
 * with it — or leave both alone.
 */
function GearGlyph() {
  return React.createElement(
    'svg',
    {
      viewBox: '0 0 16 16',
      width: 16,
      height: 16,
      'aria-hidden': true,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('circle', { cx: 8, cy: 8, r: 2.4 }),
    React.createElement('path', {
      d: 'M8 1.4v1.9M8 12.7v1.9M1.4 8h1.9M12.7 8h1.9M3.34 3.34l1.34 1.34M11.32 11.32l1.34 1.34M12.66 3.34l-1.34 1.34M4.68 11.32l-1.34 1.34',
    }),
  )
}

/**
 * The settings row: label + description on the left, the control on the right.
 * The description line is what makes a slider self-explanatory, so every row has
 * one.
 */
function SettingsRow(props) {
  return React.createElement(
    'div',
    { className: props.inline === true ? 'dshfs-row dshfs-row-inline' : 'dshfs-row' },
    React.createElement(
      'div',
      { className: 'dshfs-row-text' },
      React.createElement('div', { className: 'dshfs-row-label' }, props.label),
      props.description === undefined
        ? null
        : React.createElement('div', { className: 'dshfs-row-desc' }, props.description),
    ),
    props.children,
  )
}

/** The panel's switch, mirroring the shell's own look. */
function SettingsSwitch(props) {
  return React.createElement(
    'button',
    {
      type: 'button',
      className: 'dshfs-switch',
      role: 'switch',
      'aria-checked': props.checked ? 'true' : 'false',
      'aria-label': props.label,
      onClick: () => {
        props.onChange(!props.checked)
      },
    },
    React.createElement('span', { className: 'dshfs-knob' }),
  )
}

/** Label, live value, and a slider — the shape every numeric setting uses. */
function SettingsSlider(props) {
  return React.createElement(
    SettingsRow,
    { label: props.label, description: props.description },
    React.createElement(
      'div',
      { className: 'dshfs-sliderrow' },
      React.createElement('input', {
        type: 'range',
        className: 'dshfs-slider',
        min: 0,
        max: 100,
        step: 1,
        value: props.value,
        'aria-label': props.label,
        onChange: (event) => {
          props.onChange(clampNumber(event.target.value, 0, 100, props.value))
        },
      }),
      React.createElement('span', { className: 'dshfs-row-value' }, `${String(props.value)}%`),
    ),
  )
}

/** The settings dialog: panel look knobs, with the glass group option-gated. */
/**
 * The one-time introduction.
 *
 * It exists because two things about this panel are genuinely undiscoverable: that
 * double-clicking the header resets position and size, and that the gear in the
 * header opens the settings. A README does not help someone who never opens one.
 *
 * Closing reports whether the "do not show again" box was ticked, and the caller
 * decides what that means — this component holds no persistence of its own.
 */
function HintDialog(props) {
  const t = props.t
  const [muted, setMuted] = React.useState(false)

  return React.createElement(
    'div',
    {
      className: 'dshfs-tips-layer',
      onMouseDown: (event) => {
        if (event.target !== event.currentTarget) return
        props.onClose(muted)
      },
    },
    React.createElement(
      'div',
      {
        className: 'dshfs-tips',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('hint.title'),
      },
      React.createElement(
        'div',
        { className: 'dshfs-tips-head' },
        React.createElement('div', { className: 'dshfs-tips-title' }, t('hint.title')),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshfs-iconbtn',
            'aria-label': t('hint.close'),
            title: t('hint.close'),
            onClick: () => { props.onClose(muted) },
          },
          React.createElement(CloseGlyph, null),
        ),
      ),
      React.createElement(
        'div',
        { className: 'dshfs-tips-body' },
        React.createElement('p', { className: 'dshfs-tips-text' }, t('hint.reset')),
        React.createElement('p', { className: 'dshfs-tips-text' }, t('hint.settings')),
      ),
      React.createElement(
        'div',
        { className: 'dshfs-tips-foot' },
        React.createElement(
          'label',
          { className: 'dshfs-tips-check' },
          React.createElement('input', {
            type: 'checkbox',
            checked: muted,
            onChange: (event) => { setMuted(event.target.checked) },
          }),
          React.createElement('span', null, t('hint.mute')),
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshfs-btn',
            onClick: () => { props.onClose(muted) },
          },
          t('hint.ok'),
        ),
      ),
    ),
  )
}

/**
 * Capture a function key and use it as the summon hotkey.
 *
 * The listener runs in the capture phase so it sees the press before the panel's
 * own window-level hotkey handler does — otherwise pressing the candidate key
 * would toggle the panel instead of being recorded, and the user could never
 * rebind away from the current binding.
 */
function HotkeyPicker(props) {
  const t = props.t
  const [capturing, setCapturing] = React.useState(false)

  React.useEffect(() => {
    if (!capturing) return undefined
    const onKeyDown = (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setCapturing(false)
        return
      }
      if (!isUsableHotkeyName(event.key)) return
      setCapturing(false)
      props.onChange(event.key)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => { window.removeEventListener('keydown', onKeyDown, true) }
  }, [capturing, props])

  return React.createElement(
    'button',
    {
      type: 'button',
      className: capturing ? 'dshfs-btn dshfs-btn-capturing' : 'dshfs-btn',
      'data-capturing': capturing ? 'on' : 'off',
      onClick: () => { setCapturing(true) },
    },
    capturing ? t('settings.hotkey.capturing') : props.value,
  )
}

function SettingsDialog(props) {
  const t = props.t
  const settings = useSettings()
  // 毛玻璃与纯色共用同一组底色控件，两处判断走同一个名字，免得日后只改一处。
  const glassy = settings.glass || settings.solid

  return React.createElement(
    'div',
    {
      className: 'dshfs-settings-layer',
      // A click on the dialog's own backdrop closes only the dialog; the panel
      // stays. The panel's mask handler is kept out by stopPropagation.
      onMouseDown: (event) => {
        if (event.target !== event.currentTarget) return
        props.onClose()
      },
    },
    React.createElement(
      'div',
      {
        className: 'dshfs-settings',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('panel.settings'),
        // Observable switch state: the dependent glass knobs are gated on it, so
        // it is worth being able to assert from the outside.
        'data-glass': settings.glass ? 'on' : 'off',
        // 底色其实是个三态（都关 / 纯色 / 毛玻璃），`data-glass` 只说得清两态，
        // 所以再把纯色单独暴露出来。
        'data-solid': settings.solid ? 'on' : 'off',
      },
      React.createElement(
        'div',
        { className: 'dshfs-settings-head' },
        React.createElement('div', { className: 'dshfs-settings-title' }, t('panel.settings')),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshfs-iconbtn',
            'aria-label': t('panel.settings.close'),
            title: t('panel.settings.close'),
            onClick: props.onClose,
          },
          React.createElement(CloseGlyph, null),
        ),
      ),
      React.createElement(
        'div',
        { className: 'dshfs-settings-body' },
        // --- mask group ---------------------------------------------------
        // Each group owns one surface. The mask's knobs only ever change the mask,
        // and the pane's only ever change the pane, so the two can be tuned
        // independently instead of fighting over one blur.
        React.createElement('div', { className: 'dshfs-group' }, t('settings.groupMask')),
        React.createElement(
          SettingsRow,
          { inline: true, label: t('settings.mask'), description: t('settings.mask.desc') },
          React.createElement(SettingsSwitch, {
            checked: settings.mask,
            label: t('settings.mask'),
            onChange: (next) => { writeSettings({ mask: next }) },
          }),
        ),
        // The two knobs describe a mask, so with no mask there is nothing for them
        // to act on. Hidden rather than disabled, matching how the glass knobs
        // follow their own switch.
        settings.mask
          ? [
            React.createElement(SettingsSlider, {
              label: t('settings.maskOpacity'),
              description: t('settings.maskOpacity.desc'),
              value: settings.maskOpacity,
              onChange: (value) => {
                writeSettings({ maskOpacity: value })
              },
            }),
            React.createElement(SettingsSlider, {
              label: t('settings.maskFog'),
              description: t('settings.maskFog.desc'),
              value: settings.maskFog,
              onChange: (value) => {
                writeSettings({ maskFog: value })
              },
            }),
          ]
          : null,
        // --- pane glass group -------------------------------------------
        React.createElement('div', { className: 'dshfs-group' }, t('settings.groupGlass')),
        React.createElement(
          SettingsRow,
          { inline: true, label: t('settings.glass'), description: t('settings.glass.desc') },
          React.createElement(SettingsSwitch, {
            checked: settings.glass,
            label: t('settings.glass'),
            onChange: (next) => {
              // 与「纯色面板」互斥：开这个就关那个，两个开关不会同时亮着。
              // 互斥必须两边都写，只在一处关对方的话，另一个开关仍能留下
              // 「两个都亮」的状态。
              writeSettings(next ? { glass: true, solid: false } : { glass: false })
            },
          }),
        ),
        // 纯色面板与毛玻璃互斥，由这两处开关各自把对方关掉：两个都关才是全透明，
        // 这正是「关掉毛玻璃却得到透明面板」那一态的由来。底色与不透明度沿用毛玻璃
        // 那两个设置项，所以纯色也能调成半透明有色，而不是只能做死板的实心块。
        React.createElement(
          SettingsRow,
          { inline: true, label: t('settings.solid'), description: t('settings.solid.desc') },
          React.createElement(SettingsSwitch, {
            checked: settings.solid,
            label: t('settings.solid'),
            onChange: (next) => {
              // 开启时把底色拉到不透明：底色默认只有 25% 的浓度，不推满的话
              // 「纯色面板」看起来还是一层淡色，与开关的名字不符。这是一次性的
              // 默认值，用户随后仍可用下面的滑块调成半透明有色。
              writeSettings(next
                ? { solid: true, glass: false, glassOpacity: 100 }
                : { solid: false })
            },
          }),
        ),
        // 雾化只属于毛玻璃：纯色面板不模糊，所以它只跟毛玻璃这个开关走。
        settings.glass
          ? React.createElement(SettingsSlider, {
            key: 'glass-fog',
            label: t('settings.glassFog'),
            description: t('settings.glassFog.desc'),
            value: settings.glassFog,
            onChange: (value) => {
              writeSettings({ glassFog: value })
            },
          })
          : null,
        // 底色与不透明度只在「有底色」时才有意义——毛玻璃或纯色都算。两者都关
        // 时面板全透明，这两项无从作用，于是随开关一起隐藏。
        glassy
          ? [
            React.createElement(SettingsSlider, {
              key: 'glass-opacity',
              label: t('settings.glassOpacity'),
              description: t('settings.glassOpacity.desc'),
              value: settings.glassOpacity,
              onChange: (value) => {
                writeSettings({ glassOpacity: value })
              },
            }),
            React.createElement(
              SettingsRow,
              {
                key: 'glass-color',
                inline: true,
                label: t('settings.glassColor'),
                description: t('settings.glassColor.desc'),
              },
              React.createElement(
                'div',
                { className: 'dshfs-swatches' },
                GLASS_COLORS.map((choice) => React.createElement(
                  'button',
                  {
                    key: choice,
                    type: 'button',
                    className: 'dshfs-swatch',
                    style: {
                      background: choice === 'theme'
                        ? 'var(--dsw-alias-bg-layer-1,#fff)'
                        : choice,
                    },
                    'aria-label': choice === 'theme' ? t('settings.themeColor') : choice,
                    title: choice === 'theme' ? t('settings.themeColor') : choice,
                    'aria-pressed': settings.glassColor === choice ? 'true' : 'false',
                    onClick: () => {
                      writeSettings({ glassColor: choice })
                    },
                  },
                  choice === 'theme'
                    ? React.createElement('span', { className: 'dshfs-sr' }, t('settings.themeColor'))
                    : null,
                )),
                // A native colour input: clicking it opens the platform's own
                // picker, which is the whole point -- no wheel to invent, and it
                // is the picker the user already knows.
                //
                // A custom colour needs no new setting: `glassColor` has always
                // held a `#rrggbb` for the fixed presets, so a custom one is just
                // another value of the same field.
                React.createElement('input', {
                  type: 'color',
                  className: 'dshfs-swatch dshfs-swatch-picker',
                  // Its swatch shows the stored colour when that is a literal,
                  // and white otherwise (the theme marker has no literal form).
                  value: isGlassLiteral(settings.glassColor) ? settings.glassColor : '#ffffff',
                  'data-selected': isCustomGlassColor(settings.glassColor) ? 'true' : 'false',
                  'aria-label': t('settings.customColor'),
                  title: t('settings.customColor'),
                  onChange: (event) => {
                    writeSettings({ glassColor: event.target.value })
                  },
                }),
              ),
            ),
          ]
          : null,
        // --- behaviour group ---------------------------------------------
        // Not cosmetic, so it comes after the appearance groups: what the panel
        // remembers between openings, how it is summoned, and a way back to the
        // intro dialog.
        React.createElement('div', { className: 'dshfs-group' }, t('settings.groupBehaviour')),
        React.createElement(
          SettingsRow,
          { inline: true, label: t('settings.rememberSize'), description: t('settings.rememberSize.desc') },
          React.createElement(SettingsSwitch, {
            checked: settings.rememberSize,
            label: t('settings.rememberSize'),
            onChange: (next) => { writeSettings({ rememberSize: next }) },
          }),
        ),
        React.createElement(
          SettingsRow,
          { inline: true, label: t('settings.rememberPosition'), description: t('settings.rememberPosition.desc') },
          React.createElement(SettingsSwitch, {
            checked: settings.rememberPosition,
            label: t('settings.rememberPosition'),
            onChange: (next) => { writeSettings({ rememberPosition: next }) },
          }),
        ),
        React.createElement(
          SettingsRow,
          { label: t('settings.hotkey'), description: t('settings.hotkey.desc') },
          React.createElement(HotkeyPicker, {
            value: settings.hotkey,
            t,
            onChange: (next) => { writeSettings({ hotkey: next }) },
          }),
        ),
        React.createElement(
          SettingsRow,
          { inline: true, label: t('settings.showHint'), description: t('settings.showHint.desc') },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'dshfs-btn',
              onClick: props.onShowHint,
            },
            t('settings.showHint.button'),
          ),
        ),
      ),
    ),
  )
}

/**
 * The contribution itself.
 *
 * Props arrive from the slot runtime's standard kit: `useInput` and
 * `inputActions` are the per-session provide bundle `ui-conversation` installs
 * through `ctx.uiSession.provide({ hooks: ['input'], props: ['inputActions'] })`,
 * and `t` binds this plugin's own locale namespace.
 */
/** Stable empty lists, so an empty draft does not re-key the rail on every render. */
const EMPTY_OCCURRENCES = []
const EMPTY_ATTACHMENTS = []
const EMPTY_IDS = []

/** The panel's natural position: no drag offset. Shared so resetting is a no-op re-render. */
const NO_DRAG = { x: 0, y: 0 }

/**
 * How much of the panel has to stay on screen, in CSS pixels.
 *
 * Moving was left unbounded by request — but that was agreed when the position
 * was never remembered. Once it *is* remembered, unbounded movement becomes a
 * trap: drag the header past the edge, and the panel reopens off-screen forever,
 * with a reload making it worse by restoring the same bad offset. Keeping a strip
 * on screen costs the user nothing and removes the dead end entirely.
 */
const MIN_VISIBLE_X = 120
const MIN_VISIBLE_Y = 48

/** The pane's size, falling back to the sheet's responsive default. */
function currentPanelSize(size) {
  if (size !== null && size !== undefined) return size
  // Mirrors the sheet's `min(920px,100%)` / `min(76vh,720px)`. Duplicated on
  // purpose: clamping needs a number, and reading layout back would tie this to
  // a specific moment in the render.
  return {
    w: Math.min(920, window.innerWidth),
    h: Math.min(window.innerHeight * 0.76, 720),
  }
}

/**
 * Pull a drag offset back until enough of the panel is on screen.
 *
 * The pane is centred by a flex box, so its edges sit at `(viewport - size) / 2`
 * plus the offset; the clamp is expressed in edge terms and converted back, which
 * keeps it correct at any size or window dimension.
 */
function clampOffset(offset, size) {
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight
  const { w, h } = currentPanelSize(size)
  const left = (viewportW - w) / 2 + offset.x
  const top = (viewportH - h) / 2 + offset.y
  // The header sits at the top edge, so the top is the edge that must not escape;
  // horizontally either side may hang off as long as a strip remains.
  const clampedLeft = Math.min(viewportW - MIN_VISIBLE_X, Math.max(MIN_VISIBLE_X - w, left))
  const clampedTop = Math.min(viewportH - MIN_VISIBLE_Y, Math.max(0, top))
  return {
    x: Math.round(offset.x + (clampedLeft - left)),
    y: Math.round(offset.y + (clampedTop - top)),
  }
}

/**
 * Whether the intro dialog has been shown since this bundle loaded.
 *
 * Deliberately **not** persisted. The dialog's "do not show again" box is what
 * makes suppression permanent; merely closing it should bring it back on the next
 * launch, which is what was asked for. Resetting on reload is therefore the
 * correct behaviour, not an oversight.
 */
let hintShownThisLaunch = false

/**
 * Session-scoped capabilities this panel needs, resolved through the slot
 * entry's `inject(sessionId)` callback — the supported way for a slot component
 * to reach past its standard props.
 *
 * Two things live here, and they are reached differently:
 *
 * - `insertReference` puts a reference chip back after the panel's own
 *   `setDraft` flattened it. It sits on the **per-session** input facade, which
 *   is reachable only through a session-scope Context — the plugin's own
 *   Context is root-scope, so reaching for it from there silently found nothing.
 * - `resolveAttachments` turns `InputState.attachmentIds` into real descriptors
 *   (including an image's preview URL). The conversation service is a **root
 *   singleton**, so this one does not depend on the session scope at all — it
 *   is routed through here only to keep the component's contract in one place.
 *
 * Both are read-only. Every link is checked and a missing one is simply absent
 * from the result, so the panel falls back to what it did before instead of
 * breaking.
 */
function sessionApiFor(conversation, sessions, sessionId) {
  const api = {}

  if (conversation !== null && conversation !== undefined
    && typeof conversation.resolveDraftAttachments === 'function') {
    api.resolveAttachments = (ids) => {
      try {
        const resolved = conversation.resolveDraftAttachments(ids)
        return Array.isArray(resolved) ? resolved : EMPTY_ATTACHMENTS
      } catch (error) {
        return EMPTY_ATTACHMENTS
      }
    }
  }

  if (sessions === null || sessions === undefined || typeof sessions.scope !== 'function') return api
  let actx
  try {
    actx = sessions.scope(sessionId)
  } catch (error) {
    return api
  }
  if (actx === null || actx === undefined || typeof actx.get !== 'function') return api
  let scoped
  try {
    scoped = actx.get('conversation')
  } catch (error) {
    return api
  }
  const resolver = scoped === null || scoped === undefined ? undefined : scoped.input
  if (resolver === null || resolver === undefined || typeof resolver.for !== 'function') return api
  let target
  try {
    target = resolver.for(actx)
  } catch (error) {
    return api
  }
  if (target === null || target === undefined || typeof target.insertReference !== 'function') return api
  api.insertReference = (reference, span) => {
    try {
      return target.insertReference(reference, span) === true
    } catch (error) {
      return false
    }
  }
  return api
}

/**
 * Work out which references can be put back, and where.
 *
 * The occurrences are matched against the **edited** text by their clipboard
 * form, in order: a reference the user deleted or rewrote simply is not found
 * and is not restored — only the ones still present verbatim come back.
 *
 * Replacing a span with a chip leaves the clipboard projection unchanged (the
 * chip's clipboard form is that same text), so the offsets stay valid and the
 * plan can be computed once, in one forward pass.
 */
function planReferenceRebuild(text, occurrences) {
  const plan = []
  let cursor = 0
  const ordered = occurrences.slice().sort((a, b) => a.offset - b.offset)
  for (const occurrence of ordered) {
    const needle = typeof occurrence.clipboardText === 'string' && occurrence.clipboardText !== ''
      ? occurrence.clipboardText
      : occurrence.ref
    if (typeof needle !== 'string' || needle === '') continue
    const at = text.indexOf(needle, cursor)
    if (at < 0) continue
    cursor = at + needle.length
    plan.push({
      start: at,
      end: at + needle.length,
      insert: {
        source: occurrence.source,
        ref: occurrence.ref,
        label: occurrence.label,
        appearance: occurrence.appearance,
        clipboardText: occurrence.clipboardText,
      },
    })
  }
  return plan
}

/**
 * Work out what the draft becomes when one reference is removed.
 *
 * A reference is **draft text**, not an attachment: the host keeps `@path` in
 * the document and reports it in `occurrences`, so the only way to remove one is
 * to edit that text. This returns the new text, or `null` when the reference
 * cannot be located -- in which case the caller must not claim to have removed
 * anything.
 *
 * Two shapes have to be told apart, and confusing them destroys user content:
 *
 * - the reference owns its line (`@a.ts\n`, or a line between two newlines): the
 *   line goes with it, newline included, so no blank line is left behind;
 * - the reference sits inside a sentence (`see @a.ts here`): only the reference
 *   goes, and the two spaces closing up behind it collapse into one.
 *
 * Deleting the whole line in the second case would empty a draft that has other
 * words in it, which is the one outcome a remove button must never produce.
 */
function planReferenceRemoval(text, occurrence) {
  if (typeof text !== 'string') return null
  if (occurrence === null || occurrence === undefined || typeof occurrence !== 'object') return null
  const needle = typeof occurrence.clipboardText === 'string' && occurrence.clipboardText !== ''
    ? occurrence.clipboardText
    : occurrence.ref
  if (typeof needle !== 'string' || needle === '') return null

  // `offset` is only a hint. The panel's own writes go through `setDraft`, which
  // rebuilds the document, so the offset the host reported may no longer point
  // at this reference. It is trusted only where the text really is there, and
  // otherwise the first verbatim match is used.
  const offset = typeof occurrence.offset === 'number' ? occurrence.offset : -1
  const at = offset >= 0 && text.slice(offset, offset + needle.length) === needle
    ? offset
    : text.indexOf(needle)
  if (at < 0) return null

  const end = at + needle.length
  // `charAt` returns '' past either end, which is exactly the "start of the
  // string" / "end of the string" the line test needs.
  const before = text.charAt(at - 1)
  const after = text.charAt(end)
  const ownsLine = (before === '' || before === '\n') && (after === '' || after === '\n')

  if (!ownsLine) {
    const joined = text.slice(0, at) + text.slice(end)
    // `see @a.ts here` -> `see  here`: the reference took one space with it and
    // left the other behind, so one of the pair goes too.
    if (at > 0 && joined.charAt(at - 1) === ' ' && joined.charAt(at) === ' ') {
      return joined.slice(0, at) + joined.slice(at + 1)
    }
    return joined
  }

  // Prefer the newline that follows, so a reference at the top of the draft
  // leaves the rest starting where it did. The one before it is only taken when
  // there is no trailing newline to take -- the last line of the draft.
  if (after === '\n') return text.slice(0, at) + text.slice(end + 1)
  if (before === '\n') return text.slice(0, at - 1)
  // The whole draft was this one reference, so it becomes empty.
  return ''
}

/** The host's own reference glyph when primitives is available, else a text stand-in. */
function referenceGlyph(appearance) {
  const kind = appearance === 'folder' || appearance === 'session' ? appearance : 'file'
  if (primitives !== null && typeof primitives.ReferenceIconRegular === 'function') {
    return React.createElement(primitives.ReferenceIconRegular, { kind, size: 14 })
  }
  return React.createElement('span', { className: 'dshfs-ref-glyph' }, kind === 'folder' ? '▸' : '@')
}

/** The attachment-count glyph, same fallback policy as the reference one. */
function attachmentGlyph() {
  if (primitives !== null && typeof primitives.IconPaperclipOutlineRegular === 'function') {
    return React.createElement(primitives.IconPaperclipOutlineRegular, { size: 14 })
  }
  return React.createElement('span', { className: 'dshfs-ref-glyph' }, '·')
}

/** The host's file-type glyph for a file name, classified the same way it classifies one. */
function fileTypeGlyph(name) {
  if (primitives !== null && typeof primitives.FileTypeIcon === 'function') {
    return React.createElement(primitives.FileTypeIcon, { path: name, size: 14 })
  }
  return React.createElement('span', { className: 'dshfs-ref-glyph' }, '·')
}

/** The composer's own add glyph, so the panel's button reads as the same control. */
function addFilesGlyph() {
  if (primitives !== null && typeof primitives.IconPlusOutlineMedium === 'function') {
    return React.createElement(primitives.IconPlusOutlineMedium, { size: 16 })
  }
  return React.createElement('span', { className: 'dshfs-ref-glyph' }, '+')
}

/** The composer's removal glyph, same fallback policy as the others. */
function removeAttachmentGlyph() {
  if (primitives !== null && typeof primitives.IconCloseFillRegular === 'function') {
    return React.createElement(primitives.IconCloseFillRegular, { size: 12 })
  }
  return React.createElement('span', { className: 'dshfs-ref-glyph' }, '×')
}

/** The host's own hidden file input, located by semantics rather than by class name. */
function findHostFilePicker() {
  try {
    const candidates = document.querySelectorAll('input[type="file"][multiple]')
    for (const node of candidates) {
      if (node.disabled === true) continue
      return node
    }
  } catch (error) {
    // Fall through to null.
  }
  return null
}

/**
 * Open the host's own file dialog.
 *
 * There is no plugin-facing API for this. `pickFiles` lives on an input hub that
 * the slot props never expose, and the command menu entry that reaches it would
 * open *behind* this full-screen panel anyway — so driving the menu would mean
 * clicking an invisible item and hoping.
 *
 * What the host ultimately does is simpler than that: its own "+" flow ends in
 * `fileInputRef.current.click()` on a hidden `<input type="file" multiple>` it
 * renders right beside the add button. Clicking that element runs exactly the
 * same intake path — including the decision that turns a non-image file with a
 * real path into an `@path` chip while images keep uploading — with no host code
 * touched.
 *
 * A miss simply does nothing: no picker beats a broken panel. Called from a
 * click handler, so it stays inside the user gesture the browser requires before
 * it will open a file dialog.
 */
function openHostFilePicker() {
  const input = findHostFilePicker()
  if (input === null) return false
  try {
    input.click()
    return true
  } catch (error) {
    return false
  }
}

/**
 * Hand already-obtained files to the host's intake, as if the user had picked them.
 *
 * This is what makes pasting work. The host's own paste handling lives in its
 * Lexical editor, which this panel does not have — it is a textarea. But the
 * intake it eventually calls is reachable the same way the add button reaches
 * it: stage the files on the host's own file input and dispatch the `change` it
 * already listens for.
 *
 * Nothing is read back out: the host clears `value` itself, exactly as it does
 * for a real selection, so its `onPickFiles` sees the same shape either way.
 */
function adoptHostFiles(files) {
  const input = findHostFilePicker()
  if (input === null || files.length === 0) return false
  try {
    const transfer = new DataTransfer()
    for (const file of files) transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  } catch (error) {
    return false
  }
}

/**
 * What the draft carries besides its text: the reference chips, and how many
 * attachments are riding along.
 *
 * Neither of those lives in `draft`. The host's composer is a rich-text
 * document; `draft` is only its **clipboard-text projection**, in which every
 * chip has already been flattened to its `@path` form — and the attachment
 * array never appears in that string at all. So a panel that renders just the
 * textarea shows a strictly poorer view than the composer does, which is
 * exactly what a user sees as "my file turned into text". This rail closes
 * that gap.
 *
 * The host's own chip component is not exported by its package, so the glyphs
 * are rebuilt here out of `dsh-client-ui-primitives`.
 */
function ReferenceRail(props) {
  const t = props.t
  const occurrences = props.occurrences
  const attachments = props.attachments
  const items = []
  for (const attachment of attachments) {
    const file = attachment === null || attachment === undefined ? undefined : attachment.file
    const name = file !== undefined && typeof file.name === 'string' && file.name !== ''
      ? file.name
      : String(t('panel.attachment'))
    // Only image drafts carry a preview URL. Everything else is shown by name
    // with the host's own file-type glyph, which is how the composer presents a
    // file card too.
    // The remove control mirrors the composer's: hidden until hover or keyboard
    // focus, and left visible where there is no hover to give (touch). Removal
    // runs the composer's own `removeAttachment`, so the host aborts any upload
    // still in flight -- nothing is torn down from here.
    const isImage = attachment.kind === 'image'
      && typeof attachment.previewUrl === 'string' && attachment.previewUrl !== ''
    items.push(React.createElement(
      'span',
      { key: attachment.id, className: 'dshfs-att' },
      isImage
        ? React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshfs-ref-image',
            title: name,
            'aria-label': name,
            onClick: () => { props.onPreview({ src: attachment.previewUrl, alt: name }) },
          },
          React.createElement('img', { src: attachment.previewUrl, alt: name }),
        )
        : React.createElement(
          'span',
          { className: 'dshfs-ref-file', title: name },
          fileTypeGlyph(name),
          React.createElement('span', { className: 'dshfs-ref-label' }, name),
        ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dshfs-att-remove',
          'aria-label': String(t('panel.removeAttachment')).replace('{name}', name),
          title: String(t('panel.removeAttachment')).replace('{name}', name),
          onClick: () => { props.onRemove(attachment.id) },
        },
        removeAttachmentGlyph(),
      ),
    ))
  }
  // When the descriptors could not be resolved, fall back to saying how many
  // there are rather than showing nothing at all.
  if (attachments.length === 0 && props.attachmentCount > 0) {
    items.push(React.createElement(
      'span',
      { key: 'attachments', className: 'dshfs-ref-count' },
      attachmentGlyph(),
      String(t('panel.attachments')).replace('{count}', String(props.attachmentCount)),
    ))
  }
  // Say so when the references cannot be protected. Without the host's
  // `insertReference` this rail is only a report: editing will flatten them.
  if (occurrences.length > 0 && props.restorable === false) {
    items.push(React.createElement(
      'span',
      { key: 'at-risk', className: 'dshfs-ref-warn', title: t('panel.refs.atRisk') },
      '⚠',
    ))
  }
  for (const occurrence of occurrences) {
    const label = typeof occurrence.label === 'string' && occurrence.label !== ''
      ? occurrence.label
      : occurrence.ref
    const chip = React.createElement(
      'span',
      {
        className: 'dshfs-ref',
        // Short label in the row; the full target in the tooltip.
        title: `${String(occurrence.ref)}\n${String(t('panel.refs.title'))}`,
      },
      referenceGlyph(occurrence.appearance),
      React.createElement('span', { className: 'dshfs-ref-label' }, String(label)),
    )
    // A reference is removed by editing the draft text it stands for (see
    // `planReferenceRemoval`), which only works while that text can still be
    // found. When it cannot -- the draft moved on since the host reported this
    // occurrence -- no button is drawn: a control that silently does nothing is
    // the very thing this rail exists to stop doing. It also keeps an image
    // draft, whose reference has no matching text of its own, from growing a
    // second remove control beside the one on its attachment.
    const removable = props.onRemoveReference !== undefined
      && props.onRemoveReference !== null
      && planReferenceRemoval(props.draft, occurrence) !== null
    if (!removable) {
      items.push(React.cloneElement(chip, { key: occurrence.occurrenceId }))
      continue
    }
    const removeLabel = String(t('panel.removeReference')).replace('{name}', String(label))
    items.push(React.createElement(
      'span',
      { key: occurrence.occurrenceId, className: 'dshfs-att' },
      chip,
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dshfs-att-remove',
          'aria-label': removeLabel,
          title: removeLabel,
          onClick: () => { props.onRemoveReference(occurrence) },
        },
        removeAttachmentGlyph(),
      ),
    ))
  }
  return React.createElement('div', { className: 'dshfs-refs' }, items)
}

function FullscreenInputDock(props) {
  const t = props.t
  const sessionId = props.sessionId
  const inputActions = props.inputActions
  const useInput = props.useInput
  // Arrives from the slot entry's `inject(sessionId)` callback; absent whenever
  // the session scope or the facade could not be resolved.
  const insertReference = props.insertReference
  const resolveAttachments = props.resolveAttachments

  // One panel state per session cell: opener, visibility, the nested settings
  // dialog, and the ref the panel's own key handling and the document-level
  // Escape guard share.
  const [open, setOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const textRef = React.useRef(null)
  const layerRef = React.useRef(null)
  const focusFrameRef = React.useRef(0)

  const settings = useSettings()
  // A closed panel cannot host a dialog: the state is derived on read rather
  // than synced by an effect, so no render can ever see the combination.
  const dialogOpen = open && settingsOpen

  const input = typeof useInput === 'function' ? useInput((s) => s) : undefined
  const draft = draftTextOf(input === undefined || input === null ? '' : input.draft)
  const phase = input === undefined || input === null ? 'inert' : input.phase
  const busy = phase === 'adjudicating' || phase === 'submitting'
  const writable = inputActions !== undefined && inputActions !== null && typeof inputActions.setDraft === 'function'
  const sendable = inputActions !== undefined && inputActions !== null && typeof inputActions.submit === 'function'
  const attachmentIds = input !== undefined && input !== null && Array.isArray(input.attachmentIds) ? input.attachmentIds : EMPTY_IDS
  const attachmentCount = attachmentIds.length
  // The chip view of the editor document. Sorted by offset by the host; empty
  // whenever the draft has no references -- or whenever a programmatic
  // `setDraft` has just flattened them into plain text (see rebuildReferences).
  const occurrences = input !== undefined && input !== null && Array.isArray(input.occurrences) ? input.occurrences : EMPTY_OCCURRENCES
  /** Monotonic editor revision; `insertReference` compares the span against it. */
  const draftRev = input !== undefined && input !== null && typeof input.draftRev === 'number' ? input.draftRev : 0

  // The store keeps attachment **ids only** ("browser objects stay in
  // ConversationController"), so the descriptors -- and with them an image's
  // preview URL -- have to be asked for by id. That lookup is a read: nothing
  // about the host's own behaviour changes.
  const attachmentKey = attachmentIds.join('\u0000')
  const [attachments, setAttachments] = React.useState(EMPTY_ATTACHMENTS)
  React.useEffect(() => {
    if (typeof resolveAttachments !== 'function' || attachmentIds.length === 0) {
      setAttachments(EMPTY_ATTACHMENTS)
      return
    }
    setAttachments(resolveAttachments(attachmentIds))
  }, [attachmentKey, resolveAttachments])

  /** The image currently shown in the lightbox, if any. */
  const [preview, setPreview] = React.useState(null)
  const empty = draft.trim() === '' && attachmentCount === 0
  const blocked = !writable || sessionId === undefined || phase === 'inert'

  /** Focus the panel's textarea and land the caret at the end of the text. */
  const focusText = React.useCallback(() => {
    const node = textRef.current
    if (node === null || node === undefined) return
    try {
      node.focus({ preventScroll: true })
      const end = node.value.length
      node.setSelectionRange(end, end)
    } catch (error) {
      /* a detached node needs no focus */
    }
  }, [])

  /** Close the panel and any dialog inside it (a dialog cannot outlive its panel). */
  const close = React.useCallback(() => {
    setSettingsOpen(false)
    setOpen(false)
  }, [])

  /**
   * Where the user has dragged the panel to, as a translation from its natural
   * centred position.
   *
   * A transform rather than `left`/`top`: the panel is centred by the layer's
   * flex box, and shifting it this way leaves that layout untouched. It is
   * deliberately **not** persisted -- the panel comes back centred every time it
   * is opened, which is what was asked for.
   */
  // Where the panel sits. Restored from settings when the user asked to remember
  // it; otherwise it starts centred and is reset every time the panel is hidden.
  const [dragOffset, setDragOffset] = React.useState(
    () => (currentSettings.rememberPosition
      // Clamped on the way in. A stored offset can be unusable for reasons the
      // user never chose: a window that is now smaller, or a build from before
      // the clamp existed. Neither should be able to strand the panel.
      ? clampOffset(
        { x: currentSettings.panelOffsetX, y: currentSettings.panelOffsetY },
        storedPanelSize(),
      )
      : NO_DRAG),
  )
  // Read on release rather than captured, so the persist call stays out of the
  // callback's dependency list.
  const dragOffsetRef = React.useRef(dragOffset)
  dragOffsetRef.current = dragOffset
  const dragRef = React.useRef(null)
  const [hintOpen, setHintOpen] = React.useState(false)

  /**
   * The panel's size.
   *
   * Initialised from storage and carried here while a resize is in flight; the
   * settled value is written back to settings so the panel reopens at the size
   * it was left at. `null` means "no explicit size" and lets the sheet's
   * responsive default apply.
   */
  // Gated on the switch, exactly like the position. Reading the stored size while
  // remembering is off is what made the switch look broken: the value came back on
  // every load no matter what the setting said.
  const [size, setSize] = React.useState(
    () => (currentSettings.rememberSize ? storedPanelSize() : null),
  )
  const sizeRef = React.useRef(size)
  sizeRef.current = size
  const resizeRef = React.useRef(null)
  const panelRef = React.useRef(null)

  /**
   * Start dragging from the header.
   *
   * Three things this has to get right, none of them obvious:
   * - a press that lands on a control (the gear, the close button) must not start
   *   a drag, or those buttons stop working;
   * - `preventDefault` keeps the press from selecting the header text and from
   *   pulling focus out of the textarea;
   * - pointer capture keeps the drag alive once the pointer leaves the header,
   *   which is the whole point of dragging something.
   */
  const onHeadPointerDown = React.useCallback((event) => {
    if (event.button !== 0) return
    const target = event.target
    if (target !== null && target !== undefined && typeof target.closest === 'function'
      && target.closest('button') !== null) return
    event.preventDefault()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    }
    const capture = event.currentTarget
    if (capture !== null && capture !== undefined && typeof capture.setPointerCapture === 'function') {
      try {
        capture.setPointerCapture(event.pointerId)
      } catch (error) {
        // Without capture the drag still works while the pointer stays inside.
      }
    }
  }, [dragOffset])

  const onHeadPointerMove = React.useCallback((event) => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    // Clamped while dragging rather than on release, so the panel simply refuses
    // to go further instead of snapping back after the fact.
    setDragOffset(clampOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    }, sizeRef.current))
  }, [])

  const onHeadPointerUp = React.useCallback((event) => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    const capture = event.currentTarget
    if (capture !== null && capture !== undefined && typeof capture.releasePointerCapture === 'function') {
      try {
        capture.releasePointerCapture(event.pointerId)
      } catch (error) {
        // Already released, or never captured.
      }
    }
    // Only when the user asked for it, and only on release: persisting on every
    // move would write localStorage dozens of times per drag.
    if (currentSettings.rememberPosition) {
      const settled = dragOffsetRef.current
      writeSettings({
        panelOffsetX: Math.round(settled.x),
        panelOffsetY: Math.round(settled.y),
      })
    }
  }, [])

  /**
   * Double-clicking the header restores both at once: the panel recentres, and
   * it goes back to its default size — with the stored size cleared so the next
   * open agrees.
   */
  const onHeadDoubleClick = React.useCallback(() => {
    setDragOffset(NO_DRAG)
    setSize(null)
    // The stored values are cleared too, or the next open would restore what the
    // user just reset away from.
    writeSettings({ panelWidth: 0, panelHeight: 0, panelOffsetX: 0, panelOffsetY: 0 })
  }, [])

  /**
   * Start a resize from one of the eight handles.
   *
   * `dir` names the edges being dragged — any combination of n/s/e/w, so a
   * corner drags two at once and the panel's *shape* changes, not merely its
   * size. The starting size is read from the live rect rather than from state,
   * because the first drag happens while the panel is still on its responsive
   * default.
   */
  const onResizePointerDown = React.useCallback((event, dir) => {
    if (event.button !== 0) return
    const panel = panelRef.current
    if (panel === null || panel === undefined) return
    event.preventDefault()
    const rect = panel.getBoundingClientRect()
    resizeRef.current = {
      pointerId: event.pointerId,
      dir,
      startX: event.clientX,
      startY: event.clientY,
      startW: rect.width,
      startH: rect.height,
      startOffsetX: dragOffset.x,
      startOffsetY: dragOffset.y,
    }
    const capture = event.currentTarget
    if (capture !== null && capture !== undefined && typeof capture.setPointerCapture === 'function') {
      try {
        capture.setPointerCapture(event.pointerId)
      } catch (error) {
        // Without capture the resize still works while the pointer stays inside.
      }
    }
    // `dragOffset` is a dependency: the west/north compensation below is applied
    // on top of wherever the panel has been moved to, so a stale closure here
    // would snap it back to the offset it had when the callback was created.
  }, [dragOffset])

  const onResizePointerMove = React.useCallback((event) => {
    const drag = resizeRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    const { dir } = drag
    // Bounded by the viewport. Unlike moving the panel, an oversized pane would
    // push its own handles off-screen, leaving no way to shrink it back.
    const maxW = Math.max(MIN_PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN)
    const maxH = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - VIEWPORT_MARGIN)
    const rawW = dir.includes('e') ? drag.startW + dx : dir.includes('w') ? drag.startW - dx : drag.startW
    const rawH = dir.includes('s') ? drag.startH + dy : dir.includes('n') ? drag.startH - dy : drag.startH
    const w = Math.min(maxW, Math.max(MIN_PANEL_WIDTH, Math.round(rawW)))
    const h = Math.min(maxH, Math.max(MIN_PANEL_HEIGHT, Math.round(rawH)))
    setSize({ w, h })
    // The pane is centred by a flex box, so it grows out from its middle: change
    // a dimension and *both* of its edges move. Compensating by half the change
    // pins the edge the user is *not* dragging, so only the grabbed edge appears
    // to move.
    //
    // Every direction needs this, not just west and north — dragging the east
    // edge without it moves the left edge too, which reads as "the whole panel is
    // being dragged from both sides". The sign flips with the direction.
    const signX = (dir.includes('e') ? 1 : 0) - (dir.includes('w') ? 1 : 0)
    const signY = (dir.includes('s') ? 1 : 0) - (dir.includes('n') ? 1 : 0)
    // Growing the pane pushes its top edge upward, so a resize can strand the panel
    // off-screen exactly as a drag can — hence the clamp here too.
    setDragOffset(clampOffset({
      x: drag.startOffsetX + (signX * (w - drag.startW)) / 2,
      y: drag.startOffsetY + (signY * (h - drag.startH)) / 2,
    }, { w, h }))
  }, [])

  const onResizePointerUp = React.useCallback((event) => {
    const drag = resizeRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    resizeRef.current = null
    const capture = event.currentTarget
    if (capture !== null && capture !== undefined && typeof capture.releasePointerCapture === 'function') {
      try {
        capture.releasePointerCapture(event.pointerId)
      } catch (error) {
        // Already released, or never captured.
      }
    }
    // Only when the user asked for it, and only on release: persisting on every
    // move would write localStorage dozens of times per drag for a value nothing
    // reads until the next open.
    //
    // Writing unconditionally left a size in storage that the next load would
    // restore regardless of the switch — half of the bug that made "remember size"
    // look permanently on.
    if (currentSettings.rememberSize) {
      const settled = sizeRef.current
      if (settled !== null) {
        writeSettings({ panelWidth: settled.w, panelHeight: settled.h })
      }
    }
  }, [])

  /**
   * Show the intro dialog once per launch, unless it has been muted for good.
   *
   * Triggered by the panel *opening*, not by the button press, so it appears over
   * the panel it is describing.
   */
  React.useEffect(() => {
    if (!open || settings.hintMuted || hintShownThisLaunch) return
    hintShownThisLaunch = true
    setHintOpen(true)
  }, [open, settings.hintMuted])

  /**
   * Summon or dismiss the panel with the configured function key.
   *
   * Escape already closes; this only adds a way in — and the same key back out,
   * which is what every other panel-style UI does. Anything carrying a modifier
   * is ignored so a rebind can never shadow a host or browser shortcut.
   */
  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== settings.hotkey) return
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      event.preventDefault()
      setOpen((was) => !was)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [settings.hotkey])

  // On hide, either park at the remembered spot or return to centre. Keeping the
  // offset while hidden would be wrong either way: with remembering off it must
  // not survive, and with it on the stored value is the one that counts.
  React.useEffect(() => {
    if (open) return
    setDragOffset(settings.rememberPosition
      ? clampOffset(
        { x: settings.panelOffsetX, y: settings.panelOffsetY },
        storedPanelSize(),
      )
      : NO_DRAG)
    // Same shape for the size, so flipping either switch has an immediate,
    // matching effect the next time the panel is opened.
    setSize(settings.rememberSize ? storedPanelSize() : null)
  }, [open, settings.rememberSize, settings.rememberPosition, settings.panelOffsetX, settings.panelOffsetY])

  const closeSettings = React.useCallback(() => {
    setSettingsOpen(false)
  }, [])

  /**
   * Dismiss the intro dialog, honouring the "do not show again" box.
   *
   * Only a *ticked* box mutes it for good; a plain close leaves the setting alone
   * so the dialog returns on the next launch, which is what was asked for.
   */
  const closeHint = React.useCallback((muted) => {
    setHintOpen(false)
    if (muted === true) writeSettings({ hintMuted: true })
  }, [])

  // The Escape handler is installed once per "panel open" and must not be
  // reinstalled every time the dialog toggles, so it reads the dialog state
  // through a ref instead of capturing it.
  const dialogOpenRef = React.useRef(dialogOpen)
  dialogOpenRef.current = dialogOpen

  /**
   * Open or close. Opening only flips visibility: the text is already the
   * composer's draft, so there is nothing to copy and nothing to clear.
   */
  const toggle = React.useCallback(() => {
    setOpen((was) => !was)
  }, [])

  // Focus on open. Deliberately not an early focus on mount: the panel is the
  // only thing that may move focus, and only once it is actually visible.
  React.useEffect(() => {
    if (!open) return undefined
    focusFrameRef.current = requestAnimationFrame(() => {
      focusText()
    })
    return () => {
      if (focusFrameRef.current !== 0) {
        cancelAnimationFrame(focusFrameRef.current)
        focusFrameRef.current = 0
      }
    }
  }, [open, focusText])

  /**
   * Escape guard.
   *
   * The panel is not a host modal, so an Escape pressed inside it must not also
   * reach shell-level 'back'/'close' shortcuts: that would dismiss the
   * surrounding view while the panel is still up, or worse, take the panel and
   * the view down together. A capture-phase listener on the document runs before
   * any bubble-phase shell handler and stops the event only when it started
   * inside this panel — a host dialog rendered elsewhere keeps its own Escape.
   *
   * This is not the "hijack the keyboard globally" the brief warns about: the
   * listener exists only while the panel is open, handles exactly one key, and
   * never touches Enter or any typing key.
   */
  React.useEffect(() => {
    if (!open) return undefined
    const onKeyDownCapture = (event) => {
      if (event.key !== 'Escape' && event.key !== 'Esc') return
      const layer = layerRef.current
      const target = event.target
      const inside = layer !== null && layer !== undefined && target !== null && target !== undefined
        && typeof layer.contains === 'function' && layer.contains(target)
      if (!inside && target !== document.body && target !== document.documentElement) return
      event.preventDefault()
      event.stopPropagation()
      // Escape unwinds one layer at a time: the settings dialog first, the panel
      // second. Closing both at once would throw away the panel the user was
      // writing in just because they dismissed a settings sheet.
      if (dialogOpenRef.current) closeSettings()
      else close()
    }
    // Escape is owned by the document capture phase rather than by an onKeyDown
    // on the textarea, so a caret inside the text and a press on the panel
    // chrome behave alike. This is the only key the panel ever claims: every
    // Enter variant is left to the textarea's native newline.
    document.addEventListener('keydown', onKeyDownCapture, true)
    return () => {
      document.removeEventListener('keydown', onKeyDownCapture, true)
    }
  }, [open, close])

  /** Chips photographed just before a write flattened them; consumed by the effect below. */
  const pendingRestoreRef = React.useRef(null)

  /**
   * Write the whole draft through the composer's own action face.
   *
   * `setDraft` rebuilds the editor document out of plain-text lines and does no
   * `@` parsing, so **every reference chip in the draft is destroyed by this
   * write**. That is invisible in the textarea — the clipboard projection reads
   * the same before and after — but it is real loss for the host: `occurrences`
   * empties and the composer stops treating those paths as references. So
   * photograph the chips first, and let the effect below put them back.
   */
  const writeDraft = React.useCallback(
    (next) => {
      if (!writable) return
      if (occurrences.length > 0) {
        pendingRestoreRef.current = { occurrences: occurrences.slice() }
      }
      try {
        inputActions.setDraft(next)
      } catch (error) {
        console.warn('fullscreen-input: setDraft refused the write', error)
      }
    },
    [inputActions, writable, occurrences],
  )

  /**
   * Hand one attachment back to the composer's own removal action.
   *
   * `inputActions.removeAttachment` is the shipped path, so an upload still in
   * flight is aborted by the host that owns it rather than torn down here.
   */
  const removeAttachment = React.useCallback(
    (id) => {
      if (inputActions === null || inputActions === undefined) return
      if (typeof inputActions.removeAttachment !== 'function') return
      try {
        inputActions.removeAttachment(id)
      } catch (error) {
        console.warn('fullscreen-input: removeAttachment refused', error)
      }
    },
    [inputActions],
  )

  /**
   * Remove one reference by editing the draft text it stands for.
   *
   * `removeAttachment` is a no-op on a reference: a file reference is not an
   * attachment, it is `@path` text in the draft which the host additionally
   * reports in `occurrences`. The shipped removal path therefore cannot help
   * here, and that text is the only handle there is.
   *
   * The write goes through `writeDraft` like every other write from this panel,
   * so the remaining chips are photographed first. The removed one is in that
   * photograph too, but `planReferenceRebuild` matches occurrences by text,
   * finds nothing for it in the new draft, and leaves it out.
   */
  const removeReference = React.useCallback(
    (occurrence) => {
      const next = planReferenceRemoval(draft, occurrence)
      if (next === null) return
      writeDraft(next)
    },
    [draft, writeDraft],
  )

  /**
   * Put the references back, one chip per editor revision.
   *
   * `insertReference` is revision-guarded — the span carries the `draftRev` it
   * was planned against — so each insertion invalidates the span of the next.
   * Rather than guess how the host advances that counter, this inserts a single
   * chip per pass and lets the next revision re-enter the effect. Replacing a
   * run of text with a chip leaves the clipboard projection byte-identical, so
   * the offsets planned up front stay valid for the whole run.
   *
   * A refusal, or a probe that comes back empty, simply ends the attempt: the
   * references stay plain text, which is precisely what this panel did before.
   * Nothing here can leave the draft worse off than not trying.
   */
  React.useEffect(() => {
    const pending = pendingRestoreRef.current
    if (pending === null) return
    if (typeof insertReference !== 'function') {
      pendingRestoreRef.current = null
      return
    }
    if (pending.plan === undefined) {
      pending.plan = planReferenceRebuild(draft, pending.occurrences)
      pending.index = 0
    }
    if (pending.index >= pending.plan.length) {
      pendingRestoreRef.current = null
      return
    }
    const step = pending.plan[pending.index]
    let applied = false
    try {
      applied = insertReference(step.insert, { start: step.start, end: step.end, draftRev }) === true
    } catch (error) {
      applied = false
    }
    if (!applied) {
      pendingRestoreRef.current = null
      return
    }
    pending.index += 1
    if (pending.index >= pending.plan.length) pendingRestoreRef.current = null
  }, [draft, draftRev, insertReference])

  /**
   * Forward wheels that land on the mask to whatever is behind it.
   *
   * Bound natively rather than through an `onWheel` prop on the layer: React
   * attaches wheel listeners passively, which turns `preventDefault` into a no-op
   * (and logs a warning). Cancelling the default is what keeps the page from
   * scrolling twice if an engine ever does find an ancestor to scroll.
   */
  React.useEffect(() => {
    const layer = layerRef.current
    if (layer === null || layer === undefined) return undefined
    const onWheel = (event) => {
      // Inside the pane the wheel belongs to the pane — the textarea and the
      // reference rail scroll themselves.
      const panel = panelRef.current
      if (panel !== null && panel !== undefined && panel.contains(event.target)) return
      const scroller = scrollableUnder(event.clientX, event.clientY, layer)
      if (scroller === null) return
      event.preventDefault()
      scroller.scrollTop += wheelPixels(event, 'y', scroller.clientHeight)
      scroller.scrollLeft += wheelPixels(event, 'x', scroller.clientWidth)
    }
    layer.addEventListener('wheel', onWheel, { passive: false })
    // The same options as the installation, for symmetry: `removeEventListener`
    // only compares type, callback and capture, so this changes nothing at
    // runtime -- but it is the only add/remove pair in the file whose arguments
    // differ, and an asymmetry a reader has to go and check against the spec
    // costs more than the one argument it saves.
    return () => { layer.removeEventListener('wheel', onWheel, { passive: false }) }
  }, [open])

  const onTextInput = React.useCallback(
    (event) => {
      writeDraft(event.target.value)
    },
    [writeDraft],
  )

  /**
   * Submit.
   *
   * Reached from exactly two places, both deliberate: the round arrow button's
   * onClick, and the documented Ctrl/Cmd+Enter accelerator in `onKeyDown`. There
   * is no other route -- no bare Enter, no Shift+Enter, no chord that a typing
   * accident can produce.
   *
   * `inputActions.submit()` is the composer's shell action
   * (`shell.actions.submit` -> `shell.submit("queue")`), i.e. the same path the
   * shipped Send button uses. Nothing is assembled here and no lower layer is
   * touched, so queueing, steering, attachments and references keep their
   * meaning. The panel closes after the attempt; the text is not cleared by the
   * close, it is cleared by the submit itself.
   */
  const send = React.useCallback(() => {
    if (!sendable || blocked || busy || empty) return
    try {
      inputActions.submit()
    } catch (error) {
      console.warn('fullscreen-input: submit threw', error)
      return
    }
    setOpen(false)
  }, [inputActions, sendable, blocked, busy, empty])

  /**
   * The panel's only key handling, and the only keyboard route to `send`.
   *
   * The accelerator is the EXACT chord Ctrl+Enter (Cmd+Enter on macOS) and
   * nothing else:
   *
   *   - Plain Enter and Shift+Enter fall through to the textarea's native
   *     newline, so Shift keeps meaning "newline" everywhere in the panel and
   *     Ctrl+Shift+Enter cannot become a send by accident.
   *   - Alt/AltGraph combinations are left alone (AltGraph is how many layouts
   *     compose characters).
   *   - The composition guard runs FIRST and returns before the chord test, so
   *     an IME-confirming Enter can never reach the submit path even with Ctrl
   *     held. That ordering is the entire safety argument for shipping a
   *     keyboard route at all.
   */
  const onKeyDown = React.useCallback(
    (event) => {
      if (event.key !== 'Enter') return
      const native = event.nativeEvent
      const composing = native !== undefined && native !== null
        && (native.isComposing === true || native.keyCode === 229)
      if (composing) return
      const cmdOrCtrl = event.ctrlKey === true || event.metaKey === true
      if (!cmdOrCtrl) return
      if (event.shiftKey === true || event.altKey === true) return
      event.preventDefault()
      if (event.repeat === true) return
      send()
    },
    [send],
  )

  const label = t('button.label')
  const sendLabel = t('panel.send')
  const hint = blocked ? t('panel.noComposer') : empty ? t('panel.empty') : t('panel.hint')

  const button = React.createElement(
    'button',
    {
      type: 'button',
      className: 'dshfs-dock',
      'aria-label': label,
      title: label,
      'aria-haspopup': 'dialog',
      'aria-expanded': open ? 'true' : 'false',
      disabled: blocked,
      onClick: toggle,
    },
    React.createElement(FullscreenGlyph, null),
  )

  if (!open) return button

  const panel = React.createElement(
    'div',
    {
      className: settings.mask ? 'dshfs-layer' : 'dshfs-layer dshfs-layer-bare',
      ref: layerRef,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': label,
      // A click on the mask means "get out of my way". It is the same gesture as
      // Escape, so it routes through the same one-layer-at-a-time close.
      // Press outside the pane to dismiss — but only while there is a mask. With
      // the mask off the layer takes no pointer events at all (see
      // `.dshfs-layer-bare`), so clicks reach the page behind and this never fires;
      // Escape and the summon key remain the ways out.
      onMouseDown: (event) => {
        // Only a press that both starts and ends on the mask counts: a drag that
        // began inside the textarea and released outside must not close the panel.
        if (event.target !== event.currentTarget) return
        if (event.button !== 0) return
        if (dialogOpen) closeSettings()
        else close()
      },
    },
    // The mask itself: a SIBLING of the pane, carrying the mask's own geometry
    // and live look. `aria-hidden` because it is decoration -- the dialog role
    // and label sit on the layer above.
    //
    // Omitted outright when the user turns it off, rather than made transparent:
    // nothing should be left to blur, paint, or stand between the pointer and the
    // page behind.
    settings.mask
      ? React.createElement('div', {
        className: 'dshfs-scrim',
        style: maskStyleOf(settings),
        'aria-hidden': 'true',
      })
      : null,
    React.createElement(
      'div',
      {
        ref: panelRef,
        className: settings.glass ? 'dshfs-panel dshfs-glass' : 'dshfs-panel',
        // The drag rides on top of the pane's own look; the layer's flex box
        // keeps owning the centred layout either way.
        style: Object.assign({}, panelStyleOf(settings, size), {
          transform: `translate(${String(dragOffset.x)}px, ${String(dragOffset.y)}px)`,
        }),
      },
      React.createElement(
        'div',
        {
          className: 'dshfs-head',
          onPointerDown: onHeadPointerDown,
          onPointerMove: onHeadPointerMove,
          onPointerUp: onHeadPointerUp,
          onPointerCancel: onHeadPointerUp,
          onDoubleClick: onHeadDoubleClick,
        },
        React.createElement('div', { className: 'dshfs-title' }, t('panel.title')),
        React.createElement('div', { className: 'dshfs-hint' }, hint),
        // Settings sits before Close, with its own margin so it never crowds the
        // dismiss control or the hint text beside it.
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshfs-iconbtn dshfs-gear',
            'aria-label': t('panel.settings.open'),
            title: t('panel.settings.open'),
            'aria-haspopup': 'dialog',
            'aria-expanded': dialogOpen ? 'true' : 'false',
            'aria-pressed': settings.glass ? 'true' : 'false',
            onClick: () => {
              setSettingsOpen((was) => !was)
            },
          },
          React.createElement(GearGlyph, null),
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshfs-iconbtn',
            'aria-label': t('panel.close'),
            title: t('panel.close'),
            onClick: close,
          },
          React.createElement(CloseGlyph, null),
        ),
      ),
      occurrences.length > 0 || attachmentCount > 0
        ? React.createElement(ReferenceRail, {
          t,
          occurrences,
          attachments,
          attachmentCount,
          // The rail decides per entry whether a remove button is possible, and
          // that answer depends on the text as it stands right now.
          draft,
          restorable: typeof insertReference === 'function',
          onPreview: setPreview,
          onRemove: removeAttachment,
          onRemoveReference: removeReference,
        })
        : null,
      React.createElement(
        'div',
        { className: 'dshfs-body' },
        React.createElement('textarea', {
          ref: textRef,
          className: 'dshfs-text',
          value: draft,
          placeholder: t('panel.placeholder'),
          disabled: blocked,
          spellCheck: false,
          autoComplete: 'off',
          'aria-label': t('panel.title'),
          onChange: onTextInput,
          onKeyDown,
          // A pasted file is not text, so the textarea would swallow it. Route
          // clipboard files to the host's intake instead -- the same place the
          // add button sends them, with the same image-versus-@path decision.
          // Default is deliberately not prevented: a clipboard carrying both
          // files and text should still paste its text.
          onPaste: (event) => {
            const data = event.clipboardData
            if (data === null || data === undefined) return
            const files = data.files
            if (files === null || files === undefined || files.length === 0) return
            adoptHostFiles(Array.from(files))
          },
        }),
      ),
      React.createElement(
        'div',
        { className: 'dshfs-foot' },
        // Same place the composer puts its add button -- left of the tool row --
        // so the panel reads like the input it is standing in for.
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshfs-iconbtn',
            'aria-label': t('panel.addFile'),
            title: t('panel.addFile'),
            disabled: blocked,
            onClick: () => { openHostFilePicker() },
          },
          addFilesGlyph(),
        ),
        React.createElement('div', { className: 'dshfs-count' }, String(draft.length)),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshfs-send',
            'aria-label': sendLabel,
            title: sendLabel,
            disabled: blocked || busy || empty,
            onClick: send,
          },
          React.createElement(SendGlyph, null),
          React.createElement('span', { className: 'dshfs-sr' }, sendLabel),
        ),
      ),
      dialogOpen
        ? React.createElement(SettingsDialog, {
          t,
          onClose: closeSettings,
          // Always available, muted or not: this is the manual way back to the
          // dialog the user may have dismissed for good.
          onShowHint: () => { setHintOpen(true) },
        })
        : null,
      // The host's own lightbox, so the preview behaves exactly like the one the
      // composer opens (Escape, backdrop press, focus restored to the opener).
      preview !== null && primitives !== null && typeof primitives.ImageLightbox === 'function'
        ? React.createElement(primitives.ImageLightbox, {
          src: preview.src,
          alt: preview.alt,
          labels: {
            dialog: String(t('panel.preview.dialog')),
            close: String(t('panel.preview.close')),
          },
          onClose: () => { setPreview(null) },
        })
        : null,
      // Above the settings dialog in z-order, because "Show tips" opens it from
      // inside that dialog.
      hintOpen ? React.createElement(HintDialog, { t, onClose: closeHint }) : null,
      // The resize handles go last so nothing else can sit over them. They live
      // *inside* the pane because it clips its overflow for the rounded corners,
      // so a handle straddling the border would simply be cut away.
      RESIZE_DIRECTIONS.map((dir) => React.createElement('div', {
        key: dir,
        className: `dshfs-resize dshfs-resize-${dir}`,
        onPointerDown: (event) => { onResizePointerDown(event, dir) },
        onPointerMove: onResizePointerMove,
        onPointerUp: onResizePointerUp,
        onPointerCancel: onResizePointerUp,
      })),
    ),
  )

  return React.createElement(React.Fragment, null, button, panel)
}

/**
 * Contribute the button into the composer tool row.
 *
 * Slot names are inline literals on purpose: the injector's pre-flight check
 * reads register() calls statically and cannot follow a constant. `slots` and
 * `locale` are resolved through `ctx.inject`, because `ctx.get` is a one-shot
 * read that races activation and answers `undefined` silently.
 */
function contribute(ctx) {
  const removeSheet = installSheet()
  if (removeSheet !== null) {
    // No "already installed" flag is kept: `installSheet` decides that itself by
    // looking for the tag, so a flag here would be written and never read.
    ctx.effect(() => removeSheet, 'dsh-fullscreen-input: panel sheet teardown')
  }

  const register = (slots, locale, sessions, conversation) => {
    if (slots === undefined || slots === null || typeof slots.inject !== 'function') {
      console.warn('fullscreen-input: the slots service is unavailable; no toolbar button was added')
      return
    }
    if (locale !== undefined && locale !== null && typeof locale.register === 'function') {
      // The single-locale form is the one for a namespace outside the merge
      // table: the built-in ids are exactly 'zh' and 'en'.
      ctx.effect(
        () => {
          const offZh = locale.register(NS, 'zh', DICT.zh)
          const offEn = locale.register(NS, 'en', DICT.en)
          return () => {
            offEn()
            offZh()
          }
        },
        'dsh-fullscreen-input: locale dictionaries',
      )
    }
    slots.inject('conversation.input.left', () =>
      slots.register({
        name: 'conversation.input.left',
        id: DOCK_ID,
        order: DOCK_ORDER,
        locale: NS,
        // Session-scoped props. This callback is the supported way for a slot
        // component to reach its session's service scope, and it is how the
        // panel gets the one verb `inputActions` does not carry.
        inject: (sessionId) => sessionApiFor(conversation, sessions, sessionId),
      }, FullscreenInputDock),
    )
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['slots', 'locale', 'sessions', 'conversation'], (owner) => {
      const read = (name) => {
        let value
        try {
          value = typeof owner.get === 'function' ? owner.get(name) : undefined
        } catch (error) {
          value = undefined
        }
        if (value === undefined || value === null) value = owner[name]
        return value
      }
      register(read('slots'), read('locale'), read('sessions'), read('conversation'))
    })
    return
  }

  register(ctx.slots, ctx.locale, ctx.sessions, ctx.conversation)
}

// The wrapper declared `module`/`exports` (see build-client.mjs) and returns
// `module.exports`, so this is an assignment rather than a return.
module.exports = { apply: contribute }
