import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryProfiler } from "./memoryProfiler";
import fs from "fs";
import path from "path";
import v8 from "v8";

vi.mock("fs");
vi.mock("v8");

describe("MemoryProfiler", () => {
  const mockOptions = {
    enabled: true,
    logIntervalMs: 100,
    heapSnapshotIntervalMs: 500,
    snapshotPath: "/tmp/snapshots",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should initialize correctly when enabled", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    
    const profiler = new MemoryProfiler(mockOptions);
    
    expect(fs.mkdirSync).toHaveBeenCalledWith(mockOptions.snapshotPath, { recursive: true });
    expect(profiler).toBeDefined();
  });

  it("should not create directory when disabled", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    
    const profiler = new MemoryProfiler({ ...mockOptions, enabled: false });
    
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(profiler).toBeDefined();
  });

  it("should start and stop intervals correctly", () => {
    const profiler = new MemoryProfiler(mockOptions);
    
    profiler.start();
    expect(vi.getTimerCount()).toBe(1);
    
    profiler.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("should return memory stats", () => {
    const profiler = new MemoryProfiler(mockOptions);
    
    const stats = profiler.getMemoryStats();
    expect(stats).toHaveProperty("rss");
    expect(stats).toHaveProperty("heapTotal");
    expect(stats).toHaveProperty("heapUsed");
    expect(stats).toHaveProperty("external");
    expect(stats).toHaveProperty("arrayBuffers");
  });

  it("should take heap snapshot if interval passed", () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    
    const profiler = new MemoryProfiler(mockOptions);
    profiler.start();
    
    // Advance time to pass heap snapshot interval
    vi.advanceTimersByTime(600);
    
    expect(v8.writeHeapSnapshot).toHaveBeenCalled();
  });

  it("should cleanup old snapshots", () => {
    const mockFiles = [
      "snap1.heapsnapshot", "snap2.heapsnapshot", "snap3.heapsnapshot", 
      "snap4.heapsnapshot", "snap5.heapsnapshot", "snap6.heapsnapshot"
    ];
    
    vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockImplementation((filePath: fs.PathLike) => {
      // Return older mtime for snap6.heapsnapshot
      const time = filePath.toString().includes("snap6") ? 1000 : 2000;
      return { mtime: { getTime: () => time } } as any;
    });

    const profiler = new MemoryProfiler(mockOptions);
    profiler.takeHeapSnapshot();
    
    // It should have deleted snap6 because it's the oldest and length > 5
    expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(mockOptions.snapshotPath, "snap6.heapsnapshot"));
  });
});
