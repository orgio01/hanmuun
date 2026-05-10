import { localCartCount } from "./storage.js";

// ── Cart badge (localStorage-с шууд) ───────────────────────────────────────
export function updateCartBadge() {
  const count = localCartCount();
  for (const b of document.querySelectorAll("[data-cart-badge]")) {
    b.textContent = String(count);
    b.hidden = count === 0;
  }
}

// ── Toast ───────────────────────────────────────────────────────────────────
let _wrap = null;
function toastWrap() {
  if (!_wrap) {
    _wrap = document.createElement("div");
    _wrap.className = "toastWrap";
    document.body.appendChild(_wrap);
  }
  return _wrap;
}

export function showToast(msg, tone = "") {
  const wrap = toastWrap();
  const el = document.createElement("div");
  el.className = `toast${tone ? ` toast--${tone}` : ""}`;
  el.textContent = msg;
  wrap.appendChild(el);
  window.setTimeout(() => {
    el.classList.add("is-out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 2400);
}

// ── Voice search ─────────────────────────────────────────────────────────────
export function initVoiceSearch(input, btn) {
  if (!input || !btn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.hidden = true; return; }

  const rec = new SR();
  // mn-MN дэмжихгүй бол en-US fallback
  rec.lang = "mn-MN";
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  rec.continuous = false;
  let active = false;

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (active) { rec.stop(); return; }
    // Mobile Safari: mic permission-г урьдчилж авах
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
      }
      rec.start();
    } catch { /* already running */ }
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

  rec.onerror = (e) => {
    active = false;
    btn.classList.remove("is-listening");
    btn.setAttribute("aria-label", "Дуу хоолойгоор хайх");
    if (e.error === "not-allowed") showToast("Микрофоны зөвшөөрөл байхгүй байна", "warn");
    else if (e.error === "network") showToast("Интернэт холболт шалгана уу", "warn");
    // Бусад алдаа чимээгүйхэн арилна
  };
}

// ── Search navigation (non-home pages → index.html?q=...) ───────────────────
export function initSearchNav() {
  const forms = document.querySelectorAll("[data-search-nav]");
  for (const form of forms) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("[data-search-input]");
      const q = (input?.value || "").trim();
      window.location.href = q
        ? `./index.html?q=${encodeURIComponent(q)}`
        : "./index.html";
    });
    const input = form.querySelector("[data-search-input]");
    const btn = form.querySelector("[data-voice-search]");
    initVoiceSearch(input, btn);
  }
}
