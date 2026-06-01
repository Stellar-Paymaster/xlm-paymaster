# API Chaos Monkey

## Overview
API Chaos Monkey randomly drops connections in staging environments to verify system resilience and ensure our applications can recover gracefully from sudden faults.

## Configuration
It exposes a middleware that can be attached to specific endpoints. The `dropProbability` controls how often requests are artificially failed (returning 503). Ensure `enabled` is `false` in production environments!

## Resilience Benefits
- Validates that the frontend retry logic behaves as expected.
- Helps identify single points of failure in complex workflows.
