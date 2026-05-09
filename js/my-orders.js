import { apiJson }                   from "./api.js";
import { getOrderHistory, getLastOrderNumber } from "./storage.js";
import { updateCartBadge, initSearchNav, showToast } from "./common.js";

const fmt = (v) => `$${Number(v).toFixed(2)}`;

const STATUS = {
  awaiting_payment: { label: "Төлбөр хүлээж байна", cls: "gray",   icon: "⏳" },
  processing:       { label: "Боловсруулж байна",    cls: "blue",   icon: "⚙️" },
  out_for_delivery: { label: "Хүргэлтэнд гарсан",   cls: "orange", icon: "🚚" },
  delivered:        { label: "Хүргэгдсэн",           cls: "green",  icon: "✅" },
  cancelled:        { label: "Цуцлагдсан",           cls: "red",    icon: "❌" },
};

const STEPS = ["awaiting_payment","processing","out_for_delivery","delivered"];

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const mn = ["1-р","2-р","3-р","4-р","5-р","6-р","7-р","8-р","9-р","10-р","11-р","12-р"];
  return `${d.getFullYear()} оны ${mn[d.getMonth()]} сарын ${d.getDate()}`;
}

// ── Progress bar ──────────────────────────────────────────────────────────
function progressHtml(status) {
  const cur = STEPS.indexOf(status);
  return `<div class="moProgress">
    ${STEPS.map((st, i) => `
      <div class="moProgress__step ${i < cur ? "is-done" : i === cur ? "is-current" : ""}">
        <div class="moProgress__dot">
          ${i < cur ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>` : ""}
        </div>
        <div class="moProgress__label">${STATUS[st]?.label?.split(" ")[0]}</div>
      </div>
      ${i < STEPS.length - 1 ? `<div class="moProgress__line ${i < cur ? "is-done" : ""}"></div>` : ""}
    `).join("")}
  </div>`;
}

// ── Order card ────────────────────────────────────────────────────────────
function buildCard(order) {
  const s = STATUS[order.status] || STATUS.awaiting_payment;
  return `
  <article class="moCard" data-status="${order.status}" data-order-num="${order.orderNumber}">
    <div class="moCard__head">
      <div class="moCard__id">
        <span class="moCard__idLabel">Захиалга №</span>
        <code class="moCard__idVal">${order.orderNumber}</code>
      </div>
      <span class="moBadge moBadge--${s.cls}">${s.icon} ${s.label}</span>
    </div>

    ${progressHtml(order.status)}

    <div class="moCard__items">
      ${(order.items || []).map(i => `
        <div class="moCard__item">
          <span class="moCard__itemName">${i.name}</span>
          <span class="moCard__itemMeta">${i.qty}ш · ${fmt(i.price)}</span>
        </div>
      `).join("")}
    </div>

    <div class="moCard__foot">
      <div class="moCard__meta">
        <span>📅 ${fmtDate(order.createdAt)}</span>
        <span>📍 ${order.customer?.district || "—"}</span>
      </div>
      <div class="moCard__total">
        Нийт: <strong>${fmt(order.totals?.total || 0)}</strong>
      </div>
    </div>

    <div class="moCard__actions">
      <button class="moCard__detailBtn" type="button" data-open-detail="${order.orderNumber}">
        Дэлгэрэнгүй харах
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
      ${order.status === "delivered" ? `
        <a class="moCard__reviewBtn" href="/product/${encodeURIComponent((order.items||[])[0]?.productId||"")}#reviews">
          ★ Үнэлгээ өгөх
        </a>` : ""}
    </div>
  </article>`;
}

// ── Inline order detail ───────────────────────────────────────────────────
async function openDetail(orderNumber) {
  const panel  = document.querySelector("[data-order-detail]");
  const title  = document.querySelector("[data-detail-num]");
  const body   = document.querySelector("[data-detail-body]");
  if (!panel) return;

  title.textContent = `Захиалга: ${orderNumber}`;
  body.innerHTML = `<div style="padding:20px;color:rgba(16,16,16,.45)">Уншиж байна…</div>`;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  try {
    const o = await apiJson(`/api/orders/${encodeURIComponent(orderNumber)}`);
    const s = STATUS[o.status] || STATUS.awaiting_payment;

    body.innerHTML = `
      <div class="moDetail__body">
        <div class="moDetail__section">
          <div class="moDetail__row"><b>Байдал</b><span class="moBadge moBadge--${s.cls}">${s.icon} ${s.label}</span></div>
          <div class="moDetail__row"><b>Хүргэлт</b><span>${o.shipment?.status || "—"} · ETA: ${o.shipment?.eta || "—"}</span></div>
          <div class="moDetail__row"><b>Огноо</b><span>${fmtDate(o.createdAt)}</span></div>
        </div>

        <div class="moDetail__section">
          <div class="moDetail__sectionTitle">Хэрэглэгч</div>
          <div class="moDetail__row"><b>Нэр</b><span>${o.customer?.name || "—"}</span></div>
          <div class="moDetail__row"><b>Утас</b><span>${o.customer?.phone || "—"}</span></div>
          <div class="moDetail__row"><b>Хаяг</b><span>${o.customer?.district || "—"}, ${o.customer?.addressLine || "—"}</span></div>
          ${o.customer?.notes ? `<div class="moDetail__row"><b>Тэмдэглэл</b><span>${o.customer.notes}</span></div>` : ""}
        </div>

        <div class="moDetail__section">
          <div class="moDetail__sectionTitle">Захиалсан бараа</div>
          ${(o.items || []).map(i => `
            <div class="moDetail__itemRow">
              <a class="moDetail__itemLink" href="/product/${encodeURIComponent(i.productId)}">${i.name}</a>
              <span>${i.qty}ш × ${fmt(i.price)} = <b>${fmt(i.price * i.qty)}</b></span>
            </div>
          `).join("")}
        </div>

        <div class="moDetail__section moDetail__totals">
          <div class="moDetail__row"><span>Барааны дүн</span><span>${fmt(o.totals?.subtotal || 0)}</span></div>
          <div class="moDetail__row"><span>Хүргэлт</span><span>${fmt(o.totals?.deliveryFee || 0)}</span></div>
          <div class="moDetail__row moDetail__row--total"><span>Нийт дүн</span><strong>${fmt(o.totals?.total || 0)}</strong></div>
        </div>
      </div>`;
  } catch (err) {
    body.innerHTML = `<div class="moDetail__error">Мэдээлэл ачаалж чадсангүй: ${err.message}</div>`;
  }
}

// ── Quick track form ──────────────────────────────────────────────────────
function initTrackForm() {
  const input = document.querySelector("[data-track-input]");
  const btn   = document.querySelector("[data-track-btn]");
  if (!btn || !input) return;

  const doTrack = () => {
    const num = input.value.trim().toUpperCase();
    if (!num) { input.focus(); return; }
    openDetail(num);
  };

  btn.addEventListener("click", doTrack);
  input.addEventListener("keydown", e => { if (e.key === "Enter") doTrack(); });

  // Pre-fill with last order if any
  const last = getLastOrderNumber();
  if (last) input.value = last;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  initSearchNav();
  updateCartBadge();
  initTrackForm();

  const listEl    = document.querySelector("[data-orders-list]");
  const loadingEl = document.querySelector("[data-loading]");
  const emptyEl   = document.querySelector("[data-empty]");
  const countEl   = document.querySelector("[data-order-count]");

  // Detail close
  document.querySelector("[data-detail-close]")?.addEventListener("click", () => {
    document.querySelector("[data-order-detail]").hidden = true;
  });

  // Open detail delegation
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-open-detail]");
    if (btn) openDetail(btn.dataset.openDetail);
  });

  const history = getOrderHistory();

  if (!history.length) {
    if (loadingEl) loadingEl.hidden = true;
    if (emptyEl)   emptyEl.hidden = false;
    if (countEl)   countEl.textContent = "0 захиалга";
    return;
  }

  // Fetch all
  const results = await Promise.allSettled(
    history.map(num => apiJson(`/api/orders/${encodeURIComponent(num)}`))
  );

  if (loadingEl) loadingEl.hidden = true;

  const orders = results.filter(r => r.status === "fulfilled").map(r => r.value).filter(Boolean);

  // Бүх хүсэлт амжилтгүй → сервер offline
  const failed = results.every(r => r.status === "rejected");
  if (!orders.length) {
    if (emptyEl) {
      emptyEl.hidden = false;
      if (failed && history.length) {
        const hint = emptyEl.querySelector(".moEmpty__hint");
        if (hint) hint.textContent = "Сервер холбогдохгүй байна. Интернэт шалгана уу.";
      }
    }
    if (countEl) countEl.textContent = "0 захиалга";
    return;
  }

  if (countEl) countEl.textContent = `${orders.length} захиалга`;

  // Tab counts
  const tabCounts = {};
  orders.forEach(o => { tabCounts[o.status] = (tabCounts[o.status] || 0) + 1; });
  document.querySelectorAll("[data-tab-count]").forEach(el => {
    const n = tabCounts[el.dataset.tabCount] || orders.length;
    el.textContent = n ? String(n) : "";
  });

  listEl.innerHTML = orders.map(buildCard).join("");

  // Tabs
  document.querySelectorAll("[data-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-tab]").forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const key = tab.dataset.tab;
      document.querySelectorAll("[data-status]").forEach(card => {
        card.hidden = key !== "all" && card.dataset.status !== key;
      });
    });
  });

  // Auto-open last order detail if coming from order confirmation
  const urlOrder = new URLSearchParams(window.location.search).get("order");
  if (urlOrder) openDetail(urlOrder);
}

main();
