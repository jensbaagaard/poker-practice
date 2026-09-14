import { Suspense } from 'react'
import { RangeViewer } from '@/components/RangeViewer'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RangeViewer />
    </Suspense>
  )
}
