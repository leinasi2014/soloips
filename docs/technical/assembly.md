# 装配机制

> 技术架构 §6。Bundle、Patch、Profile 组合规则。

## 装配模型

DSH 的装配是**在空 entry list 上按序叠加 patch 层**：

```
bundle patches → profile patch → home patch → launcher patch
```

- **根配置恒为空数组**：每次启动由启动器重写
- **层内 patch 按列表遍历**：后写者覆盖先写者
- **服务激活由 inject/service 就绪决定**：不由数组位次保证

## Patch 语义

### 顶层字段替换

```yaml
# patch 按 id 命中后替换顶层字段
id: some.entry.id
config:
  key: new-value    # 整体替换，非深合并
```

**规则**：提供 `config` 时**整体替换**，不做深合并。只写差异键会静默删除其余键。

### 行 id 前缀

| 包 | 前缀 |
|---|---|
| soloips-bundle | `soloips-bundle.*` |
| soloips-adapter-dsh | `soloips-adapter.*` |
| soloips-core | `soloips-core.*` |
| soloips-web | `soloips-web.*` |

**规则**：一行只能由引入它的包完整声明；其他包修改须完整重述全部 config 键。

### 唯一 bundles 顺序

```text
@deepseek-ai/dsh-base
@deepseek-ai/dsh-web-app
soloips-adapter-dsh
soloips-core
soloips-tools-pv       # S1 加入
soloips-web
soloips-bundle         # 装配层，最后加载
```

## Profile 三件套

| 文件 | 必须入 git | 说明 |
|---|---|---|
| `package.json` | ✓ | bundles 顺序与依赖声明 |
| `cordis.patch.yml` | ✓ | 部署值与开关 |
| `pnpm-lock.yaml` | ✓ | 版本锁定 |
| `cordis.yml` | ✗ | 启动器每次重写为空根 |

## 回归检查

变更以下内容后必须运行 `dsh --profile <name> --dump-config`：

- bundle patch
- bundles 顺序
- profile 依赖
- dsh plugin add/remove/update

**规则**：差异必须能解释，不存在"解释不了的即回归"。

## 常见错误

| 错误 | 原因 |
|---|---|
| 只写差异 config | 静默删除其他键 |
| 用 yml 行序控制加载 | 行序无加载语义 |
| 移动 Loader 行控制顺序 | 顺序由数组决定，不由行序 |

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-17 | 从技术架构拆分 |
