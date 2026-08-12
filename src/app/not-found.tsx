import Link from "next/link";

/**
 * Also shown when someone opens a project they don't have permission to see —
 * deliberately identical to a real 404 so it doesn't reveal that the project exists.
 */
export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-greenTint px-4">
      <div className="w-full max-w-md text-center">
        <img src="/logo.png" alt="Z1Power" className="h-8 w-auto mx-auto mb-4" />
        <div className="card p-6 bg-white">
          <p className="kicker mb-2">Not found</p>
          <h1 className="font-heading text-xl font-extrabold text-brand-ink mb-2">
            This page isn&rsquo;t available
          </h1>
          <p className="text-sm text-brand-inkSoft mb-4">
            It may have been removed, or you may not have access to it.
          </p>
          <Link href="/dashboard" className="btn-primary text-sm">Back to Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
