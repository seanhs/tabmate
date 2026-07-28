import rbcLogo from '../assets/bank-logos/rbc.svg'
import tdLogo from '../assets/bank-logos/td.svg'
import scotiaLogo from '../assets/bank-logos/scotia.svg'
import bmoLogo from '../assets/bank-logos/bmo.svg'
import cibcLogo from '../assets/bank-logos/cibc.svg'
import tangerineLogo from '../assets/bank-logos/tangerine.svg'
import wealthsimpleLogo from '../assets/bank-logos/wealthsimple.svg'

const LOGOS: Record<string, string> = {
  RBC: rbcLogo,
  TD: tdLogo,
  Scotiabank: scotiaLogo,
  BMO: bmoLogo,
  CIBC: cibcLogo,
  Tangerine: tangerineLogo,
  Wealthsimple: wealthsimpleLogo,
}

export function BankLogo({ bank, className = '' }: { bank: string; className?: string }) {
  const src = LOGOS[bank]
  if (!src) return null
  return (
    <img
      src={src}
      alt={`${bank} logo`}
      className={className}
    />
  )
}
