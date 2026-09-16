/**
 * SOLOIPS-ADAPTER-TEAM-PORT
 *
 * 官方 Team 端口（T08 面；contracts-design §7.2 明确**不冻结**）。
 *
 * 现状（本工件集的事实约束）：`@deepseek-ai/dsh-experimental-agent-team` 不在
 * 本包依赖集内（package.json 未声明、node_modules 未安装），`ctx.agentTeams`
 * 挂载点因此也不可用。按 Lead 2026-09-16 裁定「Team 面不做最小占位」，本端口
 * 保持**薄且 fail-closed**：满足契约的接口形状，但每个成员都以
 * `SOLOIPS_ADAPTER_SERVICE_UNAVAILABLE` 拒绝，等待 T08 定稿时替换为真实适配。
 *
 * core 不得依赖本端口的成员名（§7.2 消费者纪律）。
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
