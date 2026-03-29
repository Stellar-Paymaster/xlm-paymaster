import { Request, Response } from "express";
import prisma from "../utils/db";

export async function updateConfigsHandler(req: Request, res: Response) {
    const settings = req.body;

    try {
        // We use Promise.all to run all updates at once
        const updates = Object.entries(settings).map(([key, value]) =>
            (prisma as any).server_configs.upsert({
                where: { config_key: key },
                update: { config_value: value },
                create: { config_key: key, config_value: value },
            })
        );

        await Promise.all(updates);
        
        res.json({ success: true, message: "Configurations updated successfully" });
    } catch (error) {
        console.error("Config update error:", error);
        res.status(500).json({ error: "Failed to update configurations" });
    }
}