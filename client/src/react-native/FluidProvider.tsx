import React, { createContext, useContext, useMemo } from "react";
import { FluidClient, FluidClientConfig } from "../FluidClient";

/**
 * Context for the FluidClient instance
 */
const FluidContext = createContext<FluidClient | null>(null);

/**
 * Hook to access the FluidClient instance from any component within the FluidProvider
 */
export const useFluidClient = () => {
  const context = useContext(FluidContext);
  if (!context) {
    throw new Error("useFluidClient must be used within a FluidProvider");
  }
  return context;
};

export interface FluidProviderProps {
  /**
   * Configuration for the FluidClient
   */
  config: FluidClientConfig;
  /**
   * Children components
   */
  children: React.ReactNode;
}

/**
 * Provider component for React Native applications.
 * Handles initialization of FluidClient with mobile-specific defaults.
 */
export const FluidProvider: React.FC<FluidProviderProps> = ({ config, children }) => {
  const client = useMemo(() => {
    // Mobile optimization: Web Workers are not available in standard React Native
    // unless using a specific library. We default to false for RN.
    const mobileConfig = {
      ...config,
      useWorker: config.useWorker ?? false,
    };
    return new FluidClient(mobileConfig);
  }, [config]);

  // Ensure client is terminated on unmount
  React.useEffect(() => {
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
