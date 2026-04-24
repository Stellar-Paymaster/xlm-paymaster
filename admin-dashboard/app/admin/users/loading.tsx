import { AdminPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <AdminPageSkeleton
      titleWidthClass="w-56"
      rows={10}
      columns={5}
      tableLabel="Loading users"
      toolbars={2}
    />
  );
}
