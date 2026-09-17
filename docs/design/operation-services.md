# SoloIPs 运营服务接口（预留）

> 本文档定义 SoloIPS 平台运营相关的服务接口契约，供后期实现参考。
> 
> **状态**：预留接口，尚未实现

---

## 1. 多租户用户与认证

### 1.1 用户账户

```typescript
/**
 * 用户账户（跨公司共享）
 */
interface SoloipsUserAccount {
  readonly id: SoloipsUserAccountId;      // 用户唯一 ID
  readonly email: string;                   // 登录邮箱
  readonly passwordHash: string;            // 密码哈希（bcrypt）
  readonly status: 'active' | 'suspended';
  readonly createdAt: string;
  readonly verifiedAt?: string;              // 邮箱验证时间
}

/**
 * 认证上下文
 */
interface SoloipsAuthContext {
  readonly userId: SoloipsUserAccountId;
  readonly sessionId: string;
  readonly ipAddress: string;
}
```

### 1.2 认证服务接口

```typescript
interface SoloipsAuthService {
  /** 用户注册 */
  register(input: { email: string; password: string }): Promise<{ userId: SoloipsUserAccountId }>;
  
  /** 用户登录 */
  login(input: { email: string; password: string }): Promise<{ sessionId: string }>;
  
  /** 用户登出 */
  logout(sessionId: string): Promise<void>;
  
  /** 验证 Session */
  validateSession(sessionId: string): Promise<SoloipsAuthContext | null>;
  
  /** 修改密码 */
  changePassword(input: { userId: string; oldPassword: string; newPassword: string }): Promise<void>;
}
```

---

## 2. 订阅与权益

### 2.1 订阅计划

```typescript
/** 订阅计划 */
type SoloipsPlanCode = 'free' | 'pro' | 'enterprise';

/** 订阅计划详情 */
interface SoloipsPlanDetails {
  readonly planCode: SoloipsPlanCode;
  readonly name: string;                    // "免费版" | "专业版" | "企业版"
  readonly priceMonthly: number;             // 月费（分）
  readonly priceYearly: number;              // 年费（分）
  readonly features: readonly string[];
  readonly limits: {
    readonly maxCompanies: number;          // 最大公司数
    readonly maxSubsidiaries: number;       // 最大子公司数
    readonly maxDepartmentsPerCompany: number;
    readonly maxEmployeesPerCompany: number;
    readonly maxStorageGb: number;          // 存储上限
    readonly apiCallsPerMonth: number;      // API 调用限额
  };
}
```

### 2.2 订阅记录

```typescript
/**
 * 订阅记录
 */
interface SoloipsSubscription {
  readonly id: SoloipsSubscriptionId;
  readonly userId: SoloipsUserAccountId;    // 订阅者
  readonly planCode: SoloipsPlanCode;
  readonly status: 'active' | 'cancelled' | 'expired';
  readonly startDate: string;
  readonly endDate: string;                 // 当前周期结束日
  readonly autoRenew: boolean;
  readonly paymentMethodId?: string;         // 支付方式
}

/**
 * 订阅服务接口
 */
interface SoloipsSubscriptionService {
  /** 获取用户当前订阅 */
  getCurrentSubscription(userId: SoloipsUserAccountId): Promise<SoloipsSubscription | null>;
  
  /** 获取可用计划列表 */
  listAvailablePlans(): Promise<readonly SoloipsPlanDetails[]>;
  
  /** 创建订阅（发起支付） */
  createSubscription(input: {
    userId: SoloipsUserAccountId;
    planCode: SoloipsPlanCode;
    billingCycle: 'monthly' | 'yearly';
    paymentMethodId: string;
  }): Promise<{ subscriptionId: string; paymentUrl: string }>;
  
  /** 取消订阅 */
  cancelSubscription(subscriptionId: string): Promise<void>;
  
  /** 检查配额 */
  checkQuota(userId: SoloipsUserAccountId, resource: string): Promise<{ allowed: boolean; current: number; limit: number }>;
}
```

---

## 3. 支付与财务

### 3.1 支付记录

```typescript
/**
 * 支付记录
 */
interface SoloipsPayment {
  readonly id: SoloipsPaymentId;
  readonly userId: SoloipsUserAccountId;
  readonly subscriptionId?: SoloipsSubscriptionId;
  readonly amount: number;                  // 金额（分）
  readonly currency: 'CNY' | 'USD';
  readonly status: 'pending' | 'completed' | 'failed' | 'refunded';
  readonly method: 'alipay' | 'wechat' | 'stripe';
  readonly externalTransactionId?: string;   // 外部交易号
  readonly paidAt?: string;
  readonly createdAt: string;
}

/**
 * 支付服务接口
 */
interface SoloipsPaymentService {
  /** 发起支付 */
  initiatePayment(input: {
    userId: SoloipsUserAccountId;
    amount: number;
    currency: string;
    method: string;
    description: string;
  }): Promise<{ paymentId: string; paymentUrl: string; qrCode?: string }>;
  
  /** 查询支付状态 */
  getPaymentStatus(paymentId: string): Promise<SoloipsPayment>;
  
  /** 异步回调（支付网关回调） */
  handleWebhook(input: { paymentId: string; status: string; transactionId: string }): Promise<void>;
  
  /** 获取用户支付历史 */
  listUserPayments(userId: SoloipsUserAccountId): Promise<readonly SoloipsPayment[]>;
}
```

