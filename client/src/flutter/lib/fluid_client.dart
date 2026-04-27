import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'fluid_client_config.dart';
import 'fluid_exceptions.dart';

/// Fee bump response from the Fluid server.
class FeeBumpResponse {
  final String xdr;
  final String status;
  final String? hash;
  final String? feePayer;
  final String? submittedVia;
  final int? submissionAttempts;

  FeeBumpResponse({
    required this.xdr,
    required this.status,
    this.hash,
    this.feePayer,
    this.submittedVia,
    this.submissionAttempts,
  });

  factory FeeBumpResponse.fromJson(Map<String, dynamic> json) {
    return FeeBumpResponse(
      xdr: json['xdr'] as String,
      status: json['status'] as String,
      hash: json['hash'] as String?,
      feePayer: json['fee_payer'] as String?,
      submittedVia: json['submitted_via'] as String?,
      submissionAttempts: json['submission_attempts'] as int?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'xdr': xdr,
      'status': status,
      'hash': hash,
      'fee_payer': feePayer,
      'submitted_via': submittedVia,
      'submission_attempts': submissionAttempts,
    };
  }
}

/// Wait for confirmation progress callback.
typedef WaitForConfirmationProgressCallback = void Function(WaitForConfirmationProgress progress);

/// Wait for confirmation progress data.
class WaitForConfirmationProgress {
  final String hash;
  final int attempt;
  final int elapsedMs;

  WaitForConfirmationProgress({
    required this.hash,
    required this.attempt,
    required this.elapsedMs,
  });
}

/// Wait for confirmation options.
class WaitForConfirmationOptions {
  final int? pollIntervalMs;
  final WaitForConfirmationProgressCallback? onProgress;

  WaitForConfirmationOptions({
    this.pollIntervalMs,
    this.onProgress,
  });
}

/// Main Fluid client for interacting with Fluid servers.
class FluidClient {
  final List<String> _serverUrls;
  final String _networkPassphrase;
  final String? _horizonUrl;
  final String? _sorobanRpcUrl;
  final bool _useWorker;
  final dynamic _stellarSdk; // We'll allow passing in a custom StellarSDK instance
  final bool? _enableTelemetry;
  final String? _telemetryEndpoint;
  final bool? _enableDiagnostics;
  final String? _diagnosticsEndpoint;

  // Internal state for server failure tracking
  final Map<String, _NodeFailureState> _nodeFailureState = {};
  int _requestIdCounter = 0;
  final Map<String, _PendingRequest> _pendingRequests = {};

  FluidClient(FluidClientConfig config)
      : _networkPassphrase = config.networkPassphrase,
        _horizonUrl = config.horizonUrl,
        _sorobanRpcUrl = config.sorobanRpcUrl,
        _useWorker = config.useWorker ?? false,
        _stellarSdk = config.stellarSdk,
        _enableTelemetry = config.enableTelemetry,
        _telemetryEndpoint = config.telemetryEndpoint,
        _enableDiagnostics = config.enableDiagnostics,
        _diagnosticsEndpoint = config.diagnosticsEndpoint,
        _serverUrls = _normalizeServerUrls(config);

  static List<String> _normalizeServerUrls(FluidClientConfig config) {
    final rawUrls = config.serverUrls?.isNotEmpty == true
        ? config.serverUrls
        : config.serverUrl != null
            ? [config.serverUrl]
            : [];

    if (rawUrls == null || rawUrls.isEmpty) {
      throw FluidConfigurationError(
          'FluidClient requires at least one server URL via serverUrl or serverUrls');
    }

    final normalized = <String>[];
    for (final url in rawUrls) {
      final trimmed = url.trim().replaceAll(RegExp(r'/+$'), '');
      if (trimmed.isNotEmpty) {
        normalized.add(trimmed);
      }
    }

    // Remove duplicates while preserving order
    final seen = <String>{};
    final result = <String>[];
    for (final url in normalized) {
      if (!seen.contains(url)) {
        seen.add(url);
        result.add(url);
      }
    }

    return result;
  }

