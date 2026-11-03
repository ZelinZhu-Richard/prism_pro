import { Store } from "./store";
import { AppError } from "./files";
import {
  savedWorkspaceLayout,
  sameWorkspaceLayout,
  workspaceLayoutPatch,
  defaultWorkspaceLayout,
} from "../shared/workspace-layout";
export class WorkspaceLayouts {
  constructor(private store: Store) {}
  get() {
    return savedWorkspaceLayout(this.store.setting("workspace-layout", null));
  }
  put(input: unknown) {
    const request = input as any;
    if (
      !request ||
      Array.isArray(request) ||
      !Number.isSafeInteger(request.revision) ||
      request.revision < 0
    )
      throw new AppError(400, "Save layout with its current revision.");
    let value;
    try {
      const patch = workspaceLayoutPatch(request.value);
      if (
        Object.keys(patch).length !== Object.keys(defaultWorkspaceLayout).length
      )
        throw Error("Save all workspace layout fields together.");
      value = { ...defaultWorkspaceLayout, ...patch };
    } catch (e) {
      throw new AppError(400, (e as Error).message);
    }
    const current = this.get();
    if (sameWorkspaceLayout(current.value, value)) return current;
    if (
      request.revision !== current.revision ||
      current.revision === Number.MAX_SAFE_INTEGER
    )
      throw new AppError(
        409,
        "Workspace layout changed in another view. Retry to save this layout, or load the saved layout.",
      );
    const next = { revision: current.revision + 1, value };
    this.store.setSetting("workspace-layout", next);
    return next;
  }
}
