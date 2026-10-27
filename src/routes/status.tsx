import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { CheckIcon, SiteFooter, SiteHeader, Tag } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import type { JerseyOrder } from "@/integrations/supabase/types";
import { ORDER_STATUS_LABELS, formatCurrency, paymentLabel, loadSavedOrders } from "@/lib/jersey";

export const Route = createFileRoute("/status")({
  head: () => ({ meta: [{ title: "My orders · MMS Jersey" }] }),
  component: StatusPage,
});

type Row = { orderId: string; playerName: string; order: JerseyOrder | null; error: string | null };

function StatusPage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    const saved = loadSavedOrders();
    void Promise.all(
      saved.map(async (s): Promise<Row> => {
        const { data, error } = await supabase.rpc("jersey_get_order", {
          p_order_id: s.orderId,
          p_access_token: s.token,
        });
        return {
          orderId: s.orderId,
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
            rows.map((r) => <OrderCard key={r.orderId} row={r} />)
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

function OrderCard({ row }: { row: Row }) {
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
  const pay = paymentLabel(o.payment_status);
  const verified = o.payment_status === "verified";
  return (
    <div className="card grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-md border border-brand/40 bg-brand-soft px-3 py-1.5 text-brand font-display text-lg text-white">
            {o.order_id}
          </span>
          <Tag tone={pay.tone}>{pay.label}</Tag>
          <Tag tone="plain">{ORDER_STATUS_LABELS[o.order_status] ?? o.order_status}</Tag>
        </div>
        <h2 className="h-md mt-4">{o.player_name}</h2>
        <p className="mt-2 text-sm text-ink-2">
          {[
            o.class_name,
            o.jersey_number != null ? `No. ${o.jersey_number}` : null,
            `Size ${o.jersey_size}`,
            formatCurrency(Number(o.amount)),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {o.payment_status === "rejected" && (
          <p className="mt-3 rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad">
            The school could not accept this payment
            {o.payment_rejection_reason ? `: ${o.payment_rejection_reason}` : ""}. Please pick your
            child's name again on the order page and upload a new screenshot.
          </p>
        )}
      </div>
      {o.payment_status === "rejected" ? (
        <Link to="/" hash="order" className="pill">
          Pay again
        </Link>
      ) : (
        <div
          className={`grid size-14 place-items-center rounded-full ${verified ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}
          aria-hidden="true"
        >
          {verified ? (
            <CheckIcon className="size-7" />
          ) : (
            <span className="text-xl font-black">…</span>
          )}
        </div>
      )}
    </div>
  );
}
