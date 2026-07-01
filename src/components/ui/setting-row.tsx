import React from "react"

/**
 * A single labelled setting: title (+ optional description) on the left, its
 * control on the right — stacking on narrow widths. The reusable unit for a
 * settings panel that holds more than one control: drop several into a
 * panel body and they line up consistently, so adding a new toggle or
 * selector is a one-liner rather than bespoke markup.
 */
export interface SettingRowProps {
  title: string
  description?: string
  /** The control for this setting (toggle, selector, button, …). */
  children: React.ReactNode
}

export default function SettingRow({
  title,
  description,
  children,
}: SettingRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <span className="setting-row__title">{title}</span>
        {description ? (
          <span className="setting-row__desc">{description}</span>
        ) : null}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  )
}
