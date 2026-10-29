import { toPng } from "html-to-image";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

import type { JerseyOrder } from "@/integrations/supabase/types";
import { formatCurrency, gradeLabel } from "@/lib/jersey";

// The receipt is drawn with fixed colours so the PDF looks the same on every screen.
const C = {
  ground: "#0a0a0a",
  card: "#121212",
  rule: "#2b2b2b",
  white: "#ffffff",
  mute: "#a8a8a8",
  orange: "#ff4d12",
  paid: "#4ade80",
  paidBg: "rgba(22,163,74,.18)",
};
const display = "Anton, Impact, 'Arial Narrow', sans-serif";
const cond = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const body = "Barlow, system-ui, sans-serif";
const label = {
  fontFamily: cond,
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: C.mute,
} as const;

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(n: number): string {
  const h = Math.floor(n / 100),
    r = n % 100;
  const rest = r < 20 ? ONES[r]! : `${TENS[Math.floor(r / 10)]!} ${ONES[r % 10]!}`.trim();
  return [h ? `${ONES[h]!} Hundred` : "", rest].filter(Boolean).join(" ");
}

/** 700 → "Rupees Seven Hundred only", using the Indian lakh / crore grouping. */
export function rupeesInWords(amount: number) {
  let n = Math.round(amount);
  if (n <= 0) return "Rupees Zero only";
  const parts: string[] = [];
  for (const [size, name] of [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1000, "Thousand"],
  ] as const) {
    if (n >= size) {
      parts.push(`${belowThousand(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n) parts.push(belowThousand(n));
  return `Rupees ${parts.join(" ")} only`;
}

function receiptDate(o: JerseyOrder) {
  return new Date(o.payment_verified_at ?? o.created_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CashReceipt({ order, season }: { order: JerseyOrder; season: string }) {
  const amount = Number(order.payment_received_amount ?? order.amount);
  const item = (k: string, v: string, wide = false) => (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <div style={label}>{k}</div>
      <div style={{ fontWeight: 600, fontSize: 15, marginTop: 3 }}>{v}</div>
    </div>
  );
  return (
    <div
      style={{ background: C.ground, padding: 20, width: 440, fontFamily: body, color: C.white }}
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.rule}`,
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "22px 22px 26px",
            background: `radial-gradient(circle at 85% 0%, rgba(255,77,18,.45), transparent 60%)`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: C.orange,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: display,
                  fontSize: 19,
                }}
              >
                M
              </div>
              <div>
                <div
                  style={{
                    fontFamily: display,
                    fontSize: 18,
                    lineHeight: 1,
                    letterSpacing: "0.02em",
                  }}
                >
                  MMS JERSEY
                </div>
                <div style={{ ...label, marginTop: 3 }}>Cash receipt · {season}</div>
              </div>
            </div>
            <span
              style={{
                fontFamily: cond,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                background: C.paidBg,
                color: C.paid,
                borderRadius: 999,
                padding: "5px 11px",
                whiteSpace: "nowrap",
              }}
            >
              ✓&nbsp;Paid
            </span>
          </div>
          <div style={{ fontFamily: display, fontSize: 64, lineHeight: 1, marginTop: 18 }}>
            {formatCurrency(amount)}
          </div>
          <div style={{ color: C.mute, fontSize: 13, marginTop: 6 }}>
            {rupeesInWords(amount)} · Cash
          </div>
        </div>
        <div style={{ borderTop: `2px dashed ${C.rule}`, margin: "0 16px" }} />
        <div
          style={{
            padding: "20px 22px 22px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px 12px",
          }}
        >
          {item("Student", order.player_name, true)}
          {item("Admission no.", order.admission_no ?? "—")}
          {item("Grade", gradeLabel(order.class_name))}
          {item("Jersey", `No. ${order.jersey_number ?? "—"} · Size ${order.jersey_size}`)}
          {item("Date", receiptDate(order))}
          {order.received_from && item("Received from", order.received_from, true)}
          {item("Order ID", order.order_id, true)}
          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: C.ground,
              border: "1px solid rgba(255,77,18,.4)",
              borderRadius: 10,
              padding: "11px 14px",
            }}
          >
            <span style={{ ...label, whiteSpace: "nowrap" }}>Receipt no.</span>
            <span
              style={{
                fontFamily: display,
                color: C.orange,
                fontSize: 20,
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}
            >
              {order.receipt_no}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;600&display=swap";
let fontCss: Promise<string> | null = null;

// The page's Google Fonts can't be read across origins, so the receipt fonts are fetched
// once and inlined; otherwise the PDF falls back to a plain system font.
function receiptFontCss() {
  fontCss ??= (async () => {
    const css = await (await fetch(FONT_CSS)).text();
    const blocks = css.split(/(?=\/\* )/).filter((b) => /^\/\* latin(-ext)? \*\//.test(b));
    const inlined = await Promise.all(
      blocks.map(async (block) => {
        const url = /url\((https:[^)]+)\)/.exec(block)?.[1];
        if (!url) return block;
        const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
        let bin = "";
        for (const byte of buf) bin += String.fromCharCode(byte);
        return block.replace(url, `data:font/woff2;base64,${btoa(bin)}`);
      }),
    );
    return inlined.join("\n");
  })().catch(() => {
    fontCss = null;
    return "";
  });
  return fontCss;
}

// Draws the receipt off screen and turns it into a one-page PDF.
async function renderReceiptPdf(order: JerseyOrder, season: string) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<CashReceipt order={order} season={season} />));
    await document.fonts.ready;
    const node = host.firstElementChild as HTMLElement;
    const fontEmbedCSS = await receiptFontCss();
    const png = await toPng(node, {
      pixelRatio: 3,
      cacheBust: true,
      ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
    });
    const { jsPDF } = await import("jspdf");
    const w = node.offsetWidth,
      h = node.offsetHeight;
    const pdf = new jsPDF({
      unit: "px",
      format: [w, h],
      orientation: h > w ? "portrait" : "landscape",
    });
    pdf.addImage(png, "PNG", 0, 0, w, h);
    return pdf.output("blob");
  } finally {
    root.unmount();
    host.remove();
  }
}

function fileName(order: JerseyOrder) {
  return `${order.receipt_no ?? order.order_id}-${order.player_name.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
}

export async function downloadReceipt(order: JerseyOrder, season: string) {
  const blob = await renderReceiptPdf(order, season);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName(order);
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Shares the PDF through the phone's share sheet (WhatsApp included). On a computer it
 *  downloads the PDF and opens WhatsApp with a short message to attach it to. */
export async function shareReceipt(order: JerseyOrder, season: string) {
  const blob = await renderReceiptPdf(order, season);
  const file = new File([blob], fileName(order), { type: "application/pdf" });
  const text = `MMS Jersey cash receipt ${order.receipt_no}: ${formatCurrency(Number(order.payment_received_amount ?? order.amount))} received for ${order.player_name}. Order ${order.order_id} is confirmed.`;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  await downloadReceipt(order, season);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}
