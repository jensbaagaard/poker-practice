import { Suspense } from 'react'
import { PlayPage } from '@/components/PlayPage'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PlayPage />
    </Suspense>
  )
}
