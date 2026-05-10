import {
  FIREBASE_READY, fetchAllProducts, fetchAllUsers, setBanUser,
  addProduct, updateProduct, deleteProduct, uploadProductImage,
  fetchPendingProducts, setProductStatus,
  fetchAllBanners, saveBanner, deleteBanner,
  fetchAllSellers, approveSellerAccount,
  watchAllOrders,
} from "./firebase.js";
import { apiJson } from "./api.js";

// ── Config ────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = "blackzebra617@gmail.com";
const ADMIN_KEY   = "hanmun-admin-secret-2026";
function adminApi(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY, ...(opts.headers||{}) },
  }).then(async r => {
    const d = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(d?.error?.message || `Error ${r.status}`);
    return d;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────
const qs  = (sel, r = document) => r.querySelector(sel);
const qsa = (sel, r = document) => [...r.querySelectorAll(sel)];
const fmt = (v) => `$${Number(v).toFixed(2)}`;
const setText = (sel, v, r = document) => { const el = qs(sel, r); if (el) el.textContent = v; };

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

// ── Order status config ───────────────────────────────────────────────────
const ORDER_STATUSES = {
  pending:          { label: "Шинэ захиалга",        color: "blue"   },
  awaiting_payment: { label: "Төлбөр хүлээж байна",  color: "gray"   },
  processing:       { label: "Боловсруулж байна",     color: "blue"   },
  out_for_delivery: { label: "Хүргэлтэнд гарсан",    color: "orange" },
  delivered:        { label: "Хүргэгдсэн",            color: "green"  },
  cancelled:        { label: "Цуцлагдсан",            color: "red"    },
};

const NEXT_STATUS = {
  pending:          "processing",
  awaiting_payment: "processing",
  processing:       "out_for_delivery",
  out_for_delivery: "delivered",
};

const NEXT_LABEL = {
  pending:          "✓ Хүлээн авах",
  awaiting_payment: "✓ Хүлээн авах",
  processing:       "🚚 Хүргэлтэнд гаргах",
  out_for_delivery: "🏠 Хүргэгдсэн",
};

function statusBadge(status) {
  const s = ORDER_STATUSES[status] || { label: status, color: "gray" };
  return `<span class="adminBadge adminBadge--${s.color}">${s.label}</span>`;
}

// ── Auth ──────────────────────────────────────────────────────────────────
let _currentUser = null;

async function checkAuth() {
  if (!FIREBASE_READY) { showApp({ email: ADMIN_EMAIL, displayName: "Admin" }, null); return; }
  const { onAuth } = await import("./auth.js");
  onAuth((user, profile) => {
    if (user && user.email === ADMIN_EMAIL) {
      _currentUser = user;
      showApp(user, profile);
    } else if (user) {
      showGate("Энэ и-мэйл admin эрхгүй.");
    } else {
      showGate("");
    }
  });
}

function showGate(err) {
  qs("[data-auth-gate]").hidden = false;
  qsa("[data-admin-page]").forEach(p => p.hidden = true);
  if (err) { const el = qs("[data-gate-error]"); el.textContent = err; el.hidden = false; }
}

function showApp(user, profile) {
  qs("[data-auth-gate]").hidden = true;
  setText("[data-admin-name]",  profile?.name || user.displayName || "Admin");
  setText("[data-admin-email]", user.email || "");
  const av = qs("[data-admin-avatar]");
  if (av) av.textContent = (profile?.name || "A")[0].toUpperCase();
  navigateTo("dashboard");
  loadDashboard();
  startOrderWatcher();
}

let _adminKnownOrderIds = null;
function startOrderWatcher() {
  if (!FIREBASE_READY) return;
  watchAllOrders((orders, changes) => {
    // Badge шинэчлэх
    const countEl = qs("[data-orders-count]");
    if (countEl) countEl.textContent = orders.length;

    if (_adminKnownOrderIds === null) {
      _adminKnownOrderIds = new Set(orders.map(o => o.id));
      return;
    }
    const newOnes = changes.filter(c => c.type === "added" && !_adminKnownOrderIds.has(c.doc.id));
    newOnes.forEach(c => {
      _adminKnownOrderIds.add(c.doc.id);
      const o = c.doc.data();
      showAdminToast(`🛒 Шинэ захиалга: ${o.orderNumber || ""} — ${o.customerName || "Хэрэглэгч"}`, "ok");
    });

    // Захиалгын хуудсанд байвал шинэчлэх
    if (!qs("[data-admin-page='orders']")?.hidden) loadOrders();
  });
}

qs("[data-gate-login]")?.addEventListener("click", async () => {
  const email = qs("#gateEmail")?.value.trim();
  const pw    = qs("#gatePass")?.value;
  const btn   = qs("[data-gate-login]");
  const err   = qs("[data-gate-error]");
  err.hidden = true; btn.disabled = true; btn.textContent = "Нэвтэрж байна…";
  try {
    if (FIREBASE_READY) { const { signIn } = await import("./auth.js"); await signIn(email, pw); }
    else { if (email !== ADMIN_EMAIL) throw new Error("Admin эрхгүй"); showApp({ email, displayName: "Admin" }, null); }
  } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = "Нэвтрэх"; }
});

qs("[data-logout]")?.addEventListener("click", async () => {
  if (FIREBASE_READY) { const { logOut } = await import("./auth.js"); await logOut(); }
  window.location.reload();
});

// ── Navigation ────────────────────────────────────────────────────────────
const PAGE_TITLES = { dashboard: "Dashboard", products: "Бараа удирдлага", orders: "Захиалга удирдлага", sellers: "Seller удирдлага", users: "Хэрэглэгчид", banners: "Banner удирдлага", pending: "Зөвшөөрөл хүлэх" };

function navigateTo(page) {
  qsa("[data-admin-page]").forEach(p => p.hidden = p.dataset.adminPage !== page);
  qsa("[data-nav]").forEach(a => a.classList.toggle("is-active", a.dataset.nav === page));
  setText("[data-page-title]", PAGE_TITLES[page] || page);
  qs("[data-open-add-product]").hidden = page !== "products";
  if (page === "products") loadProducts();
  if (page === "orders")   loadOrders();
  if (page === "sellers")  loadSellers();
  if (page === "users")    loadUsers();
  if (page === "banners")  loadBanners();
  if (page === "pending")  loadPending();
}

qsa("[data-nav]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); navigateTo(a.dataset.nav); }));
qs("#menuToggle")?.addEventListener("click", () => qs("#adminSide")?.classList.toggle("is-open"));

// ── Dashboard ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const ps = await fetchAllProducts();
    setText("[data-stat-products]", ps.length);
    setText("[data-products-count]", ps.length);
    setText("[data-stat-lowstock]", ps.filter(p => p.stockQty <= 5).length);
  } catch {}

  // Seller pending products count
  try {
    const pending = await fetchPendingProducts();
    setText("[data-pending-count]", pending.length || "0");
  } catch {}

  // Pending seller requests
  try {
    const sellers = await fetchAllSellers();
    const pendingSellers = sellers.filter(s => !s.approved).length;
    setText("[data-sellers-badge]", pendingSellers || "");
  } catch {}
  try {
    const { orders } = await adminApi("/api/admin/orders");
    setText("[data-stat-orders]",  orders.length);
    setText("[data-orders-count]", orders.length);
    const revenue = orders.filter(o => o.paymentStatus === "paid").reduce((s, o) => s + o.totals.total, 0);
    setText("[data-stat-revenue]", fmt(revenue));
    const tbody = qs("[data-recent-orders-body]");
    if (tbody) {
      tbody.innerHTML = orders.slice(0, 5).map(o => `
        <tr>
          <td><code>${o.orderNumber}</code></td>
          <td>${o.customer?.name || "—"}</td>
          <td>${fmt(o.totals?.total || 0)}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${fmtDate(o.createdAt).slice(0,10)}</td>
        </tr>`).join("");
    }
  } catch {
    setText("[data-stat-orders]",  "—");
    setText("[data-stat-revenue]", "—");
    const tbody = qs("[data-recent-orders-body]");
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="adminTable__empty">Сервер offline</td></tr>`;
  }
}

// ── Products ──────────────────────────────────────────────────────────────
let _allProducts = [], _filteredProducts = [];

async function loadProducts() {
  const tbody = qs("[data-products-tbody]");
  tbody.innerHTML = `<tr><td colspan="6" class="adminTable__empty">Уншиж байна…</td></tr>`;
  try {
    _allProducts = await fetchAllProducts();
    _filteredProducts = _allProducts;
    renderProductsTable(_allProducts);
    setText("[data-products-count]", _allProducts.length);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="adminTable__empty adminTable__empty--error">${err.message}</td></tr>`;
  }
}

