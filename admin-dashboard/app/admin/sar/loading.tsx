import { AdminPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <AdminPageSkeleton
      titleWidthClass="w-72"
      rows={10}
      columns={6}
      tableLabel="Loading SAR review queue"
      toolbars={3}
    />
  );
}
