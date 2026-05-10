import {
  FIREBASE_READY, getAuth_, getSellerProfile,
  addSellerProduct, fetchSellerProducts, fetchSellerOrdersFirebase,
  watchSellerOrders,
} from "./firebase.js";

// ── Зураг compress (Canvas API — Storage хэрэггүй) ───────────────────────
function compressImage(file, maxPx = 900, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale  = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Зураг уншиж чадсангүй")); };
    img.src = url;
  });
}
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const qs  = (sel, r = document) => r.querySelector(sel);
const fmt = (v) => `$${Number(v).toFixed(2)}`;

const STATUS = {
  pending:  { label: "Хүлээгдэж байна", cls: "pending" },
  approved: { label: "Зөвшөөрөгдсөн",   cls: "approved" },
  rejected: { label: "Татгалзсан",       cls: "rejected" },
};

function statusBadge(s) {
  const st = STATUS[s] || STATUS.pending;
  return `<span class="sellerStatus sellerStatus--${st.cls}">${st.label}</span>`;
}

// ── Nav ───────────────────────────────────────────────────────────────────
const PAGE_TITLES = {
  overview: "Хяналтын самбар",
  products: "Миний бараанууд",
  add:      "Шинэ бараа нэмэх",
};

function navigateTo(page) {
  document.querySelectorAll("[data-seller-page]").forEach(p => p.hidden = p.dataset.sellerPage !== page);
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("is-active", a.dataset.nav === page));
  const titleEl = qs("[data-page-title]");
  if (titleEl) titleEl.textContent = PAGE_TITLES[page] || page;
  const addBtn = qs("[data-open-add]");
  if (addBtn) addBtn.hidden = page !== "products";
  if (page === "products") loadProducts();
  if (page === "overview") loadOverview();
  if (page === "orders")   loadSellerOrders();
}

document.querySelectorAll("[data-nav]").forEach(el => {
  el.addEventListener("click", e => { e.preventDefault(); navigateTo(el.dataset.nav); });
});
qs("#menuToggle")?.addEventListener("click", () => qs("#sellerSide")?.classList.toggle("is-open"));
qs("[data-logout]")?.addEventListener("click", async () => {
  if (FIREBASE_READY) await signOut(getAuth_());
  window.location.href = "/seller";
});

// ── Products ──────────────────────────────────────────────────────────────
let _products = [];
let _currentUid = "";
let _sellerName = "";

async function loadProducts() {
  const tbody = qs("[data-products-tbody]");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="sellerTable__empty">Уншиж байна…</td></tr>`;

  try {
    _products = await fetchSellerProducts(_currentUid);
    renderProducts(_products);
    updateStats(_products);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="sellerTable__empty sellerTable__empty--error">${err.message}</td></tr>`;
  }
}

function renderProducts(products) {
  const tbody = qs("[data-products-tbody]");
  if (!tbody) return;
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="sellerTable__empty">
      Бараа байхгүй байна.
      <button style="margin-left:8px;color:var(--c-blue);background:none;border:0;cursor:pointer;font-weight:700" data-nav="add">Бараа нэмэх →</button>
    </td></tr>`;
    tbody.querySelector("[data-nav=add]")?.addEventListener("click", () => navigateTo("add"));
    return;
  }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td><img src="${p.imageUrl||''}" style="width:44px;height:44px;object-fit:cover;border:1px solid var(--border)" onerror="this.style.display='none'"/></td>
      <td><div style="font-weight:800;font-size:.88rem">${p.name}</div><div style="font-size:.74rem;color:rgba(16,16,16,.45)">${(p.description||'').slice(0,50)}</div></td>
      <td><span class="sellerBadge">${p.category||'—'}</span></td>
      <td><strong>${fmt(p.price)}</strong>${p.priceWas?`<br><span style="font-size:.76rem;text-decoration:line-through;color:rgba(16,16,16,.40)">${fmt(p.priceWas)}</span>`:''}</td>
      <td>${p.stockQty ?? '—'}</td>
      <td>${statusBadge(p.status)}</td>
      <td>
        <button class="sellerTable__delBtn" data-del="${p.id}" title="Устгах">🗑</button>
      </td>
    </tr>`).join("");
}