function renderProductsTable(products) {
  const tbody = qs("[data-products-tbody]");
  if (!products.length) { tbody.innerHTML = `<tr><td colspan="6" class="adminTable__empty">Бараа олдсонгүй</td></tr>`; return; }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td><img src="${p.imageUrl||''}" class="adminTable__thumb" onerror="this.style.display='none'" /></td>
      <td><div class="adminTable__productName">${p.name}</div><div class="adminTable__productDesc">${(p.description||'').slice(0,55)}</div></td>
      <td><span class="adminBadge adminBadge--gray">${p.category||'—'}</span></td>
      <td><strong>${fmt(p.price)}</strong>${p.priceWas?`<br><span class="adminTable__was">${fmt(p.priceWas)}</span>`:''}</td>
      <td><span class="${p.stockQty<=5?'adminBadge adminBadge--red':'adminBadge adminBadge--green'}">${p.stockQty}</span></td>
      <td><div class="adminTable__actions">
        <button class="adminTable__editBtn" data-edit="${p.id}" title="Засах">✏️</button>
        <button class="adminTable__delBtn"  data-del="${p.id}"  title="Устгах">🗑</button>
      </div></td>
    </tr>`).join("");
}

qs("[data-product-search]")?.addEventListener("input", filterProducts);
qs("[data-cat-filter]")?.addEventListener("change", filterProducts);
function filterProducts() {
  const q = (qs("[data-product-search]")?.value||"").toLowerCase();
  const cat = qs("[data-cat-filter]")?.value||"";
  _filteredProducts = _allProducts.filter(p =>
    (!q || p.name.toLowerCase().includes(q) || (p.description||"").toLowerCase().includes(q)) &&
    (!cat || p.category === cat));
  renderProductsTable(_filteredProducts);
}

document.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit]");
  if (editBtn && qs("[data-products-tbody]")?.contains(editBtn)) {
    const p = _allProducts.find(x => x.id === editBtn.dataset.edit);
    if (p) openProductModal(p);
    return;
  }
  const delBtn = e.target.closest("[data-del]");
  if (delBtn && qs("[data-products-tbody]")?.contains(delBtn)) {
    const p = _allProducts.find(x => x.id === delBtn.dataset.del);
    if (!p || !confirm(`"${p.name}" устгах уу?`)) return;
    try { await deleteProduct(p.id); _allProducts = _allProducts.filter(x=>x.id!==p.id); filterProducts(); setText("[data-products-count]",_allProducts.length); }
    catch (err) { alert("Устгаж чадсангүй: "+err.message); }
  }
});

// Product modal
function openProductModal(product=null) {
  const modal=qs("[data-product-modal]"), form=qs("[data-product-form]"), err=qs("[data-form-error]");
  qs("[data-modal-title]").textContent = product?"Бараа засах":"Бараа нэмэх";
  err.hidden=true; form.reset();
  qs("[data-product-id]").value = product?.id||"";
  if (product) {
    const sv=(n,v)=>{const el=form.querySelector(`[name=${n}]`);if(el)el.value=v;};
    sv("deliveryType",product.deliveryType||"");
    sv("name",product.name||"");
    const cats = product.categories?.length ? product.categories : (product.category ? [product.category] : []);
    form.querySelectorAll("[name=categories]").forEach(cb => { cb.checked = cats.includes(cb.value); });
    sv("price",product.price||""); sv("priceWas",product.priceWas||"");
    sv("stockQty",product.stockQty||0); sv("description",product.description||"");
    sv("imageUrl",product.imageUrl||""); sv("tags",(product.tags||[]).join(", "));
  }
  modal.hidden=false; document.body.style.overflow="hidden";
  form.querySelector("[name=name]")?.focus();

  // Image file upload
  const fileInput   = form.querySelector("[data-img-file]");
  const urlInput    = form.querySelector("[data-img-url-input]");
  const uploadLabel = form.querySelector("[data-img-upload-label-text]");
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    uploadLabel.textContent = "Uploading…";
    try {
      const url = await uploadProductImage(file, product?.id || `new_${Date.now()}`);
      if (urlInput) urlInput.value = url;
      uploadLabel.textContent = "✓ Upload амжилттай";
    } catch (e) {
      uploadLabel.textContent = "Upload алдаа: " + e.message;
    }
  });
}
function closeProductModal() { qs("[data-product-modal]").hidden=true; document.body.style.overflow=""; }
qsa("[data-modal-close]").forEach(el=>el.addEventListener("click",closeProductModal));
qs("[data-open-add-product]")?.addEventListener("click",()=>openProductModal(null));

qs("[data-product-form]")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form=e.target, saveBtn=qs("[data-save-btn]"), err=qs("[data-form-error]"), id=qs("[data-product-id]")?.value;
  err.hidden=true; saveBtn.disabled=true; saveBtn.textContent="Хадгалж байна…";
  const categories=[...form.querySelectorAll("[name=categories]:checked")].map(c=>c.value);
  if(!categories.length){err.textContent="Дор хаяж нэг ангилал сонгоно уу.";err.hidden=false;saveBtn.disabled=false;saveBtn.textContent="Хадгалах";return;}
  const data={
    deliveryType:form.querySelector("[name=deliveryType]")?.value||"",
    name:form.querySelector("[name=name]").value.trim(),
    category:categories[0], categories,
    price:Number(form.querySelector("[name=price]").value), priceWas:Number(form.querySelector("[name=priceWas]").value)||null,
    stockQty:Number(form.querySelector("[name=stockQty]").value), description:form.querySelector("[name=description]").value.trim(),
    imageUrl:form.querySelector("[name=imageUrl]").value.trim(),
    tags:form.querySelector("[name=tags]").value.split(",").map(t=>t.trim()).filter(Boolean),
  };
  try {
    if (id) { await updateProduct(id,data); const idx=_allProducts.findIndex(p=>p.id===id); if(idx>=0)_allProducts[idx]={id,...data}; }
    else { const newId=await addProduct(data); _allProducts.unshift({id:newId,...data}); }
    filterProducts(); setText("[data-products-count]",_allProducts.length); closeProductModal();
  } catch(ex) { err.textContent=ex.message; err.hidden=false; }
  finally { saveBtn.disabled=false; saveBtn.textContent="Хадгалах"; }
});

// ══════════════════════════════════════════════════════════════════════════
// ORDERS with status control
// ══════════════════════════════════════════════════════════════════════════
let _allOrders = [], _filteredOrders = [];

async function loadOrders() {
  const tbody = qs("[data-orders-tbody]");
  tbody.innerHTML = `<tr><td colspan="7" class="adminTable__empty">Уншиж байна…</td></tr>`;
  try {
    const { fetchAllOrdersFirebase } = await import("./firebase.js");
    const orders = await fetchAllOrdersFirebase();
    // Map Firebase order shape to admin table shape
    const mapped = orders.map(o => ({
      id: o.id,
      orderNumber:   o.orderNumber,
      status:        o.status || "pending",
      paymentStatus: o.paymentStatus || "unpaid",
      paymentMethod: o.paymentMethod || "—",
      customer: { name: o.customerName, phone: o.phone, addressLine: o.addressLine, district: o.district },
      totals: { subtotal: o.subtotal || 0, deliveryFee: o.deliveryFee || 0, total: o.total || 0 },
      shipment: { status: o.status, eta: o.eta },
      items: o.items || [],
      createdAt: o.createdAt,
    }));
    _allOrders = mapped;
    _filteredOrders = mapped;
    renderOrdersTable(mapped);
    setText("[data-stat-orders]",  mapped.length);
    setText("[data-orders-count]", mapped.length);
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="7" class="adminTable__empty adminTable__empty--error">Алдаа: ${e.message}</td></tr>`;
  }
}

