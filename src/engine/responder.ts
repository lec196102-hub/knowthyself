/**
 * Triune 引擎 · 响应组装（Phase 1b 拆分）
 *
 * 从原 core/triune.ts 抽出 L3 最终过滤 + TriuneResponse 组装逻辑。
 * 纯函数、可被单测覆盖；编排仍由 core/triune.ts 的 TriuneEngine 负责。
 */

import { finalSafetyFilter } from "../core/safety.js";
import type { TriuneResponse } from "../core/triune.js";
import type { DebateLine } from "./debate.js";

export interface AuditTrail {
  egoGenerated: boolean;
  idReviewed: boolean;
  superegoAudited: boolean;
  modelUsage: { ego: string; id: string; superego: string };
}

export interface AssembleInput {
  /** 本我最终台词（未过滤前） */
  lastId: string;
  /** 超我最终台词（未过滤前） */
  lastSuperego: string;
  /** 自我最终台词（未过滤前） */
  egoText: string;
  /** 前两层已确定的安全标记（anyCensored 由本函数计算） */
  safetyFlags: {
    inputFlagged: boolean;
    idViolated: boolean;
    idViolationType?: string;
  };
  debate?: DebateLine[];
  sources?: { title: string; url: string }[];
  auditTrail?: AuditTrail;
}

export interface AssembleResult {
  response: TriuneResponse;
  /** L3 过滤后的台词（用于更新去重缓存 / 记忆） */
  finalId: string;
  finalEgo: string;
  finalSuperego: string;
}

/** L3 最终过滤 + 组装 TriuneResponse */
export function assembleResponse(input: AssembleInput): AssembleResult {
  const idFinal = finalSafetyFilter(input.lastId);
  const egoFinal = finalSafetyFilter(input.egoText);
  const superegoFinal = finalSafetyFilter(input.lastSuperego);

  const anyCensored =
    idFinal.censoredText !== input.lastId ||
    egoFinal.censoredText !== input.egoText ||
    superegoFinal.censoredText !== input.lastSuperego;

  const response: TriuneResponse = {
    id: { text: idFinal.censoredText!, censored: !idFinal.passed },
    ego: { text: egoFinal.censoredText!, censored: !egoFinal.passed },
    superego: { text: superegoFinal.censoredText!, censored: !superegoFinal.passed },
    safetyFlags: {
      ...input.safetyFlags,
      anyCensored,
    },
    auditTrail: input.auditTrail,
    sources: input.sources && input.sources.length ? input.sources : undefined,
    debate: input.debate && input.debate.length ? input.debate : undefined,
  };

  return {
    response,
    finalId: idFinal.censoredText!,
    finalEgo: egoFinal.censoredText!,
    finalSuperego: superegoFinal.censoredText!,
  };
}
