export function resolveSelectionPassword(selectionRequest?: { certificatePassword?: string | null }): string | null {
  const inlinePassword = selectionRequest?.certificatePassword?.trim();
  if (inlinePassword) {
    return inlinePassword;
  }

  return null;
}
