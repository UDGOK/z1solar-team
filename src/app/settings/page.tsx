import { requirePageAuth } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import Navbar from "@/components/Navbar";
import WhatsAppLinkForm from "@/components/WhatsAppLinkForm";
import MeetingLinkForm from "@/components/MeetingLinkForm";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageAuth();
  const settings = await getSettings();

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/settings" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <p className="kicker mb-1">[ Z1POWER ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Settings</h1>
        </div>

        <MeetingLinkForm initialLink={settings.meetingLink} />
        <WhatsAppLinkForm initialLink={settings.whatsappLink} />
        <ChangePasswordForm />
      </main>
    </div>
  );
}
