import {
  Cat, Dog, Bird, Rabbit, Fish, Bug, Squirrel, Turtle,
  Snail, Rat, type LucideIcon,
} from 'lucide-react'

const ANIMALS: LucideIcon[] = [
  Cat, Dog, Bird, Rabbit, Fish, Bug, Squirrel, Turtle,
  Snail, Rat,
]

const COLORS: { bg: string; fg: string }[] = [
  { bg: 'bg-rose-100', fg: 'text-rose-600' },
  { bg: 'bg-amber-100', fg: 'text-amber-600' },
  { bg: 'bg-emerald-100', fg: 'text-emerald-600' },
  { bg: 'bg-sky-100', fg: 'text-sky-600' },
  { bg: 'bg-violet-100', fg: 'text-violet-600' },
  { bg: 'bg-fuchsia-100', fg: 'text-fuchsia-600' },
  { bg: 'bg-cyan-100', fg: 'text-cyan-600' },
  { bg: 'bg-lime-100', fg: 'text-lime-600' },
  { bg: 'bg-orange-100', fg: 'text-orange-600' },
  { bg: 'bg-teal-100', fg: 'text-teal-600' },
  { bg: 'bg-indigo-100', fg: 'text-indigo-600' },
  { bg: 'bg-pink-100', fg: 'text-pink-600' },
  { bg: 'bg-green-100', fg: 'text-green-600' },
  { bg: 'bg-blue-100', fg: 'text-blue-600' },
]

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function getParticipantAvatar(id: string): { Icon: LucideIcon; bg: string; fg: string } {
  const h = hashId(id)
  const Icon = ANIMALS[h % ANIMALS.length]
  const color = COLORS[h % COLORS.length]
  return { Icon, bg: color.bg, fg: color.fg }
}

export function ParticipantAvatar({ id, size = 'md' }: { id: string; size?: 'sm' | 'md' | 'lg' }) {
  const { Icon, bg, fg } = getParticipantAvatar(id)
  const dims = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9'
  const iconSize = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-4.5 w-4.5'
  return (
    <div className={`flex ${dims} items-center justify-center rounded-full ${bg} ${fg} shrink-0`}>
      <Icon className={iconSize} strokeWidth={2} />
    </div>
  )
}
