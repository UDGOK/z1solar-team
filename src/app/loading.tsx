export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-greenTint">
      <div className="text-center">
        <img src="/logo.png" alt="Z1Power" className="h-8 w-auto mx-auto mb-3 opacity-60 animate-pulse" />
        <p className="text-xs font-mono tracking-widest text-brand-inkFaint">LOADING…</p>
      </div>
    </div>
  );
}
