# dsh-fullscreen-input

[![npm](https://img.shields.io/npm/v/dsh-fullscreen-input?color=4176e6)](https://www.npmjs.com/package/dsh-fullscreen-input) [![License](https://img.shields.io/github/license/AL-Yichen/dsh-fullscreen-input?color=4176e6)](./LICENSE) [![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.0--rc.1%20%3C0.3.0--0-4176e6)](#兼容性) [![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/AL-Yichen/dsh-fullscreen-input/pulls)

给 DSH 的输入框加一个**全屏输入面板**：在整屏空间里写多行文本，写完点按钮发送。

## 它解决什么问题

DSH 原有输入框的 `Shift+Enter` 换行判定依赖一个很短的宽容窗口——输入法组合结束后的 **10 毫秒**内仍算「正在组合」：

```js
const onCompositionEnd = () => {
    composing = false;
    composingUntil = Date.now() + 10;   // ← 就这 10ms
};
const recentlyComposing = () => composing || Date.now() < composingUntil;
```

中文输入法频繁使用 Shift / Enter（切换中英、确认候选词），很容易落进这个窗口，于是 `Shift+Enter` 被误判成发送，多行文本根本写不舒服。

这个面板把整套判定**绕开**：面板里**没有「Enter 发送」这条路径**。

## 安装

### 从插件市场（推荐）

打开 DSH 的 **设置 → 插件市场**，搜索 `dsh-fullscreen-input`，点安装。

### 命令行

```sh
dsh plugin --profile web add dsh-fullscreen-input
```

装完重启 `dsh web`，刷新页面。

### 从本地目录（开发用）

```sh
git clone <本仓库> dsh-fullscreen-input
dsh plugin --profile web add link:<克隆下来的绝对路径>
```

Windows 例：`link:D:/example/dsh-fullscreen-input`

因为是 `link:` 安装，改完源码跑一次 `node build-client.mjs` 重建，**刷新页面即生效**，不用重装。

## 怎么用

输入框下方工具栏（「+」按钮所在那一行）会多出一个图标，悬停显示「全屏输入」。点开就是面板。

### 键位

| 按键 | 行为 |
|---|---|
| `Enter` | 换行 |
| `Shift+Enter` | 换行（与 `Enter` 等价，Shift 在面板里只表示换行） |
| `Ctrl+Enter` / `Cmd+Enter` | 发送 |
| `Esc` | 关闭面板（设置窗口开着时先关设置窗口，面板保留） |
| 中文输入法组词中的 `Enter` / `Ctrl+Enter` | 换行，**绝不发送** |
| 点击面板之外的区域 | 关闭面板（等同 `Esc`） |

选 `Ctrl+Enter` 而不是更冷门的组合，是因为它是聊天/编辑器里通用的「发送」约定、75% 小配列左下角一定有 Ctrl，而且与中文输入法的 Shift/Enter 习惯完全不重叠。

**关闭面板不会丢内容。** 面板与主输入框读写的是**同一份草稿**——不是两份内容互相同步，而是同一个值。所以在面板里敲的字、在主输入框里敲的字，都是同一份。

### 面板里还能做什么

| 能力 | 怎么用 |
|---|---|
| **看引用** | 草稿里的 `@` 引用显示为带图标的条目，悬停看完整路径 |
| **看附件** | 图片显示为缩略图，**点击看大图**；文件显示类型图标与文件名 |
| **移除附件** | 鼠标移到附件上，右上角出现「×」 |
| **添加文件** | 面板左下角「+」，走 DSH 自己的文件选择器 |
| **粘贴** | 在面板里直接 `Ctrl+V`，图片与文件都能贴进来 |
| **拖放** | 把文件直接拖到面板上 |
| **移动面板** | 按住标题那一行拖动（自由拖动，不设边界）；**双击标题回到居中**。关闭后再打开仍是默认位置 |
| **调整大小** | 拖拽边框或四个角（8 个方向；光标会变成对应的缩放箭头，没有额外的可见把手）。最小 360×240、最大不超过视口。**尺寸会被记住**，双击标题可连同位置一起复原 |

### 外观设置

面板头部的齿轮按钮 →「全屏输入设置」，分两组：

**遮罩层**
- **遮罩层不透明度**：默认完全透明（0%）
- **遮罩层雾化**：默认不雾化（0%）

**面板毛玻璃**
- **启用毛玻璃效果**：默认关闭
- **面板雾化**（默认 40%）、**玻璃透明度**（默认 25%）、**玻璃颜色**：「跟随主题」、6 个固定色，最后那个格子是**系统颜色选择器**——点它选任意颜色

设置会持久保存，刷新与重开都保留。

> ⚠️ 一点需要知道的行为：「**遮罩层雾化**」调高会模糊**整个屏幕背景**（含面板背后），因为遮罩层本身是全屏的。这是当前实现的行为，不是故障。

## 兼容性

- **DSH `>=0.2.0-rc.1 <0.3.0-0`**（即 0.2.x 发行线）。面板深度依赖宿主的槽位 props、`inputActions` 与 `insertReference` 的 revision-CAS 语义，这些正是次要版本最可能变动的地方，所以上界是刻意收窄的——旧版声明的 `≥ 0.2.0-rc.1` 会无声地宣称兼容未来的 `0.3.0+`。
- **Node ≥ 20**（仅构建源码时需要）
- 纯浏览器侧插件：host 侧是空实现，**不产生任何网络请求**，不读写会话数据

## 权限

本插件**不需要**任何权限档位、审批放宽或沙箱调整即可工作。它请求的能力面刻意保持在最小：

| 能力 | 用途 |
|---|---|
| `ctx.effect` | 注册样式表与 locale 字典的清理（卸载时完整回滚，无残留） |
| `ctx.inject(['slots','locale','sessions','conversation'])` | 等待并取得这四个服务；全部是读取或驱动宿主自己的输入动作 |
| `slots.inject` + `slots.register` | 往 `conversation.input.left` 槽位贡献一个工具栏按钮 |

**未使用**：`ctx.fs`、`ctx.network`、`ctx.shell`、`ctx.resources`。它不注册任何 Agent 工具，因此不会扩展模型的工具面。

唯一的本机持久化是一个 `localStorage` 键（面板外观偏好）；唯一接触文件的路径是驱动宿主**自己的**隐藏文件输入框，且请求文件对话框必须在你的点击或粘贴手势内完成。完整的攻击面说明与漏洞报告方式见 [SECURITY.md](./SECURITY.md)。

## 改源码

```sh
node build-client.mjs      # 把 src/client.js 包成 lib/client.js
npm run check              # 语法检查（三个文件）
```

| 文件 | 说明 |
|---|---|
| `src/client.js` | 唯一手写实现（浏览器侧，全部 UI 与逻辑） |
| `lib/client.js` | **构建产物，运行时实际加载的就是这个** |
| `lib/index.js` | host 侧，空实现 |
| `build-client.mjs` | 构建脚本，纯文本包裹，无任何依赖 |
| `cordis.patch.yml` | bundle 补丁，挂载 row id `fullscreen-input` |

**改完 `src/` 一定要重建**，否则刷新页面看到的还是旧代码。

## License

MIT