function renderOrdersTable(orders) {
  const tbody = qs("[data-orders-tbody]");
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="adminTable__empty">Захиалга байхгүй байна</td></tr>`;
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const nextStatus = NEXT_STATUS[o.status];
    const nextLabel  = NEXT_LABEL[o.status];
    const items      = o.items || [];
    const itemSummary = items.map(i => `${i.name} ×${i.qty}`).join(", ") || "—";
    const sellers    = [...new Set(items.map(i => i.sellerName).filter(Boolean))].join(", ") || "—";
    const date       = o.createdAt ? new Date(o.createdAt).toLocaleDateString("mn-MN") : "—";
    return `<tr data-order-row="${o.orderNumber||o.id}">
      <td>
        <div style="font-weight:800;font-size:.82rem">${o.orderNumber||"—"}</div>
        <div style="font-size:.72rem;color:#64748b">${date}</div>
      </td>
      <td>
        <div style="font-weight:700;font-size:.86rem">${o.customer?.name||o.customerName||"—"}</div>
        <div style="font-size:.74rem;color:#64748b">${o.customer?.phone||o.phone||""}</div>
        <div style="font-size:.72rem;color:#94a3b8">${o.customer?.district||o.district||""}</div>
      </td>
      <td style="font-size:.78rem;max-width:200px;white-space:normal;line-height:1.4">
        ${itemSummary}
        <div style="font-size:.72rem;color:#64748b;margin-top:3px">🏪 ${sellers}</div>
      </td>
      <td>
        <strong style="font-size:.92rem">$${(o.totals?.total||o.total||0).toFixed(2)}</strong>
        <div style="font-size:.72rem;color:#64748b">${o.paymentMethod||"—"}</div>
      </td>
      <td>
        ${statusBadge(o.status)}
        ${nextStatus ? `<br><button class="adminStatusBtn" style="margin-top:6px" data-next-status="${nextStatus}" data-order-num="${o.orderNumber||o.id}">
          ${nextLabel}
        </button>` : ""}
      </td>
      <td>
        <button class="adminTable__editBtn" onclick="expandOrderDetail(this)" data-items='${JSON.stringify(items).replace(/'/g,"&#39;")}' title="Дэлгэрэнгүй">👁</button>
      </td>
    </tr>`;
  }).join("");
}

function isStepDone(currentStatus, step) {
  const order = ["awaiting_payment","processing","out_for_delivery","delivered"];
  return order.indexOf(currentStatus) > order.indexOf(step);
}

// Order search + filter
qs("[data-order-search]")?.addEventListener("input", filterOrders);
qs("[data-order-status-filter]")?.addEventListener("change", filterOrders);
qs("[data-refresh-orders]")?.addEventListener("click", loadOrders);

function filterOrders() {
  const q = (qs("[data-order-search]")?.value||"").toLowerCase();
  const st = qs("[data-order-status-filter]")?.value||"";
  _filteredOrders = _allOrders.filter(o =>
    (!q || o.orderNumber.toLowerCase().includes(q) || (o.customer?.name||"").toLowerCase().includes(q)) &&
    (!st || o.status === st));
  renderOrdersTable(_filteredOrders);
}

// Status update button
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-next-status]");
  if (!btn) return;
  const orderNum  = btn.dataset.orderNum;
  const newStatus = btn.dataset.nextStatus;
  const label     = ORDER_STATUSES[newStatus]?.label || newStatus;

  if (!confirm(`"${orderNum}" захиалгын байдлыг "${label}" болгох уу?`)) return;

  btn.disabled = true;
  btn.textContent = "Шинэчилж байна…";

  try {
    const { updateFirebaseOrderStatus } = await import("./firebase.js");
    const o = _allOrders.find(x => x.orderNumber === orderNum);
    if (o?.id) await updateFirebaseOrderStatus(o.id, newStatus);
    if (o) o.status = newStatus;
    filterOrders();
    showAdminToast(`✓ ${label} болов`, "ok");
  } catch (err) {
    btn.disabled = false;
    btn.textContent = NEXT_LABEL[ORDER_STATUSES[newStatus]?.prev || ""] || "Дахин оролдох";
    showAdminToast(err.message || "Алдаа гарлаа", "err");
  }
});

// Order detail modal
window.expandOrderDetail = function(btn) {
  const items = JSON.parse(btn.dataset.items || "[]");
  const row = btn.closest("tr");
  const existing = row.nextElementSibling;
  if (existing?.dataset.detailRow) { existing.remove(); btn.textContent = "👁"; return; }
  btn.textContent = "✕";
  const detail = document.createElement("tr");
  detail.dataset.detailRow = "1";
  detail.innerHTML = `<td colspan="6" style="background:#f8fafc;padding:12px 16px">
    <div style="font-size:.82rem;font-weight:700;margin-bottom:8px;color:#475569">Захиалгын дэлгэрэнгүй бараанууд:</div>
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead><tr style="color:#94a3b8;font-size:.72rem">
        <th style="text-align:left;padding:4px 8px">Бараа</th>
        <th style="text-align:left;padding:4px 8px">Seller</th>
        <th style="text-align:right;padding:4px 8px">Үнэ</th>
        <th style="text-align:right;padding:4px 8px">Тоо</th>
        <th style="text-align:right;padding:4px 8px">Нийт</th>
      </tr></thead>
      <tbody>${items.map(i => `<tr style="border-top:1px solid #e2e8f0">
        <td style="padding:6px 8px;font-weight:600">${i.name||"—"}</td>
        <td style="padding:6px 8px;color:#64748b">${i.sellerName||"—"}</td>
        <td style="padding:6px 8px;text-align:right">$${(i.price||0).toFixed(2)}</td>
        <td style="padding:6px 8px;text-align:right">${i.qty}</td>
        <td style="padding:6px 8px;text-align:right;font-weight:700">$${((i.price||0)*i.qty).toFixed(2)}</td>
      </tr>`).join("")}</tbody>
    </table>
  </td>`;
  row.insertAdjacentElement("afterend", detail);
};

window.openOrderDetail = async function(orderNumber) {
  const modal = qs("[data-order-modal]");
  const body  = qs("[data-order-modal-body]");
  const title = qs("[data-order-modal-title]");
  title.textContent = `Захиалга: ${orderNumber}`;
  body.innerHTML = "Уншиж байна…";
  modal.hidden = false; document.body.style.overflow = "hidden";
  try {
    const o = await adminApi(`/api/orders/${encodeURIComponent(orderNumber)}`);
    body.innerHTML = `
      <div class="adminOrderDetail">
        <div class="adminOrderDetail__row"><b>Захиалга №</b><span>${o.orderNumber}</span></div>
        <div class="adminOrderDetail__row"><b>Хэрэглэгч</b><span>${o.customer?.name}</span></div>
        <div class="adminOrderDetail__row"><b>Утас</b><span>${o.customer?.phone}</span></div>
        <div class="adminOrderDetail__row"><b>Хаяг</b><span>${o.customer?.district}, ${o.customer?.addressLine}</span></div>
        ${o.customer?.notes?`<div class="adminOrderDetail__row"><b>Тэмдэглэл</b><span>${o.customer.notes}</span></div>`:""}
        <div class="adminOrderDetail__row"><b>Төлбөр</b><span>${o.paymentMethod} — ${o.paymentStatus==="paid"?"✓ Төлсөн":"Хүлээж байна"}</span></div>
        <div class="adminOrderDetail__row"><b>Байдал</b>${statusBadge(o.status)}</div>
        <div class="adminOrderDetail__row"><b>Бараанууд</b>
          <span>${(o.items||[]).map(i=>`${i.name} ×${i.qty} (${fmt(i.price)})`).join("<br>")}</span>
        </div>
        <div class="adminOrderDetail__row"><b>Барааны дүн</b><span>${fmt(o.totals?.subtotal)}</span></div>
        <div class="adminOrderDetail__row"><b>Хүргэлт</b><span>${fmt(o.totals?.deliveryFee)}</span></div>
        <div class="adminOrderDetail__row"><b>Нийт дүн</b><span><strong>${fmt(o.totals?.total)}</strong></span></div>
        <div class="adminOrderDetail__row"><b>Огноо</b><span>${fmtDate(o.createdAt)}</span></div>
      </div>`;
  } catch (err) { body.innerHTML = `<p style="color:red">Ачааллаж чадсангүй: ${err.message}</p>`; }
};

qsa("[data-order-modal-close]").forEach(el => el.addEventListener("click", () => {
  qs("[data-order-modal]").hidden = true; document.body.style.overflow = "";
}));

// ══════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════
let _allUsers = [], _filteredUsers = [];

async function loadUsers() {
  const tbody = qs("[data-users-tbody]");
  tbody.innerHTML = `<tr><td colspan="6" class="adminTable__empty">Уншиж байна…</td></tr>`;
  try {
    _allUsers = await fetchAllUsers();
    _filteredUsers = _allUsers;
    renderUsersTable(_allUsers);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="adminTable__empty adminTable__empty--error">
      Firebase холбогдохгүй байна: ${err.message}
    </td></tr>`;
  }
}

