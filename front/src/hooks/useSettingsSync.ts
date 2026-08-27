import { useEffect, useRef } from 'react'
import { settingsApi } from '../api/settings'
import { usePetStore, type PetStore } from '../stores/usePetStore'
import { useHabitStore, type HabitStore } from '../stores/useHabitStore'

/** localStorage 键（与各 store 保持一致） */
const PET_KEY = 'pet.config'
const HABIT_KEY = 'habit.config'
/** 变更后延迟上传云端（防抖） */
const SAVE_DELAY = 3000

/** 提取小卷的可持久化字段（剔除 mood/bubble/lastEvent 等运行时字段与方法） */
function petPersistable(s: PetStore): Record<string, unknown> {
  return {
    visible: s.visible,
    offsetX: s.offsetX,
    offsetY: s.offsetY,
    nickname: s.nickname,
    affection: s.affection,
    stats: s.stats,
    log: s.log,
    characterId: s.characterId,
    petColor: s.petColor,
    customImage: s.customImage,
    lastPetTime: s.lastPetTime,
    petTodayCount: s.petTodayCount,
    petTodayDate: s.petTodayDate,
    lastEventTimes: s.lastEventTimes,
  }
}

/** 提取打卡的可持久化字段 */
function habitPersistable(s: HabitStore): Record<string, unknown> {
  return {
    noteStreak: s.noteStreak,
    reviewStreak: s.reviewStreak,
    taskDate: s.taskDate,
    tasksDone: s.tasksDone,
  }
}

/**
 * 养成数据上云同步：
 * 1. 登录后拉取云端 → 有数据则以云端覆盖本地（云端为权威，防本地丢失）
 * 2. 云端为空且本地有数据 → 自动上传本地（首次上云）
 * 3. 此后所有小卷/打卡变更 → 3 秒防抖自动上传（localStorage 仍作本地缓存双写）
 */
export function useSettingsSync(enabled: boolean) {
  const fetchedRef = useRef(false)

  // 首次拉取 + 首次上云（setState 均在异步回调中）
  useEffect(() => {
    if (!enabled || fetchedRef.current) return
    fetchedRef.current = true
    let cancelled = false
    settingsApi
      .get()
      .then((res) => {
        if (cancelled) return
        const pet = res.data?.pet_config
        const habit = res.data?.habit_config

        if (pet && Object.keys(pet).length > 0) {
          usePetStore.setState(pet as Partial<PetStore>)
          try { localStorage.setItem(PET_KEY, JSON.stringify(pet)) } catch { /* ignore */ }
        } else {
          // 云端无小卷数据 → 上传本地（首次上云）
          settingsApi.put({ pet_config: petPersistable(usePetStore.getState()) }).catch(() => {})
        }

        if (habit && Object.keys(habit).length > 0) {
          useHabitStore.setState(habit as Partial<HabitStore>)
          try { localStorage.setItem(HABIT_KEY, JSON.stringify(habit)) } catch { /* ignore */ }
        } else {
          settingsApi.put({ habit_config: habitPersistable(useHabitStore.getState()) }).catch(() => {})
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled])

  // 变更 → 防抖上传
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        settingsApi
          .put({
            pet_config: petPersistable(usePetStore.getState()),
            habit_config: habitPersistable(useHabitStore.getState()),
          })
          .catch(() => {})
      }, SAVE_DELAY)
    }

    const unsubPet = usePetStore.subscribe(schedule)
    const unsubHabit = useHabitStore.subscribe(schedule)
    return () => {
      unsubPet()
      unsubHabit()
      if (timer) {
        clearTimeout(timer)
        // 登出/卸载前 flush 未上传的变更（防抖窗口内的最后一次修改）
        settingsApi
          .put({
            pet_config: petPersistable(usePetStore.getState()),
            habit_config: habitPersistable(useHabitStore.getState()),
          })
          .catch(() => {})
      }
    }
  }, [enabled])
}
