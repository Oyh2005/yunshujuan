import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

/** 淡入 + 上移入场（页面/区块级） */
export function FadeIn({ children, delay = 0, y = 12, className }: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** 列表错峰入场容器：子项用 <StaggerItem> 包裹 */
export function Stagger({ children, className, stagger = 0.05 }: {
  children: ReactNode
  className?: string
  stagger?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  )
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
}

/** 列表错峰入场的单个子项 */
export function StaggerItem({ children, className }: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  )
}

/** 悬浮微交互包装：hover 上浮 + 阴影加深 */
export function Lift({ children, className, whileTap = 0.97 }: {
  children: ReactNode
  className?: string
  whileTap?: number
}) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -2 }}
      whileTap={{ scale: whileTap }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
