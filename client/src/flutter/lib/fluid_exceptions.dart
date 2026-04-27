/// Base class for all Fluid-related errors.
class FluidError implements Exception {
  final String message;

  FluidError(this.message);

  @override
  String toString() => 'FluidError: $message';
}

/// Error thrown when a network request fails (e.g., DNS, timeout, no connectivity).
class FluidNetworkError extends FluidError {
  final String? serverUrl;

  FluidNetworkError(String message, {this.serverUrl})
      : super(message);

  @override
  String toString() => 'FluidNetworkError: $message (serverUrl: $serverUrl)';
}

/// Error thrown when the Fluid server returns an error response (4xx or 5xx).
class FluidServerError extends FluidError {
  final int status;
  final String serverUrl;
  final dynamic responseBody;

  FluidServerError(String message, {required this.status, required this.serverUrl, this.responseBody})
      : super(message);

  @override
  String toString() => 'FluidServerError: $message (status: $status, serverUrl: $serverUrl, responseBody: $responseBody)';
}

/// Error thrown when the Fluid client is misconfigured.
class FluidConfigurationError extends FluidError {
  FluidConfigurationError(String message) : super(message);

  @override
  String toString() => 'FluidConfigurationError: $message';
}

/// Error thrown when a required wallet/keypair is missing or operation is rejected by user.
class FluidWalletError extends FluidError {
  FluidWalletError(String message) : super(message);

  @override
  String toString() => 'FluidWalletError: $message';
}