/**
 * S0 端到端验收脚本
 *
 * 验证条件：
 * 1. 创建公司/部门/员工 → 数据持久化
 * 2. 关闭后重启 → 数据恢复一致
 * 3. 业务状态正确
 *
 * 使用 fake adapter 模拟跨进程持久化介质。
 */

import { strict as assert } from "node:assert";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

// 解析 core/lib/store.js 的绝对路径（不依赖工作目录或硬编码盘符）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..");
const storePath = join(repoRoot, "packages", "core", "lib", "store.js");

// 验证目标文件存在（编译产物不存在时给出明确提示）
if (!existsSync(storePath)) {
  console.error(`❌ 编译产物不存在：${storePath}`);
  console.error("请先运行：pnpm run build");
  process.exit(1);
}

// 导入 core（编译后在 lib 目录）
const { openSoloipsCompanyStore } = await import(pathToFileURL(storePath));

// 模拟 adapter 介质（同模块级 Map，close 后保留）
const media = new Map();
const leaseGenerations = new Map();

function fakeMediumTable(table) {
  let map = media.get(table);
  if (!map) {
    map = new Map();
    media.set(table, map);
  }
  return map;
}

// 完整的 fake table 实现（实现 SoloipsKvTable 接口）
function createFakeTable(tableName) {
  const map = fakeMediumTable(tableName);
  return {
    get(key) {
      return map.get(key);
    },
    *entries() {
      for (const [key, value] of map.entries()) {
        yield [key, value];
      }
    },
    *keys() {
      for (const key of map.keys()) {
        yield key;
      }
    },
    get size() {
      return map.size;
    },
    async put(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      return map.delete(key);
    },
    async update(key, revise) {
      const current = map.get(key);
      if (current === undefined) {
        throw new Error(`${tableName}/${key} 不存在`);
      }
      const next = revise(current);
      map.set(key, next);
      return next;
    },
  };
}

function fakeStoragePort() {
  return {
    async acquireWriterLease({ root }) {
      const gen = (leaseGenerations.get(root) ?? 0) + 1;
      leaseGenerations.set(root, gen);
      return {
        generation: gen,
        storageId: `verify:${root}`,
        async assertHeld() {
          /* OK */
        },
        async dispose() {
          /* OK */
        },
      };
    },
    async createStack({ root }) {
      return {
        facility: {
          async open() {
            return {
              name: "soloips_company",
              table(name) {
                return createFakeTable(name);
              },
              async close() {
                /* OK */
              },
            };
          },
          async closeAll() {
            /* OK */
          },
        },
        binding: { backend: "verify", root, storageId: `verify:${root}` },
        async dispose() {
          /* OK */
        },
      };
    },
    requireFacility(f) {
      if (!f) throw new Error("FACILITY_REQUIRED");
      return f;
    },
  };
}

const ROOT = "/tmp/soloips-verify";
const EMPLOYEE2_OP_ID = "verify-employee2-idempotent-test";