function renderUsersTable(users) {
  const tbody = qs("[data-users-tbody]");
  if (!users.length) { tbody.innerHTML = `<tr><td colspan="6" class="adminTable__empty">Хэрэглэгч байхгүй</td></tr>`; return; }
  tbody.innerHTML = users.map(u => {
    const isBanned = u.banned === true;
    const initials = (u.name || u.email || "?")[0].toUpperCase();
    return `<tr class="${isBanned?'adminTable__row--banned':''}">
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="adminUserAvatar" style="background:${isBanned?'#dc2626':'#0074e9'}">${initials}</div>
          <div>
            <div style="font-weight:800;font-size:.88rem">${u.name||"Нэргүй"}</div>
            <div style="font-size:.76rem;color:rgba(16,16,16,.48)">${u.email||"—"}</div>
          </div>
        </div>
      </td>
      <td style="font-size:.86rem">${u.phone||"—"}</td>
      <td style="font-size:.82rem;color:rgba(16,16,16,.60)">${u.district?`${u.district}, ${(u.addressLine||"").slice(0,30)}`:"—"}</td>
      <td style="font-size:.78rem;color:rgba(16,16,16,.45)">${u.createdAt?u.createdAt.slice(0,10):"—"}</td>
      <td>${isBanned
        ? `<span class="adminBadge adminBadge--red">🚫 Хаагдсан</span>${u.bannedAt?`<div style="font-size:.72rem;color:rgba(16,16,16,.4);margin-top:2px">${u.bannedAt.slice(0,10)}</div>`:""}`
        : `<span class="adminBadge adminBadge--green">✓ Идэвхтэй</span>`}</td>
      <td>
        <div class="adminTable__actions">
          <button class="adminTable__editBtn" data-view-user="${u.uid}" title="Дэлгэрэнгүй">👁</button>
          ${isBanned
            ? `<button class="adminTable__editBtn" data-unban="${u.uid}" title="Нээх" style="background:rgba(25,179,122,.1);border-color:rgba(25,179,122,.3)">✓ Нээх</button>`
            : `<button class="adminTable__delBtn"  data-ban="${u.uid}"   title="Хаах">🚫 Хаах</button>`}
        </div>
      </td>
    </tr>`;
  }).join("");
}

