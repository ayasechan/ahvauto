<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
</script>

<div>
  <p>{tr($options.lang, 'feedback.text')}</p>
  <ul>
    <li>
      <a href="https://github.com/dodying/UserJs/issues" target="_blank" rel="noreferrer"
        >{tr($options.lang, 'feedback.issue')}</a
      >
    </li>
    <li>
      <a
        href="https://github.com/dodying/UserJs/commits/master/HentaiVerse/hvAutoAttack/hvAutoAttack.user.js"
        target="_blank"
        rel="noreferrer">{tr($options.lang, 'feedback.history')}</a
      >
    </li>
  </ul>
</div>
