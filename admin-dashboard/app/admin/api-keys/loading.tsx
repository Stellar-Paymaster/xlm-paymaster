import { AdminPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <AdminPageSkeleton
      titleWidthClass="w-60"
      rows={8}
      columns={5}
      tableLabel="Loading API keys"
      toolbars={2}
    />
  );
}
