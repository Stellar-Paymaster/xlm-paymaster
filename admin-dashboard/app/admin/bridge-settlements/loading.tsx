import { AdminPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <AdminPageSkeleton
      titleWidthClass="w-72"
      rows={8}
      columns={6}
      tableLabel="Loading bridge settlements"
      toolbars={2}
    />
  );
}
