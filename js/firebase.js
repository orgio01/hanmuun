/**
 * ┌─────────────────────────────────────────────────────┐
 *  HANMUN — Firebase Setup
 *
 *  Алхам 1: console.firebase.google.com → Create project
 *  Алхам 2: Authentication → Sign-in method →
 *            Email/Password → Enable
 *  Алхам 3: Firestore Database → Create → Test mode
 *  Алхам 4: Project Settings → Your apps → Web →
 *            Register app → Copy firebaseConfig
 *  Алхам 5: Доорх config-г өөрийн утгаар солино уу
 *  Алхам 6: /scripts/seed-firestore.html хуудсыг
 *            browser-д нээгээд "Seed" дарна
 * └─────────────────────────────────────────────────────┘
 */

import { initializeApp, getApps } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, orderBy, limit,
  onSnapshot, serverTimestamp,
} from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ─── Firebase config ──────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey:            "AIzaSyCPiJtQZ0_dCN6ZQy61znv4X1QN1xPYcfs",
  authDomain:        "hangman-79b6a.firebaseapp.com",
  projectId:         "hangman-79b6a",
  storageBucket:     "hangman-79b6a.firebasestorage.app",
  messagingSenderId: "596119763707",
  appId:             "1:596119763707:web:eaaa491058824580ffce5e",
  measurementId:     "G-4DYQMKHY2H",
};

export const FIREBASE_READY = !firebaseConfig.apiKey.startsWith("YOUR_");

// ─── Lazy singletons ──────────────────────────────────────────────────────
let _app, _db, _auth;

export function getFirebaseApp() {
  if (!_app) _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return _app;
}
export function getDb()   { if (!_db)   _db   = getFirestore(getFirebaseApp()); return _db;   }
export function getAuth_() { if (!_auth) _auth  = getAuth(getFirebaseApp());      return _auth; }

// ─── Product helpers ──────────────────────────────────────────────────────
function placeholderUrl(name) {
  const initial = (name || "?")[0].toUpperCase();
  const colors  = ["#6a7dff","#2ee6a6","#ffbf4a","#e8232a","#0074e9","#9c27b0"];
  const bg      = colors[initial.charCodeAt(0) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <rect width="400" height="300" fill="${bg}" opacity="0.15"/>
    <rect width="400" height="300" fill="url(#g)"/>
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${bg}" stop-opacity="0.05"/>
    </linearGradient></defs>
    <text x="200" y="175" text-anchor="middle" fill="${bg}" font-size="100"
      font-family="system-ui,sans-serif" font-weight="900" opacity="0.5">${initial}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function mapProduct(snap) {
  const d = snap.data();
  const name = d.name ?? "";
  const cats = Array.isArray(d.categories) ? d.categories : (d.category ? [d.category] : []);
  return {
    id:           snap.id,
    name,
    description:  d.description  ?? "",
    price:        Number(d.price  ?? 0),
    priceWas:     d.priceWas ? Number(d.priceWas) : null,
    imageUrl:     d.imageUrl || placeholderUrl(name),
    category:     d.category     ?? "",
    categories:   cats,
    stockQty:     Number(d.stockQty ?? 0),
    badge:        d.badge         ?? null,
    badgeTone:    d.badgeTone     ?? null,
    deliveryType: d.deliveryType  ?? "",
    tags:         Array.isArray(d.tags) ? d.tags : [],
  };
}

/** Нэг бараа ID-аар авах (approved болон pending хоёуланг) */
export async function fetchProductFirebase(id) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const snap = await getDoc(doc(getDb(), "products", id));
  if (!snap.exists()) throw new Error(`Product "${id}" not found`);
  const p = mapProduct(snap);
  if (p.status && p.status !== "approved") throw new Error("Бараа баталгаажаагүй байна.");
  return p;
}

/** Ангиллаар шүүж авах — category эсвэл categories array-г шалгана */
export async function fetchProductsByCategory(category) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const snap = await getDocs(collection(getDb(), "products"));
  return snap.docs.map(mapProduct)
    .filter(p => {
      const ok = p.status === "approved" || !p.status;
      const inCat = p.category === category || (Array.isArray(p.categories) && p.categories.includes(category));
      return ok && inCat;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "mn"));
}

