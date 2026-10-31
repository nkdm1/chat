"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontalIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { shortTime } from "@/lib/format";

type AdminUser = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  banned: boolean | null;
  banExpires: string | null;
  createdAt: string;
};

type UserAction = {
  action: "ban" | "unban" | "make-admin" | "revoke-admin";
  banDays?: 1 | 7 | 30 | null;
};

function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

function UserStatus({ user }: { user: AdminUser }) {
  if (user.banned) {
    const until = user.banExpires ? ` until ${shortTime(user.banExpires)}` : "";
    return <span className="text-destructive">banned{until}</span>;
  }
  return user.emailVerified ? (
    "active"
  ) : (
    <span className="text-muted-foreground">unverified</span>
  );
}

function UserActions({
  user,
  onAct,
}: {
  user: AdminUser;
  onAct: (a: UserAction) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${user.username}`}
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {user.banned ? (
          <DropdownMenuItem onSelect={() => onAct({ action: "unban" })}>
            Unban
          </DropdownMenuItem>
        ) : (
          user.role !== "admin" && (
            <>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Ban
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => onAct({ action: "ban", banDays: 7 })}
              >
                For 7 days
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onAct({ action: "ban", banDays: null })}
              >
                Permanently
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )
        )}
        {user.role === "admin" ? (
          <DropdownMenuItem onSelect={() => onAct({ action: "revoke-admin" })}>
            Revoke admin
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onAct({ action: "make-admin" })}>
            Make admin
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminUsers({ meId }: { meId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const query = useDebounced(q.trim());
  const { data } = useQuery({
    queryKey: ["admin", "users", query],
    queryFn: async () =>
      await api.get<{ users: AdminUser[] }>(
        `/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      ),
  });
  const act = useMutation({
    mutationFn: async ({ id, ...body }: UserAction & { id: string }) =>
      await api.post(`/api/admin/users/${id}`, body),
    onSuccess: () => setFailure(null),
    onError: (error) => setFailure(errorMessage(error)),
    onSettled: async () => await qc.invalidateQueries({ queryKey: ["admin"] }),
  });

  return (
    <div className="space-y-4">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by username or email"
        aria-label="Search users"
        className="max-w-sm"
      />
      {failure && (
        <p role="alert" className="text-destructive text-sm">
          {failure}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium">
                    {u.username}
                    {u.role === "admin" && (
                      <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-normal text-xs">
                        admin
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">{u.email}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <UserStatus user={u} />
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs">
                  {shortTime(u.createdAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  {u.id !== meId && (
                    <UserActions
                      user={u}
                      onAct={(a) => act.mutate({ id: u.id, ...a })}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
