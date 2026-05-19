"use client"

import { useAuth } from "@/lib/auth/auth-context"

export default function ReadyCtaButton() {
  const { openSignIn } = useAuth()

  return (
    <button
      type="button"
      className="hero__btn-signin"
      onClick={openSignIn}
      aria-label="Sign in with Certified"
    >
      <img
        src="/assets/certified_signinwith_black.svg"
        alt="Sign in with Certified"
        className="hero__btn-signin-img"
      />
    </button>
  )
}