/** Approved бараа авах (нүүр хуудас, section, хайлт) */
export async function fetchAllProducts() {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const snap = await getDocs(collection(getDb(), "products"));
  return snap.docs.map(mapProduct)
    .filter(p => p.status === "approved" || !p.status);
}

// ─── Product CRUD (admin) ────────────────────────────────────────────────
export async function addProduct(data) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const ref = await addDoc(collection(getDb(), "products"), {
    ...data, status: "approved", updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateProduct(id, data) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  await updateDoc(doc(getDb(), "products", id), { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteProduct(id) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  await deleteDoc(doc(getDb(), "products", id));
}

// ─── User profile in Firestore ────────────────────────────────────────────
export async function saveUserProfile(uid, data) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  await setDoc(doc(getDb(), "users", uid),
    { ...data, updatedAt: new Date().toISOString() },
    { merge: true });
}

export async function getUserProfile(uid) {
  if (!FIREBASE_READY) return null;
  const snap = await getDoc(doc(getDb(), "users", uid));
  return snap.exists() ? snap.data() : null;
}

/** Бүх seller-ийн жагсаалт (admin) */
export async function fetchAllSellers() {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const snap = await getDocs(collection(getDb(), "sellers"));
  const docs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  return docs.sort((a, b) => (a.approved === b.approved ? 0 : a.approved ? 1 : -1));
}

/** Seller зөвшөөрөх / хааx */
export async function approveSellerAccount(uid, approved) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  await updateDoc(doc(getDb(), "sellers", uid), {
    approved, updatedAt: new Date().toISOString(),
  });
}

/** Бүх хэрэглэгчдийн жагсаалт (admin) */
export async function fetchAllUsers() {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const snap = await getDocs(collection(getDb(), "users"));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// ─── Product Image Upload (Firebase Storage) ────────────────────────────
export async function uploadProductImage(file, productId) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const storage  = getStorage(getFirebaseApp());
  const fileRef  = ref(storage, `products/${productId || Date.now()}/${file.name}`);
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
}

// ─── Reviews (Firestore subcollection) ──────────────────────────────────
// reviews/{productId}/items/{uid}
export async function fetchReviews(productId) {
  if (!FIREBASE_READY) return [];
  const snap = await getDocs(
    query(collection(getDb(), "reviews", productId, "items"), orderBy("createdAt", "desc"), limit(20))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addReview(productId, uid, { rating, text, name }) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  await setDoc(doc(getDb(), "reviews", productId, "items", uid), {
    rating: Number(rating), text: String(text).trim(), name: String(name).trim(), uid,
    createdAt: new Date().toISOString(),
  });
}

export async function deleteReview(productId, uid) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  await deleteDoc(doc(getDb(), "reviews", productId, "items", uid));
}

// ─── Coupon codes ────────────────────────────────────────────────────────
// Firestore: coupons/{CODE} → { discount, type: "percent"|"fixed", maxUses, usedCount, expiresAt }
export async function validateCoupon(code) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const snap = await getDoc(doc(getDb(), "coupons", code.toUpperCase().trim()));
  if (!snap.exists()) throw new Error("Купон код олдсонгүй");
  const d = snap.data();
  if (d.expiresAt && new Date(d.expiresAt) < new Date()) throw new Error("Купоны хугацаа дууссан");
  if (d.maxUses > 0 && d.usedCount >= d.maxUses) throw new Error("Купон ашиглагдсан байна");
  return { code: snap.id, discount: d.discount, type: d.type || "percent", description: d.description || "" };
}

export async function incrementCouponUsage(code) {
  if (!FIREBASE_READY) return;
  const ref_ = doc(getDb(), "coupons", code.toUpperCase().trim());
  const snap = await getDoc(ref_);
  if (snap.exists()) {
    await updateDoc(ref_, { usedCount: (snap.data().usedCount || 0) + 1 });
  }
}

// ─── Banner functions ────────────────────────────────────────────────────
export async function fetchBanners() {
  if (!FIREBASE_READY) return [];
  const snap = await getDocs(
    query(collection(getDb(), "banners"), where("active", "==", true))
  );
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

/** Real-time banner listener — admin өөрчлөхөд автоматаар шинэчлэгдэнэ */
export function watchBanners(callback) {
  if (!FIREBASE_READY) { callback([]); return () => {}; }
  const q = query(collection(getDb(), "banners"), where("active", "==", true));
  return onSnapshot(q,
    (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(docs.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)));
    },
    (err) => { console.warn("Banner watch error:", err); callback([]); }
  );
}

