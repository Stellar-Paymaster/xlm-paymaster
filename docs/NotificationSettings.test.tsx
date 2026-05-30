import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NotificationSettings } from "./NotificationSettings";

describe("NotificationSettings Component", () => {
  const mockData = [
    {
      id: "t-1",
      name: "Acme Corp",
      email: { enabled: true, address: "alerts@acme.com" },
      slack: { enabled: false, webhookUrl: "" }
    },
    {
      id: "t-2",
      name: "Globex",
      email: { enabled: false, address: "" },
      slack: { enabled: true, webhookUrl: "https://hooks.slack.com/123" }
    }
  ];

  it("renders tenant data correctly", () => {
    render(<NotificationSettings initialData={mockData} />);
    
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
    expect(screen.getByDisplayValue("alerts@acme.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://hooks.slack.com/123")).toBeInTheDocument();
  });

  it("allows toggling email setting and updating input", () => {
    render(<NotificationSettings initialData={mockData} />);
    
    const emailCheckbox = screen.getByLabelText("Email enabled for Acme Corp");
    const emailInput = screen.getByLabelText("Email address for Acme Corp");
    
    expect(emailCheckbox).toBeChecked();
    expect(emailInput).not.toBeDisabled();
    
    // Disable it
    fireEvent.click(emailCheckbox);
    expect(emailCheckbox).not.toBeChecked();
    expect(emailInput).toBeDisabled();
  });

  it("allows toggling slack setting and updating webhook URL", () => {
    render(<NotificationSettings initialData={mockData} />);
    
    const slackCheckbox = screen.getByLabelText("Slack enabled for Acme Corp");
    const slackInput = screen.getByLabelText("Slack webhook for Acme Corp");
    
    // Initially disabled for Acme
    expect(slackCheckbox).not.toBeChecked();
    expect(slackInput).toBeDisabled();
    
    // Enable and update
    fireEvent.click(slackCheckbox);
    expect(slackInput).not.toBeDisabled();
    
    fireEvent.change(slackInput, { target: { value: "https://hooks.slack.com/new" } });
    expect(slackInput).toHaveValue("https://hooks.slack.com/new");
  });
});