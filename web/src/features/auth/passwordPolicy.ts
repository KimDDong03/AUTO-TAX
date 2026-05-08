export const PASSWORD_POLICY_MESSAGE = "비밀번호는 12자 이상이며 대문자, 소문자, 숫자, 특수문자를 모두 포함해야 합니다.";
export const PASSWORD_POLICY_PLACEHOLDER = "12자 이상, 대/소문자+숫자+특수문자";

export function isStrongPassword(value: string): boolean {
  return (
    value.length >= 12 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}
