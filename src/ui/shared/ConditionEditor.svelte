<script lang="ts">
  import { options } from '../../config/store';
  import { tr, formatExprError } from '../../platform/i18n';
  import { compileExpression } from '../../expr/index';
  import { EXPR_HINTS } from '../../combat/escape-cond';

  let { expr = $bindable(''), title = '' }: { expr: string; title?: string } = $props();

  let error = $derived.by(() => {
    const v = (expr ?? '').trim();
    if (!v) return '';
    try {
      compileExpression(v);
      return '';
    } catch (e) {
      return formatExprError($options.lang, e);
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
    placeholder={tr($options.lang, 'editor.ph')}
    aria-label={title || tr($options.lang, 'editor.ph')}
    aria-invalid={error !== ''}
    class:bad={error !== ''}
    spellcheck={false}></textarea>
  {#if error === ''}
    <div class="ok">
      {(expr ?? '').trim() ? tr($options.lang, 'editor.ok') : tr($options.lang, 'editor.empty')}
    </div>
  {:else}
    <div class="err" role="alert">✗ {error}</div>
  {/if}
  <div class="hints">
    {#each EXPR_HINTS as h}
      <button
        type="button"
        title={`${tr($options.lang, 'editor.insert')} ${h.insert}`}
        onclick={() => insert(h.insert)}
        aria-label={`${tr($options.lang, 'editor.insert')} ${h.insert}`}>{h.label}</button
      >
    {/each}
  </div>
</div>

<style>
  .cond {
    margin-top: 6px;
  }
  .cond textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--ahvauto-mono);
    background: var(--ahvauto-input);
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 8px 10px;
    color: var(--ahvauto-t1);
    resize: vertical;
  }
  .cond textarea.bad {
    border-color: var(--ahvauto-danger-border);
    background: var(--ahvauto-danger-soft);
    outline: 2px solid var(--ahvauto-danger-border);
  }
  .ok {
    color: var(--ahvauto-success);
    font-size: 12px;
    margin-top: 4px;
  }
  .err {
    color: var(--ahvauto-danger);
    font-size: 12px;
    margin-top: 4px;
  }
  .hints {
    margin-top: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .hints button {
    margin: 0;
    font-size: 12px;
    border-radius: 999px;
    border: 1px solid var(--ahvauto-primary-border);
    background: var(--ahvauto-primary-soft);
    color: var(--ahvauto-primary);
    padding: 2px 10px;
  }
  .hints button:hover {
    background: var(--ahvauto-primary-hover);
    color: var(--ahvauto-primary-active);
  }
</style>
