import { randomUUID } from "crypto";
import prisma from "../utils/db";
import { signAdminJwt } from "../utils/adminAuth";
import { createLogger } from "../utils/logger";
import { AdminRole } from "../utils/permissions";

const logger = createLogger({ component: "saml_sso_service" });

const adminUserModel = (prisma as any).adminUser as {
  findUnique: (args: any) => Promise<any | null>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

export class SamlSsoService {
  /**
   * Generates Okta SAML redirect URL.
   */
  public getSamlRedirectUrl(): string {
    const entryPoint = process.env.SAML_ENTRY_POINT || "https://mock-okta.com/sso/saml";
    const issuer = process.env.SAML_ISSUER || "urn:paymaster:server";
    const callbackUrl = process.env.SAML_CALLBACK_URL || "http://localhost:3000/admin/auth/saml/callback";

    const id = "_" + randomUUID().replace(/-/g, "");
    const instant = new Date().toISOString();

    const requestXml = `
      <samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        ID="${id}"
        Version="2.0"
        IssueInstant="${instant}"
        ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        AssertionConsumerServiceURL="${callbackUrl}">
        <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${issuer}</saml:Issuer>
        <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
      </samlp:AuthnRequest>
    `.trim();

    // Deflate and Base64 encode
    const deflated = require("zlib").deflateRawSync(Buffer.from(requestXml));
    const base64 = deflated.toString("base64");
    const encodedRequest = encodeURIComponent(base64);

    return `${entryPoint}?SAMLRequest=${encodedRequest}`;
  }

  /**
   * Processes SAMLResponse, extracts details, syncs database admin user, and issues a JWT token.
   */
  public async handleSamlResponse(samlResponseBase64: string): Promise<{ token: string; email: string; role: string }> {
    if (!samlResponseBase64) {
      throw new Error("Missing SAMLResponse payload");
    }

    const xml = Buffer.from(samlResponseBase64, "base64").toString("utf-8");
    logger.debug({ xml }, "Received SAMLResponse XML");

    // Extract NameID (email)
    const emailMatch = xml.match(/<saml2?:NameID.*?>(.*?)<\/saml2?:NameID>/i) || xml.match(/<NameID.*?>(.*?)<\/NameID>/i);
    const email = emailMatch ? emailMatch[1].trim() : null;

    if (!email) {
      throw new Error("Could not parse NameID/Email from SAML assertion");
    }

    // Extract Role/Groups attribute from Okta assertion
    const attributeMatch = xml.match(/<saml2?:Attribute\s+[^>]*Name=["']role["'][^>]*>([\s\S]*?)<\/saml2?:Attribute>/i) ||
                           xml.match(/<Attribute\s+[^>]*Name=["']role["'][^>]*>([\s\S]*?)<\/Attribute>/i);
    let role: AdminRole = "READ_ONLY";

    if (attributeMatch) {
      const valMatch = attributeMatch[1].match(/<saml2?:AttributeValue[^>]*>(.*?)<\/saml2?:AttributeValue>/i) ||
                       attributeMatch[1].match(/<AttributeValue[^>]*>(.*?)<\/AttributeValue>/i);
      if (valMatch) {
        const val = valMatch[1].trim().toUpperCase();
        if (["SUPER_ADMIN", "ADMIN", "READ_ONLY", "BILLING"].includes(val)) {
          role = val as AdminRole;
        }
      }
    }

    // Directory Sync
    logger.info({ email, role }, "Enterprise Directory Syncing user from Okta...");
    
    let user = await adminUserModel.findUnique({ where: { email } });
    if (!user) {
      user = await adminUserModel.create({
        data: {
          id: randomUUID(),
          email,
          passwordHash: "SSO_USER_NO_PASSWORD",
          role,
          active: true,
          sessionVersion: 0,
        },
      });
      logger.info({ email }, "Created new SSO admin user");
    } else {
      user = await adminUserModel.update({
        where: { email },
        data: {
          role,
          active: true,
          updatedAt: new Date(),
        },
      });
      logger.info({ email }, "Updated existing SSO admin user");
    }

    const token = signAdminJwt({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion ?? 0,
    });

    return { token, email: user.email, role: user.role };
  }
}
