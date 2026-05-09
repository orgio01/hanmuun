import express from "express";
import path from "node:path";
import { openDb, migrate, seed } from "./db.js";
import { ok, badRequest, notFound, makeId, makeOrderNumber } from "./utils.js";

const PORT       = process.env.PORT       ? Number(process.env.PORT) : 3000;
const ADMIN_KEY  = process.env.ADMIN_KEY  || "hanmun-admin-secret-2026"; // .env-д заавал өөрчил!
const app = express();

const db = openDb();
migrate(db);
seed(db);

app.use(express.json({ limit: "2mb" }));

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Basic rate limit — IP-ийн /api/ хүсэлтийг хязгаарлах
const _rateLimitMap = new Map();
app.use("/api/", (req, res, next) => {
  const ip  = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const win = 60_000; // 1 минут
  const max = 300;    // 1 минутэд 300 хүсэлт
  const entry = _rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > win) { entry.count = 0; entry.start = now; }
  entry.count++;
  _rateLimitMap.set(ip, entry);
  if (entry.count > max) return res.status(429).json({ error: { message: "Хэт олон хүсэлт. 1 минут хүлээнэ үү." } });
  next();
});

function moneyFromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

function mapProductRow(row, extra = {}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: moneyFromCents(row.price_cents),
    priceWas: row.compare_at_cents != null ? moneyFromCents(row.compare_at_cents) : null,
    imageUrl: row.image_url,
    category: row.category,
    tags: row.tags ? row.tags.split(",") : [],
    stockQty: row.stock_qty,
    ...extra,
  };
}

// ---------- API ----------

app.get("/api/sections", (req, res) => {
  const rows = db
    .prepare(
      `
      select
        c.key as section_key,
        c.sort_order,
        c.ends_at,
        p.*
      from collections c
      join products p on p.id = c.product_id
      where p.is_active = 1
      order by c.key asc, c.sort_order asc
    `,
    )
    .all();

  const out = { deals: [], limited: [], fast: [], intl: [] };

  for (const r of rows) {
    const endsAtMs = r.ends_at ? new Date(r.ends_at).getTime() : null;
    const badgeByKey = {
      deals: { badge: "Deal", badgeTone: "accent" },
      limited: { badge: "Ends soon", badgeTone: "warn" },
      fast: { badge: "Fast", badgeTone: "ok" },
      intl: { badge: "Worldwide", badgeTone: "accent" },
    };

    const b = badgeByKey[r.section_key] || {};
    const product = mapProductRow(r, {
      badge: b.badge,
      badgeTone: b.badgeTone,
      endsAt: endsAtMs,
    });

    if (out[r.section_key]) out[r.section_key].push(product);
  }

  ok(res, out);
});

app.get("/api/products/:id", (req, res) => {
  const row = db
    .prepare("select * from products where id = ? and is_active = 1")
    .get(req.params.id);
  if (!row) return notFound(res, "Product not found");
  ok(res, mapProductRow(row));
});

app.get("/api/products", (req, res) => {
  const category = String(req.query.category || "").trim();
  const rows = category
    ? db.prepare("select * from products where is_active = 1 and lower(category) = lower(?) order by created_at desc").all(category)
    : db.prepare("select * from products where is_active = 1 order by created_at desc").all();
  ok(res, { items: rows.map((r) => mapProductRow(r)) });
});

// Cart model: client generates a cartId and sends it.
function ensureCart(cartId) {
  const existing = db.prepare("select id from carts where id = ?").get(cartId);
  if (existing) return;
  db.prepare("insert into carts (id, created_at) values (?, ?)").run(cartId, new Date().toISOString());
}

app.get("/api/cart", (req, res) => {
  const cartId = String(req.query.cartId || "");
  if (!cartId) return badRequest(res, "cartId is required");

  ensureCart(cartId);

  const items = db
    .prepare(
      `
      select
        ci.id as cart_item_id,
        ci.qty,
        p.*
      from cart_items ci
      join products p on p.id = ci.product_id
      where ci.cart_id = ?
      order by ci.id asc
    `,
    )
    .all(cartId)
    .map((r) => ({
      id: r.cart_item_id,
      qty: r.qty,
      product: mapProductRow(r),
    }));

  ok(res, { cartId, items });
});

