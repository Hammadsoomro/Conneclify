import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AnimatedLogo } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
  useEffect(() => {
    document.title = "Privacy Policy - Conneclify";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" data-testid="link-home">
            <div className="flex items-center gap-3 cursor-pointer">
              <AnimatedLogo size="md" />
              <span className="font-bold text-xl">Conneclify</span>
            </div>
          </Link>
          <nav className="flex items-center gap-4">
            <div data-testid="button-theme-toggle">
              <ThemeToggle />
            </div>
            <Link href="/login">
              <Button variant="ghost" data-testid="link-login">Log In</Button>
            </Link>
            <Link href="/signup">
              <Button data-testid="link-signup">Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <Link href="/">
          <Button variant="ghost" className="mb-6 gap-2" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: February 2026</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground mb-4">
              Welcome to Conneclify ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our professional SMS messaging platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
            <h3 className="text-xl font-medium mb-3">2.1 Account Information</h3>
            <p className="text-muted-foreground mb-4">
              When you create an account, we collect your name, email address, and username. We store your password in encrypted form using industry-standard hashing algorithms.
            </p>
            
            <h3 className="text-xl font-medium mb-3">2.2 SMS Provider Credentials</h3>
            <p className="text-muted-foreground mb-4">
              To enable SMS functionality, you provide credentials for your SMS provider (Twilio, SignalWire, or Telnyx). These credentials are encrypted at rest and are never exposed in API responses.
            </p>
            
            <h3 className="text-xl font-medium mb-3">2.3 Message Data</h3>
            <p className="text-muted-foreground mb-4">
              We store message content, sender/recipient phone numbers, timestamps, and delivery status to provide our messaging service. Messages are transmitted through your chosen SMS provider.
            </p>
            
            <h3 className="text-xl font-medium mb-3">2.4 Usage Data</h3>
            <p className="text-muted-foreground mb-4">
              We collect analytics data including conversation counts, message volumes, and platform usage patterns to improve our service and provide insights features.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>To provide, maintain, and improve our SMS messaging platform</li>
              <li>To authenticate users and manage access permissions</li>
              <li>To route SMS messages through your connected provider</li>
              <li>To display messaging analytics and insights</li>
              <li>To send you important service updates and notifications</li>
              <li>To respond to your inquiries and provide customer support</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Data Security</h2>
            <p className="text-muted-foreground mb-4">
              We implement appropriate technical and organizational security measures to protect your personal information, including:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Encryption of data in transit using TLS/SSL</li>
              <li>Encryption of sensitive credentials at rest</li>
              <li>Secure session management with HTTP-only cookies</li>
              <li>Role-based access control for team members</li>
              <li>Regular security audits and updates</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Data Sharing</h2>
            <p className="text-muted-foreground mb-4">
              We do not sell your personal information. We may share your information only in the following circumstances:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>With your SMS provider to deliver messages (using your own credentials)</li>
              <li>With your team members as configured in your account settings</li>
              <li>When required by law or to protect our legal rights</li>
              <li>In connection with a merger, acquisition, or sale of assets (with prior notice)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Your Rights</h2>
            <p className="text-muted-foreground mb-4">
              You have the right to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Access and export your data</li>
              <li>Correct inaccurate information</li>
              <li>Delete your account and associated data</li>
              <li>Disconnect your SMS provider at any time</li>
              <li>Manage notification preferences</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
            <p className="text-muted-foreground mb-4">
              We retain your data for as long as your account is active. When you delete your account, we will delete your personal information within 30 days, except where retention is required by law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Cookies and Local Storage</h2>
            <p className="text-muted-foreground mb-4">
              We use essential cookies for session management and authentication. We also use local storage to save your preferences (such as theme and notification settings).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Changes to This Policy</h2>
            <p className="text-muted-foreground mb-4">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Contact Us</h2>
            <p className="text-muted-foreground mb-4">
              If you have questions about this Privacy Policy or our data practices, please contact us at privacy@conneclify.com.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Conneclify. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
