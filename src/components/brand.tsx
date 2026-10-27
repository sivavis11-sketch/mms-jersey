import { Link } from "@tanstack/react-router";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { OFFICIAL_JERSEY_IMAGE, type Tone } from "@/lib/jersey";

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

/** Orange pill with the round arrow button beside it. */
export function PillButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <span className="pill-row inline-flex items-center gap-1.5">
      <button {...props} className={`pill ${className}`}>
        {children}
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={props.onClick}
        disabled={props.disabled}
        className="arrow-btn"
      >
        <ArrowIcon />
      </button>
    </span>
  );
}

export function Tag({ tone = "dark", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

/**
 * The jersey artwork. Shows the official photo once OFFICIAL_JERSEY_IMAGE is set,
 * otherwise a drawn jersey with the child's name and number.
 */
export function JerseyArt({
  name = "MMS",
  number = "10",
  className,
  forcePlaceholder = false,
}: {
  name?: string;
  number?: string;
  className?: string;
  forcePlaceholder?: boolean;
}) {
  if (OFFICIAL_JERSEY_IMAGE && !forcePlaceholder) {
    return (
      <img
        src={OFFICIAL_JERSEY_IMAGE}
        alt="Official MMS Season 2026 jersey"
        className={`object-contain ${className ?? ""}`}
      />
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
        fontFamily="Archivo, Arial Black, sans-serif"
        fontWeight="900"
        fontSize={nameSize}
        fill="#fff"
      >
        {name}
      </text>
      <text
        x="130"
        y="222"
        textAnchor="middle"
        fontFamily="Archivo, Arial Black, sans-serif"
        fontWeight="900"
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
    <Link
      to="/"
      className="flex items-center gap-2 font-head text-lg font-black [font-stretch:125%]"
    >
      <span className="grid size-[30px] place-items-center rounded-[9px] bg-brand text-[13px] text-white">
        M
      </span>
      mms jersey
    </Link>
  );
}

export function SiteHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="band bg-ink text-white">
      <div className="inner flex flex-wrap items-center justify-between gap-4 py-[18px]">
        <Logo />
        <nav className="flex items-center gap-2">
          {right ?? (
            <>
              <Link
                to="/status"
                className="rounded-full px-4 py-2 font-head text-xs font-bold uppercase text-white/70 [font-stretch:110%] hover:text-white"
              >
                My orders
              </Link>
              <Link
                to="/admin"
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-4 py-2 font-head text-xs font-bold uppercase [font-stretch:110%] hover:bg-white hover:text-ink"
              >
                Admin <ArrowIcon className="size-3.5" />
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
    <footer className="band overflow-hidden bg-brand pt-10 pb-7 text-white">
      <div className="inner">
        <p
          aria-hidden="true"
          className="m-0 whitespace-nowrap font-head font-black leading-[0.8] tracking-[-0.04em] text-[#ff6a35] [font-stretch:125%] [font-size:clamp(80px,22vw,300px)] [text-shadow:0_8px_0_var(--orange-deep),0_16px_30px_rgba(0,0,0,0.25)]"
        >
          mms
        </p>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
          <h2 className="h-md">
            Ready for
            <br />
            match day?
          </h2>
          {cta}
        </div>
        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-white/25 pt-5 text-xs text-white/80">
          <span>© {new Date().getFullYear()} MMS Jersey · Season order portal</span>
          <Link to="/admin" className="hover:text-white">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
