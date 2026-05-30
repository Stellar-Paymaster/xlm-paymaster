import { 
  FluidClient, 
  FluidClientConfig, 
  FeeBumpResponse, 
  FeeBumpRequestInput, 
  WaitForConfirmationOptions 
} from "../FluidClient";

/**
 * A mock version of FluidClient for testing purposes.
 * It simulates network calls and returns predefined or randomized responses.
 */
export class FluidMockClient extends FluidClient {
  private mockResponses: Map<string, any> = new Map();
  private submissionHistory: any[] = [];

  constructor(config: Partial<FluidClientConfig> = {}) {
    super({
      networkPassphrase: "Test SDF Network ; September 2015",
      serverUrl: "http://mock-fluid-server.test",
      ...config as any
    });
  }

  /**
   * Sets a custom mock response for a specific path or operation.
   */
  setMockResponse(key: string, response: any): void {
    this.mockResponses.set(key, response);
  }

  /**
   * Returns the history of transactions "submitted" through this client.
   */
  getSubmissionHistory(): any[] {
    return this.submissionHistory;
  }

  override async requestFeeBump(
    transaction: FeeBumpRequestInput,
    submit = false
  ): Promise<FeeBumpResponse> {
    const xdr = typeof transaction === "string" ? transaction : transaction.toXDR();
    
    if (this.mockResponses.has("requestFeeBump")) {
      return this.mockResponses.get("requestFeeBump");
    }

    const response: FeeBumpResponse = {
      xdr: xdr, // In a real scenario, this would be the fee-bumped XDR
      status: submit ? "submitted" : "ready",
      hash: "mock_hash_" + Math.random().toString(36).substring(7),
    };

    if (submit) {
      this.submissionHistory.push({ type: "fee-bump", xdr, hash: response.hash });
    }

    return response;
  }

  override async requestFeeBumpBatch(
    transactions: FeeBumpRequestInput[],
    submit = false
  ): Promise<FeeBumpResponse[]> {
    return Promise.all(transactions.map(t => this.requestFeeBump(t, submit)));
  }

  override async submitFeeBumpTransaction(feeBumpXdr: string): Promise<any> {
    const hash = "mock_hash_" + Math.random().toString(36).substring(7);
    this.submissionHistory.push({ type: "submit", xdr: feeBumpXdr, hash });
    
    return {
      hash,
      ledger: 12345,
      envelope_xdr: feeBumpXdr,
      result_xdr: "AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAA=",
      result_meta_xdr: "AAAAAgAAAAIAAAADAAAAAQAAAAAAAAAA",
    };
  }

  override async waitForConfirmation(
    hash: string,
    _timeoutMs?: number,
    options: WaitForConfirmationOptions = {}
  ): Promise<any> {
    if (this.mockResponses.has(`confirm_${hash}`)) {
      return this.mockResponses.get(`confirm_${hash}`);
    }

    // Simulate some progress
    if (options.onProgress) {
      options.onProgress({ hash, attempt: 1, elapsedMs: 100 });
    }

    return {
      id: hash,
      hash,
      ledger: 12346,
      created_at: new Date().toISOString(),
      source_account: "G...",
      successful: true,
    };
  }
}

/**
 * Utility to generate mock XDR strings for testing.
 */
export const createMockXdr = () => "AAAAAgAAAAD..........";

/**
 * Utility to generate a mock successful FeeBumpResponse.
 */
export const createMockFeeBumpResponse = (overrides: Partial<FeeBumpResponse> = {}): FeeBumpResponse => ({
  xdr: createMockXdr(),
  status: "ready",
  hash: "abc123hash",
  ...overrides
});
