export const endpoints = {
  // Auth
  login: '/user/login/',
  logout: '/user/logout/',
  register: '/user/register/',
  profile: '/user/detail/',
  userUpdate: '/user/update/',
  changePassword: '/user/reset-password/',
  userSettings: '/user/settings/',

  // File upload
  uploadFile: '/file/upload/',

  // AI Chat
  agentQueryStream: '/chat/agent/query/stream',
  ragQuery: '/chat/rag/query',

  // Sessions
  getSession: (id: string) => `/chat/session/${id}`,
  deleteSession: (id: string) => `/chat/session/${id}`,
  getAllSessions: '/chat/sessions',
  getUserSessions: (userId: string) => `/chat/sessions/${userId}`,

  // Knowledge Base
  uploadSingleFile: '/knowledge/add/single',
  uploadMultipleFiles: '/knowledge/add/multiple',
  uploadMultipleStream: '/knowledge/add/multiple/stream',
  cleanVectors: '/knowledge/clean',
  knowledgeList: '/knowledge/list',
  knowledgeDetail: '/knowledge/detail',
  knowledgeChunks: '/knowledge/chunks',
  knowledgeImage: (md5: string, filename: string) => `/knowledge/image/${md5}/${filename}`,
  knowledgeMd5List: '/knowledge/md5/list',
  knowledgeMd5Delete: (md5: string) => `/knowledge/md5/delete/${md5}`,
  knowledgeDeleteFilename: '/knowledge/delete/filename',
  knowledgeClip: '/knowledge/clip',

  // Documents reorder
  reorderDocuments: '/chat/reorder',

  // Notes
  noteCreate: '/note/create',
  noteUpdate: (id: string) => `/note/${id}`,
  noteDelete: (id: string) => `/note/${id}`,
  noteDetail: (id: string) => `/note/${id}`,
  noteList: '/note/list',
  noteSearch: '/note/search',
  noteAutoTag: (id: string) => `/note/${id}/auto-tag`,
  noteRelated: (id: string) => `/note/${id}/related`,
  noteBacklinks: (id: string) => `/note/${id}/backlinks`,
  noteDownload: (id: string) => `/note/${id}/download`,
  notePin: (id: string) => `/note/${id}/pin`,
  noteAutocomplete: '/note/autocomplete',
  noteStats: '/note/stats',
  noteAssistStream: '/note/assist/stream',
  noteGraph: '/note/graph',

  // Batch operations
  noteBatchDelete: '/note/batch/delete',
  noteBatchDownload: '/note/batch/download',
  noteBatchCategory: '/note/batch/category',
  noteBatchPin: '/note/batch/pin',
  noteCategoryDelete: (category: string) => `/note/category/${encodeURIComponent(category)}`,

  // Review
  reviewToday: '/review/today',
  reviewDone: (id: string) => `/review/done/${id}`,
  reviewQuestion: (id: string) => `/review/question/${id}`,

  // Stats Dashboard
  statsDashboard: '/stats/dashboard',

  // Public Share（数据走 /public 别名，避免与 SPA 路由 /share/:id 代理冲突）
  shareNote: (id: string) => `/public/note/${id}`,

  // Social（方向 B）
  userSearch: '/social/users/search',
  friendsList: '/social/friends/list',
  friendsRequests: '/social/friends/requests',
  friendRequest: '/social/friends/request',
  friendRespond: '/social/friends/respond',
  friendDelete: (id: string) => `/social/friends/${id}`,
  postsCreate: '/social/posts',
  postsFeed: '/social/posts/feed',
  postsMine: '/social/posts/mine',
  postDetail: (id: number) => `/social/posts/${id}`,
  postLike: (id: number) => `/social/posts/${id}/like`,
  postComment: (id: number) => `/social/posts/${id}/comments`,
  postDelete: (id: number) => `/social/posts/${id}`,
  commentDelete: (id: string) => `/social/posts/comments/${id}`,
  notifications: '/social/notifications',
  notificationsUnread: '/social/notifications/unread-count',
  notificationsRead: '/social/notifications/read',
  plaza: '/social/plaza',
  leaderboard: '/stats/leaderboard',
  userProfile: (id: string) => `/social/users/${id}/profile`,
  userFollow: (id: string) => `/social/users/${id}/follow`,
  userUnfollow: (id: string) => `/social/users/${id}/follow`,
  userFollowers: (id: string) => `/social/users/${id}/followers`,
  userFollowing: (id: string) => `/social/users/${id}/following`,
  userPublicNotes: (id: string) => `/social/users/${id}/public-notes`,

  // Note Templates
  noteTemplateList: '/note-template/list',
  noteTemplateCreate: '/note-template/create',
  noteTemplateUpdate: (id: string) => `/note-template/${id}`,
  noteTemplateDelete: (id: string) => `/note-template/${id}`,
  noteTemplateReorder: '/note-template/reorder',
} as const
