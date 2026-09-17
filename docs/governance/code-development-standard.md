# SoloIPs 代码开发规范

> 简化版。完整版见 `docs/technical-architecture.md`。

## 1. 语言与工具

| 项 | 规则 |
|---|---|
| 语言 | TypeScript + ESM |
| 格式化 | Prettier，TS/TSX 两空格缩进 |
| 静态检查 | Oxlint |
| 测试 | Vitest |
| 包管理 | pnpm，统一锁文件 |
| 类型检查 | `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` |

**验证命令**：

```bash
pnpm run format:check   # 格式化检查
pnpm run lint           # 静态检查
pnpm run typecheck      # 类型检查
pnpm run test           # 测试
pnpm run build          # 构建
```

## 2. 包结构

```
packages/
├── soloips-bundle/          # 装配声明，无运行时代码
├── soloips-adapter-dsh/     # DSH 适配，无业务状态
├── soloips-core/            # 唯一业务状态包（公司、作品、IP）
├── soloips-web/             # 界面层
└── soloips-tools-pv/        # S1 加入
```

**依赖方向**：
```
core → adapter → DSH
web → core (经服务)
tools-pv → adapter + core
```

**包边界规则**：
- `core` 是唯一业务写权威
- 其他包只能读投影或经服务请求
- 禁止跨包相对导入，用 `exports` 和服务契约
- 禁止 `any` 绕过类型检查

## 3. 编码规则

### 命名

| 类型 | 规则 |
|---|---|
| 函数/变量 | `camelCase` |
| 类型/类/组件 | `PascalCase` |
| 模块文件 | `kebab-case.ts` |
| React 组件 | `PascalCase.tsx` |

### 类型

- 对外接口写明输入、返回、异步结果
- 不信任的数据先视为 `unknown` 并校验
- 禁止 `any`、`双重断言`、`@ts-ignore`
- 外部类型缺口限于适配边界，须说明

### 错误处理

- 异步操作必须有错误处理
- 错误通过稳定错误码 + 可行动说明传递
- 日志关联 task/attempt/version，不写密钥

**外部 API 失败规则**（红线）：

1. 鉴权/额度/QPS/连接错误首次出现 → 立即停线
2. 通知用户
3. 不自动重试、不换路由
4. 恢复须用户明确指令

### 注释

- 解释不变量、取舍、失败语义
- 引用稳定需求/验收 ID
- 不复述代码

## 4. 状态与持久化

### 写入规则

- 业务写权威归 `core`
- 写前验证身份、权限、状态
- 状态转换检查旧状态/revision
- 不把客户端对象直接覆盖权威记录

### 并发

- 用 revision CAS 防止丢失更新
- 命令有 `operationId` 贯穿全程
- 重复请求返回原结果或可判定结果

### 数据

- 存储路径按 `docs/operations/environment-handoff.md` 解析
- 禁止硬编码绝对路径
- schema 变化说明迁移边界

## 5. 测试

### 覆盖要求

| 变更类型 | 至少覆盖 |
|---|---|
| 领域规则/状态转换 | 正常、非法输入/权限/状态、冲突 |
| 公开接口/适配 | 输入输出契约、真实入口 |
| 持久化/schema | 旧数据、失败中断、写入→停止→读回 |
| 上游失败 | 错误注入、停线、通知 |

### 测试规则

- 用临时目录和合成数据
- 不访问生产数据或真实 API（除非测试故障处理）
- 断言用户可观察行为
- 超时有界

## 6. 提交与交付

### 提交信息格式

```
<type>(<scope>): <描述>

feat(core): 添加公司创建接口
fix(adapter): 修正 session 绑定错误
docs(web): 更新组件文档
```

type: `feat` | `fix` | `docs` | `test` | `refactor` | `chore`

### 交付检查清单

1. 代码符合本规范
2. 适用检查通过（format/lint/typecheck/test/build）
3. 提交信息符合规范
4. 更新相关文档（如有）

### 交付物记录

作者交付时提供：
- 改了什么（前后行为变化）
- 怎么验证（检查命令和结果）
- 适用范围
- 剩余限制

## 7. 目录约定

```
packages/soloips-bundle/
├── package.json
├── cordis.patch.yml
└── tests/

packages/soloips-adapter-dsh/
├── package.json
├── cordis.patch.yml
├── src/index.ts
├── src/contracts.ts    # 按需
└── tests/

packages/soloips-core/
├── package.json
├── cordis.patch.yml
├── src/index.ts
├── src/contracts.ts
├── src/company/        # 按需
├── src/works/         # 按需
└── tests/

packages/soloips-web/
├── package.json
├── cordis.patch.yml
├── src/index.ts        # Host 桥
├── src/client/index.ts # Client 入口
└── tests/
```

## 8. 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 精简版：从原 `code-development-standard.md` 提取核心规则 |
