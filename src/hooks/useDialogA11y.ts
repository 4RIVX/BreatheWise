import { useLayoutEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useDialogA11y(params: {
  open: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  backgroundRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const { open, dialogRef, initialFocusRef, backgroundRef, onClose } = params;

  useLayoutEffect(() => {
    if (!open) return;

    // Capture trigger BEFORE marking the background container inert (which causes browsers to blur activeElement).
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const bgEl = backgroundRef?.current ?? null;
    const hadInertAttr = bgEl?.hasAttribute("inert") ?? false;
    const prevAriaHidden = bgEl?.getAttribute("aria-hidden") ?? null;

    if (bgEl) {
      bgEl.setAttribute("inert", "");
      bgEl.setAttribute("aria-hidden", "true");
    }

    const focusInitial = () => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }
      const container = dialogRef.current;
      if (!container) return;
      const firstFocusable =
        container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        container.focus();
      }
    };

    focusInitial();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;

      const isFocusableVisible = (el: HTMLElement): boolean => {
        if (el === document.activeElement) return true;
        if (
          el.hidden ||
          el.closest("[hidden], [inert], [aria-hidden='true']")
        ) {
          return false;
        }
        let current: HTMLElement | null = el;
        while (current && current !== container) {
          const style = window.getComputedStyle(current);
          if (style.display === "none" || style.visibility === "hidden") {
            return false;
          }
          current = current.parentElement;
        }
        return true;
      };

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(isFocusableVisible);

      if (focusables.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      if (bgEl) {
        if (!hadInertAttr) {
          bgEl.removeAttribute("inert");
        }
        if (prevAriaHidden === null) {
          bgEl.removeAttribute("aria-hidden");
        } else {
          bgEl.setAttribute("aria-hidden", prevAriaHidden);
        }
      }
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [open, dialogRef, initialFocusRef, backgroundRef, onClose]);
}
