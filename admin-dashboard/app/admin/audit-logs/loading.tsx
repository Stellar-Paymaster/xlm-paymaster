import { AdminPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <AdminPageSkeleton
      titleWidthClass="w-60"
      rows={12}
      columns={6}
      tableLabel="Loading audit log"
      toolbars={3}
    />
  );
}
