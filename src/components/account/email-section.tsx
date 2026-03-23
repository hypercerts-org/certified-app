"use client";

import React from "react";

interface EmailSectionProps {
  email: string;
}

const EmailSection: React.FC<EmailSectionProps> = ({ email }) => {
  return (
    <div className="dash-card mt-4">
      <div className="email-section__header">
        <h2 className="dash-card__title" style={{ marginBottom: 0 }}>Email address</h2>
      </div>
      <p className="personal-info__field">{email || "—"}</p>
      <p className="email-section__hint">
        This is the email address used to sign in to your account.
      </p>
    </div>
  );
};

export default EmailSection;
