import { AdminPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <AdminPageSkeleton
      titleWidthClass="w-72"
      rows={5}
      columns={5}
      tableLabel="Loading chain registry"
      toolbars={1}
    />
  );
}
