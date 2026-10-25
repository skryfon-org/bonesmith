import type { ComponentProps } from "react";

export interface ButtonProps extends ComponentProps<"button"> {
  /** Visual emphasis. */
  variant?: "primary" | "secondary";
}

export function Button({ type = "button", variant = "primary", ...props }: ButtonProps) {
  return <button type={type} data-variant={variant} {...props} />;
}
