/**
 * 气质测试 · 题库与基础类型（Phase 1a 拆分）
 *
 * 从原 core/temperament.ts 抽出：四气质维度类型、60 道题库、
 * 选项分值、每日抽题、恭喜词。计分 / 判定见 scoring.ts，风格调制见 profile.ts。
 */

// ==================== 基础类型 ====================

/** 单道题目 */
export interface TemperamentQuestion {
  id: number;
  text: string;
  category: "choleric" | "sanguine" | "phlegmatic" | "melancholic";
}

export type TemperamentType = "choleric" | "sanguine" | "phlegmatic" | "melancholic";

/** 用户对60题的答案：题号 → 选项(1-5) */
export type AnswerSheet = Record<number, number>;

/** 四个维度的原始得分 */
export interface TemperamentScores {
  choleric: number;    // 胆汁质
  sanguine: number;    // 多血质
  phlegmatic: number;  // 粘液质
  melancholic: number; // 抑郁质
}

/** 气质判定结果 */
export interface TemperamentProfile {
  scores: TemperamentScores;
  /** 判定类型 */
  type: "single" | "mixed_dual" | "mixed_balanced";
  /** 主导气质 */
  primary: TemperamentType;
  /** 次导气质（混合型时有值） */
  secondary?: TemperamentType;
  /** 各维度强度标签 */
  intensities: Record<TemperamentType, "high" | "moderate" | "low">;
  /** 人类可读的判定摘要 */
  summary: string;
}

// ==================== 测试题目定义 ====================

export const QUESTIONS: TemperamentQuestion[] = [
  // 粘液质 (phlegmatic): 1, 7, 10, 13, 18, 22, 26, 30, 33, 39, 43, 45, 49, 55, 57
  { id: 1, text: "做事力求稳妥，一般不做无把握的事。", category: "phlegmatic" },
  { id: 7, text: "喜欢安静的环境。", category: "phlegmatic" },
  { id: 10, text: "生活有规律，很少违反作息制度。", category: "phlegmatic" },
  { id: 13, text: "遇到令人气愤的事，能很好地克制自我。", category: "phlegmatic" },
  { id: 18, text: "当注意力集中于一事物时，别的事很难使我分心。", category: "phlegmatic" },
  { id: 22, text: "能够长时间做枯燥、单调的工作。", category: "phlegmatic" },
  { id: 26, text: "与人交往不卑不亢。", category: "phlegmatic" },
  { id: 30, text: "不喜欢长时间谈论一个问题，愿意实际动手干。", category: "phlegmatic" },
  { id: 33, text: "理解问题常比别人慢些。", category: "phlegmatic" },
  { id: 39, text: "老师或师傅讲授新知识、技术时，总希望他讲慢些，多重复几遍。", category: "phlegmatic" },
  { id: 43, text: "不能很快地把注意力从一件事转移到另一件事上去。", category: "phlegmatic" },
  { id: 45, text: "认为墨守成规比冒风险强些。", category: "phlegmatic" },
  { id: 49, text: "对工作抱认真严谨、始终一贯的态度。", category: "phlegmatic" },
  { id: 55, text: "在体育活动中，常因反应慢而落后。", category: "phlegmatic" },
  { id: 57, text: "喜欢有条理而不甚麻烦的工作。", category: "phlegmatic" },

  // 胆汁质 (choleric): 2, 6, 9, 14, 17, 21, 27, 31, 36, 38, 42, 48, 50, 54, 58
  { id: 2, text: "遇到可气的事就怒不可遏，想把心里话全说出来才痛快。", category: "choleric" },
  { id: 6, text: "和人争吵时总是先发制人，喜欢挑衅。", category: "choleric" },
  { id: 9, text: "羡慕那种善于克制自己感情的人。", category: "choleric" },
  { id: 14, text: "做事总是有旺盛的精力。", category: "choleric" },
  { id: 17, text: "情绪高昂时，觉得干什么都有趣；情绪低落时，又觉得什么都没意思。", category: "choleric" },
  { id: 21, text: "对学习、工作、事业抱有很高的热情。", category: "choleric" },
  { id: 27, text: "喜欢参加热烈的活动。", category: "choleric" },
  { id: 31, text: "宁愿侃侃而谈，不愿窃窃私语。", category: "choleric" },
  { id: 36, text: "认准一个目标就希望尽快实现，不达目的誓不罢休。", category: "choleric" },
  { id: 38, text: "做事有些莽撞，常常不考虑后果。", category: "choleric" },
  { id: 42, text: "喜欢运动量大的剧烈体育活动，或参加各种文艺活动。", category: "choleric" },
  { id: 48, text: "爱看情节起伏跌宕、激动人心的小说。", category: "choleric" },
  { id: 50, text: "和周围人们的关系总是相处不好。", category: "choleric" },
  { id: 54, text: "别人说我「出语伤人」，可我并不觉得这样。", category: "choleric" },
  { id: 58, text: "兴奋的事常使我失眠。", category: "choleric" },

  // 抑郁质 (melancholic): 3, 5, 12, 15, 20, 24, 28, 32, 35, 37, 41, 47, 51, 53, 59
  { id: 3, text: "宁可一个人干事，不愿很多人在一起。", category: "melancholic" },
  { id: 5, text: "厌恶那些强烈的刺激，如尖叫、噪音、危险镜头。", category: "melancholic" },
  { id: 12, text: "碰到陌生人觉得很拘束。", category: "melancholic" },
  { id: 15, text: "遇到问题总是举棋不定，优柔寡断。", category: "melancholic" },
  { id: 20, text: "碰到危险情境，常有一种极度恐怖感。", category: "melancholic" },
  { id: 24, text: "一点小事就能引起情绪波动。", category: "melancholic" },
  { id: 28, text: "爱看感情细腻、描写人物内心活动的文学作品。", category: "melancholic" },
  { id: 32, text: "别人说我总是闷闷不乐。", category: "melancholic" },
  { id: 35, text: "心里有话宁愿自己想，不愿说出来。", category: "melancholic" },
  { id: 37, text: "学习、工作同样一段时间后，常比别人更疲倦。", category: "melancholic" },
  { id: 41, text: "做作业或完成一件工作总比别人花的时间多。", category: "melancholic" },
  { id: 47, text: "当我烦闷的时候，别人很难使我高兴起来。", category: "melancholic" },
  { id: 51, text: "喜欢复习学过的知识，重复做已经掌握的工作。", category: "melancholic" },
  { id: 53, text: "小时候会背的诗歌，我似乎比别人记得清楚。", category: "melancholic" },
  { id: 59, text: "老师讲新概念，常常听不懂，但是弄懂以后就很难忘记。", category: "melancholic" },

  // 多血质 (sanguine): 4, 8, 11, 16, 19, 23, 25, 29, 34, 40, 44, 46, 52, 56, 60
  { id: 4, text: "到一个新环境很快就能适应。", category: "sanguine" },
  { id: 8, text: "善于和人交往。", category: "sanguine" },
  { id: 11, text: "在多数情况下情绪是乐观的。", category: "sanguine" },
  { id: 16, text: "在人群中从不觉得过分拘束。", category: "sanguine" },
  { id: 19, text: "理解问题总比别人快。", category: "sanguine" },
  { id: 23, text: "符合兴趣的事情，干起来劲头十足，否则就不想干。", category: "sanguine" },
  { id: 25, text: "讨厌做那种需要耐心、细致的工作。", category: "sanguine" },
  { id: 29, text: "工作学习时间长了，常感到厌倦。", category: "sanguine" },
  { id: 34, text: "疲倦时只要短暂的休息就能精神抖擞，重新投入工作。", category: "sanguine" },
  { id: 40, text: "能够很快地忘记那些不愉快的事情。", category: "sanguine" },
  { id: 44, text: "接受一个任务后，就希望把它迅速解决。", category: "sanguine" },
  { id: 46, text: "能够同时注意几件事物。", category: "sanguine" },
  { id: 52, text: "希望做变化大、花样多的工作。", category: "sanguine" },
  { id: 56, text: "反应敏捷，头脑机智。", category: "sanguine" },
  { id: 60, text: "假如工作枯燥无味，马上就会情绪低落。", category: "sanguine" },
];

