import { getProfile, setProfile, clearProfile } from "./storage.js";
import { initSearchNav, updateCartBadge, showToast } from "./common.js";
import { FIREBASE_READY } from "./firebase.js";

// ── Validators ────────────────────────────────────────────────────────────
const validatePhone = (v) =>
  /^\d{8}$/.test(String(v).trim()) ? "" : "Утасны дугаар 8 оронтой байх ёстой.";

const validateGmail = (v) => {
  const e = String(v).trim().toLowerCase();
  if (!e.endsWith("@gmail.com")) return "Gmail хаяг ашиглана уу (…@gmail.com).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "И-мэйл хаяг буруу байна.";
  return "";
};

const validatePassword = (v) => {
  const p = String(v);
  if (p.length < 8) return "Нууц үг 8+ тэмдэгт байх ёстой.";
  if (!/[A-Z]/.test(p)) return "Том үсэг орсон байх ёстой.";
  if (!/[^A-Za-z0-9]/.test(p)) return "Тусгай тэмдэгт орсон байх ёстой.";
  return "";
};

// ── Helpers ───────────────────────────────────────────────────────────────
const qs     = (sel) => document.querySelector(sel);
const qsId   = (id)  => document.getElementById(id);
const modeParam = () => {
  const m = (new URLSearchParams(window.location.search).get("mode") || "").toLowerCase();
  return m === "login" || m === "signup" ? m : "";
};
const nextParam = () => new URLSearchParams(window.location.search).get("next") || "";

function setError(msg) {
  const el = qs("[data-error]");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}
function setLoginError(msg) {
  const el = qs("[data-login-error]");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}
function setLoading(btn, on, text = "…") {
  if (!btn) return;
  btn.disabled = on;
  if (on) btn.dataset._origText = btn.textContent;
  btn.textContent = on ? text : (btn.dataset._origText || btn.textContent);
}

