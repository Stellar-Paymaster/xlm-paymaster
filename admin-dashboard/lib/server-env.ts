/** Server-side environment helpers — only import from Server Components or API routes */
export const paymasterServerUrl =
  process.env.PAYMASTER_SERVER_URL?.trim() ?? "http://localhost:3000";

export const paymasterAdminToken = process.env.PAYMASTER_ADMIN_TOKEN?.trim() ?? "";
