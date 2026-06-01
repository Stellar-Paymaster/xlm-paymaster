import React from "react";
import { useNotificationSettings, TenantNotification } from "../hooks/useNotificationSettings";

export interface NotificationSettingsProps {
  initialData?: TenantNotification[];
}

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ initialData = [] }) => {
  const { settings, loading, error, updateSetting, saveChanges } = useNotificationSettings(initialData);

  return (
    <div className="notification-settings-container">
      <div className="settings-header">
        <h2>Granular Notification Settings</h2>
        <p className="description">
          Configure alert routing channels on a per-tenant basis. Choose to receive Slack alerts for some tenants and email for others.
        </p>
        <button className="save-btn" onClick={saveChanges} disabled={loading}>
          {loading ? "Saving..." : "Save Configuration"}
        </button>
      </div>

      {error && <div className="error-banner">{error.message}</div>}

      <div className="table-responsive">
        <table className="settings-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Email Alerts</th>
              <th>Slack Alerts</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((tenant) => (
              <tr key={tenant.id}>
                <td className="tenant-name">{tenant.name}</td>
                
                <td className="channel-config">
                  <label className="toggle-label">
                    <input 
                      type="checkbox" 
                      checked={tenant.email.enabled} 
                      onChange={(e) => updateSetting(tenant.id, "email", "enabled", e.target.checked)} 
                      aria-label={`Email enabled for ${tenant.name}`} 
                    /> Enable
                  </label>
                  <input 
                    type="email" 
                    value={tenant.email.address} 
                    onChange={(e) => updateSetting(tenant.id, "email", "address", e.target.value)} 
                    disabled={!tenant.email.enabled} 
                    placeholder="admin@domain.com" 
                    aria-label={`Email address for ${tenant.name}`} 
                  />
                </td>

                <td className="channel-config">
                  <label className="toggle-label">
                    <input 
                      type="checkbox" 
                      checked={tenant.slack.enabled} 
                      onChange={(e) => updateSetting(tenant.id, "slack", "enabled", e.target.checked)} 
                      aria-label={`Slack enabled for ${tenant.name}`} 
                    /> Enable
                  </label>
                  <input 
                    type="text" 
                    value={tenant.slack.webhookUrl} 
                    onChange={(e) => updateSetting(tenant.id, "slack", "webhookUrl", e.target.value)} 
                    disabled={!tenant.slack.enabled} 
                    placeholder="https://hooks.slack.com/..." 
                    aria-label={`Slack webhook for ${tenant.name}`} 
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};