import {
  Navbar,
  HeroSection,
  FeaturesSection,
  PlatformSection,
  CTASection,
  Footer,
} from "@/components/landing/landing-sections";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <PlatformSection />
      <CTASection />
      <Footer />
    </main>
  );
}