function updateStats(products) {
  const setText = (sel, v) => { const el = qs(sel); if (el) el.textContent = v; };
  setText("[data-stat-total]",    products.length);
  setText("[data-stat-pending]",  products.filter(p => p.status === "pending").length);
  setText("[data-stat-approved]", products.filter(p => p.status === "approved").length);
  setText("[data-stat-rejected]", products.filter(p => p.status === "rejected").length);
  setText("[data-products-count]", products.length);
}

// ── Orders ────────────────────────────────────────────────────────────────
async function loadSellerOrders() {
  const tbody = qs("[data-orders-tbody]");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="sellerTable__empty">Уншиж байна…</td></tr>`;
  try {
    const orders = await fetchSellerOrdersFirebase(_currentUid);
    qs("[data-orders-count]") && (qs("[data-orders-count]").textContent = orders.length);
    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="sellerTable__empty">Захиалга байхгүй байна</td></tr>`;
      return;
    }
    const STATUS_CLS   = { pending:"pending", processing:"pending", out_for_delivery:"pending", delivered:"approved", cancelled:"rejected" };
    const STATUS_LABEL = { pending:"🆕 Шинэ", processing:"⚙️ Боловсруулж байна", out_for_delivery:"🚚 Хүргэлтэнд", delivered:"✅ Хүргэгдсэн", cancelled:"❌ Цуцлагдсан" };
    tbody.innerHTML = orders.map(o => {
      const myItems  = (o.items || []).filter(i => i.sellerId === _currentUid);
      const myTotal  = myItems.reduce((s, i) => s + (i.price||0) * i.qty, 0);
      const date     = o.createdAt ? new Date(o.createdAt).toLocaleString("mn-MN") : "—";
      const cls      = STATUS_CLS[o.status]   || "pending";
      const label    = STATUS_LABEL[o.status] || o.status || "—";
      return `<tr>
        <td>
          <code style="font-size:.78rem;font-weight:700">${o.orderNumber||"—"}</code>
          <div style="font-size:.7rem;color:#94a3b8;margin-top:2px">${date}</div>
        </td>
        <td>
          <div style="font-weight:700">${o.customerName||"—"}</div>
          <div style="font-size:.74rem;color:#64748b">${o.phone||""}</div>
          <div style="font-size:.72rem;color:#94a3b8">${o.district||""}</div>
        </td>
        <td style="font-size:.8rem;max-width:200px;white-space:normal;line-height:1.5">
          ${myItems.map(i=>`<div>• <b>${i.name}</b> ×${i.qty} — <span style="color:#16a34a">$${((i.price||0)*i.qty).toFixed(2)}</span></div>`).join("")||"—"}
        </td>
        <td><strong style="font-size:.92rem;color:#16a34a">${fmt(myTotal)}</strong></td>
        <td><span class="sellerStatus sellerStatus--${cls}">${label}</span></td>
        <td style="font-size:.72rem;color:#64748b">${date.split(",")[0]||""}</td>
      </tr>`;
    }).join("");
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6" class="sellerTable__empty sellerTable__empty--error">Алдаа: ${e.message}</td></tr>`;
  }
}

