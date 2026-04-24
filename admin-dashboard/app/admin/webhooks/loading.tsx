import { AdminPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <AdminPageSkeleton
      titleWidthClass="w-64"
      rows={6}
      columns={4}
      tableLabel="Loading webhooks"
      toolbars={1}
    />
  );
}
