import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const props: React.ComponentProps<typeof ConfirmDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    title: "Delete item",
    description: "This action cannot be undone. Are you sure?",
    onConfirm: vi.fn(),
    ...overrides,
  };
  return { ...render(React.createElement(ConfirmDialog, props)), props };
}

describe("ConfirmDialog", () => {
  it("renders the title and description", () => {
    renderDialog();

    expect(screen.getByRole("heading", { name: "Delete item" })).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone. Are you sure?")).toBeInTheDocument();
  });

  it("renders default confirm and cancel labels", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders custom confirm and cancel labels", () => {
    renderDialog({ confirmLabel: "Yes, delete", cancelLabel: "No, keep it" });

    expect(screen.getByRole("button", { name: "Yes, delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No, keep it" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked and onCancel is provided", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onCancel, onOpenChange });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("calls onOpenChange(false) when cancel button is clicked and no onCancel provided", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables both buttons and shows spinner when isLoading is true", () => {
    renderDialog({ isLoading: true });

    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });

    expect(confirmBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
    // Loader icon is rendered as a sibling to the label text
    expect(confirmBtn.querySelector("svg")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("heading", { name: "Delete item" })).not.toBeInTheDocument();
  });

  it("calls onOpenChange when the dialog requests to close (Escape / overlay click)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
