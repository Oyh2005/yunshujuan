import type { PetLevel, PetMood } from '../../stores/usePetStore'

interface Props {
  mood: PetMood
  level: PetLevel
}

/**
 * 云朵精灵「小卷」—— Q 版 SVG 角色
 * 等级外观：Lv1 云宝宝（基础）/ Lv2 云精灵（星星+腮红加深）/ Lv3 云中仙（王冠+星光）
 * 状态通过 CSS class 切换动画（见 pet.css）
 */
export default function CloudSpirit({ mood, level }: Props) {
  return (
    <svg
      className={`pet-cloud pet-${mood} pet-level-${level}`}
      viewBox="0 0 120 90"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="pet"
    >
      {/* 庆祝彩虹（celebrate 时显现） */}
      <g className="pet-rainbow">
        <path d="M20,62 A40,40 0 0,1 100,62" fill="none" stroke="#ff6b6b" strokeWidth="5" strokeLinecap="round" />
        <path d="M28,62 A32,32 0 0,1 92,62" fill="none" stroke="#ffa94d" strokeWidth="5" strokeLinecap="round" />
        <path d="M36,62 A24,24 0 0,1 84,62" fill="none" stroke="#ffe066" strokeWidth="5" strokeLinecap="round" />
        <path d="M44,62 A16,16 0 0,1 76,62" fill="none" stroke="#69db7c" strokeWidth="5" strokeLinecap="round" />
        <path d="M52,62 A8,8 0 0,1 68,62" fill="none" stroke="#74c0fc" strokeWidth="5" strokeLinecap="round" />
      </g>

      {/* Lv2 起：头顶小星星 */}
      {level >= 2 && (
        <g className="pet-star">
          <path
            d="M96,18 l3.2,6.5 7.2,1 -5.2,5 1.2,7.2 -6.4,-3.4 -6.4,3.4 1.2,-7.2 -5.2,-5 7.2,-1 Z"
            fill="#ffd166"
            stroke="#e8b63e"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* Lv3 起：金色王冠 */}
      {level >= 3 && (
        <g className="pet-crown">
          <path
            d="M38,22 L44,10 L52,18 L60,8 L68,18 L76,10 L82,22 Z"
            fill="#ffd166"
            stroke="#d4a017"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="44" cy="20" r="1.8" fill="#fff" />
          <circle cx="60" cy="16" r="1.8" fill="#fff" />
          <circle cx="76" cy="20" r="1.8" fill="#fff" />
        </g>
      )}

      {/* 云朵主体 */}
      <g className="pet-body">
        <path
          d="M14,64 a12,12 0 0,1 8,-20 a16,16 0 0,1 26,-8 a20,20 0 0,1 36,2 a14,14 0 0,1 22,8 a12,12 0 0,1 -6,20 Z"
          fill="var(--pet-body)"
          stroke="var(--pet-line)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* 高光 */}
        <ellipse cx="46" cy="38" rx="16" ry="6" fill="var(--pet-shine)" opacity="0.7" transform="rotate(-8 46 38)" />
      </g>

      {/* 眼睛 */}
      <g className="pet-eyes">
        <circle cx="46" cy="54" r="3.6" fill="var(--pet-eye)" />
        <circle cx="74" cy="54" r="3.6" fill="var(--pet-eye)" />
        {/* 高光点 */}
        <circle cx="47.2" cy="52.8" r="1.2" fill="#fff" />
        <circle cx="75.2" cy="52.8" r="1.2" fill="#fff" />
      </g>

      {/* 腮红（Lv2 起更明显） */}
      <ellipse className="pet-blush" cx="32" cy="61" rx={level >= 2 ? 7 : 6} ry={level >= 2 ? 4.2 : 3.6} fill="var(--pet-blush)" opacity={level >= 2 ? 0.85 : 0.65} />
      <ellipse className="pet-blush" cx="88" cy="61" rx={level >= 2 ? 7 : 6} ry={level >= 2 ? 4.2 : 3.6} fill="var(--pet-blush)" opacity={level >= 2 ? 0.85 : 0.65} />

      {/* 嘴：微笑（默认）/ 张开（talk 时切换） */}
      <path className="pet-mouth" d="M54,62 Q60,68 66,62" fill="none" stroke="var(--pet-eye)" strokeWidth="2.4" strokeLinecap="round" />
      <path className="pet-mouth-open" d="M54,60 Q60,72 66,60 Z" fill="var(--pet-eye)" opacity="0" />

      {/* 睡觉 zzz */}
      <g className="pet-zzz" fill="var(--pet-line)">
        <text x="90" y="24" fontSize="13" fontWeight="600">z</text>
        <text x="101" y="13" fontSize="10" fontWeight="600">z</text>
        <text x="109" y="5" fontSize="8" fontWeight="600">z</text>
      </g>
    </svg>
  )
}
