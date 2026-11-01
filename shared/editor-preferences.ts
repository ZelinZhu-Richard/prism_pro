export const editorFonts = {
  system: {
    label: "System monospace",
    family:
      '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  },
  source: {
    label: "Source Code Pro / Lucida",
    family: '"Source Code Pro", "Lucida Console", monospace',
  },
  dyslexic: {
    label: "OpenDyslexic Mono",
    family: '"OpenDyslexic Mono", monospace',
  },
} as const;
export const editorLineHeights = {
  compact: 1.5,
  normal: 1.85,
  wide: 2.15,
} as const;
export interface EditorPreferences {
  fontSize: number;
  fontFamily: keyof typeof editorFonts;
  lineHeight: keyof typeof editorLineHeights;
  tabSize: 2 | 4 | 8;
  indentWithTabs: boolean;
  lineWrapping: boolean;
  keymap: "default" | "vim" | "emacs";
  autoComplete: boolean;
  closeBrackets: boolean;
  lineNumbers: boolean;
  previewPaste: boolean;
}
export const defaultEditorPreferences: Readonly<EditorPreferences> =
  Object.freeze({
    fontSize: 13,
    fontFamily: "system",
    lineHeight: "normal",
    tabSize: 2,
    indentWithTabs: false,
    lineWrapping: true,
    keymap: "default",
    autoComplete: true,
    closeBrackets: true,
    lineNumbers: true,
    previewPaste: false,
  });
const validators: {
  [K in keyof EditorPreferences]: (value: unknown) => boolean;
} = {
  fontSize: (v) => Number.isInteger(v) && Number(v) >= 10 && Number(v) <= 24,
  fontFamily: (v) => ["system", "source", "dyslexic"].includes(v as string),
  lineHeight: (v) => ["compact", "normal", "wide"].includes(v as string),
  tabSize: (v) => [2, 4, 8].includes(v as number),
  keymap: (v) => ["default", "vim", "emacs"].includes(v as string),
  indentWithTabs: (v) => typeof v === "boolean",
  lineWrapping: (v) => typeof v === "boolean",
  autoComplete: (v) => typeof v === "boolean",
  closeBrackets: (v) => typeof v === "boolean",
  lineNumbers: (v) => typeof v === "boolean",
  previewPaste: (v) => typeof v === "boolean",
};
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
// Recover old/invalid persisted values without permitting arbitrary CSS or extensions.
export function editorPreferences(value: unknown): EditorPreferences {
  const result = { ...defaultEditorPreferences };
  if (record(value))
    for (const key of Object.keys(result) as (keyof EditorPreferences)[])
      if (Object.hasOwn(value, key) && validators[key](value[key]))
        Object.assign(result, { [key]: value[key] });
  return result;
}
// Reject the entire incoming patch before persisting any preference.
export function editorPreferencesPatch(
  value: unknown,
): Partial<EditorPreferences> {
  if (!record(value)) throw new Error("Editor preferences must be an object.");
  for (const [key, item] of Object.entries(value))
    if (
      !Object.hasOwn(validators, key) ||
      !validators[key as keyof EditorPreferences](item)
    )
      throw new Error(`Invalid editor preference: ${key.slice(0, 40)}.`);
  return value as Partial<EditorPreferences>;
}
