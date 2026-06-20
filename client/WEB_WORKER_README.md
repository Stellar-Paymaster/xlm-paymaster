# XLM Paymaster Client - Web Worker Integration

This document describes the Web Worker integration for the XLM Paymaster Client, which enables off-thread cryptographic operations to maintain UI responsiveness during heavy signing operations.

## Overview

The Web Worker integration moves CPU-intensive cryptographic operations (signing, XDR creation) from the main thread to a dedicated worker thread, ensuring the UI remains smooth at 60fps even during heavy transaction processing.

## Architecture

```
Main Thread                    Web Worker Thread
-----------                    ---------------
PaymasterClient                   signingWorker.ts
    |                               |
    |--- Message passing --->       |
    |                               |--- WASM Module
    |                               |   (Rust cryptographic operations)
    |                               |
    |<--- Results ------------------|
```

## Features

- **Optional Web Worker Usage**: Can be enabled/disabled via configuration
- **Automatic Fallback**: Falls back to main thread if worker fails
- **Message Passing**: Clean async communication between threads
- **WASM Integration**: Rust WASM module for cryptographic operations
- **Performance Monitoring**: Built-in performance testing and metrics
- **Error Handling**: Comprehensive error handling with graceful degradation

## Usage

### Basic Usage with Web Worker

```typescript
import { PaymasterClient } from 'paymaster-client';
import StellarSdk from '@stellar/stellar-sdk';

const client = new PaymasterClient({
  serverUrl: 'https://your-paymaster-server.com',
  networkPassphrase: StellarSdk.Networks.PUBLIC,
  horizonUrl: 'https://horizon.stellar.org',
  useWorker: true // Enable Web Worker
});

// Sign transactions off the main thread
const result = await client.buildAndRequestFeeBump(transaction, keypair);
```

### Fallback Behavior

If the Web Worker fails to initialize or encounters an error, the client automatically falls back to main thread signing:

```typescript
// Worker failure is handled automatically
const client = new PaymasterClient({
  serverUrl: 'https://your-paymaster-server.com',
  networkPassphrase: StellarSdk.Networks.PUBLIC,
  useWorker: true // Will fallback to false if worker fails
});
```

### Performance Testing

```typescript
import { PerformanceTest } from 'paymaster-client/performance/test';

const test = new PerformanceTest(true); // true = use worker
const metrics = await test.runPerformanceTest(100); // 100 transactions

console.log('Frame drops:', metrics.frameDrops);
console.log('Average frame time:', metrics.averageFrameTime);
console.log('Signing time:', metrics.signingTime);
```

## Configuration Options

### PaymasterClientConfig

```typescript
interface PaymasterClientConfig {
  serverUrl: string;
  networkPassphrase: string;
  horizonUrl?: string;
  useWorker?: boolean; // Enable/disable Web Worker (default: false)
}
```

## Performance Benefits

### With Web Worker
- **UI Responsiveness**: Maintains 60fps during heavy operations
- **Main Thread**: Remains idle for user interactions
- **Frame Drops**: Minimal (0-5 for 100 transactions)
- **User Experience**: Smooth, no blocking

### Without Web Worker
- **UI Responsiveness**: Drops to 10-30fps during signing
- **Main Thread**: Blocked by cryptographic operations
- **Frame Drops**: Significant (20-50 for 100 transactions)
- **User Experience**: Janky, unresponsive

## Browser Compatibility

- **Chrome**: Full support
- **Firefox**: Full support
- **Safari**: Full support
- **Edge**: Full support
- **Node.js**: Fallback to main thread (no worker support)

## Development

### Building the Project

```bash
# Build main client
npm run build

# Build worker separately (if needed)
npm run build:worker

# Start demo server
npm run demo

# Run performance test
npm run test:performance
```

### Project Structure

```
client/src/
├── index.ts                 # Main PaymasterClient class
├── workers/
│   └── signingWorker.ts    # Web Worker implementation
├── wasm/
│   └── signing_wasm.ts      # WASM module interface
├── performance/
│   └── test.ts             # Performance testing utilities
└── demo.html               # Interactive demo
```

## Performance Profiling

### Chrome DevTools Setup

1. Open Chrome DevTools (F12)
2. Go to **Performance** tab
3. Click **Record** (Ctrl+E)
4. Run a performance test
5. Stop recording
6. Analyze the results

### Expected Results

**With Web Worker:**
- Main thread: Mostly idle (green/grey)
- Worker thread: Shows cryptographic activity
- FPS: Consistent 55-60fps
- Frame time: ~16.67ms

**Without Web Worker:**
- Main thread: Blocked during signing
- FPS: Drops to 10-30fps
- Frame time: 33-100ms+

## Error Handling

### Worker Initialization Errors

```typescript
// Automatic fallback with warning
console.warn('[PaymasterClient] Failed to initialize worker, falling back to main thread');
```

### Runtime Worker Errors

```typescript
// Worker errors trigger automatic fallback
worker.onerror = (error) => {
  console.error('[PaymasterClient] Worker error:', error);
  this.useWorker = false;
  this.worker?.terminate();
};
```

### Message Timeout

```typescript
// Messages timeout after 30 seconds
const timeoutId = setTimeout(() => {
  this.pendingRequests.delete(id);
  reject(new Error('Worker operation timed out'));
}, 30000);
```

## Security Considerations

### Key Handling

- **Worker Isolation**: Keys are passed to worker via message passing
- **Memory Management**: Worker memory is isolated from main thread
- **Cleanup**: Workers are terminated when client is destroyed

### WASM Security

- **Sandboxed**: WASM runs in a secure sandbox
- **Memory Limits**: Limited memory access
- **No Direct DOM Access**: WASM cannot directly manipulate DOM

## Troubleshooting

### Common Issues

1. **Worker fails to initialize**
   - Check browser compatibility
   - Verify worker file is accessible
   - Check CORS settings

2. **Performance not improved**
   - Ensure `useWorker: true` is set
   - Check browser DevTools for worker activity
   - Verify WASM module is loading

3. **Build errors**
   - Ensure TypeScript configuration supports workers
   - Check module resolution settings
   - Verify all dependencies are installed

### Debug Mode

Enable detailed logging:

```typescript
// Worker logging
console.log('[SigningWorker] WASM module initialized successfully');
console.log('[SigningWorker] Processing sign_transaction request');

// Client logging
console.log('[PaymasterClient] Web Worker initialized for signing operations');
console.log('[PaymasterClient] Worker signing failed, falling back to main thread');
```

## Future Enhancements

- **Comlink Integration**: Easier worker communication
- **Multiple Workers**: Parallel processing for batch operations
- **Streaming**: Large transaction streaming
- **WebAssembly SIMD**: Optimized cryptographic operations
- **Service Worker**: Offline support and caching

## Contributing

When contributing to the Web Worker implementation:

1. Test both worker and fallback modes
2. Verify performance improvements
3. Update performance tests
4. Document new features
5. Ensure browser compatibility

## License

ISC License - See LICENSE file for details.
