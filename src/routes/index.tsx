import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import {
  ArrowIcon,
  JerseyArt,
  PillButton,
  SiteFooter,
  SiteHeader,
  Spark,
} from "@/components/brand";
import { OrderFlow } from "@/components/order-flow";
import { supabase } from "@/integrations/supabase/client";
import type { JerseySettings, PublicPlayer } from "@/integrations/supabase/types";
import { formatCurrency } from "@/lib/jersey";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MMS Jersey · Season 2026" },
      {
        name: "description",
        content:
          "Order your child's official MMS jersey. Find the name, check the details, pay by UPI and upload the screenshot.",
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
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPlayers = useCallback(async () => {
    const { data, error } = await supabase.rpc("jersey_list_players");
    if (error) setLoadError(error.message);
    else setPlayers(data ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("jersey_get_settings");
      if (error || !data) setLoadError(error?.message ?? "Could not load the order page.");
      else setSettings(data);
    })();
    void loadPlayers();
  }, [loadPlayers]);

  const price = settings ? formatCurrency(Number(settings.unit_price)) : "—";
  const season = settings?.season_label ?? "Season 2026";

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />

      {/* Hero */}
      <section className="band bg-ink text-white">
        <div className="inner grid items-center gap-7 pt-8 pb-14 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div>
            <div className="label mb-4 text-brand">Official kit · {season}</div>
            <h1 className="h-xl">
              Wear the
              <br />
              MMS colours
            </h1>
            <p className="mt-[18px] mb-6 max-w-[40ch] text-base text-white/70">
              The official MMS jersey. Find your child's name, pay by UPI and upload the screenshot.
              It takes about two minutes.
            </p>
            <PillButton type="button" onClick={scrollToOrder}>
              Order now
            </PillButton>
            <div className="mt-9 grid max-w-[460px]">
              {["Find your child", "Check name, number & size", "Pay & upload screenshot"].map(
                (t) => (
                  <div
                    key={t}
                    className="flex items-center justify-between gap-3 border-b border-white/18 py-3 font-head text-[13px] font-bold uppercase [font-stretch:110%]"
                  >
                    {t} <ArrowIcon />
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="relative grid min-h-[340px] place-items-center">
            <Spark className="absolute top-[2%] right-[12%] w-[46px] text-brand" />
            <Spark className="absolute top-[14%] right-[4%] w-6 text-brand" />
            <JerseyArt
              name="MMS"
              number="10"
              className="w-[min(340px,82%)] -rotate-[9deg] drop-shadow-[0_30px_40px_rgba(0,0,0,0.6)]"
            />
          </div>
        </div>
      </section>

      {/* About + stats */}
      <section className="band">
        <div className="inner">
          <div className="grid items-end gap-6 pt-14 pb-7 md:grid-cols-2">
            <div>
              <div className="label text-ink-2">The {season} kit</div>
              <h2 className="h-lg mt-2.5">
                Getting to
                <br />
                know your kit
              </h2>
            </div>
            <p className="m-0 max-w-[44ch] text-ink-2">
              The school has already added every player with their name, number and size. You only
              check the details and pay.
            </p>
          </div>
          <div className="grid gap-3 pb-14 md:grid-cols-[1.5fr_1fr_1fr]">
            <Stat
              tone="orange"
              value={price}
              text="One price per jersey. The name and number are printed at no extra cost."
            />
            <Stat tone="black" value="4" unit="steps" text="Find, check, pay, upload." />
            <Stat tone="light" value="2" unit="min" text="Average time to place an order." />
          </div>
        </div>
      </section>

      {/* Order */}
      <section id="order" className="band scroll-mt-4 pb-16">
        <div className="inner">
          <div className="mb-6 grid items-end gap-6 md:grid-cols-2">
            <div>
              <div className="label text-ink-2">Order</div>
              <h2 className="h-lg mt-2.5">
                Order in
                <br />
                four steps
              </h2>
            </div>
            <p className="m-0 max-w-[44ch] text-ink-2">
              Pay with any UPI app, scan the QR, or use a bank transfer. The school checks every
              screenshot before confirming.
            </p>
          </div>
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
            <OrderFlow
              settings={settings}
              players={players}
              onOrderPlaced={() => void loadPlayers()}
            />
          )}
        </div>
      </section>

      {/* Kit band */}
      <section className="band bg-ink py-16 text-white">
        <div className="inner">
          <div className="grid items-end gap-6 md:grid-cols-2">
            <div>
              <div className="label text-white/65">Official kit</div>
              <h2 className="h-lg mt-2.5">
                {season}
                <br />
                match jersey
              </h2>
            </div>
            <p className="m-0 max-w-[44ch] text-white/70">
              Breathable match fabric, with your child's name and number printed on the back.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="relative grid min-h-[340px] place-items-center overflow-hidden rounded-[22px] bg-[radial-gradient(circle_at_50%_45%,#2a2a2a,#111_70%)]">
              <Spark className="absolute top-[8%] left-[8%] w-[34px] text-brand" />
              <JerseyArt name="MMS" number="10" className="w-[min(280px,70%)] -rotate-6" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <KitTile title="UPI" text="GPay, PhonePe, Paytm or any UPI app" />
              <KitTile title={"Scan\nQR"} text="Amount filled in for you" />
              <KitTile title="Bank" text="Direct transfer to the school account" />
              <KitTile
                title="Verified"
                text="The school checks every payment before confirming"
                dark
              />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter
        cta={
          <button type="button" onClick={scrollToOrder} className="pill pill-white">
            Order now
          </button>
        }
      />
    </div>
  );
}

function Stat({
  tone,
  value,
  unit,
  text,
}: {
  tone: "orange" | "black" | "light";
  value: string;
  unit?: string;
  text: string;
}) {
  const toneClass =
    tone === "orange"
      ? "bg-brand text-white"
      : tone === "black"
        ? "bg-ink text-white"
        : "bg-white shadow-[inset_0_0_0_1px_var(--rule)]";
  return (
    <div
      className={`flex min-h-[170px] flex-col justify-between gap-3.5 rounded-[18px] p-5 ${toneClass}`}
    >
      <span
        className={`grid size-[30px] place-items-center rounded-full ${tone === "light" ? "bg-brand-soft text-brand" : "bg-white/20"}`}
      >
        <ArrowIcon className="size-4" />
      </span>
      <b className="font-head text-[clamp(44px,6vw,72px)] leading-[0.9] font-black tracking-[-0.03em] [font-stretch:125%]">
        {value}
        {unit && <sup className="relative top-[0.1em] ml-0.5 align-top text-[0.42em]">{unit}</sup>}
      </b>
      <p className={`m-0 max-w-[32ch] text-[12.5px] ${tone === "light" ? "text-ink-2" : ""}`}>
        {text}
      </p>
    </div>
  );
}

function KitTile({ title, text, dark }: { title: string; text: string; dark?: boolean }) {
  return (
    <div
      className={`flex min-h-[160px] flex-col justify-between rounded-[18px] p-[18px] ${
        dark ? "bg-[#161616] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" : "bg-brand"
      }`}
    >
      <b
        className={`font-head text-[clamp(26px,3.4vw,40px)] leading-[0.95] font-black whitespace-pre-line uppercase [font-stretch:125%] ${dark ? "text-brand" : ""}`}
      >
        {title}
      </b>
      <p className="m-0 text-[13px] text-white/90">{text}</p>
    </div>
  );
}
