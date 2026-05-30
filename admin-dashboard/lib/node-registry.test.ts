import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub server-only so the import resolves in JSDOM test environment
vi.mock("server-only", () => ({}));

// Re-import fresh module state for each test by resetting the module cache
// (vitest isolates modules per file by default).

let validateNodeInput: typeof import("./node-registry").validateNodeInput;
let registerNode: typeof import("./node-registry").registerNode;
let listNodes: typeof import("./node-registry").listNodes;
let getNode: typeof import("./node-registry").getNode;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("./node-registry");
  validateNodeInput = mod.validateNodeInput;
  registerNode = mod.registerNode;
  listNodes = mod.listNodes;
  getNode = mod.getNode;
});

const validInput = {
  operatorName: "Acme Node",
  apiEndpoint: "https://node.acme.example.com",
  location: { city: "London", country: "GB", lat: 51.5074, lng: -0.1278 },
  supportedChains: ["stellar"],
};

describe("validateNodeInput", () => {
  it("accepts a valid registration payload", () => {
    const result = validateNodeInput(validInput);
    expect(result.operatorName).toBe("Acme Node");
    expect(result.apiEndpoint).toBe("https://node.acme.example.com");
    expect(result.location.lat).toBe(51.5074);
    expect(result.supportedChains).toEqual(["stellar"]);
  });

  it("throws when operatorName is missing", () => {
    expect(() =>
      validateNodeInput({ ...validInput, operatorName: "" }),
    ).toThrow("operatorName is required");
  });

  it("throws when apiEndpoint is not a valid URL", () => {
    expect(() =>
      validateNodeInput({ ...validInput, apiEndpoint: "not-a-url" }),
    ).toThrow("valid URL");
  });

  it("throws when latitude is out of range", () => {
    const bad = { ...validInput, location: { ...validInput.location, lat: 999 } };
    expect(() => validateNodeInput(bad)).toThrow("lat must be a number between -90 and 90");
  });

  it("throws when longitude is out of range", () => {
    const bad = { ...validInput, location: { ...validInput.location, lng: -200 } };
    expect(() => validateNodeInput(bad)).toThrow("lng must be a number between -180 and 180");
  });

  it("throws when supportedChains is empty", () => {
    expect(() =>
      validateNodeInput({ ...validInput, supportedChains: [] }),
    ).toThrow("non-empty array");
  });

  it("throws when location is missing", () => {
    const { location: _, ...noLoc } = validInput;
    expect(() => validateNodeInput(noLoc)).toThrow("location object is required");
  });

  it("strips trailing slash from apiEndpoint", () => {
    const result = validateNodeInput({
      ...validInput,
      apiEndpoint: "https://node.acme.example.com/",
    });
    expect(result.apiEndpoint).toBe("https://node.acme.example.com");
  });
});

describe("registerNode / listNodes / getNode", () => {
  it("registers a node and lists it", () => {
    const input = validateNodeInput(validInput);
    const node = registerNode(input);

    expect(node.id).toBeDefined();
    expect(node.operatorName).toBe("Acme Node");
    expect(node.online).toBe(false);
    expect(node.latencyMs).toBeNull();
    expect(node.uptimePercent).toBeNull();

    const all = listNodes();
    expect(all.some((n) => n.id === node.id)).toBe(true);
  });

  it("retrieves a node by id", () => {
    const node = registerNode(validateNodeInput(validInput));
    const found = getNode(node.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(node.id);
  });

  it("returns undefined for unknown id", () => {
    expect(getNode("nonexistent")).toBeUndefined();
  });

  it("rejects duplicate endpoints", () => {
    registerNode(validateNodeInput(validInput));
    expect(() => registerNode(validateNodeInput(validInput))).toThrow("already registered");
  });

  it("lists multiple nodes sorted newest-first", () => {
    const a = registerNode(validateNodeInput(validInput));
    const b = registerNode(
      validateNodeInput({ ...validInput, apiEndpoint: "https://node2.example.com" }),
    );
    const all = listNodes();
    const ids = all.map((n) => n.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });
});
