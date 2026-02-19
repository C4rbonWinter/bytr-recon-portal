import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/login',
  },
})

// Protect all routes except:
// - /login (auth page)
// - /api/auth/* (NextAuth endpoints)
// - /api/cron/* (Vercel cron jobs - secured by CRON_SECRET)
// - /api/pipeline/process-sync (called by cron - secured by CRON_SECRET)
// - /api/ghl/* (OAuth flow + token status)
// - /api/oauth/* (OAuth callbacks)
// - /api/autobot/* (Autobot OAuth + webhooks)
// - /autobot (Autobot landing page)
// - Static assets
export const config = {
  matcher: [
    '/((?!login|api/auth|api/cron|api/pipeline/process-sync|api/ghl|api/oauth|api/autobot|autobot|_next/static|_next/image|favicon.ico).*)',
  ],
}
