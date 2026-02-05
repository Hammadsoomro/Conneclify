import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AnimatedLogo } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowLeft } from "lucide-react";

export default function TermsOfServicePage() {
  useEffect(() => {
    document.title = "Terms of Service - Conneclify";
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
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: February 2026</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground mb-4">
              By accessing or using Conneclify ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground mb-4">
              Conneclify is a professional SMS messaging platform that enables users to send and receive SMS messages through third-party SMS providers (Twilio, SignalWire, or Telnyx). The Service provides a unified interface for managing conversations, team members, and phone numbers.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
            <h3 className="text-xl font-medium mb-3">3.1 Account Creation</h3>
            <p className="text-muted-foreground mb-4">
              You must create an account to use the Service. You agree to provide accurate information and keep your account credentials secure. You are responsible for all activities under your account.
            </p>
            
            <h3 className="text-xl font-medium mb-3">3.2 Account Types</h3>
            <p className="text-muted-foreground mb-4">
              Admin accounts have full access to all features including team management, settings, and provider configuration. Team member accounts have limited access as configured by their admin.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. SMS Provider Integration</h2>
            <p className="text-muted-foreground mb-4">
              The Service requires you to connect your own SMS provider account (Twilio, SignalWire, or Telnyx). You are responsible for:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Maintaining a valid account with your chosen SMS provider</li>
              <li>Paying all fees charged by your SMS provider for messages sent</li>
              <li>Complying with your SMS provider's terms of service and acceptable use policies</li>
              <li>Keeping your provider credentials secure</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Acceptable Use</h2>
            <p className="text-muted-foreground mb-4">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Send spam, unsolicited messages, or messages that violate applicable laws</li>
              <li>Harass, threaten, or harm any person</li>
              <li>Transmit malicious code or content</li>
              <li>Impersonate any person or entity</li>
              <li>Violate any applicable laws, regulations, or third-party rights</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
              <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. SMS Compliance</h2>
            <p className="text-muted-foreground mb-4">
              You are solely responsible for ensuring your SMS messaging practices comply with all applicable laws and regulations, including but not limited to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>The Telephone Consumer Protection Act (TCPA)</li>
              <li>The CAN-SPAM Act</li>
              <li>CTIA guidelines and carrier requirements</li>
              <li>State and local messaging regulations</li>
              <li>Obtaining proper consent from message recipients</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property</h2>
            <p className="text-muted-foreground mb-4">
              The Service, including its design, features, and content (excluding user content), is owned by Conneclify and protected by intellectual property laws. You retain ownership of your content but grant us a license to use it to provide the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground mb-4">
              THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE. MESSAGE DELIVERY DEPENDS ON THIRD-PARTY SMS PROVIDERS AND CARRIER NETWORKS OUTSIDE OUR CONTROL.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
            <p className="text-muted-foreground mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, CONNECLIFY SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES, ARISING FROM YOUR USE OF THE SERVICE.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Indemnification</h2>
            <p className="text-muted-foreground mb-4">
              You agree to indemnify and hold harmless Conneclify from any claims, damages, or expenses arising from your use of the Service, your violation of these Terms, or your violation of any third-party rights.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Termination</h2>
            <p className="text-muted-foreground mb-4">
              We may suspend or terminate your access to the Service at any time for violation of these Terms or for any other reason. You may terminate your account at any time by contacting us or through your account settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Changes to Terms</h2>
            <p className="text-muted-foreground mb-4">
              We may modify these Terms at any time. We will notify you of material changes by posting the updated Terms and revising the "Last updated" date. Continued use of the Service after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">13. Governing Law</h2>
            <p className="text-muted-foreground mb-4">
              These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">14. Contact</h2>
            <p className="text-muted-foreground mb-4">
              If you have questions about these Terms, please contact us at legal@conneclify.com.
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
