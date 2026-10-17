// Decorative preview of the app. Purely visual, hidden from assistive tech.

const FRIENDS = [
  { name: "Paweł", online: true, unread: true, active: true },
  { name: "Nikodem", online: true, unread: false, active: false },
  { name: "Szymon", online: false, unread: false, active: false },
  { name: "Patryk", online: false, unread: false, active: false },
];

const MESSAGES = [
  { mine: false, text: "Did you get my code?", anim: "animate-msg-1" },
  { mine: true, text: "Just typed it in. Added!", anim: "animate-msg-2" },
  { mine: false, text: "Finally. Movie tonight?", anim: "animate-msg-3" },
  { mine: true, text: "Only if you pick.", anim: "animate-msg-4" },
  { mine: false, text: "Deal.", anim: "animate-msg-5" },
];

function Avatar({ name, online }: { name: string; online?: boolean }) {
  return (
    <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
      {name.slice(0, 1)}
      {online && (
        <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-online" />
      )}
    </span>
  );
}

export function ChatShowcase() {
  return (
    <div
      aria-hidden
      className="relative hidden items-center justify-center overflow-hidden border-l bg-secondary p-10 lg:flex"
      style={{
        backgroundImage:
          "radial-gradient(var(--border) 1.2px, transparent 1.2px)",
        backgroundSize: "22px 22px",
      }}
    >
      <div className="relative w-full max-w-[580px]">
        <div className="absolute -top-10 -right-6 z-10 animate-float rounded-xl border bg-card px-4 py-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Your friend code</p>
          <p className="font-mono text-base font-medium tracking-wider">
            K7QM-92XD
          </p>
        </div>

        <div className="flex h-[420px] overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="hidden w-44 shrink-0 space-y-1 border-r p-3 sm:block">
            <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">
              Friends
            </p>
            {FRIENDS.map((f) => (
              <div
                key={f.name}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-2 ${f.active ? "bg-muted" : ""}`}
              >
                <Avatar name={f.name} online={f.online} />
                <span className="flex-1 truncate text-sm">{f.name}</span>
                {f.unread && (
                  <span className="size-2 animate-pulse-soft rounded-full bg-online" />
                )}
              </div>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2.5 border-b px-4 py-3">
              <Avatar name="Paweł" online />
              <div className="leading-tight">
                <p className="text-sm font-medium">Paweł</p>
                <p className="text-xs text-muted-foreground">online</p>
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-end gap-2 p-4">
              {MESSAGES.map((m) => (
                <div
                  key={m.text}
                  data-msg
                  style={{ animationFillMode: "backwards" }}
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${m.anim} ${
                    m.mine
                      ? "self-end rounded-br-md bg-primary text-primary-foreground"
                      : "self-start rounded-bl-md bg-muted"
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>

            <div className="m-3 flex items-center justify-between rounded-full border px-4 py-2 text-sm text-muted-foreground">
              Message
              <span className="size-6 rounded-full bg-primary" />
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Add friends with a code. Talk right away.
        </p>
      </div>
    </div>
  );
}
