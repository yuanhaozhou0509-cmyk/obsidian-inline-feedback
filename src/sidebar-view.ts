import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { Annotation } from './annotation-store';

export const VIEW_TYPE_FEEDBACK = 'inline-feedback-sidebar';

export interface SidebarContext {
  getAnnotations(): Annotation[];
  getFilePath(): string;
  deleteAnnotation(id: string): Promise<void>;
  navigateToAnnotation(ann: Annotation): void;
}

export class FeedbackSidebarView extends ItemView {
  private context: SidebarContext;

  constructor(leaf: WorkspaceLeaf, context: SidebarContext) {
    super(leaf);
    this.context = context;
  }

  getViewType(): string {
    return VIEW_TYPE_FEEDBACK;
  }

  getDisplayText(): string {
    return 'Feedback Annotations';
  }

  getIcon(): string {
    return 'message-square';
  }

  async onOpen() {
    this.refresh();
  }

  async onClose() {
    this.contentEl.empty();
  }

  /**
   * Re-render the entire sidebar content.
   * Called whenever annotations change or the active file switches.
   */
  refresh() {
    const container = this.contentEl;
    container.empty();
    container.addClass('inline-feedback-sidebar');

    const annotations = this.context.getAnnotations();
    const filePath = this.context.getFilePath();

    // Header
    const header = container.createEl('div', { cls: 'inline-feedback-sidebar-header' });
    header.createEl('h4', { text: 'Feedback Annotations' });

    if (filePath) {
      const fileName = filePath.split('/').pop() || filePath;
      header.createEl('div', {
        cls: 'inline-feedback-sidebar-file',
        text: fileName,
      });
    }

    header.createEl('div', {
      cls: 'inline-feedback-sidebar-count',
      text: `${annotations.length} annotation${annotations.length === 1 ? '' : 's'}`,
    });

    // Empty state
    if (annotations.length === 0) {
      const empty = container.createEl('div', { cls: 'inline-feedback-sidebar-empty' });
      empty.createEl('div', { text: 'No annotations yet' });
      empty.createEl('div', {
        cls: 'inline-feedback-sidebar-hint',
        text: 'Select text and click "Add feedback" to create an annotation.',
      });
      return;
    }

    // Annotation list
    const list = container.createEl('div', { cls: 'inline-feedback-sidebar-list' });

    for (const ann of annotations) {
      const item = list.createEl('div', { cls: 'inline-feedback-sidebar-item' });

      // Top row: line number + delete button
      const topRow = item.createEl('div', { cls: 'inline-feedback-sidebar-item-top' });

      topRow.createEl('span', {
        cls: 'inline-feedback-sidebar-line',
        text: `Line ${ann.lineStart}`,
      });

      const deleteBtn = topRow.createEl('span', {
        cls: 'inline-feedback-sidebar-delete',
        text: '×',
        attr: { title: 'Delete this annotation', 'aria-label': 'Delete' },
      });
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.context.deleteAnnotation(ann.id);
      });

      // Original text
      const originalText = ann.originalText.length > 80
        ? ann.originalText.substring(0, 80) + '...'
        : ann.originalText;
      item.createEl('div', {
        cls: 'inline-feedback-sidebar-original',
        text: `"${originalText}"`,
      });

      // Feedback
      item.createEl('div', {
        cls: 'inline-feedback-sidebar-feedback',
        text: ann.feedback,
      });

      // Timestamp
      item.createEl('div', {
        cls: 'inline-feedback-sidebar-time',
        text: new Date(ann.timestamp).toLocaleString(),
      });

      // Click to navigate
      item.addEventListener('click', () => {
        this.context.navigateToAnnotation(ann);
      });
    }
  }
}
