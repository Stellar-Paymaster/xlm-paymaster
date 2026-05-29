import { describe, expect, it } from "vitest";
import {
  buildLocalSandboxCompose,
  getSandboxComposePath,
  getSandboxSpinUpCommand,
} from "./localSandboxCompose";

describe("localSandboxCompose", () => {
  it("builds compose with postgres, mock horizon, and fluid services", () => {
    const compose = buildLocalSandboxCompose();

    expect(compose).toContain("postgres:");
    expect(compose).toContain("mock-horizon:");
    expect(compose).toContain("fluid:");
    expect(compose).toContain("FLUID_HORIZON_URL: \"http://mock-horizon\"");
  });

  it("supports custom host ports", () => {
    const compose = buildLocalSandboxCompose({
      postgresPort: 6000,
      horizonPort: 6001,
      fluidPort: 6002,
    });

    expect(compose).toContain("\"6000:5432\"");
    expect(compose).toContain("\"6001:80\"");
    expect(compose).toContain("\"6002:8080\"");
  });

  it("exposes deterministic compose path and command", () => {
    expect(getSandboxComposePath()).toBe("src/sandbox/docker-compose.local.yml");
    expect(getSandboxSpinUpCommand()).toBe("docker compose -f src/sandbox/docker-compose.local.yml up -d --build");
  });
});
