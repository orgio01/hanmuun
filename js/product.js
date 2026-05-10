import { apiJson }                                          from "./api.js";
import { addToLocalCart, toggleWishlist, isInWishlist, addRecentlyViewed } from "./storage.js";
import { updateCartBadge, showToast, initSearchNav, initVoiceSearch } from "./common.js";
import { initReviews } from "./reviews.js";
import { FIREBASE_READY, getAuth_ } from "./firebase.js";

// ── Helpers ───────────────────────────────────────────────────────────────
function fmt(v) { return `$${Number(v).toFixed(2)}`; }

function getProductId() {
  const m = window.location.pathname.match(/^\/product\/(.+)$/);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(window.location.search).get("id") || "";
}

function setText(sel, val) {
  const el = document.querySelector(sel);
  if (el) el.textContent = val;
}
function show(sel, yes = true) {
  const el = document.querySelector(sel);
  if (el) el.hidden = !yes;
}

// ── Fetch: Firebase → fallback to local API ───────────────────────────────
async function fetchProduct(id) {
  try {
    const { fetchProductFirebase } = await import("./firebase.js");
    return await fetchProductFirebase(id);
  } catch {
    // Firebase not configured or failed → use local API
    return await apiJson(`/api/products/${encodeURIComponent(id)}`);
  }
}

// ── Qty control ───────────────────────────────────────────────────────────
function getQty() {
  const inp = document.querySelector("[data-qty-input]");
  const n = Number(inp?.value ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.min(99, Math.floor(n)) : 1;
}

function initQty() {
  const inp = document.querySelector("[data-qty-input]");
  if (!inp) return;
  document.querySelector("[data-qty-dec]")?.addEventListener("click", () => {
    const v = Math.max(1, getQty() - 1);
    inp.value = v;
  });
  document.querySelector("[data-qty-inc]")?.addEventListener("click", () => {
    const v = Math.min(99, getQty() + 1);
    inp.value = v;
  });
  inp.addEventListener("change", () => {
    inp.value = Math.max(1, Math.min(99, Math.floor(Number(inp.value) || 1)));
  });
}

// ── Render ────────────────────────────────────────────────────────────────
function render(p) {
  document.title = `${p.name} — HANMUN`;

  // Image
  const img = document.querySelector("[data-product-image]");
  if (img) { img.src = p.imageUrl || ""; img.alt = p.name; }

  // Name + category
  setText("[data-product-name]", p.name);
  setText("[data-product-category-bc]", p.category || "Бараа");

  const catBadge = document.querySelector("[data-product-category]");
  if (catBadge && p.category) {
    catBadge.textContent = p.category;
    catBadge.hidden = false;
  }

  // Price
  setText("[data-product-price]", fmt(p.price));
  if (p.priceWas != null && p.priceWas > p.price) {
    const wasEl = document.querySelector("[data-product-price-was]");
    if (wasEl) { wasEl.textContent = fmt(p.priceWas); wasEl.hidden = false; }
    const pct = Math.round(((p.priceWas - p.price) / p.priceWas) * 100);
    if (pct > 0) {
      const offEl = document.querySelector("[data-product-off]");
      if (offEl) { offEl.textContent = `-${pct}%`; offEl.hidden = false; }
    }
  }

  // Stock
  const stockEl = document.querySelector("[data-product-stock]");
  if (stockEl) {
    if (p.stockQty > 10) {
      stockEl.textContent = "✓ Нөөцтэй";
      stockEl.className = "pdp__stockLine pdp__stockLine--ok";
    } else if (p.stockQty > 0) {
      stockEl.textContent = `⚠ Ойрхон дуусна — ${p.stockQty} үлдсэн`;
      stockEl.className = "pdp__stockLine pdp__stockLine--warn";
    } else {
      stockEl.textContent = "✗ Дууссан";
      stockEl.className = "pdp__stockLine pdp__stockLine--out";
    }
  }

  // Description
  setText("[data-product-description]", p.description || "");

  // Wishlist button
  const wishBtn = document.querySelector("[data-wish-btn]");
  if (wishBtn) {
    const updateWish = () => {
      const inList = isInWishlist(p.id);
      wishBtn.classList.toggle("wishBtn--active", inList);
      wishBtn.innerHTML = inList
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> Хадгалсан`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> Хадгалах`;
    };
    updateWish();
    wishBtn.addEventListener("click", () => {
      const added = toggleWishlist(p.id);
      showToast(added ? "Дуртай жагсаалтад нэмлээ ♡" : "Жагсаалтаас хаслаа", added ? "ok" : "");
      updateWish();
    });
  }

  // Buttons
  const btnCart = document.querySelector("[data-add-to-cart]");
  const btnBuy  = document.querySelector("[data-buy-now]");

  if (p.stockQty <= 0) {
    if (btnCart) { btnCart.disabled = true; btnCart.textContent = "Дууссан"; }
    if (btnBuy)  { btnBuy.disabled  = true; }
  }

  btnCart?.addEventListener("click", () => {
    addToLocalCart(p, getQty());
    showToast(`"${p.name}" сагсанд нэмлээ`, "ok");
    updateCartBadge();
    btnCart.textContent = "Нэмлээ ✓";
    setTimeout(() => {
      btnCart.textContent = "Сагсанд нэмэх";
    }, 1000);
  });

  btnBuy?.addEventListener("click", () => {
    addToLocalCart(p, getQty());
    window.location.href = "/checkout.html";
  });
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  initSearchNav();
  updateCartBadge();
  initQty();

  // wire voice search on this page
  const vsInput = document.querySelector("[data-search-input]");
  const vsBtn   = document.querySelector("[data-voice-search]");
  initVoiceSearch(vsInput, vsBtn);

  const id = getProductId();
  if (!id) {
    show("[data-skeleton]", false);
    show("[data-error]", true);
    return;
  }

  try {
    const p = await fetchProduct(id);
    show("[data-skeleton]", false);
    show("[data-pdp]", true);
    render(p);
    loadRelated(p);
    addRecentlyViewed(p); // recently viewed track
    const reviewsEl = document.querySelector("[data-reviews-container]");
    const user = FIREBASE_READY ? getAuth_()?.currentUser : null;
    initReviews(p.id, reviewsEl, user);
  } catch {
    show("[data-skeleton]", false);
    show("[data-error]", true);
  }
}

async function loadRelated(p) {
  const sec = document.querySelector("[data-related-section]");
  if (!sec) return;
  try {
    const data = await apiJson(`/api/products?category=${encodeURIComponent(p.category)}`);
    const others = (data.items || []).filter(x => x.id !== p.id).slice(0, 4);
    if (!others.length) return;
    sec.hidden = false;
    const grid = sec.querySelector("[data-related-grid]");
    if (!grid) return;
    const fmt = (v) => `$${Number(v).toFixed(2)}`;
    grid.innerHTML = others.map(r => `
      <a class="relCard" href="/product/${encodeURIComponent(r.id)}">
        <div class="relCard__img"><img src="${r.imageUrl}" alt="${r.name}" loading="lazy"/></div>
        <div class="relCard__body">
          <div class="relCard__name">${r.name}</div>
          <div class="relCard__price">${fmt(r.price)}</div>
        </div>
      </a>`).join("");
  } catch {}
}

main();
