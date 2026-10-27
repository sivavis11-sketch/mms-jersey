import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Banknote,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  ImagePlus,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { Logo, Tag } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import type { AdminPlayer, JerseyOrder, JerseySettings } from "@/integrations/supabase/types";
import {
  MANUAL_ORDER_STATUSES,
  MAX_PROOF_BYTES,
  ORDER_STATE_TAGS,
  ORDER_STATUS_LABELS,
  paymentLabel,
  PROOF_ACCEPT,
  PROOF_TYPES,
  JERSEY_IMAGE_TYPES,
  MAX_JERSEY_IMAGE_BYTES,
  formatCurrency,
  sizeForChest,
  type SizeChartRow,
} from "@/lib/jersey";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · MMS Jersey" }] }),
  component: AdminPage,
});

type Tab = "orders" | "players" | "settings";

function AdminPage() {
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<JerseyOrder[]>([]);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [settings, setSettings] = useState<JerseySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const { data: ok } = await supabase.rpc("jersey_is_admin");
        setAdmin(ok === true);
        if (ok) void loadAll();
      }
      setReady(true);
    })();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [o, p, s] = await Promise.all([
      supabase.rpc("jersey_admin_list_orders"),
      supabase.rpc("jersey_admin_list_players"),
      supabase.rpc("jersey_get_settings"),
    ]);
    const err = o.error ?? p.error ?? s.error;
    if (err) setMessage({ text: err.message, bad: true });
    setOrders(o.data ?? []);
    setPlayers(p.data ?? []);
    if (s.data) setSettings(s.data);
    setLoading(false);
  }

  function notify(text: string, bad = false) {
    setMessage({ text, bad });
  }

  if (!ready)
    return (
      <Shell>
        <p className="py-24 text-center text-ink-2">Checking admin access…</p>
      </Shell>
    );
  if (!admin)
    return (
      <Shell>
        <Login
          onSignedIn={() => {
            setAdmin(true);
            void loadAll();
          }}
        />
      </Shell>
    );

  const live = orders.filter((o) => o.order_status !== "cancelled");
  const verified = live.filter((o) => o.payment_status === "verified");
  const stats = {
    needsCheck: live.filter((o) => o.payment_status === "submitted").length,
    verified: verified.length,
    notOrdered: players.filter((p) => p.is_active && p.order_state === "none").length,
    collected: verified.reduce((sum, o) => sum + Number(o.payment_received_amount ?? o.amount), 0),
  };

  return (
    <Shell>
      <section className="band border-b border-line bg-[radial-gradient(circle_at_20%_0%,rgba(255,77,18,0.16),transparent_55%)]">
        <div className="inner flex flex-wrap items-end justify-between gap-5 pt-10 pb-10">
          <div>
            <div className="label text-brand">Admin</div>
            <h1 className="h-lg mt-2.5">
              Orders &amp; <span className="text-brand">payments</span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadAll()} className="pill pill-sm pill-dark">
              <RefreshCw className="size-3.5" /> Refresh
            </button>
            <button
              type="button"
              onClick={() => exportCsv(orders)}
              className="pill pill-sm pill-dark"
            >
              <Download className="size-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                setAdmin(false);
              }}
              className="pill pill-sm"
            >
              <LogOut className="size-3.5" /> Log out
            </button>
          </div>
        </div>
      </section>

      <section className="band pb-16">
        <div className="inner">
          <div className="my-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard tone="orange" label="Needs check" value={String(stats.needsCheck)} />
            <StatCard tone="black" label="Paid & verified" value={String(stats.verified)} />
            <StatCard tone="light" label="Not ordered yet" value={String(stats.notOrdered)} />
            <StatCard tone="light" label="Collected" value={formatCurrency(stats.collected)} />
          </div>

          <div className="mb-4 inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-panel p-1">
            {(
              [
                ["orders", `Orders (${orders.length})`],
                ["players", `Players & sizes (${players.length})`],
                ["settings", "Settings"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-md px-4 py-2 font-condensed font-semibold tracking-[0.16em] text-xs whitespace-nowrap uppercase ${
                  tab === key ? "bg-brand text-white" : "text-ink-2 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {message && (
            <p
              role="status"
              className={`mb-4 flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium ${
                message.bad ? "bg-bad-bg text-bad" : "bg-ok-bg text-ok"
              }`}
            >
              {message.text}
              <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </p>
          )}

          {loading && <p className="mb-4 text-sm text-ink-2">Loading…</p>}

          {tab === "orders" && (
            <OrdersTab
              orders={orders}
              onChanged={(o) => {
                setOrders((rows) => rows.map((r) => (r.id === o.id ? o : r)));
                void supabase
                  .rpc("jersey_admin_list_players")
                  .then(({ data }) => data && setPlayers(data));
              }}
              onDeleted={(id) => {
                setOrders((rows) => rows.filter((r) => r.id !== id));
                void supabase
                  .rpc("jersey_admin_list_players")
                  .then(({ data }) => data && setPlayers(data));
              }}
              notify={notify}
            />
          )}
          {tab === "players" && settings && (
            <PlayersTab players={players} settings={settings} reload={loadAll} notify={notify} />
          )}
          {tab === "settings" && settings && (
            <SettingsTab settings={settings} onSaved={setSettings} notify={notify} />
          )}
        </div>
      </section>
    </Shell>
  );
}

/* ---------------------------------- Login ---------------------------------- */

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function login(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }
    const { data: ok } = await supabase.rpc("jersey_is_admin");
    setBusy(false);
    if (!ok) {
      await supabase.auth.signOut();
      setError("This account is not on the MMS Jersey admin list.");
      return;
    }
    onSignedIn();
  }

  async function reset() {
    const clean = email.trim().toLowerCase();
    if (!clean) return setError("Enter your admin email first.");
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (resetError) setError(resetError.message);
    else
      setInfo("If that account exists, a reset link is on its way. Open it to set a new password.");
  }

  return (
    <section className="band bg-ink py-16 text-white">
      <div className="inner grid items-center gap-10 md:grid-cols-2">
        <div>
          <div className="label text-brand">Restricted area</div>
          <h1 className="h-xl mt-2.5">
            Admin
            <br />
            login
          </h1>
          <p className="mt-4 max-w-[40ch] text-white/70">
            Sign in with an MMS Jersey admin account.
          </p>
        </div>
        <form onSubmit={login} className="card grid gap-4">
          {error && <p className="rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad">{error}</p>}
          {info && <p className="rounded-lg bg-ok-bg px-4 py-3 text-sm text-ok">{info}</p>}
          <Field label="Admin email">
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field-input"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input"
            />
          </Field>
          <button disabled={busy} className="pill w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => void reset()}
            disabled={busy}
            className="label text-ink-2 hover:text-brand"
          >
            Forgot password?
          </button>
        </form>
      </div>
    </section>
  );
}

