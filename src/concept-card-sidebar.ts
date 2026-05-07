/**
 * ConceptCardSidebarView - Sidebar panel for concept cards.
 * Categories own their own folder namespaces. Drag-and-drop to move cards.
 */
import { ItemView, WorkspaceLeaf, Notice, Menu } from 'obsidian';
import type { ConceptCard } from './concept-card-store';

export const VIEW_TYPE_CONCEPT_CARDS = 'concept-card-sidebar';

export interface CardSidebarContext {
  getCards(): Promise<ConceptCard[]>;
  searchCards(query: string): Promise<ConceptCard[]>;
  deleteCard(id: string): Promise<void>;
  updateCard(id: string, updates: Partial<Omit<ConceptCard, 'id'>>): Promise<void>;
  openSourceFile(source: string, line: number): void;
  getCategories(): string[];
  addCategory(name: string): void;
  renameCategory(oldName: string, newName: string): void;
  removeCategory(name: string): void;
  getFolders(category: string): Promise<string[]>;
  createFolder(category: string, path: string): Promise<void>;
  renameFolder(category: string, oldPath: string, newPath: string): Promise<void>;
  deleteFolder(category: string, path: string): Promise<void>;
  moveCardToFolder(cardId: string, category: string, folderPath: string): Promise<void>;
}

interface FolderNode {
  name: string;
  fullPath: string;
  children: Map<string, FolderNode>;
}

export class ConceptCardSidebarView extends ItemView {
  private context: CardSidebarContext;
  private searchQuery = '';
  private filterCategory = '';
  private collapsedGroups = new Set<string>();
  private collapsedFolders = new Set<string>();

  constructor(leaf: WorkspaceLeaf, context: CardSidebarContext) {
    super(leaf);
    this.context = context;
  }

  getViewType(): string { return VIEW_TYPE_CONCEPT_CARDS; }
  getDisplayText(): string { return 'Knowledge Cards'; }
  getIcon(): string { return 'library'; }

  async onOpen() { await this.refresh(); }
  async onClose() { this.contentEl.empty(); }

  async refresh() {
    const container = this.contentEl;
    container.empty();
    container.addClass('concept-card-sidebar');

    let cards = this.searchQuery
      ? await this.context.searchCards(this.searchQuery)
      : await this.context.getCards();

    if (this.filterCategory) {
      cards = cards.filter(c => {
        const cats = Array.isArray(c.category) ? c.category : [];
        return cats.includes(this.filterCategory);
      });
    }

    const header = container.createEl('div', { cls: 'concept-card-sidebar-header' });
    const titleRow = header.createEl('div', { cls: 'concept-card-sidebar-title-row' });
    titleRow.createEl('h4', { text: 'Knowledge Cards' });
    const closeBtn = titleRow.createEl('span', { cls: 'concept-card-sidebar-close', text: '×', attr: { title: 'Close' } });
    closeBtn.addEventListener('click', () => this.leaf.detach());
    header.createEl('div', { cls: 'concept-card-sidebar-count', text: `${cards.length} card${cards.length === 1 ? '' : 's'}` });

    this.renderSearch(container);
    this.renderCategoryBar(container);

    if (cards.length === 0 && !this.filterCategory && !this.searchQuery) {
      const empty = container.createEl('div', { cls: 'concept-card-sidebar-empty' });
      empty.createEl('div', { text: 'No knowledge cards yet' });
      empty.createEl('div', { cls: 'concept-card-sidebar-hint', text: 'Select text and click "Save card" to collect reusable excerpts.' });
      return;
    }

    const list = container.createEl('div', { cls: 'concept-card-sidebar-list' });

    if (this.searchQuery) {
      // Plain flat list for search results
      if (cards.length === 0) {
        list.createEl('div', { cls: 'concept-card-sidebar-empty' }).createEl('div', { text: 'No matching cards found' });
      } else {
        for (const card of cards) this.renderCard(list, card);
      }
    } else if (this.filterCategory) {
      // Single category: show folder tree within it
      await this.renderCategoryWithFolders(list, this.filterCategory, cards);
    } else {
      // Default: each category as a collapsible group with sub-folders inside
      await this.renderAllGrouped(list, cards);
    }
  }

