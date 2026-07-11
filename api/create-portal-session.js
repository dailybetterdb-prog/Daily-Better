import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const origin = req.headers.origin || process.env.PUBLIC_URL || "https://daily-better-jade.vercel.app";
  const { sessionId } = req.body ?? {};
  const accessToken = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

  try {
    let customerId;

    if (sessionId) {
      // Right after checkout: the Stripe session id itself proves ownership.
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      customerId = session.customer;
    } else if (accessToken) {
      // Logged in via Supabase Auth: verify the token server-side, never trust a client-supplied email.
      const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
      if (userError || !userData?.user?.email) {
        return res.status(401).json({ error: "Nicht angemeldet." });
      }
      const customers = await stripe.customers.list({ email: userData.user.email, limit: 1 });
      if (customers.data.length === 0) {
        return res.status(404).json({ error: "Kein Abo mit dieser E-Mail-Adresse gefunden." });
      }
      customerId = customers.data[0].id;
    } else {
      return res.status(401).json({ error: "Anmeldung erforderlich." });
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
