"use client";

import { cn } from "cn";
import { useState } from "react";

type Point = { day: string; count: number };

const label = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

/** Messages per day, one series: bars from a shared baseline, hover readout. */
export function MessagesChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const active = hover === null ? null : data[hover];
  const ticks = new Set([
    0,
    Math.floor((data.length - 1) / 2),
    data.length - 1,
  ]);

  return (
    <figure className="space-y-3">
      <figcaption className="flex items-baseline justify-between">
        <span className="font-medium">Messages per day</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {active
            ? `${label.format(new Date(active.day))}: ${active.count}`
            : "Last 14 days"}
        </span>
      </figcaption>
      <div className="flex h-36 items-end gap-1 border-b" aria-hidden>
        {data.map((d, i) => (
          <div
            key={d.day}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className={cn(
                "w-full rounded-t transition-colors",
                hover === i ? "bg-foreground" : "bg-foreground/60",
              )}
              style={{
                height: d.count ? `${Math.max((d.count / max) * 100, 2)}%` : 0,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 text-[10px] text-muted-foreground" aria-hidden>
        {data.map((d, i) => (
          <span key={d.day} className="flex-1 text-center">
            {ticks.has(i) ? label.format(new Date(d.day)) : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Messages per day, last 14 days</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
