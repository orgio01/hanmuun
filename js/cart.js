import { getLocalCart, updateLocalCartQty, removeFromLocalCart } from "./storage.js";
import { updateCartBadge, showToast, initSearchNav } from "./common.js";

const fmt   = (v) => `$${Number(v).toFixed(2)}`;
const qs    = (sel) => document.querySelector(sel);

// ── Render ────────────────────────────────────────────────────────────────
function render() {
  const list  = qs("[data-cart-list]");
  const empty = qs("[data-cart-empty]");
  if (!list) return;

  const items = getLocalCart();

  if (!items.length) {
    list.replaceChildren();
    if (empty) empty.hidden = false;
    updateTotals([]);
    const btn = qs("[data-checkout-btn]");
    if (btn) { btn.style.opacity = "0.45"; btn.style.pointerEvents = "none"; }
    return;
  }

  if (empty) empty.hidden = true;
  const btn = qs("[data-checkout-btn]");
  if (btn) { btn.style.opacity = ""; btn.style.pointerEvents = ""; }

  list.replaceChildren(...items.map(item => {
    const card = document.createElement("div");
    card.className = "cartItem";
    card.dataset.productId = item.productId;
    card.innerHTML = `
      <a class="cartItem__imgLink" href="/product/${encodeURIComponent(item.productId)}" tabindex="-1" aria-hidden="true">
        <img class="cartItem__img" src="${item.imageUrl||''}" alt="${item.name}" loading="lazy"
          onerror="this.style.opacity='0.3'"/>
      </a>
      <div class="cartItem__body">
        <div class="cartItem__meta">
          <a class="cartItem__name" href="/product/${encodeURIComponent(item.productId)}">${item.name}</a>
          <div class="cartItem__price">${fmt(item.price)}</div>
          ${item.sellerName ? `<div style="font-size:.72rem;color:#64748b">🏪 ${item.sellerName}</div>` : ""}
        </div>
        <div class="cartItem__controls">
          <div class="cartItem__qtyWrap">
            <button class="cartItem__qtyBtn" type="button" data-qty-dec aria-label="Бага болгох">−</button>
            <input class="cartItem__qtyInput" type="number" inputmode="numeric"
              value="${item.qty}" min="1" max="99" data-qty-input />
            <button class="cartItem__qtyBtn" type="button" data-qty-inc aria-label="Их болгох">+</button>
          </div>
          <div style="font-weight:800;font-size:.92rem;min-width:60px;text-align:right">${fmt(item.price * item.qty)}</div>
          <button class="cartItem__remove" type="button" data-remove aria-label="Устгах">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>`;
    return card;
  }));

  updateTotals(items);
  updateCartBadge();
}

function updateTotals(items) {
  const sub = items.reduce((s, i) => s + i.price * i.qty, 0);
  const subEl = qs("[data-subtotal]");
  const totEl = qs("[data-total]");
  if (subEl) subEl.textContent = fmt(sub);
  if (totEl) totEl.textContent = fmt(sub);
  const countEl = qs("[data-cart-count]");
  if (countEl) {
    const n = items.reduce((s, i) => s + i.qty, 0);
    countEl.textContent = n ? `${n} бараа` : "";
  }
}

// ── Event delegation ──────────────────────────────────────────────────────
document.addEventListener("click", (e) => {
  const card = e.target.closest(".cartItem");
  if (!card) return;
  const pid = card.dataset.productId;
  if (!pid) return;

  if (e.target.closest("[data-remove]")) {
    removeFromLocalCart(pid);
    showToast("Сагснаас хаслаа");
    render();
    return;
  }

  const input = card.querySelector("[data-qty-input]");
  const cur   = Math.max(1, Math.min(99, Number(input?.value) || 1));

  if (e.target.closest("[data-qty-inc]")) {
    const next = Math.min(99, cur + 1);
    if (input) input.value = next;
    updateLocalCartQty(pid, next);
    render();
  }
  if (e.target.closest("[data-qty-dec]")) {
    const next = Math.max(1, cur - 1);
    if (input) input.value = next;
    updateLocalCartQty(pid, next);
    render();
  }
});

document.addEventListener("change", (e) => {
  const input = e.target.closest("[data-qty-input]");
  if (!input) return;
  const card = input.closest(".cartItem");
  const pid  = card?.dataset?.productId;
  if (!pid) return;
  const qty = Math.max(1, Math.min(99, Number(input.value) || 1));
  input.value = qty;
  updateLocalCartQty(pid, qty);
  render();
});

// ── Init ──────────────────────────────────────────────────────────────────
render();
initSearchNav();
