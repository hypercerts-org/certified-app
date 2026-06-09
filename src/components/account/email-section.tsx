"use client";

import React from "react";

interface EmailSectionProps {
  email: string;
}

const EmailSection: React.FC<EmailSectionProps> = ({ email }) => {
  return (
    <div className="dash-card mt-4">
      <div className="settings-field">
        <span className="settings-field__value">{email || "—"}</span>
      </div>
      <p className="email-section__hint">
        This is the email address used to sign in to your account.
      </p>
    </div>
  );
};

export default EmailSection;