// User search + filter
qs("[data-user-search]")?.addEventListener("input", filterUsers);
qs("[data-user-filter]")?.addEventListener("change", filterUsers);
function filterUsers() {
  const q  = (qs("[data-user-search]")?.value||"").toLowerCase();
  const ft = qs("[data-user-filter]")?.value||"";
  _filteredUsers = _allUsers.filter(u =>
    (!q || (u.name||"").toLowerCase().includes(q) || (u.email||"").toLowerCase().includes(q) || (u.phone||"").includes(q)) &&
    (!ft || (ft==="banned"?u.banned===true:u.banned!==true)));
  renderUsersTable(_filteredUsers);
}

// Ban / Unban / View delegation
document.addEventListener("click", async (e) => {
  // View user
  const viewBtn = e.target.closest("[data-view-user]");
  if (viewBtn) {
    const u = _allUsers.find(x => x.uid === viewBtn.dataset.viewUser);
    if (u) openUserDetail(u);
    return;
  }

  // Ban
  const banBtn = e.target.closest("[data-ban]");
  if (banBtn) {
    const uid = banBtn.dataset.ban;
    const u   = _allUsers.find(x => x.uid === uid);
    if (!u || !confirm(`"${u.name||u.email}" хэрэглэгчийг хаах уу?`)) return;
    banBtn.disabled = true; banBtn.textContent = "…";
    try {
      await setBanUser(uid, true);
      const idx = _allUsers.findIndex(x => x.uid === uid);
      if (idx >= 0) _allUsers[idx].banned = true;
      filterUsers();
      showAdminToast(`${u.name||u.email} хаагдлаа`, "warn");
    } catch (err) { showAdminToast(err.message, "err"); banBtn.disabled = false; banBtn.textContent = "🚫 Хаах"; }
    return;
  }

  // Unban
  const unbanBtn = e.target.closest("[data-unban]");
  if (unbanBtn) {
    const uid = unbanBtn.dataset.unban;
    const u   = _allUsers.find(x => x.uid === uid);
    if (!u) return;
    unbanBtn.disabled = true; unbanBtn.textContent = "…";
    try {
      await setBanUser(uid, false);
      const idx = _allUsers.findIndex(x => x.uid === uid);
      if (idx >= 0) _allUsers[idx].banned = false;
      filterUsers();
      showAdminToast(`${u.name||u.email} дахин нээгдлээ`, "ok");
    } catch (err) { showAdminToast(err.message, "err"); unbanBtn.disabled = false; unbanBtn.textContent = "✓ Нээх"; }
    return;
  }
});

