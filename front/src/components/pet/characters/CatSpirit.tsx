import type { PetMood } from '../../../stores/usePetStore'

interface Props {
  mood: PetMood
  level: 1 | 2 | 3
}

/**
 * 笔记猫「墨墨」—— Q 版 SVG 角色（只负责身体）
 * 等级装饰（星星/王冠/彩虹/zzz）由 <LevelDecor> 统一叠加
 */
export default function CatSpirit({ mood, level }: Props) {
  // ── 眼睛：按情绪切换 ──
  const eyes =
    mood === 'sleep' ? (
      // 睡觉闭眼（向下弯的闭合弧线）
      <>
        <path d="M45,44 Q50,48 55,44" fill="none" stroke="var(--pet-eye)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M65,44 Q70,48 75,44" fill="none" stroke="var(--pet-eye)" strokeWidth="2.4" strokeLinecap="round" />
      </>
    ) : mood === 'happy' ? (
      <>
        <path d="M46,44 Q50,38.5 54,44" fill="none" stroke="var(--pet-eye)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M66,44 Q70,38.5 74,44" fill="none" stroke="var(--pet-eye)" strokeWidth="2.6" strokeLinecap="round" />
      </>
    ) : mood === 'love' ? (
      <>
        <path d="M50,43 c-2,-2.8 -5,-1 -3.6,2 c1.3,2.8 3.6,3.3 3.6,3.3 c0,0 2.3,-0.5 3.6,-3.3 c1.4,-3 -1.6,-4.8 -3.6,-2 Z" fill="var(--pet-eye)" />
        <path d="M70,43 c-2,-2.8 -5,-1 -3.6,2 c1.3,2.8 3.6,3.3 3.6,3.3 c0,0 2.3,-0.5 3.6,-3.3 c1.4,-3 -1.6,-4.8 -3.6,-2 Z" fill="var(--pet-eye)" />
      </>
    ) : mood === 'surprised' ? (
      <>
        <circle cx="50" cy="43" r="5" fill="var(--pet-eye)" />
        <circle cx="70" cy="43" r="5" fill="var(--pet-eye)" />
        <circle cx="51.6" cy="41.4" r="1.7" fill="#fff" />
        <circle cx="71.6" cy="41.4" r="1.7" fill="#fff" />
      </>
    ) : (
      <>
        <circle cx="50" cy="44" r="3.8" fill="var(--pet-eye)" />
        <circle cx="70" cy="44" r="3.8" fill="var(--pet-eye)" />
        <circle cx="51.2" cy="42.8" r="1.3" fill="#fff" />
        <circle cx="71.2" cy="42.8" r="1.3" fill="#fff" />
      </>
    )

  // ── 嘴：按情绪切换 ──
  const mouth =
    mood === 'talk' ? (
      <>
        <path className="pet-mouth" d="M55,52 Q60,57 65,52" fill="none" stroke="var(--pet-eye)" strokeWidth="2.2" strokeLinecap="round" opacity="0" />
        <path className="pet-mouth-open" d="M55,50 Q60,60 65,50 Z" fill="var(--pet-eye)" />
      </>
    ) : mood === 'surprised' ? (
      <ellipse cx="60" cy="54" rx="2.8" ry="3.5" fill="var(--pet-eye)" />
    ) : mood === 'play' ? (
      <path d="M53,49 Q60,60 67,49 Q60,53 53,49 Z" fill="var(--pet-eye)" />
    ) : mood === 'happy' ? (
      <path d="M54,51 Q60,57 66,51" fill="none" stroke="var(--pet-eye)" strokeWidth="2.4" strokeLinecap="round" />
    ) : (
      <path className="pet-mouth" d="M55,52 Q60,57 65,52" fill="none" stroke="var(--pet-eye)" strokeWidth="2.2" strokeLinecap="round" />
    )

  return (
    <svg
      className={`pet-cloud pet-${mood}`}
      viewBox="0 0 120 90"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="cat"
    >
      {/* 尾巴 */}
      <path
        className="pet-cat-tail"
        d="M96,66 Q112,58 108,44 Q106,36 98,38"
        fill="none"
        stroke="var(--pet-body)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M96,66 Q112,58 108,44 Q106,36 98,38"
        fill="none"
        stroke="var(--pet-line)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* 身体 */}
      <g className="pet-body">
        <ellipse cx="60" cy="66" rx="30" ry="16" fill="var(--pet-body)" stroke="var(--pet-line)" strokeWidth="2.5" />
        {/* 猫头 */}
        <circle cx="60" cy="44" r="26" fill="var(--pet-body)" stroke="var(--pet-line)" strokeWidth="2.5" />
        {/* 耳朵 */}
        <path d="M40,30 L32,10 L50,24 Z" fill="var(--pet-body)" stroke="var(--pet-line)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M80,30 L88,10 L70,24 Z" fill="var(--pet-body)" stroke="var(--pet-line)" strokeWidth="2.5" strokeLinejoin="round" />
        {/* 内耳 */}
        <path d="M40,27 L36,15 L47,24 Z" fill="var(--pet-blush)" opacity="0.8" />
        <path d="M80,27 L84,15 L73,24 Z" fill="var(--pet-blush)" opacity="0.8" />
        {/* 条纹 */}
        <path d="M52,22 L52,30" stroke="var(--pet-line)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        <path d="M60,20 L60,30" stroke="var(--pet-line)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        <path d="M68,22 L68,30" stroke="var(--pet-line)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      </g>

      {/* 眼睛 */}
      <g className={`pet-eyes${mood === 'happy' || mood === 'love' || mood === 'surprised' ? ' pet-eyes-static' : ''}`}>
        {eyes}
      </g>

      {/* 腮红 */}
      <ellipse className="pet-blush" cx="38" cy="52" rx={level >= 2 ? 6.5 : 5.5} ry={level >= 2 ? 4 : 3.4} fill="var(--pet-blush)" opacity={level >= 2 ? 0.85 : 0.65} />
      <ellipse className="pet-blush" cx="82" cy="52" rx={level >= 2 ? 6.5 : 5.5} ry={level >= 2 ? 4 : 3.4} fill="var(--pet-blush)" opacity={level >= 2 ? 0.85 : 0.65} />

      {/* 胡须 */}
      <path d="M24,46 L38,48" stroke="var(--pet-line)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <path d="M24,54 L38,52" stroke="var(--pet-line)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <path d="M96,46 L82,48" stroke="var(--pet-line)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <path d="M96,54 L82,52" stroke="var(--pet-line)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />

      {/* 小鼻子 */}
      <path d="M60,49 L57.5,51.5 L62.5,51.5 Z" fill="var(--pet-eye)" opacity="0.85" />

      {mouth}
    </svg>
  )
}
