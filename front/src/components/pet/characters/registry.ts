import type { ComponentType } from 'react'
import type { PetLevel, PetMood } from '../../../stores/usePetStore'
import CloudSpirit from './CloudSpirit'
import CatSpirit from './CatSpirit'
import CustomImageRenderer from './CustomImageRenderer'

/** 角色渲染协议：任何内置/自定义形象都实现此接口 */
export interface PetCharacter {
  id: string
  /** i18n key：形象名称 */
  nameKey: string
  /** 是否内置角色（false = 用户上传的自定义形象） */
  builtin: boolean
  /** 各成长等级的名称 i18n key（如云：云宝宝/云精灵/云中仙；猫：猫宝宝/猫精灵/猫中仙） */
  levelNameKeys: [string, string, string]
  /** 各成长等级的描述 i18n key */
  levelDescKeys: [string, string, string]
  /** 角色渲染组件（只画"身体"，等级装饰由 LevelDecor 叠加） */
  Renderer: ComponentType<{ mood: PetMood; level: PetLevel }>
}

/** 内置角色注册表：新增形象只需在这里加一个条目 */
export const PET_CHARACTERS: PetCharacter[] = [
  {
    id: 'cloud',
    nameKey: 'pet.charCloud',
    builtin: true,
    levelNameKeys: ['pet.level1', 'pet.level2', 'pet.level3'],
    levelDescKeys: ['pet.level1Desc', 'pet.level2Desc', 'pet.level3Desc'],
    Renderer: CloudSpirit,
  },
  {
    id: 'cat',
    nameKey: 'pet.charCat',
    builtin: true,
    levelNameKeys: ['pet.catLevel1', 'pet.catLevel2', 'pet.catLevel3'],
    levelDescKeys: ['pet.catLevel1Desc', 'pet.catLevel2Desc', 'pet.catLevel3Desc'],
    Renderer: CatSpirit,
  },
  {
    id: 'custom',
    nameKey: 'pet.charCustom',
    builtin: false,
    levelNameKeys: ['pet.level1', 'pet.level2', 'pet.level3'],
    levelDescKeys: ['pet.level1Desc', 'pet.level2Desc', 'pet.level3Desc'],
    Renderer: CustomImageRenderer,
  },
]

/** 按 id 查找角色（未知 id 回退到第一个内置角色） */
export function getCharacter(id: string): PetCharacter {
  return PET_CHARACTERS.find((c) => c.id === id) ?? PET_CHARACTERS[0]
}
