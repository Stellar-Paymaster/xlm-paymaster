import React, { createContext, useContext, useMemo } from "react";
import { PaymasterClient, PaymasterClientConfig } from "../PaymasterClient";

/**
 * Context for the PaymasterClient instance
 */
const PaymasterContext = createContext<PaymasterClient | null>(null);

/**
 * Hook to access the PaymasterClient instance from any component within the PaymasterProvider
 */
export const usePaymasterClient = () => {
  const context = useContext(PaymasterContext);
  if (!context) {
    throw new Error("usePaymasterClient must be used within a PaymasterProvider");
  }
  return context;
};

export interface PaymasterProviderProps {
  /**
   * Configuration for the PaymasterClient
   */
  config: PaymasterClientConfig;
  /**
   * Children components
   */
  children: React.ReactNode;
}

/**
 * Provider component for React Native applications.
 * Handles initialization of PaymasterClient with mobile-specific defaults.
 */
export const PaymasterProvider: React.FC<PaymasterProviderProps> = ({ config, children }) => {
  const client = useMemo(() => {
    // Mobile optimization: Web Workers are not available in standard React Native
    // unless using a specific library. We default to false for RN.
    const mobileConfig = {
      ...config,
      useWorker: config.useWorker ?? false,
    };
    return new PaymasterClient(mobileConfig);
  }, [config]);

  // Ensure client is terminated on unmount
  React.useEffect(() => {
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
