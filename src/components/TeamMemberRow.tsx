"use client";

import { useState, useTransition } from "react";
import { updateTeamMember, deleteTeamMember } from "@/lib/actions";

type Member = { id: string; name: string; title: string | null; email: string | null; phone: string | null };

export default function TeamMemberRow({ member, zebra }: { member: Member; zebra: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name);
  const [title, setTitle] = useState(member.title || "");
  const [email, setEmail] = useState(member.email || "");
  const [phone, setPhone] = useState(member.phone || "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateTeamMember(member.id, { name, title, email, phone });
      setEditing(false);
    });
  }

  function remove() {
    if (!confirm(`Remove ${member.name} from the team directory?`)) return;
    startTransition(() => deleteTeamMember(member.id));
  }

  if (editing) {
    return (
      <tr className={zebra ? "bg-brand-greenTint" : ""}>
        <td className="px-4 py-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </td>
        <td className="px-4 py-2">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </td>
        <td className="px-4 py-2">
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        </td>
        <td className="px-4 py-2">
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
        </td>
        <td className="px-4 py-2 whitespace-nowrap">
          <button onClick={save} disabled={isPending} className="btn-primary text-xs mr-1">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="btn-secondary text-xs">
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={zebra ? "bg-brand-greenTint" : ""}>
      <td className="px-4 py-2 font-semibold">{member.name}</td>
      <td className="px-4 py-2 text-brand-greenDark">{member.title || <span className="text-brand-inkFaint italic">— add title —</span>}</td>
      <td className="px-4 py-2">{member.email || <span className="text-brand-inkFaint italic">— add email —</span>}</td>
      <td className="px-4 py-2">{member.phone || <span className="text-brand-inkFaint italic">— add phone —</span>}</td>
      <td className="px-4 py-2 whitespace-nowrap">
        <button onClick={() => setEditing(true)} className="btn-secondary text-xs mr-1">
          Edit
        </button>
        <button onClick={remove} disabled={isPending} className="btn-danger text-xs">
          Remove
        </button>
      </td>
    </tr>
  );
}
