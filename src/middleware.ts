// AUTH BYPASS - Remove this file or restore original when ready to deploy
// import { withAuth } from 'next-auth/middleware'

// export default withAuth({
//   pages: {
//     signIn: '/login',
//   },
// })

// Protect all routes except login and api/auth
// export const config = {
//   matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
// }

// TEMPORARY: No auth required
export const config = {
  matcher: [],
}
