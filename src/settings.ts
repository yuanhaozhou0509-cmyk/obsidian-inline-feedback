import { App, PluginSettingTab, Setting } from 'obsidian';

export const DEFAULT_CATEGORIES = ['Idea', 'Evidence', 'Question', 'Rewrite', 'Source', 'Quote'];

export interface InlineFeedbackSettings {
  highlightColor: string;
  conceptCardPath: string;
  cardCategories: string[];
}

export const DEFAULT_SETTINGS: InlineFeedbackSettings = {
  highlightColor: 'rgba(255, 215, 0, 0.3)',
  conceptCardPath: 'knowledge_cards',
  cardCategories: [...DEFAULT_CATEGORIES],
};

export class InlineFeedbackSettingTab extends PluginSettingTab {
  private pluginInstance: any;

  constructor(app: App, plugin: any) {
    super(app, plugin);
    this.pluginInstance = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Inline Feedback Settings' });

    new Setting(containerEl)
      .setName('Highlight color')
      .setDesc('Background color for annotated text. Use any valid CSS color value.')
      .addText(text => text
        .setPlaceholder('rgba(255, 215, 0, 0.3)')
        .setValue(this.pluginInstance.settings.highlightColor)
        .onChange(async (value: string) => {
          this.pluginInstance.settings.highlightColor = value;
          await this.pluginInstance.saveSettings();
        })
      );

    containerEl.createEl('h2', { text: 'Knowledge Card Settings' });

    new Setting(containerEl)
      .setName('Knowledge card library path')
      .setDesc('Folder for reusable knowledge cards, relative to the vault root.')
      .addText(text => text
        .setPlaceholder('knowledge_cards')
        .setValue(this.pluginInstance.settings.conceptCardPath)
        .onChange(async (value: string) => {
          this.pluginInstance.settings.conceptCardPath = value.trim() || 'knowledge_cards';
          await this.pluginInstance.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Card categories')
      .setDesc('Comma-separated category names shown as quick-select buttons when saving knowledge cards.')
      .addText(text => text
        .setPlaceholder(DEFAULT_CATEGORIES.join(', '))
        .setValue(this.pluginInstance.settings.cardCategories.join(', '))
        .onChange(async (value: string) => {
          const cats = value.split(/[,，]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          this.pluginInstance.settings.cardCategories = cats.length > 0 ? cats : [...DEFAULT_CATEGORIES];
          await this.pluginInstance.saveSettings();
        })
      );
  }
}
