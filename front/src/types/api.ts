export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface UserInfo {
  id?: string
  user_id?: string
  uuid?: string
  username: string
  email: string
  phone?: string
  gender?: string
  bio?: string
  avatar?: string
  date_joined?: string
  is_active?: boolean
}

export interface LoginResponse {
  token: string
  user: UserInfo
}

export interface Note {
  id: string
  user_id: string
  title: string
  content: string
  // Newly created notes can have null tags while automatic tagging is pending.
  tags?: string[] | null
  category: string
  is_pinned: boolean
  is_public: boolean
  view_count: number
  created_at: string
  updated_at: string
}

export interface NoteListResponse {
  notes: Note[]
  total_count: number
}

export interface NoteTemplate {
  id: string
  user_id: string
  name: string
  icon: string
  category: string
  title: string
  content: string
  tags: string[]
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface NoteStats {
  total: number
  categories: { category: string; count: number }[]
  uncategorized: number
}

export interface DeleteCategoryResponse {
  deleted_count: number
}

export interface ChatSession {
  id: string
  user_id?: string
  title: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: number
  session_id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface KnowledgeDocument {
  id: string
  user_id: string
  md5: string
  filename: string
  file_size: number
  file_type: string
  status: string
  chunk_count: number
  created_at: string
}

export interface KnowledgeChunk {
  chunk_id: string
  index: number
  content: string
  page: number
  images: string[]
}

export interface KnowledgeDocumentDetail {
  id: string
  user_id: string
  md5: string
  filename: string
  chunk_count: number
  content: string
  images: string[]
  created_at: string | null
  chunks: KnowledgeChunk[]
}

export interface RelatedFragment {
  id: string
  title: string
  content_preview: string
  content: string
  similarity: number
  source: 'knowledge_base' | 'note'
}

export interface BatchIdsRequest {
  ids: string[]
}

export interface BatchCategoryRequest {
  ids: string[]
  category: string
}

export interface ReviewItem {
  review_id: string
  note_id: string
  title: string
  content_preview: string
  tags: string[]
  category: string
  review_count: number
  last_reviewed_at: string | null
  interval_days: number
}

export interface ReviewQuestion {
  question: string
  choices: string[]
  answer: string
}

export interface ReviewListData {
  reviews: ReviewItem[]
  total_count: number
}

// ── Stats Dashboard（M2 知识仪表盘）──
export interface StatsSummary {
  total_notes: number
  total_chars: number
  year_notes: number
  year_chars: number
  total_reviews: number
  week_reviews: number
  today_reviews: number
  ai_messages: number
  kb_docs: number
}

export interface StatsCategory {
  category: string
  count: number
}

export interface StatsTrendItem {
  date: string
  chars: number
}

export interface StatsDashboard {
  summary: StatsSummary
  /** 近 365 天每日笔记数 {"2026-08-26": 3} */
  heatmap: Record<string, number>
  /** 近 30 天每日写作字数 */
  trend: StatsTrendItem[]
  categories: StatsCategory[]
  uncategorized: number
}

// ── 双链（M4a）──
export interface BacklinkItem {
  note_id: string
  title: string
  updated_at: string | null
}

export interface BacklinksData {
  /** 引用当前笔记标题的其他笔记 */
  backlinks: BacklinkItem[]
  /** 当前笔记引用的 [[标题]] 列表 */
  outlinks: string[]
}

// ── 知识图谱（M4b）──
export interface GraphNode {
  id: string
  title: string
  category: string | null
}

export interface GraphLink {
  source: string
  target: string
  /** link = 双链，similar = 语义相似 */
  type: 'link' | 'similar'
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
  semantic_status?: 'not_requested' | 'complete' | 'partial' | 'unavailable'
}

// ── 社交（方向 B：好友 + 动态流）──
export interface SocialUser {
  user_id: string
  username: string
  avatar: string | null
  bio?: string | null
}

export interface FriendRequestItem {
  request_id: string
  user_id: string
  username: string
  avatar: string | null
  created_at: string | null
}

export interface PostAuthor {
  user_id: string
  username: string
  avatar: string | null
}

export interface Post {
  id: number
  user_id: string
  author: PostAuthor
  content: string
  images: string[]
  note_id: string | null
  note_title: string | null
  like_count: number
  liked_by_me: boolean
  comment_count: number
  /** AI 审核状态：pending 审核中 / passed 通过 / rejected 未通过（他人不可见） */
  review_status: 'pending' | 'passed' | 'rejected'
  created_at: string | null
}

export interface PostCommentItem {
  id: string
  user_id: string
  username: string
  avatar: string | null
  content: string
  created_at: string | null
}

export interface PostDetail extends Post {
  comments: PostCommentItem[]
}

export interface FeedData {
  posts: Post[]
  next_cursor: number | null
}

export interface NotificationItem {
  id: string
  type: 'friend_request' | 'friend_accepted' | 'like' | 'comment'
  post_id: number | null
  content: string | null
  read: boolean
  actor: PostAuthor
  created_at: string | null
}

// ── 知识广场 + 排行榜（方向 C 一期）──
export interface PlazaNote {
  id: string
  title: string
  content_preview: string
  category: string | null
  tags: string[]
  author: PostAuthor
  view_count: number
  updated_at: string | null
}

export interface PlazaData {
  notes: PlazaNote[]
  total: number
  has_more: boolean
}

export interface LeaderboardItem {
  user_id: string
  username: string
  avatar: string | null
  value: number
}

export interface LeaderboardData {
  writing: LeaderboardItem[]
  review: LeaderboardItem[]
  /** 连续写作打卡榜（habit 上云数据） */
  streak: LeaderboardItem[]
}

// ── 个人主页 + 关注/成就（方向 C 二期）──
export interface UserProfile {
  user_id: string
  username: string
  avatar: string | null
  bio: string | null
  date_joined: string | null
}

export interface ProfileStats {
  notes: number
  public_notes: number
  reviews: number
  posts: number
  kb_docs: number
}

export interface AchievementItem {
  id: string
  unlocked: boolean
}

export interface UserProfileData {
  user: UserProfile
  stats: ProfileStats
  follow: {
    is_following: boolean
    is_self: boolean
    follower_count: number
    following_count: number
  }
  achievements: AchievementItem[]
}

export interface SSEMessage {
  type: 'thinking' | 'response' | 'done' | 'error'
  content?: string
  session_id?: string
  stage?: string
  details?: Record<string, unknown>
}

export interface KnowledgeSSEMessage {
  event_type: 'processing' | 'completed' | 'error' | 'finish'
  filename?: string
  progress?: number
  current?: number
  total?: number
  message?: string
  md5?: string
  knowledge_id?: string
  status?: string
  error_message?: string
}
