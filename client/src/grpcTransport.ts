const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type GrpcTransportMode = "grpc-web";

export interface GrpcTransportMethodNames {
  requestFeeBump?: string;
  requestFeeBumpBatch?: string;
}

export interface GrpcTransportConfig {
  serviceName?: string;
  headers?: Record<string, string>;
  methodNames?: GrpcTransportMethodNames;
}

export interface GrpcWebUnaryOptions<TRequest, TResponse> {
  baseUrl: string;
  serviceName: string;
  methodName: string;
  request: TRequest;
  timeoutMs: number;
  headers?: Record<string, string>;
  encodeRequest: (request: TRequest) => Uint8Array;
  decodeResponse: (payload: Uint8Array) => TResponse;
}

export interface GrpcWebFrameDecodeResult {
  dataFrames: Uint8Array[];
  trailers: Record<string, string>;
}

export interface GrpcWebErrorOptions {
  kind: "network" | "server";
  httpStatus?: number;
  grpcStatus?: number;
  responseBody?: unknown;
  serverUrl?: string;
}

export class GrpcWebTransportError extends Error {
  readonly kind: "network" | "server";
  readonly httpStatus?: number;
  readonly grpcStatus?: number;
  readonly responseBody?: unknown;
  readonly serverUrl?: string;

  constructor(message: string, options: GrpcWebErrorOptions) {
    super(message);
    this.name = "GrpcWebTransportError";
    this.kind = options.kind;
    this.httpStatus = options.httpStatus;
    this.grpcStatus = options.grpcStatus;
    this.responseBody = options.responseBody;
    this.serverUrl = options.serverUrl;
    Object.setPrototypeOf(this, GrpcWebTransportError.prototype);
  }
}

export interface GrpcFeeBumpRequest {
  xdr: string;
  submit?: boolean;
}

export interface GrpcFeeBumpResponse {
  xdr: string;
  status: string;
  hash?: string;
  fee_payer?: string;
  submitted_via?: string;
  submission_attempts?: number;
}

export interface GrpcFeeBumpBatchRequest {
  xdrs: string[];
  submit?: boolean;
}

export interface GrpcFeeBumpBatchResponse {
  responses: GrpcFeeBumpResponse[];
}

