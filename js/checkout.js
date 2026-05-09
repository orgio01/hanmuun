import { apiJson }                           from "./api.js";
import { getCartId, getProfile, setLastOrderNumber } from "./storage.js";
import { initSearchNav, updateCartBadge, showToast }  from "./common.js";
import { FIREBASE_READY, validateCoupon, incrementCouponUsage } from "./firebase.js";

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt    = (v) => `$${Number(v).toFixed(2)}`;
const qs     = (sel) => document.querySelector(sel);
const setText = (sel, v) => { const el = qs(sel); if (el) el.textContent = v; };

function deliveryDate(days) {
  const d = new Date(Date.now() + days * 86400000);
  const mn = ["1-р","2-р","3-р","4-р","5-р","6-р","7-р","8-р","9-р","10-р","11-р","12-р"];
  const dn = ["Ням","Даваа","Мягмар","Лхагва","Пүрэв","Баасан","Бямба"];
  return `${mn[d.getMonth()]} сарын ${d.getDate()}, ${dn[d.getDay()]}`;
}

function estimateFee(district, speed) {
  const d = String(district || "").toLowerCase();
  const central = ["sukhbaatar","chingeltei","bayangol","khan-uul","bayanzurkh"].some(k=>d.includes(k));
  return speed === "fast" ? (central ? 4.0 : 5.5) : (central ? 2.5 : 3.5);
}

function setCoError(msg) {
  const el = qs("[data-co-error]");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}

function setSubmitLoading(on) {
  const btn = qs("[data-co-submit]");
  const lbl = qs("[data-co-btn-label]");
  const sp  = qs("[data-co-spinner]");
  if (btn) btn.disabled  = on;
  if (lbl) lbl.hidden    = on;
  if (sp)  sp.hidden     = !on;
}

// ── Coupon state ─────────────────────────────────────────────────────────
let _coupon = null; // { code, discount, type }

function appliedDiscount(subtotal) {
  if (!_coupon) return 0;
  if (_coupon.type === "fixed")   return Math.min(_coupon.discount, subtotal);
  if (_coupon.type === "percent") return subtotal * (_coupon.discount / 100);
  return 0;
}

function initCoupon(recalcFn) {
  const input  = document.querySelector("[data-coupon-input]");
  const btn    = document.querySelector("[data-coupon-apply]");
  const msgEl  = document.querySelector("[data-coupon-msg]");
  if (!btn || !input) return;

  input.addEventListener("input", () => { input.value = input.value.toUpperCase(); });

  btn.addEventListener("click", async () => {
    const code = input.value.trim();
    if (!code) return;
    btn.disabled = true; btn.textContent = "Шалгаж байна…";
    msgEl.hidden = true;

    try {
      if (!FIREBASE_READY) throw new Error("Firebase тохируулагдаагүй.");
      _coupon = await validateCoupon(code);
      msgEl.className = "couponRow__msg couponRow__msg--ok";
      msgEl.textContent = `✓ "${_coupon.code}" — ${_coupon.type === "percent" ? `${_coupon.discount}%` : `$${_coupon.discount}`} хямдрал`;
      msgEl.hidden = false;
      input.disabled = true; btn.textContent = "Хэрэглэгдсэн";
      recalcFn();
    } catch (err) {
      _coupon = null;
      msgEl.className = "couponRow__msg couponRow__msg--err";
      msgEl.textContent = `✗ ${err.message}`;
      msgEl.hidden = false;
      btn.disabled = false; btn.textContent = "Хэрэглэх";
    }
  });
}

// ── Cart + totals ─────────────────────────────────────────────────────────
let _items    = [];
let _subtotal = 0;

