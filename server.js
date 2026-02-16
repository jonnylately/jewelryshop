import express from "express";
import dotenv from "dotenv";
import Stripe from "stripe";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOMAIN = process.env.DOMAIN || "http://localhost:4242";

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY in environment.");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(express.static(path.join(__dirname, "public")));

/**
 * Creates a Stripe Checkout Session and returns session.url to the client.
 * Based on Stripe Checkout Sessions: create on server, redirect to session URL. :contentReference[oaicite:1]{index=1}
 */
// POST /create-checkout-session
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { items } = req.body; // [{ priceId, quantity }]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Missing items[]" });
    }

    const line_items = items.map((it) => ({
      price: String(it.priceId),
      quantity: Math.max(1, Math.min(99, Number(it.quantity || 1))),
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      shipping_address_collection: { allowed_countries: ["GB", "IE"] },
      success_url: `${process.env.DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN}/cancel.html`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message || "Server error" });
  }
});

    // Minimal validation/sanitization
    const line_items = items.map((it) => {
      const name = String(it.name || "").slice(0, 100);
      const description = String(it.description || "").slice(0, 200);
      const quantity = Math.max(1, Math.min(99, Number(it.quantity || 1)));

      // amount in minor units (pence for GBP)
      const unit_amount = Number(it.unit_amount);
      if (!Number.isInteger(unit_amount) || unit_amount < 50) {
        throw new Error("Invalid unit_amount (must be integer minor units, >= 50).");
      }

      return {
        quantity,
        price_data: {
          currency: "gbp",
          unit_amount,
          product_data: {
            name,
            description
          }
        }
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,

      // Collect shipping address for physical goods
      shipping_address_collection: { allowed_countries: ["GB", "IE"] },

      success_url: `${DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${DOMAIN}/cancel.html`
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

/**
 * Used by success.html to display basic confirmation details.
 * Stripe recommends looking up the Checkout Session using the session_id template. :contentReference[oaicite:2]{index=2}
 */
app.get("/session-status", async (req, res) => {
  try {
    const session_id = String(req.query.session_id || "");
    if (!session_id.startsWith("cs_")) {
      return res.status(400).json({ error: "Invalid session_id" });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    res.json({
      status: session.status,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email || null,
      amount_total: session.amount_total,
      currency: session.currency
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`Running on ${DOMAIN} (port ${PORT})`);
});
