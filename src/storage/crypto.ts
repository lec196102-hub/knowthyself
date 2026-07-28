/**
 * 落盘加密（Encryption at Rest）
 *
 * 老己保存的是用户最私密的内容——日记全文、心理画像、长期记忆、知识库。
 * 这些以明文 JSON 存在 ./data 下，一旦电脑丢失 / 被云备份同步 / 被其他软件读取就会泄露。
 *
 * 本模块用 AES-256-GCM（带认证标签，防篡改）对 adapter 层读写的每一个 JSON 文件加密：
 *   - 密钥在首次启动时随机生成，落盘到 ./data/.tjkey（gitignore 已忽略 data/；Windows 下文件权限形同虚设，但密钥不随仓库泄露）。
 *   - 密文格式：`TJENC1:` + base64( iv[12] | authTag[16] | ciphertext )
 *   - 兼容旧明文文件：读到的内容若没有 `TJENC1:` 前缀，按 JSON 直接解析（平滑迁移，下一次写入自动转密文）。
 *
 * 这是「本地伴侣」应有的最低防护：把"明文躺在磁盘上"这件事消灭掉。
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const ALGO = "aes-256-gcm";
const KEY_FILE = ".tjkey";
const PREFIX = "TJENC1:";

let cachedKey: Buffer | null = null;

function keyPath(): string {
  const dir = resolve("./data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, KEY_FILE);
}

/** 取数据密钥：已缓存则直接返回；否则读 ./data/.tjkey，没有就生成并落盘 */
export function getDataKey(): Buffer {
  if (cachedKey) return cachedKey;
  const kp = keyPath();
  if (existsSync(kp)) {
    cachedKey = Buffer.from(readFileSync(kp, "utf-8").trim(), "hex");
  } else {
    const k = randomBytes(32); // AES-256
    try {
      writeFileSync(kp, k.toString("hex"), { mode: 0o600 });
    } catch {
      // Windows 下 mode 被忽略属正常，忽略即可
    }
    cachedKey = k;
  }
  return cachedKey;
}

/** 把任意对象加密成可写入文件的字符串（带 TJENC1: 前缀） */
export function encryptJson(data: unknown): string {
  const key = getDataKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const json = JSON.stringify(data);
  const enc = Buffer.concat([cipher.update(json, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, enc]).toString("base64");
  return PREFIX + payload;
}

/**
 * 解密：带前缀走 AES-GCM；无前缀则按旧明文 JSON 解析（兼容迁移）。
 * 任何失败都返回 null，交给调用方决定兜底值。
 */
export function decryptJson<T>(raw: string): T | null {
  if (!raw.startsWith(PREFIX)) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  try {
    const buf = Buffer.from(raw.slice(PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv(ALGO, getDataKey(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf-8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
