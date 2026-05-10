import express from "express";
import path from "node:path";
import {
  cartItems, upsertCartItem, removeCartItem, clearCart,
  createOrder, getAllOrders, getOrder, updateOrderStatus,
} from "./db.js";
import { ok, badRequest, notFound, makeId, makeOrderNumber } from "./utils.js";

const PORT      = process.env.PORT      ? Number(process.env.PORT) : 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "hanmun-admin-secret-2026";
const app = express();

app.use(express.json({ limit: "2mb" }));

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-admin-key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Rate limit
const _rl = new Map();
app.use("/api/", (req, res, next) => {
  const ip = req.ip || "x";
  const now = Date.now();
  const e = _rl.get(ip) || { c: 0, t: now };
  if (now - e.t > 60000) { e.c = 0; e.t = now; }
  e.c++;
  _rl.set(ip, e);
  if (e.c > 300) return res.status(429).json({ error: { message: "Хэт олон хүсэлт." } });
  next();
});

function moneyFromCents(cents) { return Number((cents / 100).toFixed(2)); }

// ── Cart ──────────────────────────────────────────────────────────────────
app.get("/api/cart", (req, res) => {
  const cartId = String(req.query.cartId || "");
  if (!cartId) return badRequest(res, "cartId required");
  const items = cartItems(cartId).map(({ productId, qty }) => ({
    id: productId, qty, product: { id: productId }
  }));
  ok(res, { cartId, items });
});

app.post("/api/cart/items", (req, res) => {
  const { cartId, productId, qty } = req.body || {};
  if (!cartId || !productId) return badRequest(res, "cartId and productId required");
  const q = Math.max(1, Math.min(99, Number(qty) || 1));
  upsertCartItem(cartId, productId, q);
  ok(res, { ok: true });
});

app.patch("/api/cart/items/:id", (req, res) => {
  const { cartId, qty } = req.body || {};
  const productId = req.params.id;
  if (!cartId) return badRequest(res, "cartId required");
  const q = Number(qty);
  if (!Number.isFinite(q) || q < 1) return badRequest(res, "qty >= 1");
  upsertCartItem(cartId, productId, q);
  ok(res, { ok: true });
});

app.delete("/api/cart/items/:id", (req, res) => {
  const cartId = String(req.query.cartId || "");
  const productId = req.params.id;
  if (!cartId) return badRequest(res, "cartId required");
  removeCartItem(cartId, productId);
  ok(res, { ok: true });
});

// ── Delivery calc ─────────────────────────────────────────────────────────
function calcDelivery({ district, speed }) {
  const d = String(district || "").toLowerCase();
  const central = ["sukhbaatar","chingeltei","bayangol","khan-uul","bayanzurkh","баянгол","хан-уул","баянзүрх"].some(k => d.includes(k));
  const base = central ? 250 : 350;
  const fee = speed === "fast" ? base + (central ? 150 : 200) : base;
  const eta = speed === "fast" ? "Өнөөдөр / маргааш" : "24–48 цаг";
  return { fee_cents: fee, eta };
}

// ── Checkout ──────────────────────────────────────────────────────────────
app.post("/api/checkout", (req, res) => {
  const { cartId, customerName, phone, addressLine, district, notes, paymentMethod, deliverySpeed } = req.body || {};
  if (!cartId || !customerName || !phone || !addressLine || !district)
    return badRequest(res, "Required fields missing");

  const items = cartItems(cartId);
  if (!items.length) return badRequest(res, "Cart is empty");

  const delivery = calcDelivery({ district, speed: deliverySpeed || "standard" });
  const subtotalCents = 0; // products in Firebase, price unknown server-side
  const totalCents = subtotalCents + delivery.fee_cents;

  const order = createOrder({
    cartId, customerName, phone, addressLine, district,
    notes: notes || "", paymentMethod: paymentMethod || "mock",
    subtotalCents, deliveryFeeCents: delivery.fee_cents, totalCents,
    eta: delivery.eta,
    items: items.map(i => ({ productId: i.productId, qty: i.qty })),
  });

  clearCart(cartId);
  ok(res, { orderNumber: order.orderNumber, paymentStatus: "unpaid" });
});

