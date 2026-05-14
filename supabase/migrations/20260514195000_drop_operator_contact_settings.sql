alter table organization_integrations
  drop column if exists operator_contact_name,
  drop column if exists operator_contact_email,
  drop column if exists operator_contact_tel;
