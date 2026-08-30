import { useState } from 'react'

/**
 * 渐进式图片（P1-4）：加载完成前显示占位底色 + 微光动画，避免白块跳动；
 * 加载完成后淡入；加载失败时停止微光并降透明（不闪裂图图标）。
 *
 * 用法与 <img> 一致（className/onClick/onContextMenu/loading 等原样透传），
 * 内部自动附加 `progressive-img` / `is-loaded` / `is-failed` 类。
 */
export default function ProgressiveImage({ className = '', onLoad, onError, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading')

  return (
    <img
      {...rest}
      className={`progressive-img${state === 'loaded' ? ' is-loaded' : ''}${state === 'failed' ? ' is-failed' : ''} ${className}`}
      onLoad={(event) => {
        setState('loaded')
        onLoad?.(event)
      }}
      onError={(event) => {
        setState('failed')
        onError?.(event)
      }}
    />
  )
}
