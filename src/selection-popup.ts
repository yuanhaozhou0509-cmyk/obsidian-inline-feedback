/**
 * SelectionPopup - Floating popup that appears when user selects text.
 * Shows two buttons: "Add feedback" and "Save card".
 * Each button expands into its own form.
 */
import { extractKeywords } from './keyword-extractor';

export type FeedbackSubmitCallback = (
  filePath: string,
  selectedText: string,
  feedback: string,
  fromLine: number,
  toLine: number,
  fromCh: number,
  toCh: number
) => void;

export type CardSubmitCallback = (
  filePath: string,
  selectedText: string,
  title: string,
  keywords: string[],
  categories: string[],
  notes: string,
  fromLine: number
) => void;

export type SaveImageCallback = (arrayBuffer: ArrayBuffer, fileName: string) => Promise<string>;

export class SelectionPopup {
  private dom: HTMLElement;
  private isInputModeActive = false;

  private capturedFilePath = '';
  private selectedText = '';
  private fromLine = 0;
  private toLine = 0;
  private fromCh = 0;
  private toCh = 0;

  private categories: string[] = [];

  private onFeedbackSubmit: FeedbackSubmitCallback;
  private onCardSubmit: CardSubmitCallback;
  private saveImage?: SaveImageCallback;

  constructor(
    onFeedbackSubmit: FeedbackSubmitCallback,
    onCardSubmit: CardSubmitCallback,
    categories: string[] = [],
    saveImage?: SaveImageCallback
  ) {
    this.onFeedbackSubmit = onFeedbackSubmit;
    this.onCardSubmit = onCardSubmit;
    this.categories = categories;
    this.saveImage = saveImage;

    this.dom = document.createElement('div');
    this.dom.className = 'inline-feedback-popup';
    this.dom.style.display = 'none';
    this.dom.style.position = 'fixed';
    this.dom.style.zIndex = '10000';
    document.body.appendChild(this.dom);

    this.buildButtonUI();
  }

  /** Update the category list (e.g. when settings change) */
  setCategories(categories: string[]) {
    this.categories = categories;
  }

  containsTarget(target: Node): boolean {
    return this.dom.contains(target);
  }

  isInInputMode(): boolean {
    return this.isInputModeActive;
  }

  show(
    rect: DOMRect,
    filePath: string,
    selectedText: string,
    fromLine: number,
    toLine: number,
    fromCh: number,
    toCh: number
  ) {
    this.capturedFilePath = filePath;
    this.selectedText = selectedText;
    this.fromLine = fromLine;
    this.toLine = toLine;
    this.fromCh = fromCh;
    this.toCh = toCh;

    if (this.isInputModeActive) {
      this.isInputModeActive = false;
      this.buildButtonUI();
    }

    this.dom.style.display = 'block';

    const popupHeight = this.dom.offsetHeight || 40;
    let top = rect.top - popupHeight - 8;
    let left = rect.left + (rect.width / 2) - 120;

    if (top < 5) top = rect.bottom + 8;
    if (left < 5) left = 5;
    if (left + 280 > window.innerWidth) left = window.innerWidth - 290;

    this.dom.style.top = `${top}px`;
    this.dom.style.left = `${left}px`;
  }

  hide() {
    if (this.isInputModeActive) return;
    this.dom.style.display = 'none';
  }

  forceHide() {
    this.isInputModeActive = false;
    this.dom.style.display = 'none';
    this.buildButtonUI();
  }

  destroy() {
    this.dom.remove();
  }

  // ---- Private methods ----

