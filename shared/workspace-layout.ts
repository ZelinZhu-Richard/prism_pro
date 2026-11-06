export interface WorkspaceLayout {
  sidebar: boolean;
  assistant: boolean;
  preview: boolean;
  sidebarWidth: number;
  sourceWidth: number;
  assistantHeight: number;
}
export interface SavedWorkspaceLayout {
  revision: number;
  value: WorkspaceLayout;
}
export const defaultWorkspaceLayout: Readonly<WorkspaceLayout> = Object.freeze({
  sidebar: true,
  assistant: true,
  preview: true,
  sidebarWidth: 230,
  sourceWidth: 54,
  assistantHeight: 260,
});
const validators: { [K in keyof WorkspaceLayout]: (v: unknown) => boolean } = {
  sidebar: (v) => typeof v === "boolean",
  assistant: (v) => typeof v === "boolean",
  preview: (v) => typeof v === "boolean",
  sidebarWidth: (v) =>
    typeof v === "number" && Number.isFinite(v) && v >= 180 && v <= 330,
  sourceWidth: (v) =>
    typeof v === "number" && Number.isFinite(v) && v >= 30 && v <= 75,
  assistantHeight: (v) =>
    typeof v === "number" && Number.isFinite(v) && v >= 180 && v <= 550,
};
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function workspaceLayout(value: unknown): WorkspaceLayout {
  const result = { ...defaultWorkspaceLayout };
  if (record(value))
    for (const k of Object.keys(result) as (keyof WorkspaceLayout)[])
      if (Object.hasOwn(value, k) && validators[k](value[k]))
        Object.assign(result, { [k]: value[k] });
  return result;
}
export function workspaceLayoutPatch(value: unknown): Partial<WorkspaceLayout> {
  if (!record(value)) throw Error("Workspace layout must be an object.");
  for (const [k, v] of Object.entries(value))
    if (
      !Object.hasOwn(validators, k) ||
      !validators[k as keyof WorkspaceLayout](v)
    )
      throw Error(`Invalid workspace layout: ${k.slice(0, 40)}.`);
  return { ...value } as Partial<WorkspaceLayout>;
}
export function sameWorkspaceLayout(a: WorkspaceLayout, b: WorkspaceLayout) {
  return (
    Object.keys(defaultWorkspaceLayout) as (keyof WorkspaceLayout)[]
  ).every((k) => a[k] === b[k]);
}
export type WorkspacePreset = "full" | "write" | "source-pdf";
export function workspacePreset(
  value: WorkspaceLayout,
  preset: WorkspacePreset,
): WorkspaceLayout {
  return {
    ...value,
    sidebar: preset === "full",
    assistant: preset === "full",
    preview: preset !== "write",
  };
}
export function savedWorkspaceLayout(value: unknown): SavedWorkspaceLayout {
  const data = record(value) ? value : {};
  return {
    revision:
      Number.isSafeInteger(data.revision) && Number(data.revision) >= 0
        ? Number(data.revision)
        : 0,
    value: workspaceLayout(data.value),
  };
}
export function validateLayoutAcknowledgment(value: SavedWorkspaceLayout) {
  if (
    !value ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !record(value.value) ||
    Object.keys(value.value).length !==
      Object.keys(defaultWorkspaceLayout).length
  )
    throw Error(
      "The saved layout response was incomplete. Retry to check saved view settings.",
    );
  workspaceLayoutPatch(value.value);
  return value;
}
