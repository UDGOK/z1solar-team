import { prisma } from "../prisma";
import type { CurrentMember } from "../auth";

/**
 * Who can do what with a show's exhibitor list.
 *
 * Note access is the UNION of two things: holding `canViewTradeShows`, or being
 * on that show's attendee list. Attendee-only would lock out anyone added to a
 * trip late — standing in front of a booth, which is the worst possible moment
 * to discover a permissions problem. Capability-only would stop a colleague who
 * is actually at the show from recording what they heard.
 *
 * Deliberately reuses the two existing trade-show capabilities rather than
 * adding new ones. A new role capability has to be threaded through the schema,
 * permissions.ts, RoleManager.tsx, the RoleInput type AND the saveRole
 * whitelist — and if the whitelist is missed it silently fails to save. Not
 * adding one avoids that class of bug entirely.
 */
export type ExhibitorAccess = {
  /** See the exhibitor list at all. */
  canView: boolean;
  /** Add notes, flag a meeting, set the owner and linked projects. */
  canAnnotate: boolean;
  /** Import lists, edit company records, delete exhibitors, manage tags. */
  canManage: boolean;
};

export const NO_ACCESS: ExhibitorAccess = {
  canView: false,
  canAnnotate: false,
  canManage: false,
};

export async function getExhibitorAccess(
  me: CurrentMember,
  tradeShowId: string
): Promise<ExhibitorAccess> {
  const isAdmin = me.role === "ADMIN";

  const [record, attendance] = await Promise.all([
    prisma.teamMember.findUnique({
      where: { id: me.id },
      select: { canViewTradeShows: true, canManageTradeShows: true },
    }),
    prisma.tradeShowAttendee.findUnique({
      where: { tradeShowId_memberId: { tradeShowId, memberId: me.id } },
      select: { status: true },
    }),
  ]);

  const canManage = isAdmin || !!record?.canManageTradeShows;
  // Anyone on the roster counts, including "Tentative" — plans firm up late and
  // a tentative attendee who turns up still needs to take notes.
  const isAttending = !!attendance && attendance.status !== "Declined";
  const canView = canManage || !!record?.canViewTradeShows || isAttending;

  return {
    canView,
    canAnnotate: canView,
    canManage,
  };
}
