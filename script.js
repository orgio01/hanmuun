const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function formatMoney(value) {
  return `$${value.toFixed(2)}`;
}

function getCartId() {
  const k = "mvp_cart_id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = `cart_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(k, id);
  }
  return id;
}

async function apiJson(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = data?.error?.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function svgPlaceholder({ title, a = "#6a7dff", b = "#2ee6a6" }) {
  const safeTitle = String(title || "Product").slice(0, 34);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${a}" stop-opacity="0.9"/>
          <stop offset="1" stop-color="${b}" stop-opacity="0.85"/>
        </linearGradient>
        <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="20"/>
        </filter>
      </defs>
      <rect width="960" height="600" fill="#0b1220"/>
      <circle cx="220" cy="140" r="140" fill="url(#g)" filter="url(#blur)" opacity="0.9"/>
      <circle cx="760" cy="180" r="170" fill="url(#g)" filter="url(#blur)" opacity="0.55"/>
      <circle cx="530" cy="520" r="190" fill="url(#g)" filter="url(#blur)" opacity="0.35"/>
      <rect x="60" y="60" width="840" height="480" rx="36" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)"/>
      <text x="110" y="330" fill="rgba(255,255,255,0.86)" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-weight="800" font-size="44">
        ${safeTitle}
      </text>
      <text x="110" y="380" fill="rgba(255,255,255,0.62)" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-weight="650" font-size="22">
        Image placeholder
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Reusable product card component.
 * @param {{id:string, name:string, price:number, imageUrl:string, badge?:string, badgeTone?:string, priceWas?:number, endsAt?:number}} product
 */
function createProductCard(product) {
  const el = document.createElement("article");
  el.className = "card";
  el.dataset.id = product.id;
  el.dataset.productId = product.id;
  if (product.endsAt) el.dataset.endsAt = String(product.endsAt);

  const priceNow = formatMoney(product.price);
  const priceWas = product.priceWas != null ? formatMoney(product.priceWas) : null;

  let offPct = null;
  if (product.priceWas && product.priceWas > 0) {
    offPct = Math.max(
      1,
      Math.min(95, Math.round(((product.priceWas - product.price) / product.priceWas) * 100)),
    );
  }

  const pillClass = product.badgeTone ? `pill--${product.badgeTone}` : "";

  const DELIVERY_LABELS = {
    "24h":           { icon: "⚡", text: "24 цагт хүргэнэ" },
    "express":       { icon: "🏎️", text: "Express хүргэлт" },
    "international": { icon: "✈️", text: "7-14 хоногт ирнэ" },
    "reorder":       { icon: "🔄", text: "Дахин захиалах" },
  };
  const dl = DELIVERY_LABELS[product.deliveryType] || null;

  el.innerHTML = `
    <a class="card__imgLink" href="/product/${encodeURIComponent(product.id)}" tabindex="-1" aria-hidden="true">
      <div class="card__imgWrap">
        <img class="card__img" alt="${esc(product.name)}" src="${esc(product.imageUrl)}" loading="lazy" />
        ${
          product.badge
            ? `<span class="pill card__imgBadge ${pillClass}">${product.badge}</span>`
            : ""
        }
      </div>
    </a>

    <div class="card__body">
      <h3 class="card__title">
        <a class="card__titleLink" href="/product/${encodeURIComponent(product.id)}">${esc(product.name)}</a>
      </h3>

      <div class="card__price">
        <div class="price">
          <span class="price__now">${priceNow}</span>
          ${priceWas ? `<span class="price__was">${priceWas}</span>` : ""}
          ${offPct ? `<span class="price__off">-${offPct}%</span>` : ""}
        </div>
        ${
          product.endsAt
            ? `<span class="countdown" aria-label="Offer ends soon" data-countdown>--:--:--</span>`
            : ""
        }
      </div>

      ${dl ? `<div class="card__delivery"><span class="card__deliveryIcon">${dl.icon}</span>${dl.text}</div>` : ""}
      <div class="card__cta">
        <button class="mini-btn mini-btn--primary" type="button" data-add-to-cart>
          Сагсанд нэмэх
        </button>
        <a class="link" href="/product/${encodeURIComponent(product.id)}" aria-label="View ${product.name}">Үзэх</a>
        <button class="wishBtn" type="button" data-wish-toggle="${product.id}" aria-label="Дуртай жагсаалтад нэмэх"></button>
      </div>
    </div>
  `.trim();

  return el;
}

function renderSection(sectionKey, products) {
  const grid = document.querySelector(`[data-section="${sectionKey}"]`);
  if (!grid) return;
  grid.replaceChildren(...products.map(createProductCard));
}

function initCountdowns() {
  const cards = $$("[data-ends-at]");
  if (!cards.length) return () => {};

  const tick = () => {
    const now = Date.now();
    for (const card of cards) {
      const endsAt = Number(card.getAttribute("data-ends-at"));
      const label = card.querySelector("[data-countdown]");
      if (!label) continue;
      label.textContent = formatCountdown(endsAt - now);
    }
  };

  tick();
  const id = window.setInterval(tick, 250);
  return () => window.clearInterval(id);
}

function initMenu() {
  const triggers = $$("[data-menu-trigger]");
  const sidebar = $("[data-sidebar]");
  const backdrop = $("[data-backdrop]");
  if (!triggers.length || !sidebar || !backdrop) return;

  let lastFocus = null;
  let hoverCloseT = null;

  const open = () => {
    lastFocus = document.activeElement;
    triggers.forEach((t) => t.setAttribute?.("aria-expanded", "true"));
    sidebar.setAttribute("aria-hidden", "false");
    sidebar.classList.add("is-open");

    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.classList.add("is-open"));
  };

  const close = () => {
    triggers.forEach((t) => t.setAttribute?.("aria-expanded", "false"));
    sidebar.setAttribute("aria-hidden", "true");
    sidebar.classList.remove("is-open");
    backdrop.classList.remove("is-open");

    window.setTimeout(() => {
      backdrop.hidden = true;
    }, 220);

    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  };

  const isOpen = () => sidebar.classList.contains("is-open");

  const positionUnder = (el) => {
    if (!el?.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    sidebar.style.top = `${Math.round(r.bottom + gap)}px`;
    sidebar.style.left = `${Math.round(r.left)}px`;
    // Keep within viewport a bit
    const maxH = Math.max(180, window.innerHeight - (r.bottom + gap) - 16);
    sidebar.style.maxHeight = `${Math.round(maxH)}px`;
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      // Keep click toggle for touch devices / bottom nav menu button.
      if (trigger.matches?.("[data-cat-trigger]")) positionUnder(trigger);
      if (isOpen()) close();
      else open();
    });
  });

  backdrop.addEventListener("click", close);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      e.preventDefault();
      close();
    }
  });

  const catTrigger = document.querySelector("[data-cat-trigger]");
  if (catTrigger) {
    window.addEventListener("scroll", () => {
      if (!isOpen()) return;
      positionUnder(catTrigger);
    });
    window.addEventListener("resize", () => {
      if (!isOpen()) return;
      positionUnder(catTrigger);
    });
  }
}

