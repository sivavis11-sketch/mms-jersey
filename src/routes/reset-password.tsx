import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password · MMS Jersey" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Supabase sends the recovery tokens back as a URL fragment (#access_token=...&type=recovery).
    // If those are present, exchange them for a session so updateUser() below is allowed to run.
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const err = params.get("error_description");

    if (err) {
      setError(err.replace(/\+/g, " "));
      setReady(true);
      return;
    }

    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        if (error) setError(error.message);
        else setValidLink(true);
        setReady(true);
      });
    } else {
      // No tokens in the link — check if there's already a valid recovery session (e.g. page refresh).
      supabase.auth.getSession().then(({ data }) => {
        setValidLink(!!data.session);
        setReady(true);
      });
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  return (
    <div className="min-h-screen bg-ink px-4 py-16 text-white">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-brand text-white">
            <ShieldCheck size={22} />
          </div>
          <p className="label text-brand">Restricted area</p>
          <h1 className="h-lg mt-2">Reset password</h1>
        </div>

        <div className="card text-ink">
          {!ready && <p className="text-center text-sm text-ink-2">Checking your link…</p>}

          {ready && done && (
            <div className="text-center">
              <p className="text-sm">Your password has been updated.</p>
              <Link to="/admin" className="pill mt-5">
                Go to admin login
              </Link>
            </div>
          )}

          {ready && !done && validLink && (
            <form onSubmit={submit} className="grid gap-3">
              {error && (
                <p className="rounded-[14px] bg-bad-bg px-4 py-3 text-sm text-bad">{error}</p>
              )}
              <label className="grid gap-2">
                <span className="label text-ink-2">New password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field-input"
                  placeholder="At least 8 characters"
                />
              </label>
              <label className="grid gap-2">
                <span className="label text-ink-2">Confirm password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="field-input"
                  placeholder="Type it again"
                />
              </label>
              <button type="submit" disabled={saving} className="pill mt-3 w-full">
                {saving ? "Saving…" : "Set new password"}
              </button>
            </form>
          )}

          {ready && !done && !validLink && (
            <div className="text-center">
              <p className="text-sm text-bad">
                {error ?? "This reset link is invalid or has expired."}
              </p>
              <p className="mt-3 text-sm text-ink-2">
                Go back to the admin login, tap Forgot password, and open the new link straight
                away. Links expire quickly.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link to="/admin" className="label text-white/70 hover:text-white">
            ← Back to admin login
          </Link>
        </div>
      </div>
    </div>
  );
}