### 3.2 发票服务

```typescript
interface SoloipsInvoiceService {
  /** 申请发票 */
  requestInvoice(input: {
    userId: SoloipsUserAccountId;
    paymentId: string;
    invoiceType: 'personal' | 'enterprise';
    taxNumber?: string;
    companyName?: string;
    address?: string;
  }): Promise<{ invoiceId: string }>;
  
  /** 获取发票列表 */
  listUserInvoices(userId: SoloipsUserAccountId): Promise<readonly SoloipsInvoice[]>;
}
```

---

## 4. AI 模型计费

### 4.1 模型配置

```typescript
/**
 * AI 模型配置
 */
interface SoloipsModelConfig {
  readonly modelId: string;                  // 模型 ID
  readonly provider: 'openai' | 'anthropic' | 'claude' | 'local';
  readonly name: string;                    // 显示名称
  readonly description: string;
  readonly capabilities: readonly string[];  // ['chat', 'vision', 'embedding']
  readonly pricing: SoloipsModelPricing;
}

/**
 * 模型计费方式
 */
type SoloipsModelPricing = 
  | { readonly type: 'subscription'; readonly includedTokens: number }  // 订阅包含
  | { readonly type: 'per_token'; readonly inputPricePer1k: number; readonly outputPricePer1k: number }  // 按 token
  | { readonly type: 'per_minute'; readonly pricePerMinute: number }  // 按时间
  | { readonly type: 'per_call'; readonly pricePerCall: number };  // 按次
```

### 4.2 使用量记录

```typescript
/**
 * 模型使用记录
 */
interface SoloipsModelUsage {
  readonly id: SoloipsUsageId;
  readonly userId: SoloipsUserAccountId;
  readonly companyId: SoloipsCompanyId;
  readonly modelId: string;
  readonly usageType: 'input_tokens' | 'output_tokens' | 'minutes' | 'calls';
  readonly quantity: number;
  readonly cost: number;                    // 费用（分）
  readonly timestamp: string;
}

/**
 * 模型计费服务接口
 */
interface SoloipsModelBillingService {
  /** 获取可用模型列表 */
  listAvailableModels(): Promise<readonly SoloipsModelConfig[]>;
  
  /** 记录使用量（由 Agent 执行层调用） */
  recordUsage(input: {
    userId: SoloipsUserAccountId;
    companyId: SoloipsCompanyId;
    modelId: string;
    usageType: string;
    quantity: number;
  }): Promise<{ usageId: string; cost: number }>;
  
  /** 获取用户使用量统计 */
  getUserUsageSummary(userId: SoloipsUserAccountId, period: { start: string; end: string }): Promise<{
    totalCost: number;
    byModel: Readonly<Record<string, { calls: number; cost: number }>>;
    byCompany: Readonly<Record<string, { calls: number; cost: number }>>;
  }>;
  
  /** 获取用户当前计费周期账单 */
  getCurrentInvoice(userId: SoloipsUserAccountId): Promise<SoloipsBillingInvoice>;
  
  /** 预算告警设置 */
  setBudgetAlert(userId: SoloipsUserAccountId, threshold: number): Promise<void>;
}
```

---

## 5. 架构位置

这些运营服务属于**平台运营层**，与核心业务层的关系：

```
┌─────────────────────────────────────────────────────────────────┐
│                    平台运营层（后期实现）                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │ Auth Service    │ │ Subscription     │ │ Payment Service  │  │
│  │ (用户认证)      │ │ (订阅管理)       │ │ (支付网关)       │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
│  ┌─────────────────┐ ┌─────────────────┐                       │
│  │ Model Billing   │ │ Invoice Service  │                       │
│  │ (模型计费)      │ │ (发票管理)       │                       │
│  └─────────────────┘ └─────────────────┘                       │
├─────────────────────────────────────────────────────────────────┤
│                    SoloIPS 核心业务层（当前实现）                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │ Company         │ │ Department       │ │ Employee        │  │
│  │ (公司)          │ │ (部门)           │ │ (员工)          │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
│  ┌─────────────────┐ ┌─────────────────┐                       │
│  │ Document        │ │ Work Entry       │                       │
│  │ (文档)          │ │ (工作准入)       │                       │
│  └─────────────────┘ └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. 实现优先级

| 服务 | 优先级 | 说明 |
|------|--------|------|
| 用户认证 | P1 | 多租户必需的基础能力 |
| 订阅管理 | P1 | 控制用户权益和配额 |
| 支付服务 | P2 | 订阅收费必需 |
| 模型计费 | P2 | 按量付费必需 |
| 发票服务 | P3 | 合规需求 |
| 预算告警 | P3 | 用户体验优化 |

---

## 7. 变更历史

| 日期 | 变更 | 说明 |
|------|------|------|
| 2026-09-17 | 创建 | 预留接口契约，供后期实现参考 |
