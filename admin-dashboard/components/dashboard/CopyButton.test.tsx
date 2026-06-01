import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CopyButton } from "./CopyButton";

describe("CopyButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders with default label", () => {
    render(<CopyButton value="test-value" />);
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("renders with a custom label", () => {
    render(<CopyButton value="test-value" label="Copy hash" />);
    expect(screen.getByText("Copy hash")).toBeInTheDocument();
  });

  it("calls navigator.clipboard.writeText with the correct value on click", async () => {
    render(<CopyButton value="abc123" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("abc123");
  });

  it("shows 'Copied' state immediately after click", async () => {
    render(<CopyButton value="abc123" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("reverts to copy label after 2 seconds", async () => {
    render(<CopyButton value="abc123" label="Copy key" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.getByText("Copied")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Copy key")).toBeInTheDocument();
  });

  it("renders in iconOnly mode without a text label", () => {
    render(<CopyButton value="abc123" label="Copy" iconOnly />);
    // The text label should not be in the document
    expect(screen.queryByText("Copy")).not.toBeInTheDocument();
    // But the button itself is still present
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("shows no text label in iconOnly Copied state", async () => {
    render(<CopyButton value="abc123" iconOnly />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("handles clipboard failure gracefully without staying in copied state", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("Permission denied")),
      },
    });
    render(<CopyButton value="abc123" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("renders in sm size without errors", () => {
    render(<CopyButton value="abc123" size="sm" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders in lg size without errors", () => {
    render(<CopyButton value="abc123" size="lg" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