function setActiveLoginTab(name) {
  document.querySelectorAll("[data-login-tab]").forEach((t) => {
    const active = t.getAttribute("data-login-tab") === name;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll("[data-login-pane]").forEach((p) => {
    p.hidden = p.getAttribute("data-login-pane") !== name;
  });
}

function previewText(p) {
  return `${p.name} • ${p.phone} • ${p.email} • ${p.district}, ${p.addressLine}`;
}

// ── Auth state display (topbar) ───────────────────────────────────────────
async function syncAuthUI() {
  if (!FIREBASE_READY) return;
  try {
    const { onAuth } = await import("./auth.js");
    onAuth((user, profile) => {
      const loginLinks  = qs("[data-auth-login-links]");
      const userDisplay = qs("[data-auth-user]");
      if (user) {
        if (loginLinks)  loginLinks.hidden  = true;
        if (userDisplay) {
          userDisplay.hidden = false;
          const nameEl = userDisplay.querySelector("[data-auth-name]");
          if (nameEl) nameEl.textContent = profile?.name || user.displayName || user.email;
        }
      } else {
        if (loginLinks)  loginLinks.hidden  = false;
        if (userDisplay) userDisplay.hidden = true;
      }
    });
  } catch { /* Firebase not available */ }
}

// ── Login form ────────────────────────────────────────────────────────────
function initLoginForm(loginForm) {
  if (!loginForm) return;
  setActiveLoginTab("email");

  // Field helpers (clear / toggle password)
  loginForm.addEventListener("click", (e) => {
    const cf = e.target.closest("[data-clear-field]");
    if (cf) { e.preventDefault(); const el = qsId(cf.dataset.clearField); if (el) { el.value = ""; el.focus(); } return; }
    const tp = e.target.closest("[data-toggle-pw]");
    if (tp) { e.preventDefault(); const el = qsId(tp.dataset.togglePw); if (el) { el.type = el.type === "password" ? "text" : "password"; el.focus(); } return; }
    const tab = e.target.closest("[data-login-tab]");
    if (tab) { e.preventDefault(); setLoginError(""); setActiveLoginTab(tab.dataset.loginTab); }
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setLoginError("");

    const pane  = qs("[data-login-pane]:not([hidden])")?.dataset.loginPane || "email";
    const email = loginForm.querySelector("#loginEmail")?.value.trim() || "";
    const pw    = loginForm.querySelector("#loginPass")?.value || "";
    const phone = loginForm.querySelector("#loginPhone")?.value.trim() || "";
    const btn   = loginForm.querySelector("[type=submit]");

    if (pane === "email") {
      if (!email) return setLoginError("И-мэйл хаяг оруулна уу.");
      if (!pw)    return setLoginError("Нууц үг оруулна уу.");
    }
    if (pane === "phone") {
      const err = validatePhone(phone);
      if (err) return setLoginError(err);
    }

    setLoading(btn, true, "Нэвтэрж байна…");

    try {
      if (FIREBASE_READY && pane === "email") {
        // ── Firebase Auth login ──
        const { signIn } = await import("./auth.js");
        const { profile } = await signIn(email, pw);
        if (profile) setProfile(profile); // cache in localStorage for checkout
        showToast("Амжилттай нэвтэрлээ", "ok");
      }
      // fallback / phone: just allow in (demo mode)
      const next = nextParam();
      window.location.href = next ? `./${next}` : "/";
    } catch (err) {
      const msg = firebaseErrorMessage(err.code) || err.message || "Нэвтрэхэд алдаа гарлаа.";
      setLoginError(msg);
    } finally {
      setLoading(btn, false);
    }
  });
}

// ── Register form ─────────────────────────────────────────────────────────
function initRegisterForm(regForm) {
  if (!regForm) return;

  // Field helpers
  regForm.addEventListener("click", (e) => {
    const cf = e.target.closest("[data-clear-field]");
    if (cf) { e.preventDefault(); const el = qsId(cf.dataset.clearField); if (el) { el.value = ""; el.focus(); } return; }
    const tp = e.target.closest("[data-toggle-pw]");
    if (tp) { e.preventDefault(); const el = qsId(tp.dataset.togglePw); if (el) { el.type = el.type === "password" ? "text" : "password"; el.focus(); } return; }
  });

  // Agree-all checkbox
  const agreeAll  = regForm.querySelector("#agreeAll");
  const required  = () => [...regForm.querySelectorAll("[name='agree1'],[name='agree2'],[name='agree3']")];

  agreeAll?.addEventListener("change", () => {
    regForm.querySelectorAll("[name^='agree']").forEach(c => { c.checked = agreeAll.checked; });
  });
  regForm.addEventListener("change", (e) => {
    if (e.target.name?.startsWith("agree") && e.target.name !== "agreeAll") {
      if (agreeAll) agreeAll.checked = required().every(c => c.checked);
    }
  });

  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");

    const email   = qsId("regEmail")?.value.trim() || "";
    const pw      = qsId("regPass")?.value  || "";
    const pw2     = qsId("regPass2")?.value || "";
    const name    = qsId("regName")?.value.trim()  || "";
    const phone   = qsId("regPhone")?.value.trim() || "";

    const e1 = validateGmail(email);   if (e1) return setError(e1);
    const e2 = validatePassword(pw);   if (e2) return setError(e2);
    if (pw !== pw2) return setError("Нууц үг таарахгүй байна.");
    if (!name)      return setError("Нэрээ оруулна уу.");
    const e3 = validatePhone(phone);   if (e3) return setError(e3);

    const btn = regForm.querySelector("[type=submit]");
    setLoading(btn, true, "Бүртгэж байна…");

    const profileData = {
      email: email.toLowerCase(), name, phone,
      district: "", addressLine: "",   // хаяг profile хэсэгт тусад нь нэмнэ
      createdAt: new Date().toISOString(),
    };

    try {
      if (FIREBASE_READY) {
        const { signUp } = await import("./auth.js");
        await signUp({ email, password: pw, name, phone, district, addressLine: address });
      }
      setProfile(profileData); // localStorage cache for checkout
      showToast("Бүртгэл амжилттай", "ok");
      const next = nextParam();
      // Хаяг нэмэхийн тулд profile хуудас руу буцна
      window.location.href = next ? `./${next}` : "/profile.html";
    } catch (err) {
      const msg = firebaseErrorMessage(err.code) || err.message || "Бүртгэхэд алдаа гарлаа.";
      setError(msg);
    } finally {
      setLoading(btn, false);
    }
  });
}

// ── Firebase error messages (Mongolian) ───────────────────────────────────
function firebaseErrorMessage(code) {
  const map = {
    "auth/email-already-in-use":    "Энэ и-мэйл аль хэдийн бүртгэлтэй байна.",
    "auth/invalid-email":           "И-мэйл хаяг буруу байна.",
    "auth/user-not-found":          "И-мэйл олдсонгүй.",
    "auth/wrong-password":          "Нууц үг буруу байна.",
    "auth/weak-password":           "Нууц үг хэтэрхий энгийн байна.",
    "auth/too-many-requests":       "Хэт олон оролдлого. Хэсэг хүлээгээд дахин оролд.",
    "auth/network-request-failed":  "Интернэт холболт шалгана уу.",
    "auth/invalid-credential":      "И-мэйл эсвэл нууц үг буруу байна.",
  };
  return map[code] || null;
}

