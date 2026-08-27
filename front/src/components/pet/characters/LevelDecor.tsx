import type { PetLevel, PetMood } from '../../../stores/usePetStore'

interface Props {
  mood: PetMood
  level: PetLevel
}

/**
 * 等级/情绪装饰层：叠加在任意角色上方的星星/王冠/彩虹/zzz。
 * 角色组件只负责"身体"，装饰统一由本组件渲染 → 新增角色零装饰成本。
 */
export default function LevelDecor({ mood, level }: Props) {
  return (
    <div className={`pet-decor pet-${mood}`} aria-hidden>
      {/* Lv3 王冠 */}
      {level >= 3 && (
        <svg className="pet-decor-crown" viewBox="0 0 60 24">
          <path
            d="M4,20 L10,4 L18,14 L26,2 L34,14 L42,4 L50,14 L56,20 Z"
            fill="#ffd166"
            stroke="#d4a017"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="18" r="1.8" fill="#fff" />
          <circle cx="26" cy="14" r="1.8" fill="#fff" />
          <circle cx="40" cy="18" r="1.8" fill="#fff" />
        </svg>
      )}
      {/* Lv2 星星 */}
      {level >= 2 && (
        <svg className="pet-decor-star" viewBox="0 0 24 24">
          <path
            d="M12,2 l2.8,5.9 6.5,0.8 -4.8,4.4 1.2,6.4 -5.7,-3.1 -5.7,3.1 1.2,-6.4 -4.8,-4.4 6.5,-0.8 Z"
            fill="#ffd166"
            stroke="#e8b63e"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {/* 庆祝彩虹 */}
      <svg className="pet-decor-rainbow" viewBox="0 0 120 70">
        <path d="M15,66 A45,45 0 0,1 105,66" fill="none" stroke="#ff6b6b" strokeWidth="6" strokeLinecap="round" />
        <path d="M24,66 A36,36 0 0,1 96,66" fill="none" stroke="#ffa94d" strokeWidth="6" strokeLinecap="round" />
        <path d="M33,66 A27,27 0 0,1 87,66" fill="none" stroke="#ffe066" strokeWidth="6" strokeLinecap="round" />
        <path d="M42,66 A18,18 0 0,1 78,66" fill="none" stroke="#69db7c" strokeWidth="6" strokeLinecap="round" />
        <path d="M51,66 A9,9 0 0,1 69,66" fill="none" stroke="#74c0fc" strokeWidth="6" strokeLinecap="round" />
      </svg>
      {/* 爱心（love 情绪） */}
      {mood === 'love' && (
        <svg className="pet-decor-hearts" viewBox="0 0 60 40">
          <path className="pet-heart-1" d="M18,26 c-4,-6 -10,-2.5 -7.5,4 c2.6,5.5 7.5,6.5 7.5,6.5 c0,0 4.9,-1 7.5,-6.5 c2.5,-6.5 -3.5,-10 -7.5,-4 Z" fill="#ff6b8a" />
          <path className="pet-heart-2" d="M42,16 c-3.4,-5 -8.4,-2 -6.3,3.4 c2.2,4.6 6.3,5.5 6.3,5.5 c0,0 4.1,-0.9 6.3,-5.5 c2.1,-5.4 -2.9,-8.4 -6.3,-3.4 Z" fill="#ff8fab" />
        </svg>
      )}
      {/* 睡觉 zzz */}
      <svg className="pet-decor-zzz" viewBox="0 0 40 30" fill="var(--pet-line)">
        <text x="4" y="22" fontSize="13" fontWeight="600">z</text>
        <text x="16" y="14" fontSize="10" fontWeight="600">z</text>
        <text x="25" y="7" fontSize="8" fontWeight="600">z</text>
      </svg>
    </div>
  )
}
