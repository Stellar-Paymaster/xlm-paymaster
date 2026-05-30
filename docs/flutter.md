# Flutter SDK Integration Guide

This guide explains how to integrate the Fluid Flutter SDK into your Flutter mobile application for gasless Stellar transactions.

## Overview

The Flutter Fluid SDK provides a simplified, production-ready interface for integrating gasless Stellar transactions into Flutter mobile applications. It wraps the Fluid JavaScript client with Flutter-friendly APIs, comprehensive error handling, and network resilience.

## Installation

Since the Fluid SDK is a JavaScript/TypeScript library, you'll need to integrate it into your Flutter app using one of these approaches:

### Approach 1: WebView Integration (Recommended)

Use a WebView to run the JavaScript SDK alongside your Flutter UI:

```yaml
# pubspec.yaml
dependencies:
  webview_flutter: ^4.0.0
```

### Approach 2: Platform Channels

Create a native bridge using platform channels to communicate between Dart and JavaScript:

```dart
// Example using method channel
final platform = MethodChannel('com.your.app/fluid');
```

### Approach 3: Dart-JS Interop

For Flutter Web apps, use Dart's JavaScript interop:

```dart
@JS('FlutterFluidClient')
library flutter_fluid_client;

import 'package:js/js.dart';
```

## Quick Start

### 1. Initialize the SDK

```dart
final client = FlutterFluidClient(
  networkPassphrase: 'Test Network',
  serverUrl: 'https://your-fluid-server.com',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  enableAutoRetry: true,
  maxRetries: 3,
  networkTimeoutMs: 30000,
);

await client.initialize();
```

### 2. Send a Gasless Transaction

```dart
// Create a transaction (example using Stellar SDK)
final transaction = await buildTransaction(
  destination: 'GB...',
  amount: '100',
);

// Send transaction and wait for confirmation
final result = await client.sendTransaction(
  transaction,
  timeoutMs: 60000,
  onProgress: (progress) {
    print('Confirmation progress: $progress');
  },
);

if (result.success) {
  print('Transaction successful: ${result.data!.hash}');
  print('Block number: ${result.data!.blockNumber}');
} else {
  print('Transaction failed: ${result.error}');
  print('Error code: ${result.errorCode}');
}
```

### 3. Build Token Transfer (SAC)

```dart
final transactionResult = await client.buildTokenTransfer(
  destination: 'GBABC...',
  amount: '1000',
  asset: 'USDC',
);

if (transactionResult.success) {
  final transaction = transactionResult.data;
  print('Transaction built: ${transaction.toXDR()}');
} else {
  print('Build failed: ${transactionResult.error}');
}
```

## API Reference

### `FlutterFluidClient`

#### Constructor

```dart
FlutterFluidClient({
  required String networkPassphrase,
  String? serverUrl,
  List<String>? serverUrls,
  String? horizonUrl,
  String? sorobanRpcUrl,
  bool useWorker = false,
  bool enableAutoRetry = true,
  int maxRetries = 3,
  int networkTimeoutMs = 30000,
  bool verboseErrors = false,
  bool enableTelemetry = false,
  String? telemetryEndpoint,
  bool enableDiagnostics = false,
  String? diagnosticsEndpoint,
});
```

**Parameters:**
- `networkPassphrase`: Stellar network identifier (e.g., "Test Network")
- `serverUrl`: Primary Fluid server URL (legacy, use `serverUrls` instead)
- `serverUrls`: List of Fluid server URLs for redundancy
- `horizonUrl`: Horizon server URL for transaction submission
- `sorobanRpcUrl`: Soroban RPC URL for token operations
- `useWorker`: Enable Web Worker for signing (default: false)
- `enableAutoRetry`: Enable automatic retry on network failures (default: true)
- `maxRetries`: Maximum retry attempts (default: 3)
- `networkTimeoutMs`: Network operation timeout in milliseconds (default: 30000)
- `verboseErrors`: Include detailed error information (default: false)
- `enableTelemetry`: Enable diagnostic telemetry (default: false)

#### Methods

