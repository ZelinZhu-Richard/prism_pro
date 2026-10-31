import { Annotation, EditorState, Transaction } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import type { SourceEdit } from "./source-actions";

export const internalEdit = Annotation.define<boolean>();
export function sourceEditTransaction(edit: SourceEdit) {
  return {
    changes: { from: edit.from, to: edit.to, insert: edit.text },
    selection: edit.selection ?? { anchor: edit.from + edit.text.length },
    annotations: [
      Transaction.userEvent.of("input.format"),
      isolateHistory.of("full"),
    ],
  };
}
export const readOnlyTransactions = EditorState.transactionFilter.of(
  (transaction) =>
    transaction.startState.readOnly &&
    !transaction.changes.empty &&
    !transaction.annotation(internalEdit)
      ? []
      : transaction,
);
