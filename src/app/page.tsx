import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";

export default async function Home() {
  const member = await getCurrentMember();
  redirect(member ? "/dashboard" : "/login");
}
