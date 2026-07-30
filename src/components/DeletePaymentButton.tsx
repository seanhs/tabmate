import { useState } from 'react'
import { Trash2, X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

interface DeletePaymentButtonProps {
  paymentId: string
  onDelete: () => void
}

export default function DeletePaymentButton({ paymentId, onDelete }: DeletePaymentButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase.from('payments').delete().eq('id', paymentId)
    setDeleting(false)
    if (error) return
    track('payment_deleted', { payment_id: paymentId })
    onDelete()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="btn-ghost text-xs text-red-600 hover:bg-red-50"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Delete'}
        </button>
        <button onClick={() => setConfirming(false)} className="btn-ghost text-xs">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost text-neutral-400 hover:text-red-600 -mr-2"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