async function run() {
  console.log("=".repeat(60));
  console.log("SoloIPs S0 验收测试");
  console.log("=".repeat(60));

  try {
    // === 第一阶段：创建公司/部门/员工 ===
    console.log("\n[阶段 1] 创建公司/部门/员工...");

    const service1 = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: "verify-test-account", // 测试用账户 ID
    });

    const company = await service1.createCompany({
      operationId: "verify-company-1",
      name: "测试宇宙制作公司",
    });
    assert.equal(company.status, "committed", "公司创建应成功");
    console.log(`  ✓ 公司创建成功: ${company.result.companyId}`);

    const dept = await service1.createDepartment({
      operationId: "verify-dept-1",
      companyId: company.result.companyId,
      name: "创作部",
    });
    assert.equal(dept.status, "committed", "部门创建应成功");
    console.log(`  ✓ 部门创建成功: ${dept.result.departmentId}`);

    const emp = await service1.createEmployee({
      operationId: "verify-employee-1",
      displayName: "张三（导演）",
    });
    assert.equal(emp.status, "committed", "员工创建应成功");
    console.log(`  ✓ 员工创建成功: ${emp.result.employeeId}`);

    // 验证入职前状态
    const gaps1 = service1.checkOnboarding(emp.result.employeeId);
    assert.ok(!gaps1.ready, "新员工入职前应未就绪");
    console.log(`  ✓ 入职前检查：未就绪（gap: ${gaps1.gaps.length} 项）`);

    await service1.close();
    console.log("  ✓ 存储已关闭");

    // === 第二阶段：重启后数据恢复 ===
    console.log("\n[阶段 2] 重启后数据恢复...");

    const service2 = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: "verify-test-account",
    });

    const recoveredCompany = service2.getCompany(company.result.companyId);
    assert.ok(recoveredCompany, "公司应从持久化中恢复");
    assert.equal(recoveredCompany.name, "测试宇宙制作公司", "公司名称应一致");
    console.log(`  ✓ 公司恢复成功: ${recoveredCompany.name}`);

    const recoveredDepts = service2.listDepartments(company.result.companyId);
    assert.equal(recoveredDepts.length, 1, "部门数量应为 1");
    assert.equal(recoveredDepts[0].name, "创作部", "部门名称应一致");
    console.log(`  ✓ 部门恢复成功: ${recoveredDepts[0].name}`);

    const recoveredEmp = service2.getEmployee(emp.result.employeeId);
    assert.ok(recoveredEmp, "员工应从持久化中恢复");
    assert.equal(recoveredEmp.displayName, "张三（导演）", "员工名称应一致");
    console.log(`  ✓ 员工恢复成功: ${recoveredEmp.displayName}`);

    // === 第三阶段：新增数据验证 + 幂等测试 ===
    console.log("\n[阶段 3] 新增数据并验证...");

    const emp2 = await service2.createEmployee({
      operationId: EMPLOYEE2_OP_ID,
      displayName: "李四（编剧）",
    });
    assert.equal(emp2.status, "committed", "第二员工创建应成功");
    console.log(`  ✓ 第二员工创建成功: ${emp2.result.employeeId}`);

    // 立即幂等测试：同一 operationId 重放
    const emp2Replay = await service2.createEmployee({
      operationId: EMPLOYEE2_OP_ID,
      displayName: "李四（编剧）",
    });
    assert.equal(emp2Replay.status, "replayed", "同一 operationId 应返回 replayed");
    assert.equal(
      emp2Replay.result.employeeId,
      emp2.result.employeeId,
      "replayed 应返回相同员工 ID",
    );
    console.log(`  ✓ 同会话幂等：replayed 状态正确`);

    await service2.close();

    // === 第四阶段：跨重启幂等验证 ===
    console.log("\n[阶段 4] 跨重启幂等验证...");

    const service3 = await openSoloipsCompanyStore({
      storage: fakeStoragePort(),
      root: ROOT,
      accountId: "verify-test-account",
    });

    // 复用之前的 operationId 应返回 replayed
    const acrossRestart = await service3.createEmployee({
      operationId: EMPLOYEE2_OP_ID,
      displayName: "李四（编剧）",
    });
    assert.equal(acrossRestart.status, "replayed", "跨重启复用 operationId 应返回 replayed");
    assert.equal(
      acrossRestart.result.employeeId,
      emp2.result.employeeId,
      "replayed 应返回相同员工 ID（跨重启）",
    );
    console.log(`  ✓ 跨重启幂等：replayed 状态正确`);

    await service3.close();

    // === 验收结果 ===
    console.log("\n" + "=".repeat(60));
    console.log("S0 验收结果：✅ 全部通过");
    console.log("=".repeat(60));
    console.log("验证项目：");
    console.log("  1. ✅ 公司创建 + 持久化");
    console.log("  2. ✅ 部门创建 + 持久化");
    console.log("  3. ✅ 员工创建 + 持久化");
    console.log("  4. ✅ 入职前检查（未就绪）");
    console.log("  5. ✅ 重启后数据恢复一致");
    console.log("  6. ✅ 增量数据正确保存");
    console.log("  7. ✅ 同会话 operationId 幂等性");
    console.log("  8. ✅ 跨重启 operationId 幂等性");
    console.log("\n");

    process.exit(0);
  } catch (err) {
    console.error("\n" + "=".repeat(60));
    console.error("S0 验收失败：❌");
    console.error("=".repeat(60));
    console.error(err.message);
    if (err.stack) {
      console.error(err.stack.split("\n").slice(0, 5).join("\n"));
    }
    process.exit(1);
  }
}

run();
