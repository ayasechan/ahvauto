/** Webhook 数据模板：{var} 占位发送前替换。纯字符串替换，不用 eval/正则，保证 CSP 安全。 */

export interface WebhookVars {
  kind: string;
  title: string;
  text: string;
  url: string;
  time: string;
}

export const WEBHOOK_VAR_NAMES = ['kind', 'title', 'text', 'url', 'time'] as const;

/** 渲染模板：已知变量逐个替换，未知占位原样保留。 */
export function renderTemplate(tpl: string, vars: WebhookVars): string {
  let out = tpl;
  for (const k of WEBHOOK_VAR_NAMES) {
    out = out.split(`{${k}}`).join(vars[k]);
  }
  return out;
}
