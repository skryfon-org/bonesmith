import * as clack from "@clack/prompts";

/** Thrown when the user cancels a prompt (Ctrl-C). */
export class Cancelled extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "Cancelled";
  }
}

export interface SelectOption<T extends string> {
  value: T;
  label?: string;
  hint?: string;
}

/** The prompts the CLI uses. Implementations throw `Cancelled` on Ctrl-C. */
export interface Prompts {
  intro(title: string): void;
  text(opts: { message: string; placeholder?: string; validate?: (value: string) => string | undefined }): Promise<string>;
  select<T extends string>(opts: { message: string; options: SelectOption<T>[]; initialValue?: T }): Promise<T>;
}

function unwrap<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel("Cancelled.");
    throw new Cancelled();
  }
  return value as T;
}

export const clackPrompts: Prompts = {
  intro: (title) => {
    clack.intro(title);
  },
  text: async ({ message, placeholder, validate }) =>
    unwrap<string>(
      await clack.text({
        message,
        ...(placeholder !== undefined ? { placeholder } : {}),
        ...(validate !== undefined ? { validate: (v: string | undefined) => validate(v ?? "") } : {}),
      }),
    ),
  select: async <T extends string>({ message, options, initialValue }: { message: string; options: SelectOption<T>[]; initialValue?: T }) => {
    const opts = options.map((o) => ({ value: o.value, ...(o.label !== undefined ? { label: o.label } : {}), ...(o.hint !== undefined ? { hint: o.hint } : {}) }));
    const picked = await clack.select<string>({ message, options: opts, ...(initialValue !== undefined ? { initialValue } : {}) });
    return unwrap<string>(picked) as T;
  },
};
