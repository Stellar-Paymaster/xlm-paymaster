import { AdminPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <AdminPageSkeleton
      titleWidthClass="w-72"
      rows={8}
      columns={5}
      tableLabel="Loading cross-chain sync queue"
      toolbars={2}
    />
  );
}
