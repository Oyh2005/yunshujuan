/** 路由懒加载 fallback：全高卡片骨架（弱网首访切页时观感完整，避免居中小块跳动） */
export default function LoadingSkeleton() {
  return (
    <div className="h-full w-full animate-pulse overflow-hidden p-6">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        {/* 页头条 */}
        <div className="h-9 w-2/5 rounded-xl bg-[var(--color-bg-tertiary)]" />
        <div className="h-4 w-1/3 rounded-lg bg-[var(--color-bg-tertiary)]" />
        {/* 卡片网格 */}
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
              <div className="h-10 w-10 rounded-xl bg-[var(--color-bg-tertiary)]" />
              <div className="h-4 w-3/4 rounded-lg bg-[var(--color-bg-tertiary)]" />
              <div className="h-3 w-full rounded-md bg-[var(--color-bg-tertiary)]" />
              <div className="h-3 w-5/6 rounded-md bg-[var(--color-bg-tertiary)]" />
              <div className="h-3 w-2/3 rounded-md bg-[var(--color-bg-tertiary)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
