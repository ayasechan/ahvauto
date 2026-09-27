<script lang="ts">
  import { options } from '../lib/store';
  import { tr } from '../lib/i18n';
  import { compileExpression } from '../lib/expr/index';
  import { EXPR_HINTS } from '../lib/conditions';

  let { expr = $bindable(''), title = '' }: { expr: string; title?: string } = $props();

  let error = $derived.by(() => {
    const v = (expr ?? '').trim();
    if (!v) return '';
    try {
      compileExpression(v);
      return '';
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  });

  let area: HTMLTextAreaElement | undefined = $state(undefined);

  function insert(text: string) {
    if (!area) {
      expr = `${expr ?? ''}${text}`;
      return;
    }
    const start = area.selectionStart ?? (expr ?? '').length;
    const end = area.selectionEnd ?? start;
    const cur = expr ?? '';
    expr = cur.slice(0, start) + text + cur.slice(end);
    requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      const pos = start + text.length;
      area.setSelectionRange(pos, pos);
    });
  }
</script>

<div class="cond" data-title={title}>
  <textarea
    bind:this={area}
    bind:value={expr}
    rows="2"
    placeholder={tr($options.lang, 'ed.ph')}
    class:bad={error !== ''}
    spellcheck={false}
  ></textarea>
  {#if error === ''}
    <div class="ok">{(expr ?? '').trim() ? tr($options.lang, 'ed.ok') : tr($options.lang, 'ed.empty')}</div>
  {:else}
    <div class="err">✗ {error}</div>
  {/if}
  <div class="hints">
    {#each EXPR_HINTS as h}
      <button type="button" title="插入 {h.insert}" onclick={() => insert(h.insert)}>{h.label}</button>
    {/each}
  </div>
</div>

<style>
  .cond { margin-top: 6px; }
  .cond textarea {
    width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace;
    background: var(--hv-input, #f1f5f9);
    border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;
    color: #1e293b; resize: vertical;
  }
  .cond textarea.bad { border-color: #fca5a5; background: #fef2f2; outline: 2px solid #fecaca; }
  .ok { color: #16a34a; font-size: 12px; margin-top: 4px; }
  .err { color: #dc2626; font-size: 12px; margin-top: 4px; }
  .hints { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
  .hints button {
    margin: 0; font-size: 12px; border-radius: 999px;
    border: 1px solid #bfdbfe; background: #eef2ff; color: #2563eb; padding: 2px 10px;
  }
  .hints button:hover { background: #dbeafe; color: #1d4ed8; }
</style>
