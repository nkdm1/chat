"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  /** Bump to replay the shake animation after a wrong code. */
  shakeKey?: number;
  autoFocus?: boolean;
};

export function OtpField({ shakeKey = 0, ...props }: Props) {
  return (
    <div key={shakeKey} className={shakeKey ? "animate-shake" : undefined}>
      <InputOTP
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="6-digit code"
        {...props}
      >
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className="font-mono" />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
