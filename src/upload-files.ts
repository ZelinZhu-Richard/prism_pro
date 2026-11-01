import {
  UPLOAD_BYTES,
  UPLOAD_ENTRIES,
  UPLOAD_FILES,
  uploadPathIssue,
  type UploadEntry,
} from "../shared/file-batches";
import type { BatchResult } from "../shared/file-batches";
import { ApiError } from "./api";
export interface LocalUpload extends UploadEntry {
  file?: File;
}
export function selectedUploads(files: readonly File[]) {
  return filterUploads(
    files.map((file) => ({
      path: file.webkitRelativePath || file.name,
      size: file.size,
      file,
    })),
  );
}
export function filterUploads(entries: LocalUpload[]) {
  const skipped: { path: string; reason: string }[] = [],
    files: LocalUpload[] = [],
    seen = new Set<string>();
  let bytes = 0,
    count = 0;
  if (entries.length > UPLOAD_ENTRIES)
    throw new Error(`Choose at most ${UPLOAD_ENTRIES} files and folders.`);
  for (const item of entries) {
    const issue = uploadPathIssue(item.path);
    if (issue.error) throw new Error(`${item.path}: ${issue.error}`);
    if (issue.skip) {
      skipped.push({ path: item.path, reason: issue.skip });
      continue;
    }
    const key = item.path.normalize("NFC").toLowerCase();
    if (seen.has(key))
      throw new Error(
        `More than one selected item has the path ${item.path}. Choose a folder to preserve their different locations.`,
      );
    seen.add(key);
    bytes += item.size;
    if (!item.directory) count++;
    files.push(item);
  }
  if (bytes > UPLOAD_BYTES || count > UPLOAD_FILES)
    throw new Error(
      `Choose at most ${UPLOAD_FILES} files and 50 MB per upload.`,
    );
  return { files, skipped };
}
export async function droppedUploads(transfer: DataTransfer) {
  // Capture entries during the drop event; browsers clear DataTransfer afterward.
  const entries = Array.from(transfer.items)
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return selectedUploads(Array.from(transfer.files));
  const files: LocalUpload[] = [],
    skipped: { path: string; reason: string }[] = [];
  let count = 0;
  async function visit(entry: FileSystemEntry, parent = "", depth = 0) {
    const name = parent + entry.name;
    if (++count > UPLOAD_ENTRIES || depth > 32)
      throw new Error("This folder exceeds the upload entry or nesting limit.");
    const issue = uploadPathIssue(name);
    if (issue.error) throw new Error(`${name}: ${issue.error}`);
    if (issue.skip) {
      skipped.push({ path: name, reason: issue.skip });
      return;
    }
    if (entry.isDirectory) {
      files.push({ path: name, size: 0, directory: true });
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const children = await new Promise<FileSystemEntry[]>(
          (resolve, reject) => reader.readEntries(resolve, reject),
        );
        if (!children.length) break;
        for (const child of children) await visit(child, name + "/", depth + 1);
      }
    } else {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      files.push({ path: name, size: file.size, file });
    }
  }
  for (const entry of entries) await visit(entry);
  const result = filterUploads(files);
  return { ...result, skipped: [...skipped, ...result.skipped] };
}
export function sendUpload(
  url: string,
  form: FormData,
  onProgress: (value: number) => void,
): Promise<BatchResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api" + url);
    xhr.setRequestHeader("X-Prism-Request", "1");
    xhr.responseType = "json";
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (
          xhr.response?.project?.id &&
          typeof xhr.response?.operationId === "string" &&
          Array.isArray(xhr.response?.changedFiles)
        )
          resolve(xhr.response);
        else
          reject(
            new Error(
              "The upload response was incomplete. Retry the same upload to check whether it was saved.",
            ),
          );
      } else
        reject(
          new ApiError(
            xhr.response?.error ||
              "Upload failed. Your selection is retained; retry the same upload.",
            xhr.status,
          ),
        );
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "The connection ended. Retry the same upload to check whether it was saved.",
        ),
      );
    xhr.ontimeout = () =>
      reject(
        new Error(
          "The upload timed out. Retry the same upload to check whether it was saved.",
        ),
      );
    xhr.send(form);
  });
}
