import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (chunk) => chunks.push(chunk));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const rawBody = await buffer(req);
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature invalid:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const email = session.customer_details?.email ?? session.customer_email;
        const subscription = await stripe.subscriptions.retrieve(session.subscription);

        const { error: upsertError } = await supabase.from("subscribers").upsert(
          {
            email,
            stripe_customer_id: session.customer,
            stripe_subscription_id: subscription.id,
            active: subscription.status === "active" || subscription.status === "trialing",
            plan: subscription.items.data[0]?.price?.id,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" }
        );
        if (upsertError) throw new Error(`Supabase upsert failed: ${upsertError.message}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const { error: updateError } = await supabase
          .from("subscribers")
          .update({
            active: subscription.status === "active" || subscription.status === "trialing",
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);
        if (updateError) throw new Error(`Supabase update failed: ${updateError.message}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const { error: deleteError } = await supabase
          .from("subscribers")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subscription.id);
        if (deleteError) throw new Error(`Supabase update failed: ${deleteError.message}`);
        break;
      }

      default:
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}
