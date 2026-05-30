"use client";

import { motion } from "framer-motion";
import {
  Shield,
  Search,
  Network,
  AlertTriangle,
  TrendingUp,
  Lock,
  Globe,
  Zap,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="relative">
              <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center glow-border">
                <Shield className="h-5 w-5 text-primary" />
              </div>
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">
              MK<span className="text-primary">Chain</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="#features"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Features
            </Link>
            <Link
              href="#platform"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Platform
            </Link>
            <Link
              href="#solutions"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Solutions
            </Link>
            <Link
              href="#pricing"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Pricing
            </Link>
          </div>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/auth/login"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors glow-border"
            >
              Get Started Free
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-primary"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden py-4 border-t border-border/50"
          >
            <div className="flex flex-col gap-4">
              <Link
                href="#features"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Features
              </Link>
              <Link
                href="#platform"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Platform
              </Link>
              <Link
                href="#solutions"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Solutions
              </Link>
              <Link
                href="#pricing"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="/auth/signup"
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md text-center"
              >
                Get Started Free
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </motion.nav>
  );
}

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background Effects */}
      <div className="absolute inset-0 grid-pattern opacity-50" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-sm text-primary font-medium">
              Trusted by 500+ Enterprise Security Teams
            </span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-balance"
          >
            <span className="text-foreground">Blockchain Forensics</span>
            <br />
            <span className="text-primary glow-text">Intelligence Platform</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto text-balance"
          >
            Track illicit cryptocurrency flows, cluster suspicious wallets, and
            neutralize threats before they impact your organization. Enterprise-grade
            threat intelligence for the decentralized era.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/auth/signup"
              className="w-full sm:w-auto px-8 py-4 text-base font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-all glow-border flex items-center justify-center gap-2"
            >
              Launch Platform
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href="#platform"
              className="w-full sm:w-auto px-8 py-4 text-base font-medium border border-border text-foreground rounded-md hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
            >
              Watch Demo
            </Link>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {[
              { value: "$12B+", label: "Transactions Traced" },
              { value: "2.4M", label: "Wallets Analyzed" },
              { value: "99.7%", label: "Detection Accuracy" },
              { value: "<100ms", label: "Response Time" },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-primary">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="w-6 h-10 rounded-full border-2 border-primary/30 flex items-start justify-center p-2">
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-primary"
          />
        </div>
      </motion.div>
    </section>
  );
}

