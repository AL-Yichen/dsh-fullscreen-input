# 任务：让"文件引用"也能一键移除（含一处 CSS 裁剪 bug）

> 交给代码 agent 的任务书。工作目录：`E:\A-Programming\VibeCoding\dsh-fullscreen-input`
> 版本目标：**1.2.0**（新功能，不是 patch）
> 建议先读 `AGENTS.md` 全文，尤其第 2 条（面板写入会拍平 chip）与第 8 条（控件按 `aria-label` 查找）。

---

## 一、现象与根因

### 现象

面板的引用栏里有两类条目，它们的"移除"体验不一致：

| 类型 | 外观 | 鼠标移上去 |
|---|---|---|
| 图片附件 | 32×32 缩略图 | 右上角出现「×」，点击可移除 ✅ |
| **非图片文件**（如 `.gitignore`） | `📄 .gitignore` 深色 chip | **什么都没发生，看不到任何移除入口** ❌ |

用户不知道文件是以 `@路径` 文本形式存在的，会下意识狂按退格 —— 但光标不在那个引用上时退格无效，于是看起来像 bug。

### 根因 1：移除按钮被 CSS 裁掉（这是真的 bug）

```css
.dshfs-refs{ ... max-height:88px; overflow-y:auto; padding:8px 16px; }  /* 裁剪上下文 */
.dshfs-att{ position:relative; display:inline-flex; ... }
.dshfs-att-remove{ position:absolute; top:-5px; right:-5px; ... }       /* 溢出父元素 5px */
```

- 图片卡高 **32px**，在 22px 行高里居中 → 上下各有约 5px 余量，按钮露得出来
- 文件 chip 高 **22px**，紧贴内容盒顶边 → 按钮整体落在 `overflow` 裁剪区之外，**完全不可见**
- `right:-5px` 同样被裁（`overflow-y:auto` 时另一轴等效 `auto`）

⚠️ 注意：那个按钮**在 DOM 里、可聚焦、也能点击** —— 只是看不见。所以这不是"没生成"，是"被裁掉"。修的时候别去改渲染条件（渲染条件本来就是对的）。

### 根因 2：文件引用根本不是附件

宿主自己代码里（`@deepseek-ai/dsh-client-ui-conversation`）写得清楚：

```js
// lib/client.js
line 3229:  if (!(preserveQuote || /\s/u.test(path))) return `@${path}`;  // 非图片文件 → 草稿文本
line 3272:  kind: "image",                                              // 只有图片进 attachments
```

所以：

- 文件引用**不在** `InputState.attachmentIds` 里
- 它存在于 **`InputState.occurrences`**（引用表）里
- 现有的 `props.onRemove(id)` → `inputActions.removeAttachment(id)` 对它**是空操作**（内部 `filter` 找不到 id，返回 false）

**结论：文件引用的移除必须走"编辑草稿文本"这条路，不能复用附件的移除路径。**

---

## 二、要做的三件事

### 改动 1（CSS，低风险，先做）

给移除按钮留出空间：

```diff
- '.dshfs-refs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex:none;',
- 'max-height:88px;overflow-y:auto;padding:8px 16px;',
+ '.dshfs-refs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex:none;',
+ 'max-height:88px;overflow-y:auto;padding:13px 21px;',
```

上/右各留 5px 覆盖 `-5px` 的溢出（`gap:6px` 保证 chip 之间的视觉间距不变）。
**代价**：容器总高从 88px 变 98px，引用多时滚动区略矮 —— 可接受。

> 做改动 1 之后，**附件与引用的移除按钮会同时可见** —— 这是好事，但要意识到它会让引用栏整体变高，确认观感。

### 改动 2（功能，主要工作）

给每个引用条目（`occurrences` 循环里那部分）加上与附件**同样的移除按钮**，并让它真的能删掉草稿里对应的那段文本。

**2.1 渲染**

