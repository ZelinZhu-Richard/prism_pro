import type { CommentMark } from "./comments";
import type { TrackingFile, TrackingStatus } from "./tracking";

export interface EditorReview {
  status: TrackingStatus;
  file?: TrackingFile;
  fileError?: string;
  marks: CommentMark[];
}
