import { useEffect, useRef, useState } from 'react'

interface AuthImageProps {
  src: string
  alt: string
  className?: string
}

export default function AuthImage({ src, alt, className }: AuthImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    // StrictMode 下 effect 会 mount→unmount→remount，必须重置 mountedRef，
    // 否则第二次挂载的 fetch 回调会被 cancelled 拦截（头像不显示）
    mountedRef.current = true
    // setTimeout 包裹：effect 体内不直接 setState（react-hooks/set-state-in-effect）
    const timer = window.setTimeout(() => {
      setBlobUrl(null)
      setLoaded(false)

      const token = localStorage.getItem('jwt_token')
      if (!token) {
        setBlobUrl(src)
        return
      }

      fetch(src, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          if (!res.ok) throw new Error('Auth image load failed')
          return res.blob()
        })
        .then((blob) => {
          if (mountedRef.current) {
            setBlobUrl(URL.createObjectURL(blob))
          }
        })
        .catch(() => {
          if (mountedRef.current) {
            setBlobUrl(src)
          }
        })
    }, 0)

    return () => {
      mountedRef.current = false
      window.clearTimeout(timer)
    }
  }, [src])

  if (!blobUrl) return null

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      style={loaded ? {} : { opacity: 0 }}
      onLoad={() => setLoaded(true)}
    />
  )
}
