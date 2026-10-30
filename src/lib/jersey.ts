import type { JerseySettings, OrderState, PaymentStatus } from "@/integrations/supabase/types";

/** Shown when the admin has not uploaded a jersey photo. */
export const DEFAULT_JERSEY_IMAGE = "/mms-jersey.jpg";
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
export const PROOF_ACCEPT = PROOF_TYPES.join(",");

// Parent-facing payment methods. Cash is recorded by the admin only.
export const PAYMENT_METHODS = [
  { value: "UPI", label: "UPI" },
  { value: "QR", label: "Scan QR" },
  { value: "Bank Transfer", label: "Bank" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export const JERSEY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_JERSEY_IMAGE_BYTES = 5 * 1024 * 1024;

export type SizeChartRow = JerseySettings["size_chart"][number];

/**
 * Picks the jersey size for a chest width (inches, armpit to armpit): the smallest size
 * whose chest is at least that wide, so a child between sizes gets the larger one.
 * Above the biggest size, it returns the biggest size.
 */
export function sizeForChest(chart: SizeChartRow[], chest: number): string | null {
  if (!(chest > 0) || chart.length === 0) return null;
  const sorted = [...chart].sort((a, b) => a.chest - b.chest);
  return (sorted.find((r) => r.chest >= chest) ?? sorted[sorted.length - 1])?.size ?? null;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function buildUpiUri(settings: JerseySettings, amount: number, note?: string) {
  // Spaces must be %20: some UPI apps show a "+" from URLSearchParams in the payee name.
  const params: [string, string][] = [
    ["pa", settings.upi_id],
    ["pn", settings.payee_name],
    ["am", String(amount)],
    ["cu", "INR"],
  ];
  if (note) params.push(["tn", note]);
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

export function buildQrUrl(settings: JerseySettings, amount: number, note?: string) {
  return `https://quickchart.io/qr?size=500&margin=2&text=${encodeURIComponent(buildUpiUri(settings, amount, note))}`;
}

export function printName(player: { print_name: string | null; full_name: string }) {
  return (player.print_name || player.full_name.split(" ")[0] || player.full_name).toUpperCase();
}

/** "GRADE_VI-A" → "Grade VI-A", "PREKG-A" → "Pre-KG-A". Other classes stay as they are. */
export function gradeLabel(cls: string | null) {
  if (!cls) return "—";
  return cls
    .replace(/^GRADE[_\s]*/i, "Grade ")
    .replace(/^PRE-?KG/i, "Pre-KG")
    .trim();
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const ORDER_STATE_TAGS: Record<OrderState, { label: string; tone: Tone } | null> = {
  none: null,
  pending: { label: "Ordered · not paid", tone: "bad" },
  submitted: { label: "Ordered", tone: "ok" },
  verified: { label: "Ordered", tone: "ok" },
  rejected: { label: "Ordered · not paid", tone: "bad" },
};

export function paymentLabel(status: string) {
  return PAYMENT_LABELS[status as PaymentStatus] ?? PAYMENT_LABELS.pending;
}

export const PAYMENT_LABELS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pending: { label: "Not paid", tone: "bad" },
  submitted: { label: "Paid · not verified", tone: "warn" },
  verified: { label: "Paid · verified", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: "Awaiting payment",
  payment_submitted: "Awaiting payment check",
  confirmed: "Order confirmed",
  in_production: "In production",
  ready: "Ready for pickup",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
// Statuses an admin sets by hand. The others follow the payment automatically.
export const MANUAL_ORDER_STATUSES = [
  "confirmed",
  "in_production",
  "ready",
  "delivered",
  "cancelled",
];

export type Tone = "ok" | "warn" | "bad" | "plain" | "dark" | "brand" | "team" | "info";

// Orders placed on this device, so parents can come back and see the status.
const SAVED_KEY = "mms-jersey-orders";
export type SavedOrder = { orderId: string; token: string; playerName: string };

export function loadSavedOrders(): SavedOrder[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedOrder[]) : [];
  } catch {
    return [];
  }
}

export function saveOrder(order: SavedOrder) {
  try {
    const rest = loadSavedOrders().filter((o) => o.orderId !== order.orderId);
    localStorage.setItem(SAVED_KEY, JSON.stringify([order, ...rest].slice(0, 20)));
  } catch {
    // Storage can be blocked (private mode). The order is still placed.
  }
}
