import { Plugin, MarkdownView, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { AnnotationStore, Annotation } from './src/annotation-store';
import { SelectionPopup } from './src/selection-popup';
import { createDecorationExtension, refreshEffect } from './src/decorations';
import { FeedbackSidebarView, VIEW_TYPE_FEEDBACK } from './src/sidebar-view';
import { ConceptCardStore, ConceptCard } from './src/concept-card-store';
import { ConceptCardSidebarView, VIEW_TYPE_CONCEPT_CARDS } from './src/concept-card-sidebar';
import { appendFeedbackToReviewLog, exportFeedback } from './src/export';
import { InlineFeedbackSettings, DEFAULT_SETTINGS, InlineFeedbackSettingTab } from './src/settings';

export default class InlineFeedbackPlugin extends Plugin {
  settings!: InlineFeedbackSettings;
  annotationStore!: AnnotationStore;
  conceptCardStore!: ConceptCardStore;
  popup!: SelectionPopup;
  activeFilePath = '';
  activeAnnotations: Annotation[] = [];
  // Per-file annotation cache: prevents file-open from erasing other files' decorations
  private annotationsByFile = new Map<string, Annotation[]>();

  async onload() {
    await this.loadSettings();

    this.annotationStore = new AnnotationStore(this.app);
    this.conceptCardStore = new ConceptCardStore(this.app, this.settings.conceptCardPath);

    // ---- Selection Popup (feedback + knowledge card) ----
    this.popup = new SelectionPopup(
      // Feedback submit callback
      async (filePath, selectedText, feedback, fromLine, toLine, fromCh, toCh) => {
        const targetFilePath = filePath || this.activeFilePath;
        if (!targetFilePath) return;

        const annotation: Annotation = {
          id: this.annotationStore.generateId(),
          originalText: selectedText,
          feedback,
          lineStart: fromLine,
          lineEnd: toLine,
          charStart: fromCh,
          charEnd: toCh,
          timestamp: new Date().toISOString(),
        };

        await this.annotationStore.addAnnotation(targetFilePath, annotation);

        const updatedAnns = await this.annotationStore.getAnnotations(targetFilePath);
        this.annotationsByFile.set(targetFilePath, updatedAnns);
        this.activeFilePath = targetFilePath;
        this.activeAnnotations = updatedAnns;

        this.refreshDecorations();
        this.refreshFeedbackSidebar();
        new Notice('Feedback added');
      },
      // Knowledge card submit callback (categories is string[])
      async (filePath, selectedText, title, keywords, categories, notes, fromLine) => {
        const targetFilePath = filePath || this.activeFilePath;
        if (!targetFilePath) return;

        const card: ConceptCard = {
          id: this.conceptCardStore.generateId(),
          title,
          keywords,
          category: categories,
          folderByCategory: {},
          content: selectedText,
          source: targetFilePath,
          sourceLine: fromLine,
          notes,
          createdAt: new Date().toISOString(),
        };

        await this.conceptCardStore.addCard(card);
        this.refreshCardSidebar();
        new Notice('Knowledge card saved');
      },
      this.settings.cardCategories || [],
      async (arrayBuffer: ArrayBuffer, fileName: string): Promise<string> => {
        const dir = 'attachments/feedback-images';
        if (!(await this.app.vault.adapter.exists(dir))) {
          await this.app.vault.adapter.mkdir(dir);
        }
        const path = `${dir}/${fileName}`;
        await this.app.vault.adapter.writeBinary(path, arrayBuffer);
        return path;
      }
    );

    // ---- CodeMirror 6 decorations + hover tooltip ----
    this.registerEditorExtension(
      createDecorationExtension({
        getAnnotations: () => {
          const all: Annotation[] = [];
          for (const anns of this.annotationsByFile.values()) {
            all.push(...anns);
          }
          return all;
        },
        onDelete: async (annotationId: string) => {
          let targetFile = '';
          for (const [fp, anns] of this.annotationsByFile.entries()) {
            if (anns.some(a => a.id === annotationId)) { targetFile = fp; break; }
          }
          if (!targetFile) return;
          await this.annotationStore.removeAnnotation(targetFile, annotationId);
          const updatedAnns = await this.annotationStore.getAnnotations(targetFile);
          this.annotationsByFile.set(targetFile, updatedAnns);
          if (targetFile === this.activeFilePath) this.activeAnnotations = updatedAnns;
          this.refreshDecorations();
          this.refreshFeedbackSidebar();
          new Notice('Annotation deleted');
        },
        onEdit: async (annotationId: string, newFeedback: string) => {
          let targetFile = '';
          for (const [fp, anns] of this.annotationsByFile.entries()) {
            if (anns.some(a => a.id === annotationId)) { targetFile = fp; break; }
          }
          if (!targetFile) return;
          await this.annotationStore.updateAnnotation(targetFile, annotationId, newFeedback);
          const updatedAnns = await this.annotationStore.getAnnotations(targetFile);
          this.annotationsByFile.set(targetFile, updatedAnns);
          if (targetFile === this.activeFilePath) this.activeAnnotations = updatedAnns;
          this.refreshDecorations();
          this.refreshFeedbackSidebar();
          new Notice('Feedback updated');
        },
        getResourcePath: (path: string) => {
          return this.app.vault.adapter.getResourcePath(path);
        },
        saveImage: async (arrayBuffer: ArrayBuffer, fileName: string): Promise<string> => {
          const dir = 'attachments/feedback-images';
          if (!(await this.app.vault.adapter.exists(dir))) {
            await this.app.vault.adapter.mkdir(dir);
          }
          const path = `${dir}/${fileName}`;
          await this.app.vault.adapter.writeBinary(path, arrayBuffer);
          return path;
        },
      })
    );

    // ---- Mouse event: detect text selection ----
    this.registerDomEvent(document, 'mouseup', (e: MouseEvent) => {
      if (this.popup.containsTarget(e.target as Node)) return;
      if (this.popup.isInInputMode()) return;

      setTimeout(() => {
        this.handleSelectionChange();
      }, 50);
    });

    // ---- Mouse event: hide popup on click outside ----
    this.registerDomEvent(document, 'mousedown', (e: MouseEvent) => {
      if (!this.popup.containsTarget(e.target as Node)) {
        this.popup.hide();
      }
    });

    // ---- Register sidebar views ----
    this.registerView(
      VIEW_TYPE_FEEDBACK,
      (leaf: WorkspaceLeaf) =>
        new FeedbackSidebarView(leaf, {
          getAnnotations: () => this.activeAnnotations,
          getFilePath: () => this.activeFilePath,
          deleteAnnotation: async (id: string) => {
            let targetFile = '';
            for (const [fp, anns] of this.annotationsByFile.entries()) {
              if (anns.some(a => a.id === id)) { targetFile = fp; break; }
            }
            if (!targetFile) targetFile = this.activeFilePath;
            if (!targetFile) return;
            await this.annotationStore.removeAnnotation(targetFile, id);
            const updatedAnns = await this.annotationStore.getAnnotations(targetFile);
            this.annotationsByFile.set(targetFile, updatedAnns);
            if (targetFile === this.activeFilePath) this.activeAnnotations = updatedAnns;
            this.refreshDecorations();
            this.refreshFeedbackSidebar();
            new Notice('Annotation deleted');
          },
          navigateToAnnotation: (ann: Annotation) => {
            this.navigateToAnnotation(ann);
          },
        })
    );

    this.registerView(
      VIEW_TYPE_CONCEPT_CARDS,
      (leaf: WorkspaceLeaf) =>
        new ConceptCardSidebarView(leaf, {
          getCards: () => this.conceptCardStore.getCards(),
          searchCards: (q: string) => this.conceptCardStore.searchCards(q),
          deleteCard: async (id: string) => {
            await this.conceptCardStore.removeCard(id);
            this.refreshCardSidebar();
            new Notice('Knowledge card deleted');
          },
          updateCard: async (id: string, updates) => {
            await this.conceptCardStore.updateCard(id, updates);
            this.refreshCardSidebar();
            new Notice('Knowledge card updated');
          },
          openSourceFile: (source: string, line: number) => {
            this.openFileAtLine(source, line);
          },
          getCategories: () => this.settings.cardCategories || [],
          addCategory: (name: string) => {
            if (!this.settings.cardCategories) this.settings.cardCategories = [];
            if (!this.settings.cardCategories.includes(name)) {
              this.settings.cardCategories.push(name);
              this.saveSettings();
              this.popup.setCategories(this.settings.cardCategories);
            }
          },
          renameCategory: (oldName: string, newName: string) => {
            if (!this.settings.cardCategories) return;
            const idx = this.settings.cardCategories.indexOf(oldName);
            if (idx >= 0) {
              this.settings.cardCategories[idx] = newName;
              this.saveSettings();
              this.popup.setCategories(this.settings.cardCategories);
            }
          },
          removeCategory: (name: string) => {
            if (!this.settings.cardCategories) return;
            this.settings.cardCategories = this.settings.cardCategories.filter(c => c !== name);
            this.saveSettings();
            this.popup.setCategories(this.settings.cardCategories);
          },
          getFolders: (category: string) => this.conceptCardStore.getFolders(category),
          createFolder: async (category: string, path: string) => {
            await this.conceptCardStore.createFolder(category, path);
            this.refreshCardSidebar();
          },
          renameFolder: async (category: string, oldPath: string, newPath: string) => {
            await this.conceptCardStore.renameFolder(category, oldPath, newPath);
            this.refreshCardSidebar();
          },
          deleteFolder: async (category: string, path: string) => {
            await this.conceptCardStore.deleteFolder(category, path);
            this.refreshCardSidebar();
          },
          moveCardToFolder: async (cardId: string, category: string, folderPath: string) => {
            await this.conceptCardStore.moveCardToFolder(cardId, category, folderPath);
            this.refreshCardSidebar();
          },
        })
    );

    // ---- Commands ----
    this.addCommand({
      id: 'export-feedback',
      name: 'Export feedback for current note',
      callback: () => exportFeedback(this.app, this.annotationStore, this.activeFilePath),
    });

    this.addCommand({
      id: 'archive-feedback',
      name: 'Append feedback to review log',
      callback: () => appendFeedbackToReviewLog(this.app, this.annotationStore, this.activeFilePath),
    });

    this.addCommand({
      id: 'toggle-feedback-sidebar',
      name: 'Toggle feedback panel',
      callback: () => this.toggleSidebar(VIEW_TYPE_FEEDBACK),
    });

    this.addCommand({
      id: 'toggle-concept-card-sidebar',
      name: 'Toggle knowledge cards panel',
      callback: () => this.toggleSidebar(VIEW_TYPE_CONCEPT_CARDS),
    });

    this.addCommand({
      id: 'clear-all-feedback',
      name: 'Clear all feedback for current note',
      callback: async () => {
        if (!this.activeFilePath) {
          new Notice('Open a Markdown note first');
          return;
        }
        await this.annotationStore.clearAnnotations(this.activeFilePath);
        this.annotationsByFile.set(this.activeFilePath, []);
        this.activeAnnotations = [];
        this.refreshDecorations();
        this.refreshFeedbackSidebar();
        new Notice('All feedback cleared');
      },
    });

    // ---- Ribbon icons ----
    this.addRibbonIcon('message-square', 'Inline Feedback panel', () => {
      this.toggleSidebar(VIEW_TYPE_FEEDBACK);
    });

    this.addRibbonIcon('library', 'Knowledge cards', () => {
      this.toggleSidebar(VIEW_TYPE_CONCEPT_CARDS);
    });

    // ---- Settings tab ----
    this.addSettingTab(new InlineFeedbackSettingTab(this.app, this));

    // ---- Handle file switch ----
    this.registerEvent(
      this.app.workspace.on('file-open', async (file: TFile | null) => {
        if (file && file.extension === 'md') {
          this.activeFilePath = file.path;
          this.annotationStore.clearCache(file.path);
          const fileAnns = await this.annotationStore.getAnnotations(file.path);
          this.annotationsByFile.set(file.path, fileAnns);
          this.activeAnnotations = fileAnns;
          this.refreshDecorations();
          this.refreshFeedbackSidebar();
        }
      })
    );

    // ---- Handle editor context menu ----
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        const selection = editor.getSelection();
        if (selection && selection.trim().length > 0) {
          menu.addItem((item) => {
            item.setTitle('Add inline feedback')
              .setIcon('message-square')
              .onClick(() => {
                const from = editor.getCursor('from');
                const to = editor.getCursor('to');
                const domSel = window.getSelection();
                const currentFile = this.app.workspace.getActiveFile();
                if (domSel && domSel.rangeCount > 0 && currentFile) {
                  const rect = domSel.getRangeAt(0).getBoundingClientRect();
                  this.popup.show(
                    rect,
                    currentFile.path,
                    selection,
                    from.line + 1,
                    to.line + 1,
                    from.ch,
                    to.ch
                  );
                }
              });
          });
          menu.addItem((item) => {
            item.setTitle('Save as knowledge card')
              .setIcon('bookmark')
              .onClick(() => {
                const from = editor.getCursor('from');
                const to = editor.getCursor('to');
                const domSel = window.getSelection();
                const currentFile = this.app.workspace.getActiveFile();
                if (domSel && domSel.rangeCount > 0 && currentFile) {
                  const rect = domSel.getRangeAt(0).getBoundingClientRect();
                  this.popup.show(
                    rect,
                    currentFile.path,
                    selection,
                    from.line + 1,
                    to.line + 1,
                    from.ch,
                    to.ch
                  );
                }
              });
          });
        }
      })
    );

    // ---- Load annotations for the currently active file ----
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && activeFile.extension === 'md') {
      this.activeFilePath = activeFile.path;
      this.activeAnnotations = await this.annotationStore.getAnnotations(activeFile.path);
      this.annotationsByFile.set(activeFile.path, this.activeAnnotations);
    }
  }

  onunload() {
    this.popup.destroy();
  }

  // ---- Private helpers ----

  private handleSelectionChange() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || !activeView.file) {
      this.popup.hide();
      return;
    }

    if (activeView.file.path !== this.activeFilePath) {
      this.activeFilePath = activeView.file.path;
    }

    const editor = activeView.editor;
    const selection = editor.getSelection();

    if (selection && selection.trim().length > 0) {
      const from = editor.getCursor('from');
      const to = editor.getCursor('to');

      const domSel = window.getSelection();
      if (domSel && domSel.rangeCount > 0) {
        const rect = domSel.getRangeAt(0).getBoundingClientRect();
        this.popup.show(
          rect,
          activeView.file.path,
          selection,
          from.line + 1,
          to.line + 1,
          from.ch,
          to.ch
        );
      }
    } else {
      this.popup.hide();
    }
  }

  refreshDecorations() {
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    leaves.forEach((leaf) => {
      const view = leaf.view as MarkdownView;
      try {
        const cm = (view.editor as any).cm as EditorView;
        if (cm) {
          cm.dispatch({ effects: refreshEffect.of(null) });
        }
      } catch {
        // Ignore
      }
    });
  }

  refreshFeedbackSidebar() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FEEDBACK);
    leaves.forEach((leaf) => {
      const view = leaf.view as FeedbackSidebarView;
      if (view && view.refresh) {
        view.refresh();
      }
    });
  }

  refreshCardSidebar() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CONCEPT_CARDS);
    leaves.forEach((leaf) => {
      const view = leaf.view as ConceptCardSidebarView;
      if (view && view.refresh) {
        view.refresh();
      }
    });
  }

  private navigateToAnnotation(ann: Annotation) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;

    const editor = activeView.editor;
    const line = ann.lineStart - 1;
    const ch = ann.charStart;

    editor.setCursor({ line, ch });
    editor.scrollIntoView(
      {
        from: { line, ch },
        to: { line: ann.lineEnd - 1, ch: ann.charEnd },
      },
      true
    );
  }

  /** Open a file at a specific line number */
  private async openFileAtLine(filePath: string, line: number) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file && file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf();
      await leaf.openFile(file);
      // Wait a tick for the editor to be ready
      setTimeout(() => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          const editor = view.editor;
          const targetLine = Math.max(0, line - 1);
          editor.setCursor({ line: targetLine, ch: 0 });
          editor.scrollIntoView(
            { from: { line: targetLine, ch: 0 }, to: { line: targetLine, ch: 0 } },
            true
          );
        }
      }, 100);
    } else {
      new Notice(`File not found: ${filePath}`);
    }
  }

  private async toggleSidebar(viewType: string) {
    const existing = this.app.workspace.getLeavesOfType(viewType);
    if (existing.length > 0) {
      existing.forEach((leaf) => leaf.detach());
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: viewType, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.conceptCardStore) {
      this.conceptCardStore.setBasePath(this.settings.conceptCardPath);
    }
    if (this.popup) {
      this.popup.setCategories(this.settings.cardCategories || []);
    }
  }
}
