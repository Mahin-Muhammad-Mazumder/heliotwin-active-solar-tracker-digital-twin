import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HelioTwin — Active Solar Tracker Digital Twin & Telemetry',
  description: 'Interactive 3D WebGL Digital Twin and real-time efficiency telemetry dashboard for a Microcontroller-Based Active Solar Tracking System.',
  openGraph: {
    title: 'HelioTwin — Active Solar Tracker Digital Twin & Telemetry',
    description: 'Interactive 3D WebGL Digital Twin and real-time efficiency telemetry dashboard for a Microcontroller-Based Active Solar Tracking System.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HelioTwin — Active Solar Tracker Digital Twin & Telemetry',
    description: 'Interactive 3D WebGL Digital Twin and real-time efficiency telemetry dashboard for a Microcontroller-Based Active Solar Tracking System.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090D16] text-slate-100 antialiased selection:bg-[#00F0FF]/20 selection:text-[#00F0FF] overflow-hidden" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