function openUserDetail(u) {
  const modal = qs("[data-order-modal]");
  const body  = qs("[data-order-modal-body]");
  const title = qs("[data-order-modal-title]");
  title.textContent = `Хэрэглэгч: ${u.name || u.email}`;
  body.innerHTML = `
    <div class="adminOrderDetail">
      <div class="adminOrderDetail__row"><b>UID</b><code style="font-size:.8rem">${u.uid}</code></div>
      <div class="adminOrderDetail__row"><b>Нэр</b><span>${u.name||"—"}</span></div>
      <div class="adminOrderDetail__row"><b>И-мэйл</b><span>${u.email||"—"}</span></div>
      <div class="adminOrderDetail__row"><b>Утас</b><span>${u.phone||"—"}</span></div>
      <div class="adminOrderDetail__row"><b>Дүүрэг</b><span>${u.district||"—"}</span></div>
      <div class="adminOrderDetail__row"><b>Хаяг</b><span>${u.addressLine||"—"}</span></div>
      <div class="adminOrderDetail__row"><b>Байдал</b>${u.banned?`<span class="adminBadge adminBadge--red">🚫 Хаагдсан</span>`:`<span class="adminBadge adminBadge--green">✓ Идэвхтэй</span>`}</div>
      <div class="adminOrderDetail__row"><b>Бүртгүүлсэн</b><span>${u.createdAt?.slice(0,10)||"—"}</span></div>
    </div>`;
  modal.hidden = false; document.body.style.overflow = "hidden";
}