export const DEFAULT_GRPC_SERVICE_NAME = "fluid.v1.FeeBumpService";
export const DEFAULT_GRPC_METHOD_NAMES: Required<GrpcTransportMethodNames> = {
  requestFeeBump: "RequestFeeBump",
  requestFeeBumpBatch: "RequestFeeBumpBatch",
};

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function buildGrpcWebPath(serviceName: string, methodName: string): string {
  const normalizedService = serviceName.trim().replace(/^\/+|\/+$/g, "");
  const normalizedMethod = methodName.trim().replace(/^\/+|\/+$/g, "");

  if (!normalizedService) {
    throw new GrpcWebTransportError("A gRPC service name is required", {
      kind: "server",
      httpStatus: 400,
    });
  }

  if (!normalizedMethod) {
    throw new GrpcWebTransportError("A gRPC method name is required", {
      kind: "server",
      httpStatus: 400,
    });
  }

  return `/${normalizedService}/${normalizedMethod}`;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function encodeVarint(value: number): Uint8Array {
  let current = value >>> 0;
  const bytes: number[] = [];

  while (current >= 0x80) {
    bytes.push((current & 0x7f) | 0x80);
    current >>>= 7;
  }

  bytes.push(current);
  return new Uint8Array(bytes);
}

function readVarint(bytes: Uint8Array, startOffset: number): { value: number; nextOffset: number } {
  let offset = startOffset;
  let value = 0;
  let shift = 0;

  while (offset < bytes.length) {
    const byte = bytes[offset];
    offset += 1;
    value |= (byte & 0x7f) << shift;

    if ((byte & 0x80) === 0) {
      return { value: value >>> 0, nextOffset: offset };
    }

    shift += 7;

    if (shift > 35) {
      throw new GrpcWebTransportError("Malformed protobuf varint", {
        kind: "server",
        httpStatus: 502,
      });
    }
  }

  throw new GrpcWebTransportError("Unexpected end of protobuf varint", {
    kind: "server",
    httpStatus: 502,
  });
}

function encodeFieldKey(fieldNumber: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeStringField(fieldNumber: number, value: string): Uint8Array {
  const encodedValue = textEncoder.encode(value);
  return concatBytes([
    encodeFieldKey(fieldNumber, 2),
    encodeVarint(encodedValue.length),
    encodedValue,
  ]);
}

function encodeBoolField(fieldNumber: number, value: boolean): Uint8Array {
  return concatBytes([
    encodeFieldKey(fieldNumber, 0),
    encodeVarint(value ? 1 : 0),
  ]);
}

function encodeUInt32Field(fieldNumber: number, value: number): Uint8Array {
  return concatBytes([
    encodeFieldKey(fieldNumber, 0),
    encodeVarint(value >>> 0),
  ]);
}

function encodeEmbeddedMessage(fieldNumber: number, value: Uint8Array): Uint8Array {
  return concatBytes([
    encodeFieldKey(fieldNumber, 2),
    encodeVarint(value.length),
    value,
  ]);
}

function readLengthDelimitedField(bytes: Uint8Array, startOffset: number): { value: Uint8Array; nextOffset: number } {
  const { value: length, nextOffset } = readVarint(bytes, startOffset);
  const endOffset = nextOffset + length;

  if (endOffset > bytes.length) {
    throw new GrpcWebTransportError("Malformed length-delimited protobuf field", {
      kind: "server",
      httpStatus: 502,
    });
  }

  return {
    value: bytes.slice(nextOffset, endOffset),
    nextOffset: endOffset,
  };
}

function skipField(bytes: Uint8Array, startOffset: number, wireType: number): number {
  switch (wireType) {
    case 0: {
      return readVarint(bytes, startOffset).nextOffset;
    }
    case 1:
      return startOffset + 8;
    case 2:
      return readLengthDelimitedField(bytes, startOffset).nextOffset;
    case 5:
      return startOffset + 4;
    default:
      throw new GrpcWebTransportError(`Unsupported protobuf wire type: ${wireType}`, {
        kind: "server",
        httpStatus: 502,
      });
  }
}

function readFieldKey(bytes: Uint8Array, startOffset: number): { fieldNumber: number; wireType: number; nextOffset: number } {
  const { value, nextOffset } = readVarint(bytes, startOffset);
  return {
    fieldNumber: value >>> 3,
    wireType: value & 0x07,
    nextOffset,
  };
}

function parseGrpcWebTrailers(payload: Uint8Array): Record<string, string> {
  const rawText = textDecoder.decode(payload).trim();
  const headers: Record<string, string> = {};

  for (const line of rawText.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = trimmedLine.slice(0, separatorIndex).trim().toLowerCase();
    const value = trimmedLine.slice(separatorIndex + 1).trim();
    headers[name] = value;
  }

  return headers;
}

export function encodeGrpcWebFrame(payload: Uint8Array, isTrailer = false): Uint8Array {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = isTrailer ? 0x80 : 0x00;
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(1, payload.length, false);
  frame.set(payload, 5);
  return frame;
}

export function encodeGrpcWebTrailers(trailers: Record<string, string>): Uint8Array {
  const lines = Object.entries(trailers)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\r\n");

  return encodeGrpcWebFrame(textEncoder.encode(`${lines}\r\n`), true);
}

export function decodeGrpcWebFrames(body: Uint8Array): GrpcWebFrameDecodeResult {
  const dataFrames: Uint8Array[] = [];
  const trailers: Record<string, string> = {};
  let offset = 0;

  while (offset < body.length) {
    if (offset + 5 > body.length) {
      throw new GrpcWebTransportError("Malformed gRPC-web frame header", {
        kind: "server",
        httpStatus: 502,
      });
    }

    const flags = body[offset];
    const frameLength = new DataView(body.buffer, body.byteOffset + offset, 5).getUint32(1, false);
    offset += 5;

    if (offset + frameLength > body.length) {
      throw new GrpcWebTransportError("Malformed gRPC-web frame payload", {
        kind: "server",
        httpStatus: 502,
      });
    }

    const payload = body.slice(offset, offset + frameLength);
    offset += frameLength;

    if ((flags & 0x80) !== 0) {
      Object.assign(trailers, parseGrpcWebTrailers(payload));
    } else {
      dataFrames.push(payload);
    }
  }

  return { dataFrames, trailers };
}

export function encodeFeeBumpRequest(request: GrpcFeeBumpRequest): Uint8Array {
  const parts = [encodeStringField(1, request.xdr)];

  if (typeof request.submit === "boolean") {
    parts.push(encodeBoolField(2, request.submit));
  }

  return concatBytes(parts);
}

export function decodeFeeBumpRequest(payload: Uint8Array): GrpcFeeBumpRequest {
  const request: GrpcFeeBumpRequest = { xdr: "" };
  let offset = 0;

  while (offset < payload.length) {
    const { fieldNumber, wireType, nextOffset } = readFieldKey(payload, offset);
    offset = nextOffset;

    switch (fieldNumber) {
      case 1: {
        if (wireType !== 2) {
          throw new GrpcWebTransportError("Unexpected wire type for FeeBumpRequest.xdr", {
            kind: "server",
            httpStatus: 502,
          });
        }

        const field = readLengthDelimitedField(payload, offset);
        request.xdr = textDecoder.decode(field.value);
        offset = field.nextOffset;
        break;
      }
      case 2: {
        if (wireType !== 0) {
          throw new GrpcWebTransportError("Unexpected wire type for FeeBumpRequest.submit", {
            kind: "server",
            httpStatus: 502,
          });
        }

        const field = readVarint(payload, offset);
        request.submit = field.value !== 0;
        offset = field.nextOffset;
        break;
      }
      default:
        offset = skipField(payload, offset, wireType);
        break;
    }
  }

  return request;
}

export function encodeFeeBumpBatchRequest(request: GrpcFeeBumpBatchRequest): Uint8Array {
  const parts: Uint8Array[] = [];

  for (const xdr of request.xdrs) {
    parts.push(encodeStringField(1, xdr));
  }

  if (typeof request.submit === "boolean") {
    parts.push(encodeBoolField(2, request.submit));
  }

  return concatBytes(parts);
}

export function decodeFeeBumpBatchRequest(payload: Uint8Array): GrpcFeeBumpBatchRequest {
  const request: GrpcFeeBumpBatchRequest = { xdrs: [] };
  let offset = 0;

  while (offset < payload.length) {
    const { fieldNumber, wireType, nextOffset } = readFieldKey(payload, offset);
    offset = nextOffset;

    switch (fieldNumber) {
      case 1: {
        if (wireType !== 2) {
          throw new GrpcWebTransportError("Unexpected wire type for FeeBumpBatchRequest.xdrs", {
            kind: "server",
            httpStatus: 502,
          });
        }

        const field = readLengthDelimitedField(payload, offset);
        request.xdrs.push(textDecoder.decode(field.value));
        offset = field.nextOffset;
        break;
      }
      case 2: {
        if (wireType !== 0) {
          throw new GrpcWebTransportError("Unexpected wire type for FeeBumpBatchRequest.submit", {
            kind: "server",
            httpStatus: 502,
          });
        }

        const field = readVarint(payload, offset);
        request.submit = field.value !== 0;
        offset = field.nextOffset;
        break;
      }
      default:
        offset = skipField(payload, offset, wireType);
        break;
    }
  }

  return request;
}

export function decodeFeeBumpResponse(payload: Uint8Array): GrpcFeeBumpResponse {
  const response: GrpcFeeBumpResponse = { xdr: "", status: "" };
  let offset = 0;

  while (offset < payload.length) {
    const { fieldNumber, wireType, nextOffset } = readFieldKey(payload, offset);
    offset = nextOffset;

    switch (fieldNumber) {
      case 1: {
        if (wireType !== 2) {
          throw new GrpcWebTransportError("Unexpected wire type for FeeBumpResponse.xdr", {
            kind: "server",
            httpStatus: 502,
          });
        }

        const field = readLengthDelimitedField(payload, offset);
        response.xdr = textDecoder.decode(field.value);
        offset = field.nextOffset;
        break;
      }
      case 2: {
        if (wireType !== 2) {
          throw new GrpcWebTransportError("Unexpected wire type for FeeBumpResponse.status", {
            kind: "server",
            httpStatus: 502,
          });
        }

        const field = readLengthDelimitedField(payload, offset);
        response.status = textDecoder.decode(field.value);
        offset = field.nextOffset;
        break;
      }
      case 3: {
        if (wireType !== 2) {
          throw new GrpcWebTransportError("Unexpected wire type for FeeBumpResponse.hash", {
            kind: "server",
            httpStatus: 502,
          });
        }

        const field = readLengthDelimitedField(payload, offset);
        response.hash = textDecoder.decode(field.value);
        offset = field.nextOffset;
        break;
      }
      case 4: {
        if (wireType !== 2) {
          throw new GrpcWebTransportError("Unexpected wire type for FeeBumpResponse.fee_payer", {
            kind: "server",
            httpStatus: 502,
          });
        }

        const field = readLengthDelimitedField(payload, offset);
        response.fee_payer = textDecoder.decode(field.value);
        offset = field.nextOffset;
        break;
      }
      case 5: {
        if (wireType !== 2) {
          throw new GrpcWebTransportError("Unexpected wire type for FeeBumpResponse.submitted_via", {
            kind: "server",
            httpStatus: 502,
          });
        }

        const field = readLengthDelimitedField(payload, offset);
        response.submitted_via = textDecoder.decode(field.value);
        offset = field.nextOffset;
        break;
      }
      case 6: {
        if (wireType !== 0) {
          throw new GrpcWebTransportError("Unexpected wire type for FeeBumpResponse.submission_attempts", {
            kind: "server",
            httpStatus: 502,
          });
        }

        const field = readVarint(payload, offset);
        response.submission_attempts = field.value;
        offset = field.nextOffset;
        break;
      }
      default:
        offset = skipField(payload, offset, wireType);
        break;
    }
  }

  return response;
}

export function encodeFeeBumpResponse(response: GrpcFeeBumpResponse): Uint8Array {
  const parts = [
    encodeStringField(1, response.xdr),
    encodeStringField(2, response.status),
  ];

  if (response.hash) {
    parts.push(encodeStringField(3, response.hash));
  }

  if (response.fee_payer) {
    parts.push(encodeStringField(4, response.fee_payer));
  }

  if (response.submitted_via) {
    parts.push(encodeStringField(5, response.submitted_via));
  }

  if (typeof response.submission_attempts === "number") {
    parts.push(encodeUInt32Field(6, response.submission_attempts));
  }

  return concatBytes(parts);
}

export function decodeFeeBumpBatchResponse(payload: Uint8Array): GrpcFeeBumpBatchResponse {
  const response: GrpcFeeBumpBatchResponse = { responses: [] };
  let offset = 0;

  while (offset < payload.length) {
    const { fieldNumber, wireType, nextOffset } = readFieldKey(payload, offset);
    offset = nextOffset;

    if (fieldNumber === 1) {
      if (wireType !== 2) {
        throw new GrpcWebTransportError("Unexpected wire type for FeeBumpBatchResponse.responses", {
          kind: "server",
          httpStatus: 502,
        });
      }

      const field = readLengthDelimitedField(payload, offset);
      response.responses.push(decodeFeeBumpResponse(field.value));
      offset = field.nextOffset;
      continue;
    }

    offset = skipField(payload, offset, wireType);
  }

  return response;
}

export function encodeFeeBumpBatchResponse(response: GrpcFeeBumpBatchResponse): Uint8Array {
  const parts: Uint8Array[] = [];

  for (const item of response.responses) {
    parts.push(encodeEmbeddedMessage(1, encodeFeeBumpResponse(item)));
  }

  return concatBytes(parts);
}

export function mapGrpcStatusToHttpStatus(grpcStatus?: number): number {
  switch (grpcStatus) {
    case 3:
      return 400;
    case 4:
      return 504;
    case 5:
      return 404;
    case 6:
      return 409;
    case 7:
      return 403;
    case 8:
      return 429;
    case 9:
    case 10:
      return 409;
    case 11:
      return 400;
    case 12:
      return 501;
    case 13:
      return 500;
    case 14:
      return 503;
    case 15:
      return 500;
    case 16:
      return 401;
    default:
      return 502;
  }
}

function formatGrpcTimeout(timeoutMs: number): string {
  return `${Math.max(1, Math.ceil(timeoutMs))}m`;
}

export async function performGrpcWebUnary<TRequest, TResponse>(
  options: GrpcWebUnaryOptions<TRequest, TResponse>,
): Promise<TResponse> {
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${normalizeBaseUrl(options.baseUrl)}${buildGrpcWebPath(options.serviceName, options.methodName)}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/grpc-web+proto",
        "content-type": "application/grpc-web+proto",
        "grpc-timeout": formatGrpcTimeout(timeoutMs),
        "x-grpc-web": "1",
        ...options.headers,
      },
      body: encodeGrpcWebFrame(options.encodeRequest(options.request)) as any,
      signal: controller.signal,
    });

    const responseBytes = new Uint8Array(await response.arrayBuffer());
    const decodedFrames = decodeGrpcWebFrames(responseBytes);
    const grpcStatusRaw = decodedFrames.trailers["grpc-status"];

    if (grpcStatusRaw !== undefined) {
      const grpcStatus = Number.parseInt(grpcStatusRaw, 10);
      if (Number.isNaN(grpcStatus)) {
        throw new GrpcWebTransportError("Invalid grpc-status trailer", {
          kind: "server",
          httpStatus: 502,
          responseBody: decodedFrames.trailers,
          serverUrl: options.baseUrl,
        });
      }

      if (grpcStatus !== 0) {
        throw new GrpcWebTransportError(
          `gRPC request failed with status ${grpcStatus}${decodedFrames.trailers["grpc-message"] ? `: ${decodedFrames.trailers["grpc-message"]}` : ""}`,
          {
            kind: "server",
            httpStatus: mapGrpcStatusToHttpStatus(grpcStatus),
            grpcStatus,
            responseBody: decodedFrames.trailers,
            serverUrl: options.baseUrl,
          },
        );
      }
    } else if (!response.ok) {
      const responseText = responseBytes.length > 0 ? textDecoder.decode(responseBytes) : response.statusText;
      throw new GrpcWebTransportError(
        `gRPC transport returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
        {
          kind: "server",
          httpStatus: response.status,
          responseBody: responseText,
          serverUrl: options.baseUrl,
        },
      );
    }

    if (decodedFrames.dataFrames.length === 0) {
      throw new GrpcWebTransportError("gRPC response did not include a data frame", {
        kind: "server",
        httpStatus: 502,
        responseBody: decodedFrames.trailers,
        serverUrl: options.baseUrl,
      });
    }

    return options.decodeResponse(decodedFrames.dataFrames[0]);
  } catch (error) {
    if (error instanceof GrpcWebTransportError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new GrpcWebTransportError(`gRPC transport request failed: ${message}`, {
      kind: "network",
      serverUrl: options.baseUrl,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
