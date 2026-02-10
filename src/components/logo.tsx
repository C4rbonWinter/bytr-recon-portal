"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

interface LogoProps {
  className?: string
}

export function Logo({ className = "h-7 w-auto" }: LogoProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Default to white (dark theme) during SSR to avoid flash
  const fill = !mounted ? "#fff" : resolvedTheme === "dark" ? "#fff" : "#000"

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 149.37 70.68"
      className={className}
      aria-label="Teeth+Robots logo"
      role="img"
    >
      <path
        fill={fill}
        d="M124.12,66.41v-21s20.99,0,20.99,0c2.35,0,4.26-1.91,4.26-4.26v-11.64c0-2.35-1.91-4.26-4.27-4.26h-21s0-20.99,0-20.99C124.09,1.91,122.18,0,119.83,0h-11.38c-2.35,0-4.26,1.91-4.26,4.27v21s-21.5,0-21.5,0c-2.35,0-4.26,1.91-4.26,4.26v11.64c0,2.35,1.91,4.26,4.27,4.26h21.51s0,20.99,0,20.99c0,2.35,1.91,4.26,4.26,4.26h11.38c2.35,0,4.26-1.91,4.26-4.27Z"
      />
      <path
        fill={fill}
        d="M2.53,6.95c-6.48,8.44.96,12.11,5.72,26.44-6.22,18.15-15.08,17.66,1.82,34.54,8.29,8.28,14.14-6.53,20.32-13.47,2.44-2.74,6.72-2.74,9.16,0,6.06,6.82,10.91,22.03,19.89,13.03,16.49-16.5,7.97-16.01,2-33.91,4.9-14.61,12.33-18.12,5.46-26.75-3.65-4.58-9.8-8.23-15.29-6.19-11.46,4.25-23.39,4.25-33.73.04C12.43-1.55,6.12,2.27,2.53,6.95Z"
      />
    </svg>
  )
}
