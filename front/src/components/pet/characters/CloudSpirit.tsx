import type { PetMood } from '../../../stores/usePetStore'

interface Props {
  mood: PetMood
  level: 1 | 2 | 3
}

/**
 * 云朵精灵「小卷」—— Q 版 SVG 角色（只负责身体与表情）
 * 表情随情绪变化：开心弯眼 / 惊讶大眼 O 嘴 / 爱心眼 / 玩耍大笑
 * 等级装饰（星星/王冠/彩虹/zzz/爱心）由 <LevelDecor> 统一叠加
 */
export default function CloudSpirit({ mood, level }: Props) {
  // ── 眼睛：按情绪切换 ──
  const eyes =
    mood === 'sleep' ? (
      // 睡觉闭眼（向下弯的闭合弧线）
      <>
        <path d="M41,54 Q46,58 51,54" fill="none" stroke="var(--pet-eye)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M69,54 Q74,58 79,54" fill="none" stroke="var(--pet-eye)" strokeWidth="2.4" strokeLinecap="round" />
      </>
    ) : mood === 'happy' ? (
      // 开心弯眼 ^ ^
      <>
        <path d="M42,54 Q46,48.5 50,54" fill="none" stroke="var(--pet-eye)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M70,54 Q74,48.5 78,54" fill="none" stroke="var(--pet-eye)" strokeWidth="2.6" strokeLinecap="round" />
      </>
    ) : mood === 'love' ? (
      // 爱心眼
      <>
        <path d="M46,53 c-2.2,-3 -5.5,-1 -4,2.2 c1.4,3 4,3.6 4,3.6 c0,0 2.6,-0.6 4,-3.6 c1.5,-3.2 -1.8,-5.2 -4,-2.2 Z" fill="var(--pet-eye)" />
        <path d="M74,53 c-2.2,-3 -5.5,-1 -4,2.2 c1.4,3 4,3.6 4,3.6 c0,0 2.6,-0.6 4,-3.6 c1.5,-3.2 -1.8,-5.2 -4,-2.2 Z" fill="var(--pet-eye)" />
      </>
    ) : mood === 'surprised' ? (
      // 惊讶大眼
      <>
        <circle cx="46" cy="53" r="5.2" fill="var(--pet-eye)" />
        <circle cx="74" cy="53" r="5.2" fill="var(--pet-eye)" />
        <circle cx="47.6" cy="51.4" r="1.8" fill="#fff" />
        <circle cx="75.6" cy="51.4" r="1.8" fill="#fff" />
      </>
    ) : (
      // 默认圆点眼 + 高光
      <>
        <circle cx="46" cy="54" r="3.6" fill="var(--pet-eye)" />
        <circle cx="74" cy="54" r="3.6" fill="var(--pet-eye)" />
        <circle cx="47.2" cy="52.8" r="1.2" fill="#fff" />
        <circle cx="75.2" cy="52.8" r="1.2" fill="#fff" />
      </>
    )

  // ── 嘴：按情绪切换 ──
  const mouth =
    mood === 'talk' ? (
      <>
        <path className="pet-mouth" d="M54,62 Q60,68 66,62" fill="none" stroke="var(--pet-eye)" strokeWidth="2.4" strokeLinecap="round" opacity="0" />
        <path className="pet-mouth-open" d="M54,60 Q60,72 66,60 Z" fill="var(--pet-eye)" />
      </>
    ) : mood === 'surprised' ? (
      <ellipse cx="60" cy="64" rx="3" ry="3.8" fill="var(--pet-eye)" />
    ) : mood === 'play' ? (
      // 玩耍大笑
      <path d="M52,59 Q60,72 68,59 Q60,63 52,59 Z" fill="var(--pet-eye)" />
    ) : mood === 'happy' ? (
      <path d="M52,60 Q60,68 68,60" fill="none" stroke="var(--pet-eye)" strokeWidth="2.6" strokeLinecap="round" />
    ) : (
      // 默认微笑
      <path className="pet-mouth" d="M54,62 Q60,68 66,62" fill="none" stroke="var(--pet-eye)" strokeWidth="2.4" strokeLinecap="round" />
    )

  return (
    <svg
      className={`pet-cloud pet-${mood}`}
      viewBox="0 0 120 90"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="cloud"
    >
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

      {/* 眼睛（blink 动画仅对默认圆眼生效，特殊表情下暂停眨眼） */}
      <g className={`pet-eyes${mood === 'happy' || mood === 'love' || mood === 'surprised' ? ' pet-eyes-static' : ''}`}>
        {eyes}
      </g>

      {/* 腮红（Lv2 起更明显） */}
      <ellipse className="pet-blush" cx="32" cy="61" rx={level >= 2 ? 7 : 6} ry={level >= 2 ? 4.2 : 3.6} fill="var(--pet-blush)" opacity={level >= 2 ? 0.85 : 0.65} />
      <ellipse className="pet-blush" cx="88" cy="61" rx={level >= 2 ? 7 : 6} ry={level >= 2 ? 4.2 : 3.6} fill="var(--pet-blush)" opacity={level >= 2 ? 0.85 : 0.65} />

      {mouth}
    </svg>
  )
}
