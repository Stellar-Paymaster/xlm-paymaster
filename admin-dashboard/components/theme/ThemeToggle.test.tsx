import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const mockSetTheme = vi.fn();
let mockResolvedTheme = "light";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: mockResolvedTheme,
    theme: mockResolvedTheme,
    setTheme: mockSetTheme,
  }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvedTheme = "light";
  });

  it("renders a toggle button", () => {
    render(React.createElement(ThemeToggle));
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls setTheme with dark when current theme is light", async () => {
    mockResolvedTheme = "light";
    const user = userEvent.setup();
    render(React.createElement(ThemeToggle));
    await user.click(screen.getByRole("button"));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme with light when current theme is dark", async () => {
    mockResolvedTheme = "dark";
    const user = userEvent.setup();
    render(React.createElement(ThemeToggle));
    await user.click(screen.getByRole("button"));
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("labels the button to switch to dark in light mode", () => {
    mockResolvedTheme = "light";
    render(React.createElement(ThemeToggle));
    expect(screen.getByLabelText("Switch to dark theme")).toBeInTheDocument();
  });

  it("labels the button to switch to light in dark mode", () => {
    mockResolvedTheme = "dark";
    render(React.createElement(ThemeToggle));
    expect(screen.getByLabelText("Switch to light theme")).toBeInTheDocument();
  });

  it("does not call setTheme when not clicked", () => {
    render(React.createElement(ThemeToggle));
    expect(mockSetTheme).not.toHaveBeenCalled();
  });
});
