/**
 * Telegram Bot Alert Service
 * Phase 8 — Notifications | Issue #155
 *
 * Sends operator alerts via Telegram Bot API when:
 *  - Wallet balance drops below a configured threshold
 *  - Daily summary is ready
 *
 * Env vars (document in .env.example):
 *   TELEGRAM_BOT_TOKEN   — from @BotFather
 *   TELEGRAM_CHAT_ID     — operator chat / group ID
 *   ALERT_LOW_BALANCE    — threshold in XLM (default 10)
 *   DASHBOARD_URL        — base URL for inline button links
 */

import axios, { AxiosError } from "axios";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export interface TelegramConfig {
  botToken: string;
  chatId: string;
  dashboardUrl: string;
  lowBalanceThreshold: number; // XLM
}

export function loadTelegramConfig(): TelegramConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error(
      "Missing required env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID"
    );
  }

  return {
    botToken,
    chatId,
    dashboardUrl: process.env.DASHBOARD_URL ?? "http://localhost:3000",
    lowBalanceThreshold: parseFloat(process.env.ALERT_LOW_BALANCE ?? "10"),
  };
}

// ---------------------------------------------------------------------------
// Telegram API client
// ---------------------------------------------------------------------------
interface InlineButton {
  text: string;
  url: string;
}

interface SendMessagePayload {
  chat_id: string;
  text: string;
  parse_mode: "Markdown" | "HTML";
  reply_markup?: {
    inline_keyboard: { text: string; url: string }[][];
  };
}

async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  buttons: InlineButton[] = []
): Promise<void> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  const payload: SendMessagePayload = {
    chat_id: config.chatId,
    text,
    parse_mode: "Markdown",
  };

  if (buttons.length > 0) {
    payload.reply_markup = {
      inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))],
    };
  }

  try {
    await axios.post(url, payload, { timeout: 10_000 });
  } catch (err) {
    const e = err as AxiosError;
    console.error(
      "[TelegramAlert] Failed to send message:",
      e.response?.data ?? e.message
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Debounce store (in-memory; swap with Redis for multi-instance deployments)
// ---------------------------------------------------------------------------
const debounceStore = new Map<string, number>();

function isDebounced(key: string, windowMs: number): boolean {
  const last = debounceStore.get(key);
  if (!last) return false;
  return Date.now() - last < windowMs;
}

function markSent(key: string): void {
  debounceStore.set(key, Date.now());
}

// ---------------------------------------------------------------------------
// Alert: Low Balance
// ---------------------------------------------------------------------------
export interface BalanceAlertPayload {
  address: string;
  balance: number; // current XLM
  currency?: string;
}

/**
 * Sends a low-balance alert. Debounced per address — once per hour.
 */
export async function sendLowBalanceAlert(
  config: TelegramConfig,
  payload: BalanceAlertPayload
): Promise<void> {
  const { address, balance, currency = "XLM" } = payload;

  if (balance >= config.lowBalanceThreshold) return;

  const debounceKey = `low-balance:${address}`;
  if (isDebounced(debounceKey, 60 * 60 * 1_000)) {
    console.log(`[TelegramAlert] Low-balance alert debounced for ${address}`);
    return;
  }

  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const text = [
    `⚠️ *Low Balance Alert*`,
    ``,
    `Wallet \`${shortAddr}\` has fallen below the threshold.`,
    ``,
    `💰 *Current:* ${balance.toFixed(2)} ${currency}`,
    `🔔 *Threshold:* ${config.lowBalanceThreshold} ${currency}`,
    ``,
    `_Top up your wallet to keep operations running._`,
  ].join("\n");

  await sendTelegramMessage(config, text, [
    { text: "📊 Open Dashboard", url: `${config.dashboardUrl}/wallet` },
    { text: "💳 Top Up", url: `${config.dashboardUrl}/wallet/topup` },
  ]);

  markSent(debounceKey);
  console.log(`[TelegramAlert] Low-balance alert sent for ${address}`);
}

// ---------------------------------------------------------------------------
// Alert: Daily Summary
// ---------------------------------------------------------------------------
export interface DailySummaryPayload {
  date: string;           // e.g. "2026-03-28"
  totalTransactions: number;
  totalVolume: number;    // XLM
  currency?: string;
  balance: number;
  successRate: number;    // 0–100
}

/**
 * Sends the daily summary. Debounced — once per 23 hours.
 */
export async function sendDailySummaryAlert(
  config: TelegramConfig,
  payload: DailySummaryPayload
): Promise<void> {
  const { date, totalTransactions, totalVolume, currency = "XLM", balance, successRate } = payload;

  const debounceKey = `daily-summary:${date}`;
  if (isDebounced(debounceKey, 23 * 60 * 60 * 1_000)) {
    console.log(`[TelegramAlert] Daily summary debounced for ${date}`);
    return;
  }

  const statusEmoji = successRate >= 95 ? "✅" : successRate >= 80 ? "⚠️" : "❌";

  const text = [
    `📈 *Daily Summary — ${date}*`,
    ``,
    `${statusEmoji} *Success Rate:* ${successRate.toFixed(1)}%`,
    `🔁 *Transactions:* ${totalTransactions}`,
    `💸 *Volume:* ${totalVolume.toFixed(2)} ${currency}`,
    `💰 *Closing Balance:* ${balance.toFixed(2)} ${currency}`,
    ``,
    `_Fluid Operator Report_`,
  ].join("\n");

  await sendTelegramMessage(config, text, [
    { text: "📊 View Report", url: `${config.dashboardUrl}/reports/${date}` },
    { text: "🏠 Dashboard", url: config.dashboardUrl },
  ]);

  markSent(debounceKey);
  console.log(`[TelegramAlert] Daily summary sent for ${date}`);
}