// ── Admin toast ───────────────────────────────────────────────────────────
function showAdminToast(msg, type = "ok") {
  const wrap = document.createElement("div");
  wrap.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;
    background:${type==="ok"?"#19b37a":type==="warn"?"#d97706":"#dc2626"};color:#fff;
    padding:10px 20px;font-weight:700;font-size:.88rem;box-shadow:0 4px 16px rgba(0,0,0,.2);
    animation:toastIn 220ms ease both`;
  wrap.textContent = msg;
  document.body.appendChild(wrap);
  setTimeout(() => { wrap.style.opacity="0"; wrap.style.transition="opacity 200ms ease"; setTimeout(()=>wrap.remove(),200); }, 2500);
}

// ══════════════════════════════════════════════════════════════════════════
// PENDING PRODUCTS (Seller approval)
// ══════════════════════════════════════════════════════════════════════════
async function loadPending() {
  const tbody = qs("[data-pending-tbody]");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="adminTable__empty">Уншиж байна…</td></tr>`;

  try {
    const products = await fetchPendingProducts();
    setText("[data-pending-count]", products.length || "0");

    if (!products.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="adminTable__empty">Зөвшөөрөл хүлэх бараа байхгүй байна ✓</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(p => `
      <tr data-pending-row="${p.id}">
        <td><img src="${p.imageUrl||''}" class="adminTable__thumb" onerror="this.style.display='none'"/></td>
        <td>
          <div class="adminTable__productName">${p.name}</div>
          <div class="adminTable__productDesc">${(p.description||'').slice(0,60)}</div>
        </td>
        <td><span style="font-size:.82rem;font-weight:700;color:var(--c-blue)">${p.sellerName||'—'}</span></td>
        <td><span class="adminBadge adminBadge--gray">${p.category||'—'}</span></td>
        <td><strong>$${Number(p.price||0).toFixed(2)}</strong></td>
        <td style="font-size:.78rem;color:rgba(16,16,16,.45)">${(p.createdAt||'').slice(0,10)}</td>
        <td>
          <div class="adminTable__actions">
            <button class="adminStatusBtn" style="background:#19b37a" data-approve="${p.id}" title="Зөвшөөрөх">✓ Зөвшөөрөх</button>
            <button class="adminTable__delBtn" data-reject="${p.id}" title="Татгалзах">✗</button>
          </div>
        </td>
      </tr>`).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="adminTable__empty adminTable__empty--error">Firebase алдаа: ${err.message}</td></tr>`;
  }
}

// Approve / Reject delegation
document.addEventListener("click", async (e) => {
  const approveBtn = e.target.closest("[data-approve]");
  if (approveBtn) {
    const id = approveBtn.dataset.approve;
    approveBtn.disabled = true; approveBtn.textContent = "…";
    try {
      await setProductStatus(id, "approved");
      approveBtn.closest("[data-pending-row]")?.remove();
      showAdminToast("✓ Бараа зөвшөөрөгдлөө", "ok");
      const count = document.querySelectorAll("[data-pending-row]").length;
      setText("[data-pending-count]", String(count || "0"));
    } catch (err) { showAdminToast(err.message, "err"); approveBtn.disabled = false; approveBtn.textContent = "✓ Зөвшөөрөх"; }
    return;
  }
  const rejectBtn = e.target.closest("[data-reject]");
  if (rejectBtn) {
    const id = rejectBtn.dataset.reject;
    const note = prompt("Татгалзах шалтгаан (заавал биш):", "") ?? "";
    if (note === null) return;
    rejectBtn.disabled = true;
    try {
      await setProductStatus(id, "rejected", note);
      rejectBtn.closest("[data-pending-row]")?.remove();
      showAdminToast("Бараа татгалзагдлаа", "warn");
      const count = document.querySelectorAll("[data-pending-row]").length;
      setText("[data-pending-count]", String(count || "0"));
    } catch (err) { showAdminToast(err.message, "err"); rejectBtn.disabled = false; }
    return;
  }
});

qs("[data-refresh-pending]")?.addEventListener("click", loadPending);

// ══════════════════════════════════════════════════════════════════════════
// SELLERS MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════
let _allSellers = [];

async function loadSellers() {
  const tbody = qs("[data-sellers-tbody]");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="adminTable__empty">Уншиж байна…</td></tr>`;
  try {
    _allSellers = await fetchAllSellers();
    // Pending count badge
    const pending = _allSellers.filter(s => !s.approved).length;
    setText("[data-sellers-badge]", pending || "");
    renderSellersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="adminTable__empty adminTable__empty--error">${err.message}</td></tr>`;
  }
}

function renderSellersTable() {
  const tbody = qs("[data-sellers-tbody]");
  if (!tbody) return;
  if (!_allSellers.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="adminTable__empty">Seller байхгүй байна</td></tr>`;
    return;
  }
  tbody.innerHTML = _allSellers.map(s => `
    <tr>
      <td>
        <div style="font-weight:800;font-size:.88rem">${s.shopName || "—"}</div>
        <div style="font-size:.74rem;color:var(--ad-muted)">${s.uid?.slice(0,12)}…</div>
      </td>
      <td style="font-size:.84rem">${s.email || "—"}</td>
      <td style="font-size:.84rem">${s.phone || "—"}</td>
      <td>
        ${s.approved
          ? `<span class="adminBadge adminBadge--green">✓ Зөвшөөрөгдсөн</span>`
          : `<span class="adminBadge adminBadge--orange">⏳ Хүлээгдэж байна</span>`}
      </td>
      <td>
        <div class="adminTable__actions">
          ${!s.approved
            ? `<button class="adminStatusBtn" data-approve-seller="${s.uid}">✓ Зөвшөөрөх</button>`
            : `<button class="adminTable__delBtn" data-reject-seller="${s.uid}" title="Цуцлах">✗</button>`}
        </div>
      </td>
    </tr>`).join("");
}

// Approve / Reject seller
document.addEventListener("click", async (e) => {
  const approveBtn = e.target.closest("[data-approve-seller]");
  if (approveBtn) {
    const uid = approveBtn.dataset.approveSeller;
    approveBtn.disabled = true; approveBtn.textContent = "…";
    try {
      await approveSellerAccount(uid, true);
      const s = _allSellers.find(x => x.uid === uid);
      if (s) s.approved = true;
      renderSellersTable();
      showAdminToast("Seller зөвшөөрөгдлөө ✓", "ok");
    } catch (err) { showAdminToast(err.message, "err"); approveBtn.disabled = false; approveBtn.textContent = "✓ Зөвшөөрөх"; }
    return;
  }
  const rejectBtn = e.target.closest("[data-reject-seller]");
  if (rejectBtn) {
    if (!confirm("Seller-ийн эрхийг цуцлах уу?")) return;
    const uid = rejectBtn.dataset.rejectSeller;
    try {
      await approveSellerAccount(uid, false);
      const s = _allSellers.find(x => x.uid === uid);
      if (s) s.approved = false;
      renderSellersTable();
      showAdminToast("Seller эрх цуцлагдлаа", "warn");
    } catch (err) { showAdminToast(err.message, "err"); }
    return;
  }
});

qs("[data-refresh-sellers]")?.addEventListener("click", loadSellers);

// ══════════════════════════════════════════════════════════════════════════
// BANNER MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

// Зураг compress (Canvas)
function compressBannerImg(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxW = 1440, maxH = 600;
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const isPng = file.type === "image/png"; resolve(isPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.95));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Зураг уншиж чадсангүй")); };
    img.src = url;
  });
}

let _banners = [];

async function loadBanners() {
  const tbody = qs("[data-banners-tbody]");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="adminTable__empty">Уншиж байна…</td></tr>`;
  try {
    _banners = await fetchAllBanners();
    renderBannersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="adminTable__empty adminTable__empty--error">${err.message}</td></tr>`;
  }
}

