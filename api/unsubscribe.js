import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }

  const email = req.method === "GET" ? req.query.email : req.body?.email ?? req.query.email;
  if (!email) {
    return res.status(400).send("E-Mail-Adresse fehlt.");
  }

  const { error } = await supabase.from("subscribers").update({ active: false }).eq("email", email);
  if (error) {
    console.error("Unsubscribe failed:", error.message);
    return res.status(500).send("Abmeldung fehlgeschlagen.");
  }

  if (req.method === "POST") {
    // One-click unsubscribe (RFC 8058): mail clients expect a bare 200 OK.
    return res.status(200).end();
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Abgemeldet</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#1a1a1a;">
  <h1 style="font-size:20px;">Du wurdest abgemeldet</h1>
  <p style="color:#666;">${email} erhält den Marktbrief ab sofort nicht mehr.</p>
</body></html>`);
}
