import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Minus, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Logo, Tag } from "@/components/brand";
import { SizeGuideTable } from "@/components/size-guide";
import { supabase } from "@/integrations/supabase/client";
import type { AdminPlayer, JerseySettings } from "@/integrations/supabase/types";
import { gradeLabel, guideFor, initials, sizeForChest } from "@/lib/jersey";

export const Route = createFileRoute("/measure")({
  head: () => ({ meta: [{ title: "Measure players · MMS Jersey" }] }),
  component: MeasurePage,
});

const STEP = 0.5;
const QUEUE_SHOWN = 8;

/** A phone screen for the coach: measure each player's chest and save the jersey size. */
function MeasurePage() {
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [settings, setSettings] = useState<JerseySettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [chest, setChest] = useState("");
  const [search, setSearch] = useState("");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ id: string; name: string; chest: number; size: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const { data: ok } = await supabase.rpc("jersey_is_admin");
        if (ok === true) {
          setAdmin(true);
          const [p, s] = await Promise.all([
            supabase.rpc("jersey_admin_list_players"),
            supabase.rpc("jersey_get_settings"),
          ]);
          if (p.error || s.error) setError((p.error ?? s.error)!.message);
          setPlayers(p.data ?? []);
          if (s.data) setSettings(s.data);
        }
      }
      setReady(true);
    })();
  }, []);

  const team = useMemo(() => players.filter((p) => p.is_active && p.is_football), [players]);
  const measured = team.filter((p) => p.jersey_size).length;
  const queue = team.filter((p) => !p.jersey_size && !skipped.has(p.id));
  const current = players.find((p) => p.id === currentId) ?? queue[0] ?? null;

  // Show the chosen player's saved chest size when they change.
  useEffect(() => {
    setChest(current?.chest_in != null ? String(Number(current.chest_in)) : "");
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = search.trim().toLowerCase();
  const matches =
    q.length < 2
      ? []
      : players
          .filter(
            (p) =>
              p.is_active &&
              [p.full_name, p.admission_no].some((v) =>
                String(v ?? "")
                  .toLowerCase()
                  .includes(q),
              ),
          )
          .slice(0, 8);

  const chart = settings?.size_chart ?? [];
  const chestNum = Number(chest);
  const chestOk = chest !== "" && chestNum >= 5 && chestNum <= 40;
  const size = chestOk ? sizeForChest(chart, chestNum) : null;
  const guide = guideFor(size);

  function pick(id: string) {
    setCurrentId(id);
    setSearch("");
    setSavedName(null);
  }

  function nudge(by: number) {
    const base = chest !== "" ? chestNum : (done[0]?.chest ?? 15);
    const next = Math.min(40, Math.max(5, Math.round((base + (chest !== "" ? by : 0)) * 2) / 2));
    setChest(String(next));
  }

  function nextAfter(id: string, extraSkip?: string) {
    const rest = queue.filter((p) => p.id !== id && p.id !== extraSkip);
    setCurrentId(rest[0]?.id ?? null);
  }

  async function saveAndNext() {
    if (!current || !chestOk || !size || saving) return;
    setSaving(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("jersey_admin_set_chest", {
      p_id: current.id,
      p_chest_in: chestNum,
    });
    setSaving(false);
    if (rpcError || !data) {
      setError(rpcError?.message ?? "Not saved. Please try again.");
      return;
    }
    setPlayers((rows) =>
      rows.map((r) =>
        r.id === current.id ? { ...r, chest_in: data.chest_in, jersey_size: data.jersey_size } : r,
      ),
    );
    setDone((d) => [
      { id: current.id, name: current.full_name, chest: chestNum, size: data.jersey_size ?? size },
      ...d.filter((x) => x.id !== current.id),
    ]);
    setSavedName(`${current.full_name} · size ${data.jersey_size ?? size}`);
    nextAfter(current.id);
  }

  function skip() {
    if (!current) return;
    setSkipped((s) => new Set(s).add(current.id));
    setSavedName(null);
    nextAfter(current.id, current.id);
  }

  if (!ready)
    return (
      <Frame>
        <p className="py-24 text-center text-ink-2">Checking admin access…</p>
      </Frame>
    );
  if (!admin)
    return (
      <Frame>
        <div className="card mt-8 grid gap-4">
          <h1 className="h-md">Log in first</h1>
          <p className="text-sm text-ink-2">
            The measuring screen is for the coach. Log in on the Admin page, then come back here.
          </p>
          <Link to="/admin" className="pill">
            Go to Admin login
          </Link>
        </div>
      </Frame>
    );

  return (
    <Frame>
      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h1 className="label text-brand">Measure players</h1>
        <span className="font-display text-2xl tabular-nums">
          {measured} / {team.length}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full bg-white"
          style={{ width: `${team.length ? (measured / team.length) * 100 : 0}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink-3">Football players with a size</p>

      <label className="relative mt-5 block">
        <span className="sr-only">Search a player</span>
        <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or admission no."
          autoComplete="off"
          className="w-full rounded-lg border border-line bg-panel py-3.5 pr-4 pl-11 text-[15px] placeholder:text-white/30 focus:border-brand focus:outline-none"
        />
      </label>
      {q.length >= 2 && (
        <div className="mt-2 grid gap-1.5">
          {matches.length === 0 ? (
            <p className="text-sm text-ink-3">No player found.</p>
          ) : (
            matches.map((p) => <PlayerRow key={p.id} player={p} onClick={() => pick(p.id)} />)
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad">
          {error}
        </p>
      )}
      {savedName && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-ok-bg px-4 py-3 text-sm text-ok">
          <CheckCircle2 className="size-4 flex-none" /> Saved {savedName}
        </p>
      )}

      {current ? (
        <div className="card mt-4 grid gap-4">
          <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-paper font-display text-brand">
              {initials(current.full_name)}
            </span>
            <span className="min-w-0">
              <b className="block truncate text-[17px]">{current.full_name}</b>
              <span className="text-xs text-ink-3">
                Adm. {current.admission_no ?? "—"} · {gradeLabel(current.class_name)}
                {current.is_football ? " · Football" : ""}
              </span>
            </span>
          </div>

          <div>
            <div className="label text-ink-2">Chest, armpit to armpit (inches)</div>
            <div className="mt-2 grid grid-cols-[56px_minmax(0,1fr)_56px] items-center gap-2">
              <button
                type="button"
                aria-label="Half an inch less"
                onClick={() => nudge(-STEP)}
                className="grid h-14 place-items-center rounded-xl border border-line bg-ink"
              >
                <Minus className="size-5" />
              </button>
              <input
                aria-label="Chest size in inches"
                value={chest}
                onChange={(e) => setChest(e.target.value.replace(/[^\d.]/g, "").slice(0, 4))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveAndNext();
                }}
                inputMode="decimal"
                placeholder="—"
                className="h-[72px] w-full rounded-xl border-2 border-brand bg-ink text-center font-display text-[40px] focus:outline-none"
              />
              <button
                type="button"
                aria-label="Half an inch more"
                onClick={() => nudge(STEP)}
                className="grid h-14 place-items-center rounded-xl border border-line bg-ink"
              >
                <Plus className="size-5" />
              </button>
            </div>
            {chest !== "" && !chestOk && (
              <p className="mt-2 text-xs text-bad">Type the chest in inches, for example 15.5.</p>
            )}
          </div>

          <div
            className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 rounded-xl px-4 py-3.5 ${
              size ? "bg-brand text-white" : "border border-line bg-ink text-ink-3"
            }`}
          >
            <b className="row-span-2 font-display text-5xl leading-none font-normal">
              {size ?? "—"}
            </b>
            <span className="label">Jersey size</span>
            <span className="text-sm">
              {guide ? `Length ${guide.length} in · ${guide.fit}` : "Type the chest size"}
            </span>
          </div>

          <button
            type="button"
            disabled={!size || saving}
            onClick={() => void saveAndNext()}
            className="pill py-4 text-base"
          >
            {saving ? "Saving…" : "Save and next player"}
          </button>
          {!current.jersey_size && (
            <button type="button" onClick={skip} className="pill pill-ghost">
              Skip for now
            </button>
          )}
        </div>
      ) : (
        <div className="card mt-4 text-center">
          <p className="font-condensed text-lg tracking-wide uppercase">All done</p>
          <p className="mt-1 text-sm text-ink-2">
            {skipped.size
              ? `Every football player has a size, except ${skipped.size} you skipped.`
              : "Every football player has a size."}{" "}
            Search above to change anyone.
          </p>
          {skipped.size > 0 && (
            <button
              type="button"
              onClick={() => setSkipped(new Set())}
              className="pill pill-ghost mt-4"
            >
              Show skipped players
            </button>
          )}
        </div>
      )}

      <h2 className="label mt-8 text-ink-2">Still to measure · {queue.length}</h2>
      <div className="mt-2 grid gap-1.5">
        {queue.slice(0, QUEUE_SHOWN).map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            onClick={() => pick(p.id)}
            tag={
              p.id === current?.id ? (
                <Tag tone="warn">Measuring</Tag>
              ) : (
                <Tag tone="plain">No size</Tag>
              )
            }
          />
        ))}
        {queue.length > QUEUE_SHOWN && (
          <p className="text-xs text-ink-3">…and {queue.length - QUEUE_SHOWN} more</p>
        )}
      </div>

      {done.length > 0 && (
        <>
          <h2 className="label mt-6 text-ink-2">Done today · {done.length}</h2>
          <div className="mt-2 grid gap-1.5">
            {done.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => pick(d.id)}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ink px-3 py-2.5 text-left"
              >
                <span>
                  <b className="block text-sm">{d.name}</b>
                  <span className="text-xs text-ink-3">{d.chest} in</span>
                </span>
                <Tag tone="ok">Size {d.size}</Tag>
              </button>
            ))}
          </div>
        </>
      )}

      <details className="mt-8 rounded-xl border border-line bg-panel p-4">
        <summary className="cursor-pointer font-condensed text-sm font-semibold tracking-[0.16em] uppercase">
          Size guide
        </summary>
        <div className="mt-4">
          <SizeGuideTable highlight={size} />
        </div>
      </details>
      <p className="mt-6 pb-12 text-center text-xs text-ink-3">
        <Link to="/admin" className="underline">
          Back to Admin
        </Link>
      </p>
    </Frame>
  );
}

function PlayerRow({
  player,
  onClick,
  tag,
}: {
  player: AdminPlayer;
  onClick: () => void;
  tag?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ink px-3 py-2.5 text-left hover:border-white/40"
    >
      <span className="min-w-0">
        <b className="block truncate text-sm">{player.full_name}</b>
        <span className="text-xs text-ink-3">
          {player.admission_no ?? "—"} · {gradeLabel(player.class_name)}
        </span>
      </span>
      {tag ??
        (player.jersey_size ? (
          <Tag tone="ok">Size {player.jersey_size}</Tag>
        ) : (
          <Tag tone="plain">No size</Tag>
        ))}
    </button>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ink">
      <header className="band border-b border-white/8 bg-ink/80">
        <div className="inner flex min-h-16 items-center justify-between gap-4 py-3">
          <Logo />
          <Link to="/admin" className="label text-ink-2 hover:text-brand">
            Admin
          </Link>
        </div>
      </header>
      <main className="band">
        <div className="mx-auto max-w-lg">{children}</div>
      </main>
    </div>
  );
}
