import express from "express";
import request from "supertest";
import { getIp, getResource, soc2RequestLogger } from "./soc2Logger";

test("getIp picks x-forwarded-for first, then req.ip", () => {
  const req = {
    headers: { "x-forwarded-for": "10.0.0.1, proxy" },
    ip: "127.0.0.1",
    socket: { remoteAddress: "192.0.2.1" },
  } as any;

  expect(getIp(req)).toBe("10.0.0.1");
});

test("getResource returns method + URL", () => {
  const req = { method: "POST", originalUrl: "/fee-bump", url: "/fee-bump" } as any;
  expect(getResource(req)).toBe("POST /fee-bump");
});

test("soc2RequestLogger attaches req.logger and logs lifecycle", async () => {
  const app = express();
  app.use(express.json());
  app.use(soc2RequestLogger);

  app.get("/test", (req, res) => {
    expect(req.logger).toBeTruthy();
    req.logger.info("hit_test_endpoint");
    res.status(200).send({ ok: true });
  });

  await request(app)
    .get("/test")
    .set("x-admin-user", "admin@example.com")
    .expect(200);
});