  List<String> _getOrderedServerUrls() {
    final now = Date.now().millisecondsSinceEpoch;
    final entries = <_UrlScore>[];

    for (var i = 0; i < _serverUrls.length; i++) {
      final url = _serverUrls[i];
      final state = _nodeFailureState[url];
      final isCoolingDown = state != null && state.failedUntil > now;

      final score = isCoolingDown
          ? 1000 + state!.failedUntil - now
          : 0;

      entries.add(_UrlScore(url: url, index: i, score: score));
    }

    entries.sort((a, b) {
      final scoreDiff = a.score - b.score;
      if (scoreDiff != 0) return scoreDiff;
      return a.index - b.index;
    });

    return entries.map((e) => e.url).toList();
  }

  void _markServerFailure(String serverUrl) {
    final previous = _nodeFailureState[serverUrl];
    final failures = (previous?.failures ?? 0) + 1;
    final cooldownMultiplier = (failures - 1).clamp(0, 4);
    final baseDelay = 1000; // 1 second base
    final maxDelay = 16000; // 16 seconds max
    final delayMs = (baseDelay * (1 << cooldownMultiplier)).clamp(baseDelay, maxDelay);
    final failedUntil = Date.now().millisecondsSinceEpoch + delayMs;

    _nodeFailureState[serverUrl] = _NodeFailureState(
        failures: failures, failedUntil: failedUntil);
  }

  void _markServerSuccess(String serverUrl) {
    _nodeFailureState.remove(serverUrl);
  }

  int _getRetryDelayMs(int attemptIndex) {
    final base = 250;
    final max = 2000;
    final exponential = base * (1 << attemptIndex);
    return exponential.clamp(base, max);
  }

  Future<void> _sleep(int ms) async {
    await Future.delayed(Duration(milliseconds: ms));
  }

