/**
 * SOLOIPS-WEB-CLIENT-COMPANY-ICON
 *
 * 侧栏面板行的**图标**（`sidebar.panellist` 槽位的 `owner` 是
 * `{ size: number; active: boolean }`——该槽位只放一个 16/18px 的字形，不放内容）。
 *
 * ── 为什么是图标而不是面板本体（实测纠正）──────────────────────────────────
 * 首版把整个面板组件注册进 `sidebar.panellist`，浏览器实测暴露两处错位：
 *  1. 该槽位在侧栏里的渲染位置是 `<span class="panelGlyph">{renderSlot(...)}</span>`
 *     （`ui-sidebar/src/client/SidebarRoot.tsx:71`），宽度只有 16/18px——整块面板
 *     被压进图标格，页面截图里只剩一行被裁掉的文字；
 *  2. 该行的 `onClick` 是 `selectPanel(id)`，而 `LayoutController.selectPanel`
 *     对**未注册**的 `main` key **抛错**
 *     （`layout.selectPanel: main panel "…" is not registered`，实测于页面异常
 *     记录）——因为 `main` 槽位里没有同 key 的面板。
 * 正确的接法是**成对注册**：`main` 里放面板本体（`kind: 'keyed'`），
 * `sidebar.panellist` 里放本图标（`kind: 'list'`，id 与 key 同名）。
 *
 * ── 为什么手写 SVG 而不复用官方图标集 ───────────────────────────────────────
 * 官方图标在 `@deepseek-ai/dsh-client-ui-primitives` 里，而本包的放行面**不含**
 * 该能力包（DEV-04 的窄口径）。一个 16px 的字形不值得为它开一条依赖——就地画。
 *
 * 〔约束〕本文件**不得**含用户可见文案：图标是 `aria-hidden` 的装饰（侧栏行的
 * 无障碍名由 `PanelRow` 的 `aria-label={label}` 提供，取自字典）。零硬编码门禁
 * 会扫描本文件。
 */

/**
 * 公司面板的侧栏图标（一栋简笔建筑，16px 网格）。
 *
 * @param props - 侧栏提供的字形面：`size` 是边长像素，`active` 是选中态
 *   （选中态由侧栏的 `.panelActive` 类着色，故本组件不消费它——保留参数是为了
 *   与 `owner` 面逐字一致，多声明一个用不上的参数会让「谁负责选中态」含糊）。
 * @returns 图标元素。
 */
export function SoloipsCompanyIcon({ size }: { readonly size: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* 楼体 */}
      <path d="M2.5 13.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v9" />
      {/* 楼顶 */}
      <path d="M1.5 13.5h13" />
      {/* 右侧副楼（子公司意象） */}
      <path d="M8.5 13.5V8.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5" />
      {/* 窗 */}
      <path d="M4.5 6.5h1.5M4.5 9h1.5M4.5 11.5h1.5" />
    </svg>
  );
}