app.post("/api/payments/mock/confirm", (req, res) => {
  const orderNumber = String(req.body?.orderNumber || "");
  if (!orderNumber) return badRequest(res, "orderNumber required");
  const order = getOrder(orderNumber);
  if (!order) return notFound(res, "Order not found");
  updateOrderStatus(orderNumber, "processing");
  ok(res, { ok: true, orderNumber });
});

app.get("/api/orders/:orderNumber", (req, res) => {
  const order = getOrder(req.params.orderNumber);
  if (!order) return notFound(res, "Order not found");
  ok(res, {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totals: { subtotal: moneyFromCents(order.subtotalCents), deliveryFee: moneyFromCents(order.deliveryFeeCents), total: moneyFromCents(order.totalCents) },
    customer: { name: order.customerName, phone: order.phone, addressLine: order.addressLine, district: order.district, notes: order.notes },
    shipment: { status: order.status, eta: order.eta },
    items: order.items || [],
    createdAt: order.createdAt,
  });
});

// ── Admin ─────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query["adminKey"];
  if (key === ADMIN_KEY) return next();
  return res.status(403).json({ error: { message: "Admin эрх байхгүй" } });
}

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const orders = getAllOrders().map(o => ({
    orderNumber: o.orderNumber, status: o.status,
    paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod || "—",
    customer: { name: o.customerName, phone: o.phone, addressLine: o.addressLine, district: o.district },
    totals: { subtotal: moneyFromCents(o.subtotalCents), deliveryFee: moneyFromCents(o.deliveryFeeCents), total: moneyFromCents(o.totalCents) },
    shipment: { status: o.status, eta: o.eta },
    createdAt: o.createdAt,
  }));
  ok(res, { orders });
});

const STATUS_FLOW = {
  processing:       "Боловсруулж байна",
  out_for_delivery: "Хүргэлтэнд гарсан",
  delivered:        "Хүргэгдсэн",
  cancelled:        "Цуцлагдсан",
};

app.patch("/api/admin/orders/:orderNumber/status", requireAdmin, (req, res) => {
  const { orderNumber } = req.params;
  const { status } = req.body || {};
  if (!STATUS_FLOW[status]) return badRequest(res, "Буруу статус");
  const updated = updateOrderStatus(orderNumber, status);
  if (!updated) return notFound(res, "Захиалга олдсонгүй");
  ok(res, { ok: true, orderNumber, status, label: STATUS_FLOW[status] });
});

// ── Static files ──────────────────────────────────────────────────────────
const PUBLIC_DIR = path.resolve(process.cwd());

app.get("/",               (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.get("/product/:id",    (req, res) => res.sendFile(path.join(PUBLIC_DIR, "product.html")));
app.get("/category/:name", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "category.html")));
app.get("/section/:key",   (req, res) => res.sendFile(path.join(PUBLIC_DIR, "category.html")));
app.get("/admin",          (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));
app.get("/seller",         (req, res) => res.sendFile(path.join(PUBLIC_DIR, "seller.html")));
app.get("/seller/dashboard",(req,res) => res.sendFile(path.join(PUBLIC_DIR, "seller-dashboard.html")));
app.get("/order-success",  (req, res) => res.sendFile(path.join(PUBLIC_DIR, "order-success.html")));
app.get("/my-orders",      (req, res) => res.sendFile(path.join(PUBLIC_DIR, "my-orders.html")));
app.get("/wishlist",       (req, res) => res.sendFile(path.join(PUBLIC_DIR, "wishlist.html")));

app.use(express.static(PUBLIC_DIR));
app.use("/api/", (req, res) => notFound(res));

app.listen(PORT, () => {
  console.log(`HANMUN server running on port ${PORT}`);
  // Keep Render free tier awake — ping self every 14 min
  import("node:http").then(({ default: http }) => {
    setInterval(() => {
      try { http.get(`http://localhost:${PORT}/`); } catch {}
    }, 14 * 60 * 1000);
  });
});
