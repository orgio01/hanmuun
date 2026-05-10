// In-memory store — no native modules needed
// Cart and order data resets on restart (MVP acceptable)

import { makeId, makeOrderNumber } from "./utils.js";

// ── In-memory tables ──────────────────────────────────────────────────────
const carts      = new Map(); // cartId → { id, items: Map<productId, qty> }
const orders     = new Map(); // orderNumber → order object

// ── Cart helpers ──────────────────────────────────────────────────────────
export function getCart(cartId) {
  if (!carts.has(cartId)) carts.set(cartId, { id: cartId, items: new Map() });
  return carts.get(cartId);
}

export function cartItems(cartId) {
  const cart = getCart(cartId);
  return [...cart.items.entries()].map(([productId, qty]) => ({ productId, qty }));
}

export function upsertCartItem(cartId, productId, qty) {
  const cart = getCart(cartId);
  if (qty <= 0) cart.items.delete(productId);
  else cart.items.set(productId, qty);
}

export function removeCartItem(cartId, productId) {
  getCart(cartId).items.delete(productId);
}

export function clearCart(cartId) {
  getCart(cartId).items.clear();
}

// ── Order helpers ─────────────────────────────────────────────────────────
export function createOrder(data) {
  const orderNumber = makeOrderNumber();
  const id = makeId("ord");
  const now = new Date().toISOString();
  const order = { id, orderNumber, ...data, status: "pending", paymentStatus: "pending", createdAt: now, updatedAt: now };
  orders.set(orderNumber, order);
  return order;
}

export function getAllOrders() {
  return [...orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getOrder(orderNumber) {
  return orders.get(orderNumber) || null;
}

export function updateOrderStatus(orderNumber, status) {
  const order = orders.get(orderNumber);
  if (!order) return null;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  return order;
}

// ── Stubs for compatibility ───────────────────────────────────────────────
export function openDb()   { return {}; }
export function migrate()  {}
export function seed()     {}
