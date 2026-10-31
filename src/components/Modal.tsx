import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  dismissible = true,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  dismissible?: boolean;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className={"modal " + (wide ? "wide " : "") + className}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
          disabled={!dismissible}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
