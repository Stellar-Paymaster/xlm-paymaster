import { describe, it, expect, vi, beforeEach } from "vitest";
import { samlLoginHandler, samlCallbackHandler } from "./samlSso";
import { Request, Response } from "express";

// Mock SamlSsoService
vi.mock("../services/samlSso", () => {
  return {
    SamlSsoService: vi.fn().mockImplementation(() => {
      return {
        getSamlRedirectUrl: vi.fn().mockReturnValue("https://mock-okta.com/sso/saml?SAMLRequest=xyz"),
        handleSamlResponse: vi.fn().mockResolvedValue({
          token: "mock_jwt_token",
          email: "sso-admin@fluid.com",
          role: "SUPER_ADMIN",
        }),
      };
    }),
  };
});

describe("SAML SSO Handlers", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockRes = {
      redirect: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
    };
  });

  it("samlLoginHandler should redirect to Okta identity provider", () => {
    mockReq = {};
    samlLoginHandler(mockReq as Request, mockRes as Response);
    expect(mockRes.redirect).toHaveBeenCalledWith("https://mock-okta.com/sso/saml?SAMLRequest=xyz");
  });

  it("samlCallbackHandler should process SAML response and return JSON", async () => {
    mockReq = {
      body: {
        SAMLResponse: "base64_xml_assertion",
      },
      accepts: vi.fn().mockReturnValue(false), // simulated API call
    };

    await samlCallbackHandler(mockReq as Request, mockRes as Response);
    expect(mockRes.json).toHaveBeenCalledWith({
      token: "mock_jwt_token",
      email: "sso-admin@fluid.com",
      role: "SUPER_ADMIN",
    });
  });
});
