import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(async () => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; },
      length: 0,
      key: () => null
    };

    Object.defineProperty(window, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true
    });

    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render Notepad Workspace and Save button in header', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.neon-title')?.textContent).toContain('Notepad Workspace');
    expect(compiled.querySelector('.save-doc-btn')?.textContent).toContain('Save');
  });

  it('should save notepad content to localStorage when saveDocument is called', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    localStorage.removeItem('notepad_snapshots');

    app.notepadItems = [{
      id: 'test-item-1',
      type: 'paragraph',
      content: 'Local storage test note',
      settings: { fontSize: 16 }
    }];

    app.saveDocument();

    const stored = JSON.parse(localStorage.getItem('notepad_snapshots') || '[]');
    expect(stored.length).toBeGreaterThan(0);
    expect(stored[0].items[0].content).toBe('Local storage test note');
  });

  it('should open preview and preserve notepad items without resetting them', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.notepadItems = [{
      id: 'test-2',
      type: 'heading',
      content: 'My Awesome Document',
      settings: { fontSize: 24 }
    }];

    app.saveDocument();
    app.openPreview();

    expect(app.isPreviewMode).toBe(true);
    expect(app.savedSnapshots.length).toBeGreaterThan(0);
    // Notepad content must remain completely intact
    expect(app.notepadItems.length).toBe(1);
    expect(app.notepadItems[0].content).toBe('My Awesome Document');

    app.closePreview();
    expect(app.isPreviewMode).toBe(false);
    expect(app.notepadItems.length).toBe(1);
    expect(app.notepadItems[0].content).toBe('My Awesome Document');
  });

  it('should load selected snapshot into notepad and close preview while preserving local storage', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    // Save initial state 1
    app.notepadItems = [{
      id: 'doc-item-1',
      type: 'heading',
      content: 'Chapter 1: Beginnings',
      settings: { fontSize: 28 }
    }];
    app.saveDocument();

    // Save state 2
    app.notepadItems = [{
      id: 'doc-item-2',
      type: 'paragraph',
      content: 'Chapter 2: The Journey',
      settings: { fontSize: 16 }
    }];
    app.saveDocument();

    // Open preview
    app.openPreview();
    expect(app.isPreviewMode).toBe(true);
    expect(app.savedSnapshots.length).toBe(2);

    // Select the older snapshot (Chapter 1)
    const olderSnapshot = app.savedSnapshots[1];
    expect(olderSnapshot.items[0].content).toBe('Chapter 1: Beginnings');

    // Click to load into Notepad
    app.loadSnapshotIntoNotepad(olderSnapshot);

    // 1. Content in Notepad must be restored to Chapter 1
    expect(app.notepadItems.length).toBe(1);
    expect(app.notepadItems[0].content).toBe('Chapter 1: Beginnings');

    // 2. 30% panel returns to normal state
    expect(app.isPreviewMode).toBe(false);

    // 3. Local Storage is NEVER erased or deleted when opening
    const storedAfterLoad = JSON.parse(localStorage.getItem('notepad_snapshots') || '[]');
    expect(storedAfterLoad.length).toBe(2);

    // 4. Content is editable
    app.notepadItems[0].content = 'Chapter 1: Revised Edition';
    expect(app.notepadItems[0].content).toBe('Chapter 1: Revised Edition');
  });
});
