import { FIREBASE_READY, getAuth_, registerSeller, getSellerProfile } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const qs  = (sel) => document.querySelector(sel);
const err = (sel, msg) => { const el = qs(sel); if (!el) return; el.textContent = msg; el.hidden = !msg; };

// ── Tab switch ────────────────────────────────────────────────────────────
document.querySelectorAll("[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    document.querySelectorAll("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== btn.dataset.tab);
  });
});
document.querySelectorAll("[data-switch]").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.switch;
    document.querySelectorAll("[data-tab]").forEach(t => t.classList.toggle("is-active", t.dataset.tab === target));
    document.querySelectorAll("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== target);
  });
});

// ── Login — зөвхөн approved seller нэвтэрч чадна ─────────────────────────
qs("[data-login-btn]")?.addEventListener("click", async () => {
  const email = qs("#slEmail")?.value.trim();
  const pass  = qs("#slPass")?.value;
  err("[data-login-error]", "");

  if (!email || !pass) return err("[data-login-error]", "И-мэйл болон нууц үгийг оруулна уу.");

  const btn = qs("[data-login-btn]");
  btn.disabled = true; btn.textContent = "Нэвтэрж байна…";

  try {
    if (!FIREBASE_READY) throw new Error("Firebase тохируулагдаагүй байна.");

    const cred = await signInWithEmailAndPassword(getAuth_(), email, pass);

    const seller = await getSellerProfile(cred.user.uid).catch(() => null);

    if (!seller) {
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js")
        .then(m => m.signOut(getAuth_()));
      throw new Error("Seller эрх байхгүй байна. Эхлээд хүсэлт гаргана уу.");
    }

    if (!seller.approved) {
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js")
        .then(m => m.signOut(getAuth_()));
      throw new Error("Таны хүсэлт admin-ийн хүлээлтэд байна. Зөвшөөрсний дараа нэвтрэх боломжтой болно.");
    }

    window.location.href = "/seller/dashboard";
  } catch (e) {
    const map = {
      "auth/user-not-found":     "И-мэйл олдсонгүй.",
      "auth/wrong-password":     "Нууц үг буруу байна.",
      "auth/invalid-credential": "И-мэйл эсвэл нууц үг буруу.",
      "auth/too-many-requests":  "Хэт олон оролдлого. Хэсэг хүлээнэ үү.",
    };
    err("[data-login-error]", map[e.code] || e.message);
    btn.disabled = false; btn.textContent = "Нэвтрэх";
  }
});

// ── Seller хүсэлт гаргах (approved: false — admin зөвшөөрөхийг хүлээнэ) ──
qs("[data-reg-btn]")?.addEventListener("click", async () => {
  const shop  = qs("#slShop")?.value.trim();
  const email = qs("#slRegEmail")?.value.trim();
  const pass  = qs("#slRegPass")?.value;
  const phone = qs("#slPhone")?.value.trim();
  err("[data-reg-error]", "");

  if (!shop)           return err("[data-reg-error]", "Дэлгүүрийн нэрийг оруулна уу.");
  if (!email)          return err("[data-reg-error]", "И-мэйл хаягийг оруулна уу.");
  if (pass.length < 8) return err("[data-reg-error]", "Нууц үг 8+ тэмдэгт байх ёстой.");
  if (!phone)          return err("[data-reg-error]", "Утасны дугаарыг оруулна уу.");

  const btn = qs("[data-reg-btn]");
  btn.disabled = true; btn.textContent = "Илгээж байна…";

  try {
    if (!FIREBASE_READY) throw new Error("Firebase тохируулагдаагүй байна.");

    const cred = await createUserWithEmailAndPassword(getAuth_(), email, pass);
    await updateProfile(cred.user, { displayName: shop });

    await registerSeller(cred.user.uid, {
      shopName: shop, email, phone, description: "",
      approved: false,
    });

    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js")
      .then(m => m.signOut(getAuth_()));

    err("[data-reg-error]", "");
    btn.textContent = "Илгээгдлээ ✓";
    btn.style.background = "#16a34a";

    // Success message
    const pane = qs("[data-pane='register']");
    if (pane) {
      const msg = document.createElement("p");
      msg.style.cssText = "background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.22);color:#15803d;padding:12px;font-weight:700;margin-top:12px;font-size:.88rem";
      msg.textContent = "✓ Хүсэлт амжилттай илгээгдлээ! Admin зөвшөөрсний дараа нэвтрэх боломжтой болно.";
      pane.appendChild(msg);
    }

  } catch (e) {
    const map = { "auth/email-already-in-use": "Энэ и-мэйл аль хэдийн бүртгэлтэй." };
    err("[data-reg-error]", map[e.code] || e.message);
    btn.disabled = false; btn.textContent = "Хүсэлт илгээх";
  }
});