在 `ReferenceRail` 的 occurrences 循环里，把条目包进 `.dshfs-att`（复用现成的 `position:relative` 容器），并提供 `.dshfs-att-remove` 按钮：

```js
items.push(React.createElement(
  'span',
  { key: occurrence.occurrenceId, className: 'dshfs-att' },
  React.createElement(
    'span',
    { className: 'dshfs-ref', title: ... },   // 保持现有外观与 tooltip
    referenceGlyph(occurrence.appearance),
    React.createElement('span', { className: 'dshfs-ref-label' }, String(label)),
  ),
  React.createElement(
    'button',
    {
      type: 'button',
      className: 'dshfs-att-remove',
      'aria-label': String(t('panel.removeReference')).replace('{name}', label),
      title: ...,
      onClick: () => { props.onRemoveReference(occurrence) },
    },
    removeAttachmentGlyph(),
  ),
))
```

- 新增一个 locale 键 `panel.removeReference`（中英各一条），**文案要说明它删的是草稿里的文字**
- 按钮的可见性规则复用现有 CSS（hover / focus-within / `@media (hover:none)`），不用新增规则
- ⚠️ **顺手给 `.dshfs-att` 补上 `min-width:0;max-width:100%`**：
  ```css
  /* 现在 */
  '.dshfs-att{position:relative;display:inline-flex;flex:none;align-items:center}',
  /* 改为 */
  '.dshfs-att{position:relative;display:inline-flex;flex:none;align-items:center;min-width:0;max-width:100%}',
  ```
  原因：`.dshfs-ref` 自己是 `min-width:0;max-width:100%`，但 `max-width` 是相对**包含块**算的。
  把它放进一个新的 `inline-flex` 包装器后，包含块变成"由内容决定宽度"的包装器，
  于是 `max-width:100%` 失去约束作用 —— **长路径会把 chip 撑出引用栏**。
  图片卡是固定 32px，所以现有代码没暴露这个问题；引用 chip 宽度不定，会。

**2.2 删除逻辑（核心，有陷阱）**

新增一个纯函数，例如 `planReferenceRemoval(text, occurrence)`，返回要写入的新文本或 `null`。

**规则（我实测过三种情形，必须都覆盖）：**

| 草稿 | 期望结果 |
|---|---|
| `@.gitignore\n写点别的` → 删 `@.gitignore` | `写点别的`（连换行一起删，**不留空行**） |
| `第一行\n@src/client.js\n最后一行` | `第一行\n最后一行`（**不留空行**） |
| `看看 @.gitignore 这个文件` | `看看 这个文件`（**只删引用**，折叠双空格） |
| `@a.ts\n@b.ts\n` → 删 `@a.ts` | `@b.ts\n` |

⚠️ **不要简单地"删掉整行"** —— 那会把 `看看 @.gitignore 这个文件` 变成空字符串，误删用户的内容。

正确规则：

```
1. 定位：在**当前 draft** 里 indexOf(needle)。
   needle 取 occurrence.clipboardText（非空时）否则 occurrence.ref。
   ⚠️ 不要直接用 occurrence.offset —— 面板自己的写入会改变文本，offset 可能已失效。
   找不到就返回 null（不强行匹配）。

2. 分支：
   - 独占一行（引用前是 \n 或串首，且引用后是 \n 或串尾）
     → 连同相邻的一个 \n 一起删除（优先删后面的；若后面是串尾则删前面的）
   - 行内引用
     → 只删引用文本；若删除后出现连续两个空格，折叠成一个
```

**2.3 接线到组件**

- `FullscreenInputDock` 里加一个 `removeReference` 回调（`React.useCallback`），内部：
  - 用 `draft` 与 occurrence 算出新文本
  - 通过 **`inputActions.setDraft(next)`** 写入 —— **不要绕过它**，也不要自己拼 document
  - 写入前**必须**走既有的 `writeDraft()`，因为它负责在写入前拍下 chip 快照（AGENTS.md 第 2 条）
- 把回调通过 `props.onRemoveReference` 传给 `ReferenceRail`