function renderItems(items) {
  const box = qs("[data-co-items]");
  if (!box) return;
  if (!items.length) {
    box.innerHTML = `<p style="font-size:.88rem;color:rgba(16,16,16,.45);padding:8px 0">Сагс хоосон.</p>`;
    return;
  }
  box.innerHTML = items.map(({ product: p, qty }) => `
    <div class="coItem">
      <a href="/product/${encodeURIComponent(p.id)}" class="coItem__imgLink">
        <img class="coItem__img" src="${p.imageUrl}" alt="${p.name}" loading="lazy"/>
      </a>
      <div class="coItem__info">
        <div class="coItem__name">${p.name}</div>
        <div class="coItem__qty">${qty} ширхэг</div>
      </div>
      <div class="coItem__price">${fmt(p.price * qty)}</div>
    </div>
  `).join("");
}

function updateTotals(sub, fee) {
  const disc = appliedDiscount(sub);
  setText("[data-co-subtotal]", fmt(sub));
  // Купоны хямдрал мөр
  const discRow = document.getElementById("discountRow");
  if (discRow) discRow.hidden = disc <= 0;
  if (disc > 0) setText("[data-co-discount]", `-${fmt(disc)}`);
  if (fee != null) {
    setText("[data-co-delivery]", fmt(fee));
    setText("[data-co-total]",    fmt(Math.max(0, sub + fee - disc)));
  } else {
    setText("[data-co-delivery]", "—");
    setText("[data-co-total]",    "—");
  }
}

// ── Address helpers ───────────────────────────────────────────────────────
function fillHidden(name, phone, address, district) {
  const sv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  sv("hidName", name); sv("hidPhone", phone);
  sv("hidAddress", address); sv("hidDistrict", district);
}

function showAddrCard(p) {
  const card = qs("[data-addr-display]"), form = qs("[data-addr-form]"), editBtn = qs("[data-edit-addr]");
  if (card) { setText("[data-addr-name]", p.name); setText("[data-addr-phone]", p.phone);
    setText("[data-addr-addr]", `${p.district}, ${p.addressLine}`); card.hidden = false; }
  if (form) form.hidden = true;
  if (editBtn) editBtn.hidden = false;
  fillHidden(p.name, p.phone, p.addressLine, p.district);
}

function showAddrForm(p) {
  const card = qs("[data-addr-display]"), form = qs("[data-addr-form]"), editBtn = qs("[data-edit-addr]");
  if (card) card.hidden = true;
  if (form) form.hidden = false;
  if (editBtn) editBtn.hidden = true;
  if (p) {
    const sv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    sv("coName", p.name); sv("coPhone", p.phone); sv("coDistrict", p.district); sv("coAddress", p.addressLine);
  }
}

function readAddr() {
  if (!qs("[data-addr-form]")?.hidden)
    return { name: document.getElementById("coName")?.value.trim()||"",
             phone: document.getElementById("coPhone")?.value.trim()||"",
             district: document.getElementById("coDistrict")?.value||"",
             address: document.getElementById("coAddress")?.value.trim()||"" };
  return { name: document.getElementById("hidName")?.value||"",
           phone: document.getElementById("hidPhone")?.value||"",
           district: document.getElementById("hidDistrict")?.value||"",
           address: document.getElementById("hidAddress")?.value||"" };
}

// ══════════════════════════════════════════════════════════════════════════
// PAYMENT OVERLAY
// ══════════════════════════════════════════════════════════════════════════
const overlay = qs("[data-payment-overlay]");

function showPanel(name) {
  document.querySelectorAll("[data-pay-panel]").forEach(p => p.hidden = p.dataset.payPanel !== name);
  if (overlay) overlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closePayOverlay() {
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = "";
  stopQPayTimer();
}

document.querySelectorAll("[data-close-pay]").forEach(b => b.addEventListener("click", closePayOverlay));
overlay?.addEventListener("click", (e) => {
  if (e.target === overlay) closePayOverlay();
});

// ── QPay timer ────────────────────────────────────────────────────────────
let _timerInterval = null;

function startQPayTimer(seconds = 900) {
  stopQPayTimer();
  let remaining = seconds;
  const el = qs("[data-pay-timer]");
  const tick = () => {
    if (!el) return;
    const m = String(Math.floor(remaining / 60)).padStart(2, "0");
    const s = String(remaining % 60).padStart(2, "0");
    el.textContent = `${m}:${s}`;
    if (remaining <= 0) { stopQPayTimer(); closePayOverlay(); showToast("QPay хугацаа дууслаа", "warn"); }
    remaining--;
  };
  tick();
  _timerInterval = setInterval(tick, 1000);
}

function stopQPayTimer() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
}