export function FeaturesSection() {
  const features = [
    {
      icon: Search,
      title: "Transaction Tracing",
      description:
        "Follow the money across multiple blockchains with our advanced graph analysis engine.",
    },
    {
      icon: Network,
      title: "Wallet Clustering",
      description:
        "Identify related wallets and unmask anonymous entities using behavioral analysis.",
    },
    {
      icon: AlertTriangle,
      title: "Threat Detection",
      description:
        "Real-time alerts for sanctioned addresses, mixers, and known malicious actors.",
    },
    {
      icon: TrendingUp,
      title: "Risk Scoring",
      description:
        "Automated risk assessment with configurable thresholds and compliance reporting.",
    },
    {
      icon: Lock,
      title: "Compliance Suite",
      description:
        "Built-in support for FATF Travel Rule, AML regulations, and audit trails.",
    },
    {
      icon: Globe,
      title: "Multi-Chain Support",
      description:
        "Coverage across Bitcoin, Ethereum, and 50+ blockchain networks.",
    },
  ];

  return (
    <section id="features" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-30" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-balance">
            Intelligence <span className="text-primary">Capabilities</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Military-grade forensics tools designed for enterprise security teams
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="group relative p-6 rounded-lg border border-border bg-card/50 backdrop-blur-sm hover:border-primary/50 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PlatformSection() {
  return (
    <section id="platform" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-5xl font-bold text-balance">
              Real-Time <span className="text-primary">Threat Intelligence</span>
            </h2>
            <p className="mt-6 text-lg text-muted-foreground">
              Our platform processes millions of transactions per second, providing
              instant insights into blockchain activity across the entire crypto
              ecosystem.
            </p>

            <div className="mt-8 space-y-4">
              {[
                "Live transaction monitoring with instant alerts",
                "Advanced graph visualization for complex fund flows",
                "AI-powered entity recognition and clustering",
                "Automated compliance reporting and audit trails",
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="flex items-center gap-3"
                >
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                    <Zap className="h-3 w-3 text-primary" />
                  </div>
                  <span className="text-muted-foreground">{item}</span>
                </motion.div>
              ))}
            </div>

            <div className="mt-10">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Explore Dashboard
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>

          {/* Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="relative rounded-lg border border-border bg-card/80 backdrop-blur-sm p-4 glow-border">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-destructive" />
                <div className="w-3 h-3 rounded-full bg-chart-4" />
                <div className="w-3 h-3 rounded-full bg-accent" />
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  mkchain://threat-dashboard
                </span>
              </div>

              {/* Mini Dashboard Preview */}
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Active Threats", value: "47", status: "high" },
                    { label: "Monitored Wallets", value: "2.4K", status: "normal" },
                    { label: "Risk Score", value: "73", status: "medium" },
                  ].map((item, index) => (
                    <div
                      key={index}
                      className="p-3 rounded bg-secondary/50 border border-border/50"
                    >
                      <div className="text-xs text-muted-foreground">
                        {item.label}
                      </div>
                      <div
                        className={`text-xl font-bold mt-1 ${
                          item.status === "high"
                            ? "text-destructive"
                            : item.status === "medium"
                            ? "text-chart-4"
                            : "text-foreground"
                        }`}
                      >
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Fake Chart */}
                <div className="h-32 rounded bg-secondary/30 border border-border/50 flex items-end justify-around p-4 gap-1">
                  {[40, 65, 45, 80, 55, 70, 90, 60, 75, 50, 85, 65].map(
                    (height, index) => (
                      <motion.div
                        key={index}
                        initial={{ height: 0 }}
                        whileInView={{ height: `${height}%` }}
                        transition={{ duration: 0.5, delay: index * 0.05 }}
                        viewport={{ once: true }}
                        className="flex-1 bg-primary/60 rounded-t"
                      />
                    )
                  )}
                </div>

                {/* Activity Log */}
                <div className="space-y-2">
                  {[
                    {
                      time: "14:32:01",
                      event: "Suspicious transfer detected",
                      risk: "high",
                    },
                    {
                      time: "14:31:45",
                      event: "New wallet added to watchlist",
                      risk: "low",
                    },
                    {
                      time: "14:31:22",
                      event: "Risk score updated",
                      risk: "medium",
                    },
                  ].map((log, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-2 rounded bg-secondary/30 text-xs"
                    >
                      <span className="font-mono text-muted-foreground">
                        {log.time}
                      </span>
                      <span className="flex-1 text-muted-foreground">
                        {log.event}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          log.risk === "high"
                            ? "bg-destructive/20 text-destructive"
                            : log.risk === "medium"
                            ? "bg-chart-4/20 text-chart-4"
                            : "bg-accent/20 text-accent"
                        }`}
                      >
                        {log.risk}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function CTASection() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-t from-primary/10 via-transparent to-transparent" />

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-bold text-balance">
            Ready to Secure Your <span className="text-primary">Digital Assets</span>?
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Join 500+ enterprise security teams using MKChain to protect against
            crypto-based threats and ensure regulatory compliance.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="w-full sm:w-auto px-8 py-4 text-base font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-all glow-border flex items-center justify-center gap-2"
            >
              Start Free Trial
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href="#"
              className="w-full sm:w-auto px-8 py-4 text-base font-medium border border-border text-foreground rounded-md hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
            >
              Contact Sales
            </Link>
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            No credit card required. 14-day free trial with full platform access.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xl font-bold text-foreground">
                MK<span className="text-primary">Chain</span>
              </span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              Enterprise blockchain forensics and threat intelligence.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">
              Product
            </h4>
            <ul className="space-y-2">
              {["Features", "Pricing", "Security", "Roadmap"].map((item) => (
                <li key={item}>
                  <Link
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">
              Company
            </h4>
            <ul className="space-y-2">
              {["About", "Blog", "Careers", "Contact"].map((item) => (
                <li key={item}>
                  <Link
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">Legal</h4>
            <ul className="space-y-2">
              {["Privacy", "Terms", "Compliance", "Security"].map((item) => (
                <li key={item}>
                  <Link
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} MKChain. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">SOC 2 Type II</span>
            <span className="text-xs text-muted-foreground">ISO 27001</span>
            <span className="text-xs text-muted-foreground">GDPR</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
