"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type FieldErrors = Partial<
  Record<"email" | "projectName" | "intendedUse" | "acceptTos", string[]>
>;

export default function SignUpPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [projectName, setProjectName] = useState("");
  const [intendedUse, setIntendedUse] = useState("");
  const [acceptTos, setAcceptTos] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setServerError("");
    setFieldErrors({});

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          projectName,
          intendedUse,
          acceptTos,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details) {
          setFieldErrors(data.details as FieldErrors);
        } else {
          setServerError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      setSubmitted(true);
    } catch {
      setServerError("Could not connect to the server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-green-100">
            <svg className="h-9 w-9 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Check your inbox</h2>
            <p className="mt-2 text-gray-600">
              We sent a verification link to <strong>{email}</strong>.<br />
              Click it to receive your Fluid API key.
            </p>
          </div>
          <p className="text-sm text-gray-500">
            Didn&apos;t get it?{" "}
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="text-blue-600 hover:underline"
            >
              Try again
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-100">
            <svg className="h-7 w-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Get started with Fluid
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Create your account and receive an API key instantly.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={isLoading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-50"
              placeholder="you@example.com"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.email[0]}</p>
            )}
          </div>

          {/* Project name */}
          <div>
            <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-1">
              Project name
            </label>
            <input
              id="projectName"
              name="projectName"
              type="text"
              required
              disabled={isLoading}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-50"
              placeholder="My Stellar App"
            />
            {fieldErrors.projectName && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.projectName[0]}</p>
            )}
          </div>

          {/* Intended use */}
          <div>
            <label htmlFor="intendedUse" className="block text-sm font-medium text-gray-700 mb-1">
              How do you plan to use Fluid?
            </label>
            <textarea
              id="intendedUse"
              name="intendedUse"
              rows={3}
              required
              disabled={isLoading}
              value={intendedUse}
              onChange={(e) => setIntendedUse(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-50 resize-none"
              placeholder="e.g. Sponsoring fees for users of my Stellar DEX integration"
            />
            {fieldErrors.intendedUse && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.intendedUse[0]}</p>
            )}
          </div>

          {/* Server error banner */}
          {serverError && (
            <div className="rounded-md bg-red-50 p-3 flex gap-2 items-start">
              <svg className="h-4 w-4 text-red-500 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700">{serverError}</p>
            </div>
          )}

          <div>
            <label className="flex items-start gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                name="acceptTos"
                checked={acceptTos}
                onChange={(e) => setAcceptTos(e.target.checked)}
                disabled={isLoading}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                required
              />
              <span>
                I accept the Terms of Service.
              </span>
            </label>
            {fieldErrors.acceptTos && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.acceptTos[0]}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Sending verification email…
              </>
            ) : (
              "Create account"
            )}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
