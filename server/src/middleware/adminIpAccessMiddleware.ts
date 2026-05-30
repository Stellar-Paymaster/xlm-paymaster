import { Request, Response, NextFunction } from "express";
import { IpAccessControlService } from "../services/ipAccessControl";

export const createAdminIpAccessMiddleware = (accessControlService: IpAccessControlService) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Relying on Express 'trust proxy' being configured properly for accurate client IP passing
    const clientIp = req.ip || (req.socket && req.socket.remoteAddress) || "";

    if (!accessControlService.isIpAllowed(clientIp)) {
      res.status(403).json({
        error: "Forbidden",
        message: "Your IP address is not permitted to access this resource."
      });
      return;
    }

    // Pass control downstream
    next();
  };
};