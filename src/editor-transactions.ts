import { Annotation, EditorState } from "@codemirror/state";

export const internalEdit = Annotation.define<boolean>();
export const readOnlyTransactions = EditorState.transactionFilter.of(
  (transaction) =>
    transaction.startState.readOnly &&
    !transaction.changes.empty &&
    !transaction.annotation(internalEdit)
      ? []
      : transaction,
);
