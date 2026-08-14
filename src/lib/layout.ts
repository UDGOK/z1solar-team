/**
 * One container token used by every page, so content never shifts position
 * when navigating between them.
 *
 * The width steps up on large monitors rather than capping at a single value.
 * A fixed 1080px cap looks right on a 1440px laptop but wastes over half the
 * screen on a 2560px display — measured at 42% utilisation before this change.
 */
export const PAGE_CONTAINER =
  "w-full max-w-[1080px] xl:max-w-[1400px] 2xl:max-w-[1760px] px-5 sm:px-8 py-6";
