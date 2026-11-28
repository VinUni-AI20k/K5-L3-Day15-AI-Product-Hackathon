import {
  PROMPT_VARIABLE_HINTS,
  PROMPT_VARIABLE_WHITELIST,
  REQUIRED_PROMPT_VARIABLES,
} from "@/ui/schemas/prompt.schema";

/**
 * The reference an operator needs while writing a prompt: which variables
 * exist, which are mandatory, and — the part that matters most — which will
 * never exist.
 *
 * Business rule 2 is stated out loud here: there is no price or stock variable,
 * and a body that invents one is refused at save time. Saying it in the help box
 * is cheaper than letting someone write a template, hit a 400 and guess why.
 *
 * Presentational: no props, no fetching. The list mirrors the server whitelist.
 */
export function PromptVariablesHelp({ id }: { id?: string }) {
  const required = new Set<string>(REQUIRED_PROMPT_VARIABLES);

  return (
    <aside
      id={id}
      aria-labelledby={`${id ?? "prompt-vars"}-heading`}
      className="border-border bg-muted/30 space-y-3 rounded-lg border p-4"
    >
      <h3 id={`${id ?? "prompt-vars"}-heading`} className="text-foreground text-sm font-semibold">
        Biến được phép dùng trong nội dung prompt
      </h3>

      <ul className="space-y-1.5">
        {PROMPT_VARIABLE_WHITELIST.map((name) => (
          <li key={name} className="text-sm leading-relaxed">
            <code className="border-border bg-background text-foreground rounded-md border px-1.5 py-0.5 font-mono text-xs">
              {`{{${name}}}`}
            </code>{" "}
            <span className="text-muted-foreground">{PROMPT_VARIABLE_HINTS[name]}</span>
            {required.has(name) ? (
              <span className="text-warning-foreground font-medium"> · bắt buộc</span>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="border-warning/40 bg-warning/10 text-warning-foreground rounded-lg border p-3 text-xs leading-relaxed">
        Không có biến giá hay tồn kho, và sẽ không bao giờ có. Prompt dùng biến ngoài danh sách trên
        (ví dụ <code className="font-mono">{"{{product.price}}"}</code>) sẽ bị máy chủ từ chối ngay
        khi lưu — thông tin giá, tồn, lưu ý sản xuất không được phép đi vào caption.
      </p>
    </aside>
  );
}
