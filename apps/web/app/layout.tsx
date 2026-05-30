import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geist = Geist({ subsets: ["latin"] })
const geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "MKChain | Blockchain Forensics Intelligence Platform",
  description: "Enterprise-grade blockchain forensics and threat intelligence platform.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.className} antialiased bg-background text-foreground`}>
        {children}
      </body>
    </html>
  )
}
