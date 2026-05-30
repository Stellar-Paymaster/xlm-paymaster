import React, { useState, useMemo } from 'react';

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  timestamp: string;
  details: string;
}

// Mock data representing backend audit logs
const MOCK_LOGS: AuditLog[] = [
  { id: '1', actor: 'admin@fluid.dev', action: 'LOGIN', timestamp: '2026-05-14T10:00:00Z', details: 'Successful login' },
  { id: '2', actor: 'operator@fluid.dev', action: 'ADD_ASSET', timestamp: '2026-05-14T11:30:00Z', details: 'Added EURC to whitelist' },
  { id: '3', actor: 'system', action: 'SYNC', timestamp: '2026-05-13T09:00:00Z', details: 'Ledger sync completed' },
  { id: '4', actor: 'admin@fluid.dev', action: 'UPDATE_SETTINGS', timestamp: '2026-05-12T15:45:00Z', details: 'Updated fee config' },
];

export const AuditLogUI: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');
  const [timeRange, setTimeRange] = useState('ALL');

  const filteredLogs = useMemo(() => {
    return MOCK_LOGS.filter(log => {
      // Text search (actor or details)
      const matchesSearch = searchTerm === '' || 
        log.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Action filter
      const matchesAction = filterAction === 'ALL' || log.action === filterAction;

      // Time filter
      let matchesTime = true;
      if (timeRange !== 'ALL') {
        const logDate = new Date(log.timestamp);
        // Using a fixed anchor 'now' for consistent testing based on mock data
        const now = new Date('2026-05-15T00:00:00Z'); 
        const diffMs = now.getTime() - logDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (timeRange === '24H') matchesTime = diffDays <= 1;
        else if (timeRange === '7D') matchesTime = diffDays <= 7;
        else if (timeRange === '30D') matchesTime = diffDays <= 30;
      }

      return matchesSearch && matchesAction && matchesTime;
    });
  }, [searchTerm, filterAction, timeRange]);

  const uniqueActions = Array.from(new Set(MOCK_LOGS.map(l => l.action)));

  return (
    <div className="p-6 bg-white dark:bg-gray-900 rounded-lg shadow w-full">
      <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-gray-100">Searchable Audit Log</h2>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <input
          type="text"
          placeholder="Search actor or details..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          aria-label="Search Audit Logs"
        />
        
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          aria-label="Filter by Action"
        >
          <option value="ALL">All Actions</option>
          {uniqueActions.map(action => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>

        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          aria-label="Filter by Time Range"
        >
          <option value="ALL">All Time</option>
          <option value="24H">Last 24 Hours</option>
          <option value="7D">Last 7 Days</option>
          <option value="30D">Last 30 Days</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <th className="p-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Timestamp</th>
              <th className="p-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Actor</th>
              <th className="p-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Action</th>
              <th className="p-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map(log => (
              <tr key={log.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="p-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="p-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                  {log.actor}
                </td>
                <td className="p-3 text-sm">
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs font-mono">
                    {log.action}
                  </span>
                </td>
                <td className="p-3 text-sm text-gray-600 dark:text-gray-400">
                  {log.details}
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No audit logs match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};