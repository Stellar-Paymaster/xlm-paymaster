import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymasterClient } from "../../PaymasterClient";

const PRIMARY_SERVER_URL = "https://primary-paymaster.example";
const SECONDARY_SERVER_URL = "https://secondary-paymaster.example";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const FAKE_XDR = "AAAAFAKEFAKEFAKE";

describe("PaymasterClient server fallback redundancy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("retries on the next server when the primary fails and logs the retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            xdr: "fee-bump-xdr",
            status: "ready",
            hash: "hash-123",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const client = new PaymasterClient({
      serverUrls: [PRIMARY_SERVER_URL, SECONDARY_SERVER_URL],
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const resultPromise = client.requestFeeBump(FAKE_XDR, false);

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toMatchObject({
      xdr: "fee-bump-xdr",
      status: "ready",
      hash: "hash-123",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${PRIMARY_SERVER_URL}/fee-bump`);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${SECONDARY_SERVER_URL}/fee-bump`);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Retrying /fee-bump on ${SECONDARY_SERVER_URL} in 250ms.`,
      ),
    );
  });

  it("does not retry 400 client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Invalid XDR",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const client = new PaymasterClient({
      serverUrls: [PRIMARY_SERVER_URL, SECONDARY_SERVER_URL],
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    await expect(client.requestFeeBump(FAKE_XDR, false)).rejects.toThrow(
      "Paymaster server error",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${PRIMARY_SERVER_URL}/fee-bump`);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("temporarily lowers priority for failed nodes on later requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "primary down" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            xdr: "first-success",
            status: "ready",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            xdr: "second-success",
            status: "ready",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const client = new PaymasterClient({
      serverUrls: [PRIMARY_SERVER_URL, SECONDARY_SERVER_URL],
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const firstRequest = client.requestFeeBump(FAKE_XDR, false);
    await vi.runAllTimersAsync();
    await firstRequest;

    const secondRequest = client.requestFeeBump(FAKE_XDR, false);
    await vi.runAllTimersAsync();
    await secondRequest;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${PRIMARY_SERVER_URL}/fee-bump`);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${SECONDARY_SERVER_URL}/fee-bump`);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`${SECONDARY_SERVER_URL}/fee-bump`);
  });
});
