export interface CosmosGranter {
  id: string;
  chainId: string;
  name: string;
  rpcUrl: string;
  prefix: string;
  denom: string;
  enabled: boolean;
  granterAddress: string | null;
  hasMnemonic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CosmosAllowance {
  id: string;
  granterId: string;
  granteeAddr: string;
  allowanceType: string;
  spendLimit: string | null;
  expiration: string | null;
  periodSeconds: number | null;
  periodLimit: string | null;
  txHash: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CosmosFeegrantPageData {
  granters: CosmosGranter[];
  source: "live" | "sample";
}

const SAMPLE_GRANTERS: CosmosGranter[] = [
  {
    id: "cg_001",
    chainId: "theta-testnet-001",
    name: "Cosmos Hub Testnet",
    rpcUrl: "https://rpc.sentry-01.theta-testnet.polypore.xyz:443",
    prefix: "cosmos",
    denom: "uatom",
    enabled: true,
    granterAddress: "cosmos1abc...xyz",
    hasMnemonic: true,
    createdAt: "2024-03-28T10:00:00Z",
    updatedAt: "2024-03-28T10:00:00Z",
  },
  {
    id: "cg_002",
    chainId: "osmo-test-5",
    name: "Osmosis Testnet",
    rpcUrl: "https://rpc.testnet.osmosis.zone:443",
    prefix: "osmo",
    denom: "uosmo",
    enabled: false,
    granterAddress: null,
    hasMnemonic: false,
    createdAt: "2024-03-27T14:00:00Z",
    updatedAt: "2024-03-27T14:00:00Z",
  },
];

function getBaseUrl() {
  const value = process.env.PAYMASTER_SERVER_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

function getAdminToken() {
  const value = process.env.PAYMASTER_ADMIN_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
}

export async function getCosmosFeegrantData(): Promise<CosmosFeegrantPageData> {
  const baseUrl = getBaseUrl();
  const token = getAdminToken();

  if (baseUrl && token) {
    try {
      const res = await fetch(`${baseUrl}/admin/cosmos/granters`, {
        headers: { "x-admin-token": token },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        return { granters: data.granters, source: "live" };
      }
    } catch {
      // fall through to sample
    }
  }

  return { granters: SAMPLE_GRANTERS, source: "sample" };
}
