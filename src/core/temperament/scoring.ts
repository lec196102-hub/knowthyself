/**
 * 气质测试 · 计分与判定（Phase 1a 拆分）
 *
 * 从原 core/temperament.ts 抽出：calculateScores / determineProfile 及判定辅助。
 * 题库与基础类型见 questions.ts，风格调制见 profile.ts。
 */

import {
  QUESTIONS,
  OPTION_SCORES,
  TYPE_ORDER,
  TYPE_LABELS,
  type AnswerSheet,
  type TemperamentScores,
  type TemperamentProfile,
  type TemperamentType,
} from "./questions.js";

/** 根据答案计算四个维度得分 */
export function calculateScores(answers: AnswerSheet): TemperamentScores {
  const scores: TemperamentScores = {
    choleric: 0,
    sanguine: 0,
    phlegmatic: 0,
    melancholic: 0,
  };

  for (const q of QUESTIONS) {
    const option = answers[q.id];
    if (option === undefined) continue;
    const score = OPTION_SCORES[option] ?? 0;
    scores[q.category] += score;
  }

  return scores;
}

/** 获取强度标签 */
function getIntensity(score: number): "high" | "moderate" | "low" {
  if (score > 10) return "high";
  if (score >= -5) return "moderate";
  return "low";
}

/** 判定气质类型 */
export function determineProfile(scores: TemperamentScores): TemperamentProfile {
  // 按得分排序
  const ranked = TYPE_ORDER
    .map((t) => ({ type: t, score: scores[t] }))
    .sort((a, b) => b.score - a.score);

  const intensities: Record<TemperamentType, "high" | "moderate" | "low"> = {
    choleric: getIntensity(scores.choleric),
    sanguine: getIntensity(scores.sanguine),
    phlegmatic: getIntensity(scores.phlegmatic),
    melancholic: getIntensity(scores.melancholic),
  };

  const [first, second, third, fourth] = ranked;
  const gap1to2 = first.score - second.score;
  const gap2to3 = second.score - third.score;

  // 判定规则
  if (gap1to2 >= 4) {
    // 单一典型气质
    const heightTag = first.score > 20 ? "高度典型" : "";
    return {
      scores,
      type: "single",
      primary: first.type,
      intensities,
      summary: `${heightTag}${TYPE_LABELS[first.type]}（${first.score}分）。${getSingleDescription(first.type, first.score)}`,
    };
  }

  if (gap1to2 < 3 && gap2to3 >= 4) {
    // 两种混合型
    return {
      scores,
      type: "mixed_dual",
      primary: first.type,
      secondary: second.type,
      intensities,
      summary: `${TYPE_LABELS[first.type]}+${TYPE_LABELS[second.type]}混合型（${first.score}/${second.score}分）。${getDualDescription(first.type, second.type)}`,
    };
  }

  // 均衡混合
  return {
    scores,
    type: "mixed_balanced",
    primary: first.type,
    intensities,
    summary: `均衡混合型，偏${TYPE_LABELS[first.type]}（${first.score}分）。四种气质并存，无明显主导。`,
  };
}

function getSingleDescription(type: TemperamentType, score: number): string {
  const base: Record<TemperamentType, string> = {
    choleric: "热情直率、精力旺盛，情绪起伏大，行动力强但易冲动。",
    sanguine: "活泼外向、适应力强，兴趣广泛但专注力易转移。",
    phlegmatic: "稳重隐忍、情绪平稳，做事踏实但变通较慢、偏被动。",
    melancholic: "敏感细腻、深思熟虑，感受深刻但容易内耗、优柔寡断。",
  };
  const extra = score > 20 ? "特质非常突出。" : "特质较为明显。";
  return base[type] + extra;
}

function getDualDescription(a: TemperamentType, b: TemperamentType): string {
  const map: Record<string, string> = {
    "phlegmatic-melancholic": "外稳内敏，做事踏实同时内心感受丰富，适合深度思考型工作。",
    "phlegmatic-sanguine": "随和灵活，既不急躁也不沉闷，社交和独处都能找到平衡。",
    "choleric-sanguine": "热情外放，精力充沛且善于社交，是天生的行动派和影响者。",
    "choleric-melancholic": "情感浓烈而深刻，时而奔放时而内省，内心世界极其丰富。",
    "phlegmatic-choleric": "稳重中有冲劲，平时不急躁但遇到重要目标会爆发能量。",
    "sanguine-melancholic": "外在活跃内在敏感，善于社交但独处时也有深刻的自省。",
  };
  const key = [a, b].sort().join("-");
  return map[key] ?? `${TYPE_LABELS[a]}的${getSingleDescription(a, 0)}同时兼具${TYPE_LABELS[b]}的特点。`;
}
