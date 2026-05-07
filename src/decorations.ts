/**
 * CodeMirror 6 decorations for highlighting annotated text
 * and showing feedback on hover.
 */
import { StateEffect, Extension, Text } from '@codemirror/state';
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  hoverTooltip,
} from '@codemirror/view';
import type { Annotation } from './annotation-store';

/**
 * StateEffect dispatched to trigger decoration refresh.
 */
export const refreshEffect = StateEffect.define<null>();

/**
 * The highlight decoration mark applied to annotated text.
 */
const highlightMark = Decoration.mark({ class: 'inline-feedback-highlight' });

/**
 * Resolve an annotation's position in the current document.
 * First tries exact line/char match, then falls back to text search.
 */
function resolvePosition(
  doc: Text,
  ann: Annotation
): { from: number; to: number } | null {
  try {
    // Try exact position match
    if (ann.lineStart >= 1 && ann.lineStart <= doc.lines &&
        ann.lineEnd >= 1 && ann.lineEnd <= doc.lines) {
      const startLine = doc.line(ann.lineStart);
      const endLine = doc.line(ann.lineEnd);
      const from = startLine.from + ann.charStart;
      const to = endLine.from + ann.charEnd;

      if (from >= 0 && to <= doc.length && from < to) {
        const text = doc.sliceString(from, to);
        if (text === ann.originalText) {
          return { from, to };
        }
      }
    }

    // Fallback: search for the original text in the document
    if (ann.originalText && ann.originalText.length > 0) {
      const fullText = doc.toString();
      const idx = fullText.indexOf(ann.originalText);
      if (idx >= 0) {
        return { from: idx, to: idx + ann.originalText.length };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Build a DecorationSet from the current annotations.
 */
function buildDecorations(doc: Text, annotations: Annotation[]): DecorationSet {
  if (!annotations || annotations.length === 0) {
    return Decoration.none;
  }

  const resolved: { from: number; to: number }[] = [];

  for (const ann of annotations) {
    const pos = resolvePosition(doc, ann);
    if (pos) {
      resolved.push(pos);
    }
  }

  // Sort by start position (required by RangeSetBuilder)
  resolved.sort((a, b) => a.from - b.from || a.to - b.to);

  // Remove overlapping ranges
  const merged: { from: number; to: number }[] = [];
  for (const r of resolved) {
    const last = merged[merged.length - 1];
    if (last && r.from < last.to) {
      // Merge overlapping ranges
      last.to = Math.max(last.to, r.to);
    } else {
      merged.push({ ...r });
    }
  }

  let decorations = Decoration.none;
  if (merged.length > 0) {
    decorations = Decoration.set(
      merged.map(r => highlightMark.range(r.from, r.to))
    );
  }

  return decorations;
}

/**
 * Callbacks interface for decoration interactions.
 */
export interface DecorationCallbacks {
  getAnnotations(): Annotation[];
  onDelete(annotationId: string): void;
  onEdit(annotationId: string, newFeedback: string): void;
  getResourcePath?(path: string): string;
  saveImage?(arrayBuffer: ArrayBuffer, fileName: string): Promise<string>;
}

function renderFeedbackContent(
  container: HTMLElement,
  feedback: string,
  getResourcePath?: (path: string) => string
) {
  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(feedback)) !== null) {
    if (match.index > lastIndex) {
      const textNode = document.createTextNode(feedback.substring(lastIndex, match.index));
      container.appendChild(textNode);
    }
    const imgPath = match[2];
    const img = document.createElement('img');
    img.className = 'inline-feedback-tooltip-img';
    img.alt = match[1] || 'image';
    img.src = getResourcePath ? getResourcePath(imgPath) : imgPath;
    container.appendChild(img);
    lastIndex = imgRegex.lastIndex;
  }
  if (lastIndex < feedback.length) {
    const textNode = document.createTextNode(feedback.substring(lastIndex));
    container.appendChild(textNode);
  }
}

/**
 * Create the CM6 extension for decorations and hover tooltips.
 *
 * @param callbacks - object containing getAnnotations, onDelete, onEdit
 * @returns array of CM6 Extensions
 */
export function createDecorationExtension(
  callbacks: DecorationCallbacks
): Extension[] {
  const { getAnnotations, onDelete, onEdit, getResourcePath, saveImage } = callbacks;

  // ViewPlugin that manages decorations
  const decorationPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view.state.doc, getAnnotations());
      }

      update(update: ViewUpdate) {
        const hasRefresh = update.transactions.some(tr =>
          tr.effects.some(e => e.is(refreshEffect))
        );
        if (update.docChanged || hasRefresh) {
          this.decorations = buildDecorations(update.state.doc, getAnnotations());
        }
      }
    },
    {
      decorations: v => v.decorations,
    }
  );

  /**
   * Create a standalone floating edit popup, mounted on document.body,
   * completely independent of CM6's tooltip lifecycle.
   */
  function showEditPopup(ann: Annotation, anchorRect: DOMRect) {
    // Remove any existing edit popup
    const existing = document.querySelector('.inline-feedback-edit-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.className = 'inline-feedback-edit-popup';

    // Position below the anchor (the tooltip or highlight)
    popup.style.position = 'fixed';
    popup.style.left = `${anchorRect.left}px`;
    popup.style.top = `${anchorRect.bottom + 4}px`;
    popup.style.zIndex = '10000';

    // Clamp to viewport
    requestAnimationFrame(() => {
      const rect = popup.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) {
        popup.style.left = `${window.innerWidth - rect.width - 8}px`;
      }
      if (rect.bottom > window.innerHeight - 8) {
        popup.style.top = `${anchorRect.top - rect.height - 4}px`;
      }
    });

    const editLabel = document.createElement('div');
    editLabel.className = 'inline-feedback-tooltip-label';
    editLabel.textContent = 'Edit feedback:';
    popup.appendChild(editLabel);

    const textarea = document.createElement('textarea');
    textarea.className = 'inline-feedback-tooltip-edit-textarea';
    textarea.value = ann.feedback;
    textarea.rows = 3;
    popup.appendChild(textarea);

    if (saveImage) {
      textarea.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            e.preventDefault();
            e.stopPropagation();
            const file = items[i].getAsFile();
            if (!file) return;
            const ext = file.type.split('/')[1] || 'png';
            const fileName = `feedback-${Date.now()}.${ext}`;
            file.arrayBuffer().then(async (buf) => {
              const savedPath = await saveImage(buf, fileName);
              const ref = `![img](${savedPath})`;
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              textarea.value = textarea.value.substring(0, start) + ref + textarea.value.substring(end);
              textarea.selectionStart = textarea.selectionEnd = start + ref.length;
              textarea.focus();
            });
            return;
          }
        }
      });
    }

    const editActions = document.createElement('div');
    editActions.className = 'inline-feedback-tooltip-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'inline-feedback-tooltip-save-btn';
    saveBtn.textContent = 'Save';
    editActions.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'inline-feedback-tooltip-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    editActions.appendChild(cancelBtn);

    popup.appendChild(editActions);
    document.body.appendChild(popup);

    // Focus textarea after appending
    textarea.focus();

    const closePopup = () => {
      if (popup.parentNode) popup.remove();
    };

    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const newFeedback = textarea.value.trim();
      if (newFeedback && newFeedback !== ann.feedback) {
        onEdit(ann.id, newFeedback);
      }
      closePopup();
    });

    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePopup();
    });

    // Close on click outside
    const onDocClick = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node)) {
        closePopup();
        document.removeEventListener('mousedown', onDocClick, true);
      }
    };
    // Delay registering to avoid the current click closing it
    setTimeout(() => {
      document.addEventListener('mousedown', onDocClick, true);
    }, 50);

    // Close on Escape
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePopup();
        document.removeEventListener('mousedown', onDocClick, true);
      }
    });
  }

  // Hover tooltip that shows feedback when hovering over annotated text
  const tooltipExtension = hoverTooltip((view, pos) => {
    const annotations = getAnnotations();
    if (!annotations || annotations.length === 0) return null;

    for (const ann of annotations) {
      const resolved = resolvePosition(view.state.doc, ann);
      if (resolved && pos >= resolved.from && pos <= resolved.to) {
        return {
          pos: resolved.from,
          end: resolved.to,
          above: true,
          create() {
            const dom = document.createElement('div');
            dom.className = 'inline-feedback-tooltip';

            const feedbackLabel = document.createElement('div');
            feedbackLabel.className = 'inline-feedback-tooltip-label';
            feedbackLabel.textContent = 'Feedback:';
            dom.appendChild(feedbackLabel);

            const feedbackText = document.createElement('div');
            feedbackText.className = 'inline-feedback-tooltip-text';
            renderFeedbackContent(feedbackText, ann.feedback, getResourcePath);
            dom.appendChild(feedbackText);

            const timestamp = document.createElement('div');
            timestamp.className = 'inline-feedback-tooltip-time';
            timestamp.textContent = new Date(ann.timestamp).toLocaleString();
            dom.appendChild(timestamp);

            // Action buttons row
            const actions = document.createElement('div');
            actions.className = 'inline-feedback-tooltip-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'inline-feedback-tooltip-edit-btn';
            editBtn.textContent = 'Edit';
            actions.appendChild(editBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'inline-feedback-tooltip-delete-btn';
            deleteBtn.textContent = 'Delete';
            actions.appendChild(deleteBtn);

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
            dom.appendChild(actions);

            // Prevent tooltip from closing and allow text selection
            dom.addEventListener('mousedown', (e) => {
              e.preventDefault();
              e.stopPropagation();
            });
            // Allow text selection in feedback text area only
            feedbackText.addEventListener('mousedown', (e) => {
              e.stopPropagation();
            });

            editBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              // Get position of the tooltip before it may close
              const rect = dom.getBoundingClientRect();
              // Open standalone edit popup
              showEditPopup(ann, rect);
            });

            deleteBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(ann.id);
            });

            return { dom };
          },
        };
      }
    }

    return null;
  });

  return [decorationPlugin, tooltipExtension];
}