/** 题目总数（用于进度显示） */
export const TOTAL_QUESTIONS = QUESTIONS.length;

/** 每日答题量（6 天答完 60 题） */
export const QUESTIONS_PER_DAY = 10;

/** 选项分值映射 */
export const OPTION_SCORES: Record<number, number> = {
  1: 2,   // 很符合
  2: 1,   // 比较符合
  3: 0,   // 拿不准/中间
  4: -1,  // 比较不符合
  5: -2,  // 完全不符合
};

export const TYPE_LABELS: Record<TemperamentType, string> = {
  choleric: "胆汁质",
  sanguine: "多血质",
  phlegmatic: "粘液质",
  melancholic: "抑郁质",
};

export const TYPE_ORDER: TemperamentType[] = ["choleric", "sanguine", "phlegmatic", "melancholic"];

/**
 * 从尚未回答的题目中取出「今日一批」（默认 10 道）。
 * 按题号升序取，使每天 10 题均匀覆盖四种气质维度（题号本身已交错分布），
 * 天然保证跨天不重复：已答过的题不会再次出现。
 */
export function pickDailyQuestions(answered: AnswerSheet, perDay: number = QUESTIONS_PER_DAY): TemperamentQuestion[] {
  const answeredSet = new Set(Object.keys(answered).map(Number));
  return [...QUESTIONS]
    .sort((a, b) => a.id - b.id)
    .filter((q) => !answeredSet.has(q.id))
    .slice(0, perDay);
}

/** 根据完整画像生成「恭喜词」（6 天答完 / 语言推断完成时弹出） */
export function buildCongrats(profile: TemperamentProfile, source: "questionnaire" | "language" = "questionnaire"): string {
  const label = TYPE_LABELS[profile.primary];
  const byType: Record<TemperamentType, string> = {
    choleric: "你像一团火，热烈而直接。这份能量是你的天赋，记得也为它找一个方向。",
    sanguine: "你像一阵风，轻盈而好奇。世界因你的灵动而更有趣。",
    phlegmatic: "你像一潭静水，安稳而温柔。你的从容，是很多人求而不得的定力。",
    melancholic: "你像秋夜的雨，细腻而深刻。你的敏感不是软肋，而是看见世界纹理的天赋。",
  };
  const tail = profile.secondary
    ? `而${TYPE_LABELS[profile.secondary]}的那一面，也悄悄在你身上生长。`
    : "";
  const intro =
    source === "language"
      ? "🎉 读罢你写下的字，我大概摸到了你说话的脾气。\n不答题、不勾选，你的文字本身就是答案。\n"
      : "🎉 恭喜你完成气质探索！\n六天，六十题，你为自己按下了一枚温柔的印章。\n";
  return (
    intro +
    `你的核心气质是——${label}。${byType[profile.primary]}${tail}\n` +
    "从今天起，三个角色会更懂你说话的方式。"
  );
}
