// Performance test to verify 60fps UI responsiveness during heavy signing operations
// This test demonstrates that Web Workers keep the main thread responsive

import { PaymasterClient } from '../index';
import StellarSdk from '@stellar/stellar-sdk';

interface PerformanceMetrics {
  frameDrops: number;
  averageFrameTime: number;
  maxFrameTime: number;
  signingTime: number;
  totalTransactions: number;
  workerUsed: boolean;
}

export class PerformanceTest {
  private client: PaymasterClient;
  private frameMetrics: number[] = [];
  private isRunning = false;
  private animationId?: number;

  constructor(useWorker: boolean = true) {
    this.client = new PaymasterClient({
      serverUrl: 'http://localhost:3000', // Mock server URL
      networkPassphrase: StellarSdk.Networks.TESTNET,
      horizonUrl: 'https://horizon-testnet.stellar.org',
      useWorker
    });
  }

  // Create mock transactions for testing
  private createMockTransactions(count: number): any[] {
    const transactions = [];
    const keypair = StellarSdk.Keypair.random();
    
    for (let i = 0; i < count; i++) {
      // Create a mock account
      const account = new StellarSdk.Account(keypair.publicKey(), '1');
      
      // Build a complex transaction
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: StellarSdk.Keypair.random().publicKey(),
            asset: StellarSdk.Asset.native(),
            amount: '1',
          })
        )
        .addOperation(
          StellarSdk.Operation.payment({
            destination: StellarSdk.Keypair.random().publicKey(),
            asset: StellarSdk.Asset.native(),
            amount: '0.5',
          })
        )
        .setTimeout(180)
        .build();
      
      transactions.push(transaction);
    }
    
    return transactions;
  }

  // Monitor frame rate
  private startFrameMonitoring(): void {
    let lastFrameTime = performance.now();
    
    const monitorFrame = (currentTime: number) => {
      if (!this.isRunning) return;
      
      const frameTime = currentTime - lastFrameTime;
      this.frameMetrics.push(frameTime);
      lastFrameTime = currentTime;
      
      // Update UI with frame metrics
      this.updateFrameDisplay(frameTime);
      
      this.animationId = requestAnimationFrame(monitorFrame);
    };
    
    this.animationId = requestAnimationFrame(monitorFrame);
  }

  private updateFrameDisplay(frameTime: number): void {
    const fps = 1000 / frameTime;
    const statusElement = document.getElementById('fps-status');
    const frameTimeElement = document.getElementById('frame-time');
    
    if (statusElement) {
      statusElement.textContent = `FPS: ${fps.toFixed(1)}`;
      statusElement.style.color = fps >= 55 ? 'green' : fps >= 30 ? 'orange' : 'red';
    }
    
    if (frameTimeElement) {
      frameTimeElement.textContent = `Frame Time: ${frameTime.toFixed(2)}ms`;
    }
  }

  // Run the performance test
  async runPerformanceTest(transactionCount: number = 100): Promise<PerformanceMetrics> {
    console.log(`[PerformanceTest] Starting test with ${transactionCount} transactions`);
    
    this.isRunning = true;
    this.frameMetrics = [];
    
    // Start frame monitoring
    this.startFrameMonitoring();
    
    // Create mock transactions
    const transactions = this.createMockTransactions(transactionCount);
    const keypair = StellarSdk.Keypair.random();
    
    // Measure signing performance
    const signingStartTime = performance.now();
    
    try {
      // Sign transactions using the client
      await this.client.signMultipleTransactions(transactions, keypair);
    } catch (error) {
      console.warn('[PerformanceTest] Signing failed (expected in test environment):', error);
    }
    
    const signingEndTime = performance.now();
    const signingTime = signingEndTime - signingStartTime;
    
    // Stop frame monitoring
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    // Calculate metrics
    const metrics = this.calculateMetrics(signingTime, transactionCount);
    
    console.log('[PerformanceTest] Test completed:', metrics);
    return metrics;
  }

  private calculateMetrics(signingTime: number, transactionCount: number): PerformanceMetrics {
    if (this.frameMetrics.length === 0) {
      return {
        frameDrops: 0,
        averageFrameTime: 0,
        maxFrameTime: 0,
        signingTime,
        totalTransactions: transactionCount,
        workerUsed: this.client['useWorker']
      };
    }
    
    // 60fps = 16.67ms per frame
    const targetFrameTime = 16.67;
    const frameDrops = this.frameMetrics.filter(time => time > targetFrameTime * 1.5).length;
    const averageFrameTime = this.frameMetrics.reduce((a, b) => a + b, 0) / this.frameMetrics.length;
    const maxFrameTime = Math.max(...this.frameMetrics);
    
    return {
      frameDrops,
      averageFrameTime,
      maxFrameTime,
      signingTime,
      totalTransactions: transactionCount,
      workerUsed: this.client['useWorker']
    };
  }

  // Compare performance with and without worker
  async runComparisonTest(transactionCount: number = 100): Promise<{ withWorker: PerformanceMetrics; withoutWorker: PerformanceMetrics }> {
    console.log('[PerformanceTest] Running comparison test...');
    
    // Test with worker
    const clientWithWorker = new PerformanceTest(true);
    const withWorkerMetrics = await clientWithWorker.runPerformanceTest(transactionCount);
    clientWithWorker.terminate();
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test without worker
    const clientWithoutWorker = new PerformanceTest(false);
    const withoutWorkerMetrics = await clientWithoutWorker.runPerformanceTest(transactionCount);
    clientWithoutWorker.terminate();
    
    return { withWorker: withWorkerMetrics, withoutWorker: withoutWorkerMetrics };
  }

  terminate(): void {
    this.client.terminate();
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}

