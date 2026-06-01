import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createGlobalErrorHandler } from "../middleware/errorHandler";

describe("Strict payload size limits integration", () => {
  it("allows requests under the 256KB limit to succeed", async () => {
    const app = express();
    app.use(express.json({ limit: "256kb" }));
    
    app.post("/test-endpoint", (req, res) => {
      res.status(200).json({ success: true, receivedBytes: JSON.stringify(req.body).length });
    });
    
    app.use(createGlobalErrorHandler());

    // Generate a payload that is well under 256KB (~10KB)
    const smallData = "A".repeat(10 * 1024);
    
    const response = await request(app)
      .post("/test-endpoint")
      .send({ data: smallData })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.receivedBytes).toBeGreaterThan(10 * 1024);
  });

  it("blocks requests over the 256KB limit and returns HTTP 413", async () => {
    const app = express();
    app.use(express.json({ limit: "256kb" }));
    
    app.post("/test-endpoint", (req, res) => {
      res.status(200).json({ success: true });
    });
    
    app.use(createGlobalErrorHandler());

    // Generate a payload that exceeds 256KB (~260KB)
    // 256KB = 262,144 bytes
    const largeData = "A".repeat(260 * 1024);
    
    const response = await request(app)
      .post("/test-endpoint")
      .send({ data: largeData })
      .expect(413);

    expect(response.body).toEqual({
      error: "Payload too large",
      code: "PAYLOAD_TOO_LARGE"
    });
  });
});
