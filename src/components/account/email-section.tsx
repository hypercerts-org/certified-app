"use client";

import React from "react";

interface EmailSectionProps {
  email: string;
}

const EmailSection: React.FC<EmailSectionProps> = ({ email }) => {
  return (
    <div className="dash-card">
      <div className="settings-field">
        <span className="settings-field__value">{email || "—"}</span>
      </div>
    </div>
  );
};

export default EmailSection;
