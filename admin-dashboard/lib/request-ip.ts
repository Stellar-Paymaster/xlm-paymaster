type RequestLike = {
  headers?: Headers;
  ip?: string | null;
};

function firstHeaderValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const [first] = value.split(",");
  const trimmed = first?.trim();
  return trimmed ? trimmed : null;
}

export function getRequestIp(request?: RequestLike | null): string | null {
  if (!request) {
    return null;
  }

  const headers = request.headers;
  const forwardedFor = firstHeaderValue(headers?.get("x-forwarded-for"));
  if (forwardedFor) {
    return forwardedFor;
  }

  const realIp = firstHeaderValue(headers?.get("x-real-ip"));
  if (realIp) {
    return realIp;
  }

  const connectingIp = firstHeaderValue(headers?.get("cf-connecting-ip"));
  if (connectingIp) {
    return connectingIp;
  }

  const directIp = request.ip?.trim();
  return directIp ? directIp : null;
}
