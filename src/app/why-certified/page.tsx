"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import Button from "@/components/ui/button";

const FAQ_ITEMS = [
  {
    question: "Is this like 'Sign in with Google'?",
    answer:
      "Similar idea, but you own your account. With Certified, your data isn't controlled by a big tech company — it stays with you.",
  },
  {
    question: "Do I need crypto or a wallet?",
    answer:
      "No. Certified works with just your email. No crypto, no wallet, no technical setup required.",
  },
  {
    question: "What if I already have an account on a partner app?",
    answer:
      "You can create a Certified ID and link it to your existing account on supported platforms.",
  },
  {
    question: "Can I stop using Certified later?",
    answer:
      "Yes. Your data is portable — you can export it or simply stop using the service at any time.",
  },
  {
    question: "Is my data safe?",
    answer:
      "We use secure, encrypted connections and email-based verification. We never sell your personal data.",
  },
  {
    question: "What apps support Certified?",
    answer:
      "Currently Ma Earth, GainForest, Hyperboards, and Silvi. More apps are joining over time.",
  },
];

export default function WhyCertifiedPage() {
  const { signIn, signUp } = useAuth();
  const { setVariant } = useNavbarVariant();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    setVariant("transparent");
    return () => setVariant("default");
  }, [setVariant]);

  return (
    <div className="wc-page">
      {/* 1. Hero */}
      <div className="wc-hero">
        <h1>Why Certified</h1>
        <p>
          One account that works across trusted impact apps — your identity and
          data travel with you.
        </p>
        <div className="wc-hero__actions">
          <Button variant="primary" size="lg" onClick={signUp}>
            Create your Certified ID
          </Button>
          <a href="#how-it-works" className="hero__btn-secondary">
            Learn how it works
          </a>
        </div>
      </div>

      <div className="wc-divider">
        <hr />
      </div>

      {/* 2. The problem */}
      <div className="wc-section">
        <h2>The problem</h2>
        <ul className="wc-bullets">
          <li>Every app makes you create a new account.</li>
          <li>Your profile and work don&apos;t carry over.</li>
          <li>Your data gets stuck in one place.</li>
        </ul>
      </div>

      <div className="wc-divider">
        <hr />
      </div>

      {/* 3. The simple idea */}
      <div className="wc-section">
        <h2>The simple idea</h2>
        <div className="wc-prose">
          <p>
            You create one Certified account. You use it to sign in to different
            apps. Your identity and data travel with you — no extra setup, no
            starting over.
          </p>
        </div>
      </div>

      <div className="wc-divider">
        <hr />
      </div>

      {/* 4. What you get */}
      <div className="wc-section">
        <h2>What you get</h2>
        <div className="wc-grid">
          <div className="wc-card">
            <h3>One account across apps</h3>
            <p>
              Sign in once and use the same account on every partner platform.
              No more juggling logins.
            </p>
          </div>
          <div className="wc-card">
            <h3>Your profile travels with you</h3>
            <p>
              Your name, contributions, and records are already there when you
              sign in to a new app.
            </p>
          </div>
          <div className="wc-card">
            <h3>You stay in control</h3>
            <p>
              Your data belongs to you. You can move it or leave any time — no
              lock-in.
            </p>
          </div>
          <div className="wc-card">
            <h3>Simple sign-in</h3>
            <p>
              No passwords to remember. Just enter your email and a secure code.
              That&apos;s it.
            </p>
          </div>
        </div>
      </div>

      <div className="wc-divider">
        <hr />
      </div>

      {/* 5. Where you can use Certified */}
      <div className="wc-section">
        <h2>Where you can use Certified</h2>
        <p className="wc-prose">Certified works across trusted partner platforms.</p>
        <div className="wc-partners">
          <span className="wc-chip">Ma Earth</span>
          <span className="wc-chip">GainForest</span>
          <span className="wc-chip">Hyperboards</span>
          <span className="wc-chip">Silvi</span>
        </div>
        <p className="wc-footnote">More apps are joining over time.</p>
      </div>

      <div className="wc-divider">
        <hr />
      </div>

      {/* 6. How it works */}
      <div className="wc-section" id="how-it-works">
        <h2>How it works</h2>
        <div className="wc-steps">
          <div className="wc-step">
            <div className="wc-step__number">1</div>
            <h3>Create your Certified ID</h3>
            <p>Enter your email and verify with a secure code.</p>
          </div>
          <div className="wc-step">
            <div className="wc-step__number">2</div>
            <h3>Sign in to partner apps</h3>
            <p>
              Use your Certified account wherever you see &ldquo;Sign in with
              Certified.&rdquo;
            </p>
          </div>
          <div className="wc-step">
            <div className="wc-step__number">3</div>
            <h3>Your profile is already there</h3>
            <p>Your identity and records follow you automatically.</p>
          </div>
        </div>
        <p className="wc-reassurance">You don&apos;t have to set up anything else.</p>
      </div>

      <div className="wc-divider">
        <hr />
      </div>

      {/* 7. Built for trust */}
      <div className="wc-section">
        <h2>Built for trust</h2>
        <ul className="wc-trust-list">
          <li>Your identity is yours.</li>
          <li>You can move your data — you&apos;re not locked in.</li>
          <li>
            Certified is built on open standards and works across multiple apps.
          </li>
        </ul>
        <div className="wc-trust-sub">
          <h3>Privacy &amp; security</h3>
          <ul>
            <li>
              We use secure email codes for sign-in — no passwords needed.
            </li>
            <li>Our policy is to never sell your personal data.</li>
            <li>
              Read our{" "}
              <Link href="/privacy">Privacy Policy</Link> and{" "}
              <Link href="/terms">Terms of Service</Link>.
            </li>
          </ul>
        </div>
      </div>

      <div className="wc-divider">
        <hr />
      </div>

      {/* 8. FAQ */}
      <div className="wc-section">
        <h2>Frequently asked questions</h2>
        <div className="wc-faq">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openFaq === index;
            const answerId = `faq-answer-${index}`;
            return (
              <div key={index} className="wc-faq-item">
                <button
                  className="wc-faq-btn"
                  aria-expanded={isOpen}
                  aria-controls={answerId}
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                >
                  {item.question}
                  <Plus
                    className={`wc-faq-icon${isOpen ? " wc-faq-icon--open" : ""}`}
                  />
                </button>
                <div
                  id={answerId}
                  role="region"
                  className={`wc-faq-answer${isOpen ? " wc-faq-answer--open" : ""}`}
                >
                  <p>{item.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="wc-divider">
        <hr />
      </div>

      {/* 9. Bottom CTA */}
      <div className="wc-bottom-cta">
        <h2>Ready to get started?</h2>
        <p>Create your account in under a minute.</p>
        <div className="wc-bottom-cta__actions">
          <Button variant="primary" size="lg" onClick={signUp}>
            Create your Certified ID
          </Button>
          <button className="hero__btn-secondary" onClick={signIn}>
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
