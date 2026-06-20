import React, { createContext, useContext, useMemo, useEffect } from "react";
import { PaymasterClient, PaymasterClientConfig } from "../PaymasterClient";

// Define the context to hold the PaymasterClient instance or null
export const PaymasterContext = createContext<PaymasterClient | null>(null);

export interface PaymasterProviderProps {
  config: PaymasterClientConfig;
  children: React.ReactNode;
}

export const PaymasterProvider: React.FC<PaymasterProviderProps> = ({ config, children }) => {
  // To support dynamic updates and avoid unnecessary re-renders,
  // we serialize and check key configuration properties for changes.
  const configKey = useMemo(() => {
    return JSON.stringify({
      serverUrl: config.serverUrl,
      serverUrls: config.serverUrls,
      networkPassphrase: config.networkPassphrase,
      horizonUrl: config.horizonUrl,
      sorobanRpcUrl: config.sorobanRpcUrl,
      useWorker: config.useWorker,
      enableTelemetry: config.enableTelemetry,
      telemetryEndpoint: config.telemetryEndpoint,
      enableDiagnostics: config.enableDiagnostics,
      diagnosticsEndpoint: config.diagnosticsEndpoint,
      timeout: config.timeout,
    });
  }, [
    config.serverUrl,
    config.serverUrls,
    config.networkPassphrase,
    config.horizonUrl,
    config.sorobanRpcUrl,
    config.useWorker,
    config.enableTelemetry,
    config.telemetryEndpoint,
    config.enableDiagnostics,
    config.diagnosticsEndpoint,
    config.timeout,
  ]);

  // Create client only when configKey (the config data) changes
  const client = useMemo(() => {
    return new PaymasterClient(config);
  }, [configKey]);

  // Cleanup: Terminate client worker threads on configuration updates or unmounting
  useEffect(() => {
    return () => {
      client.terminate();
    };
  }, [client]);

  return (
    <PaymasterContext.Provider value={client}>
      {children}
    </PaymasterContext.Provider>
  );
};

// Custom hook to access the PaymasterClient instance from any child component
export const usePaymaster = (): PaymasterClient => {
  const context = useContext(PaymasterContext);
  if (!context) {
    throw new Error("usePaymaster must be used within a PaymasterProvider");
  }
  return context;
};
