"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="btn-secondary !px-3 !py-1.5 text-xs"
    >
      Sign Out
    </button>
  );
}
