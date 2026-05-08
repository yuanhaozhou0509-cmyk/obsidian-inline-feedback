# Inline Feedback

Inline Feedback 是一个给 Obsidian + AI Agent 工作流用的精细化反馈插件。

当你把 Obsidian 当成 Codex、Claude Code（CC）、OpenClaw、Hermes Agent 等 AI Agent 的输出载体时，真正麻烦的往往不是“AI 会不会生成内容”，而是它不知道你反馈的“这里”到底是哪一行、哪一段、哪个观点、哪个计划、哪个笔记块。

Inline Feedback 给 Obsidian 补了一层本地反馈层。你可以直接选中任意 Markdown 文本，给这段内容写精确 feedback，并把反馈保存在笔记旁边。Agent 可以直接读取这些反馈文件，更准确地理解你的需求，然后继续写、修改、整理、执行或迭代。

[English README](README.md)

![Inline feedback demo](docs/assets/inline-feedback-demo.svg)

## 它能做什么

- 在任意 Markdown 笔记中选中文本并添加内联反馈，不直接改动原文。
- 将反馈保存在同目录的 `<note>.feedback.json`。
- 在侧边栏查看、删除、跳转到对应标注。
- 让 Codex、Claude Code、OpenClaw、Hermes Agent 等工具直接读取反馈文件。
- 只有当某个 AI 不能访问你的本地文件时，才需要可选导出 `<note>.feedback_export.md`。
- 将反馈追加到 `feedback_log.md`，便于项目级追踪。
- 将高价值原文片段保存成 Knowledge Cards，后续工作时复用。

这个插件适合 AI 辅助写作、研究笔记、需求文档、项目计划、报告、知识库、共享 vault 协作，以及任何“你在 Obsidian 里查看 Agent 输出，然后需要把精确反馈交还给 Agent”的工作流。

你不需要在聊天里笼统描述“帮我改这里”，而是在 Obsidian 里直接标出具体句子、段落、清单项或章节，并写下精细化 feedback。Agent 读取同目录的 `.feedback.json` 后，就能更高效、更准确地知道你指的是哪段内容、想让它怎么继续。

## 为什么需要它

Markdown 很适合作为 AI 工作台，但缺少类似 Google Docs 评论那样的轻量批注层。Inline Feedback 用本地纯文件补上这一层：

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

用 BRAT 安装最简单。这个插件进入 Obsidian 官方插件市场之前，先用这种方式安装。

1. 在 Obsidian 里安装并启用 `BRAT`。
2. 打开 `BRAT` 设置，点击 `Add beta plugin`。
3. 粘贴这个链接：

```text
https://github.com/yuanhaozhou0509-cmyk/obsidian-inline-feedback
```

4. 确认安装，然后回到 Obsidian 第三方插件页面启用 `Inline Feedback`。

高级手动安装：从最新 GitHub Release 下载 `main.js`、`manifest.json`、`styles.css`，放到 `<vault>/.obsidian/plugins/inline-feedback/`。

## 基本工作流

1. 打开一篇 Markdown 笔记。
2. 选中一句话或一段话。
3. 点击浮窗里的 `Add feedback`，或在右键菜单里添加反馈。
4. 写反馈，按 `Ctrl+Enter` 保存。
5. 如果想集中查看所有 feedback，可以打开右侧 Inline Feedback 面板。
6. 需要 AI 继续处理时，直接让 Codex、Claude Code、OpenClaw、Hermes Agent 等 Agent 看同目录的 `.feedback.json`。
7. 只有当某个 AI 不能访问你的本地文件时，才需要导出 `.feedback_export.md`。

可以这样提示 AI 或 coding agent：

```text
请按照 my-note.feedback.json 继续处理 my-note.md。
逐条回应 feedback，并尽量保留原文结构。
每条 annotation 中的 originalText 是被标注的原文，feedback 是我的具体要求。
```

## 数据文件

- `<note>.feedback.json`：结构化标注，最适合给 AI/Agent 直接读取。
- `<note>.feedback_export.md`：适合人读的反馈汇总，是可选导出，不是日常必需步骤。
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


