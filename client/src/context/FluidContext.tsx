import React, { createContext, useContext, useMemo, useEffect } from "react";
import { FluidClient, FluidClientConfig } from "../FluidClient";

// Define the context to hold the FluidClient instance or null
export const FluidContext = createContext<FluidClient | null>(null);

export interface FluidProviderProps {
  config: FluidClientConfig;
  children: React.ReactNode;
}

export const FluidProvider: React.FC<FluidProviderProps> = ({ config, children }) => {
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
    return new FluidClient(config);
  }, [configKey]);

  // Cleanup: Terminate client worker threads on configuration updates or unmounting
  useEffect(() => {
    return () => {
      client.terminate();
    };
  }, [client]);

  return (
    <FluidContext.Provider value={client}>
      {children}
    </FluidContext.Provider>
  );
};

// Custom hook to access the FluidClient instance from any child component
export const useFluid = (): FluidClient => {
  const context = useContext(FluidContext);
  if (!context) {
    throw new Error("useFluid must be used within a FluidProvider");
  }
  return context;
};
