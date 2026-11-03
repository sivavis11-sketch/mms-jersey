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

/** The coach's recommended jersey size chart, shown to parents and on the measuring screen. */
export const SIZE_GUIDE = [
  {
    age: "5–6 yrs",
    height: "105–115",
    size: "26",
    chest: 12.5,
    length: 17.5,
    fit: "Slim athletic fit.",
  },
  {
    age: "6–7 yrs",
    height: "115–125",
    size: "28",
    chest: 13.5,
    length: 18.5,
    fit: "Slight growing room.",
  },
  { age: "7–8 yrs", height: "120–130", size: "30", chest: 14.5, length: 20, fit: "Balanced fit." },
  {
    age: "8–9 yrs",
    height: "125–135",
    size: "32",
    chest: 15.5,
    length: 22,
    fit: "Room for movement.",
  },
  {
    age: "9–10 yrs",
    height: "130–140",
    size: "34",
    chest: 16.5,
    length: 23,
    fit: "Good active fit.",
  },
  {
    age: "10–11 yrs",
    height: "135–145",
    size: "36",
    chest: 18,
    length: 24,
    fit: "Comfortable athletic fit.",
  },
  {
    age: "11–12 yrs",
    height: "140–150",
    size: "38",
    chest: 19,
    length: 27,
    fit: "Ideal for taller players.",
  },
  { age: "12–13 yrs", height: "145–155", size: "40", chest: 20, length: 28, fit: "Good teen fit." },
  { age: "13–15 yrs", height: "155–165", size: "42", chest: 21, length: 29, fit: "Good teen fit." },
] as const;

export const SIZE_GUIDE_NOTES = [
  "Chest is measured across the jersey, armpit to armpit (not the full way round).",
  "Height ranges are approximate, for slim or athletic builds.",
  "If your child is between sizes, the larger size gives more growing room.",
];

export function guideFor(size: string | null | undefined) {
  return SIZE_GUIDE.find((r) => r.size === size) ?? null;
}