// ── Address block (profile page after login) ──────────────────────────────
function initAddrBlock() {
  const p = getProfile();
  if (!p) return;

  const noAddrEl   = qs("[data-no-addr]");
  const hasAddrEl  = qs("[data-has-addr]");
  const addrDisplay = qs("[data-addr-display]");
  const addrForm   = qs("[data-addr-save-form]");
  const addrError  = qs("[data-addr-error]");

  function refreshAddrBlock() {
    const cur = getProfile();
    const hasAddr = !!(cur?.district && cur?.addressLine);
    if (noAddrEl)  noAddrEl.hidden  = hasAddr;
    if (hasAddrEl) hasAddrEl.hidden = !hasAddr;
    if (addrDisplay && hasAddr) {
      addrDisplay.innerHTML = `
        <div style="font-size:.86rem;color:rgba(16,16,16,.72)">
          📍 <strong>${cur.district}</strong>, ${cur.addressLine}
        </div>`;
    }
  }
  refreshAddrBlock();

  // Save address
  addrForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const district    = qsId("addrDistrict")?.value || "";
    const addressLine = qsId("addrLine")?.value.trim() || "";
    if (addrError) addrError.hidden = true;
    if (!district)    { if (addrError) { addrError.textContent="Дүүрэг сонгоно уу."; addrError.hidden=false; } return; }
    if (!addressLine) { if (addrError) { addrError.textContent="Хаягаа оруулна уу."; addrError.hidden=false; } return; }

    const cur = getProfile();
    setProfile({ ...cur, district, addressLine });
    refreshAddrBlock();
    showToast("Хаяг хадгалагдлаа ✓", "ok");
  });

  // Edit address button
  qs("[data-edit-addr]")?.addEventListener("click", () => {
    const cur = getProfile();
    if (noAddrEl)  noAddrEl.hidden  = false;
    if (hasAddrEl) hasAddrEl.hidden = true;
    if (cur?.district)    { const el = qsId("addrDistrict"); if (el) el.value = cur.district; }
    if (cur?.addressLine) { const el = qsId("addrLine");     if (el) el.value = cur.addressLine; }
  });
}

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  const hasProfile = qs("[data-has-profile]");
  const preview    = qs("[data-profile-preview]");
  const regForm    = qs("[data-register-form]");
  const loginForm  = qs("[data-login-form]");
  const editBtn    = qs("[data-edit]");
  const clearBtn   = qs("[data-clear]");
  const mode       = modeParam();
  const existing   = getProfile();

  // ── Show/hide panels ──
  if (mode === "login") {
    if (loginForm)  loginForm.hidden  = false;
    if (hasProfile) hasProfile.hidden = true;
    if (regForm)    regForm.hidden    = true;
  } else if (mode === "signup") {
    if (loginForm) loginForm.hidden = true;
    if (existing && hasProfile && preview) {
      hasProfile.hidden = false;
      preview.textContent = previewText(existing);
    } else if (hasProfile) {
      hasProfile.hidden = true;
    }
    if (regForm) regForm.hidden = false;
  } else {
    if (loginForm) loginForm.hidden = true;
    if (existing && hasProfile && preview && regForm) {
      hasProfile.hidden = false;
      preview.textContent = previewText(existing);
      regForm.hidden = true;
    } else if (regForm) {
      regForm.hidden = false;
    }
  }

  initLoginForm(loginForm);
  initRegisterForm(regForm);

  // ── Edit / Clear ──
  // ── Хүргэлтийн хаяг блок ────────────────────────────
  initAddrBlock();

  editBtn?.addEventListener("click", () => {
    if (!regForm) return;
    if (hasProfile) hasProfile.hidden = true;
    regForm.hidden = false;
    const p = getProfile();
    if (!p) return;
    const sv = (id, v) => { const el = qsId(id); if (el) el.value = v; };
    sv("regPhone", p.phone || "");
    sv("regEmail", p.email || "");
    sv("regName",  p.name  || "");
  });

  clearBtn?.addEventListener("click", async () => {
    clearProfile();
    if (FIREBASE_READY) {
      try { const { logOut } = await import("./auth.js"); await logOut(); } catch {}
    }
    window.location.reload();
  });

  syncAuthUI();
}

main();
initSearchNav();
updateCartBadge();
