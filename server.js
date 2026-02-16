import express from "express";
import dotenv from "dotenv";
import Stripe from "stripe";
import cors from "cors";

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://jonnylately.github.io";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

// Explicitly handle preflight for all routes
app.options("*", cors({ origin: FRONTEND_ORIGIN }));

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}

// DOMAIN should be your GitHub Pages base URL, e.g. https://USERNAME.github.io/REPO
if (!process.env.DOMAIN) {
  console.error("Missing DOMAIN (e.g. https://USERNAME.github.io/REPO)");
  process.exit(1);
}

const app = express();
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// FRONTEND_ORIGIN should be the origin only, e.g. https://USERNAME.github.io
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { items } = req.body; // [{ priceId, quantity }]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Missing items[]" });
    }

    const line_items = items.map((it) => {
      const priceId = String(it.priceId || "");
      if (!priceId.startsWith("price_")) throw new Error("Invalid priceId");

      const quantity = Math.max(1, Math.min(99, Number(it.quantity || 1)));
      return { price: priceId, quantity };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      shipping_address_collection: { allowed_countries: ["GB", "IE"] },
      success_url: `${process.env.DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN}/cancel.html`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

app.get("/session-status", async (req, res) => {
  try {
    const session_id = String(req.query.session_id || "");
    if (!session_id.startsWith("cs_")) {
      return res.status(400).json({ error: "Invalid session_id" });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    return res.json({
      status: session.status,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email || null,
      amount_total: session.amount_total,
      currency: session.currency,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
