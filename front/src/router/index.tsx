/* eslint-disable react-refresh/only-export-components -- 路由配置文件：lazy 常量按惯例集中声明 */
import { lazy, Suspense } from 'react'
import type { RouteObject } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import AuthLayout from '../layouts/AuthLayout'
import LoadingSkeleton from '../components/common/LoadingSkeleton'

const Login = lazy(() => import('../pages/Login'))
const Register = lazy(() => import('../pages/Register'))
const NoteList = lazy(() => import('../pages/NoteList'))
const NoteEditor = lazy(() => import('../pages/NoteEditor'))
const AIChat = lazy(() => import('../pages/AIChat'))
const Sessions = lazy(() => import('../pages/Sessions'))
const KnowledgeBase = lazy(() => import('../pages/KnowledgeBase'))
const PetPage = lazy(() => import('../pages/PetPage'))
const HabitPage = lazy(() => import('../pages/HabitPage'))
const StatsPage = lazy(() => import('../pages/StatsPage'))
const GraphPage = lazy(() => import('../pages/GraphPage'))
const PublicSharePage = lazy(() => import('../pages/PublicSharePage'))
const SocialFeed = lazy(() => import('../pages/SocialFeed'))
const FriendsPage = lazy(() => import('../pages/FriendsPage'))
const NotificationsPage = lazy(() => import('../pages/NotificationsPage'))
const PlazaPage = lazy(() => import('../pages/PlazaPage'))
const UserProfilePage = lazy(() => import('../pages/UserProfilePage'))
const PomodoroPage = lazy(() => import('../pages/PomodoroPage'))
const DailyReview = lazy(() => import('../pages/DailyReview'))
const Profile = lazy(() => import('../pages/Profile'))
const Settings = lazy(() => import('../pages/Settings'))
const AboutUs = lazy(() => import('../pages/AboutUs'))

const LazyLoad = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<LoadingSkeleton />}>{children}</Suspense>
)

const routes: RouteObject[] = [
  {
    path: '/login',
    element: <AuthLayout />,
    children: [{ index: true, element: <LazyLoad><Login /></LazyLoad> }],
  },
  {
    path: '/register',
    element: <AuthLayout />,
    children: [{ index: true, element: <LazyLoad><Register /></LazyLoad> }],
  },
  {
    path: '/share/:id',
    element: <LazyLoad><PublicSharePage /></LazyLoad>,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <LazyLoad><NoteList /></LazyLoad> },
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
