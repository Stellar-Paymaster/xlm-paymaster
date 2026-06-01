import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGrpcWebPath,
  decodeFeeBumpBatchResponse,
  decodeFeeBumpBatchRequest,
  decodeFeeBumpRequest,
  decodeFeeBumpResponse,
  decodeGrpcWebFrames,
  encodeFeeBumpBatchRequest,
  encodeFeeBumpBatchResponse,
  encodeFeeBumpRequest,
  encodeFeeBumpResponse,
  encodeGrpcWebFrame,
  encodeGrpcWebTrailers,
  mapGrpcStatusToHttpStatus,
} from "./grpcTransport.ts";

test("grpc-web codecs round-trip fee-bump payloads", () => {
  const request = { xdr: "AAAAAA==", submit: true };
  assert.deepEqual(decodeFeeBumpRequest(encodeFeeBumpRequest(request)), request);

  const response = {
    xdr: "BBBBBB==",
    status: "ready",
    hash: "hash-123",
    fee_payer: "GABC",
    submitted_via: "grpc-web",
    submission_attempts: 2,
  };

  assert.deepEqual(decodeFeeBumpResponse(encodeFeeBumpResponse(response)), response);

  const batchRequest = { xdrs: [request.xdr, "CCCCCC=="], submit: false };
  assert.deepEqual(decodeFeeBumpBatchRequest(encodeFeeBumpBatchRequest(batchRequest)), batchRequest);

  assert.deepEqual(decodeFeeBumpBatchResponse(encodeFeeBumpBatchResponse({ responses: [response] })), {
    responses: [response],
  });
});

test("grpc-web frame decoding preserves data frames and trailers", () => {
  const messageFrame = encodeGrpcWebFrame(new Uint8Array([1, 2, 3]));
  const trailerFrame = encodeGrpcWebTrailers({ "grpc-status": "0", "grpc-message": "OK" });
  const decoded = decodeGrpcWebFrames(new Uint8Array([...messageFrame, ...trailerFrame]));

  assert.equal(decoded.dataFrames.length, 1);
  assert.deepEqual(Array.from(decoded.dataFrames[0] ?? []), [1, 2, 3]);
  assert.deepEqual(decoded.trailers, { "grpc-status": "0", "grpc-message": "OK" });
});

test("grpc status codes map to HTTP semantics", () => {
  assert.equal(mapGrpcStatusToHttpStatus(3), 400);
  assert.equal(mapGrpcStatusToHttpStatus(14), 503);
  assert.equal(mapGrpcStatusToHttpStatus(16), 401);
  assert.equal(mapGrpcStatusToHttpStatus(undefined), 502);
});

test("grpc-web paths trim excess slashes", () => {
  assert.equal(buildGrpcWebPath("/fluid.v1.FeeBumpService/", "/RequestFeeBump/"), "/fluid.v1.FeeBumpService/RequestFeeBump");
});