async function loadOverview() {
  const tbody = qs("[data-overview-tbody]");
  if (!tbody) return;
  try {
    const products = await fetchSellerProducts(_currentUid);
    _products = products;
    updateStats(products);
    if (!products.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="sellerTable__empty">Бараа байхгүй байна.</td></tr>`;
      return;
    }
    tbody.innerHTML = products.slice(0, 5).map(p => `
      <tr>
        <td style="font-weight:700;font-size:.88rem">${p.name}</td>
        <td>${p.category||'—'}</td>
        <td>${fmt(p.price)}</td>
        <td>${statusBadge(p.status)}</td>
      </tr>`).join("");
  } catch {}
}

// ── Delete ────────────────────────────────────────────────────────────────
document.addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (!del) return;
  if (!confirm("Бараа устгах уу?")) return;
  try {
    const { deleteProduct } = await import("./firebase.js");
    await deleteProduct(del.dataset.del);
    _products = _products.filter(p => p.id !== del.dataset.del);
    renderProducts(_products);
    updateStats(_products);
  } catch (err) { alert("Устгаж чадсангүй: " + err.message); }
});

// ── Add product form ──────────────────────────────────────────────────────
const addForm = qs("[data-add-form]");
addForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f         = addForm;
  const errEl     = qs("[data-form-error]");
  const submitBtn = qs("[data-submit-btn]");
  const submitLbl = qs("[data-submit-label]");

  function showErr(msg) {
    errEl.removeAttribute("style");
    errEl.textContent = msg;
    errEl.hidden = false;
  }
  function showOk(msg) {
    errEl.style.cssText = "background:rgba(22,163,74,.08);border-color:rgba(22,163,74,.22);color:#15803d";
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  errEl.hidden = true;
  submitBtn.disabled = true;
  submitLbl.textContent = "Илгээж байна…";

  try {
    // Auth шалгах
    if (!_currentUid) {
      throw new Error("Нэвтрэх шаардлагатай. Хуудсаа refresh хийнэ үү.");
    }

    const tags = f.querySelector("[name=tags]").value
      .split(",").map(t => t.trim()).filter(Boolean);

    const categories = [...f.querySelectorAll("[name=categories]:checked")].map(c => c.value);

    const data = {
      name:         f.querySelector("[name=name]").value.trim(),
      category:     categories[0] || "",
      categories,
      price:        Number(f.querySelector("[name=price]").value) || 0,
      priceWas:     Number(f.querySelector("[name=priceWas]").value) || 0,
      stockQty:     Number(f.querySelector("[name=stockQty]").value) || 0,
      description:  f.querySelector("[name=description]").value.trim(),
      imageUrl:     f.querySelector("[name=imageUrl]").value.trim() || "",
      deliveryType: f.querySelector("[name=deliveryType]").value || "",
      tags,
    };

    if (!data.name)            throw new Error("Барааны нэрийг оруулна уу.");
    if (!categories.length)    throw new Error("Дор хаяж нэг ангилал сонгоно уу.");
    if (!data.price)       throw new Error("Үнийг оруулна уу.");
    if (!data.description) throw new Error("Тайлбар оруулна уу.");

    // Зураг — Canvas-аар compress хийж base64 болгоно (Storage хэрэггүй)
    const fileInput = f.querySelector("[data-img-file]");
    if (fileInput?.files?.[0]) {
      try {
        submitLbl.textContent = "Зураг боловсруулж байна…";
        data.imageUrl = await compressImage(fileInput.files[0]);
      } catch (upErr) {
        console.warn("Image compress failed:", upErr);
        data.imageUrl = "";
      }
    }

    submitLbl.textContent = "Илгээж байна…";

    // 15 секундийн timeout
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("Хугацаа дууслаа (15с). Интернэт холболт шалгана уу.")), 15000)
    );

    await Promise.race([
      addSellerProduct(_currentUid, _sellerName, data),
      timeout,
    ]);

    f.reset();
    const imgPrev = qs("[data-img-preview]");
    if (imgPrev) imgPrev.hidden = true;
    const imgLbl = qs("[data-img-label]");
    if (imgLbl) imgLbl.textContent = "📷 Upload";

    showOk("✓ Амжилттай илгээгдлээ! Admin зөвшөөрсний дараа сайтад харагдана.");
    setTimeout(() => { errEl.hidden = true; navigateTo("products"); }, 2500);

  } catch (err) {
    console.error("Submit error:", err.code, err.message, err);
    const msg = err.code === "permission-denied"
      ? "Зөвшөөрөл байхгүй байна. Firestore Rules-г шалгана уу."
      : err.message || err.code || "Тодорхойгүй алдаа";
    showErr("❌ Алдаа: " + msg);
  } finally {
    submitBtn.disabled = false;
    submitLbl.textContent = "Илгээх (баталгаажуулалт хүлэх)";
  }
});

// Зураг сонгоход preview + compress хийж харуулна
qs("[data-img-file]")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const lbl = qs("[data-img-label]");
  if (lbl) lbl.textContent = "⏳ Боловсруулж байна…";
  try {
    const compressed = await compressImage(file);
    const preview    = qs("[data-img-preview]");
    const img        = qs("[data-img-preview-img]");
    if (preview && img) { img.src = compressed; preview.hidden = false; }
    const urlInput = qs("[data-img-url]");
    if (urlInput) urlInput.value = "";
    if (lbl) lbl.textContent = `✓ ${file.name}`;
  } catch {
    if (lbl) lbl.textContent = "❌ Уншиж чадсангүй";
  }
});

// ── Auth guard ────────────────────────────────────────────────────────────
function initAuth() {
  if (!FIREBASE_READY) {
    qs("[data-seller-gate]").hidden = false;
    return;
  }

  // Loading indicator
  const gate = qs("[data-seller-gate]");
  if (gate) {
    gate.hidden = false;
    const box = gate.querySelector(".sellerGate__box");
    if (box) box.innerHTML = `<div class="sellerGate__icon">⏳</div><p class="sellerGate__msg">Нэвтэрч байна…</p>`;
  }

  const unsubscribe = onAuthStateChanged(getAuth_(), async (user) => {
    if (!user) {
      window.location.href = "/seller";
      return;
    }

    // Seller profile-г унших — алдаа гарсан ч хориглохгүй (rules асуудалтай байж болно)
    let seller = await getSellerProfile(user.uid).catch(() => null);

    // Profile байхгүй бол displayName-аас үүсгэнэ
    if (!seller) {
      seller = {
        shopName: user.displayName || user.email?.split("@")[0] || "Дэлгүүр",
        email:    user.email || "",
        approved: true,
      };
    }

    _currentUid = user.uid;
    _sellerName = seller.shopName || user.displayName || "Seller";

    if (gate) gate.hidden = true;

    const shopEl  = qs("[data-shop-name]");
    const emailEl = qs("[data-seller-email]");
    const initEl  = qs("[data-seller-initial]");
    if (shopEl)  shopEl.textContent  = _sellerName;
    if (emailEl) emailEl.textContent = user.email || "";
    if (initEl)  initEl.textContent  = _sellerName[0].toUpperCase();

    navigateTo("overview");
    unsubscribe();

    // Real-time захиалга сонсогч
    let _knownOrderIds = null;
    watchSellerOrders(user.uid, (orders, changes) => {
      // Badge шинэчлэх
      const countEl = qs("[data-orders-count]");
      if (countEl) countEl.textContent = orders.length;

      // Эхний ачааллыг алгасаж зөвхөн шинэ захиалга ирэхэд мэдэгдэнэ
      if (_knownOrderIds === null) {
        _knownOrderIds = new Set(orders.map(o => o.id));
        return;
      }
      const newOrders = changes.filter(c => c.type === "added" && !_knownOrderIds.has(c.doc.id));
      newOrders.forEach(c => {
        _knownOrderIds.add(c.doc.id);
        const o = c.doc.data();
        showNotification(`🛒 Шинэ захиалга! ${o.orderNumber || ""}`, `${o.customerName || "Хэрэглэгч"} захиалга хийлээ`);
      });

      // Захиалга хуудсанд байвал жагсаалт шинэчлэх
      if (!qs("[data-seller-page='orders']")?.hidden) loadSellerOrders();
    });
  });
}

function showNotification(title, body) {
  // In-app toast
  const toast = document.createElement("div");
  toast.style.cssText = `
    position:fixed;top:20px;right:20px;z-index:9999;
    background:#0f172a;color:#fff;
    padding:14px 18px;border-radius:10px;
    box-shadow:0 8px 32px rgba(0,0,0,.28);
    font-size:.88rem;font-weight:700;
    display:flex;flex-direction:column;gap:4px;
    max-width:300px;cursor:pointer;
    animation:slideIn .3s ease;
  `;
  toast.innerHTML = `<span style="font-size:1rem">${title}</span><span style="font-weight:500;opacity:.75">${body}</span>`;
  toast.onclick = () => { navigateTo("orders"); toast.remove(); };
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);

  // Browser notification (хэрэглэгч зөвшөөрсөн бол)
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission();
  }
}

initAuth();
