import { SIZE_GUIDE, SIZE_GUIDE_NOTES } from "@/lib/jersey";

/** The coach's full size table: age, height, size, chest, length and fit notes. */
export function SizeGuideTable({ highlight }: { highlight?: string | null }) {
  return (
    <div>
      <ul className="grid list-disc gap-1 pl-5 text-sm text-ink-2">
        {SIZE_GUIDE_NOTES.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr>
              {["Age", "Height (cm)", "Jersey size", "Chest (in)", "Length (in)", "Fit notes"].map(
                (h) => (
                  <th
                    key={h}
                    className="border-b border-line bg-ink px-4 py-3 font-condensed text-xs font-semibold tracking-[0.2em] text-ink-2 uppercase"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {SIZE_GUIDE.map((r) => (
              <tr
                key={r.size}
                className={`border-b border-line last:border-0 ${r.size === highlight ? "bg-brand-soft" : ""}`}
              >
                <td className="px-4 py-2.5 whitespace-nowrap">{r.age}</td>
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{r.height}</td>
                <td className="px-4 py-2.5 font-display text-lg text-brand">{r.size}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.chest}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.length}</td>
                <td className="px-4 py-2.5 text-ink-2">{r.fit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
