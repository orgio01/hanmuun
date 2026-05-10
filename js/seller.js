import { FIREBASE_READY, getAuth_, registerSeller, getSellerProfile } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const qs = (sel) => document.querySelector(sel);

function showErr(sel, msg) {
  const el = qs(sel);
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

function setBtn(sel, text, disabled) {
  const el = qs(sel);
  if (!el) return;
  el.textContent = text;
  el.disabled = disabled;
}

// ── Tab switch ─────────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll("[data-tab]").forEach(t =>
    t.classList.toggle("is-active", t.dataset.tab === name));
  document.querySelectorAll("[data-pane]").forEach(p =>
    p.style.display = p.dataset.pane === name ? "block" : "none");
}

document.querySelectorAll("[data-tab]").forEach(t =>
  t.addEventListener("click", () => showTab(t.dataset.tab)));
document.querySelectorAll("[data-switch]").forEach(b =>
  b.addEventListener("click", () => showTab(b.dataset.switch)));

// Init: show login pane
showTab("login");

// ── Login ──────────────────────────────────────────────────────────────────
qs("[data-login-btn]")?.addEventListener("click", async () => {
  const email = qs("#slEmail")?.value.trim();
  const pass  = qs("#slPass")?.value;
  showErr("[data-login-error]", "");

  if (!email || !pass) {
    showErr("[data-login-error]", "И-мэйл болон нууц үгийг оруулна уу.");
    return;
  }

  setBtn("[data-login-btn]", "Нэвтэрж байна…", true);

  try {
    if (!FIREBASE_READY) throw new Error("Firebase тохируулагдаагүй байна.");

    const cred = await signInWithEmailAndPassword(getAuth_(), email, pass);
    const seller = await getSellerProfile(cred.user.uid).catch(() => null);

    if (!seller) {
      await signOut(getAuth_());
      throw new Error("Seller эрх байхгүй байна. Эхлээд хүсэлт гаргана уу.");
    }
    if (!seller.approved) {
      await signOut(getAuth_());
      throw new Error("Таны хүсэлт admin-ийн хүлээлтэд байна. Зөвшөөрсний дараа нэвтэрч болно.");
    }

    window.location.href = "/seller/dashboard";

  } catch (e) {
    const msgs = {
      "auth/user-not-found":     "И-мэйл олдсонгүй.",
      "auth/wrong-password":     "Нууц үг буруу байна.",
      "auth/invalid-credential": "И-мэйл эсвэл нууц үг буруу.",
      "auth/too-many-requests":  "Хэт олон оролдлого. Түр хүлээнэ үү.",
    };
    showErr("[data-login-error]", msgs[e.code] || e.message || "Алдаа гарлаа.");
    setBtn("[data-login-btn]", "Нэвтрэх", false);
  }
});

// ── Register ───────────────────────────────────────────────────────────────
qs("[data-reg-btn]")?.addEventListener("click", async () => {
  const shop  = qs("#slShop")?.value.trim();
  const email = qs("#slRegEmail")?.value.trim();
  const pass  = qs("#slRegPass")?.value;
  const phone = qs("#slPhone")?.value.trim();
  showErr("[data-reg-error]", "");

  if (!shop)           return showErr("[data-reg-error]", "Дэлгүүрийн нэрийг оруулна уу.");
  if (!email)          return showErr("[data-reg-error]", "И-мэйл хаягийг оруулна уу.");
  if (!pass || pass.length < 8) return showErr("[data-reg-error]", "Нууц үг 8+ тэмдэгт байх ёстой.");
  if (!phone)          return showErr("[data-reg-error]", "Утасны дугаарыг оруулна уу.");

  setBtn("[data-reg-btn]", "Илгээж байна…", true);

  try {
    if (!FIREBASE_READY) throw new Error("Firebase тохируулагдаагүй байна.");

    const cred = await createUserWithEmailAndPassword(getAuth_(), email, pass);
    await updateProfile(cred.user, { displayName: shop });
    await registerSeller(cred.user.uid, { shopName: shop, email, phone, approved: false });
    await signOut(getAuth_());

    setBtn("[data-reg-btn]", "Илгээгдлээ ✓", true);
    qs("[data-reg-btn]").style.background = "#16a34a";

    const pane = qs("[data-pane='register']");
    if (pane) {
      const msg = document.createElement("p");
      msg.style.cssText = "background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;padding:12px;border-radius:6px;font-weight:700;margin-top:14px;font-size:.86rem";
      msg.textContent = "✓ Хүсэлт амжилттай илгээгдлээ! Admin зөвшөөрсний дараа нэвтрэх боломжтой болно.";
      pane.appendChild(msg);
    }

  } catch (e) {
    const msgs = { "auth/email-already-in-use": "Энэ и-мэйл аль хэдийн бүртгэлтэй." };
    showErr("[data-reg-error]", msgs[e.code] || e.message || "Алдаа гарлаа.");
    setBtn("[data-reg-btn]", "Хүсэлт илгээх", false);
  }
});
