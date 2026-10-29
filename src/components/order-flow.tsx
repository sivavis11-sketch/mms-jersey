import { Link } from "@tanstack/react-router";
import { Copy, Download, Search, Upload } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { CheckIcon, JerseyArt, PillButton, Tag } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import type {
  JerseyOrder,
  JerseySettings,
  PaymentStatus,
  StudentMatch,
} from "@/integrations/supabase/types";
import {
  MAX_PROOF_BYTES,
  DEFAULT_JERSEY_IMAGE,
  ORDER_STATE_TAGS,
  PAYMENT_METHODS,
  PROOF_ACCEPT,
  PROOF_TYPES,
  buildQrUrl,
  buildUpiUri,
  formatCurrency,
  gradeLabel,
  initials,
  printName,
  saveOrder,
  sizeForChest,
  type PaymentMethod,
} from "@/lib/jersey";

const STEPS = ["Find your child", "Jersey details", "Place order", "Payment"];
const SEARCH_MIN = 3;

export function OrderFlow({ settings }: { settings: JerseySettings }) {
  const [step, setStep] = useState(0);
  const [student, setStudent] = useState<StudentMatch | null>(null);
  const [number, setNumber] = useState("");
  const [print, setPrint] = useState("");
  const [size, setSize] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  const amount = Number(settings.unit_price);
  const jerseyNumber = number === "" ? null : Number(number);
  const numberOk =
    jerseyNumber != null &&
    Number.isInteger(jerseyNumber) &&
    jerseyNumber >= 0 &&
    jerseyNumber <= 99;
  const printOk = PRINT_NAME_RE.test(print.trim());
  const detailsOk = numberOk && printOk && !!size;

  function go(next: number) {
    setError(null);
    setStep(next);
    document.getElementById("order")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function pickStudent(s: StudentMatch) {
    if (s.id !== student?.id) {
      setNumber("");
      setPrint("");
      setSize(null);
    }
    setStudent(s);
    setConfirmed(false);
  }

  async function placeOrder() {
    if (!student || !detailsOk || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("jersey_place_order", {
        p_player_id: student.id,
        p_jersey_number: jerseyNumber!,
        p_print_name: print.trim(),
        p_jersey_size: size!,
      });
      if (rpcError || !data) throw new Error(rpcError?.message ?? "The order could not be saved.");
      saveOrder({ orderId: data.order_id, token: data.access_token, playerName: data.player_name });
      setPlaced(data);
      go(3);
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
    setStudent(null);
    setNumber("");
    setPrint("");
    setSize(null);
    setConfirmed(false);
    setPlaced(null);
  }

  return (
    <div>
      <ol className="mb-6 grid grid-cols-4 gap-3 sm:gap-4">
        {STEPS.map((label, i) => {
          const reached = step === 4 || i <= step;
          // Once the order is placed, the earlier steps are done and can't be reopened.
          const canGoBack = i < step && step < 3;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!canGoBack}
                onClick={() => go(i)}
                className="block w-full text-left disabled:cursor-default"
              >
                <span
                  className={`block h-1 rounded-full ${reached ? "bg-brand" : "bg-white/10"}`}
                />
                <span
                  className={`mt-2 block font-condensed text-[11px] tracking-[0.16em] uppercase sm:text-xs ${
                    i === step ? "text-brand" : "text-ink-2"
                  }`}
                >
                  0{i + 1}
                  <span className="max-sm:hidden"> {label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div
        className={
          step === 4
            ? "mx-auto grid max-w-xl"
            : "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]"
        }
      >
        <div
          key={step}
          className={`card animate-fade-up ${step === 4 ? "overflow-hidden p-0" : ""}`}
        >
          {step < 4 && (
            <div className="mb-6 flex items-center gap-3">
              <span className="grid size-8 flex-none place-items-center rounded-md bg-brand-soft font-display text-sm text-brand">
                0{step + 1}
              </span>
              <h3 className="font-condensed text-xl font-semibold tracking-[0.15em] uppercase">
                {STEPS[step]}
              </h3>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-bad/40 bg-bad-bg px-4 py-3 text-sm text-bad"
            >
              {error}
            </p>
          )}

          {step === 0 && <FindStep selected={student} onPick={pickStudent} onNext={() => go(1)} />}

          {step === 1 && student && (
            <div>
              <dl className="mb-5 grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Fact label="Student" value={student.full_name} />
                </div>
                <Fact label="Admission no." value={student.admission_no ?? "—"} />
                <Fact label="Grade" value={gradeLabel(student.class_name)} />
              </dl>
              <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                <label className="grid gap-2">
                  <span className="label text-ink-2">Jersey no.</span>
                  <input
                    id="jersey-number"
                    value={number}
                    onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    inputMode="numeric"
                    placeholder="0–99"
                    className="field-input font-display text-2xl"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="label text-ink-2">Name to print</span>
                  <input
                    id="print-name"
                    value={print}
                    onChange={(e) =>
                      setPrint(
                        e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z .'-]/g, "")
                          .slice(0, 12),
                      )
                    }
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder={student.full_name.split(" ")[0]?.slice(0, 12)}
                    className="field-input font-display text-2xl tracking-wide"
                  />
                </label>
              </div>
              <p className="mt-2 text-[12.5px] text-ink-3">
                Number from 0 to 99. Name up to 12 letters, printed in capitals.
              </p>
              <SizePicker settings={settings} size={size} onChange={setSize} />
              <Actions onBack={() => go(0)}>
                <PillButton type="button" disabled={!detailsOk} onClick={() => go(2)}>
                  Continue
                </PillButton>
              </Actions>
            </div>
          )}

          {step === 2 && student && (
            <div>
              <p className="-mt-2 mb-5 text-sm text-ink-2">
                Check everything once more. It is printed exactly like this.
              </p>
              <dl>
                <ReceiptLine label="Student" value={student.full_name} />
                <ReceiptLine
                  label="Adm. no. · Grade"
                  value={`${student.admission_no ?? "—"} · ${gradeLabel(student.class_name)}`}
                />
                <ReceiptLine
                  label="Jersey"
                  value={`No. ${number} · "${print.trim()}" · Size ${size}`}
                />
                <ReceiptLine label="Price" value={formatCurrency(amount)} />
              </dl>
              <label className="mt-5 flex items-start gap-2.5 rounded-lg border border-brand/30 bg-brand-soft p-4 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 size-[18px] flex-none accent-[var(--orange)]"
                />
                The number, name and size are correct.
              </label>
              <p className="mt-3 text-[12.5px] text-ink-3">
                Next you'll see how to pay. You can also pay later from "My orders", or in cash at
                the school office.
              </p>
              <Actions onBack={() => go(1)}>
                <PillButton
                  type="button"
                  disabled={!confirmed || submitting}
                  onClick={() => void placeOrder()}
                >
                  {submitting ? "Placing order…" : "Place order"}
                </PillButton>
              </Actions>
            </div>
          )}

          {step === 3 && placed && (
            <PaymentPanel
              settings={settings}
              order={placed}
              token={placed.access_token}
              onPaid={(o) => {
                setPlaced({ ...o, access_token: placed.access_token });
                go(4);
              }}
              onLater={() => go(4)}
            />
          )}

          {step === 4 && placed && <PlacedReceipt order={placed} onRestart={restart} />}
        </div>

        <aside
          className={`rounded-xl border border-line bg-panel p-5 sm:p-6 lg:sticky lg:top-6 ${step === 4 ? "hidden" : ""}`}
        >
          <div className="grid aspect-[5/4] place-items-center overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_40%,rgba(255,77,18,0.28),#0a0a0a_70%)]">
            <JerseyArt
              image={settings.jersey_image_url || DEFAULT_JERSEY_IMAGE}
              name={print.trim() || "YOUR NAME"}
              number={numberOk ? String(jerseyNumber).padStart(2, "0") : "00"}
              className={
                settings.jersey_image_url || DEFAULT_JERSEY_IMAGE
                  ? "size-full object-cover"
                  : "w-[52%] drop-shadow-[0_24px_30px_rgba(0,0,0,0.7)]"
              }
            />
          </div>
          <div className="mt-6 font-condensed text-xs tracking-[0.3em] text-ink-2 uppercase">
            Your order
          </div>
          <dl className="mt-3 grid gap-2 text-sm">
            <SumRow label="Student" value={student?.full_name ?? "—"} />
            <SumRow label="Grade" value={student ? gradeLabel(student.class_name) : "—"} />
            <SumRow label="Number" value={numberOk ? String(jerseyNumber) : "—"} />
            <SumRow label="Size" value={size ?? "—"} />
          </dl>
          <div className="mt-5 flex items-baseline justify-between gap-4 rounded-lg border border-brand/30 bg-brand-soft px-4 py-3.5">
            <span className="font-condensed text-xs tracking-[0.25em] text-ink-2 uppercase">
              Total
            </span>
            <span className="font-display text-3xl text-brand">{formatCurrency(amount)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

type PlacedOrder = JerseyOrder & { access_token: string };

// Letters, spaces, dots, apostrophes and hyphens; must start with a letter. Same rule as the database.
const PRINT_NAME_RE = /^[A-Z][A-Z .'-]{0,11}$/;

function SizePicker({
  settings,
  size,
  onChange,
}: {
  settings: JerseySettings;
  size: string | null;
  onChange: (s: string) => void;
}) {
  const [chest, setChest] = useState("");
  const hasChart = settings.size_chart.length > 0;
  return (
    <div className="mt-6">
      <div className="label text-ink-2">Jersey size</div>
      {hasChart && (
        <label className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-line bg-ink px-4 py-3">
          <span>
            <span className="block text-sm font-semibold">Chest size in inches (optional)</span>
            <span className="text-[12.5px] text-ink-3">
              Measure armpit to armpit. We pick the size for you.
            </span>
          </span>
          <input
            id="chest-in"
            value={chest}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d.]/g, "").slice(0, 4);
              setChest(v);
              const picked = sizeForChest(settings.size_chart, Number(v));
              if (picked) onChange(picked);
            }}
            inputMode="decimal"
            placeholder="15"
            className="field-input w-20 flex-none text-center"
          />
        </label>
      )}
      <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5">
        {settings.sizes.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={size === option}
            onClick={() => onChange(option)}
            className={`rounded-lg border py-3.5 font-condensed text-base tracking-wide ${
              size === option
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-white/55 hover:border-white/40"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {size && chest && Number(chest) > 0 && (
        <p className="mt-2 text-[12.5px] text-ink-3">
          Chest {chest} in → size {size}. You can tap another size.
        </p>
      )}
    </div>
  );
}

/** Pay for a placed order: UPI, QR or bank, then the screenshot. Also used on "My orders". */
export function PaymentPanel({
  settings,
  order,
  token,
  onPaid,
  onLater,
}: {
  settings: JerseySettings;
  order: JerseyOrder;
  token: string;
  onPaid: (order: JerseyOrder) => void;
  onLater?: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("QR");
  const [proof, setProof] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const amount = Number(order.amount);

  async function submit() {
    if (submitting) return;
    setError(null);
    if (!proof) return setError("Please upload your payment screenshot.");
    if (proof.size > MAX_PROOF_BYTES) return setError("The screenshot must be 5 MB or smaller.");
    if (proof.type && !PROOF_TYPES.includes(proof.type))
      return setError("The screenshot must be a photo (JPG, PNG, WEBP, HEIC) or a PDF.");
    setSubmitting(true);
    try {
      const safeName = proof.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60);
      const path = `proofs/${order.order_id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("jersey-proofs")
        .upload(
          path,
          proof,
          proof.type ? { upsert: false, contentType: proof.type } : { upsert: false },
        );
      if (uploadError) throw new Error(uploadError.message);
      const { data, error: rpcError } = await supabase.rpc("jersey_submit_payment", {
        p_order_id: order.order_id,
        p_access_token: token,
        p_payment_method: method,
        p_payment_proof: path,
        p_payment_reference: reference.trim() || undefined,
      });
      if (rpcError || !data)
        throw new Error(rpcError?.message ?? "The payment could not be saved.");
      onPaid(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "We couldn't save the payment. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-2">
        <Tag tone="bad">Not paid</Tag>
        <span>
          Order <b className="text-white">{order.order_id}</b> is placed. Pay now to confirm it.
        </span>
      </div>
      {order.payment_status === "rejected" && (
        <p className="mb-4 rounded-lg border border-bad/40 bg-bad-bg px-4 py-3 text-sm text-bad">
          The school could not accept the last payment
          {order.payment_rejection_reason ? `: ${order.payment_rejection_reason}` : ""}. Please pay
          again or upload a clearer screenshot.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-bad/40 bg-bad-bg px-4 py-3 text-sm text-bad"
        >
          {error}
        </p>
      )}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand-soft px-5 py-4">
        <span className="label">Amount to pay</span>
        <b className="font-display text-4xl leading-none font-normal text-brand">
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
            className={`rounded-lg border px-2 py-3.5 font-condensed text-sm font-semibold tracking-[0.18em] uppercase ${
              method === m.value
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-white/60 hover:border-white/40"
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
        note={`MMS Jersey ${order.order_id}`}
      />
      <div className="mt-5">
        <ProofPicker file={proof} onChange={setProof} />
      </div>
      <label className="mt-3.5 grid gap-2">
        <span className="font-condensed text-xs tracking-[0.22em] text-ink-2 uppercase">
          UTR / reference number (optional)
        </span>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          inputMode="numeric"
          maxLength={40}
          placeholder="12-digit number from the UPI app"
          className="field-input"
        />
      </label>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <PillButton type="button" disabled={!proof || submitting} onClick={() => void submit()}>
          {submitting ? "Saving…" : "Submit payment"}
        </PillButton>
        {onLater && (
          <button type="button" onClick={onLater} className="pill pill-ghost">
            Pay later
          </button>
        )}
      </div>
    </div>
  );
}

/** The "order placed" card: the child's own jersey on top, then a receipt with the payment state. */
function PlacedReceipt({ order, onRestart }: { order: JerseyOrder; onRestart: () => void }) {
  const first = order.player_name.split(" ")[0];
  const paid = order.payment_status === "submitted" || order.payment_status === "verified";
  return (
    <div>
      <div className="relative grid h-[280px] place-items-center pt-10 bg-[radial-gradient(circle_at_50%_45%,rgba(255,77,18,0.45),#0a0a0a_72%)]">
        <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 font-condensed text-xs font-bold tracking-[0.16em] text-white uppercase">
          <CheckIcon className="size-3.5" /> Order placed
        </span>
        <JerseyArt
          name={printName({ print_name: order.print_name, full_name: order.player_name })}
          number={order.jersey_number != null ? String(order.jersey_number).padStart(2, "0") : ""}
          className="w-[170px] drop-shadow-[0_22px_26px_rgba(0,0,0,0.7)]"
        />
      </div>
      <div className="p-6 sm:p-8">
        <PaymentState order={order} />
        <h3 className="h-md mt-5">{paid ? "Thank you!" : `${first}'s order is saved`}</h3>
        <p className="mt-2 text-sm text-ink-2">
          {paid
            ? `${first}'s jersey is ordered. The school checks your payment and confirms it.`
            : `Pay ${formatCurrency(Number(order.amount))} to confirm it: open "My orders" to pay by UPI, or pay cash at the school office. The jersey is made only after payment.`}
        </p>
        <dl className="mt-3.5">
          <ReceiptLine label="Student" value={order.player_name} />
          <ReceiptLine
            label="Adm. no. · Grade"
            value={`${order.admission_no ?? "—"} · ${gradeLabel(order.class_name)}`}
          />
          <ReceiptLine
            label="Jersey"
            value={`No. ${order.jersey_number ?? "—"} · "${order.print_name ?? ""}" · Size ${order.jersey_size}`}
          />
          <div className="flex items-baseline justify-between py-3 text-sm">
            <dt className="text-ink-2">Amount</dt>
            <dd className="font-display text-2xl text-brand">
              {formatCurrency(Number(order.amount))}
            </dd>
          </div>
        </dl>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-brand/40 bg-ink px-4 py-3">
          <span className="font-condensed text-xs tracking-[0.26em] text-ink-2 uppercase">
            Order ID
          </span>
          <span className="font-display text-2xl text-brand">{order.order_id}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link to="/status" className="pill px-3">
            {paid ? "My orders" : "Pay now"}
          </Link>
          <button type="button" onClick={onRestart} className="pill pill-ghost px-3">
            Another child
          </button>
        </div>
      </div>
    </div>
  );
}

const PAYMENT_STATE_COPY: Record<PaymentStatus, { title: string; text: string; cls: string }> = {
  pending: {
    title: "Not paid",
    text: "Pay to confirm this order.",
    cls: "border-bad/40 bg-bad-bg text-bad",
  },
  rejected: {
    title: "Not paid",
    text: "The last payment was not accepted. Please pay again.",
    cls: "border-bad/40 bg-bad-bg text-bad",
  },
  submitted: {
    title: "Paid · not verified",
    text: "We have your screenshot. The school will check it and confirm the order.",
    cls: "border-warn/40 bg-warn-bg text-warn",
  },
  verified: {
    title: "Paid · verified",
    text: "The school has checked your payment. Your order is confirmed.",
    cls: "border-ok/40 bg-ok-bg text-ok",
  },
};

/** The big payment-state banner parents see after ordering and on "My orders". */
export function PaymentState({ order }: { order: JerseyOrder }) {
  const s = PAYMENT_STATE_COPY[order.payment_status] ?? PAYMENT_STATE_COPY.pending;
  return (
    <div className={`rounded-xl border px-5 py-4 text-center ${s.cls}`}>
      <div className="font-condensed text-xs font-semibold tracking-[0.22em] uppercase">
        Payment
      </div>
      <div className="mt-1 font-display text-3xl leading-none uppercase">{s.title}</div>
      <p className="mt-2 text-[13px] text-white/85">
        {order.payment_method === "Cash" && order.receipt_no
          ? `Paid in cash · receipt ${order.receipt_no}.`
          : s.text}
      </p>
    </div>
  );
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-3 text-sm">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

function FindStep({
  selected,
  onPick,
  onNext,
}: {
  selected: StudentMatch | null;
  onPick: (s: StudentMatch) => void;
  onNext: () => void;
}) {
  const [query, setQuery] = useState(selected?.full_name ?? "");
  const [matches, setMatches] = useState<StudentMatch[] | null>(selected ? [selected] : null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < SEARCH_MIN) {
      setMatches(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("jersey_search_players", { p_query: q });
      if (!live) return;
      setSearchError(error ? error.message : null);
      setMatches(data ?? []);
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q]);

  return (
    <div>
      <p className="-mt-2 mb-5 text-sm text-ink-2">
        Type at least {SEARCH_MIN} letters of your child's name, or the admission number.
      </p>
      <label className="relative block">
        <span className="sr-only">Child's name or admission number</span>
        <Search className="absolute top-1/2 left-[17px] size-[18px] -translate-y-1/2 text-ink-2" />
        <input
          id="student-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Child's name or admission no."
          autoComplete="off"
          className="w-full rounded-lg border border-line bg-ink py-3.5 pr-4 pl-[46px] text-[15px] placeholder:text-white/30 focus:border-brand focus:outline-none"
        />
      </label>
      <div className="mt-3.5 grid gap-1.5">
        {searchError ? (
          <p className="text-sm text-bad">The search didn't work: {searchError}</p>
        ) : matches === null ? (
          <p className="text-sm text-ink-3">Matching students show here.</p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-ink-3">
            No student found. Check the spelling, or contact the school office.
          </p>
        ) : (
          matches.map((p) => {
            const tag = ORDER_STATE_TAGS[p.order_state];
            const blocked = p.order_state === "submitted" || p.order_state === "verified";
            const isSelected = p.id === selected?.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={blocked}
                aria-pressed={isSelected}
                onClick={() => onPick(p)}
                className={`grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
                  isSelected
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-ink hover:enabled:border-white/40"
                }`}
              >
                <span className="grid size-10 place-items-center rounded-md bg-paper font-display text-[15px] text-brand">
                  {initials(p.full_name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{p.full_name}</span>
                  <span className="flex flex-wrap gap-x-2 text-[12.5px] text-ink-3">
                    {p.admission_no && (
                      <span className="font-condensed font-bold tracking-wide text-white">
                        Adm. {p.admission_no}
                      </span>
                    )}
                    <span>{gradeLabel(p.class_name)}</span>
                  </span>
                </span>
                {isSelected ? (
                  <Tag tone="brand">Selected</Tag>
                ) : tag ? (
                  <Tag tone={tag.tone}>{tag.label}</Tag>
                ) : (
                  <Tag>Select</Tag>
                )}
              </button>
            );
          })
        )}
      </div>
      {selected && (selected.order_state === "pending" || selected.order_state === "rejected") && (
        <p className="mt-3 rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          {selected.full_name} already has an unpaid order. Continuing updates that order and takes
          you to payment.
        </p>
      )}
      <Actions>
        <PillButton type="button" disabled={!selected} onClick={onNext}>
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
      <div className="grid justify-items-center gap-3 rounded-lg border border-line bg-ink p-5">
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
      <div className="rounded-lg border border-line bg-ink px-4 py-3">
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
    <p className="rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
      {what} details are not added yet. Please choose another method or contact the school.
    </p>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-line bg-ink px-4 py-3">
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
        className="inline-flex flex-none items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 font-condensed text-xs font-semibold tracking-[0.15em] text-white uppercase hover:border-brand hover:text-brand"
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
    <label className="grid cursor-pointer place-items-center gap-2 rounded-lg border-2 border-dashed border-line bg-ink px-4 py-9 text-center hover:border-brand">
      {file ? (
        <>
          {preview ? (
            <img
              src={preview}
              alt="Payment screenshot preview"
              className="max-h-[220px] rounded-xl"
            />
          ) : (
            <span className="rounded-lg bg-paper px-5 py-4 font-bold text-brand">PDF attached</span>
          )}
          <span className="text-[12.5px] text-ink-3">{file.name} · tap to change</span>
        </>
      ) : (
        <>
          <span className="arrow-btn size-[52px]">
            <Upload className="size-5" />
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
    <div className="rounded-lg border border-line/70 p-4">
      <dt className="font-condensed text-xs tracking-[0.2em] text-ink-2 uppercase">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2.5 border-b border-line pb-2">
      <dt className="text-ink-2">{label}</dt>
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
