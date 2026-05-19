export default function WhatYouGet() {
  return (
    <section
      id="what-you-get"
      className="landing-section landing-section--light"
      aria-labelledby="what-you-get-heading"
    >
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <span className="landing-label">What it does</span>
          <h2 id="what-you-get-heading">Build a reputation that travels with you</h2>
        </div>
        <div className="landing-bento">
          {/* Achievements — the lexicon calls these "claim.activity"
              records, but the welcome page intentionally never uses
              the in-app jargon ("cert"). "Achievement" is the
              first-touch language. */}
          <div className="landing-bento__card">
            <div className="landing-bento__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 15a4 4 0 1 0-4-4" />
                <circle cx="12" cy="11" r="4" />
                <path d="M8.5 13.5 6 22l6-3 6 3-2.5-8.5" />
              </svg>
            </div>
            <h3>Showcase verified achievements</h3>
            <p>Record the work you do — talks, contributions, projects, milestones. Each one is a portable, signed record on your own profile.</p>
          </div>

          {/* Endorsements */}
          <div className="landing-bento__card">
            <div className="landing-bento__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 10v12" />
                <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L15 2a3.13 3.13 0 0 1 0 3.88Z" />
              </svg>
            </div>
            <h3>Get endorsed by people you trust</h3>
            <p>Friends and collaborators can vouch for your work directly on your profile — public, signed, and you accept or reject each one.</p>
          </div>

          {/* Projects */}
          <div className="landing-bento__card">
            <div className="landing-bento__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
                <polyline points="7.5 19.79 7.5 14.6 3 12" />
                <polyline points="21 12 16.5 14.6 16.5 19.79" />
              </svg>
            </div>
            <h3>Organize work into projects</h3>
            <p>Group related achievements into projects — initiatives, repos, programs. Tell a coherent story across collaborators.</p>
          </div>

          {/* Portable / atproto */}
          <div className="landing-bento__card">
            <div className="landing-bento__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <h3>Yours, forever, anywhere</h3>
            <p>Built on AT Protocol. Your records live on your repo, follow you between apps, and never lock in.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