  Future<T> _performJsonRequest<T>(
      String serverUrl, String path, Object body) async {
    final uri = Uri.parse('$serverUrl$path');
    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    ).timeout(const Duration(seconds: 30));

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as T;
    } else {
      final errorText = response.body;
      dynamic parsedError;
      try {
        parsedError = jsonDecode(errorText);
      } catch (_) {
        parsedError = errorText;
      }

      throw FluidServerError(
        'Fluid server error: ${response.statusCode} ${response.reasonPhrase}',
        status: response.statusCode,
        serverUrl: serverUrl,
        responseBody: parsedError,
      );
    }
  }

  Future<T> _requestWithFallback<T>(String path, Object body) async {
    final orderedServerUrls = _getOrderedServerUrls();
    Exception? lastError;

    for (var attemptIndex = 0;
        attemptIndex < orderedServerUrls.length;
        attemptIndex++) {
      final serverUrl = orderedServerUrls[attemptIndex];

      try {
        final result =
            await _performJsonRequest<T>(serverUrl, path, body);
        _markServerSuccess(serverUrl);
        return result;
      } catch (error) {
        // If it's a 400 Bad Request, don't fallback, as it's likely a transaction error
        if (error is FluidServerError && error.status == 400) {
          rethrow;
        }

        lastError = error;
        _markServerFailure(serverUrl);

        if (attemptIndex < orderedServerUrls.length - 1) {
          final retryDelayMs = _getRetryDelayMs(attemptIndex);
          final nextServerUrl = orderedServerUrls[attemptIndex + 1];
          debugPrint(
              '[FluidClient] Request failed on $serverUrl (${lastError.message}). Retrying $path on $nextServerUrl in $retryDelayMsms.');
          await _sleep(retryDelayMs);
        }
      }
    }

    throw lastError ??
        FluidServerError('No available servers for request',
            status: 503, serverUrl: 'unknown');
  }

  // Note: Worker implementation is omitted for Flutter as it's not typically used
  // In a real implementation, you might use isolates for background work

  Future<FeeBumpResponse> requestFeeBump(
      Object transaction, [bool submit = false]) async {
    final xdr = _serializeTransaction(transaction);
    final result = await _requestWithFallback<FeeBumpResponse>(
        '/fee-bump', {'xdr': xdr, 'submit': submit});
    return FeeBumpResponse.fromJson(result);
  }

  Future<List<FeeBumpResponse>> requestFeeBumpBatch(
      List<Object> transactions, [bool submit = false]) async {
    final xdrs =
        transactions.map((t) => _serializeTransaction(t)).toList();
    final result = await _requestWithFallback<List<dynamic>>(
        '/fee-bump/batch', {'xdrs': xdrs, 'submit': submit});
    return result
        .map((e) => FeeBumpResponse.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> submitFeeBumpTransaction(String feeBumpXdr) async {
    if (_horizonUrl == null) {
      throw FluidConfigurationError('Horizon URL not configured');
    }
    // In a real implementation, we would use the Stellar SDK to submit the transaction
    // For now, we'll throw an unimplemented error as this requires Stellar SDK integration
    throw UnimplementedError(
        'submitFeeBumpTransaction requires Stellar SDK integration');
  }

  Future<dynamic> waitForConfirmation(
      String hash, {
        int timeoutMs = 60000,
        WaitForConfirmationOptions options = const WaitForConfirmationOptions(),
      }) async {
    if (_horizonUrl == null) {
      throw FluidConfigurationError('Horizon URL not configured');
    }

    final pollIntervalMs = options.pollIntervalMs ?? 1500;
    final startedAt = Date.now().millisecondsSinceEpoch;
    int attempt = 0;

    while (Date.now().millisecondsSinceEpoch - startedAt < timeoutMs) {
      attempt++;
      options.onProgress?.call(WaitForConfirmationProgress(
          hash: hash,
          attempt: attempt,
          elapsedMs: Date.now().millisecondsSinceEpoch - startedAt));

      try {
        final uri = Uri.parse('$_horizonUrl/transactions/$hash');
        final response = await http.get(
          uri,
          headers: {'Accept': 'application/json'},
        ).timeout(const Duration(seconds: 10));

        if (response.statusCode == 404) {
          await _sleep(pollIntervalMs);
          continue;
        }

        if (response.statusCode >= 200 && response.statusCode < 300) {
          return jsonDecode(response.body);
        } else {
          final body = response.body;
          throw FluidServerError(
              'Horizon error while confirming tx: ${response.statusCode} ${response.reasonPhrase}',
              status: response.statusCode,
              serverUrl: _horizonUrl!,
              responseBody: body);
        }
      } catch (error) {
        if (error is FluidServerError || error is FluidNetworkError) {
          rethrow;
        }
        await _sleep(pollIntervalMs);
      }
    }

    throw Exception(
        'Timed out waiting for transaction confirmation after $timeoutMs ms: $hash');
  }

  // Note: buildAndRequestFeeBump and signWithWorker/signOnMainThread would require
  // Stellar SDK integration which is complex to port to Flutter/Dart
  // For a production implementation, you would need to integrate a Dart Stellar SDK
  Future<FeeBumpResponse> buildAndRequestFeeBump(
      Object transaction, [Object? keypair, bool submit = false]) async {
    // This would require Stellar SDK for transaction signing
    throw UnimplementedError(
        'buildAndRequestFeeBump requires Stellar SDK integration for signing');
  }

  // Note: buildSACTransferTx would require Soroban SDK integration
  Future<Object> buildSACTransferTx(Object options) async {
    throw UnimplementedError(
        'buildSACTransferTx requires Soroban SDK integration');
  }

  Future<List<String>> signMultipleTransactions(
      List<Object> transactions, [Object? keypair]) async {
    final results = <String>[];
    for (final transaction in transactions) {
      // This would require Stellar SDK for transaction signing
      throw UnimplementedError(
          'signMultipleTransactions requires Stellar SDK integration for signing');
    }
    return results;
  }

  void reportBug(String message, [Object? context]) {
    // Telemetry implementation would go here
    // For now, we'll just log to console in debug mode
    if (kDebugMode) {
      debugPrint('[FluidClient] Bug report: $message');
      if (context != null) {
        debugPrint('[FluidClient] Context: $context');
      }
    }
  }

  void terminate() {
    // Clean up any resources
    _pendingRequests.clear();
  }

  String _serializeTransaction(Object input) {
    if (input is String) {
      return input;
    } else {
      // Assuming the object has a toXDR method
      return (input as dynamic).toXDR();
    }
  }
}

class _NodeFailureState {
  final int failures;
  final int failedUntil;

  _NodeFailureState({required this.failures, required this.failedUntil});
}

class _UrlScore {
  final String url;
  final int index;
  final double score;

  _UrlScore({required this.url, required this.index, required this.score});
}