function initBanner() {
  initCarousel({
    track: $("[data-banner-track]"),
    dots: $("[data-banner-dots]"),
    slideSelector: ".banner__slide",
    dotClass: "bannerDot",
    intervalMs: 2000,
  });
}

function initCarousel({ track, dots, slideSelector, dotClass, intervalMs = 4500 }) {
  if (!track || !dots) return;
  const slides = $$(slideSelector, track);
  if (!slides.length) return;

  let idx = 0;
  let timer = null;

  const go = (i) => {
    idx = (i + slides.length) % slides.length;
    slides.forEach((s, j) => s.classList.toggle("is-active", j === idx));
    dotBtns.forEach((d, j) => d.classList.toggle("is-active", j === idx));
  };

  dots.replaceChildren(
    ...slides.map((_, i) => {
      const b = document.createElement("button");
      b.className = dotClass;
      b.type = "button";
      b.setAttribute("aria-label", `Go to slide ${i + 1}`);
      b.addEventListener("click", () => {
        go(i);
        restart();
      });
      return b;
    }),
  );

  const dotBtns = $$(`.${dotClass}`, dots);

  const restart = () => {
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(() => go(idx + 1), intervalMs);
  };

  go(0);
  restart();

  track.addEventListener("mouseenter", () => timer && window.clearInterval(timer));
  track.addEventListener("mouseleave", restart);
}

