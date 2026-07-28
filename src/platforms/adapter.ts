/**
 * IM 平台适配器接口
 *
 * 每个平台（微信、Telegram、Discord 等）实现此接口后，
 * 即可将 Triune Journal 接入该平台。
 *
 * 设计原则：
 * - 所有消息经过统一的安全过滤后再发送
 * - 平台适配器只负责收发，不干预内容
 * - 支持多平台同时在线
 */

/** 平台接收的原始消息 */
export interface IncomingMessage {
  /** 平台内唯一消息 ID */
  messageId: string;
  /** 用户标识 */
  userId: string;
  /** 消息文本内容 */
  text: string;
  /** 消息时间戳 */
  timestamp: number;
  /** 平台类型标识 */
  platform: PlatformType;
  /** 原始消息数据（平台特定） */
  raw?: unknown;
}

/** 发送给平台的回复 */
export interface OutgoingMessage {
  /** 回复的目标用户 */
  userId: string;
  /** 消息内容 */
  text: string;
  /** 关联的原始消息 ID（用于引用回复） */
  replyTo?: string;
}

export type PlatformType = "wechat" | "telegram" | "discord" | "web" | "api";

/** 平台适配器接口 */
export interface IPlatformAdapter {
  /** 平台类型 */
  readonly type: PlatformType;

  /** 启动适配器（建立连接、注册 webhook 等） */
  start(): Promise<void>;

  /** 停止适配器 */
  stop(): Promise<void>;

  /** 发送消息给用户 */
  send(message: OutgoingMessage): Promise<void>;

  /** 注册消息处理器（平台收到消息时回调） */
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;

  /** 健康检查 */
  healthCheck(): Promise<boolean>;
}

/**
 * 消息路由器：连接平台适配器和 Triune 引擎
 */
export class MessageRouter {
  private adapters: IPlatformAdapter[] = [];
  private processJournal: (diary: string) => Promise<{
    id: { text: string };
    ego: { text: string };
    superego: { text: string };
    safety: { anyCensored: boolean };
  }>;

  constructor(
    journalProcessor: (diary: string) => Promise<{
      id: { text: string };
      ego: { text: string };
      superego: { text: string };
      safety: { anyCensored: boolean };
    }>
  ) {
    this.processJournal = journalProcessor;
  }

  /** 注册一个平台适配器 */
  register(adapter: IPlatformAdapter): void {
    this.adapters.push(adapter);

    adapter.onMessage(async (msg) => {
      console.log(`[${adapter.type}] 收到消息 from ${msg.userId}`);

      // 识别为日记（可以使用前缀或自然判断）
      if (this.isJournalEntry(msg.text)) {
        const result = await this.processJournal(msg.text);

        const formatted = this.formatTriuneResponse(result);

        await adapter.send({
          userId: msg.userId,
          text: formatted,
          replyTo: msg.messageId,
        });
      } else {
        // 非日记消息，简单回复引导
        await adapter.send({
          userId: msg.userId,
          text: "请发送你的日记或想分享的内容，我会请三个角色为你批注。",
        });
      }
    });
  }

  /** 启动所有适配器 */
  async startAll(): Promise<void> {
    for (const adapter of this.adapters) {
      await adapter.start();
      console.log(`[${adapter.type}] 适配器已启动`);
    }
  }

  /** 判断消息是否为日记（超过50字或包含 #日记 标签） */
  private isJournalEntry(text: string): boolean {
    return text.includes("#日记") || text.length > 50;
  }

  /** 格式化三Agent回应为群聊风格文本 */
  private formatTriuneResponse(result: {
    id: { text: string };
    ego: { text: string };
    superego: { text: string };
    safety: { anyCensored: boolean };
  }): string {
    const safetyNote = result.safety.anyCensored
      ? "⚠️ 部分内容因安全策略被调整\n\n"
      : "";

    return `${safetyNote}🔥 **本我**\n${result.id.text}\n\n🌿 **自我**\n${result.ego.text}\n\n⭐ **超我**\n${result.superego.text}`;
  }
}