// HTML interface for the performance test
export function createPerformanceTestUI(): void {
  const body = document.body;
  
  const container = document.createElement('div');
  container.innerHTML = `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
      <h1>Paymaster Client Performance Test</h1>
      <p>This test verifies that Web Workers maintain 60fps UI responsiveness during heavy signing operations.</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3>Real-time Performance</h3>
        <div id="fps-status" style="font-size: 24px; font-weight: bold; color: green;">FPS: --</div>
        <div id="frame-time" style="font-size: 18px; margin-top: 10px;">Frame Time: --</div>
      </div>
      
      <div style="margin: 20px 0;">
        <label for="transaction-count">Number of Transactions:</label>
        <input type="number" id="transaction-count" value="100" min="10" max="1000" step="10" style="margin-left: 10px; padding: 5px;">
      </div>
      
      <div style="margin: 20px 0;">
        <button id="run-single-test" style="padding: 10px 20px; margin-right: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Run Test (With Worker)
        </button>
        <button id="run-comparison-test" style="padding: 10px 20px; margin-right: 10px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Run Comparison Test
        </button>
        <button id="clear-results" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Clear Results
        </button>
      </div>
      
      <div id="results" style="background: #e9ecef; padding: 15px; border-radius: 8px; margin-top: 20px; display: none;">
        <h3>Test Results</h3>
        <div id="results-content"></div>
      </div>
      
      <div style="margin-top: 20px; font-size: 14px; color: #666;">
        <p><strong>Instructions:</strong></p>
        <ul>
          <li>Open Chrome DevTools and go to the Performance tab</li>
          <li>Start recording before running the test</li>
          <li>Run the test and observe the UI remains responsive</li>
          <li>Stop recording and analyze the performance profile</li>
          <li>The main thread should remain idle while signing happens in the worker</li>
        </ul>
      </div>
    </div>
  `;
  
  body.appendChild(container);
  
  // Add event listeners
  const runSingleTest = document.getElementById('run-single-test');
  const runComparisonTest = document.getElementById('run-comparison-test');
  const clearResults = document.getElementById('clear-results');
  
  if (runSingleTest) {
    runSingleTest.addEventListener('click', async () => {
      const transactionCount = parseInt((document.getElementById('transaction-count') as HTMLInputElement).value);
      const test = new PerformanceTest(true);
      
      try {
        const metrics = await test.runPerformanceTest(transactionCount);
        displayResults({ withWorker: metrics, withoutWorker: null });
      } finally {
        test.terminate();
      }
    });
  }
  
  if (runComparisonTest) {
    runComparisonTest.addEventListener('click', async () => {
      const transactionCount = parseInt((document.getElementById('transaction-count') as HTMLInputElement).value);
      const test = new PerformanceTest(true);
      
      try {
        const results = await test.runComparisonTest(transactionCount);
        displayResults(results);
      } finally {
        test.terminate();
      }
    });
  }
  
  if (clearResults) {
    clearResults.addEventListener('click', () => {
      const resultsDiv = document.getElementById('results');
      const resultsContent = document.getElementById('results-content');
      if (resultsDiv) resultsDiv.style.display = 'none';
      if (resultsContent) resultsContent.innerHTML = '';
    });
  }
}

function displayResults(results: { withWorker: PerformanceMetrics; withoutWorker: PerformanceMetrics | null }): void {
  const resultsDiv = document.getElementById('results');
  const resultsContent = document.getElementById('results-content');
  
  if (!resultsDiv || !resultsContent) return;
  
  let html = '';
  
  // Display with worker results
  html += '<h4>With Web Worker:</h4>';
  html += `<ul>
    <li>Frame Drops: ${results.withWorker.frameDrops}</li>
    <li>Average Frame Time: ${results.withWorker.averageFrameTime.toFixed(2)}ms</li>
    <li>Max Frame Time: ${results.withWorker.maxFrameTime.toFixed(2)}ms</li>
    <li>Signing Time: ${results.withWorker.signingTime.toFixed(2)}ms</li>
    <li>Transactions: ${results.withWorker.totalTransactions}</li>
  </ul>`;
  
  // Display without worker results if available
  if (results.withoutWorker) {
    html += '<h4>Without Web Worker:</h4>';
    html += `<ul>
      <li>Frame Drops: ${results.withoutWorker.frameDrops}</li>
      <li>Average Frame Time: ${results.withoutWorker.averageFrameTime.toFixed(2)}ms</li>
      <li>Max Frame Time: ${results.withoutWorker.maxFrameTime.toFixed(2)}ms</li>
      <li>Signing Time: ${results.withoutWorker.signingTime.toFixed(2)}ms</li>
      <li>Transactions: ${results.withoutWorker.totalTransactions}</li>
    </ul>`;
    
    // Calculate improvement
    const frameDropImprovement = results.withoutWorker.frameDrops - results.withWorker.frameDrops;
    const frameTimeImprovement = results.withoutWorker.averageFrameTime - results.withWorker.averageFrameTime;
    
    html += '<h4>Improvement with Web Worker:</h4>';
    html += `<ul>
      <li>Frame Drops Reduced: ${frameDropImprovement}</li>
      <li>Average Frame Time Improved: ${frameTimeImprovement.toFixed(2)}ms</li>
      <li>Performance Gain: ${((frameTimeImprovement / results.withoutWorker.averageFrameTime) * 100).toFixed(1)}%</li>
    </ul>`;
  }
  
  resultsContent.innerHTML = html;
  resultsDiv.style.display = 'block';
}

// Export for use in browser
if (typeof window !== 'undefined') {
  (window as any).PerformanceTest = PerformanceTest;
  (window as any).createPerformanceTestUI = createPerformanceTestUI;
}
