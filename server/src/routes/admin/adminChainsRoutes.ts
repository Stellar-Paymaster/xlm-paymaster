import { Router } from "express";
import {
  createChainHandler,
  deleteChainHandler,
  listChainsHandler,
  updateChainHandler,
} from "../../handlers/adminChains";

export const adminChainsRouter = Router();

adminChainsRouter.get("/chains", listChainsHandler);
adminChainsRouter.post("/chains", createChainHandler);
adminChainsRouter.patch("/chains/:id", updateChainHandler);
adminChainsRouter.delete("/chains/:id", deleteChainHandler);
