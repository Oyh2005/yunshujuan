# AIChat 新会话首问闪屏问题排查全记录

> 日期：2026-08-29
> 状态：✅ 已解决（用户确认）
> 关联：`plan/2026-08-27-HANDOFF-NEXT-AGENT.md` 踩坑 27
> 相关代码：`front/src/layouts/MainLayout.tsx`、`front/src/pages/AIChat.tsx`

---

## 一、现象

新开一个会话，向 AI 问第一个问题，**回答完成后网页会"闪一下"**。
（用户两次反馈同一现象：首次反馈修复后无效，强刷浏览器后仍复现。）

## 二、第一轮排查（误判）

### 表面观察
- 回答完成后 URL 从 `/chat` 自动变为 `/chat/{新会话id}`（onDone 里 `navigate(..., { replace: true })`）
- URL 变化触发 AIChat 的 `useEffect([sessionId])` 历史加载：`setMessages([])` 清空 → `setLoadingHistory(true)` → 重新 GET 历史 → 重绘

### 第一版修复（AIChat 内守卫）
- `activeSessionRef`：记录"内存中消息属于哪个会话"（onDone/提问/加载成功时更新）
- `messagesRef`：effect 同步消息快照
- 历史加载 effect 开头：若「内存消息即该会话刚聊的」则跳过重载
- 并修复了守卫误判（加载成功后才更新归属、失败置 null——否则切会话再切回会"会话消失"）

### 结果：**无效**
用户强刷后依然闪屏。守卫逻辑本身正确，但从未生效——**有更上层的机制绕过了它**。

## 三、第二轮排查（真根因）

### 关键发现
`MainLayout.tsx` 中页面容器：

```jsx
<div key={location.pathname} className="page-enter h-full">
  <Outlet />
</div>
```

**`key={location.pathname}` 会在路径变化时强制卸载并重挂载整个 `<Outlet />`**（这是项目"页面切换淡入动画"的实现方式）。

### 完整闪屏链条
```
回答完成 → onDone → navigate('/chat/新id')
  → location.pathname 变化（/chat → /chat/xxx）
  → key 变化 → AIChat 被 React 强制卸载 + 重新挂载
  → 守卫 ref（activeSessionRef/messagesRef）随组件销毁 → 全部重置为初始值 → 守卫失效
  → 新实例挂载 → messages 为空 → 历史加载 effect 正常执行
     （清空 + "正在打开会话…" + 重新 GET 历史 + 重绘）
  → 外加 page-enter 淡入动画重播
  → 整页闪一下
```

**教训：组件级守卫无法对抗组件级重挂载——修复必须验证"根因是否被更上层的机制绕过"。**

## 四、修复（双层）

### ① MainLayout：key 归一化（治本）
```jsx
<div key={location.pathname.startsWith('/chat') ? '/chat' : location.pathname} className="page-enter h-full">
```
- `/chat` 与 `/chat/:id` 视为同一页面组 → 会话跳转**不重挂载** → 守卫真正生效
- 会话间切换（/chat/A → /chat/B）也不重挂载，走 effect 正常加载（小行 loading，不整页闪）
- 其他所有页面 key 行为不变（页面切换动画照旧）

### ② AIChat：守卫保留（防 effect 重载）
- 不重挂载后，`useEffect([sessionId])` 仍会因 sessionId 变化触发——守卫跳过"内存已有该会话消息"时的重载
- 两层缺一不可：① 防重挂载（否则 ref 重置），② 防重载（否则消息清空）

## 五、验证

- ✅ tsc 0 错误、eslint 0 问题
- ✅ 用户浏览器实测：新会话首问回答完成后无闪屏
- 侧栏"最近对话"在回答完成后 250ms 刷新（onDone → loadRecentSessions），新会话插入列表会有轻微位移——非整页闪屏，用户未再反馈

## 六、经验沉淀

1. **排查"闪屏/跳变"类问题先看路由与组件挂载生命周期**：`key={pathname}` 强制重挂载是隐藏的大杀器，任何"组件内状态修复"都会被它清零
2. **修复无效时先怀疑"修复没被执行"**：守卫代码存在 ≠ 守卫生效（dev server 编译最新代码已排除，最终定位为守卫被重挂载绕过）
3. **React 19 约束**：渲染期写 ref 触发 eslint `react-hooks/refs`，状态快照同步必须放 effect
4. **防闪屏守卫的三处更新时机**：提问时（归属当前会话）、回答完成时（归属新会话）、历史加载成功/失败时（严格同步内存归属），缺一处都会产生误判（跳会话后历史不加载 = "会话消失" bug）
