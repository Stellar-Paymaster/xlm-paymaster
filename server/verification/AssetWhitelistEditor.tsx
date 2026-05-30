import React, { useState } from 'react';

export interface WhitelistedAsset {
  id: string;
  code: string;
  issuer: string;
  sponsored: boolean;
}

export const AssetWhitelistEditor: React.FC = () => {
  const [assets, setAssets] = useState<WhitelistedAsset[]>([
    { id: '1', code: 'USDC', issuer: 'GA5ZSEJYB37JRC52ZMRKPBIGV7OWH27AKBM6OAWERO3U3EE3X4Y5M6H5', sponsored: true },
    { id: '2', code: 'XLM', issuer: 'native', sponsored: false },
  ]);

  const [form, setForm] = useState({ code: '', issuer: '' });
  const [error, setError] = useState<string | null>(null);

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) {
      setError('Asset code is required.');
      return;
    }
    
    const formattedCode = form.code.trim().toUpperCase();
    const formattedIssuer = form.issuer.trim() || 'native';

    // Check for duplicates
    const isDuplicate = assets.some(
      (a) => a.code === formattedCode && a.issuer === formattedIssuer
    );
    
    if (isDuplicate) {
      setError('This asset is already in the whitelist.');
      return;
    }

    const newAsset: WhitelistedAsset = {
      id: crypto.randomUUID(),
      code: formattedCode,
      issuer: formattedIssuer,
      sponsored: false,
    };

    setAssets([...assets, newAsset]);
    setForm({ code: '', issuer: '' });
    setError(null);
  };

  const handleToggleSponsorship = (id: string) => {
    setAssets(assets.map(asset => 
      asset.id === id ? { ...asset, sponsored: !asset.sponsored } : asset
    ));
  };

  const handleRemoveAsset = (id: string) => {
    setAssets(assets.filter(asset => asset.id !== id));
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-900 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Asset Whitelist Editor</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100 rounded" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleAddAsset} className="flex flex-col sm:flex-row gap-4 mb-6">
        <input
          type="text"
          placeholder="Asset Code (e.g., USDC)"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className="flex-1 p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          aria-label="Asset Code"
        />
        <input
          type="text"
          placeholder="Issuer PublicKey (leave blank for native)"
          value={form.issuer}
          onChange={(e) => setForm({ ...form, issuer: e.target.value })}
          className="flex-2 p-2 border rounded w-full sm:w-auto dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          aria-label="Issuer Public Key"
        />
        <button 
          type="submit" 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          Add Asset
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b dark:border-gray-700">
              <th className="p-3 text-gray-600 dark:text-gray-300">Code</th>
              <th className="p-3 text-gray-600 dark:text-gray-300">Issuer</th>
              <th className="p-3 text-gray-600 dark:text-gray-300 text-center">Sponsored</th>
              <th className="p-3 text-gray-600 dark:text-gray-300 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="p-3 font-medium text-gray-800 dark:text-gray-200">{asset.code}</td>
                <td className="p-3 text-sm text-gray-500 dark:text-gray-400 font-mono truncate max-w-xs" title={asset.issuer}>
                  {asset.issuer}
                </td>
                <td className="p-3 text-center">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={asset.sponsored}
                      onChange={() => handleToggleSponsorship(asset.id)}
                      className="sr-only peer"
                      aria-label={`Toggle sponsorship for ${asset.code}`}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => handleRemoveAsset(asset.id)}
                    className="text-red-500 hover:text-red-700 focus:outline-none focus:underline"
                    aria-label={`Remove ${asset.code}`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500 dark:text-gray-400">
                  No assets whitelisted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};