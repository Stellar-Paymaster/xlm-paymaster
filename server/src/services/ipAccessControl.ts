import * as net from "net";

export class IpAccessControlService {
  private allowedCidrs: string[];

  constructor(allowedCidrs: string[] = []) {
    this.allowedCidrs = allowedCidrs;
  }

  /**
   * Updates the allowed IP ranges dynamically if needed.
   */
  public setAllowedRanges(cidrs: string[]) {
    this.allowedCidrs = cidrs;
  }

  /**
   * Evaluates if a given IP is allowed by the configured CIDR lists.
   */
  public isIpAllowed(ip: string): boolean {
    // Fail-closed default posture: if no access list is defined, access is DENIED
    if (this.allowedCidrs.length === 0) {
      return false;
    }

    const normalizedIp = this.normalizeIp(ip);

    for (const cidr of this.allowedCidrs) {
      if (this.checkIpInCidr(normalizedIp, cidr)) {
        return true;
      }
    }
    return false;
  }

  private normalizeIp(ip: string): string {
    // Handle IPv4-mapped IPv6 addresses automatically (common behind load balancers/proxies)
    if (ip.startsWith("::ffff:")) {
      return ip.substring(7);
    }
    return ip;
  }

  private checkIpInCidr(ip: string, cidr: string): boolean {
    const [rangeIpRaw, prefixLenStr] = cidr.split("/");
    const rangeIp = this.normalizeIp(rangeIpRaw);
    
    const isIpv4 = net.isIPv4(ip) && net.isIPv4(rangeIp);
    const isIpv6 = net.isIPv6(ip) && net.isIPv6(rangeIp);

    if (!isIpv4 && !isIpv6) {
      return false;
    }

    if (isIpv4) {
      const prefixLen = prefixLenStr ? parseInt(prefixLenStr, 10) : 32;
      if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return false;
      return this.checkIpv4(ip, rangeIp, prefixLen);
    } else {
      const prefixLen = prefixLenStr ? parseInt(prefixLenStr, 10) : 128;
      if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 128) return false;
      return this.checkIpv6(ip, rangeIp, prefixLen);
    }
  }

  private checkIpv4(ip: string, rangeIp: string, prefixLen: number): boolean {
    const ipNum = this.ipv4ToNum(ip);
    const rangeNum = this.ipv4ToNum(rangeIp);
    
    if (prefixLen === 0) return true;
    
    const mask = (~0 << (32 - prefixLen)) >>> 0;
    return ((ipNum & mask) >>> 0) === ((rangeNum & mask) >>> 0);
  }

  private ipv4ToNum(ip: string): number {
    return ip.split(".").reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
  }

  private checkIpv6(ip: string, rangeIp: string, prefixLen: number): boolean {
    const ipBigInt = this.ipv6ToBigInt(ip);
    const rangeBigInt = this.ipv6ToBigInt(rangeIp);
    
    if (prefixLen === 0) return true;
    
    const mask = (1n << 128n) - (1n << BigInt(128 - prefixLen));
    return (ipBigInt & mask) === (rangeBigInt & mask);
  }

  private ipv6ToBigInt(ip: string): bigint {
    let expanded = ip;
    if (expanded.includes("::")) {
      const parts = expanded.split("::");
      const left = parts[0] ? parts[0].split(":").filter(Boolean) : [];
      const right = parts[1] ? parts[1].split(":").filter(Boolean) : [];
      const missing = 8 - (left.length + right.length);
      const middle = Array(missing).fill("0");
      expanded = [...left, ...middle, ...right].join(":");
    }
    
    const parts = expanded.split(":");
    let num = 0n;
    for (const part of parts) {
      num = (num << 16n) + BigInt(parseInt(part || "0", 16));
    }
    return num;
  }
}