##### `initialize()`

Initializes the client and verifies platform compatibility.

```dart
final result = await client.initialize();
if (result.success) {
  // Client is ready
} else {
  // Handle initialization failure
}
```

##### `buildAndRequestFeeBump()`

Builds and requests a fee-bump transaction (gasless).

```dart
final result = await client.buildAndRequestFeeBump(
  transaction,
  keypair: optionalKeypair,
  submit: true,
);
```

**Parameters:**
- `transaction`: Transaction or XDR string
- `keypair`: (optional) Keypair for signing
- `submit`: Whether to submit to blockchain (default: false)

**Returns:** `FlutterResult<FeeBumpResponse>`

##### `requestFeeBump()`

Requests a fee-bump transaction without signing.

```dart
final result = await client.requestFeeBump(
  transaction,
  submit: false,
);
```

##### `buildTokenTransfer()`

Builds a Stellar Asset Contract (SAC) token transfer.

```dart
final result = await client.buildTokenTransfer(
  destination: 'GBABC...',
  amount: '100',
  asset: 'USDC',
);
```

##### `submitTransaction()`

Submits a fee-bump transaction to the network.

```dart
final result = await client.submitTransaction(feeBumpXdr);
```

##### `waitForConfirmation()`

Waits for transaction confirmation.

```dart
final result = await client.waitForConfirmation(
  hash,
  timeoutMs: 60000,
  pollIntervalMs: 1500,
  onProgress: (progress) {
    print('Attempt: ${progress.attempt}');
    print('Elapsed: ${progress.elapsedMs}ms');
  },
);
```

##### `sendTransaction()`

Complete transaction lifecycle: build, sign, submit, confirm.

```dart
final result = await client.sendTransaction(
  transaction,
  keypair: optionalKeypair,
  timeoutMs: 60000,
  onProgress: (progress) {
    // Track confirmation progress
  },
);
```

##### `signTransactions()`

Signs multiple transactions.

```dart
final result = await client.signTransactions(
  [transaction1, transaction2],
  keypair,
);
```

##### `terminate()`

Cleans up resources (workers, connections).

```dart
client.terminate();
```

### Result Types

#### `FlutterResult<T>`

All SDK methods return a `FlutterResult` object:

```dart
class FlutterResult<T> {
  bool success;           // Whether operation succeeded
  T? data;                // Result data if successful
  String? error;          // Error message if failed
  String? errorCode;      // Error code for programmatic handling
  Map<String, dynamic>? context;  // Additional debugging context
}
```

#### `FlutterTransactionResult`

Transaction completion result:

```dart
class FlutterTransactionResult {
  String hash;            // Transaction hash
  String xdr;             // Transaction XDR
  String status;          // Transaction status
  int? blockNumber;       // Block number (if confirmed)
}
```

## Error Handling

The SDK uses consistent error codes for programmatic error handling:

### Error Codes

```dart
import 'package:your_app/fluttter_sdk.dart';

// Check error codes
if (result.errorCode == FlutterSDKErrorCodes.TIMEOUT_ERROR) {
  // Handle timeout
} else if (result.errorCode == FlutterSDKErrorCodes.NETWORK_ERROR) {
  // Handle network error
}
```

**Available Error Codes:**

| Code | Description |
|------|-------------|
| `CONFIGURATION_ERROR` | Invalid SDK configuration |
| `NETWORK_ERROR` | Network communication failure |
| `SERVER_ERROR` | Server returned error status |
| `WALLET_ERROR` | Wallet/signing operation failed |
| `TIMEOUT_ERROR` | Operation timed out |
| `PLATFORM_INCOMPATIBLE` | Platform compatibility issue |
| `UNKNOWN_ERROR` | Unspecified error |

### Error Handling Best Practices

