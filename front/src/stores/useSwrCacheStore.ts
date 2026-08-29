/**
 * SWR（stale-while-revalidate）本地缓存：内存 Map + localStorage 持久化。
 *
 * 用法：展示型页面（列表/侧栏）挂载时先读缓存秒开渲染，请求成功后写缓存；
 * 旧数据在后台刷新完成前先展示，实现「刷新页面不转圈」。
 *
 * 约定：
 * - key 必须包含 `:{userId}:` 片段（如 `note-list:{userId}:{category}:{sortBy}`），
 *   保证用户间隔离且 clearUser 能按用户清空
 * - 编辑器等「用户会修改数据」的场景不要用（stale 内容可能覆盖用户输入）
 * - localStorage 写入失败（隐私模式/存满）自动降级为纯内存缓存
 */

const PREFIX = 'swr:'

interface CacheEntry {
  data: unknown
  savedAt: number
}

const memory = new Map<string, CacheEntry>()

function readStorage(key: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as CacheEntry) : null
  } catch {
    return null
  }
}

export const swrCache = {
  get<T>(key: string): T | undefined {
    const entry = memory.get(key) ?? readStorage(key)
    return entry?.data as T | undefined
  },

  set(key: string, data: unknown): void {
    const entry: CacheEntry = { data, savedAt: Date.now() }
    memory.set(key, entry)
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(entry))
    } catch {
      /* 存储不可用时降级为内存缓存 */
    }
  },

  remove(key: string): void {
    memory.delete(key)
    try {
      localStorage.removeItem(PREFIX + key)
    } catch {
      /* ignore */
    }
  },

  /** 清空某用户的所有缓存（登出/切换账号时调用） */
  clearUser(userId: string): void {
    try {
      const doomed: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(PREFIX) && key.includes(`:${userId}:`)) doomed.push(key)
      }
      for (const key of doomed) {
        memory.delete(key.slice(PREFIX.length))
        localStorage.removeItem(key)
      }
    } catch {
      /* ignore */
    }
  },
}
