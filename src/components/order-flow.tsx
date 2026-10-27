import { Link } from "@tanstack/react-router";
import { Copy, Download, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ArrowIcon, CheckIcon, JerseyArt, PillButton, Tag } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import type { JerseyOrder, JerseySettings, PublicPlayer } from "@/integrations/supabase/types";
import {
  MAX_PROOF_BYTES,
  ORDER_STATE_TAGS,
  PAYMENT_METHODS,
  PROOF_ACCEPT,
  PROOF_TYPES,
  buildQrUrl,
  buildUpiUri,
  formatCurrency,
  initials,
  printName,
  saveOrder,
  type PaymentMethod,
} from "@/lib/jersey";

const STEPS = ["Find your child", "Check details", "Make payment", "Upload & order"];

export function OrderFlow({
  settings,
  players,
  onOrderPlaced,
}: {
  settings: JerseySettings;
  players: PublicPlayer[];
  onOrderPlaced: () => void;
}) {
  const [step, setStep] = useState(0);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [proof, setProof] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<JerseyOrder | null>(null);

  const player = players.find((p) => p.id === playerId) ?? null;
  const amount = Number(settings.unit_price);
  const sizeLocked = !settings.parents_can_change_size && !!player?.jersey_size;

  function go(next: number) {
    setError(null);
    setStep(next);
    document.getElementById("order")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function pickPlayer(p: PublicPlayer) {
    setPlayerId(p.id);
    setSize(p.jersey_size);
    setConfirmed(false);
  }

  async function placeOrder() {
    if (!player || !size || submitting) return;
    setError(null);
    if (!proof) return setError("Please upload your payment screenshot.");
    if (proof.size > MAX_PROOF_BYTES) return setError("The screenshot must be 5 MB or smaller.");
    if (proof.type && !PROOF_TYPES.includes(proof.type))
      return setError("The screenshot must be a photo (JPG, PNG, WEBP, HEIC) or a PDF.");

    setSubmitting(true);
    try {
      const safeName = proof.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60);
      const path = `proofs/${player.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("jersey-proofs")
        .upload(
          path,
          proof,
          proof.type ? { upsert: false, contentType: proof.type } : { upsert: false },
        );
      if (uploadError) throw new Error(uploadError.message);

      const { data, error: rpcError } = await supabase.rpc("jersey_place_order", {
        p_player_id: player.id,
        p_jersey_size: size,
        p_payment_method: method,
        p_payment_proof: path,
        p_payment_reference: reference.trim() || undefined,
      });
      if (rpcError || !data) throw new Error(rpcError?.message ?? "The order could not be saved.");
      saveOrder({ orderId: data.order_id, token: data.access_token, playerName: data.player_name });
      setPlaced(data);
      setStep(4);
      onOrderPlaced();
      document.getElementById("order")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "We couldn't place the order. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    setStep(0);
    setPlayerId(null);
    setSize(null);
    setConfirmed(false);
    setProof(null);
    setReference("");
    setPlaced(null);
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
      <div>
        <ol className="grid gap-1.5">
          {STEPS.map((label, i) => {
            const done = step === 4 || i < step;
            const on = i === step;
            return (
              <li key={label}>
                <button
                  type="button"
                  disabled={!(i < step && step < 4)}
                  onClick={() => go(i)}
                  className={`grid w-full grid-cols-[44px_minmax(0,1fr)_40px] items-center gap-3 rounded-[14px] px-4 py-4 text-left font-head text-sm font-bold uppercase [font-stretch:110%] disabled:cursor-default ${
                    on ? "bg-ink text-white" : "bg-[#e6e6e2]"
                  }`}
                >
                  <span className={`font-extrabold ${on ? "text-brand" : "text-ink-2"}`}>
                    0{i + 1}
                  </span>
                  <span>{label}</span>
                  <span
                    className={`grid size-[34px] place-items-center rounded-full ${
                      on ? "bg-brand text-white" : done ? "bg-ink text-white" : "bg-black/5"
                    }`}
                  >
                    {done ? (
                      <CheckIcon className="size-[15px]" />
                    ) : (
                      <ArrowIcon className="size-[15px]" />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-3 grid grid-cols-1 items-center gap-4 rounded-[18px] bg-ink p-[18px] text-white min-[420px]:grid-cols-[120px_minmax(0,1fr)]">
          <JerseyArt
            forcePlaceholder
            name={player ? printName(player) : "YOUR NAME"}
            number={
              player?.jersey_number != null ? String(player.jersey_number).padStart(2, "0") : "00"
            }
            className="mx-auto w-[120px]"
          />
          <dl className="grid gap-1.5 text-[13px]">
            <SumRow label="Player" value={player?.full_name ?? "—"} />
            <SumRow label="Class" value={player?.class_name ?? "—"} />
            <SumRow label="Size" value={size ?? "—"} />
            <div className="flex justify-between gap-3">
              <dt className="text-white/65">Total</dt>
              <dd className="font-head text-xl font-black text-brand [font-stretch:125%]">
                {formatCurrency(amount)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div key={step} className="card animate-fade-up">
        {step < 4 && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-1.5" aria-hidden="true">
                <i className="size-[7px] rounded-full bg-rule" />
                <i className="size-[7px] rounded-full bg-rule" />
                <i className="size-[7px] rounded-full bg-rule" />
              </div>
              <span className="label text-ink-2">Step 0{step + 1} of 04</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#ececea]">
              <i
                className="block h-full rounded-full bg-[linear-gradient(90deg,var(--orange),var(--black))] transition-[width] duration-500"
                style={{ width: `${(step + 1) * 25}%` }}
              />
            </div>
            <h3 className="h-md mt-5">{STEPS[step]}</h3>
          </>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-[14px] bg-bad-bg px-4 py-3 text-sm font-medium text-bad"
          >
            {error}
          </p>
        )}

        {step === 0 && (
          <FindStep
            players={players}
            selectedId={playerId}
            onPick={pickPlayer}
            onNext={() => go(1)}
          />
        )}

        {step === 1 && player && (
          <div>
            <p className="mt-2.5 mb-5 text-ink-2">
              This is what the school has on file. It is printed exactly like this.
            </p>
            <dl className="mb-5 grid gap-2 sm:grid-cols-2">
              <Fact label="Player name" value={player.full_name} />
              <Fact label="Class" value={player.class_name ?? "—"} />
              <Fact
                label="Jersey number"
                value={player.jersey_number != null ? String(player.jersey_number) : "—"}
              />
              <Fact label="Name on jersey" value={printName(player)} />
            </dl>
            <div className="label text-ink-2">Jersey size</div>
            {sizeLocked ? (
              <div className="mt-2 inline-flex rounded-xl bg-brand px-5 py-3 font-head text-lg font-black text-white [font-stretch:125%]">
                {size}
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5">
                {sizeOptions(settings.sizes, player.jersey_size).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={size === option}
                    onClick={() => setSize(option)}
                    className={`rounded-xl border-[1.5px] px-1 py-3 font-bold ${
                      size === option ? "border-brand bg-brand text-white" : "border-rule bg-white"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[12.5px] text-ink-3">
              {sizeLocked
                ? "The size is set by the school. Contact the school office if it needs to change."
                : player.jersey_size
                  ? `The school suggested size ${player.jersey_size}. Change it only if your child has grown.`
                  : "Choose your child's size."}
            </p>
            <label className="mt-5 flex items-start gap-2.5 rounded-[14px] bg-brand-soft p-3.5 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 size-[18px] flex-none accent-[var(--orange)]"
              />
              I have checked the name, number and size. They are correct.
            </label>
            <Actions onBack={() => go(0)}>
              <PillButton type="button" disabled={!confirmed || !size} onClick={() => go(2)}>
                Go to payment
              </PillButton>
            </Actions>
          </div>
        )}

        {step === 2 && player && (
          <div>
            <p className="mt-2.5 mb-5 text-ink-2">
              Pay by any one method, then take a screenshot of the success screen.
            </p>
            <div className="mb-3.5 flex items-center justify-between gap-3 rounded-[18px] bg-ink px-5 py-[18px] text-white">
              <span className="label">Amount to pay</span>
              <b className="font-head text-[40px] leading-none font-black text-brand [font-stretch:125%]">
                {formatCurrency(amount)}
              </b>
            </div>
            <div className="mb-3.5 grid grid-cols-3 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={method === m.value}
                  onClick={() => setMethod(m.value)}
                  className={`rounded-[14px] px-2 py-3.5 font-head text-[13px] font-extrabold uppercase [font-stretch:112%] ${
                    method === m.value ? "bg-brand text-white" : "bg-paper"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <PaymentDetails
              settings={settings}
              method={method}
              amount={amount}
              note={`Jersey ${player.full_name}`}
            />
            <Actions onBack={() => go(1)}>
              <PillButton type="button" onClick={() => go(3)}>
                I have paid
              </PillButton>
            </Actions>
          </div>
        )}

        {step === 3 && player && (
          <div>
            <p className="mt-2.5 mb-5 text-ink-2">
              Add the payment screenshot. The school checks it and confirms your order.
            </p>
            <ProofPicker file={proof} onChange={setProof} />
            <label className="mt-3.5 grid gap-2">
              <span className="label text-ink-2">UTR / reference number (optional)</span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                inputMode="numeric"
                maxLength={40}
                placeholder="12-digit number from the UPI app"
                className="field-input"
              />
            </label>
            <Actions onBack={() => go(2)}>
              <PillButton
                type="button"
                disabled={!proof || submitting}
                onClick={() => void placeOrder()}
              >
                {submitting ? "Placing order…" : `Place order · ${formatCurrency(amount)}`}
              </PillButton>
            </Actions>
          </div>
        )}

        {step === 4 && placed && (
          <div className="grid justify-items-center gap-3.5 py-2.5 text-center">
            <div className="grid size-[70px] place-items-center rounded-full bg-brand text-white">
              <CheckIcon className="size-[34px]" />
            </div>
            <div className="label text-ink-2">Order placed</div>
            <h3 className="h-lg">Thank you!</h3>
            <div className="rounded-[14px] bg-ink px-5 py-2.5 font-head text-[clamp(28px,5vw,44px)] font-black tracking-[-0.01em] text-white [font-stretch:125%]">
              {placed.order_id}
            </div>
            <p className="m-0 max-w-[44ch] text-ink-2">
              The school will check your payment and confirm {placed.player_name.split(" ")[0]}'s
              jersey. Keep this order ID. You can check the status any time under My orders.
            </p>
            <Tag tone="warn">Payment · waiting for check</Tag>
            <div className="mt-1.5 flex flex-wrap justify-center gap-2">
              <Link to="/status" className="pill pill-dark">
                My orders
              </Link>
              <button type="button" onClick={restart} className="pill pill-ghost">
                Order for another child
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function sizeOptions(sizes: string[], playerSize: string | null) {
  return playerSize && !sizes.includes(playerSize) ? [playerSize, ...sizes] : sizes;
}

function FindStep({
  players,
  selectedId,
  onPick,
  onNext,
}: {
  players: PublicPlayer[];
  selectedId: string | null;
  onPick: (p: PublicPlayer) => void;
  onNext: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState("All");
  const classes = useMemo(
    () => [
      "All",
      ...Array.from(new Set(players.map((p) => p.class_name).filter(Boolean) as string[])),
    ],
    [players],
  );
  const q = query.trim().toLowerCase();
  const list = players.filter(
    (p) =>
      (cls === "All" || p.class_name === cls) &&
      (!q || p.full_name.toLowerCase().includes(q) || String(p.jersey_number ?? "") === q),
  );

  return (
    <div>
      <p className="mt-2.5 mb-5 text-ink-2">
        Search by name. The school has already added every player.
      </p>
      <label className="relative block">
        <span className="sr-only">Child's name</span>
        <Search className="absolute top-1/2 left-[17px] size-[18px] -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type your child's name"
          autoComplete="off"
          className="w-full rounded-full border-[1.5px] border-rule bg-paper py-3.5 pr-[18px] pl-[46px] text-[15px] focus:border-ink focus:bg-white focus:outline-none"
        />
      </label>
      {classes.length > 2 && (
        <div className="my-3.5 flex flex-wrap gap-1.5">
          {classes.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cls === c}
              onClick={() => setCls(c)}
              className={`rounded-full border-[1.5px] px-3 py-1.5 text-[12.5px] font-semibold ${
                cls === c ? "border-ink bg-ink text-white" : "border-rule"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3.5 grid max-h-[380px] gap-1.5 overflow-auto">
        {players.length === 0 ? (
          <p className="text-sm text-ink-3">
            The player list is not ready yet. Please check back soon.
          </p>
        ) : list.length === 0 ? (
          <p className="text-sm text-ink-3">
            No player found. Check the spelling, or contact the school office.
          </p>
        ) : (
          list.map((p) => {
            const tag = ORDER_STATE_TAGS[p.order_state];
            const blocked = p.order_state === "submitted" || p.order_state === "verified";
            const selected = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                disabled={blocked}
                aria-pressed={selected}
                onClick={() => onPick(p)}
                className={`grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border-[1.5px] px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-55 ${
                  selected
                    ? "border-brand bg-[#fff4ef]"
                    : "border-transparent bg-paper hover:enabled:border-ink"
                }`}
              >
                <span className="grid size-10 place-items-center rounded-full bg-ink font-head text-[15px] font-black text-brand [font-stretch:125%]">
                  {initials(p.full_name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{p.full_name}</span>
                  <span className="text-[12.5px] text-ink-3">
                    {[
                      p.class_name,
                      p.jersey_number != null ? `No. ${p.jersey_number}` : null,
                      p.jersey_size ? `Size ${p.jersey_size}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {tag ? (
                  <Tag tone={tag.tone}>{tag.label}</Tag>
                ) : selected ? (
                  <Tag tone="brand">Selected</Tag>
                ) : (
                  <Tag>Select</Tag>
                )}
              </button>
            );
          })
        )}
      </div>
      <Actions>
        <PillButton type="button" disabled={!selectedId} onClick={onNext}>
          Continue
        </PillButton>
      </Actions>
    </div>
  );
}

function PaymentDetails({
  settings,
  method,
  amount,
  note,
}: {
  settings: JerseySettings;
  method: PaymentMethod;
  amount: number;
  note: string;
}) {
  if (method === "Bank Transfer") {
    const rows: [string, string][] = [
      ["Account name", settings.bank_account_name],
      ["Account number", settings.bank_account_number],
      ["IFSC", settings.bank_ifsc],
      ["Bank", [settings.bank_name, settings.bank_branch].filter(Boolean).join(", ")],
    ];
    const filled = rows.filter(([, v]) => v);
    if (filled.length === 0) return <NotSetUp what="Bank transfer" />;
    return (
      <div className="grid gap-2">
        {filled.map(([label, value]) => (
          <CopyLine key={label} label={label} value={value} />
        ))}
      </div>
    );
  }
  if (!settings.upi_id) return <NotSetUp what="UPI" />;
  if (method === "QR") {
    const qr = buildQrUrl(settings, amount, note);
    return (
      <div className="grid justify-items-center gap-2 rounded-[18px] bg-paper p-[18px]">
        <img
          src={qr}
          alt="UPI payment QR code"
          className="size-[210px] max-w-full rounded-[10px] bg-white"
        />
        <p className="m-0 text-center text-[13px]">
          <b>Scan with any UPI app.</b> The amount {formatCurrency(amount)} is filled in.
        </p>
        <button
          type="button"
          onClick={() => void downloadQr(qr)}
          className="pill pill-dark pill-sm"
        >
          <Download className="size-3.5" /> Download QR
        </button>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <CopyLine label="UPI ID" value={settings.upi_id} />
      <div className="rounded-[14px] bg-paper px-3.5 py-3">
        <span className="label text-ink-2">Pay to</span>
        <b className="block">{settings.payee_name}</b>
      </div>
      <div className="mt-1">
        <PillButton
          type="button"
          onClick={() => {
            window.location.href = buildUpiUri(settings, amount, note);
          }}
        >
          Pay now in UPI app
        </PillButton>
      </div>
      <p className="m-0 text-[12.5px] text-ink-3">
        On a phone, this opens GPay, PhonePe or Paytm with the amount filled in.
      </p>
    </div>
  );
}

function NotSetUp({ what }: { what: string }) {
  return (
    <p className="rounded-[14px] bg-warn-bg px-4 py-3 text-sm text-warn">
      {what} details are not added yet. Please choose another method or contact the school.
    </p>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-[14px] bg-paper px-3.5 py-3">
      <div className="min-w-0">
        <span className="label text-ink-2">{label}</span>
        <b className="block break-all">{value}</b>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard can be blocked; the value is still visible to copy by hand.
          }
        }}
        className="inline-flex flex-none items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white"
      >
        <Copy className="size-3.5" />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ProofPicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <label className="grid cursor-pointer place-items-center gap-2 rounded-[18px] border-2 border-dashed border-rule bg-paper px-4 py-8 text-center hover:border-brand">
      {file ? (
        <>
          {preview ? (
            <img
              src={preview}
              alt="Payment screenshot preview"
              className="max-h-[220px] rounded-xl"
            />
          ) : (
            <span className="rounded-xl bg-ink px-5 py-4 font-bold text-brand">PDF attached</span>
          )}
          <span className="text-[12.5px] text-ink-3">{file.name} · tap to change</span>
        </>
      ) : (
        <>
          <span className="arrow-btn size-[50px]">
            <ArrowIcon className="size-5 -rotate-45" />
          </span>
          <b>Tap to upload the screenshot</b>
          <span className="text-[12.5px] text-ink-3">Photo or PDF, up to 5 MB. Required.</span>
        </>
      )}
      <input
        type="file"
        accept={PROOF_ACCEPT}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function Actions({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-2.5">
      {onBack ? (
        <button type="button" onClick={onBack} className="pill pill-ghost">
          Back
        </button>
      ) : (
        <span />
      )}
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-paper px-3.5 py-3">
      <dt className="label text-ink-3">{label}</dt>
      <dd className="mt-1 text-base font-bold">{value}</dd>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2.5 border-b border-white/12 pb-1.5">
      <dt className="text-white/65">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

async function downloadQr(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("QR download failed");
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "mms-jersey-payment-qr.png";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
