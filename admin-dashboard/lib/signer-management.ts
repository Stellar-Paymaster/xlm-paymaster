import "server-only";

import type { DashboardSignerStatus } from "@/components/dashboard/types";

export interface ManagedSigner {
  publicKey: string;
  balance: string;
  status: DashboardSignerStatus;
  inFlight: number;
  totalUses: number;
  sequenceNumber: string;
  source: "env" | "db" | "vault";
  canRemove: boolean;
}

export interface SignerManagementPageData {
  signers: ManagedSigner[];
  source: "live" | "sample";
  addEnabled: boolean;
}

interface SignersApiResponse {
  signers: Array<{
    publicKey: string;
    balance: string | null;
    status: DashboardSignerStatus;
    inFlight: number;
    totalUses: number;
    sequenceNumber: string | null;
    source: "env" | "db" | "vault";
    canRemove: boolean;
  }>;
}

const SAMPLE_SIGNERS: ManagedSigner[] = [
  {
    publicKey: "GDQP3KPQGKIHYJGXNUIYOMHARUARCA6QK4F6GZOPFOVS4Q7JH4L6NK7K",
    balance: "128.40 XLM",
    status: "Active",
    inFlight: 2,
    totalUses: 184,
    sequenceNumber: "5420194330214400",
    source: "env",
    canRemove: false,
  },
  {
    publicKey: "GC4YVSVKQK2R3BRQ6WBC6VR7P3CGZ7S2D6WQKIFMK5AQL6C2L2Q5P4K2",
    balance: "62.91 XLM",
    status: "Active",
    inFlight: 0,
    totalUses: 117,
    sequenceNumber: "5420194330214411",
    source: "db",
    canRemove: true,
  },
  {
    publicKey: "GBA2B5DM4QUQ3R4JZPSYLAF5A34Q6VQW2UM3M7LQFPA7MS5QVCQY6Q75",
    balance: "3.40 XLM",
    status: "Low Balance",
    inFlight: 1,
    totalUses: 36,
    sequenceNumber: "5420194330214423",
    source: "db",
    canRemove: true,
  },
];

function getServerUrl() {
  return process.env.PAYMASTER_SERVER_URL?.trim().replace(/\/$/, "") || null;
}

function getAdminToken() {
  return process.env.PAYMASTER_ADMIN_TOKEN?.trim() || null;
}

function normalizeBalance(value: string | null) {
  return value || "Unavailable";
}

export async function getSignerManagementPageData(): Promise<SignerManagementPageData> {
  const serverUrl = getServerUrl();
  const adminToken = getAdminToken();

  if (!serverUrl || !adminToken) {
    return {
      signers: SAMPLE_SIGNERS,
      source: "sample",
      addEnabled: false,
    };
  }

  try {
    const response = await fetch(`${serverUrl}/admin/signers`, {
      cache: "no-store",
      headers: {
        "x-admin-token": adminToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    const data = (await response.json()) as SignersApiResponse;

    return {
      signers: data.signers.map((signer) => ({
        ...signer,
        balance: normalizeBalance(signer.balance),
        sequenceNumber: signer.sequenceNumber || "Unavailable",
      })),
      source: "live",
      addEnabled: true,
    };
  } catch {
    return {
      signers: SAMPLE_SIGNERS,
      source: "sample",
      addEnabled: false,
    };
  }
}
