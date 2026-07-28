import { SAFETY_RULES } from "../config/safety-rules.js";

/** 安全检测结果 */
export interface SafetyCheckResult {
  passed: boolean;
  reason?: string;
  censoredText?: string;
}

/**
 * 第一层安全：角色级 - 输入/输出内容合规检测
 * 在每个 Agent 调用前后执行
 */
export function checkContentSafety(text: string): SafetyCheckResult {
  // 本地关键词快速扫描
  for (const pattern of SAFETY_RULES.BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        passed: false,
        reason: `内容触发安全规则: ${pattern.source}`,
      };
    }
  }

  return { passed: true };
}

/**
 * 第三层安全：用户可见级 - 输出汇总前的最终过滤
 * 对违规内容进行打码替换
 */
export function finalSafetyFilter(text: string): SafetyCheckResult {
  const check = checkContentSafety(text);
  if (!check.passed) {
    return {
      passed: false,
      reason: check.reason,
      censoredText: SAFETY_RULES.CENSORED_MESSAGE,
    };
  }
  return { passed: true, censoredText: text };
}

/**
 * 检测用户输入是否包含违规内容
 * 返回 true 表示安全，false 表示违规
 */
export function validateUserInput(input: string): { safe: boolean; warning?: string } {
  const lowered = input.toLowerCase();

  // 显式违规类别
  const violations: string[] = [
    "色情", "性交", "裸体", "做爱", "上床",
    "杀人", "报复社会", "制毒", "贩毒",
    "自杀方法", "怎么死", "割腕",
  ];

  for (const v of violations) {
    if (lowered.includes(v)) {
      return {
        safe: false,
        warning: "你的输入涉及我无法支持的内容。请重新表达你的想法，我们可以聊聊感受而非行为。",
      };
    }
  }

  return { safe: true };
}

/**
 * 第二层安全：群聊级 - 检测本我输出是否踩线
 * 如果踩线，标记为需要超我和自我追加纠正
 */
export function detectIdViolation(idOutput: string): { violated: boolean; violationType?: string } {
  const lowered = idOutput.toLowerCase();

  // 设计原则：第二层只检测「本我」输出是否踩线，结果会触发超我的纠正口吻。
  // 误报会直接摧毁「被懂」的核心体验，故坚持「宁可漏报、不可误报」：
  // 全部采用多字 / 明确语境匹配，绝不使用单字（如"性""打""去"）匹配，
  // 以免"你去打游戏""你的性格很温柔""男性视角""裸色口红"被误判违规。
  const dangerPatterns: [RegExp, string][] = [
    // 怂恿 / 建议用户实施伤害：需「建议口吻词 + 伤害动作 + 对象」三段齐全
    [/(应该|建议|干脆|不如|去|让我|帮你)(报复|伤害|攻击|殴打|痛骂|辱骂|骂|打)(他|她|别人|他们|对方|回去)/, "行为建议"],
    // 色情 / 露骨内容：仅限明确露骨词，避开"性格/性别/男性/女性"等日常字
    [/(色情|性爱|性行为|做爱|裸体|裸照|全裸|淫秽|淫荡|黄片|成人影片)/, "色情内容"],
    // 自残 / 自杀倾向：需完整语义，避开"不想活出精彩"类表述
    [/(自杀|结束生命|不想活了|不想活下去|去死算了|一了百了)/, "自残倾向"],
  ];

  for (const [pattern, type] of dangerPatterns) {
    if (pattern.test(lowered)) {
      return { violated: true, violationType: type };
    }
  }

  return { violated: false };
}

/** 统一的安全准则文本 */
export const ETHICS_CLAUSE = SAFETY_RULES.ETHICS_CLAUSE;
