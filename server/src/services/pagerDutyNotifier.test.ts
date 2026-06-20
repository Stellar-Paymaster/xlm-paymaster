import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PagerDutyNotifier } from "./pagerDutyNotifier";

describe("PagerDutyNotifier", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("ok"),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it("sends trigger events with stable dedup keys", async () => {
    const notifier = new PagerDutyNotifier({
      routingKey: "routing-key-test",
      serviceName: "Paymaster test",
      source: "paymaster-test",
      component: "fee-sponsor",
    });

    const sent = await notifier.trigger("signer_pool_empty", {
      summary: "No usable signers",
      severity: "critical",
      customDetails: { active_signers: 0 },
    });

    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, request] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(request?.body));

    expect(payload.event_action).toBe("trigger");
    expect(payload.routing_key).toBe("routing-key-test");
    expect(payload.dedup_key).toBe("paymaster:signer_pool_empty");
    expect(payload.payload.summary).toBe("No usable signers");
    expect(payload.payload.custom_details.active_signers).toBe(0);
  });

  it("sends resolve events with the same dedup key", async () => {
    const notifier = new PagerDutyNotifier({
      routingKey: "routing-key-test",
    });

    const sent = await notifier.resolve("horizon_unreachable", {
      summary: "Horizon recovered",
      severity: "info",
    });

    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, request] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(request?.body));

    expect(payload.event_action).toBe("resolve");
    expect(payload.dedup_key).toBe("paymaster:horizon_unreachable");
    expect(payload.payload.summary).toBe("Horizon recovered");
  });
});
