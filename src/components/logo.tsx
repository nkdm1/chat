import Link from "next/link";

export function Logo() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 font-semibold tracking-tight"
    >
      <span className="size-2 animate-pulse-soft rounded-full bg-online" />
      chat
    </Link>
  );
}
