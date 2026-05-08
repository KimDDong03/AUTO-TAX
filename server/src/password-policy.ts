export const PASSWORD_POLICY_MESSAGE = "비밀번호는 10자 이상이며 영문과 숫자를 모두 포함해야 합니다.";

export function isStrongPassword(value: string): boolean {
  return (
    value.length >= 10 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value)
  );
}
