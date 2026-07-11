import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const origin = req.headers.origin || process.env.PUBLIC_URL || "https://daily-better-jade.vercel.app";
  const { sessionId, email } = req.body ?? {};

  try {
    let customerId;

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      customerId = session.customer;
    } else if (email) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length === 0) {
        return res.status(404).json({ error: "Kein Abo mit dieser E-Mail-Adresse gefunden." });
      }
      customerId = customers.data[0].id;
    } else {
      return res.status(400).json({ error: "sessionId oder email erforderlich." });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/`
    });

    res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error("Portal session error:", err);
    res.status(500).json({ error: "Kundenportal konnte nicht geöffnet werden." });
  }
}
