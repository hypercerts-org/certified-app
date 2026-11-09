"use client";

import { Button, Field, Input } from "@hypercerts-org/ui-react";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { signIn } from "@/lib/auth/actions";

const UNAVAILABLE = "Sign-in is unavailable right now. Please try again.";

export function SignInForm({ returnTo, error }: { returnTo: string; error: string | null }) {
  const [identifier, setIdentifier] = useState("");
  // On success the action redirects to the authorization server, so the
  // button keeps spinning until the browser leaves.
  const start = useMutation({ mutationFn: signIn });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!start.isPending) start.mutate({ identifier, returnTo });
  }

  return (
    <form onSubmit={submit} className="stack sign-in-form">
      <Field
        label="Email or handle"
        description="Use your email for a Certified account, or the handle of an account on Bluesky or another AT Protocol server."
        error={start.isError ? UNAVAILABLE : (start.data?.error ?? (start.isIdle ? error : null))}
      >
        {(field) => (
          <Input
            {...field}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
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
      <Button type="submit" loading={start.isPending}>
        Continue
      </Button>
    </form>
  );
}
