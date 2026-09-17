---
name: dsh-plugin-development
description: 开发、修改、调试或升级 DeepSeek Harness 插件时，先查询目标 DSH 版本的官方对应文档与公开 API；按主题导航插件生命周期、工具、Host/Client、Bundle/Profile、存储、子智能体及工作流。
metadata:
  source: https://github.com/deepseek-ai/deepseek-harness
  kind: official-documentation-index
---

# DSH 插件开发：官方文档目录

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `DSH-PLUGIN-DOC-INDEX`；项目维护的官方文档导航 Skill |
| 目的 | 让开发者先查官方对应文档，再使用目标版本的插件接口 |
| 范围 | DSH 插件开发、调试与版本适配；按任务读取相关入口 |
| 决策状态 | 〔约束〕用户 2026-09-16 要求改为官方链接目录，开发前首先查询官方对应文档 |
| 证据范围 | 本文提供查询路径；具体接口与兼容性须在目标版本核实，目录本身不提供运行验收证据 |
| 依据 | [DeepSeek 官方仓库](https://github.com/deepseek-ai/deepseek-harness)；项目授权与工程规则见 [AGENTS.md](../../../AGENTS.md) |
| 变更权 | 按[文档注册表](../../../docs/governance/document-registry.yaml)维护链接及适用范围；框架文档正文由官方维护 |

## DSH-DOC-01：开发前先查询

1. **确定目标版本。** 从项目依赖、锁文件及实际目标安装包核对 DSH 版本和官方 tag/commit；已有证据仅在对应版本未变时复用。下表的 `master` 链接用于查询上游当前文档，落实接口时切到目标 tag/commit 的同一路径；官方新发布不自动改变项目依赖。
2. **读取对应正文。** 在设计接口或写实现前，按下表选择并实际读取相关官方页面。可先读取已核对版本的官方本地 checkout；接口签名、导出或行为有疑问时，沿官方文档查同版本包 README、公开导出、源码及测试。只看到链接、搜索摘要或旧 Skill 内容不足以确认 API。
3. **保留可核实的依据。** 在当前任务的设计或交付中注明所用官方路径、tag/commit、目标包版本与适用边界。文档与实际安装不一致时明确差异；证据不足的接口保持未验证，不靠猜测继续依赖它的实现。教程命令的执行仍遵守当前任务授权及项目工程规范。

## 按开发任务查官方文档

只读当前任务需要的主题；从入门页进入具体教程，从子系统页继续定位生成的 API 参考与所属包。

| 开发任务 | 官方入口 | 重点查询 |
| --- | --- | --- |
| 第一个 Harness 插件 | [插件入门](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md) · [Cordis 教程目录](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/index.zh.md) | 插件入口、最小示例、加载方式；区分 Harness 教程与 Cordis 独立示例 |
| 插件生命周期与资源清理 | [插件与生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.zh.md) | inject、就绪、effect、dispose、热重载 |
| 服务与事件 | [Service](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.zh.md) · [事件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/events.zh.md) | 服务声明与消费、事件注册、分发语义 |
| 插件配置 | [配置教程](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.zh.md) | Config、schema、默认值及配置错误 |
| 模型工具 | [工具教程](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.zh.md) · [Tools 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.zh.md) | defineTool、输入输出、执行上下文与工具管线 |
| 打包、Bundle 与 Profile | [打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md) · [Profile 启动与装配](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/app-boot/README.zh.md) | manifest、包入口、patch 层顺序、数据根与启动参数 |
| Host / Client 与 Web 界面 | [Web Client](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.zh.md) · [Web Server](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-server.zh.md) · [UI 插槽](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/slots.zh.md) | Host 权威、客户端通信、模型投影、插槽及浏览器边界 |
| 业务存储与恢复 | [Storage](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/storage.zh.md) · [Storage Domain](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/storage/storage-domain/README.zh.md) · [持久化目录](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/persistence-catalog.zh.md) | backend/domain 职责、读写与关闭契约、格式及迁移边界 |
| 会话与子智能体 | [Session](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.zh.md) · [Subagent](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.zh.md) | 会话生命周期、历史、Provider、派生与接续 |
| 工作流与后台任务 | [Workflow](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/workflow.zh.md) · [Jobs](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/jobs.zh.md) | 工作流执行器、运行句柄、取消与结果 |
| 动态 Cordis 插件 | [动态扩展实践](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/practice/dynamic-cordis.zh.md) · [官方动态插件 Skill](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md) | 仅在使用动态 Cordis 工具时读取：inspect、define、run、生命周期及运行权限 |
| 查具体 API 或其他能力 | [子系统总目录](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/README.zh.md) · [Cordis Context API](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-api/context.zh.md) | 生成的 cordis-surface、相关包与公开类型 |
| 验证与升级 | [官方测试策略](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.zh.md) · [发布记录](https://github.com/deepseek-ai/deepseek-harness/releases) | 相应层次的验证、破坏性变化；执行命令使用本项目实际配置 |

## DSH-DOC-02：随官方查询与维护

- 本 Skill 只维护链接和查阅规则，官方教程、API 正文及示例直接从官方读取。每次涉及新接口、依赖升级或已有证据冲突时，重新核对相关官方版本；不在此记录“当前最新版”或复制版本基线。
- 页面移位或目标版本无对应路径时，从[官方文档目录](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs)和发布记录定位该版本正文。中文页缺失时读取同版本英文页；发现中英文或文档/实现差异时核对公开导出与测试，并明确尚未解决的部分。
- 修订目录时核对官方仓库中的目标路径及入口用途；停止维护与官方重复的本地知识副本、代码模板和自设验证脚本。
