import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { SiteFooter, SiteHeader, Tag } from "@/components/brand";
import { PaymentPanel, PaymentState } from "@/components/order-flow";
import { supabase } from "@/integrations/supabase/client";
import type { JerseyOrder, JerseySettings } from "@/integrations/supabase/types";
import { ORDER_STATUS_LABELS, formatCurrency, gradeLabel, loadSavedOrders } from "@/lib/jersey";

export const Route = createFileRoute("/status")({
  head: () => ({ meta: [{ title: "My orders · MMS Jersey" }] }),
  component: StatusPage,
});

type Row = {
  orderId: string;
  token: string;
  playerName: string;
  order: JerseyOrder | null;
  error: string | null;
};

function StatusPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [settings, setSettings] = useState<JerseySettings | null>(null);

  useEffect(() => {
    void supabase.rpc("jersey_get_settings").then(({ data }) => setSettings(data ?? null));
    const saved = loadSavedOrders();
    void Promise.all(
      saved.map(async (s): Promise<Row> => {
        const { data, error } = await supabase.rpc("jersey_get_order", {
          p_order_id: s.orderId,
          p_access_token: s.token,
        });
        return {
          orderId: s.orderId,
          token: s.token,
          playerName: s.playerName,
          order: data ?? null,
          error: error?.message ?? null,
        };
      }),
    ).then(setRows);
  }, []);

  return (
    <div className="min-h-screen bg-ink">
      <SiteHeader />
      <section className="band bg-ink text-white">
        <div className="inner pt-8 pb-12">
          <div className="label text-brand">Parents</div>
          <h1 className="h-xl mt-2.5">My orders</h1>
          <p className="mt-4 max-w-[48ch] text-white/70">
            Orders placed on this phone or computer show here, with the latest payment status from
            the school.
          </p>
        </div>
      </section>
      <section className="band py-12">
        <div className="inner grid gap-3">
          {rows === null ? (
            <p className="card text-ink-2">Loading your orders…</p>
          ) : rows.length === 0 ? (
            <div className="card">
              <h2 className="h-md">No orders on this device</h2>
              <p className="mt-3 text-ink-2">
                If you ordered on another phone, check there. Or contact the school office with your
                child's name.
              </p>
              <Link to="/" hash="order" className="pill mt-5">
                Order a jersey
              </Link>
            </div>
          ) : (
            rows.map((r) => (
              <OrderCard
                key={r.orderId}
                row={r}
                settings={settings}
                onChange={(order) =>
                  setRows((prev) =>
                    (prev ?? []).map((x) => (x.orderId === r.orderId ? { ...x, order } : x)),
                  )
                }
              />
            ))
          )}
        </div>
      </section>
      <SiteFooter
        cta={
          <Link to="/" hash="order" className="pill pill-white">
            Order now
          </Link>
        }
      />
    </div>
  );
}

function OrderCard({
  row,
  settings,
  onChange,
}: {
  row: Row;
  settings: JerseySettings | null;
  onChange: (order: JerseyOrder) => void;
}) {
  const [paying, setPaying] = useState(false);
  const o = row.order;
  if (!o)
    return (
      <div className="card">
        <div className="font-display text-2xl">{row.orderId}</div>
        <p className="mt-2 text-sm text-ink-2">
          {row.playerName} · We couldn't load this order ({row.error ?? "not found"}).
        </p>
      </div>
    );
  const unpaid =
    (o.payment_status === "pending" || o.payment_status === "rejected") &&
    o.order_status !== "cancelled";
  return (
    <div className="card grid gap-5 md:grid-cols-[minmax(0,1fr)_300px] md:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-md border border-brand/40 bg-brand-soft px-3 py-1.5 font-display text-lg text-white">
            {o.order_id}
          </span>
          <Tag tone="plain">{ORDER_STATUS_LABELS[o.order_status] ?? o.order_status}</Tag>
        </div>
        <h2 className="h-md mt-4">{o.player_name}</h2>
        <p className="mt-2 text-sm text-ink-2">
          {[
            o.admission_no ? `Adm. ${o.admission_no}` : null,
            gradeLabel(o.class_name),
            o.jersey_number != null ? `No. ${o.jersey_number}` : null,
            o.print_name ? `"${o.print_name}"` : null,
            `Size ${o.jersey_size}`,
            formatCurrency(Number(o.amount)),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {unpaid && !paying && (
          <button type="button" onClick={() => setPaying(true)} className="pill mt-5">
            Pay {formatCurrency(Number(o.amount))} now
          </button>
        )}
        {unpaid && !paying && (
          <p className="mt-3 text-[12.5px] text-ink-3">
            Or pay cash at the school office and collect a receipt.
          </p>
        )}
      </div>
      <PaymentState order={o} />
      {paying && settings && (
        <div className="border-t border-line pt-5 md:col-span-2">
          <PaymentPanel
            settings={settings}
            order={o}
            token={row.token}
            onPaid={(updated) => {
              onChange(updated);
              setPaying(false);
            }}
            onLater={() => setPaying(false)}
          />
        </div>
      )}
    </div>
  );
}
