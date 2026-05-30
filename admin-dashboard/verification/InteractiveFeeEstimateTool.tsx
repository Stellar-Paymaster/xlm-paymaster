import React, { useState, useMemo } from 'react';

export const InteractiveFeeEstimateTool: React.FC = () => {
  const [baseFee, setBaseFee] = useState<number>(100);
  const [instructions, setInstructions] = useState<number>(2000000);
  const [readBytes, setReadBytes] = useState<number>(4096);
  const [writeBytes, setWriteBytes] = useState<number>(1024);
  const [surgeMultiplier, setSurgeMultiplier] = useState<number>(1.5);

  const { resourceFee, totalStroops, totalXlm } = useMemo(() => {
    // Simulated heuristic coefficients for Soroban resource pricing
    const cpuCost = instructions * 0.0001;
    const readCost = readBytes * 0.1;
    const writeCost = writeBytes * 0.5;
    
    const resourceFee = Math.floor(cpuCost + readCost + writeCost);
    const baseTotal = baseFee + resourceFee;
    const totalStroops = Math.floor(baseTotal * surgeMultiplier);
    
    return {
      resourceFee,
      totalStroops,
      totalXlm: (totalStroops / 10_000_000).toFixed(7)
    };
  }, [baseFee, instructions, readBytes, writeBytes, surgeMultiplier]);

  return (
    <div className="p-6 bg-white dark:bg-gray-900 rounded-lg shadow w-full max-w-2xl">
      <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">Interactive Fee Estimate Tool</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Simulate Soroban resource costs and fee-bump dynamics.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Base Network Fee (stroops)
          </label>
          <input
            type="number"
            min="100"
            value={baseFee}
            onChange={(e) => setBaseFee(Number(e.target.value) || 0)}
            className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            aria-label="Base Network Fee"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Surge Multiplier (Fee Bump)
          </label>
          <input
            type="number"
            step="0.1"
            min="1"
            value={surgeMultiplier}
            onChange={(e) => setSurgeMultiplier(Number(e.target.value) || 1)}
            className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            aria-label="Surge Multiplier"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            CPU Instructions
          </label>
          <input
            type="number"
            min="0"
            step="1000"
            value={instructions}
            onChange={(e) => setInstructions(Number(e.target.value) || 0)}
            className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            aria-label="CPU Instructions"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Read (Bytes)
            </label>
            <input
              type="number"
              min="0"
              value={readBytes}
              onChange={(e) => setReadBytes(Number(e.target.value) || 0)}
              className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              aria-label="Read Bytes"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Write (Bytes)
            </label>
            <input
              type="number"
              min="0"
              value={writeBytes}
              onChange={(e) => setWriteBytes(Number(e.target.value) || 0)}
              className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              aria-label="Write Bytes"
            />
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-3">Estimated Total Cost</h3>
        <div className="flex justify-between items-center border-b dark:border-gray-700 pb-2 mb-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">Resource Fee:</span>
          <span className="font-mono text-gray-800 dark:text-gray-200">{resourceFee.toLocaleString()} stroops</span>
        </div>
        <div className="flex justify-between items-center border-b dark:border-gray-700 pb-2 mb-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">Subtotal (Base + Resource):</span>
          <span className="font-mono text-gray-800 dark:text-gray-200">{(baseFee + resourceFee).toLocaleString()} stroops</span>
        </div>
        <div className="flex justify-between items-center text-sm mb-4">
          <span className="text-gray-600 dark:text-gray-400">With {surgeMultiplier}x Surge (Fee Bump):</span>
          <span className="font-mono font-semibold text-gray-900 dark:text-white">{totalStroops.toLocaleString()} stroops</span>
        </div>
        
        <div className="mt-4 pt-4 border-t dark:border-gray-700 flex justify-between items-center">
          <span className="text-gray-800 dark:text-gray-200 font-semibold text-lg">Final XLM:</span>
          <span className="text-blue-600 dark:text-blue-400 font-mono font-bold text-xl" data-testid="total-xlm">{totalXlm} XLM</span>
        </div>
      </div>
    </div>
  );
};