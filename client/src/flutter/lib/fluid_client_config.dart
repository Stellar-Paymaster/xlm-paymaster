import 'package:flutter/foundation.dart';

/// Configuration for the FluidClient.
class FluidClientConfig {
  final String? serverUrl;
  final List<String>? serverUrls;
  final String networkPassphrase;
  final String? horizonUrl;
  final String? sorobanRpcUrl;
  final bool useWorker;
  final dynamic stellarSdk; // We'll allow passing in a custom StellarSDK instance
  final bool? enableTelemetry;
  final String? telemetryEndpoint;
  final bool? enableDiagnostics;
  final String? diagnosticsEndpoint;

  FluidClientConfig({
    this.serverUrl,
    this.serverUrls,
    required this.networkPassphrase,
    this.horizonUrl,
    this.sorobanRpcUrl,
    this.useWorker = false,
    this.stellarSdk,
    this.enableTelemetry,
    this.telemetryEndpoint,
    this.enableDiagnostics,
    this.diagnosticsEndpoint,
  });
}