# AGENTS.md

给**要修改这个插件的 AI agent** 的说明。使用者读 `README.md` 就够了。

---

## 这是什么

DSH（DeepSeek Harness）的**纯浏览器侧**客户端插件：给 composer 加一个全屏输入面板。

`lib/index.js`（host 半）是**空实现**，全部功能在 `src/client.js` 里。

## 构建与检查

```sh
node build-client.mjs     # src/client.js → lib/client.js（改完 src 必须跑）
npm run check             # node --check 三个文件
```

**`lib/client.js` 是运行时真正加载的文件。** 只改 `src/` 不重建，等于没改。

它是 `src/client.js` 被包进 `window.__ModuleLoader__.load({ id, factory })` 的产物，**不是压缩或转译过的**——和源码一一对应，可以直接读，也可以用行号对照。

## 目录

| 路径 | 作用 |
|---|---|
| `src/client.js` | 唯一手写实现（约 1900 行） |
| `lib/client.js` | 构建产物（运行时加载） |
| `lib/index.js` | host 半，空实现 |
| `build-client.mjs` | 构建脚本：纯文本包裹，无依赖 |
| `cordis.patch.yml` | bundle 补丁，挂载 row id `fullscreen-input` |

---

## 五条不能碰的约束

改动前务必读完这一节。每一条都是踩过的坑。

### 1. 遮罩与面板必须是**兄弟**，且面板必须有定位层级

```
.dshfs-layer             ← 全屏定位 + 接点击的外壳，自己不带 backdrop-filter
├── .dshfs-scrim         ← 遮罩样式（position:absolute; inset:0; pointer-events:none）
└── .dshfs-panel         ← 面板（position:relative; z-index:1），承载毛玻璃
```

两个都不能少：

- **必须是兄弟**：`backdrop-filter` 让元素成为 *backdrop root*，其后代的 backdrop 采样被限制在该元素边界内。若遮罩是面板的**祖先**且带 `backdrop-filter`，一旦开启遮罩雾化，面板的毛玻璃就会被"饿死"，只剩半透明底色。
- **面板必须有 `position` + `z-index`**：`.dshfs-scrim` 是绝对定位，而**定位元素绘制在静态元素之上**。少了这一句，遮罩会画在面板上面，把面板连同页面一起糊掉。（这正是历史上一次失败修复的原因。）

### 2. 面板写入会**销毁引用 chip**——不要移除重建逻辑

宿主的草稿是 **Lexical 富文本文档**，而 `draft` 只是它的**剪贴板文本投影**：`@` 引用 chip 在 `draft` 里已被展开成 `@路径` 文字。

宿主的 `setDraft` 是**清空文档 + 逐行插入纯文本节点，没有 `@` 反向解析**。所以面板每一次写入都会把所有 chip 拍平——真机上表现为「贴上的文件打个字就变成纯文字」。

现在的做法：写入前拍下 chip 快照，写入后经 `SessionInput.insertReference` **逐个插回**（插入是 revision-CAS 的，所以一次只插一个，靠下一次 revision 再进 effect）。

**不要删掉这套逻辑**，也不要以为"文本还在就没事"——路径文字确实还在，但宿主不再把它当引用处理（没有图标、不能点击预览、`occurrences` 为空）。

### 3. 跨 scope 取服务要用 `inject(sessionId)`，不能用插件自己的 ctx

`insertReference` 在 **per-session** 的输入门面上，**只能从 session-scope Context 取得**：

```js
const actx = ctx.sessions.scope(sessionId)     // 1. session 作用域
const conversation = actx.get('conversation')  // 2. conversation 服务
const target = conversation.input.for(actx)    // 3. SessionInput（带 insertReference）
```

插槽注册的 `inject: (sessionId) => props` 回调是**官方过界方式**（宿主自己的 QueueDock 就是这么写的），它产出的 props 会合并进组件。

> ⚠️ 用插件自己的根 Context 去 `ctx.get('conversation')` **取不到**——那个服务在 session scope 里。
> 这个错误**编译不报错**（`ctx.get` 返回 `unknown | undefined`）、**离线测试也测不出来**，只有真机能发现。已经犯过一次。

### 4. 附件的 id 与描述符是分开的

`InputState.attachmentIds` **只有 id**（原文注释：browser objects stay in ConversationController）。要拿图片预览地址得调：

```js
conversation.resolveDraftAttachments(ids)   // → ComposerAttachment[]
```

这个成员**不在 `IConversation` 接口里**（是 class 上的运行期成员），所以调用点包了 try/catch，失败就降级为"只显示附件数量"。

### 5. 只有两处依赖宿主 DOM，都按**语义**定位

| 用途 | 定位方式 |
|---|---|
| 「添加文件」按钮 | `input[type="file"][multiple]`，跳过 `disabled` 的，然后 `.click()` |
| 面板内粘贴 | 构造 `DataTransfer` 赋给同一个 input，再派发 `change` |

**绝不使用哈希类名**（宿主每次构建都会变）。找不到就**什么都不做**——宁可功能缺失，也不要一个会崩的面板。

---

## 数据来源速查

组件从插槽 props 拿到的：

| 来源 | 拿到什么 |
|---|---|
| `useInput((s) => s)` | `draft`（文本投影）、`attachmentIds`、`occurrences`（引用表）、`draftRev`、`phase` |
| `inputActions` | `setDraft`、`insertText`、`captureInsertion`、`addAttachments`、`removeAttachment`、`pruneAttachments`、`submit` |
| `inject(sessionId)` 产出 | `insertReference`、`resolveAttachments` |
| `require('@deepseek-ai/dsh-client-ui-primitives')` | `ReferenceIconRegular`、`FileTypeIcon`、`IconPlusOutlineMedium`、`IconCloseFillRegular`、`ImageLightbox` 等 |

**`inputActions` 里没有**：按 `File` 加附件、粘贴处理、插入引用。这些按设计留在宿主的 command/trigger 面里——所以附件上传与粘贴都是"驱动宿主原生路径"，而不是自己实现。

## 已知边界（不是 bug）

- 「**遮罩层雾化**」作用于**整个视口**（遮罩是全屏的），不是"面板之外"。
- 面板里**没有上传进度与重试**——那需要接管 `conversation.input.attachments` 插槽（会替换掉宿主自己的附件栏，还要连带重写 document 级拖放），代价大于收益，已明确不做。
- 面板**不做焦点陷阱**：只处理自己内部的 Enter 与 Escape，不接管全局按键。

## 风格约定

- **注释解释「为什么」**，不解释"做了什么"——尤其是反直觉的地方（backdrop root、scope、CAS span、为什么不用哈希类名）。
- **面向用户的文案走 locale 字典**（`DICT.zh` / `DICT.en`），代码与注释用英文。
- 改完**必须** `node build-client.mjs`。
- 加新行为时**尽量补自动化断言**。注意：本发行版**未包含**上游的离线测试环境（那是一个 jsdom + 真 React 驱动构建产物的 harness，体积大且只服务开发），要用得自己搭。
- 更要紧的是：这个项目里几处"看起来对、实际错"的问题（**跨 scope 取服务**、**chip 被拍平**）**离线测试根本测不出来**，只有真机能发现。改到相关区域后，**必须真机确认一遍**，不要只凭"类型通过 + 测试绿"就认为没事。
