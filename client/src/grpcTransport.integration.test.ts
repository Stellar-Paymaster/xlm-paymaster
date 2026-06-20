import assert from "node:assert/strict";
import http from "node:http";
import { test } from "vitest";
import {
  decodeFeeBumpRequest,
  decodeFeeBumpResponse,
  encodeFeeBumpResponse,
  encodeFeeBumpRequest,
  encodeGrpcWebFrame,
  encodeGrpcWebTrailers,
  performGrpcWebUnary,
  type GrpcFeeBumpRequest,
} from "./grpcTransport";

function createGrpcWebBody(response: object): Uint8Array {
  return new Uint8Array([
    ...encodeGrpcWebFrame(encodeFeeBumpResponse(response as any)),
    ...encodeGrpcWebTrailers({ "grpc-status": "0", "grpc-message": "OK" }),
  ]);
}

test("performGrpcWebUnary sends framed requests and parses framed responses", async () => {
  const server = http.createServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/paymaster.v1.FeeBumpService/RequestFeeBump");

    const requestChunks: Buffer[] = [];
    req.on("data", (chunk) => requestChunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const requestBytes = new Uint8Array(Buffer.concat(requestChunks));
      const requestFrame = requestBytes.slice(5);
      const request = decodeFeeBumpRequest(requestFrame) as GrpcFeeBumpRequest;

      assert.equal(request.xdr, "AAAAA");
      assert.equal(request.submit, true);
      res.statusCode = 200;
      res.setHeader("content-type", "application/grpc-web+proto");
      res.end(createGrpcWebBody({ xdr: "fee-bumped", status: "ready", hash: "hash-123" }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to start test server");
    }

    const result = await performGrpcWebUnary({
      baseUrl: `http://127.0.0.1:${address.port}`,
      serviceName: "paymaster.v1.FeeBumpService",
      methodName: "RequestFeeBump",
      timeoutMs: 2_000,
      request: { xdr: "AAAAA", submit: true },
      encodeRequest: (request) => encodeFeeBumpRequest(request),
      decodeResponse: (payload) => decodeFeeBumpResponse(payload),
    });

    assert.deepEqual(result, { xdr: "fee-bumped", status: "ready", hash: "hash-123" });
  } finally {
    server.close();
  }
});

test("performGrpcWebUnary surfaces grpc errors with mapped HTTP semantics", async () => {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/grpc-web+proto");
      res.end(
        new Uint8Array([
          ...encodeGrpcWebTrailers({ "grpc-status": "3", "grpc-message": "invalid xdr" }),
        ]),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to start test server");
    }

    await assert.rejects(
      performGrpcWebUnary({
        baseUrl: `http://127.0.0.1:${address.port}`,
        serviceName: "paymaster.v1.FeeBumpService",
        methodName: "RequestFeeBump",
        timeoutMs: 2_000,
        request: { xdr: "AAAAA", submit: false },
        encodeRequest: (request) => encodeFeeBumpRequest(request),
        decodeResponse: () => ({ xdr: "", status: "" }),
      }),
      (error: unknown) => {
        assert.equal((error as { name?: string }).name, "GrpcWebTransportError");
        assert.match((error as Error).message, /invalid xdr/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});
