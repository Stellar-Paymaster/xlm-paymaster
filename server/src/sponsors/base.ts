export interface SponsorResponse {
  tx: string;
  status: "ready" | "submitted";
  hash?: string;
  feePayer: string;
  submittedVia?: string;
}

export interface FeeSponsor {
  estimateFee(params: any): Promise<bigint>;
  buildSponsoredTx(params: any): Promise<SponsorResponse>;
}