  private buildButtonUI() {
    this.dom.innerHTML = '';

    const btnRow = document.createElement('div');
    btnRow.className = 'inline-feedback-popup-btn-row';

    const feedbackBtn = document.createElement('button');
    feedbackBtn.className = 'inline-feedback-popup-btn';
    feedbackBtn.innerHTML = '&#x1F4AC; Add feedback';
    feedbackBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showFeedbackUI();
    });
    btnRow.appendChild(feedbackBtn);

    const cardBtn = document.createElement('button');
    cardBtn.className = 'inline-feedback-popup-btn inline-feedback-popup-btn-card';
    cardBtn.innerHTML = '&#x1F4CC; Save card';
    cardBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showCardUI();
    });
    btnRow.appendChild(cardBtn);

    this.dom.appendChild(btnRow);
  }

  private stopEventPropagation(el: HTMLElement) {
    const events = ['keydown', 'keyup', 'keypress', 'input', 'paste',
                    'compositionstart', 'compositionupdate', 'compositionend'];
    for (const evt of events) {
      el.addEventListener(evt, (e) => { e.stopPropagation(); });
    }
  }

  private repositionIfNeeded() {
    requestAnimationFrame(() => {
      const popupRect = this.dom.getBoundingClientRect();
      if (popupRect.bottom > window.innerHeight) {
        this.dom.style.top = `${window.innerHeight - popupRect.height - 10}px`;
      }
      if (popupRect.right > window.innerWidth) {
        this.dom.style.left = `${window.innerWidth - popupRect.width - 10}px`;
      }
    });
  }

  private createDragHandle(container: HTMLElement): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'inline-feedback-drag-handle';
    handle.title = 'Drag to move';
    container.insertBefore(handle, container.firstChild);

    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    const onMouseMove = (e: MouseEvent) => {
      this.dom.style.left = `${startLeft + e.clientX - startX}px`;
      this.dom.style.top = `${startTop + e.clientY - startY}px`;
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.dom.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    return handle;
  }

  // ---- Feedback Form ----

  private showFeedbackUI() {
    this.isInputModeActive = true;
    this.dom.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'inline-feedback-input-container';
    this.createDragHandle(container);

    const preview = document.createElement('div');
    preview.className = 'inline-feedback-preview';
    const previewText = this.selectedText.length > 100
      ? this.selectedText.substring(0, 100) + '...'
      : this.selectedText;
    preview.textContent = `"${previewText}"`;
    container.appendChild(preview);

    const textarea = document.createElement('textarea');
    textarea.className = 'inline-feedback-textarea';
    textarea.placeholder = 'Write feedback...';
    textarea.rows = 3;
    container.appendChild(textarea);

    const btnRow = document.createElement('div');
    btnRow.className = 'inline-feedback-btn-row';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'inline-feedback-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.forceHide();
    });
    btnRow.appendChild(cancelBtn);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'inline-feedback-submit-btn';
    submitBtn.textContent = 'Save (Ctrl+Enter)';
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleFeedbackSubmit(textarea.value);
    });
    btnRow.appendChild(submitBtn);

    container.appendChild(btnRow);
    this.dom.appendChild(container);

    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.handleFeedbackSubmit(textarea.value);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.forceHide();
      }
    });
    textarea.addEventListener('paste', (e) => {
      if (!this.saveImage) return;
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
            const savedPath = await this.saveImage!(buf, fileName);
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
    this.stopEventPropagation(textarea);
    this.repositionIfNeeded();
    textarea.focus();
  }

  private handleFeedbackSubmit(feedback: string) {
    const trimmed = feedback.trim();
    if (!trimmed) return;

    this.onFeedbackSubmit(
      this.capturedFilePath,
      this.selectedText,
      trimmed,
      this.fromLine,
      this.toLine,
      this.fromCh,
      this.toCh
    );

    this.forceHide();
  }

  // ---- Concept Card Form ----

  private showCardUI() {
    this.isInputModeActive = true;
    this.dom.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'inline-feedback-input-container concept-card-form';
    this.createDragHandle(container);

    // Selected text preview
    const preview = document.createElement('div');
    preview.className = 'inline-feedback-preview';
    const previewText = this.selectedText.length > 100
      ? this.selectedText.substring(0, 100) + '...'
      : this.selectedText;
    preview.textContent = `"${previewText}"`;
    container.appendChild(preview);

    // Title input
    const titleLabel = document.createElement('label');
    titleLabel.className = 'concept-card-label';
    titleLabel.textContent = 'Title';
    container.appendChild(titleLabel);

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'concept-card-input';
    titleInput.placeholder = 'Card title';
    titleInput.value = this.selectedText.substring(0, 20).replace(/\n/g, ' ').trim();
    container.appendChild(titleInput);

    // Keywords — interactive tag UI
    const kwLabel = document.createElement('label');
    kwLabel.className = 'concept-card-label';
    kwLabel.textContent = 'Keywords (click x to remove, double-click to edit, Enter to add)';
    container.appendChild(kwLabel);

    const currentKeywords: string[] = [...extractKeywords(this.selectedText)];
    const kwContainer = document.createElement('div');
    kwContainer.className = 'concept-card-kw-container';
    container.appendChild(kwContainer);

    const renderKeywordTags = () => {
      kwContainer.innerHTML = '';
      for (let i = 0; i < currentKeywords.length; i++) {
        const tag = document.createElement('span');
        tag.className = 'concept-card-kw-tag';
        tag.textContent = currentKeywords[i];

        const delBtn = document.createElement('span');
        delBtn.className = 'concept-card-kw-tag-del';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          currentKeywords.splice(i, 1);
          renderKeywordTags();
        });
        tag.appendChild(delBtn);

        tag.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const editInput = document.createElement('input');
          editInput.type = 'text';
          editInput.className = 'concept-card-kw-tag-edit';
          editInput.value = currentKeywords[i];
          tag.replaceWith(editInput);
          this.stopEventPropagation(editInput);
          editInput.focus();
          editInput.select();
          const commitEdit = () => {
            const val = editInput.value.trim();
            if (val) {
              currentKeywords[i] = val;
            } else {
              currentKeywords.splice(i, 1);
            }
            renderKeywordTags();
          };
          editInput.addEventListener('blur', commitEdit);
          editInput.addEventListener('keydown', (ke) => {
            ke.stopPropagation();
            if (ke.key === 'Enter') { ke.preventDefault(); commitEdit(); }
            if (ke.key === 'Escape') { ke.preventDefault(); renderKeywordTags(); }
          });
        });

        kwContainer.appendChild(tag);
      }

      // Add-new input at the end
      const addInput = document.createElement('input');
      addInput.type = 'text';
      addInput.className = 'concept-card-kw-add-input';
      addInput.placeholder = '+ Add keyword';
      this.stopEventPropagation(addInput);
      addInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = addInput.value.trim();
          if (val) {
            currentKeywords.push(val);
            renderKeywordTags();
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.forceHide();
        }
      });
      kwContainer.appendChild(addInput);
    };

    renderKeywordTags();

    // Category tag buttons (multi-select)
    const selectedCategories: string[] = [];
    if (this.categories.length > 0) {
      const catLabel = document.createElement('label');
      catLabel.className = 'concept-card-label';
      catLabel.textContent = 'Categories (multi-select)';
      container.appendChild(catLabel);

      const catRow = document.createElement('div');
      catRow.className = 'concept-card-category-row';

      for (const cat of this.categories) {
        const btn = document.createElement('button');
        btn.className = 'concept-card-category-btn';
        btn.textContent = cat;
        btn.type = 'button';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = selectedCategories.indexOf(cat);
          if (idx >= 0) {
            selectedCategories.splice(idx, 1);
            btn.classList.remove('selected');
          } else {
            selectedCategories.push(cat);
            btn.classList.add('selected');
          }
        });
        catRow.appendChild(btn);
      }

      container.appendChild(catRow);
    }

    // Notes textarea
    const notesLabel = document.createElement('label');
    notesLabel.className = 'concept-card-label';
    notesLabel.textContent = 'Notes (optional)';
    container.appendChild(notesLabel);

    const notesTextarea = document.createElement('textarea');
    notesTextarea.className = 'inline-feedback-textarea concept-card-notes';
    notesTextarea.placeholder = 'Add notes...';
    notesTextarea.rows = 2;
    container.appendChild(notesTextarea);

    // Button row
    const btnRow = document.createElement('div');
    btnRow.className = 'inline-feedback-btn-row';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'inline-feedback-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.forceHide();
    });
    btnRow.appendChild(cancelBtn);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'inline-feedback-submit-btn concept-card-submit-btn';
    submitBtn.textContent = 'Save card (Ctrl+Enter)';
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleCardSubmit(titleInput.value, currentKeywords, selectedCategories, notesTextarea.value);
    });
    btnRow.appendChild(submitBtn);

    container.appendChild(btnRow);
    this.dom.appendChild(container);

    // Keyboard shortcuts for title and notes inputs
    const formInputs = [titleInput, notesTextarea];
    for (const el of formInputs) {
      el.addEventListener('keydown', (e: KeyboardEvent) => {
        e.stopPropagation();
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          this.handleCardSubmit(titleInput.value, currentKeywords, selectedCategories, notesTextarea.value);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.forceHide();
        }
      });
      this.stopEventPropagation(el as HTMLElement);
    }

    this.repositionIfNeeded();
    titleInput.focus();
    titleInput.select();
  }

  private handleCardSubmit(title: string, keywords: string[], categories: string[], notes: string) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    this.onCardSubmit(
      this.capturedFilePath,
      this.selectedText,
      trimmedTitle,
      [...keywords],
      [...categories],
      notes.trim(),
      this.fromLine
    );

    this.forceHide();
  }
}
