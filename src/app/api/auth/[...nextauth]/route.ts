import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

// Allowed email domains - only these can sign in
const ALLOWED_DOMAINS = ['teethandrobots.com', 'bytr.ai']

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
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
        // Cole and Rick are admins, everyone else is salesperson
        const adminEmails = ['cole@bytr.ai', 'rick@bytr.ai', 'cole@teethandrobots.com', 'josh@bytr.ai', 'chris@teethandrobots.com']
        session.user.role = adminEmails.includes(email) ? 'admin' : 'salesperson'
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