export async function fetchAllBanners() {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const snap = await getDocs(collection(getDb(), "banners"));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

export async function saveBanner(id, data) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  if (id) {
    await updateDoc(doc(getDb(), "banners", id), { ...data, updatedAt: new Date().toISOString() });
  } else {
    await addDoc(collection(getDb(), "banners"), { ...data, createdAt: new Date().toISOString() });
  }
}

export async function deleteBanner(id) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  await deleteDoc(doc(getDb(), "banners", id));
}

// ─── Seller functions ────────────────────────────────────────────────────
export async function registerSeller(uid, data) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  await setDoc(doc(getDb(), "sellers", uid), {
    ...data, approved: false, createdAt: new Date().toISOString(),
  }, { merge: true });
}

export async function getSellerProfile(uid) {
  if (!FIREBASE_READY) return null;
  const snap = await getDoc(doc(getDb(), "sellers", uid));
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
}

export async function addSellerProduct(uid, sellerName, data) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const ref = await addDoc(collection(getDb(), "products"), {
    ...data,
    sellerId:   uid,
    sellerName: sellerName,
    status:     "pending",
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
  });
  return ref.id;
}

export async function fetchSellerProducts(uid) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const snap = await getDocs(
    query(collection(getDb(), "products"), where("sellerId", "==", uid))
  );
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function fetchPendingProducts() {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const snap = await getDocs(
    query(collection(getDb(), "products"), where("status", "==", "pending"))
  );
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function setProductStatus(id, status, note = "") {
  if (!FIREBASE_READY) throw new Error("not-configured");
  await updateDoc(doc(getDb(), "products", id), {
    status, adminNote: note, updatedAt: new Date().toISOString(),
  });
}

/** Хэрэглэгч ban/unban хийх (admin) */
export async function setBanUser(uid, banned) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  await updateDoc(doc(getDb(), "users", uid), {
    banned,
    bannedAt: banned ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  });
}

// ─── Orders (Firebase) ────────────────────────────────────────────────────
function makeOrderNum() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `UB-${t}-${r}`;
}

export async function createFirebaseOrder(data) {
  if (!FIREBASE_READY) throw new Error("not-configured");
  const orderNumber = makeOrderNum();
  const ref = await addDoc(collection(getDb(), "orders"), {
    ...data,
    orderNumber,
    status: "pending",
    paymentStatus: "unpaid",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { id: ref.id, orderNumber };
}

export async function fetchAllOrdersFirebase() {
  if (!FIREBASE_READY) return [];
  const snap = await getDocs(query(collection(getDb(), "orders"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchSellerOrdersFirebase(sellerId) {
  if (!FIREBASE_READY) return [];
  // array-contains + orderBy requires composite index — filter client-side instead
  const snap = await getDocs(
    query(collection(getDb(), "orders"), where("sellerIds", "array-contains", sellerId))
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/** Seller-ийн захиалгыг real-time сонсох */
export function watchSellerOrders(sellerId, callback) {
  if (!FIREBASE_READY) return () => {};
  const q = query(collection(getDb(), "orders"), where("sellerIds", "array-contains", sellerId));
  return onSnapshot(q, snap => {
    const orders = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    callback(orders, snap.docChanges());
  });
}

/** Admin-ий бүх захиалгыг real-time сонсох */
export function watchAllOrders(callback) {
  if (!FIREBASE_READY) return () => {};
  const q = query(collection(getDb(), "orders"), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(orders, snap.docChanges());
  });
}

export async function fetchOrderFirebase(orderNumber) {
  if (!FIREBASE_READY) return null;
  const snap = await getDocs(query(collection(getDb(), "orders"), where("orderNumber", "==", orderNumber)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function updateFirebaseOrderStatus(orderId, status) {
  if (!FIREBASE_READY) return;
  await updateDoc(doc(getDb(), "orders", orderId), { status, updatedAt: new Date().toISOString() });
}