function renderBannersTable() {
  const tbody = qs("[data-banners-tbody]");
  if (!tbody) return;
  if (!_banners.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="adminTable__empty">Banner байхгүй. Шинэ banner нэмнэ үү.</td></tr>`;
    return;
  }
  tbody.innerHTML = _banners.map(b => `
    <tr data-banner-row="${b.id}">
      <td>
        ${b.imageUrl ? `<img src="${b.imageUrl}" style="width:140px;height:52px;object-fit:cover;border:1px solid var(--ad-border);display:block"/>` : `<span style="font-size:.8rem;color:var(--ad-muted)">Зураг байхгүй</span>`}
      </td>
      <td style="font-size:.82rem;color:var(--ad-muted)">
        Дараалал: <strong>${b.order ?? "—"}</strong>
      </td>
      <td>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;font-size:.82rem;font-weight:700">
          <input type="checkbox" ${b.active ? "checked" : ""} data-toggle-banner="${b.id}" style="accent-color:var(--ad-blue);width:16px;height:16px"/>
          ${b.active ? "Идэвхтэй" : "Идэвхгүй"}
        </label>
      </td>
      <td>
        <div class="adminTable__actions">
          <button class="adminTable__editBtn" data-edit-banner="${b.id}" title="Засах">✏️</button>
          <button class="adminTable__delBtn"  data-del-banner="${b.id}"  title="Устгах">🗑</button>
        </div>
      </td>
    </tr>`).join("");
}

// Add/Edit form
const bannerFormWrap = qs("[data-banner-form-wrap]");
const bannerForm     = qs("[data-banner-form]");

function openBannerForm(banner = null) {
  if (!bannerFormWrap || !bannerForm) return;
  bannerForm.reset();
  qs("[data-banner-id]").value = banner?.id || "";
  qs("[data-banner-img-data]").value = banner?.imageUrl || "";
  qs("[data-banner-form-title]").textContent = banner ? "Banner засах" : "Banner нэмэх";
  qs("[data-banner-error]").hidden = true;

  const prev = qs("[data-banner-preview]");
  const img  = qs("[data-banner-preview-img]");
  if (banner?.imageUrl && prev && img) {
    img.src = banner.imageUrl; prev.hidden = false;
  } else if (prev) {
    prev.hidden = true;
  }

  if (banner) {
    bannerForm.querySelector("[name=order]").value    = banner.order  ?? 1;
    bannerForm.querySelector("[name=active]").checked = banner.active !== false;
  }
  bannerFormWrap.hidden = false;
  bannerFormWrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeBannerForm() {
  if (bannerFormWrap) bannerFormWrap.hidden = true;
}

qs("[data-add-banner]")?.addEventListener("click", () => openBannerForm(null));
qsa("[data-close-banner-form]").forEach(b => b.addEventListener("click", closeBannerForm));

// Image file select → compress → preview
qs("[data-banner-img-file]")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const zone = qs("[data-banner-upload-hint]");
  if (zone) zone.innerHTML = `<p style="margin:0;font-weight:700;color:var(--ad-blue)">⏳ Боловсруулж байна…</p>`;
  try {
    const compressed = await compressBannerImg(file);
    qs("[data-banner-img-data]").value = compressed;
    const prev = qs("[data-banner-preview]");
    const img  = qs("[data-banner-preview-img]");
    if (prev && img) { img.src = compressed; prev.hidden = false; }
    if (zone) zone.innerHTML = `<p style="margin:0;font-weight:800;color:var(--ad-blue)">✓ ${file.name}</p><p style="margin:4px 0 0;font-size:.78rem;color:var(--ad-muted)">Зураг бэлэн болов</p>`;
  } catch (err) {
    if (zone) zone.innerHTML = `<p style="margin:0;color:#dc2626;font-weight:700">❌ ${err.message}</p>`;
  }
});

// Clear image
qs("[data-clear-banner-img]")?.addEventListener("click", () => {
  qs("[data-banner-img-data]").value = "";
  qs("[data-banner-preview]").hidden = true;
  qs("[data-banner-img-file]").value = "";
  qs("[data-banner-upload-hint]").innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    <p style="margin:8px 0 4px;font-weight:800">Зураг сонгох эсвэл чирж тавих</p>
    <p style="margin:0;font-size:.8rem;color:var(--ad-muted)">JPG, PNG, WEBP — 1280×520px хамгийн сайн</p>`;
});

// Drag & drop support
qs("[data-banner-upload-zone]")?.addEventListener("dragover", (e) => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--c-blue)"; });
qs("[data-banner-upload-zone]")?.addEventListener("dragleave", (e) => { e.currentTarget.style.borderColor = ""; });
qs("[data-banner-upload-zone]")?.addEventListener("drop", async (e) => {
  e.preventDefault();
  e.currentTarget.style.borderColor = "";
  const file = e.dataTransfer.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  const input = qs("[data-banner-img-file]");
  const dt    = new DataTransfer();
  dt.items.add(file);
  if (input) { input.files = dt.files; input.dispatchEvent(new Event("change")); }
});

// Form submit
bannerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl   = qs("[data-banner-error]");
  const saveBtn = qs("[data-banner-save]");
  errEl.hidden = true;
  saveBtn.disabled = true; saveBtn.textContent = "Хадгалж байна…";

  const id       = qs("[data-banner-id]").value || null;
  const imageUrl = qs("[data-banner-img-data]").value || "";

  if (!imageUrl && !id) {
    errEl.textContent = "Зураг сонгоно уу."; errEl.hidden = false;
    saveBtn.disabled = false; saveBtn.textContent = "Хадгалах";
    return;
  }

  const data = {
    imageUrl,
    order:  Number(bannerForm.querySelector("[name=order]").value) || 1,
    active: bannerForm.querySelector("[name=active]").checked,
  };
  if (!imageUrl && id) delete data.imageUrl; // зураг солиогүй үед хэвээр үлдэнэ

  try {
    await saveBanner(id, data);
    _banners = await fetchAllBanners();
    renderBannersTable();
    closeBannerForm();
    showAdminToast("Banner хадгалагдлаа ✓", "ok");
  } catch (err) {
    console.error("Banner save error:", err);
    errEl.textContent = "Алдаа: " + (err.message || err.code || "тодорхойгүй");
    errEl.hidden = false;
  } finally {
    saveBtn.disabled = false; saveBtn.textContent = "Хадгалах";
  }
});

// Delegation: edit / delete / toggle
document.addEventListener("click", async (e) => {
  const editB = e.target.closest("[data-edit-banner]");
  if (editB) { openBannerForm(_banners.find(b => b.id === editB.dataset.editBanner)); return; }

  const delB = e.target.closest("[data-del-banner]");
  if (delB) {
    if (!confirm("Banner устгах уу?")) return;
    try {
      await deleteBanner(delB.dataset.delBanner);
      _banners = _banners.filter(b => b.id !== delB.dataset.delBanner);
      renderBannersTable();
      showAdminToast("Устгагдлаа");
    } catch (err) { showAdminToast(err.message, "err"); }
    return;
  }
});

document.addEventListener("change", async (e) => {
  const tog = e.target.closest("[data-toggle-banner]");
  if (!tog) return;
  const id = tog.dataset.toggleBanner;
  const b  = _banners.find(x => x.id === id);
  if (!b) return;
  try {
    await saveBanner(id, { active: tog.checked });
    b.active = tog.checked;
    showAdminToast(tog.checked ? "Идэвхжлээ ✓" : "Идэвхгүй болов", "ok");
  } catch (err) { showAdminToast(err.message, "err"); }
});

// ── Init ──────────────────────────────────────────────────────────────────
checkAuth();
