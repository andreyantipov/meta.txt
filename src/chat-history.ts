import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  contextPath?: string;
};

export type ChatHistory = { messages: ChatMessage[] };

const HISTORY_PATH = "/tmp/meta.txt/chat.json";

let writePromise: Promise<void> = Promise.resolve();

export async function loadHistory(): Promise<ChatHistory> {
  try {
    const raw = await readFile(HISTORY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.messages)) return parsed;
  } catch {}
  return { messages: [] };
}

export async function saveHistory(history: ChatHistory): Promise<void> {
  writePromise = writePromise.then(async () => {
    try {
      await mkdir(dirname(HISTORY_PATH), { recursive: true });
      await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2));
    } catch (err) {
      console.error("[chat-history] save failed:", err);
    }
  });
  return writePromise;
}
