import { useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

interface PromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  label: string
  value: string
  onChange: (value: string) => void
  confirmText?: string
  cancelText?: string
  placeholder?: string
  maxLength?: number
  onConfirm: () => void
}

export default function PromptDialog({
  open,
  onOpenChange,
  title,
  label,
  value,
  onChange,
  confirmText = '确定',
  cancelText = '取消',
  placeholder = '',
  maxLength = 255,
  onConfirm,
}: PromptDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    }
  }, [open])

  const submit = () => {
    if (!value.trim()) return
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] bg-[var(--color-card)] rounded-lg shadow-xl p-6 w-[400px] max-w-[90vw]">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-medium text-[var(--color-text)]">
              {title}
            </Dialog.Title>
            <Dialog.Close className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]">
              <X size={16} />
            </Dialog.Close>
          </div>
          <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
            {label}
          </label>
          <input
            ref={inputRef}
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
              if (event.key === 'Escape') onOpenChange(false)
            }}
            className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)] mb-5"
          />
          <div className="flex justify-end gap-3">
            <Dialog.Close className="secondary-button">
              {cancelText}
            </Dialog.Close>
            <button
              onClick={submit}
              disabled={!value.trim()}
              className="px-4 py-2 text-sm rounded-md transition-colors disabled:opacity-50 bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:bg-[var(--color-accent-hover)]"
            >
              {confirmText}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