function initHeroCarousel() {
  initCarousel({
    track: $("[data-hero-track]"),
    dots: $("[data-hero-dots]"),
    slideSelector: ".hero__slide",
    dotClass: "heroDot",
    intervalMs: 5200,
  });
}

// ── Toast (home page inline version) ─────────────────────────────────────────
let _toastWrap = null;
function getToastWrap() {
  if (!_toastWrap) {
    _toastWrap = document.createElement("div");
    _toastWrap.className = "toastWrap";
    document.body.appendChild(_toastWrap);
  }
  return _toastWrap;
}
function showToast(msg, tone) {
  const wrap = getToastWrap();
  const el = document.createElement("div");
  el.className = `toast${tone ? ` toast--${tone}` : ""}`;
  el.textContent = msg;
  wrap.appendChild(el);
  window.setTimeout(() => {
    el.classList.add("is-out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 2400);
}

// ── Cart badge ─────────────────────────────────────────────────────────────
function updateCartBadge() {
  const badges = $$("[data-cart-badge]");
  if (!badges.length) return;
  apiJson(`/api/cart?cartId=${encodeURIComponent(getCartId())}`)
    .then((data) => {
      const count = (data.items || []).reduce((s, i) => s + i.qty, 0);
      for (const b of badges) {
        b.textContent = String(count);
        b.hidden = count === 0;
      }
    })
    .catch(() => {});
}

// ── Voice search (home page) ───────────────────────────────────────────────
function initVoiceSearch() {
  const input = $("#searchInput");
  const btn = $("[data-voice-search]");
  if (!input || !btn) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.hidden = true; return; }

  const rec = new SR();
  rec.lang = "mn-MN";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let active = false;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (active) { rec.stop(); return; }
    try { rec.start(); } catch { /* already running */ }
  });

  rec.onstart = () => {
    active = true;
    btn.classList.add("is-listening");
    btn.setAttribute("aria-label", "Зогсоох");
  };

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  rec.onend = () => {
    active = false;
    btn.classList.remove("is-listening");
    btn.setAttribute("aria-label", "Дуу хоолойгоор хайх");
  };

  rec.onerror = () => {
    active = false;
    btn.classList.remove("is-listening");
    btn.setAttribute("aria-label", "Дуу хоолойгоор хайх");
    showToast("Микрофон авах боломжгүй", "warn");
  };
}

// ── URL search param (navigate from other pages with ?q=...) ────────────────
function initSearchFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  if (!q) return;
  const input = $("#searchInput");
  if (!input) return;
  input.value = q;
  window.setTimeout(() => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 350);
}

function syncWishButtons() {
  // dynamically import storage to avoid top-level module issue in non-module script
  import("./js/storage.js").then(({ getWishlist }) => {
    const list = getWishlist();
    $$("[data-wish-toggle]").forEach(btn => {
      const id = btn.dataset.wishToggle;
      btn.classList.toggle("wishBtn--active", list.includes(id));
      btn.innerHTML = list.includes(id)
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    });
  }).catch(() => {});
}

