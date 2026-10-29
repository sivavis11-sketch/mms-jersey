import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { JerseyArt, SiteFooter, SiteHeader } from "@/components/brand";
import { OrderFlow } from "@/components/order-flow";
import heroPlayer from "@/assets/hero-player.jpg";
import { supabase } from "@/integrations/supabase/client";
import type { JerseySettings } from "@/integrations/supabase/types";
import { formatCurrency } from "@/lib/jersey";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MMS Jersey · Season 2026" },
      {
        name: "description",
        content:
          "Order your child's official MMS jersey. Find your child, choose the number, name and size, place the order and pay by UPI.",
      },
      { property: "og:title", content: "MMS Jersey · Season 2026" },
      { property: "og:description", content: "Official MMS jersey ordering for parents." },
    ],
  }),
  component: Landing,
});

function scrollToOrder() {
  document.getElementById("order")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Landing() {
  const [settings, setSettings] = useState<JerseySettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("jersey_get_settings");
      if (error || !data) setLoadError(error?.message ?? "Could not load the order page.");
      else setSettings(data);
    })();
  }, []);

  const price = settings ? formatCurrency(Number(settings.unit_price)) : "—";
  const season = settings?.season_label ?? "Season 2026";
  const sizes = settings?.sizes ?? [];

  return (
    <div className="min-h-screen bg-ink font-body text-white">
      <SiteHeader
        right={
          <>
            <Link
              to="/status"
              className="inline-flex rounded-md border border-white/15 px-4 py-2.5 font-condensed text-xs tracking-[0.18em] text-ink-2 uppercase transition-colors hover:border-brand hover:text-brand"
            >
              My orders
            </Link>
            <button
              type="button"
              onClick={scrollToOrder}
              className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 font-condensed text-sm tracking-[0.2em] text-white uppercase transition-colors hover:bg-white hover:text-ink"
            >
              Start order
            </button>
          </>
        }
      />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroPlayer}
            alt=""
            width={1920}
            height={1088}
            className="kenburns h-[74vh] min-h-[520px] w-full object-cover opacity-40 brightness-50 contrast-125 grayscale"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/80 to-ink/60" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,77,18,0.22),transparent_60%)]" />
        <div className="relative mx-auto flex h-[74vh] min-h-[520px] max-w-4xl flex-col items-center justify-center px-5 text-center">
          <div className="mb-5 flex items-center gap-3">
            <span className="h-px w-10 bg-brand" />
            <span className="font-condensed text-xs tracking-[0.4em] text-brand uppercase">
              Now open · {season}
            </span>
            <span className="h-px w-10 bg-brand" />
          </div>
          <h1 className="h-xl">
            MMS <span className="text-brand">Jersey</span>
          </h1>
          <p className="mt-4 font-condensed text-sm tracking-[0.45em] text-white/70 uppercase sm:text-lg">
            Season Order Portal
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <button type="button" onClick={scrollToOrder} className="pill px-8 py-4 text-base">
              Order your kit
            </button>
            <a href="#kit" className="pill pill-ghost px-8 py-4 text-base text-white">
              View kit
            </a>
          </div>
        </div>
      </section>

      {/* How it works + kit */}
      <section id="kit" className="band border-t border-line">
        <div className="inner grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_420px]">
          <div>
            <div className="label mb-3 text-brand">How it works</div>
            <h2 className="h-lg">Four steps to your kit</h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                ["01", "Find your child", "Type the name or admission number."],
                ["02", "Jersey details", "Choose the number, the name to print and the size."],
                ["03", "Place order", "Check everything and get your order ID."],
                [
                  "04",
                  "Pay",
                  "Pay by UPI, QR or bank and upload the screenshot, or pay cash at school.",
                ],
              ].map(([num, title, copy]) => (
                <li key={num} className="rounded-xl border border-line bg-panel p-5">
                  <div className="font-display text-2xl text-brand">{num}</div>
                  <div className="mt-2 font-condensed text-base tracking-[0.15em] uppercase">
                    {title}
                  </div>
                  <p className="mt-1 text-sm text-ink-2">{copy}</p>
                </li>
              ))}
            </ol>
            <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
              {[
                { value: price, label: "Per jersey" },
                { value: sizes.length ? String(sizes.length) : "—", label: "Size range" },
                { value: "2 min", label: "To order" },
              ].map((stat) => (
                <div key={stat.label} className="flex items-baseline gap-3">
                  <span className="font-display text-3xl text-brand">{stat.value}</span>
                  <span className="font-condensed text-xs tracking-[0.25em] text-ink-2 uppercase">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <aside className="self-start rounded-xl border border-line bg-panel p-6 sm:p-7">
            <div className="mb-6 grid aspect-[530/455] place-items-center overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_40%,rgba(255,77,18,0.28),#0a0a0a_70%)]">
              <JerseyArt
                name="MMS"
                number="10"
                image={settings?.jersey_image_url}
                className={
                  settings?.jersey_image_url
                    ? "size-full object-cover"
                    : "w-[62%] drop-shadow-[0_24px_30px_rgba(0,0,0,0.7)]"
                }
              />
            </div>
            <div className="font-condensed text-xs tracking-[0.3em] text-ink-2 uppercase">
              Available sizes
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-4">
              {sizes.map((s) => (
                <span
                  key={s}
                  className="rounded-lg border border-line py-2.5 text-center font-condensed tracking-wide text-white/70"
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-line pt-5">
              <span className="font-condensed text-xs tracking-[0.25em] text-ink-2 uppercase">
                Price
              </span>
              <span className="font-display text-2xl text-brand">{price}</span>
            </div>
            <button
              type="button"
              onClick={scrollToOrder}
              className="pill mt-5 w-full py-4 text-base"
            >
              Order your kit
            </button>
          </aside>
        </div>
      </section>

      {/* Order */}
      <section id="order" className="band scroll-mt-2 border-t border-line pb-20">
        <div className="inner pt-14">
          <p className="label text-brand">Jersey order</p>
          <h2 className="h-lg mt-2">Place your order</h2>
          <p className="mt-3 mb-8 max-w-2xl text-sm text-ink-2">
            Find your child, choose the jersey details and place the order. Then pay by UPI and
            upload the screenshot, or pay later. The school checks every payment before confirming.
          </p>
          {loadError ? (
            <p className="card text-bad">
              We couldn't load the order form: {loadError}. Please refresh the page.
            </p>
          ) : !settings ? (
            <p className="card text-ink-2">Loading the order form…</p>
          ) : !settings.orders_open ? (
            <div className="card">
              <h3 className="h-md">Orders are closed</h3>
              <p className="mt-3 text-ink-2">
                {settings.contact_note ||
                  "Jersey orders are closed right now. Please contact the school office."}
              </p>
            </div>
          ) : (
            <OrderFlow settings={settings} />
          )}
        </div>
      </section>

      <SiteFooter
        cta={
          <button type="button" onClick={scrollToOrder} className="pill">
            Order your kit →
          </button>
        }
      />
    </div>
  );
}
