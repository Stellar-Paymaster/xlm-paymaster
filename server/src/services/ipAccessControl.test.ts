import { describe, it, expect } from "vitest";
import { IpAccessControlService } from "./ipAccessControl";

describe("IpAccessControlService", () => {
  it("should deny access by default if no ranges are configured", () => {
    const service = new IpAccessControlService();
    expect(service.isIpAllowed("192.168.1.1")).toBe(false);
  });

  it("should allow exactly matching IPv4 addresses", () => {
    const service = new IpAccessControlService(["192.168.1.100"]);
    expect(service.isIpAllowed("192.168.1.100")).toBe(true);
    expect(service.isIpAllowed("192.168.1.101")).toBe(false);
  });

  it("should allow IPv4 addresses within a /24 CIDR block", () => {
    const service = new IpAccessControlService(["10.0.0.0/24"]);
    expect(service.isIpAllowed("10.0.0.50")).toBe(true);
    expect(service.isIpAllowed("10.0.0.255")).toBe(true);
    expect(service.isIpAllowed("10.0.1.1")).toBe(false);
  });

  it("should allow IPv4 addresses within a /8 CIDR block", () => {
    const service = new IpAccessControlService(["10.0.0.0/8"]);
    expect(service.isIpAllowed("10.255.255.255")).toBe(true);
    expect(service.isIpAllowed("11.0.0.0")).toBe(false);
  });

  it("should support multiple CIDR blocks", () => {
    const service = new IpAccessControlService(["192.168.1.0/24", "10.0.0.0/8"]);
    expect(service.isIpAllowed("192.168.1.15")).toBe(true);
    expect(service.isIpAllowed("10.5.5.5")).toBe(true);
    expect(service.isIpAllowed("172.16.0.1")).toBe(false);
  });

  it("should handle IPv4-mapped IPv6 addresses", () => {
    const service = new IpAccessControlService(["192.168.1.0/24"]);
    expect(service.isIpAllowed("::ffff:192.168.1.50")).toBe(true);
    expect(service.isIpAllowed("::ffff:10.0.0.1")).toBe(false);
  });

  it("should allow IPv6 addresses within a /64 CIDR block", () => {
    const service = new IpAccessControlService(["2001:db8:abcd:0012::/64"]);
    expect(service.isIpAllowed("2001:db8:abcd:0012::1")).toBe(true);
    expect(service.isIpAllowed("2001:db8:abcd:0012:ffff:ffff:ffff:ffff")).toBe(true);
    expect(service.isIpAllowed("2001:db8:abcd:0013::1")).toBe(false);
  });

  it("should reject invalid CIDR formats or IPs", () => {
    const service = new IpAccessControlService(["invalid-ip", "10.0.0.0/invalid"]);
    expect(service.isIpAllowed("10.0.0.1")).toBe(false);
    expect(service.isIpAllowed("invalid")).toBe(false);
  });
});