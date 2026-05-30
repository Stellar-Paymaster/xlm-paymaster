import React from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TransactionFeed } from "./TransactionFeed";

// Mock EventSource for testing SSE behavior
class MockEventSource {
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((error: any) => void) | null = null;
  
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  
  close = vi.fn();
  
  static instances: MockEventSource[] = [];
  static reset() {
    MockEventSource.instances = [];
  }
}

describe("TransactionFeed Component", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    MockEventSource.reset();
    vi.unstubAllGlobals();
  });

  it("renders offline status initially, then connects", () => {
    render(<TransactionFeed feedUrl="/api/feed" />);
    
    expect(screen.getByText("🔴 Offline")).toBeInTheDocument();
    
    act(() => {
      const instance = MockEventSource.instances[0];
      if (instance.onopen) instance.onopen();
    });
    
    expect(screen.getByText("🟢 Live")).toBeInTheDocument();
    expect(screen.getByText("Waiting for new transactions...")).toBeInTheDocument();
  });

  it("displays incoming transaction events", () => {
    render(<TransactionFeed feedUrl="/api/feed" />);
    
    act(() => {
      const instance = MockEventSource.instances[0];
      if (instance.onopen) instance.onopen();
      
      if (instance.onmessage) {
        instance.onmessage({
          data: JSON.stringify({
            id: "tx-1",
            hash: "1234567890abcdef1234567890abcdef",
            status: "success",
            timestamp: new Date().toISOString(),
            feeBumpAmount: "0.01"
          })
        });
      }
    });

    expect(screen.getByText(/12345678\.\.\.90abcdef/)).toBeInTheDocument();
    expect(screen.getByText("success")).toBeInTheDocument();
    expect(screen.getByText("Fee: 0.01 XLM")).toBeInTheDocument();
  });

  it("handles SSE connection errors gracefully", () => {
    render(<TransactionFeed feedUrl="/api/feed" />);
    
    act(() => {
      const instance = MockEventSource.instances[0];
      if (instance.onopen) instance.onopen();
    });
    
    act(() => {
      const instance = MockEventSource.instances[0];
      if (instance.onerror) instance.onerror(new Error("Connection lost"));
    });

    expect(screen.getByText("SSE connection error. Attempting to reconnect...")).toBeInTheDocument();
  });
});