app.post("/api/cart/items", (req, res) => {
  const { cartId, productId, qty } = req.body || {};
  if (!cartId || !productId) return badRequest(res, "cartId and productId are required");
  const q = Number(qty ?? 1);
  if (!Number.isFinite(q) || q < 1) return badRequest(res, "qty must be >= 1");

  const product = db.prepare("select id, stock_qty from products where id = ? and is_active = 1").get(productId);
  if (!product) return notFound(res, "Product not found");
  if (product.stock_qty < q) return badRequest(res, "Not enough stock");

  ensureCart(cartId);

  const upsert = db.prepare(`
    insert into cart_items (cart_id, product_id, qty)
    values (@cart_id, @product_id, @qty)
    on conflict(cart_id, product_id) do update set qty = qty + excluded.qty
  `);

  upsert.run({ cart_id: cartId, product_id: productId, qty: q });
  ok(res, { ok: true });
});

app.patch("/api/cart/items/:id", (req, res) => {
  const cartId = String(req.body?.cartId || "");
  const qty = Number(req.body?.qty);
  const cartItemId = Number(req.params.id);
  if (!cartId) return badRequest(res, "cartId is required");
  if (!Number.isFinite(cartItemId)) return badRequest(res, "invalid cart item id");
  if (!Number.isFinite(qty) || qty < 1) return badRequest(res, "qty must be >= 1");

  const item = db
    .prepare("select product_id from cart_items where id = ? and cart_id = ?")
    .get(cartItemId, cartId);
  if (!item) return notFound(res, "Cart item not found");

  const product = db.prepare("select stock_qty from products where id = ?").get(item.product_id);
  if (!product) return badRequest(res, "Product no longer available");
  if (product.stock_qty < qty) return badRequest(res, "Not enough stock");

  db.prepare("update cart_items set qty = ? where id = ? and cart_id = ?").run(qty, cartItemId, cartId);
  ok(res, { ok: true });
});

app.delete("/api/cart/items/:id", (req, res) => {
  const cartId = String(req.query.cartId || "");
  const cartItemId = Number(req.params.id);
  if (!cartId) return badRequest(res, "cartId is required");
  if (!Number.isFinite(cartItemId)) return badRequest(res, "invalid cart item id");

  db.prepare("delete from cart_items where id = ? and cart_id = ?").run(cartItemId, cartId);
  ok(res, { ok: true });
});

// ---------- Delivery rules (UB) ----------

function calcDelivery({ district, speed }) {
  const normalized = String(district || "").trim().toLowerCase();
  const isCentral =
    normalized.includes("sukhbaatar") ||
    normalized.includes("chингэлтэй") ||
    normalized.includes("chingeltei") ||
    normalized.includes("bayangol") ||
    normalized.includes("баянгол") ||
    normalized.includes("bayan") ||
    normalized.includes("khan-uul") ||
    normalized.includes("хан-уул") ||
    normalized.includes("bayanzurkh") ||
    normalized.includes("баянзүрх");

  // cents-based fees (kept small for MVP demo)
  const base = isCentral ? 250 : 350;
  const fastExtra = isCentral ? 150 : 200;

  const s = speed === "fast" ? "fast" : "standard";
  const fee = s === "fast" ? base + fastExtra : base;
  const eta = s === "fast" ? "Same/next day" : "24–48h";
  return { fee_cents: fee, eta };
}