function initInteractions() {
  const search = $(".search");
  if (search) {
    search.addEventListener("submit", (e) => {
      e.preventDefault();
      $("#searchInput")?.blur();
    });
  }

  // Wishlist toggle on product cards
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-wish-toggle]");
    if (!btn) return;
    import("./js/storage.js").then(({ toggleWishlist }) => {
      const added = toggleWishlist(btn.dataset.wishToggle);
      showToast(added ? "Дуртай жагсаалтад нэмлээ ♡" : "Жагсаалтаас хаслаа", added ? "ok" : "");
      syncWishButtons();
    }).catch(() => {});
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add-to-cart]");
    if (!btn) return;

    const card = btn.closest(".card");
    const productId = card?.dataset?.productId;
    if (!productId) return;

    btn.textContent = "Нэмж байна…";
    btn.setAttribute("disabled", "true");

    apiJson("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ cartId: getCartId(), productId, qty: 1 }),
    })
      .then(() => {
        btn.textContent = "Нэмлээ ✓";
        showToast("Сагсанд нэмлээ", "ok");
        updateCartBadge();
        window.setTimeout(() => {
          btn.textContent = "Сагсанд нэмэх";
          btn.removeAttribute("disabled");
        }, 900);
      })
      .catch(() => {
        btn.textContent = "Дахин оролдох";
        showToast("Алдаа гарлаа", "warn");
        window.setTimeout(() => {
          btn.textContent = "Сагсанд нэмэх";
          btn.removeAttribute("disabled");
        }, 900);
      });
  });
}

function tokenize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  const n = s.length;
  const m = t.length;
  if (!n) return m;
  if (!m) return n;

  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // delete
        dp[i][j - 1] + 1, // insert
        dp[i - 1][j - 1] + cost, // replace
      );
    }
  }
  return dp[n][m];
}

function fuzzyScore(queryTokens, productTokens) {
  // Higher is better. We reward prefix/substring, then fuzzy (edit distance).
  let score = 0;
  for (const q of queryTokens) {
    let best = -Infinity;
    for (const w of productTokens) {
      if (w === q) best = Math.max(best, 12);
      else if (w.startsWith(q)) best = Math.max(best, 9);
      else if (w.includes(q)) best = Math.max(best, 6);
      else {
        // fuzzy only for reasonable token lengths
        if (q.length >= 3 && w.length >= 3) {
          const d = editDistance(q, w);
          const maxLen = Math.max(q.length, w.length);
          const sim = 1 - d / maxLen; // 0..1
          best = Math.max(best, sim * 5); // up to 5 points
        }
      }
    }
    score += best > 0 ? best : 0;
  }
  return score;
}

function initSearchSuggest(getProducts) {
  const input = $("#searchInput");
  const box = $("[data-search-suggest]");
  if (!input || !box) return;

  let activeIdx = -1;

  const close = () => {
    box.hidden = true;
    box.innerHTML = "";
    activeIdx = -1;
  };

  const getItems = () => $$(".searchSuggest__item", box);

  const setActive = (idx) => {
    const items = getItems();
    items.forEach((el, i) => el.classList.toggle("is-active", i === idx));
    activeIdx = idx;
    if (idx >= 0) items[idx]?.scrollIntoView({ block: "nearest" });
  };

  const render = (products) => {
    if (!products.length) return close();

    box.hidden = false;
    box.innerHTML = products
      .map((p) => {
        const img = p.imageUrl
          ? `<img class="searchSuggest__img" src="${p.imageUrl}" alt="" loading="lazy" />`
          : `<div class="searchSuggest__imgPlaceholder"></div>`;
        const badge = p.badge
          ? `<span class="searchSuggest__badge">${p.badge}</span>`
          : "";
        const was = p.priceWas
          ? `<span class="searchSuggest__was">${formatMoney(p.priceWas)}</span>`
          : "";
        return `
          <a class="searchSuggest__item" href="/product/${encodeURIComponent(p.id)}">
            ${img}
            <div class="searchSuggest__main">
              <div class="searchSuggest__name">${p.name}</div>
              ${badge}
            </div>
            <div class="searchSuggest__priceWrap">
              <span class="searchSuggest__price">${formatMoney(p.price)}</span>
              ${was}
            </div>
          </a>
        `.trim();
      })
      .join("");
  };

  input.addEventListener("input", async () => {
    const q = String(input.value || "").trim();
    if (q.length < 1) return close();

    const tokens = tokenize(q);
    if (!tokens.length) return close();

    const products = await getProducts();
    const ranked = products
      .map((p) => {
        const words = tokenize(`${p.name} ${p.description || ""}`);
        return { p, score: fuzzyScore(tokens, words) };
      })
      .filter((x) => x.score >= 3)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);

    render(ranked.slice(0, 7));
  });

  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    const items = getItems();
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIdx + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(activeIdx <= 0 ? items.length - 1 : activeIdx - 1);
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      items[activeIdx]?.click();
    } else if (e.key === "Escape") {
      close();
      input.blur();
    }
  });

  input.addEventListener("blur", () => window.setTimeout(close, 150));
}


