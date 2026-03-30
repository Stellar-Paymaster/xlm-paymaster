"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type VerifyState = "loading" | "success" | "error";

interface VerifyResult {
  apiKey: string;
  tenantId: string;
  projectName: string;
  email: string;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 px-3 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<VerifyState>("loading");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const calledRef = useRef(false);

  useEffect(() => {
    if (!token || calledRef.current) return;
    calledRef.current = true;

    async function verify() {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          setErrorMessage(data.error ?? "Verification failed.");
          setState("error");
          return;
        }

        setResult(data as VerifyResult);
        setState("success");
      } catch {
        setErrorMessage("Could not connect to the server. Please try again.");
        setState("error");
      }
    }

    void verify();
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">Invalid link</h2>
          <p className="text-gray-600">No verification token found. Please use the link from your email.</p>
          <Link href="/signup" className="text-blue-600 hover:underline text-sm">
            Back to sign up
          </Link>
        </div>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <svg className="animate-spin mx-auto h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-600 font-medium">Verifying your email…</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-red-100">
            <svg className="h-9 w-9 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Verification failed</h2>
            <p className="mt-2 text-gray-600">{errorMessage}</p>
          </div>
          <Link
            href="/signup"
            className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Sign up again
          </Link>
        </div>
      </div>
    );
  }

  // success
  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? "https://docs.fluid.dev";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-lg w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-green-100">
            <svg className="h-9 w-9 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-5 text-2xl font-bold text-gray-900">
            Welcome, {result!.projectName}!
          </h2>
          <p className="mt-1 text-gray-600">
            Your account is ready. Here is your API key — save it somewhere safe.
          </p>
        </div>

        {/* API Key card */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              API Key
            </p>
            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
              <code className="flex-1 text-sm font-mono text-gray-800 break-all">
                {result!.apiKey}
              </code>
              <CopyButton value={result!.apiKey} />
            </div>
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
              This key is shown <strong>only once</strong>. Copy it now — you won&apos;t be able to retrieve it later.
            </p>
          </div>

          <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Tenant ID</p>
              <p className="font-mono text-gray-700 text-xs truncate">{result!.tenantId}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Tier</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Free
              </span>
            </div>
          </div>
        </div>

        {/* Quick-start snippet */}
        <div className="bg-gray-900 rounded-xl p-4 space-y-2">
          <p className="text-xs text-gray-400 font-medium">Quick start</p>
          <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
{`curl -X POST https://your-fluid-server.example.com/fee-bump \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${result!.apiKey}" \\
  -d '{"xdr":"<signed-tx-xdr>","submit":false}'`}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center px-4 py-2.5 border border-blue-600 text-blue-600 text-sm font-medium rounded-md hover:bg-blue-50 transition-colors"
          >
            Read the docs
          </a>
          <Link
            href="/login"
            className="flex-1 text-center px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center space-y-4">
            <svg className="animate-spin mx-auto h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-600 font-medium">Loading verification…</p>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
