'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'

export function Header() {
  const pathname = usePathname()
  const { user, isLoading, signOut } = useAuth()

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="text-primary">Chatty</span>
          </Link>
          <nav className="hidden md:flex gap-1">
            <Link
              href="/chat"
              className={cn(
                'px-3 py-2 text-sm font-medium rounded-md transition-colors',
                pathname === '/chat'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Chat
            </Link>
            <Link
              href="/documents"
              className={cn(
                'px-3 py-2 text-sm font-medium rounded-md transition-colors',
                pathname === '/documents'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Documents
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading &&
            (user ? (
              <>
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {user.email}
                </span>
                <Button variant="ghost" size="sm" onClick={() => signOut()}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">Sign up</Link>
                </Button>
              </>
            ))}
        </div>
      </div>
    </header>
  )
}
