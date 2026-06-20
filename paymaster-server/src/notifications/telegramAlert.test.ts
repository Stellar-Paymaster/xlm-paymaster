/**
 * Tests for Telegram alert service
 * Issue #155 — Phase 8: Notifications
 */

import axios from "axios";
import {
  sendLowBalanceAlert,
  sendDailySummaryAlert,
  loadTelegramConfig,
  type TelegramConfig,
} from "./telegramAlert";

jest.mock("axios");
const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mockConfig: TelegramConfig = {
  botToken: "123456:TEST_TOKEN",
  chatId: "-100123456789",
  dashboardUrl: "https://fluid.example.com",
  lowBalanceThreshold: 10,
};

function mockSuccess() {
  mockedPost.mockResolvedValue({ status: 200, data: { ok: true } });
}

// ---------------------------------------------------------------------------
// loadTelegramConfig
// ---------------------------------------------------------------------------
describe("loadTelegramConfig", () => {
  it("throws if env vars are missing", () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    expect(() => loadTelegramConfig()).toThrow(
      "Missing required env vars"
    );
  });

  it("returns config from env vars", () => {
    process.env.TELEGRAM_BOT_TOKEN = "abc:TOKEN";
    process.env.TELEGRAM_CHAT_ID = "-999";
    process.env.ALERT_LOW_BALANCE = "5";
    process.env.DASHBOARD_URL = "https://dash.io";

    const cfg = loadTelegramConfig();
    expect(cfg.botToken).toBe("abc:TOKEN");
    expect(cfg.chatId).toBe("-999");
    expect(cfg.lowBalanceThreshold).toBe(5);
    expect(cfg.dashboardUrl).toBe("https://dash.io");
  });
});

// ---------------------------------------------------------------------------
// sendLowBalanceAlert
// ---------------------------------------------------------------------------
describe("sendLowBalanceAlert", () => {
  beforeEach(() => {
    mockedPost.mockClear();
    // Reset debounce store between tests
    jest.isolateModules(() => {});
  });

  it("does NOT send if balance is above threshold", async () => {
    mockSuccess();
    await sendLowBalanceAlert(mockConfig, {
      address: "GABC123",
      balance: 15,
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it("sends alert when balance is below threshold", async () => {
    mockSuccess();
    await sendLowBalanceAlert(mockConfig, {
      address: "GABC123XYZ456",
      balance: 3.5,
    });

    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, payload] = mockedPost.mock.calls[0];
    expect(url).toContain("/sendMessage");
    expect(payload.text).toContain("Low Balance Alert");
    expect(payload.text).toContain("3.50 XLM");
    expect(payload.reply_markup.inline_keyboard[0]).toHaveLength(2);
    expect(payload.reply_markup.inline_keyboard[0][0].text).toBe("📊 Open Dashboard");
  });

  it("includes truncated wallet address in message", async () => {
    mockSuccess();
    await sendLowBalanceAlert(mockConfig, {
      address: "GABCDEFGHIJKLMNOP",
      balance: 1,
    });

    const payload = mockedPost.mock.calls[0][1];
    expect(payload.text).toContain("GABCDE");
    expect(payload.text).toContain("MNOP");
  });

  it("debounces repeated alerts for same address", async () => {
    mockSuccess();
    const args = { address: "GDEBOUNCE123456", balance: 2 };

    await sendLowBalanceAlert(mockConfig, args);
    await sendLowBalanceAlert(mockConfig, args); // should be debounced

    expect(mockedPost).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// sendDailySummaryAlert
// ---------------------------------------------------------------------------
describe("sendDailySummaryAlert", () => {
  beforeEach(() => mockedPost.mockClear());

  it("sends daily summary with correct content", async () => {
    mockSuccess();
    await sendDailySummaryAlert(mockConfig, {
      date: "2026-03-28",
      totalTransactions: 142,
      totalVolume: 8500.5,
      balance: 320.75,
      successRate: 98.5,
    });

    expect(mockedPost).toHaveBeenCalledTimes(1);
    const payload = mockedPost.mock.calls[0][1];
    expect(payload.text).toContain("Daily Summary");
    expect(payload.text).toContain("2026-03-28");
    expect(payload.text).toContain("142");
    expect(payload.text).toContain("8500.50 XLM");
    expect(payload.text).toContain("98.5%");
    expect(payload.text).toContain("✅"); // high success rate emoji
    expect(payload.reply_markup.inline_keyboard[0][0].text).toBe("📊 View Report");
  });

  it("uses warning emoji when success rate is between 80-95%", async () => {
    mockSuccess();
    await sendDailySummaryAlert(mockConfig, {
      date: "2026-03-27",
      totalTransactions: 50,
      totalVolume: 1000,
      balance: 100,
      successRate: 85,
    });

    const payload = mockedPost.mock.calls[0][1];
    expect(payload.text).toContain("⚠️");
  });

  it("debounces duplicate daily summary for same date", async () => {
    mockSuccess();
    const summary = {
      date: "2026-03-26",
      totalTransactions: 10,
      totalVolume: 100,
      balance: 50,
      successRate: 99,
    };

    await sendDailySummaryAlert(mockConfig, summary);
    await sendDailySummaryAlert(mockConfig, summary);

    expect(mockedPost).toHaveBeenCalledTimes(1);
  });
});