```dart
final result = await client.sendTransaction(transaction);

if (result.success) {
  // Handle success
  final transaction = result.data!;
  print('Transaction hash: ${transaction.hash}');
} else {
  // Handle failure
  switch (result.errorCode) {
    case FlutterSDKErrorCodes.NETWORK_ERROR:
      // Show retry UI
      _showRetryDialog();
      break;
    case FlutterSDKErrorCodes.TIMEOUT_ERROR:
      // Check connection
      _checkNetworkConnection();
      break;
    case FlutterSDKErrorCodes.WALLET_ERROR:
      // Prompt user to check wallet
      _showWalletErrorDialog();
      break;
    default:
      // Show generic error
      _showErrorDialog(result.error);
  }
  
  // Log with context for debugging
  if (result.context != null) {
    logError(result.context);
  }
}
```

## Network Resilience

The SDK includes automatic retry logic for improved network resilience:

```dart
// Configure retry behavior
final client = FlutterFluidClient(
  networkPassphrase: 'Test Network',
  serverUrls: [
    'https://fluid-primary.example',
    'https://fluid-secondary.example',
    'https://fluid-tertiary.example',
  ],
  enableAutoRetry: true,      // Enable automatic retry
  maxRetries: 3,              // Retry up to 3 times
  networkTimeoutMs: 30000,    // 30 second timeout
);
```

### Server Fallback

The SDK automatically fails over to alternative servers:

```dart
final client = FlutterFluidClient(
  serverUrls: [
    'https://fluid-primary.example',  // Try first
    'https://fluid-secondary.example', // Fallback 1
    'https://fluid-tertiary.example',  // Fallback 2
  ],
  networkPassphrase: 'Test Network',
);
```

## Platform Compatibility

The SDK checks for required platform features:

```dart
final client = FlutterFluidClient(
  networkPassphrase: 'Test Network',
  serverUrl: 'https://fluid.example',
);

final result = await client.initialize();

if (!client.isPlatformCompatible()) {
  // Handle incompatible platform
  print('Required features not available');
}
```

**Required Features:**
- WebSocket (if using workers)
- Fetch API
- Promise support
- Worker API (optional, for signing)

## Security Best Practices

### 1. Secure Configuration

```dart
// Load sensitive data from secure storage
final horizonUrl = await _secureStorage.read(key: 'horizon_url');
final apiKey = await _secureStorage.read(key: 'api_key');

final client = FlutterFluidClient(
  networkPassphrase: 'Test Network',
  serverUrl: horizonUrl,
  horizonUrl: horizonUrl,
);
```

### 2. Transaction Validation

```dart
// Always validate transactions before sending
final result = await client.buildAndRequestFeeBump(transaction);

if (result.success) {
  // Review transaction details
  final tx = result.data!;
  print('Fee: ${tx.fee}');
  print('Operations: ${tx.operations.length}');
  
  // Confirm with user before submission
  if (await _confirmTransaction()) {
    await client.submitTransaction(tx.xdr);
  }
}
```

### 3. Error Logging

```dart
// Enable verbose errors for debugging
final client = FlutterFluidClient(
  networkPassphrase: 'Test Network',
  serverUrl: 'https://fluid.example',
  verboseErrors: true,  // Only in debug builds
);

// Report bugs with context
client.reportBug(
  'Transaction submission failed',
  {'transactionType': 'payment', 'amount': 100},
);
```

## Performance Optimization

### 1. Use Workers for Signing (Web)

```dart
final client = FlutterFluidClient(
  networkPassphrase: 'Test Network',
  serverUrl: 'https://fluid.example',
  useWorker: true,  // Offload signing to Web Worker
);
```

### 2. Batch Operations

```dart
// Sign multiple transactions at once
final result = await client.signTransactions(
  [tx1, tx2, tx3],
  keypair,
);
```

### 3. Configure Timeouts

```dart
final client = FlutterFluidClient(
  networkPassphrase: 'Test Network',
  serverUrl: 'https://fluid.example',
  networkTimeoutMs: 15000,  // 15 second timeout for faster failure
);
```

## Examples

### Complete Payment Flow

