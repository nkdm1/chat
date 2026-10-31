import { Alert, AlertDescription } from "@/components/ui/alert";

export function FormAlert({ children }: { children?: string | null }) {
  if (!children) {
    return null;
  }
  return (
    <Alert variant="destructive" className="animate-enter" role="alert">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
