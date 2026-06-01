import { Request, Response } from "express";
import { SamlSsoService } from "../services/samlSso";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "saml_sso_handler" });
const samlSsoService = new SamlSsoService();

export function samlLoginHandler(req: Request, res: Response) {
  try {
    const url = samlSsoService.getSamlRedirectUrl();
    res.redirect(url);
  } catch (error: any) {
    logger.error({ error: error.message }, "SAML SSO Login redirect failed");
    res.status(500).json({ error: "SAML configuration error" });
  }
}

export async function samlCallbackHandler(req: Request, res: Response) {
  try {
    const samlResponse = req.body.SAMLResponse;
    if (!samlResponse) {
      res.status(400).json({ error: "Missing SAMLResponse in body" });
      return;
    }

    const result = await samlSsoService.handleSamlResponse(samlResponse);

    const redirectBase = process.env.SAML_DASHBOARD_REDIRECT_URL || "http://localhost:3001/auth/callback";
    const redirectUrl = `${redirectBase}?token=${result.token}&email=${encodeURIComponent(result.email)}&role=${result.role}`;

    // Browser Post Callback
    if (req.accepts("html")) {
      res.send(`
        <html>
          <body>
            <script>
              try {
                localStorage.setItem("token", "${result.token}");
                localStorage.setItem("email", "${result.email}");
                localStorage.setItem("role", "${result.role}");
              } catch (e) {}
              window.location.href = "${redirectUrl}";
            </script>
          </body>
        </html>
      `);
      return;
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, "SAML SSO Callback handling failed");
    res.status(400).json({ error: `SSO authentication failed: ${error.message}` });
  }
}
