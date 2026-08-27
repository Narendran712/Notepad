import { Component, OnInit, AfterViewChecked, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { TextFieldModule } from '@angular/cdk/text-field';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

export interface NotepadItem {
  id: string;
  type: 'button' | 'divider' | 'heading' | 'paragraph' | 'image' | 'social' | 'divide' | 'icon' | 'draw';
  content: any;
  settings: {
    alignment?: 'left' | 'center' | 'right' | 'justify';
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
    backgroundColor?: string;
    fontSize?: number;
    fontFamily?: string;
    lineSpacing?: number;
    buttonColor?: 'red' | 'yellow' | 'green' | 'blue' | 'purple';
    buttonUrl?: string;
    borderRadius?: number;
    padding?: number;
    imageWidth?: number;
    imageHeight?: number;
    imageBorderWidth?: number;
    dividerLayout?: '100' | '50-50' | '60-40' | '70-30' | '25-25-25-25';
    headingLevel?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    iconSize?: number;
    iconWidth?: number;
    iconWeight?: number;
    socialIconSize?: number;
    socialGap?: number;
    lineColor?: string;
    lineWidth?: number;
    lineStyle?: 'solid' | 'dashed' | 'dotted';
    drawHeight?: number;
    drawTool?: 'pen' | 'brush' | 'eraser';
    drawThickness?: number;
    drawColor?: string;
    drawOpacity?: number;
    drawCanvasWidth?: number;
    isColumnBlock?: boolean;
    listStyle?: 'none' | 'numbered' | 'bullet' | 'star' | 'dash' | 'custom';
    customListIcon?: string;
    listSpacing?: number;
    listFontSize?: number;
    listColor?: string;
    showGoogleLinkText?: boolean;
    showWhatsappLinkText?: boolean;
    showInstagramLinkText?: boolean;
    showFacebookLinkText?: boolean;
  };
  listItems?: string[];
  sections?: {
    id: string;
    items: NotepadItem[];
  }[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, TextFieldModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, AfterViewChecked {
  // Navigation State
  activeTab = 'content'; // 'content' | 'block' | 'body'

  // Notepad State
  notepadItems: NotepadItem[] = [];
  selectedBlockId: string | null = null;

  // History State (Undo/Redo)
  history: string[] = [];
  historyIndex = -1;

  // Local Storage Save / Preview State
  private sanitizer = inject(DomSanitizer);
  private readonly LS_KEY = 'notepad_snapshots';
  private readonly LS_MAX_SNAPSHOTS = 10;
  isPreviewMode = false;
  savedSnapshots: { id: string; label: string; timestamp: number; items: NotepadItem[] }[] = [];
  previewedSnapshot: { id: string; label: string; timestamp: number; items: NotepadItem[] } | null = null;
  saveSuccessFlash = false;
  showSaveToast = false;

  // Content Tools (Draggable templates)
  contentTools = [
    { type: 'column', label: 'Column', icon: 'view_column' },
    { type: 'button', label: 'Button', icon: 'smart_button' },
    { type: 'heading', label: 'Heading', icon: 'title' },
    { type: 'paragraph', label: 'Paragraph', icon: 'notes' },
    { type: 'image', label: 'Image', icon: 'image' },
    { type: 'social', label: 'Social', icon: 'share' },
    { type: 'draw', label: 'Draw', icon: 'draw' },
    { type: 'divide', label: 'line', icon: 'splitscreen' },
    { type: 'icon', label: 'Icon', icon: 'star' }
  ];

  // Block Split Templates
  blockLayouts = [
    { label: '100% Full Width', layout: '100', cols: 1 },
    { label: '50% — 50%', layout: '50-50', cols: 2 },
    { label: '60% — 40%', layout: '60-40', cols: 2 },
    { label: '70% — 30%', layout: '70-30', cols: 2 },
    { label: '25% — 25% — 25% — 25%', layout: '25-25-25-25', cols: 4 }
  ];

  // Available Icons for Icon Tool (10 icons)
  availableIcons = [
    { name: 'Hashtag', symbol: '#', label: 'Hashtag (#)' },
    { name: 'Star', symbol: '★', label: 'Star (★)' },
    { name: 'Heart', symbol: '♥', label: 'Heart (♥)' },
    { name: 'Check', symbol: '✓', label: 'Check (✓)' },
    { name: 'Arrow', symbol: '→', label: 'Arrow (→)' },
    { name: 'Plus', symbol: '+', label: 'Plus (+)' },
    { name: 'Minus', symbol: '−', label: 'Minus (−)' },
    { name: 'Warning', symbol: '⚠', label: 'Warning (⚠)' },
    { name: 'Info', symbol: 'ℹ', label: 'Info (ℹ)' },
    { name: 'Bookmark', symbol: '🔖', label: 'Bookmark (🔖)' }
  ];

  // Font choices
  fontFamilies = [
    'Inter', 'Arial', 'Georgia', 'Courier New', 'Times New Roman', 'Trebuchet MS', 'Verdana'
  ];

  // Draw canvas state management
  private drawStateMap = new Map<string, {
    isDrawing: boolean;
    lastX: number;
    lastY: number;
    history: string[];
    historyIndex: number;
  }>();
  private restoredCanvases = new Set<string>();

  ngOnInit() {
    this.saveState();
  }

  ngAfterViewChecked() {
    // Restore saved canvas drawings when draw items are rendered (handles root and nested column items)
    const restoreDraw = (items: NotepadItem[]) => {
      for (const item of items) {
        if (item.type === 'draw' && item.content && !this.restoredCanvases.has(item.id)) {
          const canvas = document.getElementById('draw-canvas-' + item.id) as HTMLCanvasElement | null;
          if (canvas) {
            this.restoredCanvases.add(item.id);
            const ctx = canvas.getContext('2d');
            if (ctx && typeof item.content === 'string' && item.content.startsWith('data:')) {
              const img = new Image();
              img.onload = () => ctx.drawImage(img, 0, 0);
              img.src = item.content;
            }
          }
        }
        if (item.sections) {
          item.sections.forEach(sec => restoreDraw(sec.items));
        }
      }
    };
    restoreDraw(this.notepadItems);
  }

  // Get active selected item for formatting panel
  get selectedItem(): NotepadItem | null {
    if (!this.selectedBlockId) return null;
    return this.findItemById(this.notepadItems, this.selectedBlockId);
  }

  // Set active navigation tab
  setTab(tab: string) {
    this.isPreviewMode = false;
    this.activeTab = tab;
  }

  // Select a component block in the notepad and switch to Body panel
  selectBlock(event: Event, id: string) {
    event.stopPropagation();
    this.selectedBlockId = id;
    this.isPreviewMode = false;
    this.activeTab = 'body';
  }

  // Clear current selection
  clearSelection() {
    this.selectedBlockId = null;
  }

  // Recursive search to find an item by ID
  findItemById(items: NotepadItem[], id: string): NotepadItem | null {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.sections) {
        for (const section of item.sections) {
          const found = this.findItemById(section.items, id);
          if (found) return found;
        }
      }
    }
    return null;
  }

  // Delete a block from the notepad (handles nested items)
  deleteBlock(event: Event, id: string) {
    event.stopPropagation();
    this.notepadItems = this.removeItemFromList(this.notepadItems, id);
    if (this.selectedBlockId === id) {
      this.selectedBlockId = null;
    }
    this.saveState();
  }

  removeItemFromList(items: NotepadItem[], id: string): NotepadItem[] {
    return items.filter(item => {
      if (item.id === id) return false;
      if (item.sections) {
        item.sections.forEach(sec => {
          sec.items = this.removeItemFromList(sec.items, id);
        });
      }
      return true;
    });
  }

  // Generate dynamic list of connected DropList IDs (main notepad + all divider columns)
  getConnectedListIds(): string[] {
    const ids = ['notepad-canvas'];
    const traverse = (items: NotepadItem[]) => {
      items.forEach(item => {
        if (item.sections) {
          item.sections.forEach(sec => {
            ids.push(sec.id);
          });
        }
      });
    };
    traverse(this.notepadItems);
    return ids;
  }

  // Drag and Drop handler
  onDrop(event: CdkDragDrop<NotepadItem[]>) {
    // If dragging from features sidebar or block sidebar
    if (event.previousContainer.id === 'features-list' || event.previousContainer.id === 'block-tools-list') {
      const data = event.item.data;
      let newItem: NotepadItem;

      // Handle Column tool drag-drop
      if (typeof data === 'string' && data === 'column') {
        let colBlock = this.getColumnBlock();
        if (!colBlock) {
          colBlock = this.createColumnItem('100', 1);
          event.container.data.splice(event.currentIndex, 0, colBlock);
        }
        this.selectedBlockId = colBlock.id;
        this.activeTab = 'block';
        this.saveState();
        return;
      }

      if (typeof data === 'object' && data.type === 'divider') {
        newItem = this.createDividerItem(data.layout, data.cols);
      } else if (typeof data === 'string') {
        newItem = this.createNewItem(data);
      } else {
        newItem = this.createNewItem('paragraph');
      }

      // Insert item at drop index
      event.container.data.splice(event.currentIndex, 0, newItem);
      this.selectedBlockId = newItem.id;
      this.activeTab = 'body';
      this.saveState();
    } else {
      // Reordering within the same list or moving between lists
      if (event.previousContainer === event.container) {
        moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      } else {
        transferArrayItem(
          event.previousContainer.data,
          event.container.data,
          event.previousIndex,
          event.currentIndex
        );
      }
      this.saveState();
    }
  }

  // Click handler to directly add a content tool to notepad canvas
  addToolItem(toolType: string) {
    // Handle Column tool click
    if (toolType === 'column') {
      let colBlock = this.getColumnBlock();
      if (!colBlock) {
        colBlock = this.createColumnItem('100', 1);
        this.notepadItems.push(colBlock);
      }
      this.selectedBlockId = colBlock.id;
      this.activeTab = 'block';
      this.saveState();
      return;
    }
    if (toolType === 'icon') {
      // Create icon with default first icon (#) and switch to body panel showing icon picker and controls
      const newItem = this.createNewItem('icon');
      this.notepadItems.push(newItem);
      this.selectedBlockId = newItem.id;
      this.activeTab = 'body';
      this.saveState();
      return;
    }
    const newItem = this.createNewItem(toolType);
    this.notepadItems.push(newItem);
    this.selectedBlockId = newItem.id;
    this.activeTab = 'body';
    this.saveState();
  }

  // Select an icon for an icon block
  selectIconSymbol(item: NotepadItem, symbol: string) {
    item.content = symbol;
    this.saveState();
  }

  // Insert a specific icon directly into the notepad
  insertIconItem(symbol: string) {
    const newItem = this.createNewItem('icon');
    newItem.content = symbol;
    this.notepadItems.push(newItem);
    this.selectedBlockId = newItem.id;
    this.activeTab = 'body';
    this.saveState();
  }

  // Helper to create split divider with writeable paragraphs in each section
  createDividerItem(layout: string = '50-50', cols: number = 2): NotepadItem {
    const item = this.createNewItem('divider');
    item.settings.dividerLayout = layout as any;
    item.sections = Array.from({ length: cols }, () => ({
      id: 'sec_' + Math.random().toString(36).substr(2, 9),
      items: [this.createNewItem('paragraph')]
    }));
    return item;
  }

  // Helper to create a Column block with text and input fields inside columns
  createColumnItem(layout: string = '50-50', cols: number = 2): NotepadItem {
    const item = this.createNewItem('divider');
    item.settings.dividerLayout = layout as any;
    item.settings.isColumnBlock = true;
    item.sections = Array.from({ length: cols }, () => ({
      id: 'sec_' + Math.random().toString(36).substr(2, 9),
      items: [this.createNewItem('paragraph')]
    }));
    return item;
  }

  // Create writeable split sections when block layouts are clicked or selected
  addBlockSplit(layout: string, cols: number) {
    const newItem = this.createDividerItem(layout, cols);
    this.notepadItems.push(newItem);
    this.selectedBlockId = newItem.id;
    this.activeTab = 'body';
    this.saveState();
  }

  // Get the existing column block if any
  getColumnBlock(): NotepadItem | undefined {
    let found: NotepadItem | undefined;
    const traverse = (items: NotepadItem[]) => {
      for (const item of items) {
        if (item.type === 'divider' && item.settings.isColumnBlock) {
          found = item;
          return;
        }
        if (item.sections) {
          item.sections.forEach(sec => traverse(sec.items));
        }
      }
    };
    traverse(this.notepadItems);
    return found;
  }

  // Check if any column block already exists in the notepad (recursively)
  get hasColumnBlock(): boolean {
    return !!this.getColumnBlock();
  }

  // Add Paragraph / Text Input inside a specific Divider / Column section
  addParagraphToSection(section: { id: string; items: NotepadItem[] }, event?: Event) {
    if (event) event.stopPropagation();
    const p = this.createNewItem('paragraph');
    section.items.push(p);
    this.selectedBlockId = p.id;
    this.activeTab = 'body';
    this.saveState();
  }

  // Change Divider layout type and safely preserve existing data
  changeDividerLayout(item: NotepadItem, layout: string, cols: number) {
    item.settings.dividerLayout = layout as any;

    const oldSections = item.sections || [];

    // Build new sections preserving data column by column
    item.sections = Array.from({ length: cols }, (_, i) => {
      let items: NotepadItem[] = [];

      // Preserve items from the matching column index
      if (i < oldSections.length) {
        items = oldSections[i].items;
      }

      // If this is the last column in the new layout, merge any leftover items from discarded columns
      if (i === cols - 1 && oldSections.length > cols) {
        for (let j = cols; j < oldSections.length; j++) {
          items.push(...oldSections[j].items);
        }
      }

      // If the section is empty, add default writeable paragraph
      if (items.length === 0) {
        items = [this.createNewItem('paragraph')];
      }

      return {
        id: 'sec_' + Math.random().toString(36).substr(2, 9),
        items: items
      };
    });

    this.saveState();
  }

  createNewItem(type: string): NotepadItem {
    const id = 'item_' + Math.random().toString(36).substr(2, 9);
    let content: any = '';
    let sections: any[] | undefined = undefined;

    const defaultSettings: NotepadItem['settings'] = {
      alignment: 'left',
      fontSize: 16,
      fontFamily: 'Inter',
      color: '#1e293b',
      backgroundColor: 'transparent',
      lineSpacing: 1.5,
    };


    switch (type) {
      case 'button':
        defaultSettings.buttonColor = 'red';
        defaultSettings.borderRadius = 25;
        defaultSettings.padding = 10;
        defaultSettings.alignment = 'center';
        content = 'Click Me';
        break;

      case 'divider':
      case '50':
        defaultSettings.dividerLayout = '50-50';
        sections = [
          { id: 'sec_' + Math.random().toString(36).substr(2, 9), items: [this.createNewItem('paragraph')] },
          { id: 'sec_' + Math.random().toString(36).substr(2, 9), items: [this.createNewItem('paragraph')] }
        ];
        break;

      case 'heading':
        defaultSettings.headingLevel = 'h1';
        content = 'Heading Word';
        break;

      case 'paragraph':
        content = '';
        break;

      case 'divide':
        defaultSettings.lineColor = '#ff1493';
        defaultSettings.lineWidth = 2;
        defaultSettings.lineStyle = 'solid';
        defaultSettings.listStyle = 'none';
        defaultSettings.customListIcon = '★';
        defaultSettings.listSpacing = 8;
        defaultSettings.listFontSize = 16;
        defaultSettings.listColor = '#ff1493';
        content = '';
        break;

      case 'image':
        defaultSettings.imageWidth = 80;
        defaultSettings.imageHeight = 250;
        defaultSettings.imageBorderWidth = 1;
        content = 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=600'; // Default placeholder photo
        break;

      case 'social':
        defaultSettings.socialIconSize = 34;
        defaultSettings.socialGap = 16;
        defaultSettings.alignment = 'center';
        defaultSettings.showGoogleLinkText = false;
        defaultSettings.showWhatsappLinkText = false;
        defaultSettings.showInstagramLinkText = false;
        defaultSettings.showFacebookLinkText = false;
        content = {
          google: 'https://www.google.com',
          googleText: 'Google',
          whatsapp: 'https://wa.me/',
          whatsappText: 'WhatsApp',
          instagram: 'https://instagram.com/',
          instagramText: 'Instagram',
          facebook: 'https://facebook.com/',
          facebookText: 'Facebook'
        };
        break;


      case 'icon':
        defaultSettings.iconSize = 36;
        defaultSettings.iconWidth = 100;
        defaultSettings.iconWeight = 700;
        defaultSettings.alignment = 'center';
        defaultSettings.color = '#ff1493';
        content = '#';
        break;

      case 'draw':
        defaultSettings.drawHeight = 200;
        defaultSettings.drawTool = 'pen';
        defaultSettings.drawThickness = 4;
        defaultSettings.drawColor = '#ff1493';
        defaultSettings.drawOpacity = 100;
        defaultSettings.drawCanvasWidth = 100;
        content = '';
        break;


    }

    return {
      id,
      type: type as any,
      content,
      settings: defaultSettings,
      sections
    };
  }

  // Update content in real-time (input event) — no saveState to avoid rerender during typing
  updateContentOnly(item: NotepadItem, value: string) {
    item.content = value;
  }

  // Update content and persist (blur event)
  updateContentAndSave(item: NotepadItem, value: string) {
    item.content = value;
    this.saveState();
  }

  // Handle local text updates (legacy, kept for backward compat)
  updateContent(item: NotepadItem, value: string) {
    if (item.content !== value) {
      item.content = value;
      this.saveState();
    }
  }

  // Ensure a divider section always has at least one editable paragraph
  ensureSectionEditable(section: { id: string; items: NotepadItem[] }, event?: Event) {
    if (event) event.stopPropagation();
    if (section.items.length === 0) {
      const p = this.createNewItem('paragraph');
      section.items.push(p);
      this.selectedBlockId = p.id;
      this.saveState();
    }
  }

  // Move caret to the end of a contenteditable element on focus.
  // Used by heading elements so Backspace always deletes from the end,
  // not from the start of the word.
  moveCursorToEnd(event: FocusEvent) {
    const el = event.target as HTMLElement;
    // Use setTimeout(0) so the browser finishes its own focus placement first,
    // then we override it to the end.
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false); // false = collapse to END
      sel.removeAllRanges();
      sel.addRange(range);
    }, 0);
  }

  // Handle image upload
  handleImageUpload(event: Event, item: NotepadItem) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          item.content = e.target.result as string;
          this.saveState();
        }
      };
      reader.readAsDataURL(file);
    }
  }



  // Body Settings formatting actions
  toggleBold() {
    const item = this.selectedItem;
    if (item) {
      item.settings.bold = !item.settings.bold;
      this.saveState();
    }
  }

  toggleItalic() {
    const item = this.selectedItem;
    if (item) {
      item.settings.italic = !item.settings.italic;
      this.saveState();
    }
  }

  toggleUnderline() {
    const item = this.selectedItem;
    if (item) {
      item.settings.underline = !item.settings.underline;
      this.saveState();
    }
  }

  setAlignment(alignment: 'left' | 'center' | 'right' | 'justify') {
    const item = this.selectedItem;
    // Alignment applies to Paragraph, Button, Icon, Social, and Divider
    if (item && ['paragraph', 'button', 'icon', 'social', 'divider'].includes(item.type)) {
      item.settings.alignment = alignment;
      this.saveState();
    }
  }

  setSocialIconSize(size: number) {
    const item = this.selectedItem;
    if (item) {
      item.settings.socialIconSize = Math.max(18, Math.min(64, Number(size) || 34));
      this.saveState();
    }
  }

  setSocialGap(gap: number) {
    const item = this.selectedItem;
    if (item) {
      item.settings.socialGap = Math.max(4, Math.min(48, Number(gap) || 16));
      this.saveState();
    }
  }

  // ─── Draw Canvas Methods ────────────────────────────────────────────
  private getDrawState(itemId: string) {
    if (!this.drawStateMap.has(itemId)) {
      this.drawStateMap.set(itemId, { isDrawing: false, lastX: 0, lastY: 0, history: [''], historyIndex: 0 });
    }
    return this.drawStateMap.get(itemId)!;
  }

  private getDrawCanvas(itemId: string): HTMLCanvasElement | null {
    return document.getElementById('draw-canvas-' + itemId) as HTMLCanvasElement | null;
  }

  private getEventCoords(event: MouseEvent | TouchEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if (window.TouchEvent && event instanceof TouchEvent) {
      clientX = event.touches[0]?.clientX ?? event.changedTouches[0].clientX;
      clientY = event.touches[0]?.clientY ?? event.changedTouches[0].clientY;
    } else {
      clientX = (event as MouseEvent).clientX;
      clientY = (event as MouseEvent).clientY;
    }
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  startDraw(event: MouseEvent | TouchEvent, item: NotepadItem) {
    event.preventDefault();
    event.stopPropagation();
    const canvas = this.getDrawCanvas(item.id);
    if (!canvas) return;
    const state = this.getDrawState(item.id);
    state.isDrawing = true;
    const coords = this.getEventCoords(event, canvas);
    state.lastX = coords.x;
    state.lastY = coords.y;
  }

  continueDraw(event: MouseEvent | TouchEvent, item: NotepadItem) {
    event.preventDefault();
    const state = this.getDrawState(item.id);
    if (!state.isDrawing) return;
    const canvas = this.getDrawCanvas(item.id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { x, y } = this.getEventCoords(event, canvas);
    const tool = item.settings.drawTool || 'pen';
    const thickness = Number(item.settings.drawThickness) || 4;
    const color = item.settings.drawColor || '#ff1493';
    const opacity = (item.settings.drawOpacity ?? 100) / 100;

    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 0;

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = thickness * 5;
      ctx.beginPath();
      ctx.moveTo(state.lastX, state.lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (tool === 'brush') {
      // Soft bristle brush: multiple semi-transparent strokes with scatter
      const bristles = Math.max(4, Math.round(thickness / 2));
      for (let i = 0; i < bristles; i++) {
        const scatterX = (Math.random() - 0.5) * thickness * 1.5;
        const scatterY = (Math.random() - 0.5) * thickness * 1.5;
        ctx.beginPath();
        ctx.globalAlpha = (opacity * 0.25);
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness * 0.8;
        ctx.shadowColor = color;
        ctx.shadowBlur = thickness * 0.5;
        ctx.moveTo(state.lastX + scatterX, state.lastY + scatterY);
        ctx.lineTo(x + scatterX, y + scatterY);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    } else {
      // Pen: clean crisp stroke
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.moveTo(state.lastX, state.lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    state.lastX = x;
    state.lastY = y;
  }

  stopDraw(item: NotepadItem) {
    const state = this.getDrawState(item.id);
    if (!state.isDrawing) return;
    state.isDrawing = false;
    const canvas = this.getDrawCanvas(item.id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    const dataUrl = canvas.toDataURL('image/png');
    item.content = dataUrl;
    // Push to draw history
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(dataUrl);
    state.historyIndex = state.history.length - 1;
    this.saveState();
  }

  clearDraw(item: NotepadItem) {
    const canvas = this.getDrawCanvas(item.id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    item.content = '';
    const state = this.getDrawState(item.id);
    state.history = [''];
    state.historyIndex = 0;
    this.restoredCanvases.delete(item.id);
    this.saveState();
  }

  undoDraw(item: NotepadItem) {
    const state = this.getDrawState(item.id);
    if (state.historyIndex <= 0) return;
    state.historyIndex--;
    const dataUrl = state.history[state.historyIndex];
    const canvas = this.getDrawCanvas(item.id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (dataUrl && dataUrl.startsWith('data:')) {
      const img = new Image();
      img.onload = () => { ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(img, 0, 0); };
      img.src = dataUrl;
    }
    item.content = dataUrl;
    this.saveState();
  }

  redoDraw(item: NotepadItem) {
    const state = this.getDrawState(item.id);
    if (state.historyIndex >= state.history.length - 1) return;
    state.historyIndex++;
    const dataUrl = state.history[state.historyIndex];
    const canvas = this.getDrawCanvas(item.id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (dataUrl && dataUrl.startsWith('data:')) {
      const img = new Image();
      img.onload = () => { ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(img, 0, 0); };
      img.src = dataUrl;
    }
    item.content = dataUrl;
    this.saveState();
  }

  setDrawTool(tool: 'pen' | 'brush' | 'eraser') {
    const item = this.selectedItem;
    if (item) { item.settings.drawTool = tool; }
  }

  setDrawThickness(val: number) {
    const item = this.selectedItem;
    if (item) { item.settings.drawThickness = Math.max(1, Math.min(50, Number(val) || 4)); }
  }

  setDrawColor(color: string) {
    const item = this.selectedItem;
    if (item) { item.settings.drawColor = color; }
  }

  setDrawOpacity(val: number) {
    const item = this.selectedItem;
    if (item) { item.settings.drawOpacity = Math.max(10, Math.min(100, Number(val) || 100)); }
  }

  setDrawHeight(height: number) {
    const item = this.selectedItem;
    if (item) {
      item.settings.drawHeight = Math.max(60, Math.min(600, Number(height) || 160));
      this.saveState();
    }
  }

  setDrawCanvasWidth(width: number) {
    const item = this.selectedItem;
    if (item) {
      item.settings.drawCanvasWidth = Math.max(20, Math.min(100, Number(width) || 100));
      this.saveState();
    }
  }

  canUndoDraw(item: NotepadItem): boolean {
    return this.getDrawState(item.id).historyIndex > 0;
  }

  canRedoDraw(item: NotepadItem): boolean {
    const state = this.getDrawState(item.id);
    return state.historyIndex < state.history.length - 1;
  }

  setIconSize(size: number) {
    const item = this.selectedItem;
    if (item) {
      item.settings.iconSize = Math.max(12, Math.min(120, Number(size) || 36));
      this.saveState();
    }
  }

  setIconWidth(width: number) {
    const item = this.selectedItem;
    if (item) {
      item.settings.iconWidth = Math.max(10, Math.min(100, Number(width) || 100));
      this.saveState();
    }
  }

  setIconWeight(weight: number) {
    const item = this.selectedItem;
    if (item) {
      item.settings.iconWeight = Number(weight) || 400;
      this.saveState();
    }
  }

  setFontSize(size: number) {
    const item = this.selectedItem;
    if (item) {
      let val = Number(size);
      if (isNaN(val)) val = 16;
      val = Math.min(Math.max(val, 10), 40);
      item.settings.fontSize = val;
      this.saveState();
    }
  }

  setFontFamily(font: string) {
    const item = this.selectedItem;
    if (item) {
      item.settings.fontFamily = font;
      this.saveState();
    }
  }

  setLineSpacing(spacing: number) {
    const item = this.selectedItem;
    if (item) {
      item.settings.lineSpacing = spacing;
      this.saveState();
    }
  }

  setTextColor(color: string) {
    const item = this.selectedItem;
    if (item) {
      item.settings.color = color;
      this.saveState();
    }
  }

  setBackgroundColor(color: string) {
    const item = this.selectedItem;
    if (item) {
      item.settings.backgroundColor = color;
      this.saveState();
    }
  }

  // Clear Formatting and Content on Selected Element
  clearFormatting() {
    const item = this.selectedItem;
    if (item) {
      // Always reset visual formatting
      item.settings.bold = false;
      item.settings.italic = false;
      item.settings.underline = false;
      item.settings.color = '#1e293b';
      item.settings.backgroundColor = 'transparent';
      item.settings.fontSize = 16;
      item.settings.fontFamily = 'Inter';
      item.settings.lineSpacing = 1.5;
      item.settings.alignment = item.type === 'button' ? 'center' : 'left';

      // Heading Clear: remove ONE letter from the END each press (right → left)
      // HELLO → HELL → HEL → HE → H → ""
      if (item.type === 'heading') {
        const current: string = typeof item.content === 'string' ? item.content : '';
        item.content = current.slice(0, -1); // drops the last character; "" stays ""
      } else if (item.type === 'paragraph') {
        item.content = '';
      } else if (item.type === 'button') {
        item.content = 'Click Me';
        item.settings.buttonColor = 'red';
        item.settings.borderRadius = 25;
        item.settings.padding = 10;
        item.settings.buttonUrl = 'https://';
      } else if (item.type === 'icon') {
        item.content = '★';
        item.settings.iconSize = 36;
        item.settings.iconWidth = 100;
        item.settings.iconWeight = 700;
        item.settings.color = '#ff1493';
        item.settings.alignment = 'center';
      } else if (item.type === 'social') {
        item.content = {
          google: 'https://www.google.com',
          googleText: 'Google',
          whatsapp: 'https://wa.me/',
          whatsappText: 'WhatsApp',
          instagram: 'https://instagram.com/',
          instagramText: 'Instagram',
          facebook: 'https://facebook.com/',
          facebookText: 'Facebook'
        };
        item.settings.socialIconSize = 34;
        item.settings.socialGap = 16;
        item.settings.alignment = 'center';
        item.settings.showGoogleLinkText = false;
        item.settings.showWhatsappLinkText = false;
        item.settings.showInstagramLinkText = false;
        item.settings.showFacebookLinkText = false;
      } else if (item.type === 'draw') {
        this.clearDraw(item);
      }
      this.saveState();
    }
  }

  // Clear Entire Notepad
  clearNotepad() {
    if (confirm('Are you sure you want to clear the entire notepad? This cannot be undone.')) {
      this.notepadItems = [];
      this.selectedBlockId = null;
      this.saveState();
    }
  }

  // History Actions (Undo/Redo)
  saveState() {
    const state = JSON.stringify(this.notepadItems);
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(state);
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.notepadItems = JSON.parse(this.history[this.historyIndex]);
      this.selectedBlockId = null;
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.notepadItems = JSON.parse(this.history[this.historyIndex]);
      this.selectedBlockId = null;
    }
  }

  // Word & Character count calculations
  getCounts() {
    let charCount = 0;
    let wordCount = 0;

    const countText = (text: any) => {
      if (typeof text !== 'string') return;
      charCount += text.length;
      const words = text.trim().split(/\s+/).filter(w => w.length > 0);
      wordCount += words.length;
    };

    const traverse = (items: NotepadItem[]) => {
      items.forEach(item => {
        if (item.type === 'paragraph' || item.type === 'heading' || item.type === 'button' || item.type === 'icon') {
          countText(item.content);
        } else if (item.type === 'divide') {
          if (item.listItems) {
            item.listItems.forEach(li => countText(li));
          }
        } else if (item.type === 'divider' && item.sections) {
          item.sections.forEach(sec => traverse(sec.items));
        } else if (item.type === 'social') {
          if (item.content) {
            countText(item.content.google);
            countText(item.content.googleText);
            countText(item.content.whatsapp);
            countText(item.content.whatsappText);
            countText(item.content.instagram);
            countText(item.content.instagramText);
            countText(item.content.facebook);
            countText(item.content.facebookText);
          }
        }
      });
    };

    traverse(this.notepadItems);
    return { charCount, wordCount };
  }

  // --- List Formatting Methods ---
  setListStyle(item: NotepadItem, style: 'none' | 'numbered' | 'bullet' | 'star' | 'dash' | 'custom') {
    item.settings.listStyle = style;
    if (style !== 'none') {
      if (!item.listItems || item.listItems.length === 0) {
        item.listItems = ['List item 1', 'List item 2', 'List item 3'];
      }
    }
    this.saveState();
  }

  setCustomListIcon(item: NotepadItem, iconSymbol: string) {
    item.settings.customListIcon = iconSymbol;
    item.settings.listStyle = 'custom';
    this.saveState();
  }

  addListItem(item: NotepadItem, index?: number) {
    if (!item.listItems) item.listItems = [];
    if (typeof index === 'number') {
      item.listItems.splice(index + 1, 0, '');
    } else {
      item.listItems.push('');
    }
    this.saveState();
  }

  removeListItem(item: NotepadItem, index: number) {
    if (!item.listItems) return;
    if (item.listItems.length > 1) {
      item.listItems.splice(index, 1);
    } else {
      item.listItems[0] = '';
    }
    this.saveState();
  }

  onListItemKeydown(event: KeyboardEvent, item: NotepadItem, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addListItem(item, index);
    } else if (event.key === 'Backspace' && item.listItems && item.listItems[index] === '' && item.listItems.length > 1) {
      event.preventDefault();
      this.removeListItem(item, index);
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  // ─── Save to Local Storage ───────────────────────────────────────────────

  saveDocument() {
    // Snapshot canvas drawings to base64 before saving
    const canvasSnapshots: Record<string, string> = {};
    for (const item of this.notepadItems) {
      this.snapshotDrawItems([item], canvasSnapshots);
    }

    // Embed canvas snapshots into draw items before storing
    const itemsToSave = this.deepCloneWithCanvases(this.notepadItems, canvasSnapshots);

    // Load existing snapshots from LocalStorage
    const existing = this.getStoredSnapshots();

    // Build new snapshot entry
    const now = Date.now();
    const label = new Date(now).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    const newEntry = {
      id: 'snap_' + now,
      label,
      timestamp: now,
      items: itemsToSave
    };

    // Prepend the new snapshot and limit to max
    const updated = [newEntry, ...existing].slice(0, this.LS_MAX_SNAPSHOTS);

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.LS_KEY, JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('LocalStorage save failed (quota?):', e);
    }

    // Show brief success flash on the button
    this.saveSuccessFlash = true;
    setTimeout(() => { this.saveSuccessFlash = false; }, 1500);

    // Show top-center toast notification
    this.showSaveToast = true;
    setTimeout(() => { this.showSaveToast = false; }, 2500);
  }

  // ─── Preview: Load Saved Snapshots from Local Storage ───────────────────────

  togglePreview() {
    this.isPreviewMode = !this.isPreviewMode;
    if (this.isPreviewMode) {
      this.openPreview();
      const saved = this.getStoredSnapshots();
      if (saved && saved.length > 0) {
        this.previewSnapshotInNewTab(saved[0]);
      } else {
        alert('No saved files found. Please save the file first.');
        this.isPreviewMode = false;
      }
    } else {
      this.closePreview();
    }
  }

  previewSnapshotInNewTab(snap: any) {
    if (!snap || !snap.items) return;
    const canvasSnapshots: Record<string, string> = {};
    for (const item of snap.items) {
      this.snapshotDrawItems([item], canvasSnapshots);
    }
    const html = this.buildA4Html(snap.items, canvasSnapshots);

    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(html);
      newWindow.document.close();
    } else {
      alert('Please allow popups for this site to view the preview.');
    }
  }

  openPreview() {
    this.savedSnapshots = this.getStoredSnapshots();
    this.previewedSnapshot = this.savedSnapshots[0] ?? null;
  }

  closePreview() {
    this.isPreviewMode = false;
  }

  loadSnapshotIntoEditor(snap: { id: string; label: string; timestamp: number; items: NotepadItem[] }) {
    if (!snap || !snap.items) return;
    if (confirm('Load this saved file? Any unsaved changes will be lost.')) {
      this.notepadItems = JSON.parse(JSON.stringify(snap.items));
      this.isPreviewMode = false;
    }
  }

  selectSnapshotToPreview(snap: { id: string; label: string; timestamp: number; items: NotepadItem[] }) {
    this.previewedSnapshot = snap;
  }

  getSnapshotPreviewSafeHtml(snap: { items: NotepadItem[] } | null): SafeHtml {
    if (!snap || !snap.items || snap.items.length === 0) {
      return this.sanitizer.bypassSecurityTrustHtml('<div style="text-align:center;color:#64748b;padding:30px 10px;font-size:13px;">(This saved snapshot contains no blocks)</div>');
    }
    const canvasSnapshots: Record<string, string> = {};
    for (const item of snap.items) {
      this.snapshotDrawItems([item], canvasSnapshots);
    }
    const html = this.renderItemsToHtml(snap.items, canvasSnapshots);

    // Include styles for proper preview rendering
    const styleBlock = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  .doc-paragraph { margin-bottom: 10pt; white-space: pre-wrap; word-break: break-word; }
  .doc-h1 { font-size: 24pt; font-weight: 700; margin-bottom: 10pt; }
  .doc-h2 { font-size: 20pt; font-weight: 700; margin-bottom: 9pt; }
  .doc-h3 { font-size: 16pt; font-weight: 700; margin-bottom: 8pt; }
  .doc-h4 { font-size: 14pt; font-weight: 600; margin-bottom: 7pt; }
  .doc-h5 { font-size: 12pt; font-weight: 600; margin-bottom: 6pt; }
  .doc-h6 { font-size: 11pt; font-weight: 600; margin-bottom: 5pt; }
  .doc-button { display: inline-block; padding: 5pt 10pt; border-radius: 25px; color: #fff; font-weight: 700; font-size: 11pt; text-decoration: none; margin-bottom: 10pt; cursor: pointer; }
  .doc-image { margin-bottom: 10pt; }
  .doc-image img { max-width: 100%; height: auto; display: block; border-radius: 4pt; }
  .doc-icon { margin-bottom: 10pt; }
  .doc-social { display: flex; flex-wrap: wrap; gap: 10pt; align-items: center; margin-bottom: 10pt; }
  .doc-social-link { display: inline-flex; align-items: center; gap: 6pt; text-decoration: none; color: #1e293b; font-size: 11pt; }
  .doc-draw { margin-bottom: 10pt; }
  .doc-draw img { max-width: 100%; border-radius: 4pt; border: 1px solid #e2e8f0; }
  .doc-hr { margin-bottom: 10pt; }
  .doc-columns { display: flex; gap: 12pt; margin-bottom: 10pt; width: 100%; }
  .doc-col { border: 1pt dashed #cbd5e1; border-radius: 6pt; padding: 8pt; flex: 1; min-width: 0; }
  .doc-list { margin-bottom: 10pt; }
  .doc-list-item { display: flex; align-items: baseline; gap: 6pt; margin-bottom: 4pt; }
  .doc-list-marker { flex-shrink: 0; font-weight: 700; }
  .doc-list-text { flex: 1; word-break: break-word; }
</style>
`;
    return this.sanitizer.bypassSecurityTrustHtml(styleBlock + html);
  }

  private getStoredSnapshots(): { id: string; label: string; timestamp: number; items: NotepadItem[] }[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = window.localStorage.getItem(this.LS_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  deleteSnapshot(id: string) {
    const updated = this.getStoredSnapshots().filter(s => s.id !== id);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.LS_KEY, JSON.stringify(updated));
    }
    this.savedSnapshots = updated;
    if (this.previewedSnapshot?.id === id) {
      this.previewedSnapshot = updated[0] ?? null;
    }
  }

  private deepCloneWithCanvases(items: NotepadItem[], canvasSnapshots: Record<string, string>): NotepadItem[] {
    return JSON.parse(JSON.stringify(items)).map((item: NotepadItem) => {
      if (item.type === 'draw' && canvasSnapshots[item.id]) {
        item.content = canvasSnapshots[item.id];
      }
      if (item.sections) {
        item.sections.forEach(sec => {
          sec.items = this.deepCloneWithCanvases(sec.items, canvasSnapshots);
        });
      }
      return item;
    });
  }

  // ─── HTML Document Export (system file download) ───────────────────────────

  async exportDocument() {
    // 1. Snapshot all canvas drawings to base64 BEFORE generating HTML
    const canvasSnapshots: Record<string, string> = {};
    for (const item of this.notepadItems) {
      this.snapshotDrawItems([item], canvasSnapshots);
    }

    // 2. Build complete A4 HTML document with all content, layouts, and styles
    const html = this.buildA4Html(this.notepadItems, canvasSnapshots);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });

    // 3. System File-Save Dialog: allow user to choose file name and destination folder
    if ('showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: 'notepad-document.html',
          types: [
            {
              description: 'HTML Document (*.html)',
              accept: { 'text/html': ['.html', '.htm'] }
            }
          ]
        });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn('System file picker error, falling back to download:', err);
      }
    }

    // 4. Fallback for browsers/devices without showSaveFilePicker
    const defaultName = 'notepad-document.html';
    const chosenName = prompt('Export Notepad Document\nEnter file name:', defaultName);
    if (!chosenName) return;
    const finalFileName = chosenName.endsWith('.html') || chosenName.endsWith('.htm') ? chosenName : `${chosenName}.html`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  private snapshotDrawItems(items: NotepadItem[], map: Record<string, string>) {
    for (const item of items) {
      if (item.type === 'draw') {
        const canvas = document.getElementById('draw-canvas-' + item.id) as HTMLCanvasElement | null;
        if (canvas) {
          map[item.id] = canvas.toDataURL('image/png');
        } else if (item.content && typeof item.content === 'string' && item.content.startsWith('data:')) {
          map[item.id] = item.content;
        }
      }
      if (item.sections) {
        for (const sec of item.sections) {
          this.snapshotDrawItems(sec.items, map);
        }
      }
    }
  }

  private buildA4Html(items: NotepadItem[], canvasSnapshots: Record<string, string>): string {
    const body = this.renderItemsToHtml(items, canvasSnapshots);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notepad Document</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e0e0e0; font-family: Inter, Arial, sans-serif; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  .a4-page {
    width: 210mm;
    min-height: 297mm;
    margin: 20mm auto;
    background: #fff;
    padding: 20mm 20mm 20mm 20mm;
    box-shadow: 0 4px 32px rgba(0,0,0,0.18);
    color: #1e293b;
    font-size: 12pt;
    line-height: 1.6;
  }
  @media print {
    body { background: none; }
    .a4-page { margin: 0; box-shadow: none; width: 100%; min-height: auto; }
    @page { size: A4; margin: 20mm; }
  }
  /* Paragraphs */
  .doc-paragraph { margin-bottom: 10pt; white-space: pre-wrap; word-break: break-word; }
  /* Headings */
  .doc-h1 { font-size: 24pt; font-weight: 700; margin-bottom: 10pt; }
  .doc-h2 { font-size: 20pt; font-weight: 700; margin-bottom: 9pt; }
  .doc-h3 { font-size: 16pt; font-weight: 700; margin-bottom: 8pt; }
  .doc-h4 { font-size: 14pt; font-weight: 600; margin-bottom: 7pt; }
  .doc-h5 { font-size: 12pt; font-weight: 600; margin-bottom: 6pt; }
  .doc-h6 { font-size: 11pt; font-weight: 600; margin-bottom: 5pt; }
  /* Button */
  .doc-button { display: inline-block; padding: 8pt 18pt; border-radius: 8pt; color: #fff; font-weight: 700; font-size: 11pt; text-decoration: none; margin-bottom: 10pt; }
  /* Image */
  .doc-image { margin-bottom: 10pt; }
  .doc-image img { max-width: 100%; height: auto; display: block; border-radius: 4pt; }
  /* Icon */
  .doc-icon { margin-bottom: 10pt; }
  /* Social */
  .doc-social { display: flex; flex-wrap: wrap; gap: 10pt; align-items: center; margin-bottom: 10pt; }
  .doc-social-link { display: inline-flex; align-items: center; gap: 6pt; text-decoration: none; color: #1e293b; font-size: 11pt; }
  /* Drawing */
  .doc-draw { margin-bottom: 10pt; }
  .doc-draw img { max-width: 100%; border-radius: 4pt; border: 1px solid #e2e8f0; }
  /* Horizontal line */
  .doc-hr { margin-bottom: 10pt; }
  /* Columns */
  .doc-columns { display: flex; gap: 12pt; margin-bottom: 10pt; width: 100%; }
  .doc-col { border: 1pt dashed #cbd5e1; border-radius: 6pt; padding: 8pt; flex: 1; min-width: 0; }
  /* Lists */
  .doc-list { margin-bottom: 10pt; }
  .doc-list-item { display: flex; align-items: baseline; gap: 6pt; margin-bottom: 4pt; }
  .doc-list-marker { flex-shrink: 0; font-weight: 700; }
  .doc-list-text { flex: 1; word-break: break-word; }
</style>
</head>
<body>
<div class="a4-page">
${body}
</div>
</body>
</html>`;
  }

  private renderItemsToHtml(items: NotepadItem[], canvasSnapshots: Record<string, string>): string {
    return items.map(item => this.renderOneItemToHtml(item, canvasSnapshots)).join('\n');
  }

  private renderOneItemToHtml(item: NotepadItem, canvasSnapshots: Record<string, string>): string {
    const align = item.settings.alignment || 'left';
    const color = item.settings.color || '';
    const bg = (item.settings.backgroundColor && item.settings.backgroundColor !== 'transparent') ? item.settings.backgroundColor : '';
    const fontSize = item.settings.fontSize ? `${item.settings.fontSize}pt` : '';
    const fontFamily = item.settings.fontFamily || '';
    const bold = item.settings.bold;
    const italic = item.settings.italic;
    const underline = item.settings.underline;
    const lineSpacing = item.settings.lineSpacing ? `${item.settings.lineSpacing}` : '';

    const baseStyle = [
      align ? `text-align:${align}` : '',
      color ? `color:${color}` : '',
      bg ? `background-color:${bg}` : '',
      fontSize ? `font-size:${fontSize}` : '',
      fontFamily ? `font-family:${fontFamily},sans-serif` : '',
      bold ? 'font-weight:bold' : '',
      italic ? 'font-style:italic' : '',
      underline ? 'text-decoration:underline' : '',
      lineSpacing ? `line-height:${lineSpacing}` : '',
    ].filter(Boolean).join(';');

    const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    switch (item.type) {
      case 'paragraph': {
        const text = esc(item.content || '');
        return `<p class="doc-paragraph" style="${baseStyle}">${text}</p>`;
      }

      case 'heading': {
        const level = item.settings.headingLevel || 'h2';
        const text = esc(item.content || '');
        return `<${level} class="doc-${level}" style="${baseStyle}">${text}</${level}>`;
      }

      case 'button': {
        const btnColorMap: Record<string, { bg: string; color: string }> = {
          red: { bg: 'linear-gradient(135deg, #f87171, #ef4444)', color: '#ffffff' },
          yellow: { bg: 'linear-gradient(135deg, #fef08a, #eab308)', color: '#854d0e' },
          green: { bg: 'linear-gradient(135deg, #86efac, #22c55e)', color: '#ffffff' },
          blue: { bg: 'linear-gradient(135deg, #60a5fa, #2563eb)', color: '#ffffff' },
          purple: { bg: 'linear-gradient(135deg, #c084fc, #9333ea)', color: '#ffffff' }
        };
        const preset = btnColorMap[item.settings.buttonColor || 'red'] || btnColorMap['red'];
        // Use custom background if explicitly overridden
        const btnBg = (item.settings.backgroundColor && item.settings.backgroundColor !== 'transparent')
          ? item.settings.backgroundColor
          : preset.bg;
        // Use custom text color if explicitly overridden, otherwise use preset text color
        const btnTextColor = (item.settings.color && item.settings.color !== '#1e293b')
          ? item.settings.color
          : preset.color;
        const url = item.settings.buttonUrl || '#';
        const text = esc(item.content || 'Button');
        const br = item.settings.borderRadius ?? 25;
        const pd = item.settings.padding ?? 10;
        const btnFontSize = item.settings.fontSize ? `font-size:${item.settings.fontSize}pt;` : '';
        const btnFontFamily = item.settings.fontFamily ? `font-family:${item.settings.fontFamily},sans-serif;` : '';
        const btnBold = item.settings.bold ? 'font-weight:bold;' : 'font-weight:700;';
        const btnItalic = item.settings.italic ? 'font-style:italic;' : '';
        const btnTextDeco = item.settings.underline ? 'text-decoration:underline;' : 'text-decoration:none;';
        const btnStyle = `background:${btnBg};color:${btnTextColor};border-radius:${br}px;padding:${pd / 2}pt ${pd}pt;${btnFontSize}${btnFontFamily}${btnBold}${btnItalic}${btnTextDeco}display:inline-block;`;
        return `<div style="text-align:${align};margin-bottom:10pt"><a href="${url}" class="doc-button" style="${btnStyle}" target="_blank">${text}</a></div>`;
      }

      case 'image': {
        if (!item.content) return '';
        const w = item.settings.imageWidth || 100;
        const bw = item.settings.imageBorderWidth || 0;
        const bc = item.settings.color || '#333';
        const borderStyle = bw ? `border:${bw}px solid ${bc};` : '';
        return `<div class="doc-image" style="text-align:${align}"><img src="${item.content}" style="width:${w}%;${borderStyle}max-height:auto"></div>`;
      }

      case 'icon': {
        const sym = esc(item.content || '★');
        const sz = item.settings.iconSize || 36;
        const iColor = item.settings.color || '#ff1493';
        const iWeight = item.settings.iconWeight || 700;
        const iWidth = item.settings.iconWidth || 100;
        return `<div class="doc-icon" style="text-align:${align};width:${iWidth}%"><span style="font-size:${sz}pt;font-weight:${iWeight};color:${iColor}">${sym}</span></div>`;
      }

      case 'draw': {
        const dataUrl = canvasSnapshots[item.id] || (typeof item.content === 'string' && item.content.startsWith('data:') ? item.content : '');
        if (!dataUrl) return '';
        const w = item.settings.drawCanvasWidth || 100;
        return `<div class="doc-draw" style="text-align:${align}"><img src="${dataUrl}" style="width:${w}%;height:auto"></div>`;
      }

      case 'divide': {
        if (item.settings.listStyle && item.settings.listStyle !== 'none') {
          // List mode
          const items2 = item.listItems || [];
          const lColor = item.settings.listColor || item.settings.lineColor || '#ff1493';
          const lSize = item.settings.listFontSize || 16;
          const lSpacing = item.settings.listSpacing ?? 8;
          const getMarker = (idx: number) => {
            switch (item.settings.listStyle) {
              case 'numbered': return `${idx + 1}.`;
              case 'bullet': return '•';
              case 'star': return '★';
              case 'dash': return '–';
              case 'custom': return esc(item.settings.customListIcon || '★');
              default: return '•';
            }
          };
          const rows = items2.map((t, i) =>
            `<div class="doc-list-item" style="margin-bottom:${lSpacing}px;font-size:${lSize}px;font-family:${fontFamily || 'Inter'},sans-serif">
              <span class="doc-list-marker" style="color:${lColor}">${getMarker(i)}</span>
              <span class="doc-list-text" style="${color ? 'color:' + color : ''}">${esc(t)}</span>
            </div>`
          ).join('');
          return `<div class="doc-list" style="${baseStyle}">${rows}</div>`;
        } else {
          // Horizontal rule
          const lc = item.settings.lineColor || '#ff1493';
          const lw = item.settings.lineWidth ?? 2;
          const ls = item.settings.lineStyle || 'solid';
          return `<div class="doc-hr"><hr style="border:none;border-top:${lw}px ${ls} ${lc};margin:8pt 0"></div>`;
        }
      }

      case 'social': {
        const content = item.content || {};
        const iconSize = item.settings.socialIconSize || 34;
        const gap = item.settings.socialGap || 16;
        const links: string[] = [];

        const googleUrl = content.google || 'https://www.google.com';
        const googleText = content.googleText || 'Google';
        links.push(`<a href="${googleUrl}" class="doc-social-link" target="_blank">
          <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          ${item.settings.showGoogleLinkText ? `<span>${esc(googleText)}</span>` : ''}
        </a>`);

        const waUrl = content.whatsapp || 'https://wa.me/';
        const waText = content.whatsappText || 'WhatsApp';
        links.push(`<a href="${waUrl}" class="doc-social-link" target="_blank">
          <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M24 4C12.954 4 4 12.954 4 24C4 27.614 4.972 31.003 6.67 33.924L4.07 43.93L14.338 41.379C17.165 42.893 20.385 43.75 23.806 43.75C35.17 43.75 44 35.046 44 24C44 12.954 35.046 4 24 4Z" fill="#25D366"/>
            <path d="M35.176 30.007C34.727 31.23 32.741 32.313 31.723 32.481C30.805 32.631 29.638 32.697 28.356 32.277C27.573 32.022 26.574 31.685 25.29 31.122C20.073 28.862 16.674 23.563 16.413 23.216C16.152 22.869 14.229 20.311 14.229 17.666C14.229 15.021 15.668 13.722 16.199 13.147C16.73 12.572 17.348 12.434 17.706 12.434C18.064 12.434 18.422 12.437 18.736 12.453C19.067 12.47 19.516 12.332 19.959 13.411C20.413 14.52 21.526 17.166 21.66 17.427C21.795 17.688 21.884 17.992 21.705 18.34C21.526 18.688 21.437 18.905 21.176 19.21C20.915 19.514 20.628 19.888 20.391 20.126C20.13 20.387 19.859 20.669 20.165 21.201C20.471 21.733 21.514 23.44 23.064 24.822C25.065 26.602 26.756 27.155 27.287 27.416C27.818 27.677 28.131 27.633 28.437 27.285C28.742 26.937 29.74 25.766 30.09 25.234C30.44 24.703 30.793 24.79 31.279 24.964C31.766 25.138 34.402 26.44 34.933 26.701C35.464 26.962 35.822 27.093 35.957 27.32C36.091 27.547 36.091 28.57 35.643 29.793L35.176 30.007Z" fill="white"/>
          </svg>
          ${item.settings.showWhatsappLinkText ? `<span>${esc(waText)}</span>` : ''}
        </a>`);

        const igUrl = content.instagram || 'https://instagram.com/';
        const igText = content.instagramText || 'Instagram';
        links.push(`<a href="${igUrl}" class="doc-social-link" target="_blank">
          <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <defs><radialGradient id="ig-doc" cx="30%" cy="107%" r="150%">
              <stop offset="0%" stop-color="#ffd600"/>
              <stop offset="30%" stop-color="#ff6930"/>
              <stop offset="60%" stop-color="#e3178d"/>
              <stop offset="100%" stop-color="#4267B2"/>
            </radialGradient></defs>
            <rect width="48" height="48" rx="12" fill="url(#ig-doc)"/>
            <path d="M30 8H18C12.477 8 8 12.477 8 18V30C8 35.523 12.477 40 18 40H30C35.523 40 40 35.523 40 30V18C40 12.477 35.523 8 30 8ZM37.5 30C37.5 34.135 34.135 37.5 30 37.5H18C13.865 37.5 10.5 34.135 10.5 30V18C10.5 13.865 13.865 10.5 18 10.5H30C34.135 10.5 37.5 13.865 37.5 18V30Z" fill="white"/>
            <path d="M24 16C19.582 16 16 19.582 16 24C16 28.418 19.582 32 24 32C28.418 32 32 28.418 32 24C32 19.582 28.418 16 24 16ZM24 29.5C20.967 29.5 18.5 27.033 18.5 24C18.5 20.967 20.967 18.5 24 18.5C27.033 18.5 29.5 20.967 29.5 24C29.5 27.033 27.033 29.5 24 29.5Z" fill="white"/>
            <circle cx="33" cy="15" r="2.5" fill="white"/>
          </svg>
          ${item.settings.showInstagramLinkText ? `<span>${esc(igText)}</span>` : ''}
        </a>`);

        const fbUrl = content.facebook || 'https://facebook.com/';
        const fbText = content.facebookText || 'Facebook';
        links.push(`<a href="${fbUrl}" class="doc-social-link" target="_blank">
          <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M48 24C48 10.745 37.255 0 24 0C10.745 0 0 10.745 0 24C0 35.979 8.776 45.902 20.25 47.709V30.938H14.156V24H20.25V18.712C20.25 12.696 23.832 9.375 29.315 9.375C31.941 9.375 34.688 9.844 34.688 9.844V15.75H31.661C28.68 15.75 27.75 17.6 27.75 19.5V24H34.406L33.337 30.938H27.75V47.709C39.224 45.902 48 35.979 48 24Z" fill="#1877F2"/>
            <path d="M33.337 30.938L34.406 24H27.75V19.5C27.75 17.601 28.68 15.75 31.661 15.75H34.688V9.844C34.688 9.844 31.942 9.375 29.315 9.375C23.833 9.375 20.25 12.696 20.25 18.712V24H14.156V30.938H20.25V47.709C21.478 47.9 22.727 48 24 48C25.273 48 26.522 47.9 27.75 47.709V30.938H33.337Z" fill="white"/>
          </svg>
          ${item.settings.showFacebookLinkText ? `<span>${esc(fbText)}</span>` : ''}
        </a>`);

        const justifyContent = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : align === 'justify' ? 'space-between' : 'center';
        return `<div class="doc-social" style="justify-content:${justifyContent};gap:${gap}px">${links.join('')}</div>`;
      }

      case 'divider': {
        // Column / Divider block
        if (!item.sections || item.sections.length === 0) return '';
        const layout = item.settings.dividerLayout || '50-50';
        const widths = this.getColumnWidths(layout, item.sections.length);
        const cols = item.sections.map((sec, idx) => {
          const colContent = this.renderItemsToHtml(sec.items, canvasSnapshots);
          const w = widths[idx] ? `flex:${widths[idx]}; min-width:0;` : 'flex:1; min-width:0;';
          return `<div class="doc-col" style="${w}">${colContent}</div>`;
        }).join('');
        return `<div class="doc-columns">${cols}</div>`;
      }

      default:
        return '';
    }
  }

  private getColumnWidths(layout: string, count: number): number[] {
    switch (layout) {
      case '100': return [100];
      case '50-50': return [50, 50];
      case '60-40': return [60, 40];
      case '70-30': return [70, 30];
      case '25-25-25-25': return [25, 25, 25, 25];
      default: {
        const parts = layout.split('-').map(Number).filter(n => !isNaN(n));
        return parts.length === count ? parts : Array(count).fill(Math.floor(100 / count));
      }
    }
  }
}


