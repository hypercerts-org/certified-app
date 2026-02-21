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
      "Similar idea: one account across apps. The difference is that Certified is designed so you're not locked into one company or one app.",
  },
  {
    question: "Do I need crypto or a wallet?",
    answer:
      "No. Certified works with just your email. No crypto, no wallet, no technical setup required.",
  },
  {
    question: "What if I already have an account on a partner app?",
    answer:
      "On supported platforms, you can connect Certified to an existing account.",
  },
  {
    question: "Can I stop using Certified later?",
    answer:
      "Yes. Your data is portable — you can export it or simply stop using the service at any time.",
  },
  {
    question: "Is my data safe?",
    answer:
      "We use encrypted connections and one-time email codes. You control where you use Certified.",
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
          One account across partner apps — your profile follows you.
        </p>
        <div className="wc-hero__actions">
          <Button variant="primary" size="lg" onClick={signUp}>
            Create your Certified ID
          </Button>
          <a href="#how-it-works" className="hero__btn-secondary">
            How it works
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
          <li>You have to rebuild your profile each time.</li>
          <li>Your history ends up scattered.</li>
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
            Create one Certified account. Use it to sign in to partner apps.
            Your profile and records come with you — no extra setup.
          </p>
        </div>
      </div>

      <div className="wc-divider">
        <hr />
      </div>

      <div className="wc-section">
        <div className="wc-callout">
          <p className="wc-callout__label">Example</p>
          <p className="wc-callout__text">Create your Certified ID on Ma Earth. Later, sign in to GainForest — your profile is already there.</p>
        </div>
      </div>

      <div className="wc-divider"><hr /></div>

      {/* 4. What you get */}
      <div className="wc-section">
        <h2>What you get</h2>
        <div className="wc-grid">
          <div className="wc-card">
            <h3>One account across apps</h3>
            <p>Use the same account on every partner platform. No new logins.</p>
            <p className="wc-card__micro">Example: Ma Earth → GainForest</p>
          </div>
          <div className="wc-card">
            <h3>Your profile travels with you</h3>
            <p>Your profile and activity appear when you sign in to a new app.</p>
          </div>
          <div className="wc-card">
            <h3>You stay in control</h3>
            <p>You can leave anytime. You&apos;re not locked in.</p>
          </div>
          <div className="wc-card">
            <h3>Simple sign-in</h3>
            <p>No passwords. We email you a one-time code.</p>
            <p className="wc-card__micro">Takes ~30 seconds.</p>
          </div>
        </div>
      </div>

      <div className="wc-divider">
        <hr />
      </div>

      {/* 5. Where you can use Certified */}
      <div className="wc-section">
        <h2>Works across partner apps</h2>
        <p className="wc-prose">Use your Certified ID anywhere you see &lsquo;Sign in with Certified&rsquo;.</p>
        <div className="wc-partners">
          <span className="wc-chip">
            <img src="/assets/partners/maearth_logo.jpeg" alt="" className="wc-chip__logo" />
            Ma Earth
          </span>
          <span className="wc-chip">
            <img src="/assets/partners/gainforest_logo.jpeg" alt="" className="wc-chip__logo" />
            GainForest
          </span>
          <span className="wc-chip">Hyperboards</span>
          <span className="wc-chip">
            <img src="/assets/partners/silvi_logo.jpeg" alt="" className="wc-chip__logo" />
            Silvi
          </span>
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
            <p>Enter your email. We send a one-time code.</p>
          </div>
          <div className="wc-step">
            <div className="wc-step__number">2</div>
            <h3>Sign in to partner apps</h3>
            <p>Use it anywhere you see &lsquo;Sign in with Certified&rsquo;.</p>
          </div>
          <div className="wc-step">
            <div className="wc-step__number">3</div>
            <h3>Your profile is already there</h3>
            <p>Your profile and records follow you automatically.</p>
          </div>
        </div>
        <p className="wc-reassurance">That&apos;s it — no extra setup.</p>
      </div>

      <div className="wc-divider">
        <hr />
      </div>

      {/* 7. Built for trust */}
      <div className="wc-section">
        <h2>Built for trust</h2>
        <ul className="wc-trust-list">
          <li>Your account belongs to you.</li>
          <li>You can leave anytime — no lock-in.</li>
          <li>Works across multiple apps — you&apos;re not stuck in one place.</li>
        </ul>
        <div className="wc-trust-sub">
          <h3>Privacy &amp; security</h3>
          <ul>
            <li>One-time email codes — no passwords.</li>
            <li>We don&apos;t sell your personal data.</li>
            <li>Encrypted connections by default.</li>
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
        <p>Create your account in under a minute — no passwords.</p>
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
