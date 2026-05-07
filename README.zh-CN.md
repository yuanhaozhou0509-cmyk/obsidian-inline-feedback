# Inline Feedback

Inline Feedback 是一个 Obsidian 插件，用来做轻量的逐句批注。你可以选中文本、写反馈、在侧边栏查看所有标注，并导出结构化文件，让 AI 助手或写作 Agent 按照反馈修改文章。

[English README](README.md)

![Inline feedback demo](docs/assets/inline-feedback-demo.svg)

## 它能做什么

- 在 Markdown 笔记中选中文本并添加内联反馈，不直接改动原文。
- 将反馈保存在同目录的 `<note>.feedback.json`。
- 在侧边栏查看、删除、跳转到对应标注。
- 导出 `<note>.feedback_export.md`，方便复制给 AI 修改文章。
- 将反馈追加到 `feedback_log.md`，便于项目级追踪。
- 将高价值原文片段保存成 Knowledge Cards，后续写作时复用。

这个插件适合 AI 辅助写作、共享 vault 审稿、研究笔记整理，以及“一个环境负责标注，另一个 AI/Agent 环境负责修改”的工作流。

## 为什么需要它

Markdown 很适合写作，但缺少类似 Google Docs 评论那样的轻量批注层。Inline Feedback 用本地纯文件补上这一层：

```text
my-note.md
my-note.feedback.json
my-note.feedback_export.md
feedback_log.md
knowledge_cards/_library.json
knowledge_cards/_library.md
```

插件没有服务器，也不会上传数据，只会在你的 Obsidian vault 里写文件。

## 安装

### 用 BRAT 安装

1. 先安装 Obsidian 的 BRAT 插件。
2. 在 BRAT 里选择 `Add beta plugin`。
3. 输入：

```text
https://github.com/zyh14/obsidian-inline-feedback
```

4. 到 Obsidian 社区插件页面启用 `Inline Feedback`。

### 手动安装

1. 从最新 GitHub Release 下载 `main.js`、`manifest.json`、`styles.css`。
2. 在 vault 里创建目录：

```text
<vault>/.obsidian/plugins/inline-feedback/
```

3. 把三个文件放进去。
4. 重启或刷新 Obsidian，然后启用插件。

### 从源码构建

```bash
npm install
npm run build
```

然后把 `main.js`、`manifest.json`、`styles.css` 复制到测试 vault 的插件目录。

## 基本工作流

1. 打开一篇 Markdown 笔记。
2. 选中一句话或一段话。
3. 点击浮窗里的 `Add feedback`，或在右键菜单里添加反馈。
4. 写反馈，按 `Ctrl+Enter` 保存。
5. 从侧边栏图标或命令面板打开反馈面板。
6. 需要 AI 修改时，导出 `.feedback.json` 或 `.feedback_export.md`。

可以这样提示 AI：

```text
请按照 my-note.feedback.json 修改 my-note.md。
尽量保留原文结构。
每条 annotation 中的 originalText 是要修改的原文，feedback 是修改要求。
```

## 数据文件

- `<note>.feedback.json`：结构化标注，最适合给 AI/Agent 使用。
- `<note>.feedback_export.md`：适合人读的反馈汇总。
- `feedback_log.md`：项目级反馈日志。
- `knowledge_cards/`：可复用知识卡片库，包含 `_library.json` 和 `_library.md`。

## 隐私

Inline Feedback 不上传内容，没有后端，也没有 telemetry。所有标注、导出文件、日志、图片和 Knowledge Cards 都只保存在你的本地 vault 中；它们是否同步，取决于你自己使用的同步工具。

## 发布说明

这是桌面端优先的 `1.0.0` 版本。当前 UI 只按桌面版 Obsidian 设计和测试，所以还不声明移动端支持。

GitHub Release 需要附带：

- `main.js`
- `manifest.json`
- `styles.css`

Release tag 必须和 `manifest.json` 里的 `version` 一致。

## 许可证

MIT。见 [LICENSE](LICENSE)。

