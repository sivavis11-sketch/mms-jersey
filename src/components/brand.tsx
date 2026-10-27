import { Link } from "@tanstack/react-router";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { Tone } from "@/lib/jersey";

export function ArrowIcon({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M7 17 17 7M9 7h8v8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" />
    </svg>
  );
}

export function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <path
        d="M20 0c1.6 11.2 8.8 18.4 20 20-11.2 1.6-18.4 8.8-20 20C18.4 28.8 11.2 21.6 0 20 11.2 18.4 18.4 11.2 20 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** The main orange button, with a trailing arrow like the Steel City portal. */
export function PillButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button {...props} className={`pill ${className}`}>
      {children}
      <span aria-hidden="true">→</span>
    </button>
  );
}

export function Tag({ tone = "dark", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

/**
 * The jersey artwork. Shows the jersey photo the admin uploaded in Settings, otherwise
 * a drawn jersey with the child's name and number.
 */
export function JerseyArt({
  name = "MMS",
  number = "10",
  className,
  image,
}: {
  name?: string;
  number?: string;
  className?: string;
  image?: string | null | undefined;
}) {
  if (image) {
    return (
      <img src={image} alt="Official MMS jersey" className={`object-contain ${className ?? ""}`} />
    );
  }
  const nameSize = name.length > 8 ? 20 : name.length > 5 ? 24 : 30;
  return (
    <svg
      viewBox="0 0 260 280"
      className={className}
      role="img"
      aria-label={`Jersey with ${name} ${number}`}
    >
      <path
        d="M88 18 C100 32 160 32 172 18 L222 40 L252 98 L214 116 L204 96 L204 266 L56 266 L56 96 L46 116 L8 98 L38 40 Z"
        fill="#ff4d12"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="2"
      />
      <path
        d="M38 40 L88 18 C100 32 160 32 172 18 L222 40 L252 98 L214 116 L204 96 L204 130 L56 130 L56 96 L46 116 L8 98 Z"
        fill="#0b0b0b"
      />
      <path d="M88 18 C100 32 160 32 172 18" fill="none" stroke="#fff" strokeWidth="5" />
      <path d="M56 130 H204" stroke="#fff" strokeWidth="3" />
      <rect x="56" y="250" width="148" height="16" fill="#0b0b0b" />
      <text
        x="130"
        y="112"
        textAnchor="middle"
        fontFamily="Anton, Arial Narrow, sans-serif"
        fontWeight="400"
        fontSize={nameSize}
        fill="#fff"
      >
        {name}
      </text>
      <text
        x="130"
        y="222"
        textAnchor="middle"
        fontFamily="Anton, Arial Narrow, sans-serif"
        fontWeight="400"
        fontSize="84"
        fill="#0b0b0b"
      >
        {number}
      </text>
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-md bg-brand font-display text-lg text-white">
        M
      </span>
      <span className="leading-none">
        <span className="block font-display text-lg tracking-wide">MMS JERSEY</span>
        <span className="mt-1 block font-condensed text-[11px] tracking-[0.35em] text-ink-2 uppercase">
          Season Order Portal
        </span>
      </span>
    </Link>
  );
}

const headerLink =
  "inline-flex rounded-md border border-white/15 px-4 py-2.5 font-condensed text-xs tracking-[0.18em] text-ink-2 uppercase transition-colors hover:border-brand hover:text-brand";

export function SiteHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="band border-b border-white/8 bg-ink/80">
      <div className="inner flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
        <Logo />
        <nav className="flex items-center gap-2">
          {right ?? (
            <>
              <Link to="/status" className={headerLink}>
                My orders
              </Link>
              <Link to="/admin" className={`${headerLink} max-sm:hidden`}>
                Admin
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ cta }: { cta?: ReactNode }) {
  return (
    <footer className="band border-t border-line bg-ink">
      {cta && (
        <div className="inner flex flex-wrap items-center justify-between gap-5 border-b border-line py-10">
          <h2 className="h-md">
            Ready for <span className="text-brand">match day?</span>
          </h2>
          {cta}
        </div>
      )}
      <div className="inner flex flex-col items-center justify-between gap-3 py-8 sm:flex-row">
        <div className="font-display tracking-wide text-white/80">MMS JERSEY</div>
        <div className="flex items-center gap-5">
          <div className="font-condensed text-xs tracking-[0.25em] text-ink-2 uppercase">
            © {new Date().getFullYear()} MMS Jersey · Season Order Portal
          </div>
          <Link
            to="/admin"
            className="font-condensed text-xs tracking-[0.2em] text-ink-2 uppercase hover:text-brand"
          >
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