**2.4 一个必须确认的点：chip 重建会不会把删掉的引用插回来？**

既有的 `planReferenceRebuild(text, occurrences)` 按 `clipboardText` 在**新文本**里 `indexOf` 定位。
被删掉的那个引用在新文本里**不存在** → `indexOf` 返回 -1 → 跳过 → **不会插回来**。

这条我核对过代码逻辑，是安全的 —— 但**请你在真机上确认一遍**（见第三节）。

⚠️ 同时注意：`writeDraft` 会拍下**全部** occurrences 的快照，包括刚被删的那个。因为上述 indexOf 机制它不会被恢复，但如果你改成别的方式定位，就可能把它插回来。

### 改动 3（README 表述修正）

现在两版 README 的附件表都只写了「移除附件 → 鼠标移到附件上，右上角出现 ×」，不准确。

要按最终实现改。若改动 2 落地，两版都应改成**两行**，分别说明：

- 图片附件：悬停出现「×」，点击移除
- 文件引用：同样是悬停出现「×」；并说明它是草稿里的 `@路径` 文本，所以在文本框里直接选中删除**也**可以

同步改 `README.md` 与 `README.en.md`（英文版第 78 行附近）。

---

## 三、验证要求（这个项目的老问题：离线测不出来）

`AGENTS.md` 已经写明：本发行版**没有**上游的 jsdom 测试环境，而这类改动**离线断言测不出真机行为**。

**必须做的：**

1. `node build-client.mjs`（改完 `src/` 必须重建）
2. `npm run check`
3. **真机验证**下面每一条，在 DSH Web 里实际操作：
   - 拖/贴一个非图片文件 → 引用栏出现 chip → 悬停 → **「×」可见**（改动 1 的核心验收点）
   - 点那个「×」→ **草稿里那段 `@路径` 消失，且不留下空行**
   - 行内引用：`看看 @.gitignore 这个文件` → 点「×」→ 变成 `看看 这个文件`，**其余文字完好**
   - 引用独占一行且在中间 → 点「×」→ **上下两行不留空行**
   - 删掉一个引用后，**其余引用仍然是 reference（有图标、可点击预览、`occurrences` 非空）** —— 即 chip 重建没把它们拍平成纯文本
   - 图片附件的移除**没有回归**（仍然悬停可见、点击可移除）
   - 连续删两个引用（一次删一个）不出现跳动或残留
   - 只有图片、没有文件引用时，引用栏高度/滚动条正常

4. 如果你自建了离线 harness，**用 `'use strict';` 前缀加载真实 bundle**（`AGENTS.md` 末尾那条规则），确保没有裸赋值之类的严格模式问题。

---

## 四、不要做的事

- **不要**改 `.dshfs-att-remove` 的渲染条件 —— 它本来就是无条件生成的，问题在 CSS 与数据来源
- **不要**为了让它可见而把 `.dshfs-refs` 的 `overflow-y:auto` 去掉 —— 多引用时的滚动是必要的
- **不要**在删除逻辑里用 `occurrence.offset` 直接切片（见 2.2）
- **不要**绕过 `inputActions.setDraft`，也不要跳过 `writeDraft()` 的 chip 快照
- **不要**把改动做进 1.1.1 —— 这是新功能，走 **1.2.0**
- **不要**在 README 里写成"附件" —— 文件引用不是附件，这个区分正是本任务的核心

---

## 五、版本与文档

- `package.json` → `1.2.0`
- `CHANGELOG.md` → 把现有 `## [Unreleased]` 下那条 `wheel` 对称性记录，连同本次改动一起归入新的 `## [1.2.0] - <发布日>`
- README 两版同步（改动 3）
- `AGENTS.md` 建议补一条第 9 条约束：**"文件引用是草稿文本，不是附件"**，说明 `occurrences` 与 `attachmentIds` 的区别、以及"移除它等于编辑草稿"这个事实 —— 这是本次踩出来的坑，下一个改这块的人需要知道
