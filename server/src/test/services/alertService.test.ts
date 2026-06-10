import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlertService } from "../../services/alertService";
import { SlackNotifier } from "../../services/slackNotifier";

describe("AlertService", () => {
  let mockSlackNotifier: any;
  let alertService: AlertService;

  beforeEach(() => {
    mockSlackNotifier = {
      notifyLowBalance: vi.fn(),
      notifyIncident: vi.fn()
    };
    const config = {
      slackWebhookUrl: "http://slack.test"
    };
    alertService = new AlertService(config, mockSlackNotifier as any, {});
  });

  it("should correctly identify if alerting is enabled", () => {
    expect(alertService.isEnabled()).toBe(true);
  });

  it("should trigger a test alert", async () => {
    await alertService.sendTestAlert({} as any);
    expect(mockSlackNotifier.notifyLowBalance).toHaveBeenCalled();
  });
});
