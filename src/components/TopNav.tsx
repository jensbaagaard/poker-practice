import Link from 'next/link'

export type NavPage = 'viewer' | 'play'

interface Props {
  active: NavPage
  /** Carried between pages so the game uses the same charts as the viewer. */
  setupParams: URLSearchParams
}

const PAGES: { id: NavPage; label: string; href: string }[] = [
  { id: 'viewer', label: 'Ranges', href: '/' },
  { id: 'play', label: 'Play', href: '/play' },
]

export function TopNav({ active, setupParams }: Props) {
  const query = setupParams.toString()
  return (
    <nav className="topbar" aria-label="Pages">
      {PAGES.map((page) => (
        <Link
          key={page.id}
          href={query ? `${page.href}?${query}` : page.href}
          className={`topbar__link${page.id === active ? ' topbar__link--active' : ''}`}
          aria-current={page.id === active ? 'page' : undefined}
        >
          {page.label}
        </Link>
      ))}
    </nav>
  )
}
