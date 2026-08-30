/* eslint-disable react-refresh/only-export-components -- 路由配置文件：lazy 常量按惯例集中声明 */
import { Suspense } from 'react'
import type { RouteObject } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import AuthLayout from '../layouts/AuthLayout'
import LoadingSkeleton from '../components/common/LoadingSkeleton'
import {
  Login, Register, ForgotPassword, Dashboard, NoteList, NoteEditor, AIChat, Sessions,
  KnowledgeBase, PetPage, HabitPage, StatsPage, GraphPage, PublicSharePage,
  SocialFeed, FriendsPage, NotificationsPage, MessagesPage, PlazaPage,
  UserProfilePage, PomodoroPage, DailyReview, Profile, Settings, AboutUs,
} from './pages'

const LazyLoad = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<LoadingSkeleton />}>{children}</Suspense>
)

const routes: RouteObject[] = [
  {
    element: <AuthLayout />,
    children: [
      { path: 'login', element: <LazyLoad><Login /></LazyLoad> },
      { path: 'register', element: <LazyLoad><Register /></LazyLoad> },
      { path: 'forgot-password', element: <LazyLoad><ForgotPassword /></LazyLoad> },
    ],
  },
  {
    path: '/share/:id',
    element: <LazyLoad><PublicSharePage /></LazyLoad>,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <LazyLoad><Dashboard /></LazyLoad> },
      { path: 'notes', element: <LazyLoad><NoteList /></LazyLoad> },
      { path: 'notes/:id', element: <LazyLoad><NoteEditor /></LazyLoad> },
      { path: 'notes/new', element: <LazyLoad><NoteEditor /></LazyLoad> },
      { path: 'chat', element: <LazyLoad><AIChat /></LazyLoad> },
      { path: 'chat/:sessionId', element: <LazyLoad><AIChat /></LazyLoad> },
      { path: 'sessions', element: <LazyLoad><Sessions /></LazyLoad> },
      { path: 'review', element: <LazyLoad><DailyReview /></LazyLoad> },
      { path: 'knowledge', element: <LazyLoad><KnowledgeBase /></LazyLoad> },
      { path: 'pet', element: <LazyLoad><PetPage /></LazyLoad> },
      { path: 'habit', element: <LazyLoad><HabitPage /></LazyLoad> },
      { path: 'stats', element: <LazyLoad><StatsPage /></LazyLoad> },
      { path: 'graph', element: <LazyLoad><GraphPage /></LazyLoad> },
      { path: 'social', element: <LazyLoad><SocialFeed /></LazyLoad> },
      { path: 'friends', element: <LazyLoad><FriendsPage /></LazyLoad> },
      { path: 'messages', element: <LazyLoad><MessagesPage /></LazyLoad> },
      { path: 'notifications', element: <LazyLoad><NotificationsPage /></LazyLoad> },
      { path: 'plaza', element: <LazyLoad><PlazaPage /></LazyLoad> },
      { path: 'user/:userId', element: <LazyLoad><UserProfilePage /></LazyLoad> },
      { path: 'pomodoro', element: <LazyLoad><PomodoroPage /></LazyLoad> },
      { path: 'profile', element: <LazyLoad><Profile /></LazyLoad> },
      { path: 'settings', element: <LazyLoad><Settings /></LazyLoad> },
      { path: 'about', element: <LazyLoad><AboutUs /></LazyLoad> },
    ],
  },
]

export default routes
