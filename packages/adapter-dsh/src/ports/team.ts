/**
 * SOLOIPS-ADAPTER-TEAM-PORT
 *
 * 官方 Team 端口（T08 面；contracts-design §7.2 明确**不冻结**）。
 *
 * 现状（本工件集的事实约束）：`@deepseek-ai/dsh-experimental-agent-team` 不在
 * 本包依赖集内（package.json 未声明、node_modules 未安装），`ctx.agentTeams`
 * 挂载点因此也不可用。
 *
 * ## 本端口的定位：**契约保留、能力不可用**
 *
 * 三个事实同时成立：facade 契约要求 `readonly team: SoloipsTeamPort`；对应运行时包不在
 * 依赖集内；本批次（§7.2）不得依赖这个仍可演进的端口。在这个组合下，**确定地报告不可用**
 * 是最小且不伪报能力的处置——不返回空数据或成功结果，也不引入新依赖去扩成真实适配。
 *
 * 〔边界，须回原作者/用户确认〕**本端口不是「最小 Team 实现」，也不构成对「Team 面不做
 * 最小占位」这条裁定原意的确认。** 若该裁定字面禁止任何占位对象，则与现状存在冲突，
 * 不能以技术解释宣布冲突已消失。此处记录的是实现侧的事实处置，不是对裁定范围的裁定。
 *
 * ## 交付纪律
 *
 * - 每个成员都走契约约定的失败通道（`SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE`）；
 *   Promise 成员保持约定的**异步**失败语义，不同步抛出。
 * - **不得**因为 facade 满足了接口就推导 Team 已适配或已验收。
 * - core 不得依赖本端口的成员名（§7.2 消费者纪律）。
 */

import { SoloipsAdapterError } from "../contracts";
import type {
  SoloipsAgentRef,
  SoloipsContentBlock,
  SoloipsTeamMemberView,
  SoloipsTeamPort,
  SoloipsTeamTaskView,
} from "../contracts";

function teamError(): SoloipsAdapterError {
  return new SoloipsAdapterError(
    "SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE",
    "the official team port is not backed in this build: @deepseek-ai/dsh-experimental-agent-team is not part of this artifact set (T08 face, not frozen; SoloipsAdapterConfig.teamEnabled is reserved)",
  );
}

/** 构造官方 Team 端口（fail-closed 占位；见文件头）。 */
export function createTeamPort(): SoloipsTeamPort {
  return {
    listMembers(_lead: SoloipsAgentRef): readonly SoloipsTeamMemberView[] {
      throw teamError();
    },
    listTasks(_lead: SoloipsAgentRef): readonly SoloipsTeamTaskView[] {
      throw teamError();
    },
    sendMessage(
      _lead: SoloipsAgentRef,
      _target: string,
      _content: readonly SoloipsContentBlock[],
    ): Promise<string> {
      return Promise.reject(teamError());
    },
    createTask(
      _lead: SoloipsAgentRef,
      _subject: string,
      _description: string,
    ): Promise<SoloipsTeamTaskView> {
      return Promise.reject(teamError());
    },
    updateTask(
      _lead: SoloipsAgentRef,
      _taskId: string,
      _action: "claim" | "complete",
    ): Promise<SoloipsTeamTaskView> {
      return Promise.reject(teamError());
    },
  };
}
