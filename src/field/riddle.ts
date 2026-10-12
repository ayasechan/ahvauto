import { setAlarm } from '../notify/notify';
import { alertId } from '../platform/dom-ids';

/**
 * 答题告警（只报警，不答题）。
 * 现行小马题是多选勾选＋无对错反馈，旧的单选辅助（答题条/A-B-C 快捷键/
 * 自动提交）已全部移除；保留桌面通知＋循环音频，任意按键停音频。
 */
export function riddleAlert(): void {
  void setAlarm('Riddle');
  document.addEventListener(
    'keydown',
    () => {
      (document.getElementById(alertId('Riddle')) as HTMLAudioElement | null)?.pause();
    },
    { once: true },
  );
}
