"use client";

import { Button, Field, Input } from "@hypercerts-org/ui-react";
import { useActionState } from "react";
import { signIn } from "@/lib/auth/actions";

export function SignInForm({ returnTo, error }: { returnTo: string; error: string | null }) {
  const [state, action, pending] = useActionState(signIn, { error, identifier: "" });

  return (
    <form action={action} className="stack sign-in-form">
      <input type="hidden" name="returnTo" value={returnTo} />
      <Field
        label="Email or handle"
        description="Use your email for a Certified account, or the handle of an account on Bluesky or another AT Protocol server."
        error={state.error}
      >
        {(field) => (
          <Input
            {...field}
            // A form action resets the form to default values; keep what the
            // visitor typed.
            defaultValue={state.identifier}
            name="identifier"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.org or you.bsky.social"
          />
        )}
      </Field>
      <Button type="submit" loading={pending}>
        Continue
      </Button>
    </form>
  );
}