// Checkout creates an order and clears cart items.
app.post("/api/checkout", (req, res) => {
  const body = req.body || {};
  const cartId = String(body.cartId || "");
  const customerName = String(body.customerName || "").trim();
  const phone = String(body.phone || "").trim();
  const addressLine = String(body.addressLine || "").trim();
  const district = String(body.district || "").trim();
  const notes = body.notes ? String(body.notes) : null;
  const paymentMethod = String(body.paymentMethod || "mock").trim();
  const deliverySpeed = String(body.deliverySpeed || "standard").trim();

  if (!cartId) return badRequest(res, "cartId is required");
  if (!customerName) return badRequest(res, "customerName is required");
  if (!phone) return badRequest(res, "phone is required");
  if (!addressLine) return badRequest(res, "addressLine is required");
  if (!district) return badRequest(res, "district is required");

  const cartItems = db
    .prepare(
      `
      select
        ci.id as cart_item_id,
        ci.qty,
        p.*
      from cart_items ci
      join products p on p.id = ci.product_id
      where ci.cart_id = ? and p.is_active = 1
    `,
    )
    .all(cartId);

  if (!cartItems.length) return badRequest(res, "Cart is empty");

  // stock check
  for (const i of cartItems) {
    if (i.stock_qty < i.qty) {
      return badRequest(res, `Not enough stock for ${i.name}`);
    }
  }

  const subtotalCents = cartItems.reduce((sum, i) => sum + i.price_cents * i.qty, 0);
  const delivery = calcDelivery({ district, speed: deliverySpeed });
  const totalCents = subtotalCents + delivery.fee_cents;

  const orderId = makeId("order");
  const orderNumber = makeOrderNumber();
  const ts = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      `
      insert into orders (
        id, order_number, status,
        subtotal_cents, delivery_fee_cents, total_cents,
        customer_name, phone, address_line, district, notes,
        payment_method, payment_status,
        created_at, updated_at
      ) values (
        @id, @order_number, @status,
        @subtotal_cents, @delivery_fee_cents, @total_cents,
        @customer_name, @phone, @address_line, @district, @notes,
        @payment_method, @payment_status,
        @created_at, @updated_at
      )
    `,
    ).run({
      id: orderId,
      order_number: orderNumber,
      status: "awaiting_payment",
      subtotal_cents: subtotalCents,
      delivery_fee_cents: delivery.fee_cents,
      total_cents: totalCents,
      customer_name: customerName,
      phone,
      address_line: addressLine,
      district,
      notes,
      payment_method: paymentMethod,
      payment_status: "unpaid",
      created_at: ts,
      updated_at: ts,
    });

    const insertItem = db.prepare(
      `
      insert into order_items (order_id, product_id, name_snapshot, price_cents_snapshot, qty)
      values (@order_id, @product_id, @name_snapshot, @price_cents_snapshot, @qty)
    `,
    );

    const updateStock = db.prepare("update products set stock_qty = stock_qty - ? , updated_at = ? where id = ?");

    for (const i of cartItems) {
      insertItem.run({
        order_id: orderId,
        product_id: i.id,
        name_snapshot: i.name,
        price_cents_snapshot: i.price_cents,
        qty: i.qty,
      });
      updateStock.run(i.qty, ts, i.id);
    }

    db.prepare(
      "insert into shipments (order_id, shipping_status, eta, updated_at) values (?, ?, ?, ?)",
    ).run(orderId, "pending", delivery.eta, ts);

    db.prepare("delete from cart_items where cart_id = ?").run(cartId);
  });

  tx();

  ok(res, {
    orderNumber,
    paymentStatus: "unpaid",
    next: { confirmMockPaymentUrl: `/api/payments/mock/confirm` },
  });
});

app.post("/api/payments/mock/confirm", (req, res) => {
  const orderNumber = String(req.body?.orderNumber || "");
  if (!orderNumber) return badRequest(res, "orderNumber is required");

  const order = db.prepare("select id, status, payment_status from orders where order_number = ?").get(orderNumber);
  if (!order) return notFound(res, "Order not found");

  const ts = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("update orders set payment_status = 'paid', status = 'processing', updated_at = ? where id = ?").run(ts, order.id);
    db.prepare("update shipments set updated_at = ? where order_id = ?").run(ts, order.id);
  });
  tx();

  ok(res, { ok: true, orderNumber });
});

app.get("/api/orders/:orderNumber", (req, res) => {
  const orderNumber = String(req.params.orderNumber || "");
  const order = db
    .prepare(
      `
      select
        o.*,
        s.shipping_status,
        s.eta
      from orders o
      left join shipments s on s.order_id = o.id
      where o.order_number = ?
    `,
    )
    .get(orderNumber);

  if (!order) return notFound(res, "Order not found");

  const items = db
    .prepare("select product_id, name_snapshot, price_cents_snapshot, qty from order_items where order_id = ?")
    .all(order.id)
    .map((i) => ({
      productId: i.product_id,
      name: i.name_snapshot,
      price: moneyFromCents(i.price_cents_snapshot),
      qty: i.qty,
    }));

  ok(res, {
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    totals: {
      subtotal: moneyFromCents(order.subtotal_cents),
      deliveryFee: moneyFromCents(order.delivery_fee_cents),
      total: moneyFromCents(order.total_cents),
    },
    customer: {
      name: order.customer_name,
      phone: order.phone,
      addressLine: order.address_line,
      district: order.district,
      notes: order.notes,
    },
    shipment: {
      status: order.shipping_status,
      eta: order.eta,
    },
    items,
    createdAt: order.created_at,
  });
});

