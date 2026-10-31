import { cn } from "cn";

export function UserAvatar({
  name,
  online,
  size = "md",
  className,
}: {
  name: string;
  online?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium uppercase",
        size === "sm" ? "size-6 text-[0.65rem]" : "size-8 text-xs",
        className,
      )}
      aria-hidden
    >
      {name.slice(0, 1)}
      {online && (
        <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background bg-online" />
      )}
    </span>
  );
}
