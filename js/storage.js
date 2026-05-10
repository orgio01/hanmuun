function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getCartId() {
  const k = "mvp_cart_id";
  let id = localStorage.getItem(k);
  if (!id) { id = makeId("cart"); localStorage.setItem(k, id); }
  return id;
}

// ── Order history ─────────────────────────────────────────────────────────
const ORDERS_KEY = "mvp_order_history";

export function setLastOrderNumber(orderNumber) {
  if (!orderNumber) return;
  localStorage.setItem("mvp_last_order", String(orderNumber));
  addOrderToHistory(orderNumber);
}

export function getLastOrderNumber() {
  return localStorage.getItem("mvp_last_order") || "";
}

export function addOrderToHistory(orderNumber) {
  if (!orderNumber) return;
  const list = getOrderHistory();
  if (!list.includes(orderNumber)) {
    list.unshift(orderNumber);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 50)));
  }
}

export function getOrderHistory() {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]"); }
  catch { return []; }
}

// ── Profile ───────────────────────────────────────────────────────────────
const PROFILE_KEY = "mvp_profile_v1";

export function getProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); }
  catch { return null; }
}
export function setProfile(p) { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }
export function clearProfile() { localStorage.removeItem(PROFILE_KEY); }

// ── Wishlist ──────────────────────────────────────────────────────────────
const WISH_KEY = "mvp_wishlist_v1";

export function getWishlist() {
  try { return JSON.parse(localStorage.getItem(WISH_KEY) || "[]"); }
  catch { return []; }
}

export function toggleWishlist(productId) {
  const list = getWishlist();
  const idx  = list.indexOf(productId);
  if (idx >= 0) list.splice(idx, 1); else list.unshift(productId);
  localStorage.setItem(WISH_KEY, JSON.stringify(list));
  return idx < 0; // true = added
}

export function isInWishlist(productId) {
  return getWishlist().includes(productId);
}

export function clearWishlist() {
  localStorage.removeItem(WISH_KEY);
}

// ── Recent searches ───────────────────────────────────────────────────────
const SEARCH_KEY = "mvp_recent_searches";

export function addRecentSearch(q) {
  if (!q?.trim()) return;
  const list = getRecentSearches().filter(s => s !== q);
  list.unshift(q.trim());
  localStorage.setItem(SEARCH_KEY, JSON.stringify(list.slice(0, 8)));
}

export function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(SEARCH_KEY) || "[]"); }
  catch { return []; }
}

// ── Recently viewed ──────────────────────────────────────────────────────
const RECENT_KEY = "mvp_recently_viewed";

export function addRecentlyViewed(product) {
  if (!product?.id) return;
  try {
    let list = getRecentlyViewed();
    list = list.filter(p => p.id !== product.id);
    list.unshift({ id: product.id, name: product.name, price: product.price, imageUrl: product.imageUrl, category: product.category });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {}
}

export function getRecentlyViewed() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
  catch { return []; }
}

// ── Local Cart (localStorage — server хэрэггүй) ──────────────────────────
const CART_KEY = "mvp_cart_v2";

export function getLocalCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
  catch { return []; }
}

export function addToLocalCart(product, qty = 1) {
  const cart = getLocalCart();
  const idx  = cart.findIndex(i => i.productId === product.id);
  if (idx >= 0) {
    cart[idx].qty = Math.min(99, cart[idx].qty + qty);
  } else {
    cart.push({
      productId:  product.id,
      name:       product.name,
      price:      product.price,
      imageUrl:   product.imageUrl || "",
      sellerId:   product.sellerId   || "",
      sellerName: product.sellerName || "",
      qty,
    });
  }
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function updateLocalCartQty(productId, qty) {
  const cart = getLocalCart().map(i => i.productId === productId ? { ...i, qty } : i).filter(i => i.qty > 0);
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function removeFromLocalCart(productId) {
  const cart = getLocalCart().filter(i => i.productId !== productId);
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function clearLocalCart() {
  localStorage.removeItem(CART_KEY);
}

export function localCartCount() {
  return getLocalCart().reduce((s, i) => s + i.qty, 0);
}

/** HTML-д оруулахаас өмнө XSS-ийг сэргийлэх */
export function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
