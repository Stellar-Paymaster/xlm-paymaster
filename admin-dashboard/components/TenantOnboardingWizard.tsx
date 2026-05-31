"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  WizardState,
  TenantData,
  OnboardingStep,
} from "@/src/tenantOnboardingWizard";
import {
  initializeWizard,
  advanceStep,
  regressStep,
  updateTenantData,
  generateApiKey,
  setApiKey,
  completeWizard,
  validateTenantData,
} from "@/src/tenantOnboardingWizard";

export function TenantOnboardingWizard() {
  const [state, setState] = useState<WizardState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setState(initializeWizard());
  }, []);

  if (!state) return null;

  const handleTenantDataChange = (field: keyof TenantData, value: string) => {
    setState(
      updateTenantData(state, {
        ...state.tenantData,
        [field]: value,
      } as Partial<TenantData>)
    );
  };

  const handleNext = async () => {
    if (state.currentStep === "tenant-info") {
      if (!state.tenantData) return;
      const validation = validateTenantData(state.tenantData);
      if (!validation.valid) {
        setState({
          ...state,
          errors: validation.errors,
        });
        return;
      }
    }

    if (state.currentStep === "api-key-generation") {
      setIsLoading(true);
      try {
        const response = await fetch("/api/wizard/generate-key", {
          method: "POST",
        });
        const data = await response.json();
        setState(setApiKey(state, data.apiKey));
        setIsLoading(false);
        setState((prevState) => {
          if (!prevState) return prevState;
          return advanceStep(prevState);
        });
        return;
      } catch (error) {
        console.error("Failed to generate API key:", error);
        setIsLoading(false);
        return;
      }
    }

    if (state.currentStep === "api-key-verification") {
      if (!state.tenantData || !state.apiKey) {
        setState({
          ...state,
          errors: { general: "Missing tenant data or API key" },
        });
        return;
      }
      const completed = completeWizard(state);
      if (completed.errors && Object.keys(completed.errors).length > 0) {
        setState(completed);
        return;
      }
      setState(completed);
      return;
    }

    setState(advanceStep(state));
  };

  const handlePrevious = () => {
    setState(regressStep(state));
  };

  const renderStep = () => {
    switch (state.currentStep) {
      case "welcome":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Welcome to Fluid</h2>
            <p className="text-gray-600">
              Get your first API key in just a few steps. This wizard will guide
              you through creating your first tenant and generating an API key.
            </p>
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm font-medium">What you'll need:</p>
              <ul className="text-sm mt-2 space-y-1">
                <li>✓ Tenant name and email</li>
                <li>✓ Webhook URL (optional)</li>
              </ul>
            </div>
          </div>
        );

      case "tenant-info":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Tenant Information</h2>
            <div>
              <label className="block text-sm font-medium mb-2">
                Tenant Name *
              </label>
              <Input
                type="text"
                placeholder="Your organization name"
                value={state.tenantData?.tenantName || ""}
                onChange={(e) =>
                  handleTenantDataChange("tenantName", e.target.value)
                }
              />
              {state.errors.tenantName && (
                <p className="text-red-500 text-sm mt-1">
                  {state.errors.tenantName}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Email Address *
              </label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={state.tenantData?.tenantEmail || ""}
                onChange={(e) =>
                  handleTenantDataChange("tenantEmail", e.target.value)
                }
              />
              {state.errors.tenantEmail && (
                <p className="text-red-500 text-sm mt-1">
                  {state.errors.tenantEmail}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description (Optional)
              </label>
              <Textarea
                placeholder="What does your organization do?"
                value={state.tenantData?.tenantDescription || ""}
                onChange={(e) =>
                  handleTenantDataChange("tenantDescription", e.target.value)
                }
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Webhook URL (Optional)
              </label>
              <Input
                type="url"
                placeholder="https://your-domain.com/webhook"
                value={state.tenantData?.webhookUrl || ""}
                onChange={(e) =>
                  handleTenantDataChange("webhookUrl", e.target.value)
                }
              />
              {state.errors.webhookUrl && (
                <p className="text-red-500 text-sm mt-1">
                  {state.errors.webhookUrl}
                </p>
              )}
            </div>
          </div>
        );

      case "api-key-generation":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Generate API Key</h2>
            <p className="text-gray-600">
              Click the button below to generate your first API key. This key
              will allow you to authenticate requests to the Fluid API.
            </p>
            <div className="bg-amber-50 p-4 rounded-lg">
              <p className="text-sm font-medium">Important:</p>
              <p className="text-sm mt-2">
                Store your API key securely. You won't be able to see it again
                after this step.
              </p>
            </div>
          </div>
        );

      case "api-key-verification":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">API Key Generated</h2>
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <p className="text-sm font-medium text-green-900">
                Your API Key:
              </p>
              <div className="mt-2 p-3 bg-white border border-green-200 rounded font-mono text-sm break-all">
                {state.apiKey}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                <strong>Your tenant information:</strong>
              </p>
              <ul className="text-sm space-y-1">
                <li>
                  <span className="font-medium">Name:</span>{" "}
                  {state.tenantData?.tenantName}
                </li>
                <li>
                  <span className="font-medium">Email:</span>{" "}
                  {state.tenantData?.tenantEmail}
                </li>
              </ul>
            </div>
          </div>
        );

      case "completion":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-green-600">
              Congratulations! 🎉
            </h2>
            <p className="text-gray-600">
              Your tenant has been successfully created and your API key is
              ready to use.
            </p>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="font-medium">Next steps:</p>
              <ol className="list-decimal list-inside text-sm mt-2 space-y-1">
                <li>Copy your API key to a secure location</li>
                <li>Read the API documentation</li>
                <li>Make your first API call</li>
              </ol>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const currentStepIndex = [
    "welcome",
    "tenant-info",
    "api-key-generation",
    "api-key-verification",
    "completion",
  ].indexOf(state.currentStep);

  const totalSteps = 5;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-sm font-medium text-gray-700">
            Step {currentStepIndex + 1} of {totalSteps}
          </h1>
          <p className="text-sm text-gray-500">
            {Math.round(((currentStepIndex + 1) / totalSteps) * 100)}% Complete
          </p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{
              width: `${((currentStepIndex + 1) / totalSteps) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white p-8 rounded-lg shadow-sm">{renderStep()}</div>

      {/* Error message */}
      {state.errors.general && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{state.errors.general}</p>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-4 mt-8 justify-between">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={
            state.currentStep === "welcome" || state.currentStep === "completion"
          }
        >
          Previous
        </Button>

        <Button
          onClick={handleNext}
          disabled={isLoading}
          className="min-w-32"
        >
          {isLoading ? "Loading..." : state.currentStep === "completion" ? "Done" : "Next"}
        </Button>
      </div>
    </div>
  );
}
