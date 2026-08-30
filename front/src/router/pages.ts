import { lazy } from 'react'

/**
 * 页面 chunk 加载器：`lazy()` 与预加载（hover/空闲 prefetch）共用同一 `import()`，
 * 保证预取过的 chunk 不会被重复请求。
 */
export const loadPage = {
  login: () => import('../pages/Login'),
  register: () => import('../pages/Register'),
  forgotPassword: () => import('../pages/ForgotPassword'),
  dashboard: () => import('../pages/Dashboard'),
  noteList: () => import('../pages/NoteList'),
  noteEditor: () => import('../pages/NoteEditor'),
  aiChat: () => import('../pages/AIChat'),
  sessions: () => import('../pages/Sessions'),
  knowledge: () => import('../pages/KnowledgeBase'),
  pet: () => import('../pages/PetPage'),
  habit: () => import('../pages/HabitPage'),
  stats: () => import('../pages/StatsPage'),
  graph: () => import('../pages/GraphPage'),
  share: () => import('../pages/PublicSharePage'),
  social: () => import('../pages/SocialFeed'),
  friends: () => import('../pages/FriendsPage'),
  notifications: () => import('../pages/NotificationsPage'),
  messages: () => import('../pages/MessagesPage'),
  plaza: () => import('../pages/PlazaPage'),
  userProfile: () => import('../pages/UserProfilePage'),
  pomodoro: () => import('../pages/PomodoroPage'),
  review: () => import('../pages/DailyReview'),
  profile: () => import('../pages/Profile'),
  settings: () => import('../pages/Settings'),
  about: () => import('../pages/AboutUs'),
} as const

/** 侧边栏路径 → 加载器（hover/聚焦时精确预取） */
export const PREFETCH_BY_PATH: Record<string, () => Promise<unknown>> = {
  '/notes': loadPage.noteList,
  '/notes/new': loadPage.noteEditor,
  '/knowledge': loadPage.knowledge,
  '/graph': loadPage.graph,
  '/stats': loadPage.stats,
  '/plaza': loadPage.plaza,
  '/chat': loadPage.aiChat,
  '/sessions': loadPage.sessions,
  '/review': loadPage.review,
  '/habit': loadPage.habit,
  '/pomodoro': loadPage.pomodoro,
  '/social': loadPage.social,
  '/friends': loadPage.friends,
  '/messages': loadPage.messages,
  '/notifications': loadPage.notifications,
  '/profile': loadPage.profile,
  '/settings': loadPage.settings,
  '/about': loadPage.about,
}

/** 空闲预取的高频页面（登录后 2s 兜底执行，覆盖 hover 未命中的情况） */
export const PREFETCH_IDLE = [
  loadPage.noteList,
  loadPage.aiChat,
  loadPage.social,
  loadPage.review,
] as const

export const Login = lazy(loadPage.login)
export const Register = lazy(loadPage.register)
export const ForgotPassword = lazy(loadPage.forgotPassword)
export const Dashboard = lazy(loadPage.dashboard)
export const NoteList = lazy(loadPage.noteList)
export const NoteEditor = lazy(loadPage.noteEditor)
export const AIChat = lazy(loadPage.aiChat)
export const Sessions = lazy(loadPage.sessions)
export const KnowledgeBase = lazy(loadPage.knowledge)
export const PetPage = lazy(loadPage.pet)
export const HabitPage = lazy(loadPage.habit)
export const StatsPage = lazy(loadPage.stats)
export const GraphPage = lazy(loadPage.graph)
export const PublicSharePage = lazy(loadPage.share)
export const SocialFeed = lazy(loadPage.social)
export const FriendsPage = lazy(loadPage.friends)
export const NotificationsPage = lazy(loadPage.notifications)
export const MessagesPage = lazy(loadPage.messages)
export const PlazaPage = lazy(loadPage.plaza)
export const UserProfilePage = lazy(loadPage.userProfile)
export const PomodoroPage = lazy(loadPage.pomodoro)
export const DailyReview = lazy(loadPage.review)
export const Profile = lazy(loadPage.profile)
export const Settings = lazy(loadPage.settings)
export const AboutUs = lazy(loadPage.about)
