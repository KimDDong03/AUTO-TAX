# AGENTS.md

## Product Terminology

- Do not expose Popbill/팝빌 as user-facing wording on customer-facing pages, especially the customer management page.
- Treat Popbill as an internal integration detail. Use customer-facing terms such as "발행 연동", "인증서 연결", or "공동인증서 등록" instead, depending on context.
- If an error originates from Popbill, show the actionable cause without naming Popbill unless the screen is explicitly an internal admin, ops, or developer diagnostic surface.

## UI Design System

- For new or changed UI, use shadcn/ui components as the default building blocks instead of hand-rolled controls.
- Customize shadcn/ui at the component and variant level to match AUTO-TAX styling; avoid broad global CSS overrides that accidentally restyle unrelated controls.
- Use Lucide icons for interface icons whenever an appropriate icon exists.
