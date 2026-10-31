export function validateArchiveSelection(
  files: ArrayLike<{ name: string; size: number }>,
) {
  if (files.length !== 1) return "Choose one project ZIP at a time.";
  if (!/\.zip$/i.test(files[0].name))
    return "Choose a .zip file containing your LaTeX project.";
  if (files[0].size > 100 * 1024 * 1024)
    return "This ZIP is larger than 100 MB. Choose a smaller archive.";
  return null;
}

// Used by the actual drop handler as well as non-browser event fixtures.
export function droppedArchives(
  event: Pick<DragEvent, "preventDefault" | "dataTransfer">,
) {
  event.preventDefault();
  return Array.from(event.dataTransfer?.files ?? []);
}
