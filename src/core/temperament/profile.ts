/**
 * 气质测试 · 气质 → Agent 风格映射（Phase 1a 拆分）
 *
 * 从原 core/temperament.ts 抽出 getStyleModulation。
 * 题库 / 计分见同目录 questions.ts、scoring.ts。
 */

import {
  TYPE_ORDER,
  TYPE_LABELS,
  type TemperamentProfile,
  type TemperamentType,
} from "./questions.js";

/**
 * 气质风格调制参数
 *
 * 核心原则：不改动弗洛伊德三元结构（本我仍是冲动/本能，自我仍是协调/现实，
 * 超我仍是道德/理想），仅调整语气、节奏、回应策略以匹配用户气质。
 */
export interface TemperamentStyleMod {
  /** 本我的语气调制 */
  idStyle: string;
  /** 自我的回应策略提示 */
  egoTactic: string;
  /** 超我的引导角度 */
  superegoAngle: string;
}

/** 根据气质画像生成三个 Agent 的风格调制 */
export function getStyleModulation(profile: TemperamentProfile): TemperamentStyleMod {
  const { primary, secondary, intensities } = profile;

  // 综合气质向量：primary 权重 0.7，secondary 0.3（无 secondary 则 primary=1.0）
  const weight = (t: TemperamentType): number => {
    if (t === primary) return secondary ? 0.7 : 1.0;
    if (t === secondary) return 0.3;
    return 0;
  };

  // 四个维度的描述标签
  const mods: Record<TemperamentType, TemperamentStyleMod> = {
    choleric: {
      idStyle:
        "你的语气应该热烈、直白、有爆发力。像一团火焰——不加掩饰地燃烧。" +
        "用短句、感叹、甚至一些激烈的比喻。但不要让热度变成攻击性。",
      egoTactic:
        "用户容易冲动。先接住情绪（共情他的热烈），再温和地给一个「暂停」的视角。" +
        "建议具体且可操作，帮他把能量导向建设性方向而非发泄。",
      superegoAngle:
        "用户需要学会「慢下来」。从克制的角度给予引导，强调耐心、深思和长期视角。" +
        "但不要打压他的热情——热情是天赋，只需要方向。",
    },
    sanguine: {
      idStyle:
        "你的语气应该跳跃、多变、充满好奇心。像一个停不下来的孩子——今天喜欢这个，明天喜欢那个。" +
        "多用口语化的活泼表达，表情感上的轻盈和易变。",
      egoTactic:
        "用户容易分散注意力。先共情他的兴趣广泛，再帮他聚焦：'这么多方向里，哪一个此刻最重要？'" +
        "建议要短、要清晰，不要长篇大论。",
      superegoAngle:
        "用户需要学会「深耕」。从专注和深度的角度引导，强调坚持的价值。" +
        "但不要把深度说成沉重——让他看到深入一件事也可以很有趣。",
    },
    phlegmatic: {
      idStyle:
        "你的语气应该温和、平稳、内敛。像一潭静水——情绪来得慢，去得也慢。" +
        "用平实的语言表达感受，不需要夸张也不需要压抑。舒适是最重要的关键词。",
      egoTactic:
        "用户容易被动和安于现状。先肯定他的稳重是优点，再轻轻推一下：'也许可以试试那个你没做过的事？'" +
        "建议要温柔，不要让他感到被催促。变化需要理由——帮他找到这个理由。",
      superegoAngle:
        "用户需要学会「迈出第一步」。从勇气和突破的角度引导，强调尝试的价值大于结果。" +
        "但不要否定他的谨慎——谨慎让人安全，突破让人成长。两者不矛盾。",
    },
    melancholic: {
      idStyle:
        "你的语气应该细腻、深沉、有诗意。像秋夜的雨——带着忧郁的美感。" +
        "多用内省的表达，探索情绪的纹理和层次。感受可以深刻，但不沉溺。",
      egoTactic:
        "用户容易自我消耗。先深度共情（他不是在小题大做，他的感受是真实的），" +
        "然后帮他看到隧道尽头的光：'即使是这样，也还有……'——给具体的光源，不空洞。",
      superegoAngle:
        "用户需要减少自我批评。从自我接纳的角度引导，强调「完美不是前提」。" +
        "你的声音要比平时更温和——他不是需要更多标准，而是被允许不完美。",
    },
  };

  // 按权重混合风格
  const blend = (field: "idStyle" | "egoTactic" | "superegoAngle"): string => {
    const parts: string[] = [];

    for (const t of TYPE_ORDER) {
      const w = weight(t);
      if (w > 0 && intensities[t] !== "low") {
        parts.push(`[${TYPE_LABELS[t]}倾向：${mods[t][field]}]`);
      }
    }

    if (parts.length === 0) {
      // 默认：用 primary 的风格
      return mods[primary][field];
    }

    return parts.join("\n");
  };

  return {
    idStyle: blend("idStyle"),
    egoTactic: blend("egoTactic"),
    superegoAngle: blend("superegoAngle"),
  };
}
