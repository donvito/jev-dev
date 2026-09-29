<script lang="ts">
  import { onMount } from 'svelte';
  import { Annotation, Compartment, EditorSelection, EditorState, Transaction } from '@codemirror/state';
  import { EditorView, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { bracketMatching, HighlightStyle, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from '@codemirror/language';
  import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
  import { json } from '@codemirror/lang-json';
  import { tags } from '@lezer/highlight';

  interface Props {
    value: string;
    onchange?: (value: string) => void;
    readonly?: boolean;
    label: string;
    language?: 'json' | 'text';
    wrap?: boolean;
  }

  let { value, onchange, readonly: isReadonly = false, label, language = 'json', wrap = true }: Props = $props();
  let host: HTMLDivElement;
  let editor = $state.raw<EditorView | null>(null);

  const externalUpdate = Annotation.define<boolean>();
  const languageConfig = new Compartment();
  const editingConfig = new Compartment();
  const wrappingConfig = new Compartment();
  const accessibilityConfig = new Compartment();

  const editingExtensions = (readonly: boolean) => [
    EditorState.readOnly.of(readonly),
    EditorView.editable.of(!readonly),
  ];
  const accessibilityExtensions = (name: string, readonly: boolean) => EditorView.contentAttributes.of({
    'aria-label': name,
    'aria-readonly': String(readonly),
    'aria-multiline': 'true',
    spellcheck: 'false',
    autocapitalize: 'off',
    tabindex: '0',
  });

  // CSS variables update paint only, preserving the document, selection, and undo history.
  const jsonHighlight = HighlightStyle.define([
    { tag: tags.propertyName, color: 'var(--syntax-key)', fontWeight: '500' },
    { tag: tags.string, color: 'var(--syntax-string)' },
    { tag: tags.number, color: 'var(--syntax-number)' },
    { tag: tags.bool, color: 'var(--syntax-boolean)', fontWeight: '500' },
    { tag: tags.null, color: 'var(--syntax-null)', fontStyle: 'italic' },
    { tag: tags.punctuation, color: 'var(--syntax-punctuation)' },
    { tag: tags.bracket, color: 'var(--syntax-bracket)' },
    { tag: tags.invalid, color: 'var(--syntax-invalid)', textDecoration: 'underline wavy' },
  ]);

  const theme = EditorView.theme({
    '&': { height: '100%', minHeight: '0', backgroundColor: 'var(--surface, #fff)', color: 'var(--text-primary, #111)', fontSize: '12px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto', fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.65' },
    '.cm-content': { padding: '12px 0', caretColor: 'var(--caret, #000)' },
    '.cm-line': { padding: '0 12px' },
    '.cm-gutters': { backgroundColor: 'var(--surface-subtle, #fafafa)', color: 'var(--text-muted, #666)', borderRight: '1px solid var(--border, #ddd)' },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '32px', padding: '0 8px 0 12px' },
    '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer' },
    '.cm-activeLine': { backgroundColor: 'var(--surface-hover, #f3f3f3)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--surface-active, #eee)', color: 'var(--text-secondary, #333)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--selection, #dedede)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--caret, #000)' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--surface-active, #eee)', outline: '1px solid var(--border-strong, #aaa)' },
    '&.cm-focused .cm-nonmatchingBracket': { color: 'var(--text-primary, #111)', textDecoration: 'underline wavy var(--focus, #777)' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--surface-hover, #f3f3f3)', border: '1px solid var(--border, #ddd)', color: 'var(--text-muted, #666)', padding: '0 3px' },
    '.cm-tooltip': { border: '1px solid var(--border, #ddd)', backgroundColor: 'var(--surface, #fff)', color: 'var(--text-primary, #111)', borderRadius: '4px' },
  });

  onMount(() => {
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          foldGutter(),
          highlightActiveLineGutter(),
          drawSelection(),
          dropCursor(),
          highlightActiveLine(),
          history(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          EditorState.tabSize.of(2),
          syntaxHighlighting(jsonHighlight),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
          languageConfig.of(language === 'json' ? json() : []),
          editingConfig.of(editingExtensions(isReadonly)),
          wrappingConfig.of(wrap ? EditorView.lineWrapping : []),
          accessibilityConfig.of(accessibilityExtensions(label, isReadonly)),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((transaction) => transaction.annotation(externalUpdate))) {
              onchange?.(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    editor = view;
    return () => {
      editor = null;
      view.destroy();
    };
  });

  // Parent edits (format, restore, or a new session) should not echo onchange.
  // Retain cursor offsets where possible instead of moving the cursor to the end.
  $effect(() => {
    const view = editor;
    if (!view || view.state.doc.toString() === value) return;
    const selection = EditorSelection.create(
      view.state.selection.ranges.map((range) => EditorSelection.range(
        Math.min(range.anchor, value.length), Math.min(range.head, value.length),
      )),
      view.state.selection.mainIndex,
    );
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection,
      effects: view.scrollSnapshot(),
      annotations: [externalUpdate.of(true), Transaction.addToHistory.of(false)],
    });
  });

  $effect(() => { editor?.dispatch({ effects: languageConfig.reconfigure(language === 'json' ? json() : []) }); });
  $effect(() => { editor?.dispatch({ effects: editingConfig.reconfigure(editingExtensions(isReadonly)) }); });
  $effect(() => { editor?.dispatch({ effects: wrappingConfig.reconfigure(wrap ? EditorView.lineWrapping : []) }); });
  $effect(() => { editor?.dispatch({ effects: accessibilityConfig.reconfigure(accessibilityExtensions(label, isReadonly)) }); });
</script>

<div class="code-editor-host" bind:this={host}></div>

<style>
  .code-editor-host { display: flex; flex: 1; min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
  .code-editor-host :global(.cm-editor) { flex: 1; min-width: 0; }
</style>