function setHeaderVar() {
  const h = (document.querySelector(".topbar")?.offsetHeight || 0) +
            (document.querySelector(".quickNav")?.offsetHeight || 0);
  document.documentElement.style.setProperty("--header-h", h + "px");
}

let _bannerInited = false;
let _bannerTimer  = null; // carousel interval — leak сэргийлэх

function stopBannerTimer() {
  if (_bannerTimer) { window.clearInterval(_bannerTimer); _bannerTimer = null; }
}

function renderBannerSlides(banners) {
  const track = $("[data-banner-track]");
  const dots  = $("[data-banner-dots]");
  if (!track || !banners.length) return false;

  // createElement ашиглана — base64 HTML-д задрахгүй
  track.innerHTML = "";
  banners.forEach((b, i) => {
    const slide = document.createElement("div");
    slide.className = "banner__slide" + (i === 0 ? " is-active" : "");

    if (b.imageUrl) {
      // Зураг img tag-аар оруулна (background-image CSS биш)
      const img = document.createElement("img");
      img.src = b.imageUrl;
      img.alt = "";
      img.style.cssText = [
        "position:absolute", "inset:0",
        "width:100%", "height:100%",
        "object-fit:cover", "object-position:center",
        "display:block",
      ].join(";");
      slide.style.position = "relative";
      slide.appendChild(img);

      // Бага зэрэг overlay
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,0,0,.15),rgba(0,0,0,.02));pointer-events:none";
      slide.appendChild(overlay);
    }

    track.appendChild(slide);
  });

  if (dots) dots.innerHTML = "";
  return true;
}

async function loadFirebaseBanners() {
  try {
    const { FIREBASE_READY, watchBanners } = await import("./js/firebase.js");
    if (!FIREBASE_READY) return false;

    watchBanners((banners) => {
      stopBannerTimer(); // хуучин interval цэвэрлэх
      if (!banners.length) {
        initBanner(); _bannerInited = true; return;
      }
      if (renderBannerSlides(banners)) {
        initBanner();
        _bannerInited = true;
      }
    });

    return true;
  } catch { return false; }
}

async function main() {
  initMenu();
  initInteractions();
  // Hero section устгасан — initHeroCarousel хэрэггүй
  initVoiceSearch();
  updateCartBadge();
  setHeaderVar();
  window.addEventListener("resize", setHeaderVar);

  // Banner: Firebase real-time listener эхлүүлнэ
  // watchBanners callback дотор initBanner дуудагдана
  const fbStarted = await loadFirebaseBanners();
  if (!fbStarted) { initBanner(); _bannerInited = true; }

  let productsCache = null;
  const getProducts = async () => {
    if (productsCache) return productsCache;
    // 1) Firestore
    try {
      const { fetchAllProducts, FIREBASE_READY } = await import("./js/firebase.js");
      if (FIREBASE_READY) {
        productsCache = await fetchAllProducts();
        return productsCache;
      }
    } catch {}
    // 2) Local API fallback
    try {
      const out = await apiJson("/api/products");
      productsCache = out.items || [];
    } catch {
      productsCache = [];
    }
    return productsCache;
  };

  initSearchSuggest(getProducts);
  initSearchFromUrl();

  // Sections хожим нэмэгдэнэ

  initCountdowns();
  syncWishButtons();
}

document.addEventListener("DOMContentLoaded", main);