```dart
import 'package:flutter/material.dart';
import 'package:your_app/fluid_sdk.dart';

class PaymentScreen extends StatefulWidget {
  @override
  _PaymentScreenState createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  late FlutterFluidClient _client;
  bool _isLoading = false;
  String? _transactionHash;

  @override
  void initState() {
    super.initState();
    _initClient();
  }

  Future<void> _initClient() async {
    _client = FlutterFluidClient(
      networkPassphrase: 'Test Network',
      serverUrl: 'https://fluid.example',
      horizonUrl: 'https://horizon-testnet.stellar.org',
    );
    
    await _client.initialize();
  }

  Future<void> _sendPayment() async {
    setState(() => _isLoading = true);

    try {
      // Build transaction
      final txResult = await _client.buildTokenTransfer(
        destination: widget.recipientAddress,
        amount: widget.amount,
        asset: 'USDC',
      );

      if (!txResult.success) {
        throw Exception('Failed to build transaction: ${txResult.error}');
      }

      // Send transaction
      final result = await _client.sendTransaction(
        txResult.data!,
        onProgress: (progress) {
          setState(() {
            _statusMessage = 'Confirming... (attempt ${progress.attempt})';
          });
        },
      );

      if (result.success) {
        setState(() {
          _transactionHash = result.data!.hash;
        });
      } else {
        throw Exception('Transaction failed: ${result.error}');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e')),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Send Payment')),
      body: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          children: [
            if (_isLoading)
              CircularProgressIndicator()
            else
              ElevatedButton(
                onPressed: _sendPayment,
                child: Text('Send Payment'),
              ),
            if (_transactionHash != null)
              Text('Transaction: $_transactionHash'),
          ],
        ),
      ),
    );
  }
}
```

## Integration with Flutter Web

For Flutter Web apps, the SDK works seamlessly with Dart-JS interop:

```dart
// Import the generated JS interop
declare var FlutterFluidClient: any;

class FluidSDK {
  static final _client = FlutterFluidClient({
    networkPassphrase: 'Test Network',
    serverUrl: 'https://fluid.example',
  });

  static Future<void> sendPayment(String recipient, String amount) async {
    final result = await _client.sendTransaction(/* ... */);
    return result;
  }
}
```

## Troubleshooting

### Common Issues

1. **"Platform incompatibility" error**
   - Ensure running in a supported environment (WebView or web)
   - Check that required browser APIs are available

2. **"Network timeout" errors**
   - Verify server URLs are correct
   - Check network connectivity
   - Increase `networkTimeoutMs` if needed

3. **"Wallet error"**
   - Verify keypair is valid
   - Check that signing permissions are granted

4. **Transaction not confirming**
   - Verify Horizon URL is correct
   - Check transaction hash on Stellar Explorer
   - Ensure sufficient account balance for fees

## Advanced Usage

### Custom Error Handling

```dart
class AppErrorHandler {
  static void handle(FlutterResult result) {
    if (!result.success) {
      switch (result.errorCode) {
        case FlutterSDKErrorCodes.TIMEOUT_ERROR:
          _handleTimeout();
          break;
        case FlutterSDKErrorCodes.NETWORK_ERROR:
          _handleNetworkError();
          break;
        default:
          _handleGenericError(result.error);
      }
    }
  }
}
```

### Event Streaming

```dart
// Stream confirmation progress
Stream<ConfirmationProgress> streamConfirmation(String hash) async* {
  final client = FlutterFluidClient(
    networkPassphrase: 'Test Network',
    serverUrl: 'https://fluid.example',
  );

  await client.waitForConfirmation(
    hash,
    onProgress: (progress) {
      yield progress;
    },
  );
}
```

## Resources

- [Stellar Developer Portal](https://developers.stellar.org/)
- [Fluid Server Documentation](https://fluid.example/docs)
- [Stellar SDK Reference](https://stellar.github.io/js-stellar-sdk/)

## Support

For issues and questions:
- Check the [GitHub Issues](https://github.com/your-org/fluid/issues)
- Join our [Discord Community](https://discord.gg/your-server)
- Review [Stack Overflow](https://stackoverflow.com/tags/fluid-sdk)

## License

This SDK is provided under the MIT License. See LICENSE file for details.
