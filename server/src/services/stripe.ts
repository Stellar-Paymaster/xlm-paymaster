import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is required");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Maps USD amount in cents to the XLM quota top-up in stroops (1 XLM = 10_000_000 stroops)
// Pricing tiers: $5 → 100 XLM, $20 → 500 XLM, $50 → 1500 XLM
export const TOP_UP_TIERS: Record<number, { label: string; quotaStroops: number }> = {
  500:  { label: "$5 — 100 XLM",   quotaStroops: 100  * 10_000_000 },
  2000: { label: "$20 — 500 XLM",  quotaStroops: 500  * 10_000_000 },
  5000: { label: "$50 — 1500 XLM", quotaStroops: 1500 * 10_000_000 },
};

export async function createCheckoutSession(
  tenantId: string,
  amountCents: number,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const tier = TOP_UP_TIERS[amountCents];
  if (!tier) {
    throw new Error(`Invalid top-up amount: ${amountCents} cents`);
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: { name: `Paymaster Quota Top-up — ${tier.label}` },
        },
        quantity: 1,
      },
    ],
    metadata: { tenantId, amountCents: String(amountCents) },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return session.url!;
}
