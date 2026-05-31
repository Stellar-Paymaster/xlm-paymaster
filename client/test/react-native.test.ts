import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { FluidProvider } from "../src/react-native/FluidProvider";
import { useGaslessTransaction } from "../src/react-native/hooks/useGaslessTransaction";
import { FluidClient } from "../src/FluidClient";

// Mock FluidClient
vi.mock("../src/FluidClient", () => {
  return {
    FluidClient: vi.fn().mockImplementation(() => ({
      requestFeeBump: vi.fn().mockResolvedValue({
        xdr: "signed_fee_bump_xdr",
        status: "submitted",
        hash: "tx_hash",
      }),
      terminate: vi.fn(),
    })),
  };
});

// Mock react-native
vi.mock("react-native", () => ({
  StyleSheet: {
    create: (styles: any) => styles,
  },
  TouchableOpacity: ({ children, onPress, disabled }: any) => (
    <div onClick={onPress} disabled={disabled}>{children}</div>
  ),
  Text: ({ children }: any) => <span>{children}</span>,
  ActivityIndicator: () => <div>Loading...</div>,
  View: ({ children }: any) => <div>{children}</div>,
}));

describe("React Native Gasless Boilerplate", () => {
  const config = {
    serverUrl: "https://test.com",
    networkPassphrase: "Test",
  };

  describe("useGaslessTransaction Hook", () => {
    it("should handle the full gasless flow successfully", async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FluidProvider config={config}>{children}</FluidProvider>
      );

      const { result } = renderHook(() => useGaslessTransaction(), { wrapper });

      const txXdr = "unsigned_xdr";
      const signCallback = vi.fn().mockResolvedValue("signed_xdr");

      let response;
      await act(async () => {
        response = await result.current.execute(txXdr, signCallback);
      });

      expect(result.current.status).toBe("success");
      expect(result.current.hash).toBe("tx_hash");
      expect(signCallback).toHaveBeenCalledWith(txXdr);
      expect(response).toBeDefined();
    });

    it("should handle signing errors", async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FluidProvider config={config}>{children}</FluidProvider>
      );

      const { result } = renderHook(() => useGaslessTransaction(), { wrapper });

      const signCallback = vi.fn().mockRejectedValue(new Error("Sign Error"));

      await act(async () => {
        try {
          await result.current.execute("xdr", signCallback);
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error?.message).toContain("Signing failed: Sign Error");
    });
  });

  describe("FluidProvider", () => {
    it("should initialize FluidClient with useWorker: false by default", () => {
      renderHook(() => {}, {
        wrapper: ({ children }) => <FluidProvider config={config}>{children}</FluidProvider>,
      });

      expect(FluidClient).toHaveBeenCalledWith(
        expect.objectContaining({ useWorker: false })
      );
    });
  });
});
