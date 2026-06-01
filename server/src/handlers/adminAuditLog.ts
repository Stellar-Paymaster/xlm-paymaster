import { Request, Response } from "express";
import { requireAdminToken } from "../utils/adminAuth";
import { exportAuditLogCsv } from "../services/auditLogger";

export async function exportAuditLogHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!requireAdminToken(req, res)) {
    return;
  }

  try {
    const csv = await exportAuditLogCsv();
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=fluid_audit_log.csv",
    );
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: "Failed to export audit log" });
  }
}
