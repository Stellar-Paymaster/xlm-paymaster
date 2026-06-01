import { useState, useCallback } from "react";

export interface TenantNotification {
  id: string;
  name: string;
  email: { 
    enabled: boolean; 
    address: string; 
  };
  slack: { 
    enabled: boolean; 
    webhookUrl: string; 
  };
}

export function useNotificationSettings(initialData: TenantNotification[] = []) {
  const [settings, setSettings] = useState<TenantNotification[]>(initialData);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // In a production environment, this would be an async function wrapped with API calls.
  const updateSetting = useCallback((
    tenantId: string, 
    channel: "email" | "slack", 
    key: "enabled" | "address" | "webhookUrl", 
    value: string | boolean
  ) => {
    setSettings((prev) => 
      prev.map((tenant) => {
        if (tenant.id === tenantId) {
          return { 
            ...tenant, 
            [channel]: { 
              ...tenant[channel], 
              [key]: value 
            } 
          };
        }
        return tenant;
      })
    );
  }, []);

  const saveChanges = async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulate a backend API call to persist /api/admin/notifications
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Successfully saved
    } catch (err) {
      setError(new Error("Failed to save notification settings"));
    } finally {
      setLoading(false);
    }
  };

  return { settings, loading, error, updateSetting, saveChanges };
}