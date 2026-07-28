/**
 * LLM 配置向导
 *
 * 交互式选择 LLM 提供商和模型，自动生成 .env 配置。
 * 支持测试 API 连接。
 *
 * 用法: npx tsx src/llm-setup.ts
 */

import { createInterface } from "readline";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PROVIDERS, findProvider, getRecommendedConfig } from "./client.js";
import type { LLMProvider, LLMModel } from "./client.js";

const ENV_PATH = resolve(".env");

async function main(): Promise<void> {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   🔮 Triune Journal · LLM 配置向导  ║");
  console.log("╚══════════════════════════════════════╝\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));

  // Step 1: 选择提供商
  console.log("📡 可用的 LLM 提供商:\n");
  for (let i = 0; i < PROVIDERS.length; i++) {
    const p = PROVIDERS[i];
    const freeTag = p.freeTier.includes("免费") ? " 🆓" : " 💰";
    console.log(`  ${i + 1}. ${p.name}${freeTag}`);
    console.log(`     ${p.freeTier}`);
    if (p.note) console.log(`     💡 ${p.note}`);
    console.log();
  }

  const rec = getRecommendedConfig();
  console.log(`⭐ 推荐: ${rec.providerInfo!.name} + ${rec.model} (免费)`);

  const choice = await ask("\n选择提供商 (1-6，回车默认推荐): ");
  const idx = choice.trim() ? parseInt(choice.trim(), 10) - 1 : 0;
  const provider = PROVIDERS[idx] || PROVIDERS[0];

  console.log(`\n✅ 已选择: ${provider.name}`);

  // Step 2: 选择模型
  let modelId: string;
  if (provider.id === "custom") {
    modelId = await ask("输入模型名称: ");
    if (!modelId.trim()) {
      console.log("❌ 模型名称不能为空");
      rl.close();
      return;
    }
  } else {
    console.log("\n📦 可用模型:\n");
    for (let i = 0; i < provider.models.length; i++) {
      const m = provider.models[i];
      const tags = m.tags.join(", ");
      console.log(`  ${i + 1}. ${m.name}${m.free ? " 🆓" : ""}  [${tags}]`);
    }

    const mChoice = await ask("\n选择模型 (回车默认第一个): ");
    const mIdx = mChoice.trim() ? parseInt(mChoice.trim(), 10) - 1 : 0;
    const model = provider.models[mIdx] || provider.models[0];
    modelId = model.id;
    console.log(`✅ 已选择: ${model.name}`);
  }

  // Step 3: API Key
  console.log(`\n🔑 需要 API Key`);
  console.log(`   注册地址: ${provider.registerUrl}`);
  const apiKey = await ask("粘贴你的 API Key (输入后不会显示): ");

  if (!apiKey.trim()) {
    console.log("⚠️ 未输入 API Key，将生成占位符，稍后手动编辑 .env");
  }

  // Step 4: 审计模式（可选高级配置）
  console.log("\n⚙️ 审计模式配置:");
  console.log("   1. 统配模式 - 三个 Agent 使用同一模型 (默认)");
  console.log("   2. 主审模式 - Ego(主) 用强模型，Id/Superego(审) 用轻量模型");
  const auditChoice = await ask("选择 (1/2，回车默认1): ");
  const useAuditMode = auditChoice.trim() === "2";

  // Step 5: 生成 .env
  const envContent = generateEnv({
    provider,
    modelId,
    apiKey: apiKey.trim() || "sk-your-api-key-here",
    auditMode: useAuditMode,
  });

  // 备份旧 .env
  if (existsSync(ENV_PATH)) {
    const backup = readFileSync(ENV_PATH, "utf-8");
    writeFileSync(ENV_PATH + ".backup", backup, "utf-8");
    console.log("📋 旧 .env 已备份为 .env.backup");
  }

  writeFileSync(ENV_PATH, envContent, "utf-8");
  console.log(`\n✅ 配置已写入: ${ENV_PATH}`);

  // Step 6: 快速连接测试
  const testChoice = await ask("\n🔬 是否测试 API 连接? (y/N): ");
  if (testChoice.toLowerCase() === "y") {
    console.log("⏳ 测试中...");
    await testConnection(provider.baseUrl, apiKey.trim() || "", modelId);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 配置完成！");
  console.log(`   提供商: ${provider.name}`);
  console.log(`   模型: ${modelId}`);
  console.log(`   审计模式: ${useAuditMode ? "主审分离" : "统配"}`);
  console.log(`\n   启动服务: npm run dev`);
  console.log(`   干跑测试: npm run test:dry`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  rl.close();
}

function generateEnv(opts: {
  provider: LLMProvider;
  modelId: string;
  apiKey: string;
  auditMode: boolean;
}): string {
  const { provider, modelId, apiKey, auditMode } = opts;

  let content = `# Triune Journal 环境配置
# 由 LLM 配置向导自动生成
# 生成时间: ${new Date().toISOString()}

# === LLM 提供商 ===
LLM_PROVIDER=${provider.id}
LLM_API_KEY=${apiKey}
LLM_BASE_URL=${provider.id === "custom" ? "https://api.openai.com/v1" : provider.baseUrl}
LLM_MODEL=${modelId}
`;

  if (auditMode) {
    content += `
# === 审计模式：主审分离 ===
# Ego(主) 使用此模型生成回复
LLM_AUDIT_MAIN_MODEL=${modelId}
# Id/Superego(审) 可使用轻量模型降低成本
LLM_AUDIT_REVIEW_MODEL=${modelId}
`;
  }

  content += `
# === 服务配置 ===
PORT=3000
JOURNAL_DIR=./data/journals
LOG_LEVEL=info
`;

  return content;
}

async function testConnection(baseUrl: string, apiKey: string, model: string): Promise<void> {
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "你好，请回复'连接成功'" }],
        max_tokens: 20,
      }),
    });

    if (response.ok) {
      const data: any = await response.json();
      const reply = data.choices?.[0]?.message?.content || "(空回复)";
      console.log(`✅ 连接成功！模型回复: "${reply.trim()}"`);
    } else {
      const err: any = await response.json().catch(() => ({}));
      console.log(`❌ API 返回错误: ${response.status} ${err.error?.message || err.message || ""}`);
      console.log(`   请检查: 1) API Key 是否正确  2) 账户是否有余额  3) base URL 是否正确`);
    }
  } catch (error: any) {
    console.log(`❌ 连接失败: ${error.message}`);
    console.log(`   请检查网络连接和 base URL`);
  }
}

main().catch(console.error);