// ── Payment methods ───────────────────────────────────────────────────────
async function showQPayPayment(orderNumber, totalAmount) {
  const qrImg = qs("[data-qr-img]");
  if (qrImg) {
    const qrData = `HANMUN:${orderNumber}:${totalAmount.toFixed(2)}`;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}&color=1a1a2e&bgcolor=ffffff&margin=8`;
    qrImg.alt = `QPay QR — ${orderNumber}`;
  }
  setText("[data-pay-amount]", fmt(totalAmount));
  showPanel("qpay");
  startQPayTimer(900);

  // Simulate-pay button (demo — real QPay has webhook)
  const simBtn = qs("[data-simulate-pay]");
  if (simBtn) {
    const fresh = simBtn.cloneNode(true);
    simBtn.parentNode.replaceChild(fresh, simBtn);
    fresh.addEventListener("click", async () => {
      fresh.disabled = true;
      fresh.textContent = "Баталгаажуулж байна…";
      try {
        await apiJson("/api/payments/mock/confirm", {
          method: "POST", body: JSON.stringify({ orderNumber }),
        });
        stopQPayTimer();
        showPaymentSuccess(orderNumber);
      } catch (err) {
        fresh.disabled = false;
        fresh.textContent = "Дахин оролдох";
        showToast(err.message || "Алдаа гарлаа", "warn");
      }
    });
  }
}

function showCardPayment(orderNumber, totalAmount) {
  setText("[data-pay-amount-card]", fmt(totalAmount));
  showPanel("card");
  initCardForm(orderNumber, totalAmount);
}

function showCashPayment(orderNumber, totalAmount, addr, eta) {
  setText("[data-pay-amount-cash]", fmt(totalAmount));
  setText("[data-cash-address]",   `${addr.district}, ${addr.address}`);
  setText("[data-cash-eta]",       eta);
  showPanel("transfer");

  const btn = qs("[data-pay-cash-confirm]");
  if (btn) {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener("click", async () => {
      fresh.disabled = true;
      fresh.textContent = "Баталгаажуулж байна…";
      try {
        await apiJson("/api/payments/mock/confirm", {
          method: "POST", body: JSON.stringify({ orderNumber }),
        });
        showPaymentSuccess(orderNumber);
      } catch (err) {
        fresh.disabled = false;
        fresh.textContent = "Захиалга баталгаажуулах";
        showToast(err.message || "Алдаа", "warn");
      }
    });
  }
}

// ── Card form (with live formatting + visual card) ────────────────────────
function initCardForm(orderNumber, totalAmount) {
  const numEl  = qs("[data-card-num]");
  const expEl  = qs("[data-card-exp]");
  const cvvEl  = qs("[data-card-cvv]");
  const nameEl = qs("[data-card-name]");
  const cvNum  = qs("[data-cv-number]");
  const cvExp  = qs("[data-cv-exp]");
  const cvName = qs("[data-cv-name]");
  const visual = qs("[data-card-visual]");

  // Reset
  [numEl, expEl, cvvEl, nameEl].forEach(el => { if (el) el.value = ""; });

  // Card number formatting
  numEl?.addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 16);
    e.target.value = v.match(/.{1,4}/g)?.join(" ") || v;
    if (cvNum) cvNum.textContent = e.target.value.padEnd(19, "•").replace(/\S/g, (c,i) => "•".includes(c)?c:c) || "•••• •••• •••• ••••";
    if (cvNum) cvNum.textContent = e.target.value || "•••• •••• •••• ••••";
    // Card type color
    if (visual) {
      const n = v;
      if (n.startsWith("4"))      visual.style.background = "linear-gradient(135deg,#1a56db,#0a2f7a)";
      else if (n.startsWith("5")) visual.style.background = "linear-gradient(135deg,#d97706,#92400e)";
      else                         visual.style.background = "linear-gradient(135deg,#374151,#111827)";
    }
  });

  // Expiry formatting
  expEl?.addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (v.length >= 3) v = v.slice(0,2) + "/" + v.slice(2);
    e.target.value = v;
    if (cvExp) cvExp.textContent = v || "MM/YY";
  });

  // Name
  nameEl?.addEventListener("input", (e) => {
    const v = e.target.value.toUpperCase();
    e.target.value = v;
    if (cvName) cvName.textContent = v || "ХЭРЭГЛЭГЧИЙН НЭР";
  });

  // Submit
  const submitBtn = qs("[data-pay-card-submit]");
  if (submitBtn) {
    const fresh = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(fresh, submitBtn);

    fresh.addEventListener("click", async () => {
      const num  = (numEl?.value  || "").replace(/\s/g, "");
      const exp  = (expEl?.value  || "");
      const cvv  = (cvvEl?.value  || "");
      const name = (nameEl?.value || "").trim();
      const err  = qs("[data-card-error]");

      const setErr = (msg) => { if (err) { err.textContent = msg; err.hidden = !msg; } };
      setErr("");

      if (num.length < 16)   return setErr("Картын дугаар бүрэн биш байна.");
      if (!/^\d{2}\/\d{2}$/.test(exp)) return setErr("Хугацааг MM/YY хэлбэрт оруулна уу.");
      if (cvv.length < 3)    return setErr("CVV 3 оронтой байх ёстой.");
      if (!name)             return setErr("Картын эзэмшигчийн нэр оруулна уу.");

      // Check expiry
      const [mm, yy] = exp.split("/").map(Number);
      const now = new Date();
      if (mm < 1 || mm > 12 || yy + 2000 < now.getFullYear() ||
         (yy + 2000 === now.getFullYear() && mm < now.getMonth() + 1))
        return setErr("Картын хугацаа дууссан байна.");

      // Process
      const lbl = fresh.querySelector("[data-card-btn-label]");
      const sp  = fresh.querySelector("[data-card-spinner]");
      fresh.disabled = true;
      if (lbl) lbl.hidden = true;
      if (sp)  sp.hidden  = false;

      try {
        await new Promise(r => setTimeout(r, 1800)); // realistic delay
        await apiJson("/api/payments/mock/confirm", {
          method: "POST", body: JSON.stringify({ orderNumber }),
        });
        showPaymentSuccess(orderNumber);
      } catch (ex) {
        setErr(ex.message || "Карт боловсруулах алдаа гарлаа.");
        fresh.disabled = false;
        if (lbl) lbl.hidden = false;
        if (sp)  sp.hidden  = true;
      }
    });
  }
}

// ── Payment success ───────────────────────────────────────────────────────
function showPaymentSuccess(orderNumber) {
  setLastOrderNumber(orderNumber);
  stopQPayTimer();
  setText("[data-success-order-num]", orderNumber);
  showPanel("success");

  setTimeout(() => {
    window.location.href = `/order-success?order=${encodeURIComponent(orderNumber)}`;
  }, 2000);
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════
async function main() {
  initSearchNav();
  updateCartBadge();

  // ── Нэвтрэх шаардлага ─────────────────────────────
  if (!getProfile()) {
    const wall = document.querySelector("[data-login-wall]");
    const page = document.querySelector(".coPage");
    const prog = document.querySelector(".coProgress");
    if (wall) wall.hidden = false;
    if (page) page.hidden = true;
    if (prog) prog.hidden = true;
    return; // зогсоох
  }

  // Load cart items
  try {
    const data = await apiJson(`/api/cart?cartId=${encodeURIComponent(getCartId())}`);
    _items    = data.items || [];
    _subtotal = _items.reduce((s, i) => s + i.product.price * i.qty, 0);
    renderItems(_items);
  } catch { setCoError("Сагсны мэдээлэл ачаалж чадсангүй."); }

  // Profile auto-fill
  const profile  = getProfile();
  let district   = "";
  let addrForCash = { district: "", address: "" };

  if (profile) {
    showAddrCard(profile);
    district = profile.district;
    addrForCash = { district: profile.district, address: profile.addressLine };
    qs("[data-edit-addr]")?.addEventListener("click", () => showAddrForm(profile));
  } else {
    showAddrForm(null);
    document.getElementById("coDistrict")?.addEventListener("change", recalc);
  }

  // Delivery option display
  setText("[data-eta-fast]", `Маргааш (${deliveryDate(1)})`);
  setText("[data-eta-std]",  `2–3 хоногт (${deliveryDate(3)} хүртэл)`);

  function recalc() {
    const addrVisible = !qs("[data-addr-form]")?.hidden;
    const d = addrVisible
      ? (document.getElementById("coDistrict")?.value || "")
      : (document.getElementById("hidDistrict")?.value || district);
    const speed = document.querySelector("input[name=deliverySpeed]:checked")?.value || "fast";

    if (d) {
      const fee = estimateFee(d, speed);
      setText("[data-fee-fast]", fmt(estimateFee(d, "fast")));
      setText("[data-fee-std]",  fmt(estimateFee(d, "standard")));
      updateTotals(_subtotal, fee);
    } else {
      setText("[data-fee-fast]", "—");
      setText("[data-fee-std]",  "—");
      updateTotals(_subtotal, null);
    }
    syncDelivery(); syncPayment();
  }

  function syncDelivery() {
    document.querySelectorAll(".coDelivery__opt").forEach(o => {
      o.querySelector(".coDelivery__card")?.classList.toggle("is-selected",
        o.querySelector("input")?.checked);
    });
  }
  function syncPayment() {
    document.querySelectorAll(".coPayment__opt").forEach(o => {
      o.querySelector(".coPayment__card")?.classList.toggle("is-selected",
        o.querySelector("input")?.checked);
    });
  }

  recalc();
  initCoupon(recalc);
  document.querySelectorAll("input[name=deliverySpeed]").forEach(r => r.addEventListener("change", recalc));
  document.querySelectorAll("input[name=paymentMethod]").forEach(r => r.addEventListener("change", syncPayment));

  // ── Form submit ──────────────────────────────────────────────────────
  document.getElementById("checkoutForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setCoError("");

    const addr = readAddr();
    if (!addr.name)     return setCoError("Нэрээ оруулна уу.");
    if (!addr.phone)    return setCoError("Утасны дугаар оруулна уу.");
    if (!addr.district) return setCoError("Дүүрэг сонгоно уу.");
    if (!addr.address)  return setCoError("Хаягаа оруулна уу.");
    if (!_items.length) return setCoError("Сагс хоосон байна.");

    fillHidden(addr.name, addr.phone, addr.address, addr.district);

    const speed   = document.querySelector("input[name=deliverySpeed]:checked")?.value  || "fast";
    const payment = document.querySelector("input[name=paymentMethod]:checked")?.value  || "card";
    const fee     = estimateFee(addr.district, speed);
    const total   = _subtotal + fee;

    setSubmitLoading(true);

    try {
      // 1. Create order
      const out = await apiJson("/api/checkout", {
        method: "POST",
        body: JSON.stringify({
          cartId: getCartId(),
          customerName:  addr.name,
          phone:         addr.phone,
          addressLine:   addr.address,
          district:      addr.district,
          deliverySpeed: speed,
          paymentMethod: payment,
        }),
      });

      setSubmitLoading(false);
      if (_coupon) incrementCouponUsage(_coupon.code).catch(() => {});

      // 2. Show payment UI
      if (payment === "qpay") {
        await showQPayPayment(out.orderNumber, total);
      } else if (payment === "card") {
        showCardPayment(out.orderNumber, total);
      } else {
        const eta = speed === "fast" ? "Маргааш" : "2–3 хоногт";
        showCashPayment(out.orderNumber, total, { district: addr.district, address: addr.address }, eta);
      }
    } catch (err) {
      setCoError(err?.message || "Захиалга хийхэд алдаа гарлаа.");
      setSubmitLoading(false);
    }
  });
}

main();