  // ---- Search ----

  private renderSearch(container: HTMLElement) {
    const sc = container.createEl('div', { cls: 'concept-card-search-container' });
    const searchInput = sc.createEl('input', {
      cls: 'concept-card-search-input',
      attr: { type: 'text', placeholder: 'Search title, keywords, or content...', value: this.searchQuery },
    });
    searchInput.addEventListener('input', async () => {
      this.searchQuery = searchInput.value;
      await this.refresh();
      const ni = container.querySelector('.concept-card-search-input') as HTMLInputElement;
      if (ni) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); }
    });
    for (const evt of ['keydown', 'keyup', 'keypress', 'input', 'paste', 'compositionstart', 'compositionupdate', 'compositionend'] as const) {
      searchInput.addEventListener(evt, (e) => e.stopPropagation());
    }
  }

  // ---- Category Bar ----

  private renderCategoryBar(container: HTMLElement) {
    const categories = this.context.getCategories();
    const catRow = container.createEl('div', { cls: 'concept-card-sidebar-cat-filter' });

    const allBtn = catRow.createEl('button', {
      cls: `concept-card-sidebar-cat-btn ${!this.filterCategory ? 'selected' : ''}`,
      text: 'All',
    });
    allBtn.addEventListener('click', async () => { this.filterCategory = ''; await this.refresh(); });

    for (const cat of categories) {
      const btn = catRow.createEl('button', {
        cls: `concept-card-sidebar-cat-btn ${this.filterCategory === cat ? 'selected' : ''}`,
        text: cat,
      });
      btn.addEventListener('click', async () => {
        this.filterCategory = this.filterCategory === cat ? '' : cat;
        await this.refresh();
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        const menu = new Menu();
        menu.addItem(i => i.setTitle('Rename').setIcon('pencil').onClick(() => this.promptRenameCategory(cat)));
        menu.addItem(i => i.setTitle('Delete category').setIcon('trash').onClick(() => {
          this.context.removeCategory(cat);
          if (this.filterCategory === cat) this.filterCategory = '';
          this.refresh();
        }));
        menu.showAtMouseEvent(e);
      });
    }

    const addBtn = catRow.createEl('button', {
      cls: 'concept-card-sidebar-cat-btn concept-card-sidebar-cat-add',
      text: '+', attr: { title: 'Add category' },
    });
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); this.promptAddCategory(catRow, addBtn); });
  }

  private promptAddCategory(catRow: HTMLElement, addBtn: HTMLElement) {
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'concept-card-sidebar-cat-input'; input.placeholder = 'New category...';
    addBtn.replaceWith(input);
    this.stopAllPropagation(input);
    input.focus();
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const val = input.value.trim();
      if (val) { this.context.addCategory(val); new Notice(`Category added: ${val}`); }
      this.refresh();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); done = true; this.refresh(); }
    });
  }

  private promptRenameCategory(oldName: string) {
    document.querySelectorAll('.concept-card-folder-create-popup').forEach(el => el.remove());
    const popup = document.createElement('div');
    popup.className = 'concept-card-folder-create-popup';
    const labelEl = document.createElement('div');
    labelEl.className = 'concept-card-folder-create-label';
    labelEl.textContent = `Rename category "${oldName}"`;
    popup.appendChild(labelEl);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'concept-card-folder-input';
    input.value = oldName;
    popup.appendChild(input);
    const btnRow = document.createElement('div');
    btnRow.className = 'concept-card-folder-create-btns';
    const okBtn = document.createElement('button');
    okBtn.className = 'concept-card-cat-popup-confirm';
    okBtn.textContent = 'Confirm';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'concept-card-move-popup-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.marginTop = '4px';
    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);
    popup.appendChild(btnRow);
    document.body.appendChild(popup);
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.zIndex = '10000';
    this.stopAllPropagation(input);
    input.focus();
    input.select();
    const doRename = () => {
      const val = input.value.trim();
      popup.remove();
      if (val && val !== oldName) {
        this.context.renameCategory(oldName, val);
        if (this.filterCategory === oldName) this.filterCategory = val;
        this.refresh();
        new Notice(`Category renamed: ${oldName} -> ${val}`);
      }
    };
    okBtn.addEventListener('click', (e) => { e.stopPropagation(); doRename(); });
    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); popup.remove(); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); doRename(); }
      if (e.key === 'Escape') { e.preventDefault(); popup.remove(); }
    });
    const closeHandler = (ev: MouseEvent) => {
      if (!popup.contains(ev.target as Node)) { popup.remove(); document.removeEventListener('mousedown', closeHandler); }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  // ---- Default "All" View: categories as groups, each with sub-folders ----

  private async renderAllGrouped(list: HTMLElement, cards: ConceptCard[]) {
    const groups = new Map<string, ConceptCard[]>();
    const uncategorized: ConceptCard[] = [];

    for (const card of cards) {
      const cats = Array.isArray(card.category) ? card.category : [];
      if (cats.length === 0) { uncategorized.push(card); }
      else { for (const cat of cats) { if (!groups.has(cat)) groups.set(cat, []); groups.get(cat)!.push(card); } }
    }

    const allCategories = this.context.getCategories();
    for (const cat of allCategories) {
      const groupCards = groups.get(cat) || [];
      if (groupCards.length === 0) continue;
      await this.renderCategoryGroup(list, cat, groupCards);
    }
    for (const [cat, groupCards] of groups) {
      if (allCategories.includes(cat)) continue;
      await this.renderCategoryGroup(list, cat, groupCards);
    }
    if (uncategorized.length > 0) {
      this.renderSimpleGroup(list, 'Uncategorized', uncategorized);
    }
  }

  private async renderCategoryGroup(list: HTMLElement, catName: string, cards: ConceptCard[]) {
    const collapsed = this.collapsedGroups.has(catName);
    const groupEl = list.createEl('div', { cls: 'concept-card-group' });
    const header = groupEl.createEl('div', { cls: 'concept-card-group-header' });
    header.createEl('span', { cls: 'concept-card-group-arrow', text: collapsed ? '▶' : '▼' });
    header.createEl('span', { cls: 'concept-card-group-name', text: catName });
    header.createEl('span', { cls: 'concept-card-group-count', text: `${cards.length}` });

    // [+] create folder button on category header
    const addFolderBtn = header.createEl('span', {
      cls: 'concept-card-folder-action concept-card-group-add-folder',
      text: '+', attr: { title: 'New folder' },
    });
    addFolderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.promptCreateFolderInline(catName, '');
    });

    header.addEventListener('click', () => {
      if (this.collapsedGroups.has(catName)) this.collapsedGroups.delete(catName);
      else this.collapsedGroups.add(catName);
      this.refresh();
    });

    if (!collapsed) {
      const content = groupEl.createEl('div', { cls: 'concept-card-group-content' });
      await this.renderCategoryWithFolders(content, catName, cards);
    }
  }

  // ---- Render cards within a category, organized by folder tree ----

  private async renderCategoryWithFolders(container: HTMLElement, catName: string, cards: ConceptCard[]) {
    const folders = await this.context.getFolders(catName);

    // Build folder tree
    const root: FolderNode = { name: '', fullPath: '', children: new Map() };
    for (const fp of folders) {
      this.insertIntoTree(root, fp);
    }
    // Add implicit folder paths from cards
    for (const card of cards) {
      const f = card.folderByCategory && card.folderByCategory[catName];
      if (f) this.insertIntoTree(root, f);
    }

    // Group cards by their folder in this category
    const cardsByFolder = new Map<string, ConceptCard[]>();
    for (const card of cards) {
      const f = (card.folderByCategory && card.folderByCategory[catName]) || '';
      if (!cardsByFolder.has(f)) cardsByFolder.set(f, []);
      cardsByFolder.get(f)!.push(card);
    }

    // Render folder nodes
    const sortedChildren = [...root.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, node] of sortedChildren) {
      this.renderFolderNode(container, node, cardsByFolder, catName, 0);
    }

    // Render unfiled cards
    const unfiledCards = cardsByFolder.get('') || [];
    if (unfiledCards.length > 0) {
      // Drop target for "unfiled"
      const unfiledZone = container.createEl('div', { cls: 'concept-card-unfiled-zone' });
      this.setupDropTarget(unfiledZone, catName, '');
      const unfiledLabel = unfiledZone.createEl('div', { cls: 'concept-card-unfiled-label', text: `Unfiled (${unfiledCards.length})` });
      for (const card of unfiledCards) {
        this.renderCard(unfiledZone, card, catName);
      }
    }

    // "New folder" button (only when viewing single category)
    if (this.filterCategory) {
      const newBtn = container.createEl('div', { cls: 'concept-card-folder-new-btn' });
      newBtn.createEl('span', { text: '+ New folder' });
      newBtn.addEventListener('click', () => {
        this.promptCreateFolderInline(catName, '');
      });
    }
  }

  private insertIntoTree(root: FolderNode, fullPath: string) {
    const parts = fullPath.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const partPath = parts.slice(0, i + 1).join('/');
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, fullPath: partPath, children: new Map() });
      }
      node = node.children.get(part)!;
    }
  }

  private renderFolderNode(
    parent: HTMLElement, node: FolderNode,
    cardsByFolder: Map<string, ConceptCard[]>,
    catName: string, depth: number
  ) {
    const folderCards = cardsByFolder.get(node.fullPath) || [];
    let totalCards = folderCards.length;
    const countAll = (n: FolderNode) => {
      for (const [, c] of n.children) { totalCards += (cardsByFolder.get(c.fullPath) || []).length; countAll(c); }
    };
    countAll(node);

    const key = `${catName}/${node.fullPath}`;
    const collapsed = this.collapsedFolders.has(key);
    const groupEl = parent.createEl('div', { cls: 'concept-card-folder-group' });

    const header = groupEl.createEl('div', { cls: 'concept-card-folder-header' });
    header.style.paddingLeft = `${16 + depth * 16}px`;

    header.createEl('span', { cls: 'concept-card-group-arrow', text: collapsed ? '▶' : '▼' });
    header.createEl('span', { cls: 'concept-card-folder-icon', text: collapsed ? '📁' : '📂' });
    header.createEl('span', { cls: 'concept-card-folder-name', text: node.name });
    header.createEl('span', { cls: 'concept-card-group-count', text: `${totalCards}` });

    const actions = header.createEl('span', { cls: 'concept-card-folder-actions' });
    const addSubBtn = actions.createEl('span', { cls: 'concept-card-folder-action', text: '+', attr: { title: 'New subfolder' } });
    addSubBtn.addEventListener('click', (e) => { e.stopPropagation(); this.promptCreateFolderInline(catName, node.fullPath); });
    const moreBtn = actions.createEl('span', { cls: 'concept-card-folder-action', text: '⋯', attr: { title: 'More actions' } });
    moreBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showFolderMenu(e, catName, node.fullPath, totalCards); });

    header.addEventListener('click', () => {
      if (this.collapsedFolders.has(key)) this.collapsedFolders.delete(key);
      else this.collapsedFolders.add(key);
      this.refresh();
    });
    header.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.showFolderMenu(e, catName, node.fullPath, totalCards); });

    // Drop target for this folder
    this.setupDropTarget(header, catName, node.fullPath);

    if (!collapsed) {
      const content = groupEl.createEl('div', { cls: 'concept-card-folder-content' });
      const sortedChildren = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [, child] of sortedChildren) {
        this.renderFolderNode(content, child, cardsByFolder, catName, depth + 1);
      }
      for (const card of folderCards) {
        const wrapper = content.createEl('div', { cls: 'concept-card-folder-card-wrapper' });
        wrapper.style.paddingLeft = `${(depth + 1) * 16}px`;
        this.renderCard(wrapper, card, catName);
      }
    }
  }

  private showFolderMenu(e: MouseEvent | Event, catName: string, folderPath: string, totalCards: number) {
    const menu = new Menu();
    menu.addItem(i => i.setTitle('New subfolder').setIcon('folder-plus').onClick(() => this.promptCreateFolderInline(catName, folderPath)));
    menu.addItem(i => i.setTitle('Rename').setIcon('pencil').onClick(() => this.promptRenameFolder(catName, folderPath)));
    menu.addItem(i => {
      i.setTitle('Delete').setIcon('trash').onClick(async () => {
        if (totalCards > 0) { new Notice('Folder is not empty. Move its cards and subfolders first.'); return; }
        await this.context.deleteFolder(catName, folderPath);
        this.refresh();
        new Notice(`Folder deleted: ${folderPath}`);
      });
    });
    if (e instanceof MouseEvent) menu.showAtMouseEvent(e);
  }

  private promptCreateFolderInline(catName: string, parentPath: string) {
    // Use a floating input instead of prompt() which doesn't work in Electron
    document.querySelectorAll('.concept-card-folder-create-popup').forEach(el => el.remove());
    const popup = document.createElement('div');
    popup.className = 'concept-card-folder-create-popup';
    const label = parentPath ? `Create folder under "${parentPath}"` : `Create folder under "${catName}"`;
    const labelEl = document.createElement('div');
    labelEl.className = 'concept-card-folder-create-label';
    labelEl.textContent = label;
    popup.appendChild(labelEl);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'concept-card-folder-input';
    input.placeholder = 'Folder name...';
    popup.appendChild(input);
    const btnRow = document.createElement('div');
    btnRow.className = 'concept-card-folder-create-btns';
    const okBtn = document.createElement('button');
    okBtn.className = 'concept-card-cat-popup-confirm';
    okBtn.textContent = 'Create';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'concept-card-move-popup-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.marginTop = '4px';
    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);
    popup.appendChild(btnRow);
    document.body.appendChild(popup);
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.zIndex = '10000';
    this.stopAllPropagation(input);
    input.focus();
    const doCreate = async () => {
      const val = input.value.trim();
      popup.remove();
      if (val) {
        const fullPath = parentPath ? `${parentPath}/${val}` : val;
        await this.context.createFolder(catName, fullPath);
        this.refresh();
        new Notice(`Folder created: ${catName} / ${fullPath}`);
      }
    };
    okBtn.addEventListener('click', (e) => { e.stopPropagation(); doCreate(); });
    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); popup.remove(); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); doCreate(); }
      if (e.key === 'Escape') { e.preventDefault(); popup.remove(); }
    });
    const closeHandler = (ev: MouseEvent) => {
      if (!popup.contains(ev.target as Node)) { popup.remove(); document.removeEventListener('mousedown', closeHandler); }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  private promptRenameFolder(catName: string, oldPath: string) {
    const currentName = oldPath.split('/').pop() || oldPath;
    document.querySelectorAll('.concept-card-folder-create-popup').forEach(el => el.remove());
    const popup = document.createElement('div');
    popup.className = 'concept-card-folder-create-popup';
    const labelEl = document.createElement('div');
    labelEl.className = 'concept-card-folder-create-label';
    labelEl.textContent = `Rename folder "${currentName}"`;
    popup.appendChild(labelEl);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'concept-card-folder-input';
    input.value = currentName;
    popup.appendChild(input);
    const btnRow = document.createElement('div');
    btnRow.className = 'concept-card-folder-create-btns';
    const okBtn = document.createElement('button');
    okBtn.className = 'concept-card-cat-popup-confirm';
    okBtn.textContent = 'Confirm';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'concept-card-move-popup-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.marginTop = '4px';
    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);
    popup.appendChild(btnRow);
    document.body.appendChild(popup);
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.zIndex = '10000';
    this.stopAllPropagation(input);
    input.focus();
    input.select();
    const doRename = async () => {
      const val = input.value.trim();
      popup.remove();
      if (val && val !== currentName) {
        const parts = oldPath.split('/');
        parts[parts.length - 1] = val;
        const newPath = parts.join('/');
        await this.context.renameFolder(catName, oldPath, newPath);
        this.refresh();
        new Notice(`Renamed: ${oldPath} -> ${newPath}`);
      }
    };
    okBtn.addEventListener('click', (e) => { e.stopPropagation(); doRename(); });
    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); popup.remove(); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); doRename(); }
      if (e.key === 'Escape') { e.preventDefault(); popup.remove(); }
    });
    const closeHandler = (ev: MouseEvent) => {
      if (!popup.contains(ev.target as Node)) { popup.remove(); document.removeEventListener('mousedown', closeHandler); }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  // ---- Simple group (no folders, for uncategorized) ----

  private renderSimpleGroup(list: HTMLElement, groupName: string, cards: ConceptCard[]) {
    const collapsed = this.collapsedGroups.has(groupName);
    const groupEl = list.createEl('div', { cls: 'concept-card-group' });
    const header = groupEl.createEl('div', { cls: 'concept-card-group-header' });
    header.createEl('span', { cls: 'concept-card-group-arrow', text: collapsed ? '▶' : '▼' });
    header.createEl('span', { cls: 'concept-card-group-name', text: groupName });
    header.createEl('span', { cls: 'concept-card-group-count', text: `${cards.length}` });
    header.addEventListener('click', () => {
      if (this.collapsedGroups.has(groupName)) this.collapsedGroups.delete(groupName);
      else this.collapsedGroups.add(groupName);
      this.refresh();
    });
    if (!collapsed) {
      const content = groupEl.createEl('div', { cls: 'concept-card-group-content' });
      for (const card of cards) this.renderCard(content, card);
    }
  }

  // ---- Card Rendering ----

  private renderCard(list: HTMLElement, card: ConceptCard, dragCategory?: string) {
    const item = list.createEl('div', { cls: 'concept-card-sidebar-item' });

    // Drag support
    if (dragCategory) {
      item.setAttribute('draggable', 'true');
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer!.setData('text/card-id', card.id);
        e.dataTransfer!.setData('text/card-category', dragCategory);
        e.dataTransfer!.effectAllowed = 'move';
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
    }

    const topRow = item.createEl('div', { cls: 'concept-card-sidebar-item-top' });
    const titleEl = topRow.createEl('span', { cls: 'concept-card-sidebar-title', text: card.title });
    titleEl.setAttribute('title', 'Double-click to edit title');
    titleEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const editInput = document.createElement('input');
      editInput.type = 'text';
      editInput.className = 'concept-card-title-edit';
      editInput.value = card.title;
      titleEl.replaceWith(editInput);
      this.stopAllPropagation(editInput);
      editInput.focus();
      editInput.select();
      let committed = false;
      const commitEdit = () => {
        if (committed) return;
        committed = true;
        const val = editInput.value.trim();
        if (val && val !== card.title) {
          this.context.updateCard(card.id, { title: val });
        } else {
          this.refresh();
        }
      };
      editInput.addEventListener('blur', commitEdit);
      editInput.addEventListener('keydown', (ke) => {
        ke.stopPropagation();
        if (ke.key === 'Enter') { ke.preventDefault(); commitEdit(); }
        if (ke.key === 'Escape') { ke.preventDefault(); this.refresh(); }
      });
    });

    const actionsRow = topRow.createEl('span', { cls: 'concept-card-sidebar-actions' });

    const copyBtn = actionsRow.createEl('span', { cls: 'concept-card-sidebar-action', text: '📋', attr: { title: 'Copy content' } });
    copyBtn.addEventListener('click', (e) => { e.stopPropagation(); this.copyCardContent(card); });

    const jumpBtn = actionsRow.createEl('span', { cls: 'concept-card-sidebar-action', text: '↗', attr: { title: 'Open source note' } });
    jumpBtn.addEventListener('click', (e) => { e.stopPropagation(); this.context.openSourceFile(card.source, card.sourceLine); });

    const deleteBtn = actionsRow.createEl('span', { cls: 'concept-card-sidebar-action concept-card-sidebar-delete', text: '×', attr: { title: 'Delete this card' } });
    deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); this.context.deleteCard(card.id); });

    // Category badges (clickable)
    const cats = Array.isArray(card.category) ? card.category : [];
    const catRow = item.createEl('div', { cls: 'concept-card-sidebar-badges' });
    if (cats.length > 0) {
      for (const cat of cats) {
        const badge = catRow.createEl('span', { cls: 'concept-card-sidebar-category-badge', text: cat });
        badge.addEventListener('click', (e) => { e.stopPropagation(); this.showCategoryEditPopup(card, badge); });
      }
    } else {
      const addCatLink = catRow.createEl('span', { cls: 'concept-card-sidebar-add-cat', text: '+ Category' });
      addCatLink.addEventListener('click', (e) => { e.stopPropagation(); this.showCategoryEditPopup(card, addCatLink); });
    }

    // Keywords (max 4)
    if (card.keywords.length > 0) {
      const kwRow = item.createEl('div', { cls: 'concept-card-sidebar-keywords' });
      const displayKws = card.keywords.slice(0, 4);
      for (let i = 0; i < displayKws.length; i++) {
        const tag = kwRow.createEl('span', { cls: 'concept-card-sidebar-keyword-tag' });
        tag.createEl('span', { text: displayKws[i], cls: 'concept-card-kw-text' });
        const delBtn = tag.createEl('span', { cls: 'concept-card-kw-tag-del', text: '×' });
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); this.context.updateCard(card.id, { keywords: card.keywords.filter((_, idx) => idx !== i) }); });
        tag.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const editInput = document.createElement('input');
          editInput.type = 'text'; editInput.className = 'concept-card-kw-tag-edit'; editInput.value = displayKws[i];
          tag.replaceWith(editInput);
          this.stopAllPropagation(editInput);
          editInput.focus(); editInput.select();
          let committed = false;
          const commitEdit = () => {
            if (committed) return; committed = true;
            const val = editInput.value.trim();
            const updated = [...card.keywords];
            if (val) { updated[i] = val; } else { updated.splice(i, 1); }
            this.context.updateCard(card.id, { keywords: updated });
          };
          editInput.addEventListener('blur', commitEdit);
          editInput.addEventListener('keydown', (ke) => { ke.stopPropagation(); if (ke.key === 'Enter') { ke.preventDefault(); commitEdit(); } if (ke.key === 'Escape') { ke.preventDefault(); this.refresh(); } });
        });
      }
      if (card.keywords.length > 4) kwRow.createEl('span', { cls: 'concept-card-sidebar-keyword-tag concept-card-kw-more', text: `+${card.keywords.length - 4}` });
    }

    // Content (scrollable)
    item.createEl('div', { cls: 'concept-card-sidebar-content', text: card.content });

    const fileName = card.source.split('/').pop() || card.source;
    item.createEl('div', { cls: 'concept-card-sidebar-source', text: `${fileName} · line ${card.sourceLine}` });

    item.addEventListener('click', () => this.copyCardContent(card));

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.showCardContextMenu(e, card, dragCategory);
    });
  }

  // ---- Drag & Drop ----

  private setupDropTarget(el: HTMLElement, category: string, folderPath: string) {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const cardId = e.dataTransfer!.getData('text/card-id');
      const dragCat = e.dataTransfer!.getData('text/card-category');
      if (cardId && dragCat === category) {
        await this.context.moveCardToFolder(cardId, category, folderPath);
        new Notice(folderPath ? `Moved to: ${folderPath}` : 'Moved out of folder');
      }
    });
  }

  // ---- Category Edit Popup ----

  private showCategoryEditPopup(card: ConceptCard, anchor: HTMLElement) {
    document.querySelectorAll('.concept-card-cat-popup').forEach(el => el.remove());

    const allCategories = this.context.getCategories();
    const currentCats = new Set(Array.isArray(card.category) ? card.category : []);

    const popup = document.createElement('div');
    popup.className = 'concept-card-cat-popup';

    const btnRow = document.createElement('div');
    btnRow.className = 'concept-card-cat-popup-btns';
    for (const cat of allCategories) {
      const btn = document.createElement('button');
      btn.className = `concept-card-category-btn ${currentCats.has(cat) ? 'selected' : ''}`;
      btn.textContent = cat;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentCats.has(cat)) { currentCats.delete(cat); btn.classList.remove('selected'); }
        else { currentCats.add(cat); btn.classList.add('selected'); }
      });
      btnRow.appendChild(btn);
    }
    popup.appendChild(btnRow);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'concept-card-cat-popup-confirm';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.context.updateCard(card.id, { category: [...currentCats] });
      popup.remove();
    });
    popup.appendChild(confirmBtn);

    document.body.appendChild(popup);
    const rect = anchor.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.bottom + 4}px`;
    popup.style.left = `${rect.left}px`;
    popup.style.zIndex = '10000';

    const closeHandler = (ev: MouseEvent) => {
      if (!popup.contains(ev.target as Node)) { popup.remove(); document.removeEventListener('mousedown', closeHandler); }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  // ---- Card Context Menu ----

  private showCardContextMenu(e: MouseEvent, card: ConceptCard, currentCategory?: string) {
    const menu = new Menu();
    menu.addItem(i => i.setTitle('Copy content').setIcon('copy').onClick(() => this.copyCardContent(card)));
    menu.addItem(i => i.setTitle('Open source note').setIcon('external-link').onClick(() => this.context.openSourceFile(card.source, card.sourceLine)));

    if (currentCategory) {
      menu.addSeparator();
      menu.addItem(i => i.setTitle('Move to folder...').setIcon('folder-input').onClick(() => this.showMoveToFolderDialog(card, currentCategory)));
    }

    menu.addSeparator();
    menu.addItem(i => i.setTitle('Delete card').setIcon('trash').onClick(() => this.context.deleteCard(card.id)));
    menu.showAtMouseEvent(e);
  }

  // ---- Move to Folder Dialog ----

  private async showMoveToFolderDialog(card: ConceptCard, category: string) {
    document.querySelectorAll('.concept-card-move-popup').forEach(el => el.remove());

    const folders = await this.context.getFolders(category);
    const currentFolder = (card.folderByCategory && card.folderByCategory[category]) || '';

    const popup = document.createElement('div');
    popup.className = 'concept-card-move-popup';

    const title = document.createElement('div');
    title.className = 'concept-card-move-popup-title';
    title.textContent = `Move to folder (${category})`;
    popup.appendChild(title);

    const listEl = document.createElement('div');
    listEl.className = 'concept-card-move-popup-list';

    // "Unfiled" option
    const rootItem = document.createElement('div');
    rootItem.className = `concept-card-move-popup-item ${!currentFolder ? 'current' : ''}`;
    rootItem.textContent = '📂 Unfiled';
    rootItem.addEventListener('click', async () => {
      await this.context.moveCardToFolder(card.id, category, '');
      popup.remove(); new Notice('Moved out of folder');
    });
    listEl.appendChild(rootItem);

    for (const fp of folders.sort()) {
      const folderItem = document.createElement('div');
      const depth = fp.split('/').length - 1;
      folderItem.className = `concept-card-move-popup-item ${currentFolder === fp ? 'current' : ''}`;
      folderItem.style.paddingLeft = `${12 + depth * 16}px`;
      folderItem.textContent = `📁 ${fp.split('/').pop() || fp}`;
      folderItem.addEventListener('click', async () => {
        await this.context.moveCardToFolder(card.id, category, fp);
        popup.remove(); new Notice(`Moved to: ${fp}`);
      });
      listEl.appendChild(folderItem);
    }
    popup.appendChild(listEl);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'concept-card-move-popup-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => popup.remove());
    popup.appendChild(cancelBtn);

    document.body.appendChild(popup);
    popup.style.position = 'fixed'; popup.style.top = '50%'; popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)'; popup.style.zIndex = '10000';

    const closeHandler = (ev: MouseEvent) => {
      if (!popup.contains(ev.target as Node)) { popup.remove(); document.removeEventListener('mousedown', closeHandler); }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  // ---- Helpers ----

  private async copyCardContent(card: ConceptCard) {
    const text = `Source excerpt: ${card.content}`;
    try { await navigator.clipboard.writeText(text); new Notice('Copied to clipboard'); }
    catch { new Notice('Copy failed. Please copy manually.'); }
  }

  private stopAllPropagation(el: HTMLElement) {
    for (const evt of ['keydown', 'keyup', 'keypress', 'input', 'paste', 'compositionstart', 'compositionupdate', 'compositionend'] as const) {
      el.addEventListener(evt, (e) => e.stopPropagation());
    }
  }
}
