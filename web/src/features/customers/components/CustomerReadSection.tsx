import React from "react";

export type CustomerReadField = {
  label: string;
  value: string;
  full: boolean;
};

type CustomerReadSectionProps = {
  title: string;
  description: string;
  isEditing: boolean;
  openLabel: string;
  closeLabel: string;
  onToggle: () => void;
  fields: CustomerReadField[];
  children?: React.ReactNode;
};

export function CustomerReadSection(props: CustomerReadSectionProps) {
  return (
    <>
      <section className="stitch-customer-read-section">
        <div className="stitch-customer-section-head">
          <div className="stitch-customer-section-copy">
            <strong>{props.title}</strong>
            <span>{props.description}</span>
          </div>
          <button
            type="button"
            className={props.isEditing ? "btn-secondary active-filter" : "btn-secondary"}
            onClick={props.onToggle}
          >
            {props.isEditing ? props.closeLabel : props.openLabel}
          </button>
        </div>
        <div className="stitch-customer-read-grid">
          {props.fields.map((field) => (
            <article key={field.label} className={field.full ? "stitch-customer-read-item is-full" : "stitch-customer-read-item"}>
              <span>{field.label}</span>
              <strong>{field.value}</strong>
            </article>
          ))}
        </div>
      </section>
      {props.children}
    </>
  );
}
