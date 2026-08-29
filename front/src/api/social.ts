import client from './client'
import { endpoints } from './endpoints'
import type {
  ApiResponse,
  FeedData,
  FriendRequestItem,
  NotificationItem,
  PlazaData,
  Post,
  PostDetail,
  PostCommentItem,
  SocialUser,
  UserProfileData,
} from '../types/api'

export const socialApi = {
  // 用户
  searchUsers: async (q: string) => {
    const res = await client.get<ApiResponse<SocialUser[]>>(endpoints.userSearch, { params: { q } })
    return res.data
  },

  // 好友
  friendsList: async () => {
    const res = await client.get<ApiResponse<SocialUser[]>>(endpoints.friendsList)
    return res.data
  },
  friendRequests: async () => {
    const res = await client.get<ApiResponse<FriendRequestItem[]>>(endpoints.friendsRequests)
    return res.data
  },
  sendFriendRequest: async (userId: string) => {
    const res = await client.post<ApiResponse<null>>(endpoints.friendRequest, { user_id: userId })
    return res.data
  },
  respondFriendRequest: async (requestId: string, accept: boolean) => {
    const res = await client.post<ApiResponse<null>>(endpoints.friendRespond, { request_id: requestId, accept })
    return res.data
  },
  removeFriend: async (userId: string) => {
    const res = await client.delete<ApiResponse<null>>(endpoints.friendDelete(userId))
    return res.data
  },

  // 动态
  createPost: async (data: { content: string; images?: string[]; note_id?: string }) => {
    const res = await client.post<ApiResponse<Post>>(endpoints.postsCreate, data)
    return res.data
  },
  feed: async (cursor?: number) => {
    const res = await client.get<ApiResponse<FeedData>>(endpoints.postsFeed, { params: cursor ? { cursor } : {} })
    return res.data
  },
  mine: async (cursor?: number) => {
    const res = await client.get<ApiResponse<FeedData>>(endpoints.postsMine, { params: cursor ? { cursor } : {} })
    return res.data
  },
  detail: async (postId: number) => {
    const res = await client.get<ApiResponse<PostDetail>>(endpoints.postDetail(postId))
    return res.data
  },
  toggleLike: async (postId: number) => {
    const res = await client.post<ApiResponse<{ liked: boolean }>>(endpoints.postLike(postId))
    return res.data
  },
  addComment: async (postId: number, content: string) => {
    const res = await client.post<ApiResponse<PostCommentItem>>(endpoints.postComment(postId), { content })
    return res.data
  },
  deletePost: async (postId: number) => {
    const res = await client.delete<ApiResponse<null>>(endpoints.postDelete(postId))
    return res.data
  },
  deleteComment: async (commentId: string) => {
    const res = await client.delete<ApiResponse<null>>(endpoints.commentDelete(commentId))
    return res.data
  },

  // 通知
  notifications: async () => {
    const res = await client.get<ApiResponse<NotificationItem[]>>(endpoints.notifications)
    return res.data
  },
  unreadCount: async () => {
    const res = await client.get<ApiResponse<{ count: number }>>(endpoints.notificationsUnread)
    return res.data
  },
  markAllRead: async () => {
    const res = await client.post<ApiResponse<null>>(endpoints.notificationsRead)
    return res.data
  },
  /** 标记指定通知已读（点击通知时单条标记） */
  markRead: async (ids: string[]) => {
    const res = await client.post<ApiResponse<null>>(endpoints.notificationsRead, { ids })
    return res.data
  },
  /** 删除单条通知（仅本人） */
  deleteNotification: async (id: string) => {
    const res = await client.delete<ApiResponse<null>>(endpoints.notificationDelete(id))
    return res.data
  },
  /** 清空我的全部通知（仅本人） */
  clearNotifications: async () => {
    const res = await client.delete<ApiResponse<null>>(endpoints.notificationsClear)
    return res.data
  },

  // 知识广场
  plaza: async (page: number, pageSize = 10) => {
    const res = await client.get<ApiResponse<PlazaData>>(endpoints.plaza, { params: { page, page_size: pageSize } })
    return res.data
  },

  // 个人主页 / 关注
  profile: async (userId: string) => {
    const res = await client.get<ApiResponse<UserProfileData>>(endpoints.userProfile(userId))
    return res.data
  },
  follow: async (userId: string) => {
    const res = await client.post<ApiResponse<{ is_following: boolean }>>(endpoints.userFollow(userId))
    return res.data
  },
  unfollow: async (userId: string) => {
    const res = await client.delete<ApiResponse<{ is_following: boolean }>>(endpoints.userUnfollow(userId))
    return res.data
  },
  followers: async (userId: string) => {
    const res = await client.get<ApiResponse<SocialUser[]>>(endpoints.userFollowers(userId))
    return res.data
  },
  following: async (userId: string) => {
    const res = await client.get<ApiResponse<SocialUser[]>>(endpoints.userFollowing(userId))
    return res.data
  },
  userPublicNotes: async (userId: string, page = 1) => {
    const res = await client.get<ApiResponse<PlazaData>>(endpoints.userPublicNotes(userId), { params: { page, page_size: 10 } })
    return res.data
  },
}
