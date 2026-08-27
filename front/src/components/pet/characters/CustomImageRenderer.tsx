import { usePetStore, type PetLevel, type PetMood } from '../../../stores/usePetStore'

interface Props {
  mood: PetMood
  level: PetLevel
}

/**
 * 用户自定义形象渲染器（贴纸模式）：
 * - 直接渲染用户上传的 PNG/GIF/WebP（base64 data URL）
 * - 情绪动画由容器级 CSS 驱动（呼吸/弹跳/压扁/摇摆，见 .pet-custom-image）
 * - 等级装饰（星星/王冠/彩虹/zzz）由 LevelDecor 叠加
 * - 未上传图片时返回 null（Pet 组件会回退到默认形象）
 */
export default function CustomImageRenderer({ mood }: Props) {
  const customImage = usePetStore((s) => s.customImage)
  if (!customImage) return null
  return <img src={customImage} className={`pet-custom-image pet-${mood}`} alt="custom pet" draggable={false} />
}
