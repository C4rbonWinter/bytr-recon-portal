import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { logActivity } from '@/lib/activity-log'

// Allowed email domains - only these can sign in
const ALLOWED_DOMAINS = ['teethandrobots.com', 'bytr.ai']

// Admin emails for role assignment
const ADMIN_EMAILS = ['cole@bytr.ai', 'rick@bytr.ai', 'cole@teethandrobots.com', 'josh@bytr.ai', 'chris@teethandrobots.com']

// Display name mapping for activity log
const USER_NAMES: Record<string, string> = {
  'cole@bytr.ai': 'Cole Summers',
  'cole@teethandrobots.com': 'Cole Summers',
  'rick@bytr.ai': 'Rick',
  'josh@bytr.ai': 'Josh',
  'chris@teethandrobots.com': 'Chris Traina',
  'ctraina@teethandrobots.com': 'Chris Traina',
}

function getDisplayName(email: string): string {
  return USER_NAMES[email.toLowerCase()] || email.split('@')[0].replace(/^\w/, c => c.toUpperCase())
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  events: {
    async signIn({ user }) {
      // Log login activity
      const email = user.email || ''
      const role = ADMIN_EMAILS.includes(email) ? 'admin' : 'salesperson'
      
      logActivity({
        userId: user.id || email,
        userName: getDisplayName(email),
        userRole: role,
        action: 'login',
        entityType: 'session',
        details: { email },
      }).catch(err => console.error('Login activity log error:', err))
    },
  },
  callbacks: {
    async signIn({ user }) {
      // Only allow users with approved email domains
      const email = user.email || ''
      const domain = email.split('@')[1]
      
      if (ALLOWED_DOMAINS.includes(domain)) {
        return true
      }
      
      // Reject sign in
      return false
    },
    async session({ session, token }) {
      // Add user role based on email
      if (session.user?.email) {
        const email = session.user.email
        session.user.role = ADMIN_EMAILS.includes(email) ? 'admin' : 'salesperson'
        session.user.name = session.user.name || email.split('@')[0]
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})

export { handler as GET, handler as POST }
