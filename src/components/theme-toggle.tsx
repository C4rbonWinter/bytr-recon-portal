"use client"

import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button
        className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <Moon className="h-4 w-4" />
        <span className="sr-only">Toggle theme</span>
      </button>
    )
  }

  return (
    <button
      className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}