// ---------- Admin API middleware (secret key шалгах) ----------
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query["adminKey"];
  if (key === ADMIN_KEY) return next();
  return res.status(403).json({ error: { message: "Admin эрх байхгүй" } });
}

// ---------- Admin: all orders list ----------
app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    select o.order_number, o.status, o.payment_status, o.customer_name, o.phone,
           o.address_line, o.district, o.payment_method,
           o.subtotal_cents, o.delivery_fee_cents, o.total_cents,
           o.created_at, s.shipping_status, s.eta
    from orders o
    left join shipments s on s.order_id = o.id
    order by o.created_at desc
    limit 200
  `).all();
  ok(res, { orders: rows.map(r => ({
    orderNumber:   r.order_number,
    status:        r.status,
    paymentStatus: r.payment_status,
    paymentMethod: r.payment_method || "—",
    customer: { name: r.customer_name, phone: r.phone, addressLine: r.address_line, district: r.district },
    totals: {
      subtotal:    moneyFromCents(r.subtotal_cents),
      deliveryFee: moneyFromCents(r.delivery_fee_cents),
      total:       moneyFromCents(r.total_cents),
    },
    shipment:      { status: r.shipping_status, eta: r.eta },
    createdAt:     r.created_at,
  })) });
});

// ---------- Admin: update order status ----------
const STATUS_FLOW = {
  processing:       { shipStatus: "processing",  label: "Боловсруулж байна"  },
  out_for_delivery: { shipStatus: "in_transit",  label: "Хүргэлтэнд гарсан" },
  delivered:        { shipStatus: "delivered",   label: "Хүргэгдсэн"         },
  cancelled:        { shipStatus: "cancelled",   label: "Цуцлагдсан"         },
};

app.patch("/api/admin/orders/:orderNumber/status", requireAdmin, (req, res) => {
  const { orderNumber } = req.params;
  const { status } = req.body || {};
  if (!STATUS_FLOW[status]) return badRequest(res, "Буруу статус");
  const order = db.prepare("select id from orders where order_number = ?").get(orderNumber);
  if (!order) return notFound(res, "Захиалга олдсонгүй");
  const ts = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("update orders set status = ?, updated_at = ? where id = ?").run(status, ts, order.id);
    db.prepare("update shipments set shipping_status = ?, updated_at = ? where order_id = ?")
      .run(STATUS_FLOW[status].shipStatus, ts, order.id);
  });
  tx();
  ok(res, { ok: true, orderNumber, status, label: STATUS_FLOW[status].label });
});

// ---------- Static frontend ----------
const PUBLIC_DIR = path.resolve(process.cwd());

// Clean URL routes — must come BEFORE express.static
app.get("/",               (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.get("/product/:id",    (req, res) => res.sendFile(path.join(PUBLIC_DIR, "product.html")));
app.get("/category/:name", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "category.html")));
app.get("/section/:key",   (req, res) => res.sendFile(path.join(PUBLIC_DIR, "category.html")));
app.get("/admin",            (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));
app.get("/seller",           (req, res) => res.sendFile(path.join(PUBLIC_DIR, "seller.html")));
app.get("/seller/dashboard", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "seller-dashboard.html")));
app.get("/order-success", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "order-success.html")));
app.get("/my-orders",    (req, res) => res.sendFile(path.join(PUBLIC_DIR, "my-orders.html")));
app.get("/wishlist",     (req, res) => res.sendFile(path.join(PUBLIC_DIR, "wishlist.html")));

app.use(express.static(PUBLIC_DIR));

// API 404
app.use("/api/", (req, res) => notFound(res));

// Frontend 404 — index.html буцаана (SPA fallback)
app.use((req, res) => {
  if (req.accepts("html")) {
    res.status(404).sendFile(path.join(PUBLIC_DIR, "index.html"));
  } else {
    notFound(res);
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});

