export interface SupportChatMessage {
  content: string;
  role: "assistant" | "system" | "user";
}

export function sanitizeChatMessages(
  messages: SupportChatMessage[],
): SupportChatMessage[] {
  return messages
    .filter(
      (message) =>
        message &&
        typeof message.content === "string" &&
        ["assistant", "system", "user"].includes(message.role),
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 4000),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-12);
}
