import test from "node:test";
import assert from "node:assert/strict";
import { LocalizedFeeEstimator, estimateFeeByRegion } from "../LocalizedFeeEstimator.ts";

test("LocalizedFeeEstimator returns estimation for known region", () => {
  const estimator = new LocalizedFeeEstimator("BR");
  const result = estimator.estimate(100);
  
  assert.equal(result.currency, "XLM");
  assert.equal(result.estimatedFee, 140); // 100 * 1.4 (BR medium)
  assert.equal(result.multiplier, 1.4);
});

test("LocalizedFeeEstimator handles unknown region with fallback", () => {
  const estimator = new LocalizedFeeEstimator("XX");
  const result = estimator.estimate(100);
  
  // Uses global average multiplier
  assert.ok(result.multiplier);
  assert.equal(result.currency, "XLM");
});

test("LocalizedFeeEstimator handles zero fee", () => {
  const estimator = new LocalizedFeeEstimator("BR");
  const result = estimator.estimate(0);
  
  assert.equal(result.estimatedFee, 0);
  assert.equal(result.congestionLevel, "low");
});

test("LocalizedFeeEstimator handles negative fee", () => {
  const estimator = new LocalizedFeeEstimator("BR");
  const result = estimator.estimate(-100);
  
  assert.equal(result.estimatedFee, 0);
});

test("estimateFeeByRegion convenience function works", () => {
  const result = estimateFeeByRegion("EU", 100);
  assert.equal(result.estimatedFee, 110); // EU low = 1.1
});

test("LocalizedFeeEstimator uses correct congestion levels", () => {
  const brEstimator = new LocalizedFeeEstimator("BR");
  const brResult = brEstimator.estimate(100);
  assert.equal(brResult.congestionLevel, "medium"); // BR defaults to medium
  
  const apacEstimator = new LocalizedFeeEstimator("APAC");
  const apacResult = apacEstimator.estimate(100);
  assert.equal(apacResult.congestionLevel, "high"); // APAC defaults to high
  
  const usEstimator = new LocalizedFeeEstimator("US");
  const usResult = usEstimator.estimate(100);
  assert.equal(usResult.congestionLevel, "low"); // US defaults to low
});