/* ---------------------------------- Orders --------------------------------- */

const PAYMENT_FILTERS = [
  ["all", "All payments"],
  ["submitted", "Needs check"],
  ["verified", "Paid & verified"],
  ["cash", "Paid in cash"],
  ["rejected", "Rejected"],
  ["pending", "Not paid"],
] as const;

function OrdersTab({
  orders,
  onChanged,
  onDeleted,
  notify,
}: {
  orders: JerseyOrder[];
  onChanged: (o: JerseyOrder) => void;
  onDeleted: (id: number) => void;
  notify: (text: string, bad?: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [payment, setPayment] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = orders.find((o) => o.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (!q ||
          [o.order_id, o.player_name, o.class_name, o.jersey_number, o.payment_reference].some(
            (v) =>
              String(v ?? "")
                .toLowerCase()
                .includes(q),
          )) &&
        (payment === "all" ||
          (payment === "cash"
            ? o.payment_method === "Cash" && o.payment_status === "verified"
            : o.payment_status === payment)),
    );
  }, [orders, search, payment]);

  return (
    <>
      <div className="mb-3 grid gap-2 md:grid-cols-[1fr_220px]">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search order, player, class, UTR…"
        />
        <select
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
          className="field-input"
        >
          {PAYMENT_FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <TableWrap>
        <thead>
          <tr>
            {["Order", "Player", "Size", "Amount", "Method", "Payment", "Status", "Placed"].map(
              (h) => (
                <Th key={h}>{h}</Th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={8} className="p-10 text-center text-ink-2">
                No orders match.
              </td>
            </tr>
          ) : (
            filtered.map((o) => {
              const pay = paymentLabel(o.payment_status);
              return (
                <tr
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-paper"
                >
                  <Td className="font-display">{o.order_id}</Td>
                  <Td>
                    <b>{o.player_name}</b>
                    <div className="text-xs text-ink-3">
                      {[o.class_name, o.jersey_number != null ? `No. ${o.jersey_number}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </Td>
                  <Td>{o.jersey_size}</Td>
                  <Td>{formatCurrency(Number(o.amount))}</Td>
                  <Td>{o.payment_method ?? "—"}</Td>
                  <Td>
                    <Tag tone={pay.tone}>{pay.label}</Tag>
                    {o.payment_status === "submitted" ? (
                      <div className="mt-1 font-condensed text-xs font-semibold tracking-[0.14em] text-brand uppercase">
                        Check receipt →
                      </div>
                    ) : (
                      o.payment_status === "verified" && (
                        <div className="mt-1 text-xs text-ok">Order confirmed</div>
                      )
                    )}
                  </Td>
                  <Td>{ORDER_STATUS_LABELS[o.order_status] ?? o.order_status}</Td>
                  <Td className="text-xs text-ink-3">{new Date(o.created_at).toLocaleString()}</Td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableWrap>
      {selected && (
        <OrderDrawer
          order={selected}
          onClose={() => setSelectedId(null)}
          onChanged={onChanged}
          onDeleted={(id) => {
            setSelectedId(null);
            onDeleted(id);
          }}
          notify={notify}
        />
      )}
    </>
  );
}

function OrderDrawer({
  order,
  onClose,
  onChanged,
  onDeleted,
  notify,
}: {
  order: JerseyOrder;
  onClose: () => void;
  onChanged: (o: JerseyOrder) => void;
  onDeleted: (id: number) => void;
  notify: (text: string, bad?: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<"none" | "reject" | "cash">("none");
  const [reason, setReason] = useState("");
  const [cashAmount, setCashAmount] = useState(String(Number(order.amount)));
  const [cashNote, setCashNote] = useState("");
  const [notes, setNotes] = useState(order.admin_notes ?? "");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const verified = order.payment_status === "verified";
  const rejected = order.payment_status === "rejected";
  const pay = paymentLabel(order.payment_status);

  // Open the receipt straight away so the admin can check it and approve in one go.
  useEffect(() => {
    setProofUrl(null);
    if (!order.payment_proof) return;
    let live = true;
    void supabase.storage
      .from("jersey-proofs")
      .createSignedUrl(order.payment_proof, 600)
      .then(({ data }) => {
        if (live && data) setProofUrl(data.signedUrl);
      });
    return () => {
      live = false;
    };
  }, [order.payment_proof]);

  async function run(
    action: () => PromiseLike<{ data: JerseyOrder | null; error: { message: string } | null }>,
    text: string,
  ) {
    setSaving(true);
    const { data, error } = await action();
    setSaving(false);
    if (error || !data) return notify(error?.message ?? "Something went wrong.", true);
    onChanged(data);
    setPanel("none");
    notify(text);
  }

  async function viewProof() {
    if (!order.payment_proof) return;
    const { data, error } = await supabase.storage
      .from("jersey-proofs")
      .createSignedUrl(order.payment_proof, 600);
    if (error || !data) notify(error?.message ?? "Could not open the screenshot.", true);
    else setProofUrl(data.signedUrl);
  }

  async function uploadProof(file: File) {
    if (file.size > MAX_PROOF_BYTES) return notify("Screenshot must be 5 MB or smaller.", true);
    if (file.type && !PROOF_TYPES.includes(file.type))
      return notify("Screenshot must be a photo (JPG, PNG, WEBP, HEIC) or a PDF.", true);
    setSaving(true);
    const path = `proofs/admin/${order.order_id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60)}`;
    const { error } = await supabase.storage
      .from("jersey-proofs")
      .upload(
        path,
        file,
        file.type ? { upsert: false, contentType: file.type } : { upsert: false },
      );
    setSaving(false);
    if (error) return notify(error.message, true);
    setProofUrl(null);
    await run(
      () => supabase.rpc("jersey_admin_set_proof", { p_id: order.id, p_path: path }),
      "Screenshot uploaded. Check it, then mark it paid & verified.",
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-ink px-6 py-5">
          <div>
            <div className="label text-brand">Order</div>
            <div className="font-display text-3xl">{order.order_id}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="arrow-btn bg-paper text-white hover:text-brand"
          >
            <X className="size-5" />
          </button>
        </div>

        <section className="border-b border-line p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="h-md">Payment</h3>
            <Tag tone={pay.tone}>{pay.label}</Tag>
          </div>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <Detail label="Order total" value={formatCurrency(Number(order.amount))} />
            <Detail label="Method" value={order.payment_method ?? "—"} />
            <Detail
              label={order.payment_method === "Cash" ? "Receipt note" : "UTR / reference"}
              value={order.payment_reference ?? "—"}
            />
            <Detail
              label="Submitted"
              value={
                order.payment_submitted_at
                  ? new Date(order.payment_submitted_at).toLocaleString()
                  : "—"
              }
            />
            {verified && (
              <>
                <Detail
                  label="Amount received"
                  value={formatCurrency(Number(order.payment_received_amount ?? order.amount))}
                />
                <Detail
                  label="Verified"
                  value={`${order.payment_verified_by ?? "—"}${order.payment_verified_at ? ` · ${new Date(order.payment_verified_at).toLocaleString()}` : ""}`}
                />
              </>
            )}
            {rejected && (
              <Detail label="Rejected because" value={order.payment_rejection_reason ?? "—"} />
            )}
          </dl>

          <div className="mt-5">
            {order.payment_proof ? (
              proofUrl ? (
                <div className="rounded-lg bg-paper p-3">
                  {order.payment_proof.toLowerCase().endsWith(".pdf") ? (
                    <iframe
                      src={proofUrl}
                      title="Payment screenshot"
                      className="h-[480px] w-full rounded bg-white"
                    />
                  ) : (
                    <img
                      src={proofUrl}
                      alt={`Payment screenshot for ${order.order_id}`}
                      className="mx-auto max-h-[340px] rounded object-contain"
                    />
                  )}
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="label mt-3 inline-flex items-center gap-1.5 text-brand"
                  >
                    <ExternalLink className="size-3.5" /> Open full size
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void viewProof()}
                  className="pill pill-dark pill-sm"
                >
                  <ExternalLink className="size-3.5" /> View screenshot
                </button>
              )
            ) : (
              <p className="rounded-lg bg-warn-bg px-4 py-3 text-xs text-warn">
                No screenshot yet. If the parent sent it another way (for example WhatsApp), upload
                it here before verifying.
              </p>
            )}
            {!verified && (
              <label
                className={`pill pill-ghost pill-sm mt-3 cursor-pointer ${saving ? "pointer-events-none opacity-60" : ""}`}
              >
                <Upload className="size-3.5" />{" "}
                {order.payment_proof ? "Replace screenshot" : "Upload screenshot"}
                <input
                  type="file"
                  accept={PROOF_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void uploadProof(f);
                  }}
                />
              </label>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {verified || rejected ? (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void run(
                    () => supabase.rpc("jersey_admin_reopen_payment", { p_id: order.id }),
                    `Payment for ${order.order_id} is back to unchecked.`,
                  )
                }
                className="pill pill-ghost pill-sm"
              >
                <RotateCcw className="size-3.5" /> Undo {verified ? "verification" : "rejection"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saving || !order.payment_proof}
                  title={order.payment_proof ? undefined : "Upload or wait for a screenshot first"}
                  onClick={() =>
                    void run(
                      () => supabase.rpc("jersey_admin_verify_payment", { p_id: order.id }),
                      `${order.order_id} marked paid & verified. Order confirmed.`,
                    )
                  }
                  className="pill bg-ok text-ink"
                >
                  <CheckCircle2 className="size-4" /> Approve · paid &amp; order confirmed
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setPanel(panel === "reject" ? "none" : "reject")}
                  className="pill bg-bad-bg text-bad hover:bg-bad hover:text-white"
                >
                  <XCircle className="size-4" /> Reject
                </button>
              </>
            )}
            {!verified && (
              <button
                type="button"
                disabled={saving}
                onClick={() => setPanel(panel === "cash" ? "none" : "cash")}
                className="pill pill-dark pill-sm"
              >
                <Banknote className="size-3.5" /> Record cash
              </button>
            )}
          </div>

          {panel === "reject" && (
            <div className="mt-4 grid gap-3 rounded-lg bg-bad-bg p-4">
              <Field label="Reason (the parent sees this)">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Amount not received / wrong screenshot"
                  className="field-input"
                />
              </Field>
              <button
                type="button"
                disabled={saving || !reason.trim()}
                onClick={() =>
                  void run(
                    () =>
                      supabase.rpc("jersey_admin_reject_payment", {
                        p_id: order.id,
                        p_reason: reason,
                      }),
                    `Payment rejected for ${order.order_id}.`,
                  )
                }
                className="pill pill-sm justify-self-start bg-bad text-ink"
              >
                Confirm reject
              </button>
            </div>
          )}
          {panel === "cash" && order.player_id && (
            <CashForm
              amount={cashAmount}
              setAmount={setCashAmount}
              note={cashNote}
              setNote={setCashNote}
              saving={saving}
              onSave={() =>
                void run(
                  () =>
                    supabase.rpc("jersey_admin_record_cash", {
                      p_player_id: order.player_id!,
                      p_received_amount: Number(cashAmount),
                      p_note: cashNote.trim() || undefined,
                    }),
                  `Cash recorded for ${order.order_id}. Order confirmed.`,
                )
              }
            />
          )}
        </section>

        <section className="grid gap-6 p-6 sm:grid-cols-2">
          <dl className="grid content-start gap-3 text-sm">
            <Detail label="Player" value={order.player_name} />
            <Detail label="Class" value={order.class_name ?? "—"} />
            <Detail
              label="Number"
              value={order.jersey_number != null ? String(order.jersey_number) : "—"}
            />
            <Detail label="Name on jersey" value={order.print_name ?? "—"} />
            <Detail label="Size" value={order.jersey_size} />
            <Detail label="Placed" value={new Date(order.created_at).toLocaleString()} />
          </dl>
          <div className="grid content-start gap-4">
            <Field label="Order status">
              <select
                value={order.order_status}
                disabled={saving}
                onChange={(e) =>
                  void run(
                    () =>
                      supabase.rpc("jersey_admin_update_order", {
                        p_id: order.id,
                        p_order_status: e.target.value,
                        p_admin_notes: notes,
                      }),
                    "Order status updated.",
                  )
                }
                className="field-input"
              >
                {!MANUAL_ORDER_STATUSES.includes(order.order_status) && (
                  <option value={order.order_status} disabled>
                    {ORDER_STATUS_LABELS[order.order_status] ?? order.order_status}
                  </option>
                )}
                {MANUAL_ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-ink-3">
                Verifying the payment confirms the order automatically.
              </span>
            </Field>
            <Field label="Admin notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="field-input"
              />
            </Field>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void run(
                  () =>
                    supabase.rpc("jersey_admin_update_order", {
                      p_id: order.id,
                      p_order_status: order.order_status,
                      p_admin_notes: notes,
                    }),
                  "Notes saved.",
                )
              }
              className="pill"
            >
              Save notes
            </button>
            {confirmDelete ? (
              <div className="grid gap-2 rounded-lg bg-bad-bg p-3 text-sm text-bad">
                Delete {order.order_id}? This cannot be undone. To keep a record, set the status to
                Cancelled instead.
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const { error } = await supabase.rpc("jersey_admin_delete_order", {
                        p_id: order.id,
                      });
                      if (error) notify(error.message, true);
                      else {
                        notify(`${order.order_id} deleted.`);
                        onDeleted(order.id);
                      }
                    }}
                    className="pill pill-sm bg-bad"
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="pill pill-ghost pill-sm"
                  >
                    Keep
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="label inline-flex items-center gap-1.5 justify-self-start text-bad"
              >
                <Trash2 className="size-3.5" /> Delete order
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function CashForm({
  amount,
  setAmount,
  note,
  setNote,
  saving,
  onSave,
  children,
}: {
  amount: string;
  setAmount: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="mt-4 grid gap-3 rounded-lg bg-paper p-4 sm:grid-cols-[160px_1fr]">
      <Field label="Amount received (₹)">
        <input
          type="number"
          min="1"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="field-input"
        />
      </Field>
      <Field label="Receipt no. / note (optional)">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Receipt 042, paid at the office"
          className="field-input"
        />
      </Field>
      {children}
      <button
        type="button"
        disabled={saving || !(Number(amount) > 0)}
        onClick={onSave}
        className="pill pill-dark pill-sm justify-self-start sm:col-span-2"
      >
        {saving ? "Saving…" : "Save cash payment (marks verified)"}
      </button>
    </div>
  );
}

/* --------------------------------- Players --------------------------------- */

type PlayerDraft = {
  id?: string;
  full_name: string;
  class_name: string;
  jersey_number: string;
  print_name: string;
  chest_in: string;
  jersey_size: string;
  is_active: boolean;
};
const emptyDraft: PlayerDraft = {
  full_name: "",
  class_name: "",
  jersey_number: "",
  print_name: "",
  chest_in: "",
  jersey_size: "",
  is_active: true,
};

function PlayersTab({
  players,
  settings,
  reload,
  notify,
}: {
  players: AdminPlayer[];
  settings: JerseySettings;
  reload: () => Promise<void>;
  notify: (text: string, bad?: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<PlayerDraft | null>(null);
  const [cashFor, setCashFor] = useState<AdminPlayer | null>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);

  const q = search.trim().toLowerCase();
  const filtered = players.filter(
    (p) =>
      !q ||
      [p.full_name, p.class_name, p.jersey_number, p.jersey_size].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      ),
  );

  async function savePlayer() {
    if (!draft) return;
    if (!draft.full_name.trim()) return notify("Enter the player's name.", true);
    const number = draft.jersey_number.trim();
    if (number && !/^\d{1,2}$/.test(number)) return notify("Jersey number must be 0 to 99.", true);
    const chest = draft.chest_in.trim();
    if (chest && !(Number(chest) >= 5 && Number(chest) <= 40))
      return notify("Chest size must be in inches, for example 14.5.", true);
    setBusy(true);
    const { error } = await supabase.rpc("jersey_admin_save_player", {
      p_id: draft.id,
      p_full_name: draft.full_name,
      p_class_name: draft.class_name,
      p_jersey_number: number ? Number(number) : undefined,
      p_print_name: draft.print_name,
      p_jersey_size: draft.jersey_size,
      p_is_active: draft.is_active,
      p_chest_in: chest ? Number(chest) : undefined,
    });
    setBusy(false);
    if (error) return notify(error.message, true);
    notify(draft.id ? "Player updated." : "Player added.");
    setDraft(null);
    await reload();
  }

  async function importPlayers() {
    const rows = parsePlayerLines(paste);
    if (rows.errors.length) return notify(rows.errors.join(" "), true);
    if (rows.players.length === 0)
      return notify("Paste at least one line: name, class, number, chest, size.", true);
    setBusy(true);
    const { data, error } = await supabase.rpc("jersey_admin_import_players", {
      p_rows: rows.players,
    });
    setBusy(false);
    if (error) return notify(error.message, true);
    notify(`${data} players added.`);
    setPaste("");
    await reload();
  }

  async function deletePlayer(p: AdminPlayer) {
    const { error } = await supabase.rpc("jersey_admin_delete_player", { p_id: p.id });
    if (error) return notify(error.message, true);
    notify(`${p.full_name} removed.`);
    setDraft(null);
    await reload();
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="min-w-0 flex-1">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search name, class, number, size…"
          />
        </div>
        <button type="button" onClick={() => setDraft({ ...emptyDraft })} className="pill">
          <Plus className="size-4" /> Add player
        </button>
      </div>

      <TableWrap>
        <thead>
          <tr>
            {["No.", "Player", "Class", "Chest", "Size", "Order", ""].map((h) => (
              <Th key={h}>{h}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-10 text-center text-ink-2">
                {players.length === 0
                  ? "No players yet. Add them one by one, or paste the full list below."
                  : "No players match."}
              </td>
            </tr>
          ) : (
            filtered.map((p) => {
              const tag = ORDER_STATE_TAGS[p.order_state];
              return (
                <tr
                  key={p.id}
                  className={`border-b border-line last:border-0 ${p.is_active ? "" : "opacity-50"}`}
                >
                  <Td>
                    <span className="grid size-[34px] place-items-center rounded-md bg-paper font-condensed font-semibold tracking-[0.16em] text-[13px] text-brand">
                      {p.jersey_number ?? "–"}
                    </span>
                  </Td>
                  <Td>
                    <b>{p.full_name}</b>
                    <div className="text-xs text-ink-3">
                      {p.print_name ? `Prints "${p.print_name}"` : ""}
                      {!p.is_active && " · hidden from parents"}
                    </div>
                  </Td>
                  <Td>{p.class_name ?? "—"}</Td>
                  <Td>{p.chest_in != null ? `${Number(p.chest_in)}"` : "—"}</Td>
                  <Td>
                    <span className="font-display text-lg text-brand">{p.jersey_size ?? "—"}</span>
                  </Td>
                  <Td>
                    {tag ? (
                      <Tag tone={tag.tone}>{tag.label}</Tag>
                    ) : (
                      <Tag tone="plain">Not ordered</Tag>
                    )}
                    {p.order_id && <div className="mt-1 text-xs text-ink-3">{p.order_id}</div>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            id: p.id,
                            full_name: p.full_name,
                            class_name: p.class_name ?? "",
                            jersey_number: p.jersey_number != null ? String(p.jersey_number) : "",
                            print_name: p.print_name ?? "",
                            chest_in: p.chest_in != null ? String(Number(p.chest_in)) : "",
                            jersey_size: p.jersey_size ?? "",
                            is_active: p.is_active,
                          })
                        }
                        className="pill pill-ghost pill-sm"
                      >
                        <Pencil className="size-3" /> Edit
                      </button>
                      {p.order_state !== "verified" && (
                        <button
                          type="button"
                          onClick={() => setCashFor(p)}
                          className="pill pill-sm"
                        >
                          <Banknote className="size-3" /> Record cash
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableWrap>

      <div className="card mt-4 grid gap-3">
        <h3 className="h-md">Add many players at once</h3>
        <p className="m-0 text-sm text-ink-2">
          Use the Excel template: <b>Name, Class, Jersey No., Chest (inches), Size, Print name</b>.
          Fill in the chest or the size. If the size is empty, it is worked out from the chest using
          the size chart. Upload the file saved as CSV, or copy the rows from Excel and paste them
          here.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadTemplate} className="pill pill-dark pill-sm">
            <Download className="size-3.5" /> Download template
          </button>
          <label className="pill pill-dark pill-sm cursor-pointer">
            <FileSpreadsheet className="size-3.5" /> Upload CSV file
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setPaste(await f.text());
              }}
            />
          </label>
        </div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={6}
          placeholder={
            "Aarav Krishnan, Grade 5 A, 7, 14, , \nDiya Raman, Grade 5 A, 11, , 26, DIYA R"
          }
          className="field-input font-mono text-[13px]"
        />
        {paste.trim() && <ImportPreview text={paste} chart={settings.size_chart} />}
        <button
          type="button"
          disabled={busy || !paste.trim()}
          onClick={() => void importPlayers()}
          className="pill justify-self-start"
        >
          {busy ? "Adding…" : `Add ${parsePlayerLines(paste).players.length || ""} players`}
        </button>
      </div>

      {draft && (
        <Modal title={draft.id ? "Edit player" : "Add player"} onClose={() => setDraft(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <input
                value={draft.full_name}
                onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                className="field-input"
              />
            </Field>
            <Field label="Class">
              <input
                value={draft.class_name}
                onChange={(e) => setDraft({ ...draft, class_name: e.target.value })}
                placeholder="e.g. Grade 5 A"
                className="field-input"
              />
            </Field>
            <Field label="Jersey number">
              <input
                value={draft.jersey_number}
                inputMode="numeric"
                onChange={(e) => setDraft({ ...draft, jersey_number: e.target.value })}
                className="field-input"
              />
            </Field>
            <Field label="Chest (inches, armpit to armpit)">
              <input
                value={draft.chest_in}
                inputMode="decimal"
                placeholder="e.g. 14.5"
                onChange={(e) => {
                  const chest_in = e.target.value;
                  const fromChart = sizeForChest(settings.size_chart, Number(chest_in));
                  setDraft({ ...draft, chest_in, jersey_size: fromChart ?? draft.jersey_size });
                }}
                className="field-input"
              />
              {draft.chest_in && sizeForChest(settings.size_chart, Number(draft.chest_in)) && (
                <span className="text-xs text-brand">
                  Size chart → size {sizeForChest(settings.size_chart, Number(draft.chest_in))}
                </span>
              )}
            </Field>
            <Field label="Jersey size">
              <select
                value={draft.jersey_size}
                onChange={(e) => setDraft({ ...draft, jersey_size: e.target.value })}
                className="field-input"
              >
                <option value="">Not set</option>
                {[
                  ...new Set([
                    ...(draft.jersey_size ? [draft.jersey_size] : []),
                    ...settings.sizes,
                  ]),
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name to print (optional)">
              <input
                value={draft.print_name}
                maxLength={20}
                onChange={(e) => setDraft({ ...draft, print_name: e.target.value.toUpperCase() })}
                placeholder="Defaults to the first name"
                className="field-input"
              />
            </Field>
            <label className="flex items-center gap-2.5 self-end pb-3 text-sm">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                className="size-[18px] accent-[var(--orange)]"
              />
              Show to parents
            </label>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            {draft.id ? (
              <button
                type="button"
                onClick={() => {
                  const p = players.find((x) => x.id === draft.id);
                  if (p) void deletePlayer(p);
                }}
                className="label inline-flex items-center gap-1.5 text-bad"
              >
                <Trash2 className="size-3.5" /> Remove player
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void savePlayer()}
              className="pill"
            >
              {busy ? "Saving…" : "Save player"}
            </button>
          </div>
        </Modal>
      )}

      {cashFor && (
        <CashModal
          player={cashFor}
          settings={settings}
          onClose={() => setCashFor(null)}
          onSaved={async (orderId) => {
            notify(`Cash recorded for ${cashFor.full_name} (${orderId}). Order confirmed.`);
            setCashFor(null);
            await reload();
          }}
          notify={notify}
        />
      )}
    </>
  );
}

function CashModal({
  player,
  settings,
  onClose,
  onSaved,
  notify,
}: {
  player: AdminPlayer;
  settings: JerseySettings;
  onClose: () => void;
  onSaved: (orderId: string) => Promise<void>;
  notify: (text: string, bad?: boolean) => void;
}) {
  const [amount, setAmount] = useState(String(Number(settings.unit_price)));
  const [note, setNote] = useState("");
  const [size, setSize] = useState(player.jersey_size ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <Modal title={`Record cash · ${player.full_name}`} onClose={onClose}>
      <p className="m-0 text-sm text-ink-2">
        {player.order_id
          ? `This marks order ${player.order_id} as paid in cash.`
          : "No order yet. This creates the order and marks it paid in cash."}
      </p>
      <CashForm
        amount={amount}
        setAmount={setAmount}
        note={note}
        setNote={setNote}
        saving={saving}
        onSave={async () => {
          setSaving(true);
          const { data, error } = await supabase.rpc("jersey_admin_record_cash", {
            p_player_id: player.id,
            p_received_amount: Number(amount),
            p_jersey_size: size || undefined,
            p_note: note.trim() || undefined,
          });
          setSaving(false);
          if (error || !data)
            return notify(error?.message ?? "Could not record the cash payment.", true);
          await onSaved(data.order_id);
        }}
      >
        <Field label="Size">
          <select value={size} onChange={(e) => setSize(e.target.value)} className="field-input">
            <option value="">Not set</option>
            {[...new Set([...(size ? [size] : []), ...settings.sizes])].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </CashForm>
    </Modal>
  );
}

const TEMPLATE_HEADER = "Name,Class,Jersey No.,Chest (inches),Size,Print name";

function downloadTemplate() {
  const csv = `${TEMPLATE_HEADER}\nAarav Krishnan,Grade 5 A,7,14,,\nDiya Raman,Grade 5 A,11,,26,DIYA R\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "mms-jersey-players-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parses "name, class, number, chest, size[, print name]" lines (the template's columns).
 * Tabs (copied from Excel) work too, and a header row is skipped.
 */
function parsePlayerLines(text: string) {
  const players: {
    full_name: string;
    class_name: string;
    jersey_number: string;
    chest_in: string;
    jersey_size: string;
    print_name: string;
  }[] = [];
  const errors: string[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const [name = "", cls = "", num = "", chest = "", size = "", print = ""] = line
        .split(/\t|,/)
        .map((v) => v.trim().replace(/^"|"$/g, ""));
      if (!name) return;
      if (/^name$/i.test(name)) return; // header row
      if (num && !/^\d{1,2}$/.test(num)) {
        errors.push(`Line ${i + 1}: "${num}" is not a jersey number from 0 to 99.`);
        return;
      }
      const chestValue = chest.replace(/["in ]/gi, "");
      if (chestValue && !(Number(chestValue) >= 5 && Number(chestValue) <= 40)) {
        errors.push(`Line ${i + 1}: "${chest}" is not a chest size in inches.`);
        return;
      }
      players.push({
        full_name: name,
        class_name: cls,
        jersey_number: num,
        chest_in: chestValue,
        jersey_size: size,
        print_name: print,
      });
    });
  return { players, errors };
}

/** Shows the first rows as they will be saved, with the size worked out from the chest. */
function ImportPreview({ text, chart }: { text: string; chart: SizeChartRow[] }) {
  const { players, errors } = parsePlayerLines(text);
  return (
    <div className="grid gap-2">
      {errors.map((e) => (
        <p key={e} className="m-0 text-sm text-bad">
          {e}
        </p>
      ))}
      {players.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr>
                {["Name", "Class", "No.", "Chest", "Size"].map((h) => (
                  <Th key={h}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.slice(0, 8).map((p, i) => {
                const fromChart = !p.jersey_size && sizeForChest(chart, Number(p.chest_in));
                return (
                  <tr key={i} className="border-b border-line last:border-0">
                    <Td>{p.full_name}</Td>
                    <Td>{p.class_name || "—"}</Td>
                    <Td>{p.jersey_number || "—"}</Td>
                    <Td>{p.chest_in ? `${p.chest_in}"` : "—"}</Td>
                    <Td>
                      <span className="font-display text-brand">
                        {p.jersey_size || fromChart || "—"}
                      </span>
                      {fromChart && <span className="ml-2 text-xs text-ink-3">from chart</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {players.length > 8 && (
            <p className="m-0 border-t border-line px-4 py-2 text-xs text-ink-3">
              …and {players.length - 8} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Settings -------------------------------- */

function SettingsTab({
  settings,
  onSaved,
  notify,
}: {
  settings: JerseySettings;
  onSaved: (s: JerseySettings) => void;
  notify: (text: string, bad?: boolean) => void;
}) {
  const [form, setForm] = useState({ ...settings });
  const [chart, setChart] = useState(
    settings.size_chart.map((r) => ({ size: r.size, chest: String(r.chest) })),
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  async function save(extra: Partial<JerseySettings> = {}) {
    const price = Number(form.unit_price);
    if (!(price > 0)) return notify("Enter a valid price.", true);
    const rows = chart
      .map((r) => ({ size: r.size.trim(), chest: Number(r.chest) }))
      .filter((r) => r.size);
    if (rows.length === 0) return notify("Add at least one size.", true);
    if (rows.some((r) => !(r.chest > 0)))
      return notify("Every size needs a chest width in inches.", true);
    if (new Set(rows.map((r) => r.size)).size !== rows.length)
      return notify("Each size can only be listed once.", true);
    rows.sort((a, b) => a.chest - b.chest);
    setSaving(true);
    const { data, error } = await supabase.rpc("jersey_admin_save_settings", {
      p: { ...form, ...extra, unit_price: price, size_chart: rows, sizes: rows.map((r) => r.size) },
    });
    setSaving(false);
    if (error || !data) return notify(error?.message ?? "Could not save settings.", true);
    onSaved(data);
    setForm({ ...data });
    notify("Settings saved. Parents see the changes straight away.");
  }

  async function uploadImage(file: File) {
    if (!JERSEY_IMAGE_TYPES.includes(file.type))
      return notify("The jersey photo must be a JPG, PNG or WEBP image.", true);
    if (file.size > MAX_JERSEY_IMAGE_BYTES)
      return notify("The jersey photo must be 5 MB or smaller.", true);
    setUploading(true);
    const path = `jersey/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60)}`;
    const { error } = await supabase.storage
      .from("jersey-images")
      .upload(path, file, { upsert: false, contentType: file.type });
    setUploading(false);
    if (error) return notify(error.message, true);
    const url = supabase.storage.from("jersey-images").getPublicUrl(path).data.publicUrl;
    await save({ jersey_image_url: url });
  }

  const text = (key: keyof typeof form, label: string, placeholder?: string) => (
    <Field label={label}>
      <input
        value={String(form[key] ?? "")}
        onChange={set(key)}
        placeholder={placeholder}
        className="field-input"
      />
    </Field>
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="h-md">Jersey photo</h3>
          <p className="mt-2 text-sm text-ink-2">
            Shown to parents on the home page and while they order.
          </p>
          <div className="mt-4 grid aspect-[5/4] place-items-center overflow-hidden rounded-lg border border-line bg-[radial-gradient(circle_at_50%_40%,rgba(255,77,18,0.28),#0a0a0a_70%)]">
            {form.jersey_image_url ? (
              <img
                src={form.jersey_image_url}
                alt="Current jersey photo"
                className="size-full object-cover"
              />
            ) : (
              <span className="text-sm text-ink-3">No photo yet. A drawn jersey is shown.</span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <label
              className={`pill pill-sm cursor-pointer ${uploading || saving ? "pointer-events-none opacity-60" : ""}`}
            >
              <ImagePlus className="size-3.5" />
              {uploading ? "Uploading…" : form.jersey_image_url ? "Change photo" : "Upload photo"}
              <input
                type="file"
                accept={JERSEY_IMAGE_TYPES.join(",")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadImage(f);
                }}
              />
            </label>
            {form.jersey_image_url && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save({ jersey_image_url: "" })}
                className="pill pill-ghost pill-sm"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="h-md">Price &amp; orders</h3>
          <div className="mt-5 grid gap-3">
            <Field label="Jersey price (₹)">
              <input
                value={String(form.unit_price ?? "")}
                onChange={set("unit_price")}
                inputMode="numeric"
                className="field-input font-display text-2xl text-brand"
              />
            </Field>
            {text("season_label", "Season label", "Season 2026")}
            {text("contact_note", "Message when orders are closed")}
          </div>
          <Toggle
            checked={form.orders_open}
            onChange={(v) => setForm({ ...form, orders_open: v })}
            label="Orders are open"
          />
          <Toggle
            checked={form.parents_can_change_size}
            onChange={(v) => setForm({ ...form, parents_can_change_size: v })}
            label="Parents can change the size"
          />
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="h-md">Sizes &amp; size chart</h3>
            <p className="mt-2 max-w-[60ch] text-sm text-ink-2">
              The sizes parents can pick, with the jersey chest width (armpit to armpit, in inches).
              When you enter a child&apos;s chest, the app picks the smallest size that fits. A
              child between sizes gets the larger one.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setChart([...chart, { size: "", chest: "" }])}
            className="pill pill-dark pill-sm"
          >
            <Plus className="size-3.5" /> Add size
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {chart.map((row, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line bg-ink p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-condensed text-xs tracking-[0.2em] text-ink-2 uppercase">
                  Size
                </span>
                <button
                  type="button"
                  aria-label={`Remove size ${row.size}`}
                  onClick={() => setChart(chart.filter((_, j) => j !== i))}
                  className="text-ink-3 hover:text-bad"
                >
                  <X className="size-4" />
                </button>
              </div>
              <input
                value={row.size}
                onChange={(e) =>
                  setChart(chart.map((r, j) => (j === i ? { ...r, size: e.target.value } : r)))
                }
                className="field-input bg-panel py-2 font-display text-xl text-brand"
              />
              <span className="font-condensed text-xs tracking-[0.2em] text-ink-2 uppercase">
                Chest (in)
              </span>
              <input
                value={row.chest}
                inputMode="decimal"
                onChange={(e) =>
                  setChart(chart.map((r, j) => (j === i ? { ...r, chest: e.target.value } : r)))
                }
                className="field-input bg-panel py-2"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="h-md">Payment details</h3>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {text("upi_id", "UPI ID", "name@okaxis")}
          {text("payee_name", "Pay to name")}
          {text("bank_account_name", "Bank account name")}
          {text("bank_account_number", "Bank account number")}
          {text("bank_ifsc", "IFSC")}
          {text("bank_name", "Bank name")}
          {text("bank_branch", "Branch")}
        </div>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="pill justify-self-start"
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}

/* ---------------------------------- Shared --------------------------------- */

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ink">
      <header className="band border-b border-white/8 bg-ink/80">
        <div className="inner flex min-h-16 items-center justify-between gap-4 py-3">
          <Logo />
          <Link to="/" className="label text-ink-2 hover:text-brand">
            ← Parent site
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

function StatCard({
  tone,
  label,
  value,
}: {
  tone: "orange" | "black" | "light";
  label: string;
  value: string;
}) {
  const toneClass =
    tone === "orange"
      ? "border border-brand bg-brand text-white"
      : tone === "black"
        ? "border border-brand/40 bg-brand-soft text-white"
        : "border border-line bg-panel";
  return (
    <div
      className={`flex min-h-[120px] flex-col justify-between gap-3 rounded-xl p-5 ${toneClass}`}
    >
      <span className={`label ${tone === "orange" ? "" : "text-ink-2"}`}>{label}</span>
      <b
        className={`font-display text-[clamp(30px,4vw,48px)] leading-[0.9] font-normal ${tone === "black" ? "text-brand" : ""}`}
      >
        {value}
      </b>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">Search</span>
      <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-panel py-3 pr-4 pl-11 text-sm placeholder:text-white/30 focus:border-brand focus:outline-none"
      />
    </label>
  );
}

function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[820px] text-left text-sm">{children}</table>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-line bg-ink px-4 py-3.5 font-condensed text-xs font-semibold tracking-[0.2em] text-ink-2 uppercase">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle tabular-nums ${className}`}>{children}</td>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="label text-ink-2">{label}</span>
      {children}
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label text-ink-3">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="mt-4 flex items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-[18px] accent-[var(--orange)]"
      />
      {label}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="mx-auto max-w-2xl rounded-xl border border-line bg-panel p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="h-md">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="arrow-btn bg-paper text-white hover:text-brand"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function exportCsv(orders: JerseyOrder[]) {
  const head = [
    "Order ID",
    "Placed",
    "Player",
    "Class",
    "Number",
    "Print name",
    "Size",
    "Amount",
    "Payment status",
    "Method",
    "UTR / note",
    "Amount received",
    "Verified by",
    "Verified at",
    "Order status",
    "Admin notes",
  ];
  const rows = orders.map((o) =>
    [
      o.order_id,
      o.created_at,
      o.player_name,
      o.class_name,
      o.jersey_number,
      o.print_name,
      o.jersey_size,
      o.amount,
      o.payment_status,
      o.payment_method,
      o.payment_reference,
      o.payment_received_amount,
      o.payment_verified_by,
      o.payment_verified_at,
      o.order_status,
      o.admin_notes,
    ]
      .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
      .join(","),
  );
  const blob = new Blob([[head.map((h) => `"${h}"`).join(","), ...rows].join("\n")], {
    type: "text/csv",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mms-jersey-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
